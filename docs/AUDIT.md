# Batch Audit the Batch Audit

# Standing preamble — reuse for each task:
# IMPORTANT NOTE: READ THIS

  * You are making ONE scoped change to this Next.js/TypeScript repo (vitest for tests). 
      Rules:
      - Only touch what this task names. Do not refactor, rename, or "improve" unrelated code.
      - Run 1 task at a time, do not move forward to the next task without user prompt and the preamble in place.
      - Run npm test before and after; report pass/fail counts. If there are no tests for the area, say so.
      - Keep the diff minimal and reviewable — one logical change.
      - If a correct fix would change behavior beyond what's stated, stop and ask instead of guessing.
      - Match the surrounding code style. Do not add dependencies.

  * Line numbers are approximate:
    - Line numbers in tasks are approximate (the code has moved since the audit). Locate the change by the described symbol/behavior, not the literal line number. If you can't find what's described, stop and say so rather than editing the closest-looking line.

  * Typecheck, not just tests:
    - After changes, ensure it typechecks (npx tsc --noEmit or npm run build), not just npm test. Vitest won't catch a type error, and several tasks add imports/types


# Development Outlook Audit
## D1: development-model accuracy refinements

  - File: app/lib/development-profile.ts. Three calibration fixes so elite players separate and the age curve is smooth:

    * Production no longer flattens at the top — currently productionScale (W 90 / C 95) clamps every ≥90-pt scorer to 100, so McDavid and a 92-pt winger read identically. Either raise the scales (~W 110 / C 115 / D 75) or allow a soft curve above 100 so the truly elite tier separates.
    * Graduate the dynasty age penalty (currently a cliff: age >= 33 ? -18 : 0) to e.g. >=35 → -18 · >=33 → -12 · >=31 → -5, so value doesn't drop 18 points on a birthday.
    * Raise the projection-band clamps (buildProjectionBand caps median 140 / ceiling 160) so a 150-pt scorer projects higher than a 135-pt one.
    * Acceptance: two elite producers with different pts no longer both read production 100; no single-year dynasty cliff; elite projections separate; dev-profile tests updated for the intentional shifts; npm test + typecheck pass.

## D2: durability / games-played as a development input
  - Files: app/lib/development-profile.ts (and surface in the panel). Right now an 82-game iron-man and an injury-prone star with the same per-82 pace get identical profiles — availability is ignored.

    * Compute a durabilityScore (0–100) in calcDevelopmentProfile from the per-season games already on the NHL snapshots: roughly clamp(mean(NHL season games) / 82 * 100). (Snapshots already carry games, so no new fetch.)
    * Fold it in modestly: low durability should raise regressionRisk/bustScore and lower confidence a touch; high durability nudges the other way. Keep the weights small so it refines rather than dominates.
    * Add durabilityScore to the DevelopmentProfile type and show it as a Durability MiniScore in the panel's INPUTS group, with a tooltip ("avg games played per season vs 82").
    * Acceptance: two players with identical per-82 pace but different season GP get different durability, risk, and confidence; the panel shows a Durability input; existing dev-profile tests stay green (update any expected numbers that shift, intentionally). npm test + typecheck pass.

## D3: Veteran framing for the Development Outlook
  - Files: app/lib/development-profile.ts, app/components/DevelopmentProfilePanel.tsx. For established veterans the development-oriented metrics ("Breakout") and the prospect-y phase labels don't fit — the relevant questions are decline and runway.

    * Define "established vet" as age >= 29 && careerNhlGames >= 250 (use the same careerNhlGames the profile already computes).
    * Add a small helper estimatePeakYearsLeft(age, position, productionScore, trend): base = peakEnd - age where peakEnd ≈ 30 (F) / 31 (D) / 33 (G); add ~2 years if productionScore >= 85 && trend !== "FALLING", subtract 1 if FALLING; clamp 0–6. Return it on the profile (e.g. peakYearsLeft?: number).
    * In the panel, for established vets only, replace the "Breakout" tile with "Peak Left" showing {peakYearsLeft}yr (greener = more years), and prefer veteran phase labels (PEAK_WINDOW / REGRESSION_RISK / DECLINING) over the prospect ones. Non-vets keep the existing "Breakout" tile unchanged.
    * Acceptance: a 33-yo elite scorer shows "Peak Left" instead of "Breakout"; a 22-yo prospect is unchanged; npm test + typecheck pass.

