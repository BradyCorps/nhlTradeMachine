# Dev Notes — The Hockey Ledger

## Phase 1: Ship-Ready Polish (Complete)

### Component Deduplication
- Consolidated duplicate utility functions into `app/lib/display-utils.ts`:
  `navColor`, `fmtSigned`, `formatCapHit`, `seasonTotal`
- Replaced inline copies across AssetCard, AssetDropdown, TugBar, GmAnalysisTabs,
  QuickTradeMachine, ResignPhase, OfferSheetPhase, admin/trades, PlayerTimeline
- Canonical `buildAssetTraits` / `computeStrandType` / `buildGoalieStrandTraits`
  now shared from StrandView.tsx — players page FullStrand uses them

### AA Accessibility Fixes
- Keyboard navigation (Enter/Space) on player rows, VerdictPanel flags, trending cards
- ARIA: `role="dialog"` + `aria-modal` on LedgerDropdown/AssetDropdown modals,
  `role="tablist"` + `aria-selected` on player page tabs,
  `aria-label` on search inputs, `aria-expanded` on expandable elements
- Contrast: `--ink-faint` adjusted from `#9a7d58` to `#6e5a3d` (~4:1 ratio)
- Alt text: team logo alt from raw ID to team name
- Trending card font sizes bumped from 6-8px to 8-11px minimum

### Contract Tab Enhancement
- NavBreakdown component in PlayerTimeline showing OFF/DEF/AGE(YNG)/CAP/UPS/NOIV
  contribution bars — explains *why* the FMV is what it is
- Rendered between "Current deal" and "Trade value by contract year" sections

### Trending Player Cards
- Reduced from 12 to 10 cards
- 2-column grid layout (was 3 columns)
- Fixed expand UX: expanded panel renders as full-width element below the row
  instead of inside the card (no more row-stretching siblings)
- Expanded panel shows gravity field orbital diagram on left,
  advanced stats + STRAND DNA + NAV components + market value on right
- Exported `FieldDiagram` from GravityField.tsx for reuse

### Data Fix: Plus/Minus
- MoneyPuck CSV (primary stats source) doesn't include plusMinus
- Added merge logic in roster-assembly.ts to overlay plusMinus from NHL API
  stats even when MoneyPuck is the primary source for the player

### Footer
- Added missing glossary icons: Untouchable (◈), Trade Block (◉), Find Partners (⚡)

---

## Phase 2: Gravity as Brand Identity (Complete)

### 2.1 Gravity into X-NAV
- Gravity residual computation in `calcSkaterNAV` — isolates hidden value beyond NOIV
  `residual = force - (noivLift × playerMass)`, scaled ×80, capped [-20, +35]
- Added `grav` and `isRFA` fields to `XNAVResult` in both xnav-engine and trade-types
- GRAV bar in PlayerTimeline NavBreakdown
- GRAV column in trending expanded panel NAV Components grid

### 2.2 Visual Motifs
- Gravity `TierIcon` badges on player rows (STAR and SUPERMASSIVE tiers)
- Gravity `TierIcon` badges on AssetCards in the trade machine
- Orbital ring SVG motifs flanking the homepage masthead subtitle
- Gravity entry added to the players page icon key legend

### 2.3 Gravity Leaderboard Tab
- Sort toggle ("By X-NAV" / "By Gravity") on trending section
- Gravity sort: ranked by `force` from GravityProfile
- Card header shows gravity force score (color-coded by tier) when in gravity mode
- Updated trending section copy to reference gravity sorting

### 2.4 Shareable Gravity Cards
- `GravityCard` component — JFresh-style 420px player card with newspaper aesthetic
- Shows: player identity, gravity tier + force, stats, field diagram, mechanism bars,
  NAV components, contract, market AAV, branded footer with orbital motif
- PNG export via html2canvas (client-side, no server)
- Accessible via "Share Card" sub-view in the Gravity tab on player analytics page
- Analysis/Share Card toggle within the gravity tab

### Data Fix: Unsigned RFA/UFA Inflation
- Players with `yearsRemaining === 0` and `capHit ≈ 0` (unsigned RFAs like Robertson)
  had massively inflated CAP surplus because FMV minus $0 = pure surplus
- Fix: project unsigned players onto their FMV AAV as their cap hit, yielding ~0 surplus
- Applied to both skater and goalie NAV paths
- "Full Profile" link in trending expanded panel renamed to "Player Analytics" (no
  individual player pages yet — future Phase 3 work)

## Phase 3: Gravity Engine v3 "Spacetime" (Phase A complete)

### Full rewrite — zone-mass model (replaces v2 multiplicative engine)
- Player modeled as a mass distribution across hockey's three zones:
  m_OZ (offensive well), m_NZ (neutral/transition well), m_DZ (defensive dome —
  repulsive curvature)
- Every input z-scored WITHIN POSITION (D vs F calibration constants) then
  tanh-squashed to a bounded mass — a defenseman is measured against defensemen
- Additive assembly: force = 0.45·m_OZ + 0.30·m_NZ + 0.25·m_DZ, bounded (−1, +1)
  by construction — no more multiplicative blowups (Fox 4.87 → ~0.67)
- Key NZ signal: transition displacement — EDGE zone time minus deployment
  expectation (starts in his own end, lives in the O-zone = measured transition
  gravity; the Quinn Hughes signal)
- Missing inputs are SKIPPED, never scored as zero (data gap ≠ below-average play)
- navResidual: OZ creation shape + NZ transition only — the lift input and the
  entire DZ dome are already priced inside X-NAV (offTotal NOIV, defTotal
  defRate/DPS, SLF for PK time). X-NAV consumes navResidual × 45, capped [−20, 35]
- partnerIndependence is now a 0–1 damper on the lift input (not a force
  multiplier); pairDriverScore gives D direct with/without evidence
- Tier cutoffs recalibrated for the bounded scale: SUPERMASSIVE ≥ 0.55,
  STAR ≥ 0.40, MAIN_SEQUENCE ≥ 0.22, SATELLITE ≥ 0.08, ASTEROID ≥ −0.22
  (wide band — position-normalized scale puts half the league below zero),
  BLACK_HOLE < −0.22 (reserved for genuinely caving fields)
- UI: FieldDiagram is now a three-zone rink strip (DZ|NZ|OZ) with ring density
  per zone mass; dome renders dashed (repulsion), caved zones render red.
  ComponentPanel shows the three masses with qualifiers; SignalPanel shows
  confidence + partner independence. GravityCard shows zone-mass bars.
- New __tests__/gravity.test.ts: archetype shape fixtures (Fox two-zone basin,
  Hughes-type NZ-dominant, shutdown-D dome, black hole, grinder), bounds,
  residual exclusions, signal-quality behavior
### Phase B+C: Spacetime lattice rink (complete)
- FieldDiagram now renders a warped lattice grid: 24×10 vertices displaced by
  the three zone masses with inverse-square falloff + softening (GR rubber-sheet)
- Wells pull the grid inward (pinch), the DZ dome pushes it outward (bulge),
  negative masses invert — the curvature IS the analysis
- Displacement capped at 11px (below the 12.3px cell pitch) so the lattice can
  never fold over itself; softening keeps the core finite
- Mass cores: filled node for wells, ring (hollow) node for the repulsive dome,
  red for caved zones; halo scales with mass
- Integration was free: players gravity tab, GravityCard share card, teams page
  gravity leaders, and trending expanded panel all consume FieldDiagram

## July 20 Audit — Round 1 (docs/July20_Audit_Claude_Code/AUDIT.md)

### F0 — Fantasy Hockey Tools (v1 shipped, workshop pending)
- New /fantasy page: points-league draft board (G×6 A×4 PPP×2 HIT×0.6 BLK×1
  per-82), VBD vs positional replacement (12-team build: C24/W48/D48),
  regression radar (G vs xG finishing luck: buy-low / sell-high), keeper corner
  (age ≤23), goalie board by GSAx. Position filters + search, AA-conscious
  (real buttons, aria-pressed, scoped table headers, visible loading state)
- Feature Three lead tile on / ; Fantasy tab added to shared Header nav
- SOG scoring deferred until a skater shots-on-goal feed exists

### Completed audit items
- G2: all ™ marks removed; X-NAV = Extended Net Asset Value unified across
  MetricTip, Footer glossary, WelcomeModal, home ENGINE copy; tooltip titles
  updated ("NAV" labels now defined as X-NAV shorthand)
- HD1: header simplified — subtitle line removed, "Est. 2026 — Vol. I —
  {date} Data Online" moved below the title; Fantasy nav added
- H1: hero setdown end now viewport-relative (85vh CSS animation-range +
  matching motion fallback); ScrollSnap also corrects overshoot (negative
  stack top) so the masthead can't rest cropped
- H2: editorial replaced with audit copy; centered closing line added
- TM2: SEASON.firstTradablePickYear (2027) — 2026 picks no longer exist as
  assets; pick inventory window is [2027..2031]
- AG1: Team Select modal — ink-black active fills replaced with paper +
  red-rule accent (mode picker and team tiles), aria-pressed added
- AG2: cup-run rollover now conveys traded firsts — synthetic draft class
  remapped from standings-slot team to current pick owner
- AG4: new app/lib/name-normalize.ts; DraftNight accepts excludeNames and
  filters the prospect board diacritics-insensitively (Björck ≡ Bjorck), so
  already-rostered prospects can't be drafted twice

### Round 2 — Home IA + G1 (complete)
- H10: two-page IA — /glossary (the "what": grouped icon key, all definition
  sections, gravity tier key + zone-mass note) and /methodology rewritten as
  the "why/how" narrative (X-NAV, Gravity — formula stays proprietary, STRAND,
  GM Audit, sim engine, data pipeline) with Buy Me a Coffee CTA
- G1: shared Header/Footer now on /glossary, /methodology, /players/[playerId]
  (trade-machine already had them via QuickTradeMachine)
- H4-H6/H8: definitions verified against current code — duplicate X-NAV row
  merged, GRAV/OFF/DEF/UPS components documented, AGE/YNG unified, trade-logic
  copy now says X-NAV; gravity tier descriptions rewritten for the v3
  zone-mass scale
- H5: icon key grouped into Asset Flags / Gravity Tiers sub-sections in both
  Footer and /glossary; label text bumped 9→10px, definitions ink-body
- H7: STRAND glossary lives in /glossary (Footer keeps the collapsible copy);
  HD Finish and 20+ Bursts definitions added
