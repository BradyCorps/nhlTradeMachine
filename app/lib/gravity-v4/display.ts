import type { GravityTier, ZoneMasses } from "@/app/lib/gravity";
import type { GravityProfileV4, GravityReliabilityBand } from "./types";

export function gravityDisplayValue(value: number, scale: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Gravity display input must be finite.");
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError("Gravity display scale must be a positive finite number.");
  }
  return Math.tanh(value / scale);
}

export function deriveGravityV4Display(
  values: { ozXg82: number; nzXg82: number; dzXg82: number },
  scales: { zoneXg82: number; netXg82: number },
): { displayForce: number; displayMasses: ZoneMasses } {
  const netXg82 = values.ozXg82 + values.nzXg82 + values.dzXg82;
  return {
    displayForce: gravityDisplayValue(netXg82, scales.netXg82),
    displayMasses: {
      oz: gravityDisplayValue(values.ozXg82, scales.zoneXg82),
      nz: gravityDisplayValue(values.nzXg82, scales.zoneXg82),
      dz: gravityDisplayValue(values.dzXg82, scales.zoneXg82),
    },
  };
}

const RELIABILITY_INDEX: Record<GravityReliabilityBand, number> = {
  HIGH: 0.9,
  MEDIUM: 0.7,
  LOW: 0.45,
  INSUFFICIENT: 0.2,
};

export interface GravityRinkDisplayProfile {
  force: number;
  masses: ZoneMasses;
  tier: GravityTier;
  isDefenseman: boolean;
  reliability: number;
}

/**
 * Adapts analytical v4 output to the existing rink renderer only. The
 * ASTEROID fallback supplies a neutral palette for an untiered profile; it
 * does not assign that analytical tier.
 */
export function toGravityRinkDisplayProfile(profile: GravityProfileV4): GravityRinkDisplayProfile {
  return {
    force: profile.displayForce,
    masses: profile.displayMasses,
    tier: profile.tier ?? "ASTEROID",
    isDefenseman: profile.position === "D",
    reliability: RELIABILITY_INDEX[profile.reliability],
  };
}
