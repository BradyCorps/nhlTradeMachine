# Season profile evolution (stage 2)

A compact panel in the player dossier, titled **Season profile evolution ·
current-season observations**. It shows how a skater's *measured* rates change
through a season (checkpoint vs latest) and against last season's full-season
rates. **It is not the eight-trait STRAND.** It tracks five different traits
(points, ice time, shots, high-danger shots, offensive-zone time); the original
STRAND is the historical analytical profile built from the 2025-26 baseline and
does not evolve during the season. The panel says so on its face.

**Readiness fix:** only PTS/GP and TOI/GP are currently eligible for evolution
values. SOG/GP, HD SOG/GP and OZ TIME are withheld pending a reviewed NHL EDGE
definition/freshness contract. Raw EDGE inputs and immutable originals remain.
The definition is now `strand-evo-v2-summary`; v1 cohorts cannot rank v2 profiles.

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
| TOI | MoneyPuck `icetime / games` (baseline); NHL summary `timeOnIcePerGame` (observed reader) | any season, all situations | rate | NHL summary refreshes on request (SWR 5 min) | **Yes** (NHL summary, seconds per game, including fractions) | Only if captured | Same unit; source coverage still matters |

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
summary's GP; otherwise they are shown as missing with the reason. Even aligned EDGE values are
currently withheld by the source-verification gate; matching GP alone does not
close that gate.
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
  observed GP, capture time, `source_as_of` (null: no aggregate as-of field found in the sampled feeds),
  definition version, raw inputs with nulls for missing, per-trait missing reasons,
  the pinned reference cohort id, and provenance (summary report and retrieval time,
  EDGE row capture time, plan reason).
- Reference cohorts are content-addressed (sha256) and immutable: same-position-group
  skaters with at least `target − 5` GP (≥ 20 for `END`) at capture, the games range of
  those who were ranked, and the sorted values per trait, so every percentile can be
  reproduced exactly.

## Source verification status

**Live probe passed in the Codespace on 2026-10-07; semantics are only partially verified.**
At implementation head `aab8dea0e47a5a0bb59f64d4217efef7670089fc`,
`npx tsx scripts/verify-strand-evolution-sources.ts` exited **0**. The summary and all
four EDGE requests returned HTTP 200. Follow-up read-only inspection at 17:56 UTC
checked the actual payloads, the NHL landing line, and the dedicated shot-location
and zone-time endpoints. No application capture or database write was invoked.

| Assumption | Evidence | Status |
|---|---|---|
| `timeOnIcePerGame` unit | 625 numeric rows; median 965, min 269, max 1814.5. McDavid: 1423.6666 seconds = 23:43.6666, consistent with landing `avgToi: "23:44"`. 374/625 rows have fractional seconds. | **seconds per game verified; integer/whole-second claim false** |
| Summary fields and season/competition | All 625 rows have numeric id, GP, points, TOI and `seasonId=20262027`; request filters `gameTypeId=2`. Summary rows omit `gameTypeId`; McDavid's landing NHL line explicitly reports season 20262027 / type 2, with matching GP/PTS/SOG. | verified in this response/sample; the script does not independently prove competition when the field is absent |
| EDGE identity and exposure | Four matching player ids; GP aligns 4/4 (see below). URLs select 20262027 / type 2; `seasonsWithEdgeStats` lists that combination and sampled event overlays report type 2. There is no aggregate selected-season/type echo. | verified sample, not a universal feed guarantee |
| Shot count definition | `sogSummary.all.shots` equals summary SOG 10/7/16/14; McDavid's dedicated `shotLocationTotals.all.sog=7` matches. EDGE total goals include special-team scoring (McDavid 2 total vs 1 EV goal; Perfetti 2 total vs 1 EV goal). | supports all-strength **shots on goal**, not attempts or 5v5; the exact high-danger region and tracking exclusions remain **open** |
| `sogDetails` sum | All 17 area counts sum to `all.shots` for each of the four players. `high+mid+long` does **not** cover every area (McDavid 4 vs 7 total). | verified sample only; do not reconstruct `all` from three danger groups |
| Zone-time unit and situation | OZ fractions 0.46554159 / 0.51987002 / 0.5500968 / 0.45991281. McDavid's dedicated zone endpoint labels the identical 0.51987002 as `strengthCode:"all"`; `es` is separately 0.51233738. | 0-1 fraction, all situations; not 5v5 zone starts |
| As-of timestamp | Recursive inspection found birth dates and event-overlay game dates, not an aggregate retrieval/update/as-of timestamp. | no aggregate as-of found in these payloads; event dates are **not** freshness stamps |
| EDGE-vs-summary lag | Fresh requests align 4/4; stored cron rows were not inspected. Rotation can leave stored EDGE days behind. Equal GP cannot prove equal correction state or exact observation time. | stored lag distribution and league-wide alignment remain **open** |

