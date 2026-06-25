// ============================================================
// 2026 NHL DRAFT — first-round order + prospect board
//
// Season-specific data (like season-config). The 2026 draft has NOT been played,
// so the picks stay tradeable assets in the league. "Draft Night" projects the
// first round: it walks the real pick order (trades baked in) and assigns the
// ranked prospect board best-available with a little seeded reach/slide, so a
// given seed always yields the same draft.
//
// Source: user-supplied first-round order + prospect rankings (June 2026).
// Refresh each off-season. Display-only for now — nothing is written to rosters.
// ============================================================

import { mulberry32, hashString } from "@/app/lib/sim-engine";

export interface DraftPickSlot {
  overall: number;
  team: string;          // current owner (who makes the pick)
  originalTeam: string;  // original owner — "via" credit when it differs
}

export interface DraftProspect {
  rank: number;
  name: string;
  pos: string;           // as scouted, e.g. "LW", "C/RW", "D", "F"
  league: string;
  club: string;
  gp: number;
  g: number;
  a: number;
  pts: number;
}

export interface DraftResult extends DraftPickSlot {
  prospect: DraftProspect;
}

// ── First-round order (overall, current owner, original owner) ──────────────
// Trades are already baked in: `originalTeam` is the first club in the pick's
// ownership chain; `team` is who holds it on draft night.
export const DRAFT_2026_ORDER: DraftPickSlot[] = [
  { overall: 1,  team: "TOR", originalTeam: "TOR" },
  { overall: 2,  team: "SJS", originalTeam: "SJS" },
  { overall: 3,  team: "VAN", originalTeam: "VAN" },
  { overall: 4,  team: "BUF", originalTeam: "CHI" },
  { overall: 5,  team: "NYR", originalTeam: "NYR" },
  { overall: 6,  team: "CGY", originalTeam: "CGY" },
  { overall: 7,  team: "SEA", originalTeam: "SEA" },
  { overall: 8,  team: "WPG", originalTeam: "WPG" },
  { overall: 9,  team: "SJS", originalTeam: "FLA" },
  { overall: 10, team: "NSH", originalTeam: "NSH" },
  { overall: 11, team: "STL", originalTeam: "STL" },
  { overall: 12, team: "NJD", originalTeam: "NJD" },
  { overall: 13, team: "NYI", originalTeam: "NYI" },
  { overall: 14, team: "CBJ", originalTeam: "CBJ" },
  { overall: 15, team: "STL", originalTeam: "DET" },
  { overall: 16, team: "STL", originalTeam: "WSH" },
  { overall: 17, team: "LAK", originalTeam: "LAK" },
  { overall: 18, team: "WSH", originalTeam: "ANA" },
  { overall: 19, team: "UTA", originalTeam: "UTA" },
  { overall: 20, team: "BUF", originalTeam: "EDM" },
  { overall: 21, team: "PHI", originalTeam: "PHI" },
  { overall: 22, team: "PIT", originalTeam: "PIT" },
  { overall: 23, team: "BOS", originalTeam: "BOS" },
  { overall: 24, team: "VAN", originalTeam: "MIN" },
  { overall: 25, team: "OTT", originalTeam: "TBL" },
  { overall: 26, team: "NYR", originalTeam: "DAL" },
  { overall: 27, team: "SJS", originalTeam: "BUF" },
  { overall: 28, team: "MTL", originalTeam: "MTL" },
  { overall: 29, team: "STL", originalTeam: "COL" },
  { overall: 30, team: "CGY", originalTeam: "VGK" },
  { overall: 31, team: "CAR", originalTeam: "CAR" },
  { overall: 32, team: "OTT", originalTeam: "OTT" },
];

