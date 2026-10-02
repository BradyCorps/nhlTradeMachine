# 2026–27 observed-statistics rollover and historical preservation

Audited 2026-10-02 from `origin/main` at `cf70af1eb993d71e696bbd9be884728dbf6e3091`.
Branch: `season-preservation-rollover`. PR #33 stays unmerged at
`c3337e8d939e343c1c380989f110474c11565ef5`; its completed evidence is unchanged.
No Labs development, schema migration, Production mutation, merge or deploy belongs to this pass.

## Preserved inputs and records

The [machine-readable audit](audit-2026-10-02.json) records sizes, SHA-256 digests,
source URLs and capture times. The four tracked 2025–26 inputs are MoneyPuck
skaters/goalies and Natural Stat Trick skater/pairing CSVs. Their digests match
`scripts/moneypuck-baseline-sources.json`. The MoneyPuck CSVs also match the
2025–26 source digests recorded by the fitted artifacts, despite the artifacts'
older `OtherData/2025_26Data/` path names. The tracked baseline artifact and
skater FMV, goalie FMV, stability, goal-value and diagnostic Gravity v4 artifacts
remain unchanged. Their presence preserves computed models, not every fitting input.

Authenticated read-only `/admin/labs` accepted this existing COMPLETE batch:

| Identity | Verified value |
| --- | --- |
| Batch | `snapshot:2025-26:2026-09-13:X-NAV 4.2:5af40ed576d53014` |
| Full integrity fingerprint | `5af40ed576d53014d16f1048a1977a84f865a5019631ea19615e5cf2b44e0b39` |
| Membership | 1,417/1,417 players; 32/32 teams |
| Captured | 2026-09-13 01:54:40.075 UTC |
| Context | completed 2025–26 season; X-NAV 4.2; as-of 2026-09-13 |

The overview also reports 1,428 player and 33 team legacy rows, explicitly
unverified. They must remain separate from verified membership. Candidate,
protocol and evaluation-run inventories remain empty. The approved Admin key
was used only in memory for authentication and read-only inventory/target checks.
The snapshot inventory GET was deliberately not used because it calls a schema
ensurer. Public observations never read or recompute archived valuation rows.

Preservation gaps:

- No independent, current Production restore was created or verified here.
  The older September 12 recovery database documented in the operations runbook
  predates this batch. A live COMPLETE record is not a disaster-recovery copy.
- Historical upstream JSON remains available, but full NHL summaries, player
  landings, game logs and EDGE have not been established as a complete durable
  off-workspace archive. The probe bodies are temporary local evidence only.
  Raw EDGE snapshot inventory/completeness was not inferred from a COMPLETE
  analytical batch: they are different stores.
- `OtherData/HistoricalData/skaters_2008_to_2024.csv`, recorded by several fits,
  is absent at that Git path. Goalie-history and contract-signing source paths
  have tracked Git objects, but their contents were not inspected because of
  `.codexignore`. Full fitting reproducibility therefore remains unverified.
- Public historical statistics apply to the current player catalogue/roster,
  with current contracts. This does not introduce a historical roster browser
  or an archived NAV browser. The archiver discovers historical participants
  from summaries, including players absent from today's roster.

## Upstream availability

Complete NHL summary requests returned HTTP 200, exact total/row agreement,
and only the requested season IDs at 17:13:47–49 UTC on 2026-10-02:

| Selection | Skaters | Goalies | Teams | GP coverage |
| --- | ---: | ---: | ---: | --- |
| 2026–27 regular season | 455 | 31 | 25 | observed 1–2 GP |
| 2025–26 regular season | 940 | 98 | 32 | teams 82 GP; skaters can exceed 82 after trades |
| 2026–27 playoffs | 0 | 0 | 0 | missing coverage; not confirmed zero GP per player |
| 2025–26 playoffs | 347 | 25 | 16 | separate playoff records |

