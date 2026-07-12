import type { GoldDishRow, LabScore, PredictionRow } from "./types";

const REQUIRED_HEADERS = [
  "menu_id",
  "image_file",
  "dish_order",
  "name_cn",
  "price",
  "note",
] as const;

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("invalid_csv_unclosed_quote");
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

export function parseGoldCsv(text: string): GoldDishRow[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) throw new Error("empty_csv");
  const headers = rows[0].map((header) => header.trim());
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) throw new Error(`missing_csv_header:${required}`);
  }
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));

  return rows.slice(1).map((row, rowIndex) => {
    const dishOrder = Number(row[index.dish_order]);
    if (!Number.isInteger(dishOrder) || dishOrder < 1) {
      throw new Error(`invalid_dish_order:${rowIndex + 2}`);
    }
    const nameCn = (row[index.name_cn] ?? "").trim();
    const imageFile = (row[index.image_file] ?? "").trim();
    if (!nameCn) throw new Error(`missing_name_cn:${rowIndex + 2}`);
    if (!imageFile) throw new Error(`missing_image_file:${rowIndex + 2}`);
    return {
      menuId: (row[index.menu_id] ?? "").trim(),
      imageFile,
      dishOrder,
      nameCn,
      price: (row[index.price] ?? "").trim(),
      note: (row[index.note] ?? "").trim(),
    };
  });
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·•,，.。:：;；()（）【】\[\]"'“”‘’、_-]+/g, "");
}

function normalizePrice(value: string | null): string {
  return (value ?? "").normalize("NFKC").trim();
}

export function scorePredictions(
  predictions: PredictionRow[],
  goldRows: GoldDishRow[],
  imageNames: string[],
): LabScore {
  const allowedImages = new Set(imageNames);
  const gold = goldRows.filter((row) => allowedImages.has(row.imageFile));
  const unmatchedGold = new Set(gold.map((_, index) => index));
  const extras: PredictionRow[] = [];
  let matchedNames = 0;
  let priceCompared = 0;
  let priceMatched = 0;

  for (const prediction of predictions) {
    const imageFile = imageNames[prediction.page - 1];
    const matchIndex = gold.findIndex(
      (row, index) =>
        unmatchedGold.has(index) &&
        row.imageFile === imageFile &&
        normalizeName(row.nameCn) === normalizeName(prediction.nameCn),
    );
    if (matchIndex < 0) {
      extras.push(prediction);
      continue;
    }
    unmatchedGold.delete(matchIndex);
    matchedNames++;
    if (gold[matchIndex].price !== "") {
      priceCompared++;
      if (normalizePrice(gold[matchIndex].price) === normalizePrice(prediction.price)) {
        priceMatched++;
      }
    }
  }

  const misses = [...unmatchedGold].map((index) => gold[index]);
  return {
    goldCount: gold.length,
    predictionCount: predictions.length,
    matchedNames,
    missedCount: misses.length,
    hallucinationCount: extras.length,
    nameRecall: gold.length === 0 ? 0 : matchedNames / gold.length,
    namePrecision: predictions.length === 0 ? 0 : matchedNames / predictions.length,
    priceCompared,
    priceMatched,
    priceExact: priceCompared === 0 ? 0 : priceMatched / priceCompared,
    misses,
    extras,
  };
}
