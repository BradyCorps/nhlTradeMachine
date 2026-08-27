# Cap & Crease — Consolidated Audit and Implementation Backlog

**Prepared:** August 24, 2026  
**Scope:** Mobile-first UI, Players, Teams, Fantasy, Trade Machine, Armchair GM, and the simulation engine  
**Purpose:** One executable queue ordered from fastest immediate improvements to shared foundations and then next-generation product work

## How to use this file

This is the active implementation authority across the recent audits. The detailed source audits remain useful evidence, but work should be selected and closed here so the same defect is not implemented independently on several routes.

Status markers:

- `[ ]` — active work.
- `[~]` — verify first; a completed shared change may already have fixed some or all of the symptom.
- `[x]` — completed. Do not reopen without a failed regression, new evidence, or an explicit scope change.

Effort markers:

- `XS` — less than half a day.
- `S` — approximately one day.
- `M` — approximately two to five days.
- `L` — approximately one to two weeks.
- `XL` — multi-sprint platform or model work.

### Required execution discipline

1. Work from top to bottom unless a dependency is already owned by another active task.
2. Complete one ticket per pull request unless two tickets share the same data contract and cannot be safely separated.
3. Before editing a `[~]` ticket, reproduce it against the current build and record the result.
4. Do not solve route-level data discrepancies inside presentation components. Fix the shared source, selector, or snapshot contract.
5. Every model change requires a frozen baseline, out-of-time backtest, ablation or sensitivity evidence, and a regression fixture before it moves a displayed number.
6. Every route change must preserve mobile behavior at 320, 360, 390, 412, 540, 667, 768, 844, and 1024px.
7. Every ticket closes with targeted tests, the full test suite, TypeScript, lint, and production build green.
8. Update methodology, glossary, accessible copy, API payloads, and fixtures together when terminology or a model contract changes.
9. Do not add authentication to the public lookup experience. Authentication is reserved for persistent personal state, connected leagues, alerts, notes, and collaboration.
10. In some instances the work might already be done, if that is the case, mark it as complete and move on to the next task.

## Priority summary

| Order | Work block | Goal | Exit condition |
| ---: | --- | --- | --- |
| 0 | Verification sweep | Avoid duplicate fixes after the August 24 completions | Every `[~]` item is closed or converted to a reproducible `[ ]` ticket |
| 1 | Immediate quick wins | Remove visible trust, copy, accessibility, and navigation defects | No known sub-day audit defect remains |
| 2 | Shared truth layer | Make status, contracts, value, cap, picks, and provenance canonical | Cross-route invariants and reconciliation gates pass |
| 3 | Credible public surfaces | Make Players, Teams, Fantasy, Trade, and Armchair usable as decision products | Each route answers its primary user question without hidden context |
| 4 | Connected workflow | Pass a selected player, team, trade, or fantasy decision between products | State survives every supported handoff and share round-trip |
| 5 | Future platform | Add scenarios, uncertainty, history, fit, and persistent workspaces | Cap & Crease behaves as one auditable hockey decision system |

---

# 0. Verification sweep — do before new implementation

## [x] V-01 — Reconcile this backlog with the two active triage files (`XS`)

**Check:**

- `docs/mobile-audit-triage.md`
- `docs/sim-engine-audit-triage.md`

**Action:** copy any newer completion date, test evidence, or replacement ticket into this file. Do not duplicate the full detail.

**Acceptance:** every completed triage item is represented in the Completed Register; no completed item remains in the active queue.

**Verified August 25, 2026:** the mobile triage's pre-existing foundations and completed footer increment are now represented below. Dated development evidence supersedes the simulation triage's stale `CONFIRMED` labels for `P0-1` through `P0-4` and `P1-8`; the Completed Register now records each shipped simulation fix and its latest verification. `QW-05`, `QW-06`, and `QW-10` are explicitly limited to work remaining after their related completed increments.

## [x] V-02 — Verify the remaining Players compact-layout seam (`XS`)

`M-PlayersSeam` fixed the 540–639px mixed-layout band. The later Players audit also found that the desktop grid declares a minimum width near 880px, creating a potential second failure from 640–879px.

**Verify at:** 667, 700, 768, and 844px.

**Acceptance:**

- No page-level horizontal overflow.
- The desktop header is not shown above incompatible compact cards.
- Every row exposes the same primary action and a usable sort summary.
- If already fixed, mark complete with screenshots/tests; otherwise promote `MOB-03` below.

**Verified August 25, 2026 — failed; `MOB-03` promoted.** A local production build was measured in headless Chromium after roster data loaded and the welcome state was dismissed:

| Viewport | Visible row mode | Body layout width | Expand-action bounds | Result |
| ---: | --- | ---: | ---: | --- |
| 667px | Desktop grid; compact card hidden | 1,037px | 1,013–1,037px | Clipped |
| 700px | Desktop grid; compact card hidden | 1,037px | 1,013–1,037px | Clipped |
| 768px | Desktop grid; compact card hidden | 1,037px | 1,013–1,037px | Clipped |
| 844px | Desktop grid; compact card hidden | 1,037px | 1,013–1,037px | Clipped |

The forward header and row activate at 640px with an 880px declared minimum, while their grid content reaches 1,037px. Global `html`/`body` overflow clipping keeps the document root equal to the viewport instead of exposing a scrollbar, so trailing columns and the primary expand action are unreachable rather than responsive. The active `PTS` sort summary remained visible, but the missing row action fails acceptance at all four widths.

## [x] V-03 — Re-run historic Armchair state-loss fixtures after the completed engine work (`S`)

Reproduce the former cases for:

- Macklin Celebrini disappearing after San Jose fails to sign him.
- RFAs disappearing by year three.
- `FA_POOL` behaving as a ghost team.
- Empty year-three free-agent market.
- Backup goalies receiving no simulated statistics.
- All teams reaching year two with no cap space.

**Acceptance:** each case either passes under the completed player-state/transaction invariants or receives a new minimal failing fixture attached to the appropriate active SIM ticket. Do not patch the UI around an engine-state failure.

**Verified August 25, 2026 — passed.** A retained deterministic regression fixture now exercises the former symptoms against the completed engine invariants:

| Historic symptom | Regression evidence | Result |
| --- | --- | --- |
| Macklin Celebrini disappears after San Jose cannot afford him | A low-cap San Jose offseason re-signs the expired Celebrini RFA, never emits a walk-away, and preserves his signed canonical row through the Year-3 rollover. | Pass |
| RFAs disappear by year three | Celebrini and a second San Jose RFA remain present, uniquely assigned, and signed after two offseason/rollover cycles; each transaction-state diagnostic also passes. | Pass |
| `FA_POOL` behaves as a ghost team | A canonical unsigned player remains in `FA_POOL`, while simulation standings contain exactly the 32 NHL teams and exclude both `FA_POOL` and its player projections. | Pass |
| Year-three free-agent market is empty | A persistent UFA remains discoverable in the market after both the Year-2 and Year-3 rollovers without violating the player-state partition. | Pass |
| Backup goalies receive no simulated statistics | The backup receives a non-zero start allocation plus finite GAA, save percentage, and GSAx; starter and backup starts conserve the 82-game schedule. | Pass |
| Every team reaches year two with no cap space | All 32 teams are reconciled from varied commitments against the Year-2 ceiling, producing finite positive and non-uniform cap space. | Pass |

Fixture: `__tests__/v03-armchair-state-loss.test.ts` (**4/4 focused tests; 2,174/2,174 full-suite tests passed**). TypeScript and the production build passed. Repository-wide lint remains blocked by the pre-existing internal-link error in `app/components/Header.tsx:159` plus five unrelated warnings; the V-03 fixture introduced no lint finding. No active SIM ticket required promotion, and no UI or engine code changed.

## [x] V-04 — Verify cross-surface player status and value canaries (`S`)

Check Kevin Korchinski, Ethan Del Mastro, Connor McDavid, Logan Thompson, Owen Beck, and Brad Lambert across Players, player detail, Teams, Trade Machine, Fantasy, and Armchair GM.

**Acceptance:** record one comparison matrix containing age, rights/status, active contract, cap hit, term, valuation total, components, surplus, snapshot ID, and `as_of` date. Any disagreement promotes `DATA-01` or `DATA-02` to the immediate blocking task.

**Verified August 25, 2026 — failed; `DATA-01` and `DATA-02` promoted.** A local production build returned the same raw record for all six canaries from the Players and Teams payloads. Their NAV objects were byte-equivalent between `/api/league/players`, `/api/league`, and a fresh `/api/evaluate` calculation at the $104M ceiling; all six dossier routes returned 200 and rendered the matching age and total. The shared output is nevertheless not canonical enough to pass: Korchinski and Del Mastro carry stale fallback ages and signed-contract states that conflict with the audited birthdate/Group 2 RFA truth, while no player or valuation has a snapshot ID or input `as_of`. Fantasy consumes the raw player list but no X-NAV result.

| Player | Age | Rights / status | Active contract | Cap hit | Term | X-NAV | Non-zero displayed components (NAV) | Surplus | Snapshot ID | Input `as_of` | Cross-surface comparison |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- | --- |
| Kevin Korchinski | **18 ⚠** | `SIGNED`; expiry class `null` **⚠** | CHI; expiry 2029 | $0.918M | 3yr | 32 | OFF +4.20; DEF +18.41; AGE +14.14; CAP +10.89; DEV −15.25 | +$1.71M | Missing | Missing¹ | P/PD/T/TM/A = 32; F = N/A |
| Ethan Del Mastro | **18 ⚠** | `SIGNED`; expiry class `null` **⚠** | CHI; expiry 2029 | $0.856M | 3yr | 4 | PROS +1.83; OFF −0.26; DEF +1.16; AGE +0.88; CAP +1.10; DEV −0.92 | +$1.50M | Missing | Missing¹ | P/PD/T/TM/A = 4; F = N/A |
| Connor McDavid | 29 | `SIGNED`; expiry class `null` | EDM; expiry 2028 | $12.500M | 2yr | 568 | OFF +350.06; DEF +40.26; AGE −6.26; CAP +110.15; POS +74.13 | +$4.02M | Missing | Missing¹ | P/PD/T/TM/A = 568; F = N/A |
| Logan Thompson | 29 | `SIGNED`; expiry class `null` | WSH; expiry 2031 | $5.850M | 5yr | 250 | IMPACT +327.88; CAP +150.88; ROLE −228.76 | +$3.14M | Missing | Missing¹ | P/PD/T/TM/A = 250; F = N/A |
| Owen Beck | 22 | `SIGNED`; expiry class `null` | MTL; expiry 2027 | $0.853M | 1yr | 101 | PROS +99.78; OFF +0.22; DEF +0.38; AGE +0.14; CAP +0.12; POS +0.13; DEV −0.24 | +$0.85M | Missing | Missing¹ | P/PD/T/TM/A = 101; F = N/A |
| Brad Lambert | 22 | `SIGNED`; expiry class `null` | WPG; expiry 2027 | $0.887M | 1yr | 28 | PROS +18.26; OFF +2.90; DEF +3.64; AGE +1.73; CAP +3.20; POS +1.72; DEV −3.16 | +$1.27M | Missing | Missing¹ | P/PD/T/TM/A = 28; F = N/A |

