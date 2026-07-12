# Chopstory Lab Multi-Model Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/lab` into a Lab-only, Cloudflare-aware benchmark for Gemini, Qwen, Doubao, and OpenAI across Full Dish and Extract Only modes without changing production analysis behavior.

**Architecture:** Each provider implements a single-page streaming adapter behind one Lab interface. A Lab runner executes pages with a concurrency cap of four, attaches page/order/timing metadata, and emits one provider-neutral NDJSON event stream. The existing static Lab UI selects provider/model/mode, loads optional `dishes.csv` gold data, runs bounded benchmark queues, and displays latency, quality, usage, and Cloudflare placement independently.

**Tech Stack:** Next.js 16.2 Route Handlers, TypeScript, Web Streams/SSE, Vitest 4, static HTML/vanilla JavaScript, OpenNext Cloudflare Workers.

## Global Constraints

- Modify only `public/lab.html`, `src/app/api/lab/`, `src/lib/lab/`, Lab tests, and Lab documentation.
- Do not change `src/app/api/analyze/route.ts`, `public/app.html`, the production Dish contract, or the production model default.
- Lab page concurrency is at most 4; benchmark configurations run sequentially by default.
- Thinking/reasoning is disabled for every benchmark configuration.
- API keys stay server-side and configuration endpoints expose only booleans.
- Preserve original image order and attach `page` and `ordinal` to every item.
- Keep raw provider responses out of console logs and persistent storage.
- Local and Cloudflare runs report separate network, provider, parse, first-item, page-done, and total timings.
- Extract Only target: single-page P50 <= 2.5 seconds complete; two-page P50 <= 3.5 seconds complete.
- Full Dish target: single-page P50 <= 7 seconds complete; two-page P50 <= 10 seconds complete.
- Current environment has Gemini credentials only. Qwen, OpenAI, and Doubao must still be fully testable with mocked fetch and appear as unconfigured until their server-side variables are added.

---

## File Structure

- Create `src/lib/lab/types.ts`: provider-neutral request, model, event, item, timing, and error types.
- Create `src/lib/lab/catalog.ts`: model catalog plus credential/config resolution without secret disclosure.
- Create `src/lib/lab/prompts.ts`: Full Dish and Extract Only prompts.
- Create `src/lib/lab/sse.ts`: reusable SSE parser.
- Create `src/lib/lab/providers/gemini.ts`: Lab-only Gemini adapter with thinking disabled.
- Create `src/lib/lab/providers/openai-compatible.ts`: Qwen/Doubao Chat Completions adapter.
- Create `src/lib/lab/providers/openai.ts`: OpenAI Chat Completions adapter with reasoning disabled.
- Create `src/lib/lab/providers/index.ts`: provider selection.
- Create `src/lib/lab/runner.ts`: page concurrency, line parsing, normalization, timing, and partial-result handling.
- Create `src/lib/lab/scoring.ts`: `dishes.csv` parsing and name/price/recall metrics.
- Rewrite `src/app/api/lab/route.ts`: provider-neutral GET/POST and Cloudflare metadata.
- Create `src/app/api/lab/score/route.ts`: deterministic scoring endpoint.
- Create `src/app/api/lab/route.test.ts` and `src/app/api/lab/score/route.test.ts`.
- Create provider/runner/scoring unit tests under `src/lib/lab/`.
- Modify `public/lab.html`: provider/model/mode controls, gold CSV, benchmark queue, metrics, export, deployment metadata.

### Task 1: Lab Domain Types, Catalog, Prompts, and Scoring

**Files:**
- Create: `src/lib/lab/types.ts`
- Create: `src/lib/lab/catalog.ts`
- Create: `src/lib/lab/prompts.ts`
- Create: `src/lib/lab/scoring.ts`
- Create: `src/lib/lab/scoring.test.ts`

**Interfaces:**
- Produces: `LabProviderId`, `LabMode`, `LabModelSpec`, `LabRequest`, `LabProviderEvent`, `LabStreamEvent`, `ObservedMenuItem`, `getLabCatalog()`, `getLabModel()`, `getLabPrompt()`, `parseGoldCsv()`, `scorePredictions()`.
- Consumes: production `Dish` only as a type/normalization target; no production behavior.

