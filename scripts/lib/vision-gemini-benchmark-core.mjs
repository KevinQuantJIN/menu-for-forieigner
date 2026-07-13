import { createHash } from "node:crypto";

export const BENCHMARK_SCHEMA_VERSION = "vision-gemini-benchmark.v2";
export const HARNESS_VERSION = "2.0.0";
export const PUBLIC_CONTRACT_VERSION = "v1";

const ERROR_CODES = new Set(["not_a_menu", "unreadable", "upstream_error"]);
const ALLERGENS = new Set([
  "peanut",
  "tree_nut",
  "egg",
  "dairy",
  "fish",
  "shellfish",
  "soy",
  "gluten",
  "sesame",
]);
const DISH_KEYS = [
  "id",
  "category",
  "nameCn",
  "pinyin",
  "name",
  "description",
  "price",
  "spicy",
  "vegetarian",
  "allergens",
  "textures",
  "ingredients",
  "story",
].sort();

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function hasExactKeys(value, expected) {
  return Object.keys(value).sort().join("\0") === expected.slice().sort().join("\0");
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stringOrNull(value) {
  return value === null || typeof value === "string";
}

function validStringArray(value) {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function validateDishData(data, expectedId) {
  if (!isPlainObject(data) || !hasExactKeys(data, DISH_KEYS)) return "invalid_dish_shape";
  if (!Number.isInteger(data.id) || data.id !== expectedId) return "invalid_dish_id";
  if (!stringOrNull(data.category) || !nonEmptyString(data.nameCn) || !nonEmptyString(data.name)) {
    return "invalid_dish_identity";
  }
  if (typeof data.pinyin !== "string" || typeof data.description !== "string") {
    return "invalid_dish_text";
  }
  if (!stringOrNull(data.price) || !stringOrNull(data.story)) return "invalid_dish_nullable_text";
  if (!Number.isInteger(data.spicy) || data.spicy < 0 || data.spicy > 3) return "invalid_dish_spicy";
  if (typeof data.vegetarian !== "boolean") return "invalid_dish_vegetarian";
  if (!validStringArray(data.textures) || !validStringArray(data.ingredients)) {
    return "invalid_dish_string_array";
  }
  if (!Array.isArray(data.allergens)) return "invalid_dish_allergens";
  for (const allergen of data.allergens) {
    if (!isPlainObject(allergen) || !hasExactKeys(allergen, ["level", "type"])) {
      return "invalid_dish_allergen_shape";
    }
    if (!ALLERGENS.has(allergen.type)) return "invalid_dish_allergen_type";
    if (allergen.level !== "contains" && allergen.level !== "may_contain") {
      return "invalid_dish_allergen_level";
    }
  }
  return null;
}

export function parseCsvRows(text) {
  const source = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  const finishField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
  };
  const finishRow = () => {
    finishField();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        field += char;
      }
      continue;
    }

    if (afterQuote) {
      if (char === ",") finishField();
      else if (char === "\n") finishRow();
      else if (char !== "\r") throw new Error(`unexpected_character_after_quote:${index}`);
      continue;
    }

    if (char === '"') {
      if (field !== "") throw new Error(`unexpected_quote:${index}`);
      quoted = true;
    } else if (char === ",") {
      finishField();
    } else if (char === "\n") {
      finishRow();
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (quoted) throw new Error("unterminated_quoted_field");
  if (field !== "" || row.length > 0 || afterQuote) finishRow();
  return rows;
}

export function parseGoldCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) throw new Error("empty_csv");
  const headers = rows[0].map((header) => header.trim());
  const required = ["menu_id", "image_file", "dish_order", "name_cn", "price", "note"];
  for (const header of required) {
    if (!headers.includes(header)) throw new Error(`missing_header:${header}`);
  }
  const positions = Object.fromEntries(headers.map((header, index) => [header, index]));

  return rows.slice(1).map((row, rowIndex) => {
    if (row.length !== headers.length) throw new Error(`malformed_csv_row:${rowIndex + 2}`);
    const dishOrder = Number(row[positions.dish_order]);
    const menuId = (row[positions.menu_id] ?? "").trim();
    const imageFile = (row[positions.image_file] ?? "").trim();
    const nameCn = (row[positions.name_cn] ?? "").trim();
    if (!menuId) throw new Error(`missing_menu_id:${rowIndex + 2}`);
    if (!imageFile) throw new Error(`missing_image_file:${rowIndex + 2}`);
    if (!Number.isInteger(dishOrder) || dishOrder < 1) {
      throw new Error(`invalid_dish_order:${rowIndex + 2}`);
    }
    if (!nameCn) throw new Error(`missing_name_cn:${rowIndex + 2}`);
    return {
      menuId,
      imageFile,
      dishOrder,
      nameCn,
      price: (row[positions.price] ?? "").trim(),
      note: (row[positions.note] ?? "").trim(),
    };
  });
}

