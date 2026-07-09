import { describe, expect, it } from "vitest";
import { createLineSplitter, parseModelLine } from "./ndjson";

describe("createLineSplitter", () => {
  it("跨块拼接：JSON 被从中间切开也能还原成整行", () => {
    const s = createLineSplitter();
    expect(s.push('{"a":')).toEqual([]);
    expect(s.push('1}\n{"b":2}\n{"c"')).toEqual(['{"a":1}', '{"b":2}']);
    expect(s.push(":3}")).toEqual([]);
    expect(s.flush()).toEqual(['{"c":3}']);
  });

  it("忽略空行与纯空白行", () => {
    const s = createLineSplitter();
    expect(s.push('\n  \n{"a":1}\n')).toEqual(['{"a":1}']);
    expect(s.flush()).toEqual([]);
  });
});

describe("parseModelLine", () => {
  it("解析普通 JSON 行", () => {
    expect(parseModelLine('{"a":1}')).toEqual({ a: 1 });
  });

  it("剥掉 markdown 代码围栏噪声", () => {
    expect(parseModelLine("```json")).toBeNull();
    expect(parseModelLine("```")).toBeNull();
    expect(parseModelLine('```json{"a":1}')).toEqual({ a: 1 });
  });

  it("坏行返回 null 不抛异常", () => {
    expect(parseModelLine("oops not json")).toBeNull();
    expect(parseModelLine('{"a":')).toBeNull();
  });
});
