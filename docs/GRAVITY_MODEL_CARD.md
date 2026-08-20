# Gravity v3 Model Card

*Cap & Crease — Player Gravity, version 3 ("Spacetime"). Last updated 2026-08-19.*

**Field label:** `MODELLED FIELD · POSITION-RELATIVE`
**Disclaimer (rendered on every surface):** *Model visualization of Gravity v3
components; not observed player-tracking data.*

This card documents what Gravity v3 is, what it is built from, how well it holds
up against evidence, and — as importantly — what it does **not** do. It exists
because a number a reader can interrogate is an instrument; a number they cannot
is a gimmick. Gravity v3's own backtests say it is a stable trait that does not
forecast a player's own results but **does** predict, out of sample, his effect on
teammates — a measure of playmaking/territorial impact on others, not a scoring
projection. This card leads with that evidence (§4, §4b).

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

This asked the wrong question — whether force forecasts a player's *own* future
on-ice result, which is sticky and redundant with the box score. The right
question is measured next.

## 4b. Teammate impact — the effect-on-others test

`scripts/backtest/gravity-teammate-impact.ts`, same 11-season panel. Physical
gravity is a mass's effect on *other* bodies, so the test target is **teammate xG
uplift, focal-excluded**: `(OnIce_F_xG − his own I_F_xG)/on-TOI − OffIce_F_xG/off-TOI`
at 5v5, per 60. `forceNoLift` rebuilds force **without** the on-off lift term that
shares the on/off split with the target, isolating the player's own-skill
contribution — the clean signal.

| Predictive: `forceNoLift_N → uplift_{N+1}` | r | full force | uplift's own persistence |
| --- | --- | --- | --- |
| Forwards | **0.42** | 0.42 | 0.47 |
| Defense | **0.25** | 0.25 | 0.35 |
| All | 0.28 | 0.27 | 0.69 |

Three things make this a real result: it **holds out of sample** against next
season's partly-different linemates; the circularity **vanishes predictively**
(cross-sectionally full force 0.55 beat forceNoLift 0.45 for forwards — that gap
was the shared on-off math; predictively they are equal, so the persistent signal
is entirely own-skill, not mechanism); and for forwards force predicts next-year
teammate uplift **nearly as well as the uplift's own autocorrelation** (0.42 vs
0.47), i.e. it captures most of the predictable part.

**Verdict (both tests together).** Gravity is a *weak* predictor of a player's own
future results (§4, redundant with the box score) but a *real, out-of-sample*
predictor of his **effect on teammates** (§4b) — strong for forwards, moderate for
defense. It is not a scoring projection; it is a measure of territorial /
playmaking effect on others, and the evidence supports it as that. This makes the
display channel well-founded, not merely defensible; the X-NAV channel still needs
its own held-out incremental test on valuation, which predicting teammate uplift
does not by itself satisfy. Residual confound: players who stay on strong teams
keep good linemates across seasons; a replacement-adjusted, focal-excluded WOWY
(v4) is the clean removal.

## 5. Limitations

- **Not a predictor of the player's OWN results.** Predicts next-season on-ice
  xGF% worse than carry-forward (0.36 < 0.43). Do not read force as a scoring
  forecast — its predictive value is for effect-on-teammates (§4b), not self.
- **Partially circular.** Force correlates 0.66 with the same-season on-ice result
  it is partly assembled from; it re-packages production/suppression you already
  see elsewhere as much as it adds to them.
- **The novel 30% is unvalidated.** The NZ transition well has no historical EDGE
  data and was untested by the backtest. Until an EDGE-era validation exists, UI
  copy must not present transition gravity as a *measured* signal.
- **Effect-on-others is now evidenced — with a confound.** The teammate-impact
  test (§4b) shows force predicts a player's out-of-sample effect on teammates
  (F r=0.42, D r=0.25), so v3 is measuring more than the player's own production.
  What remains is the team/linemate-quality confound: players who stay put keep
  good linemates, so some of the signal is roster continuity, not the player.
  Only a replacement-adjusted, focal-excluded WOWY (v4) removes it cleanly.
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

## 9. Accessibility audit (display gate 5)

Audited every surface that renders when the v3 display flag is on — the
player-page field (`GravityField`) and its heat map (`GravityHeatMap`), and the
teams-page **Team Territorial Gravity** contour and gravity leaders — against
WCAG 2.1 AA.

| Criterion | Status |
| --- | --- |
| 1.1.1 Non-text content | **Pass.** Every data SVG has `role="img"` and an `aria-label` stating the force, the three zone masses as numbers, tier/reliability, and (heat map) that warm = attack / cool = suppression. Decorative grids/icons are `aria-hidden`. |
| 1.4.1 Use of colour | **Pass.** Colour never carries meaning alone — zone masses, reliability, stability and coverage are all printed as numbers and labelled text (list/group roles), and the heat map ships a text legend plus the numeric field. |
| 2.1.1 Keyboard / 2.1.2 no trap | **Pass.** The gravity panels are non-interactive; the only control (the X-NAV chart's dimension toggle) is a native `<button>` group. Hover `title` tooltips duplicate information already in `aria-label`, so nothing is hover-only. |
| 2.3.1 / 2.3.3 Motion | **Pass.** The gravity fields have no animation. The one animated gravity-adjacent surface (the X-NAV column chart) honours `prefers-reduced-motion`. |
| 1.3.1 Info & relationships | **Pass.** Zone masses use `role="list"`/`listitem`; the reliability trio uses `role="group"`; the panel is a labelled `role="region"`. |
| 4.1.2 Name/role/value | **Pass** after this pass: the team contour's `aria-label` now names the panel title, states it is a modelled field rather than tracking data, and describes the colour encoding (previously it read as a generic "gravity heat map for <team>"). |

**Known cosmetic limitation (not a WCAG failure):** the ledger aesthetic uses 7–8px
monospace for legends and zone tags across the whole app; it is small but every
such label is duplicated in an `aria-label`, so no information depends on reading
it. Left as-is to match the site-wide design system rather than special-casing
gravity.
