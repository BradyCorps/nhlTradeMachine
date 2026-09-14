# Analytics Labs migration baseline — Phase 0

**Captured:** 2026-09-11  
**Repository baseline:** `48964340f28fef3dcfeeae6b8250f99c5086b419` (`main`)  
**Scope:** Baseline and regression coverage only. No analytic implementation,
artifact, flag, public response, database schema, or persisted row changed.

## Verification at capture

| Check | Result |
| --- | --- |
| Focused baseline fixture | 10/10 tests passed (1 file) |
| Full `npm run test` | 2,490/2,490 tests passed (188 files) |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed: 0 errors, 4 pre-existing warnings |
| `npm run build` | Passed: 30/30 static pages generated |

## Operating context

- `SEASON.label` is `2026-27`; public valuation uses `2025-26` as the
  completed statistical baseline and the 2026-27 contract ledger.
- The current public raw-asset entry point is
  `app/lib/asset-nav.ts#calculateAssetNAV`. It normalises a transport asset,
  calls the pure engine, then attaches a content-addressed valuation snapshot.
- There is **no analytics registry or production selector**. Production is
  currently selected by committed code, `SEASON`, the bundled Gravity v4
  manifest/artifact, and narrowly scoped environment gates.
- The database is Drizzle/libSQL. It already has immutable-oriented player and
  team season snapshot tables (`drizzle/0006_add_season_snapshots.sql`), but
  the current analytics-state record says no production snapshot migration has
  been run. `site_settings` is a generic key-value table, not an analytics
  registry.

## Frozen production analytics inventory

| Analytic | Implementation and public/API consumers | Data, artifact, flag, fallback | Evidence and current identity |
| --- | --- | --- | --- |
| X-NAV aggregate and F-NAV/D-NAV/G-NAV | `app/lib/xnav-engine.ts`, crossed publicly through `app/lib/asset-nav.ts`. Consumers include Players, player dossiers, Teams via `league-nav.ts`, trade evaluation (`app/api/evaluate`), Trending Players, percentile cards, simulation timeline, and release manifest. | 2025-26 MoneyPuck/current roster signals, multi-season priors, 2026-27 contracts, `SEASON`. Position dispatch selects forward, defense, goalie, pick, or prospect paths. Missing stats use documented neutral/default handling; D switches to its legacy defensive branch when teammate-relative evidence is absent. | `X-NAV 4.2` in `MODEL_CARD_NAV.md`; tests include `xnav.test.ts`, `nav-integrity.test.ts`, `asset-nav.test.ts`, `valuation-snapshot.test.ts`, `league-nav.test.ts`, and API integration tests. |
| Team NAV split | `app/lib/team-nav-split.ts`, rendered by `app/teams/page.tsx` and persisted by `app/lib/season-snapshot.ts`. | Already-calculated player NAV only; signed totals and positive-only totals are separately labelled. Empty/invalid inputs resolve to zero buckets. | Not a fourth model. Tests: `team-nav-split.test.ts`, `nav-integrity.test.ts`, `season-snapshot.test.ts`. |
| Gravity v3 | `app/lib/gravity.ts`, `gravity-rink.ts`, and `gravity-channels.ts`; dossier/team/trending display consumers, with separately gated X-NAV and simulation handoffs. | Current stats/baselines and EDGE-derived inputs. `NEXT_PUBLIC_GRAVITY_V3_DISPLAY_ENABLED`, `NEXT_PUBLIC_GRAVITY_V3_XNAV_ENABLED`, and `GRAVITY_V3_SIMULATION_ENABLED` fail closed unless exactly `true`. The normal display fallback remains non-Gravity. | Production display contract is documented in `ANALYTICS.md`; X-NAV handoff is off by default. Tests: `gravity-feature-gates.test.ts`, `xnav.test.ts`, route/simulation tests. |
| Gravity v4 diagnostic display | `app/lib/gravity-v4/{runtime-artifact,load-profile,validate-profile}.ts`, used by `app/players/[playerId]/page.tsx`; admin diagnostic route is `/api/admin/gravity-v4`. | Bundled fitted artifact (560 2025-26 profiles), manifest SHA-256 `6de0271e…e74e29f`, schema `gravity-v4-profile-set/1`, model `4.0`. `GRAVITY_V4_ENABLED` must be exactly `true`; schema, checksum, kind, season, and position must pass. Missing/invalid/ineligible data is not served and the dossier uses the v3 fallback panel. | Dossier-only and X-NAV-free. Tests: `gravity-v4.test.ts`, `gravity-v4-release-evidence.test.ts`. |
| Trade valuation | `app/api/evaluate/route.ts` calls `calculateAssetNAV` for package, cap, volatility, and proposal decisions. | Same NAV inputs plus trade, cap, retention, and GM constraints. No independent analytic artifact or flag. | API and canary coverage: `evaluate-route.test.ts`, `evaluate-request-schema.test.ts`, `feature-canaries.test.ts`. |
| Simulation/projections | `app/api/simulate/route.ts`, `app/lib/cup-run.ts`, `app/lib/sim-goal-share.ts`, and `app/lib/player-timeline.ts`. | Canonical roster/contract state, position NAV, seeded simulation inputs, and the separately gated v3 simulation handoff. | `simulate-and-claude-routes.test.ts`, `sim-believability.test.ts`, `cup-run.test.ts`, and goal-share backtest documentation. |
| Fantasy and development-facing analytics | `app/fantasy/page.tsx`, `app/lib/fantasy-board.ts`, and `app/lib/development-profile.ts`. | League payload and read-only development/timeline inputs; it does not define a separate registered production model or alter core NAV. | `fantasy-board.test.ts`, development-source/profile tests, and `ANALYTICS.md` sprint contract. |
| Season/valuation snapshots | `app/lib/valuation-snapshot.ts`, `app/lib/season-snapshot.ts`, `/api/admin/season-snapshots`. | Snapshot IDs hash inputs, model identifier, and as-of date. Season tables are append-only/idempotent by contract. | `valuation-snapshot.test.ts`, `season-snapshot.test.ts`, `SEASON_SNAPSHOT_CONTRACT.md`. |

