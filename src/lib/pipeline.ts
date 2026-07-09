import { ERROR_CODES } from "./contract";
import type { AnalyzeEvent, ErrorCode } from "./contract";
import { createLineSplitter, parseModelLine } from "./ndjson";
import { normalizeDish } from "./normalize";

export function modelTextToEvents(
  source: AsyncIterable<string>,
  onFinish?: () => void,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const emit = (ev: AnalyzeEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      const splitter = createLineSplitter();
      let count = 0;
      let terminated = false;

      const handleLine = (line: string) => {
        const raw = parseModelLine(line);
        if (raw === null || typeof raw !== "object") return;
        const err = (raw as Record<string, unknown>).error;
        if (typeof err === "string" && (ERROR_CODES as readonly string[]).includes(err)) {
          emit({ type: "error", code: err as ErrorCode });
          terminated = true;
          return;
        }
        const dish = normalizeDish(raw, count + 1);
        if (dish) {
          count++;
          emit({ type: "dish", data: dish });
        }
      };

      try {
        for await (const chunk of source) {
          for (const line of splitter.push(chunk)) {
            handleLine(line);
            if (terminated) break;
          }
          if (terminated) break;
        }
        if (!terminated) {
          for (const line of splitter.flush()) {
            handleLine(line);
            if (terminated) break;
          }
        }
        if (!terminated) emit({ type: "done", total: count });
      } catch {
        if (!terminated) emit({ type: "error", code: "upstream_error" });
      } finally {
        onFinish?.();
        controller.close();
      }
    },
  });
}