export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·•,，.。:：;；()（）【】\[\]"'“”‘’、_-]+/g, "");
}

export function normalizePrice(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

export function scorePage(predictions, goldRows, imageFile) {
  const gold = goldRows
    .filter((row) => row.imageFile === imageFile)
    .slice()
    .sort((left, right) => left.dishOrder - right.dishOrder);
  const unmatchedGold = new Set(gold.map((_row, index) => index));
  const extras = [];
  const matchedPairs = [];
  let priceCompared = 0;
  let priceMatched = 0;

  for (let predIndex = 0; predIndex < predictions.length; predIndex++) {
    const prediction = predictions[predIndex];
    const goldIndex = gold.findIndex(
      (row, index) => unmatchedGold.has(index) && normalizeName(row.nameCn) === normalizeName(prediction.nameCn),
    );
    if (goldIndex < 0) {
      extras.push(prediction);
      continue;
    }
    unmatchedGold.delete(goldIndex);
    matchedPairs.push({ goldIndex, predIndex });
    if (gold[goldIndex].price !== "") {
      priceCompared += 1;
      if (normalizePrice(gold[goldIndex].price) === normalizePrice(prediction.price)) priceMatched += 1;
    }
  }

  const misses = [...unmatchedGold].map((index) => gold[index]);
  const matchedNames = matchedPairs.length;
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
    misses: misses.map((row) => ({ nameCn: row.nameCn, price: row.price })),
    extras: extras.map((row) => ({ nameCn: row.nameCn, price: row.price })),
    matchedPairs,
  };
}

export function scoreWithinPageOrder(matchedPairs) {
  const comparablePairs = (matchedPairs.length * (matchedPairs.length - 1)) / 2;
  let inversions = 0;
  for (let left = 0; left < matchedPairs.length; left++) {
    for (let right = left + 1; right < matchedPairs.length; right++) {
      if (matchedPairs[left].goldIndex > matchedPairs[right].goldIndex) inversions += 1;
    }
  }
  return {
    comparable: comparablePairs > 0,
    matchedItems: matchedPairs.length,
    comparablePairs,
    inversions,
    orderOk: inversions === 0,
    kendallScore: comparablePairs === 0 ? null : 1 - (2 * inversions) / comparablePairs,
  };
}

