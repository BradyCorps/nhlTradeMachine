# Gravity v3 Model Card

*Cap & Crease — Player Gravity, version 3 ("Spacetime"). Last updated 2026-08-19.*

**Field label:** `MODELLED FIELD · POSITION-RELATIVE`
**Disclaimer (rendered on every surface):** *Model visualization of Gravity v3
components; not observed player-tracking data.*

This card documents what Gravity v3 is, what it is built from, how well it holds
up against evidence, and — as importantly — what it does **not** do. It exists
because a number a reader can interrogate is an instrument; a number they cannot
is a gimmick. Gravity v3's own backtest says it is a stable descriptive trait
that is **not** a predictor, so this card leads with that.

---

## 1. What it is

A player is modelled as a mass distribution across hockey's three zones — the
rink is a sheet and the player curves it. Three bounded **zone masses** are the
computed quantities; total **force** is their fixed-weight sum:

| Zone mass | Meaning | Sign convention |
| --- | --- | --- |
| `m_OZ` — offensive-zone well | chance-impact and production | positive pulls play toward the opponent's net |
| `m_NZ` — neutral-zone well | transition displacement, speed, burst | positive drags play through center ice |
| `m_DZ` — defensive-zone dome | suppression and defensive role | positive repels opponent offense (good) |

```
force = 0.45·m_OZ + 0.30·m_NZ + 0.25·m_DZ        (bounded in (−1, +1))
```

Every raw input is standardized **within position** (z-scored against positional
calibration constants) before a `tanh` squash. A defenseman's masses are measured
against defensemen, a forward's against forwards. **Force describes rarity within
position; v3 makes no cross-position impact claim** and publishes no combined
league percentile.

## 2. Inputs, weights, and sources

Assembly is additive and **present-only**: a missing input contributes no term
(shrinking the estimate toward neutral) and lowers reported coverage/reliability.

| Zone | Input (inner weight) | Source |
| --- | --- | --- |
| OZ | on-off xG lift (0.40) · assists/82 (0.25) · individual xG/82 (0.20) · PP points/82 (0.15) | MoneyPuck on/off + production; NST baseline |
| NZ | EDGE zone-time displacement vs deployment (0.50) · top speed (0.25) · 20+ mph bursts (0.25) | NHL EDGE regular-season aggregates |
| DZ | on-off xGA suppression (0.45) · defensive point shares (0.35) · PK time share (0.20) | MoneyPuck on/off; derived DPS; NHL usage |

Displacement = EDGE offensive-zone time − expected OZ time given zone-start
deployment (`LEAGUE_AVG_OZ_TIME = 0.43`, adjusted by DZ start share). It is the
one input that is not production or suppression — the model's novel claim.

**Situation scope: `MIXED SITUATIONS`.** Current all-situations scoring/on-off and
DPS; 5v5 zone starts and baseline on/off (all-situations fallback); 5-on-4
production; 4-on-5 usage; and regular-season EDGE aggregates **without a
strength-state tag**. This mixing is a known limitation (§5).

## 3. Evidence policy (public eligibility)

| Gate | Threshold |
| --- | --- |
| Calculation minimum | 10 regular-season games |
| Public display minimum | 20 regular-season games |
| Weighted input coverage | ≥ 0.667 (two-thirds) |
| Position percentile population | ≥ 20 qualified same-position peers |

A profile failing games or coverage is marked **`INSUFFICIENT`** and receives no
tier or percentile — it renders nothing rather than a confident-looking guess.
Because the NZ well depends entirely on NHL EDGE inputs, coverage — and therefore
public eligibility — tracks how completely the EDGE skater capture has run.

**Reliability index** = `0.40·sampleConf + 0.40·stabilityConf + 0.20·coverageConf`,
then **capped by coverage** (no observed evidence ⇒ reliability 0). It is a 0–100
coverage/stability index, **not a probability**.

## 4. Empirical validation — the backtest

