# Trade Engine / Franchise Sim Notes

## Development Tab / Player Trajectory Issues

**Status: Done**

### Season Played vs Total Games Played

The Dev tab currently only evaluates the current season’s games played, not total career games played.

Example:

* Vincent Trocheck shows as a partial record because he has 68 games played in the current season.
* The system does not recognize his full NHL history.

Because of this, the model treats many established players as if they are rookies and assumes they are not declining.

### Trajectory Detection

Players around age 24, such as Cole Perfetti, should have enough history to determine a meaningful trajectory.

Established players such as Leon Draisaitl should not show as having limited timeline history.

### Action Items

* [x] Update player development logic to reference total NHL games played and historical seasons, not only the current season.
* [x] Improve trajectory classification for established players.
* [x] Ensure older elite players are evaluated with proper aging and decline curves.

---

## Trade Approval / NAV Logic

**Status: Done**

### Overpaying vs Underpaying

The NAV trade approval system needs refinement.

Currently, trades can often be made with a `+40 NAV` advantage. The user rarely needs to overpay and can consistently underpay while still getting trades approved.

### Action Items

* [x] Tighten NAV approval thresholds.
* [x] Reduce the frequency of lopsided trades being accepted.
* [x] Add more contextual trade resistance based on team status, asset importance, and player role.

---

## Retained Salary

**Status: Done**

### Retained Salary Does Not Persist

Retained salary currently does not persist after a trade is completed.

### Action Items

* [x] Ensure salary retention is stored as part of the traded player’s contract state.
* [x] Confirm retained salary carries forward correctly after trade execution.
* [x] Validate that retained salary impacts both team cap sheets after the trade.

---

## Dynamic Team Status Updates

**Status: Done - session-local lightweight model**

### Team Status Should Update After Major Trades

If the home team makes a trade that meaningfully improves the roster, the team status should dynamically update.

Example:

* Minnesota trades for Quinn Hughes.
* Minnesota should move from a rebuilding or neutral state into a more desirable / win-now state.

### Action Items

* [x] Recalculate team status after every accepted trade.
* [x] Update team direction dynamically based on roster strength, star power, age curve, and competitiveness.
* [x] Ensure the UI reflects the updated team state immediately.

---

## Contention Quadrant / Team Evaluation

**Status: Open**

### Depth Needs Greater Weight

The contention quadrant needs to better account for roster depth.

Currently, most teams appear to fall into a win-now state. However, adding fringe NHLers and unproven rookies should not meaningfully move a team toward contention in real life.

### Action Items

* [ ] Reevaluate contention logic.
* [ ] Add stronger weighting for:

  * Top-end talent
  * Defensive depth
  * Goaltending quality
  * Proven NHL contributors
  * Prospect uncertainty
* [ ] Reduce the impact of fringe NHLers and unproven rookies on win-now status.

---

## Dynamic Draft Pick Values

**Status: Partial - dynamic session standings are wired; deeper projection inputs remain open**

### Draft Picks Should Not Be Hardcoded

Draft pick values should be dynamic based on team strength and projected standings.

If a team trades away its best player, its draft pick value should increase.

If a team improves significantly, its draft pick value should decrease.

### Action Items

* [x] Replace hardcoded draft pick values with dynamic valuation.
* [x] Recalculate pick value after trades.
* [ ] Factor in:

  * Team overall
  * Team direction
  * Roster strength
  * Star player movement
  * Projected standings
  * Current season record, if available

---

## Draft Pick Inventory

**Status: Done**

### Add 2029 Draft Picks

The draft pick inventory should include first through fifth round picks for 2029.

Required total draft picks:

```text
2027: Round 1-5
2028: Round 1-5
2029: Round 1-5
```

All draft picks should be sorted by year.

### Action Items

* [x] Add 2029 first through fifth round picks.
* [x] Ensure all draft picks are displayed in year order.
* [x] Confirm pick values use dynamic valuation.

---

## Tanking Team Trade Restrictions

**Status: Done**

### Tanking Teams Should Not Sell First Overall Picks

Teams that are tanking should not generate trades where they sell their first overall pick.

### Action Items

* [x] Add protection logic for high-value picks owned by tanking teams.
* [x] Prevent trade proposals involving a likely first overall pick unless the return is exceptional.
* [x] Add stronger veto logic for rebuilding/tanking teams moving premium picks.

---

## Find Trade Proposals

**Status: Done**

### Generated Trades Should Auto-Pass

The “Find Trade Proposals” feature should not generate trades that fail approval when loaded.

### Action Items

* [x] Validate generated trade proposals before showing them to the user.
* [x] Only display proposals that pass the trade approval engine.
* [x] Ensure loaded trade proposals remain consistent with the original generated approval state.

---

## Salary Retention UX

**Status: Done**

### Mobile Scroll Issue

The salary retention slider is often triggered accidentally when scrolling on mobile.

### Action Items

* [x] Adjust salary retention UX for mobile.
* [x] Consider replacing the slider with:

  * Tap-to-edit percentage
  * Stepper controls
  * Confirmation modal
  * Lock/unlock interaction before adjusting
* [x] Prevent accidental retention changes caused by page scrolling.

---

## Trade Block / Shopped Players

**Status: Done**

### Shopped Players Should Bypass Certain Vetoes

Players who are actively shopped or listed on the trade market should not trigger the veto:

```text
"x team can't afford to lose x player"
```

### Action Items

* [x] Add a condition to bypass this veto for players currently on the trade block.
* [x] Ensure the team’s willingness to move the player is respected in trade logic.

---

## Ledger UX

**Status: Open**

### Copy Text From Ledger

Determine whether users should be able to copy text from the ledger.

### Action Items

* [ ] Evaluate whether ledger entries should support copy-to-clipboard.
* [ ] Consider adding a copy button for individual ledger entries.
* [ ] Ensure ledger text selection works on desktop and mobile.

---

## Trade Block Session State

**Status: Done**

### Remove Traded Players From Block

Once a player is traded from the block onto a new team, they should be removed from the trade block during that session.

### Action Items

* [x] Update trade block state after trade completion.
* [x] Remove traded players from the active block list.
* [x] Ensure this persists for the current session.

---

## Player Data / Stats Issues

**Status: Done**

### Alexis Lafrenière Stats Not Populating

Alexis Lafrenière on NYR is not populating stats.

Possible cause:

* Accent handling in the player name.

Current issue:

* Listed at `440 NAV`
* Classified as a “megalodon” value

### Action Items

* [x] Investigate name normalization for accented characters.
* [x] Confirm player stat lookup works for:

  * Lafrenière
  * Lafreniere
  * Other accented NHL player names
* [x] Prevent missing stats from inflating NAV incorrectly.
* [x] Add fallback matching by player ID if available.
* [x] Reopen/fix Lafrenière regression where drafted NHLers skipped fallback stats and were still valued as unproven first-overall prospects.
* [x] Add NHL goalie summary fallback so Devon Levi-style goalies with NHL GP/SV% do not show as EST when MoneyPuck misses them.

---

## Player Change-of-Scenery Logic

**Status: Open**

### Players Can Thrive After Moving Teams

Players who have not worked out on one team should have a chance to thrive on a new team.

Example:

* Trevor Zegras performing better in Philadelphia than Anaheim.

### Action Items

* [ ] Add change-of-scenery upside logic.
* [ ] Factor in:

  * Age
  * Role change
  * New linemates
  * Team system
  * Previous underperformance
  * Draft pedigree / skill ceiling
* [ ] Avoid permanently suppressing value for young players who struggled in one environment.

---

## Prospect Trade Reluctance

**Status: Open**

### Teams Should Be Reluctant to Trade Top Prospects

Teams should be more reluctant to trade top-tier prospects.

Example:

