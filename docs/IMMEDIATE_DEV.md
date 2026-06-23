# The Hockey Ledger 3.0 — Off-Season Mode + Two-Season Sim

## Context
There has been heavy real-world roster churn this offseason, and Armchair GM currently
starts mid-stream with no concept of expiring contracts or free agency. The user wants to
**start Armchair GM in the 2026 offseason**, work a **re-sign phase** for expiring players,
have **all expiring players league-wide** resolved by a **contract-projection "logic gate"**
(what each free agent would sign for: AAV × term, and re-sign vs. walk), sign available UFAs
(hybrid market), and **extend the season simulation to a second season**. Ship the whole
thing as **version 3.0**.

The app already frames "now" as the 2026 offseason: `SEASON.label = "2026-27"`,
`SEASON.rosterMoveWindow = "2026 offseason/opening-night"`, `replaySeason = "2025-26"`
(`app/lib/season-config.ts`). This feature makes that framing interactive.

## Decisions locked with the user
- **Scope:** hybrid + league-wide. Surface all expiring players; a projection engine sets
  terms and re-sign/walk for every team; the user manually handles only their own team and
  can sign UFAs who hit the market.
- **Re-sign depth:** one-click at engine-suggested terms (AAV × term) or "Let Walk."
- **Flow:** a mode picker (Off-Season | In-Season) on entry; the Re-Sign phase runs before
  trades.
- **Also:** add a second-season sim. Bundle and release as v3.0.

## Pre-step (clean the branch)
There are uncommitted `app/page.tsx` edits in the working copy (fig section-marks / diamond
bug next to each kicker) from the prior turn. Decide their fate first — commit as a small
standalone change or revert — so the 3.0 series starts from a clean tree. Unrelated to this
feature.

## Build phases (one 3.0 series; each phase is independently testable)

### A. Surface contract expiry on player assets  — `app/lib/roster-assembly.ts`, `app/lib/trade-types.ts`
- The merged contract in `loadContracts()` already carries `expiryStatus` (UFA/RFA from the
  CapWages scrape), but the final `players.push({...})` drops it. Carry it through, and derive:
  - `contractStatus: "UFA" | "RFA" | "SIGNED"`
  - `expiresThisOffseason: boolean` — heuristic: final contract year (`yearsRemaining <= 1`)
    AND `expiryStatus` is UFA/RFA.
- Add `expiryStatus` / `contractStatus` / `expiresThisOffseason` to the `Asset` type
  (`app/lib/trade-types.ts`); the evaluate `AssetSchema` is already `.passthrough()`.
- **Risk:** `yearsRemainingFromExpiry` (`app/services/scraper.ts`) floors at 1, so a 2026 and
  a 2027 expiry both read as `yearsRemaining = 1` — the expiring set is therefore a heuristic.
  Acceptable for v1; the admin contracts editor can override. Flag in DEVNOTES.

### B. Contract-projection "logic gate"  — new `app/lib/free-agency.ts` (+ `__tests__/free-agency.test.ts`)
- `projectFreeAgentContract(asset, ctx) → { aav, term, status, resignProbability, tier }`,
  **deterministic** (seed via `scenarioSeed`/`mulberry32` from `sim-engine.ts`) so results are
  reproducible and shareable.
- Heuristic model from fields the asset already carries (age, position, `ptsPace`/
  `baselinePtsPace`, `avgTOI`, `gsax`/`savePct`, current `capHit`):
  - Base AAV by production + position; age premium near peak, discount in decline.
  - Clamp to CBA min ($0.775M) and a star ceiling (% of `SEASON.capCeiling`).
  - Term from age + status (RFA bridge vs. UFA long-term); own-team max 8 / market 7.
  - `status` from `expiryStatus`, fallback by age (≲27 → RFA).
- `resolveLeagueOffseason(players, teams, seed) → { resignings, walkAways, marketUFAs, teamCapMoves }`
  auto-resolves all 32 teams and emits cap moves shaped for `cap-delta.ts`. The user's own
  pending FAs come back with suggested terms attached for manual one-click handling.
