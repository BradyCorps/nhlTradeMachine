# Development Notes

## 2026-06-14 Wrap-Up

### Completed Tonight

- Fixed the Patrick Thomas false-positive stats issue by removing surname-only skater stats fallbacks.
- Kept safer name matching for legitimate diacritic normalization cases.
- Prevented no-signal ELC/minor-league players from receiving artificial positive NAV from age/cap alone.
- Added a prospect NAV path:
  - Draft pedigree gives modest value before an NHL sample exists.
  - Stored/imported `prospectPtsPace` can raise that value.
  - No player-specific Kevin He or Stian Solberg overrides.
- Added draft-history enrichment so synced prospects can pick up `draftYear` and `draftOverall` from recent draft tables.
- Updated NAV client cache keys so prospect input changes do not reuse stale values.
- Kept the development profile layer diagnostic-only and separate from X-NAV.
- Reworded DEV rationale copy so 0-game prospects read like scouting/data notes instead of raw model arithmetic.
- Rebuilt the footer into one combined methodology/glossary surface.
- Removed the duplicate trade-page methodology block.
- Made the icon key always visible.
- Changed methodology/glossary content into wide footer dropdowns:
  - Player Valuation
  - STRAND Glossary
  - Trade Logic
  - Data & Sources
- Fixed franchise selection so the initial team picker works in one click.
- Added a stronger NAV loading status while player values are calculating.
- Stopped mobile keyboards from opening automatically when tapping add-asset buttons.

### Verification

- `npm run test`
- Result: `173` tests passing.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-14 Audit Follow-Up

### Completed Today

- Wired the DEV tab to multi-season NHL history instead of current-season stats only.
  - Added `fetchCachedNhlSkaterTimelineRowsForPlayers(...)` in `app/lib/development-sources.ts`.
  - The helper fetches each recent NHL skater-summary season once, then builds a `playerId -> timeline matches` map.
  - `app/api/league/route.ts` and `app/api/league/players/route.ts` now prefer `buildDevelopmentInputFromNhlTimeline(...)` when timeline rows exist.
  - Current payload fallback remains in place when NHL history is unavailable.
  - Route timeline depth is currently `seasonCount: 5`.
- Updated the development model so career NHL experience is derived from summed NHL timeline snapshots when present.
  - This prevents established players from being treated as low-sample rookies just because the current season has fewer than 82 GP.
  - Added a Vincent Trocheck-style regression test for this behavior.
- Tightened trade approval/proposal screening.
  - Proposal pre-screen now rejects partner NAV concessions beyond a tighter band.
  - Shopped/available players are allowed a larger concession band.
  - Rebuilding/tanking teams now protect premium lottery firsts unless the return is exceptional.
  - Evaluation logic now flags large NAV gaps earlier.
- Improved shopped-player handling in GM logic.
  - Players marked `available` or `requested` bypass partner-side “can’t afford to lose” / stated-need vetoes.
- Fixed retained salary session persistence after trade execution.
  - Moved assets now carry their `retainedPct` into the post-trade roster state.
- Added dynamic post-trade team context.
  - Completing a trade recalculates team standing/phase from updated roster strength.
  - Draft picks inherit updated `teamStanding`, so pick NAV can change after major roster moves.
  - Selected home/partner team objects sync back to updated `db.teams`.
- Expanded generated draft pick inventory.
  - League routes now generate rounds 1-5 for the next three drafts: 2027, 2028, and 2029.
  - Proposal builders no longer filter out 2029 picks.
- Made generated trade proposals pass the full GM audit before display.
  - `TradeProposalEngine` still applies the fast local proposal pre-screen first.
  - Pre-screened candidates now run through `fetchTradeVerdict(...)` with the candidate partner roster.
  - Proposals with `BLOCKED` or `DECLINED` verdicts are filtered out before they can be loaded.
  - Full-audit checks run concurrently and show package-audit progress in the modal.
  - Verdict requests no longer ask the server to return NAV for full rosters on every proposal check.
- Added a startup readiness gate before the trade UI unlocks.
  - The loading screen now confirms teams, player assets, and player values.
  - Team selection/trading stays blocked until the first full `fetchNavMap(...)` pass returns values for every loaded asset.
  - Incomplete or failed initial valuation loads now surface a data-pipeline error instead of opening with partial player data.
  - The route-level `/trade` loader now matches the same readiness screen and no longer flashes skeleton bars first.
- Reworked salary retention controls for mobile.
  - Replaced the drag range slider with tap-based stepper and preset buttons.
  - Retention still moves in 5% increments from 0% to 50%.
  - A passive progress bar shows the selected retention without being draggable during scroll.
