import { MAX_IMAGES } from "@/lib/contract";
import {
  DEFAULT_USER_PROMPT,
  LAB_MODELS,
  geminiLabStream,
  hasGoogleApiKey,
  resolveDefaultModel,
} from "@/lib/gemini";
import { createLineSplitter, parseModelLine } from "@/lib/ndjson";
import { normalizeDish } from "@/lib/normalize";
import { buildSystemPrompt } from "@/lib/prompt";

export const runtime = "nodejs";

const badRequest = (code: string, message?: string) =>
  Response.json({ type: "error", code, message }, { status: 400 });

function parseImages(body: { images?: unknown; image?: unknown }): string[] | null {
  if (Array.isArray(body.images)) {
    if (body.images.length === 0 || body.images.length > MAX_IMAGES) return null;
    const out: string[] = [];
    for (const img of body.images) {
      if (typeof img !== "string" || !img.startsWith("data:image/")) return null;
      out.push(img);
    }
    return out;
  }
  if (typeof body.image === "string" && body.image.startsWith("data:image/")) {
    return [body.image];
  }
  return null;
}

function sanitizeModel(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const m = raw.trim();
  if (!m || m.length > 80) return undefined;
  if (!/^[a-zA-Z0-9._-]+$/.test(m)) return undefined;
  return m;
}

export async function GET(): Promise<Response> {
  return Response.json({
    models: [...LAB_MODELS],
    defaultModel: resolveDefaultModel(),
    systemPrompt: buildSystemPrompt(),
    userPrompt: DEFAULT_USER_PROMPT,
    hasApiKey: hasGoogleApiKey(),
    maxImages: MAX_IMAGES,
  });
}

export async function POST(req: Request): Promise<Response> {
  if (!hasGoogleApiKey()) {
    return Response.json(
      { type: "error", code: "missing_api_key", message: "GOOGLE_API_KEY not configured" },
      { status: 503 },
    );
  }

  let body: {
    images?: unknown;
    image?: unknown;
    model?: unknown;
    systemPrompt?: unknown;
    userPrompt?: unknown;
    temperature?: unknown;
    maxOutputTokens?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid_json");
  }

  const images = parseImages(body);
  if (!images) {
    const tooMany = Array.isArray(body.images) && body.images.length > MAX_IMAGES;
    return badRequest(tooMany ? "too_many_images" : "invalid_images");
  }

  const model = sanitizeModel(body.model) || resolveDefaultModel();
  const systemPrompt =
    typeof body.systemPrompt === "string" && body.systemPrompt.trim()
      ? body.systemPrompt
      : buildSystemPrompt();
  const userPrompt =
    typeof body.userPrompt === "string" && body.userPrompt.trim()
      ? body.userPrompt
      : DEFAULT_USER_PROMPT;
  const temperature =
    typeof body.temperature === "number" && Number.isFinite(body.temperature)
      ? body.temperature
      : 0.2;
  const maxOutputTokens =
    typeof body.maxOutputTokens === "number" && Number.isFinite(body.maxOutputTokens)
      ? body.maxOutputTokens
      : 8192;

  const abort = new AbortController();
  const timeoutMs = Math.min(240_000, 90_000 + images.length * 30_000);
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };

      emit({
        type: "meta",
        model,
        imageCount: images.length,
        temperature,
        maxOutputTokens,
        startedAt,
      });

      const splitter = createLineSplitter();
      let count = 0;
      let firstDishMs: number | null = null;
      let rawChars = 0;
      let terminated = false;

      const handleLine = (line: string) => {
        const raw = parseModelLine(line);
        if (raw === null || typeof raw !== "object") {
          emit({ type: "raw_line", text: line });
          return;
        }
        const rec = raw as Record<string, unknown>;
        if (typeof rec.error === "string" && rec.error) {
          emit({
            type: "error",
            code: rec.error,
            message: typeof rec.message === "string" ? rec.message : undefined,
            ms: Date.now() - startedAt,
          });
          terminated = true;
          return;
        }
        const dish = normalizeDish(raw, count + 1);
        if (dish) {
          count += 1;
          const ms = Date.now() - startedAt;
          if (firstDishMs === null) firstDishMs = ms;
          emit({ type: "dish", data: dish, raw, ms });
        } else {
          emit({ type: "raw_line", text: line, parsed: raw });
        }
      };

      try {
        const source = geminiLabStream(images, {
          model,
          systemPrompt,
          userPrompt,
          temperature,
          maxOutputTokens,
          signal: abort.signal,
        });

        for await (const chunk of source) {
          rawChars += chunk.length;
          emit({ type: "chunk", text: chunk, ms: Date.now() - startedAt });
          for (const line of splitter.push(chunk)) {
            handleLine(line);
            if (terminated) break;
          }
          if (terminated) break;
        }

        if (!terminated) {
          for (const line of splitter.flush()) {
            handleLine(line);
            if (terminated) break;
          }
        }

        if (!terminated) {
          emit({
            type: "done",
            total: count,
            totalMs: Date.now() - startedAt,
            firstDishMs,
            rawChars,
            model,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "upstream_error";
        emit({
          type: "error",
          code: "upstream_error",
          message,
          ms: Date.now() - startedAt,
        });
      } finally {
        clearTimeout(timer);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
