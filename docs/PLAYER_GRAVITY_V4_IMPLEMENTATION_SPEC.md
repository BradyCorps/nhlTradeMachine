# Hockey Ledger Player Gravity v4

## Implementation Specification

**Status:** Proposed  
**Date:** 2026-07-24  
**Target repository:** `BradyCorps/nhlTradeMachine`  
**Primary objective:** Replace the current hand-weighted player-quality composite with an evidence-based model of indirect, territorial player impact while retaining the Hockey Ledger's three-zone gravity field and visual identity.

---

## 1. Instructions for the implementing Codex agent

Treat this document as the source of truth for the Gravity v4 migration.

### Default execution scope

If the user points Codex at this document without naming a release, implement:

1. Release A in full.
2. The Release B types, loader, validation guards, feature flag, and fixture-backed diagnostic path.
3. No fitted Release B player values unless an authorized event/shift dataset is actually available.

Do not fabricate a completed model to satisfy the document. Treat the offline fitting pipeline and production activation as a separate data-science task when the required source data is available.

Before changing code, inspect the current versions of at least:

- `app/lib/gravity.ts`
- `app/lib/gravity-rink.ts`
- `app/lib/xnav-engine.ts`
- `app/lib/trade-types.ts`
- `app/lib/card-payload.ts`
- `app/lib/roster-assembly.ts`
- `app/components/GravityField.tsx`
- `app/api/card-image/route.tsx`
- `app/api/admin/gravity-calibration/route.ts`
- `app/methodology/page.tsx`
- `app/glossary/page.tsx`
- `__tests__/gravity.test.ts`
- `__tests__/xnav.test.ts`
- `gravity.md`
- `ANALYTICS.md`

Also search the repository for every use of:

- `GravityProfile`
- `computeGravity`
- `navResidual`
- `partnerIndependence`
- `confidence`
- `masses`
- `grav`
- `SUPERMASSIVE`

Do not assume the names above are the only consumers.

### Implementation rules

1. Preserve the existing three-zone rink visualization and space/gravity vocabulary.
2. Do not represent the rink lattice as a literal tracking heatmap. It is a model visualization.
3. Do not claim that the model measures defender attraction until frame-level defender locations are available.
4. Do not fabricate transition, tracking, uncertainty, or validation data.
5. Do not allow a new learned Gravity value to affect X-NAV until the validation gates in this document pass.
6. Maintain backward-compatible API fields during the migration where practical, but mark misleading legacy fields as deprecated.
7. Keep goalies and draft picks out of skater Gravity.
8. Separate rate ability from accumulated seasonal value.
9. Keep model training offline. Runtime application code should load fitted profiles, not train a league model during a request.
10. Update tests, methodology copy, glossary copy, cards, API payloads, and documentation together.

---

## 2. Executive decision

Gravity v4 must measure:

> How the expected value of play changes for the other skaters because a player is present, after controlling for teammates, opponents, deployment, game state, and team context.

The current implementation primarily measures:

> How strong a player's box-score, on/off, tracking-style, usage, and defensive indicators are relative to his position.

That current implementation is a useful player-quality composite, but it is not yet a direct measurement of hockey gravity.

The v4 migration therefore has two releases:

### Release A — Immediate accuracy patch

Implementable with the existing repository and data. It corrects misleading terminology, removes explicit X-NAV duplication, separates usage from rate skill, and makes the public claims match the actual calculation.

### Release B — Trained Territorial Gravity

An offline fitted model using shift-, event-, or possession-level data. It estimates indirect offensive impact, transition value, and defensive territorial impact in one expected-goal currency. It replaces the deterministic v3 scoring formula when validated.

### Future Release C — Tracking Gravity

A frame-level model of actual defensive attention, spacing, pressure, and rink deformation. This is blocked until licensed tracking coordinates or another legally usable equivalent are available.

---

## 3. Non-negotiable analytical principles

