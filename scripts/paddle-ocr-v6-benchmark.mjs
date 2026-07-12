import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs";
const MODEL = "PP-OCRv6";
const token = process.env.PADDLE_OCR_TOKEN;
const datasetDir = process.argv[2];
const outputFile = process.argv[3];
const concurrency = Math.max(1, Number(process.env.PADDLE_CONCURRENCY) || 5);
const resume = process.env.PADDLE_RESUME === "1";

if (!token || !datasetDir || !outputFile) {
  console.error(
    "Usage: PADDLE_OCR_TOKEN=... node scripts/paddle-ocr-v6-benchmark.mjs <dataset-dir> <output.json>",
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function mapConcurrent(items, limit, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await operation(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
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
    .replace(/[\s·•,，.。:：;；()（）【】\[\]"'“”‘’、_\-/\\¥￥]+/g, "");
}

function priceTokens(value) {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase("zh-CN")
      .match(/时价|\d+(?:\.\d+)?/g) ?? []
  );
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

async function submit(imagePath) {
  const form = new FormData();
  form.set("model", MODEL);
  form.set(
    "optionalPayload",
    JSON.stringify({
      useDocOrientationClassify: false,
      useDocUnwarping: false,
      useTextlineOrientation: false,
    }),
  );
  form.set("file", new Blob([await readFile(imagePath)]), path.basename(imagePath));
  const response = await fetch(JOB_URL, {
    method: "POST",
    headers: { Authorization: `bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json();
  if (!response.ok || !body?.data?.jobId) {
    throw new Error(`submit_http_${response.status}:${JSON.stringify(body).slice(0, 300)}`);
  }
  return body.data.jobId;
}

async function poll(jobId) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${JOB_URL}/${jobId}`, {
      headers: { Authorization: `bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`poll_http_${response.status}`);
    if (body.data?.state === "done") return body.data;
    if (body.data?.state === "failed") {
      throw new Error(`job_failed:${body.data.errorMsg ?? "unknown"}`);
    }
    await sleep(1_000);
  }
  throw new Error("job_timeout");
}

async function runImage(imageFile) {
  const startedAt = Date.now();
  try {
    const jobId = await submit(path.join(datasetDir, "images", imageFile));
    const data = await poll(jobId);
    const resultResponse = await fetch(data.resultUrl.jsonUrl, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!resultResponse.ok) throw new Error(`result_http_${resultResponse.status}`);
    const documents = (await resultResponse.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const ocrResults = documents.flatMap((document) => document.result?.ocrResults ?? []);
    const recTexts = ocrResults.flatMap((result) => result.prunedResult?.rec_texts ?? []);
    const recScores = ocrResults.flatMap((result) => result.prunedResult?.rec_scores ?? []);
    return {
      imageFile,
      ok: true,
      totalMs: Date.now() - startedAt,
      serviceStartTime: data.extractProgress?.startTime ?? null,
      serviceEndTime: data.extractProgress?.endTime ?? null,
      recTexts,
      recScores,
    };
  } catch (error) {
    return {
      imageFile,
      ok: false,
      totalMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      recTexts: [],
      recScores: [],
    };
  }
}

function scoreImage(result, goldRows) {
  const normalizedLines = result.recTexts.map(normalizeName).filter(Boolean);
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
      goldRows
        .map((row) => priceTokens(row.price).join("|"))
        .filter(Boolean),
    ),
  ];
  const recognizedPriceTokens = new Set(result.recTexts.flatMap(priceTokens));
  const matchedPrices = goldPrices.filter((price) =>
    price.split("|").every((token) => recognizedPriceTokens.has(token)),
  );
  const confidences = result.recScores.filter((value) => Number.isFinite(value));
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
    detectedLineCount: result.recTexts.length,
    meanConfidence: confidences.length
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : null,
    misses,
  };
}

const csvRows = parseCsv(await readFile(path.join(datasetDir, "dishes.csv"), "utf8"));
const imageFiles = (await readdir(path.join(datasetDir, "images")))
  .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
  .sort();

let resumedResults = [];
if (resume) {
  try {
    const previous = JSON.parse(await readFile(outputFile, "utf8"));
    resumedResults = previous.results.filter((result) => result.ok);
  } catch {
    resumedResults = [];
  }
}
const resumedByImage = new Map(resumedResults.map((result) => [result.imageFile, result]));
const pendingImages = imageFiles.filter((imageFile) => !resumedByImage.has(imageFile));
const benchmarkStartedAt = Date.now();
console.log(
  `Running ${pendingImages.length} images with concurrency ${concurrency}; resumed ${resumedResults.length}...`,
);
const newResults = await mapConcurrent(pendingImages, concurrency, runImage);
const newByImage = new Map(newResults.map((result) => [result.imageFile, result]));
const rawResults = imageFiles.map(
  (imageFile) => newByImage.get(imageFile) ?? resumedByImage.get(imageFile),
);
const results = rawResults.map((result) =>
  scoreImage(
    result,
    csvRows.filter((row) => row.image_file === result.imageFile),
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
const allConfidences = successful.flatMap((result) => result.recScores);
let estimatedDatasetWallClockMs = 0;
for (let index = 0; index < successful.length; index += concurrency) {
  estimatedDatasetWallClockMs += Math.max(
    ...successful.slice(index, index + concurrency).map((result) => result.totalMs),
  );
}
const output = {
  generatedAt: new Date().toISOString(),
  model: MODEL,
  datasetDir,
  execution: {
    concurrency,
    resumedSuccessfulImages: resumedResults.length,
    pollingIntervalMs: 1_000,
  },
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
    detectedLineCount: successful.reduce(
      (sum, result) => sum + result.recTexts.length,
      0,
    ),
    meanConfidence: allConfidences.length
      ? allConfidences.reduce((sum, value) => sum + value, 0) /
        allConfidences.length
      : null,
    latencyP50Ms: percentile(durations, 0.5),
    latencyP95Ms: percentile(durations, 0.95),
    estimatedDatasetWallClockMs,
    currentRunWallClockMs:
      pendingImages.length > 0 ? Date.now() - benchmarkStartedAt : 0,
  },
  results,
};

await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.summary, null, 2));
