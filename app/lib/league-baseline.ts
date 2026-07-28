// ── League baseline snapshots ────────────────────────────────────
//
// The Armchair GM page keeps two league references, and they are NOT the same
// thing:
//
//   db          the live league, mutated by trades and the offseason
//   originalDb  the league at the start of the CURRENT season — overwritten by
//               every Cup Run rollover, so it ages with the run
//
// Neither is a baseline. Starting a new run, or abandoning one, has to return to
// the league as first loaded (2026-27) — otherwise a second run begins on a
// league that a previous run already aged three years, with players retired and
// rookies drafted, while the run state says Year 1.
//
// A snapshot is only a baseline if nothing downstream can reach back and change
// it. Entities are copied, not shared, so a later in-place field assignment on a
// live player cannot silently rewrite history.

import type { Asset, Team } from "./trade-types";

export interface LeagueSnapshot {
  teams: Team[];
  players: Asset[];
  capCeiling?: number | null;
}

/**
 * Copy a league so the result shares no team or player object with the input.
 *
 * Entity-level copies, not a deep clone: the realistic corruption is a field
 * assignment on a player or team (`p.capHit = …`), not mutation of a nested
 * stats blob. Keeping it shallow-per-entity also keeps a ~1000-player copy
 * cheap enough to run on every reset.
 */
export function cloneLeague<T extends LeagueSnapshot>(db: T): LeagueSnapshot {
  return {
    ...db,
    teams: db.teams.map(t => ({ ...t })),
    players: db.players.map(p => ({ ...p })),
    capCeiling: db.capCeiling,
  };
}
