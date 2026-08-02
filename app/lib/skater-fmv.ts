// ── skater-fmv.ts ────────────────────────────────────────────────
//
// What the market actually pays a skater with this profile.
//
// The counterpart to `goalie-fmv.ts`, and the one with reach: X-NAV's contract
// stage prices every player in the app, where the goalie model touched only
// goalies. Coefficients come from 1,996 one-way standard contracts signed
// between 2017 and 2026, fitted offline by `scripts/skater-fmv/build.ts`.
//
// FORWARDS AND DEFENCEMEN ARE DIFFERENT MODELS
//
// Not a hedge — the market weights them differently. A defenceman is paid more
// for minutes and less for points, and one shared slope cannot express that.
// Pass the position and the right model is used.
//
// THE PRICE CURVE BENDS UPWARD, AND SO DOES THE FIT
//
// Production and deployment enter as monotone linear splines — a base slope
// plus `max(0, x − knot)` terms at the median and the 85th percentile. A
// straight line was misspecified, and the tell was the residuals binned by
// PREDICTION (not by actual, which produces the same shape even for a correct
// model): forwards ran +1.56 points of cap in the bottom decile, −0.80 through
// the middle and +1.53 at the top. A line through a curve that bends
// over-predicts the middle and misses both ends, and it predicted a NEGATIVE
// cap share for the cheapest decile, which only the league minimum was hiding.
//
// The cost sat where it mattered most. On the twenty richest held-out contracts
// the linear fit was out by 3.45 points of cap on average, pricing Leo
// Carlsson's 17.3% deal as a 7.9% player. This is out by 2.25.
//
// The slopes are constrained non-negative, so the curve can only ever rise.
// That constraint is not decoration: squared terms fit better and turned over
// INSIDE the fitted range, so an elite scoring defenceman was penalised for
// scoring, and a log fit scored better still and priced the corner of the
// feature box at 54.7% of the cap. The build refuses to ship a fit whose price
// falls as production or deployment rises.
//
// BOUNDED AT BOTH ENDS
//
// Floored at the league minimum, ceilinged at the CBA's 20% individual maximum.
// The ceiling is a legal fact, and it is NOT what the retired sigmoid did with
// the same number — that curve used 20% as an asymptote, so every good player
// was drawn toward it. This one binds on no contract in the fitted population,
// and the build refuses to ship if it ever does.
//
// WALK-FORWARD VALIDATED
//
// Trained on contracts signed before July 2024, scored on the ones signed
// after: forwards R² 0.70 and a mean error of $1.21M at a $104M ceiling,
// defencemen R² 0.60 and $1.33M. Roughly two thirds of what a skater signs for
// is in these numbers; the rest is leverage, cap room, and how many clubs were
// bidding. `skaterFmvRange` exists so that can be shown rather than hidden
// behind a single figure.

import artifact from "@/app/data/skater-fmv.json";

export type SkaterUnit = "F" | "D";

export interface SkaterFmvInput {
  /** Points per sixty minutes of ice over recent finished seasons. */
  pts60: number | null | undefined;
  /** Minutes per game in the latest finished season. */
  minutesPerGame: number | null | undefined;
  /** Age at the point being priced. */
  age: number | null | undefined;
  /** True when the player would sign unrestricted. */
  isUfa: boolean;
  /** Position group. Anything that is not a defenceman is priced as a forward. */
  unit: SkaterUnit;
}

const BY_POSITION = artifact.model.byPosition as Record<SkaterUnit, {
  n: number;
  intercept: number;
  coefficients: Record<string, number>;
  /** Where each feature's slope is allowed to change, in the feature's units. */
  knots: { pts60: number[]; toi: number[] };
  featureDomain: Record<string, { min: number; p5: number; p50: number; p95: number; max: number }>;
  validation: { walkForward: { trainN: number; testN: number; r2: number; maeCapPct: number } };
}>;

/** Minutes per game the `toi` feature is expressed against. Matches the fit. */
export const TOI_REFERENCE_MINUTES = 20;

