// ── Gravity v4 — transition (rush) partition (pure) ──────────────
//
// The NZ well is TRANSITION offense: the xG a player helps generate off the rush,
// as opposed to sustained offensive-zone possession (the OZ well). The additive
// schema (net = OZ + NZ + DZ, all in xG) forbids double-counting, so offense is
// PARTITIONED by shot origin: each shot is either a rush chance (StintShot.rush,
// a proxy from event zone-codes — see core.ts isRushShot) or sustained. Fitting
// the OZ ridge on the rush-only view yields the NZ well; on the sustained-only
// view yields the (re-cut) OZ well; the two sum back to total offense.
//
// Pure: it only reshapes possession observations by filtering their shots and
// recomputing the per-side xG totals, so the existing fitOzWell/validate machinery
// runs on either view unchanged.

import type { PossessionObservation, ValuedShot } from "./possession-states";

/** Copy the observations keeping only shots that pass `keep`, with homeXg/awayXg
 *  recomputed from the survivors. Everything else (lineups, durations, context)
 *  is untouched. */
export function filterShots(
  obs: PossessionObservation[],
  keep: (s: ValuedShot) => boolean,
): PossessionObservation[] {
  return obs.map(o => {
    const shots = o.shots.filter(keep);
    let homeXg = 0, awayXg = 0;
    for (const s of shots) { if (s.team === "H") homeXg += s.xg; else awayXg += s.xg; }
    return { ...o, shots, homeXg, awayXg };
  });
}

/** Rush-only view — the NZ (transition) well fits on this. */
export const rushOnly = (obs: PossessionObservation[]): PossessionObservation[] =>
  filterShots(obs, s => s.rush === true);

/** Sustained-only view — the re-cut OZ well fits on this. */
export const sustainedOnly = (obs: PossessionObservation[]): PossessionObservation[] =>
  filterShots(obs, s => !s.rush);

/** Share of all shot xG that is transition (rush) — a sanity read on the proxy
 *  (public tracking pegs rush offense at roughly a quarter to a third). */
export function rushXgShare(obs: PossessionObservation[]): number {
  let rush = 0, total = 0;
  for (const o of obs) for (const s of o.shots) { total += s.xg; if (s.rush) rush += s.xg; }
  return total > 0 ? rush / total : 0;
}
