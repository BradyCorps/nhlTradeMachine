# Mobile UI audit — verified triage

**What this is.** A ChatGPT mobile-first UI audit of capandcrease.com was handed
over (12 sections + an Armchair GM deep-dive + a Cup Run / Sim deep-dive). This
document verifies **every** claim against the actual code on
`claude/cap-crease-mobile-audit-8ug1ft` (branched from `main`) and marks each one
as still-open, partially-addressed, already-fixed, inaccurate, or an enhancement
request. It changes no product code — it exists so we sequence the real work
deliberately instead of re-implementing things that already shipped.

**Headline.** The audit was run against the live site but reads much of it as if
nothing had been built for mobile yet. In fact the app already has two mature
systems the audit is largely asking for:

- **`app/lib/use-dialog.ts` (`useDialog`, "CXH8")** — one hook giving every
  overlay `role="dialog"` + `aria-modal`, a label, focus-move-in, a **focus
  trap**, Escape-to-close, **focus-restore-to-opener**, and body-scroll-lock.
  Used by `TeamSelectModal`, `DraftNight`, `MemoModal`, the Cup resume prompt.
- **`.tap-target` in `app/globals.css`** — `min-height:44px; min-width:44px`
  (WCAG 2.5.5 AAA), plus a 24px `tap-target`-style secondary. Applied across
  **15 files** (`ResignPhase` ×12, `fantasy` ×7, `OfferSheetPhase` ×5,
  `LineupEditor` ×5, `VerdictSheet` ×5, `armchair-gm/page` ×5, …).

Because of those two systems, several of the audit's flagship findings —
"draft overlays are inaccessible," "modal returns focus to body," "controls
below 44px everywhere" — are **stale for the surfaces that adopted them** and
**still true only for the surfaces that didn't**. The value of this triage is
telling those two groups apart.

## Status legend

| Mark | Meaning |
|---|---|
| 🔴 **OPEN** | Accurate, and not yet addressed in code. Real work. |
| 🟡 **PARTIAL** | Half-true — some of it shipped, a residual remains. |
| 🟢 **DONE** | Already fixed in code; the finding is stale. No action. |
| ⚪ **INACCURATE** | Does not match the code as written. |
| 🔵 **ENHANCEMENT** | Not a defect — a new feature/redesign request. |

Effort: **S** ≤½ day · **M** ~1–2 days · **L** multi-day / architectural.

---

## Cross-cutting (touches many pages)

| # | Claim | Verified against code | Status | Effort | Priority |
|---|---|---|---|---|---|
| X1 | Global nav is 7 small links (~21px), wraps on phones, repeated every page | `Header.tsx:75` — one `flex flex-wrap` nav, 7 `<Link>`/`<a>`, `text-[11px]` labels (`navClass` `:25`), `\|` dividers. No `More`, no sticky, no 44px targets. | 🔴 OPEN | M | **P1** |
| X2 | Huge icon-key/glossary block appended to every page | `Footer.tsx` on 13 pages. **Nuance:** the 5 methodology glossary sections are *already* collapsed `<details>` (`:227`). What's always-expanded is the **Icon Key** — three grids (Asset Flags, Modern Role Icons, Gravity Tiers, `:161–222`). So the fix is "collapse the icon-key grids," not the whole footer. | 🟡 PARTIAL | S–M | **P1** |
| X3 | Touch targets below 44px throughout | True *only where `.tap-target` isn't applied*. Applied already: `ResignPhase`, `OfferSheetPhase`, `VerdictSheet`, `fantasy`, `LineupEditor`, `armchair-gm/page`. **Not** applied: `Header` nav, `Footer` links, `docket` filters, `CupRunPanel` buttons, `AssetDropdown` rows/close, `TeamSelectModal` close. | 🟡 PARTIAL | M | **P1** |
| X4 | Loading is long/blocking (Teams, Docket, Armchair) | Architecturally real. Roster assembly cold-builds ~40s behind `cached-roster` SWR (per `CLAUDE.md`); Armchair computes a full-league `navMap` (2,214 values) client-side before unlocking; `docket/page.tsx:8` is `force-dynamic` with a request-time DB query. **Cannot be perf-tested in this remote env** — `api-web.nhle.com` egress is blocked. | 🔴 OPEN | L | **P0** |