* Philadelphia should not trade Porter Martone unless the deal is a very lucrative win-now move.

### Action Items

* [ ] Increase trade protection for elite prospects.
* [ ] Add stronger reluctance multipliers for:

  * Recent high draft picks
  * Top organizational prospects
  * Players with high ceiling
  * Prospects aligned with team timeline
* [ ] Allow exceptions only for major win-now upgrades.

---

## Lineup / Simulation Logic

**Status: Open**

### Confirm Line Changes Affect Simulation

Need to confirm whether moving and adjusting lines affects the simulation.

Also confirm whether players who are moved into the lineup receive games played for the season.

### Action Items

* [ ] Test whether line changes impact:

  * Sim results
  * Player usage
  * Games played
  * Production
  * Development
* [ ] Ensure lineup changes are reflected in season stat tracking.

---

## Defensive Value / Awards Logic

**Status: Open**

### Jaccob Slavin Value Issue

Jaccob Slavin has not won the Norris Trophy but is still an elite shutdown defenseman.

Current issue:

* He has negative value despite being elite defensively.

### Action Items

* [ ] Improve defensive defenseman valuation.
* [ ] Do not rely too heavily on Norris wins or offensive production.
* [ ] Add weighting for:

  * Defensive impact
  * Matchup difficulty
  * Penalty killing
  * Shutdown role
  * Real-world reputation
  * Advanced defensive metrics, if available

---

## Select Asset Screen

**Status: Done**

### Show Years Remaining

The asset selection screen should display contract years remaining.

### Action Items

* [x] Add years remaining to player cards or rows.
* [x] Ensure years remaining is visible before adding an asset to a trade.
* [x] Consider displaying:

  * Cap hit
  * Years remaining
  * Age
  * Position
  * NAV

---

## Line Change UX

**Status: Done - first mobile readability pass**

### Mobile UX Needs Rework

The line change UX is not intuitive, especially on mobile.

### Action Items

* [x] Rework line editing flow for mobile.
* [x] Improve drag/drop or tap-to-swap behavior.
* [x] Make player movement clearer.
* [ ] Add visual confirmation after a line change.
* [x] Reduce accidental moves.
* [x] Consider a dedicated mobile lineup editor layout.
* [x] Enlarge lineup slots and bench chips for mobile readability.
* [x] Show each player's main position and NAV in the lineup editor.

---

# Priority Summary

## High Priority

* [x] Fix Dev tab using season played instead of total games played.
* [x] Fix retained salary persistence.
* [x] Tighten NAV trade approval logic.
* [x] Prevent generated trade proposals from failing when loaded.
* [~] Add dynamic draft pick values. Session-local dynamic standings are done; deeper projection inputs remain.
* [x] Fix Lafrenière stat lookup / NAV inflation.
* [x] Improve mobile salary retention UX.
* [x] Aleksander Barkov coming up as EST, receiving a NAV of 27. Fixed by applying historical elite-skater floors in server-side NAV evaluation so stale current inputs cannot collapse proven top two-way centres.
* [x] Newest Stanley Cup Champion Carolina Hurricanes (2026), Jordan Staal (Conn Smythe Winner). Added latest-completed-season metadata to season config, sim response, UI league context, and Claude recap prompt without forcing simulated playoff winners.
* [x] Admin Panel no longer has extensions, so now Kyle Connor shows his 8 year contract but with an 8 year extension flag. Fixed by retiring extension overlays from league roster payloads while preserving normal cap hit / years remaining.
## Medium Priority

* [x] Recalculate team status dynamically after trades.
* [ ] Improve contention quadrant depth logic.
* [x] Add stronger protection for tanking teams trading first overall picks.
* [ ] Improve top prospect trade reluctance.
* [ ] Confirm line changes affect simulation and games played.
* [x] Remove traded block players from the session block.

## Low Priority / UX Polish

* [ ] Add copy functionality to the ledger.
* [x] Add years remaining to select asset screen.
* [x] Rework line change UX, especially on mobile.

## Current Remaining Audit Queue

* Contention quadrant depth weighting.
* Dynamic draft pick valuation projection inputs beyond session-local standings.
* Change-of-scenery upside logic.
* Top prospect trade reluctance.
* Lineup/simulation validation.
* Defensive defenseman valuation, including Jaccob Slavin-style profiles.
* Ledger copy UX.
* Line change visual confirmation after swap.


## Audit QuickTradeMachine 2026/06/18

The Trade Machine is a thin page (app/trade-machine/page.tsx) that renders QuickTradeMachine. The flow is:

    QuickTradeMachine.tsx — UI: two team selectors, asset pickers, retention dropdowns, live cap/production/NAV summaries, "Run GM Audit", and "Generate Share Link".
    evaluate-client.ts — fetchNavMap (cached per-asset valuations) and fetchTradeVerdict (full audit). All math is server-side.
    app/api/evaluate/route.ts — the real engine: getAssetNAV → calcNAV, compressPackage, runGmLogic (~700 lines of GM heuristics → GmFlag[]), and evaluateTrade (maps flags to a WIN/LOSS/FAIR/BLOCKED/DECLINED status + metrics).

One thing worth clearing up: app/lib/trade-logic.ts is not used by the Trade Machine. It's consumed by TradeProposal.tsx (Armchair GM auto-generation). So "Trade Machine logic" really lives in route.ts. I reviewed both.
What's solid

    The GM-logic engine is genuinely impressive in coverage: cap ceiling/floor, NMC waive probability, untouchables hard-decline, franchise-anchor tiers, positional-minimum protection on both sides, division-rival friction, rebuild/contend timeline mismatches, rental tax, age cliff, salary-dump sweetener prompts, compression-loss "you're overpaying with depth" warnings. Two-sided perspective (vetoesSide/perspective) is a nice touch.
    NAV caching keys on the actual valuation inputs + a version string (evaluate-client.ts:16-37) — correctly invalidates on contract/retention edits.
    Verdict fetch only sends unique traded assets but full rosters for context; AbortController cancels in-flight nav fetches. Clean.

Bugs (cited, fixed 2026-06-18)

1. [x] Stale verdict can be shared — QuickTradeMachine.tsx:489-499. The useEffects clear verdict only when homeTeamId/partnerTeamId change. Adding/removing/retaining an asset (setOutgoing/setIncoming) does not clear the verdict. So a user can: Run Audit → edit the package → the old verdict still renders, and createShare (:516-530) will lock that now-mismatched verdict into the share payload alongside the edited assets. The shared link will show assets that don't match its verdict. Recommend clearing verdict/shareUrl whenever outgoing/incoming change.

2. [x] Headline NAV number disagrees with the verdict — QuickTradeMachine.tsx:221 & 298-307. summarizePackage sums raw navMap[id].total, so the "NAV Balance" strip and "Package NAV" deltas are linear sums. The verdict's homeNetGain (route.ts:1040) uses compressed NAV. For multi-player packages these can diverge substantially, and the only thing reconciling them is a SOFT flag buried in the verdict list. A user reading "+15 NAV" on the strip but getting a LOSS verdict will be confused. At minimum the strip should label it "linear" or surface the compressed figure.

3. [x] Stale division data — route.ts:218-219. The DIVISIONS map still lists ARI: "Central" (Arizona relocated to Utah in 2024) alongside UTA, leaving Central with 9 entries. Meanwhile trade-logic.ts:441 lists only UTA. Harmless for live data (no ARI team exists), but it's an inconsistency between the two division tables and dead data.
What I'd consider missing / critical

✅ Integration test for the /api/evaluate route added 2026-06-18. `__tests__/evaluate-route.test.ts` now POSTs real payloads to the route handler and asserts behavioral verdict output for cap-ceiling breach → `BLOCKED`, untouchable partner asset → hard veto, and balanced low-risk swap → `FAIR`.

