// ── Gravity Engine v3 "Spacetime" ────────────────────────────────
// Models a player as a mass distribution across hockey's three zones.
// The rink is a sheet; the player curves it. Three zone masses are the
// real computed quantities — total force is just their weighted sum.
//
//   m_OZ  — offensive-zone well: chances created, finishing threat,
//           on-ice lift, PP leverage. Play falls toward the opponent's net.
//   m_NZ  — neutral-zone well: transition displacement (where play LIVES
//           vs where the player is DEPLOYED), speed, burst rate. The
//           Quinn Hughes signal — dragging play through center ice.
//   m_DZ  — defensive-zone dome: xGA suppression, defensive point shares,
//           PK trust. Repulsive curvature — opponents can't dig a well here.
//
// Every raw input is standardized WITHIN POSITION (z-score against
// positional calibration constants) before being squashed to a bounded
// mass via tanh. That makes a defenseman's masses measured against
// defensemen, a forward's against forwards — then the weighted force is
// one agnostic currency and tiers mean "top X% of the league" regardless
// of role. Assembly is additive, so no compounding multiplier blowups:
// force is bounded in (−1, +1) by construction.
//
//   force = 0.45·m_OZ + 0.30·m_NZ + 0.25·m_DZ
//
// navResidual is the transition-only handoff to X-NAV. Direct offensive
// production and defensive suppression are valued elsewhere in X-NAV, so
// assists, individual xG/goals, power-play production, lift, and the DZ dome
// are excluded from this residual.
//
// Missing terms contribute nothing to fixed-weight sums. That behavior
// shrinks incomplete estimates toward neutral; explicit per-zone coverage
// records the absent evidence and lowers the reliability index.

import type { Asset } from "./trade-types";

// ── Public types ─────────────────────────────────────────────────

export interface ZoneMasses {
  /** Offensive-zone well, (−1, +1). Positive pulls play toward the opponent's net. */
  oz: number;
  /** Neutral-zone / transition well, (−1, +1). Positive drags play through center ice. */
  nz: number;
  /** Defensive-zone dome, (−1, +1). Positive repels opponent offense (good). */
  dz: number;
}

export interface ZoneCoverage {
  /** Sum of model weight backed by a present input. */
  presentWeight: number;
  /** Total model weight that could be present for the zone. */
  possibleWeight: number;
  /** presentWeight / possibleWeight, bounded 0–1. */
  ratio: number;
  /** Stable input keys whose evidence was unavailable. */
  missingInputs: string[];
}

export interface GravityCoverage {
  oz: ZoneCoverage;
  nz: ZoneCoverage;
  dz: ZoneCoverage;
}

export interface GravityProfile {
  /** Weighted zone-mass total, bounded (−1, +1). One currency across positions. */
  force: number;
  /** The shape of the field — where on the rink the warping happens. */
  masses: ZoneMasses;
  /** Transition-only bounded handoff to X-NAV. */
  navResidual: number;
  /** Current/baseline on-off agreement, with the legacy D pair-driver adjustment. */
  signalStability: number;
  /** @deprecated Use signalStability. */
  partnerIndependence: number;
  /** 0–1 model coverage/stability index. This is not a probability. */
  reliability: number;
  /** @deprecated Use reliability. This is not a calibrated probability. */
  confidence: number;
  /** "full" means every weighted v3 input is present; otherwise "partial". */
  dataQuality: "full" | "partial";
  /** Per-zone evidence coverage for the fixed-weight v3 composites. */
  coverage: GravityCoverage;
  isDefenseman: boolean;
  tier: GravityTier;
  description: string;
}

export type GravityTier =
  | "SUPERMASSIVE"    // warps the entire game
  | "STAR"            // elite gravitational field
  | "MAIN_SEQUENCE"   // strong, steady pull
  | "SATELLITE"       // detectable but modest
  | "ASTEROID"        // negligible field
  | "BLACK_HOLE";     // absorbs energy from linemates

const TIER_DESC: Record<GravityTier, string> = {
  SUPERMASSIVE:  "Warps the game around himself — linemates orbit",
  STAR:          "Elite gravitational field — elevates everyone nearby",
  MAIN_SEQUENCE: "Strong, steady pull — makes his line better",
  SATELLITE:     "Detectable pull — modest but real",
  ASTEROID:      "Negligible gravitational field",
  BLACK_HOLE:    "Absorbs energy — linemates produce less",
};

