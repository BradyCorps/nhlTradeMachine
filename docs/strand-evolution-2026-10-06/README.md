# Season profile evolution (stage 2)

A compact panel in the player dossier, titled **Season profile evolution ·
current-season observations**. It shows how a skater's *measured* rates change
through a season (checkpoint vs latest) and against last season's full-season
rates. **It is not the eight-trait STRAND.** It tracks five different traits
(points, ice time, shots, high-danger shots, offensive-zone time); the original
STRAND is the historical analytical profile built from the 2025-26 baseline and
does not evolve during the season. The panel says so on its face.

Descriptive only. Independent of NAV: no module in this feature imports a
valuation, gravity, snapshot-batch or flag module (tested).

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
  skaters with at least `target − 5` GP (≥ 20 for `END`) at capture, the games range of
  those who were ranked, and the sorted values per trait, so every percentile can be
  reproduced exactly.

## Source verification status

**Not verified against the live feeds.** The build environment cannot reach `api.nhle.com` or `api-web.nhle.com`. What is established, and how:

| Assumption | Evidence | Status |
|---|---|---|
| `timeOnIcePerGame` is whole seconds | `scripts/gravity-calibration/core.ts` (fitted on real NHL data) names it `…Seconds` and filters at `5 * 60` | indirect |
| `points`, `gamesPlayed`, `playerId` in the skater summary | already read by the shipped observed-stats reader and its tests | indirect |
| EDGE `player.gamesPlayed`, `sogSummary[all/high].shots`, `zoneTimeDetails.offensiveZonePctg` as a 0-1 fraction | recorded fixture in `__tests__/nhl-player-feed.test.ts` and `parseEdge` | indirect |
| EDGE shots are all strengths vs 5v5 | unknown | **open** |
| Whether `sogDetails` sum to the `all` shots | unknown | **open** |
| Any as-of timestamp in the payloads | none is read; capture time is the only timestamp used | **open** |
| How far an EDGE row can lag the summary | unknown; the 8-day cron rotation implies days | **open** |

To close them: run `npx tsx scripts/verify-strand-evolution-sources.ts` where the NHL is reachable and attach the output to the PR. It prints the field shapes, whole-second range, zone-time range, shot consistency, EDGE-vs-summary game alignment, and any as-of field. The checker behind it (`app/lib/strand-source-check.ts`) is unit-tested on fixtures; that proves the checker, not the feed.

The code also refuses to print a rate that fails a plausibility check (ice time outside 1-60 minutes, points over 5 per game, more than 20 shots per game, high-danger shots above all shots, zone share outside 0-1). It reports the value as missing with the reason. A silent unit error cannot become a rate.

## Mixed-source timestamps

Summary and EDGE are separate reads at separate times. Their totals are only combined when the EDGE games equal the summary games for that player, so a rate is never a count from one moment divided by games from another. An older EDGE row with identical games is accepted and its lag is stored in provenance (`lagBehindSummaryMs`). Summary-only traits are unaffected by an EDGE mismatch.

## Comparison rules

- Rates only; exposure printed in each cell. No cumulative totals compared.
- A checkpoint comparison ranks both profiles in the checkpoint's one pinned cohort, so
  a percentile change is the player's. The cohort's median is shown for context.
- A cohort ranks a profile only if (a) season, competition and metric definition match,
  (b) the profile's games fall inside the games range of the players who were ranked
  (`gp_min`..`gp_max`), and (c) the trait has a value for at least half of those
  players and at least 10. Otherwise that percentile is withheld and the reason is
  printed. Consequence: a checkpoint cohort built when players had about 10-15 games
  will not rank a 40-game rate, so percentile *changes* appear only when both
  profiles sit inside that range, and raw rates are what carries a long comparison.
- Profiles built from different metric definitions get no change computed at all.
- EDGE-trait percentiles need a league-wide, games-aligned EDGE capture. The nightly cron
  rotates four clubs a night, so EDGE rows for the rest of the league are days old and
  fail the games-alignment rule; until a league-wide aligned pull exists those
  percentiles are withheld by the coverage rule and only raw EDGE rates are shown.
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
