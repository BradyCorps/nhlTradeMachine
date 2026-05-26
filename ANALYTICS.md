# The Hockey Ledger — Analytics Methodology

## A Note on Value vs Worth

Every player in this database plays in the NHL. That alone puts them in the top 0.1% of hockey players on earth. A negative X-NAV does not mean a negative player — it means the *contract* represents negative trade value relative to production and term.

Colton Parayko is an elite shutdown defenceman. His negative NAV reflects a long-term commitment through his late 30s, not his ability as a hockey player. Hockey is rooted in reality: every player who dresses for an NHL game is fundamentally one of the best athletes in the world at what they do. The numbers here measure *tradeable asset value* — not human worth, not contribution to a team's culture, not the things that don't show up in a spreadsheet.

Use these numbers as a starting point for conversation, not a final verdict.

---

## X-NAV — Net Asset Value

X-NAV is a tradeable asset value model. It answers one specific question: *given this player's production, contract, age trajectory, and positional value — what would a rational GM pay to acquire them today?*

X-NAV is not a player quality model. It is a trade market model.

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
- Age at signing derived from `max(p[28], p[29])` from CapWages array — both indices encode signing age but are inconsistently ordered across players
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
1. **CapWages live scrape** — authoritative for current cap hits. Array index `p[18]` = AAV in $100K units. Years remaining computed as `totalLength(p[15]) - yearsServed(max(p[28],p[29]) - currentAge(p[8]))`.
2. **contracts.bundled.json** — authoritative for NMC/NTC clauses and contract extensions that CapWages doesn't reflect (e.g. McDavid's 2yr extension). **Must be updated manually each September when new contracts are finalized.**
3. **CONTRACT_OVERRIDES** — point corrections for known stale bundled data between seasonal updates.

---

## Data Sources

| Source | Data | Cache TTL |
|--------|------|-----------|
| `api-web.nhle.com` | Rosters, headshots | 6 hours |
| `api.nhle.com/stats` | Standings, skater stats, PS | 6hr / 12hr |
| `moneypuck.com` | Advanced analytics (xG, GSAx, TOI, QoC) | 6 hours |
| `capwages.com` | Contracts, cap space | 23 hours |
| `contracts.bundled.json` | NMC/NTC, extensions | Manual — update each September |

---

## Known Limitations

- **contracts.bundled.json** requires manual update each offseason. Extensions, buyouts, and new signings won't be reflected until the file is regenerated.
- **CapWages schema** — the player array indices are undocumented and could shift if CapWages updates their frontend. Monitor `p[18]` (cap hit sanity check: must be $0.70M-$18.0M) as the primary signal of index drift.
- **Sample size** — players with under 20 games have unreliable MoneyPuck advanced stats. The model uses Bayesian regularization to pull small samples toward league average, but early-season values should be treated with caution.
- **Goalie instability** — goalie performance has high variance year-to-year. GSAx is the most stable available metric but even elite goalies show ±10 GSAx swings between seasons.
- **AI simulation** — the season simulator generates plausible fiction informed by real trade data and constraints. It does not predict what will actually happen. Player stat lines are invented within realistic ranges. Treat it as narrative entertainment, not forecasting.

---

*The Hockey Ledger · X-NAV 7.3 · STRAND™ · Built 2025*