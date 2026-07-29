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
  dealt: PressBoxPlayer[];   // 6 cards
  callUp: PressBoxPlayer;    // hidden 7th
}

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

// ── Deal the daily hand ───────────────────────────────────────
export function dealDailyHand(pool: PressBoxPlayer[], dayNum: number): DailyHand {
  const rand = mulberry32(dayNum * 7919 + 31337);
  const shuffled = shuffle(pool, rand);

  // Pick 7 players ensuring some scoring potential:
  // At least 2 different teams, at least 2 positions, spread of divisions
  const dealt = shuffled.slice(0, 6);
  const callUp = shuffled[6];

  const date = dateFromDayNumber(dayNum);
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return { dayNumber: dayNum, dateLabel, dealt, callUp };
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

// ── Fixed ceiling (cribbage homage) ──────────────────────────
export const MAX_SCORE = 15;
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
    `${bestScore}/${MAX_SCORE} pts ${starStr}${found ? " PERFECT HAND" : ""}`,
    "capandcrease.com/press-box",
  ].join("\n");
}