- Removed traded players from the session trade block after trade execution.
  - Moved non-pick assets keep their new team and retained-salary state.
  - Their `tradeBlockStatus` and `tradeBlockNote` are cleared session-locally so they no longer appear as active block/request entries after moving.
- Added explicit player-ID fallback for NHL skater summary stats.
  - Both league routes now store fallback stats under `id:<playerId>`.
  - Roster assembly checks player ID before position/name slug fallback when MoneyPuck stats are missing.
  - This completes the Lafreniere/accent/missing-stat inflation audit item.
- Added contract term to the select-asset screen.
  - Asset rows now show years remaining before the user adds a player to the trade.
  - Pick rows continue to show the draft year in the same metadata slot.
- Added tests/canaries for:
  - Bulk DEV timeline fetches.
  - Timeline-backed DEV route exposure.
  - Career NHL experience from snapshots.
  - Tightened proposal NAV screening.
  - Shopped-player concession exception.
  - Premium lottery pick protection.
  - Three-year, rounds 1-5 draft pick inventory.
  - Full-audit verification for generated trade proposals.
  - Proposal audit progress/concurrency and lean verdict payloads.
  - Startup gate for complete initial player valuation load.
  - Consistent `/trade` preloader with no skeleton flash.
  - Tap-based salary retention controls replacing the mobile-prone slider.
  - Session trade-block cleanup after executing a trade.
  - Player-ID fallback for NHL skater summary stats.
  - Years-remaining display in the select-asset modal.

### Verification

- `npm run test`
- Result: `186` tests passing.
- Dev server was not started in Codespace, per project instructions.

### Notes For Next Agent

- The DEV tab should now be substantially more accurate for established NHLers, but it depends on NHL stats API timeline availability and cache freshness.
- If DEV still shows limited history for a specific player, inspect whether that player has NHL `playerId` timeline matches in the recent skater-summary seasons.
- Goalies still return no DEV profile through `buildDevelopmentInputFromPlayerPayload`; the development model remains skater-focused.
- The dynamic post-trade team phase calculation is intentionally lightweight and session-local. It is not yet the full contention-quadrant model.
- `AUDIT.md` has been marked with `Done`, `Partial`, and `Open` statuses as of this pass.

### Current Audit Position

Completed from `AUDIT.md`:

- DEV tab now uses multi-season NHL timeline/career experience.
- NAV approval thresholds and contextual proposal screening are tighter.
- Retained salary persists through executed trades and affects session cap state.
- Post-trade team status and draft pick standings update session-locally.
- 2027-2029 rounds 1-5 pick inventory is generated.
- Tanking/rebuilding teams protect premium lottery firsts.
- Generated trade proposals are full-audit verified before display.
- Salary retention mobile UX no longer uses a drag slider.
- Shopped/requested players bypass the relevant partner vetoes.
- Traded players are removed from the active trade block for the current session.
- Startup loading now gates the trade UI until initial player values are complete.
- Lafreniere/accent handling is backed by explicit player-ID skater stat fallback.
- Select-asset rows show contract years remaining before adding.

Partial:

- Dynamic draft pick values update from session-local standings, but deeper projection inputs remain open.

Remaining queue:

- Contention quadrant depth weighting.
- Change-of-scenery upside logic.
- Top prospect trade reluctance.
- Lineup/simulation validation.
- Defensive defenseman valuation, including Jaccob Slavin-style profiles.
- Ledger copy UX.
- Mobile line change UX.

## Next Project

### Prospect Production Import

Build a proper prospect production import flow instead of hardcoding or guessing junior/college/European production.

Recommended first version:

- Bulk CSV or pasted table import.
- Preview changes before saving.
- Inputs:
  - `name`
  - `team`
  - `league`
  - `games`
  - `goals`
  - `assists`
  - `points`
- Convert production to `prospectPtsPace` using NHLe factors.
- Match cautiously by normalized name and team.
- Save only confident matches.
- Flag ambiguous matches for manual review.

Reasoning:

- Draft slot can be enriched automatically.
- Production value should come from real imported/stored stats.
- This lets players like Kevin He earn extra NAV from OHL production while random later-round prospects stay modest unless they also have production.

## Manual QA For Tomorrow

- Check footer layout on desktop and mobile.
- Confirm the icon key is always visible and not hidden behind a dropdown.
- Confirm methodology dropdowns are full-width and not skinny columns.
- Test first-load franchise selection in the browser.
- Test mobile add-asset drawer and confirm the keyboard opens only when tapping search.
- Review example NAVs:
  - Kevin He
  - Stian Solberg
  - a random no-signal ELC player
  - an older AHL-only player
- Revisit later-round prospect draft-pedigree curve after real production data is imported.