P = Players card, PD = player dossier, T = Teams, TM = Trade Machine, F = Fantasy, and A = Armchair GM. Zero-value stages are omitted from the compact component cells; each unrounded stage sum is within 0.47 NAV of the displayed whole-number total. Surplus is the unrounded model market AAV minus active cap hit, rounded to $0.01M.

¹ Both route envelopes reported `generatedAt: 2026-08-25T14:55:24.546Z`. That is cache-build time, not a valuation input timestamp or effective-dated player/contract `as_of`, and none of the six surfaces renders it. No `valuation_snapshot_id`, model version, contract snapshot, or input timestamp exists in `Asset`/`XNAVResult`. Players and the dossier calculate locally, Teams reads a precomputed map, Trade Machine and Armchair GM can recompute through `/api/evaluate`, and Fantasy does not consume the map; therefore the equal numbers observed in this run are not an enforceable immutable-snapshot guarantee.

Verification: live record/NAV route comparisons **6/6**, dossier render checks **6/6**, focused route/identity/surplus tests **36/36**, and the full suite **2,174/2,174** passed. TypeScript and the production build passed. Repository-wide lint remains blocked by the pre-existing internal-link error in `app/components/Header.tsx:159` plus five unrelated warnings; no V-04 file produced a lint finding.

## [~] V-05 — Verify team route completion did not leave league-state fragmentation (`XS`)

Dedicated team routes now exist, but the Teams audit also requires filters, metric tabs, sort, and compare state to be shareable and consistent across the league visualization and team list.

**Acceptance:** reload/back/forward/share preserve selected metric, filter, sort, team, and compare state. Any missing state moves to `QW-09`.

## [x] V-06 — Identify if F-NAV, G-NAV and D-NAV are online

The F/D/G controls are online, but they are client-side positional sums of positive per-player X-NAV, not separate positional models. They exist only on Teams. The planned F-NAV/D-NAV/G-NAV pipelines and cross-position goalie calibration are not implemented.
 
---

# 1. Immediate queue — quickest visible wins first

## [x] QW-01 — Correct player terminology, labels, and grammar (`XS`)

**Scope:**



- Fix `1 players` to `1 player`.
- Standardize `Cap`/`Contract`, `Term`/`Years left`, and position labels.
- Replace concatenated labels such as `Tage ThompsonC` and invalid forms such as `C/C`.
- Add season and situation text to expanded Stats tabs.
- Replace unexplained abbreviations with a tap/focus definition or plain label.
- Give each glyph one semantic meaning; replace overloaded `✦`, `★`, and `◆` uses with explicit chips such as `SURPLUS`, `RFA`, `ROLE: DISTRIBUTOR`, and `NAV: FRANCHISE` where the distinction matters.


**Acceptance:** a terminology snapshot test covers forward, defence, goalie, prospect, RFA, and UFA rows; no goalie surface calls G-NAV X-NAV.

**Completed August 25, 2026.** Added shared player terminology/count/NAV-label helpers and a six-row inline snapshot covering forward, defence, goalie, prospect, RFA, and UFA states; normalized duplicate positions, contract/years-left headings, expanded-stat context, plain-language metrics, and explicit status/role/NAV chips across shared player surfaces. The focused QW-01 suite passes **4/4**, the full suite passes **2,178/2,178**, TypeScript and the production build pass (**30/30** static pages), and repository lint remains blocked only by the pre-existing `Header.tsx:159` internal-anchor error plus four unrelated warnings.

## [x] QW-02 — Make search copy truthful, then normalize the search index (`S`)

The Players input promises name-or-team search but previously returned no result for `Edmonton`, `Oilers`, `EDM`, `Montreal`, `Montréal`, `Canadiens`, `MTL`, or unaccented `Stutzle`.

**Change:**

- Immediately relabel the input to `Search player name` if team indexing is not ready.
- Normalize Unicode, accents, apostrophes, punctuation, hyphens, common/formal names, cities, nicknames, and abbreviations.
- Reuse the same alias index in Trade Machine, Fantasy, and Armchair GM asset search.

**Acceptance:** fixtures cover the queries above, plus duplicate-name and formal/common-name cases; all routes return the same NHL ID for the same person.

**Completed August 25, 2026.** Added one shared accent-, punctuation-, hyphen-, common-name-, city-, franchise-nickname-, and abbreviation-aware player/team matcher and adopted it in Players, Trade Machine, Fantasy, and both Armchair offseason searches without collapsing duplicate names or rewriting NHL IDs. Focused fixtures pass **11/11** for Edmonton/Oilers/EDM, Montreal/Montréal/Canadiens/MTL, unaccented Stutzle, punctuation, formal/common names, and the two Elias Petterssons; the full suite passes **2,189/2,189**, TypeScript and the production build pass (**30/30** static pages), and lint retains only the pre-existing `Header.tsx:159` error plus four unrelated warnings.

## [x] QW-03 — Replace vague “Live data” claims with a precise time rail (`S`)

**Change:** show the exact context used by each route, for example:

`Stats: 2025–26 regular season · Contracts: 2026–27 · As of Aug 24, 2026 09:10 CT · Model: X-NAV 4.2 · Reconciliation: passed`

Teams must distinguish completed results, current roster/cap, and future forecast horizons. Fantasy must show projection season and last refresh. Trade and Armchair must show CBA/cap season and roster snapshot.

**Acceptance:** every headline number has `season`, `situation` where relevant, `asOf`, `source/coverage`, and `modelVersion`; stale or failed sources produce an explicit warning instead of `Live`.

**Completed August 25, 2026.** Added API-level provenance and one shared data-context rail across Players, Teams, Fantasy, Trade Machine/shared trades, and Armchair GM. The rails identify completed/current/future seasons, stats situations, cap/CBA horizons, Central-time snapshot timestamps, source coverage, X-NAV model version, and reconciliation state; stale, incomplete, timestamp-less, or analytics-free payloads show explicit warnings, and the former Players `Live data` claim is removed. Focused route/API tests pass **10/10**, the full suite passes **2,193/2,193**, TypeScript and the production build pass (**30/30** static pages), and lint retains only the pre-existing `Header.tsx:159` error plus four unrelated warnings.

## [x] QW-04 — Convert remaining help and glossary triggers into real controls (`S`)

**Change:** replace non-interactive `?`, icon, and hover-only spans with labelled buttons. Use a small popover on desktop and a bottom sheet on mobile. Expose `aria-expanded`, `aria-controls`, focus return, Escape dismissal, outside dismissal, and a minimum 44×44px mobile target.

**Applies to:** Players columns/icons, chart points, Teams score explanations, Trade terms, Fantasy VOR/tier/outlook explanations, and Armchair advanced statistics.

**Acceptance:** all definitions are available by keyboard and touch; no essential meaning depends on hover or `title` alone.

**Completed August 25, 2026.** Added one shared labelled help control with focus trapping/return, `aria-expanded`/`aria-controls`, Escape and outside dismissal, a desktop popover, a mobile bottom sheet, and 44×44px mobile targets. Players, charts, Teams, Trade, Fantasy, and Armchair now expose definitions through keyboard/touch controls; title-only status, contract, NAV/NOIV, role, outlook, and advanced-stat explanations were removed or given an explicit accessible equivalent. Focused accessibility and UI-canary checks pass **453/453**, the full suite passes **2,196/2,196**, TypeScript and the production build pass (**30/30** static pages), and lint retains only the pre-existing `Header.tsx:159` error plus four unrelated warnings.

## [x] QW-05 — Finish the accessible Armchair team/season selector (`XS`)

The selector already uses the shared accessible dialog/focus-management system. This residual ticket is limited to option naming, visible franchise identity, target sizing, and selected-state treatment.

**Change:** show abbreviation and full franchise name; give each option an accessible phase description such as `Anaheim Ducks — Bubble`; make the close/reset control at least 44×44px; avoid ink-black selected-state treatment that obscures state.

**Acceptance:** VoiceOver/NVDA announces franchise, season, and phase; keyboard and touch can select, close, and restart without ambiguity.

**Completed August 25, 2026.** Armchair franchise options now show both the club abbreviation and full name, and their accessible names include franchise, the 2026-27 Off-Season/In-Season mode, and competitive phase. Options, mode choices, and close/reset actions retain native keyboard behavior and at least 44×44px targets; selected clubs use a warm surface, red rule, marker, and `aria-pressed` instead of ink-black fill. Focused selector/focus tests pass **19/19**, the full suite passes **2,200/2,200**, TypeScript and the production build pass (**30/30** static pages), and lint retains only the pre-existing `Header.tsx:159` error plus four unrelated warnings.

## [x] QW-06 — Finish the compact global footer (`S`)

The completed `M-FooterKey` increment collapsed the three icon-key grids behind a native disclosure on August 23. This residual ticket covers the remaining long methodology/glossary content repeated in route footers.

**Change:** retain a compact footer with Methodology, Glossary, Sources, and Legal links. Move long definitions to dedicated pages or one accessible glossary drawer.

**Acceptance:** primary page content ends before the glossary begins; definitions remain one action away and deep-linkable; footer controls pass keyboard and touch tests.

**Completed August 25, 2026.** Removed the repeated icon-key and methodology disclosure stacks from the shared route footer. It now provides four native, 44px mobile links to Methodology, Glossary, Sources, and Legal, followed only by the compact brand/disclaimer sign-off. Full definitions and icon keys remain one action away on dedicated pages, with section and individual-entry anchors for deep links. Focused footer/UI-canary checks pass **438/438**, the full suite passes **2,203/2,203**, TypeScript and the production build pass (**30/30** static pages), and lint retains only the pre-existing `Header.tsx:159` error plus four unrelated warnings.

## [x] QW-07 — Make the homepage action-first (`S`)

The welcome modal followed by a full-screen `scroll to read` cover creates two barriers before the product.

**Change:** keep the editorial cover but expose immediate actions—`Search Players`, `Build a Trade`, and `Explore Teams`. Make the model explanation optional and skip or compact the cover after dismissal.

**Acceptance:** a first-time user reaches a primary product in one action; a returning user is not forced through both barriers; dismissal persists locally without requiring authentication.

**Completed August 25, 2026.** The homepage now opens directly on the retained newspaper masthead instead of requiring a full-viewport scroll-to-read setdown, with touch-sized `Search Players`, `Build a Trade`, and `Explore Teams` links ahead of the editorial. The locally persisted first-visit dialog offers those same one-action destinations before an optional native model disclosure and now uses the shared focus-managed dialog behavior. Focused homepage/dialog checks pass **454/454**, the full suite passes **2,207/2,207**, TypeScript and the production build pass (**30/30** static pages), changed-file lint is clean, and repository lint retains only the pre-existing `Header.tsx:159` error plus four unrelated warnings.

