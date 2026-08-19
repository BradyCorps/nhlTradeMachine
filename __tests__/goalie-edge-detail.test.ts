// ── goalie-edge-detail.test.ts ───────────────────────────────────
//
// The fixture below is the real `goalie-detail/8478009/20252026/2`
// response, trimmed to the fields the parser reads. It exists because
// three of them were guessed wrong the first time and every guess was
// plausible enough to ship:
//
//   • `goalsAgainstAvg`, not `goalsAgainstAverage`
//   • shots against is published NOWHERE — it is saves + goals against
//   • percentiles are 0–1 fractions, so reading them as 0–100 renders
//     every goalie in the league below the 50th and looks fine
//
// The assertions are pinned to figures the NHL prints on its own page
// for this goalie, so a regression shows up as a wrong number rather
// than as a shape mismatch nobody notices.

import { describe, it, expect } from "vitest";
import { parseGoalieEdge } from "@/app/lib/nhl-player-feed";

const SOROKIN = {
  player: {
    id: 8478009,
    firstName: { default: "Ilya" },
    lastName: { default: "Sorokin" },
    wins: 29,
    losses: 24,
    overtimeLosses: 2,
    goalsAgainstAvg: 2.678101,
    savePctg: 0.905882,
    gamesPlayed: 55,
  },
  stats: {
    goalsAgainstAvg: { value: 2.6781, percentile: 0.7119, leagueAvg: 2.9917 },
    gamesAbove900:   { value: 0.4444, percentile: 0.339,  leagueAvg: 0.4901 },
  },
  shotLocationSummary: [
    { locationCode: "all",  goalsAgainst: 144, goalsAgainstPercentile: 0.2034, goalsAgainstLeagueAvg: 77.0816,
      saves: 1386, savesPercentile: 0.8814, savesLeagueAvg: 663.0204,
      savePctg: 0.905882, savePctgPercentile: 0.7458, savePctgLeagueAvg: 0.89585 },
    { locationCode: "high", goalsAgainst: 71, saves: 452,
      savePctg: 0.864245, savePctgPercentile: 1, savePctgLeagueAvg: 0.810972 },
    { locationCode: "long", goalsAgainst: 8, saves: 272,
      savePctg: 0.971429, savePctgPercentile: 0.5932, savePctgLeagueAvg: 0.967791 },
    { locationCode: "mid",  goalsAgainst: 50, saves: 358,
      savePctg: 0.877451, savePctgPercentile: 0.3898, savePctgLeagueAvg: 0.884191 },
  ],
  shotLocationDetails: [
    { area: "Behind the Net", saves: 9, savesPercentile: 0.8367, savePctg: 0.818182, savePctgPercentile: 0.1186 },
    { area: "Slot",          saves: 393, savesPercentile: 0.91,  savePctg: 0.869,     savePctgPercentile: 0.77 },
  ],
};

describe("parseGoalieEdge", () => {
  const facts = parseGoalieEdge(SOROKIN, 20252026)!;

  it("parses a live payload", () => {
    expect(facts).not.toBeNull();
    expect(facts.playerId).toBe(8478009);
    expect(facts.season).toBe(20252026);
  });

  it("reads the season line from `player`", () => {
    expect(facts.gamesPlayed).toBe(55);
    expect(facts.wins).toBe(29);
    expect(facts.losses).toBe(24);
    expect(facts.otLosses).toBe(2);
  });

  // `goalsAgainstAverage` was the first guess and resolves to null.
  it("reads GAA from goalsAgainstAvg", () => {
    expect(facts.gaa).toBeCloseTo(2.678, 3);
  });

  it("finds all four locations", () => {
    expect(facts.zones.map(z => z.zone).sort()).toEqual(["all", "high", "long", "mid"]);
  });

  // The figure the NHL's own page prints for this goalie is 1530, and it
  // appears nowhere in the payload.
  it("derives shots against as saves + goals against", () => {
    expect(facts.shotsAgainst).toBe(1530);
    expect(facts.zones.find(z => z.zone === "high")!.shotsAgainst).toBe(523);
  });

  it("rescales percentiles from fractions to 0-100", () => {
    const all = facts.zones.find(z => z.zone === "all")!;
    expect(all.percentile).toBeCloseTo(74.58, 2);
    // A literal 1.0 is the top of the scale, not the first percentile.
    expect(facts.zones.find(z => z.zone === "high")!.percentile).toBe(100);
    expect(facts.zones.find(z => z.zone === "mid")!.percentile).toBeCloseTo(38.98, 2);
  });

  it("pulls starts-above-.900 out of stats, as a percentage", () => {
    expect(facts.startsAbove900Pct).toBeCloseTo(44.44, 2);
    expect(facts.startsAbove900Percentile).toBeCloseTo(33.9, 1);
    expect(facts.startsAbove900LeagueAvg).toBeCloseTo(49.01, 2);
  });

  it("surfaces high-danger, the load-bearing goalie signal", () => {
    expect(facts.highDangerSavePct).toBeCloseTo(0.8642, 4);
    expect(facts.highDangerGoalsAgainst).toBe(71);
    const high = facts.zones.find(z => z.zone === "high")!;
    expect(high.savePctLeagueAvg).toBeCloseTo(0.811, 3);
  });

  it("keeps save percentages as 0-1 fractions", () => {
    for (const z of facts.zones) {
      expect(z.savePct!).toBeGreaterThan(0.5);
      expect(z.savePct!).toBeLessThanOrEqual(1);
    }
  });

  it("carries the rink areas through under their feed names", () => {
    expect(facts.areas.map(a => a.area)).toContain("Behind the Net");
    expect(facts.areas.find(a => a.area === "Behind the Net")!.savePct).toBeCloseTo(0.8182, 4);
  });

  it("returns null without a player id rather than a hollow row", () => {
    expect(parseGoalieEdge({ stats: {} }, 20252026)).toBeNull();
    expect(parseGoalieEdge(null, 20252026)).toBeNull();
  });

  it("survives a payload with no locations at all", () => {
    const bare = parseGoalieEdge({ player: { id: 1, gamesPlayed: 3 } }, 20252026)!;
    expect(bare.zones).toEqual([]);
    expect(bare.shotsAgainst).toBeNull();
    expect(bare.highDangerSavePct).toBeNull();
  });
});
