# Player display and data findings — September 2026 mobile audit (P2)

Investigation only. Nothing here changes `calculateAssetNAV → calcNAV`, the
FMV fit, Phase 0 fixtures, Gravity, flags, snapshots or Labs records. Where a
change looks warranted it is written up as a proposal for a separate,
validated analytics change.

Reproduced on a local production build of `ae445c1` with the committed
`MoneyPuckData/2025_26` and `nhl-active-players.csv` standing in for the live
feeds. McDavid's local market price is **$16.52M**, matching the $16.5M the
production card shows, so the trace below is the production computation.

## 1. McDavid's $16.5M market price

**Where it comes from.** `PercentileCard` shows `xnav.fmvAav`. In
`xnav-engine.ts` that is `BASE_CAP_CEILING × skaterFmvCapPct(...)`, with the
inputs pooled by `skaterSeasonPrior` (`skater-prior.ts`) and the coefficients
from `app/data/skater-fmv.json`: the forward model, fitted on 1,297 one-way
standard contracts signed 2017-07-01 to 2026-07-29, walk-forward R² 0.70, mean
error 1.17 pts of cap ($1.22M at $104M). The target is the **share of the cap**
in the contract's first season, so each deal is compared against the cap of its
own year.

| Input | Value |
|---|---|
| Model / version | forward hinged-spline fit, `skater-fmv.json` (schema in file) |
| Season cap priced against | $104.0M (`SEASON.capCeiling`, 2026-27) |
| Points per 60 (pooled) | 4.394 (2025-26 pace 138/82 over 82 GP, baseline 134.7) |
| Minutes per game (pooled) | 22.67 → deployment feature 1.133 |
| Age | 29 |
| UFA | yes |
| Domain | inside the fitted range on every feature (no clamp) |

| Term | Cap share |
|---|---|
| Intercept | +0.02861 |
| Points/60 (base + two hinges) | +0.00420 +0.05577 +0.00994 |
| Deployment (base + two hinges) | +0.04047 +0.05172 +0.00593 |
| Age | −0.03927 |
| UFA | +0.00145 |
| **Total** | **0.15884 → $16.52M** |

The price comes almost entirely from production above the 85th-percentile
knot and from deployment. It sits below the 20% CBA maximum ($20.8M) and
the build confirms that ceiling binds on no fitted contract.

**Comparison with signed deals, each deal's cap share taken against the cap in
the first season of that deal** (`OtherData/contracts/signings.csv`). The model
column prices each player's **current** 2025-26 profile, not the profile he had
when he signed, so this table shows context, not a residual test. The
walk-forward validation in the artifact is the actual residual test.

| Player | Signed AAV | First season (cap) | Signed share | Model share today | Diff (pts) |
|---|---|---|---|---|---|
| Connor McDavid | $12.5M × 2 (UFA, age 28) | 2026-27 ($104.0M) | 12.0% | 15.9% | +3.9 |
| Leon Draisaitl | $14.0M × 8 | 2025-26 ($95.5M) | 14.7% | 14.0% | −0.7 |
| Nathan MacKinnon | $12.6M × 8 | 2023-24 ($83.5M) | 15.1% | 14.9% | −0.2 |
| Kirill Kaprizov | $17.0M × 8 | 2026-27 ($104.0M) | 16.3% | 12.4% | −3.9 |
| Jack Eichel | $13.5M × 8 | 2026-27 ($104.0M) | 13.0% | 11.8% | −1.2 |
| Mikko Rantanen | $12.0M × 8 | 2025-26 ($95.5M) | 12.6% | 11.6% | −1.0 |
| Mitch Marner | $12.0M × 8 | 2025-26 ($95.5M) | 12.6% | 10.5% | −2.1 |
| David Pastrnak | $11.25M × 8 | 2023-24 ($83.5M) | 13.5% | 12.3% | −1.2 |
| Auston Matthews | $13.25M × 4 | 2024-25 ($87.5M) | 15.1% | 10.1% | −5.0* |
| Macklin Celebrini (RFA) | $18.8M × 5 | 2027-28 ($113.5M) | 16.6% | 14.0% | −2.6 |
| Leo Carlsson (RFA) | $18.0M × 5 | 2026-27 ($104.0M) | 17.3% | 8.8% | −8.5 |
| Connor Bedard (RFA) | $15.0M × 5 | 2026-27 ($104.0M) | 14.4% | 11.2% | −3.2 |
| Cale Makar | $20.4M extension | **2027-28 ($113.5M)** | **18.0%** | 10.8% (D model) | −7.2† |

\* Matthews's 2025-26 profile (60 GP, 72 pts/82) is well below the one he
signed on, so this row reflects the change in his profile, not model error.
† Makar's $20.4M extension starts in 2027-28. Against that season's announced
$113.5M cap it is 18.0% of the cap, not the 19.6% it would be against $104M,
and it is not his 2026-27 cap hit ($9.0M). **The extension is not in
`signings.csv`**, so it is outside the fitted population. This row uses the
figure from the audit brief, which the repository cannot verify.

**Reading.** Among elite UFA forwards the model is within about ±1.5 points of cap
of the signed shares, except at the two ends. McDavid's own deal is 3.9 points
*below* his profile's market price: a two-year, below-market deal, which the
model has no term for (the artifact's `excludedFeatures` and the
"leverage, cap room and bidding" note say so). Kaprizov is 3.9 points
*above*. The 2026 RFA megadeals (Carlsson, Celebrini, Bedard) are all above
the model, by 2.6 to 8.5 points. That is the clearest pattern: they were signed
into the 2026-27/2027-28 cap jump, and the walk-forward split (trained before July
2024) has barely seen that market.

