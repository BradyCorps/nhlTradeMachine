# Cup Run Challenge — 3-Year Sim (Design)

## Concept

Pick any team in July 2026 and win the Stanley Cup by the end of the
2028-29 season. Difficulty comes from the team you choose: Carolina
(fresh off the 2026 Cup) is a layup; Vancouver (32nd) is a nightmare.
Win → banner + share card ("Won the Cup with VAN in Year 2").
Lose all three seasons → "Fired."

## What already exists (leverage, don't rebuild)

| Piece | Where | Status |
|---|---|---|
| Full-season sim → standings → real NHL bracket → Cup champion | `app/api/simulate/route.ts` | Done (single season) |
| Offseason FA resolution (UFA/RFA markets, offer sheets, FA_POOL) | `app/lib/free-agency.ts` `resolveLeagueOffseason` | Done, wired into armchair GM |
| Draft rookies → ELC assets with NHLe-projected pace | `app/lib/draft-rookies.ts` | Done (2026 class only) |
| Aging curve (peak 26 F / 27 D / 29 G, decline after) | `app/lib/sim-engine.ts` `ageDecay` | Done |
| Deterministic RNG seeded on scenario state | `sim-engine.ts` `mulberry32` + `scenarioSeed` | Done |
| Development profiles / prospect timelines | `app/lib/development-profile.ts` | Done |
| Change-of-scenery flag (recoverable-NAV concept) | strand/NOIV layer | Concept exists, not a sim input yet |

The armchair GM already runs ONE cycle: offseason → trades → sim →
champion. The challenge is that cycle × 3 with a season-rollover engine
in between.

## New pieces needed

### 1. `advanceSeason()` — pure season-rollover lib (the core gap)

Pure function: league state + seed → next season's league state.

- **Aging**: `age + 1` for everyone.
- **Contracts**: `yearsRemaining - 1`; newly expiring players get
  `expiryStatus` derived (age 27+ or 7 accrued seasons → UFA, else RFA)
  and flow into the existing `resolveLeagueOffseason`.
- **Retirement**: seeded probability ramp — near-zero under 35, sharp
  after 38, goalies get ~2 extra years, stars (high pace) linger,
  fringe veterans (low pace + low cap hit) exit early. Retired players
  leave the pool permanently for the run.
- **Stat regeneration**: next `ptsPace = stablePts(p) × ageDecay ×
  breakoutRoll`. `baselinePtsPace` shifts toward last season's result
  (rolling 60/40 blend, same weights `stablePts` already uses).

### 2. Breakout / regression engine

One seeded roll per player per offseason:

- ~8% breakout (+15–35% pace), ~10% regression (−10–25%).
- Age-biased: <24 breakout-heavy, 30+ regression-heavy (on top of
  `ageDecay`, which stays deterministic).
- **Change of scenery**: a player traded mid-run to a team where his
  lineup slot improves (see §3) gets breakout odds doubled. This makes
  the existing change-of-scenery flag a real sim input — buying low on
  a buried player and giving him top-six minutes should sometimes pay.
- **Luck signal (shot quality vs finishing)**: `Asset` already carries
  `xGPace` and `goalsPace` from MoneyPuck, so "unlucky" is computable
  in-house today — finishing well under expected goals (goals < 85% of
  xG) biases breakout odds up; running hot (> 125% of xG) biases
  regression up. **Enrichment**: NHL Edge shot-location data (REST
  endpoints under `api-web.nhle.com`/`edge`, documented in
  github.com/coreyjs/nhl-api-py — we call the endpoints directly from
  TS, no Python dependency) can sharpen this later, e.g. high-danger
  shot share vs finishing rate to separate "bad luck" from "bad shots".

### 3. Lineup context (lines matter)

`projectSkaterSeason` currently projects each skater in isolation.
Add two modifiers computed per team before the sim:

- **Slot multiplier**: sort forwards by pace into L1–L4 (D into pairs);
  multiply pace ×1.08 / ×1.00 / ×0.92 / ×0.85. A 60-point player on a
  stacked team gets third-line minutes and produces like it — and the
  same player traded somewhere thin becomes an L1 breakout candidate.
- **Linemate quality**: small bump/penalty from the average pace of the
  player's line — a passenger on McDavid's wing outperforms his talent.

### 4. AI GM minimum viability (other 31 teams can't be statues)

- They already re-sign/lose FAs and draft via existing libs.
- Add one pass: if a team is cap-illegal after rollover, it waives/
  buries its worst-value contract until legal.
- (Stretch, not required for v1: AI teams make 1–2 seeded trades per
  offseason from the trade-block list.)

### 5. Retention abuse guard

CBA-accurate constraints, enforced across the whole 3-year run:

- Max 50% of AAV retained; a contract can be retained at most twice.
- **Max 3 retained contracts per team, and the slot stays occupied for
  the full remaining term** — this is the anti-abuse key. Retaining on
  three big deals in Year 1 means zero retention flexibility in Years
  2–3, and the ledger must persist across rollovers.
- Challenge-specific soft cap: total retained dollars ≤ 15% of the cap
  ceiling in any season (matches the real aggregate retention rule).
- UI: a visible Retention Ledger per team so the cost of each slot is
  obvious before committing.

### 6. Run state + UI

- State machine: `Y1 Offseason → Y1 Trades → Y1 Season → Y2 … → Y3`,
  persisted like Press Box saves (localStorage first; DB save slots
  later). Seed the whole run with `scenarioSeed(fullState)` so re-simming
  without changing anything reproduces the same result (no free
  re-rolls), while any roster change genuinely changes the outcome.
- Difficulty stars from the chosen team's phase/standing in
  `TEAMS_DB`: Contender ★ … Tanking ★★★★★. Show on the share card.
- Future drafts: `draft-class-2026.json` only covers 2026. Years 2–3
  need synthetic classes — generate seeded prospect pools with realistic
  pace curves by draft slot (the `rookieAssetFromDraft` NHLe machinery
  already consumes exactly that shape).

## Phasing

1. **Phase 1** — `app/lib/season-rollover.ts`: `advanceSeason()` with
   aging, contract decrement, retirement, stat regen, breakout rolls.
   Pure + heavily unit-tested (this is the layer everything trusts).
   **✅ Implemented 2026-07-06** — includes the xG-vs-goals luck bias
   and the change-of-scenery hook (`ctx.changeOfScenery`, doubled
   breakout odds) ready for Phase 3 to feed. 15 tests in
   `__tests__/season-rollover.test.ts` pin retirement ramps,
   determinism, roll frequencies, expiry derivation, and pace decay.
2. **Phase 2** — Multi-year loop in armchair GM: 3× cycle state
   machine, run persistence, synthetic draft classes for 2027/2028.
3. **Phase 3** — Lineup-context modifiers in the simulate route +
   change-of-scenery breakout bias.
4. **Phase 4** — Retention ledger + limits, difficulty rating, win/fired
   screens, share card.

Phases 1–2 make the mode playable end-to-end (rough edges fine);
3–4 make it fair and fun. Each phase is independently shippable.

## Risks / open questions

- **Re-roll abuse**: seeding on full scenario state mostly solves it,
  but "make a trivial trade, re-sim" is still a cheap re-roll. Option:
  lock the season result once simmed; only offseason states are
  re-enterable.
- **Roster legality drift**: three rollovers compound edge cases
  (23-man limits, cap floor, empty goalie depth). `advanceSeason` needs
  invariant checks + a repair pass, not just trust.
- **Prospect double-counting**: rookies drafted in-run must not also
  appear via the DB injection path on subsequent assemblies — the run
  should own its player list after Year 1 (snapshot, not re-read).
