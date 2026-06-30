# Tasks — active queue

Follow **AGENTS.md → Task Discipline** for every item. One task per run; on completion,
check it off here and append a dated one-line entry to `docs/DEVNOTES.md`.

Legend: `[ ]` to-do · `[~]` partial / verify-then-close

> Completed items live in `docs/bugs/CONFIRMEDFIXES.md`. Un-triaged reports go in
> `docs/bugs/KNOWNBUGS.md` until promoted here.

---

## [] New Sim Engine/Off season

### [] S1 - UFA are 1 year out of date
Before we decided to go on this route of a proper off season mode, we added code to add 1 additional year to 2026 UFA's in order to have them persist in the DB. We need to remove this and have them populate in the UFA list. Right now we have a mixture, but Alex Debricat is listed as the top UFA in our sim currently. 
To help calibrate, here is a partial free agency list from PuckPedia:

2026 RFA Forwards (44)	
  Jason Robertson   Dallas Stars	96
  Connor Bedard   Chicago Blackhawks	75
  Cutter Gauthier   Anaheim Ducks	69
  Leo Carlsson   Anaheim Ducks	67
  Trevor Zegras   Philadelphia Flyers	67
  Pavel Dorofeyev   Vegas Golden Knights	64
  Adam Fantilli   Columbus Blue Jackets	59
  Collin Graf   San Jose Sharks	46
  Connor McMichael   St. Louis Blues	46
  Zach Benson   Buffalo Sabres	43
    1-10of44	
	
2026 RFA Defence (25)	
  Brandt Clarke   Los Angeles Kings	40
  Alexander Nikishin   Carolina Hurricanes	33
  Jamie Drysdale   Philadelphia Flyers	32
  Jordan Spence   Ottawa Senators	31
  Simon Nemec   Calgary Flames	26
  Simon Edvinsson   Detroit Red Wings	25
  Pavel Mintyukov   Anaheim Ducks	22
  Olen Zellweger   Anaheim Ducks	22
  Braden Schneider   New York Rangers	18
  Emil Andrae   Toronto Maple Leafs	13
    1-10of25	
	
2026 RFA Goalies (5)	
  Jet Greaves   Columbus Blue Jackets	0.908
  Akira Schmid   Vegas Golden Knights	0.893
  Arturs Silovs   Pittsburgh Penguins	0.887
  Samuel Ersson   Toronto Maple Leafs	0.87
  Leevi Merilainen   Ottawa Senators	0.86
	
2026 UFA Forwards (88)	
  Alex Tuch   Buffalo Sabres	66
  Anthony Mantha   Pittsburgh Penguins	64
  Alex Ovechkin   Washington Capitals	64
  Patrick Kane   Detroit Red Wings	57
  Viktor Arvidsson   Boston Bruins	54
  Mats Zuccarello   Minnesota Wild	54
  Marcus Johansson   Minnesota Wild	49
  Claude Giroux   Ottawa Senators	49
  Vladimir Tarasenko   Minnesota Wild	47
  Mason Marchment   Columbus Blue Jackets	45
    1-10of88	
	
2026 UFA Defence (52)	
  John Carlson   Anaheim Ducks	60
  Rasmus Andersson   Vegas Golden Knights	47
  Jacob Trouba   Anaheim Ducks	35
  Ryan Shea   Pittsburgh Penguins	35
  Tony DeAngelo   New York Islanders	35
  Brent Burns   Colorado Avalanche	35
  John Klingberg   San Jose Sharks	27
  Logan Stanley   Buffalo Sabres	26
  Nick Blankenburg   Colorado Avalanche	24
  Mario Ferraro   San Jose Sharks	23
    1-10of52	
	
2026 UFA Goalies (14)	
  Matt Murray   Seattle Kraken	0.922
  Connor Ingram   Edmonton Oilers	0.899
  Daniil Tarasov   Florida Panthers	0.895
  David Rittich   New York Islanders	0.894
  Pheonix Copley   Los Angeles Kings	0.893
  Jonathan Quick   New York Rangers	0.89
  Eric Comrie   Winnipeg Jets	0.89
  Stuart Skinner   Pittsburgh Penguins	0.887
  James Reimer   Ottawa Senators	0.886
  Cam Talbot   Detroit Red Wings	0.883

### [x] S1.25 - Have to add RFA with CBA rules
Players that are RFA's need to be treated as such and are then subjected to RFA rules:
$1,544,424 or less
None