### 3.1 Gravity measures indirect impact

Direct production belongs in X-NAV offense and other direct-value models.

The Gravity core must not use these as positive evidence of indirect gravity:

- Points
- Goals
- Assists
- Individual expected goals
- Power-play points
- Offensive Point Shares
- The player's own shots

These may be displayed as context, used in a direct-value model, or used as control variables. They must not be counted as Gravity itself.

### 3.2 Every unit of value is assigned once

Each change in expected possession value must be assigned to one analytical bucket:

- Direct offensive value
- Offensive-zone indirect Gravity
- Neutral-zone transition Gravity
- Defensive-zone Gravity

The same event must not add full value to multiple buckets.

### 3.3 All zones use a common outcome currency

The analytical outputs must be expressed as expected goals added or prevented:

- `ozXg82`: teammate expected goals added per 82 games
- `nzXg82`: transition expected goals added per 82 games
- `dzXg82`: opponent expected goals prevented per 82 games
- `netXg82 = ozXg82 + nzXg82 + dzXg82`

The display may continue to show a bounded field force, but the bounded value is a visualization transform, not the primary analytical unit.

### 3.4 Position affects priors, not value units

Forwards and defensemen may use different priors and shrinkage distributions. Their final output must still be expected-goal impact.

A position-relative percentile measures rarity. It does not by itself establish equivalent hockey value.

### 3.5 Context is controlled inside the model

Do not multiply final player scores by hand-built QoC, deployment, or usage scalars.

Control for these factors during fitting:

- Teammates
- Opponents
- Team
- Coach/system where available
- Score state
- Strength state
- Zone start
- Shift start type
- Home ice
- Rest
- Shift duration
- Goaltender
- Season

### 3.6 Rate skill and total contribution are separate

Store both:

- Rate impact: expected-goal impact per 60 or per 82 at standardized usage
- Seasonal contribution: rate impact multiplied by actual or projected ice time

Do not make a player's per-minute quality higher merely because his coach plays him more.

### 3.7 Uncertainty is estimated

Do not label a heuristic coverage score as statistical confidence.

Gravity v4 must expose an interval derived from the fitting or resampling process:

- Posterior interval
- Bootstrap interval
- Or another documented uncertainty interval

Data coverage may be reported separately.

---

## 4. Immediate Release A changes

Release A is required before the trained v4 model is available.

### 4.1 Correct the X-NAV residual

The current Gravity residual retains assists, individual xG/goals, and power-play production even though X-NAV offense already prices closely overlapping production.

Change the v3 residual to transition only:

```ts
const navResidual = r2(W_NZ * mNz);
```

Remove `mOzResidual` from X-NAV integration.

X-NAV may continue converting the bounded residual temporarily:

```ts
gravTotal = clamp(gravity.navResidual * 45, -20, 20);
```

Revisit the multiplier during Release B. Do not increase it merely to restore previous player totals.

#### Required regression test

For two otherwise identical players:

- Changing assists pace must change the displayed v3 OZ mass.
- Changing assists pace must not change `navResidual`.
- Changing PP points must not change `navResidual`.
- Changing individual xG/goals must not change `navResidual`.
- Changing NZ inputs must change `navResidual`.

### 4.2 Rename Partner Independence

The current calculation measures agreement between current and baseline on/off values. That is stability, not linemate independence.

Add:

```ts
signalStability: number;
```

Temporarily retain:

```ts
/** @deprecated Use signalStability. */
partnerIndependence: number;
```

Return the same value in both fields during Release A to avoid breaking consumers.

Update all visible copy:

- `Partner Independence` → `Signal Stability`
- `Independent` → `Stable`
- `Likely Real` → `Mixed`
- `Borrowed?` → `Unstable`

Do not say the player borrowed impact from linemates unless the model actually evaluates linemate effects.

### 4.3 Rename Confidence

Add:

```ts
reliability: number;
```

