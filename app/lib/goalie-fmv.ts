// ── goalie-fmv.ts ────────────────────────────────────────────────
//
// What the market actually pays a goalie with this profile.
//
// WHAT THIS REPLACES
//
// A hand-written logistic curve that converted a goalie's impact into a share
// of the cap. It priced a 50-start starter with positive GSAx at $2.71M, which
// is roughly half of what such a goalie signs for, and nothing had ever checked
// it against a price anyone paid. Because G-NAV's contract stage is
// `fmv − what he costs`, that error ran straight into every goalie valuation —
// and it was invisible until the zero-floor clamp came off and goalies were
// allowed to be negative.
//
// The coefficients now come from 260 one-way standard contracts signed between
// 2017 and 2026, fitted offline by `scripts/goalie-fmv/build.ts`. Walk-forward
// validated: trained on deals signed before July 2024, scored on the 83 signed
// after, R² 0.55 and a mean error of $1.44M at a $104M ceiling.
//
// THE TARGET IS A SHARE OF THE CAP
//
// The model was fitted against cap percentage, not dollars, so a 2018 deal and
// a 2026 deal are on the same scale. Callers multiply by the ceiling of the
// season they are pricing — which is what makes this usable inside a Cup Run
// where the ceiling moves every year.
//
// WHAT IT IS NOT
//
// R² 0.55 means a good deal of what a goalie signs for is not in these four
// numbers — negotiating position, a club's cap situation, a market with two
// buyers. Treat the output as the centre of a range, not a price. `fmvRange`
// exists so a caller can show that honestly instead of implying a precision
// the fit does not have.

import artifact from "@/app/data/goalie-fmv.json";

/** Everything the model needs, all of it knowable before a contract exists. */
export interface GoalieFmvInput {
  /** GSAx/60 over recent finished seasons, already regressed for reliability. */
  gsax: number | null | undefined;
  /** Ice time in the latest finished season, seconds. */
  iceTimeSeconds: number | null | undefined;
  /** Age at the point being priced. */
  age: number | null | undefined;
  /** True when the player would sign unrestricted. */
  isUfa: boolean;
}

const M = artifact.model;
const V = artifact.validation.walkForward;
const D = artifact.model.featureDomain;

/**
 * Whether an input sits inside the range the model was fitted over.
 *
 * Worth checking rather than trusting. `gsax` here is REGRESSED — its entire
 * observed span is about -0.12 to +0.14, roughly a tenth of a raw GSAx/60 —
 * so a caller handing over a raw figure lands miles outside the fit and gets a
 * confident, absurd answer. That mistake was made while building this, which
 * is why the guard exists.
 */
export function isInDomain(input: GoalieFmvInput): boolean {
  const ice = input.iceTimeSeconds ?? 0;
  const workload = Math.min(1, Math.max(0, ice) / FULL_SEASON_SECONDS);
  return (
    input.gsax != null && input.gsax >= D.gsax.min && input.gsax <= D.gsax.max &&
    input.age != null && input.age >= D.age.min && input.age <= D.age.max &&
    workload >= 0 && workload <= D.workload.max
  );
}

/** The range each feature was fitted over, for a caller that wants to say so. */
export const FMV_DOMAIN = D;

/** Ice time in a full starter's season, seconds. Matches the fit. */
export const FULL_SEASON_SECONDS = 3500 * 60;

/** Mean absolute error of the fit, as a share of the cap. */
export const FMV_MAE_CAP_PCT = V.maeCapPct;

/** How the artifact was validated, for a caption that has to be honest. */
export const FMV_VALIDATION = V;

/**
 * Share of the salary cap this profile commands, or null when a required
 * input is missing.
 *
 * Never negative: a signed NHL goalie costs something, and the league minimum
 * is the floor a real contract cannot go below. Extrapolating a linear fit into
 * negative dollars would be arithmetic, not a price.
 */
export function goalieFmvCapPct(input: GoalieFmvInput): number | null {
  const { gsax, iceTimeSeconds, age } = input;
  if (gsax == null || !isFinite(gsax)) return null;
  if (age == null || !isFinite(age)) return null;
  const ice = iceTimeSeconds != null && isFinite(iceTimeSeconds) ? Math.max(0, iceTimeSeconds) : 0;

  // Clamped to the fitted range. A linear model extrapolates without
  // complaint, so an out-of-range input produces a number that looks like the
  // others and is not one. Clamping bounds the damage; `isInDomain` is how a
  // caller finds out it happened.
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const workload = clamp(ice / FULL_SEASON_SECONDS, 0, D.workload.max);
  const pct = M.intercept
    + M.coefficients.gsax * clamp(gsax, D.gsax.min, D.gsax.max)
    + M.coefficients.workload * workload
    + M.coefficients.age * clamp(age, D.age.min, D.age.max)
    + M.coefficients.ufa * (input.isUfa ? 1 : 0);

  return Math.max(LEAGUE_MINIMUM_CAP_PCT, pct);
}

/**
 * The league minimum as a share of the cap — $775k against a $104M ceiling.
 *
 * A floor rather than a fitted value: no NHL contract exists below it, so a
 * model output under it is out of range rather than cheap.
 */
export const LEAGUE_MINIMUM_CAP_PCT = 0.00745;

/** Dollars, in millions, against a given cap ceiling. */
export function goalieFmvAav(input: GoalieFmvInput, capCeilingM: number): number | null {
  const pct = goalieFmvCapPct(input);
  return pct == null ? null : pct * capCeilingM;
}

/**
 * A low/base/high band, in millions, from the model's own error.
 *
 * The width is the walk-forward mean absolute error — what the fit was
 * actually wrong by on contracts it had never seen — rather than a confidence
 * interval, which this model is not equipped to produce. Showing it is the
 * difference between "he is worth $4.9M" and "he is worth about $4.9M, and
 * this model is routinely a million out either way".
 */
export function goalieFmvRange(
  input: GoalieFmvInput,
  capCeilingM: number,
): { low: number; base: number; high: number } | null {
  const base = goalieFmvAav(input, capCeilingM);
  if (base == null) return null;
  const margin = FMV_MAE_CAP_PCT * capCeilingM;
  return {
    low: Math.max(LEAGUE_MINIMUM_CAP_PCT * capCeilingM, base - margin),
    base,
    high: base + margin,
  };
}