---

## §1 Global navigation → **X1 above.** 🔴 OPEN · P1
The audit's structure (4 primary + "More", 44px, sticky-after-scroll, reduced
wordmark in tools) is a sound target. Self-contained: one shared component
(`Header.tsx`) fixes it on every page at once.

## §2 Loading performance → **X4 above.** 🔴 OPEN · P0 (not verifiable here)

## §3 Homepage double entrance barrier
| Claim | Code | Status |
|---|---|---|
| Blocking welcome modal, then a full-viewport cover before content | `WelcomeModal.tsx` (fixed `inset-0 z-[9999]`, `localStorage` `cap-and-crease-welcomed-v1`) **and** `page.tsx:99` `fp-desk-spacer` "full viewport of desk" + `ScrollNameplate`/`ScrollSnap`. Two barriers confirmed. | 🔴 OPEN · P1 |
| First-time user can't immediately search/trade | Confirmed — no action CTAs on the cover. Audit's "Search / Build a Trade / Explore Teams" on the cover is reasonable. | 🔴 OPEN |

Note: `WelcomeModal` is *not* built on `useDialog` — it has no focus trap / role.
If we keep it, fold it into `useDialog` while we're there.

## §4 Footer length → **X2 above.** 🟡 PARTIAL · P1
Precise fix: collapse the Icon-Key grids (`Footer.tsx:151–223`) behind a
`<details>` like the glossary sections already are, and/or route the full key to
`/glossary#icon-key` (that anchor already exists, `Footer.tsx:144`).

## §5 Players index
| Claim | Code | Status |
|---|---|---|
| Mobile cards below 539px (correct approach) | `players/page.tsx:784` "Mobile card (≤539px)"; CSS media at `globals.css:982` `(min-width:540px)`. | 🟢 DONE (approach is right) |
| Fragile 540–639px seam (cards at 539, other behaviour at 640) | Breakpoint mismatch is real. Audit's "use the mobile row through 639px" is a 1-line media-query change. | 🔴 OPEN · S · P2 |
| Status icons are 18px `<span>` w/ title+aria-label but not focusable; tap hits the row | `players/page.tsx:173,217,232` — `<span title aria-label>`, not `<button>`/no `tabIndex`. Accurate. | 🔴 OPEN · S · P1 |
| Filter controls / team selector ~31px | Filter strip controls don't carry `.tap-target`. Plausible; size them up. | 🔴 OPEN · S |
| Hidden horizontal scrollbars with no "more" cue | Plausible (scrollbar-hide utility); not individually confirmed. | 🟡 PARTIAL |
| Player names truncate | ⚪ **On this page names already wrap** — `overflowWrap:"anywhere"` at `:747` (desktop row) and `:809` (mobile card). | ⚪ INACCURATE (index) |

Bonus: the players page *already* has its own collapsible contextual icon key
(`PlayersIconKey`, `players/page.tsx:265`) — separate from the global Footer.

## §6 Player profile & charts
| Claim | Code | Status |
|---|---|---|
| Scatter has good overall description but no per-point focus (need tap-to-pin) | `NavLeagueScatter.tsx:259` **already** has `role="img"` + a rich `aria-label` (`:260`); prior branch work added the hexbin density wash. Tap-to-pin is a genuine *enhancement*, not a missing description. | 🔵 ENHANCEMENT · M · P2 |
| STRAND SVG has no image role/description | Profile uses `PlayerStrandPanel` (`[playerId]/page.tsx:341`). Its SVG lacks a `role="img"`/summary (only a "Clear comparison" label at `:103`). Accurate. | 🔴 OPEN · S · P1 |
| Six season stats in one row at mobile base | `[playerId]/page.tsx:255` `grid grid-cols-6`, no responsive split. Accurate — audit's "2×3 on narrow" is right. | 🔴 OPEN · S · P2 |
| "Compare" is a ~25px select; back / "Full League" links tiny | In `PlayerStrandPanel` / profile header; small controls, no `.tap-target`. Accurate. | 🔴 OPEN · S |
| Long names truncate in the **profile header** | Distinct from §5 — the profile header does truncate (`truncate` in the header lockup). Accurate here. | 🔴 OPEN · S |

