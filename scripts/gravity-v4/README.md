# Gravity v4 Offline Pipeline

**State (2026-09-03):** the pipeline below is implemented and has been run once
in a codespace against NHL shift charts and play-by-play. Its output is the
committed `app/lib/gravity-v4/fitted-artifact.json` (560 profiles, 2025-26,
5v5, OZ + DZ, untiered; SHA-256 pinned in `app/lib/gravity-v4/artifact-manifest.ts`).
NZ was fitted as a rush proxy, failed split-half reliability (r=0.099) and is
excluded. Evidence and verdict: `docs/analytics/GRAVITY_V4_RELEASE_EVIDENCE.md`.

Stages, in order:

```text
build-stints → build-possession-states → fit-shot-xg → fit-oz-model → fit-dz-model
→ fit-nz-model (excluded) → bootstrap-estimates → validate-model → export-profiles
```

Inputs live in `data/gravity-v4/` and `.gravity-v4-cache/` (gitignored). The
application runtime consumes the exported JSON only and never fits during a
request. Any re-export that changes a byte of the artifact fails the manifest
checksum until the manifest is updated with new evidence.

Rules that still hold:

- `GRAVITY_V4_ENABLED` is unset in production; the display is dark until a human sets it;
- the zero-value fixture is restricted to `/api/admin/gravity-v4`;
- Gravity v3 remains the labelled fallback;
- X-NAV, F-NAV, D-NAV, G-NAV, team totals, rankings, Trade Machine, Armchair GM, Fantasy and the season simulator do not import Gravity v4.

