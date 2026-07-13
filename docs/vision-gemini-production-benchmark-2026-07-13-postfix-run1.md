# Vision-Gemini Production Benchmark

- **Timestamp**: 2026-07-13T05:07:46.369Z
- **Base URL**: http://localhost:3000
- **Concurrency**: 1
- **Images**: 14
- **Gold dishes**: 625

## Aggregate Metrics

| Metric | Value |
|---|---|
| Images completed (HTTP 200 + unique done + done.total==dishes + valid NDJSON) | 14/14 |
| Gold count | 625 |
| Name recall | 83.7% |
| Name precision | 82.9% |
| Exact-price rate | 64.2% (334/520) |
| Hallucinations | 108 |
| Pages with HTTP/network error | 0 |
| Pages with stream error event | 0 |
| Pages with bad NDJSON lines | 0 |
| Pages with terminal contract issues | 0 |
| Pages with zero dishes but completed | 0 |
| Truncation signals (done.total mismatch) | 0 |
| Single-page order OK | 4/14 |
| Multi-page completed | 2/2 |
| Multi-page order OK | 0/2 |
| Latency P50 / P95 | 4.1ms / 14.3ms |
| First-dish P50 / P95 | 3.8ms / 14ms |

## Per-Image Results

| Image | Completed | Dishes | Gold | Recall | Precision | Price | Terminal | FirstDish | Total |
|---|---|---|---|---|---|---|---|---|---|
| M001_P01.jpg | true | 14 | 14 | 85.7% | 85.7% | 33.3% | done | 1.2 | 1.7 |
| M001_P02.jpg | true | 9 | 9 | 100.0% | 100.0% | 100.0% | done | 0.6 | 0.9 |
| M001_P03.jpg | true | 13 | 12 | 58.3% | 53.8% | 71.4% | done | 0.6 | 0.8 |
| M001_P04.jpg | true | 18 | 13 | 53.8% | 38.9% | 0.0% | done | 6.4 | 6.5 |
| M001_P05.jpg | true | 9 | 8 | 50.0% | 44.4% | 0.0% | done | 0.4 | 0.8 |
| M001_P06.jpg | true | 45 | 45 | 91.1% | 91.1% | 2.4% | done | 3.8 | 4.1 |
| M002_P01.jpg | true | 69 | 69 | 98.6% | 98.6% | 100.0% | done | 5.6 | 6 |
| M003_P01.jpg | true | 86 | 88 | 86.4% | 88.4% | 17.3% | done | 7.6 | 8.2 |
| M004_P01.jpg | true | 56 | 72 | 40.3% | 51.8% | 86.2% | done | 3.9 | 4.2 |
| M005_P01.jpg | true | 54 | 55 | 90.9% | 92.6% | 86.0% | done | 3.6 | 3.9 |
| M006_P01.jpg | true | 96 | 77 | 84.4% | 67.7% | 23.1% | done | 14 | 14.3 |
| M007_P01.jpg | true | 39 | 39 | 100.0% | 100.0% | 100.0% | done | 0.3 | 0.4 |
| M007_P02.jpg | true | 37 | 37 | 97.3% | 97.3% | 94.4% | done | 1.7 | 2 |
| M008_P01.jpg | true | 86 | 87 | 92.0% | 93.0% | 100.0% | done | 7.4 | 9.2 |

## Multi-Page Results

| Menu | Pages | Completed | Dishes | OrderOk | Terminal | Total |
|---|---|---|---|---|---|---|
| M007 | 2 | true | 76 | false | done | 4.8 |
| M001 | 6 | true | 107 | false | done | 5.4 |
