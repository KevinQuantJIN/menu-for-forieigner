import { parseSse } from "../sse";
import type {
  LabProviderEvent,
  LabProviderId,
  LabTransportId,
} from "../types";
import type { LabProviderAdapter } from "./index";

type CompatibleProvider = Extract<
  LabProviderId,
  "openai" | "qwen" | "doubao" | "minimax" | "stepfun" | "glm"
>;

type CompatibleConfig = {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  maxTokenField: "max_tokens" | "max_completion_tokens";
  extraBody?: Record<string, unknown>;
  requestIdHeaders: string[];
  textFirst?: boolean;
};

function config(
  provider: CompatibleProvider,
  transport: LabTransportId,
): CompatibleConfig {
  if (transport === "openrouter") {
    return {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: "https://openrouter.ai/api/v1",
      maxTokenField: "max_tokens",
      requestIdHeaders: ["x-request-id"],
      textFirst: true,
    };
  }
  if (transport === "dashscope-beijing") {
    return {
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      maxTokenField: "max_tokens",
      extraBody: { enable_thinking: false },
      requestIdHeaders: ["x-request-id"],
    };
  }
  if (transport === "dashscope-singapore") {
    return {
      apiKey: process.env.DASHSCOPE_INTL_API_KEY,
      baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      maxTokenField: "max_tokens",
      extraBody: { enable_thinking: false },
      requestIdHeaders: ["x-request-id"],
    };
  }
  if (transport === "dashscope-virginia") {
    return {
      apiKey: process.env.DASHSCOPE_US_API_KEY,
      baseUrl: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
      maxTokenField: "max_tokens",
      extraBody: { enable_thinking: false },
      requestIdHeaders: ["x-request-id"],
    };
  }
  if (transport === "ark") {
    return {
      apiKey: process.env.ARK_API_KEY,
      baseUrl: process.env.ARK_BASE_URL,
      maxTokenField: "max_tokens",
      requestIdHeaders: ["x-request-id", "x-tt-logid"],
    };
  }
  if (transport === "minimax") {
    return {
      apiKey: process.env.MINIMAX_API_KEY,
      baseUrl: process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1",
      maxTokenField: "max_completion_tokens",
      extraBody: { thinking: { type: "disabled" } },
      requestIdHeaders: ["x-request-id"],
    };
  }
  if (transport === "stepfun") {
    return {
      apiKey: process.env.STEPFUN_API_KEY,
      baseUrl: process.env.STEPFUN_BASE_URL || "https://api.stepfun.com/v1",
      maxTokenField: "max_tokens",
      requestIdHeaders: ["x-request-id"],
    };
  }
  throw new Error(`invalid_transport:${provider}:${transport}`);
}

async function* parseCompatibleResponse(
  response: Response,
  startedAt: number,
  requestIdHeaders: string[],
): AsyncGenerator<LabProviderEvent> {
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`provider_http_${response.status}:${message.slice(0, 160)}`);
  }
  if (!response.body) throw new Error("provider_empty_body");
  yield {
    type: "headers",
    requestId:
      requestIdHeaders
        .map((header) => response.headers.get(header))
        .find((value): value is string => Boolean(value)) ?? undefined,
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
}

export function createOpenAICompatibleAdapter(
  provider: CompatibleProvider,
  transport: LabTransportId,
): LabProviderAdapter {
  return {
    id: provider,
    async *streamPage({ request, image, prompt }): AsyncIterable<LabProviderEvent> {
      const startedAt = Date.now();
      const providerConfig = config(provider, transport);
      if (!providerConfig.apiKey || !providerConfig.baseUrl) {
        throw new Error("missing_credentials");
      }
      const body: Record<string, unknown> = {
        model: request.model,
        messages: [
          {
            role: "user",
            content: providerConfig.textFirst
              ? [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: image } },
                ]
              : [
                  { type: "image_url", image_url: { url: image } },
                  { type: "text", text: prompt },
                ],
          },
        ],
        stream: true,
        stream_options: { include_usage: true },
        temperature: request.temperature,
        [providerConfig.maxTokenField]: request.maxOutputTokens,
        ...providerConfig.extraBody,
      };
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
      yield* parseCompatibleResponse(
        response,
        startedAt,
        providerConfig.requestIdHeaders,
      );
    },
  };
}
