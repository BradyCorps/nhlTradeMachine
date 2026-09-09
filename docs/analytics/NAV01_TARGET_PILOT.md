# NAV-01 development target pilot — September 8, 2026

Verification completed September 9 after resuming the session: full suite
**2,464/2,464** across 183 files (0 failed), TypeScript passes; the pilot rerun
reproduces the counts below. Changed-file lint passed in the original run.

**Result:** diagnostic-input coverage is measurable and complete for the
checked fields; a calibration target dataset is not yet assembled.

Reproduce from the repository root:

```sh
npx tsx scripts/backtest/nav-target-pilot.ts
```

The command verifies the eight source checksums first, then prints aggregate
coverage and canonical-ID transition counts. Exit 0 means the coverage audit
executed, not that calibration passed; `calibrationReady` remains false.
No source rows or player-level targets are written. Tests cover quoted CSVs,
real zeros versus missing values, invalid seasons/workload, and duplicate
player rows. This pilot does not execute or fit NAV.

## Measured coverage

| Season | Forward rows | Defence rows | Goalie rows | Skater pairs into next season | Goalie pairs into next season |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2022–23 | 617 | 334 | 107 | 782 | 83 |
| 2023–24 | 609 | 315 | 98 | 778 | 80 |
| 2024–25 | 601 | 319 | 103 | 791 | 83 |
| 2025–26 | 615 | 325 | 98 | — | — |
| Total | 2,442 | 1,293 | 406 | 2,351 | 246 |

All **3,735 skater rows** have finite nonnegative individual points/xG and
on-ice xGF/xGA inputs. All have positive ice time and bench time plus off-ice
xGA, allowing a relative-xGA-rate diagnostic. All **406 goalie rows** have
finite nonnegative xGoals/goals inputs for a signed `xGoals - goals`
diagnostic. A zero is retained; blank/nonfinite/negative source counts are
missing or invalid, not silently converted to zero.

Eligibility here means `situation=all`, positive games and ice time, matching
season, numeric positive player ID, nonempty team and recognised position.
No minimum-sample reliability gate is claimed. Every checked all-situations
row passes those conditions; zero duplicate IDs within a source were found.
Duplicate all-situations rows would be excluded rather than guessed into a
traded-player total. Other situations are excluded to avoid counting the
same player's season repeatedly. Transition counts join eligible IDs only;
they are diagnostic pairs, not independent validation samples.

## Attribution and leakage findings

- Points, individual xG, on-ice xG difference and relative xGA are available
  ingredients, not independent individual net goals above replacement.
  This pilot neither assigns teammates' shared on-ice goals to individuals
  nor invents the replacement cohort.
- GSAx ingredients exist, but expected-shot performance is not the same
  reference as a replacement goalie. Their availability does not establish
  goalie/skater equivalence.
- All four source seasons are already exposed development data, as recorded
  in the manifest. Moving to consecutive-season pairs does not restore an
  untouched holdout.
- Season summaries alone do not establish which statistics were available
  on a midseason signing/trade date. Strict pre-signing cutoffs and historical
  input versions are required before economic targets can be constructed.

## Economic target access and join audit

`scripts/backtest/fmv-backtest.ts` names
`OtherData/contracts/signings.csv`. Its code selects standard one-way
contracts with cap percentage, signing date and signing age, then joins
performance by a normalised name and a prior-season cutoff. That is useful
join scaffolding, but a name slug is not a verified NHL-ID join. Its July
calendar cutoff is not a substitute for checking actual information
availability around unusual season calendars or midseason transactions.

The signings CSV has now been audited under the user-authorised data scope;
see `NAV01_CONTRACT_JOIN_AUDIT.md`. It contains 6,229 records and 4,311 resolve
to one local NHL ID through exact/normalized/manual rules. That closes the
claim that contract history is wholly absent. It does not create dated contract
or performance snapshots, and 1,918 records still lack an ID-bearing local
candidate.

`app/db/schema.ts` exposes a trades table with execution date, source URL,
season, sides, conditions and stored grades. This confirms schema support,
not live row availability or historical completeness; no production database
was queried. Stored `gradeAtTrade`/`lockedVerdict` values are model outputs,
not independent labels for a candidate NAV. A sourced as-of transaction export
and non-circular target definition remain necessary for composite validation.

## Next step and closure status

The **permitted-source diagnostic pilot** and local contract identity audit are
complete. The contract/trade portion of target construction remains open:
freeze dated joins, then obtain the historical transaction and independent
trade-value evidence specified in `NAV01_CONTRACT_JOIN_AUDIT.md`. Do not fit
calibration coefficients or mark NAV-01 complete from coverage results.
