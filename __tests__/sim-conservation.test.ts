import { describe, it, expect } from "vitest";
import {
  apportion,
  conserveTeamSeason,
  conserveLeaguePoints,
  teamGoalsFor,
  TEAM_SKATER_GAMES,
  LEAGUE_POINT_TOTAL,
  type ConservableSkater,
} from "../app/lib/sim-conservation";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("apportion", () => {
  it("distributes exactly to the total with no caps", () => {
    const out = apportion([1, 1, 2], 100);
    expect(sum(out)).toBe(100);
    expect(out.every(Number.isInteger)).toBe(true);
    // proportional: the weight-2 item gets ~twice the weight-1 items
    expect(out[2]).toBeGreaterThan(out[0]);
  });

  it("respects per-item caps and still sums to the total", () => {
    const out = apportion([1, 1, 1], 100, [10, Infinity, Infinity]);
    expect(sum(out)).toBe(100);
    expect(out[0]).toBeLessThanOrEqual(10);
  });

  it("caps the total at Σcaps when the budget cannot be placed", () => {
    const out = apportion([1, 1, 1], 100, [10, 10, 10]);
    expect(sum(out)).toBe(30);
    expect(out).toEqual([10, 10, 10]);
  });

  it("treats all-zero weights as equal", () => {
    const out = apportion([0, 0, 0, 0], 8);
    expect(sum(out)).toBe(8);
    expect(out).toEqual([2, 2, 2, 2]);
  });

  it("is deterministic and order-stable", () => {
    const a = apportion([3, 1, 4, 1, 5], 97, [50, 50, 50, 50, 50]);
    const b = apportion([3, 1, 4, 1, 5], 97, [50, 50, 50, 50, 50]);
    expect(a).toEqual(b);
    expect(sum(a)).toBe(97);
  });

  it("handles a zero total", () => {
    expect(apportion([1, 2, 3], 0)).toEqual([0, 0, 0]);
  });
});

describe("teamGoalsFor", () => {
  it("maps a middling team near league-average goals-for", () => {
    const gf = teamGoalsFor(90);
    expect(gf).toBeGreaterThan(230);
    expect(gf).toBeLessThan(265);
  });
  it("gives a contender more goals than a tanker", () => {
    expect(teamGoalsFor(112)).toBeGreaterThan(teamGoalsFor(66));
  });
});

describe("conserveTeamSeason", () => {
  // A believable 20-skater roster: a few stars, middle six, depth, one scratch.
  const makeRoster = (): (ConservableSkater & { id: string })[] =>
    Array.from({ length: 20 }, (_, i) => {
      const pts = Math.max(8, 85 - i * 4);
      const goals = Math.round(pts * 0.35);
      return {
        id: `p${i}`,
        gamesPlayed: i < 18 ? 74 + (i % 5) : 30, // 18 regulars, 2 depth
        projectedPts: pts,
        projectedGoals: goals,
        projectedAssists: pts - goals,
        benched: i >= 18,
      };
    });

  it("conserves skater-games to exactly 1476", () => {
    const roster = makeRoster();
    conserveTeamSeason(roster, { teamGoals: 250 });
    expect(sum(roster.map(s => s.gamesPlayed))).toBe(TEAM_SKATER_GAMES);
  });

  it("conserves goals to the team goals-for", () => {
    const roster = makeRoster();
    conserveTeamSeason(roster, { teamGoals: 250 });
    expect(sum(roster.map(s => s.projectedGoals))).toBe(250);
  });

  it("keeps points = goals + assists for every skater", () => {
    const roster = makeRoster();
    conserveTeamSeason(roster, { teamGoals: 250 });
    for (const s of roster) {
      expect(s.projectedGoals + s.projectedAssists).toBe(s.projectedPts);
      expect(s.projectedGoals).toBeLessThanOrEqual(s.projectedPts);
      expect(s.projectedGoals).toBeGreaterThanOrEqual(0);
      expect(s.projectedAssists).toBeGreaterThanOrEqual(0);
    }
  });

  it("caps a benched skater's games and keeps stars ahead of depth", () => {
    const roster = makeRoster();
    conserveTeamSeason(roster, { teamGoals: 250, benchGamesCap: 48 });
    const scratch = roster.find(s => s.id === "p19")!;
    const star = roster.find(s => s.id === "p0")!;
    expect(scratch.gamesPlayed).toBeLessThanOrEqual(48);
    expect(star.gamesPlayed).toBeGreaterThan(scratch.gamesPlayed);
  });

  it("gives the better finisher more goals", () => {
    const roster = makeRoster();
    conserveTeamSeason(roster, { teamGoals: 250 });
    const star = roster.find(s => s.id === "p0")!;
    const depth = roster.find(s => s.id === "p15")!;
    expect(star.projectedGoals).toBeGreaterThanOrEqual(depth.projectedGoals);
  });
});

describe("conserveLeaguePoints", () => {
  it("conserves the league total (within rounding) and preserves ordering", () => {
    const raw = Array.from({ length: 32 }, (_, i) => 70 + i * 2); // 70..132, inflated spread
    const out = conserveLeaguePoints(raw);
    // pure proportional rounding lands within a few points of the target
    expect(Math.abs(sum(out) - LEAGUE_POINT_TOTAL)).toBeLessThanOrEqual(16);
    // ordering preserved
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
    // the average is brought to ~91
    expect(sum(out) / 32).toBeCloseTo(91.375, 0);
  });

  it("is order-independent (reversing the input reverses the output, same values)", () => {
    const raw = Array.from({ length: 32 }, (_, i) => 60 + i * 3);
    const out = conserveLeaguePoints(raw);
    const rev = conserveLeaguePoints([...raw].reverse());
    expect(rev).toEqual([...out].reverse());
  });

  it("never exceeds the max possible team points", () => {
    const raw = new Array(32).fill(200); // absurd
    const out = conserveLeaguePoints(raw);
    expect(Math.max(...out)).toBeLessThanOrEqual(164);
  });
});
