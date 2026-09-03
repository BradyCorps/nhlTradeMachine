# Analytics State — 2026-27 operating season

**Source of truth for what the analytics system actually does.** Written from
code, the committed artifact, the test suite and the dated dev-log evidence —
not from code comments. Machine-readable twin: `STATUS.json` (same directory).
Updated 2026-09-03 on branch `claude/analytics-integrity-season-snapshot-zfn41r`.

Season context: the app operates in **2026-27** (`SEASON.label`) with
**2025-26** as its completed statistical baseline (`SEASON.replaySeason`).
No 2026-27 game has been observed; every valuation is a preseason baseline
on 2025-26 stats priced against the 2026-27 contract ledger.

| # | Surface | Release status | Validation level |
|---|---------|----------------|------------------|
| 1 | Gravity v4 (OZ + DZ, untiered) | **PASS** for dossier-only diagnostic display, env-gated | Same-season split-half, null and identity gates; block bootstrap. No out-of-time test. |
| 2 | F-NAV | **PASS** | Adversarial audit on 2025-26 population (r=0.95 vs pts/82); walk-forward FMV band. Not an out-of-time forecast test of the total. |
| 3 | D-NAV | **PASS** (with one recorded masking finding) | Individual fit frozen on 2022-24, evaluated once on 2024→25 holdout (r=−0.328). |
| 4 | G-NAV | **PASS** | Adversarial audit (2025-26); continuous workload tier pinned by 12 tests. GSAX stability backtest. Not an out-of-time test of the total. |
| 5 | Team positional aggregation | **PASS** | Exact arithmetic identity, unit and integration tested. Not a model. |
| 6 | Season context & snapshots | **PASS** (foundation) | Content-addressed valuation ids + new immutable season rows; no production migration executed. |

## 1. Gravity v4

**Runtime behaviour.** `app/players/[playerId]/page.tsx` calls
`loadGravityProfileV4({ playerId, season: SEASON.replaySeason, artifact:
GRAVITY_V4_RUNTIME_ARTIFACT, manifest: GRAVITY_V4_RUNTIME_MANIFEST })`. It
returns a profile only when ALL of: `GRAVITY_V4_RELEASE_READY === true`
(code constant, currently true) AND `process.env.GRAVITY_V4_ENABLED === "true"`
(exact, trimmed, case-insensitive) AND the artifact hashes to the pinned
manifest AND the envelope and the profile pass the strict Zod schema AND the
player id, season and artifact kind match. Any other state renders the v3
fallback panel instead. Goalies and picks are `ineligible`. The admin route
`/api/admin/gravity-v4` is the only path allowed to load the zero-valued
diagnostic fixture. The environment flag is **not set in production**; the
display is dark.

**Inputs.** `app/lib/gravity-v4/fitted-artifact.json` — 560 profiles,
schema `gravity-v4-profile-set/1`, kind `fitted`, generated
`2026-08-22T16:39:29.669Z`, trained `2026-08-22T16:39:29.616Z`, source
`capandcrease/oz-dz@20252026`, SHA-256
`6de0271ef80f0969185e4217604efa332f1a94e7a1144d586a18ede05e74e29f`.
Population: 181 C, 181 W, 198 D; every profile ≥300 5v5 minutes (min 300.3,
median 600.2, max 1014.9); OZ and DZ share the same sample.

**Outputs.** Per zone: `xg60`, `xg82`, 90% interval, position/league
percentile, data quality, sample minutes. `netXg82 = OZ + DZ` (NZ contributes
a stored 0 that is a placeholder, see below). Display-only `displayForce` and
`displayMasses` via `tanh` with the stored visual scales (zone 0.818, net
1.188). `tier: null`, `netInterval: null`, net percentiles `null`,
`portability: null / UNKNOWN`, `reliability: LOW (535) | MEDIUM (25)`,
`dataQuality: partial` on all 560.

**Season / situation / population / missing-value semantics.** Season
2025-26 only (`targetSeason`, `trainingSeasons: ["2025-26"]`); 5v5 only;
qualified population ≥300 minutes and present in the bundled id snapshot
(594 qualified, 34 call-ups without ids correctly skipped). **NZ is
unavailable**: `transitionDataQuality: "missing"`, `zones.nz.dataQuality:
"insufficient"`, 0 sample minutes, no interval, no percentile. The runtime
contract now exposes this as `null` (`gravityZoneXg82OrNull`, card payload
`zoneXg82.nz: null`, `netScopeLabel: "OZ + DZ"`); the dossier panel prints
"Not available" and the share card prints "N/A · NOT AVAILABLE". Before this
sprint both surfaces printed "+0.0 xG/82" for NZ.

