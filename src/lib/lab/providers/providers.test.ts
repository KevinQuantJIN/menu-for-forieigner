import { afterEach, describe, expect, it, vi } from "vitest";
import type { LabRequest } from "../types";
import { geminiAdapter } from "./gemini";
import { createOpenAICompatibleAdapter } from "./openai-compatible";
import { openaiAdapter } from "./openai";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

function request(provider: LabRequest["provider"], model: string): LabRequest {
  return {
    provider,
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
        request: request("gemini", "gemini-2.5-flash"),
        image: "data:image/jpeg;base64,AAAA",
        page: 1,
        prompt: "extract",
      }),
    );

    expect(events).toContainEqual(expect.objectContaining({ type: "text", text: '{"nameCn":"米饭"}\n' }));
    expect(events[0]).toEqual(expect.objectContaining({ type: "headers", requestId: "gemini-request" }));
  });

  it("disables Qwen thinking and sends an image data URL", async () => {
    process.env.DASHSCOPE_API_KEY = "qwen-test";
    process.env.DASHSCOPE_BASE_URL = "https://qwen.example/v1";
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.enable_thinking).toBe(false);
      expect(body.messages[0].content[0]).toEqual({
        type: "image_url",
        image_url: { url: "data:image/jpeg;base64,AAAA" },
      });
      return sseResponse("data: [DONE]\n\n");
    }) as typeof fetch;

    const adapter = createOpenAICompatibleAdapter("qwen");
    await collect(
      adapter.streamPage({
        request: request("qwen", "qwen3.6-flash-2026-04-16"),
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

    const adapter = createOpenAICompatibleAdapter("doubao");
    await collect(
      adapter.streamPage({
        request: request("doubao", "ep-doubao"),
        image: "data:image/jpeg;base64,AAAA",
        page: 1,
        prompt: "extract",
      }),
    );
  });

  it("sets OpenAI reasoning effort to none", async () => {
    process.env.OPENAI_API_KEY = "openai-test";
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.reasoning_effort).toBe("none");
      return sseResponse("data: [DONE]\n\n");
    }) as typeof fetch;

    await collect(
      openaiAdapter.streamPage({
        request: request("openai", "gpt-5.4-mini-2026-03-17"),
        image: "data:image/jpeg;base64,AAAA",
        page: 1,
        prompt: "extract",
      }),
    );
  });
});
