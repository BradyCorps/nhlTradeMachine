# Production analytics identity registry — Phase 1B

**Introduced:** 2026-09-13
**Source of truth:** `app/lib/production-analytics.ts#ANALYTIC_CATALOG`
**Scope:** Typed identity and lifecycle metadata only. This is not an Admin
Labs UI, a database registry, a candidate runner, an artifact store, a
validation system, or a promotion mechanism.

## Architectural rule

Public raw-asset valuation remains exactly:

```text
calculateAssetNAV → calcNAV
```

`calculateAssetNAV` still normalizes the transport asset, calls `calcNAV`, and
attaches the existing valuation snapshot. `calcNAV` retains its committed Pick,
prospect, goalie, forward, and defence dispatch. The catalog does not select an
implementation, invoke a calculator, inspect a database, read a snapshot batch,
or evaluate a feature flag. It therefore cannot become a second NAV execution
path or make metadata alter mathematical behaviour.

The narrow current production-selection point is committed code: the direct
call from `app/lib/asset-nav.ts#calculateAssetNAV` to
`app/lib/xnav-engine.ts#calcNAV`. The typed catalog describes that established
selection and offers a fail-closed metadata resolver; it is deliberately not
wired into the hot valuation path. Wiring a resolver there would add an
unnecessary runtime failure mode without changing what code is selected.

## Contract

Each catalog record has a constrained stable ID, family, lifecycle, exposure,
implementation identity, implementation module, execution boundary, calculation
role, honest version identity, determinism classification, immediate consumers,
optional artifact identity, and fail-closed feature-flag metadata. A bundled
artifact is identified by its artifact path plus its authoritative manifest
module/export; the catalog does not import or duplicate the checksum/schema
data. Where importing an authoritative constant would breach a runtime-isolation
boundary, the catalog records that module/export reference instead of copying
the value (Gravity v4 is the current example).

`getProductionAnalytic(id)` is a metadata-only resolver. It throws for an
unknown ID and for every diagnostic or research record. Registration therefore
does not imply production eligibility or promotion.

`getProductionPlayerValuationAnalytic(id)` is a narrower metadata-only guard:
it permits only asset or position valuation records. It rejects
`nav.team-aggregation`, which remains a display aggregation of existing player
NAV rather than a player calculator. The catalog and all nested records are
runtime-frozen; `validateAnalyticCatalog` rejects duplicate IDs and inconsistent
lifecycle/record-kind pairs before a catalog can be used.

The catalog uses a code-backed manifest because production selection is currently
code-, artifact-, and narrowly scoped flag-backed. There is no existing
authoritative persistent selector to extend, and a database registry would add a
second source of truth prematurely. There are no ordinary public-NAV database
reads from this registry.

## Source-of-truth boundary

Production code is authoritative for calculation execution: its direct imports,
function calls, artifact validation, and environment checks choose what runs.
The catalog is authoritative only for typed analytic identity and lifecycle
metadata. `getProductionAnalytic` validates that metadata eligibility; it does
not return a calculator, dynamically select an implementation, or alter a
production call path.

A later approved adapter can connect promotion metadata to the canonical
`calculateAssetNAV → calcNAV` boundary only by resolving one already-approved
identity to the same committed implementation contract, failing closed when that
identity is absent/non-production, and preserving rollback history. It must not
allow a request caller or Labs candidate to supply a calculator or bypass the
canonical boundary.

## Current identities

| Stable ID | Lifecycle / exposure | Existing boundary and identity | Version / artifact | Selection notes |
| --- | --- | --- | --- | --- |
| `nav.asset` | `PRODUCTION` / public | `calculateAssetNAV → calcNAV` | Explicit `X-NAV 4.2` | The canonical raw-asset path used by Players, Teams, trade evaluation, and the league NAV map. |
| `nav.forward` | `PRODUCTION` / public | `calcNAV` position dispatch → `calcForwardNAV` | Explicit `X-NAV 4.2` | F-NAV is a position branch, not a separate public selector. |
| `nav.defense` | `PRODUCTION` / public | `calcNAV` position dispatch → `calcDefenseNAV` | Explicit `X-NAV 4.2` | D-NAV is a position branch, not a separate public selector. |
| `nav.goalie` | `PRODUCTION` / public | `calcNAV` position dispatch → `calcGoalieNAV` | Explicit `X-NAV 4.2` | G-NAV is a position branch, not a separate public selector. |
| `nav.team-aggregation` | `PRODUCTION` / public | `rosterNavByPosition` | Implicit committed implementation | Display-only aggregation of already-calculated NAV. Signed and positive-only totals remain distinct; it is not a fourth model. |
| `gravity.v3` | `PRODUCTION` / public | `gravity-channels` → `computeGravity` | Explicit `Gravity v3` | Display, X-NAV, and simulation flags remain independent and fail closed. A v3 X-NAV or simulation handoff is not enabled by this record. |
| `gravity.v4` | `DIAGNOSTIC` / diagnostic | v4 diagnostic loader | Explicit `Gravity v4.0`; pinned bundled artifact | Dossier/admin diagnostic only, `GRAVITY_V4_ENABLED` fail-closed. It is not public production NAV and cannot resolve through `getProductionAnalytic`. |
| `simulation.season` | `PRODUCTION` / internal | `POST /api/simulate` → `simulateLeague` | Implicit committed implementation | Seeded deterministic simulation for a fixed scenario payload; the v3 simulation handoff remains separately fail-closed. |
| `nav01.phase5-calibration` | `RESEARCH` / internal | No runtime boundary | Explicitly implicit failed research evidence | NAV-01 Phase 5 remains failed/blocked research evidence, not a production implementation or promotion candidate. |

