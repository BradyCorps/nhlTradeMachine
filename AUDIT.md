# Trade Engine / Franchise Sim Notes

## Development Tab / Player Trajectory Issues

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

* Update player development logic to reference total NHL games played and historical seasons, not only the current season.
* Improve trajectory classification for established players.
* Ensure older elite players are evaluated with proper aging and decline curves.

---

## Trade Approval / NAV Logic

### Overpaying vs Underpaying

The NAV trade approval system needs refinement.

Currently, trades can often be made with a `+40 NAV` advantage. The user rarely needs to overpay and can consistently underpay while still getting trades approved.

### Action Items

* Tighten NAV approval thresholds.
* Reduce the frequency of lopsided trades being accepted.
* Add more contextual trade resistance based on team status, asset importance, and player role.

---

## Retained Salary

### Retained Salary Does Not Persist

Retained salary currently does not persist after a trade is completed.

### Action Items

* Ensure salary retention is stored as part of the traded player’s contract state.
* Confirm retained salary carries forward correctly after trade execution.
* Validate that retained salary impacts both team cap sheets after the trade.

---

## Dynamic Team Status Updates

### Team Status Should Update After Major Trades

If the home team makes a trade that meaningfully improves the roster, the team status should dynamically update.

Example:

* Minnesota trades for Quinn Hughes.
* Minnesota should move from a rebuilding or neutral state into a more desirable / win-now state.

### Action Items

* Recalculate team status after every accepted trade.
* Update team direction dynamically based on roster strength, star power, age curve, and competitiveness.
* Ensure the UI reflects the updated team state immediately.

---

## Contention Quadrant / Team Evaluation

### Depth Needs Greater Weight

The contention quadrant needs to better account for roster depth.

Currently, most teams appear to fall into a win-now state. However, adding fringe NHLers and unproven rookies should not meaningfully move a team toward contention in real life.

### Action Items

* Reevaluate contention logic.
* Add stronger weighting for:

  * Top-end talent
  * Defensive depth
  * Goaltending quality
  * Proven NHL contributors
  * Prospect uncertainty
* Reduce the impact of fringe NHLers and unproven rookies on win-now status.

---

## Dynamic Draft Pick Values

### Draft Picks Should Not Be Hardcoded

Draft pick values should be dynamic based on team strength and projected standings.

If a team trades away its best player, its draft pick value should increase.

If a team improves significantly, its draft pick value should decrease.

### Action Items

* Replace hardcoded draft pick values with dynamic valuation.
* Recalculate pick value after trades.
* Factor in:

  * Team overall
  * Team direction
  * Roster strength
  * Star player movement
  * Projected standings
  * Current season record, if available

---

## Draft Pick Inventory

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

* Add 2029 first through fifth round picks.
* Ensure all draft picks are displayed in year order.
* Confirm pick values use dynamic valuation.

---

## Tanking Team Trade Restrictions

### Tanking Teams Should Not Sell First Overall Picks

Teams that are tanking should not generate trades where they sell their first overall pick.

### Action Items

* Add protection logic for high-value picks owned by tanking teams.
* Prevent trade proposals involving a likely first overall pick unless the return is exceptional.
* Add stronger veto logic for rebuilding/tanking teams moving premium picks.

---

## Find Trade Proposals

### Generated Trades Should Auto-Pass

The “Find Trade Proposals” feature should not generate trades that fail approval when loaded.

### Action Items

* Validate generated trade proposals before showing them to the user.
* Only display proposals that pass the trade approval engine.
* Ensure loaded trade proposals remain consistent with the original generated approval state.

---

## Salary Retention UX

### Mobile Scroll Issue

The salary retention slider is often triggered accidentally when scrolling on mobile.

### Action Items

* Adjust salary retention UX for mobile.
* Consider replacing the slider with:

  * Tap-to-edit percentage
  * Stepper controls
  * Confirmation modal
  * Lock/unlock interaction before adjusting
* Prevent accidental retention changes caused by page scrolling.

---

## Trade Block / Shopped Players

### Shopped Players Should Bypass Certain Vetoes

Players who are actively shopped or listed on the trade market should not trigger the veto:

```text
"x team can't afford to lose x player"
```

### Action Items

* Add a condition to bypass this veto for players currently on the trade block.
* Ensure the team’s willingness to move the player is respected in trade logic.

---

## Ledger UX

### Copy Text From Ledger

Determine whether users should be able to copy text from the ledger.

