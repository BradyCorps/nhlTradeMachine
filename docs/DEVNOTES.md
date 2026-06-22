# Development Notes
- 2026-06-22: Fixed league team cap space still using hardcoded TEAMS_DB values by deriving cap space from synced DB contract rows when available and keying the teams cache by cap ceiling; touched `app/lib/cap-settings.ts`, `app/api/league/teams/route.ts`, `app/api/admin/settings/route.ts`, `__tests__/cap-settings.test.ts`, `__tests__/feature-canaries.test.ts`, and `docs/DEVNOTES.md`.
- 2026-06-22: Fixed admin cap settings falling back to stale 95.5/65 stored defaults by centralizing cap override parsing, using 104 as the settings loading placeholder, and surfacing failed settings saves; touched `app/lib/cap-settings.ts`, `app/api/admin/settings/route.ts`, `app/api/league/teams/route.ts`, `app/api/evaluate/route.ts`, `app/admin/settings/page.tsx`, `__tests__/cap-settings.test.ts`, and `__tests__/feature-canaries.test.ts`.
- 2026-06-22: Clarified Development Outlook score meanings and renamed the visible Pedigree input to Draft Sig/Draft weight to avoid confusing it with career reputation; touched `app/components/DevelopmentProfilePanel.tsx` and `__tests__/feature-canaries.test.ts`.
- 2026-06-22: Completed D4 by adding a collapsed-by-default Outlook key to the Development Outlook panel defining metrics, inputs, projection, phase, trend, and sample confidence; touched `app/components/DevelopmentProfilePanel.tsx`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.
- 2026-06-22: Completed D3 by adding established-veteran peak-years-left framing to Development Outlook and swapping the panel Breakout tile to Peak Left for vets; touched `app/lib/development-profile.ts`, `app/components/DevelopmentProfilePanel.tsx`, `__tests__/development-profile.test.ts`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.
- 2026-06-22: Completed D2 by adding Development Outlook durability scoring from NHL season games, threading it into risk/confidence/bust outputs, and surfacing it in the panel Inputs; touched `app/lib/development-profile.ts`, `app/components/DevelopmentProfilePanel.tsx`, `__tests__/development-profile.test.ts`, `__tests__/feature-canaries.test.ts`, `__tests__/trade-logic-development.test.ts`, and `docs/TASKS.md`.
- 2026-06-22: Completed D1 by raising Development Outlook production references and projection clamps so elite scorers separate at the top end; touched `app/lib/development-profile.ts`, `__tests__/development-profile.test.ts`, and `docs/TASKS.md`.
- 2026-06-22: Removed sticky positioning from the players filter/search bar so the sticky icon key remains unobstructed; touched `app/globals.css`.
- 2026-06-22: Made the players icon key sticky, exposed each icon definition directly in the key, and removed the Dump entry/badge; touched `app/players/page.tsx`.
- 2026-06-22: Completed UI5 by adding a visible top-of-page players icon key for row badges so users do not need the footer glossary; touched `app/players/page.tsx`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.
- 2026-06-22: Completed UI4 by adding Armchair GM-style players-page row icon badges for Megalodon, Franchise, Surplus, prospect/pedigree, awards, injury risk, salary dump, and shutdown pedigree; touched `app/players/page.tsx`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.
- 2026-06-22: Completed UI3 by giving players-page forwards, defence, and goalies their own sortable section headers and row stats, including D suppression and goalie SV%/GAA/GP; touched `app/players/page.tsx`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.
- 2026-06-22: Completed UI2 by letting players-page names wrap without ellipsis and replacing archetype text pills with compact icon badges/tooltips; touched `app/players/page.tsx` and `docs/TASKS.md`.
- 2026-06-22: Completed UI1 by raising players-page filter, pager, and sortable column button text to a readable 11px with tighter letter spacing; touched `app/players/page.tsx` and `docs/TASKS.md`.
- 2026-06-19: Followed up R3 by lowering the shutdown-D DPS signal threshold and adding a live Parayko-shaped regression test so 22+ TOI / 3.4 DPS defenders clear the market floor; touched `app/lib/xnav-engine.ts` and `__tests__/xnav.test.ts`.
- 2026-06-19: Completed V2-5 by threading LineupEditor starting-goalie selections into `/api/simulate` and honoring them in goalie/team projections; touched `app/components/LineupEditor.tsx`, `app/armchair-gm/page.tsx`, `app/api/simulate/route.ts`, `__tests__/simulate-and-claude-routes.test.ts`, and `docs/TASKS.md`.
- 2026-06-19: Completed R3 by adding a guarded shutdown top-pair D defensive adjustment/floor for Parayko-type valuations while keeping weak top-minute D and offensive-D guards covered; touched `app/lib/xnav-engine.ts`, `__tests__/xnav.test.ts`, and `docs/TASKS.md`.
- 2026-06-19: Completed R1 by verifying expanded-card STRAND de-dup, adding sortable PTS/Term players-table headers, and compacting short-term contract projections; touched `app/players/page.tsx`, `app/components/PlayerTimeline.tsx`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.
- 2026-06-19: Completed R3 by verifying the guarded shutdown top-pair D floor/adjustment and Parayko/weak-D/Makar characterization tests already in `app/lib/xnav-engine.ts` and `__tests__/xnav.test.ts`; touched `docs/TASKS.md`.
- 2026-06-19: Completed V2-4.5 by reordering development phase classification so young EMERGING and older REGRESSION_RISK branches beat the elite PEAK_WINDOW fallback; touched `app/lib/development-profile.ts`, `docs/TASKS.md`, and `docs/DEVNOTES.md`.
- 2026-06-19: Completed V2-4 by adding extra goalies beyond starter/backup to the editable Lineup bench so they can be swapped into goalie slots; touched `app/components/LineupEditor.tsx`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.
- 2026-06-19: Completed V2-3 by requiring a 20-game live NHL sample before D-corps depletion flags can treat traded defensemen as established top-pair losses; touched `app/api/evaluate/route.ts`, `__tests__/evaluate-route.test.ts`, and `docs/TASKS.md`.
- 2026-06-19: Completed V2-2 by making `/api/league/teams` return the live `cap_ceiling` from `siteSettings` with validation/fallback while preserving the existing split team cache bust keys; touched `app/api/league/teams/route.ts`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.
- 2026-06-19: Completed Task 0.3 by tightening draft-class import overwrites so only existing rows with prospect metadata and no real contract/clauses receive ELC defaults; touched `app/api/admin/import-draft-class/route.ts`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.
- 2026-06-19: Completed V2-1 by removing Armchair GM's client-side league re-rank/phase remap after executed trades, preserving non-involved teams' standings/phases while only applying trader cap deltas; touched `app/armchair-gm/page.tsx`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.

