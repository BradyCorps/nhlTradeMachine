# NAV-01 evaluation readiness — September 8, 2026

**Decision: blocked for calibration; development source integrity passes.**

`nav01-evaluation-manifest.json` pins the eight explicitly permitted MoneyPuck
skater/goalie files for 2022–23 through 2025–26 with SHA-256 checksums. All
eight match the local files. The reference engine revision is
`bf7febb637661a3c545e8a1a80d8c9c7ca8b69d4`; the fetched `origin/main` tree
matched that revision when this audit began. The manifest records a baseline
reference, not new baseline scores or a production-engine replay.

## Reproduction

Run from the repository root:

```sh
npx tsx scripts/backtest/nav-evaluation-manifest.ts
npx tsx scripts/backtest/nav-evaluation-manifest.ts --gate
```

The first command exits 0 for matching source identities. `--gate` exits 2
for the intact but blocked protocol. Either exits 1 for an integrity error.
The report includes `calibrationReady: false` in both modes. This version
cannot authorize calibration or release even if someone fills its placeholders.
A subsequent reviewed protocol must implement the actual statistical gates.
The audit reads only eight explicit allowed paths, never discovers files in
ignored directories, and does not output or commit player-level source rows.

Verification: source audit **8/8**, readiness command **exit 2 (blocked)**,
focused tests **5/5**, full suite **2,459/2,459** across 182 files (0 failed),
TypeScript and changed-file lint pass. No production valuation code changed.

## Data availability and exposure

| Sources | Prior exposure | Permitted use for this work |
| --- | --- | --- |
| 2022–23 and 2023–24 skaters/goalies | NAV-01 positional backtest, NAV-02 fitting, NAV-03 diagnostics | Development/reproduction |
| 2024–25 skaters/goalies | Training/transition analysis in the same scripts | Development/reproduction |
| 2025–26 skaters/goalies | Published holdout findings and subsequent model audits | Historical audit/development; not a fresh untouched test |

Evidence paths are pinned in the manifest. See the headers and season lists
in `position-nav-backtest.ts`, `defense-model-individual-fit.ts`, and
`goalie-model-diagnostic.ts`, plus the NAV-01/02/03 increment record in the
consolidated backlog. “Untouched” in an earlier report describes that earlier
experiment, not availability for a new experiment chosen after its results.

This is an inventory of the frozen MoneyPuck inputs, not a complete asset-value
replay dataset. The subsequently authorised `OtherData` and `MoneyPuckData`
audit found local contract history, ID-bearing historic goalie data and
additional name-only skater/goalie inputs; see `NAV01_CONTRACT_JOIN_AUDIT.md`.
The freeze includes every row in the eight named files; calibration-specific
exclusions, derived features, missingness treatment and membership filters
remain unselected. Historical contract/age/roster joins, transactions and
independent trade labels are not frozen by these checksums.

## What remains before a statistical protocol can be frozen

1. Define the estimand: shared unit, replacement/reference level, time
   horizon, and the relationship between on-ice contribution and economic
   asset value. The model card currently describes dimensionless NAV points;
   matching existing F/D/G distributions cannot establish equivalence.
2. Identify defensible individual contribution and economic targets, with
   independent data provenance and historical input joins. The existing D
   model's within-roster signal is not an absolute team-strength measure;
   goalie concurrent GSAx tracking is not itself a cross-position value test.
3. Before inspecting new evaluation outcomes, freeze eligibility, feature
   derivations, missingness rules, train/validation/holdout membership,
   primary metrics, minimum samples, uncertainty method and numerical
   improvement/non-regression thresholds for F/D/G and their workload groups.
4. Execute baseline and candidate through the same production path and
   publish reproducible scores. Adequacy/retention evidence from NAV-03 does
   not waive this new calibration test.

These fields are explicitly null in the manifest. No numerical thresholds
are invented before the unit, target and sample are defined, and no reused
season is promoted to independent evidence. The next scoped task is an
estimand/target and independent-data feasibility decision. If that decision
finds the required value unidentifiable, keep NAV-01 open and name the missing
data or request an explicit scope change; do not fit a cosmetic conversion.