The original source requirements (stable numeric ids; explicit season/game/strength/source ids; teammate-only OZ targets excluding the focal player's own production; event-valued or explicitly proxy/missing NZ; opponent xG prevented for DZ; teammate/opponent/team/game-state/deployment/goalie/season controls; block bootstrap; deterministic exports and rejected-row reports) are met by the stages documented below.

---

## Stage 1 — `build-stints`

Implemented, in two pieces:

- **`coverage-spike.ts`** — reconstructs constant-lineup **stints** from NHL
  shift charts and play-by-play and reports whether the reconstruction is
  trustworthy enough to fit on. Run this **before** any league-wide backfill.
- **`build-stints.ts`** — the producer. Same reconstruction, but writes the
  fittable rows. Documented under *The emitter* below.

```bash
npx tsx scripts/gravity-v4/coverage-spike.ts --games 50
npx tsx scripts/gravity-v4/coverage-spike.ts --games 50 --offline      # rerun from cache
npx tsx scripts/gravity-v4/coverage-spike.ts --games 200 --team ANA \
  --lines ~/Downloads/ANA_FW.csv                                       # + line validation
```

Flags: `--games N` · `--season 20252026` · `--offline` · `--team ABBREV` ·
`--lines path.csv` · `--gap MS` (per-request floor for api-web; raise if you see 429s)

### Sources

| Endpoint | Gives |
| --- | --- |
| `api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=…` | every shift: playerId, period, start/end |
| `api-web.nhle.com/v1/gamecenter/{gameId}/play-by-play` | rosterSpots (positions), events, coords, `situationCode` |
| `api-web.nhle.com/v1/schedule/{date}` | game ids |

Responses cache to `.gravity-v4-cache/`; the report writes to
`data/gravity-v4/`. **Both are gitignored** — raw responses and player-level
derived data never enter the repository.

### Shift charts do not exist for the whole season

**Measured 2026-07-27, 2025-26 season: 807 of 1312 games have a shift chart.
501 do not.** For those, `shiftcharts` answers `HTTP 200` with
`{"data":[],"total":0}` — 21 bytes in under 100ms — while the same game's
play-by-play returns normally. Re-probed live with the cache bypassed: empty
games are still empty, populated games still return 750–856 rows. It is an
absence at the source, not throttling, and **not retryable**.

The gaps are nine contiguous blocks of game ids (median 50 games, largest 111).
Game ids run in schedule order, so those are date ranges — roughly nine windows
of one to two weeks. Every club plays across every window, which is why the
per-team coverage spread stays narrow; the run measures it rather than assuming
it.

Diagnose with the probe, which bypasses the cache entirely:

```bash
npx tsx scripts/gravity-v4/probe.ts               # audit cache, map the gap
npx tsx scripts/gravity-v4/probe.ts --compare 4   # empty vs populated, live
npx tsx scripts/gravity-v4/probe.ts 2025020061    # specific game ids
```

`--compare` is the one that matters: probing only the failures cannot tell
"these games have no data" from "the endpoint is down right now".

Separately, payloads *are* content-validated on every fetch, because an empty
200 is also what throttling would look like:

- an invalid payload is **never cached** — it is backed off and retried;
- a *cached* payload that fails validation is **deleted and refetched**, so a
  cache poisoned by an earlier bad run heals itself;
- a game with no shift chart is recorded as such (expected); a game that has one
  but reconstructs to zero stints is a **failure**;
- failures are grouped by cause so hundreds of identical ones read as one
  problem.

`--gap MS` paces api-web; `--shiftgap MS` paces api.nhle.com (default 400).

### What a stint is

Every shift start and end is a change point. Between two adjacent change points
the on-ice set cannot change, so that interval is one stint with fully known
context: five skaters a side, both goalies, strength, and (via play-by-play) the
zone and score state. This is the unit the fitted model needs — season
aggregates have already averaged that variation away, which is exactly why they
cannot separate a player from his linemates.

### Gates

The spike prints PASS/FAIL and refuses to bless a backfill unless:

| Gate | Why |
| --- | --- |
| games reconstructed ≥ 95% | endpoint reliability — measured against games that **have** a shift chart, since ~38% of the schedule has none |
| every team ≥ 30 covered games | a season fit needs enough per club, not every game |
| no team below 70% of median coverage | whole-window gaps hit all clubs alike; a gap concentrated on a few teams would bias every player effect fitted from it |
| **zero tiling gap** | stints must exactly cover the shift span, or ice time is being dropped |
| impossible skater counts ≤ 0.1% of stints | 3–6 skaters a side; a handful survive too-many-men and overlapping-shift quirks, a systematic failure would not |
| **strength agreement (boundary-tolerant) ≥ 99.5%** | derived on-ice counts vs the game's own `situationCode` — the two come from *different endpoints*, so this is genuine corroboration |
| roster join ≥ 99.9% | every shift row resolves to a rostered NHL id |

### Measured result (50 games, 2025-26, run 2026-07-27)

| Metric | Result |
| --- | --- |
| games reconstructed | 50/50 (100%) |
| shift rows kept | 38,569 (69 duplicates, 0 invalid) |
| roster join | 100.00% |
| stints built | 20,073 |
| tiling gap | 0s |
| impossible skater counts | 9 (0.045%) |
| 5v5 share of stint time | 75.7% |
| strength agreement — strict | 96.49% |
| **strength agreement — boundary-tolerant** | **99.75%** |

All gates pass.

**What the disagreements actually are.** 98.1% sit on a stint boundary, and the
event-type breakdown is dominated by strength transitions:

| Event | Share of disagreements |
| --- | ---: |
| penalty | 66.9% |
| goal | 15.6% |
| stoppage | 12.2% |
| everything else | 5.3% |

At the instant a penalty is called the teams are **still even strength** — the
play-by-play correctly stamps 5v5 — but the shift chart has already ended the
penalised player's shift on that second, so reconstruction reads 4v5. The goal
case is the mirror image: a power-play goal is stamped 4v5 while the shift chart
has already restored the penalised player, because the penalty ends on the goal.
Both sources are correct; they describe opposite sides of the same transition.

Residual worth revisiting if the fitted model misbehaves around special teams:
11 disagreements (0.066%) were **not** on a boundary, and 41 (0.25%) were not
resolved even allowing either adjacent lineup — likely instants where more than
two lineups meet.

### Why the strength gate is boundary-tolerant

At a line change the shift chart ends the outgoing shifts and starts the
incoming ones on the same second, while the play-by-play stamps the event that
*caused* the stoppage under the **outgoing** lineup. The instant genuinely
belongs to two lineups, so a strict comparison scores a miss even when the
reconstruction is correct.

The gate therefore uses the boundary-tolerant figure — an event exactly on a
boundary may match either adjacent lineup — because that is what measures real
reconstruction error. Strict agreement is still printed, and the run reports
where the disagreements sit (on/off boundary, and by event type), so the
ambiguity is never hidden. Tolerance is deliberately narrow: a mismatch away
from a boundary still fails, and `__tests__/gravity-v4-stints.test.ts` pins that
so the allowance cannot quietly widen into a way of passing broken data.

Identity is the NHL player id end to end. Names are used **only** in the
optional `--lines` validation, never as a data join.

### The emitter — `build-stints.ts`

The spike measures; the emitter **produces the dataset**. Same reconstruction,
same cache, same gates — but it writes one row per stint instead of a metrics
summary.

```bash
npx tsx scripts/gravity-v4/build-stints.ts --games 50
npx tsx scripts/gravity-v4/build-stints.ts --games 1312            # full slate
npx tsx scripts/gravity-v4/build-stints.ts --games 50 --offline    # from cache
```

Flags: `--games N` · `--season 20252026` · `--offline` · `--gap MS` ·
`--shiftgap MS` · `--even5v5` (emit only true 5v5 rows — smaller file, but the
special-teams rows are gone for good, so prefer filtering downstream)

Output — **both gitignored**, this is player-level derived data:

```text
data/gravity-v4/stints-<season>.ndjson.gz
data/gravity-v4/stints-<season>.manifest.json
```

The manifest carries the schema version, the settings, per-source coverage and
the **sha256 of the uncompressed NDJSON**, so a rerun on the same inputs is
verifiably identical without depending on gzip framing. It also records
`gatesPassed`; the script exits non-zero when a gate fails, so a bad dataset
cannot quietly feed the next stage.

#### What a row carries

Everything the OZ/NZ/DZ fits condition on, per §5 of the implementation spec:

| Field | Why the fit needs it |
| --- | --- |
| `homeSkaters` / `awaySkaters` / goalies | teammate and opponent terms |
| `strength`, `isEven5v5` | strength state |
| `homeScore` / `awayScore` at stint start | score-state control |
| `startZoneHome`, `startedOnFaceoff` | zone-start control |
| `durationSec`, `gameStartSec` | exposure weight, ordering across periods |
| `shots[]` with `shooterId` | **the OZ target excludes the focal player's own offense** — impossible without the shooter |
| `homeCorsi` / `awayCorsi` / goals | convenience totals for a first-cut target |

Shots carry coordinates and type but **no xG value** — nothing here fits an xG
model. Attaching expected-goal weight is the next stage's job, and keeping it
separate means the stint rows stay valid when the xG source changes.

#### Measured result — full 2025-26 slate (run 2026-07-27)

**All nine gates pass.** This is the dataset stage 2 reads.

| Metric | Result |
| --- | --- |
| games on the schedule | 1312 |
| games with no shift chart | 505 (38.5%) — absent at source |
| games emitted | **807 / 807 reconstructable** |
| stint rows | **319,806** (396 per game) |
| team coverage | median 62.2%, range 58.5%–64.6%, **6.1-point spread** |
| tiling gap | 0s |
| roster join | 100.00% |
| shots attributed | 93,947 — **0 without a shooter id** |
| events landing in a stint | 99.67% |
| foreign-game rows dropped | 667, all in game 2025020565 |
| attribution — trailing (used) | **99.16%** |
| attribution — leading (naive) | 95.34% |
| on disk | 8.7 MB gzip (165.4 MB raw) |

Two results carry beyond this stage. The **6.1-point coverage spread** across 32
clubs means the missing 38% costs precision, not validity — no team is
systematically under-observed, so player effects are not differentially
shrunk by which club a player happens to play for. And the **3.8-point
attribution gap** is 9,686 events the naive rule would have credited to the
wrong five skaters, concentrated on goals and special-teams transitions: the
highest-leverage events in the set.

#### Which lineup owns an event

An event that *causes* a stoppage — a goal, a shot, a hit — was played by the
lineup on the ice **up to** that second, so it belongs to the stint ending there
(`(start, end]`). An event that *resumes* play — a faceoff, a period start —
belongs to the lineup taking the ice (`[start, end)`). Using one rule for both is
exactly what makes a goal look like it was scored by the players who came over
the boards after it.

That is asserted nowhere: the run prints situationCode agreement under **both**
rules over the same events, so the choice is evidenced on every dataset it
produces, and `__tests__/gravity-v4-stints.test.ts` pins the case where they
diverge.

A blocked shot is owned by the **blocking** team in the NHL feed, so the emitter
credits the attempt to the other side.

### Shift charts can contain another game's rows

Game **2025020565** (BUF @ NJD) returns a shift chart carrying **667 rows from a
Vegas–San Jose game** — Eichel, Stone, Pietrangelo on one side, Granlund,
Toffoli, Ceci on the other — alongside a duplicated copy of the real game's rows.

This is worth understanding rather than just filtering. `buildStints` assigns
`isHome = teamId === homeTeamId` and treats **everything else as the away team**,
so those skaters would have been placed on New Jersey's ice and the lineups would
have been wrong without anything failing. The roster join caught it only by
accident, and misreported it as a join failure.

`parseShifts` therefore takes the two playing team ids and counts foreign rows
as their own category, checked *before* the roster join so the join rate stays
honest. Contamination is reported prominently and recorded in the manifest —
filtered, never silent. Inspect a suspect game with:

```bash
npx tsx scripts/gravity-v4/probe.ts --inspect 2025020565
```

### Line validation

`--team ANA --lines ANA_FW.csv` rolls derived stints up to forward groups and
compares against a published line-combination table (e.g. Natural Stat Trick).
Reported at both all-strengths and 5v5 so you can see which basis the external
file used. A partial-game spike under-counts in absolute terms — compare the
*shape* first, then rerun across the full slate for absolute agreement.

### Layout

| File | Role |
| --- | --- |
| `core.ts` | reconstruction + emission, **pure** — no I/O, no name joins |
| `nhl-source.ts` | fetch, cache, per-host pacing, play-by-play projection |
| `coverage-spike.ts` | measures: is the reconstruction trustworthy? |
| `build-stints.ts` | produces: the fittable dataset |

All hockey logic is in `core.ts` and covered by
`__tests__/gravity-v4-stints.test.ts` against synthetic fixtures, so correctness
is verified without network access.

Background on why stint-level data is required:
`docs/analytics/GRAVITY_POSITION_CALIBRATION.md`.