Over $1,544,424 to $2,340,037
Third-round pick

Over $2,340,037 to $4,680,076
Second-round pick

Over $4,680,076 to $7,020,113
First- and third-round picks

Over $7,020,113 to $9,360,153
First-, second-, and third-round picks

Over $9,360,153 to $11,700,192
Two firsts, one second and one third

Over $11,700,192
Four first-round picks

### [x] S1.5 - Need a way to monitor free agents and manually add and remove what is going to be shown for the sims. 
Right now it is still not showing Alex Tuch, if there is some sort of error we can add him manually if needed. 

### [x] S1.75 - Need to be able to fully track and move draft picks around to match real life
Right now there is now way to move draft picks and have it persist. Only players. DB needs to be ammended to include Draft Picks and where draft picks are.
	
### [] S2 - Goalie Glitch
In some instance, goalie value is not generated correctly. One instance Hellebyuck had a +50 NAV, the next instance his 205 NAV populated. Just need to confirm if that was just a load error.


## [x] Correctness

### [x] Task 0.3 — import-draft-class overwrite guard
File: `app/api/admin/import-draft-class/route.ts`. On an existing id, only apply ELC
defaults (capHit/years/clauses) when the existing row is actually a prospect; never
overwrite a row that already has a real `capHit` or NMC/NTC.
Acceptance: re-importing a draft class never clobbers an established player's contract; `npm test` + typecheck pass.

### [x] V2-1 — team phases shuffle league-wide after a trade
Root: `executeTrade` (`app/armchair-gm/page.tsx` ~393–420) re-ranks all 32 teams by
`strengthByTeam`, assigns standings 1..32, and overwrites every team's `standing`/`phase`
via a crude `phaseFromStanding` map that disagrees with the server's `derivePhase` +
`phaseOverride` (`app/api/league/teams/route.ts`). So Carolina (Contender) flips to
Retooling and the whole league shuffles even though only two teams traded.
Fix: a trade must only mutate the two involved teams' capSpace (and at most their own
phase). Leave non-involved teams' `standing`/`phase` exactly as the server provided; if
the two traders' phase should react, recompute only theirs via the canonical logic and
respect `phaseOverride`. No league-wide standing→phase remap.
Acceptance: a trade changes only the two teams' cap (and optionally their own phase);
every other team's phase/standing unchanged; `npm test` + typecheck pass.

### [x] V2-2 — admin cap-ceiling override not reaching Armchair GM
Root: `/api/league/teams/route.ts` uses a hardcoded `CAP_CEILING = SEASON.capCeiling`
(~10, returned ~208) and never reads the live `cap_ceiling` from `siteSettings`. Only
`/api/evaluate`'s `getLiveCapCeiling` reads the DB override, so the 2026-27 cap updates
NAV math but not the teams route Armchair GM uses — and busting cache can't help (it's a
constant, not a cached DB read).
Fix: teams route reads the live ceiling (reuse `getLiveCapCeiling` / read `cap_ceiling`
from `siteSettings`) and returns it as `capCeiling`; ensure `clear-cache` busts
`cache:teams`. (Static `capSpace` stays per Decision A; the ceiling override must flow.)
Acceptance: changing `cap_ceiling` + busting cache → `/api/league/teams` returns the new
ceiling and Armchair GM reflects it; `npm test` + typecheck pass.

### [x] V2-3 — depth-depletion flag misfires for unproven prospects
Root: the "D corps can't absorb losing X" flag (`app/api/evaluate/route.ts` ~668–681 and
the partner-side twin) qualifies "elite D being traded" with `(a.avgTOI ?? 0) > 22 ||
navOf(a) > 100`. A 2026 draft prospect has 0 NHL games but a high *pedigree* NAV (>100 via
`calcProspectNAV`), so the `navOf > 100` branch flags him as an established top-pair D —
firing "Florida's D corps can't absorb losing him" for a player who's never played.
Fix: add a proven-player guard (e.g. `a.avgTOI > 22 && (a.games ?? 0) >= 20`, or exclude
draftees/`!hasLiveStats`) so pedigree NAV alone can't trigger the depletion veto. Apply to
both home and partner sides.
Acceptance: trading for an unproven prospect D (0 NHL games) does not fire "can't absorb
losing him"; trading an established 22-min D still does; `npm test` + typecheck pass.

