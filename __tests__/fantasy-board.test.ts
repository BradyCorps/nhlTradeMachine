// ── F0 — fantasy draft board engine ──────────────────────────────
import { describe, it, expect } from "vitest";
import {
  buildFantasyBoard,
  buildBreakoutWatch,
  fantasyPoints,
  replacementRanks,
  assignTiers,
  keeperRank,
  sanitizeSettings,
  DEFAULT_FANTASY_SETTINGS,
  type FantasyPlayerInput,
  type FantasyRow,
} from "@/app/lib/fantasy-board";

const player = (id: string, over: Partial<FantasyPlayerInput> = {}): FantasyPlayerInput => ({
  id, name: id, teamId: "WPG", position: "C", age: 27, games: 70,
  goalsPace: 20, assistsPace: 30, ppPtsPace82: 10, baselineHits82: 50, baselineBlocks82: 40,
  ...over,
});

describe("fantasyPoints", () => {
  it("scores under the provided league weights", () => {
    const p = player("x", { goalsPace: 30, assistsPace: 50, ppPtsPace82: 20, baselineHits82: 100, baselineBlocks82: 60 });
    // 30*6 + 50*4 + 20*2 + 100*0.6 + 60*1 = 180+200+40+60+60 = 540
    expect(fantasyPoints(p, DEFAULT_FANTASY_SETTINGS.scoring)).toBe(540);
    // Goals-heavy league changes the answer
    expect(fantasyPoints(p, { G: 10, A: 2, PPP: 0, HIT: 0, BLK: 0 })).toBe(400);
  });

  it("treats missing banger stats as zero, not NaN", () => {
    const p = player("x", { baselineHits82: null, baselineBlocks82: null });
    expect(Number.isFinite(fantasyPoints(p, DEFAULT_FANTASY_SETTINGS.scoring))).toBe(true);
  });
});

describe("replacementRanks", () => {
  it("scales replacement level with league size and roster build", () => {
    expect(replacementRanks(DEFAULT_FANTASY_SETTINGS)).toEqual({ C: 24, W: 48, D: 48 });
    expect(replacementRanks({ ...DEFAULT_FANTASY_SETTINGS, teams: 8 })).toEqual({ C: 16, W: 32, D: 32 });
    expect(replacementRanks({ ...DEFAULT_FANTASY_SETTINGS, starters: { C: 3, W: 3, D: 4 } }))
      .toEqual({ C: 36, W: 36, D: 48 });
  });
});

describe("buildFantasyBoard", () => {
  it("excludes goalies, picks, and sub-10-GP samples, sorted by FP", () => {
    const board = buildFantasyBoard([
      player("star", { goalsPace: 50, assistsPace: 70 }),
      player("mid"),
      player("goalie", { position: "G" }),
      player("pick", { position: "Pick" }),
      player("cameo", { games: 4 }),
    ]);
    expect(board.map(r => r.p.id)).toEqual(["star", "mid"]);
    expect(board[0].fp82).toBeGreaterThan(board[1].fp82);
  });

  it("VBD is positive above replacement and negative below it", () => {
    // 4-team league, 1 C slot → replacement is the 4th C.
    const settings = sanitizeSettings({ ...DEFAULT_FANTASY_SETTINGS, teams: 4, starters: { C: 1, W: 1, D: 1 } });
    const board = buildFantasyBoard(
      [60, 50, 40, 30, 20].map((g, i) => player(`c${i}`, { goalsPace: g, assistsPace: 0, ppPtsPace82: 0, baselineHits82: 0, baselineBlocks82: 0 })),
      settings,
    );
    const replacementFp = board[3].fp82;
    expect(board[0].vbd).toBe(board[0].fp82 - replacementFp);
    expect(board[4].vbd).toBeLessThan(0);
    expect(board[3].vbd).toBe(0);
  });
});

describe("assignTiers", () => {
  it("places tier breaks at the largest projection drop-offs", () => {
    // FP: 100, 98, 70, 68, 40 — the two huge gaps are after idx1 and idx3.
    const rows = [100, 98, 70, 68, 40].map((fp, i) => ({ fp82: fp, p: { id: `p${i}` } } as FantasyRow));
    assignTiers(rows, 3, 5);
    expect(rows.map(r => r.tier)).toEqual([1, 1, 2, 2, 3]);
  });

  it("players beyond the tiered pool land in the overflow tier", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ fp82: 100 - i, p: { id: `p${i}` } } as FantasyRow));
    assignTiers(rows, 2, 4);
    expect(rows[5].tier).toBe(3); // tiers+1
  });
});

describe("keeperRank", () => {
  it("age-gates and leads with the dynasty signal over raw FP", () => {
    const board = buildFantasyBoard([
      player("young-dynasty", { age: 20, goalsPace: 15, developmentProfile: { dynastyScore: 90 } }),
      player("young-scorer", { age: 21, goalsPace: 45, developmentProfile: { dynastyScore: 70 } }),
      player("vet", { age: 30, goalsPace: 50, developmentProfile: { dynastyScore: 95 } }),
    ]);
    const keepers = keeperRank(board);
    expect(keepers.map(r => r.p.id)).toEqual(["young-dynasty", "young-scorer"]);
  });
});

describe("sanitizeSettings", () => {
  it("clamps garbage and fills gaps with defaults", () => {
    const s = sanitizeSettings({ scoring: { G: 999, A: "x" }, teams: -3, starters: { C: 0 } });
    expect(s.scoring.G).toBe(25);           // clamped
    expect(s.scoring.A).toBe(4);            // default
    expect(s.teams).toBe(4);                // clamped floor
    expect(s.starters.C).toBe(1);           // clamped floor
    expect(s.starters.W).toBe(4);           // default
  });

  it("returns pure defaults for non-objects", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_FANTASY_SETTINGS);
    expect(sanitizeSettings("junk")).toEqual(DEFAULT_FANTASY_SETTINGS);
  });
});

describe("buildBreakoutWatch (EDGE research layer)", () => {
  const young = (id: string, over: Partial<FantasyPlayerInput> = {}) => player(id, {
    age: 22, games: 60, ptsPace: 45, baselinePtsPace: 40, avgTOI: 16,
    xGPace: 20, goalsPace: 14, hdFinishingDelta: -0.03,
    edgeBurstsOver20: 70, edgeSpeedMaxMph: 23.0,
    ...over,
  });

  it("surfaces signal-rich young players with a driver-based reason", () => {
    const watch = buildBreakoutWatch([
      young("riser"),
      player("old-vet", { age: 34, games: 80, ptsPace: 50 }),
      player("goalie", { position: "G" }),
      player("cameo", { games: 5 }),
    ]);
    const ids = watch.map(e => e.p.id);
    expect(ids).toContain("riser");
    expect(ids).not.toContain("goalie");
    expect(ids).not.toContain("cameo");
    const riser = watch.find(e => e.p.id === "riser")!;
    expect(riser.breakoutPct).toBeGreaterThanOrEqual(20);
    expect(riser.reason.length).toBeGreaterThan(10);
  });

  it("ranks by breakout probability and respects the limit", () => {
    const pool = Array.from({ length: 12 }, (_, i) => young(`y${i}`, { age: 21 + (i % 3) }));
    const watch = buildBreakoutWatch(pool, 5);
    expect(watch).toHaveLength(5);
    for (let i = 1; i < watch.length; i++) {
      expect(watch[i - 1].breakoutPct).toBeGreaterThanOrEqual(watch[i].breakoutPct);
    }
  });
});
