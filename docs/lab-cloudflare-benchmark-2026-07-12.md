# Lab Cloudflare transport benchmark — 2026-07-12

## Method

- Endpoint: `https://menulens.web3-fintech-op-service.workers.dev/api/lab`
- Access: POST is now protected by `LAB_ACCESS_TOKEN` (added after the recorded runs)
- Worker runtime/colo: Cloudflare, `TPE`
- Input: `reference-menu-data/lei-garden-cantonese/images/IMG_2830.jpg`
- Mode: `extract_only`
- Temperature: `0`
- Maximum output tokens: `4096`
- Runs were sequential to avoid cross-request contention.

## Results

| Provider | Transport | Model | Headers | First item | Total | Items | Result |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| Gemini | Gemini direct | `gemini-2.5-flash` | 4.055s | 4.191s | 7.972s | 22 | Success |
| Qwen | DashScope Beijing | `qwen3.6-flash` | 1.938s | 2.546s | 11.524s | 20 | Success |
| Qwen | OpenRouter | `qwen/qwen3.6-flash` | 3.551s | 34.152s | 42.253s | 20 | Success |
| OpenAI | OpenRouter | `openai/gpt-5.4-mini` | — | — | 1.398s | 0 | OpenRouter upstream returned HTTP 403 TOS rejection |
| MiniMax | MiniMax direct | `MiniMax-M3` | 2.432s | 2.646s | 6.535s | 20 | Success |
| MiniMax | OpenRouter | `minimax/minimax-m3` | 1.252s | 2.164s | 4.066s | 20 | Success |
| StepFun | StepFun direct | `step-1o-turbo-vision` | 4.074s | 4.871s | 22.870s | 21 | Success |
| StepFun | OpenRouter | `stepfun/step-3.7-flash` | 0.505s | — | 22.205s* | — | Incomplete stream; invalid benchmark |
| GLM | OpenRouter | `z-ai/glm-5v-turbo` | 2.516s | — | 3.110s* | — | Worker exceeded CPU limit; invalid benchmark |
| Doubao | Ark direct | `doubao-seed-2-0-lite-260428` | 5.550s | — | 21.096s* | — | Incomplete stream; same termination signature as CPU-limit case |

`*` is client-observed time until the response stream ended, not a valid model completion time.

## Findings

1. Qwen Beijing direct was about 3.7× faster end-to-end than the OpenRouter route in this single run.
2. MiniMax OpenRouter was about 1.6× faster than MiniMax direct in this single run.
3. OpenAI via OpenRouter is not currently usable from this Worker because the upstream route rejects the request on TOS grounds. The same route had already failed from local testing, so moving the request to Cloudflare did not resolve it.
4. Cloudflare tail logs confirmed `Worker exceeded CPU time limit` for the GLM incomplete stream. StepFun OpenRouter and Doubao ended with the same missing `page_done`/`done` signature; they must not be compared as completed benchmarks.
5. Qwen Singapore and Virginia were not run because `DASHSCOPE_INTL_API_KEY` and `DASHSCOPE_US_API_KEY` are intentionally still unconfigured. Their routes remain visible but disabled.
6. Ark exposes GLM text models but no GLM-V image model in the configured account, so GLM's image benchmark remains OpenRouter-only. DeepSeek is text-only and is excluded from this image benchmark.

These are single-run engineering measurements, not statistically stable latency claims. Multiple completed runs are required before making a production routing decision.
