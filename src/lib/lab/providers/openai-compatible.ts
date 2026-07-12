import { parseSse } from "../sse";
import type { LabProviderEvent, LabProviderId } from "../types";
import type { LabProviderAdapter } from "./index";

type CompatibleProvider = Extract<LabProviderId, "qwen" | "doubao">;

function config(provider: CompatibleProvider): { apiKey: string; baseUrl: string } {
  if (provider === "qwen") {
    if (!process.env.DASHSCOPE_API_KEY || !process.env.DASHSCOPE_BASE_URL) {
      throw new Error("missing_credentials");
    }
    return {
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseUrl: process.env.DASHSCOPE_BASE_URL,
    };
  }
  if (!process.env.ARK_API_KEY || !process.env.ARK_BASE_URL) {
    throw new Error("missing_credentials");
  }
  return { apiKey: process.env.ARK_API_KEY, baseUrl: process.env.ARK_BASE_URL };
}

async function* parseCompatibleResponse(
  response: Response,
  startedAt: number,
): AsyncGenerator<LabProviderEvent> {
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`provider_http_${response.status}:${message.slice(0, 160)}`);
  }
  if (!response.body) throw new Error("provider_empty_body");
  yield {
    type: "headers",
    requestId:
      response.headers.get("x-request-id") ??
      response.headers.get("x-tt-logid") ??
      undefined,
    ms: Date.now() - startedAt,
  };
  for await (const payload of parseSse(response.body)) {
    if (!payload || payload === "[DONE]") continue;
    let event: {
      choices?: Array<{
        delta?: { content?: string };
        finish_reason?: string | null;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      event = JSON.parse(payload);
    } catch {
      continue;
    }
    const text = event.choices?.[0]?.delta?.content;
    if (text) yield { type: "text", text, ms: Date.now() - startedAt };
    const reason = event.choices?.[0]?.finish_reason;
    if (reason) yield { type: "finish", reason };
    if (event.usage) {
      yield {
        type: "usage",
        inputTokens: event.usage.prompt_tokens,
        outputTokens: event.usage.completion_tokens,
      };
    }
  }
}

export function createOpenAICompatibleAdapter(
  provider: CompatibleProvider,
): LabProviderAdapter {
  return {
    id: provider,
    async *streamPage({ request, image, prompt }): AsyncIterable<LabProviderEvent> {
      const startedAt = Date.now();
      const providerConfig = config(provider);
      const body: Record<string, unknown> = {
        model: request.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: image } },
              { type: "text", text: prompt },
            ],
          },
        ],
        stream: true,
        stream_options: { include_usage: true },
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
      };
      if (provider === "qwen") body.enable_thinking = false;
      const response = await fetch(
        `${providerConfig.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${providerConfig.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: request.signal,
        },
      );
      yield* parseCompatibleResponse(response, startedAt);
    },
  };
}