Other functional gaps (not bugs, but notable absences for a "trade machine"):

    Retention CBA rules are incomplete. The engine blocks >50% retention (route.ts:533) but doesn't enforce the max 3 retained contracts per team, nor the double-retention / re-trade rules. There's also no UI for a third-party broker taking salary.
    No same-player guard. Team selectors exclude each other, so you can't trade within a team, but there's nothing stopping odd inputs beyond that — minor.
    Verdict flag display is lossy. VerdictSummary (:341-355) slices to 4 flags and drops perspective/category, so "whose problem is this" and overflow flags are invisible in the Trade Machine view (the Armchair GM components like VerdictPanel presumably show more).
    No empty-NAV/error fallback messaging when fetchNavMap returns zeros for an unknown asset — it silently shows 0 NAV.


## XNAV / YOUNG PLAYERS / GOALIE CALCULATION AUDIT

Status: Complete as of 2026-06-18.

Skater fixes completed:

1. Prospect pedigree no longer gets a blanket certainty premium. Unsupported drafted prospects are discounted below equivalent fresh-pick value for burned development time, while NHLe production can pull the multiplier back toward or slightly above slot value.
2. The 14-game valuation cliff is replaced with a 14-60 game transition band that blends prospect pedigree into skater NAV instead of flipping all at once.
3. Young-skater development risk is now track-record-aware. The age bucket remains the base, but NHL games and established role/production relieve the discount for ordinary proven young players.
4. Positive age value is gated by projection signal from production, role, pedigree, and sample size. Youth alone no longer creates full independent NAV.
5. OPS/DPS pace extrapolation is damped by sample confidence so a 20-game hot start does not fully annualize into the point-share channel.

Goalie fixes completed:

1. Tandem/backup caps now include an ascending-goalie path. Young, controlled, high-rate 1B profiles can exceed the old 60 NAV tandem cap, while veteran tandems remain capped.
2. The 50-game starter market floor is rate-gated, reducing bad-volume starter inflation.
3. Goalie NAV now emits a `volatility` score, and `/api/evaluate` surfaces high goalie variance as an `ASSET_SHAPE_MISMATCH` GM warning.
4. Post-30 goalie aging was softened from the prior steep convex penalty to better reflect the position's wider veteran aging band.

Verification added:

- `__tests__/xnav.test.ts` covers discounted unsupported prospects, 14-60 prospect blending, track-record relief, signal-gated youth upside, small-sample point-share damping, ascending 1B goalie caps, veteran tandem caps, and goalie volatility.
- `__tests__/evaluate-route.test.ts` covers the route-level goalie volatility warning in a real `/api/evaluate` POST flow.

## DEVELOPMENTPROFILEPANEL AUDIT 2026-06-18

Status: Complete as of 2026-06-18.

Completed fixes:

1. Draft pedigree now decays with NHL sample. `calcDevelopmentProfile` keeps raw pedigree for context, but dynasty scoring uses a sample-adjusted `effectivePedigreeScore` that falls toward zero after roughly 200 NHL games.
2. Dynasty scoring shifts mature-player weight toward production, role, and confidence instead of leaving draft slot as a permanent headline input.
3. Forward production scaling was raised so strong NHL producers no longer clamp at 100 too early.
4. Sample confidence now contributes to established-player dynasty scoring and is labeled separately from scoring volatility in the panel.
5. The trend rationale now describes scoring trajectory/volatility as a separate axis from sample confidence.
6. The panel now surfaces the hidden component context:
   - production score
   - role score
   - sample-adjusted pedigree score
   - NHL experience score
   - pedigree sample weight
   - confidence input
   - 3-year scoring trajectory
7. The rationale includes an explicit line when draft pedigree and established production disagree.

Verification added:

- `__tests__/development-profile.test.ts` now verifies that an established, more productive Seth Jarvis profile ranks ahead of an established Alexis Lafreniere profile after pedigree decay.
- `__tests__/feature-canaries.test.ts` protects the sample-decay model and the visible panel input/trajectory context.

## Audit Xnav Line by line
[
  {
    "file": "app/lib/xnav-engine.ts",
    "line": 763,
    "summary": "Hard clamp-to-4 is a discontinuous bandaid instead of the sample/ice-time confidence scaling used everywhere else in this engine, creating a cliff at the gate boundaries.",
    "failure_scenario": "Two near-identical callups: one at avgTOI 8.9 is floored to total 4; one at avgTOI 9.0 keeps its full ~20-35 uncapped NAV. Same one-game/one-minute difference flips value by an order of magnitude — unlike goalie confidenceAdj, paceConfidence, the 14-60 transition band, or pedigree decay, which all scale continuously."
  },
  {
    "file": "app/lib/xnav-engine.ts",
    "line": 769,
    "summary": "total is clamped to 4 but off/def/age are returned at full magnitude, so the component breakdown no longer reconciles with the headline.",
    "failure_scenario": "A clamped callup with offTotal 30, defTotal 20, ageTotal -10 returns total:4 while AssetCard.tsx (MicroBars at ~331/341/356) renders OFF 30 / DEF 20 alongside headline NAV 4 — the bars visibly contradict the total a user is reading."
  },
  {
    "file": "app/lib/xnav-engine.ts",
    "line": 765,
    "summary": "displayedCap = min(capTotal, max(0,total)) silently discards real cap-surplus information for clamped callups.",
    "failure_scenario": "A cheap-ELC callup with genuine capTotal 25 and clamped total 4 shows cap 4 in the CAP bar (AssetCard.tsx:356) — 21 points of real surplus erased. The patch also only adjusts cap (not off/def/age), so it can't actually restore the component-sum invariant it appears to be defending."
  },
  {
    "file": "app/lib/xnav-engine.ts",
    "line": 757,
    "summary": "The gate inspects only points/TOI/baseline/age and never off/def/cap, so a low-minutes player whose value the engine itself credits via defense or cap can be floored to 4.",
    "failure_scenario": "A 28-year-old recalled D, 12 GP at 8.8 TOI, ptsPace ~8, no MoneyPuck baseline ≥ the thresholds, draftOverall null: all gates pass, uncappedTotal ~35 (from defTotal + cheap-cap surplus) collapses to 4. Partly mitigated by the baselineDpsProxy ≥ 1.5 clause, but only for players who already have a stored defensive baseline."
  },
  {
    "file": "app/lib/xnav-engine.ts",
    "line": 762,
    "summary": "The `draftOverall == null` conjunct adds almost no selectivity and misrepresents itself as a pedigree guard.",
    "failure_scenario": "The live roster feed (app/api/league/players/route.ts) never populates draftOverall, and enrichment only covers the 2020-2026 classes — so for age>=26 players draftOverall is null essentially always. The condition is true for nearly everyone reaching the block; meanwhile the age>=26 gate already excludes recent prospects, so this term protects no one it claims to."
  },
  {
    "file": "app/lib/xnav-engine.ts",
    "line": 763,
    "summary": "Magic number 4 and uncommented thresholds (26/14/9/15) in a six-term boolean, inconsistent with the documented constants elsewhere in the file.",
    "failure_scenario": "Unlike the developmentDiscount ladder, franchise floors, and goalie confidence caps (all commented with rationale), a future maintainer retuning the callup heuristic can't tell why total caps at 4, why TOI 9, or how the six conditions interact — raising the risk of an incorrect retune."
  }
]

