import { beforeAll, describe, expect, it } from "vitest";
import type { AnalyzeEvent } from "@/lib/contract";
import { getMockRestaurant } from "@/lib/mockData";

beforeAll(() => {
  process.env.MOCK_LLM = "1";
  process.env.MOCK_DELAY_MS = "0";
});

async function post(body: unknown): Promise<Response> {
  const { POST } = await import("./route");
  return POST(
    new Request("http://test/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

const img = "data:image/jpeg;base64,AAAA";
const validBody = { images: [img] };

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
});
