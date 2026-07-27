# Gravity — position calibration study (2026-07-27)

**Question.** Gravity v3 z-scores every input against the player's own position.
Does a defenseman at force *x* and a forward at force *x* deliver the same
impact? If not, the scale measures *rarity within position*, not comparable
influence — and a cross-position leaderboard is misleading.

**Answer.** Defensemen do appear over-credited on the raw scale, but roughly
**three quarters of that gap is deployment, not model bias**. Once even a crude
deployment control is applied the effect mostly disappears. **No positional
offset should be applied to v3.**

---

## 1. Motivation

The live calibration route (`/api/admin/gravity-calibration`, 663 qualified
skaters, 2025-26) returns a well-shaped force distribution under the existing
tier cutoffs:

| Tier | Count | Share |
| --- | ---: | ---: |
| SUPERMASSIVE | 7 | 1.1% |
| STAR | 33 | 5.0% |
| MAIN_SEQUENCE | 135 | 20.4% |
| SATELLITE | 193 | 29.1% |
| ASTEROID | 283 | 42.7% |
| BLACK_HOLE | 12 | 1.8% |

Cutoffs are healthy. The concern is *composition*: defensemen are ~34% of the
qualified population but **12 of the top 25 (48%)** and **4 of 7 SUPERMASSIVE
(57%)**. Lane Hutson ranks first overall (0.63); Connor McDavid ranks fifth
(0.57).

The mechanism is visible in the route's own `suggestedCal`. Two players with
**identical raw production** score very differently by position:

| Input | F mean / sd | D mean / sd | Raw value | z as F | z as D | Swing |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Individual xG/82 | 18.41 / 8.45 | 5.80 / 3.32 | 12.0 | −0.76 | **+1.87** | **2.63σ** |
| On-off lift | +0.90 / 5.34 | −1.59 / 4.56 | 0.0 | −0.17 | **+0.35** | 0.52σ |

Individual xG carries 0.20 weight inside the OZ well, and OZ is 45% of force —
so that 2.63σ swing is worth roughly **0.24 force units** on a scale whose
observed max is 0.63.

---

## 2. Method

- **Population:** 2025-26 MoneyPuck skater summary, `situation = all`, ≥20 GP →
  **715 skaters (476 F / 239 D)**. (The live route reports 663; the difference is
  roster-assembly filtering and is not material to the fit.)
- **Predictor:** Gravity force from the production `computeGravity`.
- **Outcome:** **on-ice goal differential per 60.** Chosen deliberately — the
  model consumes *expected*-goal inputs (`xgRelTM`, `baselineIxg82`, `xgaRelTM`),
  so using on-ice **goals** keeps the outcome from being a restatement of an
  input.
- **Weighting:** TOI-weighted OLS, so regulars drive the fit rather than 20-game
  call-ups.
- **Fit separately for F and D**, then compare predicted outcome at equal force.

### Known limitations

1. **EDGE inputs are unavailable offline**, so the neutral-zone well (~30% of
   force weight) is absent. Direction is reliable; magnitude is not.
2. **The force↔outcome correlation is inflated by circularity.** `xgRelTM` is a
   model input and is mechanically related to on-ice results. The reported
   r ≈ 0.80 must **not** be read as "Gravity predicts goal differential."
3. **Goals are noisy** and carry goaltending and teammate effects.

This is a calibration study, not a validation.

---

## 3. Result A — the uncontrolled fit

| Group | n | slope | intercept | r |
| --- | ---: | ---: | ---: | ---: |
| F | 476 | 8.133 | −0.557 | 0.807 |
| D | 239 | 5.697 | −0.169 | 0.773 |

Predicted on-ice GD/60 at equal force:

| force | F | D | gap (F−D) |
| ---: | ---: | ---: | ---: |
| 0.0 | −0.557 | −0.169 | −0.388 |
| 0.2 | +1.069 | +0.971 | +0.099 |
| 0.4 | +2.696 | +2.110 | **+0.586** |
| 0.6 | +4.323 | +3.250 | **+1.073** |

Read naively: at the top of the scale a forward is worth ~0.6–1.1 more goals per
60 than a defenseman at the same force. The gap **widens with force**, so the
correct functional form is a linear transform, not a flat offset:

