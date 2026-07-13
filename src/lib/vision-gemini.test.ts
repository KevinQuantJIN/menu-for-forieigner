import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "./google-auth";
import {
  analyzeWithVisionGemini,
  mapConcurrentOrdered,
  type VisionGeminiDeps,
} from "./vision-gemini";
import type { OcrPage } from "./vision";
import type { GeminiPageResult } from "./gemini";

function dishLine(nameCn: string): string {
  return JSON.stringify({
    category: "Other",
    nameCn,
    pinyin: "x",
    name: nameCn,
    description: "d",
    price: "¥1",
    spicy: 0,
    vegetarian: false,
    allergens: [],
    textures: [],
    ingredients: ["a", "b", "c"],
    story: null,
  });
}

function ocr(page: number, text: string): OcrPage {
  return {
    page,
    fullText: text,
    blocks: text ? [{ text, bbox: [0, 0, 10, 10], confidence: 1 }] : [],
  };
}

function geminiOk(text: string): GeminiPageResult {
  return { text, finishReason: "STOP", promptTokens: 1, outputTokens: 1 };
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const line of gen) out.push(line);
  return out;
}

describe("mapConcurrentOrdered", () => {
  it("preserves order with concurrency and never exceeds limit", async () => {
    let active = 0;
    let maxActive = 0;
    const delays = [30, 5, 20, 10, 15, 8, 12, 6, 25];
    const results = await mapConcurrentOrdered(
      delays,
      4,
      async (ms, index, _signal) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, ms));
        active -= 1;
        return index + 1;
      },
    );
    expect(results).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it("stops claiming pages when aborted", async () => {
    const controller = new AbortController();
    let claimed = 0;
    const promise = mapConcurrentOrdered(
      [1, 2, 3, 4, 5],
      2,
      async (_input, _index, signal) => {
        claimed += 1;
        if (claimed === 1) controller.abort();
        await new Promise((r) => setTimeout(r, 20));
        if (signal.aborted) throw new ProviderError("aborted", "aborted", false);
        return claimed;
      },
      controller.signal,
    );
    await expect(promise).rejects.toMatchObject({ stage: "aborted" });
    expect(claimed).toBeLessThan(5);
  });
});

