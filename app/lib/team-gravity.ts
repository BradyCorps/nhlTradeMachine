// ── team-gravity.ts — roster gravity aggregated to a team field ──
//
// A player's Gravity profile is three zone masses (OZ well, NZ well, DZ dome)
// that GravityHeatMap renders as a contour surface. A team's field is the mean
// of those masses across its qualified skaters: the shape the roster shares,
// not a tally of how many it dresses. Magnitude is deliberately not summed —
// the contour renderer normalizes it away, and averaging keeps a deep team and
// a thin one on the same footing so the picture reads as identity, not depth.

import type { ZoneMasses } from "@/app/lib/gravity";

export interface TeamGravityInput {
  masses: ZoneMasses;
  force: number;
  /** Only QUALIFIED profiles contribute — an unqualified one is missing
   *  evidence, which is not the same as a zero-gravity player. */
  qualified: boolean;
}

export interface TeamGravityAggregate {
  masses: ZoneMasses;
  /** Mean position-relative force across the contributing skaters. */
  force: number;
  /** How many qualified skaters the mean is over — the honesty of the shape. */
  count: number;
}

export function aggregateTeamGravity(entries: TeamGravityInput[]): TeamGravityAggregate | null {
  const qualified = entries.filter(e => e.qualified);
  if (qualified.length === 0) return null;

  let oz = 0, nz = 0, dz = 0, force = 0;
  for (const e of qualified) {
    oz += e.masses.oz;
    nz += e.masses.nz;
    dz += e.masses.dz;
    force += e.force;
  }
  const n = qualified.length;
  return {
    masses: { oz: oz / n, nz: nz / n, dz: dz / n },
    force: force / n,
    count: n,
  };
}
