# Tasks — active queue

Follow **AGENTS.md → Task Discipline** for every item. One task per run; on completion,
check it off here and append a dated one-line entry to `docs/DEVNOTES.md`.

Legend: `[ ]` to-do · `[~]` partial / verify-then-close

> Completed items live in `docs/bugs/CONFIRMEDFIXES.md`. Un-triaged reports go in
> `docs/bugs/KNOWNBUGS.md` until promoted here.

---

## [x] Correctness

### [x] Task 0.3 — import-draft-class overwrite guard
File: `app/api/admin/import-draft-class/route.ts`. On an existing id, only apply ELC
defaults (capHit/years/clauses) when the existing row is actually a prospect; never
overwrite a row that already has a real `capHit` or NMC/NTC.
Acceptance: re-importing a draft class never clobbers an established player's contract; `npm test` + typecheck pass.

### [x] V2-1 — team phases shuffle league-wide after a trade
Root: `executeTrade` (`app/armchair-gm/page.tsx` ~393–420) re-ranks all 32 teams by
`strengthByTeam`, assigns standings 1..32, and overwrites every team's `standing`/`phase`
via a crude `phaseFromStanding` map that disagrees with the server's `derivePhase` +
`phaseOverride` (`app/api/league/teams/route.ts`). So Carolina (Contender) flips to
Retooling and the whole league shuffles even though only two teams traded.
Fix: a trade must only mutate the two involved teams' capSpace (and at most their own
phase). Leave non-involved teams' `standing`/`phase` exactly as the server provided; if
the two traders' phase should react, recompute only theirs via the canonical logic and
respect `phaseOverride`. No league-wide standing→phase remap.
Acceptance: a trade changes only the two teams' cap (and optionally their own phase);
every other team's phase/standing unchanged; `npm test` + typecheck pass.

### [x] V2-2 — admin cap-ceiling override not reaching Armchair GM
Root: `/api/league/teams/route.ts` uses a hardcoded `CAP_CEILING = SEASON.capCeiling`
(~10, returned ~208) and never reads the live `cap_ceiling` from `siteSettings`. Only
`/api/evaluate`'s `getLiveCapCeiling` reads the DB override, so the 2026-27 cap updates
NAV math but not the teams route Armchair GM uses — and busting cache can't help (it's a
constant, not a cached DB read).
Fix: teams route reads the live ceiling (reuse `getLiveCapCeiling` / read `cap_ceiling`
from `siteSettings`) and returns it as `capCeiling`; ensure `clear-cache` busts
`cache:teams`. (Static `capSpace` stays per Decision A; the ceiling override must flow.)
Acceptance: changing `cap_ceiling` + busting cache → `/api/league/teams` returns the new
ceiling and Armchair GM reflects it; `npm test` + typecheck pass.

### [x] V2-3 — depth-depletion flag misfires for unproven prospects
Root: the "D corps can't absorb losing X" flag (`app/api/evaluate/route.ts` ~668–681 and
the partner-side twin) qualifies "elite D being traded" with `(a.avgTOI ?? 0) > 22 ||
navOf(a) > 100`. A 2026 draft prospect has 0 NHL games but a high *pedigree* NAV (>100 via
`calcProspectNAV`), so the `navOf > 100` branch flags him as an established top-pair D —
firing "Florida's D corps can't absorb losing him" for a player who's never played.
Fix: add a proven-player guard (e.g. `a.avgTOI > 22 && (a.games ?? 0) >= 20`, or exclude
draftees/`!hasLiveStats`) so pedigree NAV alone can't trigger the depletion veto. Apply to
both home and partner sides.
Acceptance: trading for an unproven prospect D (0 NHL games) does not fire "can't absorb
losing him"; trading an established 22-min D still does; `npm test` + typecheck pass.