---

## 2026-06 — Docs restructure
- Moved planning docs under `docs/`: `AUDIT.md` → `docs/TASKS.md` (trimmed to remaining
  work), `FUTURECONCEPTS.md` → `docs/futures/`, `DEVNOTES.md` → `docs/`.
- Added `docs/bugs/CONFIRMEDFIXES.md` (shipped items, verified vs f743338) and
  `docs/bugs/KNOWNBUGS.md` (triage inbox).
- Moved the task preamble into `AGENTS.md` → "Task Discipline" (single source; auto-loaded).
- Added Audit V2 bugs (V2-1…V2-5) and the Ledger Trade Tracker spec.

## 2026-06-19 Audit Refinements — R0-R2

### Completed Today

- Completed trimmed `AUDIT.md` refinements R0, R1, and R2.
- R0: Replaced the old hard replacement-callup clamp with establishment-based dampening of positive cap surplus. Cheap-contract surplus now scales by current games and multi-year baseline, while negative cap value is not softened.
- R0: Added regression coverage for a Heinola-class low-sample depth defender and an established-but-injured star so the depth case stays below premium NAV while strong-baseline players keep cap surplus.
- R1: Decluttered expanded player cards by removing the standalone Season Points card, dropping duplicate OPS/DPS pills while keeping PS, and rebalancing the expanded panel around stats, STRAND, timeline, and development content.
- R1: Removed duplicate STRAND offense/defense bar blocks from the shared renderer and collapsed the repeated trait guide behind a small `?` details control.
- R2: Added `fmvAav` to `XNAVResult` in the engine and shared trade types, populated it for skaters and goalies from the current-cap fair-market AAV calculation, and blended it through prospect transition results.
- R2: Added a small `estimateNextContractTerm` heuristic and surfaced `Projected next: $X.XM × Yyr (RFA/UFA)` in the shared contract timeline block with a tooltip clarifying fair-market midpoint AAV.
- Added source canaries and xNAV characterization tests for R0-R2.

