// ── Press Box — Daily Hockey Hand Engine ──────────────────────
// Pure scoring + daily seed logic. No I/O, no side effects.

export interface PressBoxPlayer {
  id: string;
  name: string;
  team: string;       // tricode (e.g. "EDM")
  teamName: string;   // full name
  position: string;   // "C" | "W" | "D" | "G"
  age: number;
  nationality: string;
  draftYear: number;
  jerseyNumber: number;
  division: string;   // "Atlantic" | "Metro" | "Central" | "Pacific"
  headshot?: string | null; // NHL mugshot URL, overlaid by the pool API when reachable
}

export interface ScoringBreakdown {
  teammates: { points: number; detail: string };
  draftClass: { points: number; detail: string };
  pipeline: { points: number; detail: string };
  divisionFlush: { points: number; detail: string };
  countryClub: { points: number; detail: string };
  positionGroup: { points: number; detail: string };
  callUpBonus: { points: number; detail: string };
  total: number;
}

export interface DailyHand {
  dayNumber: number;
  dateLabel: string;
  dealt: PressBoxPlayer[];   // CARDS_DEALT cards
  callUp: PressBoxPlayer;    // hidden, revealed after the first submission
  /** Precomputed so the board and the scoring can never disagree. */
  optimal: OptimalResult;
  /** How many candidate deals the curator rejected before this one. */
  candidatesTried: number;
  /** False when the curator ran out of candidates and took the least-bad deal. */
  curated: boolean;
}

// ── Deal shape ────────────────────────────────────────────────
//
// Eight cards, not six. Measured over a year of deals from the current pool,
// the change is not merely "more combinations":
//
//                              6 cards   8 cards
//   hands to consider              15        70
//   unique best hand              42%       54%
//   ≤2 hands tie for best         51%       68%
//   days where EVERY hand ties     2%        0%
//   3+ scoring categories used    74%       95%
//
// The last row is the one that matters. Three or more categories in the answer
// is the difference between deducing a hand and spotting the obvious group,
// and it goes from three-quarters of days to essentially all of them.
export const CARDS_DEALT = 8;
export const HAND_SIZE = 4;

// ── Deterministic PRNG (reuse from sim-engine) ────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Day number from epoch ─────────────────────────────────────
const EPOCH = new Date("2026-07-01T00:00:00Z").getTime();

export function dayNumberFromDate(date: Date = new Date()): number {
  return Math.floor((date.getTime() - EPOCH) / 86_400_000) + 1;
}

export function dateFromDayNumber(dayNum: number): Date {
  return new Date(EPOCH + (dayNum - 1) * 86_400_000);
}

// ── Deal curation ─────────────────────────────────────────────
//
// The old deal was `shuffled.slice(0, 6)` under a comment claiming it ensured
// "at least 2 different teams, at least 2 positions, spread of divisions". It
// did none of that, and it showed: one day in six weeks dealt a hand where all
// fifteen combinations scored identically, so every pick was simultaneously
// perfect and the puzzle did not exist.
//
// A puzzle is constructed, not drawn. The generator now proposes deals and
// rejects them until one is worth playing. Every rule below exists to make an
// attempt informative rather than to make the game hard.
export const DEAL_RULES = {
  /** The optimum sits in a band so the peg board means the same thing daily. */
  MIN_OPTIMUM: 12,
  MAX_OPTIMUM: 18,
  /** More than a couple of perfect hands and deduction collapses into guessing. */
  MAX_PERFECT_HANDS: 2,
  /** Fewer than three categories and the answer is one visible group. */
  MIN_CATEGORIES: 3,
  /** The runner-up has to be close enough to be tempting — but must not tie. */
  MAX_RUNNER_UP_GAP: 3,
  /** Median need is 2; the ceiling is for pools that drift, not for today. */
  MAX_CANDIDATES: 600,
} as const;

