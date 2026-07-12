import { afterEach, describe, expect, it } from "vitest";
import { getLabCatalog, getLabModel } from "./catalog";
import { getLabPrompt } from "./prompts";
import { parseGoldCsv, scorePredictions } from "./scoring";

const originalGoogleKey = process.env.GOOGLE_API_KEY;

afterEach(() => {
  if (originalGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = originalGoogleKey;
});

describe("Lab catalog", () => {
  it("does not expose credentials and marks configured providers", () => {
    process.env.GOOGLE_API_KEY = "secret-value-that-must-not-leak";

    const catalog = getLabCatalog();

    expect(JSON.stringify(catalog)).not.toContain("secret-value-that-must-not-leak");
    expect(catalog.providers.find((provider) => provider.id === "gemini")?.configured).toBe(true);
  });

  it("only resolves a model under its declared provider", () => {
    expect(getLabModel("gemini", "gemini-2.5-flash")?.provider).toBe("gemini");
    expect(getLabModel("openai", "gemini-2.5-flash")).toBeUndefined();
  });

  it("uses a compact visual-facts prompt for extract-only mode", () => {
    const prompt = getLabPrompt("extract_only");
    expect(prompt.systemPrompt).toContain("Do not translate");
    expect(prompt.systemPrompt).toContain("nameCn");
    expect(prompt.systemPrompt).not.toContain("story");
  });
});

describe("gold CSV", () => {
  it("parses the six-column friend collection format", () => {
    const rows = parseGoldCsv(
      "menu_id,image_file,dish_order,name_cn,price,note\r\n" +
        'M001,M001_P01.jpg,1,糖醋里脊,¥69,"招牌,推荐"\r\n',
    );

    expect(rows).toEqual([
      {
        menuId: "M001",
        imageFile: "M001_P01.jpg",
        dishOrder: 1,
        nameCn: "糖醋里脊",
        price: "¥69",
        note: "招牌,推荐",
      },
    ]);
  });

  it("rejects a CSV missing required headers", () => {
    expect(() => parseGoldCsv("menu_id,name_cn\nM001,糖醋里脊\n")).toThrow("missing_csv_header:image_file");
  });

  it("scores recall, exact prices, and hallucinations", () => {
    const score = scorePredictions(
      [
        { page: 1, ordinal: 1, nameCn: "糖 醋里脊", price: "69元" },
        { page: 1, ordinal: 2, nameCn: "幻觉菜", price: "1" },
      ],
      [
        {
          menuId: "M001",
          imageFile: "M001_P01.jpg",
          dishOrder: 1,
          nameCn: "糖醋里脊",
          price: "¥69",
          note: "",
        },
      ],
      ["M001_P01.jpg"],
    );

    expect(score.nameRecall).toBe(1);
    expect(score.matchedNames).toBe(1);
    expect(score.hallucinationCount).toBe(1);
    expect(score.priceExact).toBe(0);
  });
});
