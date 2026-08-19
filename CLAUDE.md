# Cap & Crease — working notes

NHL analytics app. Valuation engine (X-NAV), gravity/territorial models,
STRAND trait rails, trade machine. Next.js + Turso/SQLite (Drizzle) +
Upstash Redis.

## Where state lives

- **`docs/DEVNOTES.md` is the project log.** Newest entry first. Read the
  top few entries to learn what recently changed and why. Every completed
  task gets an entry — this is the handoff between sessions.
- The engine: `app/lib/xnav-engine.ts` (`calcSkaterNAV`, `calcGoalieNAV`),
  `app/lib/nav-breakdown.ts` (the accounting identity and display vocabulary).
- Data assembly: `app/lib/roster-assembly.ts` — merges Turso DB, NHL API,
  MoneyPuck CSVs, baseline JSON. Cold rebuild is ~40s, so it is always
  reached through `app/lib/cached-roster.ts` (SWR: 15m fresh / 24h stale).
- NHL feeds: `app/lib/nhl-player-feed.ts` (parsers), `app/lib/goalie-edge.ts`
  (goalie Edge capture), `app/lib/nhl-feed-capture.ts` (skater capture).

## How to work

- **One task at a time.** Finish it, then write a `docs/DEVNOTES.md` entry
  before starting the next.
- **Push to `main`.**
- Run `npx vitest run` and `npx next build` before committing. The suite is
  ~2000 tests and fast (~20s).
- Commit message trailers:
  ```
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_<id>
  ```
- **`git fetch origin main` before auditing anything.** A stale checkout has
  already caused one wrong "this is missing" conclusion.

## Hard rules

- **Never commit** raw source CSVs, cache contents, credentials, or
  ignored player-level artifacts. (`app/data/nhl-active-players.csv` is a
  deliberate exception — a committed id snapshot, no stats.)
- **Never code around bot protection** or scrape a source that has refused
  access.
- **Never name the serving model** in commits, code, or any pushed artifact.
  Chat replies only. (The `Co-Authored-By` line above is fixed boilerplate.)
- **A model input must be validated before it moves a number.** The outcomes
  model, the FMV fit, and the breakout model each got a backtest gate first.
  Display-only is fine and should say so in a comment; feeding an unvalidated
  signal into a valuation makes the model look richer while getting worse.
- Numbers shown to a user must add up. `nav-breakdown.ts` enforces this by
  construction — read its header before touching a breakdown panel.

## Environment notes

- On Claude Code web/remote, **outbound access to `api-web.nhle.com` is
  blocked** by the egress proxy. NHL feed work cannot be verified there —
  write the parser defensively and verify from a codespace with
  `npx tsx scripts/verify-goalie-edge.ts`.
- Turso is production; `file:local.db` for dev.
