// ── Gravity v4 — possession-state valuation (pure) ───────────────
//
// Turns a reconstructed stint into a valued observation the zone fits regress
// on. Each shot is priced in expected goals by the fitted `shot-xg-model`, then
// summed to home/away xG for the stint and kept per-shooter so the OZ fit can
// do the focal-excluded, teammate-only target the spec (§5.2) requires.
//
// This is the SIMPLIFIED public-data path: the stint's shots stand in for the
// full possession-value transition model (spec §5.1). It carries everything the
// OZ (teammate offense) and DZ (opponent suppression) RAPM fits need. The NZ
// transition well needs entry/exit events the stint rows do not yet carry and
// is deferred to a later extraction.
//
// Pure and dependency-light so it unit-tests without the dataset.

import type { StintRow, ZoneCode } from "./core";
import type { XgModel } from "./shot-xg-model";
import { predictXg } from "./shot-xg-model";

export interface ValuedShot {
  /** "H" if the home team shot, "A" if the away team shot. */
  team: "H" | "A";
  shooterId: number | null;
  /** Expected goals for this attempt, from the location model. */
  xg: number;
}

export interface PossessionObservation {
  gameId: number;
  stintIdx: number;
  /** Seconds of 5v5 the on-ice lineups shared — the exposure weight. */
  durationSec: number;
  homeTeamId: number;
  awayTeamId: number;
  /** On-ice skater ids (goalies excluded upstream). */
  homeSkaters: number[];
  awaySkaters: number[];
  /** homeScore − awayScore at stint start, clamped to [-3, 3] (a game-state control). */
  scoreStateHome: number;
  /** Zone the stint began in, home perspective — the deployment control. */
  startZoneHome: ZoneCode | null;
  /** Total expected goals for/against from the home team's perspective. */
  homeXg: number;
  awayXg: number;
  /** Per-shot detail, so a fit can exclude the focal player's own shots. */
  shots: ValuedShot[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Price one stint's shots in expected goals and package the regression row. */
export function valueStint(row: StintRow, model: XgModel): PossessionObservation {
  const shots: ValuedShot[] = [];
  let homeXg = 0;
  let awayXg = 0;
  for (const s of row.shots) {
    const xg = predictXg(model, s);      // null for blocked / coordinate-less shots
    if (xg == null) continue;
    const team: "H" | "A" = s.teamId === row.homeTeamId ? "H" : "A";
    shots.push({ team, shooterId: s.shooterId, xg });
    if (team === "H") homeXg += xg; else awayXg += xg;
  }
  return {
    gameId: row.gameId,
    stintIdx: row.stintIdx,
    durationSec: row.durationSec,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeSkaters: row.homeSkaters,
    awaySkaters: row.awaySkaters,
    scoreStateHome: clamp(row.homeScore - row.awayScore, -3, 3),
    startZoneHome: row.startZoneHome,
    homeXg,
    awayXg,
    shots,
  };
}
