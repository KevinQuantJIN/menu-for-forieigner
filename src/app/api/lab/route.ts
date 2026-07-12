import { MAX_IMAGES } from "@/lib/contract";
import { getLabCatalog, getLabModel } from "@/lib/lab/catalog";
import { getLabPrompt } from "@/lib/lab/prompts";
import { streamLabRun } from "@/lib/lab/runner";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  LAB_PROVIDER_IDS,
  LAB_TRANSPORT_IDS,
  type LabMode,
  type LabProviderId,
  type LabRequest,
} from "@/lib/lab/types";

export const runtime = "nodejs";

const MODES = ["full_dish", "extract_only"] as const;

function badRequest(code: string, message?: string, status = 400): Response {
  return Response.json({ type: "error", code, message }, { status });
}

function parseImages(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IMAGES) return null;
  if (!raw.every((image) => typeof image === "string" && image.startsWith("data:image/"))) {
    return null;
  }
  return raw as string[];
}

function stringArray(raw: unknown, length: number): string[] | null {
  if (raw === undefined) {
    return Array.from({ length }, (_, index) => `page-${index + 1}.jpg`);
  }
  if (!Array.isArray(raw) || raw.length !== length) return null;
  if (!raw.every((value) => typeof value === "string" && value.trim() !== "")) return null;
  return raw.map((value) => String(value).trim());
}

function boundedNumber(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

function isCloudflareRequest(req: Request): boolean {
  return Boolean(
    req.headers.get("cf-ray") || (req as Request & { cf?: unknown }).cf,
  );
}

function getRuntimeMeta(req: Request) {
  const rayId = req.headers.get("cf-ray");
  const requestCf = (req as Request & { cf?: { colo?: string } }).cf;
  let colo = requestCf?.colo ?? null;

  if (rayId && !colo) {
    try {
      const cf = getCloudflareContext().cf as { colo?: unknown } | undefined;
      if (typeof cf?.colo === "string") colo = cf.colo;
    } catch {
      // Unit tests and `next dev` do not initialize the OpenNext request context.
    }
  }

  return {
    runtime: isCloudflareRequest(req) ? ("cloudflare" as const) : ("local" as const),
    colo,
    rayId,
    placement: req.headers.get("cf-placement"),
  };
}

export async function GET(): Promise<Response> {
  const catalog = getLabCatalog();
  const fullPrompt = getLabPrompt("full_dish");
  return Response.json({
    ...catalog,
    models: catalog.models.map((model) => model.model),
    modelCatalog: catalog.models,
    defaultProvider: "gemini",
    defaultModel: "gemini-2.5-flash",
    modes: [...MODES],
    defaultMode: "extract_only",
    systemPrompt: fullPrompt.systemPrompt,
    userPrompt: fullPrompt.userPrompt,
    prompts: {
      full_dish: fullPrompt,
      extract_only: getLabPrompt("extract_only"),
    },
    maxImages: MAX_IMAGES,
    maxPageConcurrency: 4,
    targets: {
      extract_only: { singlePageTotalP50Ms: 2500, twoPageTotalP50Ms: 3500 },
      full_dish: { singlePageTotalP50Ms: 7000, twoPageTotalP50Ms: 10000 },
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const accessToken = process.env.LAB_ACCESS_TOKEN;
  if (!accessToken && isCloudflareRequest(req)) {
    return badRequest(
      "lab_access_not_configured",
      "Cloudflare Lab access is disabled until LAB_ACCESS_TOKEN is configured",
      503,
    );
  }
  if (accessToken && req.headers.get("authorization") !== `Bearer ${accessToken}`) {
    return badRequest("unauthorized", "Lab access token is required", 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("invalid_json");
  }

  const provider = (typeof body.provider === "string" ? body.provider : "gemini") as LabProviderId;
  if (!(LAB_PROVIDER_IDS as readonly string[]).includes(provider)) {
    return badRequest("invalid_provider");
  }
  const mode = (typeof body.mode === "string" ? body.mode : "full_dish") as LabMode;
  if (!(MODES as readonly string[]).includes(mode)) return badRequest("invalid_mode");
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const requestedTransport = typeof body.transport === "string" ? body.transport : "";
  if (!(LAB_TRANSPORT_IDS as readonly string[]).includes(requestedTransport)) {
    return badRequest("invalid_transport");
  }
  const modelSpec = getLabModel(
    provider,
    model,
    requestedTransport as LabRequest["transport"],
  );
  if (!modelSpec) return badRequest("invalid_model");
  if (modelSpec.modes.length === 0) {
    return badRequest(
      "unsupported_input_capability",
      "This provider is text-only. Use the future shared OCR track instead of the image benchmark.",
    );
  }
  if (!modelSpec.modes.includes(mode)) return badRequest("invalid_model");
  if (!modelSpec.configured) return badRequest("missing_credentials", "Provider is not configured", 503);

  const images = parseImages(body.images);
  if (!images) {
    const tooMany = Array.isArray(body.images) && body.images.length > MAX_IMAGES;
    return badRequest(tooMany ? "too_many_images" : "invalid_images");
  }
  const imageNames = stringArray(body.imageNames, images.length);
  if (!imageNames) return badRequest("invalid_image_names");

  const abort = new AbortController();
  const timeoutMs = Math.min(240_000, 60_000 + images.length * 20_000);
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const abortFromRequest = () => abort.abort();
  req.signal.addEventListener("abort", abortFromRequest, { once: true });

  const request: LabRequest = {
    provider,
    transport: modelSpec.transport,
    model,
    mode,
    images,
    imageNames,
    systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
    userPrompt: typeof body.userPrompt === "string" ? body.userPrompt : undefined,
    temperature: boundedNumber(body.temperature, 0, 0, 2),
    maxOutputTokens: Math.round(boundedNumber(body.maxOutputTokens, 8192, 256, 65536)),
    signal: abort.signal,
  };
  const source = streamLabRun(request, getRuntimeMeta(req));
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of source) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } finally {
        clearTimeout(timer);
        req.signal.removeEventListener("abort", abortFromRequest);
        controller.close();
      }
    },
    cancel() {
      abort.abort();
      clearTimeout(timer);
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