/**
 * The hand a player picks by chasing the single most visible grouping.
 *
 * Four of a team, four of a division, four countrymen. If this is also the
 * answer the puzzle rewards pattern-matching over reading the cards, so the
 * curator uses it as a decoy test: the obvious hand must be wrong.
 */
export function obviousHand(dealt: PressBoxPlayer[]): string[] | null {
  const traits: ((p: PressBoxPlayer) => string)[] = [
    p => `team:${p.team}`,
    p => `div:${p.division}`,
    p => `nat:${p.nationality}`,
    p => `pos:${p.position === "C" || p.position === "W" ? "F" : p.position}`,
    p => `draft:${p.draftYear}`,
  ];
  let biggest: PressBoxPlayer[] = [];
  for (const trait of traits) {
    const groups = new Map<string, PressBoxPlayer[]>();
    for (const p of dealt) {
      const key = trait(p);
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    for (const group of groups.values()) {
      if (group.length > biggest.length) biggest = group;
    }
  }
  if (biggest.length < HAND_SIZE) return null;
  return biggest.slice(0, HAND_SIZE).map(p => p.id).sort();
}

export interface DealQuality {
  optimum: number;
  perfectHands: number;
  runnerUp: number;
  categories: number;
  obviousIsAnswer: boolean;
}

export function assessDeal(dealt: PressBoxPlayer[], callUp: PressBoxPlayer): DealQuality {
  const scored = combinations(dealt, HAND_SIZE).map(combo => ({
    ids: combo.map(p => p.id).sort(),
    cards: combo,
    total: scoreHand(combo, callUp).total,
  }));
  const optimum = Math.max(...scored.map(s => s.total));
  const winners = scored.filter(s => s.total === optimum);
  const distinct = [...new Set(scored.map(s => s.total))].sort((a, b) => b - a);
  const bd = scoreHand(winners[0].cards, callUp);
  const categories = [
    bd.teammates, bd.draftClass, bd.pipeline,
    bd.divisionFlush, bd.countryClub, bd.positionGroup, bd.callUpBonus,
  ].filter(c => c.points > 0).length;
  const obvious = obviousHand(dealt);
  return {
    optimum,
    perfectHands: winners.length,
    runnerUp: distinct.length > 1 ? distinct[1] : optimum,
    categories,
    obviousIsAnswer: obvious != null && winners.some(w => w.ids.join() === obvious.join()),
  };
}

export function dealIsPlayable(q: DealQuality): boolean {
  if (q.optimum < DEAL_RULES.MIN_OPTIMUM || q.optimum > DEAL_RULES.MAX_OPTIMUM) return false;
  if (q.perfectHands > DEAL_RULES.MAX_PERFECT_HANDS) return false;
  if (q.categories < DEAL_RULES.MIN_CATEGORIES) return false;
  // A runner-up that also wins is not a runner-up, and one too far back is not
  // a temptation — both make the second attempt uninformative.
  if (q.optimum === q.runnerUp) return false;
  if (q.optimum - q.runnerUp > DEAL_RULES.MAX_RUNNER_UP_GAP) return false;
  if (q.obviousIsAnswer) return false;
  return true;
}

/** How far off a rejected deal was, so the fallback can pick the least-bad one. */
function dealPenalty(q: DealQuality): number {
  const bandMiss = q.optimum < DEAL_RULES.MIN_OPTIMUM ? DEAL_RULES.MIN_OPTIMUM - q.optimum
    : q.optimum > DEAL_RULES.MAX_OPTIMUM ? q.optimum - DEAL_RULES.MAX_OPTIMUM
    : 0;
  return bandMiss
    + Math.max(0, q.perfectHands - DEAL_RULES.MAX_PERFECT_HANDS) * 4
    + Math.max(0, DEAL_RULES.MIN_CATEGORIES - q.categories) * 3
    + (q.optimum === q.runnerUp ? 6 : 0)
    + Math.max(0, (q.optimum - q.runnerUp) - DEAL_RULES.MAX_RUNNER_UP_GAP)
    + (q.obviousIsAnswer ? 5 : 0);
}

// ── Deal the daily hand ───────────────────────────────────────
//
// Deterministic: the same day number yields the same deal for everyone, search
// included, because the search draws from one seeded stream.
export function dealDailyHand(pool: PressBoxPlayer[], dayNum: number): DailyHand {
  const rand = mulberry32(dayNum * 7919 + 31337);

  let chosen: { dealt: PressBoxPlayer[]; callUp: PressBoxPlayer } | null = null;
  let fallback: { dealt: PressBoxPlayer[]; callUp: PressBoxPlayer; penalty: number } | null = null;
  let tried = 0;

  for (; tried < DEAL_RULES.MAX_CANDIDATES; tried++) {
    const shuffled = shuffle(pool, rand);
    const dealt = shuffled.slice(0, CARDS_DEALT);
    const callUp = shuffled[CARDS_DEALT];
    if (!callUp || dealt.length < CARDS_DEALT) break;   // pool too small to deal

    const quality = assessDeal(dealt, callUp);
    if (dealIsPlayable(quality)) { chosen = { dealt, callUp }; tried++; break; }

    // Never fail to produce a puzzle. A slightly-off deal beats a blank page,
    // and the pool will drift as rosters change.
    const penalty = dealPenalty(quality);
    if (!fallback || penalty < fallback.penalty) fallback = { dealt, callUp, penalty };
  }

  const picked = chosen ?? fallback ?? {
    dealt: pool.slice(0, CARDS_DEALT),
    callUp: pool[CARDS_DEALT] ?? pool[0],
  };

  const date = dateFromDayNumber(dayNum);
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return {
    dayNumber: dayNum,
    dateLabel,
    dealt: picked.dealt,
    callUp: picked.callUp,
    optimal: findOptimalCombos(picked.dealt, picked.callUp),
    candidatesTried: tried,
    curated: chosen != null,
  };
}

// ── Scoring ───────────────────────────────────────────────────
function countPairs(n: number): number {
  return (n * (n - 1)) / 2;
}

export function scoreHand(
  picks: PressBoxPlayer[],
  callUp: PressBoxPlayer
): ScoringBreakdown {
  const hand = [...picks, callUp];

  // ── Teammates (same team): 2 pts per pair ───────────────────
  const teamCounts = new Map<string, number>();
  for (const p of hand) teamCounts.set(p.team, (teamCounts.get(p.team) ?? 0) + 1);
  let teammatePoints = 0;
  const teammateDetails: string[] = [];
  for (const [team, count] of teamCounts) {
    if (count >= 2) {
      const pts = countPairs(count) * 2;
      teammatePoints += pts;
      teammateDetails.push(`${count}x ${team} = ${pts}`);
    }
  }

  // ── Draft Class (same draft year): 2 pts per pair ───────────
  const draftCounts = new Map<number, number>();
  for (const p of hand) {
    if (p.draftYear > 0) draftCounts.set(p.draftYear, (draftCounts.get(p.draftYear) ?? 0) + 1);
  }
  let draftClassPoints = 0;
  const draftDetails: string[] = [];
  for (const [year, count] of draftCounts) {
    if (count >= 2) {
      const pts = countPairs(count) * 2;
      draftClassPoints += pts;
      draftDetails.push(`${count}x '${String(year).slice(2)} class = ${pts}`);
    }
  }

  // ── Pipeline (3+ consecutive draft years): 1 pt per card ────
  const draftYears = [...new Set(hand.map((p) => p.draftYear).filter((y) => y > 0))].sort(
    (a, b) => a - b
  );
  let longestRun = 0;
  let currentRun = 1;
  for (let i = 1; i < draftYears.length; i++) {
    if (draftYears[i] === draftYears[i - 1] + 1) {
      currentRun++;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 1;
    }
  }
  if (draftYears.length === 1) longestRun = 1;
  if (longestRun < 1) longestRun = currentRun;
  const pipelinePoints = longestRun >= 3 ? longestRun : 0;

  // ── Division Flush (all 4 picks from one division) ──────────
  const pickDivs = picks.map((p) => p.division);
  const allSameDiv = pickDivs.every((d) => d === pickDivs[0]);
  let divFlushPoints = 0;
  let divFlushDetail = "";
  if (allSameDiv && picks.length === 4) {
    divFlushPoints = callUp.division === pickDivs[0] ? 5 : 4;
    divFlushDetail = `${pickDivs[0]}${divFlushPoints === 5 ? " + call-up!" : ""}`;
  }

  // ── Country Club (3+ same nationality): 3 pts ──────────────
  const natCounts = new Map<string, number>();
  for (const p of hand) natCounts.set(p.nationality, (natCounts.get(p.nationality) ?? 0) + 1);
  let countryPoints = 0;
  const countryDetails: string[] = [];
  for (const [nat, count] of natCounts) {
    if (count >= 3) {
      countryPoints += 3;
      countryDetails.push(`${count}x ${nat}`);
    }
  }

  // ── Position Group (3+ same position type): 3 pts ──────────
  const posCounts = new Map<string, number>();
  for (const p of hand) {
    const posType = p.position === "C" || p.position === "W" ? "F" : p.position;
    posCounts.set(posType, (posCounts.get(posType) ?? 0) + 1);
  }
  let posPoints = 0;
  const posDetails: string[] = [];
  for (const [pos, count] of posCounts) {
    if (count >= 3) {
      posPoints += 3;
      posDetails.push(`${count}x ${pos === "F" ? "Forwards" : pos === "D" ? "Defensemen" : "Goalies"}`);
    }
  }

  // ── Call-Up Bonus (shares team with any pick): 1 per match ──
  const callUpMatches = picks.filter((p) => p.team === callUp.team).length;
  const callUpPoints = callUpMatches;

  const total =
    teammatePoints +
    draftClassPoints +
    pipelinePoints +
    divFlushPoints +
    countryPoints +
    posPoints +
    callUpPoints;

  return {
    teammates: {
      points: teammatePoints,
      detail: teammateDetails.join(", ") || "No pairs",
    },
    draftClass: {
      points: draftClassPoints,
      detail: draftDetails.join(", ") || "No pairs",
    },
    pipeline: {
      points: pipelinePoints,
      detail:
        pipelinePoints > 0
          ? `${longestRun}-year run`
          : longestRun >= 2
            ? `${longestRun}-year run (need 3+)`
            : "No run",
    },
    divisionFlush: {
      points: divFlushPoints,
      detail: divFlushDetail || "Mixed divisions",
    },
    countryClub: {
      points: countryPoints,
      detail: countryDetails.join(", ") || "Mixed nationalities",
    },
    positionGroup: {
      points: posPoints,
      detail: posDetails.join(", ") || "Mixed positions",
    },
    callUpBonus: {
      points: callUpPoints,
      detail:
        callUpPoints > 0
          ? `${callUp.name} (${callUp.team}) matched ${callUpMatches} pick${callUpMatches > 1 ? "s" : ""}`
          : `${callUp.name} (${callUp.team}) — no match`,
    },
    total,
  };
}

// ── Optimal hand (brute-force all C(6,4) = 15 combos) ───────
function combinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  function recurse(start: number, combo: T[]) {
    if (combo.length === k) { result.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      recurse(i + 1, combo);
      combo.pop();
    }
  }
  recurse(0, []);
  return result;
}

