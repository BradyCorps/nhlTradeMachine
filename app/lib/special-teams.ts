// ── Special teams (RL6) ──────────────────────────────────────────
//
// The lineup sheet was 5-on-5 only: four forward lines, three pairs, two
// goalies. Every club in the league spends roughly a fifth of the game on
// special teams, and the difference between a first and second power-play unit
// is most of the gap between a 60-point winger and an 80-point one — so a
// lineup editor that cannot express it is not really setting a lineup.
//
// Units are stored flat and sliced, rather than as nested arrays, because the
// existing lineup orders are flat id lists and the merge/prune/lock machinery
// already works on that shape.
//
//   powerPlay   10 ids → PP1 = 0-4,  PP2 = 5-9   (5 skaters a unit)
//   penaltyKill  8 ids → PK1 = 0-3,  PK2 = 4-7   (4 skaters a unit)

import type { LineupPlayer } from "@/app/lib/lineup-order";
import { isD, isF } from "@/app/lib/lineup-order";

export const PP_UNIT_SIZE = 5;
export const PK_UNIT_SIZE = 4;
export const UNIT_COUNT = 2;

export const PP_SLOTS = PP_UNIT_SIZE * UNIT_COUNT;
export const PK_SLOTS = PK_UNIT_SIZE * UNIT_COUNT;

/** A power play dresses four forwards and a defenceman; a kill, two and two. */
export const PP_FORWARDS_PER_UNIT = 4;
export const PP_DEFENCE_PER_UNIT = 1;
export const PK_FORWARDS_PER_UNIT = 2;
export const PK_DEFENCE_PER_UNIT = 2;

export interface SpecialTeamsOrder {
  powerPlay: string[];
  penaltyKill: string[];
}

export type SpecialTeamsSituation = "EV" | "PP" | "PK";

export const emptySpecialTeams = (): SpecialTeamsOrder => ({ powerPlay: [], penaltyKill: [] });

/** Which unit (1 or 2) a slot belongs to, or null when out of range. */
export function unitForSlot(slot: number, unitSize: number): 1 | 2 | null {
  if (slot < 0 || slot >= unitSize * UNIT_COUNT) return null;
  return (Math.floor(slot / unitSize) + 1) as 1 | 2;
}

/** The unit a player is on, or null if he does not play that situation. */
export function unitOf(
  playerId: string | null | undefined,
  ids: string[],
  unitSize: number,
): 1 | 2 | null {
  if (!playerId) return null;
  const slot = ids.indexOf(playerId);
  return slot < 0 ? null : unitForSlot(slot, unitSize);
}

export const powerPlayUnit = (id: string | null | undefined, o: SpecialTeamsOrder) =>
  unitOf(id, o.powerPlay, PP_UNIT_SIZE);
export const penaltyKillUnit = (id: string | null | undefined, o: SpecialTeamsOrder) =>
  unitOf(id, o.penaltyKill, PK_UNIT_SIZE);

// ── Default units ────────────────────────────────────────────────
//
// A power play is picked on offence and a kill on defence, so they rank on
// different things. Both fall back to `ptsPace` only as a last resort — a
// roster with no measured rates should still produce a plausible sheet rather
// than an empty one.

const ppScore = (p: LineupPlayer & { goalsPace?: number; assistsPace?: number; ptsPace?: number }) =>
  (p.ptsPace ?? 0) + (p.goalsPace ?? 0) * 0.5;

const pkScore = (p: LineupPlayer & { defRate?: number; pkTimeShare?: number; avgTOI?: number }) =>
  (p.pkTimeShare ?? 0) * 100 + (p.defRate ?? 0) * 40 + (p.avgTOI ?? 0) * 0.5;

function pickUnits(
  roster: LineupPlayer[],
  score: (p: any) => number,
  forwardsPerUnit: number,
  defencePerUnit: number,
): string[] {
  const byScore = (a: LineupPlayer, b: LineupPlayer) =>
    score(b) - score(a) || a.name.localeCompare(b.name);

  const forwards = roster.filter(isF).sort(byScore);
  const defence = roster.filter(isD).sort(byScore);

  const out: string[] = [];
  for (let unit = 0; unit < UNIT_COUNT; unit++) {
    const f = forwards.slice(unit * forwardsPerUnit, (unit + 1) * forwardsPerUnit);
    const d = defence.slice(unit * defencePerUnit, (unit + 1) * defencePerUnit);
    out.push(...f.map(p => p.id), ...d.map(p => p.id));
  }
  return out;
}

