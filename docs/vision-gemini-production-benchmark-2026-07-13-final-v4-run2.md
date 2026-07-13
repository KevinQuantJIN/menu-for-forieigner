# Vision-Gemini Production Benchmark

- Schema: vision-gemini-benchmark.v2
- Harness: 2.0.0
- Run: final-v4-run2
- Started: 2026-07-13T06:37:33.665Z
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
| Name recall | 84.00% |
| Name precision | 83.07% |
| Exact price | 67.82% (354/522) |
| Hallucinations | 107 |
| Total latency P50 / P95 | 21129.4 ms / 43018.1 ms |
| First dish P50 / P95 | 21128.6 ms / 43014.5 ms |
| Within-page inversions / comparable pairs | 1124/14329 |

Cross-page identity is inferred only from one-to-one matches against gold rows; unmatched predictions are never assigned a page.
