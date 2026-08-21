// ── Gravity v4 — OZ well fit core (pure) ─────────────────────────
//
// One place that turns possession observations into fitted OZ gravity. Both the
// production driver (fit-oz-model) and the validator (validate-model) call this,
// so a split-half or bootstrap refit is guaranteed to be the SAME model as the
// one that ships — a validator that fit the well even slightly differently would
// be validating a different thing than production reads.
//
// The penalty layout is the rule: shrink the three player blocks (gravity,
// finish, defense) by λ, leave the context columns (intercept, home ice, score
// state, zone start, focal position) unpenalized. Context is nuisance we want
// estimated freely; player effects are what ridge is regularizing.

import { buildOzDesign, type OzDesign } from "./oz-design";
import { solveRidgeCG } from "./rapm";
import type { PossessionObservation } from "./possession-states";

export interface PlayerFit {
  /** The OZ well — effect on teammates' xG/60, focal-excluded. */
  gravity: number;
  /** Own shooting rate coefficient. */
  finish: number;
  /** Suppression of on-ice opponents' xG/60. */
  defense: number;
  /** Total 5v5 seconds on ice (reliability weight). */
  toiSec: number;
}

export interface OzFit {
  design: OzDesign;
  beta: Float64Array;
  /** player id → fitted coefficients. */
  byPlayer: Map<number, PlayerFit>;
  /** context name → fitted coefficient (intercept, homeIce, …, focalFwd). */
  context: Record<string, number>;
}

export interface OzFitOptions {
  lambda: number;
  maxIter?: number;
}

/** Fit the OZ RAPM ridge on a set of observations and read every coefficient. */
export function fitOzWell(
  obs: PossessionObservation[],
  isForward: (playerId: number) => boolean,
  opts: OzFitOptions,
): OzFit {
  const design = buildOzDesign(obs, isForward);

  // Shrink the player blocks; leave context free. `contextOffset` is exactly the
  // first context column, so 0..contextOffset-1 is every player coefficient.
  const penalty = new Float64Array(design.nFeatures);
  for (let j = 0; j < design.contextOffset; j++) penalty[j] = opts.lambda;

  const beta = solveRidgeCG(design.rows, design.nFeatures, penalty, {
    maxIter: opts.maxIter ?? 800,
  });

  const byPlayer = new Map<number, PlayerFit>();
  design.players.forEach((id, i) => {
    byPlayer.set(id, {
      gravity: beta[design.gravityOffset + i],
      finish: beta[design.finishOffset + i],
      defense: beta[design.defenseOffset + i],
      toiSec: design.toiSec[i],
    });
  });

  const context: Record<string, number> = {};
  design.contextNames.forEach((n, k) => { context[n] = beta[design.contextOffset + k]; });

  return { design, beta, byPlayer, context };
}
