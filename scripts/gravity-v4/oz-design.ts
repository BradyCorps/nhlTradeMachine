// ── Gravity v4 — offensive-zone RAPM design (pure) ───────────────
//
// The OZ well is a player's INDIRECT effect: how much more his TEAMMATES score
// with him on the ice, excluding his own shots (spec §3.1, §5.2). Estimating it
// as (total-offense RAPM − own shooting rate) is wrong — those are on different
// bases (a shrunk, centered coefficient minus an absolute rate) and it just
// rewards players who don't shoot. So we estimate gravity DIRECTLY.
//
// The model regresses each on-ice attacker's OWN expected goals on:
//   • his own FINISH coefficient  — his shooting,
//   • the GRAVITY coefficients of his four on-ice teammates — they make him
//     more dangerous; this is the OZ well,
//   • the DEFENSE coefficients of the five opponents — they suppress him,
//   • context (home ice, score state, zone start).
//
//     ownXgRate(focal) = finish_focal + Σ gravity_teammate − Σ defense_opp + …
//
// So a player's GRAVITY is identified by how his linemates score when he is on
// the ice — never by his own shots. Every stint yields ten rows (five attackers
// per side), most with a zero response; the zero rows are the exposure that
// keeps gravity from being "plays a lot".

import type { SparseObs } from "./rapm";
import type { PossessionObservation } from "./possession-states";

export interface OzDesign {
  rows: SparseObs[];
  /** feature index → player id (the GRAVITY block; finish is +nPlayers, defense +2·nPlayers). */
  players: number[];
  nPlayers: number;
  gravityOffset: number;
  finishOffset: number;
  defenseOffset: number;
  contextOffset: number;
  contextNames: string[];
  nFeatures: number;
  /** player index → total 5v5 seconds on ice (for reliability thresholds). */
  toiSec: Float64Array;
}

const CONTEXT = ["intercept", "homeIce", "scoreState", "zoneOZ", "zoneDZ"];

export function buildOzDesign(obs: PossessionObservation[]): OzDesign {
  const index = new Map<number, number>();
  const players: number[] = [];
  const idxOf = (id: number): number => {
    let i = index.get(id);
    if (i === undefined) { i = players.length; index.set(id, i); players.push(id); }
    return i;
  };
  for (const o of obs) { for (const id of o.homeSkaters) idxOf(id); for (const id of o.awaySkaters) idxOf(id); }

  const nPlayers = players.length;
  const gravityOffset = 0;
  const finishOffset = nPlayers;
  const defenseOffset = 2 * nPlayers;
  const contextOffset = 3 * nPlayers;
  const nFeatures = contextOffset + CONTEXT.length;
  const toiSec = new Float64Array(nPlayers);

  const rows: SparseObs[] = [];

  for (const o of obs) {
    if (o.durationSec <= 0) continue;
    const perHr = o.durationSec / 3600;
    const home = o.homeSkaters.map(idxOf);
    const away = o.awaySkaters.map(idxOf);
    for (const i of home) toiSec[i] += o.durationSec;
    for (const i of away) toiSec[i] += o.durationSec;

    const oz = o.startZoneHome === "O" ? 1 : 0;
    const dz = o.startZoneHome === "D" ? 1 : 0;

    // Own xG per attacker, per side, from the per-shooter detail.
    const ownHome = new Map<number, number>();
    const ownAway = new Map<number, number>();
    for (const s of o.shots) {
      if (s.shooterId == null) continue;
      const pi = idxOf(s.shooterId);
      const bucket = s.team === "H" ? ownHome : ownAway;
      bucket.set(pi, (bucket.get(pi) ?? 0) + s.xg);
    }

    emitSide(rows, home, away, ownHome, o.durationSec, perHr,
      { homeIce: 1, scoreState: o.scoreStateHome, zoneOZ: oz, zoneDZ: dz },
      { finishOffset, defenseOffset, contextOffset });
    emitSide(rows, away, home, ownAway, o.durationSec, perHr,
      { homeIce: 0, scoreState: -o.scoreStateHome, zoneOZ: dz, zoneDZ: oz },
      { finishOffset, defenseOffset, contextOffset });
  }

  return {
    rows, players, nPlayers, gravityOffset, finishOffset, defenseOffset,
    contextOffset, contextNames: CONTEXT, nFeatures, toiSec,
  };
}

interface Ctx { homeIce: number; scoreState: number; zoneOZ: number; zoneDZ: number }
interface Offsets { finishOffset: number; defenseOffset: number; contextOffset: number }

/** One row per on-ice attacker: his own xG rate on his finish + teammates'
 *  gravity + opponents' defense + context. */
function emitSide(
  rows: SparseObs[],
  offense: number[],
  defense: number[],
  ownXg: Map<number, number>,
  durationSec: number,
  perHr: number,
  ctx: Ctx,
  off: Offsets,
): void {
  for (const focal of offense) {
    const idx: number[] = [];
    const val: number[] = [];
    idx.push(off.finishOffset + focal); val.push(1);            // own finishing
    for (const q of offense) if (q !== focal) { idx.push(q); val.push(1); }   // teammates' gravity
    for (const a of defense) { idx.push(off.defenseOffset + a); val.push(1); } // opponents' defense
    idx.push(off.contextOffset + 0); val.push(1);
    idx.push(off.contextOffset + 1); val.push(ctx.homeIce);
    idx.push(off.contextOffset + 2); val.push(ctx.scoreState);
    idx.push(off.contextOffset + 3); val.push(ctx.zoneOZ);
    idx.push(off.contextOffset + 4); val.push(ctx.zoneDZ);
    rows.push({ idx, val, y: (ownXg.get(focal) ?? 0) / perHr, w: durationSec });
  }
}
