// ── valuation-copy.ts ────────────────────────────────────────────
//
// Plain-language labels for the three different "contract" numbers on a dossier.
// Copy only: nothing here reads or changes a valuation.
//
// THE CONFUSION THIS ANSWERS
//
// A dossier can show "contract +14" next to "surplus −$0.6M" and look
// self-contradictory. They are different quantities:
//
//   Annual estimated surplus  model market AAV minus THIS season's cap hit, in
//                             $M. One year, one subtraction.
//   Contract / control NAV    the engine's `cap` stage (plus any cost-controlled
//                             goalie floor): every contract year's surplus,
//                             time-discounted and scaled to NAV points ($1M = 12),
//                             with a premium for a young player held at positive
//                             surplus, plus a team-control option value for
//                             pre-peak players. A multi-year, option-bearing
//                             figure.
//   Player-side value         everything else in the headline: measured on-ice
//                             components PLUS the model's share of its
//                             multiplicative adjustments (positional scarcity,
//                             development risk, floors, sample credibility). It
//                             is not a pure on-ice measurement.
//
// The three sum into the headline by `navSplit` (unchanged).

export const PLAYER_SIDE_LABEL = "Player value";
export const PLAYER_SIDE_SUB = "production + model adjustments";
export const CONTRACT_SIDE_LABEL = "Contract & control";
export const MARKET_AAV_LABEL = "Market AAV (model est.)";
export const ANNUAL_SURPLUS_LABEL = "Est. annual surplus";

/**
 * What "Market AAV (model est.)" means, with its measured upper-end accuracy.
 * Numbers come from the fit's walk-forward validation, never typed by hand.
 * Copy only: nothing here changes an estimate.
 */
export function marketAavDefinition(
  v: { maeCapPct: number; richestAbsMissCapPct: number; richestN: number },
  capCeilingM: number,
): string {
  const m = (pct: number) => `$${(pct * capCeilingM).toFixed(1)}M`;
  return `What clubs have typically paid skaters with similar scoring, ice time, age and free-agent status, fitted to one-way contracts signed 2017–2026. It is a typical signing value, not a salary a player has earned or a price for an exceptional player. On held-out seasons it missed by about ${m(v.maeCapPct)} on average, and by about ${m(v.richestAbsMissCapPct)} on average for the ${v.richestN} richest deals tested, with no consistent bias reported for those. A handful of tested deals is thin evidence for the very top, so treat a star's figure as a range, not a price.`;
}

export const PLAYER_SIDE_DEFINITION =
  "Measured on-ice components plus this player's share of the model's adjustments (positional scarcity, development risk, floors, sample credibility). It is not a pure on-ice figure.";

export const ANNUAL_SURPLUS_DEFINITION =
  "The model's market AAV estimate minus this season's cap hit, in $M. One season only. It is an estimate: the market model predicts what clubs typically pay and has a published error margin.";

export interface ContractExplainInput {
  /** `navSplit().contract` — signed NAV points. */
  contractNav: number;
  /** Market AAV estimate minus cap hit in $M, or null when there is no deal or no price. */
  annualSurplus: number | null;
  yearsRemaining?: number | null;
}

/** One paragraph tying the three contract figures together; flags a sign mismatch. */
export function contractControlExplanation(i: ContractExplainInput): string {
  const base =
    "Est. annual surplus is the model's market AAV minus this season's cap hit. Contract & control is a different, multi-year figure: each remaining contract year's surplus is discounted and converted to NAV points, and young players also get a team-control option value.";
  if (i.annualSurplus == null || !Number.isFinite(i.annualSurplus)) return base;
  const years = i.yearsRemaining != null && i.yearsRemaining > 1 ? `${i.yearsRemaining} contract years` : "later contract years";
  if (i.contractNav > 0 && i.annualSurplus < 0) {
    return `${base} Here they point in opposite directions: this season's cap hit is above the model's estimate, yet contract & control is positive because it also counts ${years} and any control rights, which this season's subtraction ignores.`;
  }
  if (i.contractNav < 0 && i.annualSurplus > 0) {
    return `${base} Here this season's cap hit is below the model's estimate, yet contract & control is negative because it also counts ${years}, where the deal is priced above the model's estimate.`;
  }
  return base;
}