- [ ] **Step 1: Write failing scoring and catalog tests**

```ts
import { describe, expect, it } from "vitest";
import { getLabCatalog } from "./catalog";
import { parseGoldCsv, scorePredictions } from "./scoring";

describe("Lab catalog", () => {
  it("does not expose credentials and marks providers from environment", () => {
    process.env.GOOGLE_API_KEY = "secret";
    const catalog = getLabCatalog();
    expect(JSON.stringify(catalog)).not.toContain("secret");
    expect(catalog.providers.find((p) => p.id === "gemini")?.configured).toBe(true);
  });
});

describe("gold CSV", () => {
  it("parses the six-column friend collection format", () => {
    const rows = parseGoldCsv("menu_id,image_file,dish_order,name_cn,price,note\nM001,M001_P01.jpg,1,糖醋里脊,¥69,\n");
    expect(rows).toEqual([{ menuId: "M001", imageFile: "M001_P01.jpg", dishOrder: 1, nameCn: "糖醋里脊", price: "¥69", note: "" }]);
  });

  it("scores recall, hallucinations, and exact prices", () => {
    const score = scorePredictions(
      [{ page: 1, ordinal: 1, nameCn: "糖醋里脊", price: "69元" }, { page: 1, ordinal: 2, nameCn: "幻觉菜", price: "1" }],
      [{ menuId: "M001", imageFile: "M001_P01.jpg", dishOrder: 1, nameCn: "糖醋里脊", price: "¥69", note: "" }],
      ["M001_P01.jpg"],
    );
    expect(score.nameRecall).toBe(1);
    expect(score.hallucinationCount).toBe(1);
    expect(score.priceExact).toBe(0);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- src/lib/lab/scoring.test.ts`  
Expected: FAIL because `catalog.ts` and `scoring.ts` do not exist.

- [ ] **Step 3: Implement types, catalog, prompts, CSV parsing, and scoring**

Define the exact public types:

```ts
export type LabProviderId = "gemini" | "qwen" | "doubao" | "openai";
export type LabMode = "full_dish" | "extract_only";

export interface ObservedMenuItem {
  page: number;
  ordinal: number;
  categoryCn: string | null;
  nameCn: string;
  price: string | null;
  confidence: number;
  sourceText: string;
}

export interface LabModelSpec {
  provider: LabProviderId;
  model: string;
  label: string;
  configured: boolean;
  modes: LabMode[];
  snapshot: boolean;
}

export interface LabRequest {
  provider: LabProviderId;
  model: string;
  mode: LabMode;
  images: string[];
  imageNames: string[];
  systemPrompt?: string;
  userPrompt?: string;
  temperature: number;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export type LabProviderEvent =
  | { type: "headers"; requestId?: string; ms: number }
  | { type: "text"; text: string; ms: number }
  | { type: "usage"; inputTokens?: number; outputTokens?: number; thinkingTokens?: number }
  | { type: "finish"; reason?: string };

export interface GoldDishRow {
  menuId: string;
  imageFile: string;
  dishOrder: number;
  nameCn: string;
  price: string;
  note: string;
}

export type LabStreamEvent =
  | { type: "meta"; provider: LabProviderId; model: string; mode: LabMode; imageCount: number; startedAt: number; runtime: "local" | "cloudflare"; colo: string | null; rayId: string | null; placement: string | null }
  | { type: "page_started"; page: number; imageName: string; ms: number }
  | { type: "provider_headers"; page: number; ms: number; requestId?: string }
  | { type: "chunk"; page: number; text: string; ms: number }
  | { type: "item"; page: number; ordinal: number; data: Record<string, unknown>; raw: Record<string, unknown>; ms: number }
  | { type: "page_done"; page: number; total: number; ms: number; finishReason?: string }
  | { type: "usage"; page: number; inputTokens?: number; outputTokens?: number; thinkingTokens?: number }
  | { type: "error"; code: string; page?: number; message: string; ms: number }
  | { type: "done"; total: number; firstItemMs: number | null; totalMs: number; partial: boolean; pageTotals: Record<number, number> };
```

