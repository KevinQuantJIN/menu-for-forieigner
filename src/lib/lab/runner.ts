import { createLineSplitter, parseModelLine } from "@/lib/ndjson";
import { normalizeDish } from "@/lib/normalize";
import { getLabPrompt } from "./prompts";
import type { LabProviderAdapter } from "./providers";
import { getProviderAdapter } from "./providers";
import type {
  LabRequest,
  LabStreamEvent,
  ObservedMenuItem,
} from "./types";

export interface LabRuntimeMeta {
  runtime: "local" | "cloudflare";
  colo: string | null;
  rayId: string | null;
  placement: string | null;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.values.push(value);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) return Promise.resolve({ done: false, value });
        if (this.closed) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeObserved(
  raw: Record<string, unknown>,
  page: number,
  ordinal: number,
): ObservedMenuItem | null {
  const nameCn = cleanString(raw.nameCn);
  if (!nameCn) return null;
  const confidenceValue = typeof raw.confidence === "number" ? raw.confidence : 0;
  return {
    page,
    ordinal,
    categoryCn: cleanString(raw.categoryCn) || null,
    nameCn,
    price: cleanString(raw.price) || null,
    confidence: Math.min(1, Math.max(0, confidenceValue)),
    sourceText: cleanString(raw.sourceText),
  };
}

function errorCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "aborted";
  const message = error instanceof Error ? error.message : String(error);
  if (message === "provider_timeout") return "provider_timeout";
  if (message === "missing_credentials") return "missing_credentials";
  if (message.startsWith("provider_http_429")) return "rate_limited";
  if (message.startsWith("provider_http_")) return "provider_rejected";
  return "unknown_provider_error";
}

function safeMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === "provider_rejected") return "Provider rejected the request";
  if (code === "unknown_provider_error") return "Provider request failed";
  return code;
}

export async function* streamLabRun(
  request: LabRequest,
  runtimeMeta: LabRuntimeMeta,
  adapter: LabProviderAdapter = getProviderAdapter(request.provider),
): AsyncGenerator<LabStreamEvent> {
  const startedAt = Date.now();
  yield {
    type: "meta",
    provider: request.provider,
    model: request.model,
    mode: request.mode,
    imageCount: request.images.length,
    startedAt,
    ...runtimeMeta,
  };

  const defaults = getLabPrompt(request.mode);
  const prompt = [
    request.systemPrompt?.trim() || defaults.systemPrompt,
    request.userPrompt?.trim() || defaults.userPrompt,
  ].join("\n\n");
  const queue = new AsyncEventQueue<LabStreamEvent>();
  const pageTotals: Record<number, number> = {};
  let nextPageIndex = 0;
  let total = 0;
  let firstItemMs: number | null = null;
  let partial = false;
  let globalArrivalId = 0;

  const runPage = async (index: number): Promise<void> => {
    const page = index + 1;
    const splitter = createLineSplitter();
    let ordinal = 0;
    let finishReason: string | undefined;
    pageTotals[page] = 0;
    queue.push({
      type: "page_started",
      page,
      imageName: request.imageNames[index],
      ms: Date.now() - startedAt,
    });

    const handleLine = (line: string) => {
      const parsed = parseModelLine(line);
      if (!parsed || typeof parsed !== "object") return;
      const raw = parsed as Record<string, unknown>;
      ordinal++;
      const data =
        request.mode === "extract_only"
          ? normalizeObserved(raw, page, ordinal)
          : normalizeDish(raw, ++globalArrivalId);
      if (!data) {
        ordinal--;
        return;
      }
      total++;
      pageTotals[page]++;
      const ms = Date.now() - startedAt;
      if (firstItemMs === null) firstItemMs = ms;
      queue.push({ type: "item", page, ordinal, data, raw, ms });
    };

    try {
      for await (const event of adapter.streamPage({
        request,
        image: request.images[index],
        page,
        prompt,
      })) {
        if (event.type === "headers") {
          queue.push({
            type: "provider_headers",
            page,
            ms: Date.now() - startedAt,
            requestId: event.requestId,
          });
        } else if (event.type === "text") {
          queue.push({
            type: "chunk",
            page,
            text: event.text,
            ms: Date.now() - startedAt,
          });
          for (const line of splitter.push(event.text)) handleLine(line);
        } else if (event.type === "usage") {
          queue.push({
            type: "usage",
            page,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            thinkingTokens: event.thinkingTokens,
          });
        } else if (event.type === "finish") {
          finishReason = event.reason;
        }
      }
      for (const line of splitter.flush()) handleLine(line);
      queue.push({
        type: "page_done",
        page,
        total: pageTotals[page],
        ms: Date.now() - startedAt,
        finishReason,
      });
    } catch (error) {
      partial = true;
      queue.push({
        type: "error",
        code: errorCode(error),
        page,
        message: safeMessage(error),
        ms: Date.now() - startedAt,
      });
    }
  };

  const worker = async () => {
    while (true) {
      const index = nextPageIndex++;
      if (index >= request.images.length) return;
      await runPage(index);
    }
  };

  const workers = Array.from(
    { length: Math.min(4, request.images.length) },
    () => worker(),
  );
  void Promise.all(workers).then(() => queue.close());

  for await (const event of queue) yield event;
  yield {
    type: "done",
    total,
    firstItemMs,
    totalMs: Date.now() - startedAt,
    partial,
    pageTotals,
  };
}
