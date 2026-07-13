#!/usr/bin/env node
import {
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BENCHMARK_SCHEMA_VERSION,
  HARNESS_VERSION,
  PUBLIC_CONTRACT_VERSION,
  buildRunMarkdown,
  consumeNdjsonBody,
  mapPool,
  parseGoldCsv,
  percentile,
  resolveOutputPaths,
  sanitizeBaseUrl,
  scoreMultiPageOrder,
  scorePage,
  scoreWithinPageOrder,
  sha256Hex,
  validateTiming,
} from "./lib/vision-gemini-benchmark-core.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const CORE_PATH = resolve(dirname(SCRIPT_PATH), "lib/vision-gemini-benchmark-core.mjs");
const SECRET_ENV_NAMES = [
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_VISION_PRIVATE_KEY",
  "GOOGLE_VISION_CLIENT_EMAIL",
  "LAB_ACCESS_TOKEN",
];

function log(message) {
  process.stderr.write(`${new Date().toISOString().slice(11, 23)} ${message}\n`);
}

function git(args, fallback = "unknown") {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function imageMime(filePath) {
  const extension = extname(filePath).toLowerCase();
  const types = new Map([
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".png", "image/png"],
    [".webp", "image/webp"],
  ]);
  const mime = types.get(extension);
  if (!mime) throw new Error(`unsupported_image_type:${basename(filePath)}`);
  return mime;
}

function imageToDataUrl(filePath) {
  return `data:${imageMime(filePath)};base64,${readFileSync(filePath).toString("base64")}`;
}

function emptyProtocol(issue) {
  return {
    valid: false,
    state: "OPEN",
    terminal: null,
    doneTotal: null,
    errorCode: null,
    dishes: [],
    issues: [issue],
    invalidJsonLines: 0,
    unknownEvents: 0,
    nonEmptyLineCount: 0,
  };
}

async function analyzeMenu(baseUrl, images) {
  const requestStart = performance.now();
  let response;
  try {
    response = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
    });
  } catch {
    const totalAt = performance.now();
    const timing = {
      headerMs: +(totalAt - requestStart).toFixed(1),
      firstDishMs: null,
      totalMs: +(totalAt - requestStart).toFixed(1),
    };
    return {
      status: 0,
      networkError: true,
      protocol: emptyProtocol("network_error"),
      timing,
      timingValid: validateTiming(timing).valid,
      timingIssues: validateTiming(timing).issues,
    };
  }

  const headerAt = performance.now();
  if (response.status !== 200) {
    const totalAt = performance.now();
    const timing = {
      headerMs: +(headerAt - requestStart).toFixed(1),
      firstDishMs: null,
      totalMs: +(totalAt - requestStart).toFixed(1),
    };
    const validation = validateTiming(timing);
    return {
      status: response.status,
      networkError: false,
      protocol: emptyProtocol(`http_status:${response.status}`),
      timing,
      timingValid: validation.valid,
      timingIssues: validation.issues,
    };
  }

  const parsed = await consumeNdjsonBody(response.body, {
    requestStart,
    headerAt,
    now: () => performance.now(),
  });
  return {
    status: response.status,
    networkError: false,
    ...parsed,
  };
}

function publicDishProjection(dish) {
  return {
    id: dish.id,
    nameCn: dish.nameCn,
    name: dish.name,
    pinyin: dish.pinyin,
    category: dish.category,
    price: dish.price,
    spicy: dish.spicy,
  };
}

function strictCompleted(run) {
  return (
    run.status === 200 &&
    !run.networkError &&
    run.protocol.valid &&
    run.protocol.terminal === "done" &&
    run.timingValid
  );
}