Catalog configuration:

```ts
const configured = {
  gemini: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
  qwen: Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_BASE_URL),
  openai: Boolean(process.env.OPENAI_API_KEY),
  doubao: Boolean(process.env.ARK_API_KEY && process.env.ARK_BASE_URL && process.env.DOUBAO_MODEL),
};
```

Include fixed entries for `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `qwen3.6-flash-2026-04-16`, `qwen3.7-plus-2026-05-26`, `qwen-vl-ocr`, `gpt-5.4-mini-2026-03-17`, and the environment-provided Doubao endpoint ID. Never serialize environment values other than the public Doubao model ID.

`getLabPrompt("extract_only")` must demand one compact NDJSON object per readable item with exactly `ordinal`, `categoryCn`, `nameCn`, `price`, `confidence`, and `sourceText`. `getLabPrompt("full_dish")` reuses the production prompt text but adds a page-local NDJSON instruction. Streaming benchmark mode uses NDJSON plus strict application validation instead of one JSON array so first-item latency remains measurable.

CSV parsing must support quoted commas and escaped double quotes using a small state machine, reject missing required headers, and normalize BOM/CRLF. Name matching uses Unicode NFKC, removes whitespace and common punctuation, but does not translate or rewrite Chinese characters. Price exactness uses trimmed NFKC only, deliberately treating `¥69` and `69元` as different.

- [ ] **Step 4: Run tests and confirm pass**

Run: `npm test -- src/lib/lab/scoring.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit the domain layer**

```bash
git add src/lib/lab/types.ts src/lib/lab/catalog.ts src/lib/lab/prompts.ts src/lib/lab/scoring.ts src/lib/lab/scoring.test.ts
git commit -m "Build Lab benchmark domain and scoring"
```

### Task 2: Streaming Parsers and Provider Adapters

**Files:**
- Create: `src/lib/lab/sse.ts`
- Create: `src/lib/lab/sse.test.ts`
- Create: `src/lib/lab/providers/gemini.ts`
- Create: `src/lib/lab/providers/openai-compatible.ts`
- Create: `src/lib/lab/providers/openai.ts`
- Create: `src/lib/lab/providers/index.ts`
- Create: `src/lib/lab/providers/providers.test.ts`

**Interfaces:**
- Consumes: `LabRequest`, `LabProviderEvent`, `getLabModel()` from Task 1.
- Produces: `parseSse()`, `LabProviderAdapter`, `getProviderAdapter(provider)`, and single-page `streamPage()` implementations.

The provider interface is:

```ts
export interface LabProviderAdapter {
  id: LabProviderId;
  streamPage(args: {
    request: LabRequest;
    image: string;
    page: number;
    prompt: string;
  }): AsyncIterable<LabProviderEvent>;
}

export function getProviderAdapter(provider: LabProviderId): LabProviderAdapter;
```

- [ ] **Step 1: Write failing SSE and provider request-shape tests**

```ts
it("splits SSE across transport chunks", async () => {
  const events = await collect(parseSse(chunks('data: {"a":', '1}\n\ndata: [DONE]\n\n')));
  expect(events).toEqual(['{"a":1}', "[DONE]"]);
});

it("disables Gemini thinking", async () => {
  global.fetch = vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    return sseResponse('data: {"candidates":[{"content":{"parts":[{"text":"{\\"nameCn\\":\\"米饭\\"}\\n"}]}}]}\n\n');
  }) as typeof fetch;
  const events = await collect(geminiAdapter.streamPage(request));
  expect(events.some((e) => e.type === "text")).toBe(true);
});

it("disables Qwen thinking and sends an image data URL", async () => {
  global.fetch = vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.enable_thinking).toBe(false);
    expect(body.messages[0].content[0].type).toBe("image_url");
    return sseResponse("data: [DONE]\n\n");
  }) as typeof fetch;
  await collect(qwenAdapter.streamPage(request));
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- src/lib/lab/sse.test.ts src/lib/lab/providers/providers.test.ts`  
Expected: FAIL because adapters and parser do not exist.