export interface OptimalResult {
  score: number;
  combos: string[][]; // player-id sets of every combo that reaches the optimal score
}

export function findOptimalCombos(dealt: PressBoxPlayer[], callUp: PressBoxPlayer): OptimalResult {
  const combos = combinations(dealt, 4);
  let best = 0;
  let bestCombos: string[][] = [];
  for (const combo of combos) {
    const result = scoreHand(combo, callUp);
    if (result.total > best) {
      best = result.total;
      bestCombos = [combo.map((p) => p.id)];
    } else if (result.total === best) {
      bestCombos.push(combo.map((p) => p.id));
    }
  }
  return { score: best, combos: bestCombos };
}

export function findOptimalScore(dealt: PressBoxPlayer[], callUp: PressBoxPlayer): number {
  return findOptimalCombos(dealt, callUp).score;
}

// How close were the picks to a perfect lineup? Max overlap against any
// optimal combo — the vague "3/4 correct" feedback instead of a point gap.
export function overlapWithOptimal(pickIds: string[], optimalCombos: string[][]): number {
  let best = 0;
  const pickSet = new Set(pickIds);
  for (const combo of optimalCombos) {
    const overlap = combo.filter((id) => pickSet.has(id)).length;
    if (overlap > best) best = overlap;
  }
  return best;
}

