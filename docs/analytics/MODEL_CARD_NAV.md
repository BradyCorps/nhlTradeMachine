# Model Card — F-NAV, D-NAV, G-NAV (X-NAV 4.2)

Updated 2026-09-03. Production paths in `app/lib/xnav-engine.ts`; the
raw-asset boundary is `app/lib/asset-nav.ts` (`calculateAssetNAV`), which
normalises positions (L/R/LW/RW → W, PICK → Pick) and attaches the
content-addressed valuation snapshot. Numbers shown to users come from
`stages`, the signed accounting identity (`app/lib/nav-breakdown.ts`).

## Dispatch (`calcNAV`)

```text
Pick                                        → calcPickNAV
skater with pedigree (draftOverall & age≤22, or prospectPtsPace>0)
    games < 14                              → calcProspectNAV          (fixed 2026-09-03: no longer gated on hasLiveStats)
    14 ≤ games < 60                         → blend(prospect, skaterByPosition, w=(games−14)/46)
G                                           → calcGoalieNAV
D                                           → calcDefenseNAV (= calcSkaterNAV, D branch)
C, W                                        → calcForwardNAV (= calcSkaterNAV, forward branch)
then applyHistoricalPedigreeFloor, applyTradeRequestDiscount
```

Units: NAV points (dimensionless asset value, ~0 = replacement, ≥160 =
franchise threshold). Contract inputs in $M; cap growth uses the announced
104.0 → 113.5 → 123.0 ceilings (`capGrowthFactor`), then 5%/yr.

## F-NAV / D-NAV (`calcSkaterNAV`)

```text
confidence     = clamp(games/65, 0.3, 1)
blendedPts     = currentSeasonWeight(games)·ptsPace + (1−w)·baselinePtsPace          (multi-season prior)
offTotal       = f(blendedPts, xG pace, OPS, PP production, archetype)                (forward exponent 1.6, D 1.1; D pts scaled 0.75)
defTotal (D)   = fittedDefenseValue  when xgaRelTM & corsiAgainstRel present:
                   z_xga = (xgaRelTM − (−0.0312))/0.5077 ; z_cor = (corsiAgainstRel − 1.4333)/8.4682
                   skillRaw = −(0.0799·z_xga + 0.1411·z_cor)                          (both weights positive → value is the negation)
                   shrunk   = skillRaw · n/(n+41.76)                                   (k from measured YoY stability r=0.663)
                   composite= shrunk/0.1119 + 0.35·(qocIndex−56.92)/17.43              (deployment credit, never penalty)
                   defTotal = clamp(35.9 + 21.82·(composite − 0.0244), −40, 140)
defTotal (else)= legacy DPS/xGA blend, Larry Robinson asymptote above 80 (→150)
ageTotal       = age-curve adjustment (peak 26 F / 27 D)
gravTotal      = clamp(v3 navResidual·45, −20, 20)  ONLY if GRAVITY_V3_XNAV_ENABLED (default 0)
trueMarketValue= offTotal + defTotal + ageTotal + gravTotal
capTotal       = surplus vs fitted FMV over contract years (announced cap growth) + team control + retention
rawTotal       = (trueMarketValue + capTotal) · multiplier · positionalPremium
discounted     = rawTotal · developmentDiscount
floored        = max(discounted, franchiseFloor)   franchiseFloor: F ≥40 GP & (pts≥80 | OPS≥5.0): base 180/220/260 by age + slope
                                                    D ≥40 GP & (pts≥65 | OPS≥4.0) & TOI>22: base 160/200/240 + slope
                                                    shutdown top-pair D (TOI≥22, ≥40 GP, signal>0): 130 + clamp(…,0,20)
total          = credibility regression of `floored` toward replacement on thin samples
stages         = [off, def, age, grav, cap, multiplier, positional, development, franchiseFloor, credibility]  Σ = total
```

**Data requirements.** MoneyPuck all-situations season line (2025-26),
multi-season baselines (`skater-prior.ts`), on-ice-minus-off-ice
`xgaRelTM` / `corsiAgainstRel` (damped by `min(1, games/30)` in
`roster-assembly.ts`), `qocIndex`, contract ledger (cap hit, term, extension,
retention, NMC/NTC), age/birth date.

**Missing-value semantics.** `ptsPace`, `xGPace`, `defRate`, `ops`, `dps`
absent → treated as 0 (`safe(x ?? 0)`). `xgaRelTM`/`corsiAgainstRel` null →
legacy defensive path (NOT the fitted path with zeros; pinned by test).
`qocIndex` null → fit mean. `games` undefined → 0 (thin-sample regression
applies).

**Validation evidence.**
- D-NAV fitted model: `scripts/backtest/defense-model-individual-fit.ts`,
  frozen on 2022-24, evaluated once on the 2024→25 holdout: r=−0.328,
  sign-consistent (−0.44/−0.43/−0.33), YoY stability r=0.663. Same-season
  population check (2025-26, n=239): QoC correlation −0.72 → +0.07, first-pair
  +11.8 above depth, no 20-GP cliff. **Out-of-time: yes (holdout).**