- [ ] **Step 3: Implement the common SSE parser**

`parseSse(body)` reads a `ReadableStream<Uint8Array>`, preserves partial lines, groups `data:` fields until a blank line, and yields payload strings. It must flush the final event at EOF and ignore comment/heartbeat lines.

- [ ] **Step 4: Implement Gemini adapter**

Use one image per call and include:

```ts
generationConfig: {
  temperature: request.temperature,
  maxOutputTokens: request.maxOutputTokens,
  thinkingConfig: { thinkingBudget: 0 },
}
```

Call `streamGenerateContent?alt=sse`, emit `headers` immediately after fetch resolves, emit only non-thought candidate text, and map usage metadata if present. This is Lab-only; do not edit `src/lib/gemini.ts`.

- [ ] **Step 5: Implement Qwen/Doubao OpenAI-compatible adapter**

POST `${baseUrl}/chat/completions` with:

```ts
{
  model,
  messages: [{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: imageDataUrl } },
      { type: "text", text: combinedPrompt },
    ],
  }],
  stream: true,
  stream_options: { include_usage: true },
  temperature,
  max_tokens: maxOutputTokens,
  enable_thinking: false,
}
```

Send `enable_thinking` only for Qwen. Doubao uses its configured endpoint/model without the Qwen extension. Parse `choices[0].delta.content`, `choices[0].finish_reason`, `usage`, and response request IDs.

- [ ] **Step 6: Implement OpenAI adapter**

Use Chat Completions with image input, streaming, `stream_options.include_usage`, and `reasoning_effort: "none"`. Parse the same provider-neutral events. Reject any requested model not present in the catalog.

- [ ] **Step 7: Run adapters tests and the full unit suite**

Run: `npm test -- src/lib/lab/sse.test.ts src/lib/lab/providers/providers.test.ts`  
Expected: PASS.  
Run: `npm test`  
Expected: all existing and new tests PASS.

- [ ] **Step 8: Commit adapters**

```bash
git add src/lib/lab/sse.ts src/lib/lab/sse.test.ts src/lib/lab/providers
git commit -m "Add streaming Lab model providers"
```

### Task 3: Page Runner and Provider-Neutral Lab Route

**Files:**
- Create: `src/lib/lab/runner.ts`
- Create: `src/lib/lab/runner.test.ts`
- Rewrite: `src/app/api/lab/route.ts`
- Create: `src/app/api/lab/route.test.ts`

**Interfaces:**
- Consumes: provider adapters, prompts, catalog, production `normalizeDish`, and NDJSON line splitter.
- Produces: `streamLabRun(request, runtimeMeta)` and GET/POST `/api/lab` behavior.

- [ ] **Step 1: Write failing runner tests**

Cover these exact cases:

```ts
it("emits meta before starting provider I/O", async () => { /* first event is meta */ });
it("streams page items without waiting for all pages", async () => { /* page 2 item precedes slow page 1 done */ });
it("sort keys remain page plus ordinal even when pages finish out of order", async () => { /* item carries page */ });
it("caps active page adapters at four", async () => { /* maxActive === 4 */ });
it("keeps successful pages and emits partial_result when one page fails", async () => { /* partial true */ });
it("normalizes full Dish and validates extract-only fields separately", async () => { /* both modes */ });
```

- [ ] **Step 2: Run runner tests and confirm failure**

Run: `npm test -- src/lib/lab/runner.test.ts`  
Expected: FAIL because `runner.ts` does not exist.

- [ ] **Step 3: Implement bounded page runner**

Use a small internal async event queue. Start at most four `streamPage` jobs. Each page has its own line splitter and page-local ordinal counter. Emit:

```ts
{ type: "page_started", page, imageName, ms }
{ type: "provider_headers", page, ms, requestId }
{ type: "chunk", page, text, ms }
{ type: "item", page, ordinal, data, raw, ms }
{ type: "page_done", page, total, ms, finishReason }
{ type: "usage", page, inputTokens, outputTokens, thinkingTokens }
{ type: "done", total, firstItemMs, totalMs, partial, pageTotals }
```

