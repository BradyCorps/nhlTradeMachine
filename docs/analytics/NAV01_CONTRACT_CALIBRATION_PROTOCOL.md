# NAV-01 resolved-contract calibration protocol — September 9, 2026

**Decision: BLOCKED for a full-cohort shadow calibration.** The 4,311 resolved
contracts support leakage-safe F/D/G sample partitions, so neither 100%
resolution nor a transaction archive is a Phase 5 prerequisite. The
representativeness gate fails for entry-level and age-18–21 signings. Resolve
at least **280** additional ELC records, including at least **59** aged 18–21,
then rerun this report. Those requirements overlap: 613 unresolved records
are both ELC and aged 18–21, so this is not a request for 339 or all 1,918
records. Each added identity must still have an eligible pre-signing player
season before it can enter the fitted cohort.

Run:

```sh
npx tsx scripts/backtest/nav-calibration-cohort.ts
```

The command reads the local signing ledger and identity audit, produces the
complete team-level distribution map, and measures only cohort metadata. It
does not fit a model, read a holdout target value, alter public NAV, or emit
player rows.

## Resolved coverage and resolution bias

| Signing year | Resolved | Unresolved |
| --- | ---: | ---: |
| 2017 | 9 | 2 |
| 2018 | 247 | 255 |
| 2019 | 393 | 279 |
| 2020 | 392 | 214 |
| 2021 | 551 | 249 |
| 2022 | 621 | 198 |
| 2023 | 571 | 166 |
| 2024 | 603 | 174 |
| 2025 | 551 | 182 |
| 2026 | 373 | 199 |

The resolved candidate contains 4,311 contract rows for 1,501 NHL players:
4,202 exact, 45 normalized and 64 controlled manual identity resolutions.
Its signing-year distribution passes the 15 percentage-point category limit.

| Field | Category | Resolved | Unresolved | Resolved minus unresolved |
| --- | --- | ---: | ---: | ---: |
| Position | F | 2,430 | 1,090 | -0.5 pp |
| Position | D | 1,293 | 642 | -3.5 pp |
| Position | G | 588 | 186 | +3.9 pp |
| Age | 18–21 | 595 | 616 | **-18.3 pp** |
| Age | 22–24 | 1,239 | 558 | -0.4 pp |
| Age | 25–27 | 1,192 | 447 | +4.3 pp |
| Age | 28–30 | 709 | 178 | +7.2 pp |
| Age | 31+ | 576 | 119 | +7.2 pp |
| Contract level | ELC | 725 | 884 | **-29.3 pp** |
| Contract level | STD | 3,586 | 1,034 | **+29.3 pp** |
| Signing status | RFA | 1,494 | 413 | +13.1 pp |
| Signing status | UFA | 2,055 | 552 | +18.9 pp |
| Signing status | blank | 761 | 953 | -32.0 pp |

Position and year pass, and the full 32-team distribution has 8.4 percentage
points total variation, below the 20-point team threshold. The candidate is
underrepresented for ELC/young signings, however. The gate needs 280 added ELC
resolutions; selecting at least 59 of the overlapping age-18–21 records also
clears the age condition. This is the exact current failure, not an assumption
that every unresolved record must be recovered.

The source ledger leaves signing status blank in 1,714 total records (761
resolved and 953 unresolved). This is handled as a declared missing-status
stratum, never imputed and never repaired by guessing from an NHL ID. Its
predictions must report reduced coverage and wider uncertainty.

The command emits all team rows (`byTeam`), including resolved/unresolved
counts and percentage-point differences, so team coverage is reproducible
without a hand-maintained list in this document.

## MoneyPuck join and frozen chronology

Of the 4,311 resolved contract rows, 1,554 have at least one eligible local
MoneyPuck player-season before the conservative signing cutoff. They cover 959
players and 2,109 distinct player-season rows. The other 2,757 resolved rows
remain identity coverage only and are excluded from fitting rather than filled
with a future or synthetic season.

| Partition | Signing dates | Rows | Players | F | D | G | Sample gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Train | 2023-07-01 through 2024-06-30 | 390 | 356 | 231 | 116 | 43 | pass |
| Validation | 2024-07-01 through 2025-06-30 | 513 | 456 | 282 | 173 | 58 | pass |
| Holdout | 2025-07-01 through 2026-07-31 | 651 | 556 | 388 | 197 | 66 | pass, sealed for fitting |

For every contract, features may use only `situation=all` player seasons at
or before the completed-season cutoff: July–December signings use the spring
just completed and January–June signings use the preceding completed spring.
The contract cap percentage is the target and cannot be an input. The current
engine's deal-dependent cap/surplus terms, contract term, total value, expiry,
and any statistic after that cutoff are excluded from the price bridge.

The holdout is untouched by the proposed fit: this audit reads only its row
counts and required-field presence. Earlier MoneyPuck exposure means it is a
sealed protocol holdout for this calibration experiment, not evidence that a
future public activation has an independent prospective evaluation.

## Proposed common calibration target

Phase 5's shadow target is **observed annual cap share at signing**
(`capPct`), predicted from a pre-signing, deal-excluded F-NAV/D-NAV/G-NAV
input. Cap share is one observed unit across F, D and G, at the same signing
horizon, so a predicted 5.0% means the same share of the league cap regardless
of position. The shadow result is retained as `shadowExpectedCapShare`, not
published as a replacement headline NAV.

This calibrates the existing position-specific raw signals to a common economic
unit without claiming that a contract price is pure hockey impact, trade
fairness, or an independent asset-exchange label. Position, age band, level
and signing-status/missing-status strata are reported separately. Transaction
history is a later validation enhancement; no written NAV-01 Phase 5 or shadow
gate requires it.

## Frozen sample, uncertainty and performance gates

The executable audit freezes these minimums before any fit:

| Partition | Contracts | Players | F | D | G |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 250 | 175 | 100 | 60 | 25 |
| Validation | 120 | 90 | 50 | 30 | 15 |
| Holdout | 120 | 90 | 50 | 30 | 15 |

The next shadow fit must use a training-only, position-aware monotone mapping
from deal-excluded raw NAV inputs to cap-share percentage points. Its frozen
baseline is the training-only median cap share within position, level,
age-band and signing-status/missing-status strata. It passes only when, on
validation and then once on the sealed holdout:

1. aggregate MAE improves by at least 0.10 cap-share percentage points over
   the frozen baseline, with a paired 95% bootstrap lower bound above zero;
2. no F, D or G stratum worsens by more than 0.05 percentage points;
3. each position has calibration slope 0.85–1.15 and signed bias within 0.25
   percentage points; and
4. every result carries `coverage` (identity tier, pre-signing season count,
   status availability and cohort stratum) plus a bootstrap interval. Missing
   status or thin history widens the interval and prevents a high-reliability
   label; it is never zero-filled or silently dropped from reporting.

No coefficients, values, feature flag, public surface, or route migration are
authorized by this protocol.

## Phase 8 trade-canary finding

The repository's trade tests are useful behavioural regressions: they cover
proposal audit fail-closed behaviour, trade persistence/frozen snapshots,
overlay behaviour and synthetic AI-trade constraints. They are not a curated
shadow-versus-current NAV canary set: fixtures use manual/synthetic assets and
do not pin paired current/shadow player, team, trade and simulation outputs.
They are therefore insufficient for Phase 8. This does not block the current
Phase 5 cohort work; a later shadow implementation must add fixed, source-dated
cross-surface fixtures before Phase 8 can pass.

Verification: focused cohort/identity tests pass **9/9**; changed-file lint,
TypeScript, and the full suite pass **2,478/2,478** tests across 186 files.
