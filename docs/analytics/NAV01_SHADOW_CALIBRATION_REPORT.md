# NAV-01 Phase 5 market-only shadow calibration — September 9, 2026

**Decision: FAIL.** The public NAV model remains in place. This increment
writes only the frozen shadow specification and comparison report; it does not
set a feature flag or change a consumer surface.

The specification was committed before holdout evaluation in `62411bf` and is
identified by SHA-256
`ac9154272fe14031c3d3a3bbfda0f1fdac0e4889ad6940126e265d171c35d111`.
`scripts/backtest/nav-shadow-calibration.ts --holdout` then made one holdout
run against that exact specification.

## Frozen method

- Cohort: 1,554 market-calibration-eligible negotiated contracts; date split
  390 train / 513 validation / 651 holdout.
- Inputs: the latest `situation=all` NHL player season before signing. The
  raw signal is `calcContractIndependentPositionalNavRaw`: F/D use only the
  `off + def + age + grav` stages and G uses only `impact`. It zeroes cap hit,
  extension cap, retention and last cap hit, uses a fixed three-year horizon,
  and excludes every target-contract term and surplus.
- Target: signed annual cap share in percentage points. The affine bridges map
  F, D and G raw signals onto that same unit. Dollar market value is then
  `calibratedCapSharePp / 100 × signing-date cap ceiling`; surplus is calculated
  only afterwards as `marketValue − actualCapHit`.
- Baseline: training-only position × signing-age-band × signing-status median.
  The validation-selected candidate is a position-specific affine bridge with
  UFA/RFA/missing-status residual offsets. It uses 390 rows and 356 players.
- Uncertainty: 1,000 deterministic player-clustered bootstrap replicates.
  The 513-row validation reference has one non-fit integrity exception: contract
  row 626 labels canonical NHL skater ID `8476473` as a goalie. It is preserved
  in the cohort audit but excluded from feature fitting instead of fabricating a
  goalie row, leaving 512 validation feature rows.

## One-time holdout comparison

All errors and calibration quantities below are cap-share percentage points.
Signed bias is prediction minus signed cap share. “MAE Δ” is baseline MAE minus
shadow MAE, so positive is better.

| Unit | Rows / players | MAE | Median AE | RMSE | Slope / intercept | Signed bias | Rank correlation | MAE Δ / relative | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Overall | 651 / 556 | 1.5151 | 1.1043 | 2.2460 | 1.0220 / 0.5815 | -0.6187 | 0.4464 | +0.0334 / +2.16% | **FAIL** |
| F | 388 / 330 | 1.4882 | 0.9599 | 2.2740 | 1.0728 / 0.6964 | -0.8106 | 0.6045 | +0.0551 / +3.57% | **PARTIAL** |
| D | 197 / 167 | 1.7975 | 1.2501 | 2.3702 | -0.1199 / 2.4878 | -0.2223 | 0.2288 | -0.2356 / -15.08% | **FAIL** |
| G | 66 / 59 | 0.8301 | 0.2031 | 1.6094 | 1.2304 / 0.3490 | -0.6735 | 0.5384 | +0.7093 / +46.08% | **PARTIAL** |

The aggregate improvement misses the frozen 0.10-point requirement by 0.0666
points. Its player-clustered 95% bootstrap interval is **-0.0701 to +0.1546**,
which also fails the predeclared positive-lower-bound gate. F and G improve
MAE but exceed the 0.25-point signed-bias gate. D regresses by 0.2356 points
and has an invalid calibration slope. These failures make the aggregate result
FAIL even though the goalie cohort is reported separately and has a large MAE
gain.

Mean calibrated market value / mean surplus were $1.688M / -$0.672M overall,
$1.562M / -$0.870M for F, $2.031M / -$0.266M for D, and $1.408M / -$0.718M for
G. These are shadow diagnostics, not displayed values.

## Frozen sensitivity results

| Training specification | Eligible | Holdout rows | Overall MAE | Notes |
| --- | --- | ---: | ---: | --- |
| Uncontrolled eligible cohort | Yes | 651 | 1.5902 | Worse than selected status-controlled bridge. |
| UFA/RFA/missing-status controls | Yes | 651 | 1.5151 | Validation-selected primary bridge. |
| Blank signing-status excluded | Yes | 651 | 1.5902 | Same fitted result here because no holdout row remains in the blank-status stratum. |
| UFA-only | Yes | 444 | 1.4937 | Clears the frozen per-position floor; D remains non-calibrated (slope -2.4955). |

ELC policy-constrained contracts and players without pre-signing NHL features
remain explicitly labelled fallback coverage with wider uncertainty. They were
not imputed or used in the fit. The machine-readable result is
`docs/analytics/nav01-shadow-calibration-report.json`.
