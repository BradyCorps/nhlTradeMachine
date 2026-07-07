import type { Asset } from "@/app/lib/trade-types";

export interface TeamEdgeProfile {
  sampleSize: number;
  ozPct: number | null;
  ozPercentile: number | null;
  avgSpeedMaxMph: number | null;
  fastestSpeedMph: number | null;
  burstsOver20PerPlayer: number | null;
  hdFinishingDelta: number | null;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const weightedAverage = (
  rows: Asset[],
  pickValue: (asset: Asset) => number | null | undefined,
): number | null => {
  let total = 0;
  let weightTotal = 0;
  for (const asset of rows) {
    const value = pickValue(asset);
    if (!isFiniteNumber(value)) continue;
    const weight = asset.games > 0 ? asset.games : 1;
    total += value * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? total / weightTotal : null;
};

const average = (
  rows: Asset[],
  pickValue: (asset: Asset) => number | null | undefined,
): number | null => {
  const values = rows.map(pickValue).filter(isFiniteNumber);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export function computeTeamEdgeProfile(roster: Asset[]): TeamEdgeProfile | null {
  const skaters = roster.filter((asset) => asset.position !== "G" && asset.position !== "Pick");
  const sample = skaters.filter((asset) =>
    asset.edgeOzPct != null ||
    asset.edgeOzPercentile != null ||
    asset.edgeSpeedMaxMph != null ||
    asset.edgeBurstsOver20 != null ||
    asset.hdFinishingDelta != null
  );

  if (sample.length === 0) return null;

  const speeds = sample.map((asset) => asset.edgeSpeedMaxMph).filter(isFiniteNumber);

  return {
    sampleSize: sample.length,
    ozPct: weightedAverage(sample, (asset) => asset.edgeOzPct),
    ozPercentile: average(sample, (asset) => asset.edgeOzPercentile),
    avgSpeedMaxMph: average(sample, (asset) => asset.edgeSpeedMaxMph),
    fastestSpeedMph: speeds.length > 0 ? Math.max(...speeds) : null,
    burstsOver20PerPlayer: average(sample, (asset) => asset.edgeBurstsOver20),
    hdFinishingDelta: average(sample, (asset) => asset.hdFinishingDelta),
  };
}
