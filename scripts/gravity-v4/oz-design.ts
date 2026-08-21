// ── Gravity v4 — offensive-zone RAPM design (pure) ───────────────
//
// Turns valued possession observations into the ridge design for the OZ well.
// Standard xG-RAPM: two coefficients per player — an OFFENSE effect (how much
// team xGF rises with him on the ice) and a DEFENSE effect (how much the
// opponent's xGF falls) — plus unpenalized context columns. Each stint yields
// TWO rows, one for each team's xGF, so a player's offense is estimated from
// the stints he attacks in and his defense from the stints he defends in.
//
// The OZ WELL is the INDIRECT part of offense — his effect on teammates, not
// his own shooting (spec §3.1). So the driver decomposes the fitted offense
// into a direct component (his own xG rate) and the residual gravity; this
// module builds the regression and the direct-rate accounting it needs.

import type { SparseObs } from "./rapm";
import type { PossessionObservation } from "./possession-states";

export interface OzDesign {
  rows: SparseObs[];
  /** feature index → player id, for the OFFENSE block (defense is +nPlayers). */
  players: number[];
  nPlayers: number;
  /** Column layout: off_p = p, def_p = nPlayers + p, then the context block. */
  offOffset: number;
  defOffset: number;
  contextOffset: number;
  contextNames: string[];
  nFeatures: number;
}

const CONTEXT = ["intercept", "homeIce", "scoreState", "zoneOZ", "zoneDZ"];

/** Build the OZ RAPM design. Stints with no duration are skipped. */
export function buildOzDesign(obs: PossessionObservation[]): OzDesign {
  // Stable player index — first appearance order.
  const index = new Map<number, number>();
  const players: number[] = [];
  const idxOf = (id: number): number => {
    let i = index.get(id);
    if (i === undefined) { i = players.length; index.set(id, i); players.push(id); }
    return i;
  };
  for (const o of obs) { for (const id of o.homeSkaters) idxOf(id); for (const id of o.awaySkaters) idxOf(id); }

  const nPlayers = players.length;
  const offOffset = 0;
  const defOffset = nPlayers;
  const contextOffset = 2 * nPlayers;
  const nFeatures = contextOffset + CONTEXT.length;
  const C = contextOffset;

  const rows: SparseObs[] = [];
  for (const o of obs) {
    if (o.durationSec <= 0) continue;
    const perHr = o.durationSec / 3600;
    const home = o.homeSkaters.map(idxOf);
    const away = o.awaySkaters.map(idxOf);
    const oz = o.startZoneHome === "O" ? 1 : 0;   // home offensive-zone start
    const dz = o.startZoneHome === "D" ? 1 : 0;

    // Row 1 — home xGF: home players' offense, away players' defense.
    rows.push(row(home, away, {
      intercept: 1, homeIce: 1, scoreState: o.scoreStateHome, zoneOZ: oz, zoneDZ: dz,
    }, o.homeXg / perHr, o.durationSec, C));

    // Row 2 — away xGF: away offense, home defense; zones flip, home-ice off.
    rows.push(row(away, home, {
      intercept: 1, homeIce: 0, scoreState: -o.scoreStateHome, zoneOZ: dz, zoneDZ: oz,
    }, o.awayXg / perHr, o.durationSec, C));
  }

  return { rows, players, nPlayers, offOffset, defOffset, contextOffset, contextNames: CONTEXT, nFeatures };
}

function row(
  offPlayers: number[],
  defPlayers: number[],
  ctx: { intercept: number; homeIce: number; scoreState: number; zoneOZ: number; zoneDZ: number },
  y: number,
  w: number,
  contextOffset: number,
): SparseObs {
  const idx: number[] = [];
  const val: number[] = [];
  for (const p of offPlayers) { idx.push(p); val.push(1); }                    // off_p
  const defBase = contextOffset / 2;                                            // = nPlayers
  for (const p of defPlayers) { idx.push(defBase + p); val.push(1); }           // def_p
  idx.push(contextOffset + 0); val.push(ctx.intercept);
  idx.push(contextOffset + 1); val.push(ctx.homeIce);
  idx.push(contextOffset + 2); val.push(ctx.scoreState);
  idx.push(contextOffset + 3); val.push(ctx.zoneOZ);
  idx.push(contextOffset + 4); val.push(ctx.zoneDZ);
  return { idx, val, y, w };
}

export interface DirectRates {
  /** Player index → own xG per 60 (his direct shooting). */
  directRate: Float64Array;
  /** Player index → total 5v5 seconds on ice. */
  toiSec: Float64Array;
}

/** Each player's own xG rate and ice time — the direct component the OZ well
 *  is offense minus. A shot is credited to its shooter; ice time accrues to
 *  every on-ice skater for the stint. */
export function computeDirectRates(obs: PossessionObservation[], players: number[]): DirectRates {
  const index = new Map(players.map((id, i) => [id, i]));
  const directXg = new Float64Array(players.length);
  const toiSec = new Float64Array(players.length);
  for (const o of obs) {
    for (const id of o.homeSkaters) { const i = index.get(id); if (i !== undefined) toiSec[i] += o.durationSec; }
    for (const id of o.awaySkaters) { const i = index.get(id); if (i !== undefined) toiSec[i] += o.durationSec; }
    for (const s of o.shots) {
      if (s.shooterId == null) continue;
      const i = index.get(s.shooterId);
      if (i !== undefined) directXg[i] += s.xg;
    }
  }
  const directRate = new Float64Array(players.length);
  for (let i = 0; i < players.length; i++) directRate[i] = toiSec[i] > 0 ? directXg[i] / (toiSec[i] / 3600) : 0;
  return { directRate, toiSec };
}