export const defaultPowerPlay = (roster: LineupPlayer[]): string[] =>
  pickUnits(roster, ppScore, PP_FORWARDS_PER_UNIT, PP_DEFENCE_PER_UNIT);

export const defaultPenaltyKill = (roster: LineupPlayer[]): string[] =>
  pickUnits(roster, pkScore, PK_FORWARDS_PER_UNIT, PK_DEFENCE_PER_UNIT);

export const defaultSpecialTeams = (roster: LineupPlayer[]): SpecialTeamsOrder => ({
  powerPlay: defaultPowerPlay(roster),
  penaltyKill: defaultPenaltyKill(roster),
});

/**
 * Keep a saved sheet across a roster change.
 *
 * Departed players are dropped and the gaps closed, then any remaining slots
 * are filled from the default sheet — a unit with a hole in it would silently
 * play short, which is not a thing that happens.
 */
export function hydrateSpecialTeams(
  roster: LineupPlayer[],
  saved?: Partial<SpecialTeamsOrder> | null,
): SpecialTeamsOrder {
  const alive = new Set(roster.map(p => p.id));

  const merge = (savedIds: string[] | undefined, fallback: string[], slots: number) => {
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const id of savedIds ?? []) {
      if (!alive.has(id) || seen.has(id)) continue;
      seen.add(id);
      kept.push(id);
      if (kept.length === slots) break;
    }
    for (const id of fallback) {
      if (kept.length === slots) break;
      if (seen.has(id) || !alive.has(id)) continue;
      seen.add(id);
      kept.push(id);
    }
    return kept;
  };

  const fallback = defaultSpecialTeams(roster);
  return {
    powerPlay: merge(saved?.powerPlay, fallback.powerPlay, PP_SLOTS),
    penaltyKill: merge(saved?.penaltyKill, fallback.penaltyKill, PK_SLOTS),
  };
}

// ── Sim contribution ─────────────────────────────────────────────
//
// A first-unit power play is worth roughly a fifth of a top forward's scoring;
// a second unit, a fraction of that. The kill pays nothing in points — PK time
// displaces even-strength time, so a heavy killer scores slightly *less* — but
// it does mean a coach trusts you, which shows up as games played.
//
// These are deliberately modest. The sim already applies line-based
// multipliers, and special teams must not become a second, larger lever that
// swamps them.

export const PP_POINT_BONUS: Record<1 | 2, number> = { 1: 0.14, 2: 0.05 };
export const PK_POINT_PENALTY: Record<1 | 2, number> = { 1: -0.04, 2: -0.02 };
export const PK_GAMES_BONUS: Record<1 | 2, number> = { 1: 4, 2: 2 };

/**
 * Multiplier applied to a skater's projected scoring for his special-teams
 * deployment. 1.0 means "plays neither".
 */
export function specialTeamsPointMultiplier(
  playerId: string,
  order: SpecialTeamsOrder,
): number {
  const pp = powerPlayUnit(playerId, order);
  const pk = penaltyKillUnit(playerId, order);
  return 1 + (pp ? PP_POINT_BONUS[pp] : 0) + (pk ? PK_POINT_PENALTY[pk] : 0);
}

/** Extra games a killer is trusted with. */
export function specialTeamsGamesBonus(
  playerId: string,
  order: SpecialTeamsOrder,
): number {
  const pk = penaltyKillUnit(playerId, order);
  return pk ? PK_GAMES_BONUS[pk] : 0;
}

/**
 * Whether an explicit sheet exists for this club.
 *
 * The sim carries a `pkTimeShare` heuristic that estimates kill usage from
 * last season's ice time. Once a user has assigned units, that heuristic must
 * be switched OFF rather than stacked on top — otherwise a penalty killer is
 * counted twice, which is the same double-count that nearly broke the goalie
 * tandem in RL7.
 */
export const hasExplicitSpecialTeams = (order?: Partial<SpecialTeamsOrder> | null): boolean =>
  (order?.powerPlay?.length ?? 0) > 0 || (order?.penaltyKill?.length ?? 0) > 0;