### [x] V2-4 — acquired goalies invisible on the bench
Root: `app/components/LineupEditor.tsx` builds the bench skaters-only — `bench =
effective.filter(p => isF(p) …)` (~82) and `benchIds = [...fBench, ...dBench]` (~252–255)
include only F and D. A 3rd goalie never appears on the bench, so he can't be swapped into
the active goalie slot. `LineupCard.tsx` also slices goalies to top-2 by games (~74).
Fix: include extra goalies (beyond the 2 active slots) in the bench and make the goalie
slots valid swap targets so a bench goalie can be moved into starter/backup.
Acceptance: an acquired 3rd goalie appears on the bench and can be moved into the
starting/backup slot; `npm test` + typecheck pass.

### [x] V2-4.5 — phase classification collapses EMERGING / REGRESSION_RISK into PEAK_WINDOW
Root: in `classifyPhase` (`app/lib/development-profile.ts` ~190–202) the elite-production
rule `if (scores.production >= 80 && scores.trend !== "FALLING") return "PEAK_WINDOW"`
(~192, added to keep generational vets in their peak window) sits ABOVE the young-EMERGING
checks (~196–197) and the `age >= 32 && regressionRisk >= 55` REGRESSION_RISK check (~193).
So it intercepts two groups it shouldn't: elite teenagers (Celebrini/Schaefer, age 19,
production ≥ 80 → should be EMERGING) and aging career-year outliers (Scheifele, 33, RISING
96-pt season, regressionRisk ≥ 60 → should be REGRESSION_RISK). This is a real model
regression — the test fixtures are correct canaries; do NOT edit the tests, and do NOT add
new phases (the five existing phases are right).
Fix: reorder `classifyPhase` so the young-EMERGING checks (`age <= 21 …`, `age <= 19 &&
nhlGames < 20`) and the `age >= 32 && regressionRisk >= 55` REGRESSION_RISK check run BEFORE
the `production >= 80` PEAK_WINDOW rule. Keep the elite-production rule (it's the only thing
that keeps a genuinely-peak 32–33yo low-regression scorer out of UNKNOWN); just let the
younger/aging-outlier branches win first. Change ordering only — do not alter thresholds.
Verify McDavid (29) stays PEAK_WINDOW and Byfield (23) stays BREAKOUT_CANDIDATE.
Acceptance: the 3 failing cases pass (Celebrini/Schaefer → EMERGING, Scheifele →
REGRESSION_RISK) and the other 10 dev-profile tests stay green; no test edits; `npm test` +
typecheck pass.


### [x] V2-5 — sim ignores user lineup / starting goalie (larger; may split)
Root: `projectStartingGoalie` (`app/api/simulate/route.ts` ~220–226) picks the starter by
sorting on `gamesStarted` desc and taking `[0]` — it never reads the user's lineup, so a
designated starter (Levi) is ignored and Comrie (more GP) is used. Team-strength also sorts
goalies by `onIceValue` (~169). The lineup-editor state isn't passed to `/api/simulate` at
all, so all lineup edits are cosmetic.
Fix: thread the user's lineup (at minimum the designated starting goalie; ideally line/pair
order) from Armchair GM into the `/api/simulate` request, and have the sim use the
designated starter; fall back to the heuristic only when no lineup is supplied.
Acceptance: setting a starting goalie and running the sim uses that goalie; `npm test` +
typecheck pass. NOTE: largest of the set — touches the simulate payload + sim engine + the
Armchair GM call site. If the diff balloons, split into "thread lineup into payload" and
"consume it in the sim".

---

## [x] Valuation

### [x] R3 — defensive-D undervaluation (the Parayko case)
File: `app/lib/xnav-engine.ts` (`calcSkaterNAV`). A shutdown top-pair D — ~22+ TOI, modest
points (~25–30), strong suppression, ~$6.5M long deal — computes to negative NAV, yet the
market pays a mid/late 1st + a prospect (≈150–180 NAV). Two stacked biases:
- `trueMarketValue` is offense-weighted, so a points-light D scores low (small `offTotal`;
  `defTotal` only moderate after deployment terms, then squeezed by the 80 asymptote).
- The cap sigmoid + floor drag him negative: low `trueMarketValue` → D `fmvCapPct`
  (`MIDPOINT = isD ? 120`) maps below his $6.5M → negative `capTotal`; and
  `qualifiesEliteDefender` requires `pts >= 65`, so a shutdown D gets no floor.
