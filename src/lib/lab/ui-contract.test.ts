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
      "accessToken",
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

  it("explains provider readiness and text-only capability limits", () => {
    expect(html).toContain("missingEnvironment");
    expect(html).toContain("text-only · requires shared OCR");
    expect(html).toContain("image-ready");
  });

  it("preserves transport in runs, benchmark grouping, and CSV exports", () => {
    expect(html).toContain("config.transport");
    expect(html).toContain("provider::transport::model");
    expect(html).toContain("provider,transport,model,mode");
  });

  it("keeps a selected transport when model entries share the same model id", () => {
    expect(html).toContain("function refreshModelState()");
    expect(html).toContain("els.model.onchange=refreshModelState");
    expect(html).not.toContain("els.model.onchange=refreshModels");
  });

  it("sends the session-scoped Lab access token on paid provider requests", () => {
    expect(html).toContain('sessionStorage.getItem("labAccessToken")');
    expect(html).toContain('headers.Authorization=`Bearer ${els.accessToken.value.trim()}`');
  });
});