- F-NAV: NAV-03 adversarial audit on the 2025-26 population: total vs pts/82
  r=0.95, vs xG/82 0.81, QoC +0.49, steps ≤9 at the 30/60 GP thresholds.
  FMV band = walk-forward error of the FMV fit (`fmv-backtest.ts`).
  **Out-of-time: no — these are same-season associations plus a
  walk-forward price band, not a forecast test of the total.**
- Team-level ΣD-NAV vs GA/game is a labelled diagnostic, not a gate
  (`position-nav-backtest.ts`).

**Known limitations and discontinuities.**
1. Franchise floor and shutdown-D floor are threshold product rules; a
   forward crossing OPS 5.0 at ≥40 GP or a D crossing the shutdown gate can
   move ~50 points on the qualifying unit. Deliberate ("blockbuster
   required"); recorded, not changed.
2. **Shutdown-D floor masks the fitted D signal at heavy usage**: at 22
   min / DPS 4 / QoC 60, `xgaRelTM` +1.0 and −0.5 both read 134
   (`nav-integrity.test.ts` pins this). The floor is keyed on deployment,
   the signal NAV-02 removed from the model. Needs its own evidence gate.
3. Prospect transition (fixed this sprint): below 14 GP any drafted
   prospect is pedigree-valued regardless of `hasLiveStats`, matching the
   blend's weight 0 at 14 GP. Before: 3rd-overall rookie 36 → 240 on one
   game; after: 240 → 240, worst step through 70 GP < 15.
4. GRAV is 0 in production; the v3 handoff is flag-gated off.

## G-NAV (`calcGoalieNAV`)

```text
gamesG        = max(1, gamesStarted ?? games)
confidenceG   = min(1, (gamesG/60)^1.4)
workTier      = 0 at ≤30 GP → 1 at ≥52 GP (linear)                       continuous; replaces backup/tandem/starter steps
perGameCap    = lerp(workTier, 0.22, 0.35, 0.48);  gsaxPerGame capped above only
defCorrection = clamp(0.40·(teamXga60 − 2.92) + clamp(0.18·(teamHdca60/12 − 1), −0.10, 0.20), −0.18, 0.30)
gsaxPer60     = (gsaxPerGameCapped + defCorrection)·60
starterCap    = baseline ? (age≤26 ? 0.62 : 0.68) : (age≤26 ? 0.75 : 0.80)
confidenceAdj = min(confidenceG, lerp(workTier, 1, (1+starterCap)/2, starterCap))
expGSAx       = gsaxPer60·confidenceAdj + baselineGsax·(1 − confidenceAdj)
ageFactor     = max(0.3, 1.05 − (age−30)^1.55·0.95/100) for age>30
hdsvAdj       = clamp((baselineHdsvPct − anchor)·600, −12, 18)          anchor 0.815 shifted by team HD rate
trueMarketValueG = (goalieImpact(expGSAx) + workloadBonus + hdsvAdj)·ageFactor
fmvTmv        = max(trueMarketValueG, lerp(workTier, 0, 30, fullStarterFloor))
rawTotal      = fmvTmv + capTotalG
floored       = youngFloor>0 ? max(rawTotal, youngFloor) : rawTotal
roleCeiling   = 35 (≤37 GP) → ramp → 60 (44–49 GP) → ramp → 250 (≥60 GP)
total         = softCeiling(floored, roleCeiling, softness 4/7/7→37)      log compression, ordering preserved
stages        = [impact, cap, youngFloor, roleCeiling]  Σ = total
```

**Data requirements.** GSAX, games started, save %, team xGA/60 and HD
chances against/60, career baseline GSAX and HD save %, age, contract.
`gsax` absent → 0 (a league-average season, documented). No FMV band
(`fmvLow/High` undefined; snapshot `uncertainty: null`).

**Validation evidence.** NAV-03 increment 2 audit on 77 goalies: cap
saturation 20 → 0, worst single-game step 190 → ~25, total vs GSAx 0.716 →
0.757, workload r 0.719; the tandem-vs-starter trade-off is pinned by test.
`goalie-stability-backtest.ts` supports the career-baseline regression
weights. **Out-of-time: no — the total has not been forecast-tested.**
Edge high-danger save data is displayed but not fed in (needs a gate).

**Limitations.** Missing GSAX = 0 GSAX; no uncertainty band; tandem
guardrail intentionally ranks an elite 45-GP goalie slightly below a
mediocre 50-GP starter (gap ~8, does not invert).

## Team aggregation

Not a model. `rosterNavByPosition` sums player totals into F/D/G; signed
total and positive-only chart total are separate fields and never share a
label. Exact identities are tested on engine output and on persisted rows.

## Interpretation boundaries

- NAV is a same-season relative asset valuation on completed 2025-26 stats
  priced against the 2026-27 ledger. It is not a 2026-27 forecast.
- Only D-NAV's defensive component has an out-of-time holdout. F-NAV and
  G-NAV rest on same-season audits, engineering invariants and the FMV
  walk-forward band. Do not describe either as forecast-validated.
- Gravity v4 never enters any NAV; v3 GRAV is off.