- H9: Data & Sources rewritten as acknowledgements with active links (NHL,
  MoneyPuck, CapWages, Hockey-Reference), rendered as real anchors
- H3: trending expand/collapse affordance readability bump (10px, body ink)
- Footer nav now links Methodology / Glossary / Icon Key to real routes

### Round 3 — PA1/PA4/PA10 + header unification (complete)
- Header: "Live Data Feed Active" row merged into the Est. line — now reads
  "Est. 2026 — Vol. I — {date} Data Feed Active" with an inline pulse dot;
  nav compacted (11px, tighter tracking/gap) so 7 items fit at 1024px;
  /teams container widened 5xl→6xl to match players/trade-machine
- PA1: /players index is light — tabs are STATS | CONTRACT | OUTLOOK plus an
  "Advanced Analytics →" link to /players/{nhlid}; STRAND, Player Card, EDGE,
  and Gravity tabs removed from the index (~90 lines of dead imports pruned)
- PA4: contract line removed from the Stats tab (lives in Contract tab)
- PA10: gravity share-card sub-view retired (analysis only); rink now renders
  on the off-white paper-card sheet; tier/term definitions linked from the
  gravity panel to /glossary#icon-key
- Dossier upgraded: /players/{nhlid} now renders STRAND DNA (new
  PlayerStrandPanel client component — the canonical strand surface) above
  the gravity field; STRAND canaries re-pointed at the panel

### Round 4 — PA2 modern roles (complete)
- New app/lib/player-roles.ts: twelve audit-specified roles derived from
  EDGE tracking (speed, bursts, zone-time displacement), on/off splits,
  deployment, physical play, and creation mix. Evidence-gated scoring
  (0-1 ramps, primary ≥0.45, optional secondary within 0.18) — missing
  data lowers a score, so a role claim always has proof; <15 GP → null
- Legacy display labels removed: OFF D / SHUTDOWN / TWO-WAY chips and the
  index's use of classifyForwardArchetype (that function remains as internal
  valuation metadata only — not user-facing)
- ArchetypeBadge on /players now renders the modern role icon with the full
  label+blurb as tooltip/aria; goalies keep STARTER/TANDEM/BACKUP tier chips
- Dossier (/players/{nhlid}) gains a Role plate: primary + secondary role
  with the identity blurb, computed server-side
- "Modern Roles" glossary section added (Footer accordion + /glossary)
- __tests__/player-roles.test.ts: 11 tests pinning archetype fixtures
  (Hughes→Puck-Moving Anchor, Slavin→Perimeter Lockdown, shutdown C,
  NZ Engine, HD Distributor, Volume Shooter, Forecheck Monster) + contracts

### Round 5 — PA3 goalie EDGE (complete)
- New app/lib/goalie-edge.ts: nightly capture of the audit's EDGE goalie
  endpoints (goalie-landing + 4× shot-location top-10 all + goals-against
  high) into one nhl_snapshots row (source "goalie-boards"); tolerant
  shape-based parser so an NHL schema shift degrades to "no data"
- Cron /api/cron/nhl-feed now captures the boards every night alongside
  the rotating skater snapshots
- Roster assembly joins latestGoalieBoardsMap onto goalie assets as
  goalieEdgeBoards ({board, rank}[]); Asset type extended
- Four goalie roles added to the modern role engine: Workhorse Wall,
  High-Danger Eraser, Storm Cellar (positive GSAx behind a leaky defense),
  Tandem Weapon — derived from starts, GSAx, save profile, HDSV baseline,
  team xGA context, and board appearances; <12 starts → null; the
  goals-against-high board acts as negative evidence for the Eraser
- Players index badge prefers the derived goalie role, falls back to the
  STARTER/TANDEM/BACKUP tier chip; dossier Role plate covers goalies
  automatically; glossary Modern Roles section documents all four
- 6 new goalie fixtures in player-roles tests (544 total passing)

### Round 6 — TM5/TM6 GM Audit contextual reasoning (complete)
- New app/lib/gm-audit-context.ts (pure, unit-tested):
  - isFranchiseCalibre: position-aware bar — a goalie clears at 72% of the
    skater FRANCHISE threshold (G-NAV runs structurally lower)
  - assessFranchiseReturn: a return qualifies via one franchise-calibre
    player OR a near-franchise headliner (≥80% of positional bar) with a
    legitimate second piece (≥85 NAV) — the audit's "franchise goalie +
    second-line defenceman" package; always returns a written reason
  - assessCreaseContext: starter-calibre goalie arriving → LOGJAM when a
    QUALITY incumbent owns the net (Swayman case; workload alone never
    blocks an upgrade), UPGRADE when the crease was the open need
- evaluate route: FRANCHISE_ANCHOR gate consumes the assessment; its
  explanations now state why the return does/doesn't clear the bar; a new
  INFO flag puts the franchise-for-franchise justification on the record
  when the gate opens; crease flags emitted for BOTH receiving sides
  (WARN/POSITIONAL_REDUNDANCY logjam, INFO/GOOD need-filled)
- TM6 EWA check: confirmed goalies already price into EWA via stable GSAx
  (0.4/0.6 blend, ~6 goals = 1 win) + HDSV kicker — no change needed
- __tests__/gm-audit-context.test.ts: 11 tests pinning the McAvoy package,
  Swayman logjam, struggling-starter upgrade coherence, and picks-only
  exclusion (555 total passing)

