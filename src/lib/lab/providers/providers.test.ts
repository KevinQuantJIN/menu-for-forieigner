import { afterEach, describe, expect, it, vi } from "vitest";
import type { LabRequest, LabTransportId } from "../types";
import { geminiAdapter } from "./gemini";
import { getProviderAdapter } from "./index";
import { createOpenAICompatibleAdapter } from "./openai-compatible";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

function request(
  provider: LabRequest["provider"],
  model: string,
  transport: LabTransportId,
): LabRequest {
  return {
    provider,
    transport,
    model,
    mode: "extract_only",
    images: ["data:image/jpeg;base64,AAAA"],
    imageNames: ["M001_P01.jpg"],
    temperature: 0,
    maxOutputTokens: 1024,
    signal: new AbortController().signal,
  };
}

function sseResponse(body: string, headers?: Record<string, string>): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { status: 200, headers },
  );
}

async function collect(source: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const item of source) out.push(item);
  return out;
}

describe("Lab providers", () => {
  it("disables Gemini thinking and streams candidate text", async () => {
    process.env.GOOGLE_API_KEY = "google-test";
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
      return sseResponse(
        'data: {"candidates":[{"content":{"parts":[{"text":"{\\"nameCn\\":\\"米饭\\"}\\n"}]}}]}\n\n',
        { "x-request-id": "gemini-request" },
      );
    }) as typeof fetch;

    const events = await collect(
      geminiAdapter.streamPage({
        request: request("gemini", "gemini-2.5-flash", "gemini"),
        image: "data:image/jpeg;base64,AAAA",
        page: 1,
        prompt: "extract",
      }),
    );

    expect(events).toContainEqual(expect.objectContaining({ type: "text", text: '{"nameCn":"米饭"}\n' }));
    expect(events[0]).toEqual(expect.objectContaining({ type: "headers", requestId: "gemini-request" }));
  });

  it.each([
    ["openai" as const, "openai/gpt-5.4-mini"],
    ["qwen" as const, "qwen/qwen3.6-flash"],
    ["glm" as const, "z-ai/glm-5v-turbo"],
  ])("routes %s vision requests through OpenRouter", async (provider, model) => {
    process.env.OPENROUTER_API_KEY = "openrouter-test";
    global.fetch = vi.fn(async (input, init) => {
      expect(String(input)).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer openrouter-test",
      );
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ model, max_tokens: 1024, stream: true });
      expect(body).not.toHaveProperty("enable_thinking");
      expect(body.messages[0].content).toEqual([
        { type: "text", text: "extract" },
        {
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64,AAAA" },
        },
      ]);
      return sseResponse("data: [DONE]\n\n", {
        "x-request-id": "openrouter-request",
      });
    }) as typeof fetch;

    await collect(
      getProviderAdapter({ provider, transport: "openrouter" }).streamPage({
        request: request(provider, model, "openrouter"),
        image: "data:image/jpeg;base64,AAAA",
        page: 1,
        prompt: "extract",
      }),
    );
  });

  it.each([
    [
      "dashscope-beijing" as const,
      "DASHSCOPE_API_KEY",
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    ],
    [
      "dashscope-singapore" as const,
      "DASHSCOPE_INTL_API_KEY",
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    ],
    [
      "dashscope-virginia" as const,
      "DASHSCOPE_US_API_KEY",
      "https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions",
    ],
  ])("routes Qwen through %s", async (transport, key, url) => {
    process.env[key] = "dashscope-test";
    global.fetch = vi.fn(async (input) => {
      expect(String(input)).toBe(url);
      return sseResponse("data: [DONE]\n\n");
    }) as typeof fetch;
    const labRequest = request("qwen", "qwen3.6-flash", transport);

    await collect(
      getProviderAdapter(labRequest).streamPage({
        request: labRequest,
        image: "data:image/jpeg;base64,AAAA",
        page: 1,
        prompt: "extract",
      }),
    );
  });

  it("does not send Qwen-only parameters to Doubao", async () => {
    process.env.ARK_API_KEY = "ark-test";
    process.env.ARK_BASE_URL = "https://ark.example/v3";
    process.env.DOUBAO_MODEL = "ep-doubao";
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).not.toHaveProperty("enable_thinking");
      return sseResponse("data: [DONE]\n\n");
    }) as typeof fetch;

    const adapter = createOpenAICompatibleAdapter("doubao", "ark");
    await collect(
      adapter.streamPage({
        request: request("doubao", "ep-doubao", "ark"),
        image: "data:image/jpeg;base64,AAAA",
        page: 1,
        prompt: "extract",
      }),
    );
  });

  it.each([
    {
      provider: "minimax" as const,
      key: "MINIMAX_API_KEY",
      model: "MiniMax-M3",
      url: "https://api.minimaxi.com/v1/chat/completions",
      body: {
        max_completion_tokens: 1024,
        thinking: { type: "disabled" },
      },
      absent: "max_tokens",
    },
    {
      provider: "stepfun" as const,
      key: "STEPFUN_API_KEY",
      model: "step-1o-turbo-vision",
      url: "https://api.stepfun.com/v1/chat/completions",
      body: {
        max_tokens: 1024,
      },
      absent: "max_completion_tokens",
    },
  ])(
    "sends the official $provider vision request shape",
    async ({ provider, key, model, url, body: expectedBody, absent }) => {
      process.env[key] = `${provider}-test`;
      global.fetch = vi.fn(async (input, init) => {
        expect(String(input)).toBe(url);
        const body = JSON.parse(String(init?.body));
        expect(body.messages[0].content).toEqual([
          {
            type: "image_url",
            image_url: { url: "data:image/jpeg;base64,AAAA" },
          },
          { type: "text", text: "extract" },
        ]);
        expect(body).toMatchObject(expectedBody);
        expect(body).not.toHaveProperty(absent);
        if (provider === "stepfun") {
          expect(body).not.toHaveProperty("reasoning_effort");
        }
        return sseResponse("data: [DONE]\n\n");
      }) as typeof fetch;

      const transport = provider === "minimax" ? "minimax" : "stepfun";
      const adapter = createOpenAICompatibleAdapter(provider, transport);
      await collect(
        adapter.streamPage({
          request: request(provider, model, transport),
          image: "data:image/jpeg;base64,AAAA",
          page: 1,
          prompt: "extract",
        }),
      );
    },
  );

});