### Verification

- `npx tsc --noEmit`
- Result: no TypeScript errors.
- `npm run test`
- Result: `263` tests passing across `11` test files.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-19 UX and UI Polish — Task U2 Revisited

### Completed Today

- Fixed the page-freeze regression described in `AUDIT.md` Task U2 Revisited.
- Removed `verdictOpen` from the Armchair GM body scroll-lock condition, so expanding or auto-opening the verdict bottom sheet no longer freezes page scrolling.
- Limited Armchair GM scroll locking to true blocking overlays: team select, trade block, and active trade-request modal.
- Converted `useBodyScrollLock` into a module-level reference-counted hook so overlapping modals increment/decrement one shared lock instead of clobbering each other's body overflow restore state.
- Confirmed direct `document.body.style.overflow` / `document.documentElement.style.overflow` writes now live only in `app/lib/use-body-scroll-lock.ts`.
- Updated feature canaries to require the reference counter and to prevent `verdictOpen` from returning to the scroll-lock condition.

### Verification

- `npx tsc --noEmit`
- Result: no TypeScript errors.
- `npm run test`
- Result: `257` tests passing across `11` test files.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-19 UX and UI Polish — Tasks U1-U7

### Completed Today

- Completed the `AUDIT.md` UX and UI Polish section from Task U1 through Task U7.
- Kept MoneyPuck goalie GSAx authoritative on both league roster routes by merging NHL goalie fallback stats with MoneyPuck `goalieMap` stats and preserving `mpG.gsax` when available.
- Added shared `useBodyScrollLock(isOpen)` in `app/lib/use-body-scroll-lock.ts` and applied it to the trade proposal, ledger dropdown, trade block panel, asset dropdown, trade history save modal, and Armchair GM modal overlays.
- Reworked Player Analytics to fetch canonical teams and players routes, use a denser desktop stat table, label/sort stat columns, and page sections at 25 forwards, 10 defencemen, and 5 goalies with Prev/Page/Next controls.
- Added visible `FLOOR` residual rows to NAV breakdowns so floored assets reconcile their visible components to headline NAV.
- Strengthened the active header tab with red active text and an underline while keeping the filled diamond.
- Added point-of-use `NAV` tooltips on asset cards and Armchair GM card/table labels.
- Raised sub-11px data labels in the dense AssetCard and lineup bench/scratch zones to the 11px `text-2xs`/equivalent floor.
- Confirmed Task U6 completion: NAV labels now expose point-of-use tooltips defining Net Asset Value.
- Enlarged the shared Team Strands and Lineups headers.
- Moved Lineups below the main trade grid and removed the old Armchair GM `CapProjection` render; the stale `Post-Trade Roster Projection` heading was removed from the component source.
- Removed the duplicate `players-mobile-sort-strip` and made `players-column-header` the single sortable player table header, with horizontal scrolling on narrow screens.
- Replaced the duplicate desktop PPG display slot with total season points and added season points to the expanded player panel.
- Rebalanced the expanded player panel into responsive stats, STRAND, and timeline/development zones to reduce desktop dead space.
- Updated feature canaries for the goalie GSAx merge, paged Player Analytics table, scroll lock hook, NAV floor residuals/tooltips, active navigation styling, Lineups placement, removed projection panel, and player table header cleanup.

### Verification

