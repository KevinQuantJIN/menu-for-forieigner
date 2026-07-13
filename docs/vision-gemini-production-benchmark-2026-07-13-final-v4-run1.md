# Vision-Gemini Production Benchmark

- Schema: vision-gemini-benchmark.v2
- Harness: 2.0.0
- Run: final-v4-run1
- Started: 2026-07-13T06:31:12.736Z
- Model: gemini-2.5-flash
- Git: 6318febb10fc781805416ac01efdc75ae08321fb (vision-gemini-migration, dirty=true)
- Dataset: chopstory-test-data

## Strict validity

- Images completed: 14/14
- Invalid JSON lines: 0
- Unknown events: 0
- Protocol-invalid runs: 0
- Timing-invalid runs: 0
- Cross-page boundary violations: 0

## Quality and latency

| Metric | Value |
|---|---:|
| Name recall | 84.64% |
| Name precision | 83.97% |
| Exact price | 65.21% (343/526) |
| Hallucinations | 101 |
| Total latency P50 / P95 | 21801.7 ms / 41257.1 ms |
| First dish P50 / P95 | 21801.0 ms / 41256.3 ms |
| Within-page inversions / comparable pairs | 1593/14561 |

Cross-page identity is inferred only from one-to-one matches against gold rows; unmatched predictions are never assigned a page.
