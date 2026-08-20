# Gravity Release Gates

Gravity is an experimental model with three distinct public consequences. A
field visualization is a claim about presentation; changing X-NAV is a claim
about asset value; changing a simulation is a claim about team outcomes. They
must never share an activation switch.

## Current release state

| Channel | Flag | Default | Current decision |
| --- | --- | --- | --- |
| Gravity v3 public display | `NEXT_PUBLIC_GRAVITY_V3_DISPLAY_ENABLED` | Off | PL-3 complete; off pending the remaining display gates below |
| Gravity v3 X-NAV contribution | `NEXT_PUBLIC_GRAVITY_V3_XNAV_ENABLED` | Off | Off pending held-out incremental validation |
| Gravity v3 simulation contribution | `GRAVITY_V3_SIMULATION_ENABLED` | Off | Off pending held-out simulation backtesting |
| Gravity v4 runtime | `GRAVITY_V4_ENABLED` plus a source release lock | Locked off | PL-13 and PL-14 are incomplete |

Only the case-insensitive string `true` enables a v3 channel. Missing, empty,
or malformed values are off. The two `NEXT_PUBLIC_` flags are build-time client
configuration and require a new build; the simulation flag is server-only.
The v4 environment flag cannot override its source release lock.

## Independence contract

- Display may compute and render a v3 profile, but cannot alter X-NAV or a
  simulated result.
- X-NAV may consume the bounded v3 neutral-zone residual, but cannot expose a
  field or alter simulation.
- Simulation may consume its bounded v3 on-ice term, but cannot expose a field
  or alter X-NAV.
- Turning every flag off restores the public-launch baseline exactly: no GRAV
  stage value and no Gravity contribution to simulated team strength.
- Admin calibration may compute diagnostics while public channels remain off.

## Evidence required before activation

### V3 display

Items 1, 2, and 4 are satisfied. Items 3 (source permissions / attribution) and
5 (accessibility) remain required before activation:

1. **Complete:** PL-3 returns `INSUFFICIENT` rather than a tier or percentile when sample or
   coverage is inadequate.
2. **Complete:** Tiers and any percentiles are recalibrated on an authorized, documented,
   position-qualified population for the published season.
3. Source permissions and required attribution are cleared under PL-5.
4. **Complete:** The model card (`docs/GRAVITY_MODEL_CARD.md`) documents situation
   scope, input coverage, the evidence policy, the reliability index, the
   stability/prediction backtest (persistence r=0.68; predicts on-ice xGF% below
   carry-forward baseline; NZ well unvalidated), the limitations, and the
   difference between a model field and observed tracking. Its headline finding is
   surfaced to users in the methodology page's Gravity section.
5. Browser and accessibility checks cover every enabled display surface.

### V3 X-NAV contribution

All of the following are required in addition to the display evidence rules
that concern data quality:

1. Freeze the base X-NAV model, Gravity version, input snapshot, population,
   primary error metric, and acceptance tolerance before evaluating results.
2. Compare base X-NAV with base-plus-Gravity on outcomes or transactions that
   were not used to choose Gravity weights or tune X-NAV.
3. Show a material improvement on the preregistered primary metric in two
   non-overlapping held-out periods, with no position group exceeding the
   preregistered regression tolerance.
4. Publish sensitivity, missing-data, and extreme-input tests and confirm that
   direct offense and defensive suppression are not double-counted.
5. Version and fingerprint the enabled result under PL-8, publish the evidence
   in the model card under PL-9, and provide the PL-11 kill switch and monitoring.

### V3 simulation contribution

All of the following are required:

1. Freeze the base simulator, Gravity version, seasons, seeds, primary team
   outcome metrics, and acceptance tolerances before evaluation.
2. On held-out seasons, compare the base simulator with base-plus-Gravity for
   team points and playoff qualification calibration.
3. Show a material improvement on the preregistered primary metric in two
   non-overlapping periods without unacceptable position, team, or missing-data
   bias.
4. Confirm seeded reproducibility, bounded player influence, and that disabling
   the channel exactly restores the base simulation result.
5. Add monitoring and an immediate server-side kill switch under PL-11 before
   public activation.

## V4

V4 remains runtime-locked even if `GRAVITY_V4_ENABLED=true`. Its source lock may
change only after PL-13 produces an authorized fitted artifact and PL-14 proves
held-out incremental value in shadow mode. V4 must not enter X-NAV or simulation
through a v3 gate.
