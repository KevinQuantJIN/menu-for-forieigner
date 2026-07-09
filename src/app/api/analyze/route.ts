import { LANGS } from "@/lib/contract";
import type { Lang } from "@/lib/contract";
import { dashscopeStream } from "@/lib/dashscope";
import { mockModelStream } from "@/lib/mock";
import { modelTextToEvents } from "@/lib/pipeline";

export const runtime = "nodejs";

const badRequest = (code: string) => Response.json({ type: "error", code }, { status: 400 });

export async function POST(req: Request): Promise<Response> {
  let body: { image?: unknown; lang?: unknown; mockRestaurant?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid_json");
  }
  const { image, lang } = body;
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return badRequest("invalid_image");
  }
  if (typeof lang !== "string" || !(LANGS as readonly string[]).includes(lang)) {
    return badRequest("invalid_lang");
  }

  const useMock = process.env.MOCK_LLM === "1" || !process.env.DASHSCOPE_API_KEY;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 60_000);
  const source = useMock ? mockModelStream(body.mockRestaurant) : dashscopeStream(image, lang as Lang, abort.signal);

  return new Response(modelTextToEvents(source, () => clearTimeout(timer)), {
    headers: {
      "Content-Type": "text/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