Temporarily retain:

```ts
/** @deprecated Use reliability. This is not a calibrated probability. */
confidence: number;
```

Visible labels must use `Reliability`, not `Confidence`.

The UI may display a 0–100 reliability index, but the glossary must state that it is a model coverage/stability index and not a probability.

### 4.4 Remove rate inflation from usage and QoC

The current v3 formula multiplies every zone mass by a shared scale derived from QoC and TOI. This mixes coach usage with per-rate ability and can count deployment twice.

For Release A:

```ts
const scale = 1.0;
```

Keep QoC and TOI available as descriptive context. Do not multiply the three zone masses by them.

After removing these multipliers, rerun the league calibration report and update tier thresholds from the resulting qualified population. Do not preserve old tier counts by manually adjusting individual inputs.

If retaining a usage-aware seasonal contribution elsewhere, calculate it after the per-rate Gravity profile:

```ts
seasonContribution = rateImpact * projectedMinutes / standardMinutes;
```

### 4.5 Make missing-data behavior explicit

For every zone, record:

```ts
interface ZoneCoverage {
  presentWeight: number;
  possibleWeight: number;
  ratio: number;
  missingInputs: string[];
}
```

The current missing-input behavior effectively pulls incomplete zones toward neutral because absent terms contribute nothing to a fixed-weight sum.

Document this as:

> Missing evidence shrinks the estimate toward neutral and lowers reliability.

Do not state only that missing inputs are skipped.

### 4.6 Correct methodology claims

Replace claims that:

- Gravity directly measures defenders overcommitting.
- Partner Independence separates a player from his linemates.
- The X-NAV residual contains no duplicated offensive information.
- The formula is secret or unavailable while it remains in a public repository.
- The rink is an observed tracking map.

Approved Release A language:

> Player Gravity is a position-relative territorial influence index. It combines on-ice chance impact, transition proxies, and defensive suppression into an offensive-zone well, neutral-zone well, and defensive-zone dome. The rink field is a model visualization of those components, not a literal tracking map.

Approved X-NAV language:

> X-NAV receives only the transition portion of the current Gravity model. Direct offensive production and defensive suppression are valued elsewhere.

Approved calibration language:

> Weighting and calibration are Ledger-defined and versioned against the available league population.

### 4.7 Update the share card

The exported card must include:

- `MODELLED FIELD`
- `POSITION-RELATIVE`
- Season
- Strength state or `ALL SITUATIONS` if that is truly the source scope
- Reliability
- Data quality/coverage
- Gravity percentile

Remove duplicate tier labels when the same tier is printed more than once in the Gravity panel.

Do not imply that the warped lines are observed puck trajectories.

---

## 5. Release B target model: Territorial Gravity

### 5.1 Possession-value framework

Model hockey as movement through possession states:

```text
DZ recovery
  → controlled or failed exit
  → neutral-zone possession
  → controlled or failed entry
  → established OZ possession
  → chance, goal, stoppage, or turnover
```

Train or adopt an expected-possession-value function:

```text
V(state) = expected future goal value from the current possession state
```

For each event or state transition:

```text
deltaValue = V(nextState) - V(currentState)
```

Allocate `deltaValue` once to a direct or indirect zone component.

### 5.2 Offensive-zone well

The OZ well must estimate how much more dangerous teammates become after offensive possession is established.

Primary target:

```text
Teammate-only expected-goal rate
```

For a focal player, exclude:

- His own shots
- His individual xG
- His goals
- His direct box-score production

Control for his teammates and opponents.

Initial public-data implementation may use player-on-ice shot data:

1. Build constant-lineup stints.
2. For each focal skater in the attacking lineup, calculate xG generated by his teammates.
3. Exclude shots taken by the focal player.
4. Fit the focal-player effect while controlling for teammates, opponents, team, score, strength, zone start, and stint duration.

Target output:

