import { ProviderError } from "./google-auth";
import { ALLERGENS } from "./contract";
import { parseSse } from "./lab/sse";
import { buildOcrSystemPrompt, buildSystemPrompt } from "./prompt";
import type { OcrPage } from "./vision";

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

export interface GeminiPageResult {
  text: string;
  finishReason: string | null;
  promptTokens: number | null;
  outputTokens: number | null;
}

export const OCR_RESPONSE_SCHEMA_VERSION = "ocr-dish-envelope.v1";

const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
};

const ocrDishResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["dishes", "error"],
  properties: {
    dishes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "nameCn",
          "pinyin",
          "name",
          "description",
          "price",
          "spicy",
          "vegetarian",
          "allergens",
          "textures",
          "ingredients",
          "story",
        ],
        properties: {
          category: nullableStringSchema,
          nameCn: { type: "string" },
          pinyin: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          price: nullableStringSchema,
          spicy: { type: "integer", minimum: 0, maximum: 3 },
          vegetarian: { type: "boolean" },
          allergens: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "level"],
              properties: {
                type: { type: "string", enum: [...ALLERGENS] },
                level: { type: "string", enum: ["contains", "may_contain"] },
              },
            },
          },
          textures: { type: "array", items: { type: "string" } },
          ingredients: { type: "array", items: { type: "string" } },
          story: nullableStringSchema,
        },
      },
    },
    error: {
      anyOf: [
        { type: "string", enum: ["not_a_menu", "unreadable"] },
        { type: "null" },
      ],
    },
  },
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

/**
 * OCR-path dish lines must carry explicit safety-relevant fields.
 * Missing allergens/vegetarian must not be silently defaulted later.
 */
function invalidOcrDish(reason: string): never {
  throw new ProviderError("parse", `invalid_provider_output_${reason}`, false);
}

function assertStrictOcrDish(obj: Record<string, unknown>): void {
  const nameCn = typeof obj.nameCn === "string" ? obj.nameCn.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!nameCn || !name) {
    invalidOcrDish("identity");
  }
  if (typeof obj.pinyin !== "string") {
    invalidOcrDish("pinyin");
  }
  if (typeof obj.description !== "string") {
    invalidOcrDish("description");
  }
  if (!Number.isInteger(obj.spicy) || (obj.spicy as number) < 0 || (obj.spicy as number) > 3) {
    invalidOcrDish("spicy");
  }
  if (typeof obj.vegetarian !== "boolean") {
    invalidOcrDish("vegetarian");
  }
  if (!Array.isArray(obj.allergens)) {
    invalidOcrDish("allergens_array");
  }
  if (!Array.isArray(obj.ingredients)) {
    invalidOcrDish("ingredients_array");
  }
  if (!Array.isArray(obj.textures)) {
    invalidOcrDish("textures_array");
  }
  if (!("price" in obj)) {
    invalidOcrDish("price_missing");
  }
  if (obj.price !== null && typeof obj.price !== "string") {
    invalidOcrDish("price_type");
  }
  if (!("category" in obj)) {
    invalidOcrDish("category_missing");
  }
  if (obj.category !== null && typeof obj.category !== "string") {
    invalidOcrDish("category_type");
  }
  if (!("story" in obj)) {
    invalidOcrDish("story_missing");
  }
  if (obj.story !== null && typeof obj.story !== "string") {
    invalidOcrDish("story_type");
  }

  const hasOnlyNonEmptyStrings = (value: unknown[]): boolean =>
    value.every((item) => typeof item === "string" && item.trim().length > 0);
  if (!hasOnlyNonEmptyStrings(obj.ingredients) || !hasOnlyNonEmptyStrings(obj.textures)) {
    invalidOcrDish("string_array_item");
  }

  for (const allergen of obj.allergens) {
    if (allergen === null) invalidOcrDish("allergen_null");
    if (Array.isArray(allergen)) invalidOcrDish("allergen_nested_array");
    if (typeof allergen !== "object") invalidOcrDish(`allergen_${typeof allergen}`);
    if (Object.getPrototypeOf(allergen) !== Object.prototype) invalidOcrDish("allergen_object_shape");
    const record = allergen as Record<string, unknown>;
    if (!(ALLERGENS as readonly unknown[]).includes(record.type)) {
      invalidOcrDish("allergen_type");
    }
    if (record.level !== "contains" && record.level !== "may_contain") {
      invalidOcrDish("allergen_level");
    }
  }
}

/**
 * Stricter parser for OCR-text Gemini pages.
 * Only accepts frozen terminal errors not_a_menu / unreadable, and requires
 * at least one dish line or one recognized terminal error.
 * Rejects dish+error mixed responses and incomplete dish objects.
 */
