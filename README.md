# The Hockey Ledger

> NHL Trade Machine — Live analytics, GM logic engine, and AI season simulation.
> X-NAV 2.0 · Built for the armchair GM who thinks they can do better.

## Live Demo
[nhl-trade-machine.vercel.app](https://nhl-trade-machine.vercel.app)

## What It Is

The Hockey Ledger is a full-stack NHL trade simulator powered by live data 
from three APIs. Build a trade, run a 15-point GM audit, simulate a full 
season with AI, and see if your move wins the Cup or earns the first overall 
pick.

It is not a generic stat aggregator. It is an attempt to model how a real 
front office thinks about player value, contract liability, team phase, and 
organizational direction — and then simulate what happens next. A future 
fantasy manager extension is planned on top of the same development timeline 
layer, with separate dynasty and projection logic from X-NAV.

## Features

- **X-NAV 2.0 Engine** — player valuation model combining offensive 
  production, defensive suppression, age curve, and contract cost
- **STRAND™ Visualization** — Double-helix DNA profile for every skater, 
  driven by live Point Shares computed from the NHL Stats API
- **GM Logic Engine** — 15+ real-world veto checks: cap compliance, NMC/NTC 
  probability, timeline mismatch, positional depth, same-division conflicts
- **Trade Proposals** — AI-assisted package generation with fit scoring, 
  motivation reasoning, and risk indicators
- **Season Simulator** — Claude Sonnet simulates a full year post-trade with 
  narrative column, year in numbers, and draft lottery
- **Player Analytics** — Full league analytics page with STRAND™ profiles, 
  sortable by PPG, OPS, DPS, TOI, and more
- **Live Data** — NHL API, MoneyPuck advanced stats, CapWages contracts — 
  refreshed every session

## Setup

```bash
git clone https://github.com/BradyCorps/nhlTradeMachine
cd nhlTradeMachine
npm install
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
npm run dev
```


## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Season simulator + front office memo |

## Data Sources

| Source | Data | Cache |
|---|---|---|
| `api-web.nhle.com` | Rosters, headshots | 6hr |
| `api.nhle.com/stats` | Standings, skater stats, Point Shares | 6-12hr |
| `moneypuck.com` | xG, GSAx, TOI, QoC, zone starts | 6hr |
| `capwages.com` | Contracts, cap space | 23hr |
| `contracts.bundled.json` | NMC/NTC clauses, extensions | Manual — update each September |

## Analytics Methodology

See [ANALYTICS.md](./ANALYTICS.md) for full documentation of:
- X-NAV 2.0 model components (OFF, DEF, YNG, CAP, NOIV)
- Point Shares formula and implementation
- STRAND™ node definitions (SCR, xG, SUPP, QoC, DZ%, AGE, TOI+)
- GM Logic Engine flag categories
- Contract data architecture and known limitations

## Tech Stack

- **Framework** — Next.js 14 (App Router)
- **Language** — TypeScript
- **Styling** — Tailwind CSS + custom CSS (newspaper aesthetic)
- **AI** — Anthropic Claude Sonnet (simulation) + Claude API
- **Deployment** — Vercel

## Known Limitations

- `contracts.bundled.json` requires manual update each offseason for new 
  extensions, buyouts, and NMC changes
- CapWages scraping may break if their frontend schema changes — monitor 
  cap hit sanity check ($0.70M-$18.0M) as the primary signal
- AI season simulation generates plausible fiction, not prediction
- Players with under 20 games have unreliable advanced stats — Bayesian 
  regularization pulls small samples toward league average

## License

All rights reserved. The X-NAV model, STRAND™ visualization, and GM Logic 
Engine are proprietary. The codebase is private.

---

*The Hockey Ledger · X-NAV 2.0 · STRAND™ · Est. 2026*
