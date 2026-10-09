# Team balance charts and daily matchup draft — 2026-10-09

This draft builds on the expanded-team parity correction in PR #53. It uses the existing Recharts dependency and shared ledger styling; it adds no dependencies, source endpoints, schema, flags or Production writes. Delivery is a draft PR, not a Production deployment.

## Scope

- Dedicated team pages and expanded Teams cards share two grouped bar panels: goals per game and shots per game, each starting at zero with its own units/scale.
- Goals rates use the selected NHL team summary totals divided by games played. Shots use the published per-game fields directly; they are not divided a second time.
- The chart uses full-precision inputs; visible values round to two decimals. Text summaries and keyboard-accessible value tables provide the same information without hover or color interpretation.
- Valid measured zeros remain zero. Missing fields are omitted individually. Zero games, unavailable coverage, unsupported seasons and wrong season/competition never become fabricated zero averages or historical model substitutes. Net rates require both components.
- These are season-to-date all-situations results. They do not predict tonight’s score, establish a starter or indicate confirmed lines. The NHL team summary defines the totals; no player-goalie GAA or player-goal summation is substituted.

## Daily matchups

The existing Home game strip links to the shareable Teams Tonight’s games view (`/teams?view=games&game=...`). Opening a game adds both teams to the same goal and shot panels. The existing daily slate, scores/status, venue, broadcasts, team-page links and current model outlook comparison remain available.

Statistics use the actual game’s season and competition, independently of the Teams analytics selector. Matching parent observations are reused; otherwise the opened comparison makes a cached `/api/league` request for the game’s identity. The request is aborted on identity changes, errors consume the HTTP body and fail visibly, and prior-season responses cannot flash under a new selection. Unsupported preseason/season coverage stays unavailable instead of borrowing regular-season data. Model outlooks still use current rosters/contracts and their stated 2025–26 inputs.

The scoreboard refreshes each minute while visible. Season summaries follow the existing cached league observation behavior; these panels are not a live within-game shot counter. Historical day browsing and game-by-game form trends are separate future work, as are confirmed lines and starting goalie feeds.

## Implementation references

- Existing player plots establish dynamic client loading of Recharts. Official references: [Recharts BarChart](https://recharts.github.io/en-US/api/BarChart/) and [Next.js lazy loading](https://nextjs.org/docs/app/guides/lazy-loading).
- `team-balance.ts` owns identity validation, units, missing-data behavior and formatting; the same model drives the charts, summaries and tables.
- Review the two chart scales separately: goal counts and shot counts are not normalized into a synthetic score or mixed axis.

## Verification

- `npm test`: 2,914/2,914 passed across 231 files, including ten focused unit cases for denominators, already-normalized shot rates, season/competition identity, partial and zero-game coverage, invalid values and signed differences.
- Typecheck, production build, changed-file ESLint and `git diff --check` passed.
- Fourteen isolated Playwright journeys used read-only live league/player/lineup snapshots and the actual 2026-10-09 NHL slate, including Anaheim at Winnipeg (2026020069): team and daily matchup views at 320/412/768/1440px, rendered Recharts SVGs, keyboard value disclosures, mobile-sheet Escape, zero/partial coverage, different analytics/game seasons, HTTP 503 fallback and unsupported preseason.
- Pinned axe-core 4.10.3 (verified SHA-256) found zero serious/critical issues in the chart and selected-game regions at all four widths. No horizontal overflow or browser page errors occurred in the normal journeys.
- Screenshots: `/tmp/team-balance-team-{320,412,768,1440}.png` and `/tmp/team-balance-matchup-{320,412,768,1440}.png`.

These browser results are fixture proof, separate from hosted operational verification. No real capture, migration, Production flag or manual lineup record is changed. Production rollout is outside this draft.
