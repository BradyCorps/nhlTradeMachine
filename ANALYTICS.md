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

## G-NAV — Goalie Net Asset Value

A separate model for goaltenders built around:
- **GSAx** (Goals Saved Above Expected) from MoneyPuck — the gold standard for goalie evaluation
- **Games started tier** — starter (40+ GP), tandem (25-39 GP), backup (<25 GP)
- **Pedigree floor** — elite goalies with Vezina/Hart history maintain a minimum floor value even in down years
- **Contract dynamics** — same CAP penalty structure as skaters

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

Add a `development-profile` module that consumes current player data plus timeline snapshots and returns:

```ts
{
  developmentPhase,
  breakoutProbability,
  regressionRisk,
  dynastyScore,
  projectionBand
}
```

The trade simulator can use this as a future-value modifier. The fantasy manager can use it directly as the core keeper/dynasty signal.

### Sprint Roadmap

**Sprint 1 — Data Contracts and Fixtures**
- Define `PlayerSeasonSnapshot`, `DevelopmentPhase`, `ProjectionBand`, and `FantasyProfile` in a shared module.
- Add fixture tests for Brad Lambert, Aatu Raty, a peak veteran, and an aging regression-risk veteran.
- Keep this sprint read-only: no valuation changes until the derived fields are stable.

**Sprint 2 — Source Adapters**
- Add NHL summary/game-log adapter for career and season production.
- Add NHL Edge adapter or endpoint notes using `nhl-api-py` as the discovery reference.
- Add timeline import shape for AHL/CHL/NCAA/Europe once a source is selected.
- Add cache keys and admin diagnostics for missing or suspicious timeline rows.

**Sprint 3 — Development Profile Engine**
- Compute NHLe-adjusted trend, role growth, NHL sample confidence, breakout probability, and regression risk.
- Return projection bands instead of single-point certainty for limited-sample players.
- Keep X-NAV unchanged except for exposing the new profile beside the player.

**Sprint 4 — Trade Sim Integration**
- Add future-value badges to asset cards and trade audit reasoning.
- Let GM logic reference development phase when judging rebuilders, contenders, and prospect-for-veteran swaps.
- Audit whether youth optionality in X-NAV should be reduced once the development profile carries that information explicitly.

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
