# Simulation-model audit — verified triage

**What this is.** A second handed-over audit, this one of the Armchair GM
**simulation engine** (trade-free Winnipeg 3-year Cup Runs, seeds 88944 / 78233 /
60998). It reports release-blocking integrity problems: unconserved skater-games,
illegal rosters that still simulate, silent contract departures, assist-biased
rookies, inflated standings. This document verifies every claim against the code
and pins each to a root cause. **No product code is changed here.**

**Headline — opposite conclusion from the mobile triage.** Where the mobile audit
was largely stale, **this audit is almost entirely correct.** The season model is
a set of *independent per-entity rolls* (each team's points, each skater's line,
each goalie's line) with **no conservation layer** tying them to a physical
season. Goaltending is the one place a shared budget exists (`splitGoalieStarts`),
which is exactly why the audit found goalie starts conserved and skater-games not.

All the real work lives in **`app/api/simulate/route.ts`** (the season model) and
the **offseason hooks** (`useOffseasonFlow.ts`, `free-agency.ts`). Line refs below
are to the code on `claude/cap-crease-mobile-audit-8ug1ft`.

## Status legend
🔴 **CONFIRMED** (accurate, root cause found) · 🟡 **PARTIAL** (accurate with nuance) · ⚪ **INACCURATE** · ✅ **RESOLVED** · effort **S/M/L**.

---

## P0 — release blockers

### P0-1 · Skater appearances are not conserved 🔴 CONFIRMED
- **Evidence:** 18×82 = 1,476 skater-games available; run produced 1,954 / 1,501 / 978.
- **Root cause:** `simulate/route.ts:693` — `simulateLeague` does
  `roster.filter(skater).map(p => projectSkaterOutcome(...))`: **every** skater on
  the roster projects a season *independently*. `projectSkaterOutcome:589` draws
  `gamesPlayed = round(70 + rand*12)` (55–82 for prospects, deployment floors for
  starters). There is **no team-level 1,476-game budget** — total skater-games =
  (#skaters on roster) × ~76. A 25-skater roster → ~1,900; a collapsed 13-skater
  roster → ~980. That tracks the observed 1954/1501/978 precisely.
- **Contrast (why goalies are fine):** `projectGoalies:494` draws one start budget
  and `splitGoalieStarts` (`goalie-workload.ts`, `SEASON_GAMES=82`,
  `MAX_STARTER_STARTS=68`) divides it across the tandem → 82 conserved.
- **Fix:** allocate from a fixed team budget — **1,476 skater-games**, distributed
  by deployment/health — instead of per-skater independent draws. **M.**

### P0-2 · Illegal rosters can simulate 🔴 CONFIRMED
- **Evidence:** Year 3 ran a full 82-game season on 10F / 3D / 1G.
- **Root cause:** no minimum-roster gate anywhere. `sim-request-schema.ts:49`
  validates only `MIN_TEAMS`/`MAX_TEAMS`; per-team position minimums are absent.
  `projectTeamPoints:379` even *anticipates* thin rosters — `depthPenalty =
  forwards.length < 10 ? (10-n)*1.4` and `dPenalty` for `< 6` D — so it **penalises
  and plays on** rather than blocking.
- **Fix:** block below **12F / 6D / 2G**, or visibly sign replacement-level players
  from the FA pool to fill to legal size (and show it). **S–M.**

### P0-3 · Unresolved contracts silently become departures 🔴 CONFIRMED
- **Evidence:** pressing Done with decisions unresolved advanced and removed those
  players with no confirmation or summary.
- **Root cause:** `useOffseasonFlow.ts:194` `proceedToOfferSheets` — if
  `userPending.length > 0` it builds `walkIds` from **all** remaining pending FAs,
  removes them (`players.filter(!walkIds.has)`), pushes them to `market`, and opens
  the next phase. No confirm dialog, no resolution summary, and the roster is **not
  backfilled** to a legal size (feeds P0-2).
- **Fix:** replace the silent default with an explicit "Let all unresolved players
  walk" confirmation + a summary of who left and the cap freed. **S.**

### P0-4 · Rookie production is heavily assist-biased (~20/80) 🔴 CONFIRMED
- **Evidence:** productive rookies 30G / 115A = **79.3% assists** (Zhilkin 14/53,
  Yager 9/37, etc.) — a shared ~20/80 allocator.
- **Root cause (precise):** `projectSkaterOutcome:636` —
  `xgGoalShare = clamp((xGPace ?? 0) / max(stablePace,1), 0.22, 0.55)`, then
  `roleGoalShare = position==="D" ? 0.24 : xgGoalShare`. Rookies/prospects enter
  with a points pace (via `prospectPtsPace`) **but no `xGPace`** (no EDGE/xG for
  junior players), so the ratio is `0/pace → 0`, **clamped up to the 0.22 floor →
  22% goals / 78% assists**. It is not a rookie rule — it is the missing-xG floor,
  and rookies are the population that always hits it.
- **Fix:** derive goal share from shots/finishing/role/PP usage/TOI (not just xG),
  and give prospects a position-and-age goal-share prior when `xGPace` is absent
  rather than defaulting to the 0.22 floor. **M.** *(Per CLAUDE.md, validate any new
  allocator against real NHL G/A splits before it ships.)*

### P0-5 · Prospects play substantial games with zero possible offense ✅ RESOLVED
- **Resolution (2026-08-24):** after lineup opportunity is calculated, a prospect
  profile whose effective scoring pace is still zero is limited to the explicit
  NHL-games sample he has actually established. This couples appearances to an
  existing evidence input instead of inventing an unvalidated replacement-level
  scoring floor. A dressed prospect whose lineup role unlocks a positive
  opportunity pace is unchanged. The full-roster regression reproduced **40 GP /
  0 P** before the fix and now produces **0 GP / 0 P** while the team still
  conserves exactly **1,476 skater-games**.
- **Evidence:** 8 Year-1 rookies = 226 GP / 0 P; Barlow 34GP/0P then 31GP/0P; same
  repeated-zero for Julien/He/Walton/Björck.
- **Root cause:** `projectSkaterOutcome` assigns `gamesPlayed` **unconditionally**
  (`:589` 55–82 for a prospect profile; `:598` 18–42 if benched) but produces
  points from `effectivePace` (`:607`, `:625`). A no-signal rookie has `ptsPace=0`
  **and** `prospectPtsPace≈0` → `skaterPace=0` → `effectivePace=0` →
  `projectedPts=0`, while still dressing for tens of games. Points and appearances
  are decoupled.
- **Fix shipped:** couple GP to the prospect's non-zero effective pace or prior
  NHL sample; do not create a new scoring input. **S.**

---

## P1 — trust problems

### P1-6 · Player roles weakly affect scoring type ✅ RESOLVED
- **Resolution (2026-08-24):** `simGoalShare` now shrinks the noisy xG/points
  anchor toward the real positional distribution, then feeds the skater's
  evidence-backed modern role, forward line/defense pair, PP unit, and prior TOI
  into goal-vs-assist allocation before the existing seeded variance and
  team-goal conservation run. Coefficients were frozen from **960** prior-season
  player pairs (2022-23→2023-24 and 2023-24→2024-25), then cleared an untouched
  **475-player 2024-25→2025-26 holdout**: point-weighted MAE improved
  **0.08308→0.06973 (16.1%)**, with mean goal share **0.3732 predicted vs 0.3741
  actual**. Removing role, line, PP, or TOI separately worsened holdout MAE to
  **0.07095 / 0.07084 / 0.07191 / 0.07326**. Roles that require EDGE-only
  history keep a neutral coefficient until enough seasons exist to validate
  them; they remain display-only rather than moving a number without evidence.
  The reproducible gate is `npm run backtest:sim-goal-share`.
- **Original root cause:** goal share was *only* the xG/pace ratio + a D special-case
  (`:637–640`). The modern role labels ("Line Finisher", "Line Raiser") come from
  `derivePlayerRoles` and are used **display-only** in `modernRole` (`:939`) for
  traded-player outcomes — they never enter goal allocation. So a "Finisher" gets
  no goal tilt; Connor leads in goals because his xG/pace ratio is high, label
  notwithstanding. **M.**

### P1-7 · Elite production runs away; weakly coupled to team ✅ RESOLVED
- **Resolution (2026-08-23):** `carryForwardSimSkaterStats` now validates the
  simulated line, establishes/updates `baselinePtsPace` as a career mean (25%
  new season), carries only a validated 40/60 season/anchor blend, and caps the
  pace banked in one offseason at **+20 pts/82**. The guard is re-applied after
  the seeded `advanceSeason` roll and its career baseline is restored, so a
  second breakout roll cannot bank the route's 1.9× young-player ceiling again.
  G/A pace is rescaled to the guarded points pace. The deterministic three-year
  route+rollover regression went from leaders **138/189/192** and target pace
  **82→142.9→195.2** (red) to **127/147/129** and **82→102→118.3**
  (green), while the existing SIM-CONS layer continues to couple team goals and
  conserve games/goals/standings. This closes the runaway defect; a richer
  primary/secondary-assist team-pool allocator remains a separate model
  enhancement rather than a rollover integrity bug.
- **Original root cause:** the per-player ceiling `ptsCeiling = demonstratedLevel/82 * GP *
  ceilingMult` with `ceilingMult` up to **1.9× for age ≤ 23** (`:633`) — a
  high-pace phenom can reach ~215 (matches Michkov 216/164; assists = pts − goals,
  and his goal share is floored per P0-4 → 164 A). Crucially, `projectSkaterOutcome`
  is **independent of the team's scoring environment**: `projectTeamPoints` rolls
  team points separately (`:333`), and nothing reconciles Σ(player goals) with a
  team goals-for. So a 150-point scorer on a 32nd-place Anaheim is unconstrained.
- **Fix shipped:** regress and cap the year-to-year demonstrated pace in the Cup
  Run carry path; retain the already-shipped team-GF/skater-goal conservation
  envelope. **M.**

### P1-8 · Standings are inflated 🔴 CONFIRMED
- **Evidence:** Year 3 = 3,176 total points, 99.25/team (implies 42% OT games);
  Year 1 had non-playoff teams at 100 and 105 points.
- **Root cause:** `projectTeamPoints:333` returns an **independent per-team points
  roll** = `PHASE_BASELINE (65–108, :327) + rosterStrength + tradeContext +
  variance − capPenalty`, clamped to **[55,135]** (`:410`). Standings are these
  rolls sorted (`assignPlayoffSeeds:791`) — **never derived from game results**, and
  there is no league-wide points conservation. A real 82-game / 32-team league has
  a physically constrained total (≈ 2×1,312 games + #OT games); independent rolls
  centered on high baselines have no such constraint, so the sum floats up.
- **Fix:** derive standings from simulated game results (or at minimum conserve the
  league point total and calibrate the baseline mean to a real distribution). **L.**

### P1-9 · RFA state is contradictory and unauditable ✅ RESOLVED (2026-08-24)
- **Evidence:** Salomonsson allowed to walk → reappeared as "RFA · no comp" with an
  Offer Sheet action despite rights being surrendered → next offseason in neither
  the 150-FA nor 214-RFA pool, with no ledger proving where he went.
- **Resolution:** `offseason-ledger.ts` now audits the mutually exclusive partition
  `roster + retained rights + RFA pool + UFA pool + signed-elsewhere + retired =
  previous + drafted` by unique player id. A temporary UI pool cannot hide a loss:
  every non-retired identity must still exist in canonical `db.players`, and the
  diagnostic reports missing, unexpected, duplicate, and conflicting ids.
- **Transactions/state:** league re-signings, rights, markets, signings, extensions,
  trades, releases, offer sheets, drafts, cap cuts, and retirements enter one
  chronological ledger. User walk/release paths now move the same row to `FA_POOL`;
  surrendering RFA rights explicitly changes both player and projected-contract
  state to UFA, eliminating the contradictory no-comp RFA reappearance.
- **Exposure:** the live check and ledger remain visible through Re-Sign and Offer
  Sheet phases; Cup Run rollover summaries include drafted/retired transitions and
  disclose newly generated depth placeholders outside the real-player equation.
  Focused tests **489/489**, full suite **2,170/2,170**, and tsc pass.

---

## Verdict on the audit
Unlike the mobile audit, **no finding here is stale or inaccurate.** P0-1…P0-5 are
reproducible from the code paths above; P1-6…P1-8 are direct consequences of the
"independent rolls, no conservation" design; P1-9 is accurate with the nuance that
players *are* moved internally but never reconciled or surfaced. The audit's
bottom line — useful prototype, results not yet trustworthy for evaluating roster
or trade decisions — matches what the code does.

## Recommended fix order (reconciled with the code)
1. **Conservation invariants first** (the spine everything else hangs on):
   - exactly **1,476 skater-games** and **82 goalie starts** per team, allocated by
     deployment/health — replaces the per-skater independent GP draw (P0-1, P0-5).
   - **team goals generated first**, then allocated to G / primary A / secondary A
     within that envelope (P0-4, P1-6, P1-7).
   - **standings derived from game results** (or a conserved, calibrated league
     point total) instead of independent team-point rolls (P1-8).
2. **Roster legality gate**: block below 12F/6D/2G, or sign visible replacement-level
   FAs to fill (P0-2).
3. **Explicit unresolved-contract confirmation + summary**; backfill to legal size
   (P0-3, feeds P0-2).
4. **Goal-share model** on shots / finishing / role / line / PP / TOI, with a
   prospect prior replacing the 0.22 xG floor (P0-4, P1-6). Backtest vs real NHL
   G/A splits before it moves a number (CLAUDE.md hard rule).
5. **Transaction ledger + player-state invariant + deterministic seed replay**, and
   surface diagnostics: skater-games/team, team GF vs Σ player goals, total
   standings points, and every offseason player transition (P1-9, plus a guard rail
   that would have caught P0-1 and P1-8 automatically).

**Scope note.** This is the *projection/entertainment* layer, not the X-NAV
valuation engine — but per CLAUDE.md, any new allocator that changes a displayed
number should clear a backtest gate against real distributions first. Items 1 and
5 are the highest-leverage: the conservation invariants fix five findings at once,
and the diagnostics make regressions self-catching.
