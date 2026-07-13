import { ProviderError, getVisionAccessToken, invalidateVisionAccessToken } from "./google-auth";

const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

const RPC_DEADLINE_EXCEEDED = 4;
const RPC_RESOURCE_EXHAUSTED = 8;
const RPC_ABORTED = 10;
const RPC_INTERNAL = 13;
const RPC_UNAVAILABLE = 14;
const RPC_UNAUTHENTICATED = 16;

export interface OcrBlock {
  text: string;
  bbox: [number, number, number, number];
  confidence: number | null;
}

export interface OcrPage {
  page: number;
  fullText: string;
  blocks: OcrBlock[];
}

interface VisionVertex {
  x?: number;
  y?: number;
}

interface VisionBoundingBox {
  vertices?: VisionVertex[];
}

interface VisionBlock {
  confidence?: number;
  boundingBox?: VisionBoundingBox;
  paragraphs?: Array<{
    words?: Array<{
      symbols?: Array<{
        text?: string;
        property?: { detectedBreak?: { type?: string } };
      }>;
    }>;
  }>;
}

interface VisionTextAnnotation {
  text?: string;
  pages?: Array<{
    width?: number;
    height?: number;
    blocks?: VisionBlock[];
  }>;
}

interface VisionAnnotateError {
  code?: number;
  message?: string;
}

interface VisionAnnotateResponse {
  error?: VisionAnnotateError;
  responses?: Array<{
    error?: VisionAnnotateError;
    fullTextAnnotation?: VisionTextAnnotation;
  } | undefined>;
}

function parseDataUrl(dataUrl: string): string {
  const m = /^data:[^;]+;base64,([\s\S]+)$/.exec(dataUrl);
  if (!m || !m[1]) throw new ProviderError("vision", "invalid_data_url", false);
  return m[1];
}

function clampNorm(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

function computeBbox(
  boundingBox: VisionBoundingBox | undefined,
  pageWidth: number,
  pageHeight: number,
): [number, number, number, number] {
  const vertices = boundingBox?.vertices ?? [];
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;

  for (const v of vertices) {
    const x = typeof v.x === "number" ? v.x : 0;
    const y = typeof v.y === "number" ? v.y : 0;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }

  if (left === Infinity) return [0, 0, 0, 0];

  const w = pageWidth > 0 ? pageWidth : 1;
  const h = pageHeight > 0 ? pageHeight : 1;
  return [
    clampNorm((left / w) * 1000),
    clampNorm((top / h) * 1000),
    clampNorm((right / w) * 1000),
    clampNorm((bottom / h) * 1000),
  ];
}

function reconstructBlockText(block: VisionBlock): string {
  const parts: string[] = [];
  for (const paragraph of block.paragraphs ?? []) {
    for (const word of paragraph.words ?? []) {
      for (const symbol of word.symbols ?? []) {
        if (symbol.text) {
          parts.push(symbol.text);
        }
        const breakType = symbol.property?.detectedBreak?.type;
        if (breakType === "SPACE" || breakType === "SURE_SPACE") {
          parts.push(" ");
        } else if (breakType === "EOL_SURE_SPACE" || breakType === "LINE_BREAK") {
          parts.push("\n");
        }
      }
    }
  }
  return parts.join("").trim();
}

function extractBlocks(pageData: VisionTextAnnotation): OcrBlock[] {
  const blocks: OcrBlock[] = [];
  for (const page of pageData.pages ?? []) {
    const pageWidth = typeof page.width === "number" && page.width > 0 ? page.width : 1;
    const pageHeight = typeof page.height === "number" && page.height > 0 ? page.height : 1;
    for (const block of page.blocks ?? []) {
      const text = reconstructBlockText(block);
      if (!text) continue;
      const bbox = computeBbox(block.boundingBox, pageWidth, pageHeight);
      const confidence = typeof block.confidence === "number" && Number.isFinite(block.confidence)
        ? block.confidence
        : null;
      blocks.push({ text, bbox, confidence });
    }
  }
  return blocks;
}

function isTransientRpcCode(code: number): boolean {
  return (
    code === RPC_DEADLINE_EXCEEDED ||
    code === RPC_RESOURCE_EXHAUSTED ||
    code === RPC_ABORTED ||
    code === RPC_INTERNAL ||
    code === RPC_UNAVAILABLE
  );
}

function throwForAnnotationError(ae: VisionAnnotateError): never {
  const code = typeof ae.code === "number" ? ae.code : undefined;
  if (code === RPC_UNAUTHENTICATED) {
    throw new ProviderError("vision", "unauthorized", true, code);
  }
  if (code !== undefined && isTransientRpcCode(code)) {
    throw new ProviderError("vision", `annotation_${code}`, true, code);
  }
  throw new ProviderError("vision", "annotation_error", false, code);
}

function detectAnnotationError(body: VisionAnnotateResponse): void {
  if (body.error) throwForAnnotationError(body.error);
  const response = body.responses?.[0];
  if (response?.error) throwForAnnotationError(response.error);
}

function sanitizeVisionError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  return new ProviderError("vision", "network", true);
}

async function delayMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new ProviderError("vision", "aborted", false);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new ProviderError("vision", "aborted", false));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function callVisionApi(
  base64Payload: string,
  token: string,
  signal?: AbortSignal,
): Promise<Response> {
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? "";

  const body = {
    requests: [
      {
        image: { content: base64Payload },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["zh"] },
      },
    ],
  };

  return fetch(VISION_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": project,
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function doVisionRequest(
  base64Payload: string,
  token: string,
  signal?: AbortSignal,
): Promise<VisionAnnotateResponse> {
  const res = await callVisionApi(base64Payload, token, signal);

  if (!res.ok) {
    if (res.status === 401) {
      throw new ProviderError("vision", "unauthorized", true, 401);
    }
    if (res.status === 429 || res.status >= 500) {
      throw new ProviderError("vision", "transient", true, res.status);
    }
    throw new ProviderError("vision", "rejected", false, res.status);
  }

  const body: VisionAnnotateResponse = await res.json();
  return body;
}

export async function ocrPage(
  pageIndex: number,
  dataUrl: string,
  signal?: AbortSignal,
): Promise<OcrPage> {
  const base64Payload = parseDataUrl(dataUrl);
  let token: string | undefined;
  let authRefreshUsed = false;
  let transientRetryUsed = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new ProviderError("vision", "aborted", false);

    try {
      if (!token) {
        token = await getVisionAccessToken(signal);
      }

      const body = await doVisionRequest(base64Payload, token, signal);

      detectAnnotationError(body);

      const annotation = body.responses?.[0]?.fullTextAnnotation;
      const fullText = (annotation?.text ?? "").trim();
      const blocks = extractBlocks(annotation ?? {});

      if (!fullText && blocks.length === 0) {
        return { page: pageIndex, fullText: "", blocks: [] };
      }

      return { page: pageIndex, fullText, blocks };
    } catch (err) {
      const pe = sanitizeVisionError(err);

      if (pe.stage !== "vision") throw pe;

      if (pe.kind === "unauthorized") {
        if (!authRefreshUsed) {
          authRefreshUsed = true;
          invalidateVisionAccessToken(token!);
          token = undefined;
          continue;
        }
        throw pe;
      }

      if (pe.retryable && !transientRetryUsed) {
        transientRetryUsed = true;
        const jitterMs = 200 + Math.floor(Math.random() * 300);
        await delayMs(jitterMs, signal);
        continue;
      }

      throw pe;
    }
  }

  throw new ProviderError("vision", "retry_exhausted", false);
}
