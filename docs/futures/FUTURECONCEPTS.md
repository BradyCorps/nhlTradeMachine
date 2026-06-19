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

# Ledger Trade Tracker + Admin Trade System

## Concept
A persistent, NAV-graded record of real NHL trades. Where TSN/PuckPedia list that a
trade happened, the Ledger grades it: which team won, by how much NAV, or whether it
was fair — using our own X-NAV + GM-audit engine. Public-facing "Ledger Trade Tracker"
page + an admin ingestion panel. Doubles as a content/marketing hook (shareable
"Team X won this deal +38 NAV") and as a live calibration signal for the NAV model.

## Grading — dual mode (both, by design)
Every trade record carries TWO grades:
- **At-trade (snapshot):** the verdict computed at ingestion and FROZEN — "who won the
  trade the day it was made." This is the TSN-style locked verdict.
- **Today (dynamic):** recomputed on read from current player data — "how it has aged"
  (the pick became a stud, the vet declined, etc.).
The page shows both: e.g. "At trade: EVEN · Today: WPG +30". Dynamic is computed on
load (optionally cached with a timestamp); snapshot is immutable.

## Data model
`trades` table (one row per transaction):
- `id`, `executedDate`, `source` ("manual" | "scraped"), `sourceUrl`, `season`
- `sides`: array of { teamId, assetsGiven[] } — modeled as N teams (render 2 now,
  structure ready for 3-team)
- each asset: { kind: "player" | "pick", ref: {id, nameSlug}, retainedPct,
  **inputSnapshot** (the engine inputs at trade time — capHit, age, pace, etc.),
  navAtTrade }
- `conditions`: free-text (conditional picks / future considerations) — v1 is notes only
- `lockedVerdict`: full evaluate verdict at ingestion (status, metrics, per-side NAV)
- `gradeAtTrade`: { perTeamNetNav, winner, fairness }
NOTE: store the **input snapshot**, not just asset IDs — stats/contracts move, and IDs
alone are unreliable (the Woll cross-team dedup issue proves this). The existing
`trade-share` payload already snapshots+locks a verdict; reuse that shape.

## Ingestion
- **v1: manual admin entry** — admin builds the trade in a form (same asset pickers as
  the trade machine), the engine grades it, the snapshot is frozen on save.
- **later: assisted/automated** — scrape PuckPedia/CapFriendly/TSN or import a dataset;
  admin confirms before commit. (NHL has no clean trade feed, so human-in-the-loop.)

## v1 scope cuts
- 2-team trades + salary retention (model `sides` as N for forward-compat).
- 3-team trades, conditional picks, and future considerations: represent as notes/flags
  in v1; full valuation in a later phase.

## Ledger Trade Tracker page
A filterable/sortable list of graded trades (by date, team, NAV margin, winner). Each
row: the two packages, at-trade verdict, today verdict, and a NAV-margin chip. Reuses
`VerdictPanel` for the expanded view.

## NAV calibration loop (validation, NOT training)
Real returns are noisy (cap dumps, locker-room fits, GM error, hidden info), so DO NOT
auto-refit NAV weights to observed returns — that bakes one-off bad decisions into the
model. Instead:
- Plot NAV-delta-at-trade vs. market reality across many deals as a **diagnostic**.
- Flag systematic disagreements (NAV says negative, market paid a 1st + prospect) as
  **model-refinement candidates** for a human to review.
- Seed the historical ledger from a downloadable trades dataset (hockey-reference /
  PuckPedia exports / Kaggle NHL trades) to get enough sample to calibrate against.

## Dependencies & sequencing
Build AFTER (1) the consolidation (Phase 2) — a persistent graded ledger must sit on the
canonical NAV + roster/identity layer, not the drift-prone twin pipelines — and (2) auth,
since this is a write-heavy admin system and an open admin could pollute trade history.

## Reuse map
evaluate engine (grading) · trade-share snapshot/lock (per-trade record) · VerdictPanel
(display) · trade-machine asset pickers (admin ingestion) · team/player data layer.

## Open decisions
- Dynamic re-grade: recompute live every load, or cache + refresh nightly?
- Pick valuation for conditional picks (range? expected value?).
- How far back to seed (recent seasons vs. multi-year history for calibration).
---

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


---

# Ledger Trade Tracker + Admin Trade System

## Concept
A persistent, NAV-graded record of real NHL trades. Where TSN/PuckPedia list that a trade
happened, the Ledger grades it: which team won, by how much NAV, or whether it was fair —
using our X-NAV + GM-audit engine. Public "Ledger Trade Tracker" page + an admin ingestion
panel. Doubles as a content/marketing hook and a live calibration signal for NAV.

## Grading — dual mode (both, by design)
Every trade record carries TWO grades:
- **At-trade (snapshot):** verdict computed at ingestion and FROZEN — "who won the day it
  was made" (TSN-style locked verdict; reuse the `trade-share` lock shape).
- **Today (dynamic):** recomputed on read from current data — "how it has aged."
Show both, e.g. "At trade: EVEN · Today: WPG +30".

## Data model
`trades` table: `id`, `executedDate`, `source` ("manual"|"scraped"), `sourceUrl`, `season`;
`sides`: array of `{ teamId, assetsGiven[] }` (model as N teams; render 2 now); each asset
`{ kind, ref:{id,nameSlug}, retainedPct, inputSnapshot (engine inputs at trade time),
navAtTrade }`; `conditions` (free-text, v1 notes only); `lockedVerdict`; `gradeAtTrade`.
Store the input snapshot, not just IDs (stats/contracts move; IDs alone unreliable — the
Woll dedup issue proves it).

## Ingestion
v1 manual admin entry (reuse trade-machine asset pickers → grade → freeze on save); later
assisted/automated import from PuckPedia/CapFriendly/dataset with human confirm.

## v1 scope cuts
2-team + retention (sides modeled as N for forward-compat). 3-team, conditional picks,
future considerations: notes/flags in v1; full valuation later.

## Page
Filterable/sortable list of graded trades (date, team, NAV margin, winner); expanded view
reuses `VerdictPanel`.

## NAV calibration loop (validation, NOT training)
Real returns are noisy — DO NOT auto-refit NAV to observed returns. Use as a diagnostic:
plot NAV-delta-at-trade vs market reality; flag systematic disagreements (e.g. NAV negative
but a 1st + prospect paid — the Parayko class) as model-refinement candidates. Seed from a
downloadable trades dataset for sample.

## Dependencies & sequencing
Build AFTER consolidation (Phase 2) — sits on the canonical NAV + roster/identity layer,
not the drift-prone twin pipelines — and AFTER auth (write-heavy admin; open admin could
pollute trade history).

## Reuse map
evaluate engine (grading) · trade-share snapshot/lock · VerdictPanel · trade-machine asset
pickers · team/player data layer.

## Open decisions
- Dynamic re-grade: live every load vs cache + nightly refresh?
- Conditional-pick valuation (range / expected value).
- How far back to seed for calibration.