// ── The board ────────────────────────────────────────────────
//
// This was `MAX_SCORE = 15`, a cribbage homage the scoring never respected.
// Measured over a year, the real optimum ran 3 to 19 with a mean of 9.2 — so a
// player who found the perfect hand was typically shown "8/15 ★★★★★ PERFECT
// HAND", told they had scored 53% for winning, and on 3% of days the optimum
// sat past the end of a board only 15 pegs long.
//
// Curation now holds the optimum inside DEAL_RULES' band, so the board keeps a
// constant length day to day — the thing the fixed 15 was actually for — while
// the target peg sits on today's real optimum and a perfect hand reads as
// complete, because it is.
export const PEG_BOARD_LENGTH = DEAL_RULES.MAX_OPTIMUM;
export const MAX_ATTEMPTS = 5;

// ── Star rating (did you find the optimal combo?) ────────────
export function starRating(score: number, optimal: number): { stars: number; label: string; color: string } {
  if (optimal === 0) return { stars: 5, label: "PERFECT HAND", color: "var(--ledger-green)" };
  const pct = score / optimal;
  if (pct >= 1)    return { stars: 5, label: "PERFECT HAND", color: "var(--ledger-green)" };
  if (pct >= 0.85) return { stars: 4, label: "FRONT PAGE", color: "var(--ledger-green)" };
  if (pct >= 0.65) return { stars: 3, label: "ABOVE THE FOLD", color: "var(--ledger-ice)" };
  if (pct >= 0.40) return { stars: 2, label: "PAGE THREE", color: "var(--ledger-brown)" };
  if (pct > 0)     return { stars: 1, label: "CLASSIFIED", color: "var(--ledger-amber)" };
  return { stars: 0, label: "PRESS RELEASE", color: "var(--ledger-red)" };
}

// ── Share text ────────────────────────────────────────────────
export function buildShareText(
  dayNum: number,
  bestScore: number,
  optimal: number,
  attemptScores: number[] = [],
): string {
  const { stars } = starRating(bestScore, optimal);
  const starStr = "★".repeat(stars) + "☆".repeat(5 - stars);
  const found = bestScore === optimal;
  const attemptStr = found
    ? `${attemptScores.length}/${MAX_ATTEMPTS}`
    : `X/${MAX_ATTEMPTS}`;

  const blocks = attemptScores.map((s) =>
    s === optimal ? "🟩" : s >= optimal * 0.7 ? "🟨" : "⬛"
  ).join("");

  return [
    `Press Box #${dayNum} ${attemptStr}`,
    blocks,
    // Against today's optimum, not a fixed 15 — a perfect hand used to share as
    // "8/15 ★★★★★ PERFECT HAND", which reads as a loss to everyone who sees it.
    `${bestScore}/${optimal} pts ${starStr}${found ? " PERFECT HAND" : ""}`,
    "capandcrease.com/press-box",
  ].join("\n");
}