export function parseOcrPageResult(text: string): { dishLines: string[]; error?: "not_a_menu" | "unreadable" } {
  const wholeText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const envelope = JSON.parse(wholeText) as Record<string, unknown>;
    if (
      typeof envelope === "object" &&
      envelope !== null &&
      !Array.isArray(envelope) &&
      "dishes" in envelope
    ) {
      const keys = Object.keys(envelope).sort();
      if (keys.length !== 2 || keys[0] !== "dishes" || keys[1] !== "error") {
        throw new ProviderError("parse", "invalid_provider_output_envelope", false);
      }
      if (!Array.isArray(envelope.dishes)) {
        throw new ProviderError("parse", "invalid_provider_output_envelope", false);
      }
      if (envelope.error === "not_a_menu" || envelope.error === "unreadable") {
        if (envelope.dishes.length !== 0) {
          throw new ProviderError("parse", "invalid_provider_output_envelope", false);
        }
        return { dishLines: [], error: envelope.error };
      }
      if (envelope.error !== null || envelope.dishes.length === 0) {
        throw new ProviderError("parse", "invalid_provider_output_envelope", false);
      }
      const dishLines = envelope.dishes.map((dish) => {
        if (typeof dish !== "object" || dish === null || Array.isArray(dish)) {
          throw new ProviderError("parse", "invalid_provider_output_envelope", false);
        }
        assertStrictOcrDish(dish as Record<string, unknown>);
        return JSON.stringify(dish);
      });
      return { dishLines };
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
  }

  const dishLines: string[] = [];
  let error: "not_a_menu" | "unreadable" | undefined;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^```(?:json)?$/i.test(line) || line === "```") continue;

    let cleaned = line;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?/i, "").trim();
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.replace(/```$/, "").trim();
    }
    if (!cleaned) continue;

    try {
      const obj = JSON.parse(cleaned) as Record<string, unknown>;
      if (typeof obj.error === "string" && obj.error) {
        if (obj.error === "not_a_menu" || obj.error === "unreadable") {
          error = obj.error;
        } else {
          throw new ProviderError("parse", "invalid_provider_output", false);
        }
        continue;
      }
      assertStrictOcrDish(obj);
      dishLines.push(cleaned);
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      // skip non-JSON noise
    }
  }

  if (dishLines.length > 0 && error) {
    throw new ProviderError("parse", "invalid_provider_output", false);
  }

  if (dishLines.length === 0 && !error) {
    throw new ProviderError("parse", "invalid_provider_output", false);
  }

  return { dishLines, error };
}

async function* geminiStreamOne(opts: GeminiCallOptions): AsyncGenerator<string> {
  const apiKey = resolveApiKey();
  if (!apiKey) throw new Error("missing_google_api_key");

  const model = opts.model || resolveDefaultModel();
  const base = (process.env.GOOGLE_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const url = `${base}/models/${model}:streamGenerateContent?alt=sse`;
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
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`gemini_http_${res.status}`);
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

function buildOcrUserText(page: OcrPage): string {
  const evidence = {
    page: page.page,
    fullText: page.fullText,
    blocks: page.blocks.map((b) => ({
      text: b.text,
      bbox: b.bbox,
      confidence: b.confidence,
    })),
  };
  return [
    `Extract every menu item supported by this OCR evidence for page ${page.page}.`,
    "Coordinates are normalized [left,top,right,bottom] in a 0..1000 page space.",
    "",
    JSON.stringify(evidence),
  ].join("\n");
}

function sanitizeGeminiFailure(kind: string, status?: number): never {
  throw new ProviderError("gemini", kind, false, status);
}

export async function geminiOcrPage(
  page: OcrPage,
  signal?: AbortSignal,
): Promise<GeminiPageResult> {
  if (signal?.aborted) {
    throw new ProviderError("aborted", "aborted", false);
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    sanitizeGeminiFailure("missing_api_key");
  }

  const model = resolveDefaultModel();
  const base = (process.env.GOOGLE_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const url = `${base}/models/${model}:streamGenerateContent?alt=sse`;

  const body = {
    systemInstruction: {
      parts: [{ text: buildOcrSystemPrompt() }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildOcrUserText(page) }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 32768,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseJsonSchema: ocrDishResponseSchema,
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey!,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
      throw new ProviderError("aborted", "aborted", false);
    }
    sanitizeGeminiFailure("network_error");
  }

  if (!res.ok) {
    sanitizeGeminiFailure("http_error", res.status);
  }
  if (!res.body) {
    sanitizeGeminiFailure("empty_body");
  }

  let text = "";
  let finishReason: string | null = null;
  let promptTokens: number | null = null;
  let outputTokens: number | null = null;
  let sawValidEvent = false;

  try {
    for await (const payload of parseSse(res.body)) {
      if (!payload || payload === "[DONE]") continue;
      let json: {
        candidates?: Array<{
          finishReason?: string;
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
        };
      };
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      sawValidEvent = true;

      const candidate = json.candidates?.[0];
      if (candidate?.finishReason) {
        finishReason = candidate.finishReason;
      }
      const parts = candidate?.content?.parts ?? [];
      for (const part of parts) {
        if (part.thought === true) continue;
        if (typeof part.text === "string" && part.text) {
          text += part.text;
        }
      }
      if (json.usageMetadata) {
        if (typeof json.usageMetadata.promptTokenCount === "number") {
          promptTokens = json.usageMetadata.promptTokenCount;
        }
        if (typeof json.usageMetadata.candidatesTokenCount === "number") {
          outputTokens = json.usageMetadata.candidatesTokenCount;
        }
      }
    }
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
      throw new ProviderError("aborted", "aborted", false);
    }
    sanitizeGeminiFailure("sse_error");
  }

  if (!sawValidEvent) {
    sanitizeGeminiFailure("invalid_sse");
  }
  if (!text.trim()) {
    sanitizeGeminiFailure("no_text");
  }
  if (finishReason !== "STOP") {
    sanitizeGeminiFailure("incomplete_generation");
  }

  return { text, finishReason, promptTokens, outputTokens };
}
