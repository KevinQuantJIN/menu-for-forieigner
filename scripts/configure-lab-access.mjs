import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const envPath = resolve(process.cwd(), ".env.local");
let source = "";
try {
  source = readFileSync(envPath, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const existing = source.match(/^LAB_ACCESS_TOKEN=(.+)$/m)?.[1].trim();
const token = existing || randomBytes(32).toString("base64url");
const result = spawnSync(
  "npx",
  ["wrangler", "secret", "put", "LAB_ACCESS_TOKEN"],
  { cwd: process.cwd(), input: `${token}\n`, stdio: ["pipe", "inherit", "inherit"] },
);
if (result.status !== 0) process.exit(result.status ?? 1);

if (!existing) {
  const next = /^LAB_ACCESS_TOKEN=.*$/m.test(source)
    ? source.replace(/^LAB_ACCESS_TOKEN=.*$/m, `LAB_ACCESS_TOKEN=${token}`)
    : `LAB_ACCESS_TOKEN=${token}\n${source}`;
  writeFileSync(envPath, next);
}
console.log("LAB_ACCESS_TOKEN is configured locally and on Cloudflare.");
