import { describe, expect, it } from "vitest";
import {
  parseLanding,
  parseEdge,
  missingPaths,
  LANDING_REQUIRED_PATHS,
  EDGE_REQUIRED_PATHS,
} from "../app/lib/nhl-player-feed";

// Fixtures mirror real captures from api-web.nhle.com (McDavid, 2025-26).
const landingFixture = {
  playerId: 8478402,
  firstName: { default: "Connor" },
  lastName: { default: "McDavid" },
  position: "C",
  currentTeamAbbrev: "EDM",
  sweaterNumber: 97,
  birthDate: "1997-01-13",
  birthCountry: "CAN",
  draftDetails: { year: 2015, overallPick: 1 },
  featuredStats: {
    season: 20252026,
    regularSeason: {
      subSeason: { gamesPlayed: 82, goals: 48, assists: 90, points: 138, plusMinus: 17, shootingPctg: 0.156863 },
    },
  },
  careerTotals: { regularSeason: { gamesPlayed: 794, points: 1220, avgToi: "21:52" } },
  seasonTotals: [
    { season: 20152016, leagueAbbrev: "NHL", gameTypeId: 2 },
    { season: 20152016, leagueAbbrev: "NHL", gameTypeId: 3 },
    { season: 20162017, leagueAbbrev: "NHL", gameTypeId: 2 },
    { season: 20142015, leagueAbbrev: "OHL", gameTypeId: 2 },
  ],
};

const edgeFixture = {
  player: { id: 8478402, gamesPlayed: 82 },
  skatingSpeed: { speedMax: { imperial: 24.6119 }, burstsOver20: { value: 681 } },
  sogSummary: [
    { locationCode: "all", shots: 306, shootingPctg: 0.1569, shootingPctgLeagueAvg: 0.1298 },
    { locationCode: "high", shots: 120, shootingPctg: 0.2167, shootingPctgLeagueAvg: 0.1958 },
  ],
  zoneTimeDetails: {
    offensiveZonePctg: 0.47688, offensiveZonePercentile: 0.9788, defensiveZonePctg: 0.35393,
  },
};

describe("nhl player feed parsers", () => {
  it("parses the landing shape into contract-relevant facts", () => {
    const f = parseLanding(landingFixture)!;
    expect(f.playerId).toBe(8478402);
    expect(f.name).toBe("Connor McDavid");
    expect(f.points).toBe(138);
    expect(f.draftOverall).toBe(1);
    expect(f.avgToiMinutes).toBeCloseTo(21.9, 1);
    expect(f.nhlSeasonCount).toBe(2); // distinct NHL regular seasons only
  });

  it("parses the edge shape including the high-danger luck signal", () => {
    const f = parseEdge(edgeFixture, 20252026)!;
    expect(f.hdShots).toBe(120);
    expect(f.hdShotShare).toBeCloseTo(0.392, 3);
    // 21.7% on high-danger vs 19.6% league — running hot, positive delta
    expect(f.hdFinishingDelta).toBeCloseTo(0.021, 3);
    expect(f.ozPct).toBeCloseTo(0.477, 3);
    expect(f.speedMaxMph).toBeCloseTo(24.6, 1);
  });

  it("flags upstream drift instead of parsing a changed shape", () => {
    const mutated = { ...landingFixture, featuredStats: { season: 20252026 } };
    expect(parseLanding(mutated)).toBeNull();
    const missing = missingPaths(mutated, LANDING_REQUIRED_PATHS);
    expect(missing).toContain("featuredStats.regularSeason.subSeason.points");

    const edgeMutated = { ...edgeFixture, zoneTimeDetails: undefined };
    expect(parseEdge(edgeMutated, 20252026)).toBeNull();
    expect(missingPaths(edgeMutated, EDGE_REQUIRED_PATHS)).toContain("zoneTimeDetails.offensiveZonePctg");
  });
});