```
x_adj(D) = 0.700 × force + 0.048
```

### Why that transform is wrong

Applying it to the real top-25 produces:

| Rank | Player | adj | raw |
| ---: | --- | ---: | ---: |
| 1 | Nick Suzuki (F) | 0.580 | 0.58 |
| 2 | Connor McDavid (F) | 0.570 | 0.57 |
| 8 | Lane Hutson (D) | 0.489 | 0.63 |
| … | | | |
| 23 | Erik Karlsson (D) | 0.370 | 0.46 |
| **24** | **Cale Makar (D)** | **0.363** | 0.45 |

Cale Makar falling to 24th — behind Clayton Keller — is not a defensible
outcome. The correction is doing something wrong.

---

## 4. Result B — the confound

Defensemen do not play the same minutes as forwards:

| | F | D |
| --- | ---: | ---: |
| Mean on-ice GD/60 | **+0.322** | **−0.234** |
| Mean d-zone start share | 44.8% | **57.0%** |

Refitting with a deployment control — `GD/60 ~ force + dzStart%` — per position:

| Group | force coef | dzStart coef |
| --- | ---: | ---: |
| F | 6.391 | −1.988 |
| D | 5.153 | −0.885 |

Predicted gap **at league-average deployment**:

| force | F | D | gap |
| ---: | ---: | ---: | ---: |
| 0.4 | 2.092 | 1.952 | **+0.140** |
| 0.5 | 2.732 | 2.467 | **+0.264** |

**Controlling for a single crude deployment variable removes ~76% of the
positional gap (0.586 → 0.140 at force 0.4).**

The naive fit was largely measuring *"defensemen start in their own end"* and
mislabelling it *"the model over-credits defensemen."* That is precisely why the
transform pushed Makar to 24th: it encoded his deployment disadvantage as
position bias.

---

## 5. Conclusions

1. **Do not apply a positional offset to Gravity v3.** The supported effect size
   after deployment control is small, rests on one crude covariate, and the
   uncontrolled version actively degrades the leaderboard.
2. **Keep the current tier cutoffs.** The live distribution is well-shaped; the
   route's `suggestedTiers` would loosen SUPERMASSIVE from 1.1% to ~2%.
3. **If a correction is ever wanted**, the deployment-controlled figure is
   ~**0.05** force units, not ~0.15. That leaves Makar comfortably STAR and moves
   Hutson from 1st to ~2nd. It is a display tweak, not a finding.
4. **McDavid's rank is not primarily a position artifact.** His zone masses are
   OZ 0.75 / NZ 0.53 / **DZ 0.29** versus Suzuki's 0.67 / 0.48 / **0.51**. He
   leads the league in OZ *and* NZ and is held down by the fixed **25% DZ
   weight** — an arbitrary-weight problem, not a normalization problem.

## 6. Why season aggregates cannot settle this

The study's real finding is methodological. Separating **position** from
**deployment** from **teammate quality** requires all three in one model.
Season-aggregate inputs have already averaged that variation away, so the
information needed to separate the effects is destroyed before the fit begins.
Adding covariates to an aggregate regression cannot recover it.

This is the argument for the v4 design:

- Observations at **shift / possession** level, not season level.
- Teammates, opponents, score state, strength, zone start and rest as **model
  terms**, not post-hoc corrections.
- Position enters as a **shrinkage prior**, not as the output currency.
- Output in **common expected-goal units** so cross-position comparison is
  meaningful by construction.
- **Uncertainty intervals** from resampling rather than a heuristic confidence
  score.

Until that exists, Gravity v3 should be presented as what it is: a
**position-relative territorial influence index**, with cross-position ordering
treated as indicative rather than settled.

---

## 7. Reproduction

Scripts are exploratory (not committed): TOI-weighted OLS over the committed
`MoneyPuckData/2025_26/skaters.csv` plus `app/data/moneypuck_baselines.json`,
calling the production `computeGravity`. The live force distribution and tier
counts come from `/api/admin/gravity-calibration` (admin-authed), captured
2026-07-27.