/** Ceiling on the deployment feature — nobody averages 32 minutes. */
export const TOI_CAP = 1.6;

/**
 * League minimum as a share of the cap — $775k against a $104M ceiling.
 *
 * A floor, not a fitted value. A linear model extrapolates a depth forward to
 * negative dollars; a contract cannot go there.
 */
export const LEAGUE_MINIMUM_CAP_PCT = 0.00745;

/**
 * The CBA's individual maximum: 20% of the upper limit.
 *
 * A legal bound, and deliberately not the retired sigmoid's use of the same
 * figure. That curve made 20% an asymptote every good player was drawn toward,
 * which is how a third-pair defenceman came to be priced at $16.8M. This is a
 * ceiling that binds on no contract in the fitted population — the build fails
 * if it ever does — and exists only so the quadratic cannot price a profile
 * above what a club may legally sign.
 */
export const CBA_MAXIMUM_CAP_PCT = 0.20;

/**
 * The position group a raw position string belongs to.
 *
 * Matches `roster-table.ts`: the signings sheet only ever says "D", but Asset
 * positions carry LD and RD, and `startsWith("D")` silently priced a left
 * defenceman as a forward.
 */
const DEFENCE_CODES = new Set(["D", "LD", "RD"]);
export const unitForPosition = (position: string | null | undefined): SkaterUnit =>
  DEFENCE_CODES.has(String(position ?? "").trim().toUpperCase()) ? "D" : "F";

/** How each model was validated, for a caption that has to be honest. */
export const SKATER_FMV_VALIDATION = {
  F: BY_POSITION.F.validation.walkForward,
  D: BY_POSITION.D.validation.walkForward,
};

/** The range each feature was fitted over, per position. */
export const skaterFmvDomain = (unit: SkaterUnit) => BY_POSITION[unit].featureDomain;

const toiFeature = (minutesPerGame: number) =>
  Math.min(TOI_CAP, Math.max(0, minutesPerGame) / TOI_REFERENCE_MINUTES);

export type SkaterFeature = "pts60" | "toi" | "age";

/** One feature that had to be clamped to keep the price inside the fit. */
export interface DomainFinding {
  feature: SkaterFeature;
  label: string;
  /** The value handed in, in the feature's own units. */
  value: number;
  /** The bound it was pulled to. */
  clampedTo: number;
  direction: "below" | "above";
  /**
   * Cap percentage the clamp withheld — what the model would have added had it
   * been willing to extrapolate. Signed: positive means the player was priced
   * lower than a straight-line reading would have him.
   */
  withheldCapPct: number;
}

export interface DomainReport {
  /** True when nothing needed clamping. */
  inDomain: boolean;
  /** True when a required input was missing, so there is no price at all. */
  priceable: boolean;
  findings: DomainFinding[];
  /** Net cap percentage withheld across every clamp. */
  withheldCapPct: number;
  /**
   * True when the clamping moved the price by more than the model's own
   * walk-forward error — the line between "clamped, and it hardly matters" and
   * "this player is not what the fit was built on".
   */
  material: boolean;
}

const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const hinge = (x: number, knot: number) => Math.max(0, x - knot);

/**
 * The fitted cap share before either bound is applied.
 *
 * One place, so pricing and the domain report cannot disagree about what the
 * model says — the report subtracts two of these to work out what a clamp cost.
 */
function rawCapPct(
  model: (typeof BY_POSITION)[SkaterUnit],
  v: Record<SkaterFeature, number>,
  isUfa: boolean,
): number {
  const c = model.coefficients;
  const k = model.knots;
  return model.intercept
    + c.pts60 * v.pts60
    + c.pts60Hinge1 * hinge(v.pts60, k.pts60[0])
    + c.pts60Hinge2 * hinge(v.pts60, k.pts60[1])
    + c.toi * v.toi
    + c.toiHinge1 * hinge(v.toi, k.toi[0])
    + c.toiHinge2 * hinge(v.toi, k.toi[1])
    + c.age * v.age
    + c.ufa * (isUfa ? 1 : 0);
}

