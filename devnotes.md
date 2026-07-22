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

### Still open from audit (next rounds)
- TM1 (Phase 3 picker), PA12 (Outlook), D1 (docket CSV ingestion),
  F0 (fantasy workshop — flagged release priority)

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