### Round 7 — TM3/TM4/TM7 trade machine cluster (complete)
- TM3a: asset blocks fixed at 280px with internal scroll ("Scroll for N
  more" hint) — the page never resizes as assets are added
- TM3b: GM Logic Signal extracted from the team columns into its own strip
  between Cap in Play and Team STRANDs (both teams' window badges)
- TM3c: Crease GSAx line under each Team STRAND — stable GSAx (same 0.4/0.6
  blend EWA uses) summed per roster, pre → post with colored delta; a goalie
  acquisition now reads as a crease change, not an OFF/DEF decline
- TM4: Generate Share Link hardened — try/catch with a visible error,
  verdict slimmed for the URL (top 8 flags by severity, explanations ≤300
  chars, message ≤500) so links survive Discord/Reddit/proxy limits; Copy
  button gives "Copied ✓" feedback with a select-fallback; share input
  labeled and self-selecting
- TM4: booting state is a real progress bar (teams 45% → players/EDGE 80%
  → assembly 100%) with role=progressbar + aria-live status
- TM7: hero reworked — "The Trade Desk / Put a deal on the record." with a
  numbered Build→Audit→Share strip; Open Armchair GM CTA removed; canary
  updated to pin the new landing

### Round 8 — PA5-PA11 card revamp + G3 icon system (complete)
- PA6/PA7 PercentileCard revamp: paper-plate header (INK reserved for text),
  X-NAV spelled out (Extended Net Asset Value), one compact contract line
  (Cap Hit · Fair Market Value · Surplus — Market AAV renamed), gravity strip
  (tier + force + OZ/NZ/DZ masses), EDGE strip (OZ time, top speed, bursts,
  HD finish), GRAV added to Value Breakdown, modern role under the name,
  THE HOCKEY LEDGER branded footer, free PNG export via html2canvas
- Percentile uniformity bug fixed: missing stats render "No data" and are
  excluded from the average — they no longer fabricate a 50th percentile
- PA7 tooltip overflow: MetricTip measures its anchor on open and pins
  left/right at viewport edges instead of center-overflowing
- PA11: projectedCapCeiling(seasonsAhead) in season-config (announced
  ceilings 104 → 113.5 → 123, then 5%/yr); Projected Next Contract prices
  FMV share against the cap AT EXPIRY, capped at the CBA 20% max — McDavid
  2yr out: ~19.9% of $123M ≈ $24.5M × 8 (the 25×8 scenario)
- G3: role icons documented from ROLE_DEFS (key can never drift from the
  badges) — "Modern Role Icons" group in Footer icon key and /glossary
- PA9: EDGE shot map now on the dossier with an animated, reduced-motion-
  safe loading sweep + aria-live status; empty state darkened to body ink
- PA5 (complete): strand key/definitions darkened to AA ink, color rule
  clarified ("wave color marks the trait family, never good vs bad"),
  50 = league median added. Player-compare dropdown added on the dossier —
  the StrandDisplay already overlaid a second strand (compareOff/compareDef),
  so PlayerStrandPanel now ships same-position peers (≥20 GP, only the
  trait-build fields) from the server page and a <select> overlays the
  chosen peer's strand with a clear button.
- PA8 (complete): "Hot Off the Press — Fresh Ink" now orders by a real
  signing date. Added an `extension_signed_at` column (ensure-schema ALTER
  + drizzle + CREATE-TABLE baseline); the admin contract POST stamps it on
  set (explicit YYYY-MM-DD or today), roster-assembly threads it, and
  orderFreshInk() sorts dated signings newest-first with an AAV fallback
  for undated bundle extensions. Each card shows a recency chip
  (Today / 3d ago / Jul 18).
- Hardest-shot metric (PA7 wish) not in the API payload yet — needs the
  EDGE detail capture to store shot-speed facts

### G4 — Model propagation (complete)
- Found and closed the drift class behind the old Fox home-vs-analytics
  bug: `AssetInput` never declared `edgeOzPct`, so the evaluate route's
  field-by-field adapter silently dropped the gravity NZ-well core input —
  server-side X-NAV ran gravity in "partial" data mode while the client ran
  full. Declared + mapped; canary guards it now.
- The season simulator now feels gravity: new `simOnIceDelta(profile)`
  exported from the gravity engine (DZ-heavy/NZ/OZ-light weighting —
  the sim's points-pace currency already prices scoring, so the term adds
  what pace misses; confidence-damped, bounded ±8 pace points) is added to
  `onIceValue`, so suppression and transition value move simulated
  standings, default best-lines deployment, and playoff odds. SimPlayer
  declares the on-ice fields (they always arrived — client sends full
  Assets — the route just ignored them).
- Modern roles propagate into sim output: traded-player outcomes stamp the
  evidence-derived role label ("Perimeter Lockdown", "Floor Raiser") with
  the old generic strings as fallback, and the Claude season-recap prompt
  now includes the role tag per moved player.
- Tests: simOnIceDelta unit suite (bounds, black-hole negative, confidence
  damping at equal rates), sim-route A/B test (gravity-rich roster vs
  stat-identical data-blank twin at fixed seed → more projected points),
  role-stamp + fallback test, and three canaries.

### AG3 — Position persistence (complete)
- Alternate positions now persist into Armchair GM lineups. `secondaryPosition`
  already flowed all the way through (Asset → /api/league/players → editor);
  the gap was the eligibility logic — only wing honored the secondary, so a
  winger who also plays center (Lehkonen, Teravainen) could never be slotted
  at C. Consolidated isC/isW/isF/isD/isG into lineup-order.ts as the single
  source of truth, now honoring both primary AND secondary for C/W (a generic
  "F" secondary opens both), and had LineupEditor import them instead of
  keeping its own divergent copies. D/G stay primary-only on purpose — a
  cross-group secondary would double-deploy the same id in the sim, and the
  editor can't move a player across groups.

### TM1 — Phase 3 visual roster picker (core complete)
- Replaced the outgoing-asset `<select>` (AssetPicker) with a visual
  roster grid (RosterGridPicker): team-first, the selected club's roster
  shows as tappable cards grouped Forwards / Defense / Goalies / Draft
  Capital, each card showing position · cap · a key stat and a NAV chip,
  ranked by NAV. Tapping a card adds the player to that side's block;
  removing them there returns them to the grid. Cards are real <button>s
  with aria-labels — keyboard and touch, no drag (mobile-safe reading of
  "drag-to-trade-block"). Grouping is a pure, tested helper
  (app/lib/roster-picker.ts → groupTeamRoster).
- Already satisfied by the existing UI: team-before-player with no global
  alphabetical list (the grid only appears after a team is picked), and
  side-by-side roster impact (TeamTradeSummary: current/projected cap, cap
  delta, production, NOIV, package NAV per side).
- Deferred by choice: the "performance endpoint" sub-item. The page still
  loads all players up front (with the TM4 progress bar); a roster-by-team
  endpoint with on-demand loading is a separable optimization that would
  touch the whole trade data flow, so it's left as a follow-up.

### Admin — place players on teams (contracts screen)
- The admin contracts editor had no way to set a player's team. The POST
  route already accepted + validated `teamId` (teamIdFromSlug → VALID_TEAM_IDS),
  so this was UI-only: added a Team `<select>` (32 clubs from TEAMS_DB) to
  the edit modal — defaults to the player's current club, flags "unassigned"
  when they have none, and "Keep current team" is a no-op — plus a compact
  team picker in the Add New Player row. `teamId` rides the existing
  ContractEdit/add payloads. Un-assigning stays the job of Exclude-from-roster.

### PA12 — Outlook redefined (complete)
- The analytics Outlook was a fantasy dynasty / boom-bust wall that read as
  noise on an established star (McDavid: "Dynasty 72 · Boom 39 · Draft Sig 0").
  Redefined the tab to answer one honest question for prospects and vets
  alike: where is this player trending, and what does next season look like?
- New pure `deriveOutlook(profile, edge)` (app/lib/player-outlook.ts) reads
  the already-computed DevelopmentProfile (engine untouched — it still feeds
  trade valuation / docket / evaluate) into: a one-call headline verdict
  (ASCENDING / IN HIS PRIME / AT PEAK — COOLING / REGRESSION RISK / PAST PEAK
  — DECLINING / PROVEN — HOLDING FORM / UNSETTLED), a next-season projection
  band, the accumulated multi-season scoring trajectory with a Rising/Steady/
  Cooling arrow, and — the audit's emphasis — NHL EDGE as leading indicators
  (top speed, 20+ bursts/82, finishing-luck bounce-back/cool-off, OZ time),
  each with a plain read of what it predicts. Missing signals are skipped,
  never faked.
- New PlayerOutlook.tsx renders it on the /players Outlook tab; the shared
  DevelopmentProfilePanel (dynasty/boom-bust) stays on the fantasy and docket
  surfaces where that framing belongs. Verified visually across McDavid /
  young riser / aging vet fixtures.

### Perf — /api/league/players (~43s → cached) + OPS/DPS resilience
- The players endpoint ran the full roster assembly on EVERY request (~40s
  cold: 32 live NHL roster fetches, per-player timeline pulls, MoneyPuck CSV
  parse, valuation for ~900 players) with no result-level cache — only the
  sub-fetches were cached, so the assembly itself re-ran each time.
- Now the finished payload is cached whole in Redis (LEAGUE_PLAYERS_CACHE_KEY,
  15-min TTL) so one request per window pays the cost and the rest are
  instant; also emits s-maxage/stale-while-revalidate so Vercel's CDN caches
  it. The key rides the shared team-cache set, so every roster mutation
  (contracts / trades / seed / reset …) drops it via clearTeamCaches.
- A health guard (isHealthyRoster) refuses to cache a payload whose
  point-shares didn't load, so a flaky NHL stats fetch can't pin an
  OPS/DPS-less roster for the whole window.
- OPS/DPS root cause: fetchPointShares returned an EMPTY map on any NHL
  stats API timeout/5xx/thin-data, blanking OPS/DPS. It now keeps a 7-day
  last-good copy and serves that on failure (fresh failures throw into the
  catch, then the stale fallback runs) — OPS/DPS survive a flaky upstream.
- This also delivers the TM1 "performance endpoint" sub-item in spirit
  (the players load is the Trade Machine's data source).

### F0 — Fantasy workshop (complete)
- Workshopped /fantasy from a static board into a draft-day tool. The math
  moved to a pure, tested engine (app/lib/fantasy-board.ts):
  - League Settings: scoring weights (G/A/PPP/HIT/BLK) + league size +
    roster build, persisted per device (localStorage, sanitized on read).
    FP/82 and the VBD replacement level (= teams × starters per slot) both
    derive from them — the board speaks the user's league, not one
    hardcoded format.
  - Tier breaks by gap detection: the 7 largest FP drop-offs in the top 100
    become tier boundaries, shown as T1–T8 chips — drafting is tiers.
  - Sortable columns (FP/82, VBD, G, A, PPP, HIT, BLK, Age) with aria-sort.
  - Draft tracker: per-row taken checkbox (strike-through + dim), Hide
    Taken filter, Reset Draft, persisted so a mid-draft refresh loses
    nothing.
  - Keeper Corner now ranks age-23-and-under by the Ledger dynasty signal
    (developmentProfile.dynastyScore) with FP fallback, showing DYN.
- Verified in a browser: settings panel, sortable headers, tier chips, and
  tracker all render; empty states hold when the data pool is thin.

### D1 — CSV trade ingestion (complete; closes the July 20 audit)
- Recording a real trade used to mean hand-building it asset-by-asset in
  the trades admin, then separately re-pointing every moved pick in the
  draft-picks admin. Now: paste a CSV of completed trades and ingest in
  one pass.
- Format: one row per asset movement (`date,from,to,asset,retained,
  conditions`); rows sharing a date + team pair merge into one trade.
  Picks read naturally ("2027 1st", "2028 R3", "(via SJS)" for another
  club's pick); retention as "25%". Quoted fields with commas supported.
- Pure pipeline in app/lib/trade-csv.ts: parseTradeCsv → groupTradeRows →
  resolveTrades. Players resolve diacritics-insensitively against the
  canonical roster (the AG4 slug); a team mismatch (roster lagging the
  trade) warns but ingests; unknown players, one-way trades, and picks
  from already-completed drafts hard-error per trade. 14-test suite.
- Route POST /api/admin/trades/ingest-csv (admin-gated, dryRun flag):
  per valid trade it createFrozenTrade()s through the same evaluator as
  the manual flow (locked verdict + grade-at-trade), publishes (roster
  overlay moves the players), upserts draft_pick_overrides for every
  moved pick (correct original owner via the "via" clause), then drops
  the overlay caches once. Per-trade report with warnings/errors either
  way — dry-run writes nothing.
- Admin trades page: collapsible CSV INGESTION panel with template
  loader, DRY RUN, and INGEST & PUBLISH, rendering the per-trade report.

### Fantasy: position-aware context + sort fix (from real-data screenshot)
- Bug: default board load showed LEAST FP first (Parekh, not McDavid) — the
  page's inline comparator double-negated direction. Extracted a pure,
  tested sortRows() (nulls sort last, FP tiebreak) and the page uses it.
- Breakout Watch was position-blind: a 20-year-old DEFENSEMAN read
  "Finishing cold — the goals are coming" (goals aren't a D's fantasy
  value). Reasons are now built position-aware in the engine: a D's story
  is PP production / top-pair minutes / transition / pedigree (never "goals
  coming"); forwards keep finishing/volume/speed/deployment. Each entry
  carries up to 3 evidence chips (e.g. "18 PP pts/82", "22.4 mph",
  "14 G on 22 xG") so the claim is checkable.
- "38%" now reads as breakout ODDS with a base-rate referent
  (BREAKOUT_BASE_RATE_PCT ≈ 10% league rate → 30%+ is ~3× the field),
  labeled "breakout odds" under the number.
- Goalie board reframed for fantasy: workload first (Start Share = GS/82,
  the scarcest resource), then save quality (SV%, GSAx), then Win
  Environment (STRONG/NEUTRAL/WEAK from team standing — wins are a team
  stat). buildGoalieBoard + goalieWinEnv, tested.
- UX: the expand affordance is now a 26px boxed chevron and the whole row
  is clickable (checkbox/name-link stop propagation) — the old 10px arrow
  was an unusable tap target.

### Fantasy research layer (post-audit — the "main research resource" pivot)
- Product call: /fantasy is a research resource, not a draft app — the
  taken-tracker stays as a utility, but the page now leads with what no
  fantasy site on the market has (the Ledger's proprietary stack):
  - Every draft-board row expands into the full Ledger outlook — the SAME
    PlayerOutlook component as the dossier (headline verdict, projection
    band, scoring trajectory, EDGE leading indicators). One tap deep on
    every player.
  - Modern role badge column (derivePlayerRoles): "Rush Weapon", "Slot
    Hunter" — play-style archetypes instead of a bare position letter.
  - EDGE Breakout Watch: players whose underlying signals run ahead of
    their points, powered by the same computeBreakout engine the season
    simulator trusts (one model, propagated), with the dominant driver
    translated to plain English (burst/speed, finishing luck, opportunity,
    pedigree) and the breakout probability shown.
- Known future direction needing NEW data: schedule strength / streaming
  (games-per-week) — requires an NHL schedule feed.

### July 20 audit: COMPLETE
Every item in docs/July20_Audit_Claude_Code/AUDIT.md is checked off.
Deferred-by-choice footnote: TM1's "performance endpoint" sub-item was
satisfied via the /api/league/players result cache instead of a separate
per-team endpoint.

### July 23 Armchair audit: IN PROGRESS
Tracking docs/July23_Armchair_GM_Claude_Code/July23_Armchair_GM_Claude_Code/ARMCHAIR_AUDIT.md.
- §3 Valuation — COMPLETE.
  - VAL1: drafted rookie keeps its draft context through the accent-strip dedup
    (`reconcileDraftedRookies`, app/lib/draft-reconcile.ts) — Björck no longer NAV 0.
  - VAL3 + VAL4: an injury-shortened prime season no longer collapses a star's
    pedigree floor (`isInjuryShortenedPrime`, app/lib/player-data.ts) — Barkov
    clears a depth scrub again.
  - VAL2: box score derives PTS = G + A (app/lib/box-score.ts); a <15 GP forward
    reads UNPROVEN instead of "2nd line winger" (AssetBadges.tsx).
    Deferred by choice: the ~+21 thin-sample NAV (REPLACEMENT_NAV anchor in the
    shared xnav core — league-wide blast radius; VAL3 already fixed the real
    absurdity of Duehr == Barkov).
- §5 AI cap — COMPLETE (core).
  - AI1/AI2: `resolveLeagueOffseason` now always re-signs AI-team RFAs (team
    control), reserving that cap before the UFA-market pass — Celebrini is kept
    and can't be dropped for Kucherov.
  - AI3: walked/unsigned players relocate to `FA_POOL` via `applyOffseasonToRoster`
    instead of being deleted from db.players (keep a NAV, stay signable). Cross-year
    re-offer of the standing pool remains with CX5.
- §6 SIM1 — COMPLETE. Playoff bracket extracted to app/lib/playoff-bracket.ts;
  R2 pairs adjacent R1 winners (rows 0+1, 2+3), so a winner feeds the slot drawn
  beside it (Mammoth–Blackhawks, not Wild–Blackhawks).
- CX6 (RFA offer-sheet compensation) — PARTIAL. `resolveOfferSheetCompensation`
  surrenders the signing team's OWN picks (current + original owner, soonest year)
  and CONVEYS them to the original club instead of deleting; original club frees
  only the RFA's current AAV (no old-deal double-count). Remaining: the match
  right + the user's-own-walked-RFA market button.
- CX5 (Cup Run lifecycle) — PARTIAL. `reconcileTeamCapSpaces` reconciles the
  user's cap on rollover too (ceiling − committed − active retained obligations),
  no longer frozen; starting a run clears pre-run trades + sim (clean baseline).
  Remaining: immutable pre-run baseline for abandon-after-rollover.
- CX1–CX4 (state integrity) — COMPLETE. CX1 URL-hydration guard; CX2 shared-link
  ownership guard on the execute path; CX3 package-change aborts audit/memo/match
  + stale-response guards; CX4 metadata-preserving setDb + full sim invalidation.
- Not started: §1 State (ST1–3), §2 Roster/cards/lineups (RL1–8),
  §4 Offseason UX (OFF1–7); §7 Codex CX7c/CX8, CXH1–9 (CXH3 done), CXS1–6.
  Follow-ups: CX5 abandon-baseline, CX6 offer-sheet match right.

### July 23 Codex SIM audit: IN PROGRESS
A read-only Codex review of the components + SIM. Correctness/robustness items done:
- #1 Retained salary — SIM per-trade cap delta now uses the shared
  `effectiveCapHit` (cap-delta.ts) so it matches the trade UI (retention-aware).
- #2 / #3 RNG determinism — awards / Calder / playoffs use independent named
  streams (`mulberry32(seed + hashString(name))`); Cup Run folds the run seed +
  season year into the seed so Years 1–3 aren't correlated.
- #4 Request validation — /api/simulate validates a Zod schema
  (app/lib/sim-request-schema.ts, `.passthrough()` on players/teams) with bounds,
  finite seed, and unique-id / team-reference checks → 400 on bad input.
- #6 / #7 Trade UI — Quick Trade no longer sticks on "Auditing" after a package
  change; generated proposals require a whitelisted accepted status
  (app/lib/trade-proposal-audit.ts) and pass the live capCeiling.
- #8 PlayerComparison — TOI/age averaged (null for empty side, never "wins");
  bar geometry anchored at 0 so a more-negative NAV is shorter, not longer
  (app/lib/stat-bar-compare.ts).
- Held by choice: #5 (trade-context double-count) — a calibration judgment that
  needs a historical backtest, not a blind code change.

### League imagery restored to the site (complete)
Owner's call, 2026-07-30: NHL mugshots and club crests are shipped on a public
asset host, so displaying them from that host is not redistribution. They are
back on the site; the downloadable PNG still carries none.

- `app/lib/league-imagery.ts` is the only module that names `assets.nhle.com`.
  It builds mug URLs (`/mugs/nhl/{season}/{TEAM}/{playerId}.png`) and crest URLs
  (`/logos/nhl/svg/{TEAM}_light.svg`), and returns an ORDERED CANDIDATE LIST
  rather than a single URL — a mug exists only for the season and club a player
  actually dressed for, so consumers walk the list on `onError`.
  - The roster feed's own URL leads where we have one. It stays correct after an
    Armchair GM trade moves `teamId`, when no mug exists for the new club.
  - Derived URLs follow: projected season first (`apiSeasonId`), last completed
    season second. Deduped, since those constants are equal each September.
  - Name-slug ids (DB-only prospects, bulk FAs) and non-league hosts are dropped
    rather than requested — a DB row cannot point the page at a third-party
    image, and a slug never becomes a guaranteed 404.
- `PlayerAvatar` decides photo-vs-drawn once for the whole site, so AssetCard,
  PercentileCard, PlayerComparison, CapProjection, TrendingPlayers and the
  Armchair roster table all gained faces from a single change. The engraved bust
  is the fallback, not a loading state. A `shape` prop keeps /players and the
  dossier circular, as they already were.
- `TeamMark` shows the crest with the three-letter type mark underneath as the
  fallback, so a club the league has no file for still renders an answer.
- Fallback index is derived from the candidate list, not held as a bare number,
  so a virtualised row reused for another player restarts its walk.
- Export boundary unchanged and now pinned harder: `card-payload.ts` has no
  image field and discards `headshotDataUrl`; the canaries additionally assert
  that neither the card-image route nor the payload imports `league-imagery`,
  and that `playerAvatarSvgMarkup` mentions no photo. The export cannot embed
  what it has no way to build a URL for.
- Nothing is proxied or cached. `app/api/headshot` stays deleted.

### Roster tab redesign (complete)
Flagged 2026-07-30: "too big, shows too little" — ZenGM and PuckPedia read
better. The old tab was one flat table with a two-line badge block under every
name, so a screenful showed about eight players and told you their points.

- `app/lib/roster-table.ts` holds the grouping, column sets and sort; the tab
  draws them and owns nothing but state.
- Three tables — Forwards / Defence / Goaltenders — each with a subtotal strip
  (count, points, average age, cap). "The blue line is old and expensive" is now
  visible without a mental tally. Goalies get GS / SV% / GSAx instead of three
  zeroes where the scoring goes, and no Pos column, which read "G" every row.
- New columns the old table had room for and wasn't using: Age, +/-, Term. Term
  shows years left, or the status a pending FA expires as (never "0y"), or EXT
  for a signed extension, with NMC/NTC beside it.
- Sortable headings. Nulls sort last in BOTH directions — a row of dashes must
  not be promoted by reversing — and the order is total (column, then name,
  then id) so it cannot jitter. Each unit table sorts independently, since the
  goalie columns are not the skater columns.
- Row height 52px → 32px. The cause was `.tap-target` (min-height 44px, WCAG
  2.5.5 AAA) on the name button setting the row height on its own. Replaced with
  `.dense-tap` at 24px — the 2.5.8 AA figure — and the clickable row around it is
  far wider than that.
- `AssetBadges` gained a `compact` variant: tier and role only, one line. The
  Ledger strip (awards, injury risk, change of scenery) moved into the expanded
  row, where there is space for two lines.
- Verified against fabricated data in a throwaway route, since the sandbox
  cannot reach the NHL roster API: 20 players render in ~830px against ~1370px
  before, and the sort caret tracks the active column.

## Tier 0 — trust repairs (in progress)

Prompted by an external audit (2026-07-30) of STRAND and X-NAV, verified against
the code line by line. Tier 0 is the subset that is unambiguously wrong rather
than merely unvalidated: accounting and semantic defects that cost days, not the
statistical programme that costs months. No coefficient changes.

### T0-1 — the X-NAV accounting identity (complete)
The dossier and the player card printed a panel headed "Value Breakdown" — OFF,
DEF, GRAV, AGE, CAP, UPS — under an X-NAV headline those rows could not produce.
Verified gaps on the live snapshot were +122 (McDavid), +103 (Suzuki), +144
(Makar). Four separate causes:

- the total is built from `defTotal`; the panel printed `defDisplay`, a different
  blend computed for the STRAND rails and the role tags;
- `upside` was `max(0, ageTotal) + teamControlValue` — `ageTotal` is the AGE row,
  so the panel counted it twice;
- the positional premium (×1.15 C / ×1.20 top-pair D), development discount,
  franchise floor and thin-sample credibility regression all move the headline
  and appeared nowhere;
- `applyTradeRequestDiscount` subtracted its penalty from `cap` under a comment
  claiming it did so "so the off/def/age/cap sum invariant holds" — an invariant
  the engine never had, and a claim that blamed a negotiating haircut on the
  player's contract.

Two surfaces had already noticed and bolted on a plug row (`total − sum`), which
closes the arithmetic without naming the difference. An existing canary pinned
that plug, and the trade-block test asserted "components still sum" while they
did not — both were pinning the bug.

Fix:
- `XNAVResult.stages` — an ordered list of signed rows whose sum IS the total,
  each multiplicative step recorded as the delta it applied. Emitted on every
  path: skater, goalie, pick, prospect, the prospect→NHL blend, and the
  post-engine trade-request discount.
- `app/lib/nav-breakdown.ts` reconciles rounding by largest-remainder
  apportionment, so displayed integers sum exactly to the displayed headline and
  every row stays within 1 of its true value.
- The split is deliberate: rounding is guaranteed at DISPLAY (a reader can never
  see numbers that do not add up), engine correctness is guaranteed by a TEST
  (`stageDrift`) — otherwise the reconciler would paper over the very bug class
  it was written to expose.
- `__tests__/nav-identity.test.ts` is the test the codebase was missing: 1,600
  tests and none asserted that the components a reader sees produce the headline
  beside them. It sweeps 500 random skaters plus every named branch, all goalie
  roles, all pick rounds/horizons, and the post-engine adjustments. It found two
  real defects immediately — an early return with no stages, and `blendStages`
  walking only the established side, which dropped the fading prospect row and
  left a 238-point hole.
- Surfaces converted: dossier, PercentileCard (and therefore the PNG export
  payload), PlayerTimeline, SeasonResultsPager. GmAnalysisTabs' plug column now
  sums the real adjustment rows and names them in its tooltip.
- `MetricTip` folds in the stage vocabulary rather than restating it, so one
  definition of "DEV" or "CRED" serves every surface.

Worth noting from the verified output: an elite starting goalie comes out
STOP +256, CAP +189, CEIL −195 → 250. The role ceiling was discarding 195 points
of computed value invisibly, which is why two elite starters tie exactly. Now
visible as a line item — the fix itself is a Tier 2 modelling decision.

Also found: `XNAVResult` is defined twice, in `trade-types.ts` and
`xnav-engine.ts`, kept compatible only by hand. Mirrored the new field and
flagged it; worth collapsing.

### T0-2 — STRAND missing-data honesty (complete)
Half the STRAND nodes greyed out honestly when their source was absent; the
other half substituted a value that looked measured:

| node | old behaviour | rendered as |
|------|---------------|-------------|
| NOIV | `norm(xgRelTM ?? 0, -12, 12)` | 50, no flag |
| SUPP | `norm(-(xgaRelTM ?? 0), …)` | 50, no flag |
| QoC  | `(qocIndex ?? 35) / 100` | 35, no flag |
| DPS  | `dpsNorm ?? norm(nav.def, -60, 150)` | the NAV defensive component — a different quantity on a different scale, same label |
| GA   | `(1 - svPct) * (spg ?? 30)` | a goals-against figure off an assumed shot rate, to two decimals |

50 is the worst available lie: it reads as "average", which is a finding, rather
than "we do not know". A player with three real inputs and one with ten rendered
identically.

- `app/lib/strand-traits.ts` owns node construction. `node()` takes the raw
  input and decides whether there was one; callers must not pre-substitute
  (`value: x ?? 0` reintroduces the defect). A real zero counts as data; only
  null/undefined/NaN/Infinity are absence.
- Every absent node carries a specific message ("On-ice xG relative to teammates
  unavailable"), not a bare "unavailable" — a reader should know what to go find.
- The 0.5 on an unavailable node is geometry, not a reading: `StrandDisplay`
  greys it and prints "—", but the helix still needs a y-coordinate.
- Coverage: `strandCoverage` counts measured nodes and the display prints
  "3 of 8 measured", in red with "too little to characterise this profile" below
  half. This matters more than the greyed nodes themselves — a thin profile and
  a full one draw the SAME helix, because the placeholder mid-rail values shape
  the wave. Verified against a rendered three-profile comparison.
- `computeRosterStrand` averaged the manufactured values across a roster, so a
  club with five real NOIV readings out of thirteen produced a number that was
  mostly eight copies of "unknown" pulled toward the middle. Each trait is now
  averaged over the players who have it, with `rosterStrandCoverage` reporting
  how many; `navMap` is no longer read at all.
- The goalie "GAA" node is relabelled **GA/GM** and requires both save % and
  shot volume. It is goals per appearance; calling it GAA claimed a per-60
  figure the data cannot support. The unit question itself is T0-3.
- `StrandTrait` had two definitions; `StrandDisplay` re-exports the lib's now.

Five canaries were pinning implementation, two of them pinning the bugs
themselves — one quoted `norm(p.qocIndex ?? 35, 0, 100)` verbatim, locking in
the default this task removed. All repointed at the guarantee.

NOT fixed here, and still true: OPS/DPS remain SHARES of a player's Point
Shares, not ability percentiles, so an elite two-way forward's large offence
still makes his defensive node small. Tooltips now say "share" explicitly. One
consistent scale across the rails is Tier 1.

### T0-3 — goalie units (complete)
Two numbers carried the wrong unit.

**Starts were appearances.** `gamesStarted` was fed MoneyPuck's `games_played`,
so relief outings counted as starts — and that field gates the
starter/tandem/backup classification, which sets the role ceiling on G-NAV. The
sharpest form: the assembly fetches the NHL stats API alongside MoneyPuck, the
NHL feed publishes a real `gamesStarted`, and the merge spread MoneyPuck last —
so the correct number was retrieved and then overwritten. The NHL fallback
compounded it with `?? games`.

- MoneyPuck now writes `gamesPlayed` and does not touch `gamesStarted`; the NHL
  feed's real starts survive the merge.
- The NHL entry emits starts only when the feed actually supplies them.
- `resolveWorkload` picks starts where known, appearances otherwise, and returns
  `startsKnown` so nothing downstream has to guess. `gamesStarted` still carries
  the best available figure, so no consumer breaks.
- Labels follow: "52 GS" when they are starts, "55 GP" when they are not. The
  goalie role tag appends "(N appearances — starts not published by this
  source)" when it classified on relief-inclusive numbers.
- This DOES move valuations for goalies whose starts differ from their
  appearances. That is a data correction, not a tuning change — the field was
  always meant to hold starts.

**GAA was not GAA.** STRAND computed `(1 - savePct) * shotsPerGame` and labelled
it goals-against average. That is goals per APPEARANCE; GAA is per sixty
minutes, and the two diverge by however far an average outing falls short of a
full game — pulled starts and relief work, exactly the population the number is
used to judge. It also fell back to an assumed 30 shots per game, so it could be
fabricated outright and still printed to two decimals.

- The MoneyPuck goalie CSV carries `icetime` in seconds. The assembly already
  parsed it for the team xGA denominator and then discarded it; it is the
  denominator real GAA needs. `gaa` is computed at assembly, where the raw
  goals and ice time are both in hand, and STRAND consumes it.
- The NHL path prefers the feed's own `goalsAgainstAverage`, else computes from
  `timeOnIce`.
- Null when ice time is unavailable — the node greys out (T0-2's machinery).

Worked example from the tests: 40 appearances averaging 40 minutes, 100 goals
against. Old figure 2.50; real GAA 3.75.

`app/lib/goalie-units.ts` is deliberately distinct from the pre-existing
`goalie-workload.ts`, which splits a projected season between starter and backup
inside the sim.

Four canaries repointed, one of them pinning a label this same Tier introduced
one commit earlier (GA/GM, now correctly GAA).

## Tier 0 complete — what it did and did not do
Closed: the X-NAV accounting identity, STRAND missing-data honesty, goalie
units. No coefficient was tuned. Still open and correctly outside Tier 0:

- OPS/DPS are SHARES of Point Shares, not ability percentiles, so an elite
  two-way forward's defensive node still reads small. One consistent scale is
  Tier 1.
- The goalie role ceiling still clamps hard — an elite starter comes out
  STOP +256, CAP +189, CEIL −195 → 250, so two elite starters tie. It is now a
  visible line item rather than an invisible one; softening it is Tier 2.
- No uncertainty anywhere: X-NAV is a point estimate printed as an integer.
- No out-of-sample validation, no point-in-time training data, hand-picked
  constants throughout.
- `XNAVResult` is still defined twice (trade-types.ts and xnav-engine.ts).

### Deploy payload and the goalie population (complete)

**`.vercelignore`.** Every deploy uploaded the whole repository. 254 MB of it
was material the runtime never opens: 143 MB of source CSVs (inputs to offline
builders in `scripts/`), 69 MB of tracked repomix dumps, 32 MB of brand kits and
audit archives. Verified before excluding that no file under `app/` references
`OtherData`. Deploy payload 284 MB → 29 MB. The repomix dumps were also
untracked from git — generated, regenerable, stale on the next commit.

**Goalie zero-floor bug.** Oettinger read 0 on the dossier; so did a genuine
albatross, and so did a goalie with no data. `Math.max(rawTotal, youngFloor)`
was applied unconditionally and `youngFloor` is 0 for anyone not young and
cheap, so it was a hard floor at zero for every goalie in the league. Found by
the T0-1 waterfall — `impact +32, cap -49, youngFloor +17` under a headline of
0, and a floor row firing on a 27-year-old making $8.25M is not something the
old five-component panel could have shown. Now -17.

That exposed something the clamp was concealing: the case prices a 50-start
starter with positive GSAX at an FMV of **$2.71M**, which is low. The contract
model appears to under-price the position. Not touched — it wants fitting.

**Goalie percentile + stability artifact.** `scripts/goalie-percentiles/build.ts`
→ `app/data/goalie-percentiles.json` (8 KB, aggregate only, committable).
Built from the new `OtherData/HistoricalData/goalies_2008_to_2024.csv` plus the
current season — 1,031 qualifying goalie-seasons, 197 goalies, identical
36-column schema so they concatenate.

Two windows on purpose: **percentiles** from the last five seasons (goaltending
drifts; ranking a 2026 goalie against 2008 flatters him for unrelated reasons),
**stability** from the full 2008-2025 panel (a year-over-year correlation wants
every consecutive pair it can get).

Year-over-year stability, 769 season pairs:

| metric | r |
|---|---:|
| Freeze rate | 0.72 |
| Rebound control vs expected | 0.69 |
| High-danger SV% | 0.40 |
| GAA | 0.34 |
| SV% | 0.30 |
| **GSAx/60** | **0.13** |
| Medium-danger SV% | 0.06 |

**GSAx/60 — what G-NAV is built on — is the least repeatable of the lot**, and
the two most repeatable things a goalie does (freezing pucks, controlling
rebounds) are not in the valuation at all. Medium-danger save rate is
indistinguishable from noise.

`app/lib/goalie-percentiles.ts` consumes it: `goaliePercentile` (oriented so 100
is always the good end, including for GAA and rebound rate, which run
backwards), `reliability(key, iceTime)` using `n/(n+k)` with k calibrated so a
full season reproduces the published r exactly, and `regressedValue` for the
figure a valuation should actually use.

Not wired into the rails or the engine yet — the artifact and the reader land
first so the change can be judged on its own.

**Blocked on missing data:** a proper FMV fit needs signings joined to the
performance available at signing date. `app/data/contracts.bundled.json` is
current-only — `{capHit, yearsRemaining, hasNMC, hasNTC, canRetain}` — with no
signing date or original term, so an old $5M deal cannot be expressed as a share
of the cap when it was signed. A cross-sectional anchor against today's contracts
is possible but mixes cap eras.

### Goalie FMV, fitted to real signings (complete)
Owner supplied a hand-built signings workbook — 32 team sheets, **6,229
signings, 2017-07 to 2026-07**, carrying signing date, cap hit, term, **Cap % at
signing**, position, age, RFA/UFA status, contract level and 1-way/2-way
structure. Landed at `OtherData/contracts/` as both the xlsx and a flat
`signings.csv`. Tracked in git (it is manual work that cannot be regenerated),
excluded from the deploy by `.vercelignore`.

`Cap %` is what makes this work. The worry was that a $5M deal signed in 2018
could not be compared to $5M today without a signing-era cap; the sheet already
carries the share, so the era drops out of the problem.

- 774 goalie signings; **300 one-way standard**, of which **299 join** to
  MoneyPuck performance by name slug (99.7%). 260 survive the requirement of a
  real prior sample.
- `scripts/goalie-fmv/build.ts` → `app/data/goalie-fmv.json` (3 KB, coefficients
  and validation only).
- **Strictly point-in-time**: a July 2024 signing sees 2023-24 and earlier and
  never the season that followed. Getting this wrong is the standard way a
  contract model scores well and predicts nothing.
- Feature `gsax` is ice-weighted GSAx/60 over three finished seasons, regressed
  by the reliability curve from the percentile artifact — the two pieces compose.
- **Walk-forward validated**: trained on 177 deals signed before 2024-07, scored
  on the 83 signed after. R² 0.553, MAE 0.0109 of the cap = **$1.44M** at $104M.

**Term is deliberately excluded.** It is the strongest single correlate
(r = 0.83) and out-predicts every performance feature combined on its own —
adding it takes walk-forward R² from 0.55 to 0.70. But it is endogenous: term
and AAV are negotiated together and both reflect what the club thinks. Including
it also flipped the UFA coefficient NEGATIVE, implying unrestricted free agents
cost less than restricted ones, which is false and was term absorbing the
effect. With term out, every sign is right: gsax +0.193, workload +0.051,
age −0.00124, ufa +0.00417.

Sanity against the market, at a $104M cap:

| profile | model | market |
|---|---|---|
| Elite (p95 rate, workhorse) | $7.95M | $8.0-9.5M |
| Strong starter | $7.01M | $6.5-8M |
| Solid starter | $6.08M | $4.5-6M |
| League-average starter | $5.29M | $3.5-5M |
| Below-average starter | $4.00M | $2.5-4M |
| Tandem | $3.50M | $2-3M |
| Backup | $0.93M | $0.8-1.5M |

Mild upward bias mid-market; the published range covers it. Compare with the
$2.71M the hand-written logistic produced for a mid starter.

**Domain guard.** A first sanity pass fed RAW GSAx/60 into a feature that
expects the REGRESSED value and got $11.83M for an elite starter. The fitted
`gsax` span is only −0.116 to +0.137 — roughly a tenth of a raw figure — so the
model was extrapolating to double its observed maximum. The artifact now
publishes `featureDomain`, `goalieFmvCapPct` clamps to it, and `isInDomain`
lets a caller find out. The mistake is why the guard exists.

Not wired into `calcGoalieNAV` yet — the artifact and reader land first.

### Skater FMV, fitted to real signings (complete)
The counterpart to the goalie model, and the consequential one: X-NAV's contract
stage prices every player in the app, not just goalies.

- 5,455 skater signings in the workbook; **2,265 one-way standard**, of which
  **2,231 join** to MoneyPuck performance (98.5%). 1,996 survive the prior-sample
  requirement — 1,297 forwards, 699 defencemen.
- `scripts/skater-fmv/build.ts` → `app/data/skater-fmv.json` (4.8 KB).
- **Walk-forward**, same July 2024 boundary: forwards R² 0.643, defencemen
  R² 0.553, both MAE 0.0136 of the cap = **$1.41M** at $104M.

**Fitted separately by position**, and the reason is not the R²:

| | points/60 | ice time | UFA |
|---|---:|---:|---:|
| Forwards | 0.0204 | 0.0897 | 0.0029 |
| Defence | 0.0159 | 0.1046 | 0.0052 |

A defenceman is paid more for minutes and less for points. Pooling with an
`isD` intercept shifts the line but forces one slope on both, which is the wrong
shape; on mean error the pooled and split fits are identical ($1.41M either
way), so the split is justified by structure, not score. A canary pins
`D.toi > F.toi` and `D.pts60 < F.pts60` — if that ever stops holding, the split
has no reason to exist.

**Term excluded, and the reason now REPLICATES.** The goalie fit dropped term
for endogeneity, on the evidence that including it flipped the UFA coefficient
negative. The identical pathology appears here on a completely separate
population: term correlates 0.78 with cap hit, adding it lifts walk-forward R²
from 0.610 to 0.782, and UFA goes +0.00364 → −0.00119. Two independent
confirmations of the same artefact is no longer a judgement call.

Sanity at a $104M cap, using in-range percentile profiles:

| forwards | | defence | |
|---|---|---|---|
| Superstar (p99) | $10.24M | No.1 D (p99) | $9.58M |
| Star (p90) | $7.12M | Top-pair (p90) | $6.48M |
| Top-six (p75) | $5.34M | Top-4 (p75) | $4.95M |
| Middle-six (p50) | $3.12M | No.4-5 (p50) | $3.20M |
| Depth (p10) | −$0.21M → floored | Depth (p10) | $0.08M → floored |

**Two mistakes worth recording.** First, I sanity-checked with guessed inputs
again — 1.05 points/60 as "elite" when the forward median is 1.66 and the max
4.68 — and briefly believed the model undershot badly. Reading the fitted
distribution first would have avoided it, exactly as with the goalie GSAx scale.
Second, `unitForPosition` used `startsWith("D")`, which prices a left
defenceman (LD) as a forward; caught by its own test and aligned with
`roster-table.ts`.

Not wired into `calcSkaterNAV` yet.

## Multi-year production prior for skaters

The FMV comparison against the live roster priced Auston Matthews at $8.30M,
Elias Pettersson at $6.83M and Drew Doughty at $5.18M. All three had just played
their least representative season. `skater-fmv.ts` reads one year and one year
only, so a shortened or down season becomes the player.

`app/data/skater-stability.json` (8 KB, `scripts/skater-stability/build.ts`)
measures how much of a skater-season carries into the next, from 11,702
skater-seasons over 2008-2025, split F/D because the pricing model is:

| | forwards | defence |
|---|---:|---:|
| TOI/game | r = 0.84 | r = 0.80 |
| Points/60 | r = 0.72 | r = 0.69 |
| Game Score/60 | r = 0.73 | r = 0.67 |

Set beside GSAx/60 at **r = 0.13**, that is the whole design brief. A skater's
season is mostly signal where a goalie's is mostly noise, so `skater-prior.ts`
is a light touch and a full healthy season passes through it unchanged.
Reaching for the goalie treatment — a 1:2 current-to-career blend — would have
flattened the league for no reason.

**Why it shrinks toward one full season and not toward the truth.** The obvious
move is to regress every input toward the population mean by its reliability.
That is wrong here and quietly so: `skater-fmv.ts` was fitted on raw
single-season features, so its slopes are already attenuated by exactly that
noise. Cleaning the inputs and leaving the slopes alone shrinks twice and
underprices stars. What it does instead is pool the available seasons, then
shrink only insofar as the pooled sample falls SHORT of the one full season the
fit was built on — `belief = min(1, reliability(pooled) / r)`. At a full season
belief is 1 and nothing moves. Above one season it is capped, because the fit
cannot use inputs cleaner than it was trained on.

The full-season anchor is measured rather than assumed: 1,373 minutes, the
median load of a skater-season with 70+ games. A skater's full season is not a
fixed figure the way a starting goalie's 3,500 minutes is.

Effect, at a $104M cap:

| | raw season | pooled | FMV |
|---|---:|---:|---|
| Matthews, 67 games, real history | 1.96/60 | 2.43/60 | $7.01M → $7.93M |
| McDavid, full and consistent | 4.08/60 | 4.03/60 | $11.50M → $11.39M |
| Fourth liner, full season | 1.20/60 | 1.14/60 | $0.88M → $0.93M |
| 12-game call-up at 3.01/60 | 3.01/60 | 2.30/60 | $7.22M → $5.95M |

**The bug worth recording.** The first draft discounted the CURRENT season by
the share of it already inside the MoneyPuck baseline. That reads fine until
the degenerate case: a rookie whose baseline IS his own fifteen games had his
current sample zeroed and the baseline credited with 1.35 full seasons — a
fifteen-game player reported as fully sampled, belief 1.0. The discount belongs
on the prior, not on the season: only the part of the baseline that is not this
year counts as evidence. At an overlap share of 1 the prior now contributes
nothing and the estimate is the current season, thin and labelled thin.

That fix needs `totalSeasonsWeighted`, which the baselines artifact publishes
but nothing plumbed onto `Asset`. Now threaded through roster-assembly, the
Asset type and the request schema, with a canary — the wiring crosses three
files and dropping it silently over-credits every rookie.

**One approximation, stated.** There is no `baselineToiPerGame`, so converting
`baselinePtsPace` to a per-sixty rate uses the current season's minutes. For a
player whose role just changed that understates his historical rate. Adding a
TOI baseline to the MoneyPuck builder is the real fix and is not done here.
Deployment therefore gets no multi-season prior at all and is shrunk on its own
sample only; at r = 0.84 a full season moves essentially not at all and a
fifteen-game sample moves a lot, which is right in both cases.

`scripts/fmv-comparison/run.ts` now prices through the prior, with `--raw` to
restore single-season pricing and diff the two.

Still not wired into `calcSkaterNAV` — that is the next step, and it needs the
pre-domain cases (Schaefer at 18, Celebrini at 20 sit at or under the fitted age
floor of 20) handled first.

## Pre-domain handling: what the clamp cost

I called the pre-domain cases a blocker for wiring `skater-fmv.ts` in. Measured
against the 940 skaters in the 2025-26 file, that was wrong, and the multi-year
prior had already done the work:

| | out of fitted domain |
|---|---:|
| raw single season | 110 of 940 (11.7%) |
| with the multi-year prior | **2 of 940 (0.2%)** |

The 108 that resolved were overwhelmingly one-to-six-game players sitting at
0.00 points/60, below the fitted floor. Pooling them against their baseline and
shrinking the thin sample lifts them back inside. Nothing was unpriceable.

The two survivors are Kucherov (4.96 points/60 against a fitted max of 4.68)
and Quinn Hughes (27.7 minutes a night against 26.7). Both clamped, both
costing well under the model's own error.

**So the flag was asking the wrong question.** `isInDomain` returned a boolean,
and a boolean cannot tell these apart:

| clamp | price withheld at a $104M cap |
|---|---:|
| age 18 → fitted floor of 20 | $0.27M |
| Hughes's deployment → max | $0.54M |
| Kucherov's production → max | $0.55M |
| a per-82 pace fed where a per-sixty rate belongs | **$157M** |

All four are "out of domain". Three are footnotes and the fourth is the unit
trap that clamped every goalie to the ceiling before it was caught.

`skaterFmvDomainReport` replaces the flag: per-feature findings with the value,
the bound, the direction, and the cap percentage the clamp withheld.
`material` draws the line at the model's own walk-forward error — below it a
clamp is a footnote, above it the price is a bound rather than a read.
`domainNote` writes that as a caption that names the feature and the dollars
instead of saying "out of domain", which means nothing on a player page.

Pricing and reporting now share one `clampFeatures`, so a caption cannot vouch
for a number computed some other way. Deployment is reported in minutes rather
than the ratio the model uses internally.

**On the age floor specifically.** No projection work was needed. An 18-year-old
is priced on today's profile, which is correct for a surplus calculation — the
whole value of an entry-level deal is production now against a CBA-capped hit.
Growth across the contract term is already handled separately by the engine's
`tmvDriftFactor` loop, and that division of labour survives the wiring.

Nothing now blocks wiring the fitted model into `calcSkaterNAV`.

## Wiring the fitted skater FMV into calcSkaterNAV

The logistic S-curve is gone. `calcSkaterNAV` now prices from `skater-fmv.ts`,
fed through `skater-prior.ts`, in both the headline figure and the per-year
`capSum` loop.

What the retired curve did, on the seven archetypes in the test suite:

| | paid | retired curve | fitted | NAV now |
|---|---:|---:|---:|---:|
| McDavid-tier C | $12.5M | $20.74M | $13.01M | 499 |
| Barkov-tier C | $10.0M | $19.71M | $9.39M | 321 |
| Makar-tier D | $9.0M | $19.97M | $9.99M | 368 |
| Shutdown D | $5.0M | $9.71M | $6.03M | 146 |
| Top-six W | $6.0M | $5.28M | $6.66M | 104 |
| Fourth liner | $1.2M | $1.93M | $0.77M | 16 |
| Overpaid vet | $9.0M | $1.61M | $3.08M | −62 |

The correction is concentrated at the top, and the middle actually moves UP —
the sigmoid was under-pricing top-six players while inflating stars. McDavid
now reads as fairly paid, which he is; the curve had been handing him $8M a
year of surplus that does not exist.

Per-year pricing is preserved: the loop re-prices the profile at each contract
year, with `tmvDriftFactor` scaling the production feature and the model's own
age term carrying the rest. Deployment is held flat across the term — the
engine has no view on how usage will change, and inventing one would be a third
growth model on top of the two that exist.

**The measurement that changed the design.** Wiring it in broke a test that was
right: an established star with a five-game season lost 17 NAV against his
full-sample twin. The cause was the belief curve. Both this module and the
goalie one derived how much to trust a partial season from `n / (n + k)` with
`k` calibrated so a full season reproduces the published year-over-year `r`.
That form assumes everything `r` falls short of 1 is sampling noise. For
deployment it is not — most of what stops last year's TOI predicting this
year's is that the coach changed his mind, which no sample fixes.

Measured on the panel, bucketing the correlation by how many games the
predictor season had:

| games in year 1 | r(TOI/game) | r(pts/60) |
|---|---:|---:|
| 5-15 | 0.738 | 0.343 |
| 71-82 | 0.895 | 0.833 |

A ten-game TOI sample retains **82%** of a full season's predictive power. The
derived form gave it **34%**, dragging a 20-minute star to 16.7 minutes and
$1.58M. So `skater-stability.json` now publishes the curve bucketed by games
and `beliefWeight` interpolates it — measured, not derived. Monotonicity is
enforced with a running maximum, since raw buckets are noisy enough to dip and
a 75-game season must never be worth less than a 60-game one.

A build bug worth recording: the curve was first computed over the rows that
pass the 300-minute eligibility floor, and a ten-game season is never 300
minutes. The two thinnest buckets fell below the minimum-pairs bar and vanished
silently, leaving a curve that started at 21 games and said nothing about the
case it exists for. It is built from unfiltered rows now, with a test pinning
that the first bucket starts at one game.

**`baselineToiPerGame`.** The remaining half of the fix, and the gap this
module shipped with. Added to the MoneyPuck baseline builder — the diff against
the previous artifact is purely additive, 1,206 players, zero existing values
changed. Deployment now has a multi-season anchor, so a star who played five
games keeps his minutes, and the baseline points pace is converted to a
per-sixty rate against the BASELINE's minutes rather than the current season's.
That removes the approximation documented in the prior's header: a player whose
role just changed is no longer read at the wrong rate.

**Pooling moved from seconds to games.** Belief is measured in games and
pooling was in ice time; carrying both was two units for one idea. Games is
also the unit the curve is bucketed in.

**A limitation the wiring exposes.** The fit prices points and minutes. It
cannot see defence, so a defensive centre's fair price is understated and his
contract surplus with it — Barkov reads as very slightly overpaid at $10M. His
defensive value still reaches the total through the on-ice core, but not
through the contract stage. A defensive feature in the fit is the fix, and is
not done.

Test bands re-pinned to market anchors rather than to whatever the code emits:
a 90-point centre is Eichel money at $10M, an 8-point fourth liner signs at the
league minimum, and the top of the market is McDavid's $12.5M rather than the
$20.8M asymptote. The canary now pins that `MAX_CAP_PCT`, `K_FACTOR`,
`LEAGUE_MIN_PCT` and `MIDPOINT` stay out of the engine.

`scripts/fmv-comparison/run.ts` compares against the retired curve now, since
engine and model are the same thing. Those constants live in that script and
nowhere else.

## Future contract years now use the announced cap

`calcSkaterNAV` and `calcGoalieNAV` both escalated the ceiling at a flat 4% a
year. The announced ceilings are 104.0 → 113.5 → 123.0, which is **9.1% then
8.4%**. Every future year of every contract was priced against a cap several
points too low, and the error compounded over exactly the long deals where the
figure carries most weight.

`season-config.ts` already exported `projectedCapCeiling(seasonsAhead)` — the
announced values through 2028-29 then a 5% escalator — and `cap-horizon.ts` and
`extensions.ts` both used it. The valuation engine did not.

It cannot call it directly: Armchair GM lets a user set their own ceiling, and
a contract has to be priced against that world rather than the real one. So
`capGrowthFactor(n)` gives the announced curve's SHAPE as a multiple of today,
and each loop multiplies its own base by it. With the default base the result
is exactly the announced ceilings; with a custom one the cap still grows the
way the real cap will.

One band moved: Dustin Wolf on $875k × 2 years went 120 → 123 NAV, because year
two of a cheap deal is now measured against $113.5M rather than $108.2M. A
cost-controlled contract being worth more as the ceiling climbs is the point of
the change, not a side effect.

Found while checking a claim I had made and got wrong — see the next note.

## The top-end fit: three forms tested, two of them wrong

The fitted model under-priced the top of the market. Leo Carlsson signed at
17.30% of the cap and priced as a 7.91% player; Kaprizov 16.30% against 9.53%.
The only case that looked right was McDavid — because his $12.5M is a
hometown discount, and anchoring the sanity check on it is what let the problem
sit unexamined.

**The diagnosis.** Residuals binned by PREDICTION (binning by actual produces a
rising pattern even for a correct model, which nearly fooled me): forwards ran
+1.56 points of cap in the bottom decile, −0.80 through the middle, +1.53 in the
top. A U-shape is what a straight line makes of a curve that bends. The linear
fit also predicted a NEGATIVE cap share for the cheapest decile, which only the
league-minimum floor was hiding.

**Two forms fitted better and were wrong.**

*Log-linear* scored best on average error — forwards $1.26M → $1.17M — and I
nearly shipped it. It prices the corner of its own feature box at **54.7% of the
cap**, and McDavid at $26.76M. What hid this was my validation metric: I used
the MEAN miss on the richest contracts, so Carlsson at −8.1 cancelled Celebrini
at +3.9 and reported a reassuring +0.43. **Mean absolute** is the metric; the
signed version is now impossible to reintroduce because the artifact publishes
`richestAbsMissCapPct`.

*Squared terms* also fit better and turn over INSIDE the fitted range. Defence
points peaked at 1.78 pts/60 with a concave curve, so an elite scoring
defenceman was penalised for scoring — in exactly the region the work was meant
to fix.

**What shipped: a monotone linear spline.** Base slope plus `max(0, x − knot)`
at the 50th and 85th percentile of each unit's own distribution, with the
production and deployment slopes constrained non-negative by bounded least
squares. The curve can only rise.

| walk-forward | linear | squares | **hinges** |
|---|---:|---:|---:|
| F mean error | $1.26M | $1.21M | **$1.22M** |
| F miss on richest 20 | 3.45 pts | 2.58 | **2.25** |
| D miss on richest 20 | 2.35 pts | 2.18 | **2.26** |
| domain-edge price (F) | 15.0% | 26.2% | **19.7%** |
| monotone | yes | **no** | **yes** |

Bounded at both ends: the league minimum below, the CBA's 20% individual
maximum above. That ceiling is a legal fact and is NOT what the retired sigmoid
did with the same number — that curve made 20% an asymptote everything was drawn
toward. This one binds on zero contracts in the fitted population, and the build
throws if it ever binds on one.

**Three guards now run at build time**, each of which caught something real: the
price may not fall as production or deployment rises; the unbounded price at the
corner of the feature box must stay under 35%; and the CBA ceiling must bind on
no real signing.

**The UFA term was dropped and then restored.** Under the log fit its t-statistic
was −0.40 in both units and I removed it with a written justification. Under the
form that actually shipped it is +2.67 and +2.03 and correctly signed, so the
conclusion belonged to the log fit alone. It is back.

**What remains, and it is nameable rather than a specification error.** The
misses left are young players signed on projection: Carlsson at 21 is still
−8.5 points of cap, Bedard −3.2. A model of production and minutes cannot price
what a club thinks a 21-year-old becomes. Celebrini improved from −5.4 to −2.8
and Kaprizov from −6.8 to −4.0. The honest statement is that this model prices
established players well and pays no attention to projection.

Also corrected: the top of the market is **17.3% of the cap**, not McDavid's
$12.5M. Cap-relative throughout, so it scales with the ceiling — 17.3% is
$18.0M at $104M and $19.6M at $113.5M.

## The contract verdict now respects the model's own error

Three surfaces each carried their own copy of `surplus >= 1 ? "BARGAIN" :
surplus <= -1 ? "OVERPAY" : "FAIR"`. That $1M was hand-picked and it is
**smaller than the model is wrong by** — the fitted skater model's walk-forward
error is $1.22M for forwards and $1.35M for defence, the goalie model's $1.44M.
So Jack Eichel's $13.5M against a $12.4M model price printed as an OVERPAY on a
gap the model cannot resolve.

`contract-verdict.ts` decides it in one place, from each fit's published
`maeCapPct`, so a refit moves the threshold automatically and cannot leave it
stale. Eichel now reads *priced about right*; Huberdeau at $10.5M against
$4.5M still reads *paid above market*.

**The language is deliberately weaker than it was.** Measured across 1,995
contracts, when the model flags an overpay the gap is still there three seasons
later only 57% of the time. BARGAIN and OVERPAY are verdicts; the model is
entitled to say a deal is unusual for the profile and no more. So the chips read
*paid below / above market*, the tooltip carries the 57%, and a within-margin
gap is coloured neutral rather than painted green or red by its sign alone.

**"Fair Market Value" is gone from every surface.** The name asserts what a
player is WORTH, which the model cannot support: it predicts what clubs pay and
is fitted on their mistakes as well as their successes. It is a *market price*
now, and the tooltip says it predicts the market rather than judging it.

A canary pins all of it — no surface may reintroduce its own threshold, every
surface must route through the shared verdict, the margin must come from the
published error rather than a literal, and nothing may print "Fair Market
Value". Three existing canaries had pinned the old implementation, including the
`$1M` rule itself, and were repointed to intent.

## Outcomes-model gate: build a narrow version, not the arbiter

Before writing an outcomes model, one question: can a per-player value metric
reconstruct team results? `scripts/outcomes-gate/run.mjs` answers it, and the
gate was built to be hostile to the idea.

**Two circularities it had to dodge.** Point Shares are *constructed* so a
team's shares sum to its points — testing them would pass regardless. And
on-ice metrics credit five skaters per event, so summing them reproduces team
totals by accounting identity: the same-season test scores **r = 0.98** and
means nothing at all. The real gate is predictive — last season's player values
against this season's result, judged against the naive baseline of *the team
was good last year*.

| predictor of next season's goal differential | R² | partial vs baseline |
|---|---:|---:|
| baseline — team's own prior differential | **0.288** | — |
| player value, 1 season, everyone | 0.209 | +0.140 |
| player value, 3 seasons weighted | 0.237 | +0.206 |
| player value, 3 seasons, skaters only | 0.265 | **+0.247** |
| goalie value alone | 0.020 | −0.002 |
| **baseline and player value together** | **0.318** | — |

**Summed player value never beats knowing the team was good last year.** That
is a humbling result for any player-valuation scheme and it should be stated
plainly. What it does do is add real information on top: partial r +0.247, and
combined R² 0.318 against 0.288.

**Goalie value contributes nothing** — partial r of −0.002 on one season and
+0.010 on three. Consistent with GSAx repeating at r = 0.13. Any outcomes model
must exclude goalies rather than pretend.

**The number that changed the recommendation.** Converting the value metric's
noise into dollars, via a replacement baseline and league payroll:

| | per-player error |
|---|---:|
| one season of measured value | ±$1.28M |
| three seasons pooled | **±$0.74M** |
| the price model, walk-forward | ±$1.22M |

Three seasons of measured production is a *tighter* estimate than the price
model's, which is the opposite of what the weak team-level result suggested. The
two are not measuring the same thing — one predicts what a club paid, the other
estimates value in goals — but for deciding whether a contract is good, the
second is the number you want to compare a cap hit against.

**Caveats that matter.** The $0.35M-per-goal conversion does a lot of the work
and is rough (32 clubs × $80M of real payroll ÷ 7,328 goals above replacement);
at $0.50M a goal the errors become ±$1.06M and ±$0.61M. The value metric itself
is crude — on-ice xG differential over five, plus individual finishing, with no
adjustment for teammates, competition or zone starts. And it repeats at
**r = 0.540** year over year, which is *worse* than plain points per sixty at
0.72: the on-ice component carries real signal and a lot of team noise with it.

**The recommendation.** Build it, narrowly, and drop the framing that started
it. It should not replace the price model and it cannot adjudicate who was
right — the gate says a player-value sum is a weaker predictor of team results
than the crudest possible baseline. What it can be is a **second, independent
read**: the market prices him here, three seasons of measured production value
him there, and two numbers that disagree is information the price model
structurally cannot produce, because it is fitted on prices.

Scope, if it goes ahead: skaters only, three-season pooled, presented beside the
market price and never as a verdict, with the dollars-per-goal calibration done
properly rather than with the rough constant used here.

## Two readings of one number

X-NAV blends what a player does on the ice with what his contract costs and
prints one figure. That is the right number for a trade — no general manager is
indifferent between an $18.8M Celebrini and a $1M one — but a rich deal can
swallow a good player and a reader cannot see which half is which. Dropping the
contract, which was the other option on the table, would say those two
Celebrinis are worth the same, which describes nobody.

`navSplit` lives beside `reconcileStages` because it has the same obligation:
the two figures are integers and they sum **exactly** to the rounded headline.
The contract half is taken as the remainder so rounding cannot open a gap.

**Apportioning the adjustments.** Scarcity, development risk, the franchise
floor and sample credibility all act on the on-ice value and the contract
together, so neither owns them. Each is split in proportion to the *absolute*
size of the two bases — signed weights would let a large negative contract flip
the apportionment inside out, which the test pins.

**A bug the tests caught.** `youngFloor` — the goalie cost-controlled floor — is
emitted with `kind: "adjustment"` because of how the engine applies it, but it
is a statement about cheap years on a deal, not about the goalie. Testing `kind`
before the key sent it into the apportioned pool and credited most of it to the
player. Key is checked first now.

The dossier leads with the three figures — on the ice, his contract, trade value
— above the existing stage rows, so the breakdown reads as an explanation of the
split rather than a separate accounting.

## What a goal is worth: $0.27M, and it is not a constant

The rough figure was `32 clubs × $80M ÷ 7,328 GAR` = $0.35M a goal. Every term
was a guess, and the worst was replacement level — set at the 10th percentile of
a rate distribution because it sounded about right. Replacement is the
denominator, so guessing it sets the answer.

**Replacement level is measured now.** A replacement player is not a percentile;
he is the man a club can sign for the minimum, and 1,630 such contracts are on
file. Taking standard deals at or under 1.1% of the cap, signed at 25 or older,
and looking at what those 656 players actually produced gives **−0.129 goals per
60** against the league average. Entry-level deals are excluded and it matters —
Celebrini is on one. A cheap contract only measures replacement when the player
was free to sign anywhere and nobody bid more.

**Two routes were tried. One of them fails, instructively.**

| | rate | a median full season | best season on file |
|---|---:|---:|---:|
| market slope (published) | 0.26% of cap/goal | $2.26M | $11.97M |
| budget constraint (rejected) | 1.63% of cap/goal | $6.9M | $67.5M |

The market rate regresses cap share on production across 1,996 signings, and is
corroborated at 0.29% by walking the pay ladder end to end, which assumes no
functional form.

The budget route — total discretionary payroll divided by total production above
replacement — comes out **6.2× higher and is wrong**. It assumes a club's whole
discretionary spend buys the production this one metric measures. It does not:
goaltending, defence beyond on-ice expected goals, special teams, durability and
plain inefficiency all consume cap. Dividing all of the money by some of the
value inflates the rate. It is published as `budgetConstraintRejected` rather
than deleted, because the obvious second derivation deserves a recorded reason
for being thrown out — and a test pins that the two are never averaged into a
compromise with no derivation behind it.

I had flagged this route in advance as the one that would make aggregate surplus
zero by construction. That turned out to be the least of its problems.

**The rate is not constant.** Marginal price per goal along the pay ladder:

| band | % of cap per goal |
|---|---:|
| p20-40 | 0.155% |
| p40-60 | 0.124% |
| p60-80 | 0.254% |
| p80-95 | **0.404%** |
| p95-100 | 0.366% |

Roughly triple from the middle to the top — the same convexity that put
`skater-fmv.ts` on a monotone spline. A single figure is a fair average and a
bad extrapolation, so the bands are published beside it and any consumer that
treats the headline as linear at the top will understate stars.

A build guard now refuses to ship a rate that prices a median full-season skater
above 5% of the cap or the best season on record past the CBA maximum. That
guard is what caught the budget route.

## Known Issues / Future Work

### Goalie Gaps
- Development/Outlook Profile blocked for goalies
- PercentileCard only 3 stats for goalies vs 8-9 for skaters
- No goalie RosterTier type (STARTER/TANDEM/BACKUP only as UI labels)
- No goalie-specific next-contract term estimation
- calcGoalieNAV missing team-control option value, cornerstone floor
- `careerGsax` on Asset is dead code

### Remaining AA Items
- Modal focus trapping (LedgerDropdown, AssetDropdown, WelcomeModal)
- Admin trade-block keyboard access
- Text at 6.5-7px in badge/strand legend elements (globals.css)
- No aria-live regions for dynamic content
- Color-only differentiators on edge luck values