/**
 * Clamp every feature to the fitted range, recording what each clamp cost.
 *
 * Pricing and reporting both go through here so they cannot drift apart. A
 * report that says "in domain" while the price was quietly clamped would be
 * worse than no report.
 */
function clampFeatures(input: SkaterFmvInput): {
  model: (typeof BY_POSITION)[SkaterUnit];
  values: Record<SkaterFeature, number>;
  findings: DomainFinding[];
} | null {
  const model = BY_POSITION[input.unit];
  if (!model) return null;
  const { pts60, age } = input;
  if (pts60 == null || !isFinite(pts60)) return null;
  if (age == null || !isFinite(age)) return null;

  const d = model.featureDomain;
  const minutes = input.minutesPerGame != null && isFinite(input.minutesPerGame) ? input.minutesPerGame : 0;

  const raw: Record<SkaterFeature, number> = { pts60, toi: toiFeature(minutes), age };
  const labels: Record<SkaterFeature, string> = {
    pts60: "production", toi: "deployment", age: "age",
  };
  // The `toi` feature is a ratio; report it in the minutes a reader thinks in.
  const display: Record<SkaterFeature, (v: number) => number> = {
    pts60: v => v, age: v => v, toi: v => v * TOI_REFERENCE_MINUTES,
  };

  const values = {} as Record<SkaterFeature, number>;
  const clampedFeatures: SkaterFeature[] = [];
  for (const feature of ["pts60", "toi", "age"] as SkaterFeature[]) {
    const bound = d[feature];
    values[feature] = clampTo(raw[feature], bound.min, bound.max);
    if (values[feature] !== raw[feature]) clampedFeatures.push(feature);
  }

  // What the clamp cost is a difference of PRICES, not of coefficients.
  //
  // It used to be `coefficient × overshoot`, which was only ever right because
  // the fit was linear in the cap share. It is linear in the LOG of the cap
  // share now, so a coefficient is a multiplicative effect and that arithmetic
  // would have quietly reported nonsense. Priced both ways instead, which is
  // exact and survives the next change of functional form.
  const priceOf = (v: Record<SkaterFeature, number>) =>
    rawCapPct(model, v, input.isUfa);

  const findings: DomainFinding[] = clampedFeatures.map(feature => {
    // One feature at a time, holding the others clamped, so several clamps
    // still add up to the whole difference rather than double-counting.
    const withThis = { ...values, [feature]: raw[feature] };
    return {
      feature,
      label: labels[feature],
      value: display[feature](raw[feature]),
      clampedTo: display[feature](values[feature]),
      direction: raw[feature] < d[feature].min ? "below" : "above",
      withheldCapPct: priceOf(withThis) - priceOf(values),
    };
  });
  return { model, values, findings };
}

/**
 * What the fit had to clamp, and what that clamping cost.
 *
 * WHY A REPORT AND NOT A FLAG
 *
 * `isInDomain` answered yes or no, which turned out to be the wrong question.
 * Measured against the 2025-26 skaters, an eighteen-year-old is flagged
 * out-of-domain on age alone — and clamping age 18 up to the fitted floor of
 * 20 withholds $0.30M at a $104M ceiling, a fifth of the model's own error.
 * Meanwhile a genuine per-82 pace fed in where a per-sixty rate belongs would
 * carry the same flag and be wrong by ten million.
 *
 * So the number that matters is not whether a clamp happened but what it took
 * off the price. `material` draws that line at the model's own walk-forward
 * error: below it, the clamp is a footnote; above it, the player does not look
 * like anything the fit was built on and the price is a floor or a ceiling
 * rather than a read.
 */