**Model / version identifiers.** `modelVersion "4.0"`, schema
`gravity-v4-profile-set/1`, source `capandcrease/oz-dz@20252026`, manifest in
`app/lib/gravity-v4/artifact-manifest.ts`.

**Independently validated (offline, same season, game-level halves; dev-log
2026-08-21/22).** OZ well: split-half reliability r=0.409 at the
predeclared λ=100,000 (was 0.348 at 25k), shot-shuffle null collapses, the
gravity→teammate-xG identity beats finish→teammate on held-out halves for
both positions. DZ well: split-half r=0.328 (F 0.299, D 0.379), null
collapses (−0.036), identity decisive (defense→opponent-xG r=0.372 vs
offense→opponent-xG −0.032). 100-replicate whole-game block bootstrap:
~20% of qualified players have a 95% interval excluding zero (OZ 118/594;
DZ 126/594). NZ rush-proxy well: split-half r=0.099 (F 0.052, D 0.154) —
excluded.

**Implemented / unit-tested only.** Schema, loader, checksum gate, flag
gate, NZ-null contract, display transforms, X-NAV isolation
(`__tests__/gravity-v4-release-evidence.test.ts`, 12 tests;
`gravity-v4.test.ts`; `gravity-feature-gates.test.ts`).

**Not validated / not reproducible here.** No year-over-year (out-of-time)
stability, no portability, no calibration-by-decile, no incremental X-NAV
evidence. The fitting pipeline's inputs (`data/gravity-v4/`,
`.gravity-v4-cache/`) are gitignored and absent in this environment and
`api-web.nhle.com` is blocked, so the artifact could not be regenerated; the
committed file was verified against the shipped validator and its checksum
instead.

**Public claims that were too strong or stale (corrected this sprint).**
`ANALYTICS.md`, `gravity.md`, `docs/analytics/GRAVITY_V4_VALIDATION.md` and
the opening of `scripts/gravity-v4/README.md` all still said no fitted
artifact existed and fitting was blocked. The v4 panel's copy claimed
exclusion "until the held-out validation gates pass" without saying which
had passed.

**Release status: PASS** — for a limited, dossier-only, diagnostic launch
behind the environment flag (see `GRAVITY_V4_RELEASE_EVIDENCE.md`). Untiered
and X-NAV-free either way.

## 2. F-NAV (`calcForwardNAV`)

**Runtime.** `calcNAV` dispatches C/W (and any other non-D, non-G skater
code, normalised to W at the `asset-nav.ts` boundary) to `calcForwardNAV`,
which is `calcSkaterNAV` on the forward branch. Stages emitted: `off, def,
age, grav, cap, multiplier, positional, development, franchiseFloor,
credibility`; they sum to `total` (`stageDrift` < 0.5 on every audited
case). `grav` is the v3 NZ handoff and is **0 unless
`GRAVITY_V3_XNAV_ENABLED` is set** (off by default; off in production).

**Inputs / outputs.** See `MODEL_CARD_NAV.md`. Stats are 2025-26
all-situations MoneyPuck plus multi-season baselines; contracts are the
2026-27 ledger; cap growth follows the announced 104.0 → 113.5 → 123.0 curve.

**Validated.** NAV-03 audit on the live 2025-26 population: total vs
points/82 r=0.95, vs xG/82 0.81, QoC +0.49, no cliffs at 30/60 GP. The FMV
band is the fit's own walk-forward error. **These are same-season
associations, not an out-of-time validation of the total.**

**Findings this sprint.** (a) Fixed: a drafted rookie WITH a MoneyPuck row was
sent through the full skater path below 14 GP and to pure pedigree at 14 GP
(3rd-overall pick: 36 → 240 on one game). (b) Documented, not changed: the
franchise floor is a threshold product rule (≥40 GP and pts ≥80 or OPS ≥5.0)
and steps at its bar. Missing-vs-zero: absent `ptsPace`/`xGPace` are treated
as 0 (`safe(x ?? 0)`).