`scripts/backtest/gravity-stability-backtest.ts`, run on an 11-season MoneyPuck
panel (2015–2025, **5,722 consecutive-season pairs**, ≥20 GP both years). Force is
reconstructed through the real `computeGravity`; OZ inputs are faithful, DZ uses a
league-centered on-ice xGA/60 proxy, and **NZ is absent (no EDGE history), so
~70% of the force weight is tested.**

| Measure | Result | Reading |
| --- | --- | --- |
| **Persistence** `r(force_N, force_N+1)` | **0.68** (F 0.66 / D 0.70), steady 0.63–0.71 across all 10 folds | A genuine, stable trait — not noise. (STRAND traits sit 0.74–0.89; NAV 0.80.) |
| **Prediction** `r(force_N, xGF%_{N+1})` | **0.36** (F 0.38 / D 0.32) | Modest, positive. |
| **Baseline** `r(xGF%_N, xGF%_{N+1})` | **0.43** | Carrying a player's own prior on-ice xGF% forward predicts next season **better** than force does. |
| **Concurrent** `r(force_N, xGF%_N)` | **0.66** | A real composite, not xGF% relabeled — but substantially built from the on-ice result it is scored against. |

**Verdict:** force is a stable, position-relative *descriptor* that does **not**
beat a naive carry-forward as a *predictor* of on-ice results, and is partly
circular with the production it is built from. This is why the display channel is
defensible as a labelled visualization but the X-NAV (valuation) channel is
correctly held off pending independent, held-out incremental validation.

## 5. Limitations

- **Not a predictor.** Predicts next-season on-ice xGF% worse than carry-forward
  (0.36 < 0.43). Do not read force as a forecast.
- **Partially circular.** Force correlates 0.66 with the same-season on-ice result
  it is partly assembled from; it re-packages production/suppression you already
  see elsewhere as much as it adds to them.
- **The novel 30% is unvalidated.** The NZ transition well has no historical EDGE
  data and was untested by the backtest. Until an EDGE-era validation exists, UI
  copy must not present transition gravity as a *measured* signal.
- **Measures the player, not his effect on others.** True "gravity" is a player's
  effect on teammates (pulling defenders, opening space). v3 conflates that with
  his own production. A focal-player-excluded (WOWY) validation is the decisive
  open experiment.
- **Position-relative only.** No cross-position comparison; no combined league
  percentile.
- **Mixed situations.** EDGE aggregates carry no strength-state tag, so the field
  blends 5v5 and special teams.
- **A model field, not a tracking map.** The rink render is a visualization of the
  three composites, not observed player tracking, and carries no uncertainty
  interval (v4 adds one — §7).

## 6. Intended use / out of scope

- **In scope:** a labelled, position-relative *descriptive* view of where a player
  (or a roster, aggregated) generates territorial pull, for eyeballing style and
  identity alongside the numbers that do the valuation.
- **Out of scope:** ranking players across positions; forecasting future results;
  moving X-NAV or a simulated season (those are separate, independently gated,
  separately validated channels).

## 7. Governance & successor

Three independent, fail-closed channels — public display, an X-NAV transition
contribution, and a simulation contribution — never share a switch. See
`docs/GRAVITY_RELEASE_GATES.md`. Turning every flag off restores the
public-launch baseline exactly.

**Gravity v4** (`docs/PLAYER_GRAVITY_V4_IMPLEMENTATION_SPEC.md`) is the intended
successor and the path from "descriptor" to "measurement": teammate-only OZ xG
that **excludes the focal player's own shots** (removing the circularity in §5),
event-valued transitions (measuring NZ instead of proxying it), opponent xG
prevented, and **block-bootstrap confidence intervals** (the uncertainty that
makes a quantity measurable). It is hard-locked off until an authorized
event/shift dataset supports fitting and held-out validation.

## 8. Provenance

Inputs derive from the NHL API (rosters, usage), NHL EDGE (tracking aggregates),
MoneyPuck (public analytics, on/off), and Natural Stat Trick (baseline on/off,
pair-driver, individual xG). MoneyPuck data is credited to MoneyPuck.com. Formal
source-permission and attribution clearance (release gate PL-5) is tracked
separately and is **not** asserted complete by this card.