## [x] QW-08 — Surface the active Teams sort value (`XS`)

When Present, Future, Speed, or another metric controls order, show the exact value and league rank in each collapsed row, for example `Future 6.8 · 3rd`.

**Acceptance:** the visible row explains its current ordering without opening the dossier; the active metric has an accessible selected state.

**Completed August 25, 2026.** Every collapsed Teams row now names the active non-division sort, shows its exact value, and reports its rank against the full 32-team league rather than the current phase filter; unavailable Speed or Gravity samples render as `—` instead of a false zero. Standing and alphabetical modes remain explicit, and every sort button exposes its selected state with `aria-pressed`. Focused Teams/UI-canary checks pass **439/439**, the full suite passes **2,211/2,211**, TypeScript, changed-file lint, and the production build pass (**30/30** static pages), while repository lint retains only the pre-existing `Header.tsx:159` error plus four unrelated warnings.

## [ ] QW-09 — Persist public research state in URLs (`M`)

**Routes:** Players and Teams first; then Fantasy board, Trade Machine, and Armchair scenario entry points.

**Minimum state:** view, season, situation, sample, filters, sort, page/cursor, selected team/player, comparison set, and scenario/share identifier where safe.

**Acceptance:** reload, back/forward, copy/paste, and canonicalization work; invalid parameters recover safely; low-value filter combinations are not indexed.

## [x] QW-10 — Add route-specific headings and metadata (`S`)

`M-TeamPages` already delivered validated team detail routes and their initial metadata. This residual ticket covers the missing H1, canonical, social, structured-data, and server-content requirements across the full route set.

**Change:** add a real route H1, title, description, canonical URL, Open Graph metadata, and appropriate structured data. Players should expose crawlable player links; Teams should expose canonical team dossiers.

**Acceptance:** server HTML contains the route topic and useful first-screen content rather than only `Loading…`; metadata tests cover `/players`, `/teams`, every team route, Fantasy, Trade Machine, and Armchair GM.

**Completed August 26, 2026.** Added shared route metadata contracts with distinct H1s, titles, descriptions, canonical URLs, Open Graph/Twitter cards, and appropriate `CollectionPage`, `ItemList`, `WebApplication`, `SportsTeam`, and `Person` structured data across the public route set. Server-first shells now contain the route topic and useful explanatory content; the Teams shell exposes all 32 canonical dossier links, while structured data and the sitemap expose **1,331** numeric NHL player dossiers and **32** team dossiers. Focused metadata/UI-canary checks pass **440/440**, the full suite passes **2,216/2,216**, TypeScript and the production build pass (**30/30** static pages), and live production HTML verifies the required topics, canonicals, schema, and sitemap counts. Repository lint retains only the pre-existing `Header.tsx:159` error plus four unrelated warnings.

## [x] QW-11 — Finish small mobile spacing/cue defects (`XS`)

**Scope:**

- Pad the Docket ruling summary and verify it does not touch viewport edges.
- Add a visible swipe/scroll cue wherever horizontal controls remain intentional.
- Add tap-to-pin behavior and an accessible text/table fallback for mobile scatter points.
- Ensure sticky elements respect `env(safe-area-inset-bottom)`.

**Acceptance:** no discoverability relies on a hidden scrollbar; pinned chart data can be dismissed and compared by keyboard/touch.

**Completed August 26, 2026.** The Docket ruling disclosure is now a padded 44px control inside the existing page/card gutters; intentional horizontal control sets carry a visible compact-layout swipe/scroll cue; league scatter peers have persistent touch/keyboard pin state, Escape and button dismissal, current-player deltas, and a complete accessible comparison table; and the Armchair verdict sheet now includes the bottom safe-area inset (matching the existing Trade Machine ledger). Focused checks pass **4/4**, the full suite passes **2,220/2,220**, TypeScript and the production build pass (**30/30** static pages), and a live **320×844** browser check confirms zero page overflow, a **250×44px** Docket disclosure inset **35px** from both viewport edges, a visible filter cue, touch/keyboard pin dismissal, and the table fallback. Repository lint retains only the pre-existing `Header.tsx:159` error plus four unrelated warnings.

---

# 2. Shared P0 foundations — truth before new features

## [ ] DATA-01 — Effective-dated player, rights, roster, and contract ledger (`L`)

**Promoted to immediate blocker August 25, 2026 after `V-04` failed.** The canonical live response reports both Kevin Korchinski and Ethan Del Mastro as age 18, `SIGNED`, expiry class `null`, and under CHI contracts through 2029. This conflicts with the ticket's audited birthdate-derived age and current Group 2 RFA truth. The same stale record reaches all six products, so this must be corrected in the shared effective-dated ledger rather than a route component.

**Problem:** stale ELC/age records and collapsed status fields contaminate Players, Teams, Trade, Armchair, and dynasty Fantasy. Kevin Korchinski and Ethan Del Mastro were verified canaries.

**Canonical fields:**

- NHL ID and normalized aliases.
- Birthdate and derived age at `as_of`.
- Contract club and effective start/end dates.
- Active roster status.
- Injured/reserve status.
- NHL-contracted off-roster status.
- Signed prospect status.
- Unsigned reserve-list rights.
- RFA/UFA status and qualifying-offer state.
- Non-NHL/departed, signed-elsewhere, and retired state.

**Rules:** never infer current status from an old contract or a team-name field; never allow RFA/UFA plus a fabricated positive remaining term; never silently discard a player between states.

**Acceptance:**

- Korchinski and Del Mastro show birthdate-derived ages and current Group 2 RFA status as of the audited date.
- Owen Beck and Brad Lambert resolve to the correct RFA/contract state across all products.
- No active contract falls outside its effective window or overlaps another active contract.
- The offseason invariant remains true: `roster + retained rights + RFA + UFA + signed elsewhere + retired = previous population + drafted players`.
- One fixture covers every state transition and every route consumes the same record.

**Progress — August 27, 2026 (increment 1 of `L`; ticket remains `[ ]`).** Closed the specific canary defect and the architectural gap that caused it, without claiming the full ledger (roster/injured-reserve/off-roster/departed states, the cross-population invariant fixture, and per-route consumption of one shared record) is built yet:

- Root-caused both canaries with a live web verification (thehockeynews.com, bleachernation.com, Wikipedia, Hockey-Reference, Puckpedia): Korchinski (b. 2004-06-21) and Del Mastro (b. 2003-01-15) both had 3-year ELCs that expired after 2025-26; both received June 2026 qualifying offers that lapsed July 15, 2026 and remain unsigned Group 2 RFAs as of this date. The committed baseline (`app/data/contracts.bundled.json`, `app/lib/free-agent-seed.ts` → `app/data/league-seed.json` via `scripts/build-league-seed.ts`) still carried their original signing-time `capHit`/`yearsRemaining` with no expiry class, which is exactly the "stale contract, never rolled forward" failure mode `contract-term.ts` already documents — the read path (`deriveContractStatus`) was correct once given a true `expiryStatus`/`expiryYear`; the fed data was not.
- Verified Owen Beck and Brad Lambert against the same live sources: both already resolve correctly (Beck signed through 2026-27 then RFA; Lambert signed through 2026-27 then RFA) — no data change needed for either.
- Fixed the stale seed data (`SEED_CORRECTIONS` + the RFA class list, the sanctioned mechanism `build-league-seed.ts` already documents for exactly this bug class) and regenerated the committed `league-seed.json`; also patched the same two rows in `contracts.bundled.json` directly for the last-resort DB-unreachable fallback path.
- Closed the architectural half of the bug — a static, never-revisited `age` column — by adding a `birthDate` column (schema + migration + seed fill-only-when-missing, same provenance rules as `expiryStatus`), a single canonical `app/lib/player-age.ts` (`deriveAge`/`resolvePlayerAge`), and wiring it into every roster-assembly age site so a birthdate wins when known, a stored age is used when it isn't, and a draft-year estimate replaces the old flat "18" (or "25") fallback rather than fabricating a fixed age forever. Age is derived at read time now, not frozen at ingest.
- Not yet built (remaining `DATA-01` scope): the unified effective-dated ledger object covering roster/injured-reserve/NHL-contracted-off-roster/unsigned-reserve-list/departed states in one place; contract effective-date overlap checking; the offseason population-conservation fixture; and migrating all six product surfaces to read one shared record instead of each deriving status independently. `DATA-02`'s snapshot-ID/immutability work is a natural companion to that unification and remains untouched.
- Evidence: full suite **2,239/2,239** (4 new focused tests plus targeted additions to `derive-contract-status`, `free-agent-seed`, and `league-seed`), TypeScript clean, changed-file lint clean, and the production build passes (**30/30** static pages). Birthdates and RFA status were not verified for the remaining ~1,540 seeded players — this pass fixed the two audited canaries and the mechanism, not a bulk backfill.

## [ ] DATA-02 — One immutable valuation snapshot across all surfaces (`L`)

**Promoted to immediate blocker August 25, 2026 after `V-04` failed.** McDavid, Thompson, and the other canaries reconciled numerically across the current route and evaluator calls, but the result carries no `valuation_snapshot_id`, model version, input timestamp, contract snapshot, uncertainty, or coverage. The only timestamp is an undisplayed cache `generatedAt`, five surfaces can independently calculate/recalculate, and Fantasy consumes no X-NAV result. The observed equality is therefore transient rather than an immutable cross-product contract.

**Problem:** Connor McDavid and Logan Thompson displayed different component explanations and surplus values inside the same expanded row.

**Contract:** one `valuation_snapshot_id` must contain total, components, market price, surplus, model version, input timestamp, contract snapshot, uncertainty, and coverage. UI components may format this object but must not independently recalculate it.

**Acceptance:**

- `displayed_nav = sum(displayed_components)` within one point or the documented rounding rule.
- `displayed_surplus = displayed_market_price - active_cap_hit` within $0.01M.
- Player list, Player Card, Contract, Teams, Trade, Armchair, and Fantasy use the same snapshot ID for the same player/date.
- McDavid and Thompson canaries reconcile across every surface.
- Missing inputs widen intervals/reduce reliability instead of becoming zero or a false fixed forecast.

**Progress — August 27, 2026 (increment 1 of `L`; ticket remains `[ ]`).** Built the envelope and made it structurally, not coincidentally, consistent — without yet building the persisted provenance service (`DATA-06`) or wiring Fantasy onto X-NAV at all:

