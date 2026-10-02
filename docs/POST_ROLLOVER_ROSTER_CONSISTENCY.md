# Post-rollover roster consistency — 2026-10-02

## Contract

Current assigned rosters combine NHL identities, eligible stored assignments and
published roster transactions. They are not historical or game-day active lists.
`published-roster-ownership.ts` is the shared resolver for canonical assembly and
Admin Contracts. Only published, roster-mutating, two-sided transactions apply;
order is execution date followed by transaction ID. The last eligible move wins.
Exact IDs take precedence over compatible-position, accent/nickname-aware legacy
name matching. Ambiguous name-only matches fail closed. Frozen transactions and
stored contract ownership are never rewritten by a read.

Admin returns `id`, effective `team`, `storedTeam` and `ownershipTradeId` for each
stored row, retaining distinct same-name identities. Search/filter uses effective
ownership. The editor initializes from stored ownership and sends `teamId` only
when explicitly changed. Saves, retirement and clearing target the stable row ID.
A published move therefore requires no duplicate manual team edit in Contracts.
This does not change ingestion policy for moves absent from the transaction ledger.

Cap overlays use the existing retention-aware delta. For a subsequent-trade chain,
only the suffix not already reflected in the base assignment applies. Player
valuation calculations, frozen trade inputs and historical analytical artifacts
are unchanged. Restoring an NHL ID can repair an existing historical baseline
join; it does not introduce current observations into NAV or fit a new model.
The split `/api/league/teams` payload consumes the canonical cap moves once, as
`/api/league` already does. Roster, analytics, team-payload, cap-parameterized team
and Docket cache namespaces advance; existing mutation invalidators include them.
No Production cache was cleared during this work.

Roster injection preserves a uniquely matched live NHL identity and its source
metadata while retaining the stored contract name for the contract join. Genuine
live members are not reclassified as DB-only older/no-signal minor-league entries.
Same-team nickname dedupe now distinguishes forwards, defenders and goalies.
There are no hardcoded player exceptions.

The team detail has a keyboard-operable full assigned roster, including unpriced
members. Projected lines retain their existing 12-forward, 6-defender, 2-goalie
limits and ranking; the page labels them as a projection, not a complete roster or
confirmed lineup. Top priced assets and team totals explain pricing coverage.

`valuation-display.ts` uses the engine's empty stages / contract-only snapshot
coverage to distinguish unavailable NAV from calculated zero. Missing FMV is
separate from missing NAV: a priced prospect or pick may have NAV without FMV.
Cards, dossiers, Trade Machine roster/package rows, Armchair roster tables and
PNG card exports label unavailable values. Contract trajectory presentation is
unavailable when the current model has no stages. Calculated zero stays `0` and
calculated zero FMV stays `$0.0M`; no valuation formula or rookie pricing changed.

## Read-only Production findings