## §7 Teams
| Claim | Code | Status |
|---|---|---|
| Add dedicated `/teams/{team}` routes | `app/teams/` has only `page.tsx` + `loading.tsx` — **no dynamic route.** Accurate gap. | 🔵 ENHANCEMENT · L · P2 |
| 32-column chart forces ~620px mobile scroll; want top-10 + "View all" | `TeamNavChart.tsx:75–123` **already** ships `useIsMobile` + a **top-10/show-all toggle** (`chartW` collapses to ~320px on phones). This is exactly the audit's recommendation. | 🟢 DONE |
| Expanded team panel is very tall, exposes no player links | `teams/page.tsx` `TeamCard` (`:442`) expanded region has no `/players/` links. Accurate; linking projected-line players is a good add. | 🔴 OPEN · M |
| Teams index doubles as detail page | True; resolved by the `/teams/{team}` route above. | 🔵 ENHANCEMENT · L |

## §8 Trade Machine
| Claim | Code | Status |
|---|---|---|
| Two stacked panels; hard to compare; want a sticky trade summary + A/B toggle | `QuickTradeMachine.tsx` — two team `<select>` (`:148,341`), no `sticky`/`fixed bottom` summary anywhere. Sticky-summary + A/B is a valid enhancement. | 🔵 ENHANCEMENT · M · P1 |
| Asset picker lacks dialog semantics / focus mgmt | `AssetDropdown.tsx` is the **one overlay not on `useDialog`**: hand-rolled portal, **has** Escape (`:92`) + scroll-lock (`:87`) but **no** `role="dialog"`/`aria-modal`/focus-trap/focus-restore, and search isn't auto-focused. Migrating it to `useDialog` is the fix. | 🟡 PARTIAL · S · **P0/P1** |
| Team selects / audit buttons 41–42px | Not carrying `.tap-target`. Accurate. | 🔴 OPEN · S |
| Add roster search + position filters | `AssetDropdown` already has **name search** (`:190`) + Core/Depth/Prospect/Pick sections. Position filter is the only net-new ask. | 🟡 PARTIAL |

## §9 Armchair GM (main audit + deep-dive, reconciled)
| Claim | Code | Status |
|---|---|---|
| Franchise chooser: logos `aria-hidden`, buttons named only "Bubble"/"Contender", no team identity | **Accurate on naming.** `TeamMark.tsx` renders `alt="" aria-hidden` img / `aria-hidden` abbr fallback (no accessible name); `TeamSelectModal.tsx:104–133` buttons contain only `<TeamMark>` + the phase text → AT hears "Bubble/Contender", sighted users see logo+phase, no name/abbr. Fix = per-button `aria-label` ("Select Anaheim Ducks — Bubble") + visible abbr. | 🔴 OPEN · S · **P0/P1** |
| Chooser is an overlay with **no** dialog role / focus transfer; Escape returns focus to body | ⚪ **INACCURATE.** `TeamSelectModal.tsx:27` uses `useDialog({label:"Select your franchise"})` → role=dialog, aria-modal, focus trap, **and focus-restore-to-opener** (`use-dialog.ts` restore effect). | ⚪ INACCURATE |
| Asset selection overlay lacks role/aria/focus/inert bg | Same as §8 — `AssetDropdown` (has Escape+scroll-lock, lacks role/aria-modal/focus-trap). | 🟡 PARTIAL · S |
| "Close" control ~15px | `TeamSelectModal.tsx:83` Close is `text-[10px]`, no padding/`.tap-target`. Accurate. | 🔴 OPEN · S |
| Roster tables 10–13 cols, no overflow container, ~24px controls | In `RosterTab.tsx` — verify overflow wrapper + control sizing (mobile-card treatment recommended). Directionally accurate. | 🔴 OPEN · M |
| Verdict is a 655px (~70vh) fixed bottom sheet with no dialog/region semantics | `VerdictSheet.tsx:45` `maxHeight:'70vh'`, own `overflow-y-auto`; toggle is a `button` w/ aria-expanded/label but the sheet has no `role="region"`. Semantics ask is valid; note it's a *non-modal* peek sheet by design (so `role=dialog` would be wrong — `region` + heading is the right call). | 🟡 PARTIAL · S · P2 |
| Setup over-gated; stepper / skip / defaults / resume | Multi-phase flow (mode→draft→re-sign→offer-sheet→workspace). A resume path already exists (`CupRunResumePrompt.tsx`). Stepper/skip/"decide later" is a real UX enhancement. | 🔵 ENHANCEMENT · L · P1 |
| Page > 6,000px partly from appended icon key/glossary | Same root as X2. | 🟡 PARTIAL |

