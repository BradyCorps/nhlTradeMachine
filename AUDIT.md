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

**Status: Open**

### Mobile UX Needs Rework

The line change UX is not intuitive, especially on mobile.

### Action Items

* [ ] Rework line editing flow for mobile.
* [ ] Improve drag/drop or tap-to-swap behavior.
* [ ] Make player movement clearer.
* [ ] Add visual confirmation after a line change.
* [ ] Reduce accidental moves.
* [ ] Consider a dedicated mobile lineup editor layout.

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
* [ ] Rework line change UX, especially on mobile.

## Current Remaining Audit Queue

* Contention quadrant depth weighting.
* Dynamic draft pick valuation projection inputs beyond session-local standings.
* Change-of-scenery upside logic.
* Top prospect trade reluctance.
* Lineup/simulation validation.
* Defensive defenseman valuation, including Jaccob Slavin-style profiles.
* Ledger copy UX.
* Mobile line change UX.