For Full Dish, call `normalizeDish(raw, globalArrivalId)` but keep separate `page`/`ordinal` event fields. For Extract Only, require non-empty `nameCn`, normalize price/null, clamp confidence to 0–1, and attach server-authoritative page/ordinal. Do not trust model-provided page numbers.

- [ ] **Step 4: Rewrite the Lab route with validation and Cloudflare metadata**

GET returns catalog, modes, defaults, target thresholds, and `configured` booleans. POST validates provider/model pairing, image names count, 1–9 data URLs, numeric bounds, and configured credentials.

Runtime metadata:

```ts
const cf = (req as Request & { cf?: { colo?: string } }).cf;
const runtimeMeta = {
  runtime: cf ? "cloudflare" : "local",
  colo: cf?.colo ?? null,
  rayId: req.headers.get("cf-ray"),
  placement: req.headers.get("cf-placement"),
};
```

Return the NDJSON stream immediately with `Cache-Control: no-store` and `X-Accel-Buffering: no`. Sanitize upstream errors into the agreed error enum; keep secrets and full auth URLs out of messages.

- [ ] **Step 5: Add route tests**

Mock `getProviderAdapter()` and verify GET secret safety, invalid provider/model rejection, missing credentials 503, meta-first streaming, Cloudflare metadata, partial pages, and abort cleanup.

- [ ] **Step 6: Run route and regression tests**

Run: `npm test -- src/lib/lab/runner.test.ts src/app/api/lab/route.test.ts`  
Expected: PASS.  
Run: `npm test`  
Expected: production analyze tests still PASS unchanged.

- [ ] **Step 7: Commit runner and route**

```bash
git add src/lib/lab/runner.ts src/lib/lab/runner.test.ts src/app/api/lab/route.ts src/app/api/lab/route.test.ts
git commit -m "Make Lab runs provider neutral and truly streaming"
```

### Task 4: Deterministic Scoring API

**Files:**
- Create: `src/app/api/lab/score/route.ts`
- Create: `src/app/api/lab/score/route.test.ts`

**Interfaces:**
- Consumes: `parseGoldCsv()` and `scorePredictions()` from Task 1.
- Produces: POST `/api/lab/score` returning deterministic metrics.

- [ ] **Step 1: Write failing score route tests**

```ts
it("scores predictions against the uploaded simple CSV", async () => {
  const res = await POST(request({ csv, imageNames: ["M001_P01.jpg"], predictions }));
  expect(await res.json()).toMatchObject({ nameRecall: 1, hallucinationCount: 0, matchedNames: 1 });
});

it("rejects CSV whose image_file names do not match uploaded images", async () => {
  const res = await POST(request({ csv, imageNames: ["other.jpg"], predictions: [] }));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/app/api/lab/score/route.test.ts`  
Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement score route**

Accept at most 1 MB CSV text and 5,000 gold/predicted rows. Validate image names, run deterministic scoring, and return per-image plus aggregate metrics. Do not store inputs.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/app/api/lab/score/route.test.ts`  
Expected: PASS.

```bash
git add src/app/api/lab/score
git commit -m "Score Lab runs against menu CSV gold data"
```

### Task 5: Lab UI for Models, Modes, Timings, Gold Data, and Export

**Files:**
- Modify: `public/lab.html`

**Interfaces:**
- Consumes: GET/POST `/api/lab`, POST `/api/lab/score`, and all Lab stream event types.
- Produces: interactive single-run and sequential benchmark UI; no production UI changes.

- [ ] **Step 1: Add provider/model/mode and gold controls**

Add provider select, filtered model select, mode toggle, optional `.csv` file input, repeat count default 3, and benchmark configuration checkboxes. Disable unconfigured models with a visible “missing server key” label.

- [ ] **Step 2: Preserve image names and measure client compression**

Store `{ name, dataUrl, compressionMs, originalBytes, compressedBytes }`. Send `imageNames` with every run. Display compression separately from server/model time.

- [ ] **Step 3: Handle provider-neutral stream events**

Replace Gemini-specific `dish` handling with `item`. Extract Only renders compact rows containing page, ordinal, Chinese name, and price. Full Dish retains the existing rich card renderer. Add page status, headers, first item, page done, usage, partial, colo, Ray ID, and placement displays.

Use stricter target colors:

```js
const target = mode === "extract_only"
  ? { firstP50: images.length === 1 ? 1200 : 1500, totalP50: images.length === 1 ? 2500 : 3500 }
  : { firstP50: 3000, totalP50: images.length === 1 ? 7000 : 10000 };