export function scoreMultiPageOrder(predictions, goldRows, files) {
  const gold = [];
  files.forEach((file, pageIndex) => {
    const pageRows = goldRows
      .filter((row) => row.imageFile === file)
      .slice()
      .sort((left, right) => left.dishOrder - right.dishOrder);
    pageRows.forEach((row, withinPageIndex) => {
      gold.push({ ...row, pageIndex, withinPageIndex, globalIndex: gold.length });
    });
  });

  const goldByName = new Map();
  gold.forEach((row, goldIndex) => {
    const name = normalizeName(row.nameCn);
    if (!goldByName.has(name)) goldByName.set(name, []);
    goldByName.get(name).push(goldIndex);
  });
  const predictionsByName = new Map();
  predictions.forEach((prediction, predIndex) => {
    const name = normalizeName(prediction.nameCn);
    if (!predictionsByName.has(name)) predictionsByName.set(name, []);
    predictionsByName.get(name).push(predIndex);
  });

  const matchesByPrediction = new Map();
  const matchedGold = new Set();
  for (const [name, predIndexes] of predictionsByName) {
    const goldIndexes = goldByName.get(name) ?? [];
    if (predIndexes.length === 1 && goldIndexes.length === 1) {
      matchesByPrediction.set(predIndexes[0], goldIndexes[0]);
      matchedGold.add(goldIndexes[0]);
    }
  }

  const anchors = [...matchesByPrediction.entries()]
    .map(([predIndex, goldIndex]) => ({ predIndex, pageIndex: gold[goldIndex].pageIndex }))
    .sort((left, right) => left.predIndex - right.predIndex);
  const inferredRange = (predIndex) => {
    let previousPage = 0;
    let nextPage = files.length - 1;
    for (const anchor of anchors) {
      if (anchor.predIndex < predIndex) previousPage = anchor.pageIndex;
      if (anchor.predIndex > predIndex) {
        nextPage = anchor.pageIndex;
        break;
      }
    }
    return {
      min: Math.min(previousPage, nextPage),
      max: Math.max(previousPage, nextPage),
      center: (previousPage + nextPage) / 2,
    };
  };

  const assignmentPenalty = (predIndex, goldIndex) => {
    const range = inferredRange(predIndex);
    const targetPage = gold[goldIndex].pageIndex;
    if (targetPage >= range.min && targetPage <= range.max) {
      return Math.abs(targetPage - range.center);
    }
    return 1000 + Math.min(Math.abs(targetPage - range.min), Math.abs(targetPage - range.max));
  };

  const chooseBetterAssignment = (left, right) => {
    if (left.pairs.length !== right.pairs.length) {
      return left.pairs.length > right.pairs.length ? left : right;
    }
    if (left.penalty !== right.penalty) return left.penalty < right.penalty ? left : right;
    const leftKey = left.pairs.flat().join(":");
    const rightKey = right.pairs.flat().join(":");
    return leftKey <= rightKey ? left : right;
  };

  const assignRepeatedName = (predIndexes, goldIndexes) => {
    const memo = new Map();
    const solve = (predOffset, goldOffset) => {
      const key = `${predOffset}:${goldOffset}`;
      if (memo.has(key)) return memo.get(key);
      if (predOffset === predIndexes.length || goldOffset === goldIndexes.length) {
        const empty = { pairs: [], penalty: 0 };
        memo.set(key, empty);
        return empty;
      }

      const predIndex = predIndexes[predOffset];
      const goldIndex = goldIndexes[goldOffset];
      const tail = solve(predOffset + 1, goldOffset + 1);
      let best = {
        pairs: [[predIndex, goldIndex], ...tail.pairs],
        penalty: assignmentPenalty(predIndex, goldIndex) + tail.penalty,
      };
      best = chooseBetterAssignment(best, solve(predOffset + 1, goldOffset));
      best = chooseBetterAssignment(best, solve(predOffset, goldOffset + 1));
      memo.set(key, best);
      return best;
    };
    return solve(0, 0).pairs;
  };

  for (const [name, predIndexes] of predictionsByName) {
    const remainingPredictions = predIndexes.filter((index) => !matchesByPrediction.has(index));
    const remainingGold = (goldByName.get(name) ?? []).filter((index) => !matchedGold.has(index));
    for (const [predIndex, goldIndex] of assignRepeatedName(remainingPredictions, remainingGold)) {
      matchesByPrediction.set(predIndex, goldIndex);
      matchedGold.add(goldIndex);
    }
  }

  const matches = [...matchesByPrediction.entries()]
    .sort(([left], [right]) => left - right)
    .map(([predIndex, goldIndex]) => ({ predIndex, ...gold[goldIndex] }));

  let crossPageBoundaryViolations = 0;
  const crossPageBoundaryDetails = [];
  for (let index = 1; index < matches.length; index++) {
    if (matches[index].pageIndex < matches[index - 1].pageIndex) {
      crossPageBoundaryViolations += 1;
      crossPageBoundaryDetails.push({
        predictionIndex: matches[index].predIndex,
        previousFile: files[matches[index - 1].pageIndex],
        currentFile: files[matches[index].pageIndex],
        previousNameCn: matches[index - 1].nameCn,
        currentNameCn: matches[index].nameCn,
      });
    }
  }

  let withinPageInversions = 0;
  let withinPageComparablePairs = 0;
  for (let pageIndex = 0; pageIndex < files.length; pageIndex++) {
    const pageMatches = matches.filter((match) => match.pageIndex === pageIndex);
    withinPageComparablePairs += (pageMatches.length * (pageMatches.length - 1)) / 2;
    for (let left = 0; left < pageMatches.length; left++) {
      for (let right = left + 1; right < pageMatches.length; right++) {
        if (pageMatches[left].withinPageIndex > pageMatches[right].withinPageIndex) {
          withinPageInversions += 1;
        }
      }
    }
  }

  let combinedInversions = 0;
  for (let left = 0; left < matches.length; left++) {
    for (let right = left + 1; right < matches.length; right++) {
      if (matches[left].globalIndex > matches[right].globalIndex) combinedInversions += 1;
    }
  }

  return {
    matchedItems: matches.length,
    inferredFromGoldMatches: true,
    matchingStrategy: "unique-gold-anchors-then-page-range-disambiguation",
    crossPageBoundaryViolations,
    crossPageBoundaryDetails,
    crossPageOrderOk: crossPageBoundaryViolations === 0,
    withinPageInversions,
    withinPageComparablePairs,
    withinPageKendallScore:
      withinPageComparablePairs === 0
        ? null
        : 1 - (2 * withinPageInversions) / withinPageComparablePairs,
    combinedInversions,
  };
}