function buildAggregate(results) {
  let predictionCount = 0;
  let matchedNames = 0;
  let missedCount = 0;
  let hallucinationCount = 0;
  let priceCompared = 0;
  let priceMatched = 0;
  let invalidJsonLines = 0;
  let unknownEvents = 0;
  let protocolInvalidRuns = 0;
  let timingInvalidRuns = 0;
  let withinPageInversions = 0;
  let withinPageComparablePairs = 0;
  const publicErrors = { not_a_menu: 0, unreadable: 0, upstream_error: 0 };
  const totalLatencies = [];
  const firstDishLatencies = [];
  let zeroOutputRuns = 0;

  for (const run of results.singlePage) {
    predictionCount += run.scores.predictionCount;
    matchedNames += run.scores.matchedNames;
    missedCount += run.scores.missedCount;
    hallucinationCount += run.scores.hallucinationCount;
    priceCompared += run.scores.priceCompared;
    priceMatched += run.scores.priceMatched;
    invalidJsonLines += run.protocol.invalidJsonLines;
    unknownEvents += run.protocol.unknownEvents;
    if (!run.protocol.valid) protocolInvalidRuns += 1;
    if (!run.timingValid) timingInvalidRuns += 1;
    if (run.protocol.errorCode in publicErrors) publicErrors[run.protocol.errorCode] += 1;
    if (run.protocol.dishes.length === 0) zeroOutputRuns += 1;
    withinPageInversions += run.order.inversions;
    withinPageComparablePairs += run.order.comparablePairs;
    if (run.completed) {
      totalLatencies.push(run.timing.totalMs);
      if (run.timing.firstDishMs !== null) firstDishLatencies.push(run.timing.firstDishMs);
    }
  }

  let crossPageBoundaryViolations = 0;
  let multiWithinPageInversions = 0;
  let multiWithinPageComparablePairs = 0;
  const multiTotalLatencies = [];
  const multiFirstDishLatencies = [];
  for (const run of results.multiPage) {
    invalidJsonLines += run.protocol.invalidJsonLines;
    unknownEvents += run.protocol.unknownEvents;
    if (!run.protocol.valid) protocolInvalidRuns += 1;
    if (!run.timingValid) timingInvalidRuns += 1;
    crossPageBoundaryViolations += run.order.crossPageBoundaryViolations;
    multiWithinPageInversions += run.order.withinPageInversions;
    multiWithinPageComparablePairs += run.order.withinPageComparablePairs;
    if (run.completed) {
      multiTotalLatencies.push(run.timing.totalMs);
      if (run.timing.firstDishMs !== null) multiFirstDishLatencies.push(run.timing.firstDishMs);
    }
  }

  return {
    goldCount: results.meta.dataset.goldRowCount,
    predictionCount,
    matchedNames,
    missedCount,
    hallucinationCount,
    hallucinationRate: predictionCount === 0 ? 0 : hallucinationCount / predictionCount,
    nameRecall: results.meta.dataset.goldRowCount === 0 ? 0 : matchedNames / results.meta.dataset.goldRowCount,
    namePrecision: predictionCount === 0 ? 0 : matchedNames / predictionCount,
    priceCompared,
    priceMatched,
    priceExact: priceCompared === 0 ? 0 : priceMatched / priceCompared,
    imagesCompleted: results.singlePage.filter((run) => run.completed).length,
    totalImages: results.singlePage.length,
    multiPageCompleted: results.multiPage.filter((run) => run.completed).length,
    multiPageTotal: results.multiPage.length,
    invalidJsonLines,
    unknownEvents,
    protocolInvalidRuns,
    timingInvalidRuns,
    zeroOutputRuns,
    publicErrors,
    crossPageBoundaryViolations,
    crossPageOrderOk: crossPageBoundaryViolations === 0,
    withinPageInversions,
    withinPageComparablePairs,
    withinPageKendallScore:
      withinPageComparablePairs === 0 ? null : 1 - (2 * withinPageInversions) / withinPageComparablePairs,
    multiWithinPageInversions,
    multiWithinPageComparablePairs,
    totalLatencyP50: percentile(totalLatencies, 0.5),
    totalLatencyP95: percentile(totalLatencies, 0.95),
    firstDishP50: percentile(firstDishLatencies, 0.5),
    firstDishP95: percentile(firstDishLatencies, 0.95),
    multiTotalLatencyP50: percentile(multiTotalLatencies, 0.5),
    multiTotalLatencyP95: percentile(multiTotalLatencies, 0.95),
    multiFirstDishP50: percentile(multiFirstDishLatencies, 0.5),
    multiFirstDishP95: percentile(multiFirstDishLatencies, 0.95),
    tokenAndCost: "not_available_through_public_contract_v1",
  };
}

