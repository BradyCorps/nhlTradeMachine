// ── Season Rollover — Cup Run Challenge Phase 1 ───────────────
// Pure engine that advances the league one offseason: aging, contract
// decrement, retirement, stat regeneration, and breakout/regression
// rolls. No I/O. Free-agency resolution stays in free-agency.ts —
// this module only flags who just expired; it never signs anyone.
//
// Determinism: every roll is seeded per player per year, so the same
// (players, seed, year) always produces the same league. Any roster
// change upstream changes the scenario seed and honestly re-rolls.
//
// Phase 1 limitation: goalie value flows through gsax/savePct at sim
// time, which rollover does not model — goalies here only age, retire
// (with a later clock), and decrement contracts.

import { ageDecay, hashString, mulberry32, stablePts } from "./sim-engine";

export interface RolloverPlayer {
  id: string;
  name: string;
  position: string;            // "C" | "W" | "LW" | "RW" | "D" | "G" | roster variants
  age: number;
  capHit: number;
  yearsRemaining: number;
  ptsPace: number;
  baselinePtsPace?: number;
  prospectPtsPace?: number | null;
  xGPace?: number | null;      // luck signal: expected-goals pace
  goalsPace?: number;          // luck signal: actual goals pace
  hdFinishingDelta?: number | null; // EDGE high-danger finishing vs league (preferred luck signal)
  expiryStatus?: string | null;   // "UFA" | "RFA" | null (Asset keeps this loose)
}

export type RolloverEvent =
  | { type: "retired"; playerId: string; name: string; age: number }
  | { type: "breakout"; playerId: string; name: string; pctChange: number }
  | { type: "regression"; playerId: string; name: string; pctChange: number };

export interface RolloverResult<P extends RolloverPlayer> {
  players: P[];                // survivors — aged, re-projected, contracts decremented
  retired: P[];
  expiring: P[];               // subset of players whose deal just ran out (feed to resolveLeagueOffseason)
  events: RolloverEvent[];
}

export interface RolloverContext {
  seed: number;                // scenarioSeed(fullState) from the run
  year: number;                // offseason year being crossed into (e.g. 2027)
  /** Players who changed teams into a better lineup slot since last
   *  season — breakout odds double. Phase 3 computes this from lineup
   *  context; callers can pass an empty set until then. */
  changeOfScenery?: Set<string>;
}

const posType = (position: string): "F" | "D" | "G" =>
  position === "G" ? "G" : position === "D" ? "D" : "F";

// ── Retirement ────────────────────────────────────────────────
// Near-zero under 35, ramping after, sharp after 38. Goalies age on a
// ~2-year-later clock. Stars linger; cheap fringe veterans exit early.
export function retirementChance(p: Pick<RolloverPlayer, "age" | "position" | "ptsPace" | "capHit">): number {
  const effAge = posType(p.position) === "G" ? p.age - 2 : p.age;
  if (effAge >= 45) return 1;
  if (effAge < 35) return 0;

  let chance: number;
  if (effAge < 38) {
    chance = 0.05 + (effAge - 35) * 0.07;         // 35: 5%, 36: 12%, 37: 19%
  } else {
    chance = 0.30 + (effAge - 38) * 0.15;          // 38: 30%, 40: 60%, 42: 90%
  }
  if (p.ptsPace >= 60) chance *= 0.5;              // stars hang on
  else if (p.ptsPace < 20 && p.capHit < 1.5) chance *= 1.8; // fringe vets bow out
  return Math.min(0.98, Math.max(0, chance));
}

