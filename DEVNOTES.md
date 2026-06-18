# Development Notes

## 2026-06-18 Development Profile Panel Audit

### Completed Today

- Completed the `DEVELOPMENTPROFILEPANEL AUDIT 2026-06-18` in `AUDIT.md`.
- Changed dynasty scoring so draft pedigree decays with NHL sample instead of remaining a permanent 28% input.
- Added sample-adjusted pedigree outputs:
  - `effectivePedigreeScore`
  - `pedigreeWeight`
- Shifted established-player dynasty weight toward production, role, and confidence.
- Raised forward production scaling so strong NHL producers do not clamp at 100 too early.
- Added `confidenceScore` and `scoringTrajectory` to development profiles.
- Reworded trajectory rationale to separate scoring volatility from sample confidence.
- Added an explicit rationale line when draft pedigree and established production disagree.
- Expanded the Development tab panel with:
  - production, role, sample-adjusted pedigree, and experience inputs
  - pedigree sample weight and confidence
  - 3-year scoring trajectory
  - up to five rationale lines instead of three
- Added regression coverage for the Lafreniere/Jarvis issue so a more productive established NHLer is not ranked below a less productive player solely because of old draft slot.

### Verification

- `npm run test -- __tests__/development-profile.test.ts`
- Result: `10` tests passing.
- `npm run test -- __tests__/feature-canaries.test.ts`
- Result: `85` tests passing.
- `npm run test`
- Result: `213` tests passing.
- `npx tsc --noEmit`
- Result: no TypeScript errors.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-18 XNAV Young Player / Goalie Audit

### Completed Today

- Completed the `XNAV / YOUNG PLAYERS / GOALIE CALCULATION AUDIT` in `AUDIT.md`.
- Reworked prospect NAV so unsupported drafted prospects are discounted for burned development time instead of receiving a blanket certainty premium.
- Added a 14-60 NHL game transition band that blends prospect pedigree into skater NAV, removing the hard 14-game valuation cliff.
- Made young-skater development risk track-record-aware by relieving the age-bucket discount when games played, role, or production supports it.
- Gated positive youth age value behind projection signals from production, role, pedigree, and sample size.
- Dampened small-sample OPS/DPS pace extrapolation so hot starts do not fully annualize through the point-share channel.
- Updated goalie NAV so young, controlled, high-rate 1B profiles can exceed the old tandem cap while veteran tandems remain capped.
- Rate-gated the starter market floor to reduce bad-volume starter inflation.
- Softened post-30 goalie aging and added a goalie `volatility` score.
- Surfaced high goalie volatility in `/api/evaluate` GM logic as an `ASSET_SHAPE_MISMATCH` warning.
- Added focused coverage for:
  - unsupported prospect discounting
  - 14-60 prospect/skater blending
  - track-record-aware development discount relief
  - signal-gated youth upside
  - small-sample point-share damping
  - ascending 1B goalie caps
  - veteran tandem caps
  - route-level goalie volatility warnings

### Verification

- `npm run test -- __tests__/xnav.test.ts`
- Result: `63` tests passing.
- `npm run test -- __tests__/evaluate-route.test.ts`
- Result: `4` tests passing.
- `npm run test`
- Result: `211` tests passing.
- `npx tsc --noEmit`
- Result: no TypeScript errors.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-18 Product Split Phase 5

### Completed Today

- Added social-preview polish for shared Trade Machine links.
- Added `summarizeTradeSharePayload(...)` so share metadata and image cards use one stable summary of:
  - matchup
  - outgoing and incoming asset counts
  - locked verdict status
  - created date
  - home-team NAV swing when a locked verdict exists
- Added server-side metadata generation for `/t/[code]`.
- Shared trade links now emit richer title, description, Open Graph, and Twitter card metadata from the encoded payload.
- Added `/t/[code]/opengraph-image` as a generated share card using `next/og`.
- The share card displays:
  - The Hockey Ledger branding
  - the team matchup
  - package counts for each side
  - the locked verdict stamp
  - the creation date