## D4: Development Outlook glossary / key
  - File: app/components/DevelopmentProfilePanel.tsx. The panel has no explanation of its metrics. Add a collapsed-by-default "? Outlook key" toggle (mirror the existing "? STRAND trait guide" pattern) that expands a compact legend defining every term shown:

    * Now — current-season value · Dynasty — long-term keeper value (age-discounted) · Breakout / Peak Left — breakout probability (young) or estimated peak years remaining (vets) · Risk — regression risk · Arc — boom/bust signal · Boom / Bust — upside vs downside scores · Inputs (Prod / Role Δ / Pedigree / Exp / Durability) — the components feeding the scores · Projection — floor–ceiling pts/82 with median · phase / trend / sample conf — development stage, scoring trajectory, and how much NHL sample backs it.
    * Keep it one collapsible block, default closed, so it doesn't bloat every card.
    Acceptance: every metric on the card is defined in the collapsible key; closed by default; npm test + typecheck pass.




## Task 0: apply five independent, low-risk bug fixes. Do not refactor — each is a targeted change. Run the test suite after.

  1. BreakdownTable crash — app/armchair-gm/page.tsx (~lines 2042/2046/2050): a.ptsPace.toFixed, a.avgTOI.toFixed, and a.capHit.toFixed are called unguarded for non-Pick/non-G assets. Guard each with ?? 0 like the adjacent xG cell, so a stats-less skater can't crash the table.
  2. Settings cap-ceiling validation — app/api/admin/settings/route.ts (~line 35): reject non-finite, ≤ 0, or absurd (>120) cap-ceiling values before persisting; add the same  guard where getLiveCapCeiling reads it (app/api/evaluate/route.ts ~105).
  3. import-draft-class overwrite — app/api/admin/import-draft-class/route.ts (~line 108): on an existing id, only apply ELC defaults (capHit/years/clauses) when the existing row is actually a prospect; never overwrite a row that already has a real capHit or NMC/NTC.
  4. clear-cache missing keys — app/api/admin/clear-cache/route.ts (~line 15): also delete cache:pointshares, cache:mp_skaters, cache:mp_goalies, cache:nhl_goalie_summary_stats, and cache:prospect_enrichment:v1.
  5. trade-block keying — app/api/admin/trade-block/route.ts: validate status against the 4-value enum (requested|available|blocked|untouchable, plus the "clear" delete sentinel), and key rows by name so they match how app/api/league/players/route.ts reads blockMap by player name.

(Note: the cross-team duplicate dedup in app/api/league/players/route.ts is already in place — verify it exists; do not re-implement.)

