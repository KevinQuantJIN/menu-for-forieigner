import { describe, expect, it } from "vitest";
import { parseSse } from "./sse";

function stream(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(source: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const item of source) out.push(item);
  return out;
}

describe("parseSse", () => {
  it("splits SSE events across transport chunks", async () => {
    const events = await collect(
      parseSse(stream('data: {"a":', '1}\n\ndata: [DONE]\n\n')),
    );
    expect(events).toEqual(['{"a":1}', "[DONE]"]);
  });

  it("joins multiple data fields and ignores comments", async () => {
    const events = await collect(
      parseSse(stream(': heartbeat\ndata: first\ndata: second\n\n')),
    );
    expect(events).toEqual(["first\nsecond"]);
  });
});
