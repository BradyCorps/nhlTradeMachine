# The Hockey Ledger — Analytics Ledger

Current model: **X-NAV 2.0** · Built and maintained in **2026**.

The Hockey Ledger is now a live NHL trade simulation system, not just a static valuation formula. It combines current roster data, contract sync, admin DB overrides, NHL and MoneyPuck statistics, scraper validation, GM logic checks, STRAND profiles, and AI-assisted season simulation. This document is the operating ledger for how those pieces should fit together and where the next development sprints are headed.

---

## A Note on Value vs Worth

Every player in this database plays in the NHL. That alone puts them in the top 0.1% of hockey players on earth. A negative X-NAV does not mean a negative player — it means the *contract* represents negative trade value relative to production and term.

Colton Parayko is an elite shutdown defenceman. His negative NAV reflects a long-term commitment through his late 30s, not his ability as a hockey player. Hockey is rooted in reality: every player who dresses for an NHL game is fundamentally one of the best athletes in the world at what they do. The numbers here measure *tradeable asset value* — not human worth, not contribution to a team's culture, not the things that don't show up in a spreadsheet.

Use these numbers as a starting point for conversation, not a final verdict.

---

## X-NAV 2.0 — Net Asset Value

X-NAV 2.0 is a tradeable asset value model. It answers one specific question: *given this player's production, contract, age trajectory, positional value, roster context, and uncertainty — what would a rational GM pay to acquire them today?*

X-NAV is not a player quality model. It is a trade market model. The model deliberately separates current NHL value from contract surplus, team fit, and future development optionality.

### Components

#### OFF — Offensive Production Value
Derived from pts/82 pace and expected goals generated. Uses Bayesian regularization to account for sample size — a player with 15 games gets pulled toward the league positional average until sufficient data exists to trust their numbers. Normalized by position: a defenceman scoring 45 pts/82 is evaluated against the D-man average, not the forward average.

#### DEF — Defensive Suppression Value
Built from on-ice vs off-ice expected goals against, adjusted for zone deployment and quality of competition. For shutdown defencemen specifically, includes a competition-adjusted bonus based on QoC rank. The defRate metric is suppressed for players with reliable NOIV data to prevent double-counting defensive contributions.

#### YNG / AGE — Option Value / Age Curve
Young players on entry-level or cost-controlled deals carry embedded upside not reflected in current production. A 21-year-old scoring 40 points on $925K has real value a team cannot replicate in free agency. Conversely, veterans past their statistical peak carry a dynamic age curve penalty that compounds year-over-year — the model projects production decline using positional aging curves calibrated to NHL historical data.

Shows as **YNG** when positive (youth upside), **AGE** when negative (decline risk).

#### CAP — Contract Cost
A player paid more than their on-ice production justifies creates negative cap value. Long bad contracts are penalized more aggressively than short ones — the model uses dynamic cap inflation projection, computing each future contract year against an estimated ceiling that grows at ~4% annually. A $7M player in year 5 of their deal is evaluated against what $7M buys in that future market, not today's.

#### NOIV — Net On-Ice Value Multiplier
A contextual adjustment that scales the base NAV based on how much a player elevates their teammates. Three inputs:
- **xG% relative to teammates** — how much the team's shot quality improves with this player on ice vs off
- **xGA suppression** — how well they limit the opposition relative to linemates
- **Defensive zone deployment** — adjusted for how often they start in their own end

A player with NOIV significantly higher than their raw stats suggest is a hidden gem — their advanced metrics reveal impact that box scores miss.

---

## Player Gravity — v3 Production and v4 Diagnostic Boundary

Gravity v3 is the current production display. It is a position-relative territorial influence index with three bounded zone components: an OZ well, an NZ transition-proxy well, and a DZ dome. The warped rink is a model visualization, not an observed tracking heatmap or a measurement of defender attention.

Its public situation scope is `MIXED SITUATIONS`: current all-situations scoring/on-off and DPS are combined with 5v5 zone starts and baseline on/off (which can fall back to all situations), 5-on-4 production, 4-on-5 usage, and regular-season NHL EDGE aggregates that do not carry a strength-state tag. The v3 output must not be described as an all-situations or 5v5-only model.