- Kept the shared trade page itself on the existing read-only reconstruction flow.
- Added tests/canaries for the preview summary helper, metadata route, and generated Open Graph image route.
- Added an industry-style cap and production context pass to the focused Trade Machine.
- Reused the existing server NAV pipeline through `fetchNavMap(...)` so selected packages show X-NAV/G-NAV value before the user runs the full GM Audit.
- Added team-side summary panels showing:
  - current cap space
  - projected post-trade cap
  - cap delta
  - production delta
  - NOIV delta
  - package NAV delta
- Added a trade balance strip showing total cap in play, production in play, NAV balance, and that the GM Audit remains required.
- Kept the GM Audit as the authoritative logic layer while surfacing cap, production, NOIV, and NAV context earlier in the workflow.
- Tightened direct GM Audit verdicts for extreme NAV surplus.
- Added a lopsided-surplus `VALUE_VETO` when one side is conceding more compressed NAV than a real GM would normally tolerate.
- This prevents trades like a 90 NAV package for a 189 NAV return from being labeled as a clean `WIN`; the partner GM now rejects that structure unless the value gap stays inside a realistic concession band.
- Added real `/api/evaluate` integration coverage in `__tests__/evaluate-route.test.ts`.
- The route test now POSTs behavioral payloads directly to the handler and verifies:
  - cap-ceiling breach returns `BLOCKED`
  - untouchable partner asset returns a hard partner veto
  - balanced low-risk swap returns `FAIR`

### Phase Notes

- This completes the first Phase 5 polish slice: useful social previews for shared trades.
- This also completes the requested cap/production/statistical breakdown pass for the focused Trade Machine, using the Box Score Junkie-style trade-machine pattern as a reference while keeping The Hockey Ledger's NAV, NOIV, and GM logic model.
- The direct GM Audit now treats extreme NAV surplus as a realism problem, not just a user-side win.
- Public reactions or "who won?" voting remain intentionally unimplemented because they should not block the core share flow.
- The new preview path still works with encoded payload URLs; a future persisted compact-code backend can reuse the same summary helper.

### Verification

- `npm run test`
- Result: `204` tests passing.
- `npx tsc --noEmit`
- Result: no TypeScript errors.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-18 Product Split Phase 4

### Completed Today

- Moved the broader roster-control experience to `/armchair-gm` as the canonical Armchair GM route.
- Changed `/trade` into a compatibility redirect to `/trade-machine`, matching the answered product direction that `/trade` should become the quick Trade Machine path long-term.
- Made `/armchair-gm` own the full workspace implementation instead of re-exporting `/trade`.
- Made `/armchair-gm/loading` own the full startup loader, while `/trade/loading` remains a compatibility shim.
- Updated the shared header active state so the deeper workspace highlights Armchair GM instead of Trade Machine.
- Updated admin navigation, contract admin links, cache revalidation, and cache-clear copy to point users back to Armchair GM.
- Updated Trade Proposal loading copy from "Load into Trade Machine" to "Load into Armchair GM" for the deeper proposal workflow.
- Reworded stale source comments and loading copy that referred to the deeper workspace as the trade machine.
- Updated source canaries so route-level behavior is protected under the new split:
  - Armchair GM canaries now read `app/armchair-gm/page.tsx`.
  - `/trade` is now covered as a redirect to `/trade-machine`.
  - The Armchair GM loader text is covered under the canonical route.

### Phase Notes

- Phase 4 completes the route ownership inversion started in Phase 1:
  - `/trade-machine` owns the focused one-off builder.
  - `/t/[code]` owns shared read-only trade reconstruction.
  - `/armchair-gm` owns the deeper franchise-control workspace.
  - `/trade` now preserves old links by sending users to the quick Trade Machine path.
- Trade-specific controls inside Armchair GM still use plain trade language where that is the correct local action.
- The broader product umbrella remains The Hockey Ledger, with Trade Machine and Armchair GM as distinct modes.

### Verification

- `npm run test`
- Result: `197` tests passing.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-17 Startup Valuation Gate Fix

