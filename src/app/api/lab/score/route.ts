import { parseGoldCsv, scorePredictions } from "@/lib/lab/scoring";
import type { PredictionRow } from "@/lib/lab/types";

export const runtime = "nodejs";

function error(code: string, message?: string): Response {
  return Response.json({ type: "error", code, message }, { status: 400 });
}

function parseImageNames(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 9) return null;
  if (!raw.every((name) => typeof name === "string" && name.trim() !== "")) return null;
  return raw.map((name) => String(name).trim());
}

function parsePredictions(raw: unknown): PredictionRow[] | null {
  if (!Array.isArray(raw) || raw.length > 5000) return null;
  const rows: PredictionRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (
      !Number.isInteger(row.page) ||
      (row.page as number) < 1 ||
      !Number.isInteger(row.ordinal) ||
      (row.ordinal as number) < 1 ||
      typeof row.nameCn !== "string" ||
      row.nameCn.trim() === ""
    ) {
      return null;
    }
    rows.push({
      page: row.page as number,
      ordinal: row.ordinal as number,
      nameCn: row.nameCn.trim(),
      price: typeof row.price === "string" && row.price.trim() ? row.price.trim() : null,
    });
  }
  return rows;
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return error("invalid_json");
  }
  if (typeof body.csv !== "string" || body.csv.length === 0) return error("invalid_csv");
  if (new TextEncoder().encode(body.csv).byteLength > 1_000_000) return error("csv_too_large");
  const imageNames = parseImageNames(body.imageNames);
  if (!imageNames) return error("invalid_image_names");
  if (Array.isArray(body.predictions) && body.predictions.length > 5000) {
    return error("too_many_predictions");
  }
  const predictions = parsePredictions(body.predictions);
  if (!predictions) return error("invalid_predictions");

  let gold;
  try {
    gold = parseGoldCsv(body.csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid_gold_csv";
    return error("invalid_gold_csv", message);
  }
  const goldImages = new Set(gold.map((row) => row.imageFile));
  if (imageNames.some((name) => !goldImages.has(name))) {
    return error("gold_image_mismatch");
  }
  if (predictions.some((row) => row.page > imageNames.length)) {
    return error("prediction_page_mismatch");
  }

  return Response.json(scorePredictions(predictions, gold, imageNames), {
    headers: { "Cache-Control": "no-store" },
  });
}
