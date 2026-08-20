// ── nhl-active-players.ts — the NHL player-id roster file ────────
//
// A flat snapshot of active NHL players and their seven-digit NHL player
// ids, covering all 32 clubs. The ids are the join key for every
// first-party NHL feed (`/v1/player/{id}/landing`,
// `/v1/edge/skater-detail/{id}/…`, `/v1/edge/goalie-detail/{id}/…`), so
// having them on disk means a capture run does not have to walk 32 roster
// endpoints first just to learn who to ask about.
//
// WHAT THIS FILE IS NOT
//
// It is a snapshot, not a source of truth, and it is missing rookies —
// anyone who had not yet appeared on an NHL roster when it was taken. It
// carries no contract, no stats and no valuation input. Roster assembly
// still discovers players the usual way (DB → NHL API → MoneyPuck); this
// list only supplies ids to seed a capture with, and callers should treat
// a miss as "ask the API", never as "the player does not exist".
//
// Names here are for eyeballing a capture log. Where they disagree with
// the assembled roster, the roster wins — it reconciles spellings across
// sources and this file does not.

import fs from "fs";
import path from "path";

export interface ActivePlayerRow {
  /** Seven-digit NHL player id, as a string — ids are identifiers, not numbers. */
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  /** C | L | R | D | G, as the NHL publishes it. */
  position: string;
  /** Three-letter club abbreviation at the time the snapshot was taken. */
  team: string;
}

let cache: ActivePlayerRow[] | null = null;

/**
 * Parse the bundled CSV once per process.
 *
 * Deliberately a hand-rolled split rather than a CSV library: the file has
 * no quoted fields and no embedded commas (asserted below), so a parser
 * would buy nothing and add a dependency to a hot import path. A row that
 * does not have exactly six fields is dropped rather than guessed at.
 */
function load(): ActivePlayerRow[] {
  if (cache) return cache;
  const rows: ActivePlayerRow[] = [];
  try {
    const file = path.join(process.cwd(), "app/data/nhl-active-players.csv");
    const text = fs.readFileSync(file, "utf-8");
    const lines = text.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {           // skip the header
      const line = lines[i];
      if (!line) continue;
      const f = line.split(",");
      if (f.length !== 6) continue;
      const [id, firstName, lastName, position, team] = f;
      // Ids are the whole point of the file; a row without a plausible one
      // is unusable regardless of what else it carries.
      if (!/^\d{7,8}$/.test(id.trim())) continue;
      rows.push({
        id: id.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        position: position.trim().toUpperCase(),
        team: team.trim().toUpperCase(),
      });
    }
  } catch {
    // Missing or unreadable file degrades to an empty list: every caller
    // treats this as a seed, so an empty seed means "ask the API for
    // everyone", which is the same behaviour as before the file existed.
  }
  cache = rows;
  return rows;
}

/** Every row in the snapshot. */
export function activePlayers(): ActivePlayerRow[] {
  return load();
}

/** Ids of every goalie in the snapshot — the seed list for an Edge goalie capture. */
export function activeGoalieIds(): string[] {
  return load().filter(r => r.position === "G").map(r => r.id);
}

/** Goalie rows, for a capture log that names who it is fetching. */
export function activeGoalies(): ActivePlayerRow[] {
  return load().filter(r => r.position === "G");
}

/** Goalie ids for a set of club abbreviations — lets a rotating nightly
 *  capture take one night's teams instead of the whole league at once. */
export function activeGoalieIdsForTeams(teams: Array<string>): string[] {
  const wanted = new Set(teams.map(t => t.trim().toUpperCase()));
  return load().filter(r => r.position === "G" && wanted.has(r.team)).map(r => r.id);
}

/** Ids of every skater (non-goalie) in the snapshot — the seed for an Edge
 *  skater backfill (the inputs the gravity model reads). */
export function activeSkaterIds(): string[] {
  return load().filter(r => r.position !== "G").map(r => r.id);
}

/** Skater ids for a set of club abbreviations. */
export function activeSkaterIdsForTeams(teams: Array<string>): string[] {
  const wanted = new Set(teams.map(t => t.trim().toUpperCase()));
  return load().filter(r => r.position !== "G" && wanted.has(r.team)).map(r => r.id);
}

/** Ids of every player in the snapshot. */
export function activePlayerIds(): string[] {
  return load().map(r => r.id);
}

let byId: Map<string, ActivePlayerRow> | null = null;

/** Look up one row by NHL player id. A miss means "not in the snapshot" —
 *  commonly a rookie — and never that the id is invalid. */
export function activePlayerById(id: string | number): ActivePlayerRow | null {
  if (!byId) byId = new Map(load().map(r => [r.id, r]));
  return byId.get(String(id)) ?? null;
}
