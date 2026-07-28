# Cap & Crease

NHL trade machine, roster ledger, player analytics desk, and offseason simulator on a three season sim.

The app is built around one central workflow: assemble real NHL roster, contract, draft-pick, and team-context data; value assets with X-NAV; audit trades with front-office logic; then simulate or publish the outcome.

## Current Product Surface

- **Armchair GM** (`/armchair-gm`) - primary interactive trade/offseason experience with team selection, trade panels, trade block intelligence, lineup editing, re-sign phase, RFA offer sheets, draft night, GM audit, and season simulation.
- **Focused Trade Machine** (`/trade-machine`) - compact trade builder with shareable links and locked verdict snapshots.
- **Player Analytics** (`/players`) - league-wide player table with team cards, percentile cards, STRAND views, timelines, development outlooks, awards, and sortable skater/goalie sections.
- **The Docket** (`/docket`) - public published-trade ledger with frozen at-trade verdicts and current-day reassessment.
- **Shared Trades** (`/t/[code]`) - reconstructs versioned share payloads.
- **Methodology** (`/methodology`) - expanded glossary and methodology reference.
- **Admin** (`/admin`) - authenticated tools for contracts, free-agent status, team overrides, trade block flags, draft-pick ownership, saved Docket trades, cap settings, and reset/cache operations.


## Core Systems

### X-NAV Valuation

`app/lib/xnav-engine.ts` is the valuation engine. It blends production, defensive value, age curve, contract surplus, prospect pedigree, goalie context, salary retention, development signals, and package compression into asset-level NAV.

### Canonical Roster Assembly

`app/lib/roster-assembly.ts` builds the player universe used by the trade flows and analytics pages.

Important current architecture:

- The `players` DB table is the source of truth for contract, free-agency, roster exclusion, retirement, and provenance fields.
- Contract/FA facts are stored as `expiry_status`, `expiry_year`, `exclude_from_roster`, and `source` (`seed`, `sync`, `editor`).
- Reads do not scrape contracts. Ingestion is write-time through Contract Admin sync/seed flows.
- `source='editor'` rows are protected from live sync until explicitly reset through Contract Admin's `EDITOR -> SYNC` action.

### Draft Picks

Draft-pick inventory is generated at runtime from `SEASON.draftYear` for rounds 1-5 across five draft years. Ownership overrides live in `draft_pick_overrides` and are merged by `app/lib/draft-pick-inventory.ts`, so moved picks keep original-owner valuation while appearing under the current owner.

### Team and Cache Data

Team payloads are split between:

- `/api/league` - full league payload with canonical roster and picks.
- `/api/league/teams` - team/pick payload used by trade UIs.
- `/api/league/players` - player roster payload.

Redis is optional locally. When configured, caches cover team payloads, contracts, MoneyPuck CSVs, NHL summary stats, point shares, development sources, and prospect enrichment. Team cache keys include cap-specific variants managed by `app/lib/team-cache.ts`.

### Offseason Mode

The app is framed as a forward-looking `SEASON.label` projection. Current season constants live in `app/lib/season-config.ts`.

The offseason flow includes:

- UFA/RFA re-sign decisions.
- RFA offer-sheet compensation logic.
- Draft Night first-round simulation.
- Drafted rookie asset injection.
- Lineup and starting-goalie control before simulation.

## Tech Stack

- **Framework:** Next.js 14 App Router
- **Language:** TypeScript
- **UI:** React 18, Tailwind CSS, custom newspaper/ledger CSS
- **State:** Zustand where useful; local component state elsewhere
- **Database:** Drizzle ORM with libSQL/Turso, falling back to `file:local.db`
- **Cache:** Upstash Redis when configured
- **Tests:** Vitest
- **AI Narrative:** Anthropic Claude endpoint for locked trade memos and season recaps

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

