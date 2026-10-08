import { describe, expect, it } from "vitest";
import { groupModelForwards, lineupContributionScore, type LineupRankingPlayer } from "../app/lib/lineup-ranking";

const player = (overrides: Partial<LineupRankingPlayer>): LineupRankingPlayer => ({
  position: "W",
  ptsPace: 0,
  avgTOI: 0,
  games: 0,
  ...overrides,
});

describe("lineupContributionScore", () => {
  it("keeps a Lowry-shaped defensive leader above a higher-XNAV depth scorer", () => {
    const lowryType = player({
      position: "C",
      ptsPace: 34,
      avgTOI: 15.8,
      games: 760,
    });
    const depthScorer = player({
      position: "W",
      ptsPace: 42,
      avgTOI: 10.5,
      games: 110,
    });

    expect(lineupContributionScore(lowryType, -38)).toBeGreaterThan(
      lineupContributionScore(depthScorer, 32),
    );
  });

  it("still ranks elite offensive players ahead of defensive leaders", () => {
    const defensiveLeader = player({
      position: "C",
      ptsPace: 34,
      avgTOI: 15.8,
      games: 760,
    });
    const topLineStar = player({
      position: "W",
      ptsPace: 88,
      avgTOI: 20.2,
      games: 520,
    });

    expect(lineupContributionScore(topLineStar, 65)).toBeGreaterThan(
      lineupContributionScore(defensiveLeader, -38),
    );
  });
});

describe("leadership intangibles", () => {
  it("lifts a captain above a statistically identical teammate", async () => {
    const { lineupContributionScore } = await import("../app/lib/lineup-ranking");
    const base = { position: "C", avgTOI: 17.5, ptsPace: 34, games: 620 };
    const lowry = lineupContributionScore({ ...base, name: "Adam Lowry" }, -38);
    const nobody = lineupContributionScore({ ...base, name: "Depth Center" }, -38);
    expect(lowry - nobody).toBeCloseTo(28, 5);
    const alternate = lineupContributionScore({ ...base, name: "Mark Scheifele" }, 100);
    expect(alternate).toBeGreaterThan(lineupContributionScore({ ...base, name: "Depth Center" }, 100));
  });
});

describe("model forward groups", () => {
  it("keeps all twelve Winnipeg-shaped selections, including surplus pure centers", () => {
    const positions = ["C", "W", "C", "C", "C", "W", "C", "C", "W", "C", "W", "W"];
    const names = ["Scheifele", "Connor", "Vilardi", "Perfetti", "Lowry", "Iafallo", "Yager", "Barron", "Niederreiter", "Namestnikov", "Rosen", "Duehr"];
    const forwards = positions.map((position, i) => ({ id: String(i), name: names[i], position,
      secondaryPosition: names[i] === "Vilardi" ? "W" : null }));
    const original = structuredClone(forwards);
    const groups = groupModelForwards(forwards);

    expect(groups.map(group => group.length)).toEqual([3, 3, 3, 3]);
    expect(groups.flat().map(p => p.id).sort()).toEqual(forwards.map(p => p.id).sort());
    expect(new Set(groups.flat().map(p => p.id)).size).toBe(12);
    expect(groups.flat().find(p => p.name === "Barron")?.position).toBe("C");
    expect(groups.flat().find(p => p.name === "Namestnikov")?.position).toBe("C");
    expect(forwards).toEqual(original);
  });

  it("retains the existing balanced center and wing grouping", () => {
    const forwards = Array.from({ length: 12 }, (_, i) => ({ id: String(i), position: i % 3 === 0 ? "C" : "W" }));
    expect(groupModelForwards(forwards).map(group => group.map(p => p.id)))
      .toEqual([["0", "1", "2"], ["3", "4", "5"], ["6", "7", "8"], ["9", "10", "11"]]);
  });

  it("preserves pure-center priority before filling center places with flex players", () => {
    const forwards = [
      { id: "flex", position: "C", secondaryPosition: "W" },
      { id: "wing", position: "W" },
      { id: "pure", position: "C" },
    ];
    const groups = groupModelForwards(forwards);
    expect(groups[0].map(p => p.id)).toEqual(["pure", "wing"]);
    expect(groups[1].map(p => p.id)).toEqual(["flex"]);
  });

  it("keeps every selected player across center-heavy and short rosters without inventing depth", () => {
    for (const position of ["C", "W"]) for (let size = 0; size <= 12; size++) {
      const forwards = Array.from({ length: size }, (_, i) => ({ id: String(i), position }));
      const groups = groupModelForwards(forwards);
      expect(groups).toHaveLength(4);
      expect(groups.every(group => group.length <= 3)).toBe(true);
      expect(groups.flat().map(p => p.id).sort()).toEqual(forwards.map(p => p.id).sort());
    }
  });
});
