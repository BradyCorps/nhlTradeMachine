# Pick ownership, first visit, and Season Review — 2026-10-05

This is a bounded correction on a branch from `8e4696800b18bba946bde44105f36c48e0e4b6d9`. No Production records, caches, contracts, historical Docket evidence, shared-trade payloads, valuation formulas, simulation calculations, or Labs records were changed. Evidence below is local unless explicitly identified as a read-only public observation. Hosted checks are reported on the PR, not implied by these fixtures.

## Completed scope

- [x] Trace/reproduce generated original-owned picks and implement shared, evidence-backed eligibility.
- [x] Remove the global Welcome gate and obsolete acknowledgement harness setup.
- [x] Replace the Staff Editorial and update both visible support links/accessibility names.
- [x] Reproduce and fix nested Season Review expansion without changing simulation outcomes.
- [x] Focused logic tests, Phase 0 baseline, TypeScript, lint, production build, and isolated four-width browser regression.

## Draft-pick diagnosis and boundaries

The captured public `/api/league` response contained **1,120 picks**, five years **2027–2031**, rounds **1–7**, all assigned to their original teams, with zero moved/protected entries. This is an observation, not proof of the database override inventory. The SHA-256 of that response is recorded in [pick-handling.json](pick-handling.json); unrelated player/source data from the response is not committed.

`buildDraftPickInventory` generated every original slot and applied only explicit database overrides. Read failures silently returned the complete original-owned set. Published roster assembly transfers players but explicitly skips picks; normal published trades therefore did not fill this gap (CSV ingestion can separately write overrides). Both Trade Machine and Armchair consume this inventory through their existing league boundary.

The inventory now separates stable original identity (`pick-TEAM-YEAR-ROUND`), current beneficiary/owner, and selection eligibility. Explicit dated operator overrides and deterministic published roster trades are read through the existing readers; older trades do not replay over a newer attributable inventory. Missing evidence and failed ledger reads return unverified, unassigned slots, never inferred original ownership. Conditional slots retain their conditions/alternative identities and are unavailable, with an explanation, rather than counted as unconditional team capital. Both selectors use the same resolver/helpers. Saved offers are checked against the current session inventory. A real Armchair bench fixture transfers the same pick twice without duplicate IDs, restoring its original owner, or changing cap space.

### Exact bounded verification scope

All 1,120 exposed identities have supported **handling**, but ownership is **not fully reconciled**. The checked facts below are a deliberately partial snapshot as of **2026-10-05**. The machine-readable file enumerates every ID, owner/beneficiary, condition, source and status. Counts are the curated isolated inventory, not a claim about uninspected Production overrides.

| Year | Verified unconditional | Conditional/conflicting blocked slots | Unverified unavailable slots |
| --- | ---: | ---: | ---: |
| 2027 | 10 | 5 | 209 |
| 2028 | 8 | 4 | 212 |
| 2029 | 7 | 1 | 216 |
| 2030 | 0 | 0 | 224 |
| 2031 | 0 | 0 | 224 |
| Total | **25** | **10** | **1,085** |

Verified unconditional facts: Chicago-origin 2027 rounds 1/2/3/6/7, 2028 rounds 1–6 and 2029 rounds 1–7; VAN 2027 second, TBL 2027 third and SJS 2028 fourth held by CHI; CHI 2027 fifth held by CAR and CHI 2028 seventh held by SJS; OTT 2027 sixth held by CHI; PHI 2027 sixth held by TOR. Every other unconditional identity remains unavailable pending attributable evidence. Neither CHI nor VAN's 2027 fourth is unlocked: the re-acquired fourth's original identity is ambiguous in the checked inventory/trade chain.

### Sources and unresolved conditions

