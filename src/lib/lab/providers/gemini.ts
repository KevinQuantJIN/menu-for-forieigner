import { parseSse } from "../sse";
import type { LabProviderEvent } from "../types";
import type { LabProviderAdapter } from "./index";

function apiKey(): string {
  const value = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!value) throw new Error("missing_credentials");
  return value;
}

function parseDataUrl(image: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(image);
  if (!match) throw new Error("invalid_image_data_url");
  return { mimeType: match[1], data: match[2] };
}

export const geminiAdapter: LabProviderAdapter = {
  id: "gemini",
  async *streamPage({ request, image, prompt }): AsyncIterable<LabProviderEvent> {
    const startedAt = Date.now();
    const base = (
      process.env.GOOGLE_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta"
    ).replace(/\/$/, "");
    const url = `${base}/models/${request.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey())}`;
    const inlineData = parseDataUrl(image);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          thinkingConfig: { thinkingBudget: 0 },
        },
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
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
          finishReason?: string;
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          thoughtsTokenCount?: number;
        };
      };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      const text =
        event.candidates?.[0]?.content?.parts
          ?.filter((part) => part.thought !== true)
          .map((part) => part.text ?? "")
          .join("") ?? "";
      if (text) yield { type: "text", text, ms: Date.now() - startedAt };
      const usage = event.usageMetadata;
      if (usage) {
        yield {
          type: "usage",
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          thinkingTokens: usage.thoughtsTokenCount,
        };
      }
      const reason = event.candidates?.[0]?.finishReason;
      if (reason) yield { type: "finish", reason };
    }
  },
};
