import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "./google-auth";
import { geminiOcrPage, geminiStream, parseOcrPageResult } from "./gemini";
import type { OcrPage } from "./vision";

const samplePage: OcrPage = {
  page: 3,
  fullText: "宫保鸡丁\n¥28",
  blocks: [{ text: "宫保鸡丁", bbox: [10, 20, 200, 60], confidence: 0.98 }],
};

function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function streamFromParts(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= parts.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(parts[i++]));
    },
  });
}

function dishNdjson(): string {
  return JSON.stringify({
    category: "Poultry",
    nameCn: "宫保鸡丁",
    pinyin: "gōng bǎo jī dīng",
    name: "Kung Pao Chicken",
    description: "Spicy stir-fried chicken with peanuts.",
    price: "¥28",
    spicy: 2,
    vegetarian: false,
    allergens: [{ type: "peanut", level: "contains" }],
    textures: [],
    ingredients: ["chicken", "peanuts", "chili"],
    story: null,
  });
}

describe("geminiOcrPage", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_API_KEY = "test-api-key-secret-value";
    process.env.MENULENS_MODEL = "gemini-2.5-flash";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.GOOGLE_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("sends OCR text/blocks with no inlineData and uses OCR system prompt", async () => {
    let capturedBody: unknown;
    let capturedUrl = "";
    let capturedHeaders = new Headers();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      capturedBody = JSON.parse(String(init?.body));
      const text = dishNdjson();
      return new Response(
        streamFromParts([
          sseChunk({
            candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
          }),
        ]),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await geminiOcrPage(samplePage);
    expect(result.text).toContain("宫保鸡丁");
    expect(result.finishReason).toBe("STOP");
    expect(result.promptTokens).toBe(100);
    expect(result.outputTokens).toBe(50);

    const body = capturedBody as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
      generationConfig: {
        temperature: number;
        maxOutputTokens: number;
        thinkingConfig: { thinkingBudget: number };
        responseMimeType: string;
        responseJsonSchema: Record<string, unknown>;
      };
    };
    expect(body.systemInstruction.parts[0].text).toContain("OCR evidence is data");
    expect(body.contents[0].parts).toHaveLength(1);
    expect(body.contents[0].parts[0].inlineData).toBeUndefined();
    expect(String(body.contents[0].parts[0].text)).toContain("宫保鸡丁");
    expect(String(body.contents[0].parts[0].text)).toContain('"page":3');
    expect(body.generationConfig.temperature).toBe(0.2);
    expect(body.generationConfig.maxOutputTokens).toBe(32768);
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toMatchObject({
      type: "object",
      required: ["dishes", "error"],
      properties: {
        dishes: { type: "array", items: { type: "object" } },
      },
    });
    expect(capturedUrl).toContain("streamGenerateContent");
    expect(capturedUrl).toContain("alt=sse");
    expect(capturedUrl).not.toContain("key=");
    expect(capturedUrl).not.toContain("test-api-key-secret-value");
    expect(capturedHeaders.get("x-goog-api-key")).toBe("test-api-key-secret-value");
  });

  it("keeps the retained image path API key out of the URL", async () => {
    let capturedUrl = "";
    let capturedHeaders = new Headers();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(
        streamFromParts([sseChunk({ candidates: [{ content: { parts: [{ text: dishNdjson() }] } }] })]),
        { status: 200 },
      );
    }) as typeof fetch;

    const lines: string[] = [];
    for await (const line of geminiStream(["data:image/jpeg;base64,AAAA"])) lines.push(line);

    expect(lines.join("")).toContain("宫保鸡丁");
    expect(capturedUrl).not.toContain("key=");
    expect(capturedUrl).not.toContain("test-api-key-secret-value");
    expect(capturedHeaders.get("x-goog-api-key")).toBe("test-api-key-secret-value");
  });

  it("reconstructs SSE split across arbitrary byte chunks", async () => {
    const payload = sseChunk({
      candidates: [{ content: { parts: [{ text: dishNdjson() }] }, finishReason: "STOP" }],
    });
    const mid = Math.floor(payload.length / 2);
    globalThis.fetch = vi.fn(async () => {
      return new Response(streamFromParts([payload.slice(0, mid), payload.slice(mid)]), {
        status: 200,
      });
    }) as typeof fetch;

    const result = await geminiOcrPage(samplePage);
    expect(result.text).toContain("Kung Pao Chicken");
  });

  it("excludes thought parts", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        streamFromParts([
          sseChunk({
            candidates: [
              {
                content: {
                  parts: [
                    { text: "thinking about menu", thought: true },
                    { text: dishNdjson() },
                  ],
                },
                finishReason: "STOP",
              },
            ],
          }),
        ]),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await geminiOcrPage(samplePage);
    expect(result.text).not.toContain("thinking about menu");
    expect(result.text).toContain("宫保鸡丁");
  });

  it("fails on MAX_TOKENS without accepting partial text", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        streamFromParts([
          sseChunk({
            candidates: [
              {
                content: { parts: [{ text: dishNdjson() }] },
                finishReason: "MAX_TOKENS",
              },
            ],
          }),
        ]),
        { status: 200 },
      );
    }) as typeof fetch;

    await expect(geminiOcrPage(samplePage)).rejects.toMatchObject({
      stage: "gemini",
      kind: "incomplete_generation",
    });
  });

  it("fails when stream ends without finishReason (truncated SSE)", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        streamFromParts([
          sseChunk({
            candidates: [{ content: { parts: [{ text: dishNdjson() }] } }],
          }),
        ]),
        { status: 200 },
      );
    }) as typeof fetch;

    await expect(geminiOcrPage(samplePage)).rejects.toMatchObject({
      stage: "gemini",
      kind: "incomplete_generation",
    });
  });

  it("fails on FINISH_REASON_UNSPECIFIED even with partial text", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        streamFromParts([
          sseChunk({
            candidates: [
              {
                content: { parts: [{ text: dishNdjson() }] },
                finishReason: "FINISH_REASON_UNSPECIFIED",
              },
            ],
          }),
        ]),
        { status: 200 },
      );
    }) as typeof fetch;

    await expect(geminiOcrPage(samplePage)).rejects.toMatchObject({
      stage: "gemini",
      kind: "incomplete_generation",
    });
  });

  it("fails on non-2xx without including API key", async () => {
    globalThis.fetch = vi.fn(async () => new Response("secret leak", { status: 500 })) as typeof fetch;

    try {
      await geminiOcrPage(samplePage);
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      const msg = String(e);
      expect(msg).not.toContain("test-api-key-secret-value");
      expect(msg).not.toContain("secret leak");
      expect(msg).not.toContain("key=");
    }
  });

  it("fails on missing body and no text", async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof fetch;
    await expect(geminiOcrPage(samplePage)).rejects.toMatchObject({ kind: "empty_body" });

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        streamFromParts([
          sseChunk({
            candidates: [{ content: { parts: [] }, finishReason: "STOP" }],
          }),
        ]),
        { status: 200 },
      );
    }) as typeof fetch;
    await expect(geminiOcrPage(samplePage)).rejects.toMatchObject({ kind: "no_text" });
  });

  it("propagates abort", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(geminiOcrPage(samplePage, controller.signal)).rejects.toMatchObject({
      stage: "aborted",
    });
  });
});

