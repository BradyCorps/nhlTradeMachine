# Development Notes

# POSTCODEX_AUDIT
- 2026-07-07: **Armchair GM rework Phase 4 slice — EDGE data into sim logic + trade UI.** (1) `/api/simulate` skaters now carry `hdFinishingDelta`; `projectSkaterOutcome` biases the single-season roll off it (≤−2% high-danger finishing vs league → +6% breakout odds; ≥+3% → +6% regression), so the same EDGE luck signal that adjusts X-NAV and Cup Run `breakoutOdds` also shapes each simulated season. (2) Armchair GM AssetCards gain an EDGE tab (skaters with a real NHL id only) rendering the existing `EdgeShotMap` — shot-location tiles, finishing deltas, zone time, speed — inside the trade panel. Roadmap: `docs/futures/ARMCHAIR_REWORK.md` Phase 4. Touched `app/api/simulate/route.ts`, `app/components/AssetCard.tsx`.
- 2026-07-06: **Push limbo contracts to FA.** `PATCH /api/admin/prune-stale` (button in the prune card: "Push Limbo Contracts to FA") moves 0-year/$0 rows into free agency instead of deleting them: age 27+ (or unknown-age non-draftees) get `expiryStatus: UFA` + current offseason expiry so the FA-pool injection carries them into the market; RFA-eligible players (17-26) and unsigned draftees are left alone (their rights belong to teams) and reported in the response. Skips retired/excluded/extension rows and anything already in the FA flow; clears roster+contract caches on success. Best run AFTER the FA age backfill so the age gate works with real ages. Touched `app/api/admin/prune-stale/route.ts`, `app/admin/health/page.tsx`.
- 2026-07-06: **FA identity backfill — kills the "age 27" bug at the source.** FA-class seed rows carry age 0 / position Unknown, and the read path's 27 fallback kept resurfacing (Nyquist this time). New `POST /api/admin/fa-backfill` (button: Admin → Health → "Backfill FA Ages") resolves each gap row against the NHL search API (`search.d3.nhle.com`, unique exact-name match only — same-name pairs like the Petterssons are reported, never guessed), pulls the landing profile, and writes the real birthdate-derived age + position into the players table, then clears roster/contract caches. Capped 60/call. Curated FA_KNOWN_FACTS stays as override; Nyquist (36, $3.185M) added meanwhile. New pure helpers `parsePlayerSearch`/`pickSearchMatch` with tests. Touched `app/lib/nhl-player-feed.ts`, `app/api/admin/fa-backfill/route.ts` (new), `app/admin/health/page.tsx`, `app/lib/free-agent-seed.ts`, `__tests__/nhl-player-feed.test.ts`.
- 2026-07-06: **Site-wide typography accessibility pass.** Two uniform levers matching the refined EDGE tab standard: (1) `--ledger-ink-faint` darkened #9a7d58 → #6e5a3d and `--ink-faint` #7a6a50 → #635340 — the secondary/agate ink used across the whole app now reads as dense newsprint instead of washed-out tan, one variable change with global reach; (2) a 9px font floor enforced by codemod — all `text-[6-8px]` Tailwind utilities and `fontSize: 6-8` style objects bumped to 9-10px (55 call sites across armchair GM, press box, admin pages, components). Verified visually at 375px. Touched `app/globals.css` + 15 tsx files.
- 2026-07-06: **EDGE shot map refinement — accessibility, layout, mobile.** Rebuilt the map as non-overlapping anatomical tiles (5 rows x 3 columns inside the rink outline), each carrying its shot count (12px) and a zone label so the map reads without hover on mobile; added a shot-volume legend under the rink. Location summary rows restructured to two lines (percentile chip + name + shots/league, then goals + shooting% + finishing delta) at 10-11px; zone-time tiles and the speed strip bumped to readable sizes with darker ink; desktop is a 46/54 split, mobile stacks with the map full-width. Visually verified at 375px and 1100px against the real captured McDavid payload seeded locally. Touched `app/components/EdgeShotMap.tsx`.
- 2026-07-06: **Codex review + leadership intangibles + EDGE shot-map tab.** Reviewed 58c6dde..15387d9 (cap-aware FA resolution with AI market signings, double AI cap pass, reconcileAiTeamCapSpaces, lineup-ranking extraction, draft-summary routing) — sound, all 421 tests green, no corrections needed. Added on top: (1) `app/data/leadership.ts` curated C/A letters (editable); `lineupContributionScore` adds +28/+14 for C/A (lineup only — never trade value) and the sim's `onIceValue` gets a +3/+1.5 steadier, so Lowry-types slot like captains. (2) NHL EDGE tab on the Player Analytics expanded card: new public `/api/player-edge/{nhlId}` serves the latest stored edge snapshot; `EdgeShotMap` renders the 15-zone offensive-half rink (fill = shot-volume percentile, counts inline), location summary with finishing vs league, zone-time splits, and the speed strip — the EDGE screenshot, in newsprint. Touched `app/data/leadership.ts` (new), `app/lib/lineup-ranking.ts`, `app/api/simulate/route.ts`, `app/api/player-edge/[playerId]/route.ts` (new), `app/components/EdgeShotMap.tsx` (new), `app/players/page.tsx`, `__tests__/lineup-ranking.test.ts`.
- 2026-07-06: **Best Lines lineup ranking uses contribution, not raw X-NAV.** Extracted a lineup contribution score that weights production, deployment trust, matchup role, and NHL tenure with X-NAV only as a light tiebreaker, so defensive leaders on negative-value contracts are not buried by Best Lines. Touched `app/lib/lineup-ranking.ts`, `app/components/LineupEditor.tsx`, `__tests__/lineup-ranking.test.ts`.
- 2026-07-06: **Cup Run AI cap discipline + market signings.** AI offseason resolution now checks whether re-signing cap swings fit, sends unaffordable UFAs/RFAs off the roster, signs open-market UFAs only to non-user AI teams with enough cap room, applies those market signings back into Armchair GM state, and reconciles non-user team cap space from rolled rosters after Cup Run year advancement. Touched `app/lib/free-agency.ts`, `app/lib/cup-run.ts`, `app/armchair-gm/page.tsx`, `__tests__/free-agency.test.ts`, `__tests__/cup-run.test.ts`, `docs/TASKS.md`.
- 2026-07-06: **NHL EDGE usage/presentation hardening.** Made EDGE high-danger luck visible as `EDGE HD` / `NHL EDGE HD`, threaded `hdFinishingDelta` into Players local Player Card and contract projection NAV calls, and added a source canary covering snapshot capture, roster join, xNAV/rollover use, and UI labels. Touched `app/players/page.tsx`, `app/components/PercentileCard.tsx`, `app/armchair-gm/page.tsx`, `__tests__/feature-canaries.test.ts`, `docs/TASKS.md`.
- 2026-07-06: **Cup Run later-year draft summary + re-sign handoff.** Year 2/3 Cup Run rollovers now expose the generated draft class, show a future-draft summary popup, and then open the Re-Sign phase; if the summary is unavailable, the offseason falls straight into re-signing so flagged 0-year contracts cannot remain stale on the user's roster. Touched `app/lib/cup-run.ts`, `app/armchair-gm/page.tsx`, `__tests__/cup-run.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/TASKS.md`.
- 2026-07-06: **Full-roster sim projections, lineup-as-starters, pedigree Best Lines.** The sim now projects a season for every skater on each team (was top 18 with stats filters, capped): when a lineup is set, dressed players are starters (existing deployment floors/multipliers) and everyone outside it projects as press-box depth (≤18-42 GP, ×0.85 usage). Best Lines no longer ranks purely by NAV — on-ice rank blends 55% NAV with 45% coach-deployment trust (career TOI) plus a small tenure nudge, so a negative-NAV captain (Lowry-type: heavy contract, heavy minutes) still slots high while the trade machine keeps valuing him honestly. Touched `app/api/simulate/route.ts`, `app/components/LineupEditor.tsx`.
- 2026-07-06: **EDGE into X-NAV + analytics page; FA market display facts.** (1) `calcSkaterNAV` gains a bounded EDGE luck regression: `hdFinishingDelta` (high-danger finishing vs league from nhl_snapshots) adjusts offense −8…+10 NAV — hot finishers discounted, unlucky ones credited (pinned in xnav-team-control tests). (2) Player Analytics stat tiles gain "HD LCK" showing the delta as ±x.x%. (3) FA-class seed rows carried age 0/capHit 0 → Kane showed age 27 / "was $0.00M": new `FA_KNOWN_FACTS` curated map (ages + expiring AAVs for the notable teamless FAs) joins at injection, ResignPhase hides the "was" chip when unknown. Kane now prices as a 37-year-old (~$5M short-term), not a 27-year-old on a 7-year ask. Touched `app/lib/xnav-engine.ts`, `app/players/page.tsx`, `app/lib/free-agent-seed.ts`, `app/lib/roster-assembly.ts`, `app/components/ResignPhase.tsx`, `__tests__/xnav-team-control.test.ts`.
- 2026-07-06: **Prod cron feedback fixes: snapshot failures + FA-pool min-contract exploit.** First prod cron run stored 160 snapshots but flagged 17 "failures" — players with no current-season NHL stat line (rookies/no-GP); `parseLanding` now requires only identity (playerId/position/birthDate) and zeroes missing stats, while the health-check canary keeps the full strict path list for drift detection. Separately, FA-pool injected veterans (Tarasenko, Giroux, Klingberg…) priced at league-min because seed rows carry position "Unknown" (truthy — the `|| "C"` fallback never fired): the injection now infers position (goalie stats → G, ≥19 TOI with modest scoring → D, any skater stats → W), and `projectFreeAgentContract` gained a safety net pricing unknown-position skaters off their pace instead of capMin. Touched `app/lib/nhl-player-feed.ts`, `app/lib/roster-assembly.ts`, `app/lib/free-agency.ts`, `__tests__/nhl-player-feed.test.ts`.
- 2026-07-06: **NHL feed full integration — cron, health card, luck signal in the engine, UI.** (1) `vercel.json` cron hits new `/api/cron/nhl-feed` nightly (CRON_SECRET bearer auth or admin session); 4 teams per run on an 8-day rotation, shared `app/lib/nhl-feed-capture.ts` powers both cron and admin sync. (2) Admin → Health gains an "NHL FEED" card: probe both endpoints with drift-field readout, per-team capture button, snapshot count. (3) `latestEdgeLuckMap` joins the newest edge snapshot per player onto rosters in roster-assembly (`Asset.hdFinishingDelta`), and `breakoutOdds` prefers the EDGE high-danger finishing delta over the xG heuristic (≤−2% → +8% breakout; ≥+3% → +8% regression). (4) Ledger Line expanded rows show "HD Finish ±x.x% vs league" colored by luck direction. Verified locally: cron 401s without auth, authenticates with bearer, rotates ANA/BOS/BUF/CAR on cycle day 0, degrades gracefully when the NHL API is unreachable; snapshot write + latest-wins read E2E against local.db. Suite 413 green. Touched `app/lib/nhl-feed-capture.ts` (new), `app/api/cron/nhl-feed/route.ts` (new), `vercel.json` (new), `app/api/admin/nhl-feed/route.ts`, `app/admin/health/page.tsx`, `app/lib/roster-assembly.ts`, `app/lib/trade-types.ts`, `app/lib/season-rollover.ts`, `app/armchair-gm/page.tsx`, `__tests__/season-rollover.test.ts`.
- 2026-07-06: **First-party NHL player feed (landing + EDGE).** New pipeline against the endpoints Brady captured from NHL site traffic: `app/lib/nhl-player-feed.ts` fetches/parses `/v1/player/{id}/landing` (identity, season lines, career, draft) and `/v1/edge/skater-detail/{id}/{season}/2` (shot locations, zone time, speed), extracting the high-danger finishing delta vs league — the true luck signal for breakout bias. Snapshots persist to a new `nhl_snapshots` table (one row per player/season/source/day, key columns + full raw payload for future mining; self-provisioning via ensure-schema). `/api/admin/nhl-feed`: GET = source health check probing a canary player and reporting any missing required field (catches upstream v1→v2 drift); POST `{ team }` or `{ ids }` = capture up to 40 players per call with bounded concurrency. 3 parser/drift tests on real captured shapes. Touched `app/lib/nhl-player-feed.ts` (new), `app/api/admin/nhl-feed/route.ts` (new), `app/db/schema.ts`, `app/db/ensure-schema.ts`, `__tests__/nhl-player-feed.test.ts` (new).
- 2026-07-06: **FA projection market recalibration (post-Carlsson offer sheet).** `projectFreeAgentContract` now pays ascending stars for their prime: under-24 scoring pace projects forward 12%/yr (capped +45%) before pricing, so a Bedard-tier 21yo RFA lands in Kaprizov range (~$15-17M) on max term (RFAs ≥$10M lock 8 years) instead of ~$10M — no more bargain generational talents. Workload-only defensemen stop projecting like stars: `dToiPerMin` 0.60→0.42 (a 21-minute defensive D now asks ~$5.5M, not $7.5M) while elite minutes+points D still clear $11M+. 5 calibration pins in `__tests__/fa-projection-market.test.ts`. Touched `app/lib/free-agency.ts`.
- 2026-07-06: **Cup Run resume guard.** A saved ACTIVE run is never restored silently on page load anymore — the rolled league lives only in React state, so a reloaded mid-run session was a fresh 2026 league wearing Year-2 flags (offseason popups gated off, pending RFAs stuck at 0x0, confusing NAVs). A blocking modal now offers Resume (only for Year 1 pre-rollover, with the retention ledger reset since trades died with the tab) or Abandon (forced for Year 2+, with an explanation). Abandon paths clear the localStorage key explicitly. Touched `app/armchair-gm/page.tsx`.
- 2026-07-06: **Testing-feedback batch 2 — lineups, breakdowns, accessibility.** LineupEditor gains a Best Lines button (orders every unit by X-NAV, C-column pattern preserved) and hand-set lineups now lock through trades — roster changes merge (departed players drop, arrivals go to the bench) instead of resetting the sheet. The Ledger Line rows expand on click into a valuation breakdown: Offense/Defense/Age/Contract/Upside NAV component bars plus FMV vs cap hit, tier, and expected-vs-actual points. Season-results typography bumped for accessibility (tables 6.5-9px → 8-11px, StatCell labels 6→8px). Touched `app/components/LineupEditor.tsx`, `app/armchair-gm/page.tsx`.
- 2026-07-06: **Testing-feedback batch 1 — Cup Run correctness + same-name identity.** (1) Rollover flags all run-out contracts (incl. stale 0-year rows — the Nino case) so `resolveLeagueOffseason` moves them next offseason. (2) Cup Run years 2-3 no longer replay the 2026 Draft Night; rollover drafts from actual standings and `app/data/future-draft-classes.ts` accepts real 2027/2028 prospects (synthetic filler beyond). (3) Claude recap suppressed mid-run; fires once at run end with a `cupRunStory` schema+prompt section narrating the whole 3-season arc. (4) Elias Pettersson collision: seed inserts position-salted rows per `Name__POS` contract variant; `trade_block.position` column added (ensure-schema), admin sends it, block application prefers `Name__POS` keys. Touched `app/lib/cup-run.ts`, `app/lib/synthetic-draft.ts`, `app/data/future-draft-classes.ts` (new), `app/armchair-gm/page.tsx`, `app/armchair-gm/useSimDispatch.ts`, `app/api/claude/route.ts`, `app/db/schema.ts`, `app/db/ensure-schema.ts`, `app/db/seed.ts`, `app/api/admin/trade-block/route.ts`, `app/admin/trade-block/page.tsx`, `app/lib/roster-assembly.ts`, `__tests__/cup-run.test.ts`.
- 2026-07-06: **Season box score → "The Ledger Line" analytics table.** The full-roster season table now joins each player's sim line against the valuation engine via new `players`/`navMap` props threaded into `SeasonResultsPager`: per-player X-NAV, NOIV impact (±, colored), CAP± (fair-market AAV minus effective cap hit), and ΔXP (points vs preseason pace scaled to games played, with ▲/▼ season-arc markers folded in); player cells carry a POS · AGE · ARCHETYPE agate subline and a legend explains the columns. Crease table gains X-NAV and CAP± for the starter, and GSAX now renders rounded to two decimals (was a raw float like +5.539999999999992). Touched `app/armchair-gm/page.tsx`.
- 2026-07-06: **X-NAV: growth-adjusted surplus + team-control option value.** Fixed the structural undervaluation of pre-peak players on long deals (user report: Stankoven-type 23yo at 41pts on 6×8 ≈ Perfetti+Koepke for Stankoven+1st looked fair to the engine). Two bounded changes inside `calcSkaterNAV`: (1) the multi-year surplus loop now drifts trueMarketValue along the already-audited age curve — up to +9%/yr (gated by `youthProjectionSignal`) through the peak age, −3%/yr from peak+2, cumulative clamp [0.70, 1.35] — so a 23-year-old's years 2–6 price as prime seasons and an aging 8-year deal prices its decline; (2) a Team-Control Option Value term (youth signal × control years overlapping the growth window × 6 × capEstablishment, ≤ ~36 NAV) prices the asymmetry that a long deal caps downside at a known cap hit while capturing breakouts free. Probe case: 23yo 41pts 6×8 went 46→69 (cap −17→+9); his 1-yr rental 37→40; same profile at age 30 16→15. Suite green at 403 (5 new ordering pins in `__tests__/xnav-team-control.test.ts`), no existing valuations broke. Touched `app/lib/xnav-engine.ts`, `__tests__/xnav-team-control.test.ts` (new).
- 2026-07-06: **Franchise-style season box score in Team Numbers.** The Season Results team panel now expands (open by default) into a full-roster stat table — rank, player (with R rookie chip), pos, age, GP, G, A, PTS, and ▲/▼ breakout/regression markers — plus a Crease table for the starter (GS, GAA, SV%, GSAX). Pure presentation over the `projectedSkaters`/`goalie` data the sim response already carried. Touched `app/armchair-gm/page.tsx`.
- 2026-07-06: **Cup Run Challenge Phases 2–4 — playable 3-year mode.** `app/lib/cup-run.ts`: run state machine (start → record season → WON/FIRED), `rollLeagueForward` (scenery detection → advanceSeason → synthetic draft → AI cap-legality pass that never cuts goalies or breaks lineup minimums → roster repair), cross-season retention ledger (50% max, 3 slots occupied for the retained term, 15%-of-cap aggregate) enforced inside `executeTrade`, difficulty stars from phase/standing, share card. `app/lib/synthetic-draft.ts`: seeded 32-pick future classes (worst-first order, pedigree-shaped NHLe pace). `app/lib/lineup-context.ts`: slot multipliers + `computeChangeOfScenery`; `/api/simulate` applies slot weighting only when `lineupContext: true` so the classic sim is byte-identical. `CupRunPanel` HUD on Armchair GM with localStorage persistence; advancing a year resets trades/lineups/offseason and re-resolves FA against the rolled league. Verification: 17 new tests in `__tests__/cup-run.test.ts` incl. X-NAV consistency checks; suite 398 green; build clean; page smoke-tested. Touched `app/lib/cup-run.ts` (new), `app/lib/synthetic-draft.ts` (new), `app/lib/lineup-context.ts` (new), `app/components/CupRunPanel.tsx` (new), `app/armchair-gm/page.tsx`, `app/armchair-gm/useSimDispatch.ts`, `app/api/simulate/route.ts`, `app/lib/season-rollover.ts`, `docs/futures/CUP_RUN_CHALLENGE.md`.
- 2026-07-06: **Cup Run Challenge Phase 1 — season rollover engine.** New pure lib `app/lib/season-rollover.ts`: `advanceSeason()` ages the league one offseason (aging, contract decrement, seeded retirement ramping after 35 with a 2-year-later goalie clock, stat regeneration via `stablePts` × `ageDecay`, and breakout/regression rolls — 8%/10% base, age-biased, with an xG-vs-goals "unlucky finisher" bias from existing MoneyPuck `xGPace`/`goalsPace` and a doubled-odds change-of-scenery hook for Phase 3). Design doc at `docs/futures/CUP_RUN_CHALLENGE.md` maps all four phases onto existing machinery and notes NHL Edge shot-location endpoints (documented in coreyjs/nhl-api-py; called directly from TS) as a future luck-signal enrichment. Verification: 15 new tests in `__tests__/season-rollover.test.ts`, full suite green. Touched `app/lib/season-rollover.ts` (new), `__tests__/season-rollover.test.ts` (new), `docs/futures/CUP_RUN_CHALLENGE.md` (new).
- 2026-07-06: **Press Box "Back Issues" archive calendar.** NYT-crossword-style month grid below the game — one linked cell per hand since epoch; green+star = perfect, ink = finished, amber = in progress, outline = open, red ring = today; played/perfect tally in the header. Reads the same localStorage saves the game writes and refreshes when the current hand ends. Touched `app/press-box/Calendar.tsx` (new), `app/press-box/page.tsx`.
- 2026-07-06: **Press Box player headshots.** `/api/press-box/pool` now overlays NHL mugshot URLs by fetching the 32 live roster endpoints (best-effort, 1h cache); cards render a sepia circular mug with flag-emoji fallback on missing/failed images. Verified deal→score→retry flow at 375px. Touched `app/api/press-box/pool/route.ts`, `app/press-box/page.tsx`, `app/lib/press-box-engine.ts`.
- 2026-07-06: **Press Box live pool, peg-board feedback, playing-card redesign.** New `/api/press-box/pool` overlays team/age/draft year from the synced players table onto the curated pool (curated file keeps identity + serves as fallback; null DB team means "unknown", only a valid tricode overrides; retired/excluded rows drop). Replaced the exact "Target: N/15 (X pts away)" readout with a cribbage peg board (best/last pegs vs red target hole) and "X/4 cards in the perfect lineup" via new `findOptimalCombos`/`overlapWithOptimal` engine helpers. Cards rebuilt as 5:7 newspaper playing cards with mirrored corner indices and rubber-stamp overlays. Touched `app/api/press-box/pool/route.ts` (new), `app/lib/press-box-engine.ts`, `app/data/press-box-pool.ts`, `app/press-box/page.tsx`, `__tests__/press-box-engine.test.ts` (new).
- 2026-07-06: **Press Box pool freshness + Wordle-ification (recap of 07-03…07-05 work on this branch).** Pool updated for 2026 offseason moves (12 team changes, 4 removals, 4 additions, 2 name fixes); multi-attempt mechanic added — 5 attempts, call-up hidden on the first, Wordle-style share blocks, attempt history, v2 save format with v1 restore. Teamless FA-pool DB entries now inject into the armchair GM offseason market (`FA_POOL` virtual team). Touched `app/data/press-box-pool.ts`, `app/lib/press-box-engine.ts`, `app/press-box/page.tsx`, `app/lib/roster-assembly.ts`, `app/lib/free-agency.ts`, `__tests__/feature-canaries.test.ts`, `__tests__/derive-contract-status.test.ts`.
- 2026-07-02: Extracted Armchair GM simulation dispatch into `app/armchair-gm/useSimDispatch.ts`, added a source canary for the split, and marked CLAUDECONCERNS CC1 complete. Touched `app/armchair-gm/page.tsx`, `app/armchair-gm/useSimDispatch.ts`, `__tests__/feature-canaries.test.ts`, `docs/CLAUDECONCERNS.md`, `docs/DEVNOTES.md`.
- 2026-07-02: Added a source canary keeping the dead `ContractSyncer` component and obsolete `/api/contracts` route retired; marked CODEXAUDIT item 6 complete. Touched `__tests__/feature-canaries.test.ts`, `docs/CODEXAUDIT.md`, `docs/DEVNOTES.md`.
- 2026-07-02: Updated the admin dashboard canary to keep the retired `/admin/fa-overrides` path out while Contract Admin owns FA player-row facts; marked CODEXAUDIT item 5 complete. Touched `__tests__/feature-canaries.test.ts`, `docs/CODEXAUDIT.md`, `docs/DEVNOTES.md`.
- 2026-07-02: Confirmed the admin auth canary recursively discovers every `app/api/admin/**/route.ts` file and checks each exported handler for `requireAdmin(req)`; marked CODEXAUDIT item 4 complete. Touched `docs/CODEXAUDIT.md`, `docs/DEVNOTES.md`.
- 2026-07-02: Added route-level regression coverage for Contract Admin `EDITOR → SYNC`, proving editor rows reset to sync, curated FA/exclude flags clear, and roster/team caches invalidate; marked CODEXAUDIT item 3 complete. Touched `__tests__/contracts-source-reset.test.ts`, `docs/CODEXAUDIT.md`, `docs/DEVNOTES.md`.
- 2026-07-02: Added route-level regression coverage proving admin team overrides and broad cache flushes clear cap-specific `/api/league/teams` cache keys, including the active cap setting; marked CODEXAUDIT item 2 complete. Touched `__tests__/team-cache-routes.test.ts`, `docs/CODEXAUDIT.md`, `docs/DEVNOTES.md`.
- 2026-07-02: Added route-level regression coverage proving `/api/league/teams` surfaces draft-pick ownership overrides in the main trade UI payload; marked CODEXAUDIT item 1 complete. Touched `__tests__/league-teams-route.test.ts`, `docs/CODEXAUDIT.md`, `docs/DEVNOTES.md`.
- 2026-06-30: Increased Team Strand trade-delta chip typography to 11px for readability; touched `app/components/TeamStrand.tsx` and `__tests__/feature-canaries.test.ts`.
- 2026-06-30: Added per-side win/even/loss trade verdict reads and Team Strand pre/post trade delta chips, including the focused Trade Machine page, so forward-for-defense need trades can show both teams' gains; touched `app/api/evaluate/route.ts`, `app/lib/trade-types.ts`, `app/components/VerdictPanel.tsx`, `app/components/TeamStrand.tsx`, `app/components/QuickTradeMachine.tsx`, `app/armchair-gm/page.tsx`, `__tests__/evaluate-route.test.ts`, `__tests__/feature-canaries.test.ts`, and `docs/TASKS.md`.
- 2026-06-29: Updated the simulation path for the 2026-27 season contract: `/api/simulate` now returns `season: "2026-27"`, values drafted-rookie profiles through `prospectPtsPace`/`draftOverall`, and applies the user-edited lineup order to team-strength, skater deployment, and starter goalie selection. Armchair GM now sends full forward/defense/goalie lineup orders from `LineupEditor` into the sim request and merges newly added offseason players from live `db.players` into the original sim baseline so Draft Night rookies are included without double-applying executed trades. Added behavior tests for dressed McKenna/Stenberg-style rookies and lineup-sensitive standings, plus a source canary for the lineup payload. Verification: `npx tsc --noEmit` clean; `npm run test` 354 passed across 24 files. Touched `app/api/simulate/route.ts`, `app/lib/sim-engine.ts`, `app/components/LineupEditor.tsx`, `app/armchair-gm/page.tsx`, `__tests__/simulate-and-claude-routes.test.ts`, `__tests__/feature-canaries.test.ts`.
- 2026-06-29: Removed the front-facing `ADMIN ->` link from the Trade Block modal so public UI no longer links into `/admin/trade-block`; added a source canary to keep the link out. Touched `app/components/TradeBlockPanel.tsx`, `__tests__/feature-canaries.test.ts`.
- 2026-06-29: Implemented `docs/CODEXAUDIT.md` suggested fix order: shared draft-pick inventory now applies DB pick ownership overrides in `/api/league/teams`; shared team-cache clearing covers cap-specific cache keys across admin mutations; Contract Admin adds an `EDITOR → SYNC` bulk provenance reset; admin auth canary auto-discovers all admin API routes; deprecated FA override API now returns 410 and the dead `ContractSyncer` was removed. Added `__tests__/draft-pick-inventory.test.ts` and updated source canaries. Verification: `npx tsc --noEmit` clean; `npm run test` 350 passed across 24 files. Touched `app/lib/draft-pick-inventory.ts`, `app/lib/team-cache.ts`, league/admin routes, `app/admin/contracts/page.tsx`, `__tests__/*`, and `app/lib/free-agent-seed.ts`.

