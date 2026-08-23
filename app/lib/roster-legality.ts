// ── Roster legality gate (SIM-CONS / audit P0-2) ─────────────────
//
// A team must be able to ice a legal NHL lineup — 12 forwards, 6 defensemen,
// and 2 goaltenders — before its season can be simulated. Without this check a
// user could let free agents walk (or trade a position bare) down to 10F/3D/1G
// and the sim would still hand back a complete 82-game season for a team that
// cannot dress a legal lineup. This is a pure counting helper so the same
// verdict is used by the Armchair GM gate and by the simulate route's
// diagnostics; it never mutates anything.

/** Standard dressed-lineup minimums. A team carries more, but never fewer. */
export const NHL_ROSTER_MINIMUMS = { forwards: 12, defense: 6, goalies: 2 } as const;

export interface RosterMinimums {
  forwards: number;
  defense: number;
  goalies: number;
}

export interface RosterLegality {
  forwards: number;
  defense: number;
  goalies: number;
  legal: boolean;
  /** How many of each are still missing (0 when met). */
  deficits: RosterMinimums;
  /** Human phrase for the shortfall, e.g. "2 forwards and 1 goaltender". Null when legal. */
  shortfall: string | null;
}

// Forward = anything that skates and is not a defenseman, goalie, or pick —
// matches roster-picker.ts and the simulate route's position grouping.
const isForward = (pos?: string) => pos !== "D" && pos !== "G" && pos !== "Pick";

function phrase(deficits: RosterMinimums): string | null {
  const parts: string[] = [];
  if (deficits.forwards > 0) parts.push(`${deficits.forwards} forward${deficits.forwards === 1 ? "" : "s"}`);
  if (deficits.defense > 0) parts.push(`${deficits.defense} ${deficits.defense === 1 ? "defenseman" : "defensemen"}`);
  if (deficits.goalies > 0) parts.push(`${deficits.goalies} goaltender${deficits.goalies === 1 ? "" : "s"}`);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * Count a team's forwards / defense / goalies and decide whether it can ice a
 * legal lineup. Pass a `teamId` to score just that club's players, or omit it
 * when `players` is already one team's roster.
 */
export function rosterLegality(
  players: Array<{ position?: string; teamId?: string }>,
  teamId?: string,
  minimums: RosterMinimums = NHL_ROSTER_MINIMUMS,
): RosterLegality {
  let forwards = 0;
  let defense = 0;
  let goalies = 0;
  for (const p of players) {
    if (teamId != null && p.teamId !== teamId) continue;
    if (p.position === "Pick") continue;
    if (p.position === "G") goalies++;
    else if (p.position === "D") defense++;
    else if (isForward(p.position)) forwards++;
  }

  const deficits: RosterMinimums = {
    forwards: Math.max(0, minimums.forwards - forwards),
    defense: Math.max(0, minimums.defense - defense),
    goalies: Math.max(0, minimums.goalies - goalies),
  };
  const legal = deficits.forwards === 0 && deficits.defense === 0 && deficits.goalies === 0;

  return { forwards, defense, goalies, legal, deficits, shortfall: legal ? null : phrase(deficits) };
}

/** One-line, user-facing explanation of why a team cannot be simulated. */
export function rosterLegalityMessage(teamName: string, legality: RosterLegality): string {
  return (
    `${teamName} can't ice a legal lineup — short ${legality.shortfall}. ` +
    `A team must dress 12 forwards, 6 defensemen, and 2 goaltenders ` +
    `(you have ${legality.forwards}F / ${legality.defense}D / ${legality.goalies}G). ` +
    `Sign or acquire players before simulating.`
  );
}