Fix (both, with guardrail):
1. Credit shutdown deployment + suppression for `isD && toi >= 22` — deployment
   (`toiD`/`qocVal`), `xgaRelTM` suppression, `pairDriverScore` — and raise/soften the
   `defTotal` asymptote so a true top-pair shutdown D lands realistically.
2. Add a shutdown-top-pair-D floor: qualify when `toi >= 22 && (dps high OR xgaRelTM
   strongly negative OR qocIndex high)`; floor ~130–150 (below the 160–240 offensive-D
   floors).
3. Guardrail: require BOTH high TOI AND a genuinely strong defensive underlying — minutes
   alone must not credit a weak/sheltered D.
Characterization test (3 cases): Parayko-type → NAV ≥ ~120 (not negative); weak low-point D
→ stays low; elite offensive D (Makar) → unchanged.
Acceptance: shutdown top-pair D no longer reads negative; weak D unaffected; offensive D
unchanged; existing NAV tests stay green (update only the intentionally-shifted shutdown-D
values); `npm test` + typecheck pass.

### [x] R1 — finish expanded-card de-dup (verify, then close)
Adjustment: PTS and TERM are unable to be sorted by, these should be able to be sorted by. <div style="font-size: 10px; color: var(--rule); text-transform: uppercase; font-weight: 900; text-align: right;">PTS</div> and <div style="font-size: 10px; color: var(--rule); text-transform: uppercase; font-weight: 900; text-align: right;">Term</div> should be buttons no different than <button class="col-header">P/82 </button>
Done already: SEASON POINTS duplicate removed, "Now" tile added, "? STRAND trait guide"
collapsed. **Remaining to verify in `app/players/page.tsx` + `app/components/StrandDisplay.tsx`:**
(a) the STRAND **helix vs OFFENSE/DEFENSE bar block** still renders the same 8 values twice
— de-dupe (keep one); (b) the **CONTRACT PROJECTION** block is still a large flat chart for
short deals — compact it to a stat/sparkline. If both are already addressed, move this to
CONFIRMEDFIXES.

---
## [x] UI/UX Fixes

### [x] UI6 - Trade verdict needs a per-side win/loss read
- Add a compact per-team side assessment to the trade-machine verdict so cross-position trades can show when both teams gain something different, e.g. a forward-for-defense need fit.

### [x] UI7 - Team Strands should show trade-driven +/- deltas
- Add reusable TeamStrand delta rendering so post-trade team strands show OFF/DEF and trait-level changes versus the pre-trade roster, including the focused trade machine page.

### [x] UI1 - `app/players/page.tsx` button font is too small. 
- Need this to be readable for people who arent aware of what is going on. PTS, PPG, buttons are illegiable.

### [x] UI2 - `app/players/page.tsx` players names need to be listed at full at all times. 
- We can apply the ICON key to this page. Players page still follows the PlayerMaker, Sniper, Scorer Architype so we will have to add icons there. 

### [x] UI3 - `app/players/page.tsx` defence and goalie headers need to have their own sorting. 
- Defence and goalies need to have their own listed categories. For Defence we should have PTS, OPS, DPS, TOI, AGE, CONTRACT, YRS LEFT and SUPP to replace PPG. Goalies should have GSAX, SV%, GAA, Contract, Yrs left and GP.

### [x] UI4 - `app/players/page.tsx` needs to follow to have the same icons fed into it like on the Armchair GM Asset Card. 
- Megalodon, Frachise, Surplus, Pedigree, etc. 

### [x] UI5 - `app/players/page.tsx` although duplicate given there is one in the footer, needs a proper icon key found at the top.
- Users need reference to what they are looking at, at the page load, not having to scroll down to the glossary.



## [x] Development Outlook

### [x] D1 — production scale + projection clamps (dynasty cliff already done)
Remaining only (dynasty age-cliff graduation is already in `development-profile.ts`):
1. `productionScale` still flattens elite scorers (W 90 / C 95 / D 65) — raise (~W 110 /
   C 115 / D 75) or add a soft curve above 100 so a 150-pt and a 92-pt scorer separate.
2. `buildProjectionBand` clamps (median 140 / ceiling 160) still flatten the top — raise so
   a 150-pt scorer projects higher than a 135-pt one.
Acceptance: two elite producers with different pts no longer both read production 100; elite
projections separate; dev-profile tests updated for the intentional shifts; `npm test` +
typecheck pass.

