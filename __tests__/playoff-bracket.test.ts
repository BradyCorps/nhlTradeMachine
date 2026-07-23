// ── Playoff bracket advancement (SIM1) ───────────────────────────
import { describe, it, expect } from "vitest";
import {
  simulateConference,
  simulatePlayoffs,
  type BracketTeam,
} from "@/app/lib/playoff-bracket";

// A deterministic series always sends the higher-seeded team through
// (winProb ≥ 0.35 > 0, so a stream of 0s wins 4-0 for the favorite).
const favoriteAlwaysWins = () => 0;

const team = (
  teamId: string, division: string, divisionRank: number, projectedPoints: number,
): BracketTeam => ({
  teamId, teamName: teamId, division, divisionRank, projectedPoints, madePlayoffs: true,
});

describe("simulateConference — winners advance by bracket adjacency (SIM1)", () => {
  // West seeds engineered to reproduce the reported bug: the top two R1
  // series are won by Blackhawks (CHI, top seed) and Mammoth (UTA, WC1 that
  // upsets the Pacific winner on points). They sit adjacent, so they must
  // meet in R2 — not have the third series' winner jump into that slot.
  const westSeeds = [
    team("CHI", "Central", 1, 115), // top div winner → r1[0]
    team("DAL", "Central", 2, 108), // top div 2/3    → r1[1]
    team("MIN", "Central", 3, 104),
    team("UTA", "Central", 4, 112), // WC1 (strong), meets Pacific winner
    team("EDM", "Pacific", 1, 100), // other div winner → r1[2]
    team("SJS", "Pacific", 2,  92), // other div 2/3     → r1[3]
    team("LAK", "Pacific", 3,  88),
    team("ANA", "Pacific", 4,  85), // WC2
  ];

  const idsOf = (s: { home: { teamId: string }; away: { teamId: string } }) =>
    [s.home.teamId, s.away.teamId].sort();

  it("pairs the winners of the two adjacent R1 series into each R2 slot", () => {
    const b = simulateConference(westSeeds, "W", favoriteAlwaysWins);
    // General property: top R2 slot holds the winners of R1 series 0 and 1;
    // bottom R2 slot holds winners of series 2 and 3.
    expect(idsOf(b.r2[0])).toEqual([b.r1[0].winner.teamId, b.r1[1].winner.teamId].sort());
    expect(idsOf(b.r2[1])).toEqual([b.r1[2].winner.teamId, b.r1[3].winner.teamId].sort());
  });

  it("yields Mammoth–Blackhawks in R2, not the third series' winner", () => {
    const b = simulateConference(westSeeds, "W", favoriteAlwaysWins);
    expect(b.r1[0].winner.teamId).toBe("CHI"); // Blackhawks win their series
    expect(b.r1[1].winner.teamId).toBe("UTA"); // Mammoth upset the Pacific winner
    // They meet in the top R2 slot …
    expect(idsOf(b.r2[0])).toEqual(["CHI", "UTA"]);
    // … and the row-2 winner never jumps into that slot.
    expect(idsOf(b.r2[0])).not.toContain(b.r1[2].winner.teamId);
  });

  it("every advancing team actually won its prior-round series", () => {
    const b = simulateConference(westSeeds, "W", favoriteAlwaysWins);
    const r1Winners = new Set(b.r1.map(s => s.winner.teamId));
    for (const s of b.r2) {
      expect(r1Winners.has(s.home.teamId)).toBe(true);
      expect(r1Winners.has(s.away.teamId)).toBe(true);
    }
    const r2Winners = new Set(b.r2.map(s => s.winner.teamId));
    expect(r2Winners.has(b.cf.home.teamId)).toBe(true);
    expect(r2Winners.has(b.cf.away.teamId)).toBe(true);
    expect(b.champion.teamId).toBe(b.cf.winner.teamId);
  });
});

describe("simulatePlayoffs — full bracket integrity", () => {
  it("crowns a champion who won the Cup Final, from two conference champions", () => {
    // 16 playoff teams, 8 per conference (3 per division + 2 wildcards).
    const east = [
      team("BOS", "Atlantic", 1, 116), team("TOR", "Atlantic", 2, 104), team("FLA", "Atlantic", 3, 98),
      team("TBL", "Atlantic", 4, 96),
      team("CAR", "Metropolitan", 1, 110), team("NJD", "Metropolitan", 2, 100), team("NYR", "Metropolitan", 3, 95),
      team("WSH", "Metropolitan", 4, 90),
    ];
    const west = [
      team("DAL", "Central", 1, 114), team("COL", "Central", 2, 106), team("WPG", "Central", 3, 99),
      team("MIN", "Central", 4, 94),
      team("VGK", "Pacific", 1, 108), team("EDM", "Pacific", 2, 102), team("LAK", "Pacific", 3, 96),
      team("SEA", "Pacific", 4, 88),
    ];
    const bracket = simulatePlayoffs([...east, ...west], favoriteAlwaysWins);
    expect(bracket.champion.teamId).toBe(bracket.final.winner.teamId);
    const finalists = [bracket.final.home.teamId, bracket.final.away.teamId].sort();
    expect(finalists).toEqual([bracket.eastern.champion.teamId, bracket.western.champion.teamId].sort());
  });
});
