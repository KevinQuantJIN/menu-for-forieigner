# Vision-Gemini Production Benchmark

- **Timestamp**: 2026-07-12T19:08:28.906Z
- **Base URL**: http://localhost:3000
- **Images**: 14
- **Gold dishes**: 625

## Aggregate Metrics

| Metric | Value |
|---|---|
| Images completed | 14/14 |
| Gold count | 625 |
| Name recall | 12.6% |
| Name precision | 75.2% |
| Exact-price rate | 53.2% (42/79) |
| Hallucinations | 26 |
| Pages with errors | 1 |
| Pages with zero output | 1 |
| Latency P50 | 37716.9ms |
| Latency P95 | 120053.5ms |

## Per-Image Results

| Image | Status | Dishes | Gold | Recall | Precision | Price | Err |
|---|---|---|---|---|---|---|---|
| M001_P01.jpg | 200 | 14 | 14 | 71.4% | 71.4% | 0.0% | - |
| M001_P02.jpg | 200 | 9 | 9 | 100.0% | 100.0% | 0.0% | - |
| M001_P03.jpg | 200 | 12 | 12 | 8.3% | 8.3% | 0.0% | - |
| M001_P04.jpg | 200 | 12 | 13 | 53.8% | 58.3% | 0.0% | - |
| M001_P05.jpg | 200 | 8 | 8 | 75.0% | 75.0% | 0.0% | - |
| M001_P06.jpg | 200 | 3 | 45 | 6.7% | 100.0% | 0.0% | - |
| M002_P01.jpg | 200 | 2 | 69 | 2.9% | 100.0% | 100.0% | - |
| M003_P01.jpg | 200 | 2 | 88 | 1.1% | 50.0% | 0.0% | - |
| M004_P01.jpg | 200 | 2 | 72 | 2.8% | 100.0% | 100.0% | - |
| M005_P01.jpg | 200 | 2 | 55 | 3.6% | 100.0% | 100.0% | - |
| M006_P01.jpg | 200 | 2 | 77 | 0.0% | 0.0% | 0.0% | - |
| M007_P01.jpg | 200 | 25 | 39 | 61.5% | 96.0% | 100.0% | - |
| M007_P02.jpg | 200 | 12 | 37 | 32.4% | 100.0% | 100.0% | - |
| M008_P01.jpg | 200 | 0 | 87 | 0.0% | 0.0% | 0.0% | upstream_error |
