export interface PlayerBaseline {
  playerId: number;
  name: string;
  baselinePtsPace?: number;
  baselineGameScore?: number;
  baselineDpsProxy?: number;
  baselineGsax?: number;
  baselineXgRel?: number;
  ppPtsPace82?: number;
  pkTimeShare?: number;
  baselineIxg82?: number;
  baselineHits82?: number;
  baselineBlocks82?: number;
  baselineEsXgfPct?: number;
  pairXgfPct?: number;
  pairDriverScore?: number;
  baselineHdsvPct?: number;
  baselineGsaaPerGame?: number;
  totalSeasonsWeighted?: number;
}

export type PlayerBaselineMap = Record<string, PlayerBaseline>;

export function baselineForNhlPlayerId(
  baselines: PlayerBaselineMap,
  playerId: unknown,
): Partial<PlayerBaseline> {
  const key = typeof playerId === "number" || typeof playerId === "string"
    ? String(playerId)
    : "";
  const numericId = Number(key);
  if (
    !/^\d+$/.test(key)
    || !Number.isSafeInteger(numericId)
    || numericId <= 0
  ) return {};
  const baseline = baselines[key];
  return baseline?.playerId === numericId ? baseline : {};
}
