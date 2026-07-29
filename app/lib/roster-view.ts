// ── Roster view (RL2) ────────────────────────────────────────────
//
// The roster listing lived inside Season Results, under a tab called "Team
// Numbers" — which meant you could only look at your own roster *after*
// simulating a season, and it sat three clicks away from the trade bench where
// roster questions actually get asked. It is a Roster tab now, ahead of
// Lineups, because you read a roster before you set lines.
//
// Two facts the old placement got right and this must preserve: rows are
// ordered by production, and once a season has been simulated the numbers
// shown are that season's, not the pre-season baseline. A roster that still
// reported last year's points after you simulated a year would be lying about
// the only thing the page is for.

import type { Asset, XNAVResult } from "@/app/lib/trade-types";

/** One skater's simulated season, as returned by /api/simulate. */
export interface ProjectedSeason {
  playerId: string;
  name: string;
  projectedPts: number;
  projectedGoals: number;
  projectedAssists: number;
  gamesPlayed: number;
  projectedTOI?: number;
  breakoutTag?: string;
}

export interface RosterRow {
  asset: Asset;
  /** Games, goals, assists, points for the season being shown. */
  games: number;
  goals: number;
  assists: number;
  points: number;
  toi: number;
  nav: number | null;
  /** True when these numbers came from a simulated season, not the baseline. */
  simulated: boolean;
  breakoutTag?: string;
}

/**
 * Baseline production for a player who has no simulated season.
 *
 * `ptsPace` and friends are 82-game rates, so they are scaled back to the
 * games actually played — showing an 82-game pace beside a simulated 61-game
 * total would put two different units in one column.
 */
function baselineRow(asset: Asset, nav: number | null): RosterRow {
  const games = Math.max(0, Math.round(asset.games ?? 0));
  const scale = games > 0 ? games / 82 : 0;
  const goals = Math.round((asset.goalsPace ?? 0) * scale);
  const assists = Math.round((asset.assistsPace ?? 0) * scale);
  const paced = Math.round((asset.ptsPace ?? 0) * scale);

  return {
    asset,
    games,
    goals,
    assists,
    // Prefer the split parts when they are present so the row adds up, but
    // never let rounding make G + A disagree with the points column.
    points: goals + assists > 0 ? goals + assists : paced,
    toi: asset.avgTOI ?? 0,
    nav,
    simulated: false,
  };
}

/**
 * Build the roster rows for one club, ordered by points.
 *
 * `projected` is the simulated season keyed by player id, when one exists.
 * Picks are excluded — a draft pick has no production and no lineup slot, and
 * padding the roster with rows of dashes helps nobody.
 *
 * Ties break on games played then name, so the order cannot jitter between
 * renders when two players finish level.
 */
export function buildRosterRows(
  roster: Asset[],
  navMap: Record<string, XNAVResult> | undefined,
  projected?: Map<string, ProjectedSeason> | null,
): RosterRow[] {
  const rows = roster
    .filter(p => p.position !== "Pick")
    .map(asset => {
      const nav = navMap?.[asset.id]?.total ?? null;
      const sim = projected?.get(asset.id);
      if (!sim) return baselineRow(asset, nav);

      return {
        asset,
        games: Math.max(0, Math.round(sim.gamesPlayed ?? 0)),
        goals: Math.max(0, Math.round(sim.projectedGoals ?? 0)),
        assists: Math.max(0, Math.round(sim.projectedAssists ?? 0)),
        points: Math.max(0, Math.round(sim.projectedPts ?? 0)),
        toi: sim.projectedTOI ?? asset.avgTOI ?? 0,
        nav,
        simulated: true,
        breakoutTag: sim.breakoutTag,
      };
    });

  return rows.sort((a, b) =>
    b.points - a.points
    || b.games - a.games
    || a.asset.name.localeCompare(b.asset.name));
}

/**
 * Index a simulation's skater projections by player id.
 *
 * Returns null when there is no simulated season for this club, which is the
 * signal for the rows to fall back to the baseline rather than render empty.
 */
export function projectedSeasonIndex(
  simTeam: { projectedSkaters?: ProjectedSeason[] } | null | undefined,
): Map<string, ProjectedSeason> | null {
  const skaters = simTeam?.projectedSkaters;
  if (!Array.isArray(skaters) || skaters.length === 0) return null;

  const byId = new Map<string, ProjectedSeason>();
  for (const s of skaters) {
    if (s?.playerId) byId.set(String(s.playerId), s);
  }
  return byId.size > 0 ? byId : null;
}

/** The simulated team block for `teamId`, from either sim response shape. */
export function simTeamFor(
  simData: unknown,
  teamId: string | null | undefined,
): { projectedSkaters?: ProjectedSeason[] } | null {
  if (!simData || typeof simData !== "object" || !teamId) return null;
  const d = simData as Record<string, any>;

  for (const candidate of [d.homeTeam, d.partnerTeam]) {
    if (candidate?.teamId === teamId) return candidate;
  }
  if (Array.isArray(d.standings)) {
    return d.standings.find((t: any) => t?.teamId === teamId) ?? null;
  }
  return null;
}

/** Roster totals, for the tab's summary strip. */
export function rosterTotals(rows: RosterRow[]) {
  return rows.reduce(
    (acc, r) => ({
      players: acc.players + 1,
      goals: acc.goals + r.goals,
      assists: acc.assists + r.assists,
      points: acc.points + r.points,
      capHit: acc.capHit + (r.asset.capHit ?? 0) * (1 - (r.asset.retainedPct ?? 0)),
    }),
    { players: 0, goals: 0, assists: 0, points: 0, capHit: 0 },
  );
}
