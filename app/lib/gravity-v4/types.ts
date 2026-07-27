import type { GravityTier } from "@/app/lib/gravity";

export type GravityDataQuality = "full" | "proxy" | "partial" | "insufficient";
export type GravityReliabilityBand = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export type GravityTransitionDataQuality = "event" | "proxy" | "missing";
export type GravityArtifactKind = "fitted" | "diagnostic_fixture";

export interface GravityInterval {
  low: number;
  high: number;
  level: 0.9;
}

export interface GravityZoneEstimate {
  xg60: number;
  xg82: number;
  interval: GravityInterval | null;
  positionPercentile: number | null;
  leaguePercentile: number | null;
  dataQuality: GravityDataQuality;
  sampleMinutes: number;
}

export interface GravityVisualScales {
  zoneXg82: number;
  netXg82: number;
}

export interface GravityModelMetadata {
  modelVersion: "4.0";
  /** Null only for a diagnostic fixture that was never fitted. */
  trainedAt: string | null;
  trainingSeasons: string[];
  targetSeason: string;
  strengthState: "5v5";
  sourceVersion: string;
  artifactKind: GravityArtifactKind;
  visualScales: GravityVisualScales;
}

export interface GravityProfileV4 {
  playerId: string;
  playerName: string;
  position: "C" | "W" | "D";
  season: string;

  zones: {
    oz: GravityZoneEstimate;
    nz: GravityZoneEstimate;
    /** Positive values mean opponent expected goals prevented. */
    dz: GravityZoneEstimate;
  };

  /** Unweighted sum of the three zone values. */
  netXg60: number;
  /** Unweighted sum of the three zone values. */
  netXg82: number;
  netInterval: GravityInterval | null;
  positionPercentile: number | null;
  leaguePercentile: number | null;

  seasonContributionXg: number;
  displayForce: number;
  displayMasses: {
    oz: number;
    nz: number;
    dz: number;
  };

  /** Null when the sample is insufficient for a public tier. */
  tier: GravityTier | null;
  reliability: GravityReliabilityBand;
  portability: number | null;
  portabilityLabel: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

  transitionDataQuality: GravityTransitionDataQuality;
  dataQuality: GravityDataQuality;
  metadata: GravityModelMetadata;
}

export interface GravityV4ArtifactEnvelope {
  schemaVersion: "gravity-v4-profile-set/1";
  artifactKind: GravityArtifactKind;
  generatedAt: string;
  profiles: unknown[];
}
