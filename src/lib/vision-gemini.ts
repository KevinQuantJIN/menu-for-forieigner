import { ProviderError } from "./google-auth";
import { geminiOcrPage, parseOcrPageResult, type GeminiPageResult } from "./gemini";
import { ocrPage, type OcrPage } from "./vision";

const PAGE_CONCURRENCY = 4;

export type PageJobResult =
  | { page: number; kind: "blank_ocr"; ocrChars: 0; blocks: 0 }
  | { page: number; kind: "dishes"; dishLines: string[] }
  | { page: number; kind: "not_a_menu" };

export type VisionGeminiDeps = {
  ocrPage: (image: string, page: number, signal?: AbortSignal) => Promise<OcrPage>;
  geminiOcrPage: (page: OcrPage, signal?: AbortSignal) => Promise<GeminiPageResult>;
  logFailure?: (page: number, error: unknown) => void;
};

const defaultDeps: VisionGeminiDeps = {
  ocrPage: (image, page, signal) => ocrPage(page, image, signal),
  geminiOcrPage,
  logFailure: (page, error) => {
    const provider = error instanceof ProviderError ? error : null;
    console.warn(JSON.stringify({
      event: "vision_gemini_page_failed",
      page,
      stage: provider?.stage ?? "unknown",
      kind: provider?.kind ?? "unknown_error",
      retryable: provider?.retryable ?? false,
      status: provider?.status ?? null,
    }));
  },
};

export async function mapConcurrentOrdered<T, R>(
  inputs: T[],
  concurrency: number,
  worker: (input: T, index: number, signal: AbortSignal) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(inputs.length);
  let nextIndex = 0;
  const limit = Math.max(1, Math.min(concurrency, inputs.length || 1));
  const local = new AbortController();
  let firstError: unknown | undefined;

  const onParentAbort = () => {
    if (!local.signal.aborted) local.abort();
  };
  if (signal?.aborted) {
    local.abort();
  } else {
    signal?.addEventListener("abort", onParentAbort, { once: true });
  }

  async function loop(): Promise<void> {
    while (true) {
      if (local.signal.aborted) {
        if (firstError !== undefined) throw firstError;
        throw new ProviderError("aborted", "aborted", false);
      }
      const index = nextIndex;
      nextIndex += 1;
      if (index >= inputs.length) return;
      try {
        results[index] = await worker(inputs[index], index, local.signal);
      } catch (e) {
        if (firstError === undefined) {
          firstError = e;
          if (!local.signal.aborted) local.abort();
        }
        throw firstError;
      }
    }
  }

  try {
    if (inputs.length === 0) return results;
    const workers = Array.from({ length: Math.min(limit, inputs.length) }, () => loop());
    await Promise.all(workers);
    return results;
  } finally {
    signal?.removeEventListener("abort", onParentAbort);
  }
}

async function runPageJob(
  image: string,
  page: number,
  signal: AbortSignal | undefined,
  deps: VisionGeminiDeps,
): Promise<PageJobResult> {
  try {
    if (signal?.aborted) {
      throw new ProviderError("aborted", "aborted", false);
    }

    const ocr = await deps.ocrPage(image, page, signal);
    const fullText = ocr.fullText.trim();
    if (!fullText) {
      return { page, kind: "blank_ocr", ocrChars: 0, blocks: 0 };
    }

    const gemini = await deps.geminiOcrPage(ocr, signal);
    const parsed = parseOcrPageResult(gemini.text);

    if (parsed.error === "unreadable") {
      throw new ProviderError("parse", "invalid_provider_output", false);
    }
    if (parsed.error === "not_a_menu") {
      return { page, kind: "not_a_menu" };
    }
    return { page, kind: "dishes", dishLines: parsed.dishLines };
  } catch (error) {
    deps.logFailure?.(page, error);
    throw error;
  }
}

function decideBatch(results: PageJobResult[]): string[] {
  const hasDishes = results.some((r) => r.kind === "dishes");
  const hasNotAMenu = results.some((r) => r.kind === "not_a_menu");
  const allBlank = results.every((r) => r.kind === "blank_ocr");

  if (allBlank) {
    return [JSON.stringify({ error: "unreadable" }) + "\n"];
  }

  if (hasDishes && hasNotAMenu) {
    throw new ProviderError("parse", "inconsistent_page_classification", false);
  }

  if (!hasDishes && hasNotAMenu) {
    return [JSON.stringify({ error: "not_a_menu" }) + "\n"];
  }

  const lines: string[] = [];
  for (const r of results) {
    if (r.kind === "dishes") {
      for (const line of r.dishLines) {
        lines.push(line.endsWith("\n") ? line : line + "\n");
      }
    }
  }
  return lines;
}

export async function* analyzeWithVisionGemini(
  images: string[],
  signal?: AbortSignal,
  deps: VisionGeminiDeps = defaultDeps,
): AsyncGenerator<string> {
  if (images.length === 0) return;

  const results = await mapConcurrentOrdered(
    images,
    PAGE_CONCURRENCY,
    (image, index, workerSignal) => runPageJob(image, index + 1, workerSignal, deps),
    signal,
  );

  for (const line of decideBatch(results)) {
    yield line;
  }
}
