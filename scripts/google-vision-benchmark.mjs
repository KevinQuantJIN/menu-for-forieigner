import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
const project = process.env.GOOGLE_CLOUD_PROJECT;
const datasetDir = process.argv[2];
const outputFile = process.argv[3];

if (!accessToken || !project || !datasetDir || !outputFile) {
  console.error(
    "Usage: GOOGLE_OAUTH_ACCESS_TOKEN=... GOOGLE_CLOUD_PROJECT=... node scripts/google-vision-benchmark.mjs <dataset-dir> <output.json>",
  );
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (const [index, char] of [...text.replace(/^\uFEFF/, "")].entries()) {
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some(Boolean)) rows.push(row);
  const headers = rows[0];
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

function normalizeName(value) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function priceTokens(value) {
  return value.normalize("NFKC").match(/时价|\d+(?:\.\d+)?/g) ?? [];
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function similarity(left, right) {
  if (!left || !right) return 0;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }
  return 1 - levenshtein(left, right) / Math.max(left.length, right.length);
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

async function recognize(imageFile) {
  const startedAt = Date.now();
  try {
    const content = (await readFile(path.join(datasetDir, "images", imageFile))).toString(
      "base64",
    );
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-goog-user-project": project,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["zh"] },
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.json();
    const apiError = body.error ?? body.responses?.[0]?.error;
    if (!response.ok || apiError) {
      throw new Error(
        `vision_http_${response.status}:${JSON.stringify(apiError ?? body).slice(0, 300)}`,
      );
    }
    const annotation = body.responses?.[0]?.fullTextAnnotation;
    const words = (annotation?.pages ?? [])
      .flatMap((page) => page.blocks ?? [])
      .flatMap((block) => block.paragraphs ?? [])
      .flatMap((paragraph) => paragraph.words ?? []);
    const confidences = words.map((word) => word.confidence).filter(Number.isFinite);
    return {
      imageFile,
      ok: true,
      totalMs: Date.now() - startedAt,
      text: annotation?.text ?? "",
      wordCount: words.length,
      meanWordConfidence: confidences.length
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : null,
    };
  } catch (error) {
    return {
      imageFile,
      ok: false,
      totalMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      text: "",
      wordCount: 0,
      meanWordConfidence: null,
    };
  }
}

function score(result, goldRows) {
  const normalizedLines = result.text.split("\n").map(normalizeName).filter(Boolean);
  const corpus = normalizedLines.join("");
  const candidates = [...normalizedLines];
  for (let width = 2; width <= 3; width++) {
    for (let index = 0; index <= normalizedLines.length - width; index++) {
      candidates.push(normalizedLines.slice(index, index + width).join(""));
    }
  }
  let strictNames = 0;
  let fuzzyNames = 0;
  const misses = [];
  for (const row of goldRows) {
    const expected = normalizeName(row.name_cn);
    const strict = corpus.includes(expected);
    const best = Math.max(0, ...candidates.map((candidate) => similarity(expected, candidate)));
    if (strict) strictNames++;
    if (strict || best >= 0.75) fuzzyNames++;
    else misses.push({ nameCn: row.name_cn, bestSimilarity: Number(best.toFixed(3)) });
  }
  const goldPrices = [
    ...new Set(
      goldRows.map((row) => priceTokens(row.price).join("|")).filter(Boolean),
    ),
  ];
  const recognizedPrices = new Set(priceTokens(result.text));
  const matchedPrices = goldPrices.filter((price) =>
    price.split("|").every((token) => recognizedPrices.has(token)),
  );
  return {
    ...result,
    goldCount: goldRows.length,
    strictNames,
    fuzzyNames,
    strictNameRecall: goldRows.length ? strictNames / goldRows.length : 0,
    fuzzyNameRecall: goldRows.length ? fuzzyNames / goldRows.length : 0,
    uniquePriceCount: goldPrices.length,
    matchedUniquePrices: matchedPrices.length,
    uniquePriceCoverage: goldPrices.length ? matchedPrices.length / goldPrices.length : 0,
    misses,
  };
}

const goldRows = parseCsv(await readFile(path.join(datasetDir, "dishes.csv"), "utf8"));
const imageFiles = (await readdir(path.join(datasetDir, "images")))
  .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
  .sort();
const startedAt = Date.now();
console.log(`Submitting ${imageFiles.length} Vision OCR requests concurrently...`);
const rawResults = await Promise.all(imageFiles.map(recognize));
const results = rawResults.map((result) =>
  score(
    result,
    goldRows.filter((row) => row.image_file === result.imageFile),
  ),
);
const successful = results.filter((result) => result.ok);
const totals = results.reduce(
  (sum, result) => ({
    gold: sum.gold + result.goldCount,
    strict: sum.strict + result.strictNames,
    fuzzy: sum.fuzzy + result.fuzzyNames,
    prices: sum.prices + result.uniquePriceCount,
    matchedPrices: sum.matchedPrices + result.matchedUniquePrices,
  }),
  { gold: 0, strict: 0, fuzzy: 0, prices: 0, matchedPrices: 0 },
);
const durations = successful.map((result) => result.totalMs);
const weightedConfidence = successful.reduce(
  (sum, result) => sum + (result.meanWordConfidence ?? 0) * result.wordCount,
  0,
);
const totalWords = successful.reduce((sum, result) => sum + result.wordCount, 0);
const output = {
  generatedAt: new Date().toISOString(),
  provider: "Google Cloud Vision",
  feature: "DOCUMENT_TEXT_DETECTION",
  datasetDir,
  execution: { concurrency: imageFiles.length, authentication: "OAuth2" },
  summary: {
    imageCount: results.length,
    successfulImages: successful.length,
    goldCount: totals.gold,
    strictNames: totals.strict,
    fuzzyNames: totals.fuzzy,
    strictNameRecall: totals.gold ? totals.strict / totals.gold : 0,
    fuzzyNameRecall: totals.gold ? totals.fuzzy / totals.gold : 0,
    uniquePriceCount: totals.prices,
    matchedUniquePrices: totals.matchedPrices,
    uniquePriceCoverage: totals.prices ? totals.matchedPrices / totals.prices : 0,
    wordCount: totalWords,
    meanWordConfidence: totalWords ? weightedConfidence / totalWords : null,
    latencyP50Ms: percentile(durations, 0.5),
    latencyP95Ms: percentile(durations, 0.95),
    wallClockMs: Date.now() - startedAt,
  },
  results,
};

await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.summary, null, 2));