### [x] V2-4 — acquired goalies invisible on the bench
Root: `app/components/LineupEditor.tsx` builds the bench skaters-only — `bench =
effective.filter(p => isF(p) …)` (~82) and `benchIds = [...fBench, ...dBench]` (~252–255)
include only F and D. A 3rd goalie never appears on the bench, so he can't be swapped into
the active goalie slot. `LineupCard.tsx` also slices goalies to top-2 by games (~74).
Fix: include extra goalies (beyond the 2 active slots) in the bench and make the goalie
slots valid swap targets so a bench goalie can be moved into starter/backup.
Acceptance: an acquired 3rd goalie appears on the bench and can be moved into the
starting/backup slot; `npm test` + typecheck pass.

### [x] V2-4.5 — phase classification collapses EMERGING / REGRESSION_RISK into PEAK_WINDOW
Root: in `classifyPhase` (`app/lib/development-profile.ts` ~190–202) the elite-production
rule `if (scores.production >= 80 && scores.trend !== "FALLING") return "PEAK_WINDOW"`
(~192, added to keep generational vets in their peak window) sits ABOVE the young-EMERGING
checks (~196–197) and the `age >= 32 && regressionRisk >= 55` REGRESSION_RISK check (~193).
So it intercepts two groups it shouldn't: elite teenagers (Celebrini/Schaefer, age 19,
production ≥ 80 → should be EMERGING) and aging career-year outliers (Scheifele, 33, RISING
96-pt season, regressionRisk ≥ 60 → should be REGRESSION_RISK). This is a real model
regression — the test fixtures are correct canaries; do NOT edit the tests, and do NOT add
new phases (the five existing phases are right).
Fix: reorder `classifyPhase` so the young-EMERGING checks (`age <= 21 …`, `age <= 19 &&
nhlGames < 20`) and the `age >= 32 && regressionRisk >= 55` REGRESSION_RISK check run BEFORE
the `production >= 80` PEAK_WINDOW rule. Keep the elite-production rule (it's the only thing
that keeps a genuinely-peak 32–33yo low-regression scorer out of UNKNOWN); just let the
younger/aging-outlier branches win first. Change ordering only — do not alter thresholds.
Verify McDavid (29) stays PEAK_WINDOW and Byfield (23) stays BREAKOUT_CANDIDATE.
Acceptance: the 3 failing cases pass (Celebrini/Schaefer → EMERGING, Scheifele →
REGRESSION_RISK) and the other 10 dev-profile tests stay green; no test edits; `npm test` +
typecheck pass.


### [x] V2-5 — sim ignores user lineup / starting goalie (larger; may split)
Root: `projectStartingGoalie` (`app/api/simulate/route.ts` ~220–226) picks the starter by
sorting on `gamesStarted` desc and taking `[0]` — it never reads the user's lineup, so a
designated starter (Levi) is ignored and Comrie (more GP) is used. Team-strength also sorts
goalies by `onIceValue` (~169). The lineup-editor state isn't passed to `/api/simulate` at
all, so all lineup edits are cosmetic.
Fix: thread the user's lineup (at minimum the designated starting goalie; ideally line/pair
order) from Armchair GM into the `/api/simulate` request, and have the sim use the
designated starter; fall back to the heuristic only when no lineup is supplied.
Acceptance: setting a starting goalie and running the sim uses that goalie; `npm test` +
typecheck pass. NOTE: largest of the set — touches the simulate payload + sim engine + the
Armchair GM call site. If the diff balloons, split into "thread lineup into payload" and
"consume it in the sim".

---

## [x] Valuation

### [x] R3 — defensive-D undervaluation (the Parayko case)
File: `app/lib/xnav-engine.ts` (`calcSkaterNAV`). A shutdown top-pair D — ~22+ TOI, modest
points (~25–30), strong suppression, ~$6.5M long deal — computes to negative NAV, yet the
market pays a mid/late 1st + a prospect (≈150–180 NAV). Two stacked biases:
- `trueMarketValue` is offense-weighted, so a points-light D scores low (small `offTotal`;
  `defTotal` only moderate after deployment terms, then squeezed by the 80 asymptote).
