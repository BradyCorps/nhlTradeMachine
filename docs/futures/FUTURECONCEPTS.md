# Future Concepts

## Admin Stats Sync / Data Resilience

Add an admin-facing stats sync tool separate from contract sync.

Current concern:

* The app is heavily dependent on MoneyPuck for player stat freshness and advanced context.
* When MoneyPuck misses or mismatches a player, the app can show `EST`, stale values, or distorted NAV.
* Recent examples include Alexis Lafreniere and Devon Levi, where fallback behavior matters.

Concept:

* Add a dedicated `Sync Stats` button in the admin panel.
* Clear and refresh stat-related caches without changing contract DB records.
* Report source coverage after sync:

  * MoneyPuck skater matches
  * MoneyPuck goalie matches
  * NHL skater fallback matches
  * NHL goalie fallback matches
  * unmatched roster players
  * players still showing `EST`

Longer-term goal:

* Reduce single-source dependency on MoneyPuck.
* Treat MoneyPuck as one preferred source, not the only source.
* Build source diagnostics into admin workflows so data problems are visible before they affect trade valuation.

# The Docket — build plan (actionable, gated)

Actionable breakdown of the **The Docket** concept (see `FUTURECONCEPTS.md → The Docket`
for rationale). Follow **AGENTS.md → Task Discipline**: one scoped task per run, minimal
diff, `npm test` + typecheck before finishing.

> NOT in the active queue yet. These are **gated** behind prerequisites (auth + Phase 2
> consolidation). The user promotes a phase into `docs/TASKS.md` when its gate is met. Do
> NOT start a Docket write/roster task before its prerequisite phase is done.

Decisions baked in (from review):
- Renamed Ledger Trade Tracker → **The Docket** (entries are *rulings*, not just a log).
- A published trade **mutates rosters app-wide** via a **non-destructive transactions
  overlay** applied at ONE canonical roster-assembly module — never direct DB rewrites
  (a re-scrape would clobber them).
