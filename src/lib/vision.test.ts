import { describe, expect, it, beforeEach, vi } from "vitest";
import { ocrPage } from "./vision";
import { ProviderError } from "./google-auth";
import * as auth from "./google-auth";

beforeEach(() => {
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  vi.restoreAllMocks();
  vi.spyOn(auth, "getVisionAccessToken").mockResolvedValue("tok-test");
  vi.spyOn(auth, "invalidateVisionAccessToken").mockImplementation(() => {});
});

const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRg";

function mockVisionResponse(response: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(response), { status })),
  );
}

function makeAnnotationResponse(
  text: string,
  blocks: Array<{ text: string; confidence?: number; bbox?: [number, number, number, number] }> = [],
  pageSize: { width: number; height: number } = { width: 1920, height: 1080 },
) {
  const visionBlocks = blocks.map((b) => ({
    confidence: b.confidence,
    boundingBox: {
      vertices: [
        { x: b.bbox?.[0] ?? 0, y: b.bbox?.[1] ?? 0 },
        { x: b.bbox?.[2] ?? 0, y: b.bbox?.[1] ?? 0 },
        { x: b.bbox?.[2] ?? 0, y: b.bbox?.[3] ?? 0 },
        { x: b.bbox?.[0] ?? 0, y: b.bbox?.[3] ?? 0 },
      ],
    },
    paragraphs: [
      {
        words: [
          {
            symbols: b.text.split("").map((ch) => ({
              text: ch,
              property: ch === " " ? { detectedBreak: { type: "SPACE" as const } } : undefined,
            })),
          },
        ],
      },
    ],
  }));

  return {
    responses: [
      {
        fullTextAnnotation: {
          text,
          pages: [{ width: pageSize.width, height: pageSize.height, blocks: visionBlocks }],
        },
      },
    ],
  };
}