export function createNdjsonStateMachine() {
  let state = "OPEN";
  let lineNumber = 0;
  let terminal = null;
  let doneTotal = null;
  let errorCode = null;
  const dishes = [];
  const issues = [];
  let invalidJsonLines = 0;
  let unknownEvents = 0;

  return {
    consume(rawLine) {
      const line = String(rawLine).trim();
      if (!line) return { dishAccepted: false };
      lineNumber += 1;
      if (state !== "OPEN") {
        issues.push(`event_after_terminal:${lineNumber}`);
        return { dishAccepted: false };
      }

      let event;
      try {
        event = JSON.parse(line);
      } catch {
        invalidJsonLines += 1;
        issues.push(`invalid_json_line:${lineNumber}`);
        return { dishAccepted: false };
      }
      if (!isPlainObject(event) || typeof event.type !== "string") {
        unknownEvents += 1;
        issues.push(`unknown_event:${lineNumber}`);
        return { dishAccepted: false };
      }

      if (event.type === "dish") {
        if (!hasExactKeys(event, ["data", "type"])) {
          issues.push(`invalid_dish_event_shape:${lineNumber}`);
          return { dishAccepted: false };
        }
        const dishIssue = validateDishData(event.data, dishes.length + 1);
        if (dishIssue) {
          issues.push(`${dishIssue}:${lineNumber}`);
          return { dishAccepted: false };
        }
        dishes.push(event.data);
        return { dishAccepted: true };
      }

      if (event.type === "done") {
        if (!hasExactKeys(event, ["total", "type"]) || !Number.isInteger(event.total) || event.total < 0) {
          issues.push(`invalid_done_event:${lineNumber}`);
        } else if (event.total !== dishes.length) {
          issues.push(`done_total_mismatch:${event.total}!=${dishes.length}`);
        }
        state = "TERMINAL_DONE";
        terminal = "done";
        doneTotal = Number.isInteger(event.total) ? event.total : null;
        return { dishAccepted: false };
      }

      if (event.type === "error") {
        if (!hasExactKeys(event, ["code", "type"]) || !ERROR_CODES.has(event.code)) {
          issues.push(`invalid_error_event:${lineNumber}`);
        }
        if (dishes.length > 0) issues.push(`error_with_dishes:${lineNumber}`);
        state = "TERMINAL_ERROR";
        terminal = "error";
        errorCode = typeof event.code === "string" ? event.code : null;
        return { dishAccepted: false };
      }

      unknownEvents += 1;
      issues.push(`unknown_event_type:${event.type}:${lineNumber}`);
      return { dishAccepted: false };
    },

    finish() {
      if (state === "OPEN") issues.push("missing_terminal");
      return {
        valid: issues.length === 0,
        state,
        terminal,
        doneTotal,
        errorCode,
        dishes: dishes.slice(),
        issues: issues.slice(),
        invalidJsonLines,
        unknownEvents,
        nonEmptyLineCount: lineNumber,
      };
    },
  };
}

function roundMs(value) {
  return +Math.max(0, value).toFixed(1);
}

export function validateTiming({ headerMs, firstDishMs, totalMs }) {
  const issues = [];
  if (!Number.isFinite(headerMs) || !Number.isFinite(totalMs) || headerMs < 0 || totalMs < headerMs) {
    issues.push("invalid_header_total_order");
  }
  if (
    firstDishMs !== null &&
    (!Number.isFinite(firstDishMs) || firstDishMs < headerMs || firstDishMs > totalMs)
  ) {
    issues.push("invalid_first_dish_order");
  }
  return { valid: issues.length === 0, issues };
}

