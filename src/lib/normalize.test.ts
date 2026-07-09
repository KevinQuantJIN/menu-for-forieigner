import { describe, expect, it } from "vitest";
import { normalizeDish } from "./normalize";

const full = {
  category: "Cold Dishes",
  nameCn: "夫妻肺片",
  pinyin: "Fūqī Fèipiàn",
  name: "Sliced Beef Offal in Chili Oil",
  description: "No lungs, promise.",
  price: "¥38",
  spicy: 2,
  vegetarian: false,
  allergens: [{ type: "peanut", level: "contains" }],
  ingredients: ["beef offal", "chili oil"],
};

describe("normalizeDish", () => {
  it("接受完整合法对象并注入 id", () => {
    const d = normalizeDish(full, 3);
    expect(d).not.toBeNull();
    expect(d!.id).toBe(3);
    expect(d!.nameCn).toBe("夫妻肺片");
    expect(d!.allergens).toEqual([{ type: "peanut", level: "contains" }]);
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

  it("过滤非法过敏原类型，level 非法时归 may_contain", () => {
    const d = normalizeDish(
      {
        ...full,
        allergens: [
          { type: "kryptonite", level: "contains" },
          { type: "soy", level: "definitely" },
        ],
      },
      1,
    )!;
    expect(d.allergens).toEqual([{ type: "soy", level: "may_contain" }]);
  });

  it("缺失字段有兜底：category/price→null, ingredients→[], vegetarian→false", () => {
    const d = normalizeDish({ nameCn: "白饭", name: "Rice" }, 1)!;
    expect(d.category).toBeNull();
    expect(d.price).toBeNull();
    expect(d.ingredients).toEqual([]);
    expect(d.vegetarian).toBe(false);
    expect(d.pinyin).toBe("");
  });
});