### [x] D2 — durability / games-played as a development input
File: `app/lib/development-profile.ts` (+ surface in panel). An 82-game iron-man and an
injury-prone star with the same per-82 pace currently read identically.
- Compute `durabilityScore` (0–100) in `calcDevelopmentProfile` from per-season `games`
  already on the NHL snapshots: ~`clamp(mean(NHL season games) / 82 * 100)`.
- Fold in modestly: low durability raises `regressionRisk`/`bustScore` and lowers
  `confidence` a touch; high durability nudges the other way. Small weights.
- Add `durabilityScore` to the type; show a **Durability** MiniScore in the panel INPUTS
  group with a tooltip ("avg games played per season vs 82").
Acceptance: two players with identical per-82 pace but different season GP get different
durability/risk/confidence; panel shows Durability; existing dev-profile tests stay green
(update intentional shifts); `npm test` + typecheck pass.

### [x] D3 — veteran framing for the Development Outlook
Files: `app/lib/development-profile.ts`, `app/components/DevelopmentProfilePanel.tsx`.
- "Established vet" = `age >= 29 && careerNhlGames >= 250`.
- Helper `estimatePeakYearsLeft(age, position, productionScore, trend)`: base =
  `peakEnd - age` (peakEnd ≈ 30 F / 31 D / 33 G); `+2` if `productionScore >= 85 && trend
  !== "FALLING"`, `-1` if FALLING; clamp 0–6. Return as `peakYearsLeft?` on the profile.
- In the panel, for established vets only, replace the "Breakout" tile with **"Peak Left"**
  (`{peakYearsLeft}yr`, greener = more) and prefer veteran phase labels. Non-vets unchanged.
Acceptance: a 33-yo elite scorer shows "Peak Left"; a 22-yo prospect is unchanged;
`npm test` + typecheck pass.

### [x] D4 — Development Outlook glossary / key
File: `app/components/DevelopmentProfilePanel.tsx`. Add a collapsed-by-default
**"? Outlook key"** toggle (mirror the "? STRAND trait guide" pattern) defining every term:
Now, Dynasty, Breakout/Peak Left, Risk, Arc, Boom, Bust, Inputs (Prod/Role Δ/Pedigree/Exp/
Durability), Projection, phase/trend/sample conf. One collapsible block, default closed.
Acceptance: every metric is defined in the collapsible key; closed by default; `npm test` +
typecheck pass.

## Security / Auth

# Security / Auth

> Admin series. A1–A3 are hardening from the admin audit at `3fc1eb3`; A4 is a new admin
> feature (player retirement). A1 is also The Docket's A1 auth gate. A1.1 is a true
> prerequisite for A1's fail-closed flip (don't ship fail-closed while the UI fakes success
> on 401). A2/A3/A4 are independent and can land in any order. (Distinct from The Docket's
> foundation series in `FUTURECONCEPTS.md` — only A1 is shared; the `A3a` below under the
> Docket section is the cap-delta helper, unrelated to this A3.)

### [x] A1 — close the open admin (authentication) — also The Docket's A1 gate
Audited at `3fc1eb3`. The admin surface is effectively wide open and the existing guard
can't be turned on without breaking the UI:
- `app/lib/admin-auth.ts:5` fails OPEN — `if (!key) return true;` — so when `ADMIN_KEY` is
  unset (the de-facto production state) every `/api/admin/*` request passes.
- No client code ever sends the key: `x-admin-key` appears ONLY in the server check
  (`admin-auth.ts:6`) — no admin page/fetch sends it. So setting `ADMIN_KEY` would 401 the
  admin UI; the guard cannot be enabled as-is.
- No `middleware.ts` and no page gate: `app/admin/*` renders for anyone who hits the URL.
- `/api/admin/contracts` GET (183) / POST (284) / PUT (365) call `isAuthorized` NOWHERE —
  the route that writes individual contracts AND bulk-syncs 100+ players into the DB is
  unprotected regardless of `ADMIN_KEY`. `/api/admin/db-info` GET and the read GETs on
  `/api/admin/teams`, `/trade-block`, `/settings` are also unguarded.
- (Not broken: Drizzle params → no SQLi; input validation + prune >60% guard are fine; no
  committed `.env`; no `NEXT_PUBLIC_*` secret leakage. The gap is purely authn/authz.)
Fix — sequence so the admin UI is never left broken:
1. Give the client a real credential to send: a `/admin/login` page that posts a shared
   admin password and sets an **httpOnly session cookie**; server validates the cookie.
   (Recommended over the static header; single-admin app, so avoid heavy NextAuth.)