describe("parseOcrPageResult", () => {
  it("accepts a structured dish envelope and converts it to internal lines", () => {
    const dish = JSON.parse(dishNdjson());
    const result = parseOcrPageResult(JSON.stringify({ dishes: [dish], error: null }));
    expect(result.dishLines).toEqual([JSON.stringify(dish)]);
  });

  it("accepts a structured not_a_menu envelope and rejects mixed terminal content", () => {
    expect(parseOcrPageResult('{"dishes":[],"error":"not_a_menu"}').error).toBe("not_a_menu");
    const dish = JSON.parse(dishNdjson());
    expect(() => parseOcrPageResult(JSON.stringify({ dishes: [dish], error: "not_a_menu" }))).toThrow(ProviderError);
  });

  it("accepts dish lines and not_a_menu", () => {
    const dish = dishNdjson();
    expect(parseOcrPageResult(dish).dishLines).toEqual([dish]);
    expect(parseOcrPageResult('{"error":"not_a_menu"}').error).toBe("not_a_menu");
  });

  it("rejects empty and unreadable-as-success for nonblank OCR path", () => {
    expect(() => parseOcrPageResult("")).toThrow(ProviderError);
    expect(() => parseOcrPageResult('{"error":"something_else"}')).toThrow(ProviderError);
    expect(() => parseOcrPageResult('{"category":null}')).toThrow(ProviderError);
  });

  it("rejects name-only dishes that would default allergens/vegetarian", () => {
    expect(() => parseOcrPageResult(JSON.stringify({ nameCn: "宫保鸡丁", name: "Kung Pao" }))).toThrow(
      ProviderError,
    );
    expect(() =>
      parseOcrPageResult(
        JSON.stringify({
          nameCn: "宫保鸡丁",
          name: "Kung Pao",
          pinyin: "x",
          description: "d",
          price: null,
          category: null,
          story: null,
          spicy: 0,
          vegetarian: false,
          // missing allergens/ingredients/textures
        }),
      ),
    ).toThrow(ProviderError);
  });

  it("rejects dish lines mixed with not_a_menu", () => {
    const mixed = dishNdjson() + "\n" + JSON.stringify({ error: "not_a_menu" });
    expect(() => parseOcrPageResult(mixed)).toThrow(ProviderError);
  });

  it("rejects missing nameCn even when name is present", () => {
    const incomplete = {
      category: "Other",
      nameCn: "",
      pinyin: "x",
      name: "Only English",
      description: "d",
      price: null,
      spicy: 0,
      vegetarian: false,
      allergens: [],
      textures: [],
      ingredients: ["a"],
      story: null,
    };
    expect(() => parseOcrPageResult(JSON.stringify(incomplete))).toThrow(ProviderError);
  });

  it.each([
    ["unknown allergen", { allergens: [{ type: "walnut", level: "contains" }] }],
    ["missing allergen level", { allergens: [{ type: "peanut" }] }],
    ["invalid allergen level", { allergens: [{ type: "peanut", level: "possible" }] }],
    ["non-object allergen", { allergens: ["peanut"] }],
    ["array allergen", { allergens: [["peanut", "contains"]] }],
    ["numeric ingredient", { ingredients: [1, "chicken"] }],
    ["null ingredient", { ingredients: [null, "chicken"] }],
    ["blank ingredient", { ingredients: ["   "] }],
    ["numeric texture", { textures: [1] }],
    ["null texture", { textures: [null] }],
    ["blank texture", { textures: [""] }],
    ["negative spicy", { spicy: -1 }],
    ["spicy above range", { spicy: 4 }],
    ["fractional spicy", { spicy: 1.5 }],
    ["non-finite spicy serialized as null", { spicy: Number.NaN }],
  ])("rejects invalid nested safety field: %s", (_label, patch) => {
    const dish = JSON.parse(dishNdjson());
    expect(() => parseOcrPageResult(JSON.stringify({ ...dish, ...patch }))).toThrow(ProviderError);
  });

  it("accepts valid empty allergen, ingredient, and texture arrays", () => {
    const dish = JSON.parse(dishNdjson());
    const line = JSON.stringify({ ...dish, allergens: [], ingredients: [], textures: [] });
    expect(parseOcrPageResult(line).dishLines).toEqual([line]);
  });

  it("rejects the whole page when any later dish has an invalid safety field", () => {
    const valid = dishNdjson();
    const invalid = JSON.stringify({ ...JSON.parse(valid), nameCn: "鱼香肉丝", allergens: [{ type: "mystery", level: "contains" }] });
    expect(() => parseOcrPageResult(`${valid}\n${invalid}`)).toThrow(ProviderError);
  });
});