## Golden regression fixture

`__tests__/analytics-labs-baseline.test.ts` calls the canonical public
boundary with a fixed as-of date, rather than copying model mathematics. It
freezes current totals for nine representative inputs:

| Cohort | Frozen X-NAV |
| --- | ---: |
| Elite / middle / low-sample forward-prospect | 487 / 75 / 240 |
| Elite / middle / low-sample defense | 282 / 67 / 8 |
| Elite / tandem / low-sample goalie | 315 / 44 / -33 |

It also freezes two synthetic team aggregates: signed/positive X-NAV of
`598/598` and `50/83`. The second fixture deliberately includes a negative
goalie result so a later migration cannot conflate signed roster NAV with the
positive-only chart aggregate.

These are deterministic engine fixtures, not claims about live players or
new calibration evidence. Existing Gravity checksum/flag evidence remains the
artifact regression mechanism; Phase 0 does not duplicate its 1.2 MB artifact
in a second snapshot.

## Feature and release state captured

The repository intentionally contains no committed `.env` values. This
baseline records code-level behavior, not an unverifiable deployment claim:

- v3 display, X-NAV handoff, and simulation flags are all false unless their
  respective values are exactly `true`.
- v4 profile display is false unless `GRAVITY_V4_ENABLED` is exactly `true`;
  corrupt/missing/mismatched artifacts fail closed.
- NAV-01's September 2026 shadow calibration is a failed/blocked research
  result. The 651-row 2025-26 holdout is development-only and public NAV,
  flags, snapshots, and consumer surfaces remain unchanged. See
  `NAV01_PHASE5_REMEDIATION.md` and `NAV01_SHADOW_CALIBRATION_REPORT.md`.

## Architecture discrepancies and amendments for later phases

### Phase 1B production-identity amendment — 2026-09-13

`app/lib/production-analytics.ts#ANALYTIC_CATALOG` is now the single typed,
code-backed source of truth for the known production, diagnostic, and failed
research analytic identities. Its contract is documented in
`PRODUCTION_ANALYTICS_REGISTRY.md`. It describes the current committed-code
selection; it does not calculate, dynamically dispatch, promote, or read an
analytic implementation. In particular, public NAV remains
`calculateAssetNAV → calcNAV`, and the catalog is intentionally not wired into
that path. No database-backed registry is justified while code/flags/artifacts
remain the existing authoritative production selectors.

Only a future Labs candidate may carry a verified `COMPLETE` snapshot batch ID.
No catalog record carries a runtime batch reference; the Phase 1A batch does not
alter live valuation. Gravity v4 remains diagnostic/flag-controlled and NAV-01
Phase 5 remains failed research evidence.

1. **Start from the existing canonical boundary, not a new `lib/analytics/`
   tree.** Phase 1 should retain `calculateAssetNAV` as the public NAV choke
   point and put a production selector behind it only after a behavior-preserving
   adapter is covered by these fixtures.
2. **Use the existing Drizzle/libSQL schema and season snapshot vocabulary.**
   Phase 3 should extend the existing migration sequence and reuse
   `season`, `asOf`, `modelVersion`, `source`, and `coverage` semantics; it
   must not create a competing snapshot registry.
3. **Treat code/flag/artifact selection as the current production state.**
   There is no current authoritative registry to migrate. Phase 3 must first
   import these actual identities, including the fact that F/D/G share an
   engine version while Gravity v4 is artifact-pinned and diagnostic-only.
4. **Preserve admin API authorization separately from page visibility.**
   Existing admin mutation routes generally call `requireAdmin`; the admin
   layout itself is navigation only. Phase 2 should not claim authenticated
   server-rendered page protection without first verifying/adding it as a
   separately scoped security change.
5. **Do not infer a production snapshot population.** Phase 4 dataset/run
   references may reuse snapshot tables only after their actual production
   backfill status is recorded. Phase 0 found schema and writer support, not
   proof of populated historical rows.
6. **Correct stale presentation claims while touching relevant docs later.**
   `app/methodology/page.tsx` still describes an older D-NAV 20-game gate and
   team-level validation framing that conflicts with the current model card's
   missing-evidence branch and documented individual holdout. This is a
   documentation reconciliation task, not a Phase 0 model change.

## What Phase 0 did not change

- No F-NAV, D-NAV, G-NAV, X-NAV, Gravity, simulation, projection, fantasy,
  trade, or public dossier calculation.
- No artifact, feature-flag, environment, API response, database schema,
  migration, admin route, or persisted production data.
- No model fitting, calibration, holdout evaluation, or promotion decision.