describe("ocrPage", () => {
  it("1. builds exact DOCUMENT_TEXT_DETECTION payload with zh hint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(makeAnnotationResponse("test")), { status: 200 }),
    );

    await ocrPage(1, IMG);

    const call = fetchSpy.mock.calls[0];
    const reqBody = JSON.parse(call[1]!.body as string);
    expect(reqBody.requests[0].features).toEqual([{ type: "DOCUMENT_TEXT_DETECTION" }]);
    expect(reqBody.requests[0].imageContext.languageHints).toEqual(["zh"]);
  });

  it("2. sends base64 payload only, not the data URL prefix", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(makeAnnotationResponse("test")), { status: 200 }),
    );

    await ocrPage(1, IMG);

    const call = fetchSpy.mock.calls[0];
    const reqBody = JSON.parse(call[1]!.body as string);
    expect(reqBody.requests[0].image.content).toBe("/9j/4AAQSkZJRg");
    expect(reqBody.requests[0].image.content).not.toContain("data:image");
  });

  it("3. adds Bearer and x-goog-user-project headers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(makeAnnotationResponse("test")), { status: 200 }),
    );

    await ocrPage(1, IMG);

    const call = fetchSpy.mock.calls[0];
    const headers = call[1]!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok-test");
    expect(headers["x-goog-user-project"]).toBe("test-project");
  });

  it("4. converts full text, block text, confidence, and normalized bbox correctly", async () => {
    mockVisionResponse({
      responses: [
        {
          fullTextAnnotation: {
            text: "宫保鸡丁\n¥38\n",
            pages: [
              {
                width: 1000,
                height: 1000,
                blocks: [
                  {
                    confidence: 0.95,
                    boundingBox: {
                      vertices: [
                        { x: 100, y: 50 },
                        { x: 500, y: 50 },
                        { x: 500, y: 100 },
                        { x: 100, y: 100 },
                      ],
                    },
                    paragraphs: [
                      {
                        words: [
                          {
                            symbols: [
                              { text: "宫" },
                              { text: "保" },
                              { text: "鸡" },
                              { text: "丁" },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    const result = await ocrPage(1, IMG);
    expect(result.page).toBe(1);
    expect(result.fullText).toBe("宫保鸡丁\n¥38");
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].text).toBe("宫保鸡丁");
    expect(result.blocks[0].confidence).toBe(0.95);
    expect(result.blocks[0].bbox).toEqual([100, 50, 500, 100]);
  });

  it("4b. normalizes pixel bbox using page width/height into 0..1000", async () => {
    mockVisionResponse({
      responses: [
        {
          fullTextAnnotation: {
            text: "下半页菜\n¥18\n",
            pages: [
              {
                width: 800,
                height: 1600,
                blocks: [
                  {
                    confidence: 0.9,
                    boundingBox: {
                      vertices: [
                        { x: 80, y: 1200 },
                        { x: 400, y: 1200 },
                        { x: 400, y: 1320 },
                        { x: 80, y: 1320 },
                      ],
                    },
                    paragraphs: [
                      {
                        words: [
                          {
                            symbols: [
                              { text: "下" },
                              { text: "半" },
                              { text: "页" },
                              { text: "菜" },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    const result = await ocrPage(1, IMG);
    // x: 80/800*1000=100, 400/800*1000=500
    // y: 1200/1600*1000=750, 1320/1600*1000=825
    expect(result.blocks[0].bbox).toEqual([100, 750, 500, 825]);
  });

  it("5. handles omitted vertex coordinates", async () => {
    mockVisionResponse({
      responses: [
        {
          fullTextAnnotation: {
            text: "test",
            pages: [
              {
                width: 1000,
                height: 1000,
                blocks: [
                  {
                    boundingBox: { vertices: [] },
                    paragraphs: [
                      {
                        words: [
                          { symbols: [{ text: "t" }, { text: "e" }, { text: "s" }, { text: "t" }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    const result = await ocrPage(1, IMG);
    expect(result.blocks[0].bbox).toEqual([0, 0, 0, 0]);
  });

  it("6. drops empty blocks but not low-confidence blocks", async () => {
    mockVisionResponse({
      responses: [
        {
          fullTextAnnotation: {
            text: "菜品\n",
            pages: [
              {
                width: 1000,
                height: 1000,
                blocks: [
                  {
                    confidence: 0.05,
                    boundingBox: { vertices: [{ x: 0, y: 0 }] },
                    paragraphs: [{ words: [{ symbols: [{ text: "菜" }, { text: "品" }] }] }],
                  },
                  {
                    confidence: 0.9,
                    boundingBox: { vertices: [] },
                    paragraphs: [],
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    const result = await ocrPage(1, IMG);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].confidence).toBe(0.05);
  });

  it("7. returns a valid blank OcrPage for no annotation text", async () => {
    mockVisionResponse({
      responses: [
        {
          fullTextAnnotation: { pages: [] },
        },
      ],
    });

    const result = await ocrPage(1, IMG);
    expect(result.page).toBe(1);
    expect(result.fullText).toBe("");
    expect(result.blocks).toHaveLength(0);
  });

  it("8. detects top-level and per-image Vision errors even on HTTP 200", async () => {
    mockVisionResponse({
      responses: [{ error: { code: 3, message: "INVALID_ARGUMENT" } }],
    });

    await expect(ocrPage(1, IMG)).rejects.toMatchObject({
      stage: "vision",
      kind: "annotation_error",
      retryable: false,
      status: 3,
    });
  });

  it("8b. google.rpc RESOURCE_EXHAUSTED annotation error retries once", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ responses: [{ error: { code: 8, message: "RESOURCE_EXHAUSTED" } }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeAnnotationResponse("ok-rpc8")), { status: 200 }),
      );

    const result = await ocrPage(1, IMG);
    expect(result.fullText).toBe("ok-rpc8");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("8c. google.rpc UNAVAILABLE annotation error is retryable then fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ responses: [{ error: { code: 14, message: "UNAVAILABLE" } }] }), {
          status: 200,
        }),
      ),
    );

    await expect(ocrPage(1, IMG)).rejects.toMatchObject({
      stage: "vision",
      kind: "annotation_14",
      retryable: true,
      status: 14,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("9. 401 invalidates exact token and retries once", async () => {
    const invalidateSpy = vi.spyOn(auth, "invalidateVisionAccessToken");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeAnnotationResponse("ok")), { status: 200 }),
      );

    const result = await ocrPage(1, IMG);
    expect(result.fullText).toBe("ok");
    expect(invalidateSpy).toHaveBeenCalledWith("tok-test");
  });

  it("10. repeated 401 stops after one refresh", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    await expect(ocrPage(1, IMG)).rejects.toMatchObject({ kind: "unauthorized" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(auth.getVisionAccessToken).toHaveBeenCalledTimes(2);
  });

  it("10b. repeated RPC unauthenticated stops after one refresh", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ responses: [{ error: { code: 16, message: "UNAUTHENTICATED" } }] }), {
        status: 200,
      }),
    ));

    await expect(ocrPage(1, IMG)).rejects.toMatchObject({ kind: "unauthorized", status: 16 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(auth.getVisionAccessToken).toHaveBeenCalledTimes(2);
  });

  it("10c. auth refresh and transient retry use independent finite budgets", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeAnnotationResponse("ok-after-both")), { status: 200 }));

    await expect(ocrPage(1, IMG)).resolves.toMatchObject({ fullText: "ok-after-both" });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("11. 429 and each supported 5xx retry once", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeAnnotationResponse("ok-429")), { status: 200 }),
      );

    const result = await ocrPage(1, IMG);
    expect(result.fullText).toBe("ok-429");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("12. nonretryable 4xx does not retry", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Bad Request", { status: 400 }));

    await expect(ocrPage(1, IMG)).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("13. network failure retries once", async () => {
    let calls = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error("ECONNREFUSED"));
      return Promise.resolve(new Response(JSON.stringify(makeAnnotationResponse("ok-net")), { status: 200 }));
    });

    const result = await ocrPage(1, IMG);
    expect(result.fullText).toBe("ok-net");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("13b. abort signal prevents any fetch calls", async () => {
    vi.restoreAllMocks();
    vi.spyOn(auth, "getVisionAccessToken").mockResolvedValue("tok-test");
    vi.spyOn(auth, "invalidateVisionAccessToken").mockImplementation(() => {});

    const ac = new AbortController();
    ac.abort();

    const abortFetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response("{}", { status: 200 })),
    );

    try {
      await ocrPage(1, IMG, ac.signal);
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ProviderError);
      expect(e.kind).toBe("aborted");
    }
    expect(abortFetchSpy).not.toHaveBeenCalled();
  });

  it("14. error strings/log metadata contain no base64 or token", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Server Error", { status: 500 }));

    try {
      await ocrPage(1, IMG);
    } catch (e: any) {
      expect(e.message).not.toContain("/9j/");
      expect(e.message).not.toContain("tok-test");
      expect(e.message).not.toContain("data:image");
    }
  });
});