- 2026-06-29: **Enabled goalie STRAND tab on both Player Analytics and Armchair GM.** Goalies were excluded from the STRAND visualization tab by explicit position guards (`hasStrand = !isG` in `app/players/page.tsx`, `asset.position !== "G"` in three places in `app/components/AssetCard.tsx`). Removed all four guards so goalies now display their GSAX/SV%/HDSV/WRKLD strand alongside skaters. Also removed the goalie exclusion from AssetCard's compare dropdown so goalie-to-goalie STRAND comparison works. Touched `app/players/page.tsx`, `app/components/AssetCard.tsx`.
- 2026-06-29: **Updated 2026 NHL Draft with actual first-round results.** The draft was played on 2026-06-28; updated `app/data/draft-2026.json` with corrected pick ownership from draft-night trades (15 picks changed hands vs the pre-draft order — ANA got #15 via DET/STL, UTA got #17 via LAK, SJS got #21 via PHI, DET got #23 via BOS/UTA, MTL got #26 via VGK/NYR/DAL/CAR, PHI got #27 via SJS/BUF, etc.). Updated `app/lib/draft-2026.ts` DRAFT_2026_PROSPECTS to match actual selections in draft order — reordered existing prospects and added 9 new players not in the pre-draft board (Wyatt Cullen, Alexander Command, Maddox Dagenais, Liam Ruck, Jonas Lagerberg Hoen, Gleb Pugachyov, Maksim Sokolovskii, Tommy Bleyl, Jaxon Cover); removed 9 prospects who were not taken in the first round. Stats for new players are estimated from draft-year league context. Changed `pickState` from `"fut"` to `"complete"` and `source` to `"actual"`. Touched `app/data/draft-2026.json`, `app/lib/draft-2026.ts`.
- 2026-06-29: **Added goalie STRAND trait builders.** The `FullStrand` component in `app/players/page.tsx` and `buildGoalieTraits` in `app/components/StrandView.tsx` now detect `position === "G"` and return goalie-specific traits (GSAX normalized -15–25, SV% normalized 0.890–0.935, HDSV from `baselineHdsvPct` normalized 0.780–0.880, WRKLD from games started normalized 10–65) instead of meaningless skater metrics. HDSV is marked `unavailable` on Player Analytics since `baselineHdsvPct` isn't exposed there. Strand type for goalies is set to `"GOALTENDER"`. Also fixed null `xGPace` displaying as "0" by checking `xGPace != null` and marking unavailable when null. Touched `app/players/page.tsx`, `app/components/StrandView.tsx`.
- 2026-06-29: **Added onboarding for new testers: welcome modal, inline tooltips, methodology page.** (1) `app/components/WelcomeModal.tsx` — first-visit welcome overlay using localStorage `"hockey-ledger-welcomed"` key; introduces X-NAV, STRAND, GM Audit, FMV with brief definitions; "Enter the Ledger" dismiss button; click-outside-to-dismiss. Rendered in `app/layout.tsx`. (2) `app/components/MetricTip.tsx` — hover/touch tooltip component with 25+ term glossary (GLOSSARY record); dotted underline on terms; dark tooltip with cream text; 150ms leave delay. Applied to X-NAV and FMV labels in `app/components/PercentileCard.tsx`. (3) `app/methodology/page.tsx` — dedicated methodology reference page importing `iconKey` and `methodologySections` from Footer; all content expanded (no collapsible sections); table of contents with anchor links; newspaper aesthetic. (4) Updated `app/components/Footer.tsx` to export `iconKey` and `methodologySections` arrays and linked "Methodology"/"Glossary" text to `/methodology` and `/methodology#strand-glossary`. Touched `app/components/WelcomeModal.tsx` (new), `app/components/MetricTip.tsx` (new), `app/methodology/page.tsx` (new), `app/layout.tsx`, `app/components/Footer.tsx`, `app/components/PercentileCard.tsx`.
- 2026-06-28: **Fixed Re-Sign Phase layout breaking on mobile.** Flexbox layout in the Re-Sign modal was overflowing on narrow screens. Fixed spacing, wrapping, and button sizing so the UFA/RFA re-sign controls work properly on mobile. Touched `app/components/ResignPhase.tsx`.
- 2026-06-28: **Added games-based confidence scaling to DEF display xGA weight.** Defensive display value for low-sample players now scales xGA suppression weight by games played, so a 10-game sample doesn't get full weight. Touched `app/components/PercentileCard.tsx`.
- 2026-06-28: **Replaced hardcoded player awards with CSV-derived data.** Moved historical award data (Hart, Norris, Vezina, Selke, Calder, Byng, Art Ross, Rocket Richard, Conn Smythe, etc.) from a hardcoded map to a CSV-sourced build, covering all winners through the 2025-26 season. Touched `app/lib/player-data.ts`, `app/data/byng_winners.csv` (new), `scripts/build-awards.ts`.
- 2026-06-28: **Added team card section with advanced analytics breakdown and historical awards.** New bar-graph breakdown of player advanced analytics per team card, plus historical award badges surfaced from the CSV data. Significant refactor across 17 files. Touched `app/players/page.tsx`, `app/lib/player-data.ts`, and 15 other files.
- 2026-06-28: **Fixed FMV display showing $0.0M.** `fmvAav` was already in millions but was being divided by 1M again, producing $0.0M. Fixed the unit mismatch. Touched `app/components/PercentileCard.tsx`.
- 2026-06-28: **Added plum-styled analysis tabs to Armchair GM asset cards.** Unified the STATS/STRAND/TIMELINE/DEV tab styling on the Armchair GM page with the same plum accent treatment used on Player Analytics. Touched `app/armchair-gm/page.tsx`.
- 2026-06-28: **Fixed DEF display for defensemen by blending DPS into defensive display value.** Defensemen with DPS data now show a blended defensive value (DPS×15 weighted with xGA suppression) instead of raw xGA only. Touched `app/components/PercentileCard.tsx`.
- 2026-06-28: **Added position median reference lines to percentile card bars.** Each percentile bar now shows the median value for that position group as a reference marker, making it clearer whether a player is above or below average. Touched `app/components/PercentileCard.tsx`.
- 2026-06-28: **Refactored expanded player panel into tabbed navigation with plum accent.** Replaced the flat expanded-row layout with a tabbed interface (Stats, Strand, Player Card, Contract, Outlook) using the PLUM accent color for active tabs and borders. Touched `app/players/page.tsx`.
- 2026-06-28: **Fixed defensive D valuation, injured player blending, and added percentile player cards.** Increased shutdownDAdj ceiling from 18→28 so elite shutdown D-men get proper credit. Added TOI-based defensive floor (+1.8/min above 20 TOI, max +12) for heavy-minutes D. Dynamic baseline blending: 80% baseline when games < 30 (injury) vs 60% normally. New `PercentileCard` component: JFresh-style position-relative percentile bars with X-NAV breakdown. Touched `app/components/PercentileCard.tsx` (new), `app/lib/xnav-engine.ts`, `app/players/page.tsx`.
- 2026-06-28: **Removed standalone offer-sheets page and fixed UFA re-sign skip bug.** The offer sheets page was merged into the Armchair GM offseason flow instead of being a separate route. Fixed a bug where skipping a UFA re-sign would break the flow. Touched `app/offer-sheets/page.tsx` (removed), `app/components/ResignPhase.tsx`, and 4 other files.
- 2026-06-28: **Added JS-based scroll snap for newspaper-to-viewport alignment.** The newspaper-on-desk home page now snaps cleanly to viewport edges during scroll, giving a polished page-turning feel. Touched `app/page.tsx`, `app/globals.css`.
- 2026-06-28: **Achieved 60 FPS scroll performance on home page (was 16 FPS).** Moved heavy CSS effects (box shadows, transforms) off the compositor path, replaced scroll-triggered repaints with GPU-composited layers, and reduced paint complexity. Touched `app/page.tsx`, `app/globals.css`.
- 2026-06-28: **Capped trade panel asset list height to prevent excessive page scrolling.** Long asset lists in trade panels now have a max-height with internal scroll, keeping the overall page layout manageable. Touched `app/components/TradePanel.tsx`.
- 2026-06-28: **Mobile styling adjustments.** Various mobile-specific layout fixes. Touched `app/globals.css`.
- 2026-06-26: **Added RFA offer sheet phase to Armchair GM offseason flow.** After the Re-Sign phase, teams now enter an RFA offer sheet phase where they can match or let walk restricted free agents, with CBA Article 10.3 compensation pick tiers displayed. Extended draft pick generation to include 2029-2030 rounds for offer sheet compensation. Touched `app/components/OfferSheetPhase.tsx` (new), `app/components/ResignPhase.tsx`, `app/armchair-gm/page.tsx`, `app/api/league/route.ts`, `app/lib/free-agency.ts`.
- 2026-06-26: **Added RFA offer sheet page and extended draft picks to 2029-2030.** Standalone offer sheet page for RFA scenarios. Extended the generated draft pick inventory from 2027-2029 to 2027-2030 so offer sheet compensation picks in the 4th and 5th years are available. Touched `app/offer-sheets/page.tsx` (new), `app/api/league/route.ts`, and 4 other files.
- 2026-06-26: **Reduced scroll animation jank by moving shadow off the compositor.** The newspaper-stack shadow effect was causing repaint storms on scroll. Moved it to a GPU-composited pseudo-element. Touched `app/globals.css`.
- 2026-06-26: **Exaggerated newspaper stack with 7 visible page layers and loose sheets.** The home page desk effect now shows 7 stacked newspaper pages with slight rotation/offset for a more dramatic broadsheet effect. Touched `app/page.tsx`, `app/globals.css`.
- 2026-06-26: **Restored scroll-driven newspaper weight, removed floating cards and glass.** Reverted the hero entrance from framer-motion floating cards and glass accents back to the pure-CSS newspaper-on-desk scroll reveal that users preferred. Touched `app/page.tsx`, `app/globals.css`.
- 2026-06-26: **Fixed LedgerToaster and motion hydration mismatches.** Deferred portal rendering and motion component mounting to after hydration to prevent React hydration warnings from server/client HTML mismatches. Touched `app/components/LedgerToaster.tsx`, `app/page.tsx`.
- 2026-06-26: **Added premium hero entrance animations with staggered fade-up and floating glass accents.** Initial framer-motion hero animation attempt with staggered reveals and glass-morphism cards. Later reverted in favor of pure-CSS newspaper approach. Touched `app/page.tsx`, `app/globals.css`, `package.json`, `package-lock.json`.
- 2026-06-25: **Admin: repainted Contract Admin to the light-paper theme.** The admin contracts page now uses the newspaper/ledger aesthetic instead of the old dark-mode styling. Touched `app/admin/contracts/page.tsx`.
- 2026-06-25: **Draft Night: sign selections to a 3-year ELC so rookies join rosters.** After the draft simulation, each selected prospect is automatically signed to a 3-year entry-level contract and added to their drafting team's roster as a tradeable asset. Added `app/lib/draft-rookies.ts` (new) for `draftedRookieAssets()` conversion. Touched `app/lib/draft-rookies.ts`, `app/components/DraftNight.tsx`, `app/armchair-gm/page.tsx`.
- 2026-06-25: **Draft Night: source first-round pick order from official NHL data.** Added `scripts/build-draft-board.ts` to fetch the 2026 first-round pick order from the NHL API. Added `app/data/draft-2026.json` (32 picks with team/originalTeam), `app/lib/draft-2026.ts` (DRAFT_2026_ORDER + hand-curated DRAFT_2026_PROSPECTS board of 32 ranked prospects with stats), and `app/components/DraftNight.tsx` (interactive draft simulation with PICK MODE + LOG MODE). Touched `scripts/build-draft-board.ts` (new), `app/data/draft-2026.json` (new), `app/lib/draft-2026.ts` (new), `app/components/DraftNight.tsx` (new).
- 2026-06-25: **Home page CSS styling iterations.** Multiple commits adjusting the newspaper-on-desk home page feel — changed shadows, perspectives, and layer positioning to feel more 2D/flat paper. Touched `app/page.tsx`, `app/globals.css`.
- 2026-06-29: **Redesigned STRAND helix to pure z-order 3D crossover with no breaks.** Went through 5 iterations based on user feedback: (1) replaced crossover gap effect with section-based 3D helix depth rendering in `StrandDisplay.tsx` and `TeamStrand.tsx`; (2) removed node dots/circles — switched from individual `<line>` segments to continuous `<path>` elements to eliminate visible junction dots; (3) tried knockout border technique for depth separation, but user's GF didn't like the visible breaks; (4) removed knockout layer entirely — final approach uses pure z-order layering (back sections render first at opacity 0.9/strokeWidth 2.5, front sections render on top at same weight), no breaks, no opacity dimming. Crossing positions calculated as `W * (1 + 2k) / (4 * sineMultiplier)`. `cos(θ)` at section midpoint determines which strand is in front. (5) Increased label offsets from strand lines to prevent overlap (StrandDisplay: 10→18px above, 14→20px below; TeamStrand: 8→14px above, 14→18px below). Touched `app/components/StrandDisplay.tsx`, `app/components/TeamStrand.tsx`.
- 2026-06-25: **Orthogonal backend — the `players` table is the single source of truth for contract + FA facts.** Replaced the five-layer read-time merge (NHL API → CapWages scrape → `contracts.bundled.json` → `free-agent-seed.ts` → DB `fa_overrides`, resolved on every roster assembly) with a clean join: `rostered players ⨝ DB contract row ⨝ live stats`. Reads no longer scrape — so test and live environments resolve identical data. Ingestion is now write-time only. **Schema:** `players` gains `expiry_status`, `expiry_year`, `exclude_from_roster`, `source` (`seed`|`sync`|`editor`). **Seed:** committed `app/data/league-seed.json` (build with `npm run build:seed` from bundled.json + the 2026 FA seed); `seedPlayersTable()` loads it idempotently, auto-seeds an empty table, reseeds on admin reset, and never clobbers `source='editor'` rows. **Read:** `loadContracts()` → `loadContractsFromDB()` in `roster-assembly.ts` (DB-only; bundled.json kept only as a hard DB-error fallback); FA status derives from stored facts via the new pure `deriveContractStatus()`; `excludeFromRoster` removes a player; `contractMissing` flags placeholder deals. **Write:** Sync (`PUT /api/admin/contracts`) stamps `source='sync'`, skips editor rows, and only fills a NULL expiry (curated FA marks survive a refresh); the editor (`POST`) stamps `source='editor'`; `POST /api/admin/seed` = Load Baseline; `POST /api/admin/fa-bulk` = bulk FA class onto player rows. **Admin:** Contract Admin shows provenance + FA, edits FA/expiry/exclude inline, and adds Load Baseline / Sync Live / Needs-data filter / Bulk Free Agents; the old `fa-overrides` page is a signpost (the `fa_overrides` table is left in place but unused by reads). The Nyquist 2026-UFA fix now lives in the seed as data. Tests: `__tests__/league-seed.test.ts`, `__tests__/derive-contract-status.test.ts`, updated `league-players-route` (table-aware DB mock) and source canaries. Touched `app/db/schema.ts`, `app/db/ensure-schema.ts`, `app/lib/roster-assembly.ts`, `app/lib/league-seed.ts`, `app/lib/trade-types.ts`, `scripts/build-league-seed.ts`, `app/api/admin/{contracts,seed,fa-bulk,reset}/route.ts`, `app/admin/contracts/page.tsx`, `app/admin/fa-overrides/page.tsx`. NOTE: contracts are Redis-cached 23h — clear the contracts/league cache from admin after a sync/seed/edit for changes to take effect on a warm cache.
- 2026-06-24: Fixed the "league-minimum 1-year" phantom contract (WPG Gustav Nyquist showed $0.93M/1yr instead of his real $3.25M/1yr). Root cause: `loadFromDB()` only falls back to `contracts.bundled.json` when the entire DB read throws — bundled was never a *per-player* fallback. So a player missing from both the live CapWages scrape (which 403s datacenter IPs and drops players in the off-season) and the synced `players` table had no contract match (`fin` null) and the build loop applied its `fin?.capHit ?? 0.925` / `?? 1` placeholder, ignoring his known bundled deal. Fix: fold `contracts.bundled.json` into `loadContracts()` as a lowest-priority per-player fallback (below DB and scrape, keyed by base name so the loop's `CONTRACTS[p.name]` lookup hits it) — players absent from scrape and DB now get their last-known curated contract instead of the placeholder. Verified Nyquist resolves to 3.25/1 against the real bundled file; all 332 tests green. Touched `app/lib/roster-assembly.ts`. NOTE: contracts are Redis-cached 23h — clear the contracts/league cache from admin Settings for the fix to take effect on an already-warm cache.
- 2026-06-24: Fixed the empty off-season free-agent list with a curated 2026 FA seed. Root cause: in the off-season the live CapWages scrape (`/players/active`) does not reliably surface 2026-expiring contracts — once free agency rolls over, active rows show the next deal (2027+ expiry) or drop the player entirely, and CapWages also 403s datacenter IPs — so no contract reaches roster assembly with `expiryYear <= 2026` and auto-detection finds zero pending FAs. An admin DB reset + re-sync makes it worse: the `loadFromDB` backfill that marked dropped players as 2026 UFAs loses its rows, and the re-sync only re-adds players the scrape still lists. Added `app/lib/free-agent-seed.ts` (the 2026 UFA/RFA class from the PuckPedia list in TASKS.md — 30 UFA + 25 RFA, matched case/accent-insensitively) and wired it into `assembleCanonicalRoster` as the lowest-precedence FA marker: DB `fa_overrides` win, then live scrape, then the seed fills the rest. Seed-marked players get `expiresThisOffseason=true`, `capHit=0`, status UFA/RFA so the Re-Sign phase populates out of the box and survives resets. Added `__tests__/free-agent-seed.test.ts`. Touched `app/lib/free-agent-seed.ts`, `app/lib/roster-assembly.ts`, `__tests__/free-agent-seed.test.ts`.
- 2026-06-24: Fixed FA overrides so any player can be forced into the off-season free-agent pool — previously the `/admin/fa-overrides` form only let you select from a dropdown of existing DB `players` rows, and the POST route 400'd (`"Selected player was not found in the DB"`) for anyone not already curated in that table. Live-scraped free agents (e.g. Alex Tuch) are never written to the `players` table, so they could not be forced into the pool — the exact case S1.5 was built for. Now the POST enriches from the DB players table when the id matches but no longer requires it (override is matched by id OR name during roster assembly), and the admin form takes a free-text PLAYER NAME input with the DB dropdown demoted to an optional name pre-fill. Note: the related "Alex Tuch stuck at 1yr/$0.93M" symptom is a polluted DB row — `app/api/admin/contracts` POST inserts a placeholder with `capHit ?? 0.925` (displays $0.93M) and `yearsRemaining ?? 1` for brand-new players; forcing Tuch UFA via the fixed override zeroes that cap and flags him expiring, so he surfaces correctly in the FA list (or delete the stray row via the contracts page Clear action). Touched `app/api/admin/fa-overrides/route.ts`, `app/admin/fa-overrides/page.tsx`.

<!-- ============================================================ -->
<!-- HANDOFF — 2026-06-24 — DB 500 investigation (for Codex)       -->
<!-- ============================================================ -->

## 2026-06-24 — DB 500 handoff

Today's work added two new DB tables and several routes that read/write them.
There is a reported **500 error involving the database**. This section documents
everything changed today and the most likely culprits so it can be triaged
without re-deriving context.

### Most likely root cause (start here)
The two new tables — **`draft_pick_overrides`** and **`fa_overrides`** — were added
to `app/db/schema.ts` and are provisioned **only** by the runtime DDL helper
`ensureNewTables()` in `app/db/ensure-schema.ts` (which runs
`CREATE TABLE IF NOT EXISTS …`). **Unlike every prior table, no committed
`drizzle/*.sql` migration file was generated for them.** Compare:
- `trades`            → `drizzle/0002_add_trades.sql` ✅
- player retirement   → `drizzle/0001_add_player_retirement.sql` ✅
- `roster_mutating`   → `drizzle/0003_add_trade_roster_mutating.sql` ✅
- `draft_pick_overrides` / `fa_overrides` → **no migration file** ❌ (runtime DDL only)

So if production Turso is provisioned via `drizzle-kit push` / applied migrations
at deploy (not via the runtime `ensure*` safety net), the two new tables will be
**missing**, and any query against them throws `no such table: draft_pick_overrides`
(or `fa_overrides`) → 500.

**Suspected fix:** generate the missing migration so the tables exist in Turso the
same way the others do:
```
npm run db:generate   # drizzle-kit generate → emits drizzle/0004_*.sql
npm run db:push        # or apply via the deploy migration step
```
Then confirm both tables exist in the Turso instance. The runtime
`ensureNewTables()` should still serve as the local/dev safety net.

### Why some paths 500 and others don't
`ensureNewTables()` is **memoized per DB instance via a WeakMap**, and on failure it
`cache.delete()`s so a later call can retry. The reads are wrapped defensively in
different ways — this asymmetry explains why only *some* surfaces 500:

| Caller | File | On table-missing |
|---|---|---|
| League route pick merge | `app/api/league/route.ts` (~250) | `try/catch` → falls back to default picks (no 500) |
| Roster assembly FA overrides | `app/lib/roster-assembly.ts` (~987) | `try/catch` → skips overrides (no 500) |
| Admin draft-picks GET/PUT/DELETE | `app/api/admin/draft-picks/route.ts` | `catch` returns **500** with `{error}` |
| Admin fa-overrides GET/POST/DELETE | `app/api/admin/fa-overrides/route.ts` | `catch` returns **500** with `{error}` |

So the **admin pages** (`/admin/draft-picks`, `/admin/fa-overrides`) are the most
likely place a user sees a 500; the public league/roster paths degrade silently.
Check the server log for the exact thrown message — the routes `console.error`
with a `[admin/draft-picks …]` / `[admin/fa-overrides …]` prefix.

### Secondary things to verify
1. **Multi-line `CREATE TABLE` via `db.run(sql.raw(...))`** — `NEW_TABLE_STATEMENTS`
   in `ensure-schema.ts` are multi-line strings. libSQL accepts these, but confirm
   the Turso driver doesn't choke on the formatting vs. the single-line ALTERs.
2. **`onConflictDoUpdate`** is used in both admin write routes. Verify the libSQL
   dialect supports the emitted `ON CONFLICT … DO UPDATE` for these tables.
3. **WeakMap memoization of a rejected promise** — if the very first
   `ensureNewTables()` call throws for a transient reason, the catch deletes the
   cache entry, so this should self-heal; but if the table-create silently
   "succeeds" against the wrong DB file (dev `file:local.db` vs Turso), the memo
   masks the real target. Confirm `DATABASE_URL` / `DATABASE_AUTH_TOKEN` are set in
   the failing environment (`app/db/client.ts` falls back to `file:local.db`).

### Full inventory of today's changes (2026-06-24)
**S1 (committed earlier today/prior, context):** FA detection keys on `expiryYear`
(authoritative) instead of floored `yearsRemaining` — `app/services/scraper.ts`
surfaces `expiryYear` from CapWages `row[29]`; `app/lib/roster-assembly.ts` derives
`expiresThisOffseason` / `contractStatus` from it.

**S1.75 — draft pick DB ownership** (commit `ad1207b`):
- `app/db/schema.ts`: new `draftPickOverrides` table (`id` = `pick-{origOwner}-{year}-{round}`,
  `currentOwnerId`, `originalOwnerId`, `round`, `year`, `isProtected`, `conditions`, `updatedAt`).
  Stores **only moved picks** (exceptions); the natural 480-pick set is still generated at runtime.
- `app/db/ensure-schema.ts`: `ensureNewTables()` + `NEW_TABLE_STATEMENTS` `CREATE TABLE IF NOT EXISTS`.
- `app/api/admin/draft-picks/route.ts`: GET (merged default+override list), PUT (upsert/auto-reset
  when owner == original & no flags), DELETE (reset to default). All `requireAdmin`-gated.
- `app/admin/draft-picks/page.tsx`: full pick board, team/year/round filters, "moved only" toggle,
  inline transfer modal.
- `app/api/league/route.ts`: generates all 480 picks by original owner, applies override
  `currentOwnerId`; pick valuation still uses the **original** team's standing (the real draft slot);
  label shows "via {origTeam}" when moved.

**S1.5 — FA override admin** (commit `ad1207b`):
- `app/db/schema.ts`: new `faOverrides` table (`id` = name slug, `playerName`, `teamSlug`,
  `forceStatus` ∈ {UFA,RFA,SIGNED,EXCLUDE}, `season`, `notes`, `updatedAt`).
- `app/api/admin/fa-overrides/route.ts`: GET / POST (upsert, validates `forceStatus`) / DELETE.
- `app/admin/fa-overrides/page.tsx`: add/remove overrides by name; status badge; notes.
- `app/lib/roster-assembly.ts`: loads overrides **after** the trade-block `db.select()` (ordering
  matters — the `league-players-route.test.ts` mock counts `selectCall`), applies them before
  dedup; `EXCLUDE` filters the player out of all rosters entirely.

**S1.25 — RFA offer-sheet compensation** (commit `ad1207b`):
- `app/lib/free-agency.ts`: `getOfferSheetCompensation(aavMillions)` → CBA Art. 10.3 pick tiers.
- `app/components/ResignPhase.tsx`: market RFAs show amber "Offer sheet · picks owed" + "Offer Sheet" button.

**Nav/docs:** `app/admin/layout.tsx` (+PICKS, +FREE AGENTS links); `docs/TASKS.md`
(S1.25/S1.5/S1.75 checked off). Gates at commit time: 321 tests pass, `tsc --noEmit` clean.

<!-- ============================================================ -->

- 2026-06-24: Fixed expired CapWages contracts so UFA/RFA players with `expiryYear` at the projected season start are surfaced as pending free agents with zero active cap charge/years instead of a fake one-year league-minimum deal; touched `app/lib/roster-assembly.ts`, `__tests__/league-players-route.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/DEVNOTES.md`.
- 2026-06-24: Fixed post-reset CapWages sync by creating/seeding canonical `teams` rows before contract sync and changing admin reset to clear only team override columns instead of deleting team identities referenced by `players.team_id`; touched `app/db/ensure-schema.ts`, `app/api/admin/contracts/route.ts`, `app/api/admin/reset/route.ts`, `__tests__/feature-canaries.test.ts`, `docs/DEVNOTES.md`.
- 2026-06-24: Fixed post-reset `/api/admin/contracts` recovery by adding a runtime `players` base-table safety net before contract admin reads/writes, so an empty local/reset DB returns an empty contracts list and can sync CapWages back in; touched `app/db/ensure-schema.ts`, `app/api/admin/contracts/route.ts`, `__tests__/feature-canaries.test.ts`, `docs/DEVNOTES.md`.
- 2026-06-24: Standardized admin operations by adding a guarded Settings hard reset that clears mutable admin DB state back to CapWages/NHL roster scrape defaults, optionally deletes saved Docket trades, clears all live caches, and updates the dashboard to include Picks and Free Agents; touched `app/api/admin/reset/route.ts`, `app/admin/settings/page.tsx`, `app/admin/page.tsx`, `__tests__/admin-auth.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/DEVNOTES.md`.
- 2026-06-24: Prevented manual contract DB edits from persisting new players with `position: "Unknown"` by requiring position on manual inserts, adding position controls to the admin add/edit flows, and adding a canary for the position payload; touched `app/api/admin/contracts/route.ts`, `app/admin/contracts/page.tsx`, `__tests__/feature-canaries.test.ts`, `docs/DEVNOTES.md`.
- 2026-06-24: Changed FA overrides from name-only manual entry to DB-player selection by storing `fa_overrides.player_id`, returning selectable DB players from the admin route, applying overrides by player id before legacy name fallback, and covering Alex Tuch-style id-backed UFA forcing; touched `app/db/schema.ts`, `app/db/ensure-schema.ts`, `drizzle/0005_add_fa_override_player_id.sql`, `app/api/admin/fa-overrides/route.ts`, `app/admin/fa-overrides/page.tsx`, `app/lib/roster-assembly.ts`, `__tests__/league-players-route.test.ts`, `docs/DEVNOTES.md`.
- 2026-06-24: Added the missing Drizzle migration for `draft_pick_overrides` and `fa_overrides` so deployed DBs provision the admin draft-pick and FA override tables instead of relying only on runtime DDL; also fixed the new admin routes to await the shared admin gate and keep helper exports out of Next route modules; touched `drizzle/0004_add_pick_and_fa_overrides.sql`, `app/api/admin/draft-picks/route.ts`, `app/api/admin/fa-overrides/route.ts`, `docs/DEVNOTES.md`.
- 2026-06-24: Completed S1.75 (draft pick DB ownership), S1.5 (FA override admin), and S1.25 (RFA offer-sheet compensation). S1.75 adds a `draft_pick_overrides` table and admin board at `/admin/draft-picks` — all 480 picks (32 teams × 3 years × 5 rounds) are shown with their original/current owner; transfers persist to DB and the league route merges overrides at runtime so the trade machine reflects real-life pick moves without touching the runtime generation logic. S1.5 adds a `fa_overrides` table and admin panel at `/admin/fa-overrides` — admins can force any player's free-agent status (UFA/RFA/SIGNED/EXCLUDE) by name to fix CapWages scraper misdetections (e.g. Alex Tuch); EXCLUDE removes a player from rosters entirely. S1.25 adds `getOfferSheetCompensation(aav)` to `free-agency.ts` implementing the seven CBA Article 10.3 tiers (none → 4×1st); the ResignPhase market panel now shows an amber "Offer sheet · picks owed" warning and re-labels the Sign button to "Offer Sheet" for RFAs. Admin nav extended with PICKS and FREE AGENTS links. FA override loading is sequenced after the trade block DB select to preserve the test mock's selectCall ordering. All 321 tests pass; `tsc --noEmit` clean. Touched `app/db/schema.ts`, `app/db/ensure-schema.ts`, `app/api/admin/draft-picks/route.ts`, `app/api/admin/fa-overrides/route.ts`, `app/admin/draft-picks/page.tsx`, `app/admin/fa-overrides/page.tsx`, `app/admin/layout.tsx`, `app/api/league/route.ts`, `app/lib/roster-assembly.ts`, `app/lib/free-agency.ts`, `app/components/ResignPhase.tsx`.
- 2026-06-23: Added a roster-overlay confirmation modal before mutating Docket publishes and cleared league/team caches after Docket trade save, publish, or delete so UI-only corrections and deletions take effect cleanly; touched `app/admin/trades/page.tsx`, `app/api/admin/trades/route.ts`, `__tests__/feature-canaries.test.ts`, `docs/DEVNOTES.md`.
- 2026-06-23: Added admin Docket saved-trade deletion with a guarded API route, data-layer delete helper, saved-list delete button, and regression coverage; touched `app/lib/trades.ts`, `app/api/admin/trades/route.ts`, `app/admin/trades/page.tsx`, `__tests__/trades-data.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/DEVNOTES.md`.
- 2026-06-23: Updated admin Docket ingestion so current asset-source teams are independent from historical traded-from teams, allowing already-updated DB trades to be captured accurately; touched `app/admin/trades/page.tsx`, `app/components/TradePanel.tsx`, `__tests__/feature-canaries.test.ts`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket D2.5/D3 by adding a homepage Docket card and server-side today re-grades that enrich public Docket entries with current NAV/verdicts while preserving frozen at-trade snapshots; touched `app/page.tsx`, `app/docket/page.tsx`, `app/docket/DocketClient.tsx`, `app/lib/docket-view.ts`, `app/lib/docket-today.ts`, `__tests__/feature-canaries.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket D2 by adding expanded public Docket entries with the frozen verdict panel, per-asset at-trade NAV/impact detail, STRAND rendering, development outlooks, pick-curve NAV notes, and trade conditions; touched `app/docket/DocketClient.tsx`, `app/lib/docket-view.ts`, `__tests__/docket-view.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket D1 by adding a public `/docket` page with published-trade list/filter/sort controls, NAV-margin chips, package summaries, and Docket view-model tests while leaving live today re-grades for D3; touched `app/docket/page.tsx`, `app/docket/DocketClient.tsx`, `app/lib/docket-view.ts`, `app/components/Header.tsx`, `__tests__/docket-view.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket C4 by adding a persisted UI-only trade mode that lets published Docket entries skip roster and cap overlays while remaining visible in admin trade management; touched `app/db/schema.ts`, `drizzle/0003_add_trade_roster_mutating.sql`, `app/lib/trades.ts`, `app/api/admin/trades/route.ts`, `app/admin/trades/page.tsx`, `app/lib/roster-assembly.ts`, `__tests__/trades-data.test.ts`, `__tests__/trade-overlay.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket C3 by adding admin trade list/edit/publish/unpublish controls and making published overlays skip already-reconciled scrape moves for cap purposes; touched `app/api/admin/trades/route.ts`, `app/admin/trades/page.tsx`, `app/lib/trades.ts`, `app/lib/roster-assembly.ts`, `__tests__/trades-data.test.ts`, `__tests__/trade-overlay.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket C2 by deriving retained-salary cap moves from published trade snapshots and merging them into canonical roster team cap-space assembly while leaving untraded teams unchanged; touched `app/lib/roster-assembly.ts`, `__tests__/trade-overlay.test.ts`, `__tests__/league-players-route.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket C1 by applying ordered published trade overlays inside canonical roster assembly so moved players read on their new teams app-wide without mutating source rows; touched `app/lib/trades.ts`, `app/lib/roster-assembly.ts`, `__tests__/trades-data.test.ts`, `__tests__/trade-overlay.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket B3 by adding a gated admin trade-ingestion page that reuses the trade-machine asset pickers for teams, players, picks, and retention, previews grades through the evaluate API, and saves unpublished frozen trade drafts through a new admin route; touched `app/admin/trades/page.tsx`, `app/api/admin/trades/route.ts`, `app/api/evaluate/route.ts`, `app/admin/page.tsx`, `__tests__/feature-canaries.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket A3b by exposing cap-delta-adjusted teams from canonical roster assembly and routing Armchair GM preview/executed trade cap math through the shared helper; touched `app/lib/cap-delta.ts`, `app/lib/roster-assembly.ts`, `app/api/league/route.ts`, `app/armchair-gm/page.tsx`, `__tests__/cap-delta.test.ts`, `__tests__/feature-canaries.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket A2A by extracting canonical roster assembly into `app/lib/roster-assembly.ts`, thinning both league routes to response shaping, and repointing source canaries to the module; touched `app/lib/roster-assembly.ts`, `app/api/league/route.ts`, `app/api/league/players/route.ts`, `__tests__/feature-canaries.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/TASKS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket B2 by adding save-time trade freezing for locked verdicts, per-asset `navAtTrade`, input snapshots, and at-trade grades with an immutability regression test; touched `app/lib/trades.ts`, `__tests__/trades-data.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/TASKS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Completed The Docket B1 by adding the `trades` table schema/migration, a typed trade persistence helper, and a round-trip test for frozen asset input snapshots; touched `app/db/schema.ts`, `drizzle/0002_add_trades.sql`, `app/lib/trades.ts`, `__tests__/trades-data.test.ts`, `docs/futures/FUTURECONCEPTS.md`, `docs/TASKS.md`, `docs/DEVNOTES.md`.
- 2026-06-23: Synced The Docket future plan checklist with the already-completed A3a cap-delta helper; touched `docs/futures/FUTURECONCEPTS.md`, `docs/DEVNOTES.md`.
- 2026-06-22: Fixed the real Colton Parayko reading NAV -34 — the R3 shutdown-D floor only engaged when shutdownDSignal>0, but his live inputs (QoC 76 vs the 78 gate, current DPS 3.4 blended under 3.3 by a lower multi-season baseline, no pairDriver/xgaRel signal) fell through every gate so no floor applied. Lowered the QoC gate 78->74 so a genuine 22+ TOI top-pair shutdown D clears it (~+130), and added a regression test built from his actual card profile (blended DPS <3.3 + QoC 76) that the old code would have failed; touched `app/lib/xnav-engine.ts`, `__tests__/xnav.test.ts`, `docs/DEVNOTES.md`.
- 2026-06-22: Completed 1c by adding mocked `/api/league/players` roster-assembly tests for live duplicate dedupe, DB-row augmentation without duplication, and stat attachment; touched `__tests__/league-players-route.test.ts`, `docs/TASKS.md`.
- 2026-06-22: Completed A3a by adding a pure `applyCapDelta` helper and characterization tests for straight swaps, retained-salary moves, and pick-only moves; touched `app/lib/cap-delta.ts`, `__tests__/cap-delta.test.ts`, `docs/TASKS.md`.
- 2026-06-22: Completed A4 by adding reversible player retirement flags, a contracts-admin Retire/Restore action, cache invalidation, and retired-player filtering in both league roster routes; touched `app/db/schema.ts`, `drizzle/0001_add_player_retirement.sql`, `app/api/admin/contracts/route.ts`, `app/admin/contracts/page.tsx`, `app/api/league/route.ts`, `app/api/league/players/route.ts`, `__tests__/feature-canaries.test.ts`, `docs/TASKS.md`.
- 2026-06-22: Completed A3 admin endpoint cleanup by dropping unsupported trade-block `blocked` status, adding direct contract POST cap/term bounds, and documenting guarded curl-only admin endpoints; touched `app/api/admin/trade-block/route.ts`, `app/api/admin/contracts/route.ts`, `docs/admin-endpoints.md`, `__tests__/feature-canaries.test.ts`, `docs/TASKS.md`.
- 2026-06-22: Removed dead superseded admin team editor files; touched `app/admin/AdminTeamRow.tsx`, `app/admin/actions.ts`, `docs/TASKS.md`.
- 2026-06-22: Fixed admin mutation error handling so failed writes show server errors and skip optimistic success/reloads; touched `app/admin/admin-response.ts`, `app/admin/settings/page.tsx`, `app/admin/contracts/page.tsx`, `app/admin/teams/page.tsx`, `app/admin/trade-block/page.tsx`, `docs/TASKS.md`.
- 2026-06-22: Closed admin auth with signed httpOnly session login, fail-closed admin API gates, and `/admin/*` middleware; touched `app/lib/admin-auth.ts`, `app/admin/login/page.tsx`, `middleware.ts`, `app/api/admin/*/route.ts`, `__tests__/admin-auth.test.ts`, `docs/TASKS.md`.
- 2026-06-22: Updated admin login for GitHub Codespaces forwarded URLs by replacing the Server Action form with `/admin/login/submit`, avoiding the localhost vs `*.app.github.dev` origin mismatch; touched `app/admin/login/page.tsx`, `app/admin/login/submit/route.ts`, `middleware.ts`.
- 2026-06-22: Reframed the sim from a "2025-26 season-start replay" to a forward "2026-27 season projection" (the engine was already a forward projection, not a schedule replay — only framing changed). Updated `simulationMode`/`rosterMoveWindow` in season-config; rewrote the Claude prompt to recap the PROJECTED 2026-27 season while keeping 2025-26 as the completed reference (CAR champion); kept the 2025-26 data baseline (MoneyPuck `2025` stats + `20252026` rosters) since 2026-27 hasn't been played. Also fixed two latent bugs surfaced en route: `CapProjection` hardcoded a 95.5 cap (now `SEASON.capCeiling`) and `QuickTradeMachine` hardcoded `season:"2025-26"` (now `SEASON.label`); parameterized the four hardcoded MoneyPuck CSV URLs to `SEASON.mpSeason`. Touched `app/lib/season-config.ts`, `app/api/claude/route.ts`, `app/api/simulate/route.ts`, `app/components/CapProjection.tsx`, `app/components/QuickTradeMachine.tsx`, `app/api/league/route.ts`, `app/api/league/players/route.ts`, and `docs/DEVNOTES.md`.

- 2026-06-22: Fixed Armchair GM depth-chart cells overlapping after the 8px→11px font bump by keeping player names at 11px while dropping the secondary metrics (NAV, position badge, P82/TOI meta) to 9px and adding overflow guards (minWidth:0, flexShrink:0 on fixed labels, ellipsis on meta, overflow:hidden on the cell); applied the matching name-11px/position-9px hierarchy to the read-only LineupCard; touched `app/components/LineupEditor.tsx`, `app/components/LineupCard.tsx`, and `docs/DEVNOTES.md`.
- 2026-06-22: Corrected league team cap space that summed every DB contract row (no active-roster bound / LTIR / burial accounting), which overstated used cap and pushed teams negative (Jets -7M) and reversed Decision A; reverted to the curated static TEAMS_DB room shifted by the live ceiling delta (capCeiling − 95.5) so the 2026-27 ceiling raises every team's room (Jets → 13.5M) without a naive recompute, leaving `buildTeamCapSpaceMap` in `cap-settings.ts` for the future A3a delta work; touched `app/api/league/teams/route.ts`, `__tests__/feature-canaries.test.ts`, and `docs/DEVNOTES.md`.
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