McDavid's season-specific EDGE requests returned 2 GP/7 points for 2026–27
regular season, 82 GP/138 points for 2025–26 regular season, and 6 GP/6 points
for 2025–26 playoffs. His 2026–27 playoff request returned 404. Bobrovsky's
2026–27 regular-season goalie EDGE request returned 1 GP. EDGE's options list
advertises 2026–27 regular season, and historical regular season/playoffs.
Player landing's featured line now describes 2026–27, while `seasonTotals`
retains historical season and game-type identities.

The [NHL EDGE Skaters page](https://www.nhl.com/nhl-edge/skaters) was browser-audited:
separate Season Options and Game Type Options controls, current season first,
historical options back to 2021–22, and explicit `/20262027/2` requests. The
public implementation follows this separation using accessible native selects,
initially exposing the verified 2025–26 historical season only.

## Readers, ingestion and caches

| Boundary | Previous behavior | Bounded change |
| --- | --- | --- |
| `SEASON.apiSeasonId` | already 20262027 | current observations and feed jobs use it |
| `SEASON.nhleSeasonId`, `mpSeason`, `replaySeason` | 20252026 / 2025 / 2025–26 | retained as explicit historical model inputs |
| Canonical roster fallback | requested 2025–26 roster after `/current` failure | requests explicit 2026–27 roster |
| Model NHL summary/point-share/MoneyPuck readers | historical model inputs under shared source-cache keys | remain historical; never receive selected observations |
| `/api/league` and `/api/league/players` | only historical analytical payload | explicit `season` + `gameType` observation overlay; original analytical fields/NAV preserved |
| Current standings enrichment | could enrich historical records with `/standings/now` | requires matching season identity; selected records use only selected summaries |
| Players tab memory and in-flight requests | one payload independent of selection | qualified identity, abort/ignore superseded requests; wrong-identity rows never render |
| `/api/player-edge/{id}` | historical-only full-table scan plus schema ensure | selected indexed read, then explicit upstream path; no DDL/capture writes |
| Goalie dossier EDGE | historical canonical model detail | selected detail, existing parser, explicit context/coverage |
| Feed cron/admin/backfill scripts | wrote requested history from current rosters/featured landing | default current regular season; exact landing season parsing; Admin rejects other write identities |
| Aggregate caches | could retain pre-fix mixed-season payloads | new model-season/regular-season/roster-season namespaces |
| Observation caches | none | `cache:observed:v1:<season>:<gameType>:<report-or-player>`; five-minute freshness, no cross-identity fallback |

Unqualified league API callers retain the analytical contract used by Armchair
GM/calculators. Public Players/Teams selectors explicitly request 20262027/2
by default. The new observation overlay never replaces canonical `games`,
`ptsPace`, MoneyPuck fields or `navMap`. Dossier NAV still uses
`calculateAssetNAV → calcNAV`. No model, calibrated 82-game normalization,
analytical fixture, flag or archived valuation was changed.

Season and competition are preserved in page URLs, list/dossier/team links,
source requests, response metadata, SQL predicates, cache keys and labels.
Invalid or ambiguous selections fail closed. A missing selected row remains
null/unavailable; only an explicit upstream zero-GP row becomes `zero-games`.
Playoff records do not fabricate regular-season OT-loss totals. Current
contracts/NAV and historical model-derived comparisons are separately labelled.
EDGE league comparisons come from the selected EDGE response.

Existing raw storage needs no migration: legacy sources (`landing`, `edge`,
`goalie-detail`, etc.) were exclusively regular-season captures from `/2`.
Selected playoff reads use qualified sources such as `edge:3`; absent rows are
read from the explicit upstream `/3` path without capture. No playoff ingestion
job or new mutation endpoint is introduced. Existing writers remain regular-only.

## Archive preparation

Reuse `scripts/nhl-archive/crawl.py`; no new dependency or ingestion path.
The old harvest used only 100 summary rows, omitted player EDGE, and requested
`standings/now` while labelling a historical harvest. The corrected plan uses
full summaries with explicit season/competition, season rosters and club stats.
With `--include-player-details`, it discovers all historical participants and
archives their landing JSON, game logs and skater/goalie EDGE. Current featured
landing fields must never be treated as historical fields; season totals are
selected explicitly by the existing parser.

Content-addressed compressed objects and an append-only manifest retain source
URLs, fetch times, statuses, byte lengths and SHA-256. Existing objects are
verified before reuse; corrupt objects cannot be overwritten. Truncated,
wrong-season or unavailable summaries fail closed. A 404 records missing
coverage; it does not establish zero games. Other failed requests leave a
manifest and nonzero exit for retry. Verification reads every stored object,
checks digests/sizes, required request coverage and full summary membership.

Prepare on an approved archive volume, separate from Production and Redis:

```sh
python3 scripts/nhl-archive/crawl.py harvest --archive-dir "$SEASON_ARCHIVE_DIR" --seasons 20252026 --game-types 2,3 --include-player-details --dry-run
python3 scripts/nhl-archive/crawl.py harvest --archive-dir "$SEASON_ARCHIVE_DIR" --seasons 20252026 --game-types 2,3 --include-player-details
python3 scripts/nhl-archive/crawl.py verify --archive-dir "$SEASON_ARCHIVE_DIR" --seasons 20252026 --game-types 2,3 --include-player-details
```

The dry run lists 102 base requests plus discovered player-detail requests.
This pass ran the dry run and offline integrity tests, not a complete operational
harvest. Copy the verified archive, manifest, tracked raw inputs/source manifest,
committed artifacts and reviewed Git identity to durable off-workspace storage;
verify the copy again.

## Concrete Production rollout awaiting authorization

1. Review this PR independently of PR #33. Confirm exact final head, CI/Preview
   evidence, applicable required checks, and independent Preview database scope.
2. Complete and verify the 2025–26 archive above on an approved durable volume.
   Resolve/record missing fitting inputs; retain existing archived artifacts.
3. Follow [Production recovery verification](../PRODUCTION_DATABASE_OPERATIONS.md#pre-migration-recoverability-test)
   to create an independently readable fresh PITR target. It must contain this
   exact COMPLETE batch, its 1,417/32 membership, full fingerprint, legacy counts,
   journal and unchanged immutable analytical rows. Preserve the original DB.
   No migration is required for this application change.
4. Only after separately authorized merge/deployment, verify the exact resulting
   main commit and Vercel Production deployment identity. Warm the public selected
   reads for both seasons/types. New cache namespaces prevent old aggregates
   from leaking; do not globally reset settings or overwrite historical data.
5. If current raw snapshot capture is authorized, use existing Admin feed with
   `{ "season": "20262027", "gameType": 2, "skaters": true, "discover": true }`
   and the existing bounded `offset`/`nextOffset` loop; repeat for
   `{ "season": "20262027", "gameType": 2, "goalies": true, "discover": true }`.
   The cron continues its current-season rotation. Record coverage/failures.
   Do not call season-snapshot capture or recapture the verified historical batch.
6. Recheck selected statistics and EDGE provenance/coverage, historical batch
   fingerprint and membership, legacy counts, empty Labs inventories and frozen
   analytical outputs. Keep zero GP separate from absent coverage.

Application rollback restores the prior reviewed Production commit through the
existing Git/Vercel procedure. Current-season raw rows may remain additive;
do not relabel/delete history. Database recovery uses the verified independent
copy, without replacing the original DB. Keep the archive and recovery evidence.

## Verification

Focused tests exercise actual isolated libSQL reads, selected regular/playoff
cache separation, wrong identities, missing/zero coverage, capture parsing,
unchanged historical snapshots and canonical valuation payloads. Existing
snapshot-batch/backfill and Phase 0 fixtures are reused unchanged.
`scripts/verify-season-selection.mjs` checks only this selector with isolated
response fixtures: Players at 320/412px, URL reload/link persistence, keyboard
selection/tab order and Teams switching. It is not a repeated public-site audit.
Final local gates: 2,619/2,619 tests across 206 files; Phase 0 baseline 10/10;
TypeScript clean; lint 0 errors and 4 pre-existing warnings; production build
30/30 static pages. The full suite/build were repeated after the Back-navigation
correction revealed by the initial full-suite failure. Focused development checks
passed 65 tests, then 24 affected checks after that correction. Hosted evidence
is recorded in the PR against its final head.