**Status: PASS.**

## 3. D-NAV (`calcDefenseNAV`)

**Runtime.** D → `calcDefenseNAV` → `calcSkaterNAV` D branch. When
`xgaRelTM` and `corsiAgainstRel` are present the fitted individual model
(`fittedDefenseValue`) replaces the legacy `defRaw`; when either is null the
legacy formula runs (missing ≠ zero — pinned by test). Shrink is
`n/(n+41.76)`; output is affine-mapped onto the legacy centre/spread and
sanity-clamped to [−40, 140].

**Validated.** Fit frozen on 2022-24, evaluated once on the untouched
2024→25 holdout: r=−0.328, sign-consistent across three transitions,
year-over-year stability r=0.663 (`scripts/backtest/defense-model-individual-fit.ts`).
Team-level check is a labelled diagnostic, not a gate (teammate-relative
signals are near zero-sum inside a roster).

**Finding (documented, not changed).** At top-pair usage (≥22 min, ≥40 GP,
DPS ≥3.3 or QoC ≥74) the `isShutdownTopPairD` franchise floor binds and
masks the fitted signal: a defenseman at `xgaRelTM +1.0` and one at `−0.5`
read the same headline (134) although their `def` stage differs by 40. The
floor is keyed on deployment, the signal NAV-02 removed from the model.
Changing it needs its own evidence gate (population effect could not be
measured here: no roster data egress).

**Status: PASS** with the masking finding open.

## 4. G-NAV (`calcGoalieNAV`)

**Runtime.** G → `calcGoalieNAV`. Stages: `impact, cap, youngFloor,
roleCeiling`. Continuous workload tier (anchors ≤30 / 41 / ≥52 GP) drives
the per-game GSAX cap, confidence ceiling, workload bonus and starter floor;
`goalieRoleCeiling` ramps 37→44 and 49→60 GP; `softCeiling` compresses
logarithmically above the ceiling. Missing `gsax` is priced as 0 GSAX
(documented limitation). No FMV band: `fmvLow/fmvHigh` undefined,
snapshot `uncertainty: null`.

**Validated.** NAV-03 audit on 77 goalies: cap saturation 20 → 0, worst
single-game step 190 → ~25, total vs GSAx 0.716 → 0.757, workload r 0.719.
Goalie GSAX stability backtest supports the career-baseline regression.
Same-season; no out-of-time test of the total. Edge high-danger data is
displayed, not fed in (no backtest gate yet).

**Tested this sprint.** Worst one-game step < 26 across 1–82 GP at two rates
(`nav-integrity.test.ts`), plus the 12 NAV-03 tests in `xnav.test.ts`.

**Status: PASS.**

## 5. Team positional NAV aggregation

`rosterNavByPosition` sums per-player totals: G → g, D → d, everything else
→ f. Two totals, never under one label: `signed.total = Σ nav` ("Roster
X-NAV") and `xnav = Σ max(0, nav)` ("Roster X-NAV+", the chart's bars).
Identities `signed.total = f+d+g` and `xnav = f⁺+d⁺+g⁺` hold exactly
(`team-nav-split.test.ts`, `nav-integrity.test.ts` on real engine output,
`season-snapshot.test.ts` on persisted rows). It is a display decomposition
of the three player models, not a fourth model. **Status: PASS.**

## 6. Season context and valuation snapshots

`SEASON` = 2026-27 projected / 2025-26 stats / cap 104.0 / NHLe roster id
20252026. `valuation-snapshot.ts` attaches a content-addressed id
`{playerId}-{asOf}-{sha256(inputs|asOf|model)[0:16]}` to every valuation
crossing `calculateAssetNAV`; `team-contention-snapshot.ts` does the same for
teams. Neither was persisted. This sprint adds `player_season_snapshots` and
`team_season_snapshots` (schema, migration `0006`, `ensureSeasonSnapshotTables`),
an idempotent builder/writer (`app/lib/season-snapshot.ts`), an admin
backfill route (`POST /api/admin/season-snapshots`), and a `seasonReference`
block on every league provenance plus a "Season reference" rail item and
dossier block. No production migration was executed. **Status: PASS
(foundation).** See `SEASON_SNAPSHOT_CONTRACT.md`.