describe("analyzeWithVisionGemini", () => {
  it("one page success yields its lines", async () => {
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => ocr(page, "宫保鸡丁"),
      geminiOcrPage: async () => geminiOk(dishLine("宫保鸡丁")),
    };
    const lines = await collect(analyzeWithVisionGemini(["data:image/jpeg;base64,AA"], undefined, deps));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("宫保鸡丁");
  });

  it("multiple pages complete out of order but yield in input order", async () => {
    const order: number[] = [];
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => {
        await new Promise((r) => setTimeout(r, page === 1 ? 40 : 5));
        order.push(page);
        return ocr(page, `dish${page}`);
      },
      geminiOcrPage: async (page) => geminiOk(dishLine(`菜${page.page}`)),
    };
    const lines = await collect(
      analyzeWithVisionGemini(
        ["data:image/jpeg;base64,A", "data:image/jpeg;base64,B"],
        undefined,
        deps,
      ),
    );
    expect(order[0]).toBe(2);
    expect(lines.map((l) => JSON.parse(l).nameCn)).toEqual(["菜1", "菜2"]);
  });

  it("active page jobs never exceed four for nine pages", async () => {
    let active = 0;
    let maxActive = 0;
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 15));
        active -= 1;
        return ocr(page, `t${page}`);
      },
      geminiOcrPage: async (page) => geminiOk(dishLine(`菜${page.page}`)),
    };
    const images = Array.from({ length: 9 }, (_, i) => `data:image/jpeg;base64,${i}`);
    const lines = await collect(analyzeWithVisionGemini(images, undefined, deps));
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(lines).toHaveLength(9);
  });

  it("OCR and Gemini overlap across pages while each page is OCR-before-Gemini", async () => {
    const events: string[] = [];
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => {
        events.push(`ocr-start-${page}`);
        await new Promise((r) => setTimeout(r, page === 1 ? 30 : 5));
        events.push(`ocr-end-${page}`);
        return ocr(page, `t${page}`);
      },
      geminiOcrPage: async (page) => {
        events.push(`gemini-start-${page.page}`);
        await new Promise((r) => setTimeout(r, 10));
        events.push(`gemini-end-${page.page}`);
        return geminiOk(dishLine(`菜${page.page}`));
      },
    };
    await collect(
      analyzeWithVisionGemini(
        ["data:image/jpeg;base64,A", "data:image/jpeg;base64,B"],
        undefined,
        deps,
      ),
    );
    expect(events.indexOf("ocr-start-1")).toBeLessThan(events.indexOf("gemini-start-1"));
    expect(events.indexOf("ocr-end-1")).toBeLessThan(events.indexOf("gemini-start-1"));
    expect(events.indexOf("ocr-start-2")).toBeLessThan(events.indexOf("gemini-start-2"));
    // page 2 can finish OCR before page 1 Gemini starts (overlap)
    expect(events.indexOf("ocr-end-2")).toBeLessThan(events.indexOf("gemini-end-1"));
  });

  it("all blank OCR yields only unreadable and zero Gemini calls", async () => {
    const gemini = vi.fn();
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => ocr(page, ""),
      geminiOcrPage: gemini,
    };
    const lines = await collect(
      analyzeWithVisionGemini(["data:image/jpeg;base64,A", "data:image/jpeg;base64,B"], undefined, deps),
    );
    expect(lines).toEqual([JSON.stringify({ error: "unreadable" }) + "\n"]);
    expect(gemini).not.toHaveBeenCalled();
  });

  it("mixed blank/readable pages yield readable dishes in page order", async () => {
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => ocr(page, page === 1 ? "" : "红烧肉"),
      geminiOcrPage: async (page) => geminiOk(dishLine(`菜${page.page}`)),
    };
    const lines = await collect(
      analyzeWithVisionGemini(
        ["data:image/jpeg;base64,A", "data:image/jpeg;base64,B"],
        undefined,
        deps,
      ),
    );
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).nameCn).toBe("菜2");
  });

  it("all readable non-menu pages yield not_a_menu", async () => {
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => ocr(page, "bus timetable"),
      geminiOcrPage: async () => geminiOk(JSON.stringify({ error: "not_a_menu" })),
    };
    const lines = await collect(
      analyzeWithVisionGemini(["data:image/jpeg;base64,A"], undefined, deps),
    );
    expect(lines).toEqual([JSON.stringify({ error: "not_a_menu" }) + "\n"]);
  });

  it("mixed menu/non-menu throws before any line is yielded", async () => {
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => ocr(page, "text"),
      geminiOcrPage: async (page) =>
        page.page === 1
          ? geminiOk(dishLine("菜1"))
          : geminiOk(JSON.stringify({ error: "not_a_menu" })),
    };
    const gen = analyzeWithVisionGemini(
      ["data:image/jpeg;base64,A", "data:image/jpeg;base64,B"],
      undefined,
      deps,
    );
    const first = gen.next();
    await expect(first).rejects.toMatchObject({ kind: "inconsistent_page_classification" });
  });

  it("Vision failure on a late page throws before any line is yielded", async () => {
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => {
        if (page === 2) throw new ProviderError("vision", "rejected", false, 400);
        return ocr(page, "text");
      },
      geminiOcrPage: async (page) => geminiOk(dishLine(`菜${page.page}`)),
    };
    const gen = analyzeWithVisionGemini(
      ["data:image/jpeg;base64,A", "data:image/jpeg;base64,B"],
      undefined,
      deps,
    );
    await expect(gen.next()).rejects.toMatchObject({ stage: "vision" });
  });

  it("Gemini malformed and zero output throw before emission", async () => {
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => ocr(page, "text"),
      geminiOcrPage: async () => geminiOk("not json at all"),
    };
    const gen = analyzeWithVisionGemini(["data:image/jpeg;base64,A"], undefined, deps);
    await expect(gen.next()).rejects.toMatchObject({ kind: "invalid_provider_output" });
  });

  it("Gemini unreadable on nonblank OCR is invalid", async () => {
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => ocr(page, "text"),
      geminiOcrPage: async () => geminiOk(JSON.stringify({ error: "unreadable" })),
    };
    const gen = analyzeWithVisionGemini(["data:image/jpeg;base64,A"], undefined, deps);
    await expect(gen.next()).rejects.toMatchObject({ kind: "invalid_provider_output" });
  });

  it("does not leak page metadata into yielded lines", async () => {
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page) => ocr(page, "text"),
      geminiOcrPage: async () => geminiOk(dishLine("菜A")),
    };
    const lines = await collect(analyzeWithVisionGemini(["data:image/jpeg;base64,A"], undefined, deps));
    const obj = JSON.parse(lines[0]);
    expect(obj.page).toBeUndefined();
    expect(obj.bbox).toBeUndefined();
    expect(obj.fullText).toBeUndefined();
  });

  it("first page failure aborts remaining workers and stops claiming pages", async () => {
    const claimed: number[] = [];
    const abortedPages: number[] = [];
    let releaseFirstFailure!: () => void;
    const firstFailureReady = new Promise<void>((resolve) => {
      releaseFirstFailure = resolve;
    });
    const gemini = vi.fn(async (page: OcrPage) => geminiOk(dishLine(`菜${page.page}`)));
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page, signal) => {
        claimed.push(page);
        if (claimed.length === 4) releaseFirstFailure();
        if (page === 1) {
          await firstFailureReady;
          throw new ProviderError("vision", "rejected", false, 400);
        }
        await Promise.race([
          new Promise<void>((resolve) => setTimeout(resolve, 50)),
          new Promise<void>((resolve) => {
            signal?.addEventListener("abort", () => {
              abortedPages.push(page);
              resolve();
            }, { once: true });
          }),
        ]);
        if (signal?.aborted) throw new ProviderError("aborted", "aborted", false);
        return ocr(page, `t${page}`);
      },
      geminiOcrPage: gemini,
    };
    const images = Array.from({ length: 6 }, (_, i) => `data:image/jpeg;base64,${i}`);
    const gen = analyzeWithVisionGemini(images, undefined, deps);
    await expect(gen.next()).rejects.toMatchObject({ stage: "vision", kind: "rejected" });
    expect(claimed).toEqual([1, 2, 3, 4]);
    expect(abortedPages.sort()).toEqual([2, 3, 4]);
    expect(gemini).not.toHaveBeenCalled();
  });

  it("parent cancellation reaches every in-flight page job", async () => {
    const parent = new AbortController();
    const seenSignals: AbortSignal[] = [];
    let releaseClaims!: () => void;
    const allClaimed = new Promise<void>((resolve) => {
      releaseClaims = resolve;
    });
    const deps: VisionGeminiDeps = {
      ocrPage: async (_img, page, signal) => {
        seenSignals.push(signal!);
        if (seenSignals.length === 4) releaseClaims();
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new ProviderError("aborted", "aborted", false)),
            { once: true },
          );
        });
        return ocr(page, `t${page}`);
      },
      geminiOcrPage: vi.fn(),
    };

    const gen = analyzeWithVisionGemini(
      Array.from({ length: 6 }, (_, i) => `data:image/jpeg;base64,${i}`),
      parent.signal,
      deps,
    );
    const first = gen.next();
    await allClaimed;
    parent.abort();

    await expect(first).rejects.toMatchObject({ stage: "aborted" });
    expect(seenSignals).toHaveLength(4);
    expect(seenSignals.every((signal) => signal.aborted)).toBe(true);
  });
});
