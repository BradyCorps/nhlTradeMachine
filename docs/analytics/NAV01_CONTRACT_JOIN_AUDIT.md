# NAV-01 local contract and identity audit — September 9, 2026

**Result:** historical contract data is present locally and can be joined to
the local NHL-ID sources for development coverage. It is not a complete,
as-of target dataset and cannot by itself calibrate composite asset value.

Reproduce from the repository root:

```sh
npx tsx scripts/backtest/nav-historical-data-audit.ts
npx tsx scripts/backtest/nav-historical-data-audit.ts --unresolved
```

The first command prints aggregate inventory and coverage only. The second
prints **only** the unresolved signing records (CSV row number, player, team,
position, signing date and reason) for review; it does not write an ID back
to the source ledger.

## Present and directly usable

| Source | Verified local content | Immediate NAV-01 use |
| --- | --- | --- |
| `OtherData/contracts/signings.csv` | 6,229 records dated 2017-07-01 through 2026-07-31, with player/team, cap hit, term, total value, date, level, cap percentage, position, age, status, expiry and structure | Observed contract price/cap-share target and signing-date coverage audit |
| `OtherData/contracts/NHL_Contract_signings.xlsx` | Present original workbook | Source preservation and workbook-to-CSV reconciliation when required |
| `OtherData/HistoricalData/goalies_2008_to_2024.csv` | ID-bearing MoneyPuck-shaped goalie seasons, 1,604 eligible all-situations rows | Historic goalie identity and performance joins |
| `MoneyPuckData/` | Eight local 2022-23 through 2025-26 skater/goalie files, 3,735 skater and 406 goalie eligible rows | NHL `playerId` identity joins and recent player-season inputs |

The joined identity pool contains 5,745 eligible ID-bearing rows for 1,671
distinct NHL IDs. It deliberately accepts only `situation=all`, numeric
`playerId`, and a nonempty name.

## Present but requiring identity resolution or date reconstruction

The signing ledger contains no NHL `playerId`. The audit uses the repository's
identity functions in increasing order of evidence: exact display name,
accent/punctuation-normalized name, then the explicit alias table or a
nickname/transliteration variant **only within the recorded team**. It uses
the recorded broad position (C/D/G/W) to separate same-name NHL IDs. A match
is accepted only when that key identifies one `playerId`.

| Identity result | Signing records |
| --- | ---: |
| Exact name (including a unique name-plus-position match) | 4,202 |
| Normalized presentation | 45 |
| Repository alias or same-team variant | 64 |
| Unmatched | 1,918 |
| **Total** | **6,229** |

All 1,918 unresolved records have **no local ID-bearing name candidate**;
none remains an ambiguous same-name collision after the position check. The
`--unresolved` command identifies those records and nothing else. It must be
reviewed or joined through a dated ID authority before an ID is persisted.

Of the 4,311 resolved identities, 1,833 have an accessible local player season
on or before the conservative pre-signing cutoff and 2,478 do not. The cutoff
uses a completed-season convention: July-December signings use the spring
just completed; January-June signings use the preceding completed spring.
Actual information availability, unusual calendars, contract effective dates,
market status, cap ceiling and roster/contract snapshots still need to be
reconstructed and frozen before a price or surplus model is fit.

Additional `OtherData` skater/goalie totals, bios, pairings and team files are
present, but their relevant player files carry names rather than NHL IDs. They
can provide candidate features or dates after a separately audited identity
join; they do not increase canonical-ID coverage by themselves.

`OtherData/2025_26Data` also contains NHL-ID-shaped 2025-26 skater and goalie
files; it is a local duplicate-era input, not an independent historical
source. Award and team-stat directories are present, but provide neither a
canonical player-contract join nor trade-value labels. They are therefore not
inputs to this identity count.

## Genuinely absent from this local inventory

- `OtherData/HistoricalData/skaters_2008_to_2024.csv` is absent locally. It
  is also listed in `.gitignore`; `git check-ignore` confirms the exclusion.
  The companion goalie file is present, so historical skater and goalie
  coverage must not be described as equally missing.
- No historical NHL trade or transaction export was found in `OtherData` or
  `MoneyPuckData`.
- No independent trade-value labels were found in those directories.

The database trade schema and its grades are not substitutes: a stored model
grade or verdict would be circular if used to validate the model that produced
it.

## What NAV-01 still requires before asking for another source

Contract-price work needs a dated canonical ID authority for the 1,918
unresolved signing rows, plus as-of contract/cap and performance snapshots to
validate that every feature predates the signing. Existing local data is
sufficient to build and audit that join protocol; it is not sufficient to
assume the unresolved records away.

Composite cross-position asset calibration additionally needs a historical
transaction dataset with a stable transaction ID, announced/effective date,
both teams, NHL player IDs, every exchanged asset (players, picks, rights,
retention and conditions), and source/provenance timestamps. It also needs a
non-circular independent outcome/label definition for those exchanges that
does not reuse NAV, stored grades, or a candidate-priced asset. That evidence
is required for the composite X-NAV target, not for merely resolving the
local contract ledger.

Focused audit tests cover exact/normalized/manual matching, collision handling,
team-scoped variants, dates and inventory presence. Full verification passes
2,474/2,474 tests across 185 files; TypeScript and changed-file lint pass. No
valuation, player ID, or source row is changed by the audit.