function ensureNoSecrets(serialized) {
  if (/BEGIN PRIVATE KEY|Bearer\s+[A-Za-z0-9._-]+|AIza[0-9A-Za-z_-]{20,}/.test(serialized)) {
    throw new Error("secret_like_value_in_benchmark_output");
  }
  for (const name of SECRET_ENV_NAMES) {
    const value = process.env[name];
    if (value && value.length >= 8 && serialized.includes(value)) {
      throw new Error(`secret_env_value_in_benchmark_output:${name}`);
    }
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const rawBaseUrl = process.env.ANALYZE_BASE_URL || "http://localhost:3000";
  const baseUrl = sanitizeBaseUrl(rawBaseUrl);
  if (baseUrl !== rawBaseUrl.replace(/\/$/, "")) {
    throw new Error("ANALYZE_BASE_URL_must_not_contain_credentials_query_or_fragment");
  }
  const datasetDir = realpathSync(process.env.DATASET_DIR || "/Users/kevin/Downloads/chopstory-test-data");
  const outputPath = process.env.OUTPUT_PATH || null;
  const concurrency = Math.min(2, Math.max(1, Number(process.env.BENCH_CONCURRENCY) || 1));
  const runLabel = process.env.BENCH_RUN_LABEL || "adhoc";
  const modelName = process.env.BENCH_MODEL || process.env.MENULENS_MODEL || "gemini-2.5-flash";
  const modelSource = process.env.BENCH_MODEL ? "BENCH_MODEL" : process.env.MENULENS_MODEL ? "MENULENS_MODEL" : "route_default";
  const mock = process.env.BENCH_SERVER_MOCK === "1";
  if (mock) throw new Error("paid_acceptance_benchmark_cannot_run_with_mock");

  const imagesDir = resolve(datasetDir, "images");
  const csvPath = resolve(datasetDir, "dishes.csv");
  const csvBytes = readFileSync(csvPath);
  const goldRows = parseGoldCsv(csvBytes.toString("utf8"));
  const imageFiles = readdirSync(imagesDir)
    .filter((file) => /\.(?:jpe?g|png|webp)$/i.test(file))
    .sort();
  const imageMetadata = imageFiles.map((file) => {
    const bytes = readFileSync(resolve(imagesDir, file));
    return { file, sha256: sha256Hex(bytes), bytes: bytes.length };
  });
  const menuGroups = new Map();
  for (const row of goldRows) {
    if (!menuGroups.has(row.menuId)) menuGroups.set(row.menuId, new Set());
    menuGroups.get(row.menuId).add(row.imageFile);
  }
  const sortedMenuGroups = [...menuGroups.entries()].map(([menuId, files]) => [menuId, [...files].sort()]);

  log(`Run ${runLabel}: ${imageFiles.length} images, ${goldRows.length} gold rows, concurrency ${concurrency}`);
  const imageDataUrls = Object.fromEntries(
    imageFiles.map((file) => [file, imageToDataUrl(resolve(imagesDir, file))]),
  );

  const results = {
    meta: {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      harnessVersion: HARNESS_VERSION,
      publicContractVersion: PUBLIC_CONTRACT_VERSION,
      runLabel,
      startedAt,
      finishedAt: null,
      baseUrl,
      concurrency,
      mock: false,
      mockVerification: process.env.BENCH_SERVER_MOCK === "0" ? "explicit_server_start_configuration" : "operator_asserted_default_off",
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      git: {
        commit: git(["rev-parse", "HEAD"]),
        branch: git(["branch", "--show-current"]),
        dirty: git(["status", "--porcelain"], "") !== "",
      },
      harness: {
        cliSha256: sha256Hex(readFileSync(SCRIPT_PATH)),
        coreSha256: sha256Hex(readFileSync(CORE_PATH)),
      },
      model: {
        name: modelName,
        source: modelSource,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 32768,
          thinkingBudget: 0,
          responseMimeType: "application/json",
          responseSchemaVersion: "ocr-dish-envelope.v1",
        },
      },
      dataset: {
        id: basename(datasetDir),
        path: datasetDir,
        goldCsvSha256: sha256Hex(csvBytes),
        goldRowCount: goldRows.length,
        imageCount: imageFiles.length,
        menuCount: menuGroups.size,
        images: imageMetadata,
      },
    },
    singlePage: [],
    multiPage: [],
    aggregate: null,
  };

  results.singlePage = await mapPool(imageFiles, concurrency, async (imageFile) => {
    const response = await analyzeMenu(baseUrl, [imageDataUrls[imageFile]]);
    const predictions = response.protocol.dishes;
    const scores = scorePage(predictions, goldRows, imageFile);
    const run = {
      imageFile,
      status: response.status,
      networkError: response.networkError,
      completed: false,
      protocol: response.protocol,
      timing: response.timing,
      timingValid: response.timingValid,
      timingIssues: response.timingIssues,
      scores: {
        ...scores,
        matchedPairs: undefined,
      },
      order: scoreWithinPageOrder(scores.matchedPairs),
      dishes: predictions.map(publicDishProjection),
    };
    delete run.scores.matchedPairs;
    run.completed = strictCompleted(run);
    log(
      `single ${imageFile}: completed=${run.completed} dishes=${predictions.length} terminal=${run.protocol.terminal ?? "invalid"} total=${run.timing.totalMs}ms`,
    );
    if (concurrency === 1) await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    return run;
  });

  for (const [menuId, files] of sortedMenuGroups) {
    if (files.length <= 1) continue;
    const response = await analyzeMenu(baseUrl, files.map((file) => imageDataUrls[file]));
    const run = {
      menuId,
      files,
      status: response.status,
      networkError: response.networkError,
      completed: false,
      protocol: response.protocol,
      timing: response.timing,
      timingValid: response.timingValid,
      timingIssues: response.timingIssues,
      order: scoreMultiPageOrder(response.protocol.dishes, goldRows, files),
      dishes: response.protocol.dishes.map(publicDishProjection),
    };
    run.completed = strictCompleted(run);
    results.multiPage.push(run);
    log(
      `multi ${menuId}: completed=${run.completed} pages=${files.length} crossPageViolations=${run.order.crossPageBoundaryViolations} total=${run.timing.totalMs}ms`,
    );
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  results.meta.finishedAt = new Date().toISOString();
  results.aggregate = buildAggregate(results);
  const serialized = JSON.stringify(results, null, 2);
  ensureNoSecrets(serialized);
  const markdown = buildRunMarkdown(results);
  ensureNoSecrets(markdown);

  if (outputPath) {
    const paths = resolveOutputPaths(outputPath);
    writeFileSync(paths.jsonPath, serialized);
    writeFileSync(paths.markdownPath, markdown);
    log(`Reports written to ${paths.jsonPath} and ${paths.markdownPath}`);
  } else {
    process.stdout.write(`${serialized}\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  process.stderr.write(`FATAL: ${message}\n`);
  process.exitCode = 1;
});
