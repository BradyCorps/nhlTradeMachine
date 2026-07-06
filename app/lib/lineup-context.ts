// ── Lineup Context — Cup Run Challenge Phase 3 ────────────────
// "Lines matter": slot multipliers reward putting talent where it
// plays, and change-of-scenery detection feeds the rollover's doubled
// breakout odds for players who moved into a better lineup slot.
// Pure helpers shared by the simulate route and the cup-run rollover.

export const FORWARD_SLOT_MULT = [1.08, 1.0, 0.92, 0.85] as const; // L1-L4
export const DEFENSE_SLOT_MULT = [1.06, 1.0, 0.90] as const;       // P1-P3

/** Multiplier for a player's index within his ordered unit. */
export function slotMultiplier(index: number, unit: "F" | "D"): number {
  if (unit === "F") return FORWARD_SLOT_MULT[Math.min(3, Math.floor(index / 3))];
  return DEFENSE_SLOT_MULT[Math.min(2, Math.floor(index / 2))];
}

interface LineupPlayer {
  id: string;
  teamId?: string | null;
  position: string;
  ptsPace: number;
  prospectPtsPace?: number | null;
}

const unitOf = (position: string): "F" | "D" | null => {
  if (position === "G" || position === "Pick") return null;
  return position === "D" ? "D" : "F";
};

const effectivePace = (p: LineupPlayer): number =>
  Math.max(p.ptsPace, (p.prospectPtsPace ?? 0) * 0.72);

/** Pace-sorted depth rank of a player inside one team's F or D group. */
function depthRank(player: LineupPlayer, roster: LineupPlayer[]): number {
  const unit = unitOf(player.position);
  if (!unit) return -1;
  const group = roster
    .filter((p) => unitOf(p.position) === unit)
    .sort((a, b) => effectivePace(b) - effectivePace(a));
  return group.findIndex((p) => p.id === player.id);
}

/**
 * Players who changed teams AND landed in a meaningfully better lineup
 * slot — top-six/top-four with a rank improvement. These get doubled
 * breakout odds in advanceSeason (the change-of-scenery flag as a real
 * sim input).
 */
export function computeChangeOfScenery(
  prevPlayers: LineupPlayer[],
  nextPlayers: LineupPlayer[],
): Set<string> {
  const scenery = new Set<string>();
  const prevById = new Map(prevPlayers.map((p) => [p.id, p]));

  for (const now of nextPlayers) {
    const before = prevById.get(now.id);
    const unit = unitOf(now.position);
    if (!before || !unit) continue;
    if (!before.teamId || !now.teamId || before.teamId === now.teamId) continue;
    if (now.teamId === "FA_POOL" || before.teamId === "FA_POOL") continue;

    const prevRoster = prevPlayers.filter((p) => p.teamId === before.teamId);
    const nextRoster = nextPlayers.filter((p) => p.teamId === now.teamId);
    const oldRank = depthRank(before, prevRoster);
    const newRank = depthRank(now, nextRoster);
    if (oldRank < 0 || newRank < 0) continue;

    const topCut = unit === "F" ? 6 : 4;
    if (newRank < topCut && newRank < oldRank) scenery.add(now.id);
  }
  return scenery;
}
