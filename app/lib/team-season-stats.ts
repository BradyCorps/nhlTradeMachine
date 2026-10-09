import type { ObservedSelection, ObservedStats } from "@/app/lib/observed-season";
import type { LineupPlayer } from "@/app/lib/manual-team-lineups";

export function selectedPlayerStats(players: { id: string; observedStats?: ObservedStats }[], selection: ObservedSelection) {
  return Object.fromEntries(players.filter(player => player.observedStats?.season === selection.season
    && player.observedStats.gameType === selection.gameType).map(player => [String(player.id), player.observedStats!]));
}

export function teamSeasonLeaders(roster: LineupPlayer[], teamId: string, stats: Record<string, ObservedStats>) {
  const observed = roster.filter(player => player.teamId === teamId).flatMap(player => {
    const row = stats[player.id];
    return row?.coverage === "available" && row.games !== null && row.games > 0 ? [{ ...player, stats: row }] : [];
  });
  return {
    skaters: observed.filter(player => player.position !== "G" && player.stats.points !== null)
      .sort((a, b) => b.stats.points! - a.stats.points! || (b.stats.goals ?? -1) - (a.stats.goals ?? -1) || a.name.localeCompare(b.name)).slice(0, 5),
    goalies: observed.filter(player => player.position === "G")
      .sort((a, b) => b.stats.games! - a.stats.games! || a.name.localeCompare(b.name)),
  };
}

export function seasonStat(value: number | null | undefined, decimals = 0) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(decimals);
}