2. One gate helper used by EVERY `/api/admin/*` handler — GET and mutations — including
   `contracts` (GET/POST/PUT) and `db-info`. No route exempt.
3. Fail **CLOSED**: if no admin secret is configured, deny. Allow a dev-only escape behind
   an explicit env flag (e.g. `ADMIN_DISABLE_AUTH=1`), never the default.
4. `middleware.ts` gates `/admin/*` pages — unauthenticated → redirect to `/admin/login`.
Acceptance: unauthenticated request to any `/api/admin/*` (incl. `contracts` GET/POST/PUT
and `db-info`) returns 401; visiting `/admin/*` unauthenticated redirects to login; after
login the admin UI reads AND writes successfully; with no secret configured the routes deny
(fail closed); `npm test` + typecheck pass.
NOTE: do **A1.1 first** (or together) — flipping fail-closed while writes fake success (see
A1.1) means admins get "Saved" on every 401 and silently lose data. If the diff balloons,
split A1 itself: (a) login + session cookie + client credential plumbing + single gate
helper on all routes; (b) flip fail-closed + `middleware.ts` page gate. Satisfies The
Docket's A1 prerequisite (`FUTURECONCEPTS.md`).

### [x] A1.1 — admin UI write error handling (prereq to A1 fail-closed)
Root: every mutating admin page does `await fetch(...)` then shows a success toast
UNCONDITIONALLY — no `res.ok` check. Verified in `app/admin/settings/page.tsx:34-47`
(`save`/`clearCache`); same shape in `app/admin/contracts/page.tsx`, `app/admin/teams/page.tsx`,
and `app/admin/trade-block/page.tsx`. A 500/401/network error still reports "Saved", so the
admin silently loses writes. This becomes acute the moment A1 fails closed (every write 401s
but looks successful).
Fix: each admin mutation checks `res.ok` (and the parsed `{error}` body) before the success
toast; on failure show the server error and do NOT optimistically update / re-`load()` as if
it worked. Keep it consistent across all four pages (a small shared helper is fine).
Acceptance: a failing admin write (simulate 401/500) surfaces an error instead of a success
toast and does not show stale "saved" state; happy path unchanged; `npm test` + typecheck pass.

### [x] A2 — remove dead admin team-editor code
Root: `app/admin/AdminTeamRow.tsx` and `app/admin/actions.ts` (`updateTeamPhase`) are unused
— `AdminTeamRow` is imported nowhere, and `actions.ts` is referenced only by it. They are a
superseded team-phase editor, replaced by `app/admin/teams/page.tsx` (which fetches
`/api/admin/teams`). The dead component also alerts success regardless of outcome (the A1.1
bug), so delete rather than fix.
Acceptance: both files removed; no remaining imports of `AdminTeamRow`/`updateTeamPhase`; the
live teams editor (`/admin/teams`) still works; `npm test` + typecheck pass.

### [x] A3 — admin endpoint & validation cleanup
Smaller correctness/consistency gaps found in the audit (group into one pass):
1. **Phantom status:** `app/api/admin/trade-block/route.ts:9` accepts `"blocked"`, but the UI
   (`app/admin/trade-block/page.tsx`) only offers `requested/available/untouchable` — the API
   can set a status the UI can't show or clear. Drop `"blocked"` (or surface it in the UI).
2. **Server-side range validation:** `app/api/admin/contracts/route.ts` POST (single upsert,
   ~286–351) writes `capHit`/`yearsRemaining` with NO range check — the `0.5–20.8` guard
   exists only in the PUT bulk-sync (~418). The client modal caps at 12/20 but a direct POST
   accepts `capHit: 999`. Add the same server-side bounds to the POST path.
3. **Curl-only endpoints — decide per route:** `clear-cache`, `import-draft-class`,
   `prune-stale`, `db-info`, `development-profile` have no UI caller. `clear-cache` is
   redundant with `settings`' `action:"clear_cache"` (remove or surface); `import-draft-class`
   (incl. DELETE-whole-class) and `prune-stale` (DELETE players) are destructive with no UI —
   either give them a guarded admin UI or document them as intentional curl-only ops.
Acceptance: `"blocked"` no longer settable without UI support; contracts POST rejects
out-of-range cap/years; the curl-only endpoints are either wired to UI or documented; `npm
test` + typecheck pass. (Splittable per item if a single diff gets large.)

