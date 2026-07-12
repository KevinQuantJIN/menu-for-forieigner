import { MAX_IMAGES } from "@/lib/contract";
import { geminiStream, hasGoogleApiKey } from "@/lib/gemini";
import { mockModelStream } from "@/lib/mock";
import { modelTextToEvents } from "@/lib/pipeline";

export const runtime = "nodejs";

const badRequest = (code: string) => Response.json({ type: "error", code }, { status: 400 });

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
  // Backward-compatible single image
  if (typeof body.image === "string" && body.image.startsWith("data:image/")) {
    return [body.image];
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  let body: { images?: unknown; image?: unknown; mockRestaurant?: unknown };
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

  const useMock = process.env.MOCK_LLM === "1" || !hasGoogleApiKey();
  const abort = new AbortController();
  // Multi-page runs pages in parallel; keep headroom for slow models.
  const timeoutMs = Math.min(240_000, 90_000 + images.length * 30_000);
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const source = useMock
    ? mockModelStream(body.mockRestaurant)
    : geminiStream(images, abort.signal);

  return new Response(modelTextToEvents(source, () => clearTimeout(timer)), {
    headers: {
      "Content-Type": "text/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
