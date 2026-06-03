# `CRITICALPRIORITY.md`

This document tracks the master architectural remediation roadmap for `nhlTradeMachine`. It prioritizes stability fixes, performance updates, and enterprise scaling milestones to transition the codebase from a functional prototype to an enterprise-grade platform.

---

## 🚨 Phase 1: Critical Priority (Structural Threats & Core Stability)

These items address fundamental design flaws that risk client-side runtime crashes, memory leaks, security bypasses, or unpredictable operational expenses under production scaling.

### 1. Unified Valuation Engine Convergence

* **The Issue:** The application maintains separate calculation engines in `app/lib/xnav-engine.ts` (client rendering) and `app/api/evaluate/route.ts` (server trade evaluation). These files have drifted apart on fallback branches and positional scalars, causing split-brain validation errors where the UI context conflicts with the server's verdict.


* **The Fix:** Remove duplicate valuation math from `app/api/evaluate/route.ts`. Refactor the server route to import and run calculations directly from the single source of truth in `app/lib/xnav-engine.ts`.



### 2. Type-Safe Boundary Enforcement via Zod Data Ingestion

* **The Issue:** The web scraping pipeline and external stats intake endpoints rely heavily on loose type casting (`as number`, `as string`) and static nested array index lookups (e.g., `p[18]` or `p[24]` from raw HTML scripts). If a third-party site changes its data schema, indices evaluate to `undefined`, creating `NaN` metrics that can crash the React client UI.


* **The Fix:** Implement strict Zod schemas at data boundaries. Parse incoming crawled arrays through a validator layer using `.safeParse()` to isolate individual data structural changes cleanly without breaking the entire platform runtime.

### 3. Stateless Cache Synchronization & Shared Rate Limiting

* **The Issue:** Endpoint caching and the AI proxy rate-limiting mechanisms utilize localized, in-memory global state tracking maps. Because serverless environments spin up, down, and duplicate micro-containers dynamically, global memory structures are un-synchronized across concurrent sessions. This allows users to easily bypass rate limits, exposing backend API keys to high exploitation costs.


* **The Fix:** Remove local container tracking maps. Deploy an out-of-process distributed storage layer (such as Upstash Redis) to synchronize live team states, scraper caches, and API throttling rules uniformly across serverless infrastructure containers.



### 4. Atomic Trade State Management (Zustand Migration)

* **The Issue:** Managing multi-asset trade arrays, custom retention rules, and draft pick logic using top-level layout component hooks forces deep tree re-render cascades. Every slider adjustment or drag-and-drop event forces every single visible element, layout chart, and player card to refresh, causing interface lag.
* **The Fix:** Decouple layout state completely by migrating the transactional context to an isolated, atomic store like Zustand. Ensure that structural value changes selectively trigger re-renders only on the specific data values affected.

### 5. LLM Prompt Layer Sanitization & Token Hard Caps

* **The Issue:** The external language model proxy route parses client context strings into the model prompt pipeline without escaping characters or applying structural token validation. This leaves the endpoint vulnerable to raw payload manipulation or oversized contextual returns that inflate API operational costs.


* **The Fix:** Configure strict token constraint bounds on proxy execution calls. Run character-stripping regex arrays across input parameters to strip formatting controls before assembling conversational payloads.

---

## 🧰 Phase 2: Medium Priority (Maintainability, Testing & Cleanliness)

These items optimize the project's performance footprint and establish regression testing safeguards to prevent structural logic drift during subsequent iterations.

### 1. Relational Database Extraction of Local JSON Files

* **The Issue:** Large static datasets—like bundled player contracts and performance benchmarks—are packed directly inside monolithic JSON files inside the client bundle architecture. This unnecessarily inflates initial page load payloads and slows down mobile performance metrics.


* **The Fix:** Move roster and contract data arrays out of raw project files. Relocate them inside a high-efficiency edge-database instance (such as Turso or Supabase) and leverage Next.js Server Components to fetch records matching only the specific teams involved in an active configuration.



