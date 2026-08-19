// ── goalie-edge-detail.test.ts ───────────────────────────────────
//
// `parseGoalieEdge` was written without a live response — the NHL API is
// unreachable from the build environment — so its field spellings are
// inferred. These tests pin the behaviour that makes an inferred parser
// SAFE rather than the spellings themselves:
//
//   • a shape it does not recognise yields nulls, never invented numbers;
//   • save percentages come out as 0–1 fractions whichever way the feed
//     quotes them, because the valuation and STRAND rails assume that;
//   • the location array is found by shape, so renaming the key that
//     holds it does not break the parse;
//   • zone aliases cover the taxonomies the NHL actually uses.
//
// When `scripts/verify-goalie-edge.ts` reports the real keys, tighten the
// aliases and add a fixture here from the observed payload.

import { describe, it, expect } from "vitest";
import { parseGoalieEdge } from "@/app/lib/nhl-player-feed";

const SEASON = 20252026;

/** A payload shaped the way the skater sibling is, with Sorokin's real
 *  figures from the rendered NHL Edge page. */
const sorokin = {
  player: { id: 8478009, gamesPlayed: 55, wins: 29, losses: 24, otLosses: 2 },
  goalsAgainstAverage: 2.68,
  savePctg: 0.906,
  sogAgainstSummary: [
    { locationCode: "all",    savePctg: 0.906, savePctgLeagueAvg: 0.896, percentile: 75, shotsAgainst: 1530, saves: 1386, goalsAgainst: 144 },
    { locationCode: "high",   savePctg: 0.864, savePctgLeagueAvg: 0.811, percentile: 99, shotsAgainst: 523,  saves: 452,  goalsAgainst: 71 },
    { locationCode: "medium", savePctg: 0.877, savePctgLeagueAvg: 0.884, percentile: 42, shotsAgainst: 408,  saves: 358,  goalsAgainst: 50 },
    { locationCode: "low",    savePctg: 0.971, savePctgLeagueAvg: 0.968, percentile: 59, shotsAgainst: 280,  saves: 272,  goalsAgainst: 8 },
  ],
};

describe("parseGoalieEdge", () => {
  it("extracts the season line and all four locations", () => {
    const f = parseGoalieEdge(sorokin, SEASON)!;
    expect(f).not.toBeNull();
    expect(f.playerId).toBe(8478009);
    expect(f.season).toBe(SEASON);
    expect(f.gamesPlayed).toBe(55);
    expect(f.wins).toBe(29);
    expect(f.gaa).toBeCloseTo(2.68, 3);
    expect(f.zones).toHaveLength(4);
    expect(f.zones.map(z => z.zone)).toEqual(["all", "high", "mid", "long"]);
  });

  it("surfaces high-danger as the headline signal", () => {
    const f = parseGoalieEdge(sorokin, SEASON)!;
    expect(f.highDangerSavePct).toBeCloseTo(0.864, 4);
    expect(f.highDangerGoalsAgainst).toBe(71);
    const high = f.zones.find(z => z.zone === "high")!;
    expect(high.savePctLeagueAvg).toBeCloseTo(0.811, 4);
    expect(high.percentile).toBe(99);
  });

  it("takes all-location totals from the location split", () => {
    const f = parseGoalieEdge(sorokin, SEASON)!;
    expect(f.shotsAgainst).toBe(1530);
    expect(f.saves).toBe(1386);
    expect(f.goalsAgainst).toBe(144);
  });

  // ── The properties that make an inferred parser safe ────────────

  it("normalises save percentages to 0-1 however the feed quotes them", () => {
    const asPercent = {
      player: { id: 1 },
      summary: [{ locationCode: "high", savePctg: 86.4, savePctgLeagueAvg: 81.1 }],
    };
    const f = parseGoalieEdge(asPercent, SEASON)!;
    expect(f.highDangerSavePct).toBeCloseTo(0.864, 4);
    expect(f.zones[0].savePctLeagueAvg).toBeCloseTo(0.811, 4);
  });

  it("finds the location array by shape, not by key name", () => {
    const renamed = {
      player: { id: 1 },
      // A key nobody guessed, nested a level deeper than expected.
      shotDetail: { byLocation: [{ locationCode: "high", savePctg: 0.9 }] },
    };
    const f = parseGoalieEdge(renamed, SEASON)!;
    expect(f.zones).toHaveLength(1);
    expect(f.highDangerSavePct).toBeCloseTo(0.9, 4);
  });

  it("accepts the alternate location vocabularies", () => {
    const alt = {
      playerId: 2,
      summary: [
        { locationCode: "allLocations", savePctg: 0.9 },
        { locationCode: "highDanger",   savePctg: 0.86 },
        { locationCode: "midRange",     savePctg: 0.88 },
        { locationCode: "longRange",    savePctg: 0.97 },
      ],
    };
    const f = parseGoalieEdge(alt, SEASON)!;
    expect(f.zones.map(z => z.zone)).toEqual(["all", "high", "mid", "long"]);
  });

  it("reads numerics the feed quoted as strings", () => {
    const quoted = {
      player: { id: 3, gamesPlayed: "55" },
      summary: [{ locationCode: "high", savePctg: ".864", percentile: "99th" }],
    };
    const f = parseGoalieEdge(quoted, SEASON)!;
    expect(f.gamesPlayed).toBe(55);
    expect(f.highDangerSavePct).toBeCloseTo(0.864, 4);
    expect(f.zones[0].percentile).toBe(99);
  });

  it("leaves unmatched fields null rather than inventing them", () => {
    const sparse = { player: { id: 4 }, summary: [{ locationCode: "high", mysteryKey: 0.9 }] };
    const f = parseGoalieEdge(sparse, SEASON)!;
    expect(f.zones).toHaveLength(1);
    expect(f.zones[0].savePct).toBeNull();
    expect(f.highDangerSavePct).toBeNull();
    expect(f.gaa).toBeNull();
    expect(f.startsAbove900Pct).toBeNull();
  });

  it("returns null when no player id resolves — an unjoinable row is worthless", () => {
    expect(parseGoalieEdge({ summary: [{ locationCode: "high", savePctg: 0.9 }] }, SEASON)).toBeNull();
    expect(parseGoalieEdge(null, SEASON)).toBeNull();
    expect(parseGoalieEdge("not json", SEASON)).toBeNull();
  });

  it("ignores unknown location codes instead of mis-filing them", () => {
    const odd = {
      player: { id: 5 },
      summary: [
        { locationCode: "high", savePctg: 0.86 },
        { locationCode: "slot", savePctg: 0.5 },   // not a zone we display
      ],
    };
    const f = parseGoalieEdge(odd, SEASON)!;
    expect(f.zones).toHaveLength(1);
    expect(f.zones[0].zone).toBe("high");
  });

  it("keeps the first entry when a code repeats", () => {
    const dup = {
      player: { id: 6 },
      summary: [
        { locationCode: "high", savePctg: 0.86 },
        { locationCode: "high", savePctg: 0.10 },
      ],
    };
    const f = parseGoalieEdge(dup, SEASON)!;
    expect(f.zones).toHaveLength(1);
    expect(f.highDangerSavePct).toBeCloseTo(0.86, 4);
  });
});
