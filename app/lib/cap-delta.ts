export interface CapDeltaAsset {
  capHit?: number | null;
  retainedPct?: number | null;
}

export interface CapDeltaMoves {
  incoming?: CapDeltaAsset[];
  outgoing?: CapDeltaAsset[];
}

const retainedCapHit = (asset: CapDeltaAsset): number => {
  const capHit = asset.capHit ?? 0;
  const retainedPct = asset.retainedPct ?? 0;

  return capHit * (1 - retainedPct);
};

const sumEffectiveCap = (assets: CapDeltaAsset[] = []): number =>
  assets.reduce((sum, asset) => sum + retainedCapHit(asset), 0);

export const applyCapDelta = (baselineCapSpace: number, moves: CapDeltaMoves): number => {
  const incomingCap = sumEffectiveCap(moves.incoming);
  const outgoingCap = sumEffectiveCap(moves.outgoing);

  return baselineCapSpace - incomingCap + outgoingCap;
};
