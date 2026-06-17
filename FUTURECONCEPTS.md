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