| Player id | Summary GP / EDGE GP | EDGE all / high SOG | Sum of 17 areas |
|---|---|---|---|
| 8482149 (Perfetti) | 3 / 3 | 10 / 3 | 10 |
| 8478402 (McDavid) | 3 / 3 | 7 / 1 | 7 |
| 8477934 (Draisaitl) | 3 / 3 | 16 / 4 | 16 |
| 8479318 (Matthews) | 4 / 4 | 14 / 6 | 14 |

Primary evidence: [filtered NHL summary](https://api.nhle.com/stats/rest/en/skater/summary?cayenneExp=seasonId%3D20262027%20and%20gameTypeId%3D2&limit=-1),
[McDavid EDGE detail](https://api-web.nhle.com/v1/edge/skater-detail/8478402/20262027/2),
[shot-location detail](https://api-web.nhle.com/v1/edge/skater-shot-location-detail/8478402/20262027/2),
[zone-time detail](https://api-web.nhle.com/v1/edge/skater-zone-time/8478402/20262027/2),
and [landing](https://api-web.nhle.com/v1/player/8478402/landing).
These URLs are mutable observations, not archived snapshots.

To repeat the probe from a Codespace (read-only, writes nothing, needs no secrets):

```
npx tsx scripts/verify-strand-evolution-sources.ts            # 2026-27 regular season, four default players
npx tsx scripts/verify-strand-evolution-sources.ts --dump     # also prints one raw EDGE outline
```

Stop on **any nonzero exit**, including exit 2 for an unavailable summary. The
hardened probe was rerun on 2026-10-07: exit 0, 625 numeric summary rows, all five
requests HTTP 200, requested EDGE coverage 4/4, and GP alignment 4/4. Failed or
missing requested EDGE responses now fail the checks, including an empty sample.
The TOI check is correctly named "plausible seconds per game" and accepts
fractions. Passing magnitude checks still cannot prove every unit/definition;
timestamp inspection remains top-level and does not establish a maximum lag.

The unresolved high-danger region/tracking exclusions, aggregate as-of contract
and stored lag distribution remain open. The release handles this by withholding
all three EDGE-derived evolution values and percentiles, including values read
from older stored checkpoints, without altering their raw database rows. Summary
PTS/GP and TOI/GP remain available. Re-enabling EDGE evolution requires a separate
reviewed source contract and metric-definition change; the capture flag does not
bypass this withholding.

The code withholds rates outside plausibility bounds (ice time outside 1-60
minutes, points over 5 per game, more than 20 shots per game, high-danger shots
above all shots, zone share outside 0-1). These checks cannot rule out every unit
or semantic error.

## Mixed-source timestamps

Summary and EDGE are separate reads at separate times. Their totals are only
combined when the EDGE games equal the summary games for that player; this guards
the GP denominator, not simultaneous observation or correction state. An older
EDGE row with identical games is accepted and its capture-time difference is
stored in provenance (`lagBehindSummaryMs`). That difference is not an upstream
as-of guarantee. Summary-only traits are unaffected by an EDGE mismatch.

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
  percentiles are withheld by the coverage rule. This release additionally withholds
  all EDGE evolution values at the source-verification gate, even if GP aligns.
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
reports under its own `strandCheckpoints` key, and catches ordinary checkpoint exceptions so they do
not fail the existing feed capture. A platform timeout is outside that exception guarantee.

- **Switch:** `STRAND_CHECKPOINT_CAPTURE=1` enables writes. Anything else (including unset)
  returns `{status:"disabled"}` without upstream/database access for ordinary calls. An explicitly
  authenticated `?only=strand&strandDryRun=1` can read/count while the flag stays off; it never writes
  checkpoint or cohort rows. Environment changes take effect on the next deployment.
- **Upstream cost:** one call to shared `readObservedSummary` (the stat strip's 5-minute cache).
  A fresh cache hit can avoid a request; a cold or stale cache can fetch the league summary. Sharing
  does not guarantee zero additional requests or cost. The stage also reads stored EDGE rows, with
  no league-wide EDGE refresh or per-player upstream request.
- **Idle nights:** if no skater is inside a milestone window (10/20/40/60 GP, up to 5 games over), the
  stage reads nothing more and writes nothing (`idle: true`).
- **Bounds:** at most 300 checkpoint inserts **including corrections**, plus separate cohort inserts
  (`cohortsInserted`), not a 300-total-row cap. The stage uses the earlier of 20 seconds from stage
  start and route start + 55 seconds, reserving 5 seconds inside the route's `maxDuration=60`.
  Summary reads, EDGE reads, prior-checkpoint reads and each cohort/checkpoint insert share that
  absolute deadline. If preceding feed work exhausts it, checkpoint I/O never starts. A cohort
  operation crossing the deadline cannot start its checkpoint write.
- **Timeout semantics:** `budget-exhausted` stops awaiting I/O and starts no later operations.
  A dispatched remote insert may still commit after its acknowledgement times out; cancellation
  of a remote commit is **not** guaranteed. Inspect stored identities/counts before retrying. The
  immutable checkpoint identities and content hashes make retries safe after a late commit. A
  partial run can leave an unreferenced immutable cohort. Synchronous JavaScript/event-loop stalls
  and time already consumed by the original feed are not hard real-time guarantees from this stage.
- **Continuation:** eligible writes skipped by the row/deadline bound are counted as `deferred`.
  Uncaptured eligible players precede corrections; within each tier, windows closest to expiry
  precede other windows, with player id as a stable tie-breaker independent of upstream row order.
  Repeated corrections therefore cannot consume the write allowance ahead of uncaptured players.
  Stable eligible backlogs drain across calls with available I/O time. Inputs moving outside a
  window before capture still leave that milestone missing; it is never back-filled. Calls while
  a backlog remains are continuation and may insert more records; they are not duplicate retries.
- **Statuses:** `disabled`, `ok`, `summary-unavailable`, `store-unavailable` (0012 absent),
  `budget-exhausted`, `failed`. Timeout/failure outcomes do not claim complete report counts; inspect
  the store for writes that completed. Missing reasons remain stored; EDGE-derived evolution values
  and percentiles remain withheld regardless of the capture flag or alignment.
- **Manual controls (authenticated GET):** `?only=strand` runs just this stage; `&strandDryRun=1` counts
  what would be written and writes nothing; `&strandEnd=1` records the END checkpoint after the final
  regular-season game. The schedule never sets `strandEnd`.

Isolated tests (`__tests__/strand-checkpoint-cron.test.ts`, against a disposable migrated libSQL file
and the real route handler with stubbed upstream) cover: unauthenticated rejection before any work,
disabled flag, exactly one summary request, duplicate retries, source-correction revisions (original kept),
milestone windows, fair continuation under repeated corrections/reordered sources, window expiry
priority, write bounds, expired/hanging reads, a cohort crossing its deadline, late commit with safe
retry, shared route budget/feed-response preservation, authenticated flag-off dry runs, idle nights,
and untouched neighbouring tables. The real journaled runner was also run from an empty database
(0006→0012 applied, rerun a no-op) with `db:verify-strand-checkpoints`.

## Expected costs (estimates, not measurements)

- **Upstream:** one shared summary-reader call per enabled run; normally zero requests on a fresh cache
  hit or one on a miss/refresh (625 skater rows in the live probe). No measured cost guarantee.
- **Database reads:** idle nights, none beyond any summary-cache access. In a window, a scan of **all**
  stored `source='edge'` rows for the selected season, reduced to latest-per-player in memory, and a query
  of that season's checkpoints/revisions. Read volume grows with historical captures, not just roster size.
- **Database writes:** at most ~900 checkpoint rows per milestone, 4 milestones plus END, so about 4,500 rows
  a season at roughly 1-1.5 KB each (a few MB), spread over several nights by the 300-row bound. Reference
  cohorts are content-addressed; a cohort is stored only when a checkpoint pinned to it is, one per position
  group per night inside a window, at tens of KB each: low single-digit MB a season.
- **Page reads:** the new panel reads the player's checkpoints/cohorts and shared current/prior-season
  summary and EDGE readers. Cache hits can reuse other page work; misses can add requests.

## Rollout (not done; each step needs an operator)

The readiness fixes below are implemented. These are future operator steps, not
authorization from the implementation task to merge, deploy, migrate, enable, or capture.

1. **Final-head gates.** Confirm CI and Vercel Preview for the exact final PR head, including the
   targeted readiness regressions. Repeat the hardened source probe near rollout; stop on any
   nonzero exit or summary-unit/season/competition mismatch. The open EDGE contract is deliberately
   excluded from published evolution metrics; require the three EDGE traits to stay withheld.
2. **Merge and deploy disabled.** Verify the Vercel Production capture flag is unset or `0` before
   the normal reviewed PR merge (which may auto-deploy). Record PR head, merge SHA, deployment SHA/id,
   successful Production deployment and alias identity. Deploy the merged commit with checkpoint
   capture still disabled. No real checkpoint invocation yet; existing feed capture stays enabled.
3. **Inspect the actual Production journal.** Privately inject the approved `MIGRATION_DATABASE_URL`
   and `MIGRATION_DATABASE_AUTH_TOKEN`, confirm target identity, and run
   `MIGRATION_TARGET=production CONFIRM_PRODUCTION_MIGRATION=APPLY npm run db:migration-status`.
   The shared connection helper requires that acknowledgement even for read-only status/verifier
   commands; it does not itself apply migrations. Using the approved read-only database console,
   inspect `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at, id;` and compare
   the actual ordered journal with the reviewed repository's tags, timestamps and SQL hashes.
   **Pending must be exactly `["0012_add_strand_checkpoints"]`. Stop if anything else is pending,
   including 0011, or if a journal/order/hash/schema discrepancy exists.** `db:migrate` has no
   single-migration selector and would apply every pending entry. Resolve other migrations in a
   separate authorized task; do not bundle them into this rollout. If 0012 is already applied, stop
   and establish that deployment's existing evidence instead of treating it as a fresh migration.
4. **Fresh recovery before Production migration.** Follow
   [pre-migration recoverability verification](../PRODUCTION_DATABASE_OPERATIONS.md#pre-migration-recoverability-test)
   to create a new independently readable PITR recovery database near this operation. An old
   September recovery copy or a successful post-migration schema query is insufficient. Record the
   recovery identity/time, journal, existing schema and aggregate counts/identity fingerprints for
   immutable snapshots and batches, plus relevant existing feed/report tables. Verify the current
   COMPLETE batches are included. On a separate disposable copy, rehearse only the expected pending
   0012 with `MIGRATION_TARGET=isolated npm run db:migrate`, verify the eight new objects and zero
   checkpoint/cohort/revision counts, and confirm existing data is preserved. Retain the verified
   pre-migration recovery point through acceptance; do not replace or write to the original database.
5. **Apply only the reviewed migration.** Recheck Production journal and the exact pending set just
   before `MIGRATION_TARGET=production CONFIRM_PRODUCTION_MIGRATION=APPLY npm run db:migrate`.
   Require `appliedNow:["0012_add_strand_checkpoints"]`. Migration 0012 is additive: two tables,
   two indexes and four immutability triggers, with no existing-table DDL/DML. Then, with the same
   explicit target/acknowledgement, run `db:migration-status` (pending empty) and
   `db:verify-strand-checkpoints` (eight named objects, counts 0/0/0). Compare existing schema,
   immutable snapshot/batch counts and identity fingerprints with the pre-migration baseline; check
   integrity/foreign keys. Account separately for expected ongoing feed writes. **Do not use
   `db:verify-season-snapshot-schema` as a general preservation check:** it requires zero verified
   batches and rejects an otherwise valid database containing COMPLETE batches.
6. **Authenticated dry run while disabled.** Keep Production `STRAND_CHECKPOINT_CAPTURE` unset
   or `0` and call only `GET /api/cron/nhl-feed?only=strand&strandDryRun=1` with the approved cron
   secret/admin authorization. This flag-off dry run is now supported. Require `status:"ok"`,
   `dryRun:true`, plausible counts (or `idle:true`), and unchanged checkpoint/cohort counts.
   Ordinary scheduled feed requests still return a disabled checkpoint stage. If the dry run
   times out or fails, leave capture disabled; investigate and repeat before enabling. Preview
   dry runs may be used first only after independently proving their database isolation.
7. **Controlled Production enable.** After accepting the disabled dry run, set Production
   `STRAND_CHECKPOINT_CAPTURE=1` through approved environment settings and redeploy the same reviewed
   commit. Verify successful deployment SHA/id and Production alias. This enables actual writes
   from ordinary authenticated feed invocations; the schedule can run as soon as this deployment
   is live. If a manual first run must precede the schedule, use an approved maintenance window and
   Vercel's supported [Settings → Cron Jobs → Disable Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
   control, wait for in-flight invocations, and coordinate other authenticated callers. That control
   temporarily pauses **all** project cron schedules, including the existing feed; restore them
   promptly after acceptance or after disabling the checkpoint flag on failure.
8. **First real run and continuation, after separate operator authorization.** Call `?only=strand`
   once. Require `inserted + corrected <= 300`, inspect `cohortsInserted` separately, and inspect
   `deferred`, failure status, counts and duration. Further calls while `deferred > 0` are
   **continuation** and may write remaining players. A duplicate retry is zero new checkpoints
   **only after the backlog is drained and player inputs have not changed**; corrections can create
   revisions, and new GP/windows can create new observations. Verify that the same known record/id
   is not duplicated rather than requiring the entire second run to insert zero. Confirm no
   deferred player is repeatedly bypassed, then re-enable the project schedules and verify the
   existing feed's response keys and ordinary capture behavior. On failure, disable the checkpoint
   flag/redeploy and restore any paused schedules. For `budget-exhausted`, inspect possible late
   commits before retrying; do not interpret absent report counts as zero writes.
9. **Season end and disable.** After all regular-season games, explicitly authorize
   `?only=strand&strandEnd=1` and drain its continuation backlog; one invocation may be insufficient.
   To disable capture, unset the flag or set it to `0` and redeploy. Leave the additive tables and
   immutable rows intact. Application rollback does not require dropping history; any database
   recovery uses the independently verified copy and preserves the original database.

**Production acceptance checks (read-only):** a dossier for a skater inside a captured window shows the
checkpoint option labelled with its real GP ("11 GP (first capture after the 10-GP target)"); a skater
with no row shows "No checkpoint has been captured ... yet" and no invented checkpoint; EDGE-based
traits show the stored missing reason rather than a value when GP is misaligned; the panel title is
"Season profile evolution · current-season observations" and says it is not the eight-trait STRAND;
no horizontal overflow at 320/412/desktop; NAV, Gravity and the original STRAND are unchanged; the cron
response carries `strandCheckpoints` and the existing feed keys.

## Readiness fixes and verification — 2026-10-07

- [x] Initial bounded review completed at Claude's head
  `aab8dea0e47a5a0bb59f64d4217efef7670089fc`. Follow-up fixes preserve his panel, comparison,
  immutable store, existing feed flow and additive migration; no unrelated changes or dependencies.
- [x] **Fair continuation:** the original 301-player probe repeatedly deferred player 301 while
  correcting the first 300. New captures now precede corrections, then sort by window expiry and
  stable player id. The regression repeats corrections with reversed upstream order and proves
  the deferred player is captured before corrections can exhaust the allowance.
- [x] **Shared runtime boundary:** all checkpoint awaits use the same absolute deadline, capped at
  20 seconds and route start + 55 seconds. Hanging summary/EDGE/checkpoint reads return a distinct
  status; a cohort crossing its deadline starts no checkpoint insert; a timed-out write starts no
  later writes, and a simulated late commit retries without duplicating records. Real route tests
  preserve the existing feed response when prior work uses the allowance or a late read hangs.
- [x] **Source gate:** hardened live probe passes (625 summary rows; five HTTP 200 responses;
  requested EDGE coverage and GP alignment 4/4). Fractional seconds accepted; missing requested
  responses fail. Unverified EDGE evolution values/percentiles are withheld at both the source
  conversion and stored-checkpoint read boundaries; original raw rows remain unchanged. PTS/GP
  and TOI/GP are eligible under `strand-evo-v2-summary`. The open semantics above remain open,
  rather than being treated as verified by plausibility tests.
- [x] **Disabled dry run:** the authenticated route counts while capture stays off and inserts no
  cohort/checkpoint rows; an unauthenticated request is still rejected before work, and an ordinary
  flag-off call stays a no-op.
- [x] **Migration and existing contracts:** 0012 remains unchanged, additive, and journaled. Existing
  tests continue to cover authorization, default-off behavior, isolated failures, identical retries,
  source-correction revisions/original immutability, competition and season boundaries.
- [x] **Local verification:** targeted tests **81 passed, 0 failed** across five files;
  `npx tsc --noEmit` passed after restoring the existing lockfile dependencies with `npm ci`.
  Source probe passed. The original CI run
  [37655639026](https://github.com/BradyCorps/nhlTradeMachine/actions/runs/37655639026) and Preview
  deployment `2rH73Sv3UvxXB41VttTZKKuN8oaz` cover only the earlier Claude head. Confirm the
  updated head's results on [PR #46](https://github.com/BradyCorps/nhlTradeMachine/pull/46) before merge.
- [ ] **Operator rollout:** final-head CI/Preview acceptance, merge and disabled Production deployment,
  actual journal inspection (only 0012 pending), fresh independent recovery/rehearsal, Production
  migration and preservation verification, disabled dry run, controlled enable and bounded real
  capture/continuation/acceptance remain separate operator actions.

**Result: implementation blockers addressed for a summary-only evolution rollout, subject to final-head
checks and operator prerequisites.** This task performed no merge, manual deployment, Production
migration/flag change, real capture, or unrelated Labs work. EDGE evolution remains withheld.