- The cap sigmoid + floor drag him negative: low `trueMarketValue` → D `fmvCapPct`
  (`MIDPOINT = isD ? 120`) maps below his $6.5M → negative `capTotal`; and
  `qualifiesEliteDefender` requires `pts >= 65`, so a shutdown D gets no floor.
Fix (both, with guardrail):
1. Credit shutdown deployment + suppression for `isD && toi >= 22` — deployment
   (`toiD`/`qocVal`), `xgaRelTM` suppression, `pairDriverScore` — and raise/soften the
   `defTotal` asymptote so a true top-pair shutdown D lands realistically.
2. Add a shutdown-top-pair-D floor: qualify when `toi >= 22 && (dps high OR xgaRelTM
   strongly negative OR qocIndex high)`; floor ~130–150 (below the 160–240 offensive-D
   floors).
3. Guardrail: require BOTH high TOI AND a genuinely strong defensive underlying — minutes
   alone must not credit a weak/sheltered D.
Characterization test (3 cases): Parayko-type → NAV ≥ ~120 (not negative); weak low-point D
→ stays low; elite offensive D (Makar) → unchanged.
Acceptance: shutdown top-pair D no longer reads negative; weak D unaffected; offensive D
unchanged; existing NAV tests stay green (update only the intentionally-shifted shutdown-D
values); `npm test` + typecheck pass.

### [x] R1 — finish expanded-card de-dup (verify, then close)
Adjustment: PTS and TERM are unable to be sorted by, these should be able to be sorted by. <div style="font-size: 10px; color: var(--rule); text-transform: uppercase; font-weight: 900; text-align: right;">PTS</div> and <div style="font-size: 10px; color: var(--rule); text-transform: uppercase; font-weight: 900; text-align: right;">Term</div> should be buttons no different than <button class="col-header">P/82 </button>
Done already: SEASON POINTS duplicate removed, "Now" tile added, "? STRAND trait guide"
collapsed. **Remaining to verify in `app/players/page.tsx` + `app/components/StrandDisplay.tsx`:**
(a) the STRAND **helix vs OFFENSE/DEFENSE bar block** still renders the same 8 values twice
— de-dupe (keep one); (b) the **CONTRACT PROJECTION** block is still a large flat chart for
short deals — compact it to a stat/sparkline. If both are already addressed, move this to
CONFIRMEDFIXES.

---
## [x] UI/UX Fixes

### [x] UI1 - `app/players/page.tsx` button font is too small. 
- Need this to be readable for people who arent aware of what is going on. PTS, PPG, buttons are illegiable.

### [x] UI2 - `app/players/page.tsx` players names need to be listed at full at all times. 
- We can apply the ICON key to this page. Players page still follows the PlayerMaker, Sniper, Scorer Architype so we will have to add icons there. 

### [x] UI3 - `app/players/page.tsx` defence and goalie headers need to have their own sorting. 
- Defence and goalies need to have their own listed categories. For Defence we should have PTS, OPS, DPS, TOI, AGE, CONTRACT, YRS LEFT and SUPP to replace PPG. Goalies should have GSAX, SV%, GAA, Contract, Yrs left and GP.

### [x] UI4 - `app/players/page.tsx` needs to follow to have the same icons fed into it like on the Armchair GM Asset Card. 
- Megalodon, Frachise, Surplus, Pedigree, etc. 

### [x] UI5 - `app/players/page.tsx` although duplicate given there is one in the footer, needs a proper icon key found at the top.
- Users need reference to what they are looking at, at the page load, not having to scroll down to the glossary.



## [x] Development Outlook

