import { z } from "zod";
import { TEAMS_DB } from "@/app/lib/db";
import { OBSERVED_SEASONS, type ObservedSelection } from "@/app/lib/observed-season";
import { validGameDate } from "@/app/lib/nhl-games";

const playerId = z.string().min(1).max(100);
const slot = playerId.nullable();
export const manualLineupSchema = z.object({
  teamId: z.string().refine(id => TEAMS_DB.some(team => team.id === id), "Unknown team"),
  season: z.enum(OBSERVED_SEASONS),
  gameType: z.union([z.literal(2), z.literal(3)]),
  asOfDate: z.string().refine(validGameDate, "Choose a valid lineup date"),
  source: z.string().trim().max(160),
  sourceUrl: z.union([z.literal(""), z.string().url().max(1000).refine(url => /^https?:\/\//i.test(url), "Use an HTTP or HTTPS source link")]),
  forwards: z.array(z.array(slot).length(3)).length(4),
  defense: z.array(z.array(slot).length(2)).length(3),
  goalies: z.array(slot).length(2),
  scratches: z.array(playerId).max(20),
}).strict();
export type ManualLineupInput = z.infer<typeof manualLineupSchema>;
export const storedManualLineupSchema = manualLineupSchema.extend({
  revision: z.string().uuid(), updatedAt: z.string().datetime(),
}).strict();
export type ManualTeamLineup = z.infer<typeof storedManualLineupSchema>;
export interface LineupPlayer { id: string; name: string; teamId?: string | null; position: string }

export function manualLineupKey(teamId: string, selection: ObservedSelection): string {
  return `manual-lineup:v1:${selection.season}:${selection.gameType}:${teamId}`;
}

export function emptyManualLineup(teamId: string, selection: ObservedSelection, asOfDate: string): ManualLineupInput {
  return { teamId, ...selection, asOfDate, source: "", sourceUrl: "",
    forwards: Array.from({ length: 4 }, () => [null, null, null]),
    defense: Array.from({ length: 3 }, () => [null, null]), goalies: [null, null], scratches: [] };
}

export function validateLineupPlayers(lineup: ManualLineupInput, roster: LineupPlayer[]): void {
  const players = new Map(roster.filter(p => p.teamId === lineup.teamId && p.position !== "Pick").map(p => [p.id, p]));
  const seen = new Set<string>();
  const check = (id: string | null, positions?: string[]) => {
    if (id === null) return;
    const player = players.get(id);
    if (!player) throw new Error("A selected player is no longer on this team's assigned roster. Reload the roster.");
    if (seen.has(id)) throw new Error(`${player.name} is selected more than once`);
    if (positions && !positions.includes(player.position)) throw new Error(`${player.name} cannot fill that position group`);
    seen.add(id);
  };
  lineup.forwards.flat().forEach(id => check(id, ["C", "W", "L", "R"]));
  lineup.defense.flat().forEach(id => check(id, ["D"]));
  lineup.goalies.forEach(id => check(id, ["G"]));
  lineup.scratches.forEach(id => check(id));
  if (!seen.size) throw new Error("Select at least one player, or remove the manual lineup");
}
