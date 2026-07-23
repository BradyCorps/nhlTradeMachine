# Armchair GM audit — 2026-07-23

Implementation backlog. Inspect the repo first. Done = code + regression tests. `AA` = WCAG 2.1 AA. Test a new run through Year 3.

## 1. State and season lifecycle

- [ ] **ST1 New run:** clear all prior sim state; restart at the 2026–27 offseason/2026 draft. Current bug: the old sim continues while only the draft resets.
- [ ] **ST2 Draft picks:** traded picks stay unavailable; completed draft years leave every asset selector. A traded 2027 first cannot reappear in that draft, and Year 2 cannot offer 2027 picks. ![ST2](assets/13-stale-2027-draft-picks.png)
- [ ] **ST3 Positions:** alternative positions persist into Lineups. ![ST3](assets/01-lineups-position-persistence.png)

## 2. Roster, player cards, and lineups

- [ ] **RL1 Styling:** Team/Season Selection states cannot use ink-black backgrounds.
- [ ] **RL2 Roster:** add `ROSTER` before `LINEUPS`; sort by points; expand rows to current Stats/GRAVITY/Outlook/icons; refresh from the prior sim season. Replace `Team Numbers`. ![RL2](assets/07-team-numbers-roster-data.png)
- [ ] **RL3 Cards:** update tabs/icons; remove `DEV`, add revamped Outlook and GRAVITY. ![RL3](assets/03-player-card-dev-tab.png)
- [ ] **RL4 Leadership:** show Captain + two Alternate Captains from existing data.
- [ ] **RL5 Locks:** allow player-to-line locks.
- [ ] **RL6 Special teams:** add `5-on-5 | Power Play | Penalty Kill`; sim deployment must respect them.
- [ ] **RL7 Goalies:** generate backup sim stats.
- [ ] **RL8 Stats:** replace `P/82` with `G` and `A`. ![RL8](assets/16-lineups-p82.png)

## 3. Valuation and data integrity

- [ ] **VAL1 Prospect NAV:** Viggo Björck matching is fixed, but the eighth-overall pick has NAV `0`; fix. ![VAL1](assets/02-viggo-bjorck-nav-zero.png)
- [ ] **VAL2 Duehr:** fix Walker Duehr’s inconsistent `3 GP/0 G/0 A/1 PTS`, unsupported second-line role, and inflated NAV. ![VAL2](assets/05-walker-duehr-valuation.png)
- [x] **VAL3 Relative value:** Duehr cannot equal Aleksander Barkov; add this regression test. ![VAL3](assets/06-duehr-barkov-equal-value.png) — resolved by VAL4: Barkov's pedigree floor now holds through his injury year, lifting him well clear of an unpedigreed depth callup. Regression in `__tests__/historical-floor-injury.test.ts`.
- [x] **VAL4 Injuries:** an injury-lost latest season cannot erase elite value. Use the most recent full season for Barkov-type cases. — `isInjuryShortenedPrime` in `player-data.ts`: for a pedigreed player still in his prime window (games < 55 && age ≤ peakAge+2), the depressed counting stats read as injury, not decline, so the historical floor keeps only its age decay and skips the games/pace collapse and the decline gate. A player past his peak with the same low sample is left to decay as before (Karlsson unchanged).

## 4. Offseason UX and transactions

- [ ] **OFF1 CTA:** after RFA, replace `Done — Proceed to Free Agency` with `Start Armchair GM` or the accurate next action. ![OFF1](assets/04-rfa-completion-cta.png)
- [ ] **OFF2 Re-sign:** make the full screen AA. ![OFF2](assets/09-resign-screen-accessibility.png)
- [ ] **OFF3 Analytics:** enlarge the advanced-stat dropdown target; make expanded data AA; make offseason decisions more engaging/methodical. ![OFF3](assets/10-advanced-stats-dropdown.png)
- [ ] **OFF4 RFA data:** match the FA expandable analytics.
- [ ] **OFF5 Extensions:** support human and AI extensions.
- [ ] **OFF6 FA pool:** `FA_POOL` is internal; never render/behave as a ghost team. ![OFF6](assets/12-fa-pool-ghost-team.png)
- [ ] **OFF7 AI trades:** allow realistic cap-clearing offseason trades using existing needs/trajectory/value logic; reject incoherent dumps.

## 5. AI cap management and player retention

- [ ] **AI1 Franchise RFAs:** retain foundational RFAs when feasible. San Jose cannot leave Celebrini unsigned or remove him from the sim. ![AI1](assets/11-celebrini-rfa.png)
- [ ] **AI2 Cap priority:** fix Year 2 league-wide cap exhaustion. Reserve cap for priority RFAs before external UFAs; San Jose cannot sign Kucherov at Celebrini’s expense. ![AI2](assets/14-sjs-kucherov-cap.png)
- [ ] **AI3 Player lifecycle:** nobody disappears between RFA/UFA/roster/market. Fix Year 3’s empty FA market and missing RFAs despite teams having `$5M+` cap. ![AI3](assets/15-empty-year3-fa-market.png)

## 6. Simulation results

- [x] **SIM1 Bracket:** winners feed the correct next-round slot. Regression: Mammoth + Blackhawks wins must yield Mammoth–Blackhawks, not Wild–Blackhawks. ![SIM1](assets/08-playoff-bracket-advancement.png) — bracket extracted to `app/lib/playoff-bracket.ts`; R2 now pairs adjacent R1 winners (rows 0+1, 2+3) instead of 0+2/1+3, so a winner feeds the slot drawn beside it. Regression in `__tests__/playoff-bracket.test.ts`.