Release A keeps v3 rate ability separate from usage: QoC and TOI are descriptive context and no longer multiply zone masses. Every zone exposes fixed-weight coverage. Missing evidence contributes no term, which shrinks the estimate toward neutral and lowers the `Reliability` index. `Signal Stability` is current-versus-baseline on-off agreement; it is not linemate independence or portability.

X-NAV receives only the bounded NZ transition portion:

```text
navResidual = 0.30 · NZ mass
GRAV = clamp(navResidual · 45, -20, +20)
```

Changes to assists, individual xG/goals, power-play production, OZ lift, or the DZ dome do not change the GRAV handoff.

Gravity v4 is a separate 5v5 Territorial Gravity contract expressed in expected goals added or prevented. The application has versioned types, validation, a loader, an off-by-default `GRAVITY_V4_ENABLED` flag, and an explicitly unfitted zero-value admin fixture. The player dossier and share-card contract can render a validated v4 profile without changing X-NAV.

No fitted v4 profile is currently authorized or bundled. Production fitting is blocked pending a legally usable shift/event or possession dataset. Held-out results, correlated-observation uncertainty intervals, league-derived visual scales/tier cutoffs, portability, and incremental X-NAV evidence remain unavailable and must not be inferred from aggregate NHL EDGE speed or zone-time fields.

---

## G-NAV — Goalie Net Asset Value

A separate model for goaltenders built around:
- **GSAx** (Goals Saved Above Expected) from MoneyPuck — the gold standard for goalie evaluation
- **Games started tier** — starter (40+ GP), tandem (25-39 GP), backup (<25 GP)
- **Pedigree floor** — elite goalies with Vezina/Hart history maintain a minimum floor value even in down years
- **Contract dynamics** — same CAP penalty structure as skaters

Goalie development is intentionally **not** part of the first Development Timeline layer. Goalie aging curves, late breakouts, team defensive environment, and save-quality volatility require a separate timeline model from skaters. The current development profile type accepts `G` only as a placeholder for future compatibility; Sprint 1 fixtures and scoring are skater-oriented. G-NAV remains the production valuation layer for goalies until a dedicated goalie development model exists.

---

## Point Shares (OPS / DPS)

Offensive and Defensive Point Shares are computed dynamically each session from the NHL Stats API using the Kubatko marginal goals framework — the same methodology used by Hockey Reference.

**Formula:**
```
goalsCreated = (G + 0.5 × A) × teamGF / (teamGF + teamGA)
marginalGF   = goalsCreated − (7/12) × TOI × leagueGCperTOI
OPS          = marginalGF / (leagueGoals / leaguePoints)

teamMGA      = (1 + 7/12) × teamGP × leagueGPG − teamGA
marginalGA   = TOIproportion × (5/7) × posAdj × teamMGA + pmAdj
DPS          = marginalGA / (leagueGoals / leaguePoints)
```

Key implementation notes:
- `leagueGPG` uses goals per **team** per game (not per contest) to match HR methodology
- Team-context adjusted GC: `(G + 0.5A) × teamGF/(teamGF+teamGA)`
- Point Shares are NHL-stat based and should be treated as current NHL contribution, not future development value
- Values within ~10-15% of Hockey Reference published figures

When PS data is available it replaces heuristic OFF/DEF estimates in STRAND™ with mathematically grounded values.

---

## STRAND™ — Stylistic Trait & Rating Analysis for NHL Development

A proprietary double-helix visualization encoding a player's complete on-ice identity. Each strand represents a dimension of the player's game — the shape of the helix tells you *what kind of player they are*.

### Offensive Strand (Navy) — 4 Nodes

| Node | Metric | What It Measures |
|------|--------|-----------------|
| **OPS** | Offensive Point Shares | Marginal offensive goals contributed, normalized to team points. Replaces SCR when PS data available. |
| **xG** | Expected Goals per 82 | Shot quality and volume generated. Forwards: normalized 0-50, D-men: 0-25. |
| **NOIV** | xG% Relative to Teammates | How much better the team's shot generation is with this player on ice vs off. Range: -12 to +12. |
| **TOI+** | Average Ice Time | Deployment reflects coach trust and role. 10-27 min range, normalized. |

### Defensive Strand (Red) — 4 Nodes

