export interface CapDeltaAsset {
  capHit?: number | null;
  retainedPct?: number | null;
}

export interface CapDeltaMoves {
  incoming?: CapDeltaAsset[];
  outgoing?: CapDeltaAsset[];
}

export type TeamCapDeltaMap =
  | Record<string, CapDeltaMoves | undefined>
  | Map<string, CapDeltaMoves>;

export interface CapDeltaTeam {
  id: string;
  capSpace: number;
}

// The cap a team actually carries for a player after any retained salary. This
// is the single source of truth for retention math — the SIM must reuse it so
// its cap deltas can't drift from the trade UI (a $10M player at 50% retention
// is a $5M movement, not $10M).
export const effectiveCapHit = (asset: CapDeltaAsset): number => {
  const capHit = asset.capHit ?? 0;
  const retainedPct = asset.retainedPct ?? 0;

  return capHit * (1 - retainedPct);
};

const sumEffectiveCap = (assets: CapDeltaAsset[] = []): number =>
  assets.reduce((sum, asset) => sum + effectiveCapHit(asset), 0);

export const applyCapDelta = (baselineCapSpace: number, moves: CapDeltaMoves): number => {
  const incomingCap = sumEffectiveCap(moves.incoming);
  const outgoingCap = sumEffectiveCap(moves.outgoing);

  return baselineCapSpace - incomingCap + outgoingCap;
};

const getTeamMoves = (movesByTeam: TeamCapDeltaMap | undefined, teamId: string): CapDeltaMoves | undefined =>
  movesByTeam instanceof Map ? movesByTeam.get(teamId) : movesByTeam?.[teamId];

export const applyTeamCapDeltas = <T extends CapDeltaTeam>(
  teams: T[],
  movesByTeam?: TeamCapDeltaMap,
): T[] => teams.map((team) => {
  const moves = getTeamMoves(movesByTeam, team.id);
  if (!moves) return team;

  return {
    ...team,
    capSpace: Math.round(applyCapDelta(team.capSpace, moves) * 10) / 10,
  };
});