Baseline: origin/main `2925940e91e85f419836d7d85c9dcb659c3c3bc1` (PR #34).
Inspection and the 32 upstream `/v1/roster/{team}/current` responses were recorded
around **2026-10-02T21:10:24Z**. Production inspection used a read transaction;
assembly and write/UI verification used an independent local copy or isolated
fixtures, with Production Redis credentials disabled. No Production records,
snapshots, transactions, ingestion or caches were mutated by an operator action.
Existing preservation evidence is reused without recreating or recollecting it.

`trade-2026-09-28-fab49941` remains PUBLISHED / ROSTER, TOR / CBJ. TOR sent
Matthew Knies (`matthewknies`), Emil Andrae (`emilandrae`), Steven Lorentz
(`stevenlorentz`) and a pick; CBJ sent Kirill Marchenko (`kirillmarchenko`),
Miles Wood (`mileswood`) and Elvis Merzlikins (`elvismerzlikins`). McKenna was
**not** an asset in this trade. The full stored transaction row was independently
re-read unchanged; its exported JSON SHA-256 was
`e2ad6e0609f6e82915b548bdb7f2c51343f2e48f996dfa215c353e7dd9510226`.
The transaction was not recreated, published, edited, reversed or migrated.

Gavin McKenna (`8486067`, stored `gavinmckenna`) was already TOR in the current NHL
roster, contract table and canonical public payload. His recorded $1.075M × 3
contract survives. He is outside the projected forward limit: membership was
not missing, but the page lacked a full roster. His current result has no model
stages, contract-only coverage and no FMV. That warrants “Not priced”, not a
new rookie estimate or forced projected-line placement.

The earlier reported 10 skaters and one goalie reconcile as follows. “Public
before” means the inspected deployed catalogue; “isolated after” means assembly
with this code and independently copied source contracts, not a deployment.

| NHL ID | Player | Public before / current upstream | Isolated after / remaining correction |
| --- | --- | --- | --- |
| 8482720 | Matthew Knies | Present as `matthewknies`, CBJ; NHL CBJ | NHL ID retained, CBJ; Admin effective CBJ, stored TOR |
| 8482126 | Emil Andrae | Present as `emilandrae`, CBJ; NHL CBJ | NHL ID retained, CBJ; Admin effective CBJ, stored TOR |
| 8480893 | Kirill Marchenko | Present as `kirillmarchenko`, TOR; NHL TOR | NHL ID retained, TOR; Admin effective TOR, stored CBJ |
| 8475184 | Chris Kreider | Present as `chriskreider`, ANA; NHL MTL | NHL ID retained; stored ANA still wins without a ledger move: reviewed data correction needed |
| 8482146 | Luke Evangelista | Present as `lukeevangelista`, NSH; NHL NJD | NHL ID retained; stored NSH still wins without a ledger move: reviewed data correction needed |
| 8480813 | Joseph / Joe Veleno | Present as `joeveleno`, NYR; NHL Joseph Veleno, NYR | NHL ID retained; recorded Joe contract retained |
| 8481582 | Nick / Nicholas Robertson | Present as `nicholasrobertson`, PIT; NHL Nick Robertson, PIT | NHL ID retained; recorded Nicholas contract retained |
| 8483678 | Elias Pettersson (D) | Missing; NHL VAN; same-name VAN centre present | Defender retained separately from centre 8480012; public NHL-derived VAN, stored/Admin assignment remains unassigned without a ledger move; recorded $1.05M contract, no invented inputs |
| 8482715 | Ryan Ufko | Present as `ryanufko`, assigned NSH; absent from current 32 NHL rosters | Stored assigned entry remains; earlier participation cannot establish current active membership or a live identity binding |
| 8484509 | Josh Samanski | Present as `joshsamanski`, assigned EDM; absent from current 32 NHL rosters | Stored assigned entry remains; same membership/identity limitation as Ufko |
| 8482447 | Leevi Meriläinen | Present as `leevimerilainen`, OTT; NHL VAN | NHL ID retained; stored editor OTT still wins without a ledger move: reviewed data correction needed |

The defender's unassigned stored contract team is a fourth source-fact gap to review; the public roster obtains VAN from the NHL feed. It is not a duplicated published move.

No contract, historical statistic, participation record or model input was invented
for this reconciliation. The three source-team discrepancies require an operator
review of the actual move and appropriate source/transaction correction, outside
this PR's no-Production-write boundary. They are not solved by hardcoding NHL
ownership or overriding published transactions.

## Verification and delivery

Focused tests cover TOR/CBJ ownership reuse, flags, ordering/ties, subsequent trades,
retention cap suffixes, already-updated assignments, idempotency, ambiguous names,
same-name positions, stable NHL identity, large-population resolution, missing versus
zero pricing, isolated Admin read/save/authorization and affected invalidation keys.
Final code: **2,633/2,633 tests across 208 files**, Phase 0 **10/10**, TypeScript
passed, lint **0 errors / 4 pre-existing warnings**, and optimized build passed.
Phase 0 analytical fixtures remain unchanged. Hosted head checks are recorded in
the PR; unchanged preservation evidence was reused.

Local browser checks use the independently assembled isolated roster as public API
fixtures. Admin ownership reads and saves use the isolated copied database and normal
local fixture authentication; auxiliary roster-gap/term-audit panels are stubbed.
The affected public journeys are checked at 320px, 412px and desktop, plus keyboard
operation. This is local UI evidence, not proof of a deployed Production fix.
Production evidence above is read-only diagnosis. Preview deployment status and CI
are separately reported for the PR head; protected Preview access must not be
presented as a completed live browser check.

The separate `q=` initial URL hydration issue is unchanged. Verification searches
through the controls rather than reloading a `q=` URL. Labs and PR #33 remain paused.
This PR must not be merged or deployed during this pass.