// Legacy v3 tier cutoffs on the bounded force scale. The calibration route
// derives season-specific suggestions from the qualified population; these
// fixed cutoffs must not be described as checked percentiles until that report
// is rerun against an available current-season population.
export function classifyTier(force: number): GravityTier {
  if (force >= 0.55) return "SUPERMASSIVE";
  if (force >= 0.40) return "STAR";
  if (force >= 0.22) return "MAIN_SEQUENCE";
  if (force >= 0.08) return "SATELLITE";
  if (force >= -0.22) return "ASTEROID";
  return "BLACK_HOLE";
}

// ── Positional calibration ───────────────────────────────────────
// Approximate league distributions per input, per position group.
// These are calibration constants (mean/σ of qualified NHL players,
// ≥20 GP) — refit once a season, not per render. Distributions of
// NHL rate stats are stable enough season-over-season that fixed
// constants keep computeGravity pure and callable per-player without
// threading a league context everywhere.

interface Dist { mean: number; sd: number }
type PosGroup = "F" | "D";

const CAL: Record<PosGroup, Record<string, Dist>> = {
  F: {
    lift:         { mean: 0,    sd: 5.0  },  // blended on-off xG share (pct points)
    assistsPace:  { mean: 26,   sd: 14   },  // assists per 82
    ixg82:        { mean: 12,   sd: 7.0  },  // individual xG per 82
    ppPts82:      { mean: 8,    sd: 8.0  },  // PP points per 82
    displacement: { mean: 0,    sd: 0.045 }, // OZ-time share above deployment expectation
    speedMax:     { mean: 21.5, sd: 0.9  },  // EDGE top speed (mph)
    bursts82:     { mean: 30,   sd: 22   },  // 20+ mph bursts per 82
    xgaSupp:      { mean: 0,    sd: 0.35 },  // on-off xGA suppression (positive = better)
    dps:          { mean: 1.0,  sd: 0.9  },  // defensive point shares
    pkShare:      { mean: 0.04, sd: 0.05 },  // share of team PK time
    toi:          { mean: 14.5, sd: 3.0  },  // avg TOI (min)
  },
  D: {
    lift:         { mean: 0,    sd: 4.5  },
    assistsPace:  { mean: 18,   sd: 10   },
    ixg82:        { mean: 4.5,  sd: 3.0  },
    ppPts82:      { mean: 4,    sd: 5.0  },
    displacement: { mean: 0,    sd: 0.04 },
    speedMax:     { mean: 21.3, sd: 0.8  },
    bursts82:     { mean: 20,   sd: 15   },
    xgaSupp:      { mean: 0,    sd: 0.35 },
    dps:          { mean: 2.8,  sd: 1.1  },
    pkShare:      { mean: 0.08, sd: 0.07 },
    toi:          { mean: 20,   sd: 2.5  },
  },
};

// EDGE zone time is a three-way split (OZ + NZ + DZ = 100%); league-average
// OZ share is ~43%, not 50%.
const LEAGUE_AVG_OZ_TIME = 0.43;

// Zone leverage weights — must sum to 1 so force stays bounded (−1, +1).
const W_OZ = 0.45;
const W_NZ = 0.30;
const W_DZ = 0.25;

// ── Helpers ──────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Position-standardized z-score, clamped to ±3 so no single input dominates. */
function z(value: number, dist: Dist): number {
  return clamp((value - dist.mean) / dist.sd, -3, 3);
}

/** Squash an accumulated raw z-composite into a bounded mass (−1, +1).
 * The /2.75 divisor is the saturation calibration: at /2 the tanh ceiling
 * compressed all elite players into 0.77–0.82 force (a three-moderate-mass
 * profile tied a spiky generational one). Softer saturation preserves
 * separation at the top of the league while keeping the hard (−1, 1) bound. */
const squash = (raw: number) => Math.tanh(raw / 2.75);

function zoneCoverage(
  inputs: ReadonlyArray<{ key: string; weight: number; present: boolean }>,
): ZoneCoverage {
  const possibleWeight = inputs.reduce((sum, input) => sum + input.weight, 0);
  const presentWeight = inputs.reduce(
    (sum, input) => sum + (input.present ? input.weight : 0),
    0,
  );
  return {
    presentWeight: r2(presentWeight),
    possibleWeight: r2(possibleWeight),
    ratio: possibleWeight > 0 ? r2(presentWeight / possibleWeight) : 0,
    missingInputs: inputs.filter(input => !input.present).map(input => input.key),
  };
}