```ts
ozXg60: number;
ozXg82: number;
```

Future tracking inputs may include:

- Defensive attention surplus
- Passing-lane expansion
- Teammate separation from nearest defender
- Screens
- Off-puck cuts
- Coverage rotations

Do not add these fields until the data actually exists.

### 5.3 Neutral-zone well

The NZ well must estimate expected-goal value gained through progression, not skating athleticism.

Preferred event inputs:

- Controlled exits
- Controlled entries
- Exit and entry assists
- Failed exits
- Failed entries
- Possession retained through transition
- Puck advancement
- Forecheck recoveries
- Entry denials

Each transition event must be valued by its change in expected possession value rather than assigned an arbitrary point weight.

Target outputs:

```ts
nzXg60: number;
nzXg82: number;
transitionDataQuality: "event" | "proxy" | "missing";
```

#### Proxy rule

NHL EDGE zone time, speed, and burst data may support a temporary transition proxy, but:

- Zone time is an on-ice territorial outcome and is team-influenced.
- Speed is a trait, not transition value.
- Burst totals are usage-dependent.

When only the proxy exists:

```ts
transitionDataQuality = "proxy";
```

The UI and API must identify the profile as proxy-based.

### 5.4 Defensive-zone dome

The DZ dome must estimate opponent expected-goal value prevented.

Preferred inputs:

- Opponent xG suppression after context adjustment
- Entry denials
- Failed opponent entries
- Time to establish offensive possession
- Slot-pass prevention
- Central-lane access removed
- Possession recoveries
- Controlled exits following recovery
- Pressure leading to turnovers

Do not use these as primary performance inputs:

- PK time share
- Coach deployment
- Defensive Point Shares

They may be displayed as role context or used as controls.

Target outputs:

```ts
dzXg60: number;
dzXg82: number;
```

Positive `dzXg82` means expected goals prevented.

### 5.5 Net force

All three zones must already be expressed in expected-goal units:

```ts
netXg82 = ozXg82 + nzXg82 + dzXg82;
```

Do not apply fixed 45/30/25 weights.

If validation later shows that a conversion is required, learn it from held-out outcome data and document the target, training period, and coefficients.

---

## 6. Fitting strategy

### 6.1 Preferred model

Use one of:

- Regularized adjusted plus-minus style ridge regression
- Hierarchical Bayesian regression
- Another regularized model with equivalent context controls and uncertainty estimates

The first production implementation should favor interpretability over unnecessary algorithmic complexity.

### 6.2 Simplified model form

For zone `z` and stint or possession `s`:

```text
target(s, z)
  = intercept(z)
  + offensive player effects
  + defensive player effects
  + teammate/opponent context
  + game-state controls
  + error
```

Player coefficients become zone estimates.

### 6.3 Position priors

Use separate forward and defenseman priors if needed for shrinkage:

```text
theta_forward ~ position prior F
theta_defense ~ position prior D
```

Convert both to expected-goal impact before combining.

Do not force equal z-scores to represent equal value.

### 6.4 Strength states

Initial production scope should be:

```text
5v5 regular-season play
```

Keep these separate:

- Power play
- Penalty kill
- Empty net
- Three-on-three
- Playoffs, unless intentionally included

Do not blend PP points into a 5v5 OZ estimate.

Add special-teams Gravity only as separately fitted components.

### 6.5 Small samples

Use shrinkage rather than hard volatility:

- Established sample: fitted estimate with narrower interval
- Limited sample: estimate pulled toward position prior with wider interval
- Insufficient sample: no public tier

Recommended initial display thresholds:

```text
<150 5v5 minutes: insufficient
150–300 minutes: low reliability
300–600 minutes: medium reliability
>600 minutes: sample component may qualify as high reliability
```

These thresholds affect display and prior strength. They do not replace model-derived uncertainty.

### 6.6 Uncertainty

Use at least one:

