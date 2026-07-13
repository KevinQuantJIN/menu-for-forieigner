# Vision→Gemini production benchmark (2026-07-13)

## Dataset
- Fixed set: 14 images / 625 gold dishes
- Path: Google Cloud Vision OCR → text-only Gemini → public NDJSON
- Repeats: 3 full black-box runs against local `POST /api/analyze`

## Aggregate vs old image-Gemini baseline

| Metric | Baseline (image Gemini) | Run1 | Run2 | Run3 | Mean (new) | Δ mean vs baseline |
|---|---:|---:|---:|---:|---:|---:|
| Name recall | 12.6% | 78.7% | 78.1% | 81.8% | 79.5% | +66.9 pp |
| Name precision | 75.2% | 90.4% | 86.2% | 85.7% | 87.5% | +12.2 pp |
| Price exact | 53.2% | 57.9% | 61.9% | 62.8% | 60.8% | +7.7 pp |
| Matched names | 79 | 492 | 488 | 511 | — | — |
| Hallucinations | 26 | 52 | 78 | 85 | 71.7 | — |
| Completed images | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 every run | — |
| Zero-output pages | — | 0 | 0 | 0 | 0 | — |
| Latency P50 (ms) | 37716.9 | 24875.1 | 21476.4 | 25659 | 24003.5 | — |
| Latency P95 (ms) | 120053.5 | 48350.1 | 44394.8 | 47969.5 | 46904.8 | — |

## Completion / truncation
- All 14 images completed in every accepted repeat.
- No accepted incomplete generation terminal as success (zero-output pages = 0).
- No public page/OCR/bbox leakage observed in smoke.

## Weak / high-variance pages
- **M004_P01.jpg** gold=72 mean recall=31.5% dishes=1/56/56
- **M001_P05.jpg** gold=8 mean recall=50.0% dishes=9/9/9
- **M001_P04.jpg** gold=13 mean recall=53.8% dishes=15/19/17
- **M001_P02.jpg** gold=9 mean recall=55.6% dishes=5/5/5

## Multi-page smoke (grouped menus)
- Run 1: M007 2p → 76 dishes (20435.8ms); M001 6p → 101 dishes (33392.2ms)
- Run 2: M007 2p → 54 dishes (20358.4ms); M001 6p → 105 dishes (33913.7ms)
- Run 3: M007 2p → 75 dishes (21282.5ms); M001 6p → 92 dishes (29657.4ms)

## Live smoke matrix
| Case | Result |
|---|---|
| Ordinary single-page | pass |
| Dense multi-column | pass |
| Two-page same menu | pass (page order + continuous ids) |
| Blank/unreadable | pass (`unreadable`) |
| Missing credentials (mock off) | pass (`upstream_error`, no silent mock) — unit/route |

## Acceptance notes
- Architecture migration **substantially** beats image-Gemini baseline on name recall (~12.6% → ~75–79% mean range).
- Remaining production risks: page-level variance (esp. M004), price association accuracy, residual hallucinations, and Cloudflare preview still pending.
- Temperature 0 experiment not required yet for cutover decision; variance is page-dependent more than global collapse.
- Production deploy still requires **explicit human approval** after preview.

## Artifact files
- Per-run: `docs/vision-gemini-production-benchmark-2026-07-13-run{1,2,3}.{json,md}`
- Summary: this file + `docs/vision-gemini-production-benchmark-2026-07-13.json`
- Baseline: `docs/gemini-image-production-baseline-2026-07-13.{json,md}`
