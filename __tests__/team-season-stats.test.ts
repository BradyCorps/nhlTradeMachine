import { describe, expect, it } from "vitest";
import { missingObservedStats, type ObservedStats } from "@/app/lib/observed-season";
import { selectedPlayerStats, seasonStat, teamSeasonLeaders } from "@/app/lib/team-season-stats";

const selection = { season: "20262027", gameType: 2 } as const;
const observed = (overrides: Partial<ObservedStats> = {}): ObservedStats => ({
  ...missingObservedStats(selection), coverage: "available", games: 4, points: 3, goals: 1, assists: 2, ...overrides,
});
const player = (id: string, position = "C", teamId = "WPG") => ({ id, name: id, position, teamId });

describe("team selected-season statistics", () => {
  it("rejects a different season or competition without falling back to model inputs", () => {
    expect(selectedPlayerStats([
      { id: "correct", observedStats: observed() },
      { id: "previous", observedStats: observed({ season: "20252026" }) },
      { id: "playoffs", observedStats: observed({ gameType: 3 }) },
      { id: "model-only" },
    ], selection)).toEqual({ correct: observed() });
  });
  it("uses current assigned identities and sorts real scoring rather than input order", () => {
    const roster = [player("one"), player("leader"), player("other-team", "C", "EDM"), player("missing"), player("zero"), player("null-points")];
    const stats = { one: observed(), leader: observed({ points: 7 }), "other-team": observed({ points: 100 }),
      missing: missingObservedStats(selection), zero: observed({ coverage: "zero-games", games: 0, points: 0 }), "null-points": observed({ points: null }) };
    expect(teamSeasonLeaders(roster, "WPG", stats).skaters.map(p => p.id)).toEqual(["leader", "one"]);
  });
  it("includes recorded zero-point skaters and caps the scoring leaders at five", () => {
    const roster = Array.from({ length: 7 }, (_, i) => player(String(i)));
    const stats = Object.fromEntries(roster.map(p => [p.id, observed({ points: 0 })]));
    expect(teamSeasonLeaders(roster, "WPG", stats).skaters).toHaveLength(5);
  });
  it("keeps goalie results separate and orders by games rather than save percentage or lineup order", () => {
    const roster = [player("backup", "G"), player("starter", "G"), player("unavailable", "G"), player("skater")];
    const stats = { backup: observed({ games: 1, savePct: .93548 }), starter: observed({ games: 3, savePct: .92 }), skater: observed(), unavailable: missingObservedStats(selection, true) };
    expect(teamSeasonLeaders(roster, "WPG", stats).goalies.map(p => p.id)).toEqual(["starter", "backup"]);
  });
  it("preserves measured zeros and missing values and formats NHL save fractions without rescaling", () => {
    expect(seasonStat(0)).toBe("0");
    expect(seasonStat(null)).toBe("—");
    expect(seasonStat(undefined)).toBe("—");
    expect(seasonStat(NaN)).toBe("—");
    expect(seasonStat(.93548, 3)).toBe("0.935");
    expect(seasonStat(2.61794, 2)).toBe("2.62");
  });
});
