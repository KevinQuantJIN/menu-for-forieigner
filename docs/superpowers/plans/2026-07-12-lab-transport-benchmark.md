# Lab Transport Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one logical model vendor expose multiple independently measured API transports, then deploy the Lab to Cloudflare and compare Cloudflare-to-provider latency.

**Architecture:** Add `transport` as a first-class catalog/request/event/export dimension instead of duplicating provider IDs. Catalog entries own their credential requirements and adapter transport; the runner reports transport unchanged. OpenRouter variants are added only when OpenRouter offers a real image-input model from that vendor.

**Tech Stack:** Next.js 16.2 Route Handlers, TypeScript 5, native Fetch/SSE, Vitest 4, OpenNext Cloudflare, Wrangler 4.

## Global Constraints

- OpenAI uses OpenRouter only.
- Qwen exposes DashScope Beijing, Singapore, Virginia, and OpenRouter variants through OpenAI-compatible Chat Completions.
- MiniMax exposes official direct and OpenRouter variants.
- StepFun exposes official direct and OpenRouter variants, with model names shown because the available models differ.
- GLM image benchmarking uses OpenRouter GLM-V; Ark GLM 4.7/5.2 are text-only and must not enter the image track.
- Doubao uses Ark direct; OpenRouter has no equivalent Doubao vision model.
- DeepSeek remains text-only and cannot enter the image track.
- Gemini remains official direct.
- Never expose or commit secret values; `.env.local` remains ignored.
- Cloudflare timing must be reported as `runtime=cloudflare` with colo when available.

---

### Task 1: Add transport to the Lab contract and catalog

**Files:**
- Modify: `src/lib/lab/types.ts`
- Modify: `src/lib/lab/catalog.ts`
- Test: `src/app/api/lab/route.test.ts`

**Interfaces:**
- Produces: `LabTransportId = "gemini" | "dashscope-beijing" | "dashscope-singapore" | "dashscope-virginia" | "ark" | "minimax" | "stepfun" | "openrouter"`.
- Produces: `LabModelSpec.transport`, `LabModelSpec.transportLabel`, and per-model `missingEnvironment`.
- Produces: `LabRequest.transport` and `LabStreamEvent.meta.transport`.

- [ ] **Step 1: Write failing catalog tests**

Assert that Qwen, MiniMax, and StepFun each expose direct and OpenRouter entries, while Doubao has only `ark`, GLM has only image-capable `openrouter`, and DeepSeek modes remain empty:

```ts
expect(routes("qwen")).toEqual(["dashscope-beijing", "dashscope-singapore", "dashscope-virginia", "openrouter"]);
expect(routes("minimax")).toEqual(["minimax", "openrouter"]);
expect(routes("stepfun")).toEqual(["stepfun", "openrouter"]);
expect(routes("doubao")).toEqual(["ark"]);
expect(routes("glm")).toEqual(["openrouter"]);
```

- [ ] **Step 2: Run `npm test -- src/app/api/lab/route.test.ts`**

Expected: FAIL because `transport` and duplicate route entries do not exist.

- [ ] **Step 3: Implement the types and catalog entries**

Use per-entry configuration, for example:

```ts
{
  provider: "minimax",
  transport: "openrouter",
  transportLabel: "OpenRouter",
  model: "minimax/minimax-m3",
  requiredEnvironment: ["OPENROUTER_API_KEY"],
  modes: [...ALL_MODES],
}
```

Provider readiness is true when at least one compatible model entry is configured; missing variables are reported on model entries, not collapsed across transports.

- [ ] **Step 4: Re-run the focused test**

Expected: PASS.

### Task 2: Route adapters by transport

**Files:**
- Modify: `src/lib/lab/providers/index.ts`
- Modify: `src/lib/lab/providers/openai-compatible.ts`
- Modify: `src/lib/lab/providers/providers.test.ts`

**Interfaces:**
- Consumes: `LabRequest.transport` from Task 1.
- Produces: `getProviderAdapter(request: Pick<LabRequest, "provider" | "transport">)`.

