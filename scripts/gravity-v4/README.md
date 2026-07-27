# Gravity v4 Offline Pipeline Boundary

No fitting pipeline or fitted player artifact is included in the current execution scope.

Gravity v4 training requires an authorized shift-, event-, stint-, or possession-level source that can support:

- stable numeric NHL player IDs;
- explicit season, game, strength-state, and source identifiers;
- teammate-only OZ expected-goal targets that exclude the focal player's shots, individual xG, goals, and direct box-score production;
- event-valued transition states, or an explicitly labelled proxy/missing NZ result;
- opponent expected goals prevented for positive DZ output;
- context controls for teammates, opponents, team, game state, deployment, goaltender, and season;
- block bootstrap by game, player-cluster bootstrap, or a posterior interval;
- immutable/versioned inputs, deterministic exports, persisted settings, and rejected-row coverage reports.

The application runtime must consume exported JSON only; it must never fit a league model during a request.

When an authorized source becomes available, the offline implementation should follow the stages named in `docs/PLAYER_GRAVITY_V4_IMPLEMENTATION_SPEC.md`:

```text
build-stints
build-possession-states
fit-oz-model
fit-nz-model
fit-dz-model
bootstrap-estimates
validate-model
export-profiles
```

Until those stages exist and the validation gates pass:

- `GRAVITY_V4_ENABLED` remains false by default;
- `app/lib/gravity-v4/runtime-artifact.ts` remains `null`;
- the zero-value fixture is restricted to `/api/admin/gravity-v4`;
- Gravity v3 remains the clearly labelled fallback;
- X-NAV and the season simulator do not import Gravity v4.

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

### Empty 200s — the failure mode to know about

Under sustained load these endpoints do not answer 429. They answer **HTTP 200
with an empty body**. On a 1312-game run that produced contiguous blocks of
25–100 games with no shift rows at all, cached as if they were real, and the run
still reported `1312/1312`.

Both scripts therefore content-validate every payload:

- a shift chart must have rows; a play-by-play must have plays, rosterSpots and
  team ids;
- an invalid payload is **never cached** — it is backed off and retried like a
  429;
- a *cached* payload that fails validation is **deleted and refetched**, so a
  cache poisoned by an earlier throttled run heals itself on the next online run;
- a game that reconstructs to zero stints is a **failure**, not a quiet zero, and
  failures are grouped by cause so hundreds of identical ones read as one
  problem.

`--gap MS` paces api-web; `--shiftgap MS` paces api.nhle.com (default 400).
Raise both if the failure list is dominated by empty payloads.

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
| games reconstructed ≥ 95% | endpoint reliability |
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
