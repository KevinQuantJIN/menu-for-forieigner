import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "public/lab.html"), "utf8");

describe("Lab UI contract", () => {
  it("exposes provider, mode, gold CSV, benchmark, and export controls", () => {
    for (const id of [
      "provider",
      "model",
      "mode",
      "goldInput",
      "repeatCount",
      "runBtn",
      "benchmarkBtn",
      "exportJsonBtn",
      "exportCsvBtn",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("shows segmented timing, deployment, usage, and quality metrics", () => {
    for (const id of [
      "statProvider",
      "statRuntime",
      "statHeaders",
      "statFirst",
      "statTotal",
      "statTokens",
      "statRecall",
      "statPrice",
      "statHallucinations",
      "benchmarkRows",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("handles the provider-neutral stream events", () => {
    for (const type of [
      "page_started",
      "provider_headers",
      "item",
      "page_done",
      "usage",
      "done",
    ]) {
      expect(html).toContain(`ev.type === "${type}"`);
    }
  });

  it("keeps the latest cumulative usage per page instead of double-counting chunks", () => {
    expect(html).toContain("usageByPage");
    expect(html).not.toContain("run.usage.input+=ev.inputTokens");
  });
});