### 2. Isolation of Calculation Weights to Configuration Schemas

* **The Issue:** The pure math execution module contains hardcoded system scalars, aging regression penalties, and positional multipliers distributed inline across the file layout. This requires a software engineer to manually modify and ship code changes just to update calculation formulas for new season dynamics.


* **The Fix:** Extract all formulas and hardcoded integers into an isolated matrix config document (e.g., `valuation-weights.json`). Build the math execution modules to load configuration parameters dynamically, enabling seamless updates and straightforward model validation adjustments.



### 3. Comprehensive End-to-End Regression Test Suite

* **The Issue:** Test scripts are limited to basic unit assessments on isolated execution loops. Complex system changes risk introducing silent calculation bugs across transaction constraints or trade validation state rules without triggering warnings.


* **The Fix:** Author complete workflow simulation layers using tools like Playwright or Vitest. Program tests to explicitly validate complex transaction procedures, verifying that financial indicators adjust accurately and rule violations register correctly.

---

## 🚀 Phase 3: The Enterprise Vision (Commercial Feature Scaling)

The institutional layer designed for advanced analytics needs, sports agencies, frontend sports networks, and organizational platform integration.

### 1. Hybrid Front-Office Pipeline & Overrides Dashboard

* **The Strategy:** Transition the data backend to a managed asset hub. Deploy an automated scraper pipeline that pulls nightly analytics to a central database, but introduce a secondary operational override table that takes system priority. This allows platform administrators to log into a secure utility dashboard to manually patch injuries, adjust trade multipliers, or update metrics instantly without deploying new code.



### 2. Strict Collective Bargaining Agreement (CBA) Compliance Layer

* **The Strategy:** Expand verification logic past fundamental cap limits to encompass full NHL CBA compliance tracking. Build rule-enforcement constraints to evaluate transactions against:
* **The 50-Contract Constraint:** Flag trades that push an acquiring organization over the active 50 standard player contract limit.
* **Retention Tracking Limits:** Enforce strict caps on concurrent team salary retentions (maximum of 3 active player retentions per team).
* **Clause Compliance:** Track dynamic interactions for No-Trade and No-Movement clauses, evaluating destination attractiveness to gauge if a player is likely to waive their waiver control requirements.





### 3. Multi-Year Financial & Roster Forecast Dashboard

* **The Strategy:** Build visual matrix grids that project roster choices over three-year horizons. Implement layout views to process dynamic salary cap growth projections, calculate pending unrestricted free agency exits, map future extension impacts, and estimate accurate baseline qualifying values for incoming restricted free agents.



### 4. Stochastic Player Evaluation Models (Monte Carlo Engine)

* **The Strategy:** Replace fixed score evaluations with probability distributions. Run multiple background simulation cycles that factor in historical variance and localized age regression metrics to estimate performance variability. Output results as a dynamic analytics indicator tracking structural value win probability over 1, 2, and 3-year windows based on aging curves and development volatility.



### 5. Headless REST API Framework for External Syndication

* **The Strategy:** Extract the pure mathematical execution layer out of the layout components entirely, wrapping the system logic inside a high-throughput headless API platform. This enables the core value calculator engine to run as an independent software-as-a-service application, capable of powering external platforms, fantasy tracking tool ecosystems, and major sports media networks.


## 🧠 Phase 4: X-NAV 2.0 (The Economics & Betting Engine)

This phase transitions the beating heart of the platform from a linear points calculator into a stochastic scarcity and probability engine, preparing it for commercial licensing in the fantasy and sports betting markets.

