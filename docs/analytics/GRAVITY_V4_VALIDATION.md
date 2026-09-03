# Gravity v4 Validation Status

**Status:** Fitted (OZ + DZ, untiered) · NZ excluded · display env-gated and dark in production.
**Updated:** 2026-09-03. Full evidence and verdict: `GRAVITY_V4_RELEASE_EVIDENCE.md`.
Canonical state: `ANALYTICS_STATE_2026.md` §1.

## What exists

- `app/lib/gravity-v4/fitted-artifact.json`: 560 profiles, 2025-26, 5v5, SHA-256
  `6de0271e…74e29f`, pinned by `artifact-manifest.ts` and refused by the loader
  if changed.
- OZ well: split-half r=0.409, null collapses, teammate identity holds, 20% of
  players resolve sign at 95%.
- DZ well: split-half r=0.328, null −0.036, identity 0.372 vs −0.032, 21% resolve.
- NZ rush-proxy well: split-half r=0.099 — excluded; stored as an explicit
  placeholder and presented as "not available", never as zero.
- Every profile untiered, no net interval, no net percentile, no portability.

## What does not exist

- Year-over-year / out-of-time stability, portability, calibration by decile,
  external benchmarks, incremental X-NAV evidence.
- A refit reproducible in the web environment (inputs gitignored; NHL egress
  blocked).

The diagnostic fixture contains zero analytical values and remains admin-only.
