// ── Which "phase" did you mean? ──────────────────────────────────
//
// `Team.phase` carried two different facts. `/api/league` computes it from the
// live standings — conference rank, division rank, points percentage — and Team
// Analytics renders it as the club's tier chip and filters on it. Armchair GM
// then overwrote that same field in local state with `deriveTeamPhase()`, a
// read of the CURRENT roster's valuations, so that trading away a roster would
// move the badge.
//
// Both are legitimate. Storing them in one field was not: a club could be a
// Contender by the standings and Rebuilding by its roster, and `team.phase`
// would report whichever meaning last wrote to it. Worse, the overwrite was
// destructive — once Armchair GM ran, the standings tier was gone.
//
// They are two fields now. Almost every consumer wants the window: trade
// willingness, pick value, sim baselines, Cup Run difficulty and prospect
// development all reason about the roster in front of them, not last season's
// table. Only Team Analytics wants the tier. That asymmetry is why the bug
// stayed invisible — the wrong field was usually close enough.

import type { Team } from "@/app/lib/trade-types";

type WindowSource = Pick<Team, "phase" | "rosterWindow">;

/**
 * The club's competitive window: the live roster read when Armchair GM has
 * produced one, otherwise the standings tier as the best available stand-in.
 *
 * Callers reasoning about what a club would DO — trade for, pay for, build
 * toward — want this. Callers reporting where a club SITS in the standings want
 * `team.phase`.
 */
export function teamWindow(team: WindowSource | null | undefined): string {
  if (!team) return "";
  const live = team.rosterWindow;
  if (typeof live === "string" && live.trim()) return live;
  return team.phase ?? "";
}
