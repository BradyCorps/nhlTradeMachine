# Gravity v4 Validation Status

**Status:** Blocked — no authorized event/shift dataset or fitted artifact is available.
**Updated:** 2026-07-24

This is a status summary, not a validation result. No RMSE, rank correlation, calibration, stability, portability, uncertainty, or X-NAV improvement numbers have been generated.

## Infrastructure available

- Versioned Gravity v4 profile and artifact types
- Runtime schema and semantic validation
- Exact player-ID, season, model-version, and artifact-kind guards
- Bounded display transforms derived from unbounded xG values
- Off-by-default `GRAVITY_V4_ENABLED` flag
- Player-dossier and share-card rendering contracts
- Admin-only zero-value diagnostic fixture
- Explicit v3 fallback and no Gravity v4 X-NAV import

## Blocked evidence

The Release A v3 qualified-population tier recalibration after removal of the
usage scalars is blocked because a current authorized qualified league
population is unavailable in this execution environment.

The following require an authorized shift-, event-, stint-, or possession-level dataset and therefore remain unavailable:

- teammate-only OZ model fitting;
- event-valued NZ transition fitting;
- context-adjusted DZ expected goals prevented;
- game-block/bootstrap or posterior 90% intervals;
- qualified league visual scales and tier cutoffs;
- held-out prediction and calibration by decile;
- year-over-year stability and portability;
- correlations with direct offense and external isolated-impact benchmarks;
- sensitivity tests;
- base X-NAV versus base-plus-Gravity comparisons in two non-overlapping periods.

The diagnostic fixture contains zero analytical values, no intervals, no tier, no training seasons, and a null training date. It verifies loading and rendering only and must not be interpreted as a fitted player profile.
