import { parseSse } from "../sse";
import type { LabProviderEvent } from "../types";
import type { LabProviderAdapter } from "./index";

export const openaiAdapter: LabProviderAdapter = {
  id: "openai",
  async *streamPage({ request, image, prompt }): AsyncIterable<LabProviderEvent> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("missing_credentials");
    const startedAt = Date.now();
    const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: image, detail: "high" } },
              { type: "text", text: prompt },
            ],
          },
        ],
        stream: true,
        stream_options: { include_usage: true },
        reasoning_effort: "none",
        temperature: request.temperature,
        max_completion_tokens: request.maxOutputTokens,
      }),
      signal: request.signal,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`provider_http_${response.status}:${message.slice(0, 160)}`);
    }
    if (!response.body) throw new Error("provider_empty_body");
    yield {
      type: "headers",
      requestId: response.headers.get("x-request-id") ?? undefined,
      ms: Date.now() - startedAt,
    };
    for await (const payload of parseSse(response.body)) {
      if (!payload || payload === "[DONE]") continue;
      let event: {
        choices?: Array<{
          delta?: { content?: string };
          finish_reason?: string | null;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
        };
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
          thinkingTokens: event.usage.completion_tokens_details?.reasoning_tokens,
        };
      }
    }
  },
};
