import { buildSystemPrompt } from "./prompt";

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_USER_PROMPT =
  "Analyze this single menu photo page. Output every readable dish as NDJSON in English per the system rules. Do not skip dishes that are clearly printed.";

export const LAB_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
] as const;

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export type GeminiCallOptions = {
  image: string;
  systemPrompt?: string;
  userPrompt?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

function resolveApiKey(): string | undefined {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) throw new Error("invalid_data_url");
  return { mimeType: m[1], data: m[2] };
}

export function hasGoogleApiKey(): boolean {
  return Boolean(resolveApiKey());
}

export function resolveDefaultModel(): string {
  return process.env.MENULENS_MODEL ?? DEFAULT_MODEL;
}

/** Split model NDJSON into dish lines vs terminal error code. */
export function splitModelPageText(text: string): { dishLines: string[]; error?: string } {
  const dishLines: string[] = [];
  let error: string | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const cleaned = line.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (!cleaned) continue;
    try {
      const obj = JSON.parse(cleaned) as { error?: unknown; nameCn?: unknown; name?: unknown };
      if (typeof obj.error === "string" && obj.error) {
        error = obj.error;
        continue;
      }
      if (obj.nameCn || obj.name) dishLines.push(cleaned);
    } catch {
      // keep unparsed non-JSON chunks only if they look like partial dish rows — skip noise
    }
  }
  return { dishLines, error };
}

async function* geminiStreamOne(opts: GeminiCallOptions): AsyncGenerator<string> {
  const apiKey = resolveApiKey();
  if (!apiKey) throw new Error("missing_google_api_key");

  const model = opts.model || resolveDefaultModel();
  const base = (process.env.GOOGLE_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const url = `${base}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const { mimeType, data } = parseDataUrl(opts.image);
  const temperature =
    typeof opts.temperature === "number" && Number.isFinite(opts.temperature)
      ? Math.min(2, Math.max(0, opts.temperature))
      : 0.2;
  const maxOutputTokens =
    typeof opts.maxOutputTokens === "number" && Number.isFinite(opts.maxOutputTokens)
      ? Math.min(65536, Math.max(256, Math.round(opts.maxOutputTokens)))
      : 8192;

  const body = {
    systemInstruction: {
      parts: [{ text: opts.systemPrompt ?? buildSystemPrompt() }],
    },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data } },
          {
            text: opts.userPrompt?.trim() || DEFAULT_USER_PROMPT,
          },
        ],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`gemini_http_${res.status}:${errText.slice(0, 200)}`);
  }
  if (!res.body) throw new Error("gemini_empty_body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, sep).trimEnd();
      buf = buf.slice(sep + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let json: {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (text) yield text;
    }
  }
}

async function collectPageText(opts: GeminiCallOptions): Promise<string> {
  let out = "";
  for await (const chunk of geminiStreamOne(opts)) out += chunk;
  return out;
}

/**
 * Multi-page menus: analyze each photo as its own page in parallel, then emit
 * dish lines in page order. One bundled multi-image call loses too many dishes.
 */
export async function* geminiStream(images: string[], signal?: AbortSignal): AsyncGenerator<string> {
  if (images.length === 0) return;

  if (images.length === 1) {
    yield* geminiStreamOne({ image: images[0], signal });
    return;
  }

  const pages = await Promise.all(images.map((img) => collectPageText({ image: img, signal })));
  let emitted = 0;
  let lastError: string | undefined;

  for (const text of pages) {
    const { dishLines, error } = splitModelPageText(text);
    if (error) lastError = error;
    for (const line of dishLines) {
      emitted += 1;
      yield line + "\n";
    }
  }

  if (emitted === 0 && lastError) {
    yield JSON.stringify({ error: lastError }) + "\n";
  }
}

/** Lab: parameterized multi-page stream with the same page-parallel strategy as production. */
export async function* geminiLabStream(
  images: string[],
  opts: Omit<GeminiCallOptions, "image" | "signal"> & { signal?: AbortSignal },
): AsyncGenerator<string> {
  if (images.length === 0) return;

  if (images.length === 1) {
    yield* geminiStreamOne({ ...opts, image: images[0] });
    return;
  }

  const pages = await Promise.all(
    images.map((img) => collectPageText({ ...opts, image: img })),
  );
  let emitted = 0;
  let lastError: string | undefined;

  for (const text of pages) {
    const { dishLines, error } = splitModelPageText(text);
    if (error) lastError = error;
    for (const line of dishLines) {
      emitted += 1;
      yield line + "\n";
    }
  }

  if (emitted === 0 && lastError) {
    yield JSON.stringify({ error: lastError }) + "\n";
  }
}
