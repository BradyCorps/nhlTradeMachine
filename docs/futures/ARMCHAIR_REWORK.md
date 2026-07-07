# Armchair GM Rework — one step back, then the leap

Goal: the GM experience becomes iterable again. Fewer god-files, every
surface mobile-first and AA-readable, EDGE data driving both the sim
and what the user sees.

## Phase 1 — Decompose the monolith ✅ (2026-07-07)
page.tsx 3,221 → 1,985 lines. Extracted as real modules under
`app/armchair-gm/`: `SeasonResultsPager.tsx` (Ledger Line/League/Bracket),
`GmAnalysisTabs.tsx` (tab deck + TeamDNA + BreakdownTable + ModeBadge +
classifyTeam), `contention.ts` (ratings math + plum palette),
`CupRunDraftSummaryModal.tsx` (+ buildTradeCapMoves), `Screens.tsx`
(Loading/Error). Source canaries retargeted to the module set.

## Phase 2 — Decompose the main component ✅ (2026-07-07)
page.tsx 1,985 → 980 lines; `ArmchairGmPage` no longer owns the
lifecycle logic. Extracted:
- `useOffseasonFlow` — resolveLeagueOffseason effect + resign/walk/
  drop/sign/offer-sheet handlers + draft phase routing
- `useCupRunLifecycle` — run state, persistence, resume guard, the
  year-advance league rollover
- `useTradeBench` — executed trades, lineups, executeTrade (retention
  guard), resetTrades
- Components: `TeamSelectModal`, `MemoModal`, `CupRunResumePrompt`,
  `VerdictSheet`, `MatchResultsPanel` (owns the MATCH_FOLDERS taxonomy)
Hook-order cycles bridged with render-assigned refs read only in
handlers (`simDataRef`, `simControlsRef`, `onSeasonRolledRef`).
Source canaries retargeted to the module set.

## Phase 3 — Enhanced Draft Night & signing mode
- Draft Night (year 1) keeps the 2026 broadcast; years 2-3 get an
  interactive pick: when the user's slot comes up, choose from the top
  curated prospects remaining (best-32 pool already sorted by NHLe). ✅ (2026-07-07)
- Signing mode: market rows get NAV, EDGE luck chip, age-curve arrow,
  and a live cap bar; sortable by ask/NAV/age; AA type throughout. ✅ (2026-07-07)

## Phase 4 — EDGE everywhere
- Sim logic: `hdFinishingDelta` biases the single-season breakout roll
  in `/api/simulate` (rollover already consumes it). ✅ (2026-07-07)
- UI: EDGE tab on armchair AssetCards reusing `EdgeShotMap`. ✅ (2026-07-07)
- Team-level EDGE: aggregate OZ%/speed tiles on Team DNA. ✅ (2026-07-07)

## Phase 5 — Mobile + AA sweep ✅ (2026-07-07)
- Tap targets ≥ 44px on trade/lineup/sim controls; aria-labels on icon
  buttons; focus-visible rings; single-column trade flow under 640px;
  bottom-sheet verdict already exists — audit the rest. ✅ (2026-07-07)

Rules while reworking: every phase ships green (tsc + 424 tests +
build), no behavior changes inside a "decompose" phase, and new UI
follows the 9px floor / dark-agate standard.
