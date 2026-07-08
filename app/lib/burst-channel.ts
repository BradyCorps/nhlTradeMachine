// ── Burst channel — explosiveness as rush offense + upside tail ─
// Hockey is a burst game, not a constant-speed one: EDGE 20+ mph bursts / top
// speed show up over a season as rush/transition offence (a small, steady lift
// to scoring) and a fatter upside tail (a boom season is more available to an
// explosive skater). Unlike the breakout model this is NOT age-gated — an
// explosive veteran still creates off the rush — but it is a strict no-op for
// any player without an EDGE sample, so explosiveness is never invented.
// Pure and deterministic.

export interface BurstInputs {
  position: string;
  edgeBurstsOver20?: number | null;
  edgeSpeedMaxMph?: number | null;
}

export interface BurstProfile {
  rushLift: number;      // multiplicative scoring lift (1 = none)
  varianceKick: number;  // extra upside added to the ceiling of pace variance
}

export function burstProfile(p: BurstInputs): BurstProfile {
  if (p.position === "G") return { rushLift: 1, varianceKick: 0 };
  const hasEdge = p.edgeBurstsOver20 != null || p.edgeSpeedMaxMph != null;
  if (!hasEdge) return { rushLift: 1, varianceKick: 0 };
  const bursts = p.edgeBurstsOver20 ?? 0;
  const topSpeed = p.edgeSpeedMaxMph ?? 0;
  if (bursts >= 40 || topSpeed >= 22.5) return { rushLift: 1.04, varianceKick: 0.10 }; // elite
  if (bursts >= 25 || topSpeed >= 21)   return { rushLift: 1.02, varianceKick: 0.05 }; // strong
  return { rushLift: 1, varianceKick: 0 };
}