- Added `app/lib/valuation-snapshot.ts`: a `ValuationSnapshot` (`snapshotId`, `playerId`, `asOf`, `modelVersion`, `total`, `components`, `marketValue`, `surplus`, `uncertainty`, `coverage`, `contract`) built from the existing engine output. `snapshotId` is **content-addressed** — a hash of the exact engine inputs, model version, and calendar day — rather than a random or DB-issued id. That makes "the same snapshot ID for the same player/date" true by construction for any surface holding the same inputs, with no shared store required, and makes an id immutable by definition: it can never be reattached to a different total or component set, and a changed input, model version, or day always produces a different one.
- Wired it at the single existing choke point: `calculateAssetNAV` in `app/lib/asset-nav.ts`, already documented as "the only public raw-asset valuation entry point" and the function every consuming route already calls (Players, the player dossier, `/api/evaluate` — which both Trade Machine and Armchair GM recompute through per `V-04` — and the shared `buildLeagueNavMap` that Teams/Docket/Armchair read from the cached precompute). Both API routes return the full `XNAVResult` object verbatim through `NextResponse.json`, so `.snapshot` reaches every one of those surfaces' JSON responses with no per-route change. The engine itself (`calcNAV`/`calcSkaterNAV`/etc.) stays pure and untouched, so its large existing direct unit-test suite required no changes.
- `surplus` is computed as `marketValue - contract.capHit` to the cent; `uncertainty` is `null` (not zero) when the fitted model produced no error band (picks, prospects); `coverage` is `"full" | "partial" | "contract-only"` from whether the engine produced a non-contract stage.
- Evidence: 10 new focused tests proving determinism (identical inputs/day ⇒ identical id, verified as two independent calls simulating two surfaces), non-collision (any input, model-version, or day change ⇒ a different id), the sum identity, and surplus/uncertainty/coverage correctness, plus one existing source-text canary updated for the new adapter body. Full suite **2,250/2,250**, TypeScript clean, changed-file lint clean, production build passes (**30/30** static pages).
- Not yet done (remaining `DATA-02` scope): no surface renders `snapshotId`/`modelVersion`/`asOf`/`uncertainty`/`coverage` to the user yet — this increment makes the guarantee real, not yet visible; Fantasy still does not consume an X-NAV result at all (a larger product change, not a plumbing one); and there is no persisted snapshot manifest or cross-day audit trail (`DATA-06`). A live McDavid/Thompson re-run of `V-04`'s exact route comparisons was not repeated in this session — no DB/NHL egress here — but the mechanism is now such that the earlier accidental equality is a guaranteed one.

## [ ] DATA-03 — Canonical team contention and aggregation contract (`L`)

**Problem:** phase/window contradictions, mixed roster populations, incomplete lineups, and unlabeled horizons undermine Teams and GM Audit.

**Change:**

- Define one contention object or clearly distinct concepts for current phase, competitive window, present strength, future asset base, cap flexibility, and Cup outlook.
- Store active roster, all contracts, reserve list, and prospects separately.
- Require every aggregation to name its population.
- Carry `season`, `asOf`, `source`, `coverage`, and `modelVersion`.
- Render 12F/6D/2G or explicit machine-readable vacancies.

**Acceptance:**

- Rangers/Chicago/Toronto cannot display unexplained contradictory phase/window labels.
- Full lineup slot accounting passes for every team.
- Expiry counts name the league year; the 2027 UFA/RFA canary recognizes Ian Cole's one-year Chicago contract rather than showing an unexplained zero.
- F-NAV, D-NAV, and G-NAV use the documented population or explain any difference.
- Completed-season standings and goal differential reconcile.
- A Team Model Card publishes inputs, thresholds, weights, validation, and examples.

## [ ] DATA-04 — Canonical draft-pick ownership and conditions ledger (`L`)

**Problem:** Trade Machine and Armchair have shown missing rounds, stale picks, duplicate picks, and traded picks reappearing at the draft.

**Change:** model ownership by original team, current owner, draft year, round 1–7, protection/condition, condition status, conveyance alternatives, and transaction history. Reconcile accented/formal prospect names by stable ID, not display name.

**Acceptance:**

- Rounds 1–7 are available; rounds 6–7 are not silently omitted.
- Traded picks disappear from the sender and remain with the recipient through simulation and draft.
- A 2027 first traded in year one cannot reappear for the original club in year two.
- Viggo Björck/Bjorck reconciliation cannot create a duplicate selection.
- Pick value uses a distribution calibrated by year/round/position, not one deterministic placeholder.

## [ ] DATA-05 — Canonical cap, clause, retention, and CBA ledger (`L`)

**Problem:** cap arithmetic, retention slots, clauses, roster slots, and offseason space must agree between Trade Machine, Teams, and Armchair.

**Change:**

- Effective-dated cap ceiling/floor and CBA rules.
- Active-roster cap hit, buried/dead cap, retained salary, bonuses, LTIR use, unsigned required slots, and accrued deadline space.
- NMC/NTC/M-NTC detail with source/evidence state.
- Retained-salary percentage, dollar amount, original club, acquiring club, term, and occupied retention slot.
- One reconciliation object for before/after cap and roster legality.

**Acceptance:**

- A four-retained-contract stress test is a hard veto when the CBA limit is three.
- 0–50% retention recomputes cap and value consistently and cannot exceed the applicable rule.
- Every before/after cap total reconciles to displayed components.
- Missing or unverified clauses are labelled `unknown/unverified`, never asserted as fact.
- Teams cannot sign a UFA while silently losing cap space required for retained RFAs without an explicit decision and state transition.

## [ ] DATA-06 — Shared provenance, freshness, and release-gate service (`M`)

**Change:** publish a signed/versioned snapshot manifest for roster, stats, contracts, valuation, picks, team models, fantasy projections, and simulation fit. Expose last successful ingest, coverage, model version, reconciliation status, and warnings.

**Release gates:**

- Exact-name/alias invariance by NHL ID.
- Cross-surface value reconciliation.
- Contract/status/age invariants.
- Team population and lineup invariants.
- Cap/pick reconciliation.
- Missing-data uncertainty behavior.
- No future-information leakage in historical or simulated `as_of` states.

**Acceptance:** a failed domain can be diagnosed without marking the whole product `Live`; all downstream caches invalidate by `snapshotDate + modelVersion`.

---
# 2A. [X]-NAV model evolution

## [ ] NAV-01 — Build, cross-calibrate and activate F/D/G-NAV (`XL`)

**Current state:** F-NAV, D-NAV and G-NAV on the Teams page are positional sums of existing per-player X-NAV. They are not independent player-level models. The split is calculated client-side, negative player values are floored to zero, and goalie NAV has not been proven commensurate with skater NAV.

**Objective:** build position-specific player pipelines that produce F-NAV, D-NAV and G-NAV, then calibrate them into a shared X-NAV unit suitable for player comparison and team aggregation.

**Required phases:**

1. Replace the simplified manual team backtest with a harness that executes the production NAV engine.
2. Freeze training, validation and untouched holdout seasons.
3. Define separate forward, defence and goalie feature contracts.
4. Fit and validate F-NAV, D-NAV and G-NAV against position-appropriate outcomes.
5. Calibrate all three outputs into a common X-NAV asset-value scale.
6. Add uncertainty, coverage, model version and snapshot metadata.
7. Produce shadow outputs without changing public values.
8. Compare shadow and current values across player, team, trade and simulation canaries.
9. Activate behind a feature flag only after every release gate passes.
10. Move positional aggregates into the shared server snapshot/API.
11. Migrate Players, Teams, Trade Machine, Armchair GM and Fantasy together.
12. Retire the current client-side positional bucketing after parity is confirmed.

**Required output contract:**

- `navType: "F" | "D" | "G"`
- `positionalNavRaw`
- `xNavCalibrated`
- `components`
- `marketValue`
- `surplus`
- `uncertainty`
- `coverage`
- `modelVersion`
- `valuationSnapshotId`
- `asOf`

**Team aggregation:**

- `ΣF-NAV` — signed forward total.
- `ΣD-NAV` — signed defence total.
- `ΣG-NAV` — signed goalie total.
- `Roster X-NAV` — signed combined total.
- `Roster X-NAV+` — optional positive-assets-only view.

The signed and positive-only totals must never share the same label.

**Activation gates:**

- Each positional model beats its frozen current-engine baseline out of time under the existing model-improvement standard.
- F/D/G outputs are calibrated into demonstrably comparable X-NAV units.
- Goalie-to-skater equivalence is tested rather than assumed.
- Production and backtest implementations use the same calculation path.
- Player totals and displayed components reconcile.
- Team totals reconcile exactly to their underlying player snapshots.
- Negative-value handling is explicit and tested.
- Missing data widens uncertainty and reduces reliability.
- No public surface changes labels until all consuming routes are ready.
- Full suite, TypeScript, lint and production build are green.

**Acceptance:** a forward, defenceman and goalie can display F-NAV, D-NAV and G-NAV respectively while remaining meaningfully comparable through calibrated X-NAV; every team positional total is traceable to those exact player snapshots.

- After # 2A. [X]-NAV model evolution [ ] NAV-01 — Build, cross-calibrate and activate F/D/G-NAV (`XL`) is marked as complete. Replace goalie `X-NAV` labels with `G-NAV` and goalie-specific component language.
2B. Gravity v4 controlled release

[ ] GRAV-01 — Contain, validate, shadow-test and deliberately reactivate Gravity v4 (XL)

Priority: P0 containment → P1 model release
Owner: Analytics Engineering
Current production state: Gravity v3 display disabled; Gravity v4 enabled
Prepared: August 24, 2026

Current state

Gravity v4 is presently enabled in the Vercel Production environment through GRAVITY_V4_ENABLED=true. Because the fitted artifact loader is live and RELEASE_READY=true, eligible player dossiers can publicly render Gravity v4 now.

The implementation consists of:

A committed fitted artifact containing 560 player profiles.

2025–26, 5v5 offensive-zone and defensive-zone wells.

Neutral-zone values excluded because they cannot be defensibly measured from the available public data.

No public tiers.

No Gravity v4 contribution to X-NAV.

A fail-closed loader with Gravity v3 fallback capability.

An honest dossier panel describing the result as modelled, diagnostic, untiered, and excluded from X-NAV.

Public activation is nevertheless premature because:

Governing and public documentation still says Gravity v4 is locked, absent, or unfitted.

Validation results exist only in ignored files and DEVNOTES prose.

No committed, reproducible validation report exists.

The fitted artifact uses 2025–26 as its training, validation, and target season.

No out-of-time holdout has tested whether the pipeline generalizes.

RELEASE_READY=true was opened before its documented release gates passed.

The dossier can expose v4 while cards, index surfaces, and other consumers remain on v3 or no Gravity display.

Objective

Immediately contain the current unvalidated public exposure. Then establish reproducible evidence, align the repository and public documentation with reality, run an internal delivery shadow, and make a deliberate binary release decision:

Reactivate Gravity v4 as a constrained, dossier-only diagnostic; or

Keep Gravity v4 dark if any evidence or delivery gate fails.

This ticket must not wire Gravity v4 into X-NAV, create public tiers, invent a neutral-zone value, or silently mix v3 and v4 surfaces.

Phase 1 — Immediate production containment

Set GRAVITY_V4_ENABLED=false in the Vercel Production environment and redeploy.

Verify on the deployed production site that Gravity v4 no longer renders on any player dossier.

Leave NEXT_PUBLIC_GRAVITY_V3_DISPLAY_ENABLED=false unless restoring v3 is approved as a separate product decision.

