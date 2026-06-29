# Codex Code Audit - 2026-06-29

Scope: read `AGENTS.md`, `docs/DEVNOTES.md`, `docs/TASKS.md`, and audited the active app/API/admin paths while respecting `.codexignore`. No source files were changed.

Verification: not run. This was a no-code-change audit pass, so the suggested fixes below still need `npm run test` and `npx tsc --noEmit` when implemented.

## Findings

### 1. Draft-pick ownership overrides do not reach the main trade UI

Severity: high

Evidence:
- `app/api/admin/draft-picks/route.ts` persists ownership overrides in `draft_pick_overrides`.
- `app/api/league/route.ts:248-297` correctly loads `draftPickOverrides` and generates picks by original owner, applying `currentOwnerId`.
- The active UI loaders in Armchair GM, Players, and Quick Trade load picks from `/api/league/teams`, not `/api/league`.
- `app/api/league/teams/route.ts:183-225` generates picks directly from `LIVE_TEAMS`, sets `teamId` to the current team, and never reads `draftPickOverrides`.

Impact:
- Admin draft-pick moves can appear saved in `/admin/draft-picks` but not show up in the main trade-machine inventory.
- Pick valuation/name context is also weaker in `/api/league/teams` because it values and names picks from current generated team ownership rather than original owner plus override.

Suggested fix:
- Extract the pick-generation/override merge logic from `app/api/league/route.ts` into a shared helper, for example `app/lib/draft-pick-inventory.ts`.
- Use that helper from both `/api/league` and `/api/league/teams`.
- Add a route-level regression test proving an override like `pick-CGY-2027-1 -> WPG` appears under `teamId: "WPG"` with a `via CGY` label in the `/api/league/teams` payload.

### 2. Team/cache invalidation misses cap-specific team cache keys

Severity: medium-high

Evidence:
- `app/api/league/teams/route.ts:53-60` reads the trade teams cache through cap-specific keys like `cache:trade:teams:v1:cap:104.0`.
- `app/api/admin/teams/route.ts:11` and `app/api/admin/teams/route.ts:62-65` delete only `cache:league:teams:v1` and the base `cache:trade:teams:v1`.
- `app/api/admin/clear-cache/route.ts:17-33`, `app/api/admin/contracts/route.ts:84-90`, `app/api/admin/seed/route.ts:8-13`, `app/api/admin/fa-bulk/route.ts:16`, and `app/api/admin/reset/route.ts:27-39` have the same old base-key pattern.
- `app/api/admin/settings/route.ts` and `app/api/admin/trades/route.ts` already contain a better `teamCacheKey(capCeiling)` pattern.

Impact:
- Team phase/standing overrides, broad cache clears, contract syncs, seed loads, bulk FA edits, and admin resets can leave `/api/league/teams` serving an old cap-specific cached payload.
- The UI may appear unchanged after admin edits until Redis TTL expires or a different cap key is used.

Suggested fix:
- Centralize team cache key generation/clearing in one helper, reusing the pattern from `app/api/admin/trades/route.ts`.
- Have all admin mutations that affect team payloads clear the base keys plus `teamCacheKey(SEASON.capCeiling)`, `teamCacheKey(95.5)`, and the active `siteSettings.cap_ceiling` key.
- Add tests that specifically check `app/api/admin/teams/route.ts` and `app/api/admin/clear-cache/route.ts` clear cap-specific keys, not just the base key.

### 3. Contract Admin needs a real "editor back to sync" flow

Severity: medium-high

Evidence:
- Contract edits intentionally stamp rows as `source: "editor"` in `app/api/admin/contracts/route.ts:412-434`.
- Sync preserves editor provenance in `app/api/admin/contracts/route.ts:562-583`, so a hand-curated row stays protected.
- The modal's `CLEAR` button is gated by `row.adminYears != null || row.adminCap != null` in `app/admin/contracts/page.tsx:238-245`, but the API response currently sets `adminYears` and `adminCap` to `null` in `app/api/admin/contracts/route.ts:304-305`. In practice, the clear button is effectively dead for normal rows.
- The existing clear endpoint deletes the player row entirely in `app/api/admin/contracts/route.ts:394-397`, which is not the same as changing provenance back to sync.