An “implicit” version is an honest declaration that repository evidence names a
committed implementation but no independent semantic model version. It is not a
new invented version number.

### Authority map

| Metadata | Authoritative source | Catalog treatment |
| --- | --- | --- |
| X-NAV asset/F-NAV/D-NAV/G-NAV version | `XNAV_MODEL_VERSION` from `app/lib/data-context.ts` | Imported constant; all four records use the same value. |
| Team aggregation identity | `app/lib/team-nav-split.ts#rosterNavByPosition` | Explicitly implicit: no independent model version exists. |
| Gravity v3 identity and lifecycle | `docs/GRAVITY_MODEL_CARD.md`, `ANALYTICS.md`, and `gravity-channels.ts` | Documented `Gravity v3`; public-display lifecycle does not imply either value handoff is enabled. |
| Gravity v3 flags | Exports from `app/lib/gravity-feature-flags.ts` | Imported constants, with independent fail-closed channel metadata. |
| Gravity v4 artifact/version/flag | `GRAVITY_V4_ARTIFACT_MANIFEST` and `GRAVITY_V4_FEATURE_FLAG` | Manifest/export references only; no eager v4 import and no invented semantic version. |
| Simulation identity/version | `app/api/simulate/route.ts#simulateLeague` and `scenarioSeed` | Explicitly implicit committed implementation; fixed request/seed is deterministic. |
| NAV-01 Phase 5 | `docs/analytics/NAV01_PHASE5_REMEDIATION.md` | Research evidence only; spent/development-only and unresolvable as production. |

## Runtime call paths and consumers

| Concern | Canonical runtime path | Selection and determinism |
| --- | --- | --- |
| Forward, defence, goalie, prospect, and pick NAV | Public raw assets: `calculateAssetNAV` → `calcNAV`; `calcNAV` dispatches Pick, prospect/blend, goalie, then D or forward. | Committed direct call, explicit `X-NAV 4.2`; deterministic for a fixed normalized input, cap ceiling, and as-of value. No public caller selects a candidate. |
| Asset/X-NAV consumers | Players and dossiers, `league-nav.ts` for Teams and cached roster maps, `/api/evaluate` trade calculations, trending/percentile consumers, and release-manifest checks call the public boundary. | The public route always gets the existing valuation snapshot envelope after the engine result. |
| Historical/projection consumer | `app/lib/player-timeline.ts` and `app/components/PlayerTimeline.tsx` call `calcNAV` directly on explicitly constructed projected/history inputs. | Internal projection/history use, not a competing raw-public-asset boundary and not a candidate selector. |
| Team F-NAV/D-NAV/G-NAV | Existing player NAV values → `rosterNavByPosition` → Teams chart/snapshot consumers. | Deterministic display aggregation only. It preserves signed and positive-only totals separately and contains no player valuation mathematics. |
| Gravity v3 | `computeGravity` stays pure; `gravityForDisplay`, `gravityForXnav`, and `gravityForSimulation` are the three isolated deployment wrappers. | Each channel has its own exact-`true`, fail-closed flag. Display status does not activate X-NAV or simulation. |
| Gravity v4 | Player dossier/admin diagnostic loader → pinned runtime artifact validation. | Diagnostic/flag-controlled only; checksum/schema/kind/season/position validation fails closed, with no NAV or simulation handoff. |
| Simulation | `POST /api/simulate` → seeded scenario construction → `simulateLeague`; Cup Run uses the same simulation domain. | Deterministic for a fixed scenario payload/seed. The separately gated Gravity v3 simulation delta remains off unless its own flag is explicitly enabled. |

Display labels and aggregation are recorded separately from calculation identity:
`nav.team-aggregation` consumes an already-calculated result and never chooses
F-NAV, D-NAV, G-NAV, or asset/X-NAV mathematics.

## Dataset provenance and Labs separation

A production analytic and a Labs candidate are different lifecycle concepts.
The registry records no live snapshot-batch value and cannot make a batch
eligible. When a later Labs candidate needs source data, its dataset reference
must be the ID of a verified `COMPLETE` season snapshot batch—not a season label.
For example, the verified 2025-26 batch may be referenced by a future candidate,
but it is not wired into public NAV, team aggregation, Gravity, or simulation.

Legacy unbatched snapshot rows remain unverified and cannot become a dataset
reference by catalog lookup or by matching a season/version label.

## Later promotion and rollback boundary

Phase 2 may add candidate, artifact, validation, and promotion records only
behind a separately approved production-selection adapter at the established
canonical boundary. That adapter must select exactly one approved implementation
for a stable ID, preserve `calculateAssetNAV → calcNAV`, fail closed for missing
or non-production records, and record rollback history without deleting failed
evidence. It must not let a caller choose a Labs candidate directly.

Until that work is explicitly approved, production remains selected by committed
code and the catalog remains descriptive metadata. Candidate registration,
artifact creation, validation success, and promotion are independent actions.