- `npm run test`
- Result: `257` tests passing across `11` test files.
- `npx tsc --noEmit`
- Result: no TypeScript errors.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-19 Batch Audit the Batch Audit — Task 0

### Completed Today

- Started at the `AUDIT.md` `# Batch Audit the Batch Audit` section and completed Task 0 only, per the standing preamble.
- Ran the baseline test suite before edits: `npm run test` passed with `253` tests across `11` files.
- Verified the following Task 0 items were already present in the current tree:
  - BreakdownTable optional metric guards in `app/armchair-gm/page.tsx`.
  - Draft-class import protection for existing NHL contract rows in `app/api/admin/import-draft-class/route.ts`.
  - Expanded admin cache clearing keys in `app/api/admin/clear-cache/route.ts`.
  - Trade-block name-derived keying and status enum validation in `app/api/admin/trade-block/route.ts`.
  - Cross-team duplicate player dedupe in `app/api/league/players/route.ts`.
- Completed the remaining Task 0 gap: cap-ceiling validation now rejects absurd values above `120` before admin persistence and ignores invalid request/DB cap ceilings in `app/api/evaluate/route.ts`.
- Updated the existing Batch 6 source canary in `__tests__/feature-canaries.test.ts` to cover absurd cap-ceiling validation on both admin settings and evaluate route reads.

### Verification

- `npm run test`
- Result: `253` tests passing across `11` test files.
- `npx tsc --noEmit`
- Result: no TypeScript errors.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-19 Batch Audit Follow-up

### Completed Today

- Worked through the `AUDIT.md` "Batch Audit" notes against the current codebase and verified that most previously listed Batch 1-6 discrepancies were already addressed in the tree.
- Completed the remaining concrete discrepancy found in `app/components/CapProjection.tsx`: current roster cap usage now sums effective retained cap hits, matching the incoming/outgoing retained-cap math already used for post-trade deltas.
- Completed the remaining young-player contract collision discrepancy in both league roster builders:
  - `app/api/league/players/route.ts`
  - `app/api/league/route.ts`
- The contract collision guard now tracks whether a contract matched by position, team, or generic name. It only applies the ELC fallback for young players when the risky match was generic name-only, so legitimate position/team-specific contracts are preserved even when roster position metadata differs.
- Added source canaries in `__tests__/feature-canaries.test.ts` for retained-cap current roster usage and for preserving young-player contracts when only position metadata disagrees.

### Verification

- `npm run test`
- Result: `253` tests passing across `11` test files.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-18 Batch 6 Admin / Players Ledger Audit

### Completed Today

- Completed Batch 6 edits from `AUDIT.md` across admin import/settings/cache routes, trade-block writes, roster patch reporting, STRAND rendering, cap projection, player comparison, and the players ledger.
- Guarded draft-class imports so existing NHL contract rows are not overwritten with ELC cap/term/clauses when a normalized prospect id collides with a real player.
- Added cap ceiling/floor validation in admin settings so zero, negative, non-finite, and inverted cap values are rejected before persistence.
- Hardened STRAND rendering and strand-type classification against empty trait arrays to avoid NaN SVG paths and divide-by-zero classifications.
- Expanded admin cache clearing to flush point shares, MoneyPuck skater/goalie CSV caches, NHL goalie summary stats, and versioned prospect enrichment caches.
- Changed patch-team-ids roster fetch failures to use a negative sentinel so failed NHL API fetches appear in `failedTeams`.
- Normalized trade-block row ids from player names on the server and validated statuses against `requested | available | blocked | untouchable`.
- Fixed post-trade cap projection to use effective retained cap hits and to strike through only players that belong to the displayed roster, with count labels matching rendered rows.
- Fixed lower-is-better comparison bars so cheaper and younger sides render as the longer winning bar.
- Added the development outlook panel to expanded skater rows on the players page.
- Split the players ledger into capped Forwards, Defence, and flat GSAx Goalies sections with show-all toggles and populated desktop sticky column labels.
- Added Batch 6 canaries covering each fixed audit path.

### Deferred