### Completed Today

- Fixed the initial player valuation readiness gate so it compares against unique asset IDs instead of raw asset row count.
- This prevents duplicate asset IDs in the league payload from producing false `Player valuation load incomplete` errors when the NAV map is actually complete.
- Improved the incomplete-load error message to report unique-value counts and include a short missing-ID sample when values are genuinely absent.
- Added a canary to keep the unique-ID readiness behavior in place.

### Verification

- `npm run test`
- Result: `196` tests passing.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-17 Product Split Phase 1

### Completed Today

- Added the initial product shell for the Trade Machine / Armchair GM split.
- Added `/armchair-gm` as the branded route for the current deeper roster-management experience.
- Reused the existing trade workspace for `/armchair-gm` so the large UI is not forked during the split.
- Expanded the shared header navigation to include:
  - Player Analytics
  - Trade Machine
  - Armchair GM
- Updated the front page to position:
  - Trade Machine as the quick, one-off, share-first trade surface.
  - Armchair GM as the deeper franchise-control mode.
- Updated global metadata so The Hockey Ledger is no longer described only as an NHL Trade Machine.
- Captured the answered CHANGES.md open questions as direction for later phases.

### Phase Notes

- `/trade` still serves the current full trade workspace during Phase 1.
- `/trade` should become the quick Trade Machine route in a later phase.
- `/armchair-gm` now gives the deeper experience its long-term branded route before the current `/trade` behavior is changed.

### Verification

- `npm run test`
- Result: `192` tests passing.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-17 Product Split Phase 2

### Completed Today

- Added `app/lib/trade-share.ts` as the versioned share-state contract for trade payloads.
- Defined `trade-share.v1` with:
  - team IDs
  - outgoing and incoming asset references
  - retained salary selections
  - optional locked verdict snapshot
  - optional value timeline points for future three-year tracking
- Added base64url encode/decode helpers for compact share-code style payloads.
- Added query-string serialize/parse helpers for the current `/trade` state.
- Updated the current trade workspace URL sync and cold-load reconstruction to use the new share helpers.
- Added asset reconstruction support from share references so saved selections can rehydrate from the live asset list.
- Added tests covering payload creation, locked verdict preservation, base64url round trips, query-state parsing, and asset reconstruction.
- Corrected the homepage feature grid to max out at three columns instead of four.

### Phase Notes

- Phase 2 creates the share schema and local encode/decode foundation; it does not yet add persisted public share records or a read-only replay route.
- The schema assumes locked verdicts at creation time, matching the product direction in `CHANGES.md`.
- The optional value timeline field is ready for later value-over-time display without forcing that UI into this phase.

### Verification

- `npm run test`
- Result: `196` tests passing.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-17 Product Split Phase 3

### Completed Today

- Added `/trade-machine` as the focused one-off Trade Machine route.
- Added a lean Trade Machine UI for:
  - choosing the two teams
  - adding outgoing and incoming assets
  - selecting retained salary
  - running the GM Audit
  - generating a locked share link
- Added `/t/[code]` as the read-only shared trade reconstruction route.
- Shared trades decode the Phase 2 payload, rehydrate assets from the live asset list, and display the locked verdict snapshot.
- Updated public navigation and the homepage Trade Machine card to point to `/trade-machine`.
- Kept `/trade` untouched as a compatibility path while `/armchair-gm` continues to expose the deeper workspace.
- Added a canary for the focused route, shared route, and navigation link.

### Phase Notes

- This is the first usable focused Trade Machine version.
- Share links currently use encoded payloads in the URL path. A persisted compact-code backend can replace that later without changing the user-facing `/t/:shareCode` route.
- Social preview metadata is not yet personalized per shared trade because `/t/[code]` is currently a client-side reconstruction route.

### Verification

- `npm run lint`
- Result: no warnings or errors.
- `npx tsc --noEmit`
- Result: no TypeScript errors.
- `npm run test`
- Result: `197` tests passing.
- Dev server was not started in Codespace, per project instructions.

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