export async function consumeNdjsonBody(body, { requestStart, headerAt, now = () => performance.now() }) {
  const machine = createNdjsonStateMachine();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstDishAt = null;

  const consumeDecoded = (decoded) => {
    buffer += decoded;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const result = machine.consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      if (result.dishAccepted && firstDishAt === null) firstDishAt = now();
    }
  };

  if (body) {
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      consumeDecoded(decoder.decode(value, { stream: true }));
    }
    consumeDecoded(decoder.decode());
  }
  if (buffer.trim()) {
    const result = machine.consume(buffer);
    if (result.dishAccepted && firstDishAt === null) firstDishAt = now();
  }

  const totalAt = now();
  const timing = {
    headerMs: roundMs(headerAt - requestStart),
    firstDishMs: firstDishAt === null ? null : roundMs(firstDishAt - requestStart),
    totalMs: roundMs(totalAt - requestStart),
  };
  const timingValidation = validateTiming(timing);
  return {
    protocol: machine.finish(),
    timing,
    timingValid: timingValidation.valid,
    timingIssues: timingValidation.issues,
  };
}

export async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const active = Math.max(1, Math.min(concurrency, items.length || 1));
  async function loop() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: active }, () => loop()));
  return results;
}

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error("invalid_percentile");
  const sorted = values.slice().sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sanitizeBaseUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function resolveOutputPaths(outputPath) {
  const base = String(outputPath).replace(/\.(?:json|md)$/i, "");
  return { jsonPath: `${base}.json`, markdownPath: `${base}.md` };
}

export function buildRunMarkdown(results) {
  const aggregate = results.aggregate;
  const percent = (value) => `${(value * 100).toFixed(2)}%`;
  const ms = (value) => (value === null ? "-" : `${Number(value).toFixed(1)} ms`);
  let output = "# Vision-Gemini Production Benchmark\n\n";
  output += `- Schema: ${results.meta.schemaVersion}\n`;
  output += `- Harness: ${results.meta.harnessVersion}\n`;
  output += `- Run: ${results.meta.runLabel}\n`;
  output += `- Started: ${results.meta.startedAt}\n`;
  output += `- Model: ${results.meta.model.name}\n`;
  output += `- Git: ${results.meta.git.commit} (${results.meta.git.branch}, dirty=${results.meta.git.dirty})\n`;
  output += `- Dataset: ${results.meta.dataset.id}\n\n`;
  output += "## Strict validity\n\n";
  output += `- Images completed: ${aggregate.imagesCompleted}/${aggregate.totalImages}\n`;
  output += `- Invalid JSON lines: ${aggregate.invalidJsonLines}\n`;
  output += `- Unknown events: ${aggregate.unknownEvents}\n`;
  output += `- Protocol-invalid runs: ${aggregate.protocolInvalidRuns}\n`;
  output += `- Timing-invalid runs: ${aggregate.timingInvalidRuns}\n`;
  output += `- Cross-page boundary violations: ${aggregate.crossPageBoundaryViolations}\n\n`;
  output += "## Quality and latency\n\n";
  output += `| Metric | Value |\n|---|---:|\n`;
  output += `| Name recall | ${percent(aggregate.nameRecall)} |\n`;
  output += `| Name precision | ${percent(aggregate.namePrecision)} |\n`;
  output += `| Exact price | ${percent(aggregate.priceExact)} (${aggregate.priceMatched}/${aggregate.priceCompared}) |\n`;
  output += `| Hallucinations | ${aggregate.hallucinationCount} |\n`;
  output += `| Total latency P50 / P95 | ${ms(aggregate.totalLatencyP50)} / ${ms(aggregate.totalLatencyP95)} |\n`;
  output += `| First dish P50 / P95 | ${ms(aggregate.firstDishP50)} / ${ms(aggregate.firstDishP95)} |\n`;
  output += `| Within-page inversions / comparable pairs | ${aggregate.withinPageInversions}/${aggregate.withinPageComparablePairs} |\n`;
  output += "\nCross-page identity is inferred only from one-to-one matches against gold rows; unmatched predictions are never assigned a page.\n";
  return output;
}

function summarize(values) {
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    p50: percentile(values, 0.5),
  };
}

/**
 * @param {any[]} runs
 * @param {any} legacyBaseline
 */
