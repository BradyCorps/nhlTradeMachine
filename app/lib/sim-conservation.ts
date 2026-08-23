// ── Season conservation invariants (SIM-CONS) ────────────────────
//
// The season model used to roll each entity independently: every skater drew
// his own games, every team drew its own points, and nothing tied the pieces to
// a physical season. So a 25-man roster produced ~1,900 skater-games (an NHL
// team has 18×82 = 1,476), team standings points floated free of any real total,
// and Σ(player goals) never had to equal the team's goals-for. This module holds
// the three conservation laws that close those gaps, as pure integer functions
// so they are deterministic and unit-testable in isolation from the route.
//
//   apportion            distribute an integer total across weights, honouring
//                        per-item caps, summing EXACTLY to the feasible total
//   conserveTeamSeason   rescale a team's skater seasons so games sum to the
//                        team budget and goals sum to the team goals-for
//   teamGoalsFor         a team's season goals-for from its projected points
//   conserveLeaguePoints rescale 32 teams' points to a realistic league total
//
// The route applies the team-level laws only to full rosters (≥18 skaters):
// that is production, where every club ices 18 skaters a night. Thin synthetic
// rosters keep the per-player projection unchanged.

export const SKATERS_DRESSED = 18;
export const SEASON_GAMES = 82;
/** 18 skaters iced per game × 82 games. The team skater-games budget. */
export const TEAM_SKATER_GAMES = SKATERS_DRESSED * SEASON_GAMES; // 1476

/** A full lineup is 12F + 6D. Below this a team cannot ice 18 skaters a night,
 *  so its season is legitimately short and is left un-conserved (an illegal
 *  roster is the roster-legality gate's problem, not this module's). */
export const MIN_CONSERVE_SKATERS = SKATERS_DRESSED;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Distribute an integer `total` across `weights` (proportional to weight),
 * with each result an integer in `[0, caps[i]]`, summing to exactly
 * `min(total, Σcaps)`. Standard iterative proportional capping followed by
 * largest-remainder rounding, so the result is deterministic and order-stable.
 *
 * - All-zero (or absent) weights are treated as equal.
 * - A missing/non-finite cap is treated as unbounded.
 */
export function apportion(weights: number[], total: number, caps?: number[]): number[] {
  const n = weights.length;
  const res = new Array<number>(n).fill(0);
  if (n === 0) return res;

  const capOf = (i: number): number => {
    const c = caps?.[i];
    return c == null || !Number.isFinite(c) ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(c));
  };
  const capSum = res.reduce((s, _, i) => {
    const c = capOf(i);
    return c === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : s + c;
  }, 0);

  let target = Math.max(0, Math.round(total));
  if (Number.isFinite(capSum)) target = Math.min(target, capSum as number);
  if (target === 0) return res;

  let w = weights.map(x => (Number.isFinite(x) && x > 0 ? x : 0));
  if (w.every(x => x === 0)) w = new Array(n).fill(1);

  // Phase 1 — pin any item whose proportional ideal meets or exceeds its cap,
  // then recompute over the rest. Converges in ≤ n passes.
  const pinned = new Array<boolean>(n).fill(false);
  let budget = target;
  for (let pass = 0; pass < n + 1; pass++) {
    const openIdx = res.map((_, i) => i).filter(i => !pinned[i]);
    const wSum = openIdx.reduce((s, i) => s + w[i], 0);
    if (wSum <= 0 || openIdx.length === 0) break;
    let pinnedThisPass = false;
    for (const i of openIdx) {
      const ideal = (w[i] / wSum) * budget;
      if (ideal >= capOf(i)) {
        res[i] = capOf(i);
        pinned[i] = true;
        budget -= res[i];
        pinnedThisPass = true;
      }
    }
    if (!pinnedThisPass) break;
  }

  // Phase 2 — largest-remainder over the un-pinned items with the residual.
  const openIdx = res.map((_, i) => i).filter(i => !pinned[i]);
  const wSum = openIdx.reduce((s, i) => s + w[i], 0);
  if (openIdx.length > 0 && budget > 0) {
    if (wSum <= 0) {
      // No weight left but budget remains: hand out one at a time within caps.
      let b = budget;
      for (const i of openIdx) {
        if (b <= 0) break;
        const room = capOf(i) - res[i];
        const give = Math.min(room === Number.POSITIVE_INFINITY ? b : room, b);
        res[i] += give;
        b -= give;
      }
    } else {
      const frac: { i: number; f: number }[] = [];
      let floored = 0;
      for (const i of openIdx) {
        const ideal = (w[i] / wSum) * budget;
        res[i] = Math.floor(ideal);
        floored += res[i];
        frac.push({ i, f: ideal - Math.floor(ideal) });
      }
      let leftover = budget - floored;
      frac.sort((a, b) => b.f - a.f || a.i - b.i);
      for (const { i } of frac) {
        if (leftover <= 0) break;
        if (capOf(i) - res[i] > 0) { res[i] += 1; leftover -= 1; }
      }
    }
  }

  return res;
}