# Batch auditing path
1	Core valuation + trade verdict	xnav-engine.ts, evaluate/route.ts, trade-logic.ts, trade-types.ts	The money path. Already partly covered; highest blast radius.
2	Trade UI surface	QuickTradeMachine.tsx, TradeProposal.tsx, TradePanel.tsx, VerdictPanel.tsx, evaluate-client.ts, trade-share.ts	User-facing trade flow + share encoding (where the stale-verdict class of bug lived).
3	Dev/analytics layer	development-profile.ts, development-sources.ts, DevelopmentProfilePanel.tsx, prospect-enrichment.ts, player-data.ts	Just touched; data-derivation bugs hide here.
4	League data + sim	league/route.ts, league/players/route.ts, simulate/route.ts, sim-engine.ts	Big files (1400/990/910 LOC), data-shape and pace bugs.
5	Armchair GM page	armchair-gm/page.tsx (2315 LOC) + players/page.tsx	The two largest UI files; deserve their own pass each, honestly.
6	Admin + remaining components	admin/*, leftover components	Lower priority — and admin auth is your known-out item, so I'd scope that pass to logic only, not the open-DB issue.

## Batch 1
[
  {
    "file": "app/lib/xnav-engine.ts",
    "line": 873,
    "summary": "compressPackage is non-monotonic: adding a low-value player REDUCES the compressed package NAV because the flat per-slot penalty (penaltyVeteran=35) dwarfs the throw-in's decayed contribution.",
    "failure_scenario": "Home sends a 300-NAV star; cNavOut=300. Attaching one age-33 depth player worth 2 NAV makes cNavOut = max(0, ~301 - 35) = 266; five of them -> 127. Since evaluateTrade uses cNavOut/cNavIn, adding a sweetener you are GIVING AWAY raises homeNetGain (cNavIn - cNavOut) by ~34 and can flip a verdict from FAIR/LOSS toward WIN — the opposite of reality."
  },
  {
    "file": "app/lib/trade-logic.ts",
    "line": 484,
    "summary": "The partner-need block in preScreenProposal is logically broken in three ways, so it screens proposals on garbage truth values.",
    "failure_scenario": "Lines 497-499: the predicate `[\"L\",\"R\"].includes(a.position) ? \"W\" === nn.pos : ...` returns whether the *need slot* is literally \"W\", ignoring the winger entirely. Line 486-489: `givingAwayNeed = partnerPlayers.every(...)` plus an `n.pos===\"Any\"` escape makes the guard trivially true (any \"Any\" need) or skipped (one non-need player). Lines 493-500: the `.includes(needs.find(...)?.pos)` tests a different need than the `n` being iterated. Net: trades where the partner gives away a stated need without getting the position back are passed or blocked essentially at random."
  },
  {
    "file": "app/api/evaluate/route.ts",
    "line": 489,
    "summary": "Cap-floor check hardcodes SEASON.capCeiling instead of the live/passed capCeiling, so the floor veto is computed against the wrong baseline when the DB overrides the ceiling.",
    "failure_scenario": "Admin sets cap_ceiling=92 in the DB; getLiveCapCeiling returns 92 and NAV math uses it, but `newCapUsedHome = SEASON.capCeiling(88) - projCapHome` reconstructs cap usage against 88 while teamHome.capSpace was measured against 92. A trade near the floor mis-fires or mis-suppresses the HARD FLOOR_VIOLATION."
  },
  {
    "file": "app/api/evaluate/route.ts",
    "line": 728,
    "summary": "The contender 'requires future assets' HARD veto compares LINEAR navOut against the partner's outgoing NAV, so a depth-padded package with high linear but low compressed value dodges the veto.",
    "failure_scenario": "Partner is CONTENDER giving up a 120-NAV player; home sends five 25-NAV depth players (linear navOut=125, compressed ~80) and no picks/prospects. partnerGetsEnough = 125 >= 108 -> true, so the HARD TIMELINE_MISMATCH veto never fires even though the partner effectively gets an 80-NAV compressed return with zero futures."
  },
  {
    "file": "app/lib/trade-logic.ts",
    "line": 59,
    "summary": "Propose/judge 'veteran term' threshold drift: the generator's hasVeteranTerm (age>=30 & yrs>=2) does not match the verdict's veteranComing cutoffs (age>=25 & yrs>=3, and age>=27 & yrs>=2).",
    "failure_scenario": "A proposal sending a future-core player for a 26-year-old on a 3-year deal passes preScreenProposal (not a 'veteran' at >=30) but is HARD-declined by runGmLogic at route.ts:799-805/840 — the generator surfaces trades the verdict instantly kills."
  },
  {
    "file": "app/lib/trade-logic.ts",
    "line": 505,
    "summary": "Propose/judge concession-limit drift with a units mismatch: the generator caps partner concession at 18/28/40 on LINEAR nav while the verdict tolerates 45/70 on COMPRESSED nav.",
    "failure_scenario": "A non-rebuild partner conceding 30 linear NAV is rejected by preScreenProposal (>28) even though the verdict would have accepted up to 45 compressed; a rebuild partner conceding 20 is killed by pre-screen (>18) but allowed by the verdict. The two stages threshold different quantities, so the generated proposal set and the verdict's accept band never line up."
  },
  {
    "file": "app/api/evaluate/route.ts",
    "line": 267,
    "summary": "isFutureCoreAsset / isDevelopmentRiskAsset / isPeakWindowAsset (and the DIVISIONS map) are duplicated verbatim in route.ts and trade-logic.ts, on opposite sides of the propose/judge gate.",
    "failure_scenario": "They are byte-identical today (route.ts:267-287 vs trade-logic.ts:33-53; DIVISIONS at route.ts:213-222 vs trade-logic.ts:438-443). Any future edit to one threshold (e.g. dynastyScore>=62 -> 65) silently makes the generator classify a player as future-core while the verdict does not, producing proposals the verdict contradicts. The duplication is the latent defect."
  },
  {
    "file": "app/api/evaluate/route.ts",
    "line": 1041,
    "summary": "ptsGain and defGain become NaN whenever a draft Pick (or any asset without ptsPace/defRate/avgTOI) is in the trade, because evaluateTrade reduces over raw nullish fields.",
    "failure_scenario": "AssetSchema declares ptsPace/defRate/avgTOI as z.number().nullish() with no default; a Pick has none. `incoming.reduce((s,a)=>s+a.ptsPace,0)` -> s+undefined -> NaN, returned unguarded in metrics.ptsGain/defGain (serialized as null). Verdict status is unaffected but the metrics block is corrupted for any trade containing picks."
  },
  {
    "file": "app/lib/xnav-engine.ts",
    "line": 314,
    "summary": "The goalie starter market floor is only partially rate-gated: starterFloorSignal clamps to a 0.55 minimum, so a genuinely below-replacement young starter still floors at ~36 TMV.",
    "failure_scenario": "A 29-year-old 55-game starter with expGSAx = -40 (bottom-of-league) gets starterFloorSignal clamped to 0.55, so starterTmvFloor ~= 65*1.0*0.55 ~= 36 feeds the sigmoid -> positive FMV cap% -> positive NAV, despite the comment's intent that bad goalies can go negative (which only triggers via ageFactor for older goalies)."
  },
  {
    "file": "app/api/evaluate/route.ts",
    "line": 749,
    "summary": "Missing optional data silently bypasses value/need guards across the path (null avgTOI, getNav ?? 0, teamStanding default).",
    "failure_scenario": "route.ts:749 `player.avgTOI >= minTOI` is false when avgTOI is null, so a 40-NAV centre with un-hydrated TOI bypasses the partner-need DECLINE veto. Similarly trade-logic.ts:14 `getNav ?? 0` treats an unvalued pick as 0, undercounting partnerNavOut so the concession cap (line 509) and the premium-pick 1.35x floor (isPremiumLotteryPick, teamStanding default 16) never engage for unstamped premium assets."
  }
]

## Batch 2
[
  {
    "file": "app/components/QuickTradeMachine.tsx",
    "line": 506,
    "summary": "runVerdict has no AbortController/run-id, so an in-flight audit can re-set a verdict AFTER the edit-clear effect wiped it — reopening the stale-verdict/stale-share bug.",
    "failure_scenario": "User clicks Run GM Audit; before it resolves, edits the package. The [outgoing,incoming] effect (line 489) clears verdict and disables Share. The slow audit then resolves and setVerdict (line 513) reinstates the OLD verdict for the NEW package, re-enabling Share; createShare locks a verdict that doesn't match the embedded assets."
  },
  {
    "file": "app/lib/evaluate-client.ts",
    "line": 18,
    "summary": "assetCacheKey is a hand-maintained allow-list that omits NAV-affecting inputs (capCeiling, age, defRate/xG/ops/dps/multiplier/pairDriverScore, etc.), and fetchNavMap never sends capCeiling, so cached NAV goes stale when those change.",
    "failure_scenario": "An admin changes the live cap_ceiling (the engine uses it via BASE_CAP_CEILING) but assetCacheKey doesn't include capCeiling and fetchNavMap doesn't send it, so every previously-cached asset returns its old cap-adjusted NAV with no refetch. More broadly, any future engine input not added to this list silently fails to invalidate the cache."
  },
  {
    "file": "app/components/TradeProposal.tsx",
    "line": 82,
    "summary": "Proposal generation (dozens of async fetchTradeVerdict calls) has no AbortController or run-id guard, so results from a previous team/navMap render into the live UI.",
    "failure_scenario": "User opens the Market Ledger, then switches home team (or the parent refreshes navMap) while audits are still resolving. The closure captured the old homeTeam/navMap; when promises resolve, setProposals (line 283) writes proposals computed against the stale team/valuations over the current selection."
  },
  {
    "file": "app/components/TradeProposal.tsx",
    "line": 96,
    "summary": "The dump branch sizes the sweetener/fit against only the negative-value players but ships the entire outgoing block, so a [bad contract + good player] selection generates an 'absorbs contract' proposal that gives the good player away too.",
    "failure_scenario": "Outgoing block = one -20 NAV contract + one +30 NAV player. isDumpBlock (trade-logic.ts:21) sees totalNav 10 < 15 with a negative present -> isDump=true. negPlayers/negNav use only the -20 contract, so the sweetener is sized for it, but homeSends = [...outgoingBlock, ...sweetener] (line 105) still ships the +30 player — a proposal labeled 'ABSORBS CONTRACT' that actually surrenders a valuable asset plus picks."
  },
  {
    "file": "app/components/QuickTradeMachine.tsx",
    "line": 476,
    "summary": "The NAV fetch effect's .then calls setNavMap without checking ctrl.signal.aborted, so a resolved-but-aborted earlier fetch can clobber a newer response with a stale subset.",
    "failure_scenario": "Add asset A (fetch1 starts), immediately add B (cleanup aborts fetch1, fetch2 starts). If fetch1 already resolved res.json() before abort took effect, its .then runs setNavMap with the A-only map after fetch2 set the A+B map; B's NAV column falls back to 0 until the next change."
  },
  {
    "file": "app/lib/evaluate-client.ts",
    "line": 70,
    "summary": "When a server response omits an asset id, the merge substitutes {total:0,...}, masking a failed/dropped NAV as a legitimate zero-value asset.",
    "failure_scenario": "A valid player whose NAV errors server-side (or whose id the server can't match) is rendered as a 0-NAV asset; package totals and the trade verdict are silently corrupted instead of surfacing an error. The fallback object also omits the newer XNAVResult fields (volatility/noivImpact/rosterTier), so a cache-miss asset has a different shape than a real one."
  },
  {
    "file": "app/components/TradeProposal.tsx",
    "line": 196,
    "summary": "Every pre-screened candidate gets its own /api/evaluate POST; concurrency is capped at 6 but the total request count is unbounded.",
    "failure_scenario": "With a full league, pre-screen can leave 60-120 candidates, firing 60-120 POSTs per 'Open Market Ledger' click (and again on 'Rebuild Market Ledger'), producing a multi-second audit that hammers the evaluate endpoint."
  },
  {
    "file": "app/lib/trade-share.ts",
    "line": 163,
    "summary": "resolveTradeShareAssets matches stored ids via find() and flatMaps misses away, so a shared card silently drops assets whose id left the dataset and first-matches on duplicate ids (players are merged with picks).",
    "failure_scenario": "A shared link's traded player later leaves /api/league/players -> find returns undefined -> the asset is dropped from the rendered package, so the shared card shows fewer assets than the lockedVerdict was computed on. If a pick and player ever share an id (the players+picks merge at QuickTradeMachine.tsx:383), find returns the wrong one."
  },
  {
    "file": "app/components/VerdictPanel.tsx",
    "line": 81,
    "summary": "Flag rows use flags.indexOf(flag) as the React key and a single shared expandedFlag index across both the home and partner sub-lists.",
    "failure_scenario": "Both sub-lists map over the same flags array with indexOf; expandedFlag is one shared number, so expanding a home flag at global index 2 also expands whatever partner flag resolves to index 2. If flags reorder/filter between renders, the wrong flag expands; equal-reference flags produce duplicate keys."
  },
  {
    "file": "app/components/AssetCard.tsx",
    "line": 107,
    "summary": "Pick-round labels are re-implemented in four places with diverging behavior; AssetCard has no 4th+ branch and mislabels any pick past round 3 as '3rd'.",
    "failure_scenario": "A 4th/5th/6th/7th-round pick renders correctly ('4th') in QuickTradeMachine (line 34) and TradeProposal (line 74) but shows '3rd' in AssetCard (line 107). The same surface also duplicates effective-cap math and status->color (VerdictPanel STATUS_CONFIG vs QuickTradeMachine's ad-hoc map), so a FAIR/LOSS trade is colored differently in the shared view than in the live panel."
  }
]

Summary

The trade UI is mostly solid; the theme this batch is async lifecycle correctness and cache/serialization fidelity, not broken rendering math.

    #1 is the one I'd fix first — it's a genuine reopening of the stale-verdict class we thought was closed two commits ago. The earlier fix clears the verdict on edit, but nothing cancels an in-flight runVerdict, so a slow audit can reinstate a stale verdict and re-arm the Share button. An AbortSignal + run-id check in runVerdict (and passing the signal through, which fetchTradeVerdict already accepts) closes it.
    #2 (cache key) and #6 (zero-fallback) are the silent-wrong-value risks: an allow-list cache key that must be hand-synced to the engine's inputs will drift, and capCeiling is a concrete live path that already isn't tracked.
    #3/#5/#7 are the same root in two components: long async flows with no cancellation/run-id (proposal generation and the NAV effect) plus an unbounded request fan-out.
    #4 is a real generator logic bug worth fixing alongside the Batch-1 trade-logic work, since it straddles both.
    #8–#10 are fidelity/robustness/duplication (shared-view asset drift, flag-key fragility, the 4th-round mislabel).

Two lower-confidence items I'll note rather than rank: fmtCap(asset.capHit) will throw if any player record arrives without capHit (typed required, so depends on the /api/league/players payload — worth a guard), and a share version bump throws with no migration path (callers catch it, so it degrades to "could not be decoded" rather than crashing).

## Batch 3

[
  {
    "file": "app/lib/player-data.ts",
    "line": 150,
    "summary": "getHistoricalFloor is a peak-anchored static floor that can only raise NAV and never decays, directly fighting the just-shipped pedigree/age decay so declined or injured veterans are re-inflated to peak value.",
    "failure_scenario": "An aging star whose xNAV correctly decayed (age curve / declining production) is passed through the evaluate adapter (route.ts:168-176), which lifts total to Math.max(currentNAV, peakPtsPace*1.65 + bonuses). A 34-year-old on a 38-GP injury season (the Slavin/Karlsson comments at player-data.ts:98) is valued at ~165-180+ regardless of current form, so the trade machine demands a franchise return for a depreciated asset — the static floor and the dynamic decay tell opposite stories for the same player."
  },
  {
    "file": "app/lib/player-data.ts",
    "line": 120,
    "summary": "All static pedigree/risk maps are keyed by exact name, so accented or spelling-variant names silently miss the floor, injury, tier, and pedigree lookups.",
    "failure_scenario": "PLAYER_PEDIGREE, getHistoricalFloor, INJURY_RISK, and PROSPECT_TIERS are all exact-string keyed (consumed at evaluate/route.ts:168/901/1111, AssetBadges.tsx:222). A roster feed delivering 'Tim Stutzle' (diacritic-stripped) instead of 'Tim Stützle' matches nothing, so the floor/injury/tier flags vanish for that player. The dead 'Jake Zibanejad' duplicate (the real player is Mika) confirms keys are unnormalized exact strings."
  },
  {
    "file": "app/api/league/players/route.ts",
    "line": 888,
    "summary": "Both production routes build the development profile without internationalScore/teamContext/linemateContext, so the model's context-penalty, international-pedigree, and CONTEXT_DRAG branches are dead in the live app.",
    "failure_scenario": "league/players/route.ts:888 and league/route.ts:1254 call calcDevelopmentProfile with only {age,draftYear,draftOverall}. development-profile.ts consumes internationalScore (pedigree 103, confidence 327) and teamContext/linemateContext (contextPenalty 314, breakout 325, CONTEXT_DRAG tag 360) — none are ever supplied except via the admin route, so live dynasty/breakout numbers are computed without inputs the model was built to weight, and the isFutureCoreAsset dynastyScore>=62 cutoff (evaluate:270) is calibrated against a permanently context-less model."
  },
  {
    "file": "app/lib/development-profile.ts",
    "line": 173,
    "summary": "classifyPhase has an age coverage gap: established 26-29 players with ordinary profiles match no bucket and are labeled UNKNOWN, which the panel renders verbatim.",
    "failure_scenario": "A 27-year-old depth forward (production 50, experience 50, pedigree 40, FLAT trend) fails both PEAK_WINDOW conditions (181-182) and every remaining branch requires age <=25/23/21/19 (184-187), so developmentPhase = UNKNOWN. The panel shows 'UNKNOWN' for a normal mid-career NHLer."
  },
  {
    "file": "app/lib/development-profile.ts",
    "line": 237,
    "summary": "classifyBoomBust labels low-variance, low-confidence players HIGH_VARIANCE because STABLE requires confidence >= 60.",
    "failure_scenario": "A young player with careerNhlGames small -> confidence 55, volatility 30, boomScore 35, bustScore 30: highVariance is false but the STABLE branch is skipped (confidence<60), and |spread|=5 fails both lean branches, so it defaults to HIGH_VARIANCE (243) — contradicting the low volatility and near-equal boom/bust scores shown in the same tooltip."
  },
  {
    "file": "app/lib/development-sources.ts",
    "line": 453,
    "summary": "The 'trust pedigree until 40 games' logic is inverted: currentPtsPace switches to the live pace at games > 0 while the prospect snapshot is still pushed, so a tiny-sample rookie's headline pace is driven by noise.",
    "failure_scenario": "currentPtsPace = games > 0 ? livePtsPace : (prospectPtsPace ?? livePtsPace) (line 453), but the INTL prospect snapshot is still pushed when games < 40 (456). A 10-game rookie on a one-week heater (livePtsPace ~120) gets ptsPace = 120 feeding scoreProduction, inflating production/breakout/dynasty, even though the intent was to lean on pedigree until 40 games."
  },
  {
    "file": "app/lib/development-profile.ts",
    "line": 165,
    "summary": "roleGrowthScore saturates from a single noisy TOI sample compared against current TOI.",
    "failure_scenario": "With one stored TOI snapshot (9:00) and current avgTOI 16:00, roleGrowthScore = clamp(45 + (16-9)*8) = clamp(101) = 100 off essentially one comparison, materially inflating breakoutProbability, boomScore, and dynastyScore for a player with almost no role history."
  },
  {
    "file": "app/api/league/route.ts",
    "line": 1119,
    "summary": "The entire development-profile build (and slugify/NHLe/age helpers) is a copy-pasted twin across the two league routes and has already drifted.",
    "failure_scenario": "league/route.ts:1119-1272 and league/players/route.ts:781-906 duplicate the activePlayerIds + fetchCachedNhlSkaterTimelineRowsForPlayers + build*/calcDevelopmentProfile block; they have already diverged (route.ts logs psMap.size/2 at :680 while players logs /3 at :388 because players adds a third PS key route.ts omits). slugify exists 4x and age is computed via ageFromBirthDate (UTC) vs calcAge (local), which can disagree by a year near a birthday and flip age-gated phase classification."
  },
  {
    "file": "app/lib/prospect-enrichment.ts",
    "line": 62,
    "summary": "Prospect-enrichment slug collisions overwrite silently and the constant cache key never invalidates when the draft-year window or season advances.",
    "failure_scenario": "result[slugifyProspectName(name)] = {...} (62) with no collision guard, merged in draft-year order (93), so two same-slug players (accent collapse or duplicate name across the 2020-2026 window) resolve to one entry holding the later year's draftOverall — the wrong player inherits another's pedigree at league/route.ts:1143. The CACHE_KEY is a constant 'v1' (and the window floor is hard-pinned to 2020 at :84), so advancing SEASON.draftYear changes the intended window but serves the stale blob until the 7-day TTL lapses."
  },
  {
    "file": "app/lib/development-sources.ts",
    "line": 132,
    "summary": "The development timeline is cached independently (12h) of the contracts (23h), teams (6h), and MoneyPuck (4h) caches, so a profile mixes stale timeline-derived dynasty with fresh age/production in the same response; the season-keyed cache also orphans rather than invalidates on rollover.",
    "failure_scenario": "league/route.ts:1251-1272 builds dynasty/boom-bust from a possibly-12h-old timeline while pulling current ptsPace/age from this refresh, so dynastyScore can reflect last refresh's seasons against this refresh's production. Because the timeline cache key embeds seasonIds (development-sources.ts:691), a SEASON.nhleSeasonId rollover leaves the old entry orphaned and served until TTL. (Separately, the 5 render-only profile fields — effectivePedigreeScore/pedigreeWeight/confidenceScore/scoringTrajectory — that only the panel reads are emitted on every player in every league response.)"
  }
]

