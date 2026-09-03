# Season Snapshot Contract (DATA-06 foundation)

Purpose: retain 2025-26 as its own analytical record and enter 2026-27
without relabelling or overwriting history. Additive, idempotent, immutable.

## Tables (`app/db/schema.ts`; `drizzle/0006_add_season_snapshots.sql`; `ensureSeasonSnapshotTables`)

`player_season_snapshots` — one row per `(season, asOf, modelVersion, playerId)`,
`id = "{season}:{asOf}:{modelVersion}:{playerId}"`.

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

`team_season_snapshots` — `id = "{season}:{asOf}:{modelVersion}:{teamId}"`:
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

## Builder / backfill

`app/lib/season-snapshot.ts`: `seasonSnapshotContext(kind)`,
`buildSeasonSnapshotRows(players, navMap, ctx)`, `writeSeasonSnapshots(db, rows)`,
`seasonSnapshotInventory(db)`. `POST /api/admin/season-snapshots`
(`{ season: "completed" | "projected" | "both" }`) runs it against the
cached roster where the Turso credentials live; `GET` lists the inventory.
No production migration or backfill was executed by this change.

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

`__tests__/season-snapshot.test.ts` (13): context semantics, key
uniqueness, DATA-02 id carriage, component sum, team reconciliation, model
version refusal, idempotent write, immutability, inventory, API reference.
