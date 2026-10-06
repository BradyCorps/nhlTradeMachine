# STRAND evolution (stage 2)

A compact panel in the player dossier that shows how a skater's *measured*
profile changes through a season (checkpoint vs latest) and against last
season's full-season rates. Descriptive only. Independent of NAV: no module in
this feature imports a valuation, gravity, snapshot-batch or flag module (tested).

## Data feasibility: where every STRAND trait comes from

| Trait | Actual source and definition | Season / type | Kind | Update | Genuine 2026-27 value in this app? | As-of history recoverable? | Limits |
|---|---|---|---|---|---|---|---|
| OPS | Point-share formula over NHL stats-REST skater and team summaries (`roster-assembly.fetchPointShares`) | `SEASON.nhleSeasonId` = 2025-26, regular | cumulative, formula-specific | cached (Redis) | **No.** Formula is computed for the frozen baseline only. | No dated inputs stored | Needs final team/league totals |
| DPS | Same formula; defensive half uses team GA and +/- | 2025-26 | cumulative | cached | **No** | No | Same |
| xG | MoneyPuck season-summary CSV, `I_F_xGoals`, scaled to /82 and **shrunk toward a positional default by g/25** | `SEASON.mpSeason` = 2025, regular, all situations | rate, shrunk | cached | **No.** No 2026 MoneyPuck ingest. | No | The stored number is not a raw rate |
| NOIV | MoneyPuck on/off xG share, `(onXgPct − offXgPct)·100`, **scaled by min(1, g/30)** | 2025, all situations | rate, shrunk | cached | **No** | No | Same |
| SUPP | MoneyPuck on/off xGA/60 difference, scaled by min(1, g/30) | 2025 | rate, shrunk | cached | **No** | No | Same |
| QoC | Derived from MoneyPuck `iceTimeRank` and 5v5 zone starts (`calcQocIndex`) — a proxy | 2025 | contextual, derived | cached | **No** | No | Not a measured competition rating |
| OZ Starts | MoneyPuck 5v5 `I_F_oZoneShiftStarts / (o+d)` | 2025, 5v5 | contextual share | cached | **No** | No | Shift *starts*; NHL EDGE zone *time* is a different measurement |
| TOI | MoneyPuck `icetime / games` (baseline); NHL summary `timeOnIcePerGame` (observed reader) | any season, all situations | rate | NHL summary refreshes on request (SWR 5 min) | **Yes** (NHL summary, whole seconds) | Only if captured | Same definition either source |

Not every STRAND input is available from NHL EDGE, and none of the above comes from it
except zone *time*. The evolution panel therefore uses the traits that genuinely
update this season, each as a rate with its exposure:

| Evolution trait | Source | Update | Notes |
|---|---|---|---|
| PTS/GP | NHL stats summary `points / gamesPlayed` | per request, cached 5 min | different from OPS |
| TOI/GP | NHL stats summary `timeOnIcePerGame` | same | same definition as STRAND TOI |
| SOG/GP, HD SOG/GP | NHL EDGE `sogSummary` (`all`, `high`) `/ player.gamesPlayed` | EDGE reader, cached 5 min; nightly capture rotates 4 teams/night over 8 days | shots on goal carry no quality; not xG |
| OZ TIME | NHL EDGE `zoneTimeDetails.offensiveZonePctg` | same | not OZ Starts |

EDGE traits are only combined with the summary when `player.gamesPlayed` equals the
summary's GP; otherwise they are shown as missing with the reason.
The seven STRAND traits above are listed in the UI as "not available for the current
season". They are never carried over from 2025-26 into a "current" profile.

## Which checkpoints exist today

**None.** The checkpoint tables are new and unapplied. Existing dated records
(`nhl_snapshots` `edge`/`landing` rows, daily ids) hold GP, goals/assists/points and
EDGE payloads at capture dates, but the nightly cron rotates four teams a night, so a
given player is captured about once per eight days, and TOI is not stored. No
reconstruction has been attempted; if one is done later it must be stored with
`status = 'reconstructed'` and only where GP, points, TOI and EDGE all come from the
same dated capture. Production was not inspected.

## Checkpoint rules (all tested, `__tests__/strand-evolution.test.ts`, `strand-checkpoints.test.ts`)

- Targets 10, 20, 40, 60 GP and season end (`END`), regular season only.
- A capture counts toward a target only inside `[target, target + 5]` GP
  (`MILESTONE_MAX_OVERSHOOT`). First seen at 12 GP is stored and shown as
  "12 GP (first capture after the 10-GP target)". Beyond the window the target stays
  unavailable.
- Insert-only. Database triggers abort UPDATE and DELETE on both tables.
- Retry with identical player inputs inserts nothing, even if the league field moved.
- Same GP, changed inputs (a source correction) inserts revision n+1 with
  `supersedes_id`; the original is retained and the UI says "Source correction".
- A later GP for an already-captured target is ignored.
- Each row stores: stable NHL id, season, game type, target, revision, status,
  observed GP, capture time, `source_as_of` (null: NHL feeds expose none),
  definition version, raw inputs with nulls for missing, per-trait missing reasons,
  the pinned reference cohort id, and provenance (summary report and retrieval time,
  EDGE row capture time, plan reason).
- Reference cohorts are content-addressed (sha256) and immutable: same-position-group
  skaters with at least `target − 5` GP (≥ 20 for `END`) at capture, with the
  sorted values per trait, so every percentile can be reproduced exactly.

## Comparison rules

- Rates only; exposure printed in each cell. No cumulative totals compared.
- A checkpoint comparison ranks both profiles in the checkpoint's one pinned cohort, so
  a percentile change is the player's. The cohort's median is shown for context.
- Baseline (2025-26) vs latest uses each season's own live cohort. Percentiles are shown
  but **not differenced**; compare the raw rates. EDGE traits have no live league cohort,
  so their percentiles appear only for pinned checkpoints.
- No blending weights, no overall improvement score. Summaries are neutral sentences
  ("Higher shots-on-goal rate than the 12 GP checkpoint (2.50 → 3.10)").
- Under 20 GP on either side the panel says rates over a few games do not show a
  lasting change in ability.
- Playoffs: unsupported (not equivalent to a regular-season baseline).

## Rollout (not done here)

1. Apply `drizzle/0012_add_strand_checkpoints.sql` through the journaled runner
   (`scripts/db-migrate.ts`). Additive; creates two tables, two indexes, four triggers.
   Until then the panel reads as "checkpoint store not available" and the page works.
2. Wire `captureStrandCheckpoints(db, args)` (`app/lib/strand-checkpoints.server.ts`)
   into the existing `/api/cron/nhl-feed` after `capturePlayerSnapshots`, with ONE league
   summary request (`readObservedSummary`) and `latestStoredEdge` for the EDGE inputs.
   No per-viewer capture and no extra upstream request per player. Nothing calls it today and
   no scheduled write was added. Because the cron rotates 4 teams a night, run the capture
   for the whole league from the shared summary (cheap) rather than only the night's teams,
   or the 5-GP window can be missed.
3. Call it with `seasonComplete: true` once after the final regular-season game.
4. Production will first show checkpoints from the first window it observes; earlier
   targets stay unavailable by design.
