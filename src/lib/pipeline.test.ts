import { describe, expect, it } from "vitest";
import type { AnalyzeEvent } from "./contract";
import { modelTextToEvents } from "./pipeline";

async function* chunks(...parts: string[]): AsyncGenerator<string> {
  for (const p of parts) yield p;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<AnalyzeEvent[]> {
  const text = await new Response(stream).text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("modelTextToEvents", () => {
  it("跨块切割的菜品行 → 顺序 dish 事件 + done，id 服务端递增", async () => {
    const src = chunks('{"nameCn":"麻婆豆腐","name":"Mapo Tofu"}\n{"nameCn":"白', '饭","name":"Rice"}');
    const events = await collect(modelTextToEvents(src));
    expect(events.map((e) => e.type)).toEqual(["dish", "dish", "done"]);
    expect(events[0]).toMatchObject({ type: "dish", data: { id: 1, nameCn: "麻婆豆腐" } });
    expect(events[1]).toMatchObject({ type: "dish", data: { id: 2, nameCn: "白饭" } });
    expect(events[2]).toEqual({ type: "done", total: 2 });
  });

  it("坏行与围栏噪声被丢弃，不影响后续", async () => {
    const src = chunks('```json\ngarbage\n{"nameCn":"白饭","name":"Rice"}\n```\n');
    const events = await collect(modelTextToEvents(src));
    expect(events.map((e) => e.type)).toEqual(["dish", "done"]);
  });

  it("模型 error 行 → error 事件并终止（无 done）", async () => {
    const src = chunks('{"error":"not_a_menu"}\n{"nameCn":"不该出现","name":"x"}\n');
    const events = await collect(modelTextToEvents(src));
    expect(events).toEqual([{ type: "error", code: "not_a_menu" }]);
  });

  it("source 抛异常 → upstream_error（已发出的 dish 保留）", async () => {
    async function* bad(): AsyncGenerator<string> {
      yield '{"nameCn":"麻婆豆腐","name":"Mapo Tofu"}\n';
      throw new Error("boom");
    }
    const events = await collect(modelTextToEvents(bad()));
    expect(events.map((e) => e.type)).toEqual(["dish", "error"]);
    expect(events[1]).toEqual({ type: "error", code: "upstream_error" });
  });

  it("结束时调用 onFinish", async () => {
    let called = false;
    await collect(
      modelTextToEvents(chunks(""), () => {
        called = true;
      }),
    );
    expect(called).toBe(true);
  });
});
