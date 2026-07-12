import { describe, expect, it } from "vitest";
import type { LabProviderAdapter } from "./providers";
import { streamLabRun } from "./runner";
import type { LabRequest, LabStreamEvent } from "./types";

const image = "data:image/jpeg;base64,AAAA";
const runtimeMeta = {
  runtime: "local" as const,
  colo: null,
  rayId: null,
  placement: null,
};

function request(imageCount: number): LabRequest {
  return {
    provider: "gemini",
    transport: "gemini",
    model: "gemini-2.5-flash",
    mode: "extract_only",
    images: Array.from({ length: imageCount }, () => image),
    imageNames: Array.from({ length: imageCount }, (_, index) => `M001_P${String(index + 1).padStart(2, "0")}.jpg`),
    temperature: 0,
    maxOutputTokens: 1024,
    signal: new AbortController().signal,
  };
}

async function collect(source: AsyncIterable<LabStreamEvent>): Promise<LabStreamEvent[]> {
  const events: LabStreamEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}

const line = (nameCn: string) =>
  JSON.stringify({
    ordinal: 99,
    categoryCn: null,
    nameCn,
    price: "¥10",
    confidence: 0.9,
    sourceText: `${nameCn} ¥10`,
  }) + "\n";

describe("streamLabRun", () => {
  it("emits meta before starting provider I/O", async () => {
    let started = false;
    const adapter: LabProviderAdapter = {
      id: "gemini",
      async *streamPage(_args) {
        started = true;
        yield { type: "text", text: line("米饭"), ms: 1 };
      },
    };
    const source = streamLabRun(request(1), runtimeMeta, adapter);
    const iterator = source[Symbol.asyncIterator]();

    const first = await iterator.next();

    expect(first.value).toMatchObject({
      type: "meta",
      runtime: "local",
      transport: "gemini",
    });
    expect(started).toBe(false);
    await iterator.return?.(undefined);
  });

  it("streams a fast page without waiting for a slow page and keeps server order fields", async () => {
    const adapter: LabProviderAdapter = {
      id: "gemini",
      async *streamPage({ page }) {
        if (page === 1) await new Promise((resolve) => setTimeout(resolve, 20));
        yield { type: "text", text: line(`第${page}页菜`), ms: 1 };
        yield { type: "finish", reason: "stop" };
      },
    };

    const events = await collect(streamLabRun(request(2), runtimeMeta, adapter));
    const items = events.filter((event) => event.type === "item");

    expect(items.map((event) => event.page)).toEqual([2, 1]);
    expect(items.map((event) => event.ordinal)).toEqual([1, 1]);
    expect(events.at(-1)).toMatchObject({ type: "done", total: 2, partial: false });
  });

  it("caps active page providers at four", async () => {
    let active = 0;
    let maxActive = 0;
    const adapter: LabProviderAdapter = {
      id: "gemini",
      async *streamPage({ page }) {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        yield { type: "text", text: line(`菜${page}`), ms: 1 };
        active--;
      },
    };

    await collect(streamLabRun(request(7), runtimeMeta, adapter));

    expect(maxActive).toBe(4);
  });

  it("keeps successful pages and marks a failed page as partial", async () => {
    const adapter: LabProviderAdapter = {
      id: "gemini",
      async *streamPage({ page }) {
        if (page === 2) throw new Error("provider_timeout");
        yield { type: "text", text: line("成功菜"), ms: 1 };
      },
    };

    const events = await collect(streamLabRun(request(2), runtimeMeta, adapter));

    expect(events).toContainEqual(expect.objectContaining({ type: "item", page: 1 }));
    expect(events).toContainEqual(expect.objectContaining({ type: "error", page: 2, code: "provider_timeout" }));
    expect(events.at(-1)).toMatchObject({ type: "done", total: 1, partial: true });
  });

  it("keeps a sanitized provider status and message for diagnostics", async () => {
    const adapter: LabProviderAdapter = {
      id: "gemini",
      async *streamPage() {
        throw new Error(
          'provider_http_403:{"error":{"message":"This model is not available in your region.","key":"sk-never-show"}}',
        );
      },
    };

    const events = await collect(streamLabRun(request(1), runtimeMeta, adapter));
    const error = events.find((event) => event.type === "error");

    expect(error).toMatchObject({
      type: "error",
      code: "provider_rejected",
      message: "HTTP 403: This model is not available in your region.",
    });
    expect(JSON.stringify(events)).not.toContain("sk-never-show");
  });
});
