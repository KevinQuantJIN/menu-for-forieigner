import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./prompt";

describe("buildSystemPrompt", () => {
  it("英文 only，无语言占位符", () => {
    const p = buildSystemPrompt();
    expect(p).toContain("English");
    expect(p).not.toContain("{LANG}");
  });

  it("包含关键约束：错误输出、Big9、textures/story、多图、禁滥标、NDJSON", () => {
    const p = buildSystemPrompt();
    expect(p).toContain('{"error":"not_a_menu"}');
    expect(p).toContain('{"error":"unreadable"}');
    expect(p).toContain("may_contain");
    expect(p).toContain("DO NOT blanket-tag");
    expect(p).toContain("one JSON object per line");
    expect(p).toContain("textures");
    expect(p).toContain("story");
    expect(p).toContain("1–9");
    expect(p).toContain("shellfish");
    expect(p).toContain("IDENTICAL category string");
  });
});