| Node | Metric | What It Measures |
|------|--------|-----------------|
| **DPS** | Defensive Point Shares | Marginal defensive goals prevented, normalized to team points. Replaces DEF when PS data available. |
| **QoC** | Quality of Competition Rank | Lower rank = harder opponents faced. Rank 1 faces the toughest competition in the league. Range: 50-400. |
| **DZ%** | Defensive Zone Start % | How often this player starts shifts in their own end. High DZ% + good SUPP = genuine shutdown role. Inverted so higher = better (more defensive trust). |
| **SUPP** | xGA Suppression | On-ice vs off-ice expected goals against relative to teammates. Positive = suppresses, negative = leaks goals. Range: -1.5 to +1.5. |

### Reading the Helix
- **Tight symmetric helix** — elite two-way player, both strands equally strong
- **One dominant strand** — one-dimensional player (not a criticism — Slavin's red strand is intentional)
- **Node size** — scales with trait strength, larger circle = more dominant attribute
- **Node value** — PS values shown in actual units (OPS 3.5), other nodes shown as 0-100 normalized score

---

## Development Timeline Layer — Future Value and Fantasy Extension

The next valuation layer separates **current NHL trade value** from **future development value**. X-NAV answers what a player is worth in a trade today. The development layer answers a different question: *where is this player's career arc likely headed, and how much uncertainty or upside is still embedded in the asset?*

This is especially important for players with limited NHL time, recent callups, AHL production, or draft pedigree that has not fully translated yet. A player like Brad Lambert should not be treated as a generic estimated ELC skater. He should carry an explicit timeline profile: age 22, NHL games played, C/RW eligibility, low cap hit, RFA path, NHL production sample, and a wider projection band than an established veteran.

### Timeline Snapshot

Each player should eventually have season-by-season rows across NHL, AHL, CHL, NCAA, European pro, and draft-year production:

```ts
type PlayerSeasonSnapshot = {
  season: string;
  age: number;
  league: "NHL" | "AHL" | "CHL" | "NCAA" | "SHL" | "Liiga" | "KHL";
  teamId?: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
  ptsPerGame: number;
  nhlePtsPace?: number;
  avgTOI?: number;
  role?: string;
  draftOverall?: number;
  draftYear?: number;
};
```

Non-NHL production should be converted through NHLe before being compared to NHL production. Raw AHL, CHL, NCAA, and European scoring rates are not interchangeable. The model should store both the original production and the translated NHL-equivalent pace.

### Development Phase

The timeline layer should classify each player into a career phase:

```ts
type DevelopmentPhase =
  | "EMERGING"
  | "BREAKOUT_CANDIDATE"
  | "PEAK_WINDOW"
  | "REGRESSION_RISK"
  | "DECLINING"
  | "UNKNOWN";
```

Working definitions:

| Phase | Signal |
|---|---|
| **EMERGING** | Age <= 23, limited NHL sample, draft pedigree or strong NHLe trend |
| **BREAKOUT_CANDIDATE** | Age 21-25, rising production, growing NHL role, increasing TOI or callup stability |
| **PEAK_WINDOW** | Age 24-29, stable NHL role, reliable production sample |
| **REGRESSION_RISK** | Age 30+, falling production or TOI, role compression, expensive term |
| **DECLINING** | Age 32+, multi-season drop, reduced usage, negative trend across role and production |
| **UNKNOWN** | Insufficient or conflicting timeline data |

### Projection Bands

Young players should not receive single-point certainty. They should receive floor, median, ceiling, and confidence bands:

```ts
type ProjectionBand = {
  floorPts82: number;
  medianPts82: number;
  ceilingPts82: number;
  confidence: number;
};
```

The smaller the NHL sample, the wider the band. Draft pedigree, AHL/NHLe trend, age, and NHL role growth push the ceiling and confidence differently. This prevents a 25-game player from being overfit while still preserving real upside.

### Fantasy Manager Profile

The fantasy extension should consume the same timeline layer but score different incentives than X-NAV:

```ts
type FantasyProfile = {
  currentFantasyScore: number;
  dynastyScore: number;
  breakoutProbability: number;
  regressionRisk: number;
  developmentPhase: DevelopmentPhase;
  timelineTrend: "RISING" | "FLAT" | "FALLING" | "VOLATILE";
  projectionBand: ProjectionBand;
};
```

Trade value cares about cap hit, term, contract surplus, and organizational fit. Fantasy value cares about scoring upside, role growth, power-play path, keeper value, volatility, and breakout/regression timing. They should share source data but remain separate models.

### Source Priority

| Data Need | Preferred Source |
|---|---|
| Identity, age, team, NHL games, NHL production | NHL APIs |
| Contract, cap hit, expiry, RFA/UFA status | CapWages / PuckPedia-style contract source |
| Minor-league and junior history | AHL / eliteprospects / hockeydb-style timeline source |
| NHL advanced analytics | MoneyPuck, with NHL summary fallback for missed skaters |
| Draft pedigree and initial ceiling | Draft class data |

### NHL / NHL Edge API Opportunity

The [`coreyjs/nhl-api-py`](https://github.com/coreyjs/nhl-api-py) project is a useful reference for the next data-access sprint. Its README describes a 2025/2026-updated Python wrapper around the new undocumented NHL APIs, including modules for teams, schedules, stats, NHL Edge data, standings, game center, players, and helper utilities. It also calls out access to hidden NHL Edge endpoints such as skating speed and shot-speed data.

The Hockey Ledger is a TypeScript/Next.js app, so this should not automatically become a production Python dependency. The immediate value is endpoint discovery and response-shape reference. If an endpoint is stable and useful, we should prefer a native TypeScript fetch wrapper with fixture tests and schema guards. A Python sidecar or script is only worth considering for offline enrichment jobs, bulk historical imports, or exploratory data audits.

NHL Edge data can help distinguish young-player development paths that box-score stats miss:
- skating speed and acceleration for transition upside
- shot speed and shot quality for goal-scoring ceiling
- puck possession / zone-entry proxies where available
- percentile movement year over year for breakout or regression signals

### Implementation Target

Sprint 1 adds `app/lib/development-profile.ts`, a read-only module that consumes current player data plus timeline snapshots and returns:

```ts
{
  currentFantasyScore,
  dynastyScore,
  developmentPhase,
  timelineTrend,
  breakoutProbability,
  regressionRisk,
  projectionBand,
  volatility,
  boomBustScore,
  nhlExperienceScore,
  pedigreeScore,
  productionScore,
  roleGrowthScore,
  tags,
  rationale
}
```

This module does **not** currently change X-NAV, trade evaluation, proposal generation, or the live league API response. That is the Sprint 1/Sprint 2 integration boundary: the model is tested and importable, but it remains opt-in until source adapters can populate timeline inputs consistently.

The trade simulator can later use this as a future-value modifier beside current X-NAV. The fantasy manager can use it more directly as the core keeper/dynasty signal.

### Current Contract

The live Sprint 1 input contract is:

```ts
type DevelopmentProfileInput = {
  id: string;
  name: string;
  position: "C" | "W" | "D" | "G";
  age: number;
  nhlGames: number;
  ptsPace: number;
  avgTOI?: number;
  draftOverall?: number;
  draftYear?: number;
  internationalScore?: number;
  teamContext?: "STRONG" | "AVERAGE" | "WEAK";
  linemateContext?: "STRONG" | "AVERAGE" | "WEAK";
  snapshots?: PlayerSeasonSnapshot[];
};
```

Key interpretation rules:
- `nhlGames` controls sample confidence and limited-experience risk.
- `ptsPace` is the current NHL points-per-82 pace for skaters.
- `snapshots[].nhlePtsPace` is the preferred cross-league trend input.
- `draftOverall` and `internationalScore` drive pedigree and early ceiling.
- `teamContext` and `linemateContext` lower near-term breakout confidence but should not erase long-term dynasty value for elite players.
- `position: "G"` is reserved for future goalie support; current scoring is not a validated goalie development model.

### Sprint 1 Fixture Canaries

The fixture suite now covers the first development archetypes:

| Fixture | Expected Signal |
|---|---|
| Brad Lambert | Limited NHL experience, wide projection band, explicit `BOOM_BUST` tag |
| Quinton Byfield | Similar age to Lambert, materially more bankable due to NHL sample and success |
| Macklin Celebrini | Elite emerging stud with high pedigree and early NHL/international signal |
| Connor Bedard | Elite emerging stud whose weak team and linemate context lowers near-term breakout certainty |
| Ivar Stenberg | Draft-year/pre-NHL emerging profile with low confidence |
| Moritz Seider | Established young defenseman in `PEAK_WINDOW` |
| Matthew Schaefer | Emerging high-pedigree defenseman after a Calder-level season |
| Mark Scheifele | Age-33 career-year profile flagged for regression risk |
| Connor McDavid | Generational modern baseline in peak window |
| Claude Giroux / Patrick Kane | Late-career declining profiles |

These tests are canaries for the model's behavior, not claims that the fixture numbers are authoritative live projections. Sprint 2 should replace hard-coded fixture inputs with source-backed adapters and schema guards.

### Sprint 2 Integration Boundary

Sprint 2 should wire the model into the data pipeline without changing trade outcomes yet:

1. Add a timeline adapter that returns `PlayerSeasonSnapshot[]` for a player ID.
2. Add an NHL summary/game-log adapter for age, NHL games, current points pace, current role, and TOI.
3. Add a draft/pedigree adapter for draft year, overall pick, and optional international score.
4. Add source diagnostics for missing snapshots, suspicious ages, missing NHL IDs, and stale league/team mappings.
5. Expose `developmentProfile` beside player data in an admin or diagnostics route first. Initial endpoint: `/api/admin/development-profile?id={playerId}`.
6. Keep X-NAV unchanged until the profile output is visible, cached, and reviewed against live players.

The first production integration should be diagnostic-only. Once the output looks stable across live rosters, the trade sim can consume it as a separate future-value panel rather than silently blending it into X-NAV.

### Diagnostic Endpoint

Development Timeline output can be inspected without changing trade value:

```http
GET /api/admin/development-profile?id=8483471
```

For source-audit work, external AHL/CHL/NCAA/Europe rows can be posted into the same diagnostic path:

```json
{
  "id": "8483471",
  "seasons": 4,
  "externalTimelineRows": [
    {
      "season": "2023-24",
      "age": 20,
      "league": "AHL",
      "teamId": "MB",
      "games": 64,
      "goals": 21,
      "assists": 34,
      "points": 55
    }
  ]
}
```

The response includes:
- `developmentInput`
- `developmentProfile`
- `diagnostics`
- `externalTimeline.acceptedRows`
- `externalTimeline.rejectedRows`
- `externalTimeline.rejected[]` with row-level rejection reasons
- `sourceCoverage.cache` with cache-enabled/cache-hit/live-fetch details
- `sourceCoverage.tradeValueChanged: false`

This endpoint is intentionally an audit surface, not a valuation integration point.

Development diagnostics use two Redis cache keys when Redis is configured:

| Cache Key | Purpose |
|---|---|
| `cache:development:nhl_skater_summary:v1` | NHL skater summary rows keyed by season ID |
| `cache:development:timeline:v1` | Per-player matched NHL timeline rows keyed by player ID and requested seasons |

`/api/admin/clear-cache` clears both keys along with the existing teams/contracts/stat fallback caches.

### Sprint Roadmap

**Sprint 1 — Data Contracts and Fixtures — Code Complete**
- Defined `PlayerSeasonSnapshot`, `DevelopmentPhase`, `ProjectionBand`, `FantasyProfile`, `DevelopmentProfileInput`, and `DevelopmentProfile` in `app/lib/development-profile.ts`.
- Added fixture tests for volatile prospects, bankable young players, elite emerging players, young defensemen, peak-window stars, regression-risk veterans, and declining veterans.
- Kept this sprint read-only: no valuation changes or route response changes.
- Explicitly deferred goalie development to a dedicated future model.

**Sprint 2 — Source Adapters — In Progress**
- Add NHL summary/game-log adapter for career and season production. Initial NHL skater summary and multi-season timeline adapters live in `app/lib/development-sources.ts`.
- Add DB draft/pedigree wiring for development inputs. Initial DB player assembly lives in `buildDevelopmentInputForDbPlayer`.
- Add diagnostic admin surface before valuation integration. Initial endpoint lives at `/api/admin/development-profile`.
- Add NHL Edge adapter or endpoint notes using `nhl-api-py` as the discovery reference.
- Add timeline import shape for AHL/CHL/NCAA/Europe once a source is selected. Guarded `ExternalTimelineRow` parsing and NHLe defaults now live in `app/lib/development-sources.ts`.
- Add cache keys and admin diagnostics for missing or suspicious timeline rows. Development summary/timeline cache keys are wired into `/api/admin/clear-cache`.

**Sprint 3 — Development Profile Engine — Code Complete**
- Computes NHLe-adjusted trend, role growth, NHL sample confidence, breakout probability, and regression risk.
- Returns projection bands instead of single-point certainty for limited-sample players.
- Exposes `developmentProfile` beside league player payloads while keeping X-NAV unchanged.

**Sprint 4 — Trade Sim Integration — Code Complete**
- Added a DEV tab to asset cards for development phase, dynasty value, projection band, confidence, and boom/bust direction.
- Let GM logic reference development phase, dynasty score, boom/bust direction, and regression risk when judging rebuilders, contenders, and prospect-for-veteran swaps.
- Let proposal generation score and explain future-core profiles, peak-window targets, and development-variance swings without changing asset value.
- Added proposal risk labels for premium assets spent on high-variance/bust-lean profiles and for selling future-core players for veteran term without picks.
- Kept X-NAV unchanged; development profile is trade-facing reasoning only.
- Still to audit: whether youth optionality in X-NAV should be reduced once the development profile carries that information explicitly.

**Sprint 5 — Fantasy Manager Extension**
- Build fantasy-specific scoring on top of the development profile.
- Separate dynasty score, redraft score, breakout probability, regression risk, and volatility.
- Add watchlist/sleeper/regression views without changing the core trade-machine workflow.

---

## GM Logic Engine

15+ real-world veto checks that model how a front office evaluates a trade. Flags fall into two categories:

**HARD flags** — genuine blockers. The model believes no rational GM in this team's position would approve the deal. Examples:
- Cap violation (can't absorb the salary)
- NMC/NTC block (player holds a no-movement clause and waiver probability is low)
- Rebuilder trading young core for aging veterans with no picks

**SOFT flags** — concerns that would come up in a pre-trade meeting but might be overcome with the right package. Examples:
- Positional depth falling below minimum viable threshold
- Same-division rivalry tension
- Significant value imbalance
- Team trading away their stated positional need

**DECLINED** means the model believes one side's GM would not sign off today given their organizational direction. It is not a statement about whether the trade makes hockey sense — it is a statement about organizational fit and rational self-interest.

---

## Contract Data Architecture

Three-layer system:
1. **CapWages live scrape** — authoritative for current cap hits and contract expiry. The scraper is intentionally defensive because CapWages exposes player rows as undocumented frontend arrays. Current parser expectations: `p[2]` = team/club slug or compact NHL tricode, `p[3]` = position, `p[8]` = age, `p[15]` = contract length, `p[18]` = AAV in $100K units, `p[24]` = expiry status, `p[29]` = expiry year. Rows are rejected if age, cap hit, position, team slug, or years remaining fall outside sanity bounds.
2. **contracts.bundled.json** — authoritative for NMC/NTC clauses and contract extensions that CapWages doesn't reflect (e.g. McDavid's 2yr extension). **Must be updated manually each September when new contracts are finalized.**
3. **CONTRACT_OVERRIDES** — point corrections for known stale bundled data between seasonal updates.

---

## Data Sources

| Source | Data | Cache TTL |
|--------|------|-----------|
| `api-web.nhle.com` | Rosters, headshots | 6 hours |
| `api.nhle.com/stats` | Standings, skater stats, PS | 6hr / 12hr |
| NHL Edge endpoints | Skating, shot, and tracking-style percentile data | TBD |
| `moneypuck.com` | Advanced analytics (xG, GSAx, TOI, QoC) | 6 hours |
| `capwages.com` | Contracts, cap space | 23 hours |
| `contracts.bundled.json` | NMC/NTC, extensions | Manual — update each September |

---

## Known Limitations

- **contracts.bundled.json** requires manual update each offseason. Extensions, buyouts, and new signings won't be reflected until the file is regenerated.
- **CapWages schema** — the player array indices are undocumented and could shift if CapWages updates their frontend. The parser now rejects suspicious rows instead of accepting bad data, but fixture tests should be updated whenever the upstream row shape changes.
- **Sample size** — players with under 20 games have unreliable MoneyPuck advanced stats. The model uses Bayesian regularization to pull small samples toward league average, but early-season values should be treated with caution.
- **Goalie instability** — goalie performance has high variance year-to-year. GSAx is the most stable available metric but even elite goalies show ±10 GSAx swings between seasons.
- **AI simulation** — the season simulator generates plausible fiction informed by real trade data and constraints. It does not predict what will actually happen. Player stat lines are invented within realistic ranges. Treat it as narrative entertainment, not forecasting.

---

*The Hockey Ledger · X-NAV 2.0 · STRAND™ · Built 2026*