- Block bootstrap by game
- Player-cluster bootstrap
- Posterior credible interval

Do not bootstrap individual events independently when within-game observations are correlated.

Store a 90% interval for each zone and net value.

---

## 7. Gravity v4 data contracts

Create a versioned type rather than silently changing the meaning of v3 fields.

Suggested file:

```text
app/lib/gravity-v4/types.ts
```

Suggested contract:

```ts
export type GravityDataQuality = "full" | "proxy" | "partial" | "insufficient";
export type GravityReliabilityBand = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export interface GravityInterval {
  low: number;
  high: number;
  level: 0.9;
}

export interface GravityZoneEstimate {
  xg60: number;
  xg82: number;
  interval: GravityInterval | null;
  positionPercentile: number | null;
  leaguePercentile: number | null;
  dataQuality: GravityDataQuality;
  sampleMinutes: number;
}

export interface GravityModelMetadata {
  modelVersion: "4.0";
  trainedAt: string;
  trainingSeasons: string[];
  targetSeason: string;
  strengthState: "5v5";
  sourceVersion: string;
}

export interface GravityProfileV4 {
  playerId: string;
  playerName: string;
  position: "C" | "W" | "D";
  season: string;

  zones: {
    oz: GravityZoneEstimate;
    nz: GravityZoneEstimate;
    dz: GravityZoneEstimate;
  };

  netXg60: number;
  netXg82: number;
  netInterval: GravityInterval | null;

  seasonContributionXg: number;
  displayForce: number;
  displayMasses: {
    oz: number;
    nz: number;
    dz: number;
  };

  tier: GravityTier;
  reliability: GravityReliabilityBand;
  portability: number | null;
  portabilityLabel: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

  dataQuality: GravityDataQuality;
  metadata: GravityModelMetadata;
}
```

### Runtime storage

The offline pipeline should write versioned fitted results, for example:

```text
app/data/gravity/v4/2025-26-5v5.json
```

Do not overwrite v3 calibration data.

Suggested runtime loader:

```text
app/lib/gravity-v4/load-profile.ts
```

Use the repository's existing feature-flag convention when one exists. Otherwise add a server-side flag such as:

```text
GRAVITY_V4_ENABLED=false
```

The default must remain `false` until the Release B public-model acceptance criteria pass.

Runtime behavior:

1. Look up by stable NHL player ID.
2. Verify model version and season.
3. Return the fitted profile.
4. If no valid v4 profile exists, return a clearly marked v3 fallback or `null`.
5. Never silently label a v3 fallback as v4.

---

## 8. Display mapping

### 8.1 Preserve analytical values

Never store only a bounded `-1` to `+1` score.

Store net and zone expected-goal values first.

### 8.2 Derive visual masses

The rink may continue using bounded masses:

```ts
displayMass = Math.tanh(zoneXg82 / zoneVisualScale);
```

Derive `zoneVisualScale` from a documented league distribution, such as the absolute 95th percentile of qualified estimates. Store the chosen scale with model metadata.

### 8.3 Derive display force

```ts
displayForce = Math.tanh(netXg82 / netVisualScale);
```

The card must show the interpretable value beside it:

```text
+7.2 net xG / 82
+0.65 field force
```

### 8.4 Tiers

Tiers should be derived from league-wide `netXg82` percentiles among qualified skaters:

```text
SUPERMASSIVE: top 2%
STAR: next 6%
MAIN_SEQUENCE: next 12%
SATELLITE: next 20%
ASTEROID: middle range
BLACK_HOLE: bottom 3%
```

Persist the actual season-specific cutoffs with the model artifact.

Do not assert that fixed force cutoffs equal these percentiles without checking the population.

---

## 9. Portability model

Do not recreate `partnerIndependence` under a new name.

Portability asks whether the isolated player effect persists across different contexts:

- Linemates
- Defensive partners
- Teams
- Coaches
- Seasons