1. **Divergent Term Multipliers:** Split contract cost calculations to respect the immense leverage gap between cost-controlled RFAs and flight-risk UFAs.
2. **Positional Scarcity Premiums:** Apply structural value modifiers to premium positions (Centers and Top-Pairing Defensemen) to correct the undervaluation vs. Wingers.
3. **The Logistic Lemieux Asymptote:** Replace the piecewise linear offensive cap with a true exponential decay function, creating a hard mathematical ceiling for historical production.
4. **Exponential Retention Tax:** Rewrite the salary retention logic to scale exponentially rather than linearly, reflecting the real-world cash friction of billionaire owners paying dead money.
5. **Era-Agnostic Dependency Injection:** Extract all `1.6` and `4.5` integer weights into an injectable `EnvironmentWeights` matrix, allowing the engine to instantly recalibrate for different scoring eras or betting markets on the fly.

---

### The Blueprint: Expanding X-NAV to the Next Level

To make this the holy grail for betting and fantasy, the engine needs to expand from ~400 lines to a comprehensive algorithmic suite. Here is every single missing component required to reach that tier.

#### 1. The "Passenger vs. Driver" Matrix (Linemate Dependency)

Raw Point Shares and xG metrics lie because they don't decouple players from their linemates. A winger playing with Leon Draisaitl will have artificially inflated metrics. The engine must ingest WOWY (With or Without You) data to determine if a player is driving the play or just along for the ride.

* **The Math:** You need to calculate an isolation coefficient.

$$NAV_{isolated} = NAV_{raw} \times \left(1 - \frac{xG_{with} - xG_{without}}{xG_{with}}\right)$$


* **The Value:** This identifies "buy-low" candidates for front offices—players trapped on the 3rd line with bad teammates who mathematically project to explode if given top-line minutes.

#### 2. Stochastic Volatility Index (SVI)

Fantasy platforms and sports bettors do not care about an 82-game pace; they care about *game-to-game variance*. A player who scores exactly 1 point every game is great for an NHL team. A player who scores 0 points for four games and 5 points in the fifth is incredible for daily fantasy tournaments (GPPs) but a nightmare for steady prop betting.

* **The Feature:** The engine must measure the standard deviation of a player's game logs to generate an SVI score.

$$SVI = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (P_i - \mu)^2} \times \lambda_{role}$$


* **The Value:** You can output a "Boom/Bust Rating" for every player. "Player X has a median projection of 65 points, but a 90th percentile ceiling of 95 points due to extreme deployment volatility."

#### 3. Market-Implied Valuation (MIV) Layer

Right now, you are waiting for MoneyPuck data to update. If you want to cater to the betting industry, your engine needs to scrape live futures props from sportsbooks (e.g., DraftKings Over/Under point totals) and reverse-engineer them into the engine.

* **The Feature:** If Vegas sets a player's over/under at 85.5 points, but your engine projects 72 points based on historical decay, the engine highlights a **Market Discrepancy Alert**.
* **The Value:** This turns your trade machine into a direct betting arbitrage tool.

#### 4. Actuarial Attrition & Health Modeling

NHL GMs and fantasy managers get fired for ignoring injury risk. The current engine relies on a manual flag (`INJURY_RISK[asset.name]`).

* **The Feature:** The engine needs a probabilistic injury curve based on age, position, and physical playstyle (hits/blocked shots per 60). An Expected Value (EV) calculation must discount the player's total NAV by their probability of playing a full season.

$$EV = \sum (NAV \times P(health_t))$$


* **The Value:** This prevents the engine from treating a 33-year-old injury-prone defenseman with the same reliability as a 24-year-old ironman.

#### 5. Post-Season Translation (The "Grit" Multiplier)

The game changes in April. Whistles go away, the ice shrinks, and perimeter players disappear. A true simulation engine needs a separate set of weights for playoff evaluations.

* **The Feature:** Create a secondary `calcPlayoffNAV()` function that heavily weights contested puck battles, hits, blocked shots, and high-danger unassisted expected goals, while suppressing powerplay-dependent point production.
* **The Value:** You can offer a "Playoff Translation Score" to tell GMs if a player they are acquiring at the trade deadline is actually built for a 7-game series.

