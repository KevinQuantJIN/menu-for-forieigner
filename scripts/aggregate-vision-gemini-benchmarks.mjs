#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  aggregateBenchmarkRuns,
  buildReadinessMarkdown,
  resolveOutputPaths,
} from "./lib/vision-gemini-benchmark-core.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function main() {
  const paths = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : String(process.env.RUN_PATHS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (paths.length < 3) throw new Error("provide_at_least_three_run_paths");

  const runs = paths.map(readJson);
  const baseline = process.env.BASELINE_PATH ? readJson(process.env.BASELINE_PATH) : null;
  const aggregate = aggregateBenchmarkRuns(runs, baseline);
  const outputPaths = resolveOutputPaths(
    process.env.OUTPUT_PATH || "docs/vision-gemini-production-benchmark-final.json",
  );
  const readinessPath = resolve(
    process.env.READINESS_PATH || "docs/vision-gemini-production-readiness.md",
  );

  writeFileSync(outputPaths.jsonPath, JSON.stringify(aggregate, null, 2));
  writeFileSync(outputPaths.markdownPath, buildReadinessMarkdown(aggregate));
  if (readinessPath !== outputPaths.markdownPath) {
    writeFileSync(readinessPath, buildReadinessMarkdown(aggregate));
  }
  process.stderr.write(`Aggregate written to ${outputPaths.jsonPath}\n`);
  process.stderr.write(`Readiness written to ${readinessPath}\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown_error";
  process.stderr.write(`FATAL: ${message}\n`);
  process.exitCode = 1;
}
