import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

const MODELS = {
  llava: "@cf/llava-hf/llava-1.5-7b-hf",
  moondream: "@cf/moondream/moondream3.1-9B-A2B",
} as const;

type WorkersAI = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

function error(code: string, status: number, message?: string): Response {
  return Response.json({ type: "error", code, message }, { status });
}

function imageBytes(dataUrl: string): number[] | null {
  const match = /^data:image\/[^;]+;base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  return Array.from(Buffer.from(match[1], "base64"));
}

export async function POST(req: Request): Promise<Response> {
  const accessToken = process.env.LAB_ACCESS_TOKEN;
  if (!accessToken || req.headers.get("authorization") !== `Bearer ${accessToken}`) {
    return error("unauthorized", 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return error("invalid_json", 400);
  }

  const modelKey = typeof body.model === "string" ? body.model : "";
  const model = MODELS[modelKey as keyof typeof MODELS];
  if (!model) return error("invalid_model", 400);
  if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
    return error("invalid_image", 400);
  }

  const prompt =
    typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim()
      : "Read this Chinese restaurant menu. Output every readable dish as one compact JSON object per line with keys nameCn and price. Output NDJSON only.";
  const maxTokens = Math.min(
    modelKey === "llava" ? 4096 : 8192,
    Math.max(64, Number(body.maxTokens) || 4096),
  );

  let ai: WorkersAI | undefined;
  try {
    const context = await getCloudflareContext({ async: true });
    ai = (context.env as CloudflareEnv & { AI?: WorkersAI }).AI;
  } catch {
    return error("workers_ai_unavailable", 503);
  }
  if (!ai) return error("workers_ai_binding_missing", 503);

  const startedAt = Date.now();
  try {
    let output: unknown;
    if (modelKey === "moondream") {
      output = await ai.run(model, {
        task: "query",
        image: body.image,
        question: prompt,
        reasoning: false,
        temperature: 0,
        max_tokens: maxTokens,
        stream: false,
      });
    } else {
      const image = imageBytes(body.image);
      if (!image) return error("invalid_image", 400);
      output = await ai.run(model, {
        image,
        prompt,
        temperature: 0,
        max_tokens: maxTokens,
      });
    }

    const outputRecord =
      output !== null && typeof output === "object"
        ? (output as Record<string, unknown>)
        : null;
    const result = outputRecord?.result;
    const value = (
      result !== null && typeof result === "object" ? result : outputRecord
    ) as {
      description?: string;
      answer?: string;
      metrics?: unknown;
      finish_reason?: string;
    } | null;
    return Response.json({
      model,
      text:
        (typeof result === "string" ? result : null) ??
        value?.answer ??
        value?.description ??
        "",
      metrics: value?.metrics ?? outputRecord?.usage ?? null,
      finishReason: value?.finish_reason ?? null,
      totalMs: Date.now() - startedAt,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 240) : "Workers AI failed";
    return error("workers_ai_error", 502, message);
  }
}