/**
 * A team's season goals-for, from its projected standings points. Better teams
 * score more: points in the model's [55,135] band map to ~2.5–3.7 goals/game,
 * centred on the league-average ~3.0 at a middling ~90-point team.
 */
export function teamGoalsFor(projectedPoints: number): number {
  const gfPerGame = clamp(2.5 + ((projectedPoints - 55) / 80) * 1.2, 2.3, 3.8);
  return Math.round(gfPerGame * SEASON_GAMES);
}

export interface ConservableSkater {
  gamesPlayed: number;
  projectedPts: number;
  projectedGoals: number;
  projectedAssists: number;
  /** True for a healthy scratch / depth body: a tighter games cap. */
  benched?: boolean;
}

export interface ConserveOptions {
  gamesBudget?: number;   // default TEAM_SKATER_GAMES (1476)
  teamGoals: number;      // Σ skater goals target (team goals-for)
  activeGamesCap?: number; // default 82
  benchGamesCap?: number;  // default 48
}

/**
 * Rescale a team's skater seasons in place onto the conservation invariants:
 *
 *   Σ gamesPlayed  = gamesBudget (1476), each skater in [0, cap]
 *   Σ projectedGoals = teamGoals, each ≤ that skater's points
 *   points scale with the skater's new games (per-game rate preserved)
 *   assists = points − goals
 *
 * Relative order is preserved throughout (a proportional, cap-aware rescale),
 * so the team's best players stay its best players. Returns the same array.
 */
export function conserveTeamSeason<T extends ConservableSkater>(
  skaters: T[],
  opts: ConserveOptions,
): T[] {
  const n = skaters.length;
  if (n === 0) return skaters;

  const gamesBudget = opts.gamesBudget ?? TEAM_SKATER_GAMES;
  const activeCap = opts.activeGamesCap ?? SEASON_GAMES;
  const benchCap = opts.benchGamesCap ?? 48;

  // Games — weight by the natural draw so deployment/health shape survives.
  const gameWeights = skaters.map(s => Math.max(0, s.gamesPlayed));
  const gameCaps = skaters.map(s => (s.benched ? benchCap : activeCap));
  const newGames = apportion(gameWeights, gamesBudget, gameCaps);

  // Points scale with games so the per-game rate is untouched by conservation.
  const newPts = skaters.map((s, i) => {
    const oldG = Math.max(1, s.gamesPlayed);
    return Math.max(0, Math.round(s.projectedPts * (newGames[i] / oldG)));
  });

  // Goals — conserve the team goals-for, weighted by each skater's finishing
  // (his projected goals), capped by his points so a line never scores more
  // goals than points. Σ goals lands on teamGoals when the caps allow.
  const goalWeights = skaters.map(s => Math.max(0, s.projectedGoals));
  const goalTarget = Math.max(0, Math.min(Math.round(opts.teamGoals), newPts.reduce((a, b) => a + b, 0)));
  const newGoals = apportion(goalWeights, goalTarget, newPts);

  for (let i = 0; i < n; i++) {
    skaters[i].gamesPlayed = newGames[i];
    skaters[i].projectedPts = newPts[i];
    skaters[i].projectedGoals = newGoals[i];
    skaters[i].projectedAssists = Math.max(0, newPts[i] - newGoals[i]);
  }
  return skaters;
}

/**
 * Rescale a full league's projected points to a realistic season total. A
 * 32-team, 82-game league plays 1,312 games; each awards 2 points plus 1 more
 * when it reaches overtime (~23% of games), so the league total is ~2,924
 * (≈91 per team) — not the free-floating sum independent per-team rolls
 * produce. Ordering is preserved, so standings and the champion are unchanged;
 * only the inflation is removed.
 */
export const LEAGUE_POINT_TOTAL = 2924;
export const MAX_TEAM_POINTS = 164; // 82 wins × 2

/**
 * Deliberately a pure proportional rescale (each team's result is a function of
 * only its own raw points and the league sum) rather than an exact-total
 * apportionment: the season route guarantees identical output when the input
 * team order changes, and a largest-remainder tie-break would hand the rounding
 * +1 to a different array position under reordering. The total lands within a
 * few points of the target, which is all the invariant needs — the point is to
 * remove the inflation, not to hit 2,924 to the unit.
 */
export function conserveLeaguePoints(points: number[], targetTotal = LEAGUE_POINT_TOTAL): number[] {
  const n = points.length;
  if (n === 0) return [];
  const sum = points.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 0) return points.map(() => Math.round(targetTotal / n));
  const scale = targetTotal / sum;
  return points.map(p => Math.min(MAX_TEAM_POINTS, Math.max(0, Math.round(Math.max(0, p) * scale))));
}
