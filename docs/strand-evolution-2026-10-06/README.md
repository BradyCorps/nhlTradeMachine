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

**Not verified against the live feeds. Re-attempted 2026-10-07: still blocked.** `api-web.nhle.com` and `api.nhle.com` both answer `CONNECT tunnel failed, response 403` from the build environment's egress proxy, so `scripts/verify-strand-evolution-sources.ts` could not run and no live findings exist. Nothing below is upgraded from "indirect" or "open". What is established, and how:

| Assumption | Evidence | Status |
|---|---|---|
| `timeOnIcePerGame` is whole seconds | `scripts/gravity-calibration/core.ts` (fitted on real NHL data) names it `…Seconds` and filters at `5 * 60` | indirect |
| `points`, `gamesPlayed`, `playerId` in the skater summary | already read by the shipped observed-stats reader and its tests | indirect |
| EDGE `player.gamesPlayed`, `sogSummary[all/high].shots`, `zoneTimeDetails.offensiveZonePctg` as a 0-1 fraction | recorded fixture in `__tests__/nhl-player-feed.test.ts` and `parseEdge` | indirect |
| EDGE shots are all strengths vs 5v5 | unknown | **open** |
| Whether `sogDetails` sum to the `all` shots | unknown | **open** |
| Any as-of timestamp in the payloads | none is read; capture time is the only timestamp used | **open** |
| How far an EDGE row can lag the summary | unknown; the 8-day cron rotation implies days | **open** |

To close them, from a Codespace (read-only, writes nothing, needs no secrets):

```
npx tsx scripts/verify-strand-evolution-sources.ts            # 2026-27 regular season, four default players
npx tsx scripts/verify-strand-evolution-sources.ts --dump     # also prints one raw EDGE outline
```

Exit code 1 means a hard check failed: do not enable capture. Attach the output to the PR. Passing hard checks does not settle the three "open" rows above (shot definition, `sogDetails` sum, as-of field); read the printed shapes and record the answers here. It prints the field shapes, whole-second range, zone-time range, shot consistency, EDGE-vs-summary game alignment, and any as-of field. The checker behind it (`app/lib/strand-source-check.ts`) is unit-tested on fixtures; that proves the checker, not the feed.

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

## Capture wiring (implemented, off by default)

`/api/cron/nhl-feed` (already authenticated by `CRON_SECRET`, an admin key or a signed admin session)
now ends with `runStrandCheckpointCapture` (`app/lib/strand-checkpoint-cron.server.ts`). It runs last,
reports under its own `strandCheckpoints` key, never throws, and cannot fail the existing feed capture.

- **Switch:** `STRAND_CHECKPOINT_CAPTURE=1`. Anything else (including unset) returns `{status:"disabled"}`
  without touching the NHL or the database. Environment changes take effect on the next deployment.
- **Upstream cost:** none added. One shared league skater summary via `readObservedSummary` (the same
  request and 5-minute cache the stat strip uses, one per night), plus a database read of EDGE rows the
  existing snapshot capture already stored. No league-wide EDGE refresh, no per-player request, no per-viewer write.
- **Idle nights:** if no skater is inside a milestone window (10/20/40/60 GP, up to 5 games over), the
  stage reads nothing more and writes nothing (`idle: true`).
- **Bounds:** at most 300 new rows and a 20-second budget per run. The rest is reported as `deferred`
  and picked up next run; capture is idempotent, so a retry never duplicates. A deferred player is recorded
  at their then-current GP if still in the window; otherwise that milestone stays missing (never back-filled).
- **Statuses:** `disabled`, `ok`, `summary-unavailable`, `store-unavailable` (migration 0012 not applied),
  `failed` (message included). Missing-data reasons are stored per row; EDGE traits stay withheld by the
  alignment rule (EDGE games must equal summary games) and the coverage rule (at least half the cohort).
  Expect most EDGE traits to be withheld until a league-wide aligned EDGE pull exists: the existing cron
  refreshes four clubs a night.
- **Manual controls (authenticated GET):** `?only=strand` runs just this stage; `&strandDryRun=1` counts
  what would be written and writes nothing; `&strandEnd=1` records the END checkpoint after the final
  regular-season game. The schedule never sets `strandEnd`.

