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
- Phase B (next): SpacetimeRink — lattice-warp visualization where the rink
  grid curves around the zone masses (GR rubber-sheet rendering)

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