Change RELEASE_READY back to false, or rename it to the accurate FITTED_ARTIFACT_AVAILABLE=true.

Replace any immediately false documentation claim with the interim truth:

A fitted 2025–26 Gravity v4 OZ/DZ diagnostic exists but is disabled pending committed validation and out-of-time testing.

Record the containment deployment, production URL, commit, environment state, and verification time.

Containment acceptance: neither Gravity version is publicly displayed, no existing X-NAV value changes, and the repository no longer represents artifact availability as release approval.

Phase 2 — Reproducible model evidence

Commit the complete validation pipeline used to generate Gravity v4 evidence.

Commit a generated validation report rather than relying on ignored files or DEVNOTES prose.

Record artifact provenance: source snapshots, seasons, situation, eligibility, exclusions, features, hyperparameters, pipeline commit, and generated checksum.

Reproduce the within-season diagnostics for both OZ and DZ:

Split-half stability.

Shot-shuffle null comparison.

Teammate-identity sensitivity.

Opponent-identity sensitivity.

Bootstrap intervals and coverage.

Missing-data and small-sample behavior.

Explain why the existing approximate within-season correlations—OZ r≈0.41 and DZ r≈0.33—are or are not sufficient for the limited diagnostic claim.

Preserve NZ as unavailable. The excluded NZ value must never be interpreted as a measured zero.

Phase 3 — Out-of-time validation

Commit the holdout protocol and thresholds before running the holdout.

Freeze all feature definitions, exclusions, hyperparameters, shrinkage rules, and evaluation metrics.

Fit the frozen pipeline using an earlier season such as 2024–25.

Evaluate it prospectively on untouched 2025–26 data.

Do not validate a 2025–26-fitted profile against an earlier season and call it out of time.

Do not change thresholds or model choices after inspecting the holdout.

Evaluate the claim Gravity v4 actually makes:

Future territorial persistence.

Offensive-zone teammate lift.

Defensive-zone opponent suppression.

Stability after controlling for teammate/opponent identity.

Reliability by sample size and coverage.

Position-specific performance.

Team-change stability where the sample permits.

State all failed cohorts and limitations.

If the frozen historical pipeline passes, rebuild the current 2025–26 descriptive artifact using the unchanged accepted methodology.

Holdout acceptance: both OZ and DZ meet their pre-registered tolerances on the untouched later season. Failure of either required zone blocks public reactivation unless the public scope is formally reduced and revalidated.

Phase 4 — Artifact and runtime contract

Add a versioned artifact manifest containing:

schemaVersion

modelVersion

trainedAt

trainingSeason

targetSeason

situation

includedZones

excludedZones

eligiblePopulation

profileCount

sourceSnapshot

pipelineCommit

artifactChecksum

tiering: false

xNavIntegration: false

Reject corrupt, stale, unsupported, incomplete, or mismatched artifacts.

Preserve fail-closed behavior without fabricating neutral values.

Add counters for artifact served, profile found, profile missing, artifact invalid, fallback used, and render failed.

Add a trainedAt/source-snapshot staleness alert.

Confirm that runtime loading does not materially regress dossier response time or payload size.

Phase 5 — Separate internal and public controls

Replace the single ambiguous activation state with:

GRAVITY_V4_RUNTIME_ENABLED — permits internal loading, validation and shadow delivery.

GRAVITY_V4_PUBLIC_ENABLED — permits public dossier rendering.

Public rendering must require both flags.

Deprecate or safely map the current GRAVITY_V4_ENABLED.

Runtime-only mode cannot expose v4 through server HTML, client hydration, APIs, cards, metadata, accessibility text, or screenshots.

Public mode cannot activate when the artifact or release evidence is invalid.

Preview, staging, and Production scopes are documented and tested independently.

Phase 6 — Internal delivery shadow

Enable runtime-only v4 in staging and then Production without public rendering.

Resolve and validate v4 beside the existing v3 calculation path for one complete traffic day.

Achieve valid profile delivery for at least 95% of eligible skaters with at least 300 5v5 minutes.

Use one explicit roster/snapshot population as the coverage denominator.

Record missing-profile causes rather than treating them as zero.

Verify v3 fallback for missing, invalid and stale artifacts.

Observe no unhandled runtime errors.

Confirm server/client profile parity.

Confirm acceptable dossier latency and payload impact.

The traffic shadow validates artifact delivery and runtime behavior. It does not substitute for offline model validation.

Phase 7 — Prove X-NAV and downstream isolation

Add an automated invariant proving that availability of Gravity v4 changes no X-NAV value.

Compare every eligible player with v4 unavailable versus available.

Require exact equality for:

X-NAV total.

X-NAV components.

Market value.

Contract surplus.

Player tier.

Sort order.

Team F/D/G positional sums.

Trade Machine calculations.

Armchair GM state and simulation inputs.

Fantasy values and rankings.

Printable/player cards.

Document that the current team F/D/G split requires no recalibration because Gravity v4 is excluded from xnav-engine.ts.

Isolation acceptance: the complete base-versus-base-plus-v4 comparison produces zero NAV or downstream decision changes.

Phase 8 — Documentation and product consistency

Before public reactivation, update:

app/methodology/page.tsx

app/glossary/page.tsx

gravity.md

GRAVITY_RELEASE_GATES.md

GRAVITY_V4_VALIDATION.md

runtime-artifact.ts

Relevant API descriptions, tooltips and accessibility labels.

Any other statement claiming v4 is locked, absent, unfitted or active in X-NAV.

All documentation must describe the same reality:

Fitted on 2025–26 data.

5v5 only.

OZ and DZ only.

NZ unavailable.

Model-generated field, not observed tracking.

Untiered.

Diagnostic.

Excluded from X-NAV.

Current validation scope and holdout results.

Coverage and known limitations.

Model and artifact version.

Phase 9 — Public presentation decision

For GRAV-01, public activation is dossier-only.

The dossier must display:

Gravity v4 Diagnostic
2025–26 · 5v5 · Offensive and defensive zones
Untiered · Excluded from X-NAV

Neutral zone must display:

Unavailable — public play-by-play does not support a defensible neutral-zone transition well

The following remain excluded from GRAV-01:

Player-index Gravity score or tier.

Printable/player-card Gravity v4.

Trade Machine Gravity v4.

Armchair GM Gravity v4.

Fantasy Gravity v4.

Public v4 tier badges.

Any automatic v3/v4 blended presentation.

Dossier labels and accessible descriptions communicate every limitation.

Unavailable NZ is not rendered or announced as zero.

No v3 tier badge appears inside the v4 diagnostic.

Browser Back, loading, missing-profile, and fallback states remain understandable.

Methodology and validation evidence are linked directly from the diagnostic.

Phase 10 — Controlled reactivation and rollback

Enable runtime and public flags in staging.

Verify representative high-, middle-, low-, missing-, and insufficient-sample profiles.

Capture and approve the final dossier output.

Confirm production documentation is deployed before or atomically with public activation.

Enable the public flag in Production only after every required gate passes.

Monitor coverage, invalid profiles, errors, staleness and latency during rollout.

Verify that disabling GRAVITY_V4_PUBLIC_ENABLED restores the exact pre-v4 public output.

Verify that disabling runtime loading also removes internal artifact use.

Record the release decision, evidence version, deployment and rollback result.

Final release gate

Gravity v4 may be publicly reactivated only when:

The reproducible validation report is committed.

The out-of-time protocol passes.

Runtime shadow coverage and reliability pass.

X-NAV/downstream isolation is proven automatically.

All governing and public documentation agrees.

Public presentation is dossier-only and explicitly diagnostic.

NZ, tiers and X-NAV integration remain unavailable.

Monitoring and rollback are verified.

If any required gate fails, Gravity v4 remains disabled in Production. The fitted artifact may remain available for internal research.

Out of scope

Create separate tickets for:

GRAV-02 — Cross-season normalization and public tier calibration.

GRAV-03 — Gravity v4 contribution to [X]-NAV.

GRAV-04 — Transfer and portability validation.

Release C — Neutral-zone transition well using legitimate licensed shift/tracking data.

Card and player-index v4 presentation.

Any inferred NZ proxy built from public EDGE aggregates.

Dependencies

GRAV-01 does not block the current [X]-NAV architecture or F/D/G team decomposition because v4 is X-NAV-free.

GRAV-03 must depend on successful GRAV-01 validation and the future calibrated F/D/G-NAV pipelines.

No current team NAV value should be recalibrated under GRAV-01.

Principal risks

Gravity v4 may currently be publicly visible while the methodology denies its existence.

A single-season fitted artifact may describe 2025–26 without generalizing.

Within-season correlation can be mistaken for predictive validation.

Missing NZ may be misread as neutral impact.

A shareable card could detach the diagnostic from its limitations.

A single environment flag can conflate internal testing and public release.

Disabling v4 while v3 remains disabled makes Gravity dark, but that is safer than publishing an unvalidated diagnostic as established evidence.

---

# 3. Players workstream — from directory to League Intelligence Board

## [ ] PLAY-01 — Make Front Office the differentiated default view (`M`)

**Default columns/cards:** X-NAV/G-NAV with interval, modern role in text, contract state and surplus, age/development phase, compact STRAND fingerprint, trend, reliability/coverage, and one primary action.

Move PTS/PPG/P/82 into a `Production` preset. Add `Front Office`, `Scout`, `Performance`, `Contract`, `Fantasy`, and `Goalie` presets.

**Acceptance:** a first-time user can see why the page differs from a scoring leaderboard without opening a row; presets are URL-backed and accessible.

## [ ] PLAY-02 — Add a real discovery/filter system (`M`)

**Filters:** season, situation, minimum sample, status, age, handedness, role, cap range, term, RFA/UFA, prospect status, X-NAV/G-NAV, surplus, trend, reliability, injury/availability, STRAND traits, and custom columns.

Rename the current `All` mode to `Position Overview` unless a normalized cross-position ranking is deliberately introduced.

**Acceptance:** a user can build and share a defensible cohort without opening every player; applied filters are visible/removable and count the exact population.

## [ ] PLAY-03 — Use one semantic result structure (`M`)

**Change:** render one data structure rather than mounting desktop and mobile copies. Use a real sortable table with `<th>`/`aria-sort` on wide layouts and an accessible article/list card pattern on compact layouts. Keep name/photo as a profile link and expansion as a separate labelled control.

**Acceptance:** no duplicated initial rows/images in the DOM; position and view controls expose state; complete tablist/tabpanel semantics pass keyboard tests; axe has no critical violations.

## [ ] PLAY-04 — Replace inline expansion with a dossier (`L`)

**Change:** persistent desktop drawer and mobile full-screen sheet with Overview, Evidence, Contract, Projection, Fit, and Timeline. Preserve selected-row position; support Previous/Next within the filtered set.

**Acceptance:** opening a player does not push nearby results away; the dossier deep-links to a canonical player route and restores its parent search state.

## [ ] PLAY-05 — Add compare, shortlist, fit, and product handoffs (`L`)