Required note:
- We need an ability in the admin panel to switch all players from `editor` back to `sync`.

Impact:
- Bulk FA edits and manual contract edits can leave many rows permanently protected from live sync.
- The only backend "clear" path deletes rows, which risks removing the single-source-of-truth row until a later seed/sync recreates it.

Suggested fix:
- Add an explicit admin action such as `POST /api/admin/contracts/source-reset` or a new action on the existing contracts route.
- Support both per-player and bulk modes:
  - Per-player: set `source = "sync"` and optionally clear curated FA fields.
  - Bulk: switch all `source = "editor"` rows back to `sync`, with a confirmation prompt in Contract Admin.
- Decide whether reset should preserve or clear `expiryStatus`, `expiryYear`, and `excludeFromRoster`. If the goal is "fully trust sync again," clear curated FA fields too.
- Add tests for editor-row reset behavior and cache invalidation.

### 4. Admin auth canary does not cover newer admin routes

Severity: medium

Evidence:
- `__tests__/admin-auth.test.ts:61-74` hardcodes a route list for the "gates every admin API route" canary.
- Current admin routes such as `app/api/admin/draft-picks/route.ts`, `app/api/admin/fa-bulk/route.ts`, `app/api/admin/fa-overrides/route.ts`, and `app/api/admin/trades/route.ts` are not in that list.
- The audited routes currently do call `requireAdmin`, so this is a coverage gap rather than an active auth bypass.

Impact:
- Future changes could drop auth from a newer admin endpoint and this canary would still pass.

Suggested fix:
- Replace the hardcoded list with a filesystem-driven scan of `app/api/admin/**/route.ts`, excluding no routes unless explicitly documented.
- For each route module, count exported HTTP handlers and require the same count of `await requireAdmin(req)` calls.

### 5. Deprecated FA override API still writes to an unused table

Severity: medium-low

Evidence:
- `docs/DEVNOTES.md` says FA status now lives on the `players` table and the old `fa_overrides` table is unused by reads.
- `app/admin/fa-overrides/page.tsx` is a signpost to Contract Admin.
- `app/api/admin/fa-overrides/route.ts` still implements GET/POST/PUT/DELETE for `fa_overrides`.
- `app/lib/free-agent-seed.ts:11-15` still documents old precedence with `DB fa_overrides`, but the current roster path no longer uses that table.

Impact:
- A script or future UI could call the old API and appear to save a FA override that the app will never read.
- The stale comment can mislead future work on the already-fragile offseason/FA path.

Suggested fix:
- Either remove/retire the old API route with a 410-style response pointing to Contract Admin, or wire it to update `players.expiryStatus`, `players.expiryYear`, and `players.excludeFromRoster` instead.
- Update stale comments in `free-agent-seed.ts` to reflect current precedence: player-row editor facts, sync/seed facts, then fallback seed builder behavior.

### 6. Dead `ContractSyncer` references a missing API route

Severity: low

Evidence:
- `app/components/ContractSyncer.tsx:8-12` fetches `/api/contracts`.
- There is no `app/api/contracts/route.ts` in the current route inventory.
- The component is not imported elsewhere, so it is not currently user-facing.

Impact:
- Low direct impact today, but it is confusing dead code. If mounted later, it will always show a misleading "Using cached contract data" error state.

Suggested fix:
- Remove `ContractSyncer` if it is obsolete, or repoint it to the current contracts/league health endpoint before using it.

## Suggested Fix Order

1. Fix draft-pick overrides in `/api/league/teams`; this directly affects the main trade workflow.
2. Centralize team cache invalidation and update admin clear paths.
3. Add the Contract Admin "editor back to sync" bulk action.
4. Strengthen the admin auth canary to discover all admin route files.
5. Retire or repoint old FA override code and delete dead `ContractSyncer`.

## Test Targets To Add

- `/api/league/teams` applies a `draft_pick_overrides` row and preserves original-owner valuation/name context.
- `POST /api/admin/teams` clears the active cap-specific team cache key.
- Contract Admin source reset converts editor rows back to sync without deleting player rows.
- Admin auth canary auto-discovers every route under `app/api/admin`.