| Scope | Attributable evidence checked | Handling |
| --- | --- | --- |
| Chicago 2027–29 current inventory | [Official future picks](https://www.nhl.com/blackhawks/team/future-draft-picks), cross-check [PuckPedia Chicago](https://puckpedia.com/team/chicago-blackhawks/draftpicks) | Only enumerated unequivocal unconditional identities above are selectable. |
| OTT 2027 sixth → CHI | [Official Ottawa announcement](https://www.nhl.com/senators/news/ottawa-senators-acquire-andre-burakovsky-from-chicago-in-exchange-for-a-sixth-round-draft-pick), June 26, 2026; Chicago tracker | Exact Ottawa-origin identity supported. |
| PHI 2027 sixth → TOR | [PuckPedia Philadelphia](https://puckpedia.com/team/PHILADELPHIA-FLYERS/draftpicks), [Toronto](https://puckpedia.com/team/toronto-maple-leafs/draftpicks) | Tracker cross-check supports identity; this is not claimed as independently confirmed by an official complete league ledger. [Pro Sports Transactions 2027](https://www.prosportstransactions.com/hockey/DraftTrades/Years/2027.htm) search result corroborated it, but full page was inaccessible (403). |
| TOR/CBJ September 28 trade, 2027 second | [Official NHL report](https://www.nhl.com/news/maple-leafs-acquire-kirill-marchenko-in-trade-with-blue-jackets-for-matthew-knies) does not specify origin/conditions; [CBJ tracker](https://puckpedia.com/team/columbus-blue-jackets/draftpicks) identifies a conditional CBJ-origin second, conflicting with the established TOR-origin identity in the published operator trade | Both TOR/CBJ 2027 seconds blocked. Do not edit `trade-2026-09-28-fab49941` or its frozen evidence. Exact obligation remains unresolved. |
| COL 2027/2028 first → TOR | [Official Roy report](https://www.nhl.com/news/topic/trade-coverage/nicolas-roy-traded-to-colorado-avalanche-by-toronto-maple-leafs), transaction March 5, 2026 | Top-10 protected 2027 first, unprotected 2028 alternative. Both blocked; prior obligations/conveyance not resolved. |
| EDM 2027/2028 first → CHI | [Official Mangiapane announcement](https://www.nhl.com/blackhawks/news/release-blackhawks-acquire-mangiapane-and-conditional-first-round-pick-from-oilers), March 4, 2026, Chicago tracker | Conditional first; exact protection/conveyance not established. Both alternative slots blocked. |
| EDM 2028 second → CHI | Official Chicago inventory/tracker; [Murphy announcement](https://www.nhl.com/blackhawks/news/release-blackhawks-trade-connor-murphy-to-oilers), March 2, 2026 | Inventory labels it conditional while announcement lacks terms. Blocked. |
| FLA first-round right → CHI | Official Chicago inventory/tracker | Conditional 2027 right with unresolved prior obligations/alternative years. 2027/2028/2029 first slots blocked; no inferred settlement. |

No attempt was made to collect complete 32-team ledgers or historical drafted-player lineage. A free-text conditional published trade cannot safely identify replacement/promoted rounds, so all original-team slots in explicitly mentioned years are conservatively reserved. Explicit curated groups block only their specified identities. A plain owner edit cannot discharge a known unresolved condition.

### Data action, transition, and limitations

These verified facts and fail-closed selectors are **code-backed**; no Production database action is needed or authorized for this PR. Legacy cached picks have no verified status and are unavailable until normal inventory regeneration supplies the new metadata; no cache clearing/TTL/key change is included. This can temporarily make even reviewed picks unavailable. Existing saved/shared historical verdicts and Docket payloads are preserved; new editable offers require current eligibility.

The authenticated existing `PUT /api/admin/draft-picks` supports individual original/current owner, year, round, protection and free-text conditions. Its exposed range now matches 2027–31. It does not store structured mutually exclusive obligation groups or external source provenance. Its generated original-owner rows are not evidence of ownership. A future data correction must first capture the exact existing override and affected published-trade chain, attach source/as-of/conditions, review each stable-ID before/after, and use that endpoint once per supported identity. Unknown or conflicting rights cannot be unlocked by a bare owner correction; richer conditional handling requires a separate bounded review. No executable Production correction package is proposed for unresolved facts.

The existing Cup Run synthetic rookie draft still uses its original-club simulation fallback when no resolved draft owner exists; this PR does not change draft outcomes/season advancement or claim that simulation resolves real conditional conveyance. Unresolved future pick rights remain unavailable in trade selectors. Simulation-to-real-obligation reconciliation is deferred, rather than changing prohibited simulation math or drafted-player lineage here.

## Welcome/home reproduction and correction

A fresh browser previously encountered a global blocking Welcome acknowledgement, with a focus trap and localStorage gate. The root layout no longer mounts it and the unused component is deleted. Existing visible Header/home navigation remains. Harnesses no longer set the acknowledgement key; fresh-browser checks assert it is absent.

The supplied six editorial paragraphs and Brady byline replace the old copy, preserving newspaper typography. Both support links use `https://buymeacoffee.com/capandcrease`, visible “Buy me a stick tap”, and the accessible name “Buy me a stick tap — support Cap & Crease”. Obsolete legal copy about welcome acknowledgement storage was removed.

## Season Review reproduction and correction

The actual local single-season journey (select team, draft, re-sign, offer-sheet step, real `/api/simulate`, open review, expand player) reproduced `details.open = false` immediately after expansion. See [reproduction.json](reproduction.json). This was **component identity**, not event bubbling: `TeamNumbers` was declared as a new nested component type inside each `SeasonResultsPager` render. Updating `openPlayer` remounted its native uncontrolled `<details>`.

Rendering that unchanged subtree directly with a stable team key preserves the same DOM disclosure. No event suppression, calculation change or controlled rewrite was needed. The regression checks the original element remains connected/open, results return unchanged after collapse, scroll moves no more than 2 px, and exactly one simulation request occurred. Mouse, touch, Enter and Space are exercised. Native inline review summary closes it; the existing enclosing mobile sheet retains Escape/explicit close. There is no native-review outside-click dismissal; the full-screen sheet has no outside-click handler, and none was added.

## Verification and evidence

- Final focused run: **28/28** tests, six files, including **Phase 0 10/10** unchanged frozen outputs, identity/conditional/duplicate/saved-offer guards, legacy/database failure, shared roster boundary and actual Armchair bench transfer.
- One broader local run: **2,693 passed / 4 failed**. Failures were three obsolete literal-source canaries and a route fixture missing the newly read trade reader. They were repaired; focused affected recheck **440/440 passed**. The full suite is not repeatedly rerun locally; normal PR CI supplies the final broad gate.
- TypeScript passed. Lint: zero errors, four pre-existing warnings. Production build passed.
- Isolated production-build browser regression at **320, 412, 1024 and 1440 px**: Home/Players/Trade Machine/Armchair direct first visits, support keyboard focus, original/current pick selection and explanations, real simulation/review mouse/touch/keyboard expansion, disclosure/results/scroll/request preservation, explicit close/Escape, no page errors or new horizontal overflow. Synthetic league and stubbed narrative; this is not a Production or authenticated Preview browser pass.
- `scripts/verify-picks-welcome-review.mjs` runs in normal Mobile regression CI and emits screenshots/report artifacts. [report.json](report.json) contains the local four-width result.

| Before | After (412 px) |
| --- | --- |
| [Blocking Welcome](before-welcome.png) / [Old homepage](before-home.png) | [Direct homepage / editorial / support](after-home-412.png) |
| [Review open](before-review-open.png) → [Closed by player expansion](before-review-collapse.png) | [Review stays open with player expanded](after-review-expanded-412.png) |
| Public inventory observation: all 1,120 original-owned | [Sourced pick owner / unavailable explanations](after-picks-412.png) |

The before simulation screenshot used captured public league data; final regression uses isolated fixtures. Neither is evidence of a Production mutation. No merge or deployment is part of this task.