Summary

The dev/analytics layer is conceptually strong; the issues cluster around the static maps fighting the new dynamic models and the model not receiving inputs it's built for:

    #1 is the one I'd flag hardest — getHistoricalFloor is a peak-anchored floor that re-inflates exactly the declined veterans your recent pedigree/age decay work was designed to mark down. The two systems are reconciled nowhere, so a user sees a decayed dynasty score next to a peak-floored NAV for the same aging player. Worth deciding whether the floor should itself decay with age/recent GP.
    #2 and #3 are "silent no-op" bugs: exact-name keys drop flags for accented names, and the whole context/international branch of the model never runs in production because the two routes don't pass those inputs.
    #4–#7 are classifier/scoring edge cases (UNKNOWN phase for mid-career players, HIGH_VARIANCE mislabel, rookie small-sample inflation, single-sample role saturation).
    #8–#10 are the structural theme you've now seen in every batch: the twin league pipelines (already provably drifting), duplicated identity helpers, and independently-TTL'd caches serving internally inconsistent snapshots. The durable fix is the same shared roster/profile-build module that Batches 3 and 4 both point to.

Refuted/dropped after verification: projection-band unit mismatch, snapshot-order trend inversion, and the ageForSeason double-count — all three don't fire given how the production builders actually sort and forward inputs.

