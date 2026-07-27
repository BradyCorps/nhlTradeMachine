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

## Stage 1 — `build-stints` (coverage spike)

Implemented. Reconstructs constant-lineup **stints** from NHL shift charts and
play-by-play, then reports whether the reconstruction is trustworthy enough to
fit on. Run this **before** any league-wide backfill.

```bash
npx tsx scripts/gravity-v4/coverage-spike.ts --games 50
npx tsx scripts/gravity-v4/coverage-spike.ts --games 50 --offline      # rerun from cache
npx tsx scripts/gravity-v4/coverage-spike.ts --games 200 --team ANA \
  --lines /path/to/ANA_FW.csv                                          # + line validation
```

Flags: `--games N` · `--season 20252026` · `--offline` · `--team ABBREV` ·
`--lines path.csv`

### Sources

| Endpoint | Gives |
| --- | --- |
| `api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=…` | every shift: playerId, period, start/end |
| `api-web.nhle.com/v1/gamecenter/{gameId}/play-by-play` | rosterSpots (positions), events, coords, `situationCode` |
| `api-web.nhle.com/v1/schedule/{date}` | game ids |

Responses cache to `.gravity-v4-cache/`; the report writes to
`data/gravity-v4/`. **Both are gitignored** — raw responses and player-level
derived data never enter the repository.

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
| **zero impossible skater counts** | 3–6 skaters a side; anything else means shift parsing is wrong |
| **strength agreement ≥ 99%** | derived on-ice counts vs the game's own `situationCode` — the two come from *different endpoints*, so this is a genuine cross-check |
| roster join ≥ 99.9% | every shift row resolves to a rostered NHL id |

Identity is the NHL player id end to end. Names are used **only** in the
optional `--lines` validation, never as a data join.

### Line validation

`--team ANA --lines ANA_FW.csv` rolls derived stints up to forward groups and
compares against a published line-combination table (e.g. Natural Stat Trick).
Reported at both all-strengths and 5v5 so you can see which basis the external
file used. A partial-game spike under-counts in absolute terms — compare the
*shape* first, then rerun across the full slate for absolute agreement.

Reconstruction logic lives in `scripts/gravity-v4/core.ts` (pure, no I/O) and is
covered by `__tests__/gravity-v4-stints.test.ts` against synthetic fixtures, so
correctness is verified without network access.

Background on why stint-level data is required:
`docs/analytics/GRAVITY_POSITION_CALIBRATION.md`.
