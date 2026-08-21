// ── Gravity v4 — profile builder (pure) ──────────────────────────
//
// Assembles one schema-valid GravityProfileV4 from fitted OZ + DZ coefficients.
// Pure and side-effect-free so a test can prove it against the SHIPPED validator
// (validate-profile.ts) without the dataset or the driver's file I/O. The driver
// (export-profiles.ts) supplies percentiles, scales and provenance; every honesty
// rule the schema enforces is realised here:
//   • DZ is positive-for-prevention → the raw (negative) defense coef is flipped.
//   • net xG is the UNWEIGHTED zone sum → with NZ absent, net = OZ + DZ.
//   • the NZ transition well has no data → marked missing, zero sample minutes,
//     which forces the schema's `insufficient` path and so NO public tier.

import { deriveGravityV4Display } from "../../app/lib/gravity-v4/display";
import type { GravityProfileV4, GravityReliabilityBand } from "../../app/lib/gravity-v4/types";

/** Rank of a value inside a sorted-ascending array as a 0–100 percentile
 *  (the share of the population strictly below it). */
export function percentileOf(sortedAsc: number[], v: number): number {
  if (sortedAsc.length === 0) return 0;
  let below = 0;
  for (const x of sortedAsc) { if (x < v) below++; else break; }
  return (below / sortedAsc.length) * 100;
}

export interface ProfileInput {
  playerId: string;
  playerName: string;
  position: "C" | "W" | "D";
  season: string;
  gravity60: number;                                     // OZ well (raw xG/60)
  defense60: number;                                     // raw defense coef (negative = suppresses)
  toiMin: number;
  gravityInterval60: { lo: number; hi: number } | null;  // OZ bootstrap CI (xG/60)
  defenseInterval60: { lo: number; hi: number } | null;  // raw defense bootstrap CI (xG/60)
  ozPositionPct: number | null;
  ozLeaguePct: number | null;
  dzPositionPct: number | null;
  dzLeaguePct: number | null;
  reliability: GravityReliabilityBand;
  scales: { zoneXg82: number; netXg82: number };
  min82: number;
  trainedAt: string;
  trainingSeasons: string[];
  sourceVersion: string;
}

export function buildGravityProfileV4(p: ProfileInput): GravityProfileV4 {
  const F = p.min82 / 60;
  const oz60 = p.gravity60;
  const dz60 = -p.defense60;                 // prevention is positive
  const oz82 = oz60 * F;
  const dz82 = dz60 * F;
  const netXg60 = oz60 + dz60;               // NZ = 0
  const netXg82 = oz82 + dz82;

  const ozInterval = p.gravityInterval60
    ? { low: p.gravityInterval60.lo * F, high: p.gravityInterval60.hi * F, level: 0.9 as const }
    : null;
  // The defense CI is on the raw (negative) coefficient; the flip reverses sign
  // AND order, so −hi becomes the new low.
  const dzInterval = p.defenseInterval60
    ? { low: -p.defenseInterval60.hi * F, high: -p.defenseInterval60.lo * F, level: 0.9 as const }
    : null;

  const display = deriveGravityV4Display(
    { ozXg82: oz82, nzXg82: 0, dzXg82: dz82 },
    p.scales,
  );

  return {
    playerId: p.playerId,
    playerName: p.playerName,
    position: p.position,
    season: p.season,
    zones: {
      oz: { xg60: oz60, xg82: oz82, interval: ozInterval, positionPercentile: p.ozPositionPct, leaguePercentile: p.ozLeaguePct, dataQuality: "full", sampleMinutes: p.toiMin },
      nz: { xg60: 0, xg82: 0, interval: null, positionPercentile: null, leaguePercentile: null, dataQuality: "insufficient", sampleMinutes: 0 },
      dz: { xg60: dz60, xg82: dz82, interval: dzInterval, positionPercentile: p.dzPositionPct, leaguePercentile: p.dzLeaguePct, dataQuality: "full", sampleMinutes: p.toiMin },
    },
    netXg60,
    netXg82,
    netInterval: null,                        // OZ and DZ were bootstrapped separately, not jointly
    positionPercentile: null,                 // no overall rank without the full three-well model
    leaguePercentile: null,
    seasonContributionXg: netXg60 * p.toiMin / 60,
    ...display,
    tier: null,                               // NZ missing ⇒ insufficient ⇒ no public tier
    reliability: p.reliability,
    portability: null,
    portabilityLabel: "UNKNOWN",
    transitionDataQuality: "missing",
    dataQuality: "partial",                   // OZ + DZ measured, NZ absent
    metadata: {
      modelVersion: "4.0",
      trainedAt: p.trainedAt,
      trainingSeasons: p.trainingSeasons,
      targetSeason: p.season,
      strengthState: "5v5",
      sourceVersion: p.sourceVersion,
      artifactKind: "fitted",
      visualScales: p.scales,
    },
  };
}
