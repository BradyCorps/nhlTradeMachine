// ── Gravity v4 — validation primitives (pure) ────────────────────
//
// The OZ well produces a recognisable leaderboard, but "recognisable" is not
// validation — the project rule is that an input must be validated before it
// moves a number. These are the primitives the validator composes to answer the
// two questions that turn a coefficient into a measurement:
//
//   1. RELIABILITY — refit the well on two independent halves of the season.
//      Does a player's gravity in half A correlate with his gravity in half B?
//      A stable trait replicates; noise does not. (The v3 analog was the
//      persistence r=0.68; this is its within-season, per-player-controlled kin.)
//
//   2. NULL CONTROL — refit a half with the unit→production link destroyed
//      (each stint's shots reattached to a random stint). Ridge always emits
//      correlated-looking coefficients, so the split-half r only means signal if
//      the same fit on structure-free data collapses to ~0.
//
//   3. TEAMMATE SIGNAL — does half-A gravity predict half-B raw on-ice teammate
//      xG (focal-excluded)? Gravity claims to measure effect on teammates, so it
//      should; a player's own FINISH should not. That gap is the discriminant.
//
// Splitting is by GAME, never by stint, so the two halves are independent
// samples and a single game's shared context can't leak across the split.

import type { PossessionObservation } from "./possession-states";

/** Deterministic game → fold, so a split is reproducible across runs and
 *  environments (no RNG state, no order dependence). Knuth multiplicative hash. */
export function assignFold(gameId: number, folds: number): number {
  let h = Math.imul(gameId >>> 0, 2654435761) >>> 0;   // 32-bit mix
  return h % folds;
}

/** Partition observations into `folds` groups, keeping every stint of a game
 *  together. Every observation lands in exactly one fold. */
export function splitByGame(obs: PossessionObservation[], folds: number): PossessionObservation[][] {
  const out: PossessionObservation[][] = Array.from({ length: folds }, () => []);
  for (const o of obs) out[assignFold(o.gameId, folds)].push(o);
  return out;
}

/** Pearson correlation of two equal-length series. Returns 0 for a degenerate
 *  (zero-variance) input rather than NaN, so a dead column reads as "no signal". */
export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0 || n !== b.length) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = a[i] - ma, dy = b[i] - mb;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom > 0 ? sxy / denom : 0;
}

/** Fractional ranks (ties averaged), for a rank correlation. */
function ranks(v: number[]): number[] {
  const order = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
  const r = new Array<number>(v.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;               // average rank for the tie block (1-based)
    for (let k = i; k <= j; k++) r[order[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation — robust to the heavy tails a few stars create. */
export function spearman(a: number[], b: number[]): number {
  return pearson(ranks(a), ranks(b));
}

export interface TeammateXg {
  /** Focal-excluded on-ice teammate expected goals accumulated while on the ice. */
  xg: number;
  /** Seconds on ice (the exposure denominator). */
  sec: number;
}

/**
 * Raw on-ice teammate xG per player: while a player is on the ice, the expected
 * goals his FOUR teammates generate (his own shots removed), with the seconds of
 * exposure. Per-60 = xg / sec × 3600. This is the observable the OZ well claims
 * to move — used as a held-out target, never as a fit input.
 */
export function teammateXgRate(obs: PossessionObservation[]): Map<number, TeammateXg> {
  const acc = new Map<number, TeammateXg>();
  const bump = (id: number, xg: number, sec: number) => {
    const a = acc.get(id);
    if (a) { a.xg += xg; a.sec += sec; } else acc.set(id, { xg, sec });
  };
  for (const o of obs) {
    if (o.durationSec <= 0) continue;
    let homeTot = 0, awayTot = 0;
    const own = new Map<number, number>();
    for (const s of o.shots) {
      if (s.team === "H") homeTot += s.xg; else awayTot += s.xg;
      if (s.shooterId != null) own.set(s.shooterId, (own.get(s.shooterId) ?? 0) + s.xg);
    }
    for (const id of o.homeSkaters) bump(id, homeTot - (own.get(id) ?? 0), o.durationSec);
    for (const id of o.awaySkaters) bump(id, awayTot - (own.get(id) ?? 0), o.durationSec);
  }
  return acc;
}

/**
 * Raw on-ice OPPONENT xG per player: while a player is on the ice, the expected
 * goals the OTHER team generates, with the seconds of exposure. Per-60 = xg / sec
 * × 3600. This is the observable the DZ well (the `defense` coefficient) claims to
 * MOVE — a good suppressor keeps it LOW, so his negative defense coefficient
 * should track a low opponent rate here. Held-out target, never a fit input. No
 * focal-exclusion: the focal defends against the whole opposing side, none of
 * whose shots are his own. (Reuses the TeammateXg shape — {xg, sec}.)
 */
export function opponentXgRate(obs: PossessionObservation[]): Map<number, TeammateXg> {
  const acc = new Map<number, TeammateXg>();
  const bump = (id: number, xg: number, sec: number) => {
    const a = acc.get(id);
    if (a) { a.xg += xg; a.sec += sec; } else acc.set(id, { xg, sec });
  };
  for (const o of obs) {
    if (o.durationSec <= 0) continue;
    let homeTot = 0, awayTot = 0;
    for (const s of o.shots) { if (s.team === "H") homeTot += s.xg; else awayTot += s.xg; }
    // A home skater's opponents are the away team → they face awayTot, and v.v.
    for (const id of o.homeSkaters) bump(id, awayTot, o.durationSec);
    for (const id of o.awaySkaters) bump(id, homeTot, o.durationSec);
  }
  return acc;
}

/** A tiny deterministic PRNG (mulberry32) so a null control is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The null-control transform: reattach each stint's shots to a DIFFERENT stint,
 * destroying the on-ice-unit → production link while preserving every marginal
 * (the same multiset of shot lists, the same lineups, the same durations). A well
 * refit on this should have gravity ≈ 0 — that is what proves the real split-half
 * r is signal, not an artifact of the ridge.
 */
export function shuffleShots(
  obs: PossessionObservation[],
  rng: () => number,
): PossessionObservation[] {
  const shotLists = obs.map(o => o.shots);
  // Fisher–Yates over the indices, then reattach.
  const perm = shotLists.map((_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return obs.map((o, i) => {
    const shots = shotLists[perm[i]];
    let homeXg = 0, awayXg = 0;
    for (const s of shots) { if (s.team === "H") homeXg += s.xg; else awayXg += s.xg; }
    return { ...o, shots, homeXg, awayXg };
  });
}