Preferred implementation:

```text
player main effect
+ player × linemate interaction
+ player × team/system interaction
```

High portability means the player main effect remains positive while interaction dependence is limited.

Until this model exists:

```ts
portability = null;
portabilityLabel = "UNKNOWN";
```

Do not infer portability solely from year-over-year agreement.

---

## 10. X-NAV integration

### 10.1 Release A

Use only the transition residual:

```ts
navResidual = W_NZ * mNz;
```

### 10.2 Release B gating

Do not directly add `netXg82` to X-NAV merely because it is available.

First estimate whether Gravity adds information beyond existing direct-value features.

Use cross-fitting or an equivalent held-out procedure:

```text
directFeatures = existing X-NAV offense and defense inputs
gravityFeatures = OZ, NZ, and DZ v4 estimates
target = future isolated on-ice value or another declared hockey-value outcome
```

Conceptual orthogonalization:

```text
residualOutcome = target - crossFittedPrediction(directFeatures)
residualGravity = gravityFeatures - crossFittedPrediction(gravityFeatures from directFeatures)
fit residualOutcome from residualGravity
```

Only the held-out incremental Gravity contribution may enter X-NAV.

### 10.3 Required X-NAV evidence

Before enabling v4 Gravity in X-NAV:

- Base X-NAV/direct model results must be recorded.
- Base plus Gravity results must be recorded.
- Gravity must improve held-out performance in at least two non-overlapping test periods.
- The improvement and uncertainty must be documented.
- The integration coefficient must come from the validated model, not UI target matching.

Until then, expose v4 Gravity as a diagnostic/player-analysis panel only.

---

## 11. Offline pipeline

Suggested structure:

```text
scripts/gravity-v4/
  README.md
  build-stints.*
  build-possession-states.*
  fit-oz-model.*
  fit-nz-model.*
  fit-dz-model.*
  bootstrap-estimates.*
  validate-model.*
  export-profiles.*
```

Use the repository's existing language and dependency conventions where reasonable. A Python fitting script is acceptable if the repository documents its environment and the application consumes only generated JSON.

### Pipeline requirements

1. Inputs are immutable or versioned.
2. Intermediate rows include season, game, strength state, and source identifiers.
3. Train/test season boundaries are explicit.
4. Player identity uses stable NHL IDs, not names.
5. Source coverage and rejected rows are reported.
6. Model settings and regularization parameters are persisted.
7. Generated artifacts include a schema version.
8. The application does not depend on the training environment at runtime.
9. The export process is deterministic for the same inputs and seed.

---

## 12. Validation plan

Create a machine-readable validation report and a concise Markdown summary.

Suggested outputs:

```text
app/data/gravity/v4/validation.json
docs/analytics/GRAVITY_V4_VALIDATION.md
```

### 12.1 Required validation categories

#### Held-out prediction

Train on earlier seasons and evaluate a season not used for fitting or tuning.

Report:

- RMSE or another declared continuous error measure
- Rank correlation
- Calibration by predicted decile
- Base model versus base plus Gravity

#### Year-over-year stability

Report Pearson and Spearman relationships for:

- OZ
- NZ
- DZ
- Net Gravity

Do not present stability as proof of accuracy.

#### Portability

Evaluate players who:

- Changed teams
- Changed primary linemates
- Changed defensive partners
- Experienced major role changes

Test whether the isolated effect follows the player.

#### Distinctiveness

Report correlations with:

- Points
- Goals
- Assists
- Individual xG
- Existing X-NAV OFF
- Existing X-NAV DEF
- Available RAPM or isolated-impact benchmark

Gravity should add information beyond direct production. A near-perfect correlation with existing offense indicates repackaging.

#### Sensitivity

Report how estimates change when:

- A season is removed
- Regularization changes
- Minimum-minute thresholds change
- One upstream source is unavailable
- Proxy NZ data is excluded

### 12.2 Validation gates