export function gravityCoverageRatio(coverage: GravityCoverage): number {
  const zones = [coverage.oz, coverage.nz, coverage.dz];
  const present = zones.reduce((sum, zone) => sum + zone.presentWeight, 0);
  const possible = zones.reduce((sum, zone) => sum + zone.possibleWeight, 0);
  return possible > 0 ? clamp(present / possible, 0, 1) : 0;
}

// ── The engine ───────────────────────────────────────────────────

export function computeGravity(asset: Asset): GravityProfile | null {
  if (asset.position === "G" || asset.position === "Pick") return null;
  const games = asset.games ?? 0;
  if (games < 10) return null;

  const isD = asset.position === "D";
  const cal = CAL[isD ? "D" : "F"];

  // ── On-off lift (the NOIV-family input) ────────────────────────
  // Blend current-season on-off with the multi-season baseline; the
  // baseline carries more weight because single-season on-off is noisy.
  const currentLift = asset.xgRelTM ?? 0;
  const baselineLift = asset.baselineXgRel != null ? asset.baselineXgRel * 100 : null;
  const blendedLift = baselineLift !== null
    ? currentLift * 0.4 + baselineLift * 0.6
    : currentLift;

  // ── Signal stability: 0–1 damper on the lift input ─────────────
  // This is agreement between current and baseline on-off values. It is
  // not a linemate-independence or portability model.
  let signalStability = 0.75; // unknown — partial trust
  if (baselineLift !== null && games >= 20) {
    const sameDirection = (currentLift >= 0) === (baselineLift >= 0);
    const maxMag = Math.max(Math.abs(currentLift), Math.abs(baselineLift), 1);
    const divergence = Math.abs(currentLift - baselineLift) / maxMag;
    signalStability = sameDirection
      ? clamp(1.0 - divergence * 0.3, 0.7, 1.0)
      : clamp(0.7 - divergence * 0.3, 0.4, 0.7);
  }
  // The existing D pair-driver input remains a v3 stability signal.
  if (isD && asset.pairDriverScore != null) {
    signalStability = clamp(signalStability + asset.pairDriverScore / 100, 0.4, 1.0);
  }
  // Small samples: pull toward the unknown prior.
  if (games < 30) {
    signalStability = 0.75 + (signalStability - 0.75) * (games / 30);
  }

  const liftEffective = blendedLift * signalStability;

  // QoC and TOI remain descriptive context. They do not inflate per-rate
  // zone ability; any accumulated seasonal contribution belongs downstream.
  const scale = 1.0;

  // ── m_OZ: offensive-zone well ──────────────────────────────────
  // Present-only accumulation: absent inputs are skipped, not zeroed.
  const hasLift = asset.xgRelTM != null || asset.baselineXgRel != null;
  const hasIxg = (asset.baselineIxg82 ?? 0) > 0 || asset.goalsPace != null;
  const ixg82 = (asset.baselineIxg82 ?? 0) > 0 ? asset.baselineIxg82! : asset.goalsPace;
  const ozLiftTerm = hasLift ? 0.40 * z(liftEffective, cal.lift) : 0;
  let ozRestTerm = 0;
  if (asset.assistsPace != null) ozRestTerm += 0.25 * z(asset.assistsPace, cal.assistsPace);
  if (ixg82 != null)             ozRestTerm += 0.20 * z(ixg82, cal.ixg82);
  if (asset.ppPtsPace82 != null) ozRestTerm += 0.15 * z(asset.ppPtsPace82, cal.ppPts82);
  const mOz = squash((ozLiftTerm + ozRestTerm) * scale);
  const ozCoverage = zoneCoverage([
    { key: "onIceLift", weight: 0.40, present: hasLift },
    { key: "assistsPace", weight: 0.25, present: asset.assistsPace != null },
    { key: "individualXgOrGoalsPace", weight: 0.20, present: hasIxg },
    { key: "powerPlayPointsPace", weight: 0.15, present: asset.ppPtsPace82 != null },
  ]);

  // ── m_NZ: neutral-zone / transition well ───────────────────────
  // The core signal is displacement: where play LIVES (EDGE zone time)
  // minus where the player is DEPLOYED (zone starts). Starting in your
  // own end but living in the offensive zone = play dragged through
  // the neutral zone — measured transition gravity.
  const hasEdgeZoneTime = asset.edgeOzPct != null;
  const dzStarts = asset.dzPct ?? 0.5;
  let nzRaw = 0;
  if (hasEdgeZoneTime) {
    const expectedOz = LEAGUE_AVG_OZ_TIME + (0.5 - dzStarts) * 0.25;
    const displacement = asset.edgeOzPct! - expectedOz;
    nzRaw += 0.50 * z(displacement, cal.displacement);
  }
  const bursts82 = asset.edgeBurstsOver20 != null ? (asset.edgeBurstsOver20 / games) * 82 : null;
  if (asset.edgeSpeedMaxMph != null) nzRaw += 0.25 * z(asset.edgeSpeedMaxMph, cal.speedMax);
  if (bursts82 !== null) nzRaw += 0.25 * z(bursts82, cal.bursts82);
  const mNz = squash(nzRaw * scale);
  const nzCoverage = zoneCoverage([
    { key: "edgeZoneTimeDisplacement", weight: 0.50, present: hasEdgeZoneTime },
    { key: "edgeTopSpeed", weight: 0.25, present: asset.edgeSpeedMaxMph != null },
    { key: "edgeBurstRate", weight: 0.25, present: bursts82 !== null },
  ]);

  // ── m_DZ: defensive-zone dome (repulsive curvature) ────────────
  let dzRaw = 0;
  if (asset.xgaRelTM != null)    dzRaw += 0.45 * z(-asset.xgaRelTM, cal.xgaSupp);
  if (asset.dps != null)         dzRaw += 0.35 * z(asset.dps, cal.dps);
  if (asset.pkTimeShare != null) dzRaw += 0.20 * z(asset.pkTimeShare, cal.pkShare);
  const mDz = squash(dzRaw * scale);
  const dzCoverage = zoneCoverage([
    { key: "xgaSuppression", weight: 0.45, present: asset.xgaRelTM != null },
    { key: "defensivePointShares", weight: 0.35, present: asset.dps != null },
    { key: "penaltyKillTimeShare", weight: 0.20, present: asset.pkTimeShare != null },
  ]);
  const coverage: GravityCoverage = {
    oz: ozCoverage,
    nz: nzCoverage,
    dz: dzCoverage,
  };

  // ── Assembly ───────────────────────────────────────────────────
  const force = r2(W_OZ * mOz + W_NZ * mNz + W_DZ * mDz);

  // Release A handoff: transition only. Direct offense and defensive
  // suppression remain in their existing X-NAV components.
  const navResidual = r2(W_NZ * mNz);

  // ── Reliability index ──────────────────────────────────────────
  const sampleConf = Math.min(games / 60, 1);
  const stabilityConf = baselineLift !== null ? signalStability : 0.5;
  const coverageConf = gravityCoverageRatio(coverage);
  const reliability = r2(clamp(
    0.40 * sampleConf + 0.40 * stabilityConf + 0.20 * coverageConf,
    0, 1,
  ));

  const tier = classifyTier(force);

  return {
    force,
    masses: { oz: r2(mOz), nz: r2(mNz), dz: r2(mDz) },
    navResidual,
    signalStability: r2(signalStability),
    partnerIndependence: r2(signalStability),
    reliability,
    confidence: reliability,
    dataQuality: coverageConf === 1 ? "full" : "partial",
    coverage,
    isDefenseman: isD,
    tier,
    description: TIER_DESC[tier],
  };
}

