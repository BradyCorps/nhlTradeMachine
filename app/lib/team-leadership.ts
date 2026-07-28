// ── Who wears the letters ────────────────────────────────────────
//
// `app/data/leadership.ts` has carried curated C/A letters all along, but only
// as a scoring input — a bonus inside `lineup-ranking` and the sim. Nothing
// ever showed them, so the roster read as an undifferentiated list of names
// where the real thing has a captain and two alternates on every sweater.
//
// The curated table is deliberately partial: it covers the players whose
// letters matter to lineup ranking, not all 32 rosters. So this resolves what
// is actually present rather than assuming a full set — a club with no curated
// captain gets `captain: null`, not a promoted alternate. Inventing a captain
// to fill a slot would put a letter on a real player who does not wear one,
// which is worse than showing nothing.

import { leadershipFor, type LeadershipRole } from "@/app/data/leadership";

export interface TeamLeadership {
  captain: string | null;
  /** At most two, in the order they should be displayed. */
  alternates: string[];
}

/** The NHL dresses one captain and (by convention) two alternates. */
export const MAX_ALTERNATES = 2;

type LeadershipCandidate = {
  id?: string;
  name: string;
  position?: string;
};

/**
 * The letters on one club's roster.
 *
 * `rank` orders alternates when a roster carries more than two — pass the same
 * ordering the lineup uses so the letters agree with the sheet beneath them.
 * Higher sorts first. Ties break on name, so the result cannot jitter between
 * renders on equal input.
 *
 * A goaltender is never given a letter: the NHL does not permit a goalie to
 * wear one on the ice.
 */
export function teamLeadership(
  roster: LeadershipCandidate[],
  rank: (player: LeadershipCandidate) => number = () => 0,
): TeamLeadership {
  const withRole = roster
    .filter(p => p.position !== "G" && p.position !== "Pick")
    .map(p => ({ player: p, role: leadershipFor(p.name) }))
    .filter((entry): entry is { player: LeadershipCandidate; role: LeadershipRole } =>
      entry.role != null);

  const byRank = (
    a: { player: LeadershipCandidate },
    b: { player: LeadershipCandidate },
  ) => rank(b.player) - rank(a.player) || a.player.name.localeCompare(b.player.name);

  const captains = withRole.filter(e => e.role === "C").sort(byRank);
  const alternates = withRole.filter(e => e.role === "A").sort(byRank);

  return {
    captain: captains[0]?.player.name ?? null,
    alternates: alternates.slice(0, MAX_ALTERNATES).map(e => e.player.name),
  };
}

/**
 * The letter to render beside a player, given their club's resolved
 * leadership — not the raw curated role.
 *
 * These differ, and the difference is the point: a curated "A" who is third in
 * line on a deep roster wears no letter, because only two are dressed. Reading
 * the curated table directly would put three A's on the ice.
 */
export function letterFor(
  name: string | null | undefined,
  leadership: TeamLeadership,
): LeadershipRole | null {
  if (!name) return null;
  if (leadership.captain === name) return "C";
  return leadership.alternates.includes(name) ? "A" : null;
}
