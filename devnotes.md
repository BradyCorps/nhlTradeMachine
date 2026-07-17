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
