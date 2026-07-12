import { describe, expect, it } from "vitest";
import { normalizeDish } from "./normalize";

const full = {
  category: "Cold Starters",
  nameCn: "夫妻肺片",
  pinyin: "Fūqī Fèipiàn",
  name: "Sliced Beef Offal in Chili Oil",
  description: "No lungs, promise.",
  price: "¥38",
  spicy: 2,
  vegetarian: false,
  allergens: [{ type: "peanut", level: "contains" }],
  textures: ["offal"],
  ingredients: ["beef offal", "chili oil"],
  story: "Named after a couple of street vendors in Chengdu.",
};

describe("normalizeDish", () => {
  it("接受完整合法对象并注入 id", () => {
    const d = normalizeDish(full, 3);
    expect(d).not.toBeNull();
    expect(d!.id).toBe(3);
    expect(d!.nameCn).toBe("夫妻肺片");
    expect(d!.allergens).toEqual([{ type: "peanut", level: "contains" }]);
    expect(d!.textures).toEqual(["offal"]);
    expect(d!.story).toContain("Chengdu");
  });

  it("nameCn 与 name 都缺失时返回 null", () => {
    expect(normalizeDish({ description: "x" }, 1)).toBeNull();
    expect(normalizeDish("not an object", 1)).toBeNull();
    expect(normalizeDish(null, 1)).toBeNull();
  });

  it("spicy 越界钳制到 0-3，非数字归 0", () => {
    expect(normalizeDish({ ...full, spicy: 7 }, 1)!.spicy).toBe(3);
    expect(normalizeDish({ ...full, spicy: -2 }, 1)!.spicy).toBe(0);
    expect(normalizeDish({ ...full, spicy: "hot" }, 1)!.spicy).toBe(0);
  });

  it("过滤非法过敏原类型，level 非法时归 may_contain，同类型去重", () => {
    const d = normalizeDish(
      {
        ...full,
        allergens: [
          { type: "kryptonite", level: "contains" },
          { type: "soy", level: "definitely" },
          { type: "soy", level: "contains" },
        ],
      },
      1,
    )!;
    expect(d.allergens).toEqual([{ type: "soy", level: "may_contain" }]);
  });

  it("缺失字段有兜底：category/price/story→null, textures/ingredients→[], vegetarian→false", () => {
    const d = normalizeDish({ nameCn: "白饭", name: "Rice" }, 1)!;
    expect(d.category).toBeNull();
    expect(d.price).toBeNull();
    expect(d.story).toBeNull();
    expect(d.textures).toEqual([]);
    expect(d.ingredients).toEqual([]);
    expect(d.vegetarian).toBe(false);
    expect(d.pinyin).toBe("");
  });

  it("textures 去空白与大小写重复", () => {
    const d = normalizeDish({ ...full, textures: ["Offal", "offal", "  ", "on the bone"] }, 1)!;
    expect(d.textures).toEqual(["Offal", "on the bone"]);
  });
});
