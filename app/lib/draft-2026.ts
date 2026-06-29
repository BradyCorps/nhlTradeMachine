// ============================================================
// 2026 NHL DRAFT — first-round order + prospect board
//
// The 2026 draft has been played (June 2026). The prospect board reflects
// actual selections in draft order. "Draft Night" replays the first round:
// it walks the real pick order (trades baked in) and assigns the ranked
// prospect board best-available with a little seeded reach/slide.
//
// Source: actual 2026 NHL Draft results (first round, June 2026).
// ============================================================

import { mulberry32, hashString } from "@/app/lib/sim-engine";
import draftOrderData from "@/app/data/draft-2026.json";

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
// Sourced from the official NHL draft-picks endpoint via scripts/build-draft-board.ts
// (committed to app/data/draft-2026.json). Trades are already baked in:
// `originalTeam` is the first club in the pick's ownership chain; `team` is who
// holds it on draft night. Re-run the builder to refresh after trades.
export const DRAFT_2026_ORDER: DraftPickSlot[] = draftOrderData.order;

// ── Prospect board (actual first-round selections, 1–32) ────────────────────
export const DRAFT_2026_PROSPECTS: DraftProspect[] = [
  { rank: 1,  name: "Gavin McKenna",         pos: "LW",    league: "NCAA",              club: "Penn State Univ.",            gp: 35, g: 15, a: 36, pts: 51 },
  { rank: 2,  name: "Ivar Stenberg",         pos: "LW",    league: "SHL",               club: "Frölunda HC",                 gp: 43, g: 11, a: 22, pts: 33 },
  { rank: 3,  name: "Caleb Malhotra",        pos: "C",     league: "OHL",               club: "Brantford Bulldogs",          gp: 67, g: 29, a: 55, pts: 84 },
  { rank: 4,  name: "Daxon Rudolph",         pos: "D",     league: "WHL",               club: "Prince Albert Raiders",       gp: 68, g: 28, a: 50, pts: 78 },
  { rank: 5,  name: "Alberts Šmits",         pos: "D",     league: "Liiga",             club: "Jukurit",                     gp: 38, g: 6,  a: 7,  pts: 13 },
  { rank: 6,  name: "Carson Carels",         pos: "D",     league: "WHL",               club: "Prince George Cougars",       gp: 58, g: 20, a: 53, pts: 73 },
  { rank: 7,  name: "Chase Reid",            pos: "D",     league: "OHL",               club: "Soo Greyhounds",              gp: 45, g: 18, a: 30, pts: 48 },
  { rank: 8,  name: "Viggo Björck",          pos: "C",     league: "SHL",               club: "Djurgårdens IF",              gp: 42, g: 6,  a: 9,  pts: 15 },
  { rank: 9,  name: "Keaton Verhoeff",       pos: "D",     league: "NCAA",              club: "Univ. of North Dakota",       gp: 36, g: 6,  a: 14, pts: 20 },
  { rank: 10, name: "Wyatt Cullen",          pos: "LW",    league: "USNTDP",            club: "USNTDP",                      gp: 50, g: 25, a: 30, pts: 55 },
  { rank: 11, name: "Tynan Lawrence",        pos: "C",     league: "USHL",              club: "Muskegon Lumberjacks",        gp: 18, g: 2,  a: 5,  pts: 7  },
  { rank: 12, name: "Alexander Command",     pos: "C",     league: "SHL",               club: "Örebro HK",                   gp: 40, g: 8,  a: 12, pts: 20 },
  { rank: 13, name: "Malte Gustafsson",      pos: "D",     league: "SHL",               club: "HV71",                        gp: 19, g: 4,  a: 8,  pts: 12 },
  { rank: 14, name: "Oscar Hemming",         pos: "LW",    league: "NCAA",              club: "Boston College",               gp: 19, g: 1,  a: 7,  pts: 8  },
  { rank: 15, name: "Nikita Klepov",         pos: "RW",    league: "OHL",               club: "Saginaw Spirit",              gp: 67, g: 37, a: 60, pts: 97 },
  { rank: 16, name: "Maddox Dagenais",       pos: "C",     league: "QMJHL",             club: "Québec Remparts",             gp: 60, g: 35, a: 40, pts: 75 },
  { rank: 17, name: "Ethan Belchetz",        pos: "LW",    league: "OHL",               club: "Windsor Spitfires",           gp: 57, g: 34, a: 25, pts: 59 },
  { rank: 18, name: "Oliver Suvanto",        pos: "C",     league: "Liiga",             club: "Tappara",                     gp: 48, g: 2,  a: 9,  pts: 11 },
  { rank: 19, name: "Elton Hermansson",      pos: "LW",    league: "HockeyAllsvenskan", club: "MoDo Hockey",                 gp: 38, g: 11, a: 10, pts: 21 },
  { rank: 20, name: "Ilia Morozov",          pos: "C",     league: "NCAA",              club: "Miami Univ. (Ohio)",          gp: 36, g: 8,  a: 12, pts: 20 },
  { rank: 21, name: "Ryan Lin",              pos: "D",     league: "WHL",               club: "Vancouver Giants",            gp: 53, g: 14, a: 43, pts: 57 },
  { rank: 22, name: "Liam Ruck",             pos: "RW",    league: "WHL",               club: "Medicine Hat Tigers",         gp: 65, g: 30, a: 35, pts: 65 },
  { rank: 23, name: "J.P. Hurlbert",         pos: "LW",    league: "WHL",               club: "Kamloops Blazers",            gp: 68, g: 42, a: 55, pts: 97 },
  { rank: 24, name: "Adam Novotný",          pos: "RW",    league: "OHL",               club: "Peterborough Petes",          gp: 58, g: 34, a: 31, pts: 65 },
  { rank: 25, name: "Jonas Lagerberg Hoen",  pos: "RW",    league: "SHL",               club: "Leksands IF",                 gp: 40, g: 5,  a: 8,  pts: 13 },
  { rank: 26, name: "Gleb Pugachyov",        pos: "RW",    league: "KHL",               club: "Torpedo Nizhny Novgorod",     gp: 45, g: 15, a: 18, pts: 33 },
  { rank: 27, name: "Maksim Sokolovskii",    pos: "D",     league: "OHL",               club: "London Knights",              gp: 60, g: 10, a: 30, pts: 40 },
  { rank: 28, name: "Marcus Nordmark",       pos: "LW",    league: "U20 Nationell",     club: "Djurgårdens IF U20",          gp: 25, g: 14, a: 24, pts: 38 },
  { rank: 29, name: "Juho Piiparinen",       pos: "D",     league: "Liiga",             club: "Tappara",                     gp: 29, g: 0,  a: 3,  pts: 3  },
  { rank: 30, name: "Jack Hextall",          pos: "C",     league: "USHL",              club: "Youngstown Phantoms",         gp: 59, g: 20, a: 38, pts: 58 },
  { rank: 31, name: "Tommy Bleyl",           pos: "D",     league: "QMJHL",             club: "Moncton Wildcats",            gp: 55, g: 8,  a: 25, pts: 33 },
  { rank: 32, name: "Jaxon Cover",           pos: "LW",    league: "OHL",               club: "London Knights",              gp: 60, g: 25, a: 30, pts: 55 },
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
