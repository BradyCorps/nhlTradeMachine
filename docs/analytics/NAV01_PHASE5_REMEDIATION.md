# NAV-01 Phase 5 remediation — September 10, 2026

## Status

The 651-row 2025–26 holdout is now **development-only spent evidence**. It is
explicitly ineligible for future selection, tuning, or certification. The
frozen Phase 5 gates are unchanged. No public NAV value, flag, snapshot, or
consumer surface changed.

The local development universe contains 390 train rows, 512 usable validation
feature rows, and the 651 spent rows. The one-row difference from the original
513-row validation reference remains contract row 626: its ledger position is
goalie while its resolved NHL ID is a skater, so it is excluded rather than
inventing a goalie feature record.

## Residual diagnostics

`scripts/backtest/nav-phase5-remediation.ts` writes the complete, grouped
diagnostic table to `docs/analytics/nav01-phase5-remediation.json`. It reports
rows, players, MAE, signed bias, calibration slope and rank correlation by
position, signing year, age band, UFA/RFA/missing status, term, structure,
team, and pre-signing role. Term and contract structure are diagnostic strata,
not candidate inputs: they are deal outcomes rather than pre-signing player
information.

The usable development evidence identifies three distinct failures:

| Position | Precise cause | Consequence |
| --- | --- | --- |
| F | The status offset is not the cause: its mean-offset variant changes first-fold MAE only 1.4114 → 1.4065 and worsens the spent-fold 1.4975 → 1.5007. Raw-model bias moves from -0.2678 to -0.1045 pp, while one-way and two-way deals have opposite residual directions. | This is time/cohort intercept drift and contract-structure mixture, not a stable UFA/RFA conditional correction. The one-parameter prior-fold intercept correction worsens spent-fold MAE to 1.5747 pp. |
| D | The existing raw D signal has weak market ordering in both folds (rank correlation 0.2330 and 0.2404) and negative calibration slopes (-0.7824 and -0.8580). The problem is not evidence that D-NAV is invalid as a hockey-performance measure; it is too narrow to price a defenceman's total market. | Preserve D-NAV as the performance output. Use a separate market bridge with pre-signing production, defensive impact, deployment rank, age and D raw signal. |
| G | Bias reverses between folds (-0.7968 then +0.2873 pp); status adjustment does not correct it. The small starter stratum (17 rows) has -1.3907 pp bias while backups have +0.4862 pp. | A global goalie intercept is not stable. The prior-fold intercept correction makes spent-fold bias +1.0841 pp and MAE 1.6051 pp. More historical goalie-role coverage is required before adding a role interaction. |

## Development-only candidate comparisons

Each evaluation uses player-clustered bootstrap intervals with 1,000
replicates. The second fold uses the spent holdout for diagnosis only.

| Position / candidate | 2023–24 → 2024–25 | 2023–25 → spent 2025–26 | Finding |
| --- | --- | --- | --- |
| F raw affine | MAE 1.4114; bias -0.2678; slope 0.7941; rank 0.6451 | MAE 1.4975; bias -0.1045; slope 1.2466; rank 0.6086 | Directional ordering is stable, but the first-fold bias interval remains negative (-0.5448, -0.0102). |
| F status-mean | MAE 1.4065; bias -0.2765 | MAE 1.5007; bias -0.1066 | No stable improvement over raw affine. |
| F rolling intercept | — | MAE 1.5747; bias +0.1632 | Rejected: it worsens error. |
| D raw affine | MAE 2.0322; slope -0.7824; rank 0.2330 | MAE 1.9710; slope -0.8580; rank 0.2404 | Rejected. |
| D market bridge v1 | MAE 1.4561; bias +0.0303; slope 1.0265; rank 0.6809 | MAE 1.2684; bias -0.1285; slope 0.9819; rank 0.6404 | Stable and materially stronger; eligible to be pre-registered, but not to open a holdout until F/G are also ready. |
| G raw affine | MAE 1.4631; bias -0.7968; slope 2.0819 | MAE 1.0701; bias +0.2873; slope 1.0279 | Rejected: bias and slope are unstable. |
| G status-mean | MAE 1.4816; bias -0.8109 | MAE 1.0679; bias +0.2774 | No stable improvement over raw affine. |
| G rolling intercept | — | MAE 1.6051; bias +1.0841 | Rejected: it amplifies the time-varying bias. |

`D-market-bridge-v1` uses only pre-signing `positionalNavRaw`, points pace,
defensive-impact measure, MoneyPuck deployment rank, and signing age. It does
not read cap hit, contract value, term, retention, or post-signing performance.
Its bootstrap MAE intervals are 1.2758–1.6450 and 1.1071–1.4372 pp in the two
folds. This supports a distinct market-price bridge while retaining D-NAV's
separate hockey-performance meaning.

## Readiness and new evidence

No complete F/D/G candidate is ready for another frozen holdout. D has a
promising bridge, but F needs a stable pre-signing calibration treatment and G
needs enough goalie-role history to establish whether a role interaction is
repeatable. The next model class, transformations, baseline comparison, and
unchanged gates must be committed and checksummed before any new evaluation
cohort is opened.

The minimum separate, never-developed certification cohort remains the frozen
floor: **120 contracts and 90 players overall, including 50 F, 30 D, and 15
G**. These are minimum new rows by position; the spent 651 rows cannot count
toward them. The 2026–27 signing cohort remains the strongest forward-time
confirmation before unrestricted public activation.

## Historical skater data attempt

No local ID-bearing pre-2022 MoneyPuck skater-season files exist. The official
MoneyPuck download page publishes season data, but its automated endpoint
returns a data-license page requesting an agreement for scraping. No bypass was
attempted. The required acquisition is therefore a licensed or manually
provided 2017–18 through 2021–22 all-situations skater archive containing NHL
`playerId`, season, position, games, ice time, production, expected-goals,
on-ice defensive, and deployment fields. It will expand development and allow
a newly frozen evaluation cohort; trade transactions and ELC resolution remain
unrelated to this remediation.