// ── Sim-engine on-ice term (G4 propagation) ──────────────────────
// The season simulator's skater currency is points pace, which prices
// scoring but is blind to the rest of the field: the DZ dome (suppression,
// PK trust) and most of the NZ well (play-driving that never lands on the
// scoresheet). This is the sim-side mirror of navResidual — there, X-NAV
// already prices lift + DZ so the residual excludes them; here, ptsPace
// already prices scoring, so the on-ice term weights DZ heaviest, NZ next,
// and OZ barely (creation shape beyond the box score). Reliability-damped
// so thin data can't swing a simulated season, and bounded to ±8 pace
// points so gravity nudges a roster rather than replacing the scoresheet.
export function simOnIceDelta(profile: GravityProfile | null): number {
  if (!profile) return 0;
  const { oz, nz, dz } = profile.masses;
  const raw = (0.55 * dz + 0.35 * nz + 0.10 * oz) * 12 * profile.reliability;
  return r2(clamp(raw, -8, 8));
}

// ── Tier color for UI rendering ──────────────────────────────────

export function gravityTierColor(tier: GravityTier): string {
  switch (tier) {
    case "SUPERMASSIVE":  return "var(--ledger-green)";
    case "STAR":          return "var(--ledger-green)";
    case "MAIN_SEQUENCE": return "var(--ledger-amber, #d4a017)";
    case "SATELLITE":     return "var(--ledger-ink-faint)";
    case "ASTEROID":      return "var(--ledger-ink-faint)";
    case "BLACK_HOLE":    return "var(--ledger-red)";
  }
}