export function aggregateBenchmarkRuns(runs, legacyBaseline = null) {
  if (!Array.isArray(runs) || runs.length < 3) throw new Error("at_least_three_runs_required");
  const first = runs[0];
  for (const run of runs) {
    if (run?.meta?.schemaVersion !== BENCHMARK_SCHEMA_VERSION) throw new Error("incompatible_schema_version");
    if (run?.meta?.harnessVersion !== HARNESS_VERSION) throw new Error("incompatible_harness_version");
    if (run.meta.harness?.cliSha256 !== first.meta.harness?.cliSha256) throw new Error("mixed_cli_hashes");
    if (run.meta.harness?.coreSha256 !== first.meta.harness?.coreSha256) throw new Error("mixed_core_hashes");
    if (run.meta.dataset?.goldCsvSha256 !== first.meta.dataset?.goldCsvSha256) throw new Error("mixed_gold_dataset");
    const firstImages = JSON.stringify(first.meta.dataset?.images?.map((image) => [image.file, image.sha256]));
    const runImages = JSON.stringify(run.meta.dataset?.images?.map((image) => [image.file, image.sha256]));
    if (runImages !== firstImages) throw new Error("mixed_image_dataset");
    if (run.meta.model?.name !== first.meta.model?.name) throw new Error("mixed_models");
    if (JSON.stringify(run.meta.model?.generationConfig) !== JSON.stringify(first.meta.model?.generationConfig)) {
      throw new Error("mixed_generation_config");
    }
    if (run.meta.mock !== false) throw new Error("mock_run_not_allowed");
  }

  const perRun = runs.map((run) => {
    const aggregate = run.aggregate;
    const hardGates = {
      exactDatasetSize: aggregate.totalImages === 14,
      allImagesCompleted: aggregate.imagesCompleted === 14 && aggregate.totalImages === 14,
      allMultiPageCompleted: aggregate.multiPageCompleted === aggregate.multiPageTotal,
      invalidJsonLinesZero: aggregate.invalidJsonLines === 0,
      unknownEventsZero: aggregate.unknownEvents === 0,
      protocolInvalidRunsZero: aggregate.protocolInvalidRuns === 0,
      timingInvalidRunsZero: aggregate.timingInvalidRuns === 0,
      crossPageBoundaryViolationsZero: aggregate.crossPageBoundaryViolations === 0,
    };
    return {
      runLabel: run.meta.runLabel,
      hardGates,
      hardGatesPassed: Object.values(hardGates).every(Boolean),
      metrics: {
        nameRecall: aggregate.nameRecall,
        namePrecision: aggregate.namePrecision,
        priceExact: aggregate.priceExact,
        hallucinationCount: aggregate.hallucinationCount,
        hallucinationRate: aggregate.hallucinationRate,
        withinPageInversions: aggregate.withinPageInversions,
        totalLatencyP50: aggregate.totalLatencyP50,
        totalLatencyP95: aggregate.totalLatencyP95,
        firstDishP50: aggregate.firstDishP50,
        firstDishP95: aggregate.firstDishP95,
      },
    };
  });
  const failedRun = perRun.find((run) => !run.hardGatesPassed);
  if (failedRun) throw new Error(`run_failed_hard_gates:${failedRun.runLabel}`);

  const metric = (name) => summarize(perRun.map((run) => run.metrics[name]));
  const quality = {
    nameRecall: metric("nameRecall"),
    namePrecision: metric("namePrecision"),
    priceExact: metric("priceExact"),
    hallucinationCount: metric("hallucinationCount"),
    hallucinationRate: metric("hallucinationRate"),
    withinPageInversions: metric("withinPageInversions"),
    totalLatencyP50: metric("totalLatencyP50"),
    totalLatencyP95: metric("totalLatencyP95"),
    firstDishP50: metric("firstDishP50"),
    firstDishP95: metric("firstDishP95"),
  };
  const baselineAggregate = legacyBaseline?.aggregate ?? null;
  const deltaVsLegacySingleRun = baselineAggregate
    ? {
        baselineClassification: "legacy_single_run_not_reproducible_with_v2_harness",
        nameRecallPp: (quality.nameRecall.mean - baselineAggregate.nameRecall) * 100,
        namePrecisionPp: (quality.namePrecision.mean - baselineAggregate.namePrecision) * 100,
        priceExactPp: (quality.priceExact.mean - baselineAggregate.priceExact) * 100,
        hallucinationCountDelta: quality.hallucinationCount.mean - baselineAggregate.hallucinationCount,
      }
    : null;

  return {
    schemaVersion: "vision-gemini-benchmark-aggregate.v1",
    generatedAt: new Date().toISOString(),
    compatibleRunCount: runs.length,
    harness: first.meta.harness,
    model: first.meta.model,
    dataset: first.meta.dataset,
    perRun,
    allHardGatesPassed: perRun.every((run) => run.hardGatesPassed),
    quality,
    deltaVsLegacySingleRun,
    productQualityThresholds: "not_preapproved_report_only",
  };
}