- **Dynamic Cap Space is a delta** off the authoritative static `capSpace`, not a full
  roster recompute (preserves Decision A's accuracy for LTIR/bonuses/buried money).
- Dual grade: at-trade snapshot (frozen) + today (dynamic on read).
- Auth + Phase 2 consolidation are HARD prerequisites.

Legend: `[ ]` to-do · `[gate]` prerequisite outside this plan.

---

## Phase A — Prerequisites (gates)

### [gate] A1 — admin auth
The Docket is write-heavy and mutates league state app-wide; an open admin could corrupt
rosters/cap for everyone. Real auth on the admin surface must land first. (Tracked
separately; the current open-admin state is the known out-of-scope item.)

### [gate] A2 — Phase 2 consolidation: canonical roster-assembly module
A single module that builds the league roster (dedup, DB-injection, stat attachment) used
by BOTH `/api/league` and `/api/league/players`. The Docket overlay and Dynamic Cap Space
both attach here; with the current twin pipelines the overlay would apply in one path and
miss in another (Woll/GSAX drift class). (Tracked as Phase 2 `2a` in the consolidation plan.)

### [ ] A3a — shared cap-delta helper
Add a pure helper `applyCapDelta(baselineCapSpace, moves)` where `moves` is the per-team set
of incoming/outgoing assets with `capHit` and `retainedPct`. Returns effective cap space:
baseline − incoming cap (net of retention held by the other team) + outgoing cap (net of
retention this team keeps). No I/O; unit-testable in isolation.
Acceptance: characterization tests cover a straight swap, a retained-salary move, and a
pick-only move (no cap change); `npm test` + typecheck pass.

### [ ] A3b — wire Dynamic Cap Space into the canonical roster layer + Armchair GM
Use `applyCapDelta` so cap space reacts to roster moves: the canonical roster module exposes
effective cap space after any applied overlay (Phase C), and Armchair GM's hypothetical
trades compute their preview cap via the SAME helper (replacing any ad-hoc inline math).
Static baseline `capSpace` stays the source of truth when there are no moves (Decision A).
Acceptance: with no trades, cap space equals today's static value; after a modeled move the
two involved teams' cap shifts by the correct delta (incl. retention); non-involved teams
unchanged; `npm test` + typecheck pass.

---

## Phase B — The Docket core (persistence + grading)  [needs A1]

### [ ] B1 — `trades` data model + persistence
Add a `trades` table: `id`, `executedDate`, `source` ("manual"|"scraped"), `sourceUrl`,
`season`, `sides` (array of `{ teamId, assetsGiven[] }`, N-team-ready, render 2), each asset
`{ kind:"player"|"pick", ref:{id,nameSlug}, retainedPct, inputSnapshot, navAtTrade }`,
`conditions` (free-text), `lockedVerdict`, `gradeAtTrade` `{ perTeamNetNav, winner,
fairness }`, `published` (bool). Store the **inputSnapshot** (engine inputs at trade time),
not just IDs — stats/contracts move and IDs alone are unreliable (Woll proves it).
Acceptance: migration creates the table; a row round-trips through the data layer with the
snapshot intact; `npm test` + typecheck pass.

### [ ] B2 — grade + freeze at ingestion (reuse trade-share lock)
On save, run the evaluate engine over the trade, capture the full verdict + per-asset
`navAtTrade` + `inputSnapshot`, and FREEZE them into `lockedVerdict`/`gradeAtTrade`. Reuse
the existing `trade-share` snapshot/lock shape rather than inventing a new one.
Acceptance: saving a trade persists an immutable at-trade verdict that does not change when
underlying player data later changes; `npm test` + typecheck pass.

### [ ] B3 — admin ingestion panel
Admin-only form to build a trade with the SAME asset pickers as the trade machine (teams,
players, picks, retention), preview the grade, then save (B2) as unpublished draft.
Acceptance: an admin can assemble a 2-team trade with retention, see the grade, and save a
draft; non-admins can't reach it (A1); `npm test` + typecheck pass.

---

## Phase C — Roster mutation (app-wide)  [needs A2, A3, B1–B3]

### [ ] C1 — transactions overlay at the canonical roster-assembly module
On read, transform the base scraped roster by applying ordered **published** trades (reuse
Armchair GM `executeTrade` movement logic, now persisted + global). Non-destructive: scrapes
keep refreshing stats/contracts; the overlay keeps players on their new teams. Players page,
team pages, Armchair GM, and sim all read through this module so the move is reflected
everywhere.
Acceptance: publishing a trade moves the player across every roster surface; a subsequent
stat refresh does NOT revert the move; unpublishing restores the base roster; `npm test` +
typecheck pass.

### [ ] C2 — cap recompute on overlay (via A3 delta)
After the overlay applies, recompute the involved teams' cap via `applyCapDelta` so cap
reflects the moved (and retained) salary. Reopens Decision A for traded teams only by design.
Acceptance: after a published trade, both teams' cap shifts by the correct retention-adjusted
delta; untraded teams unchanged; `npm test` + typecheck pass.

### [ ] C3 — publish / unpublish / edit + overlay reconciliation
Admin can publish, unpublish, and edit a trade (the overlay is the unit of revert). Add
reconciliation: when a later real scrape already shows the player on his new team, the
overlay detects the match and retires itself instead of double-applying.
Acceptance: publish/unpublish toggles the app-wide move; a bad entry is fully revertible;
an already-reconciled trade does not double-move the player; `npm test` + typecheck pass.

---

## Phase D — Public surface  [needs B–C]

### [ ] D1 — public Docket page (list / filter / sort)
Filterable, sortable list of published graded trades (by date, team, NAV margin, winner).
Each row: the two packages, at-trade verdict, today verdict, NAV-margin chip.
Acceptance: the page lists published trades and filters/sorts by the above; drafts are hidden;
`npm test` + typecheck pass.

### [ ] D2 — expanded entry: full ruling + per-player detail
Expanded view reuses `VerdictPanel`, and for each player shows NAV metrics (at-trade + today),
impact metrics (evaluate/sim), **STRAND** (`StrandDisplay`), and **Development Outlook**
(`DevelopmentProfilePanel`). Picks show pick-curve NAV; conditional picks show as notes.
Acceptance: expanding an entry shows the verdict plus per-player NAV/impact/STRAND/outlook;
`npm test` + typecheck pass.

### [ ] D3 — dual-grade dynamic re-grade on read
Compute the "today" verdict on load from current data (snapshot stays frozen). Render both,
e.g. "At trade: EVEN · Today: WPG +30". Decide cache vs live (see open decisions).
Acceptance: the today grade reflects current player data while the at-trade grade is
unchanged; `npm test` + typecheck pass.

---

## Phase E — Later (post-v1)

### [ ] E1 — NAV calibration diagnostic (validation, NOT training)
A diagnostic view plotting NAV-delta-at-trade vs. market reality across many deals. Flags
systematic disagreements (NAV negative but a 1st + prospect paid — the Parayko class) as
human-review candidates. DO NOT auto-refit NAV weights to observed returns.
Acceptance: the view surfaces per-trade NAV vs. realized return and flags outliers; no engine
weights are auto-modified; `npm test` + typecheck pass.

### [ ] E2 — assisted/automated ingestion + historical seed
Import from PuckPedia/CapFriendly/dataset with admin confirm before commit; seed history from
a downloadable trades dataset for calibration sample.
Acceptance: a batch import lands as unpublished drafts for admin review; `npm test` +
typecheck pass.

---

## Open decisions (carry from concept)
- Dynamic re-grade (D3): live every load vs. cache + nightly refresh.
- Cap recompute scope (C2): traded teams only (current plan) vs. league-wide.
- Conditional-pick valuation: notes-only (v1) vs. expected-value later.
- Historical seed depth (E2): recent seasons vs. multi-year.


## Fantasy Expansion

Explore a fantasy-hockey mode built from the same player, projection, and simulation layers.

Possible directions:

* Fantasy roster valuation.
* Keeper / dynasty trade analysis.
* Category scoring support.
* Points-league scoring profiles.
* Auction or salary-cap fantasy values.
* Short-term streaming recommendations.
* Multi-year keeper outlook using development profiles.

Core question:

* Can X-NAV and development profiles be adapted into fantasy value without confusing real NHL trade value?

---

## Betting Line Expansion

Explore betting-style projections as a separate mode from trade evaluation.

Possible directions:

* Game line projection.
* Team futures probabilities.
* Player prop projection.
* Playoff odds.
* Cup odds.
* Implied probability comparison against market lines.

Important boundary:

* This should remain an analytical projection feature, not betting advice.
* Keep it separate from roster trade logic so sportsbook-style odds do not leak into NAV.

---

## Three-Year Sim Expansion

Expand the current one-year replay into a multi-season franchise simulation.

Possible directions:

* Three-year standings projection.
* Contract aging and expiry handling.
* Prospect graduation.
* Development profile-driven growth and decline.
* Draft pick value evolution.
* Cap ceiling growth.
* Team contention window tracking.
* Trade outcome review across multiple seasons.

Core goal:

* Move beyond immediate season impact and show whether a trade helps or hurts the full competitive window.