- Batch 6 lower-severity UX items not directly covered by the implementation task remain open: shared verdict color/status copy, QuickTradeMachine copied feedback, modal/row a11y improvements, disabled CTA affordance cleanup, AssetPicker untouchable flags, and AssetCard headshot fallback polish.

* Revision: Higher-impact: severity-tier legend (HARD/SOFT/WARN/INFO); plain-language + colorblind-safe verdict/net-gain labels; mobile audit/share controls hidden after a verdict; dead-end error messaging (friendly copy + Retry, no leaked endpoint paths).
Medium: shared verdict color/status config; QuickTradeMachine copied feedback; modal/row a11y; disabled-CTA affordance; AssetPicker untouchable flags; AssetCard headshot fallback.
Polish: sub-11px typography; ink-faint/rule contrast (WCAG); emoji copy icon.

### Verification

- `npx tsc --noEmit`
- Result: no TypeScript errors.
- `npm run test -- __tests__/feature-canaries.test.ts`
- Result: `112` tests passing.
- `npm run test`
- Result: `250` tests passing.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-18 Batch 5 UI State / Async Robustness Audit

### Completed Today

- Completed Batch 5 edits from `AUDIT.md` for Armchair GM, the players page, trade state, focused trade machine summaries, and saved scenarios.
- Added composite trade asset identity via `tradeAssetKey(id + teamId)` and applied it to trade-store add/remove/retention, AssetCard updates, trade execution, and post-trade lineup previews so duplicate-id rows can be selected and moved independently.
- Fixed Armchair GM retention NAV fetch cleanup so debounced requests are actually aborted and cannot re-inject stale retained NAV.
- Hardened Armchair GM league boot loading with `response.ok` checks, `Promise.allSettled`, empty payload validation, and clearer error reporting.
- Added abort/request-token guards to `findMatches` so stale "Who Wants This Package?" results cannot overwrite a newer package or clear the newer spinner.
- Guarded BreakdownTable optional skater metrics before `.toFixed()` calls so stats-less skaters cannot crash the table.
- Fixed players-page fetch error handling, deterministic sort tie-breaks, null-last OPS/DPS sorting, low-game PPG handling, deferred search filtering, duplicate-safe row keys, and continuous goalie ranks across goalie subsections.
- Expanded saved scenario snapshots to include asset id, teamId, retainedPct, round, and year; replaced content-hash ids with unique ids; and added guarded localStorage hydration for corrupt or oversized persisted JSON.
- Aligned QuickTradeMachine package summaries with Armchair GM's compression-aware package NAV and updated labels away from "Linear NAV".
- Added Batch 5 source canaries covering duplicate-id state operations, async abort guards, guarded metrics, players-page load/sort behavior, scenario persistence, and package NAV display.

### Deferred

- The full shared `useLeagueData` / `useNavMap` / `useTradeVerdict` hook extraction remains open. Batch 5 aligned the concrete package-value drift and hardened duplicated lifecycles, but a broad hook extraction would be a larger structural refactor.

### Verification

- `npx tsc --noEmit`
- Result: no TypeScript errors.
- `npm run test -- __tests__/feature-canaries.test.ts`
- Result: `103` tests passing.
- `npm run test -- __tests__/trade-share.test.ts`
- Result: `5` tests passing.
- `npm run test -- __tests__/evaluate-route.test.ts`
- Result: `5` tests passing.
- `npm run test`
- Result: `241` tests passing.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-18 Batch 3 Development / Static Pedigree Audit

### Completed Today

- Completed Batch 3 edits from `AUDIT.md` for the development-profile and static pedigree data paths.
- Added normalized static player-data lookups so accent/spelling variants such as `Tim Stutzle` resolve the same pedigree, prospect-tier, injury-risk, and shutdown-D records as their canonical keyed names.
- Updated evaluate logic, asset badges, and asset cards to use the normalized static lookup helpers instead of exact-name map indexing.
- Changed historical NAV floors to decay with age, availability, and current production when asset context is available, so declined or injured veterans are no longer re-inflated to peak value by a static floor.
- Wired development profile context inputs through league routes, including inferred international score, team context, and linemate/usage context where route data supports it.
- Fixed development profile classifier edge cases so ordinary 26-31 year-old NHLers do not render as `UNKNOWN`, low-volatility low-confidence profiles can be `STABLE`, and one-snapshot TOI changes cannot saturate role growth.
- Fixed rookie route-payload development inputs so players under 40 NHL games keep prospect NHLe as the headline pace while retaining the live NHL sample in the timeline.
- Versioned the prospect-enrichment Redis key by draft-year window and made slug merging first-write-wins to avoid silent same-slug overwrites.
- Added regression coverage for decayed historical floors, mid-career phase classification, boom/bust labeling, role-growth damping, and rookie small-sample pace handling.