## Batch 4
[
  {
    "file": "app/api/league/players/route.ts",
    "line": 793,
    "summary": "No global dedup by player id across teams: the player list is built per-team from rosterMap and DB injection only dedups within the destination team's list, so a traded player appears on both teams (the Joseph Woll bug).",
    "failure_scenario": "Admin DB moves Woll to PHI; DB injection (738-761) finds no Woll in PHI's live-roster list and pushes him there (injectedFromDb), while the live NHL feed still lists him on his old team. The final loop (793-981) emits one object per (team,player) with no cross-team dedup, so Woll appears twice. The same happens with zero DB involvement whenever the live feed lists a player on two rosters during a trade transition. Admin contracts shows one Woll because it reads the contract table directly."
  },
  {
    "file": "app/api/league/route.ts",
    "line": 255,
    "summary": "Two different routes read/write the same Redis key 'cache:teams' with different payload shapes and different capSpace bases, so served team data is non-deterministic for 6h.",
    "failure_scenario": "route.ts writes 'cache:teams' with live-CapWages capSpace (and its own object shape); teams/route.ts (lines 41/157) writes the same key with static TEAMS_DB.capSpace. /api/league (Players page) and /api/league/teams (trade machine) both hit this key. Whichever populates it first wins for TEAMS_CACHE_TTL, so the trade engine can compute cap penalties against a stale/static cap basis (or even the wrong object shape) depending on which page was loaded first."
  },
  {
    "file": "app/api/league/players/route.ts",
    "line": 711,
    "summary": "Unguarded field access while mapping the live roster (p.id.toString(), p.firstName.default, calcAge(p.birthDate)) throws inside results.forEach, and the outer catch only logs — dropping every team after the bad row.",
    "failure_scenario": "The NHL feed returns one roster entry missing firstName.default or id. p.firstName.default throws inside the forEach (702-717); the catch at 718 only warns, so the forEach aborts mid-iteration and every team whose index hadn't been processed is silently omitted from rosterMap — one malformed call-up on team #3 erases teams #3-#32."
  },
  {
    "file": "app/api/league/players/route.ts",
    "line": 860,
    "summary": "The nameCollision heuristic strips a real contract from a legitimately mis-positioned young player, forcing ELC terms.",
    "failure_scenario": "A <=23 player with a real >$3M deal whose roster position differs from the contract position (e.g. Byfield: NHL feed 'LW', contract 'C') triggers nameCollision (normContractPos('C') !== 'W'), wiping his real cap hit to elcCapHit/1yr. The CONTRACT_OVERRIDES rescue (864) only applies capHit if the override defines one; a position-only override (line 27) leaves the ELC value in place."
  },
  {
    "file": "app/api/simulate/route.ts",
    "line": 516,
    "summary": "Playoff bracket padding pushes duplicate team references and find/getW fall back to the weakest seed, so a team can play itself or the wrong team can advance.",
    "failure_scenario": "When a conference resolves <8 seeds, the loop pads with seeds[last] (same object reference) repeatedly; simulateSeries can be called with high===low (team vs itself). When a series winner's teamId isn't found, getW returns last (526/549-561), silently advancing the weakest seed to the next round and possibly to champion."
  },
  {
    "file": "app/api/simulate/route.ts",
    "line": 490,
    "summary": "Series win-probability in later rounds is keyed to bracket position, not team strength, so the stronger team can be assigned the underdog probability.",
    "failure_scenario": "Round 2/CF pass getW(...) winners as (high, low) by bracket line without re-sorting by points (564-569). If the lower bracket line holds the stronger team, gap = high.projectedPoints - low.projectedPoints is negative and winProb clamps to max(0.35, ...) = 0.35 for the better team — a systematic bias against it. Separately, a player payload missing ptsPace makes stablePts return NaN (sim-engine.ts), which propagates to projectedPoints=NaN and corrupts every standings sort."
  },
  {
    "file": "app/api/league/route.ts",
    "line": 135,
    "summary": "The standings sort comparator (b.points - a.points) is unguarded, so a missing points value yields NaN and an undefined ordering.",
    "failure_scenario": "If the NHL summary omits points for any team (partial payload / relocated row), the comparator returns NaN, the sort order is garbage, and every derived overallRank/standing — including the teamStanding stamped onto picks (where 32=worst drives pick value) — is silently wrong."
  },
  {
    "file": "app/api/league/route.ts",
    "line": 1357,
    "summary": "Picks are generated as an identical full grid per team stamped with the owner's current standing, ignoring traded-pick origin and ownership.",
    "failure_scenario": "A 1st-round pick a contender (standing 3) acquired from a tanker (standing 32) is stamped teamStanding:3 and valued as a late 1st instead of a top pick. And because every team gets the same 3yr x 5rd grid, a pick already traded away still appears in the original team's assets — league-wide phantom pick inventory."
  },
  {
    "file": "app/api/league/players/route.ts",
    "line": 851,
    "summary": "Goalie stats fall back to an unconditional surname-only key, with none of the diacritic/quality guards the skater path uses, so same-surname goalies get each other's numbers.",
    "failure_scenario": "Two goalies named 'Smith' both resolve goalieMap.get(slugify('smith')); the Map holds whichever was inserted last (674/676), so both players display the same savePct/gsax. The skater path guards surname matching (810-813); the goalie path (482/676/851) does not."
  },
  {
    "file": "app/api/league/route.ts",
    "line": 1137,
    "summary": "The entire ~200-line player-build pipeline and all identity normalizers are duplicated between route.ts and players/route.ts, with divergent name normalization, so fixes drift and a name can match a stat key but miss the contract key.",
    "failure_scenario": "route.ts:1137-1352 is a near-twin of players/route.ts:793-981 (the Woll dedup fix would have to be made in both). slugify (route.ts:432 / players:62), an inline NFD strip (route.ts:1168 / players:819, keeps case+spaces), and a third 'normalise' (route.ts:566 / players:308) normalize the same name three different ways, so a player can match the slug-keyed MoneyPuck stats but miss the NFD-keyed contract lookup (or vice versa), getting live stats with a default $0.925M contract."
  }
]

