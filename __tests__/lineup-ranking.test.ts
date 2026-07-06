import { describe, expect, it } from "vitest";
import { lineupContributionScore, type LineupRankingPlayer } from "../app/lib/lineup-ranking";

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