### [x] A4 — admin: retire a player (roster removal without hard delete)
Root: when a player retires (e.g., Jonathan Toews, retired 2025) there is no explicit admin
action to take him out of circulation. Today he only disappears once CapWages/NHL feeds drop
him and `prune-stale` (curl-only, gated on source health) HARD-DELETES him — so he lingers in
team rosters, the trade machine, and the players page until then, and deletion loses his
record. There is no "retired" concept in the schema.
Fix (non-destructive, reversible):
1. Add a `retired` flag to the players schema (`app/db/schema.ts`) — e.g. `retired` boolean
   (+ optional `retiredDate`). A migration; default false.
2. Admin control to toggle it (reuse the contracts admin page row actions, or a small
   trade-block-style "Retire / Un-retire" button) → POST to an admin route (extend
   `/api/admin/contracts` or add `/api/admin/retire`), guarded by A1 auth and with A1.1
   error handling.
3. Exclude retired players from roster assembly: team rosters, trade-machine asset pickers,
   and the players page (or a separate "Retired" view). NOTE twin-pipeline caveat — apply the
   filter in BOTH `/api/league` and `/api/league/players` until Phase 2 consolidation, or it
   will drift (same class as the Woll/GSAX issue).
4. Setting the flag must NOT delete the row, and un-retire must fully restore the player.
Acceptance: marking Toews retired removes him from rosters / trade machine / players list
WITHOUT deleting his DB row; un-retiring restores him everywhere; `npm test` + typecheck pass.

## For Future Trade Tracker (Known as The Docket)

### [x] A2A — implement the canonical roster-assembly module (actionable spec for A2)
Extract the shared roster pipeline into `app/lib/roster-assembly.ts` so both `/api/league`
and `/api/league/players` call one canonical module for live roster fetches, DB injection,
dedup, stats attachment, trade-block stamping, prospect enrichment, and development profiles.
Keep `/api/league` responsible only for response-specific teams, picks, cap ceiling/floor,
and metadata shaping.
Acceptance: one `roster-assembly.ts`; both routes call it; player objects stay equivalent;
feature canaries point at the module; `npm test` + typecheck pass.

### [x] A3a — shared cap-delta helper
Add a pure helper `applyCapDelta(baselineCapSpace, moves)` where `moves` is the per-team set
of incoming/outgoing assets with `capHit` and `retainedPct`. Returns effective cap space:
baseline − incoming cap (net of retention held by the other team) + outgoing cap (net of
retention this team keeps). No I/O; unit-testable in isolation.
Acceptance: characterization tests cover a straight swap, a retained-salary move, and a
pick-only move (no cap change); `npm test` + typecheck pass.

### [x] B1 — `trades` data model + persistence
Add a `trades` table: `id`, `executedDate`, `source` ("manual"|"scraped"), `sourceUrl`,
`season`, `sides` (array of `{ teamId, assetsGiven[] }`, N-team-ready, render 2), each asset
`{ kind:"player"|"pick", ref:{id,nameSlug}, retainedPct, inputSnapshot, navAtTrade }`,
`conditions` (free-text), `lockedVerdict`, `gradeAtTrade` `{ perTeamNetNav, winner,
fairness }`, `published` (bool). Store the **inputSnapshot** (engine inputs at trade time),
not just IDs — stats/contracts move and IDs alone are unreliable (Woll proves it).
Acceptance: migration creates the table; a row round-trips through the data layer with the
snapshot intact; `npm test` + typecheck pass.

### [x] B2 — grade + freeze at ingestion (reuse trade-share lock)
On save, run the evaluate engine over the trade, capture the full verdict + per-asset
`navAtTrade` + `inputSnapshot`, and FREEZE them into `lockedVerdict`/`gradeAtTrade`. Reuse
the existing `trade-share` snapshot/lock shape rather than inventing a new one.
Acceptance: saving a trade persists an immutable at-trade verdict that does not change when
underlying player data later changes; `npm test` + typecheck pass.

---

## Tests

### [x] 1c — roster-assembly tests for `/api/league/players`
Tests that a player on two teams' feeds dedups to one, DB-injection augments without
duplicating, and name/stat matching attaches the right stats. Mock the fetches; assert the
emitted player list. Do NOT change route logic.
Acceptance: tests cover the three cases above and pass; `npm test` + typecheck pass.