Isolated tests (`__tests__/strand-checkpoint-cron.test.ts`, against a disposable migrated libSQL file
and the real route handler with stubbed upstream) cover: unauthenticated rejection before any work,
disabled flag, exactly one summary request, duplicate retries, source-correction revisions (original kept),
milestone windows, write bounds and resumption, dry run, idle nights, failure isolation for each status,
and untouched neighbouring tables. The real journaled runner was also run from an empty database
(0006→0012 applied, rerun a no-op) with `db:verify-strand-checkpoints`.

## Expected costs (estimates, not measurements)

- **Upstream:** 1 summary request per cron run (roughly 900 skater rows). Nothing else.
- **Database reads:** idle nights, none beyond the summary. In a window, one scan of stored EDGE rows (about
  one per skater) and one query of this season's checkpoints.
- **Database writes:** at most ~900 checkpoint rows per milestone, 4 milestones plus END, so about 4,500 rows
  a season at roughly 1-1.5 KB each (a few MB), spread over several nights by the 300-row bound. Reference
  cohorts are content-addressed; a cohort is stored only when a checkpoint pinned to it is, one per position
  group per night inside a window, at tens of KB each: low single-digit MB a season.
- **Page reads:** unchanged; the dossier reads stored rows for one player.

## Rollout (not done; each step needs an operator)

Prerequisite: PR merged and deployed with `STRAND_CHECKPOINT_CAPTURE` unset. The panel then reads
"checkpoint store not available" and the page is otherwise unchanged.

1. **Source check (Codespace):** run the command in "Source verification status". Stop if exit code is 1.
2. **Migration status.** Supply `MIGRATION_TARGET=production`, `MIGRATION_DATABASE_URL`,
   `MIGRATION_DATABASE_AUTH_TOKEN` privately (never in command text or files):
   `npm run db:migration-status`. Confirm the journal is compatible. Pending must be 0012 alone; if 0011
   (issue reports) is also pending, `db:migrate` applies it first, in order, so settle that deliberately.
3. **Apply:** `CONFIRM_PRODUCTION_MIGRATION=APPLY npm run db:migrate`. Additive: two tables, two indexes,
   four immutability triggers. Touches no existing table.
4. **Recovery verification:** `npm run db:migration-status` (pending empty) and
   `npm run db:verify-strand-checkpoints` (expects exactly the eight objects, counts 0/0/0), then
   `npm run db:verify-season-snapshot-schema` to confirm snapshot rows and batches are unchanged.
   Rollback is dropping nothing: leave the capture flag off and the empty tables are inert.
5. **Dry run:** with the deployment live, set `STRAND_CHECKPOINT_CAPTURE=1`, redeploy, then call
   `GET /api/cron/nhl-feed?only=strand&strandDryRun=1` with the cron secret. Expect `status:"ok"`,
   `dryRun:true`, and either `idle:true` or plausible `inserted`/`deferred` counts. Nothing is written.
6. **First bounded run:** `GET /api/cron/nhl-feed?only=strand` once. Check `report` (at most 300
   inserted, `deferred` for the rest), then `db:verify-strand-checkpoints` counts. Repeat the call to confirm
   a retry inserts nothing new. From then on the nightly cron does this.
7. **Season end:** after the final regular-season game, once: `...?only=strand&strandEnd=1`.
8. **Disable:** unset `STRAND_CHECKPOINT_CAPTURE` (or set it to `0`) and redeploy. Stored rows are
   immutable and remain; the panel keeps showing them.

**Production acceptance checks (read-only):** a dossier for a skater inside a captured window shows the
checkpoint option labelled with its real GP ("11 GP (first capture after the 10-GP target)"); a skater
with no row shows "No checkpoint has been captured ... yet" and no invented checkpoint; EDGE-based
traits show the stored missing reason rather than a value when GP is misaligned; the panel title is
"Season profile evolution · current-season observations" and says it is not the eight-trait STRAND;
no horizontal overflow at 320/412/desktop; NAV, Gravity and the original STRAND are unchanged; the cron
response carries `strandCheckpoints` and the existing feed keys.
