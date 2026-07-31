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
// WALK-FORWARD VALIDATED
//
// Trained on contracts signed before July 2024, scored on the ones signed
// after: forwards R² 0.64, defencemen R² 0.55, both a mean error of $1.41M at
// a $104M ceiling. Roughly two thirds of the variance in what a skater signs
// for is in four numbers; the rest is leverage, cap room, and how many clubs
// were bidding. `skaterFmvRange` exists so that can be shown rather than hidden
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

/**
 * Whether an input sits inside the range its model was fitted over.
 *
 * `pts60` is points per SIXTY MINUTES, not per game and not per 82 — a forward
 * median is 1.66 and the fitted maximum is 4.68. Handing over a per-82 pace
 * lands an order of magnitude outside the fit, which is the mistake this
 * catches. (The goalie model earned the same guard the hard way.)
 */
export function isInDomain(input: SkaterFmvInput): boolean {
  const d = BY_POSITION[input.unit]?.featureDomain;
  if (!d) return false;
  if (input.pts60 == null || !isFinite(input.pts60)) return false;
  if (input.age == null || !isFinite(input.age)) return false;
  const toi = toiFeature(input.minutesPerGame ?? 0);
  return (
    input.pts60 >= d.pts60.min && input.pts60 <= d.pts60.max &&
    input.age >= d.age.min && input.age <= d.age.max &&
    toi >= d.toi.min && toi <= d.toi.max
  );
}

/**
 * Share of the salary cap this profile commands, or null when a required input
 * is missing.
 *
 * Clamped to the fitted range: a linear model extrapolates without complaint,
 * so an out-of-range input returns a number that looks like the others and is
 * not one. `isInDomain` is how a caller finds out it happened.
 */
export function skaterFmvCapPct(input: SkaterFmvInput): number | null {
  const model = BY_POSITION[input.unit];
  if (!model) return null;
  const { pts60, age } = input;
  if (pts60 == null || !isFinite(pts60)) return null;
  if (age == null || !isFinite(age)) return null;

  const d = model.featureDomain;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const minutes = input.minutesPerGame != null && isFinite(input.minutesPerGame) ? input.minutesPerGame : 0;

  const pct = model.intercept
    + model.coefficients.pts60 * clamp(pts60, d.pts60.min, d.pts60.max)
    + model.coefficients.toi * clamp(toiFeature(minutes), d.toi.min, d.toi.max)
    + model.coefficients.age * clamp(age, d.age.min, d.age.max)
    + model.coefficients.ufa * (input.isUfa ? 1 : 0);

  return Math.max(LEAGUE_MINIMUM_CAP_PCT, pct);
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