export function buildReadinessMarkdown(aggregate) {
  const percent = (value) => `${(value * 100).toFixed(2)}%`;
  const range = (summary, formatter = (value) => value.toFixed(2)) =>
    `${formatter(summary.mean)} mean; ${formatter(summary.min)}–${formatter(summary.max)} range; ${formatter(summary.p50)} P50`;
  let output = "# Vision-Gemini Production Readiness\n\n";
  output += `**Engineering hard-gate status: ${aggregate.allHardGatesPassed ? "PASS" : "FAIL"}**\n\n`;
  output += `This conclusion uses ${aggregate.compatibleRunCount} complete runs with one schema, harness hash, model configuration, and dataset hash. Product quality thresholds were not preapproved, so recall, precision, price accuracy, and hallucinations are reported rather than silently converted into a launch decision.\n\n`;
  output += "## Hard gates by run\n\n";
  output += "| Run | 14/14 | Multi-page complete | Protocol | Timing | Cross-page boundary | Result |\n";
  output += "|---|---:|---:|---:|---:|---:|---:|\n";
  for (const run of aggregate.perRun) {
    const gate = run.hardGates;
    output += `| ${run.runLabel} | ${gate.allImagesCompleted ? "PASS" : "FAIL"} | ${gate.allMultiPageCompleted ? "PASS" : "FAIL"} | ${gate.invalidJsonLinesZero && gate.unknownEventsZero && gate.protocolInvalidRunsZero ? "PASS" : "FAIL"} | ${gate.timingInvalidRunsZero ? "PASS" : "FAIL"} | ${gate.crossPageBoundaryViolationsZero ? "PASS" : "FAIL"} | ${run.hardGatesPassed ? "PASS" : "FAIL"} |\n`;
  }
  output += "\n## Quality and latency across runs\n\n";
  output += `- Name recall: ${range(aggregate.quality.nameRecall, percent)}\n`;
  output += `- Name precision: ${range(aggregate.quality.namePrecision, percent)}\n`;
  output += `- Exact price: ${range(aggregate.quality.priceExact, percent)}\n`;
  output += `- Hallucinations: ${range(aggregate.quality.hallucinationCount)}\n`;
  output += `- Within-page inversions: ${range(aggregate.quality.withinPageInversions)}\n`;
  output += `- Total latency P50: ${range(aggregate.quality.totalLatencyP50, (value) => `${value.toFixed(1)} ms`)}\n`;
  output += `- Total latency P95: ${range(aggregate.quality.totalLatencyP95, (value) => `${value.toFixed(1)} ms`)}\n`;
  output += `- First-dish latency P50: ${range(aggregate.quality.firstDishP50, (value) => `${value.toFixed(1)} ms`)}\n`;
  output += `- First-dish latency P95: ${range(aggregate.quality.firstDishP95, (value) => `${value.toFixed(1)} ms`)}\n`;
  if (aggregate.deltaVsLegacySingleRun) {
    const delta = aggregate.deltaVsLegacySingleRun;
    output += "\n## Legacy baseline limitation\n\n";
    output += "The old image-Gemini comparison is one legacy run produced by a different, non-strict harness. It is directional only and is not treated as three-run evidence. Deltas are new minus legacy: ";
    output += `recall ${delta.nameRecallPp.toFixed(2)} pp, precision ${delta.namePrecisionPp.toFixed(2)} pp, price ${delta.priceExactPp.toFixed(2)} pp, hallucination count ${delta.hallucinationCountDelta.toFixed(2)} dishes (higher is worse).\n`;
  }
  output += "\nCross-page identity is inferred from gold matches because public contract v1 intentionally exposes no page metadata. Unmatched predictions are excluded from page identity inference.\n";
  return output;
}
