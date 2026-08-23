// ── strand-cohort.ts ─────────────────────────────────────────────
//
// ONE definition of "who a player is ranked against" in STRAND / percentile
// space: same position group, ≥20 GP this season, INCLUDING the player himself
// (exactly the filter the percentile card uses). The dossier, the player
// directory and the trade machine all build the cohort through this, so a
// player's percentile is identical wherever it appears — every surface ranks
// against the same field by construction, and the "trade machine says X, dossier
// says Y" drift is impossible.
//
// Cohort members are slimmed to the metric fields the rails read
// (strand-metrics.ts) so a cohort can be shipped to the client, or rebuilt from
// a fetched roster, without dragging the whole player record along.

import type { PlayerLike } from "./strand-metrics";

export type PosGroup = "F" | "D" | "G";

export function posGroupOf(pos: string): PosGroup {
  return pos === "G" ? "G" : pos === "D" ? "D" : "F";
}

export const STRAND_COHORT_NOUN: Record<PosGroup, string> = {
  F: "forwards",
  D: "defensemen",
  G: "goalies",
};

/** Minimum games played to enter the cohort. A three-game call-up is not the
 *  field an established player should be ranked against; this matches the
 *  ≥20 GP gate the percentile card and the dossier scatter already apply. */
export const STRAND_COHORT_MIN_GP = 20;

// The metric fields every rail reads. Anything else is dropped so a cohort stays
// small enough to hand to a client component. Kept in sync with the extractors
// in strand-metrics.ts — a field added there must be added here too or the
// cohort will read null for it.
function slim(p: Record<string, unknown>): PlayerLike {
  const g = (k: string): number | null => {
    const v = p[k];
    return typeof v === "number" && isFinite(v) ? v : null;
  };
  return {
    ops: g("ops"), dps: g("dps"), ptsPace: g("ptsPace"),
    xGPace: g("xGPace"), xgRelTM: g("xgRelTM"), avgTOI: g("avgTOI"),
    xgaRelTM: g("xgaRelTM"), qocIndex: g("qocIndex"), dzPct: g("dzPct"),
    gsax: g("gsax"), savePct: g("savePct"), baselineHdsvPct: g("baselineHdsvPct"),
    gamesStarted: g("gamesStarted"), gamesPlayed: g("gamesPlayed"), games: g("games"),
    shotsPerGame: g("shotsPerGame"), gaa: g("gaa"),
  };
}

/** Everyone in a position group with enough games — the cohort every member of
 *  that group is ranked against. Each player is included in their own cohort,
 *  exactly as the percentile card does. */
export function cohortForGroup(
  allPlayers: readonly Record<string, unknown>[],
  group: PosGroup,
): PlayerLike[] {
  const out: PlayerLike[] = [];
  for (const p of allPlayers) {
    if (!p) continue;
    const pos = p.position;
    if (typeof pos !== "string" || pos === "Pick") continue;
    if (posGroupOf(pos) !== group) continue;
    const games = typeof p.games === "number" ? p.games : 0;
    if (games < STRAND_COHORT_MIN_GP) continue;
    out.push(slim(p));
  }
  return out;
}

/** The cohort a specific player is ranked against. */
export function buildStrandCohort(
  allPlayers: readonly Record<string, unknown>[],
  player: { position: string },
): PlayerLike[] {
  return cohortForGroup(allPlayers, posGroupOf(player.position));
}