**Change:** multi-select two to six players; compare role-adjusted percentiles, trends, contract/value curves, and uncertainty. Add `Fit to Team`, `Trade Machine`, `Armchair GM`, and `Fantasy` actions.

**Acceptance:** selected IDs, target team/role, `as_of`, and snapshot IDs survive each handoff and share round-trip; the destination explains any recalculation.

## [ ] PLAY-06 — Build the baseline Goalie Evidence view (`L`)

Before the full future lab, expose:

- GSAx/60 and per start.
- Expected save percentage and save percentage above expected.
- All-situations/5v5/PK splits.
- 10/20/40-start rolling form.
- Workload, volatility, and reliability.
- High/mid/long-danger profile where supported.
- Team-environment and sample coverage.

**Acceptance:** workload and rate are distinguishable; every goalie projection includes uncertainty; GAA/SV%/GSAx are consistently present across list and dossier.

## [ ] PLAY-07 — Finish Players performance and discovery delivery (`M`)

**Change:** server-render the initial cohort and crawlable profile links; use server pagination or virtualization with prefetch; cache one signed player snapshot; add real-user monitoring for data-ready time, filter latency, long tasks, layout shift, and failed images.

**Acceptance:** useful initial player content appears in server HTML; warm performance does not rely on duplicate desktop/mobile trees; filtered public URLs remain shareable with safe canonicalization.

---

# 4. Teams workstream — from accordion directory to franchise decision system

## [ ] TEAM-01 — Separate franchise asset value from current team strength (`M`)

Rename `League X-NAV Rankings` to `Franchise Asset Value`. Present projected team strength/EWA separately. Display exact values, league rank, change, uncertainty, and population scope.

**Acceptance:** a young asset-rich rebuild cannot be mistaken for the strongest current NHL team; every metric has a `Why this score?` path.

## [ ] TEAM-02 — Build the team dossier information architecture (`L`)

Canonical route tabs:

1. `Now` — projected points, playoff/Cup probability, unit strength, special teams, recent form.
2. `Roster` — 12F/6D/2G, extras/injuries, fit, chemistry, player links.
3. `Cap` — four-year runway, expiries, clauses, dead/retained money, RFAs/UFAs, deadline space.
4. `Future` — prospects, picks, young-core control, upside, aging cliff.
5. `Moves` — needs, surplus roles, partners, targets, Trade/Armchair actions.

**Acceptance:** every team has a permanent URL and one-sentence thesis; a diagnosed need reaches a player, trade, or three-year simulation in one action.

## [ ] TEAM-03 — Replace the duplicate league bar chart with a Franchise State Map (`L`)

**Primary view:** Present Strength × Future Asset Base; cap flexibility as size; contention phase as color; confidence as outline/opacity; movement trail from the prior snapshot.

**Secondary:** ranked horizontal dot plot for X/F/D/G-NAV with exact values, percentile, and change.

**Diagnostic:** composition of active NHL value, prospects, contract surplus, draft capital, and goalie value.

**Acceptance:** all league filters update every visualization and result count; an accessible data table provides the exact values.

## [ ] TEAM-04 — Pair Team DNA and EDGE branding with readable diagnostics (`M`)

**Change:** keep the fingerprint as an emblem, then show eight diverging percentile bars, league/contender references, ranks, coverage, role gaps, and a plain-language diagnosis. Normalize EDGE to rates/ranks with tracked-player and expected-TOI coverage.

**Acceptance:** no raw aggregate is presented without denominator, season, weighting, rank, and coverage; missing evidence is visible.

## [ ] TEAM-05 — Build the four-year cap runway (`L`)

Stack salary by forwards, defence, goalies, dead/retained money, and unsigned required slots. Overlay ceiling/floor, expiry cliffs, clause exposure, surplus value, core-extension scenarios, and deadline accrual.

**Acceptance:** active roster slots and organizational contracts remain separate; UFA/RFA counts name the exact league year; totals reconcile with `DATA-05`.

## [ ] TEAM-06 — Turn projected lines into a roster-construction board (`L`)

**Change:** full depth chart with vacancy reasons, extras/injuries, age/handedness/term/NAV/role on demand, chemistry/fit, redundancy warnings, and a non-mutating What-if mode.

**Acceptance:** moving a player recalculates projected unit strength and cap using an explicit scenario snapshot; official and hypothetical states cannot be confused.

## [ ] TEAM-07 — Complete Teams readability, accessibility, and SEO (`M`)

**Standards:** body 14–16px, dense data 12–13px, auxiliary metadata 11px minimum; AA contrast; selected state not conveyed by border/color alone; full labels for P/F; route H1; team metadata/social card/`SportsTeam` schema.

**Acceptance:** no primary information remains in 8–10px microprint; phase/sort controls announce selected state; team content is useful in server HTML.

---

# 5. Trade Machine workstream — from calculator to Front Office Decision Room

## [ ] TRADE-01 — Finish asset discovery and scouting workflow (`M`)

**Change:** team-first roster browsing plus normalized search; filters for roster/status/position/contract/NAV/availability; stable-height scrollable asset lists; player/pick scouting drawer; explicit loading progress and route-specific error states.

**Acceptance:** no alphabetical mega-list is required; adding/removing an asset does not lose filter position; every asset is identified by canonical ID and snapshot.

## [ ] TRADE-02 — Make GM Audit reconciled and evidence-bearing (`L`)

**Change:** explicit GM perspective for both teams; reconcile cap, roster slots, retention, clauses, NAV, EWA, CWI, team needs, role replacement, and timeline. Every warning must name the triggered rule, evidence, and severity. Package changes invalidate stale audit results automatically.

**Acceptance:**

- Winnipeg–Montréal canary trades reconcile both directions.
- Connor/Caufield, 0–50% retention, pick changes, and four-player retention stress tests rerun correctly.
- A franchise goalie changes goalie/team EWA and Team STRAND rather than only OFF/DEF.
- A team receiving a scarce elite role can offset the loss of another core role when the evidence supports it.
- NAV totals and every adjustment reconcile to `DATA-02`.

## [ ] TRADE-03 — Durable scenario history, undo, and sharing (`M`)

**Change:** autosave locally, undo/redo, immutable short scenario IDs, editable remix/fork, schema versioning, corrupted-link recovery, and explicit snapshot/horizon metadata.

**Acceptance:** build → audit → share → refresh produces the same teams, assets, retention, picks, perspective, horizon, and audit; remix creates a new ID without mutating the original.

## [ ] TRADE-04 — Replace false precision with value ranges and comparables (`L`)

Show median plus uncertainty for player value, picks, cap outcomes, and team impact. Add comparable historical transactions and explain why they are similar/different. Conditioned picks show outcome probabilities.

**Acceptance:** intervals are calibrated out of time; missing/unstable inputs widen the range; deterministic NAV remains traceable but is not presented as certainty.

## [ ] TRADE-05 — Add counteroffers and the acquisition-cost frontier (`L`)

Generate minimal evidence-based changes that move an invalid/unbalanced deal toward acceptance: add/remove asset, change retention, substitute role, change pick protection, or alter horizon.

**Acceptance:** suggestions obey ownership, cap, CBA, clauses, roster limits, and availability; the user can compare balanced alternatives on an efficient frontier rather than receive a single opaque proposal.

## [ ] TRADE-06 — Add three-team and deadline modeling (`XL`)

Model brokered retention, multi-team asset paths, accrued deadline space, conditional picks, roster replacement, and transaction order.

**Acceptance:** every asset/cap dollar has one conserved path; each team's before/after state reconciles; illegal ordering or retention is rejected.

## [ ] TRADE-07 — One-action three-year Armchair handoff (`M`)

**Change:** `Run 3-year Cup Window` sends the audited post-trade roster, picks, cap/retention, contracts, GM perspective, model/snapshot versions, and baseline scenario to Armchair GM.

**Acceptance:** Armchair reproduces the Trade Machine year-zero state exactly, then reports Cup-path and downside deltas versus the no-trade baseline.

### Trade Machine definition of done

- Four active retained contracts trigger a hard veto.
- Owen Beck and Brad Lambert resolve as RFAs where applicable.
- Pick ownership includes rounds 1–7 and conditions.
- Cap and NAV arithmetic reconcile visibly.
- Share round-trip is lossless and corrupted links fail safely.
- 390px mobile behavior preserves the completed A/B summary workflow.
- Every control and warning has an accessible label.

---

# 6. Armchair GM and simulation workstream

The core engine invariants listed in the Completed Register are closed. The remaining work is verification, persistent franchise state, user-facing roster control, offseason decision quality, and connected three-year analysis.

## [ ] SIM-10 — Persist picks, positions, and lineup intent across seasons (`M`)

**Change:** preserve traded-pick ownership, alternative positions, selected lineup positions, and user locks through every simulation phase and reload. Remove draft years from trade selectors once they have conveyed.

**Acceptance:** the 2027 first-round-pick regression and alternative-position regression pass through year three; user locks remain until explicitly cleared or invalidated with a reason.

## [ ] SIM-11 — Add 5v5, power-play, and penalty-kill lineup control (`L`)

**Change:** separate 5v5/PP/PK tabs, legal personnel limits, unit roles, and lineup locks. Feed unit assignment and ice time into the evidence-backed simulation models.

**Acceptance:** PP/PK deployment changes opportunity and results without violating total team/player opportunity conservation; removing a player produces an explicit vacancy/replacement decision.

## [ ] SIM-12 — Build the Roster tab and current player dossiers (`L`)

Place `Roster` before `Lineups`. Show current simulated-season production, role, Gravity, STRAND, Outlook, contract, status, captaincy, and latest icons. Remove the retired DEV tab. In lineup summaries, show actual simulated goals and assists rather than the unrelated P/82 projection.

**Acceptance:** roster statistics advance after each season; player identity and valuation remain tied to canonical IDs/snapshots; Captain and two Assistants propagate to the UI.

## [ ] SIM-13 — Repair remaining offseason interaction and accessibility (`M`)

**Scope:**

- Correct RFA completion/next-step copy.
- Give RFA rows the same analytics disclosure as UFA rows.
- Enlarge advanced-stat disclosure targets.
- Bring re-signing and free-agency screens to AA contrast and 44px targets.
- Make offseason decisions paced, legible, and recoverable with a transaction review.

**Acceptance:** a keyboard/touch user can complete re-signing, RFA, and UFA phases without hidden data or ambiguous completion state.

## [ ] SIM-14 — Add extensions and cap-clearing AI transactions (`L`)

**Change:** allow human and AI extensions with evidence-based market ranges; let AI consider cap-clearing trades before abandoning important RFAs. Reuse Trade Machine legality and GM Audit rules.

**Acceptance:** the AI cannot sign a veteran UFA and silently lose a franchise RFA without comparing the alternatives; every AI move records rationale and before/after cap/roster state.

## [ ] SIM-15 — Correct remaining franchise-flow defects (`M`)

**Scope:** playoff bracket winner propagation, new-run reset to the configured starting offseason, season/draft labels, obsolete picks in later trade menus, and empty/contradictory phase transitions.