## UX and UI Polish

  ### Task U1: GSAX fix must persist on BOTH league routes (supersedes the earlier single-route GSAX task)

      The players page fetches /api/league (bare route), whose goalie-stats resolution at app/api/league/route.ts:1243 has the same bug as app/api/league/players/route.ts:879: it prefers NHL_GOALIE_STATS (which hardcodes gsax: 0) over the MoneyPuck goalieMap (real gsax = xGoals − goals), so every goalie's GSAX is 0. Apply the merge fix to both routes so GSAX always comes from goalieMap when available, NHL source as fallback for save%/games:

      const nhlG = NHL_GOALIE_STATS.get(`id:${p.id}`) ?? NHL_GOALIE_STATS.get(goalieSlug);
      const mpG  = goalieMap.get(goalieSlug);
      const goalieStats = isGoalie
      ? (mpG || nhlG ? { ...(nhlG ?? {}), ...(mpG ?? {}), gsax: mpG?.gsax ?? nhlG?.gsax ?? 0 } : null)
      : null;

      (use the local slug variable name each file already has). Acceptance: curl …/api/league and …/api/league/players, filter goalies — top starters (Hellebuyck/Sorokin/Vasilevskiy) show non-zero gsax. npm test + typecheck pass.

  ### Task U2: freeze background scroll on ALL modals

    Several modals let the page scroll behind them. Create one shared hook useBodyScrollLock(isOpen: boolean) (sets document.body.style.overflow = "hidden" while open, restores the prior value on close/unmount) and apply it in every modal/overlay component when its open state is true:

        app/components/TradeProposal.tsx (overlay ~line 323)
        app/components/LedgerDropdown.tsx (~57)
        app/components/TradeBlockPanel.tsx (~174)
        app/components/AssetDropdown.tsx (~156)
        app/components/TradeHistoryBar.tsx SaveModal (~18)
        app/armchair-gm/page.tsx team-select (~857) and front-office memo (~952) modals — there's already a freeze attempt at ~line 141; reconcile to use the shared hook rather than duplicating.
        Do NOT lock for the ContractSyncer toast (it's a corner notification, not a modal). Acceptance: opening any modal prevents the main page from scrolling; closing restores scroll position. npm test + typecheck pass.

  ### Task U2 Revisited: fix the page-freeze bug — bottom sheet must not lock scroll, and consolidate all scroll-locks into one reference-counted hook

    Bug: the page becomes unscrollable (but still clickable) after loading trades. Two causes:

      app/armchair-gm/page.tsx:743 auto-opens the verdict bottom sheet (setVerdictOpen(true)) on every audit, and the freeze effect at line 143 includes verdictOpen in its lock condition — so the partial bottom sheet locks the whole page.
      Multiple components write document.body.style.overflow directly with no coordination (armchair-gm:141-159, LedgerDropdown:18-28, TradeBlockPanel:45-50, and any others), so their lifecycles clobber each other.

    Fix:

      Remove verdictOpen from the scroll-lock condition in app/armchair-gm/page.tsx (line 143). The verdict bottom sheet is non-blocking and must not freeze the page. Only true blocking modals should lock: showTeamSelect, tradeBlockOpen, tradeRequest?.length.
      Create one reference-counted lock — a module e.g. app/lib/use-body-scroll-lock.ts exporting useBodyScrollLock(isOpen: boolean). Back it with a module-level counter: on lock, increment; when it goes 0→1, set document.body.style.overflow = "hidden" plus scrollbar-gutter padding; on unlock, decrement; when it goes 1→0, restore the original values. This makes overlapping modals safe.
      Replace every direct document.body.style.overflow write with useBodyScrollLock(isOpen) and delete the standalone effects: armchair-gm:141-159 (team-select/trade-block/trade-request only), LedgerDropdown, TradeBlockPanel, AssetDropdown, and TradeHistoryBar's SaveModal / TradeProposal modal. No component should touch document.body.style.overflow directly anymore.

Acceptance: loading/auditing several trades in a row never leaves the page unscrollable; the verdict bottom sheet expands without locking scroll; opening any blocking modal locks scroll and closing it (even with another modal open) restores correctly. npm test + typecheck pass.

  ### Task U3: Player Analytics rework — fill the dead space + real pagination

      File: app/players/page.tsx. Two problems visible in desktop view: large empty horizontal space, and a "SHOW ALL" dump instead of pagination.

        Collapsed rows: the grid 32px 36px 1fr 80px 72px 64px lets the 1fr name column absorb all slack, leaving a big gap before the STRAND/PRIMARY/SECONDARY columns. Rework into a denser, sortable desktop table that uses the width — surface several stat columns inline (the sort keys already exist: PPG, P/82, OPS, DPS, TOI, Age, Cap, and GSAX/SV% for goalies) as proper aligned columns, and wire the existing sticky header (currently empty <div/> cells) to label and sort them.
        Expanded view: the two-column expanded-player-grid leaves the left half blank while strand/dev/contract pile on the right. Rebalance — e.g. left column: stat grid + OPS/DPS/PS + contract + Development Outlook; right column: STRAND profile + timeline + contract projection — or make the lower panels full-width so no column is empty.
        Pagination instead of "SHOW ALL": replace the per-section show-all toggle with real pagination — page size = the section cap (25 forwards / 10 defence / 5 goalies, or a uniform 25), with ‹ Prev · Page X of N · Next › controls; reset to page 1 whenever search/position/team/sort changes.
        Keep the broadsheet styling and the expand-on-click behavior. Acceptance: no large empty gaps on desktop at any width; each section pages through its players with Prev/Next; npm test + typecheck pass.

  ### Task U4: Make the NAV breakdown reconcile to the headline NAV
      In the HOME/PARTNER panels of app/armchair-gm/page.tsx (and the matching OFF/DEF/AGE/CAP MicroBar breakdown in app/components/AssetCard.tsx), the four components can sum to less than the displayed total when the franchise/career floor or historical floor is active — e.g. Scheifele shows NAV 353 but OFF +211 · DEF +33 · AGE −40 · CAP +101 = 305, a 48-pt gap with no explanation. Compute the residual adj = Math.round(total) − (off + def + age + cap) and, when Math.abs(adj) >= 1, render it as an extra labeled item in the breakdown (label "FLOOR", same bar/number styling as the others, with a title like "Franchise/career floor applied"). After this, the visible components always add up to the headline NAV.

  ### Task U5: Strengthen the active-tab indicator.
      In app/components/Header.tsx, the active nav item is currently distinguished only by a filled vs hollow diamond (◆/◇) in the same ink color, which is easy to miss. Give the active tab a stronger cue — add a color change (e.g. the red/ink accent) plus an underline or heavier weight — while keeping the diamond. The current page must be obvious at a glance.

  ### Task U6: Explain "NAV" at the point of use
      "NAV" is the dominant number on every asset card but is only defined in the glossary at the bottom of the page. Add a title tooltip (e.g. "Net Asset Value — the player's tradeable value") to the NAV label wherever it's rendered on the asset cards (app/components/AssetCard.tsx, and the per-card NAV labels in app/armchair-gm/page.tsx). No layout change — tooltip only.
  
  ### Task U7: Raise sub-11px type in the dense zones to the 11px floor
      Several spots render below the project's stated 11px minimum and are hard to read: text-[6.5px] OPS/DPS/PS labels in app/components/AssetCard.tsx (~lines 302/308/314), and any inline fontSize of 9px/10px or text-[9px]/[10px] in the bench/scratch chips and NAV-breakdown values. Bump these to the text-2xs token (11px). Don't touch genuinely decorative kickers if raising them breaks the masthead layout — only the data-bearing labels.

Acceptance: the NAV breakdown's visible parts sum to the headline NAV (incl. floored players); the active nav tab is clearly distinct; hovering a NAV label shows its definition; no data label renders below 11px; npm test and typecheck pass.

## Valuation Audit and Card Audit

  ### Task R0: fix overvaluation of low-sample depth players (the Heinola case)

  - File: app/lib/xnav-engine.ts. A 25-yo depth D — 5 GP, 1 pt, 14:11 TOI, $0.8M — currently values at NAV 75, which is far too high for an AHL/NHL tweener (realistic ~15–25). The breakdown shows the inflation is CAP +43 (illusory cheap-contract surplus) plus a +28 residual. Root cause: the cap-surplus component credits a full bargain even on a tiny sample, and the existing "replacement callup" clamp (~line 756: age>=26 && games<14 && toi<9 && draftOverall==null) is too narrow — it misses 25-year-old former draftees entirely.

  * Fix:

    Scale the positive cap surplus by an establishment/sample confidence factor, replacing the narrow callup clamp with a smooth version. The bargain on a cheap deal is only real if the player is an established contributor, so gate on both season sample and multi-year baseline — not age/draft status:

    establishment = clamp(
      Math.max(
        games / 40,                                   // this-season sample
        (baselinePtsPace ?? 0) / (isD ? 30 : 45)      // multi-year track record
      ), 0.2, 1.0)

    - Apply it to the positive part of capTotal only (never make a negative/overpaid contract look better). This cuts Heinola's +43 to a modest number while leaving high-baseline players untouched.
    - Critically — do not over-damp the established-but-injured case. An elite player returning from injury (e.g. 5 GP this season, 90-pt multi-year baseline) must keep his cap surplus: the baselinePtsPace term in establishment handles this (strong baseline → factor ≈ 1.0). Heinola fails both signals (few GP and weak baseline) → heavily damped; a star fails only the GP signal → barely damped.
    - Ensure no floor lifts a non-qualifying player. A 5-GP / 1-pt / 14-TOI D must not receive any franchise/career/pedigree floor. If the breakdown's residual (the "FLOOR" line) is non-zero for a player who doesn't meet the franchise-floor criteria, trace it — it's the displayed-DEF vs internal-DEF mismatch, which Task R1's reconcile should also address. The headline NAV must not include an unearned floor lift.
    - Add a characterization test with two pinned cases: (a) Heinola-type — 25-yo D, ~5 GP, ~1 pt, 14 TOI, $0.8M, weak baseline → NAV < 30 and a modest CAP component; (b) established-but-injured — high-baseline player with ~5 GP → cap surplus essentially unchanged vs. full sample. This locks in the fix and guards against over-damping.

  - Acceptance: Heinola-class profiles land ~15–30 (not 75); established players (full sample or injured-with-strong-baseline) are unchanged; npm test + typecheck pass.

  ### Task R1: refine the expanded player card — remove duplicate metrics, declutter, rebalance

  - File: app/players/page.tsx (the ExpandedPlayer view), and the shared app/components/StrandDisplay.tsx. Goal: show each metric once in its best form. No data removed, just de-duplicated.

    * Drop the duplicate PTS. "SEASON POINTS — 130 total" duplicates the stat grid's PTS 130. Remove the standalone Season Points card (keep PTS and PTS/82 in the grid).
    * De-dupe the STRAND. The helix and the OFFENSE/DEFENSE bar block render the identical eight values (OPS/xG/NOIV/TOI+ and DPS/SUPP/Usage/OZ). Keep the helix as the primary visual (it already carries the labeled numbers) and remove the separate OFFENSE/DEFENSE bar block — or, if you prefer the bars, shrink the helix to a compact emblem. This lives in the shared StrandDisplay, so it applies on the trade surfaces too — that's fine (the duplication exists there as well); if you want it players-page-only, gate the bar block behind a prop.
    * Collapse the per-card "STRAND — trait guide" glossary. It's static reference text repeated on every player. Put it behind a small "?" toggle (default collapsed) or link to the page-bottom methodology glossary — don't render the full legend inline on every card.
    * Drop the redundant OPS/DPS pills if the helix/bars already show OPS and DPS (currently OPS/DPS appear 3×: pills + bars + helix). Keep PS if it's not shown elsewhere.
    * Compact the CONTRACT PROJECTION block — the large flat green rectangle ("+668", one-bar "Yr 1") reads as an empty/unfinished chart for short deals. Make it a compact stat (e.g. "Cap surplus +668 NAV") or a small sparkline rather than a full chart frame.
    * Rebalance columns so the left column doesn't dead-end empty while the middle/right run long — reflow content (e.g. move the 3-year scoring or rationale) so no column bottoms out with large blank space.

  - Acceptance: no metric (PTS, OPS, DPS, the STRAND set) appears more than once; the trait-guide glossary isn't rendered in full on every card; no large empty column; npm test + typecheck pass.

  ### Task R2 (follow-up feature): projected next contract in the Contract Projection / Timeline block

  - The fair-market AAV is already computed in app/lib/xnav-engine.ts — fmvDollars = projectedCapCeiling * fmvCapPct (skaters ~line 557, goalies ~line 314). Surface it as a projected next contract.

    * Return it from the engine: add fmvAav?: number to XNAVResult and set it to the year-1 fmvDollars (current-cap fair AAV) in both calcSkaterNAV and calcGoalieNAV. Don't change any existing NAV math — this is a new output only.
    * Add a term heuristic (a small pure helper): based on age-at-signing, value tier, and isRFA — e.g. RFA elite ≤25 → 7–8 yr; prime UFA 27–30 → 4–6 yr; 31–33 → 2–3 yr; 34+ → 1–2 yr; depth → 1–2 yr. Keep it a simple, documented table.
    * Surface it in the Contract Projection (players page) and the "Timeline" block (Armchair GM) as: "Projected next: $X.XM × Yyr (RFA/UFA)", labeled clearly as an estimate. Define "ideal" as the fair-market midpoint (not max-player or min-team) and say so in a tooltip.
    * Add a characterization test asserting fmvAav is sane for a few archetypes (elite forward in the $11–14M range, depth player near league min, etc.) so the new output is pinned.

  - Acceptance: every skater/goalie card shows a plausible projected next AAV × term; existing NAV values are unchanged (Phase 1 NAV tests stay green); npm test + typecheck pass.

  ### Task R3: fix defensive-D undervaluation (the Parayko case)
  - File: app/lib/xnav-engine.ts (calcSkaterNAV). A shutdown top-pair D — ~22+ TOI, modest points (~25–30), strong suppression, ~$6.5M on a long deal — currently computes to negative NAV, yet the real market pays a mid/late 1st + a prospect (≈150–180 NAV on our scale). Two stacked biases cause it:

    * trueMarketValue is offense-weighted, so a points-light D scores low. offTotal (points power curve) is small for Parayko, and defTotal is only moderate after the deployment terms (toiD, qocVal, suppression) and is then squeezed by the 80-cap asymptote — so a genuine 22-min shutdown D's true value is under-credited.
    * The cap sigmoid + floor then drag him negative. With a low trueMarketValue, the D fmvCapPct (logistic, MIDPOINT = isD ? 120) maps to an FMV below his $6.5M cap → negative cap surplus → negative capTotal. And the cornerstone floor can't save him: qualifiesEliteDefender requires pts >= 65 (an offensive-D bar), so a low-point shutdown D qualifies for no floor at all.

  - Fix (do both, with a guardrail):

    * Credit shutdown deployment + suppression for high-TOI D. For isD && toi >= 22, increase the defensive contribution from real matchup/suppression signal — deployment (toiD/qocVal), xgaRelTM suppression, and pairDriverScore — so 22+ minute matchup value registers independent of points. Raise (or soften) the defTotal asymptote enough that a true top-pair shutdown D lands in a realistic range rather than being capped at depth-D levels.
    * Add a shutdown-top-pair-D floor to the cornerstone floor. Extend the qualifier: in addition to the existing pts >= 65 offensive-D path, qualify a D as a top-pair anchor when toi >= 22 && (strong defensive signal: e.g. dps high OR xgaRelTM strongly negative OR qocIndex high). Give it a floor around ~130–150 (below the elite-offensive-D floors of 160–240, since pure shutdown < elite two-way, but enough that a legit top-pair D can't read negative and lands near "mid-1st + prospect").
    * Guardrail — don't over-credit weak D. The shutdown credit/floor must require both high TOI and a genuinely strong defensive underlying (suppression/dps/QoC), not minutes alone. A low-point D with mediocre underlying numbers (sheltered, bleeding chances) must stay low. This is the mirror of R0: R0 stopped illusory value for unproven cheap players; R3 restores real value the model misses for shutdown D — but neither should reward a player the underlying data doesn't support.

  - Add a characterization test with three pinned cases:

    * Parayko-type — 22+ TOI, ~28 pts, strong xGA suppression, $6.5M × long term → NAV clearly positive and ≥ ~120 (mid-1st + prospect territory), not negative.
    * Weak low-point D — low TOI, weak/negative underlying, similar points → stays low/negative (guardrail holds).
    * Elite offensive D (Makar-type, high pts + 22+ TOI) → unchanged vs. current (no regression to the existing floor path).

  - Acceptance: a shutdown top-pair D no longer reads negative and lands near his real market return; weak low-point D unaffected; offensive D unchanged; existing NAV characterization tests stay green (update only the intentionally-shifted shutdown-D values); npm test + typecheck pass.

## Task 1a: 
- Write golden/characterization tests for calcNAV in app/lib/xnav-engine.ts covering a representative set: an elite forward, a top-pair D, a starting goalie, a 1st-round pick, an ELC prospect, a fringe callup, and a retained-salary case. Snapshot the full XNAVResult for each. Do NOT change engine code — these pin current behavior.

## Task 1b: 
- Write integration tests that POST representative trades to /api/evaluate (import the route's POST handler directly, as __tests__/evaluate-route.test.ts already does) and assert status, the flags categories/severities, and metrics. Cover: a fair swap, a cap-ceiling breach, an untouchable, a contender-needs-futures case, and a lopsided overpay. No route changes.

## Task 1c: 
- Write tests for the /api/league/players roster assembly: a player on two teams' feeds dedups to one, DB-injection augments without duplicating, and name/stat matching attaches the right stats. Mock the fetches; assert the emitted player list. Do NOT change route logic

## Task 2:
Task: add the Development panel to the players page, switch its data source to the canonical routes, and paginate the table to top 25 forwards / 10 defencemen / 5 goalies with a "show all" toggle per section. File: app/players/page.tsx. Keep all existing styling and the expand/collapse behavior; this is additive plus a fetch swap.

1. Imports + type.

    Add: import { DevelopmentProfilePanel } from "@/app/components/DevelopmentProfilePanel"; and import type { DevelopmentProfile } from "@/app/lib/development-profile";
    Add developmentProfile?: DevelopmentProfile | null; to the Player interface. (The API already returns this field at runtime; it's just missing from the local type.)

2. Fetch swap — use the same routes as the trade machine (aligns dynasty/NAV numbers and drops the drift-prone bare route). Replace the useEffect that does fetch("/api/league") with:

useEffect(() => {
  Promise.all([
    fetch("/api/league/teams").then(r => r.json()),
    fetch("/api/league/players").then(r => r.json()),
  ])
    .then(([td, pd]) => {
      setPlayers((pd.players ?? []).filter((p: Player) => p.position !== "Pick"));
      setTeams(td.teams ?? []);
      setLoading(false);
    })
    .catch(() => setLoading(false));
}, []);

3. Development panel in the expanded row. In ExpandedPlayer, just before the final closing </div> of the .player-expanded-panel, add (skaters only — the panel itself returns null for G/Pick, so the guard just avoids an empty header):

{player.position !== "G" && player.developmentProfile && (
  <div style={{ marginTop: 12, background: "#e4d8b8", border: "1px solid #b8a070", padding: "8px 12px" }}>
    <div style={{ fontSize: 11, color: "var(--ledger-ink-faint)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
      Development Outlook
    </div>
    <DevelopmentProfilePanel asset={{ ...player } as any} />
  </div>
)}

4. Pagination — three capped sections.

    Add state: const [showAllF, setShowAllF] = useState(false); and the same for showAllD, showAllG. Defaults collapsed.
    Reset them whenever the view changes, so narrowing the list never strands the user on an expanded page:

    useEffect(() => { setShowAllF(false); setShowAllD(false); setShowAllG(false); },
      [search, posFilter, teamFilter, sortKey, sortDir]);

    From the already-sorted skaters, derive const forwards = skaters.filter(p => p.position !== "D"); and const defence = skaters.filter(p => p.position === "D");. goalies is already sorted by GSAx.
    Caps: forwards 25, defence 10, goalies 5. Render forwards.slice(0, showAllF ? forwards.length : 25), etc. Rank within each section (i + 1).
    Replace the current single "Skaters" section and the three goalie tier sub-sections with three sections: Forwards, Defence, Goalies (a single flat list, top-5 by GSAx — the STARTER/TANDEM/BACKUP tier is already shown per row by ArchetypeBadge, so the tier sub-headers are redundant once capped).
    Section visibility by posFilter: ALL → all three; F → Forwards only; D → Defence only; G → Goalies only.
    Under each section that has more rows than its cap, render a full-width toggle button (reuse the existing .filter-btn style) that flips the matching showAll*:
        collapsed label: Show all {n} forwards ▾ (etc.)
        expanded label: Show top 25 ▴
        Example:

    {forwards.length > 25 && (
      <button className="filter-btn" style={{ width: "100%", padding: "8px" }}
        onClick={() => setShowAllF(v => !v)}>
        {showAllF ? "Show top 25 ▴" : `Show all ${forwards.length} forwards ▾`}
      </button>
    )}

5. Polish (UX). The sticky desktop column header (the grid of empty <div/> cells, ~line 750) currently shows no labels. Populate it with the real column labels matching the row grid (Rank · [headshot] · Player · Helix · primary stat · secondary stat) so a desktop user scrolling a long list keeps a column legend. Update the count line so it reflects forwards + defence + goalies.

Acceptance: With no filters, the page shows ≤25 forwards, ≤10 defencemen, ≤5 goalies, each with a working "show all / show top N" toggle; expanding a skater row shows the Development Outlook panel; expanding a goalie shows no dev panel; dynasty/stat numbers match what the trade machine shows for the same player. npm test still passes.