#### 6. Advanced Cap Mechanics (Buyouts & Dead Cash)

To make this indispensable for front offices, the engine must understand buyout economics. If you trade for a terrible $7M contract, the engine shouldn't just say "This costs $7M."

* **The Feature:** It should automatically calculate the NHL buyout formula ($2/3$ or $1/3$ ratio based on age, spread over twice the remaining term) and output: "This player is a -45 NAV, but they can be bought out next summer for a cap penalty of only $1.5M over 4 years."

---


Testing Adjustments - to be made after critical improvements: 

Barkov has a -10 NAV but was injured all year, needs to have an adjustment that coordinates with his true value

Goaltenders are hard coded to have a base of 0 NAV, I think we need to adjust this or have goalie logic be separate from skater logic to calculate truely a goaltenders value based on incoming stats.

all modal popups should freeze scroll

For realistic targets, players that have played for the team previously should be weighted less, as rarely do players come back.

Investigate why Colton Parakyo has a negative NAV 

TugBar doesnt go under 0 for a negative on negative trade.

Head-To-Head needs to be revamped and updated and for it to be its own component.

EST. WINs ADDED needs to calculate the impact of the player, not just if NAV higher === more wins. 

When trading away older player from Rebuilding team, getting "[Team B]needs picks to trade away [Player B], when adding pick to [Team A] outgoing asset, the flag isnt cleared, but when adding a pick to [Team B] outgoing assets, the flag is cleared. Should be when adding pick or prospect of reasonable value, Flag for [Team B] is cleared. 

Investigate why Dylan DeMelo DEF is so high (+71) on depth D with a -40 NAV

Player with Negative NAV causes find trade proposals not working even if overall value is positive

Investigate why Simon Edvinsson Value NAV is so low (+32) with OFF (+13) and DEF (+74)
Simon Edvinsson has 1 year left on contract not 3

Find Trade Partners often finds trades that dont go throuhg as [Team B] can't afford to lose [Player A], then why have the trade proposal pop up?

I can make a trade with a +130 NAV Net Gain. Seems extremly lopsided.
Flag for Significantly overpaying is wrong
    Reads: The NAV analysis shows Detroit Red Wings giving up 369 NAV points worth of assets and receiving only 223 — a 35% gap. Winnipeg Jets's GM has no incentive to accept this deal when they could simply wait for a better offer. Lopsided trades only happen under specific pressure: a player demanding a trade, a GM under ownership pressure to cut salary, or a team desperate to fill a critical hole before a deadline. Without that context, Winnipeg Jets holds all the leverage here.

    But: Im playing as Winnipeg, so this should read that the Red Wings GM has no incentive to accept this deal, this flag should be a hard veto unless certain parameters are met (ie outside factors)

If a player has 1 year left on contract, and we convert this into a 3-year window sim. AGE shouldnt be listed as a negative NAV, as rentals have value to them. We do already have a flag for this so we can add in an uncertainty principle that advises if a player resigns.

Dustin Wolf has a comically low NAV of +14, this should be fixed if we add a custom calculation for Goalie NAV value as we can base it on quality of team in front. 

OPS player Suggested in What This team needs has an OPS of -2, doesnt make sense.

AI still fabricating numbers, Simulation #10306 runs with WPG top scorer being Scheifele at 87 points but the AI summary reads Scheifele with 103 points.


-xnav engine roadmap to V 2.0
If the ultimate goal is to license this to front offices, fantasy syndicates, or sports betting platforms, a 400-line calculator won't cut it. To bridge the gap between a standard simulator and an enterprise-grade quantitative model, the X-NAV engine must stop looking at *what has happened* (lagging indicators) and start modeling *probability distributions of what will happen next* (stochastic forecasting).

Here is how we integrate the engine rewrite into the remediation pipeline, followed by the blueprint to "go full AI" and turn this into an industry-leading economics engine.

---