### Action Items

* Evaluate whether ledger entries should support copy-to-clipboard.
* Consider adding a copy button for individual ledger entries.
* Ensure ledger text selection works on desktop and mobile.

---

## Trade Block Session State

### Remove Traded Players From Block

Once a player is traded from the block onto a new team, they should be removed from the trade block during that session.

### Action Items

* Update trade block state after trade completion.
* Remove traded players from the active block list.
* Ensure this persists for the current session.

---

## Player Data / Stats Issues

### Alexis Lafrenière Stats Not Populating

Alexis Lafrenière on NYR is not populating stats.

Possible cause:

* Accent handling in the player name.

Current issue:

* Listed at `440 NAV`
* Classified as a “megalodon” value

### Action Items

* Investigate name normalization for accented characters.
* Confirm player stat lookup works for:

  * Lafrenière
  * Lafreniere
  * Other accented NHL player names
* Prevent missing stats from inflating NAV incorrectly.
* Add fallback matching by player ID if available.

---

## Player Change-of-Scenery Logic

### Players Can Thrive After Moving Teams

Players who have not worked out on one team should have a chance to thrive on a new team.

Example:

* Trevor Zegras performing better in Philadelphia than Anaheim.

### Action Items

* Add change-of-scenery upside logic.
* Factor in:

  * Age
  * Role change
  * New linemates
  * Team system
  * Previous underperformance
  * Draft pedigree / skill ceiling
* Avoid permanently suppressing value for young players who struggled in one environment.

---

## Prospect Trade Reluctance

### Teams Should Be Reluctant to Trade Top Prospects

Teams should be more reluctant to trade top-tier prospects.

Example:

* Philadelphia should not trade Porter Martone unless the deal is a very lucrative win-now move.

### Action Items

* Increase trade protection for elite prospects.
* Add stronger reluctance multipliers for:

  * Recent high draft picks
  * Top organizational prospects
  * Players with high ceiling
  * Prospects aligned with team timeline
* Allow exceptions only for major win-now upgrades.

---

## Lineup / Simulation Logic

### Confirm Line Changes Affect Simulation

Need to confirm whether moving and adjusting lines affects the simulation.

Also confirm whether players who are moved into the lineup receive games played for the season.

### Action Items

* Test whether line changes impact:

  * Sim results
  * Player usage
  * Games played
  * Production
  * Development
* Ensure lineup changes are reflected in season stat tracking.

---

## Defensive Value / Awards Logic

### Jaccob Slavin Value Issue

Jaccob Slavin has not won the Norris Trophy but is still an elite shutdown defenseman.

Current issue:

* He has negative value despite being elite defensively.

### Action Items

* Improve defensive defenseman valuation.
* Do not rely too heavily on Norris wins or offensive production.
* Add weighting for:

  * Defensive impact
  * Matchup difficulty
  * Penalty killing
  * Shutdown role
  * Real-world reputation
  * Advanced defensive metrics, if available

---

## Select Asset Screen

### Show Years Remaining

The asset selection screen should display contract years remaining.

### Action Items

* Add years remaining to player cards or rows.
* Ensure years remaining is visible before adding an asset to a trade.
* Consider displaying:

  * Cap hit
  * Years remaining
  * Age
  * Position
  * NAV

---

## Line Change UX

### Mobile UX Needs Rework

The line change UX is not intuitive, especially on mobile.

### Action Items

* Rework line editing flow for mobile.
* Improve drag/drop or tap-to-swap behavior.
* Make player movement clearer.
* Add visual confirmation after a line change.
* Reduce accidental moves.
* Consider a dedicated mobile lineup editor layout.

---

# Priority Summary

## High Priority

* Fix Dev tab using season played instead of total games played.
* Fix retained salary persistence.
* Tighten NAV trade approval logic.
* Prevent generated trade proposals from failing when loaded.
* Add dynamic draft pick values.
* Fix Lafrenière stat lookup / NAV inflation.
* Improve mobile salary retention UX.

## Medium Priority

* Recalculate team status dynamically after trades.
* Improve contention quadrant depth logic.
* Add stronger protection for tanking teams trading first overall picks.
* Improve top prospect trade reluctance.
* Confirm line changes affect simulation and games played.
* Remove traded block players from the session block.

## Low Priority / UX Polish

* Add copy functionality to the ledger.
* Add years remaining to select asset screen.
* Rework line change UX, especially on mobile.
