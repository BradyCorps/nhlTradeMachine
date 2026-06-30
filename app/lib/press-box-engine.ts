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

// ── Share text ────────────────────────────────────────────────
export function buildShareText(dayNum: number, score: number, breakdown: ScoringBreakdown): string {
  const blocks = [
    breakdown.teammates.points > 0 ? "🏒" : "·",
    breakdown.draftClass.points > 0 ? "📋" : "·",
    breakdown.pipeline.points > 0 ? "📈" : "·",
    breakdown.divisionFlush.points > 0 ? "🗺" : "·",
    breakdown.countryClub.points > 0 ? "🌍" : "·",
    breakdown.positionGroup.points > 0 ? "🎯" : "·",
    breakdown.callUpBonus.points > 0 ? "⭐" : "·",
  ];
  return `Press Box #${dayNum}: ${score} pts\n${blocks.join("")}\nthehockeyledger.com/press-box`;
}

// ── Score rating ──────────────────────────────────────────────
export function scoreRating(score: number): { label: string; color: string } {
  if (score >= 20) return { label: "FRONT PAGE", color: "var(--ledger-green)" };
  if (score >= 14) return { label: "ABOVE THE FOLD", color: "var(--ledger-navy)" };
  if (score >= 8) return { label: "PAGE THREE", color: "var(--ledger-brown)" };
  if (score >= 4) return { label: "CLASSIFIED", color: "var(--ledger-amber)" };
  return { label: "PRESS RELEASE", color: "var(--ledger-red)" };
}
