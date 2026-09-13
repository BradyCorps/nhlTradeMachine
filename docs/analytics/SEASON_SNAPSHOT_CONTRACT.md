# Season Snapshot Contract (DATA-06 foundation)

Purpose: retain 2025-26 as its own analytical record and enter 2026-27
without relabelling or overwriting history. Additive, idempotent, immutable.

## Tables (`app/db/schema.ts`; `drizzle/0006_add_season_snapshots.sql`; `drizzle/0007_add_season_snapshot_batches.sql`; `drizzle/0008_add_snapshot_batch_member_uniqueness.sql`; `ensureSeasonSnapshotTables`)

`season_snapshot_batches` — one verified, immutable capture of both row
families. Its status is `CAPTURING`, `COMPLETE`, or `FAILED`; expected and
captured player/team counts, source/population metadata, action provenance,
and an integrity hash determine whether it is complete. See
`SNAPSHOT_PROVENANCE_CONTRACT.md`.

`player_season_snapshots` has two immutable identity domains. Legacy DATA-06
rows retain `id = "{season}:{asOf}:{modelVersion}:{playerId}"` with
`batch_id = NULL`. Verified rows use
`id = "{batchId}:player:{playerId}"`, allowing them to coexist with legacy
rows and with another legitimate verified batch without adopting or changing
any earlier row.

| Column | Meaning |
|---|---|
| player_id, team_id, position, nav_label | stable id, roster team at asOf, F-NAV/D-NAV/G-NAV |
| season | the season the row DESCRIBES |
| as_of | calendar day (YYYY-MM-DD) the valuation was struck |
| source, coverage | provenance; `completed-season` / `preseason-baseline` / `in-season` |
| stats_season, season_games_observed | which season's stats fed the engine; games of `season` itself in the inputs |
| contract_season | season of the contract ledger that priced the cap context |
| model_version, valuation_snapshot_id | X-NAV version; DATA-02 content-addressed id |
| total, components | headline and JSON `NavStage[]` (Σ = total) |
| market_value, surplus, uncertainty_low/high | FMV, FMV − cap hit, walk-forward band (null when absent) |
| contract, population | JSON contract snapshot; population definition |
| batch_id | verified capture batch; null means legacy/unverified and cannot be Labs provenance |

`team_season_snapshots` follows the same identity split: legacy rows retain
`id = "{season}:{asOf}:{modelVersion}:{teamId}"`; verified rows use
`id = "{batchId}:team:{teamId}"`. A partial unique index enforces one player
and one team member per non-null batch ID without constraining legacy rows.
Team rows contain:
signed `f_nav, d_nav, g_nav, xnav_signed` and positive-only
`f_nav_positive … xnav_positive`, `cap_ceiling`, `cap_committed`,
`roster_count`, same season/coverage/model fields. Aggregated through
`rosterNavByPosition`, so they reconcile exactly with the Teams page.

## Semantics

- **2025-26 (`completed-season`)**: stats 2025-26, 82 games observed,
  priced on the current (2026-27) ledger — the only ledger the app holds —
  and the row says so in `contract_season`. No historical contract is
  invented.
- **2026-27 (`preseason-baseline`)**: stats 2025-26, `season_games_observed
  = 0`, ledger 2026-27. No 2026-27 game, statistic or fitted value is
  invented; the row is an opening baseline, explicitly labelled.
- Writes are `INSERT … ON CONFLICT DO NOTHING`. There is no update path.
  Re-running a backfill inserts 0 and changes nothing (tested).
- Picks and players the engine skipped are omitted, never stored as 0.
- **Player eligibility:** verified player rows are only players whose `team_id`
  is one of the 32 canonical `TEAMS_DB` NHL franchises at capture. `FA_POOL`,
  draft-pick pools, placeholders, aggregates, and any other pseudo-team
  affiliation are outside this completed-NHL-roster contract. Their source
  records remain available to the free-agent and simulation flows; snapshot
  capture does not mutate or relabel them.
- **Team eligibility:** every verified batch has exactly one row for each of
  those 32 canonical franchises. Pseudo-team affiliations never create a team
  row or contribute to expected team count.

## Builder / backfill

`app/lib/season-snapshot.ts`: `seasonSnapshotContext(kind)`,
`buildSeasonSnapshotRows(players, navMap, ctx)`, `writeSeasonSnapshots(db, rows)`,
`seasonSnapshotInventory(db)`. `POST /api/admin/season-snapshots`
(`{ season: "completed" | "projected" | "both" }`) now calls
`captureSeasonSnapshotBatch` against the cached roster where the Turso
credentials live. It transactionally binds both row families to a batch before
marking it `COMPLETE`; `GET` lists verified batches separately from unbatched
legacy rows. No production migration or backfill was executed by this change.

Labs must use `requireCompleteSeasonSnapshotBatch(batchId)`, never a season
label or raw row inventory, as their dataset/provenance reference.

## Production migration procedure

Do not rely on `ensureSeasonSnapshotTables()` as the production migration
strategy: it is a runtime compatibility safety net only. During an approved
maintenance window, back up the Turso database and apply committed migrations
in order (`0006`, `0007`, then `0008`) with the repository's migration tool.
Read back `sqlite_master`/`PRAGMA table_info` to confirm the batch table, both
nullable `batch_id` columns, and the two partial unique batch-member indexes.
Then make a read-only authenticated GET to confirm the verified/legacy API
shape before authorizing a capture. The migrations are additive: they neither
delete nor rewrite rows and never infer batch membership for legacy rows.

## API exposure

Every league provenance (`/api/league`, `/api/league/players`,
`/api/league/teams`) now carries `seasonReference`:

```json
{
  "projectedSeason": "2026-27", "statsSeason": "2025-26",
  "projectedSeasonGamesObserved": 0, "contractSeason": "2026-27",
  "modelVersion": "X-NAV 4.2", "valuationAsOf": "YYYY-MM-DD",
  "valuationSnapshotIdScheme": "content-addressed: {playerId}-{asOf}-{sha256(inputs|asOf|model)[0:16]}",
  "seasonSnapshotIdScheme": "{season}:{asOf}:{modelVersion}:{playerId|teamId}",
  "coverage": "preseason-baseline"
}
```

The data rail prints it as a "Season reference" item on Players, Teams,
Trade Machine, Armchair GM and Fantasy; the player dossier renders a
read-only Season reference block with the valuation id.

## Tests

`__tests__/season-snapshot.test.ts` covers context semantics, legacy key
uniqueness, DATA-02 id carriage, component sums, pseudo-team exclusion, team
reconciliation, model-version refusal, idempotent write, immutability,
inventory, and API reference. `__tests__/season-snapshot-batch.test.ts` covers
the independent 32-team gate, batch-scoped row identities, legacy coexistence,
duplicate/missing membership rejection, immutable fingerprints, and idempotent
recapture.