Summary & the Woll fix

The Woll duplicate (#1) is the headline and the fix direction is clear: make the admin DB authoritative for team assignment and add a global dedup by canonical player id. Concretely —

    When injecting a DB player onto team X, first remove any instance of that player (by id or name-slug) from every other team's list, not just check the destination list (line 742 only looks at the destination). The DB is what "correctly shows PHI," so it should win.
    Add a final dedup pass by canonical id before the return (line 983), since the live feed itself can double-list a player mid-trade even with no DB row involved. Keep the instance whose teamId matches the DB/admin record.

A wrinkle to hand Codex: ids aren't uniform — live rows use id: p.id.toString() (string) while DB-injected rows use id: d.id raw (line 749), so the dedup must match on a normalized id and name-slug, not strict id equality.

The two structural findings worth pairing with it: #2 (the cache:teams key collision — two routes, two cap-space bases, one key) and #10 (the whole player-build pipeline exists in two divergent copies). Fixing the Woll dedup in players/route.ts alone leaves the twin in route.ts still duplicating on the Players page — so the durable fix is to extract one shared roster-merge/dedup module both routes call, which also closes #2's divergence.

## Batch 5
[
  {
    "file": "app/armchair-gm/page.tsx",
    "line": 322,
    "summary": "executeTrade moves players by rewriting teamId on every roster row whose id matches, so a duplicate-id player (the Woll bug) drags the other team's copy into the trade and no single copy can be moved individually.",
    "failure_scenario": "With two roster rows sharing one id (Woll on PHI + stale old team), trading 'Woll' from team A runs prev.players.map and sets teamId=partnerTeam.id on BOTH matching rows (323-331), so the second team silently loses its player. The move is an in-place teamId rewrite (not remove+add), so the wrong roster is mutated and cap deltas are computed against it."
  },
  {
    "file": "app/armchair-gm/page.tsx",
    "line": 2042,
    "summary": "BreakdownTable calls .toFixed on a.ptsPace, a.avgTOI, and a.capHit unguarded for non-Pick/non-G assets, crashing the entire table if any field is missing.",
    "failure_scenario": "A skater asset in a trade block whose ptsPace/avgTOI/capHit is undefined (no-live-stats player, malformed roster row) hits a.ptsPace.toFixed(1) (2042) / a.avgTOI.toFixed(1) (2046) / a.capHit.toFixed(2) (2050) — the xG cell right beside them guards with ?? 0 but these don't — throwing 'Cannot read properties of undefined (reading toFixed)' and blanking the whole BreakdownTable whenever a block is non-empty."
  },
  {
    "file": "app/armchair-gm/page.tsx",
    "line": 244,
    "summary": "The debounced retention NAV-fetch effect's AbortController cleanup is returned from the setTimeout callback, not the effect, so it never runs — an in-flight retention fetch isn't aborted and re-injects stale NAV.",
    "failure_scenario": "User drags a retention slider (300ms debounce fires fetchNavMap), then immediately removes that asset or switches teams. Only clearTimeout runs on cleanup (272); the `return () => ctrl.abort()` (269) is the timer callback's return value and is never invoked, so the fetch resolves and setNavMap re-injects a retained NAV for an asset no longer in any block, surfacing a wrong value in TugBar/BreakdownTable."
  },
  {
    "file": "app/armchair-gm/page.tsx",
    "line": 275,
    "summary": "Initial league load uses Promise.all with no response.ok check, so one route failing discards both datasets, and the empty-check can't detect an empty-but-present player array.",
    "failure_scenario": "If /api/league/teams 500s (HTML body) while /api/league/players succeeds, r.json() throws and Promise.all rejects, dumping the user to the error screen despite players having loaded. And data.players = [...(pd.players ?? []), ...(td.picks ?? [])] is always a (possibly empty) array, so the `if (!data.players)` guard (288) never fires on an empty league."
  },
  {
    "file": "app/armchair-gm/page.tsx",
    "line": 643,
    "summary": "findMatches has no AbortController or request-token guard, so a slow response for an old package overwrites the results for a newer one and toggles loading off mid-flight.",
    "failure_scenario": "User runs 'Who Wants This Package?' for package A, edits the outgoing block, runs it again for package B. If A resolves after B, setMatchResults(data) (665) renders A's matches under B's header, and the finally{setMatchLoading(false)} (673) from the stale A request clears the spinner while B is still in flight."
  },
  {
    "file": "app/store/tradeStore.ts",
    "line": 79,
    "summary": "addAsset/removeAsset/setRetainedPct all key purely on a.id, so duplicate-id assets are un-addable and any remove/retention edit hits every row sharing that id.",
    "failure_scenario": "addAsset returns state unchanged if the id already exists in the block (94), so the second Woll can never be selected; and removeAsset (filter a.id !== id, 89) / setRetainedPct (map a.id === id) act on all rows with that id at once. Via the URL-restore path (which bypasses addAsset), two same-id rows can coexist and then can't be removed or retained independently."
  },
  {
    "file": "app/players/page.tsx",
    "line": 632,
    "summary": "The player-table sort comparator has no tie-break and uses sentinels that invert in ascending order, and per-section ranks all restart at 1.",
    "failure_scenario": "Sorting by age returns 0 for all same-age players (engine-order, reshuffles between renders, so rank numbers churn). Sorting ops/dps ascending puts the -99 sentinel for null-data players at the TOP (638-639). actualPPG returns 0 for <5 GP (580-585), burying a 3-game star below zero-point depth under the default PPG sort. And skaters, starters, tandems, backups each render rank={i+1}, so 'All' shows three different players labelled #1."
  },
  {
    "file": "app/players/page.tsx",
    "line": 589,
    "summary": "The players page fetches /api/league with no response.ok check and renders the entire league unvirtualized with no search debounce.",
    "failure_scenario": "A 500/HTML response makes r.json() throw; .catch sets loading=false and the page shows 'NO PLAYERS MATCH YOUR SEARCH' (805) — indistinguishable from an empty league, no error UI. Separately, every keystroke re-filters/re-sorts and re-mounts hundreds of dual-layout rows with inline SVGs (no pagination/virtualization/debounce), causing visible input lag on a full ~700-player league."
  },
  {
    "file": "app/store/scenarioStore.ts",
    "line": 5,
    "summary": "Saved scenarios snapshot only {name,position,capHit,age} with a content-hash id and no real id/teamId/retainedPct, so they can't be faithfully restored into the id-keyed trade store, and hydration has no corruption guard.",
    "failure_scenario": "A restored scenario has no asset id to match against db.players (the store keys everything on id) and drops retainedPct, so the capHit*(1-retainedPct) math (page:347-352) reverts retained deals to full cap on reload. Two scenarios saved with identical content seed-collide on id, so delete/rename act on both, and persist() to localStorage JSON.parses corrupt/oversized data with no try/catch, throwing during hydration."
  },
  {
    "file": "app/armchair-gm/page.tsx",
    "line": 770,
    "summary": "No shared league-data/nav/verdict hook: armchair-gm and QuickTradeMachine independently re-implement the fetch, navMap, and verdict lifecycle with DIFFERENT package-value algorithms and status colors, so the same package shows different numbers across the two trade UIs.",
    "failure_scenario": "armchair-gm shows compression-aware package value (displayNavA = cNavA>0 ? cNavA : navA, 724-726) while QuickTradeMachine's summarizePackage is a flat linear sum (labelled 'Linear NAV'); the identical package therefore displays a different NAV in the two trade surfaces. Status->color is also forked (LOSS renders amber in QuickTradeMachine:316 but red in armchair-gm:1473), and the /api/league fetch + [...players,...picks] shaping + cap-after-retention + pick-label logic are copy-pasted across 3-5 sites (armchair:275/347/503, QuickTradeMachine:446/214/34, AssetCard:107/133) that already drift."
  }
]

Summary

The two big pages are mostly correct line-by-line; the real risks are async lifecycle and id-keyed state colliding with the Woll duplicate, plus the now-familiar structural duplication.

    #1 and #6 are the Woll bug's downstream teeth: every store mutation and the trade-execution path key on id with no teamId disambiguation, so a duplicate id corrupts roster moves and locks selection/removal together. Fixing the dedup at the source (Batch 4 #1) closes most of this, but executeTrade should still move by a composite (id+teamId) rather than rewriting all matching rows.
    #2 is the only hard crash — trivial to trigger from a stats-less skater in a block; worth a guard regardless of the dedup fix.
    #3/#4/#5 are the async-lifecycle trio (a cleanup that never runs, Promise.all with no r.ok, an unguarded match fetch) — same class you've seen in every UI batch.
    #7–#9 are players-page table correctness + robustness.
    #10 is the altitude capstone: the absence of a shared useLeagueData/useNavMap/useTradeVerdict hook is why the same package can show a different NAV and a different status color depending on which trade surface you're on. That single extraction would collapse a large share of findings across Batches 2, 4, and 5.

Already-filed roots the cross-file pass re-surfaced (don't double-count, but flag for Codex): the cache:teams key collision now has a concrete page-level symptom — the players page (/api/league, live-scraped cap) and the trade machine (/api/league/teams, static cap) can show different cap space for the same team — and the twin player-build pipelines mean a player's ptsPace/dps/qocIndex can differ between the table and the trade card.