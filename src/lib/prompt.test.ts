import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./prompt";

describe("buildSystemPrompt", () => {
  it("按语言注入目标语言名", () => {
    expect(buildSystemPrompt("ja")).toContain("Japanese");
    expect(buildSystemPrompt("en")).toContain("English");
    expect(buildSystemPrompt("ja")).not.toContain("{LANG}");
  });

  it("包含关键约束：错误输出、置信度枚举、禁滥标规则、NDJSON", () => {
    const p = buildSystemPrompt("en");
    expect(p).toContain('{"error":"not_a_menu"}');
    expect(p).toContain('{"error":"unreadable"}');
    expect(p).toContain("may_contain");
    expect(p).toContain("DO NOT blanket-tag");
    expect(p).toContain("one JSON object per line");
  });
});