**Acceptance:** deterministic three-year fixture produces the correct bracket chain, draft years, fresh-run state, and transaction history on repeated runs.

## [ ] SIM-16 — Recalibrate outlier player/prospect/goalie cases (`L`)

**Canaries:**

- Viggo Björck cannot have zero NAV solely because of name reconciliation after being selected eighth.
- Walker Duehr cannot show three games, zero goals, zero assists, one point, a second-line role, and Barkov-level value.
- Aleksander Barkov's long injury cannot erase established ability; use an evidence-backed multi-season/injury-return prior.
- Backup goalies receive starts and statistics consistent with the completed 82-start invariant.

**Acceptance:** model changes beat the frozen baseline out of time and each named canary has a regression fixture. Do not hard-code player overrides.

## [ ] SIM-17 — Three-year Cup Run and trade-NAV analysis (`L`)

For any imported or in-sim move, report:

- Baseline versus transaction paths for each of three seasons.
- Playoff and Cup probability distributions.
- Standings/goal differential and unit-strength deltas.
- X-NAV/G-NAV, EWA, CWI, cap, draft capital, and contention-window change.
- Best, median, and downside cases.
- The roster role gained, role lost, replacement used, and binding constraint.
- Why the result changed, with transaction and model versions.

**Acceptance:** the no-trade control and imported-trade scenario use identical random seeds/initial state where appropriate; results reconcile to the Trade Machine handoff and preserve the full transaction ledger.

---

# 7. Fantasy workstream — from draft rankings to Fantasy OS

The mobile draft-board conversion is complete. The next product should remain useful without login, then add authentication only for persistent or connected league state.

## [ ] FAN-01 — Establish a trustworthy public fantasy baseline (`M`)

**Change:**

- Make scoring settings, roster slots, league size, replacement level, and projection season explicit.
- Spell out Value Over Replacement before using `VOR`.
- Show games played/sample, role, line/PP unit, injury/status, projection interval, and update time.
- Separate skater, goalie, redraft, keeper, and dynasty contexts.
- Explain tiers as decision bands, not false precision.

**Acceptance:** changing a league setting deterministically recalculates fantasy points, VOR, rank, tier, and replacement level; settings survive URL sharing without authentication.

## [ ] FAN-02 — Add the account and persistence foundation (`L`)

**Authentication is required for:** saved leagues, synced rosters, draft progress, watchlists, alerts, notes, and collaboration. It is not required for public rankings or a temporary manual board.

**Minimum entities:** User, League, LeagueSettingsVersion, FantasyTeam, RosterSlot, PlayerIdentity, ProviderConnection, Draft, Transaction, Watchlist, RecommendationSnapshot, and AuditEvent.

**Acceptance:** a user can create a manual league, save it, sign out/in, and recover identical settings/roster/history; authorization prevents access to another user's private league.

## [ ] FAN-03 — Build provider-neutral league import and sync (`XL`)

Create a provider adapter contract for authentication, league settings, teams, rosters, draft results, transactions, schedules, and sync cursor. Preserve provider IDs separately from NHL IDs. Manual import remains the fallback.

**Acceptance:** imported settings reconcile field by field; sync is idempotent; duplicates cannot be created by common/formal player-name differences; provider failure does not corrupt the last good league snapshot.

## [ ] FAN-04 — Build the My Team command centre (`L`)

Show category/points strengths, roster-slot scarcity, injured/bench risk, schedule volume, games remaining, role stability, and replacement-level gaps. Rank advice by marginal impact on the user's team rather than raw player rank.

**Acceptance:** the same free agent can receive different recommendations for two teams with different categories, schedules, and roster needs; the delta is explained.

## [ ] FAN-05 — Build the live Draft Room (`XL`)

**Features:** synced/manual picks, queue, roster construction, positional scarcity, tier cliffs, ADP/market gap, probability a player survives to the next pick, category/points balance, keeper/dynasty age curve, and undo/recovery.

**Acceptance:** every pick updates availability, team needs, replacement levels, and recommendations in one transaction; refresh/reconnect restores draft state without duplicating picks.

## [ ] FAN-06 — Build the Fantasy Decision Lab (`L`)

One workflow for waiver adds, drops, start/sit, trades, and streaming. Compare expected team-level gain, opportunity, schedule, downside, roster-slot cost, and replacement alternatives.

**Acceptance:** every recommendation shows the move, counterfactual, expected range, evidence, and affected categories/points; a user can reject assumptions and rerun.

## [ ] FAN-07 — Add weekly matchup and schedule planning (`L`)

Use remaining games, off-nights, opponent strength, travel/back-to-backs, goalie start probability, injuries, and category state. Recommend streams only when the expected marginal gain exceeds the dropped-player/reacquisition risk.

**Acceptance:** recommendations update when schedule or matchup state changes; uncertain starts are probabilities, not guarantees.

## [ ] FAN-08 — Add keeper and dynasty portfolio analysis (`L`)

Blend age curve, role stability, prospect NHLe, contract/control context, production distribution, replacement market, and league keeper cost. Separate contender/rebuilder recommendations.

**Acceptance:** stale contract/status data cannot influence dynasty value; every long-horizon rank shows range, timeline, and scenario sensitivity.

## [ ] FAN-09 — Add explainability, saved work, and alerts (`L`)

**Change:** evidence drawer, why-rank-changed feed, saved shortlists, notes, injury/role/waiver alerts, and shareable read-only league views with explicit permissions.

**Acceptance:** alerts cite the changed input and recommendation delta; users can disable/delete alerts and private notes; generated prose cannot change deterministic rankings.

---

# 8. Cross-route mobile finish

## [ ] MOB-01 — Preserve Cap & Crease intelligence in compact cards (`M`)

Players and Teams compact layouts must prioritize proprietary decision signals over generic box scores.

**Players minimum:** identity, team/position, role text, X/G-NAV band and trend, contract/surplus, one chosen secondary metric, compare/action.

**Teams minimum:** thesis, present/future/asset distinction, cap flexibility, primary risk/need, and dossier action.

Use a sticky `Filter` button, applied-filter chips, result count, and a separate `Sort` control instead of an undiscoverable hidden-scroll filter row.

**Acceptance:** no critical meaning is encoded only as a tiny glyph; compact cards remain readable at 320px and landscape modes.

## [ ] MOB-02 — Replace crowded inline expansions with mobile sheets/routes (`M`)

Use full-screen dossier routes/sheets with sticky section navigation for Player, Team, Trade scouting, Fantasy outlook, and Armchair advanced views.

**Acceptance:** focus is trapped/restored correctly; browser Back closes the sheet before leaving the parent workflow; no nested horizontal-plus-vertical scroll trap.

## [x] MOB-03 — Close all remaining responsive overflow gaps (`S`)

**Promoted August 25, 2026 after `V-02` failed.** At 667, 700, 768, and 844px, Players renders the desktop grid while clipping a 1,037px body layout; the expand action begins at x=1,013 and cannot be reached. Choose layout from available container width rather than device labels. Remove incompatible desktop headers when compact cards render.

**Acceptance:** no page-level horizontal overflow at the full viewport matrix; intentional local scrollers are labelled/cued and do not hide primary actions.

**Completed August 26, 2026.** Players now selects compact cards or the full ledger grid from the section container's available width, pairs compact cards with an explicit metric/direction sort control and the value actually governing each section, and hides the incompatible desktop header with the desktop rows. Compact stats and player badges wrap within the card; phone-only extension cards remain a labelled, keyboard-focusable local scroller with a visible cue and wrap from 768px; wide sort headings wrap inside their columns instead of projecting beyond the page. A production-browser matrix at **320, 360, 375, 390, 412, 430, 540, 667, 700, 768, 844, 1024, 1039, 1040, 1041, 1042, 1050, 1100, 1120, 1160, 1280, and 1440px**, plus expanded-row checks at eight compact/desktop widths, reports exact viewport/body widths, no section or stat-row overflow, and reachable expand actions throughout. Focused responsive/UI checks pass **443/443**, the full suite passes **2,224/2,224**, TypeScript, changed-file lint (**0 errors; two existing Press Box warnings**), and the production build pass (**30/30** static pages); repository lint retains only the pre-existing `Header.tsx:159` error plus four unrelated warnings.

## [ ] MOB-04 — Mobile charts must support tap, pin, compare, and table fallback (`M`)

**Acceptance:** every chart value can be discovered without hover; pinned values survive touch movement; the same information is available in an accessible table; chart colors are not the sole encoding.

## [ ] MOB-05 — Run the cross-route device and accessibility regression (`M`)

**Routes:** homepage, Players/list/detail, Teams/list/detail, Docket, Trade Machine, Armchair GM through three seasons, Fantasy skater/goalie boards, Press Box, Methodology, and Glossary.

**Checks:** overflow, safe areas, sticky collisions, 44px targets, text zoom, keyboard, screen reader names/states, reduced motion, contrast, orientation change, slow network, and route restoration.

**Acceptance:** automated viewport screenshots plus axe/keyboard tests are retained as CI artifacts; no critical/serious issue remains.

---

# 9. Five-years-ahead platform — build after the shared truth layer

## [ ] FUT-01 — As-of time machine and Change Ledger (`XL`)

Restore the exact roster rights, age, contracts, cap, picks, model version, and knowledge available at a historical date. Record trades, signings, injuries, draft changes, prospect updates, model releases, and corrections with before/after effects.

**Acceptance:** historical views contain no future leakage; any displayed value can be traced to the inputs and model available at that time.

## [ ] FUT-02 — Uncertainty-first projections and valuation (`XL`)

Replace unsupported point confidence with median, 50%/80% intervals, breakout/decline probabilities, calibration, coverage, and scenario sensitivity. Apply to players, goalies, picks, teams, trades, simulation, and Fantasy.

**Acceptance:** intervals are calibrated on untouched seasons; missing data widens intervals; confidence is never presented as a probability unless it is one.

## [ ] FUT-03 — Team-fit, replacement, and scarcity engine (`XL`)

Answer who fits a role/team/window, who can replace 80% of a contribution at 50% of the cap, which skills are scarce, which teams have surplus, and what acquisition frontier is feasible.

**Acceptance:** results control for projected role, teammates, competition, special teams, cap, roster legality, and portability; near-matches and exclusions are explained.

## [ ] FUT-04 — Auditable natural-language research (`L`)

Translate a query into visible, editable filters rather than hiding logic behind prose. Example: `Right-shot D, age 24–29, positive transition and suppression, under $6.5M through 2028, 40+ GP, available without a first.`

**Acceptance:** the generated result set is identical to applying the displayed filters manually; every rank and exclusion is inspectable; no data or recommendation is fabricated.

## [ ] FUT-05 — Persistent workspaces, watchlists, and collaboration (`XL`)

Allow authenticated users to save boards, compare sets, teams, trade scenarios, simulations, fantasy leagues, notes, and alert rules. Add explicit share permissions and immutable public snapshots.

