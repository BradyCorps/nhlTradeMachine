// ── Roster grid picker grouping (TM1) ────────────────────────────
// The Trade Machine's visual roster grid: given a team, split its roster
// into forward / defense / goalie / pick groups, dropping anything already
// staged in the block, ranked so the best assets read first. Pure — the
// grid component just maps over the result.

import type { Asset } from "./trade-types";

export interface RosterGroups {
  forwards: Asset[];
  defense: Asset[];
  goalies: Asset[];
  picks: Asset[];
}

const isForward = (p: Asset) =>
  p.position !== "D" && p.position !== "G" && p.position !== "Pick";

export function groupTeamRoster(
  players: Asset[],
  teamId: string | null | undefined,
  selectedIds: Set<string>,
  rank?: (a: Asset) => number,
): RosterGroups {
  if (!teamId) return { forwards: [], defense: [], goalies: [], picks: [] };

  const mine = players.filter(p => p.teamId === teamId && !selectedIds.has(p.id));
  const byRank = (a: Asset, b: Asset) => {
    if (rank) {
      const d = rank(b) - rank(a);
      if (d) return d;
    }
    return (b.capHit ?? 0) - (a.capHit ?? 0) || a.name.localeCompare(b.name);
  };

  return {
    forwards: mine.filter(isForward).sort(byRank),
    defense:  mine.filter(p => p.position === "D").sort(byRank),
    goalies:  mine.filter(p => p.position === "G").sort(byRank),
    // Picks read chronologically (year then round), not by cap.
    picks:    mine.filter(p => p.position === "Pick").sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function rosterGroupCount(groups: RosterGroups): number {
  return groups.forwards.length + groups.defense.length + groups.goalies.length + groups.picks.length;
}
