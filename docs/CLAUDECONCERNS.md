# Claude Concerns — review findings & tech debt

Generated 2026-06-30 from a full codebase review. Items are ranked by impact.
Promote to `docs/TASKS.md` when ready to act.

---

## Architecture

### [ ] CC1 — Armchair GM page is 2,790 lines
`app/armchair-gm/page.tsx` is a single `"use client"` component owning trade execution,
offseason orchestration, lineup state, draft night, re-sign phase, offer sheets, simulation
dispatch, cap math, share URLs, and all their UI. Every new feature makes this file harder
to change safely. The S1/S2 offseason bugs were hard to fix *because* of this file's size.
Suggested split: extract `useOffseasonFlow`, `useTradeExecution`, `useSimDispatch` hooks
and break the render into composable sub-components.

### [x] CC2 — External data fragility (CapWages + MoneyPuck)
**Mitigated.** Six divergent `makeId()` implementations (some missing NFD normalization)
replaced with a single `makePlayerId()` in `player-identity.ts`. Duplicate `slugify()` in
`roster-assembly.ts` replaced with shared `canonicalNameSlug`. Added `NAME_ALIASES` map for
known cross-source name variants (Alex/Alexander Ovechkin, Dmitriy/Dmitri Simashev). Fixed
name duplicates in `contracts.bundled.json` and `league-seed.json`. Removed "Jake Zibanejad"
typo from `player-data.ts`. Added error logging to 7 silent `catch (_) {}` blocks (MoneyPuck
CSV fetch, baseline loads, standings API, CapWages scrapes, DB queries). Created
`/api/admin/health` endpoint that probes all five data sources (DB, NHL API roster, NHL API
stats, MoneyPuck CSV, CapWages HTML) plus static baselines. Removed vestigial empty
`contracts.data.json`. The full fix (owned xG pipeline) remains in FUTURECONCEPTS.md.

### [ ] CC3 — `evaluate/route.ts` `runGmLogic` is 763 lines
Similar to CC1 but on the API side. 50+ flag checks in one function. Extract into
category-specific helpers (`checkCapViolations()`, `checkRosterDepth()`, `checkClauses()`).

---

## Codex Audit Follow-ups (from docs/CODEXAUDIT.md)

### [ ] CC4 — Cache invalidation misses cap-specific keys
Some admin mutations clear the base `cache:trade:teams:v1` key but miss cap-variant keys
like `cache:trade:teams:v1:cap:104.0`. `team-cache.ts` centralisation helps but needs
rollout across all admin routes. (CODEXAUDIT #2)

### [ ] CC5 — Admin auth canary does not auto-discover routes
`__tests__/admin-auth.test.ts` hardcodes a route list. Newer admin routes (`draft-picks`,
`fa-bulk`, `fa-overrides`, `trades`) are missing. Replace with filesystem-driven scan.
(CODEXAUDIT #4)

### [ ] CC6 — Deprecated FA override API writes to unused table
`/api/admin/fa-overrides` still implements full CRUD for the old `fa_overrides` table that
nothing reads. Either retire with a 410 or repoint to `players` table fields. (CODEXAUDIT #5)

### [ ] CC7 — Dead `ContractSyncer` component
`app/components/ContractSyncer.tsx` fetches a non-existent `/api/contracts` route. Remove.
(CODEXAUDIT #6)

### [ ] CC8 — Contract Admin "editor to sync" reset flow
No UI/API path to revert `source='editor'` rows back to `source='sync'`. The modal's
CLEAR button condition is dead. Need explicit endpoint + bulk mode. (CODEXAUDIT #3)

---

## Production Hardening

### [ ] CC9 — `http://localhost` hardcoded in production API calls
`app/api/admin/trades/route.ts` and `app/lib/docket-today.ts` use
`new Request("http://localhost/api/evaluate", ...)` for internal calls. Breaks on
Vercel/any deployed environment. Use environment-aware URL construction.

### [ ] CC10 — No E2E tests for user-facing flows
24 test files with 351 tests cover the logic layer well, but zero component/E2E tests
for Armchair GM, trade machine, or players page. Playwright is in devDependencies but
unused. A few smoke tests would catch regressions the unit tests can't.

### [ ] CC11 — Redis fallback is bypassable under outage
When Redis goes down, the Claude rate limiter falls back to in-memory per-instance
limiting, which is trivially bypassed by distributed requests across serverless instances.
Consider fail-closed or persistent fallback.

### [ ] CC12 — Season config requires redeploy to roll over
`season-config.ts` is hardcoded to 2026-27. Each September requires a code change and
deploy. Consider storing season config in `site_settings` with hardcoded fallback.

### [ ] CC13 — Missing request payload size limits
`/api/evaluate` and `/api/simulate` accept large JSON arrays with no explicit size guard.
Next.js has built-in limits but explicit validation is safer.