No environment variables are required for a basic local boot because the database client falls back to `file:local.db` and Redis is optional. Features that call external services or admin tools need the variables below.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | No locally / yes for Turso | libSQL/Turso database URL. Defaults to `file:local.db`. |
| `DATABASE_AUTH_TOKEN` | Turso only | Auth token for remote libSQL/Turso. |
| `UPSTASH_REDIS_REST_URL` | Optional | Enables shared Redis caches and Claude rate-limit windows. |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Upstash Redis token. |
| `ADMIN_KEY` or `ADMIN_PASSWORD` | Required for admin | Shared admin secret. API routes fail closed without one unless dev auth is explicitly disabled. |
| `ADMIN_DISABLE_AUTH` | Local dev only | Set to `1` to bypass admin auth outside production. |
| `ANTHROPIC_API_KEY` | Optional unless using AI narrative | Enables `/api/claude` trade memo and season recap generation. |

Use `.env.local` for local values. `drizzle.config.ts` loads `.env.local` first, then `.env`.

## Useful Commands

```bash
npm run dev          # Next dev server
npm run build        # Production build
npm run start        # Start production server after build
npm run test         # Vitest suite
npx tsc --noEmit     # Typecheck
npm run db:generate  # Generate Drizzle migrations
npm run db:push      # Push schema to configured database
npm run build:seed   # Rebuild committed league seed data
```

Project workflow expects logic changes to pass both `npm run test` and `npx tsc --noEmit`.

## Admin Operations

Admin routes are under `/admin` and `/api/admin/*`.

Main tools:

- **Contracts** - load baseline, sync live CapWages data into DB, edit contract/FA status, exclude players, retire/restore players, reset editor rows back to sync.
- **Teams** - override team phase or standing.
- **Trade Block** - mark players requested, available, or untouchable.
- **Draft Picks** - persist real-life pick ownership movement.
- **Trades** - save, publish, unpublish, and edit frozen Docket trade entries.
- **Settings** - cap ceiling/floor overrides, cache clear, hard reset.
- **Free Agents** - deprecated signpost; FA control now lives in Contract Admin.

Documented curl-only endpoints are in `docs/admin-endpoints.md`.

## Data Sources

The app combines live, cached, generated, and curated sources:

- NHL public APIs for rosters, standings, skater summaries, goalie summaries, and headshots.
- MoneyPuck CSVs for expected-goals context, goalie GSAX, and related baselines.
- CapWages scraping for contract ingestion through admin sync.
- Local seed/baseline data under `app/data` for league contracts, draft boards, awards, and analytics baselines.
- DB overrides for admin-curated player facts, teams, trade block entries, draft-pick ownership, saved trades, and site settings.

Large data directories and generated bundles are intentionally excluded from agent context by `.codexignore`.

## Testing

The suite mixes behavioral tests with source canaries. Source canaries are intentional: they guard high-risk integration paths that have regressed during refactors, including roster assembly, admin auth, cache invalidation, draft-pick ownership, trade-block behavior, Docket publishing, and contract sync.

Recent full-suite baseline: 351 passing tests across 24 files.

Run:

```bash
npm run test
npx tsc --noEmit
```

## Project Docs

- `AGENTS.md` - repo workflow rules for coding agents.
- `docs/TASKS.md` - active task queue.
- `docs/DEVNOTES.md` - implementation history and operational notes.
- `docs/bugs/KNOWNBUGS.md` - triage inbox.
- `docs/bugs/CONFIRMEDFIXES.md` - completed bug fixes.
- `docs/futures/FUTURECONCEPTS.md` - future planning.
- `docs/CODEXAUDIT.md` - Codex audit findings from 2026-06-29.
- `ANALYTICS.md` - deeper analytics/model documentation.

## Current Season Framing

The active app frame is the `2026-27` projection season, using `2025-26` as the last completed statistical baseline where needed. Update `app/lib/season-config.ts` each September before moving the model to a new season.

## License

Private project. All rights reserved.