## §10 Fantasy
| Claim | Code | Status |
|---|---|---|
| Draft table min-width 780px; goalie 640px; horizontal scroll | `fantasy/page.tsx:586` `minWidth:780`, `:757` `minWidth:640`, both inside `overflow-x-auto` (`:585,756`). Accurate — mobile player-card row is the right redesign. | 🔴 OPEN · L · P1 |
| Scoring inputs ~56×28; sort G/A controls tiny; checkboxes 13×13; expand 26×26 | `:102` number inputs `px-1.5 py-1 text-[12px]`; `:243` sort buttons `text-[10px]`. Accurate. **But** some row controls already got `.tap-target` (`:721`, 7 usages in file) — partial progress. | 🟡 PARTIAL · S–M |
| Sort/filter into a bottom sheet; desktop table ≥768px | Enhancement consistent with the card redesign. | 🔵 ENHANCEMENT |

## §11 Docket
| Claim | Code | Status |
|---|---|---|
| Filters become 2-col; search should span both | `DocketClient.tsx:222` `.docket-filters` (grid via `globals.css`). Search is first `<label>`; confirm/force full-width span. Accurate. | 🔴 OPEN · S |
| Input/select heights 35–38px | `:226–260` inline `padding:9px 10px; fontSize:12` (~34–38px), no `.tap-target`. Accurate. | 🔴 OPEN · S · P1 |
| "Full Ruling + Player Detail" summary ~15px; source links ~13px | `:330` `<summary>` `fontSize:10`. Accurate — pad to a 44–52px summary. | 🔴 OPEN · S |
| Verdict/winner should lead the card; metadata into expanded state | Card-order redesign; valid. | 🔵 ENHANCEMENT · S |

## §12 Press Box
| Claim | Code | Status |
|---|---|---|
| Calendar links 42×42, just below target | ⚪ **INACCURATE** — `press-box/page.tsx:310–311` are `width:44, height:44`. Already at target. | ⚪ INACCURATE |
| Global nav still wraps | Same as X1. | 🔴 OPEN |
| Appended icon/glossary extends the page | Same as X2. | 🟡 PARTIAL |
| Hover-lift has no touch equivalent (want pressed/selected state) | Valid touch-affordance polish. | 🔵 ENHANCEMENT · S |

