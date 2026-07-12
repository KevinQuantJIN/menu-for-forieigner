# Lab Eight-Provider Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose eight logical model vendors in Chopstory Lab using one OpenRouter credential for OpenAI, GLM, DeepSeek, and Qwen, while Gemini, MiniMax, Doubao, and StepFun remain direct.

**Architecture:** Keep vendor identity in benchmark results, but treat transport as a separate concern. Gemini uses its native adapter; OpenAI, Qwen, GLM, MiniMax, Doubao, and StepFun share the existing OpenAI-compatible adapter with transport-specific configuration. DeepSeek uses the OpenRouter credential but remains disabled in the image track because its current OpenRouter models accept text only.

**Tech Stack:** Next.js 16.2 Route Handlers, TypeScript 5, native Fetch/SSE, Vitest 4, static Lab HTML/JavaScript.

## Global Constraints

- Read relevant `node_modules/next/dist/docs/` before changing Route Handlers or environment handling.
- Never expose `.env.local` values; tests and diagnostics may report presence only.
- OpenRouter endpoint: `https://openrouter.ai/api/v1/chat/completions`.
- OpenRouter defaults verified 2026-07-12: `openai/gpt-5.4-mini`, `qwen/qwen3.6-flash`, `z-ai/glm-5v-turbo`, `deepseek/deepseek-v4-flash`.
- Only models whose OpenRouter `architecture.input_modalities` contains `image` may enter the image benchmark.
- Direct defaults: `MiniMax-M3`, `step-3.7-flash`; Doubao continues to use its configured endpoint ID.
- Do not commit `.env.local`.

---

### Task 1: Catalog transport and capability

**Files:** `src/lib/lab/types.ts`, `src/lib/lab/catalog.ts`, `src/app/api/lab/route.test.ts`

- [x] Add eight provider IDs plus provider capability metadata.
- [ ] Make OpenAI, Qwen, GLM, and DeepSeek depend on `OPENROUTER_API_KEY`.
- [ ] Use OpenRouter model slugs and keep DeepSeek model modes empty.
- [ ] Run `npm test -- src/app/api/lab/route.test.ts` and require PASS.

### Task 2: Route four vendors through OpenRouter

**Files:** `src/lib/lab/providers/openai-compatible.ts`, `src/lib/lab/providers/index.ts`, `src/lib/lab/providers/providers.test.ts`

- [ ] Write failing tests asserting one OpenRouter URL/key for OpenAI, Qwen, and GLM, with the same image/prompt body.
- [ ] Keep MiniMax, Doubao, and StepFun on their direct credentials and official base URLs.
- [ ] Normalize SSE request ID, usage, content, and errors without vendor-specific duplicate adapters.
- [ ] Run `npm test -- src/lib/lab/providers/providers.test.ts` and require PASS.

### Task 3: Enforce image capability and explain it in the UI

**Files:** `src/app/api/lab/route.ts`, `src/app/api/lab/route.test.ts`, `public/lab.html`, `src/lib/lab/ui-contract.test.ts`

- [ ] Derive provider validation from `LAB_PROVIDER_IDS`.
- [ ] Return `unsupported_input_capability` for DeepSeek image requests before credential checks.
- [ ] Display eight providers, exact missing variable names, and `text-only · requires shared OCR` for DeepSeek.
- [ ] Run focused route and UI tests and require PASS.

### Task 4: Document configuration

**Files:** `.env.example`, `README.md`

- [ ] Document `OPENROUTER_API_KEY`, `GOOGLE_API_KEY`, `MINIMAX_API_KEY`, `STEPFUN_API_KEY`, `ARK_API_KEY`, `ARK_BASE_URL`, and `DOUBAO_MODEL`.
- [ ] Document optional model/base URL overrides without secrets.
- [ ] Explain that real runs require `npm run dev` and `/lab.html`, not `file://`.

### Task 5: Verify and ship

- [ ] Run `npm test` and `npm run build`.
- [ ] Start the dev server and verify the catalog reports eight providers without secrets.
- [ ] Smoke test one real menu image against every configured vision provider; record only status, request ID, timings, and sanitized errors.
- [ ] Confirm DeepSeek is rejected locally without sending an image upstream.
- [ ] Run `git diff --check`, review, commit intentional files, and push `v0`.