// ── Breakout / regression odds ────────────────────────────────
export function breakoutOdds(
  p: Pick<RolloverPlayer, "age" | "xGPace" | "goalsPace" | "hdFinishingDelta">,
  changedScenery: boolean,
): { breakout: number; regression: number } {
  let breakout = 0.08;
  let regression = 0.10;
  if (p.age <= 23) { breakout = 0.16; regression = 0.06; }
  else if (p.age >= 30) { breakout = 0.04; regression = 0.16; }

  // Luck signal, best source first: NHL EDGE high-danger finishing vs
  // league (true shot-quality-adjusted luck from nhl_snapshots), falling
  // back to the coarser xG-vs-goals heuristic when no snapshot exists.
  if (p.hdFinishingDelta != null) {
    if (p.hdFinishingDelta <= -0.02) breakout += 0.08;       // unlucky on quality chances
    else if (p.hdFinishingDelta >= 0.03) regression += 0.08; // running hot
  } else {
    const xg = p.xGPace ?? 0;
    const goals = p.goalsPace ?? 0;
    if (xg > 5 && goals > 0) {
      if (goals < xg * 0.85) breakout += 0.06;
      else if (goals > xg * 1.25) regression += 0.08;
    }
  }

  if (changedScenery) breakout *= 2;
  return { breakout: Math.min(0.5, breakout), regression: Math.min(0.5, regression) };
}

// ── Advance one offseason ─────────────────────────────────────
export function advanceSeason<P extends RolloverPlayer>(
  players: P[],
  ctx: RolloverContext,
): RolloverResult<P> {
  const survivors: P[] = [];
  const retired: P[] = [];
  const expiring: P[] = [];
  const events: RolloverEvent[] = [];
  const scenery = ctx.changeOfScenery ?? new Set<string>();

  for (const p of players) {
    const rand = mulberry32(ctx.seed + hashString(`${p.id}:rollover:${ctx.year}`));
    const age = p.age + 1;

    // ── Retirement ──
    if (rand() < retirementChance({ ...p, age })) {
      retired.push({ ...p, age });
      events.push({ type: "retired", playerId: p.id, name: p.name, age });
      continue;
    }

    // ── Breakout / regression roll (established NHL skaters only —
    // prospects keep their NHLe path, goalies are pace-less here) ──
    let rollMult = 1;
    if (posType(p.position) !== "G" && p.ptsPace > 0) {
      const odds = breakoutOdds({ ...p, age }, scenery.has(p.id));
      const roll = rand();
      if (roll < odds.breakout) {
        rollMult = 1.15 + rand() * 0.20;                       // +15% … +35%
        events.push({ type: "breakout", playerId: p.id, name: p.name, pctChange: Math.round((rollMult - 1) * 100) });
      } else if (roll < odds.breakout + odds.regression) {
        rollMult = 0.75 + rand() * 0.15;                       // −25% … −10%
        events.push({ type: "regression", playerId: p.id, name: p.name, pctChange: Math.round((rollMult - 1) * 100) });
      }
    }

    // ── Stat regeneration ──
    let ptsPace = p.ptsPace;
    let baselinePtsPace = p.baselinePtsPace;
    if (posType(p.position) !== "G" && p.ptsPace > 0) {
      const anchored = stablePts({ ...p, position: posType(p.position) });
      ptsPace = Math.max(0, Math.round(anchored * ageDecay(age, posType(p.position)) * rollMult * 10) / 10);
      baselinePtsPace = Math.round(((p.baselinePtsPace ?? p.ptsPace) * 0.6 + ptsPace * 0.4) * 10) / 10;
    }

    // ── Contract decrement ──
    const yearsRemaining = Math.max(0, p.yearsRemaining - 1);
    const justExpired = p.yearsRemaining > 0 && yearsRemaining === 0;
    // Simplified UFA rule: 27+ walks, younger stays restricted.
    const expiryStatus = justExpired ? (age >= 27 ? "UFA" as const : "RFA" as const) : p.expiryStatus ?? null;

    const next = { ...p, age, ptsPace, baselinePtsPace, yearsRemaining, expiryStatus };
    survivors.push(next);
    if (justExpired) expiring.push(next);
  }

  return { players: survivors, retired, expiring, events };
}