```

- [ ] **Step 4: Add CSV scoring**

After a run completes, if CSV is loaded, POST the CSV text, uploaded image names, and normalized predictions to `/api/lab/score`. Display name recall, price exactness, hallucination count, and per-image misses/extras. A CSV mismatch must show a clear error without discarding model results.

- [ ] **Step 5: Add bounded benchmark queue and aggregation**

Run selected configurations sequentially, each repeated 1–5 times. Do not start a second configuration while the first is active. Aggregate P50/P95 for first item and total, mean quality metrics, failures, usage, and runtime/colo. Never collapse everything into one unexplained score.

- [ ] **Step 6: Add JSON and CSV export**

Export one JSON containing configuration, image names/sizes, client timings, server events, parsed predictions, score, runtime metadata, and timestamp. Export a flat CSV summary with one row per run. Do not embed base64 image content or API keys.

- [ ] **Step 7: Run static and browser smoke checks**

Run: `npm run build`  
Expected: build succeeds.  
Open `/lab`, verify boot, provider filtering, image upload, mode switch, Stop, missing-key states, CSV mismatch, raw events, and export.

- [ ] **Step 8: Commit UI**

```bash
git add public/lab.html
git commit -m "Expand Lab into a multi-model benchmark console"
```

### Task 6: Cloudflare Preview and End-to-End Verification

**Files:**
- Modify only if needed for Lab compatibility: `docs/superpowers/specs/2026-07-12-lab-model-benchmark-design.md`
- Do not modify `wrangler.jsonc` placement in this task.

**Interfaces:**
- Consumes: the completed Lab.
- Produces: verified local and Cloudflare-preview evidence plus documented credential gaps.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run build
npm run preview
```

Expected: all tests pass, Next build succeeds, OpenNext preview starts without Worker compatibility errors.

- [ ] **Step 2: Smoke-test the Gemini configurations locally and in OpenNext preview**

Use one existing Beijing page in Extract Only and Full Dish. Confirm `meta` arrives before provider completion, thinking tokens are zero/absent, items stream incrementally, and completion includes per-stage timing.

- [ ] **Step 3: Verify production isolation**

Run the existing mock analyze route tests and compare `git diff e857669 -- src/app/api/analyze/route.ts public/app.html src/lib/gemini.ts src/lib/contract.ts`.  
Expected: no changes to those production files.

- [ ] **Step 4: Record unavailable live providers without weakening tests**

Because current local environment only contains Gemini credentials, confirm Qwen/OpenAI/Doubao appear unconfigured and their mocked adapter tests pass. Report the exact environment variable names needed, never their values:

```text
DASHSCOPE_API_KEY + DASHSCOPE_BASE_URL
OPENAI_API_KEY
ARK_API_KEY + ARK_BASE_URL + DOUBAO_MODEL
```

- [ ] **Step 5: Decide whether deployment topology testing is warranted**

Do not enable Smart Placement yet. Trigger a separate deployment experiment only if Cloudflare preview/deployed measurements show provider P95 overhead above 1.5 seconds or regional connection failures. Keep default placement as the baseline.

- [ ] **Step 6: Final commit if verification required documentation fixes**

```bash
git add docs/superpowers/specs/2026-07-12-lab-model-benchmark-design.md
git commit -m "Document Lab benchmark verification"
```

If no documentation changed, do not create an empty commit.