// ── Prospect board (ranked 1–32) ────────────────────────────────────────────
export const DRAFT_2026_PROSPECTS: DraftProspect[] = [
  { rank: 1,  name: "Gavin McKenna",      pos: "LW",    league: "NCAA",             club: "Penn State Univ.",            gp: 35, g: 15, a: 36, pts: 51 },
  { rank: 2,  name: "Ivar Stenberg",      pos: "LW/RW", league: "SHL",              club: "Frölunda HC",                 gp: 43, g: 11, a: 22, pts: 33 },
  { rank: 3,  name: "Keaton Verhoeff",    pos: "D",     league: "NCAA",             club: "Univ. of North Dakota",       gp: 36, g: 6,  a: 14, pts: 20 },
  { rank: 4,  name: "Tynan Lawrence",     pos: "C",     league: "NCAA",             club: "Boston Univ.",                gp: 18, g: 2,  a: 5,  pts: 7  },
  { rank: 5,  name: "Chase Reid",         pos: "D",     league: "OHL",              club: "Soo Greyhounds",              gp: 45, g: 18, a: 30, pts: 48 },
  { rank: 6,  name: "Ethan Belchetz",     pos: "LW",    league: "OHL",              club: "Windsor Spitfires",           gp: 57, g: 34, a: 25, pts: 59 },
  { rank: 7,  name: "Caleb Malhotra",     pos: "C",     league: "OHL",              club: "Brantford Bulldogs",          gp: 67, g: 29, a: 55, pts: 84 },
  { rank: 8,  name: "Carson Carels",      pos: "D",     league: "WHL",              club: "Prince George Cougars",       gp: 58, g: 20, a: 53, pts: 73 },
  { rank: 9,  name: "Viggo Björck",       pos: "C/RW",  league: "SHL",              club: "Djurgårdens IF",              gp: 42, g: 6,  a: 9,  pts: 15 },
  { rank: 10, name: "Ryan Lin",           pos: "D",     league: "WHL",              club: "Vancouver Giants",            gp: 53, g: 14, a: 43, pts: 57 },
  { rank: 11, name: "Daxon Rudolph",      pos: "D",     league: "WHL",              club: "Prince Albert Raiders",       gp: 68, g: 28, a: 50, pts: 78 },
  { rank: 12, name: "Mathis Preston",     pos: "F",     league: "WHL",              club: "Spokane Chiefs",              gp: 36, g: 14, a: 18, pts: 32 },
  { rank: 13, name: "Adam Novotný",       pos: "LW/RW", league: "OHL",              club: "Peterborough Petes",          gp: 58, g: 34, a: 31, pts: 65 },
  { rank: 14, name: "Xavier Villeneuve",  pos: "D",     league: "QMJHL",            club: "Blainville-Boisbriand Armada",gp: 37, g: 6,  a: 32, pts: 38 },
  { rank: 15, name: "Alberts Smits",      pos: "D",     league: "Liiga",            club: "Jukurit",                     gp: 38, g: 6,  a: 7,  pts: 13 },
  { rank: 16, name: "Oliver Suvanto",     pos: "C",     league: "Liiga",            club: "Tappara",                     gp: 48, g: 2,  a: 9,  pts: 11 },
  { rank: 17, name: "Juho Piiparinen",    pos: "D",     league: "Liiga",            club: "Tappara",                     gp: 29, g: 0,  a: 3,  pts: 3  },
  { rank: 18, name: "Ryan Roobroeck",     pos: "C",     league: "OHL",              club: "Niagara IceDogs",             gp: 49, g: 30, a: 28, pts: 58 },
  { rank: 19, name: "J.P. Hurlbert",      pos: "F",     league: "WHL",              club: "Kamloops Blazers",            gp: 68, g: 42, a: 55, pts: 97 },
  { rank: 20, name: "Oscar Hemming",      pos: "F",     league: "NCAA",             club: "Boston College",              gp: 19, g: 1,  a: 7,  pts: 8  },
  { rank: 21, name: "Nikita Klepov",      pos: "F",     league: "OHL",              club: "Saginaw Spirit",              gp: 67, g: 37, a: 60, pts: 97 },
  { rank: 22, name: "Elton Hermansson",   pos: "RW/LW", league: "HockeyAllsvenskan",club: "MoDo Hockey",                 gp: 38, g: 11, a: 10, pts: 21 },
  { rank: 23, name: "Marcus Nordmark",    pos: "LW",    league: "U20 Nationell",    club: "Djurgårdens IF U20",          gp: 25, g: 14, a: 24, pts: 38 },
  { rank: 24, name: "William Håkansson",  pos: "D",     league: "SHL",              club: "Luleå HF",                    gp: 22, g: 0,  a: 2,  pts: 2  },
  { rank: 25, name: "Yegor Shilov",       pos: "C",     league: "QMJHL",            club: "Victoriaville Tigres",        gp: 63, g: 32, a: 50, pts: 82 },
  { rank: 26, name: "Jack Hextall",       pos: "C",     league: "USHL",             club: "Youngstown Phantoms",         gp: 59, g: 20, a: 38, pts: 58 },
  { rank: 27, name: "Malte Gustafsson",   pos: "D",     league: "U20 Nationell",    club: "HV71 U20",                    gp: 19, g: 4,  a: 8,  pts: 12 },
  { rank: 28, name: "Brooks Rogowski",    pos: "C",     league: "OHL",              club: "Oshawa Generals",             gp: 46, g: 15, a: 27, pts: 42 },
  { rank: 29, name: "Ilia Morozov",       pos: "C",     league: "NCAA",             club: "Miami Univ. (Ohio)",          gp: 36, g: 8,  a: 12, pts: 20 },
  { rank: 30, name: "Giorgos Pantelas",   pos: "D",     league: "WHL",              club: "Brandon Wheat Kings",         gp: 68, g: 6,  a: 31, pts: 37 },
  { rank: 31, name: "Niklas Aaram-Olsen", pos: "RW/LW", league: "U20 Nationell",    club: "Örebro HK U20",               gp: 29, g: 20, a: 20, pts: 40 },
  { rank: 32, name: "Beckham Edwards",    pos: "C",     league: "OHL",              club: "Sarnia Sting",                gp: 64, g: 19, a: 26, pts: 45 },
];

