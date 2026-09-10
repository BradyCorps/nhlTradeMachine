# NAV-01 market calibration protocol — September 9, 2026

**Decision: PROCEED with the market-only Phase 5 shadow calibration.** The
former ELC/young representativeness failure compared regulated ELC contracts
and players without pre-signing NHL evidence to an open-market model cohort.
That was the wrong reference population. No ELC contract will be trained as an
open-market cap-price label, and no manual resolution of the proposed 280 ELC
rows should occur for this purpose.

**Remediation status, September 10:** that calibration subsequently failed its
single frozen holdout and the 651 rows are now spent development-only evidence.
The gates remain unchanged. See `NAV01_PHASE5_REMEDIATION.md`; no replacement
candidate may open a new evaluation cohort until its feature set, transforms,
model class, baselines and gates are committed and checksummed.

Run the full local audit with:

```sh
npx tsx scripts/backtest/nav-calibration-cohort.ts --market
```

It classifies every signing, fits training-only baseline specifications, and
reports only aggregates. It does not fit a candidate NAV bridge, inspect the
sealed holdout target values, alter public NAV, or emit player rows.

## Mutually exclusive source universe

| Class | Definition | Contract rows |
| --- | --- | ---: |
| `market_calibration_eligible` | Standard negotiated contract, canonical NHL ID, valid target fields, and an eligible pre-signing MoneyPuck season | 1,554 |
| `elc_policy_constrained` | ELC compensation, which is CBA-constrained rather than an unrestricted market label | 1,609 |
| `no_pre_signing_nhl_sample` | Non-ELC contract with an ID but no eligible pre-signing NHL feature row | 2,032 |
| `identity_unresolved` | Otherwise eligible non-ELC contract without a canonical ID | 1,034 |
| Unclassified | — | 0 |

The 1,554 market rows cover 959 players: 901 forwards, 486 defencemen and 167
goalies. Of the 1,609 ELC rows, 725 have a resolved identity, but **zero of the
proposed 280 unresolved ELC resolutions can currently be shown to produce a
usable pre-signing MoneyPuck feature row.** The local ID-bearing source pool
has no candidate for those identities. Resolving them would therefore not
repair a market-calibration coverage gate.

ELC rows stay in production coverage through an explicit `policy_constrained`
fallback, labelled “ELC policy-constrained fallback; not an open-market
cap-share prediction,” with wider uncertainty. A player with no pre-signing
NHL sample receives the corresponding low-coverage fallback; neither class is
zero-filled or passed through a market model silently.

## Market-only reference and chronology

The reference distribution is the 1,554 market-calibration-eligible rows, not
the whole signing ledger. With that reference, both train and validation pass
the 15 percentage-point distribution gate for position, age and status, and
the 20-point team total-variation gate. Every partition passes its contract,
player and F/D/G floor.

| Partition | Signing dates | Rows | Players | F | D | G |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Train | 2023-07-01 through 2024-06-30 | 390 | 356 | 231 | 116 | 43 |
| Validation | 2024-07-01 through 2025-06-30 | 513 | 456 | 282 | 173 | 58 |
| Sealed holdout | 2025-07-01 through 2026-07-31 | 651 | 556 | 388 | 197 | 66 |

Features are limited to `situation=all` seasons on or before the conservative
completed-season cutoff. Actual cap percentage is the target. Actual cap hit,
surplus, term, total value, expiry, and all post-signing statistics are
excluded from model inputs.

## Baseline specifications, fitted on train only

| Baseline | Specification | Validation rows | MAE, cap-share pp |
| --- | --- | ---: | ---: |
| All eligible negotiated | Position × signing-age band median cap share, with position/overall fallback | 513 | 1.5503 |
| UFA/RFA status-controlled | Position × age band × UFA/RFA/Group-6/missing-status median, with hierarchical fallback | 513 | 1.5382 |
| Known-status sensitivity | Same status-controlled model after excluding blank status | 512 | 1.5406 |

The ledger has no explicit “extension” field. A blank `signStatus` is not
relabeled as an extension; it is a missing-status bucket in the controlled
baseline and excluded only in the sensitivity run. The near-identical
sensitivity result is descriptive baseline evidence, not a candidate NAV
result or a waiver of missing-data uncertainty.

## Common shadow target and frozen gates

The common Phase 5 target is **expected annual cap share at signing**, in
percentage points, from deal-excluded pre-signing F-NAV/D-NAV/G-NAV inputs.
Cap share is one observed unit at one horizon for all three positions, so it
can calibrate their raw signals without claiming that an ELC cap hit, trade
fairness, or public NAV is the target. The result remains the internal
`shadowExpectedCapShare` field until the later shadow and release gates pass.

The candidate must beat the frozen status-controlled baseline on validation,
then once on the sealed holdout: at least 0.10 percentage-point aggregate MAE
improvement with a positive paired 95% player-clustered-bootstrap lower bound;
no F/D/G MAE regression exceeding 0.05 points; calibration slope 0.70–1.30;
and signed bias within 0.25 points. Every output carries identity tier,
prior-season count, status availability, cohort class, and a bootstrap
interval. Missing or policy-constrained fields reduce coverage and widen
uncertainty.

The pre-holdout specification is written to
`docs/analytics/nav01-shadow-calibration-spec.json`. It fixes the smallest
candidate (position-specific affine raw-signal bridge with optional
UFA/RFA/missing-status offsets), its coefficients, transforms, baseline,
thresholds and SHA-256 checksum before any holdout label is evaluated. One
validation record (contract row 626) is excluded from fitting because its
ledger position is goalie but its resolved NHL ID has only skater data; the
workflow does not turn that skater record into a false goalie feature row.

## Phase 8 and external validation

The present synthetic/manual trade tests do not block Phase 5. Once shadow
values exist, build a frozen expanded trade-canary suite that pins paired
current/shadow values across player, team, trade and simulation fixtures.
Historical transaction data remains external validation work; it is not a
written prerequisite for this market-calibration fit or shadow output.

Verification: focused cohort/identity tests pass **10/10**; changed-file lint,
TypeScript, and the full suite pass **2,479/2,479** tests across 186 files.