### Verification

- `npx tsc --noEmit`
- Result: no TypeScript errors.
- `npm run test -- __tests__/development-profile.test.ts`
- Result: `13` tests passing.
- `npm run test -- __tests__/development-sources.test.ts`
- Result: `21` tests passing.
- `npm run test -- __tests__/xnav.test.ts`
- Result: `67` tests passing.
- `npm run test -- __tests__/feature-canaries.test.ts`
- Result: `97` tests passing.
- `npm run test`
- Result: `235` tests passing.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-18 Batch 4 League Roster / Simulation Audit

### Completed Today

- Completed the concrete Batch 4 edits from `AUDIT.md` across league roster assembly, cache isolation, and playoff simulation.
- Added shared player identity helpers in `app/lib/player-identity.ts` for canonical name keys, safe NHL roster row parsing, DB-authoritative roster removal, and final player dedupe.
- Applied DB-authoritative player dedupe in both `app/api/league/players/route.ts` and `app/api/league/route.ts`, so admin-assigned players such as a moved Joseph Woll cannot be emitted for both old and new teams.
- Made live roster ingestion skip malformed NHL rows instead of aborting the rest of the team loop.
- Fixed young-player contract collision handling so position-only overrides, such as Quinton Byfield's center override, do not strip real contracts down to ELC terms.
- Split the Redis team caches into `cache:league:teams:v1` and `cache:trade:teams:v1`, guarded standings sorts against missing points, and updated admin cache invalidation to clear both keys.
- Removed surname-only goalie stat fallbacks from league roster routes to avoid same-surname goalie stat collisions.
- Hardened playoff simulation so conference seeds are not padded with duplicate teams, winner lookups fail visibly instead of advancing the last seed, and later rounds sort series sides by projected strength before calculating win probability.
- Guarded `stablePts` against missing or non-finite scoring pace values so simulation standings cannot become `NaN`.
- Added canaries for roster dedupe, isolated team cache keys, goalie fallback behavior, playoff bracket safety, and simulation numeric guards.

### Deferred

- Batch 4's traded-pick origin/ownership item remains open. The current app only has synthetic pick generation and no local traded-pick ownership source or schema, so fixing that correctly requires a real ownership data model/feed rather than guessing pick origins.

### Verification

- `npx tsc --noEmit`
- Result: no TypeScript errors.
- `npm run test -- __tests__/feature-canaries.test.ts`
- Result: `97` tests passing.
- `npm run test -- __tests__/simulate-and-claude-routes.test.ts`
- Result: `11` tests passing.
- `npm run test`
- Result: `230` tests passing.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-18 Batch 2 Trade UI / Share Fidelity Audit

### Completed Today

- Completed Batch 2 edits from `AUDIT.md` for the trade UI, proposal, evaluation-client, verdict, and share surfaces.
- Added abort/run-id guards to focused Trade Machine NAV loading and GM Audit runs so stale async responses cannot restore old verdicts or clobber newer NAV maps.
- Reworked client NAV cache keys to serialize the full asset valuation payload plus cap ceiling instead of relying on a hand-maintained allow-list.
- Passed live cap ceiling through Trade Machine and Armchair GM NAV/verdict requests.
- Changed missing NAV handling so omitted server NAV ids throw an error instead of silently becoming legitimate zero-value assets.
- Added proposal-generation abort/run-id guards and capped full audit verification fan-out with `MAX_AUDIT_CANDIDATES`.
- Fixed salary-dump proposal generation so dump proposals send only negative-value contracts plus sweeteners, not unrelated positive-value players in the selected block.
- Preserved missing shared-trade assets as placeholders during share reconstruction so locked shared packages do not silently lose assets.
- Fixed verdict flag expansion keys to use stable global indices instead of `flags.indexOf(flag)`.
- Added shared pick-round formatting for trade UI surfaces so 4th+ round picks no longer display as 3rd-round picks or malformed ordinals.
- Added regression/source coverage for stale async guards, capped proposal audits, dump-package construction, share placeholders, NAV cache fidelity, VerdictPanel keys, and shared pick-round formatting.