// Reach/slide window: each pick is drawn from the top few still on the board,
// weighted toward the best available. Small enough to stay realistic.
const PICK_WEIGHTS = [0.7, 0.2, 0.1];

// Seeded RNG for the draft. Same seed → same CPU board. Kept here so the
// interactive component and the auto-sim share one definition.
export function createDraftRng(seed: number): () => number {
  return mulberry32(Math.floor(seed) + hashString("draft-night-2026"));
}

// Index into the remaining board for a CPU pick: weighted toward best-available
// with a small reach/slide window.
export function cpuPickIndex(boardSize: number, rand: () => number): number {
  const windowSize = Math.min(PICK_WEIGHTS.length, boardSize);
  const weights = PICK_WEIGHTS.slice(0, windowSize);
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < windowSize; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return 0;
}

// Advance the draft through CPU-controlled slots, mutating `results`/`board` in
// place, stopping when the next slot belongs to `homeTeamId` (the GM is on the
// clock) or the round is complete. With no home team it drafts the whole round.
export function autoCpuPicks(
  results: DraftResult[],
  board: DraftProspect[],
  rand: () => number,
  homeTeamId?: string | null,
): void {
  while (results.length < DRAFT_2026_ORDER.length) {
    const slot = DRAFT_2026_ORDER[results.length];
    if (homeTeamId && slot.team === homeTeamId) break; // GM is on the clock
    const idx = cpuPickIndex(board.length, rand);
    const [prospect] = board.splice(idx, 1);
    results.push({ ...slot, prospect });
  }
}

// Project the full first round with no GM input (every slot CPU-controlled).
// Deterministic in `seed`: same seed → same draft.
export function runDraftNight(seed: number): DraftResult[] {
  const rand = createDraftRng(seed);
  const board = [...DRAFT_2026_PROSPECTS];
  const results: DraftResult[] = [];
  autoCpuPicks(results, board, rand, null);
  return results;
}