Gravity v4 may replace v3 publicly when:

- The pipeline runs reproducibly.
- Every public profile includes model version and data quality.
- Held-out results are documented.
- No known identity leakage exists between training and test rows.
- Intervals widen appropriately for small samples.
- Proxy transition data is visibly identified.

Gravity v4 may affect X-NAV only after the additional gates in Section 10 pass.

---

## 13. Testing requirements

### Unit tests

Add tests for:

- Net value equals the sum of three zone values.
- Display transforms remain bounded.
- Analytical values remain unbounded and are not overwritten by display values.
- Goalies and picks return `null`.
- Insufficient samples do not receive confident tiers.
- Missing v4 profile is marked as fallback or missing.
- Season/model version mismatches are rejected.
- Positive DZ values mean value prevented.
- Direct offensive-stat changes do not alter the Release A X-NAV residual.

### Integration tests

Add tests for:

- Profile loader → player page.
- Profile loader → card payload.
- Profile loader → share-card image route.
- V3 fallback copy is not labeled v4.
- Methodology/glossary terminology is consistent.
- X-NAV ignores unvalidated v4 values.

### Data canaries

Canary players may verify pipeline continuity, but they must not encode the required leaderboard order.

Good canary assertions:

- Profile exists for a qualified player.
- Values are finite.
- Intervals are ordered.
- Metadata matches the target season.
- A known insufficient sample is marked insufficient.

Avoid:

- “Player X must always rank above Player Y.”
- Tuning constants until famous players match subjective expectations.

---

## 14. UI and documentation requirements

### Gravity panel

Display:

- Net xG impact per 82
- Bounded field force
- OZ/NZ/DZ expected-goal components
- Tier
- Reliability band
- 90% interval
- Data quality
- Season
- Strength state
- Position percentile
- League percentile when qualified

### Terminology

Use:

- `Modelled Field`
- `Territorial Gravity`
- `Signal Stability` for the Release A legacy heuristic
- `Portability` only for the fitted portability model
- `Reliability`
- `90% interval`
- `Transition proxy` when applicable

Avoid:

- `Partner Independence` without partner modeling
- `Confidence 93%` without a calibrated probability
- `Defenders overcommit` without tracking
- `Nothing is counted twice` without validated orthogonalization
- `Proprietary formula` while the formula is public

### Required explanation

Include this concept in the methodology:

> The field is a model visualization, not an observed player-tracking heatmap. Positive wells and domes represent estimated expected-goal impact in each phase of play.

---

## 15. Proposed file migration

The implementing agent may adjust paths after repository inspection, but the separation of concerns should remain.

### Keep

- `app/lib/gravity-rink.ts`
  - Adapt it to consume v4 display masses.
  - Do not make it responsible for analytics.

- `app/components/GravityField.tsx`
  - Adapt labels and v4 values.
  - Support explicit v3 fallback rendering.

### Deprecate

- `app/lib/gravity.ts`
  - Keep as `Gravity v3` during migration.
  - Apply Release A corrections.
  - Do not silently redefine it as the learned v4 model.

### Add

```text
app/lib/gravity-v4/types.ts
app/lib/gravity-v4/load-profile.ts
app/lib/gravity-v4/display.ts
app/lib/gravity-v4/validate-profile.ts
app/data/gravity/v4/
scripts/gravity-v4/
docs/analytics/GRAVITY_V4_VALIDATION.md
```

### Update consumers

- Player detail pages
- Asset cards
- Card payload
- Card image route
- Methodology
- Glossary
- X-NAV engine
- Simulator only after separate review
- Admin diagnostics
- Tests

---

## 16. Acceptance criteria by release

### Release A acceptance criteria