**Conclusion.** $16.5M is the model working as fitted. It is not a display or
input bug: the inputs are correct, inside the domain, and priced against the
correct season cap. It is higher than the $12.5M McDavid signed for because
that deal is a discount, not because the model misreads him. No production
change is warranted from this case alone.

**Proposed follow-up (separate, validated change).** Re-run the
walk-forward evaluation with a holdout of deals signed after the 2026 cap jump
(first season 2026-27 or later) and report residuals by signing status and
top decile. If young RFA stars are systematically under-priced, consider a
signing-year market term or refitting on the post-jump market, behind the
existing backtest gate. Add Makar's extension to `signings.csv` from a primary
source before any refit.

## 2. League-minimum floor

`skater-fmv.ts` and `goalie-fmv.ts` both floor at
`LEAGUE_MINIMUM_CAP_PCT = 0.00745`, documented as "$775k against a $104M
ceiling". $775k is the **2025-26** minimum. The 2026-27 minimum is **$850k**:
`signings.csv` records 2026 minimum deals at $850k (share 0.008). The share
that matches $850k at $104M is 0.00817. `free-agency.ts` (`capMin: 0.775`) and
`ai-cap.ts` (`MIN_RESERVE = 0.775`) carry the same stale dollar figure for the
simulation.

**Impact, measured on the 2026-27 skater pool (1,202 priced):**

- 22 skaters are priced at the current floor ($0.775M).
- 29 skaters are priced below $850k.
- The largest price lift from correcting the floor is **$0.075M a year**,
  about 6% of the forward model's mean error. Only replacement-level
  players are affected; stars and mid-roster players are not.
- Direction of the NAV effect: a higher floor raises the market price of
  minimum-salary players, which raises their contract surplus slightly. It
  would move Phase 0 fixtures only where a fixture player is priced at the floor.

**Proposed change (separate, validated).** Make the floor a dollar amount
taken from the season being priced (the 2026-27 league minimum is $850k)
rather than a fixed share, apply the same change to goalies, and update the
simulation's `capMin` / `MIN_RESERVE`. Before merging, run the Phase 0 NAV baseline and
report any fixture that moves, rather than editing a fixture to match.

## 3. "NAV trend unavailable" and "NAV range unavailable"

The compact player card prints a static line (`app/players/page.tsx`,
added by MOB-01, commit `bf7febb`). That work records that "unsupported NAV
bands, trends and ranges remain explicitly unavailable".

- **Trend.** The only history is the DATA-06 season snapshots
  (`season-snapshot.ts`). Both computable rows use the same 2025-26 statistics:
  the 2025-26 completed season, and the 2026-27 preseason baseline with 0 games
  observed. So there is no observed change in NAV to report yet. A real
  trend needs at least two snapshots from different statistical seasons under
  the same model version.
- **Range.** No calibrated NAV interval exists. The backlog requires intervals
  to be calibrated out of time before they are shown. The engine does compute
  an FMV price band (`fmvRange`), but that is a range on the market price,
  not on NAV, and it must not be shown under the NAV-range label.

**Conclusion:** both "unavailable" states are correct and should stay until the
data exists.

## 4. Docket: `2026 1st Round Pick (VGK)` shows NA today

**Cause.** A traded pick is frozen as `pick-{TEAM}-{YEAR}-{ROUND}` with
`year`, `round` and `teamId`. It stores no overall number, no original owner
separate from the listed team, and no ownership chain. "Today" is looked up by
matching that id against the current roster and pick pool (`docket-today.ts`).
The 2026 picks left the pool at the June 2026 draft, so nothing matches and the
Docket printed a bare `NA`. The frozen **+42.0 NAV at trade** is stored
separately and is unaffected.

**Why the pick cannot be resolved in code today.** Team, year and round
match more than one 2026 slot:

- `app/data/draft-2026.json` (`source: "actual"`) keeps only the first and last
  owner of each slot: #26 MTL (original DAL), #29 VGK (original COL),
  #30 CGY (original **VGK**).
- #26's chain appears only as prose in `docs/DEVNOTES.md` (2026-06-29:
  "MTL got #26 via VGK/NYR/DAL/CAR").
- The audit brief says Vegas acquired #26, traded down twice, and took Juho
  Piiparinen at #29, and Montreal used #26 on Gleb Pugachyov. The repo agrees
  on Piiparinen (a VGK entry-level contract, 2026-07-15, in `signings.csv`),
  but `app/data/draft-class-2026.json` lists Pugachyov under **BUF**. That
  contradicts both `draft-2026.json` and the brief.

A "2026 1st (VGK)" label could mean VGK's original pick (#30, used by
Calgary) or the pick Vegas held when the trade was made. The record cannot
say which, so resolving it would mean guessing.

**Change shipped (display only).** The Docket now says what it knows:
a pick from a completed draft reads **"Used at 2026 draft — selection not
linked"**, a pick not yet used reads **"Pending"**, and the frozen at-trade NAV
is unchanged. No player or NAV is inferred.

**Proposal (separate data-model work):**

1. Store pick identity in trade snapshots: draft year, round, original
   owner, owner at trade, conditions, and overall number once known.
2. Add a sourced draft-results table (slot → full ownership chain → selected
   player id), built from the NHL draft-picks endpoint by a script and not
   typed in by hand. Correct `draft-class-2026.json` against it.
3. Resolve a traded pick by following its chain. Show the selected player
   separately from the pick's frozen value, and show a current NAV only where
   the valuation model supports that player (prospect pedigree NAV exists via
   `draftOverall`). Anything unresolved stays explicitly pending.

This needs a schema migration and a backfill of existing trade records, so it is
out of scope for a display fix.
