# Gravity v3 qualified-evidence tier calibration (2026-08-07)

## Decision

Gravity v3 public tiers are calibrated separately for forwards and defensemen
from the integrity-verified frozen 2025-26 population. A v3 profile receives a
public tier or position percentile only when it has:

- at least **20 games played**; and
- at least **two-thirds (66.67%)** of total weighted model input coverage.

Profiles with 10–19 games or less than two-thirds coverage remain available as
diagnostics but return `INSUFFICIENT`, `tier: null`, and no percentile. Fewer
than 10 games remains calculation-ineligible.

This is a calibration result, not a validation result. Gravity display, X-NAV,
and simulation release channels remain independently gated and default off.

## Authorized population and integrity

Here, "authorized" means the repository-approved, frozen calibration snapshot
whose identity and aggregate provenance are committed. It does not assert legal
permission to redistribute source data or assets; that remains a separate PL-5
release gate.

- Season: `2025-26`
- Model release: `gravity-v3-release-a`
- Qualified forwards: **476**
- Qualified defensemen: **239**
- Total qualified: **715**
- Population SHA-256: `6b76883a33802f1fbfc93475ca5240819ad8294bfc5aa5a8f35fd3fe895654f9`
- Manifest payload SHA-256: `e59c9b8ea35d54b1d7ab8f7d9c94b9f46b8535ee6ffdd3a63d30ebba425e8a04`

The private player-level population is accepted only when its SHA-256 matches
the committed manifest. The committed calibration artifact contains aggregate
thresholds and counts only:

`data/gravity-calibration/2025-26/tier-calibration.json`

All 715 sample-qualified players met the coverage gate. The minimum observed
qualified coverage was 66.67%; 714 of 715 had 100% coverage.

## Why the calibration is position-specific

Every v3 input is standardized against a forward or defense distribution.
Therefore force measures rarity inside a position group; it is not a common
expected-goal or impact unit. Combining the groups into one percentile would
make an unsupported cross-position claim. Public percentiles now use qualified
same-position peers only, with at least 20 peers required.

## Method

The deterministic calibration script runs production `computeGravity` against
the verified frozen population, splits qualified profiles into `F` and `D`, and
selects the nearest observed two-decimal production force at these anchors:

- `SUPERMASSIVE`: 98th percentile and above;
- `STAR`: 92nd percentile and above;
- `MAIN_SEQUENCE`: 80th percentile and above;
- `SATELLITE`: 60th percentile and above;
- `BLACK_HOLE`: below the 3rd percentile;
- `ASTEROID`: the remaining middle range.

Ties on the two-decimal production force are kept together, so realized shares
can differ slightly from the nominal anchor.

## Persisted cutoffs

| Tier | Forward force | Defense force |
| --- | ---: | ---: |
| SUPERMASSIVE | `>= 0.46` | `>= 0.52` |
| STAR | `>= 0.35` | `>= 0.36` |
| MAIN_SEQUENCE | `>= 0.26` | `>= 0.22` |
| SATELLITE | `>= 0.16` | `>= 0.09` |
| ASTEROID | `>= -0.15` | `>= -0.28` |
| BLACK_HOLE | `< -0.15` | `< -0.28` |

## Reconciled tier counts

| Tier | Forwards | Defensemen |
| --- | ---: | ---: |
| SUPERMASSIVE | 12 | 6 |
| STAR | 29 | 15 |
| MAIN_SEQUENCE | 58 | 28 |
| SATELLITE | 93 | 52 |
| ASTEROID | 271 | 131 |
| BLACK_HOLE | 13 | 7 |
| **Total** | **476** | **239** |

## Reliability constraint

Coverage is now a hard ceiling on the legacy reliability index:

```text
raw reliability = 0.40 · sample + 0.40 · stability + 0.20 · coverage
reliability     = min(raw reliability, coverage)
```

Consequently, zero model evidence produces zero reliability regardless of
games played or the unknown-stability prior.

## Reproduction

With the private population restored at the manifest path:

```bash
npm run gravity:calibration:check
```

The command fails if the population hash is wrong or if the committed aggregate
artifact differs from a fresh calculation.