- [ ] `navResidual` depends only on the NZ mass.
- [ ] Direct offensive inputs cannot change X-NAV GRAV when NZ inputs are fixed.
- [ ] `Partner Independence` is no longer visible to users.
- [ ] `Signal Stability` is described accurately.
- [ ] `Confidence` is no longer visible as a probability.
- [ ] QoC and TOI no longer multiply per-rate zone masses.
- [ ] Missing-data shrinkage is documented.
- [ ] The card says `MODELLED FIELD`.
- [ ] Season, situation, reliability, and coverage are visible.
- [ ] Methodology and glossary no longer make unsupported tracking claims.
- [ ] Existing tests are updated and the full relevant suite passes.

### Release B infrastructure acceptance criteria

- [ ] Versioned v4 types exist.
- [ ] Runtime loader rejects invalid season/model combinations.
- [ ] Offline pipeline uses stable NHL player IDs.
- [ ] OZ target excludes the focal player's direct offense.
- [ ] NZ reports event, proxy, or missing quality.
- [ ] DZ output is in expected goals prevented.
- [ ] All zones share expected-goal units.
- [ ] Net value is the unweighted sum of zone values.
- [ ] Uncertainty intervals are generated.
- [ ] Fitted artifacts include source/model metadata.
- [ ] Player pages can render v4 without changing X-NAV.
- [ ] V3 fallback is visibly identified.

### Release B public-model acceptance criteria

- [ ] Held-out validation is published.
- [ ] Calibration by decile is reported.
- [ ] Year-over-year stability is reported.
- [ ] Direct-stat correlations are reported.
- [ ] Proxy transition profiles are labeled.
- [ ] Famous-player ordering was not used as a training objective.
- [ ] The model is reproducible from documented inputs.

### X-NAV activation acceptance criteria

- [ ] Gravity improves held-out performance beyond direct X-NAV inputs.
- [ ] Improvement occurs in at least two non-overlapping test periods.
- [ ] Incremental coefficients are learned, not hand-selected.
- [ ] The validation report records the base and augmented models.
- [ ] A feature flag controls activation.
- [ ] Tests verify that disabling the flag restores the base result.

---

## 17. Explicit non-goals

Do not:

- Build a fake frame-level tracking model from aggregate NHL EDGE fields.
- Infer defender assignments from speed alone.
- Treat zone time as individual puck-carry distance.
- Treat coach trust as defensive performance.
- Force the output into the previous X-NAV totals.
- Tune the model to make specific stars rank first.
- Claim causal certainty from observational data.
- Mix power-play production into a 5v5 model.
- Call a reliability heuristic a probability.
- Remove v3 before v4 profiles and fallbacks are verified.

---

## 18. Recommended implementation sequence

1. Apply Release A terminology and X-NAV residual corrections.
2. Update tests and public copy.
3. Add v4 types, loader, validation, and feature flag.
4. Build a diagnostic-only fitted-profile path using fixture data.
5. Build the offline OZ teammate-impact pipeline.
6. Build the DZ opponent-impact pipeline.
7. Add NZ proxy metadata without overstating it.
8. Add real transition events when an authorized source is available.
9. Generate uncertainty and model metadata.
10. Run held-out validation.
11. Render v4 profiles publicly behind the feature flag.
12. Keep X-NAV on the Release A transition-only residual.
13. Evaluate incremental X-NAV value.
14. Activate learned X-NAV Gravity only if its validation gates pass.
15. Pursue frame-level Tracking Gravity as a separate future project.

---

## 19. Definition of the finished model

Player Gravity v4 is complete when a user can read:

```text
OZ well:  +3.1 teammate xG created / 82
NZ well:  +2.4 transition xG created / 82
DZ dome:  +1.7 opponent xG prevented / 82
Net:      +7.2 xG / 82
90% interval: +4.8 to +9.1
Reliability: High
Data: 5v5 · 2025-26 · full OZ/DZ · transition proxy
```

The warped rink is then generated from those three zone estimates.

At that point, the metaphor, number, and picture describe the same underlying object without claiming data the model does not possess.