### Verification

- `npm run test -- __tests__/trade-share.test.ts`
- Result: `5` tests passing.
- `npm run test -- __tests__/feature-canaries.test.ts`
- Result: `89` tests passing.
- `npm run test`
- Result: `222` tests passing.
- `npx tsc --noEmit`
- Result: no TypeScript errors.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-18 Batch 1 Core Valuation / Trade Verdict Audit

### Completed Today

- Completed Batch 1 edits from `AUDIT.md` for the core valuation and trade verdict path.
- Made package compression monotonic so adding low-value throw-ins can no longer reduce the compressed NAV of the package being sent away.
- Moved shared trade classification rules into `app/lib/trade-classification.ts` so `/api/evaluate` and proposal generation use the same:
  - division map
  - position normalization
  - future-core / development-risk / peak-window classifiers
  - veteran-term thresholds
  - shopped-asset and premium-lottery-pick checks
- Fixed proposal pre-screen partner-needs logic so a partner trading away an unreplaced stated position need is rejected deterministically.
- Aligned generated proposal concession limits with the verdict engine by comparing compressed NAV against the verdict's 45 / 70 concession bands.
- Fixed cap-floor checks in `/api/evaluate` to use the live/requested cap ceiling instead of the static season ceiling.
- Updated contender timeline checks to compare against compressed return NAV so depth-padded packages cannot dodge future-asset vetoes.
- Guarded trade metrics against missing optional fields so picks no longer corrupt `ptsGain` or `defGain`.
- Reduced bad-starter goalie floor inflation by allowing the starter floor signal to fall to zero for genuinely poor rate performance.
- Added regression coverage for monotonic compression, partner need screening, compressed concession bands, and pick-safe evaluate metrics.

### Verification

- `npm run test -- __tests__/xnav.test.ts`
- Result: `66` tests passing.
- `npm run test -- __tests__/trade-logic-development.test.ts`
- Result: `8` tests passing.
- `npm run test -- __tests__/evaluate-route.test.ts`
- Result: `5` tests passing.
- `npm run test -- __tests__/feature-canaries.test.ts`
- Result: `85` tests passing.
- `npm run test`
- Result: `218` tests passing.
- `npx tsc --noEmit`
- Result: no TypeScript errors.
- Dev server was not started in Codespace, per project instructions.

## 2026-06-18 Replacement Callup NAV Guard

### Completed Today

- Added a replacement-level callup ceiling to skater X-NAV.
- Low-minute, tiny-sample, age-26+ skaters with no meaningful baseline/pedigree signal no longer receive meaningful positive NAV from league-minimum cap surplus alone.
- This addresses profiles like a 29-year-old injury callup playing ~3 games at ~6 minutes TOI being valued as a real trade asset.
- Corrected the exact `Zack MacEwen` case where a weak MoneyPuck baseline existed but should not count as a meaningful established-player baseline.
- Added explicit tiny-sample production handling so one point in three games does not turn into a meaningful pts/82 signal for a 6-minute replacement callup.
- Added regression tests for a `Zack MacEwen`-shaped league-minimum callup with and without weak baseline data.

### Verification

- `npm run test -- __tests__/xnav.test.ts`
- Result: `65` tests passing.
- `npm run test`
- Result: `215` tests passing.
- `npx tsc --noEmit`
- Result: no TypeScript errors.
- Dev server was not started in Codespace, per project instructions.

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
