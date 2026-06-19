# Confirmed fixes

Tasks verified as shipped (audited against commit `f743338`). Newest first.

## 2026-06 — Audit batch 1 (verified in repo)

- **Task 0.1 — BreakdownTable crash** — `.toFixed` calls now use guarded local consts (`ptsPace`/`avgTOI`/`capHit`), no crash on stats-less assets.
- **Task 0.2 — settings cap-ceiling validation** — `settings/route.ts` rejects non-finite / ≤0 values.
- **Task 0.4 — clear-cache missing keys** — all stat/MP/prospect caches now cleared.
- **Task 0.5 — trade-block keying** — status validated against the enum; rows keyed by name.
- **U1 — GSAX on both league routes** — merge fix applied in `route.ts` and `league/players/route.ts`; goalies show real GSAX.
- **U2 — modal scroll-lock** — shared `use-body-scroll-lock.ts`; verdict bottom sheet no longer freezes the page.
- **U3 — Player Analytics pagination** — `SectionPager` Prev/Next; per-section paging.
- **U4 — NAV breakdown reconciles** — FLOOR residual line so OFF+DEF+AGE+CAP(+FLOOR) = headline NAV.
- **U5 — active-tab indicator** — underline/border accent on the current nav tab.
- **U6 — NAV tooltip** — "Net Asset Value" title on NAV labels (AssetCard + Armchair GM).
- **U7 — sub-11px type** — dense-zone labels raised off the <11px sizes.
- **R0 — Heinola low-sample overvaluation** — low-sample cap-surplus dampening (lowSample↔established blend); pinned by the "Low-sample cap surplus dampening" test.
- **R2 — projected next contract** — `fmvAav` emitted; "Projected next $X × Yyr" shown; pinned by "Fair-market AAV output" test.
- **Task 2 — players page** — dev panel added, fetch swapped to `/api/league/teams` + `/api/league/players`, sections paginated.
- **1a — xnav golden tests** — comprehensive `xnav.test.ts` describe set.
- **1b — evaluate integration tests** — `evaluate-route.test.ts` (POST handler, statuses/flags/metrics).
- **Hand-edits** — relative (per-mean) volatility + aligned VOLATILE/HIGH_VAR threshold + `signChanges*8`; "Now" (current value) tile; graduated dynasty age penalty (no 33 cliff).