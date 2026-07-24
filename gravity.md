# Player Gravity

## Current production model: Gravity v3

Player Gravity v3 is a position-relative territorial influence index. It combines on-ice chance impact, transition proxies, and defensive suppression into three bounded components:

- **OZ well** — a fixed-weight composite of on-ice lift, assist pace, individual xG/goals pace, and power-play points.
- **NZ well** — a transition proxy from NHL EDGE zone-time displacement, top speed, and 20+ mph burst rate.
- **DZ dome** — a fixed-weight composite of xGA suppression, Defensive Point Shares, and penalty-kill time share.

The rink lattice is a model visualization of those components. It is not an observed tracking heatmap, a map of puck trajectories, or a measurement of defender attention.

Every present input is standardized against the current forward or defense calibration and each raw zone composite is transformed with:

```text
display mass = tanh(raw zone composite / 2.75)
```

The bounded v3 field force remains:

```text
force = 0.45 · OZ + 0.30 · NZ + 0.25 · DZ
```

This force is a display/index currency, not expected goals. Position-relative rarity does not establish equal hockey value across positions.

### Rate ability and deployment

QoC and average TOI remain available as descriptive context, but they do not multiply any v3 zone mass:

```text
scale = 1.0
```

This keeps coach usage from inflating per-rate ability. A future usage-aware seasonal contribution must be calculated after the rate profile rather than folded into the zone masses.

### Situation provenance

Gravity v3 is labelled `MIXED SITUATIONS`. Its inputs do not share one strength state:

- current scoring pace and current on/off values come from all-situations MoneyPuck rows;
- defensive-zone start share comes from 5v5 MoneyPuck rows;
- the multi-season on/off baseline prefers 5v5 and falls back to all situations when a 5v5 row is absent;
- the individual-xG baseline uses Natural Stat Trick all-situations skater totals;
- power-play production is 5-on-4 and penalty-kill usage is 4-on-5;
- Defensive Point Shares use current regular-season NHL summary totals;
- NHL EDGE zone-time, speed, and burst aggregates are regular-season detail fields without a strength-state tag.

The public UI and exported card must not simplify this provenance to `ALL SITUATIONS` or `5V5`.

### Missing evidence and reliability

Each zone records:

```ts
interface ZoneCoverage {
  presentWeight: number;
  possibleWeight: number;
  ratio: number;
  missingInputs: string[];
}
```

An absent term contributes nothing to its fixed-weight sum. Therefore:

> Missing evidence shrinks the estimate toward neutral and lowers reliability.

`Reliability` is a 0–100 sample, stability, and data-coverage index. It is not a probability.

`Signal Stability` is based mainly on agreement between current and baseline on-off values, with a legacy defenseman pair-driver adjustment. It is not a fitted portability model. The old `partnerIndependence` field remains only as a deprecated API alias during migration.

### X-NAV handoff

X-NAV receives only the transition portion of Gravity v3:

```text
navResidual = 0.30 · NZ
GRAV = clamp(navResidual · 45, -20, +20)
```

Assists, individual xG/goals, power-play production, OZ lift, and the DZ dome cannot change `navResidual`. Direct offensive production and defensive suppression are valued elsewhere in X-NAV.

### V3 tiers

The existing fixed force cutoffs remain legacy v3 cutoffs until the calibration endpoint is rerun against an available qualified league population:

```text
SUPERMASSIVE ≥ 0.55
STAR          ≥ 0.40
MAIN_SEQUENCE ≥ 0.22
SATELLITE     ≥ 0.08
ASTEROID      ≥ -0.22
BLACK_HOLE    < -0.22
```

Do not describe those fixed numbers as verified season percentiles until that calibration report has been generated and reviewed.
