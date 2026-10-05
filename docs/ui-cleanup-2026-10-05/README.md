# Bounded public UI cleanup — 2026-10-05

Base: `origin/main` at `525e4f2e971a5138671a9320c03e060c43547440`. One presentation pass; no formula, model, roster, contract, snapshot, database, cache policy, or Labs change.

## Findings and corrections

- [x] **Players badges:** reproduced with captured public McDavid data. At 1440px, the 408px badge group escaped its 210px player cell into STRAND and statistics. Badges now take a wrapping line within the player cell, with natural row height. No flags or explanations were removed. Column headings use word wrapping and less horizontal padding, so “Contract” stays whole. Existing typography, grid tracks, sorting, expansion and compact cards remain.
- [x] **Docket:** Production rendered pending re-grades as “EVEN NA TODAY.” The shared presentation helper now requires a terminal live verdict and finite margin/net value before displaying a live result. Pending means “Not yet graded”; unsuccessful/unavailable means “Grade unavailable”; a genuine zero/even grade still renders as EVEN +0.0 NAV. Frozen grades are unchanged. Winner search/filter/sorting refers explicitly to the **at-trade** result; an absent grade cannot become EVEN through a null fallback.
- [x] **Statistics/model context:** reproduced a selected 2026–27 page whose rail called 2025–26 “Stats” and printed “0 GP observed.” Players and Teams now pass their actual observed selection to the shared rail. Historical model inputs and current contracts are separately labelled. The season-reference zero explicitly means target-season GP **in the model**, not observed-statistics coverage. Stored season-reference fields are unchanged.
- [x] **Counts:** reproduced the reported population mismatch. `debug.playerCount` is the assembled catalogue length; `analyticsCount` is `analyticsMap.size`, which includes name/position aliases; `contractsLoaded` is the contract lookup-map key count, including normalized-name, position and team aliases. These are now three separately labelled populations, not a fraction or a claim of unique contract rows. No count is clamped or recomputed. “Reconciliation” retains its existing Passed/Warning logic and warnings, with its limited scope stated: assembly checks, not complete player coverage.
- [x] **Trade dimensions:** reproduced Hellebuyck for Lundell with the captured roster: overall LOSS, −41 NAV, versus Winnipeg fit WIN, +4.9 estimated wins, +0.4 window years. These measure different things. The overall label now says “Locked audit · NAV balance / feasibility”; team fit explicitly combines NAV, estimated wins, window shift and roster needs. Fit can improve while paying a NAV premium. Both verdict components and all mathematics are unchanged. The shared verdict component and frozen Docket ruling receive the same dimension labels.

## Before / after evidence

Players and Trade Machine before images are local development reproductions using captured public API inputs. After images are from a local **production build** with the same captured inputs. They are not Preview or deployed Production proof.

| View | Before | After |
|---|---|---|
| Players layout and context, 1440px | [Before](before-players-1440.png) | [After](after-players-1440.png) |
| Docket grades, 1440px | [Production pending entries](before-docket-1440.png) | [Isolated pending/unavailable/valid-zero fixtures](after-docket-1440.png) |
| Trade audit dimensions, 1440px | [Before](before-trade-1440.png) | [After](after-trade-1440.png) |
| Shared locked audit, 1440px | [Before](before-shared-1440.png) | [After](after-shared-1440.png) |

The Docket pair deliberately uses isolated after fixtures; it does not imply that Production trades were re-graded. All-width screenshots and the browser report were also retained in `/tmp/ui-cleanup` during this pass.

## Verification

- Focused helpers/context/snapshot tests + Phase 0: **34/34**.
- One local full-suite run: **2,689 passed / 1 failed** across 212 files. The failure was an obsolete source-string assertion that required the client to read `entry.todayWinner` directly. That read moved into the shared helper; behavioral pending/unavailable/zero tests cover it. The obsolete assertion was removed; affected tests including canaries and Phase 0 then passed **472/472**. Normal PR CI runs the full suite on the final head.
- TypeScript passed; full lint passed with **0 errors / 4 existing warnings**; final changed harness/test lint passed. Production build passed, **30/30 static pages**. No repeated local full-suite run.
- Local production-build checks at **320, 412, 768, 1024 and 1440px**: badge and descendant bounds contained in player cells; no intersection with STRAND/numeric columns; real long-name/high-flag fixtures; search, observed season/competition selection, sort, expansion, flag explanation, keyboard Enter/Escape; isolated Docket pending/unavailable/valid-zero and frozen winner filtering; Hellebuyck/Lundell audit and generated share/reopen preserving the locked NAV/status. No page overflow in Docket or shared views.
- Browser tests explicitly intercept league API inputs; final server uses a disposable local database and no Redis credentials. Speculative Next route prefetch is blocked. No Production mutations, cache clearing, or deploy.

Reproduce with a local production server and captured **public** Players/Teams API JSON:

```sh
UI_BASE_URL=http://localhost:3005 \
UI_PLAYERS_FIXTURE=/tmp/ui-cleanup/players.json \
UI_TEAMS_FIXTURE=/tmp/ui-cleanup/teams.json \
node --import tsx scripts/verify-public-ui-cleanup.mjs
```

The harness uses the existing esbuild tooling installed transitively with the test tools; no package or dependency was added. Season switching in fixtures verifies labels/request identity, not a new historical upstream collection.

## Deferred findings

1. The existing share schema preserves the locked audit, metrics and flags, but strips optional `sideOutcomes`. Shared pages therefore cannot show the team-fit assessment from generated links today. Their locked audit label is fixed here. Restoring that optional frozen evidence needs a separately reviewed, backward-compatible share-schema change; no fit is invented or recalculated in this pass.
2. The existing reconciliation boolean is a source/count sanity check, not joined unique-player coverage or proof that every upstream team succeeded. This pass labels that limitation without changing it. Any stronger completeness gate is a separate assembly task.
3. No investigation of the earlier 780-versus-1,326 count change was performed. No missing roster identity, ownership or model correction is claimed here.

Hosted CI and Preview status belong to the PR's exact final head; this document's browser evidence is local only.