## Cup Run / Sim deep-dive
| Claim | Code | Status |
|---|---|---|
| Draft transitions are inaccessible overlays (no dialog role/title/focus; focus behind overlay) | ⚪ **INACCURATE** — `DraftNight.tsx:35` `useDialog({label:"Draft Night"})` → full dialog semantics + focus trap. | ⚪ INACCURATE |
| Offer-sheet market unmanageable; "only pagination visible" | Pagination is the *current design*: `OfferSheetPhase.tsx:128` `role="dialog" aria-modal`, `:90` slice, `:352–380` Prev/Next w/ aria-labels; `ResignPhase.tsx:116` same. Accessibility framing is stale; the *volume* UX critique is fair but a redesign, not a bug. | 🟡 PARTIAL · M |
| Small controls: "Record Season & Advance" 35px, "Abandon Run"/"New Run" ~15px | `CupRunPanel.tsx:57,186` buttons use `px-4 py-2 text-[11px]` — **no `.tap-target`** (unlike ResignPhase/OfferSheetPhase). Accurate; apply the class. | 🔴 OPEN · S · P1 |
| 3-year history too shallow (only made/missed playoffs + Cup) | `CupRunPanel.tsx:135` confirms made/missed+Cup only. Accurate — enrich with points/rank/round/trades if the season record carries them. | 🔵 ENHANCEMENT · M · P1 |
| "Baseline — No Trades" heading is misleading after a prior-year trade | `GmAnalysisTabs.tsx:299` `"Simulated Universe — Baseline (No Trades)"`. Accurate & precise — reword to "No new trades this season" and keep prior deals in the ledger. | 🔴 OPEN · S · P1 |
| No synthesis of trade outcomes → want a persistent "Trade Impact" scorecard | **No "Trade Impact" section exists** (grep-confirmed). `NavTrajectoryChart.tsx` plots NAV over years but there's no at-execution-vs-actual trade scorecard. Genuine feature gap. | 🔵 ENHANCEMENT · L · P1 |
| Result carousel shows "1 / 4" in a 3-year run — unexplained 4th entry | In `SeasonResultsPager.tsx` — label the extra pane (baseline vs rerun). | 🔴 OPEN · S · P2 |
| Final board decision too shallow ("You're Fired", no causal detail) | Board verdict text is thin; tying it to trades/cap/roster decisions is an enhancement. | 🔵 ENHANCEMENT · M |
| Completed run isn't terminal (builder still visible under the board) | Valid end-state polish. | 🔵 ENHANCEMENT · S |

---

## What's already done (don't re-do)
- **Overlay accessibility system** (`useDialog`) on `TeamSelectModal`, `DraftNight`,
  `MemoModal`, Cup resume prompt — role/aria-modal/label/focus-trap/**focus-restore**.
- **44px touch-target system** (`.tap-target`) across ResignPhase, OfferSheetPhase,
  VerdictSheet, fantasy, LineupEditor, armchair page.
- **Teams mobile chart**: top-10 / show-all toggle (the audit's own recommendation).
- **League scatter**: `role="img"` + descriptive `aria-label` + density hexbin.
- **Players**: mobile card layout, wrapping (not truncating) names, own collapsible icon key.
- **Press Box calendar**: already 44×44.
- **Offer-sheet / re-sign phases**: already paginated accessible dialogs.

## Corrections to the audit (verified false)
- Franchise chooser **does** have dialog semantics + focus restore (§9).
- Draft overlays **are** accessible dialogs (Cup Run).
- Press Box calendar is **44×44**, not 42×42 (§12).
- Player *index* names **wrap**, not truncate (§5) — truncation is the profile header only (§6).

## Suggested build order (reconciled with what's shipped)
1. **X1 · Global mobile nav** (`Header.tsx`) — highest cross-cutting leverage, 1 component, every page. *(P1, M)*
2. **Armchair franchise labels** (`TeamSelectModal` + per-button `aria-label`, visible abbr) & **`AssetDropdown` → `useDialog`** — two small, high-value a11y closers. *(P0/P1, S each)*
3. **X2 · Collapse the icon-key grids** in `Footer.tsx` (glossary is already collapsed). *(P1, S)*
4. **Cup Run quick wins**: `.tap-target` on `CupRunPanel` buttons + "No new trades this season" reword. *(P1, S)*
5. **Docket controls** (44px filters, full-width search, padded summary). *(P1, S)*
6. **Player-profile a11y/layout**: STRAND `role="img"`, season-stats 2×3, 44px compare/nav. *(P1–P2, S)*
7. **Fantasy mobile draft-card row** — the biggest single data-surface redesign. *(P1, L)*
8. **Trade-machine sticky summary** + `/teams/{team}` routes + **Trade Impact scorecard** — the three architectural enhancements. *(P1, L)*
9. **Loading/perf (X4)** — real but not testable in this remote env; needs a codespace with NHL egress. *(P0, L)*