**Acceptance:** public tools remain available without login; private data is isolated; export/delete/version history work; shared views reveal only intended fields.

## [ ] FUT-06 — Front-Office Action Board (`XL`)

For every team, generate transparent priority need, available asset, binding constraint, best partners, and no-move consequence. Link each action to Players, Trade Machine, and a controlled three-year Armchair simulation.

**Acceptance:** recommendations are derived from documented metrics and constraints; every suggested action can be tested against a baseline; the system can say `insufficient evidence`.

## [ ] FUT-07 — Unified decision graph (`XL`)

Make Players, Teams, Trade, Armchair, and Fantasy views of the same underlying scenario rather than isolated tools. Standardize IDs, snapshot/version references, scenario lineage, and before/after deltas.

**Acceptance:** a user can move from team diagnosis → player search → trade → three-year simulation → published Docket review without recreating state, and can inspect which inputs changed at each step.

---

# 10. Completed Register — updated August 25, 2026

The following items were reported complete by Codex. Their detailed verification records remain in the active triage documents and `docs/DEVNOTES.md`.

## Mobile and delivery

### [x] M-VerifiedFoundations — Pre-existing mobile foundations

The verified mobile triage found the shared dialog/focus system, adopted 44px target utility, Players compact cards and name wrapping, Teams mobile top-10 chart, accessible league-scatter description, 44px Press Box calendar, and paginated offseason dialogs already present. They remain completed foundations; the narrower residual gaps stay in the active tickets above.

### [x] M-FooterKey — Collapsed global icon-key grids

On August 23, the repeated Asset Flags, Modern Role Icons, and Gravity Tiers grids moved behind a native, collapsed disclosure while remaining available at the glossary deep link. Full suite (2,144 tests), TypeScript, changed-file lint, and production build passed.

### [x] M-Docket — Docket filter targets and full-width search

All four controls now meet the 44px mobile target and `.docket-search` spans both columns below 640px. Tests, TypeScript, and build passed on August 24.

### [x] M-SeasonStats — Two-row phone season summary

The six-stat skater season line now uses `grid-cols-3 sm:grid-cols-6`, producing 2×3 on narrow screens and one row from 640px.

### [x] M-STRAND — Accessible SVG description

`StrandDisplay` requires a per-context `ariaDescription`; all direct callers provide it. The SVG exposes `role="img"` and a value-bearing label including indexed/raw traits, unavailable readings, and comparisons.

### [x] M-PlayersSeam — 540–639px breakpoint seam

Players analytics rules now use the shared 640px boundary. Regression coverage pins mobile cards at 500/560/620px and desktop behavior at 700px while preserving intentional sub-layouts. The broader 640–879px fit concern remains verification item `V-02`, not a reopening of this ticket.

### [x] M-PlayerFlags — Accessible flag disclosure

Role/status/NMC chips now live in a real per-row disclosure with labelled region, Escape/outside dismissal, event isolation from row expansion, and 44px mobile sizing.

### [x] M-Nav2 — More menu and sticky compact global header

Players, Teams, Trade Machine, and Armchair GM remain primary. Docket, Fantasy, and Press Box live in an accessible More disclosure. The header becomes compact after 96px of scroll without horizontal navigation overflow.

### [x] M-Fantasy — Mobile draft cards

Below 768px, skater and goalie draft tables render cards with full mobile sort coverage and 44px controls/disclosures. Desktop tables remain unchanged at `md` and above.

### [x] M-TradeSummary — Sticky package summary and Team A/B toggle

Below 1024px, one labelled team panel is visible behind an accessible toggle. A safe-area bottom ledger preserves both teams, asset counts, Team A net NAV, and GM Audit. Desktop retains both panels.

### [x] M-TeamPages — Dedicated team routes and linked projected players

All 32 teams have validated detail routes; unknown IDs 404. Team cards expose 44px links, the selected analytics card opens expanded, and projected forwards/defencemen/goalies link to player profiles with mobile targets.

### [x] M-Perf — Precomputed Teams/Docket/Armchair data

An authenticated daily job precomputes canonical roster, server NAV map, and Docket grades into shared SWR caches with Redis durability and memory fallback. Reported production measurements improved player bootstrap from 25.97s cold to 65.6ms warm; Teams payload from 1.09s cold to 6.5ms warm; reused Team Analytics from 0.99s cold to 49.7ms warm; and Docket from greater than 15s to 1.40s cold/48.8ms warm, with its shell starting in 345ms. Server/client NAV parity, suite, TypeScript, lint, and production build passed.

## Simulation engine

### [x] SIM-P0-1 / SIM-P0-4 / SIM-P1-8 — Season conservation and rookie goal-share fallback

On August 23, full-roster seasons began conserving 1,476 skater-games, team goals, and league standings points; missing-xG prospects stopped defaulting to the 22% goal-share floor. The response exposes conservation diagnostics. Full suite (2,135 tests), TypeScript, changed-file lint, and production build passed. The initial rookie fallback was later superseded by the calibrated `SIM-P1-6` model.

### [x] SIM-P0-2 — Roster-legality gate

On August 23, Armchair and Cup Run began blocking simulation or advancement below 12F/6D/2G and reporting position deficits, without silently creating replacement players. Full suite (2,143 tests), TypeScript, changed-file lint, and production build passed.

### [x] SIM-P0-3 — Explicit unresolved-contract confirmation

On August 23, advancing with unresolved free agents began requiring a confirmation that names every affected player and explains the market/rights consequence. Full suite (2,144 tests), TypeScript, changed-file lint, and production build passed.

### [x] SIM-P0-5 — Couple no-signal prospect appearances to evidence

On August 24, a prospect with no effective scoring pace stopped receiving invented appearances beyond an established NHL sample; the regression changed 40 GP / 0 P to 0 GP / 0 P while preserving 1,476 team skater-games. Targeted route tests (21), full suite (2,145 tests), TypeScript, and production build passed.

### [x] SIM-P1-6 — Role/line/PP/TOI affect goal-versus-assist share

A frozen prior-season fit on 960 player-seasons feeds role, line/pair, PP unit, and TOI into the split. On an untouched 475-player 2025–26 holdout, weighted MAE improved from 0.08308 to 0.06973 (16.1%); the predicted league mean was within 0.1 percentage point and every signal passed its ablation gate. On August 24, focused model tests (5), full suite (2,163 tests), the backtest gate, and TypeScript passed.

### [x] SIM-P1-7 — Guard multi-year production carry-forward

On August 23, validated season lines began blending against a career anchor with bounded annual banking, preventing repeated young-player breakout multipliers from compounding across Cup Run years. Targeted rollover/conservation/believability tests (64), full suite (2,145 tests), TypeScript, changed-file lint, and production build passed.

### [x] SIM-P1-9 — Transaction ledger and player-state invariant

Offseason movement is recorded and reconciled against `roster + retained rights + RFA + UFA + signed elsewhere + retired = previous + drafted`, with the diagnostic exposed. Historic FA/RFA symptoms remain in `V-03` only as regressions to verify against this completed invariant. On August 24, focused tests (489), full suite (2,170 tests), and TypeScript passed.

---

# 11. Global release gates

No release block is complete until the applicable gates pass.

## Data and model

- [ ] Every player, team, contract, pick, trade, simulation, and fantasy record has a canonical ID and snapshot/version reference.
- [ ] Cross-surface NAV/G-NAV and surplus reconcile within documented rounding.
- [ ] Age, active contract, rights, roster, RFA/UFA, signed-elsewhere, and retired states cannot conflict.
- [ ] Team totals state their population and horizon.
- [ ] Cap, retention, clauses, picks, and transaction paths conserve and reconcile.
- [ ] Historical/backtest features have no future-information leakage.
- [ ] Model changes clear frozen baseline, holdout, calibration, and ablation/sensitivity gates.
- [ ] Missing data lowers reliability/widens intervals instead of silently becoming zero.

## Product and workflow

- [ ] A user can identify the purpose and primary action of each route within 10 seconds.
- [ ] Public filters and comparisons can be shared without login.
- [ ] Cross-product handoffs preserve IDs, `as_of`, settings, scenario lineage, and snapshot versions.
- [ ] A displayed recommendation includes evidence, assumptions, uncertainty, and a counterfactual.
- [ ] No AI-generated prose can alter deterministic model values or legality decisions.

## Accessibility and responsive behavior

- [ ] All primary controls are keyboard and touch operable with visible focus.
- [ ] Mobile targets are at least 44×44px; critical game-style controls may use the stricter 48px standard.
- [ ] State is programmatically exposed through correct native/ARIA semantics.
- [ ] No essential meaning depends on hover, color, icon shape, or microprint.
- [ ] Zero page-level overflow across the required viewport matrix.
- [ ] Reduced motion, 200% text zoom, screen-reader, axe, and orientation-change tests pass.

## Performance and delivery

- [ ] First useful league/player summary is visible within two seconds on a normal cold broadband visit.
- [ ] Selected dossier is interactive within three seconds.
- [ ] Initial routes do not preload every league/team/player dossier.
- [ ] Loading, empty, stale, partial, and error states preserve the application shell and identify the failed domain.
- [ ] Real-user monitoring records data-ready time, interaction latency, layout shift, failed media, and long tasks.

## SEO and public discovery

- [ ] Each route has a unique H1, title, description, canonical URL, and social card.
- [ ] Player and team entities are linked in server HTML and included in verified sitemaps.
- [ ] Appropriate `ItemList`, `Person`, and `SportsTeam` structured data validates.
- [ ] Filtered URLs are canonicalized/noindexed deliberately rather than accidentally indexed.

---

# 12. Source audit traceability

| Source audit | Consolidated sections |
| --- | --- |
| Mobile-first UI audit, Aug 23–24 | Verification, Quick Wins, Cross-route Mobile Finish, Completed Register |
| Armchair GM simulation-model audit and July 23 notes | Shared data foundations, Armchair/Simulation, Completed Register |
| Fantasy page audit / Fantasy OS direction | Fantasy workstream, shared auth/persistence, uncertainty, connected workflow |
| Trade Machine audit, Aug 24 | Shared cap/pick/value ledgers, Trade Machine workstream, three-year handoff |
| Players audit, Aug 24 | Shared player/value ledger, Players workstream, future intelligence platform |
| Teams audit, Aug 24 | Shared team model, Teams workstream, Action Board and Change Ledger |

Detailed source files:

- `Cap_and_Crease_Players_Audit_2026-08-24.md`
- `Cap_and_Crease_Teams_Page_Audit_2026-08-24.md`
- `docs/mobile-audit-triage.md`
- `docs/sim-engine-audit-triage.md`
- `July 23rd ArmChair GM.docx`
- `July20th Audit.docx`

## Final product principle

Cap & Crease should make one connected promise:

> Identify the right player, team action, trade, simulation path, or fantasy move for a specific role, price, ruleset, and competitive window—and show the evidence, uncertainty, and downstream consequences before the user acts.

More charts alone will not create that product. Canonical state, auditable decisions, persistent scenario lineage, and connected workflows will.
