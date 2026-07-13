import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeEvent } from "@/lib/contract";
import { getMockRestaurant } from "@/lib/mockData";

const analyzeMock = vi.fn();

vi.mock("@/lib/vision-gemini", () => ({
  analyzeWithVisionGemini: (...args: unknown[]) => analyzeMock(...args),
}));

beforeEach(() => {
  process.env.MOCK_LLM = "1";
  process.env.MOCK_DELAY_MS = "0";
  analyzeMock.mockReset();
});

afterEach(() => {
  delete process.env.MOCK_LLM;
  delete process.env.MOCK_DELAY_MS;
  vi.useRealTimers();
  vi.resetModules();
});

async function post(body: unknown, init?: { signal?: AbortSignal }): Promise<Response> {
  const { POST } = await import("./route");
  return POST(
    new Request("http://test/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: init?.signal,
    }),
  );
}

async function events(res: Response): Promise<AnalyzeEvent[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

async function postWithObservableSignal(body: unknown, signal: AbortSignal): Promise<Response> {
  const { POST } = await import("./route");
  return POST({
    json: async () => body,
    signal,
  } as Request);
}

const img = "data:image/jpeg;base64,AAAA";
const validBody = { images: [img] };

function dishLine(nameCn: string): string {
  return (
    JSON.stringify({
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
    }) + "\n"
  );
}

describe("POST /api/analyze", () => {
  it("合法多图请求返回默认餐厅的完整 ndjson 菜品流", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("x-ndjson");
    const evs = await events(res);
    const dishTotal = getMockRestaurant("mawangzi").dishes.length;
    expect(evs.filter((e) => e.type === "dish")).toHaveLength(dishTotal);
    expect(evs[0]).toMatchObject({ type: "dish", data: { nameCn: "砂锅美蛙" } });
    expect(evs.at(-1)).toEqual({ type: "done", total: dishTotal });
    const first = evs[0];
    if (first.type === "dish") {
      expect(first.data).toHaveProperty("textures");
      expect(first.data).toHaveProperty("story");
    }
  });

  it("兼容旧单图字段 image", async () => {
    const res = await post({ image: img });
    expect(res.status).toBe(200);
    const evs = await events(res);
    expect(evs.at(-1)).toMatchObject({ type: "done" });
  });

  it("最多 9 张图可通过", async () => {
    const res = await post({ images: Array.from({ length: 9 }, () => img) });
    expect(res.status).toBe(200);
  });

  it("超过 9 张 → 400 too_many_images", async () => {
    const res = await post({ images: Array.from({ length: 10 }, () => img) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "too_many_images" });
  });

  it("mockRestaurant 可切换到利苑酒家数据", async () => {
    const res = await post({ ...validBody, mockRestaurant: "lei-garden" });
    const evs = await events(res);
    const dishTotal = getMockRestaurant("lei-garden").dishes.length;
    expect(evs.filter((e) => e.type === "dish")).toHaveLength(dishTotal);
    expect(evs[0]).toMatchObject({ type: "dish", data: { nameCn: "香烧乳鸭仔（1只）" } });
    expect(evs.at(-1)).toEqual({ type: "done", total: dishTotal });
  });

  it("mockRestaurant 可切换到北京菜餐厅数据", async () => {
    const res = await post({ ...validBody, mockRestaurant: "beijing-cuisine" });
    const evs = await events(res);
    const dishTotal = getMockRestaurant("beijing-cuisine").dishes.length;
    expect(evs.filter((e) => e.type === "dish")).toHaveLength(dishTotal);
    expect(evs[0]).toMatchObject({ type: "dish", data: { nameCn: "糖醋里脊" } });
    expect(evs.at(-1)).toEqual({ type: "done", total: dishTotal });
  });

  it("image 非 dataURL → 400", async () => {
    const res = await post({ images: ["http://evil.com/a.jpg"] });
    expect(res.status).toBe(400);
  });

  it("空 images → 400", async () => {
    const res = await post({ images: [] });
    expect(res.status).toBe(400);
  });

  it("非 JSON body → 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request("http://test/api/analyze", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("MOCK_LLM=1 uses mock even with no credentials", async () => {
    process.env.MOCK_LLM = "1";
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(analyzeMock).not.toHaveBeenCalled();
    const evs = await events(res);
    expect(evs.some((e) => e.type === "dish")).toBe(true);
  });

  it("no credentials and mock off does not use mock; returns upstream_error", async () => {
    delete process.env.MOCK_LLM;
    analyzeMock.mockImplementation(async function* () {
      throw new Error("missing_credentials");
    });
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(analyzeMock).toHaveBeenCalled();
    const evs = await events(res);
    expect(evs).toEqual([{ type: "error", code: "upstream_error" }]);
  });

  it("production source success preserves NDJSON headers and normalized IDs", async () => {
    delete process.env.MOCK_LLM;
    analyzeMock.mockImplementation(async function* () {
      yield dishLine("宫保鸡丁");
      yield dishLine("红烧肉");
    });
    const res = await post(validBody);
    expect(res.headers.get("Content-Type")).toContain("x-ndjson");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const evs = await events(res);
    expect(evs.filter((e) => e.type === "dish")).toHaveLength(2);
    expect(evs[0]).toMatchObject({ type: "dish", data: { id: 1, nameCn: "宫保鸡丁" } });
    expect(evs[1]).toMatchObject({ type: "dish", data: { id: 2, nameCn: "红烧肉" } });
    expect(evs.at(-1)).toEqual({ type: "done", total: 2 });
  });

  it("production unreadable / not_a_menu / thrown failure map exactly", async () => {
    delete process.env.MOCK_LLM;

    analyzeMock.mockImplementation(async function* () {
      yield JSON.stringify({ error: "unreadable" }) + "\n";
    });
    let res = await post(validBody);
    expect(await events(res)).toEqual([{ type: "error", code: "unreadable" }]);

    analyzeMock.mockImplementation(async function* () {
      yield JSON.stringify({ error: "not_a_menu" }) + "\n";
    });
    res = await post(validBody);
    expect(await events(res)).toEqual([{ type: "error", code: "not_a_menu" }]);

    analyzeMock.mockImplementation(async function* () {
      throw new Error("boom");
    });
    res = await post(validBody);
    expect(await events(res)).toEqual([{ type: "error", code: "upstream_error" }]);
  });

  it("legacy image field reaches production source as one page", async () => {
    delete process.env.MOCK_LLM;
    analyzeMock.mockImplementation(async function* (images: string[]) {
      expect(images).toEqual([img]);
      yield dishLine("菜1");
    });
    const res = await post({ image: img });
    expect(res.status).toBe(200);
    expect(analyzeMock).toHaveBeenCalled();
  });

  it("nine pages are passed in original order", async () => {
    delete process.env.MOCK_LLM;
    const images = Array.from({ length: 9 }, (_, i) => `data:image/jpeg;base64,P${i}`);
    analyzeMock.mockImplementation(async function* (imgs: string[]) {
      expect(imgs).toEqual(images);
      yield dishLine("菜");
    });
    const res = await post({ images });
    expect(res.status).toBe(200);
  });

  it("passes a pre-aborted request signal to the provider without installing a listener", async () => {
    delete process.env.MOCK_LLM;
    const request = new AbortController();
    request.abort();
    const addSpy = vi.spyOn(request.signal, "addEventListener");
    const removeSpy = vi.spyOn(request.signal, "removeEventListener");
    let providerSignal: AbortSignal | undefined;
    analyzeMock.mockImplementation(async function* (_images: string[], signal: AbortSignal) {
      providerSignal = signal;
      throw new Error("aborted");
    });

    const res = await postWithObservableSignal(validBody, request.signal);
    expect(await events(res)).toEqual([{ type: "error", code: "upstream_error" }]);
    expect(providerSignal?.aborted).toBe(true);
    expect(addSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("propagates a client abort during streaming and cleans up", async () => {
    delete process.env.MOCK_LLM;
    const request = new AbortController();
    const removeSpy = vi.spyOn(request.signal, "removeEventListener");
    let providerSignal: AbortSignal | undefined;
    analyzeMock.mockImplementation(async function* (_images: string[], signal: AbortSignal) {
      providerSignal = signal;
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });

    const res = await postWithObservableSignal(validBody, request.signal);
    const body = events(res);
    request.abort();

    expect(await body).toEqual([{ type: "error", code: "upstream_error" }]);
    expect(providerSignal?.aborted).toBe(true);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it("aborts the provider at the overall timeout and clears the timer", async () => {
    delete process.env.MOCK_LLM;
    vi.useFakeTimers();
    const request = new AbortController();
    let providerSignal: AbortSignal | undefined;
    analyzeMock.mockImplementation(async function* (_images: string[], signal: AbortSignal) {
      providerSignal = signal;
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
      });
    });

    const res = await postWithObservableSignal(validBody, request.signal);
    const body = events(res);
    await vi.advanceTimersByTimeAsync(150_000);

    expect(await body).toEqual([{ type: "error", code: "upstream_error" }]);
    expect(providerSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans the timer and request listener exactly once after success", async () => {
    delete process.env.MOCK_LLM;
    const request = new AbortController();
    const addSpy = vi.spyOn(request.signal, "addEventListener");
    const removeSpy = vi.spyOn(request.signal, "removeEventListener");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    analyzeMock.mockImplementation(async function* () {
      yield dishLine("宫保鸡丁");
    });

    const res = await postWithObservableSignal(validBody, request.signal);
    expect((await events(res)).at(-1)).toEqual({ type: "done", total: 1 });
    request.abort();

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("cleans the timer and request listener after provider failure", async () => {
    delete process.env.MOCK_LLM;
    vi.useFakeTimers();
    const request = new AbortController();
    const removeSpy = vi.spyOn(request.signal, "removeEventListener");
    analyzeMock.mockImplementation(async function* () {
      throw new Error("provider failed");
    });

    const res = await postWithObservableSignal(validBody, request.signal);
    expect(await events(res)).toEqual([{ type: "error", code: "upstream_error" }]);

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans the mock path lifecycle", async () => {
    process.env.MOCK_LLM = "1";
    vi.useFakeTimers();
    const request = new AbortController();
    const removeSpy = vi.spyOn(request.signal, "removeEventListener");

    const res = await postWithObservableSignal(validBody, request.signal);
    const body = events(res);
    await vi.runAllTimersAsync();
    expect((await body).at(-1)?.type).toBe("done");

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