- Tunable constants live in `season-config.ts` (no magic numbers in logic), matching the
  existing convention.

### C. Off-Season mode + Re-Sign phase  — `app/armchair-gm/page.tsx` (+ new `app/components/ResignPhase.tsx`)
- Add a `mode` state and a **mode picker** on entry (Off-Season default for the current
  calendar | In-Season = today's flow).
- Re-Sign phase (before the trade flow):
  - **Your pending FAs:** suggested AAV × term → **Re-Sign** (apply) or **Let Walk** (remove
    from roster, free cap, leave a hole the sim's existing depth penalties handle).
  - **UFA market:** players who walked anywhere in the league → **Sign** within cap.
  - **Other 31 teams:** resolved silently via `resolveLeagueOffseason` so the sim roster
    reflects league churn.
  - Live cap via `applyCapDelta`/`applyTeamCapDeltas` (`app/lib/cap-delta.ts`); apply roster
    changes with the same mutation + `pickEffectiveStanding` pattern already used for
    `executedTrades`.
- After re-sign, the existing trade flow and sim run on the resulting roster/cap.

### D. Two-season simulation  — `app/api/simulate/route.ts`, `app/lib/sim-engine.ts`
- Refactor the single-season projection in `/api/simulate` into a reusable
  `projectOneSeason(rosters, teams, seed)` (extract the existing standings/playoffs/leaders/
  traded-outcome logic — no behavior change for season 1).
- Add `seasons?: 1 | 2` to `SimRequest`. For season 2: **age every rostered player +1**
  (`ageDecay` is already age-keyed), run an **automated offseason** between Y1→Y2 via
  `resolveLeagueOffseason` (deterministic), then `projectOneSeason` again with a derived seed.
  Return `{ season1, season2 }`.
- UI: season recap gets a Year 1 / Year 2 toggle; the Claude recap payload optionally extends.
- Reuse: `mulberry32`/`scenarioSeed` determinism (already proven by the order-insensitive sim
  tests in `__tests__/simulate-and-claude-routes.test.ts`).

### E. Version 3.0 + docs
- `package.json` version → `3.0.0`; optional masthead/footer version label; update
  `CHANGES.md`, `docs/DEVNOTES.md`, and mark "Contract aging and expiry handling" done in
  `docs/futures/FUTURECONCEPTS.md`.

## Critical files
- New: `app/lib/free-agency.ts`, `app/components/ResignPhase.tsx`,
  `__tests__/free-agency.test.ts`.
- Changed: `app/lib/roster-assembly.ts`, `app/lib/trade-types.ts`,
  `app/api/simulate/route.ts`, `app/lib/sim-engine.ts`, `app/armchair-gm/page.tsx`,
  `app/lib/season-config.ts` (offseason flags + tunables), docs/version.
- Reused as-is: `app/lib/cap-delta.ts`, `pickEffectiveStanding` (`app/lib/pick-value.ts`).

## Verification
- **Unit:** `free-agency.test.ts` — snapshot a few archetypes (young RFA, aging UFA star,
  depth UFA, starting goalie) for sane AAV/term; assert `resolveLeagueOffseason` conserves cap
  (walk frees exactly the old AAV; re-sign applies the new). Extend the simulate tests for
  two-season determinism (same seed → same Y1+Y2).
- **Manual:** Armchair GM → Off-Season → re-sign/walk → cap updates live → sign a market UFA →
  trades → run 2-season sim; confirm Year 2 roster reflects aging + auto-offseason.
- **Gates:** `npm run test` (full), `npx tsc --noEmit`, `npx next lint`, and `npm run build`
  (Armchair GM stays a working route).

## Note on size
This is genuinely large ("one big swoop"). Recommended internal landing order A → B → C → D → E,
each committed and green on the feature branch, released together as the 3.0 series.