- [ ] **Step 1: Write failing adapter tests**

For each variant, assert URL and Authorization source without exposing values:

```ts
expectRoute("qwen", "dashscope", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
expectRoute("qwen", "openrouter", "https://openrouter.ai/api/v1/chat/completions");
expectRoute("minimax", "minimax", "https://api.minimax.io/v1/chat/completions");
expectRoute("minimax", "openrouter", "https://openrouter.ai/api/v1/chat/completions");
```

- [ ] **Step 2: Run provider tests and verify the expected failures**

Run: `npm test -- src/lib/lab/providers/providers.test.ts`

- [ ] **Step 3: Implement transport-based configuration**

OpenRouter config uses `OPENROUTER_API_KEY`; DashScope uses `DASHSCOPE_API_KEY` and the official compatible base; Ark, MiniMax, and StepFun retain their current direct configuration. The OpenRouter request keeps text before image.

- [ ] **Step 4: Re-run provider tests**

Expected: PASS.

### Task 3: Preserve transport through API, UI, scoring, and exports

**Files:**
- Modify: `src/app/api/lab/route.ts`
- Modify: `src/lib/lab/runner.ts`
- Modify: `public/lab.html`
- Test: `src/app/api/lab/route.test.ts`
- Test: `src/lib/lab/runner.test.ts`
- Test: `src/lib/lab/ui-contract.test.ts`

**Interfaces:**
- Consumes: catalog transport from Task 1.
- Produces: benchmark grouping key `provider::transport::model::mode`.

- [ ] **Step 1: Write failing API/runner/UI tests**

Assert `transport` appears in meta events, the route rejects provider/model/transport mismatches, checkbox values include transport, and CSV has a `transport` column.

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npm test -- src/app/api/lab/route.test.ts src/lib/lab/runner.test.ts src/lib/lab/ui-contract.test.ts`

- [ ] **Step 3: Implement propagation**

POST bodies send `{ provider, transport, model }`; UI labels render `Provider · Transport`; benchmark aggregation and both exports retain transport.

- [ ] **Step 4: Re-run focused tests**

Expected: PASS.

### Task 4: Configure Cloudflare and deploy

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Do not modify: `.env.local` secret values beyond user-requested local configuration.

- [ ] **Step 1: Verify Wrangler identity and existing secret names**

Run: `npx wrangler whoami` and `npx wrangler secret list`. Do not print secret values.

- [ ] **Step 2: Upload required secret values from `.env.local`**

Use `npx wrangler secret put NAME` for configured transports. Skip DashScope until `DASHSCOPE_API_KEY` exists.

- [ ] **Step 3: Run `npm test`, `npm run build`, and `git diff --check`**

Expected: zero failures and exit code 0.

- [ ] **Step 4: Deploy**

Run: `npm run deploy`. Record the resulting Worker URL and version.

### Task 5: Cloudflare benchmark smoke

**Files:** no repository changes unless verification exposes a tested defect.

- [ ] **Step 1: Verify catalog from the Worker URL**

Confirm eight logical providers, route variants, configured flags, and no secret values.

- [ ] **Step 2: Run one shared menu image per configured image route**

Record provider, transport, Cloudflare colo, provider headers, first item, total time, item count, and sanitized errors.

- [ ] **Step 3: Report incomparable routes honestly**

Do not claim transport speed comparisons when the model IDs differ. Mark OpenAI regional/TOS failures, missing DashScope credentials, and text-only routes explicitly.

- [ ] **Step 4: Commit and push only after verification**

Stage intentional files, commit on `v0`, and push `origin/v0` after the deployed behavior matches the catalog.

## Self-Review

- Spec coverage: Cloudflare, ChatGPT OpenRouter-only, Qwen direct plus OpenRouter, domestic OpenRouter variants where real vision models exist, Doubao Ark, GLM capability boundary, timing/export attribution, deployment, and smoke tests all have explicit tasks.
- Placeholder scan: no unspecified implementation or test steps remain.
- Type consistency: every layer uses the same `transport` field and `LabTransportId` values.
