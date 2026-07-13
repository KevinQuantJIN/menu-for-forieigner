# Vision-Gemini Production Readiness

**Engineering hard-gate status: PASS**

This conclusion uses 3 complete runs with one schema, harness hash, model configuration, and dataset hash. Product quality thresholds were not preapproved, so recall, precision, price accuracy, and hallucinations are reported rather than silently converted into a launch decision.

## Hard gates by run

| Run | 14/14 | Multi-page complete | Protocol | Timing | Cross-page boundary | Result |
|---|---:|---:|---:|---:|---:|---:|
| final-v4-run1 | PASS | PASS | PASS | PASS | PASS | PASS |
| final-v4-run2 | PASS | PASS | PASS | PASS | PASS | PASS |
| final-v4-run3 | PASS | PASS | PASS | PASS | PASS | PASS |

## Quality and latency across runs

- Name recall: 84.64% mean; 84.00%–85.28% range; 84.64% P50
- Name precision: 83.97% mean; 83.07%–84.87% range; 83.97% P50
- Exact price: 66.23% mean; 65.21%–67.82% range; 65.66% P50
- Hallucinations: 101.00 mean; 95.00–107.00 range; 101.00 P50
- Within-page inversions: 1397.67 mean; 1124.00–1593.00 range; 1476.00 P50
- Total latency P50: 21277.4 ms mean; 20901.0 ms–21801.7 ms range; 21129.4 ms P50
- Total latency P95: 44797.0 ms mean; 41257.1 ms–50115.7 ms range; 43018.1 ms P50
- First-dish latency P50: 21276.0 ms mean; 20898.5 ms–21801.0 ms range; 21128.6 ms P50
- First-dish latency P95: 44795.2 ms mean; 41256.3 ms–50114.7 ms range; 43014.5 ms P50

## Legacy baseline limitation

The old image-Gemini comparison is one legacy run produced by a different, non-strict harness. It is directional only and is not treated as three-run evidence. Deltas are new minus legacy: recall 72.00 pp, precision 8.73 pp, price 13.06 pp, hallucination count 75.00 dishes (higher is worse).

Cross-page identity is inferred from gold matches because public contract v1 intentionally exposes no page metadata. Unmatched predictions are excluded from page identity inference.
