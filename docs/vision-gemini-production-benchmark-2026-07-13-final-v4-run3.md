# Vision-Gemini Production Benchmark

- Schema: vision-gemini-benchmark.v2
- Harness: 2.0.0
- Run: final-v4-run3
- Started: 2026-07-13T06:43:58.232Z
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
| Name recall | 85.28% |
| Name precision | 84.87% |
| Exact price | 65.66% (348/530) |
| Hallucinations | 95 |
| Total latency P50 / P95 | 20901.0 ms / 50115.7 ms |
| First dish P50 / P95 | 20898.5 ms / 50114.7 ms |
| Within-page inversions / comparable pairs | 1476/14571 |

Cross-page identity is inferred only from one-to-one matches against gold rows; unmatched predictions are never assigned a page.