### [x] D1 — production scale + projection clamps (dynasty cliff already done)
Remaining only (dynasty age-cliff graduation is already in `development-profile.ts`):
1. `productionScale` still flattens elite scorers (W 90 / C 95 / D 65) — raise (~W 110 /
   C 115 / D 75) or add a soft curve above 100 so a 150-pt and a 92-pt scorer separate.
2. `buildProjectionBand` clamps (median 140 / ceiling 160) still flatten the top — raise so
   a 150-pt scorer projects higher than a 135-pt one.
Acceptance: two elite producers with different pts no longer both read production 100; elite
projections separate; dev-profile tests updated for the intentional shifts; `npm test` +
typecheck pass.

### [x] D2 — durability / games-played as a development input
File: `app/lib/development-profile.ts` (+ surface in panel). An 82-game iron-man and an
injury-prone star with the same per-82 pace currently read identically.
- Compute `durabilityScore` (0–100) in `calcDevelopmentProfile` from per-season `games`
  already on the NHL snapshots: ~`clamp(mean(NHL season games) / 82 * 100)`.
- Fold in modestly: low durability raises `regressionRisk`/`bustScore` and lowers
  `confidence` a touch; high durability nudges the other way. Small weights.
- Add `durabilityScore` to the type; show a **Durability** MiniScore in the panel INPUTS
  group with a tooltip ("avg games played per season vs 82").
Acceptance: two players with identical per-82 pace but different season GP get different
durability/risk/confidence; panel shows Durability; existing dev-profile tests stay green
(update intentional shifts); `npm test` + typecheck pass.

### [x] D3 — veteran framing for the Development Outlook
Files: `app/lib/development-profile.ts`, `app/components/DevelopmentProfilePanel.tsx`.
- "Established vet" = `age >= 29 && careerNhlGames >= 250`.
- Helper `estimatePeakYearsLeft(age, position, productionScore, trend)`: base =
  `peakEnd - age` (peakEnd ≈ 30 F / 31 D / 33 G); `+2` if `productionScore >= 85 && trend
  !== "FALLING"`, `-1` if FALLING; clamp 0–6. Return as `peakYearsLeft?` on the profile.
- In the panel, for established vets only, replace the "Breakout" tile with **"Peak Left"**
  (`{peakYearsLeft}yr`, greener = more) and prefer veteran phase labels. Non-vets unchanged.
Acceptance: a 33-yo elite scorer shows "Peak Left"; a 22-yo prospect is unchanged;
`npm test` + typecheck pass.

### [x] D4 — Development Outlook glossary / key
File: `app/components/DevelopmentProfilePanel.tsx`. Add a collapsed-by-default
**"? Outlook key"** toggle (mirror the "? STRAND trait guide" pattern) defining every term:
Now, Dynasty, Breakout/Peak Left, Risk, Arc, Boom, Bust, Inputs (Prod/Role Δ/Pedigree/Exp/
Durability), Projection, phase/trend/sample conf. One collapsible block, default closed.
Acceptance: every metric is defined in the collapsible key; closed by default; `npm test` +
typecheck pass.

## For Future Trade Tracker (Known as The Docket)

### [ ] A3a — shared cap-delta helper
Add a pure helper `applyCapDelta(baselineCapSpace, moves)` where `moves` is the per-team set
of incoming/outgoing assets with `capHit` and `retainedPct`. Returns effective cap space:
baseline − incoming cap (net of retention held by the other team) + outgoing cap (net of
retention this team keeps). No I/O; unit-testable in isolation.
Acceptance: characterization tests cover a straight swap, a retained-salary move, and a
pick-only move (no cap change); `npm test` + typecheck pass.

---

## Tests

### [ ] 1c — roster-assembly tests for `/api/league/players`
Tests that a player on two teams' feeds dedups to one, DB-injection augments without
duplicating, and name/stat matching attaches the right stats. Mock the fetches; assert the
emitted player list. Do NOT change route logic.
Acceptance: tests cover the three cases above and pass; `npm test` + typecheck pass.