export function skaterFmvDomainReport(input: SkaterFmvInput): DomainReport {
  const c = clampFeatures(input);
  if (!c) {
    return { inDomain: false, priceable: false, findings: [], withheldCapPct: 0, material: false };
  }
  const withheldCapPct = c.findings.reduce((s, f) => s + f.withheldCapPct, 0);
  return {
    inDomain: c.findings.length === 0,
    priceable: true,
    findings: c.findings,
    withheldCapPct,
    material: Math.abs(withheldCapPct) > SKATER_FMV_VALIDATION[input.unit].maeCapPct,
  };
}

/**
 * Whether an input sits inside the range its model was fitted over.
 *
 * `pts60` is points per SIXTY MINUTES, not per game and not per 82 — a forward
 * median is 1.66 and the fitted maximum is 4.68. Handing over a per-82 pace
 * lands an order of magnitude outside the fit, which is the mistake this
 * catches. (The goalie model earned the same guard the hard way.)
 *
 * Kept for callers that only need the boolean. Anything that has to EXPLAIN
 * itself to a reader wants `skaterFmvDomainReport` — a clamp on age costs
 * $0.30M and a clamp on a mis-scaled production input costs ten times that,
 * and this cannot tell them apart.
 */
export function isInDomain(input: SkaterFmvInput): boolean {
  return skaterFmvDomainReport(input).inDomain;
}

/**
 * A caption for a price that had to be clamped, or null when nothing was.
 *
 * Written to be shown as-is. It names the feature and the dollars rather than
 * saying "out of domain", which means nothing to anyone reading a player page.
 */
export function domainNote(input: SkaterFmvInput, capCeilingM: number): string | null {
  const report = skaterFmvDomainReport(input);
  if (!report.priceable) return "Not enough recorded play to price this contract.";
  if (report.inDomain) return null;

  const dollars = Math.abs(report.withheldCapPct) * capCeilingM;
  const parts = report.findings.map(f =>
    `${f.label} ${f.direction === "above" ? "above" : "below"} anything in the sample`);
  const what = parts.join(" and ");
  return report.material
    ? `Priced at the edge of the fit — ${what}. No contract signed since 2017 looks like this, so the figure is a bound rather than a read (about $${dollars.toFixed(1)}M held back).`
    : `${what.charAt(0).toUpperCase()}${what.slice(1)}, so the price is held at the edge of the fitted range. Worth about $${dollars.toFixed(2)}M, inside the model's own margin.`;
}

/**
 * Share of the salary cap this profile commands, or null when a required input
 * is missing.
 *
 * Clamped to the fitted range: a linear model extrapolates without complaint,
 * so an out-of-range input returns a number that looks like the others and is
 * not one. `skaterFmvDomainReport` is how a caller finds out it happened, and
 * what it cost.
 */
export function skaterFmvCapPct(input: SkaterFmvInput): number | null {
  const c = clampFeatures(input);
  if (!c) return null;

  const pct = rawCapPct(c.model, c.values, input.isUfa);
  return Math.min(CBA_MAXIMUM_CAP_PCT, Math.max(LEAGUE_MINIMUM_CAP_PCT, pct));
}

/** Dollars, in millions, against a given cap ceiling. */
export function skaterFmvAav(input: SkaterFmvInput, capCeilingM: number): number | null {
  const pct = skaterFmvCapPct(input);
  return pct == null ? null : pct * capCeilingM;
}

/**
 * A low/base/high band, in millions, from the model's own walk-forward error.
 *
 * Not a confidence interval — this model cannot produce one. It is what the fit
 * was actually wrong by on contracts it had never seen, which is the honest
 * width to draw around a number that is right about two thirds of the time.
 */
export function skaterFmvRange(
  input: SkaterFmvInput,
  capCeilingM: number,
): { low: number; base: number; high: number } | null {
  const base = skaterFmvAav(input, capCeilingM);
  if (base == null) return null;
  const margin = SKATER_FMV_VALIDATION[input.unit].maeCapPct * capCeilingM;
  return {
    low: Math.max(LEAGUE_MINIMUM_CAP_PCT * capCeilingM, base - margin),
    base,
    high: base + margin,
  };
}
