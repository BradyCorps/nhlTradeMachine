import type { GravityTier, ZoneMasses } from "@/app/lib/gravity";
import type { GravityProfileV4, GravityReliabilityBand, GravityZoneEstimate } from "./types";

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

/**
 * Whether a zone carries a fitted estimate. The shipped artifact stores an
 * unavailable zone (NZ, excluded at split-half r=0.099) as `xg60: 0, xg82: 0,
 * dataQuality: "insufficient", sampleMinutes: 0` because the schema's
 * `net = OZ + NZ + DZ` identity needs a number. That zero is a placeholder,
 * not an estimate, and must never be shown as "+0.0" — every display surface
 * routes through here and prints "not available" instead.
 */
export function gravityZoneAvailable(zone: GravityZoneEstimate): boolean {
  return zone.dataQuality !== "insufficient";
}

/** The zone's xG/82 when fitted, null when the zone is unavailable. */
export function gravityZoneXg82OrNull(zone: GravityZoneEstimate): number | null {
  return gravityZoneAvailable(zone) ? zone.xg82 : null;
}

/** "OZ + DZ" when NZ is unavailable, "OZ + NZ + DZ" when all three are fitted. */
export function gravityNetScopeLabel(profile: GravityProfileV4): string {
  const parts: string[] = [];
  if (gravityZoneAvailable(profile.zones.oz)) parts.push("OZ");
  if (gravityZoneAvailable(profile.zones.nz)) parts.push("NZ");
  if (gravityZoneAvailable(profile.zones.dz)) parts.push("DZ");
  return parts.join(" + ");
}
