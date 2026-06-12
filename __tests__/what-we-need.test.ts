import { describe, expect, it } from "vitest";
import { rankNeedTargets } from "../app/lib/need-targets";

describe("WhatWeNeed target ranking", () => {
  it("prioritizes high-impact available OPS help over older low-impact targets", () => {
    const teams = [
      { id: "WPG", name: "Winnipeg Jets", phase: "Contender", capSpace: 4, standing: 4 },
      { id: "STL", name: "St. Louis Blues", phase: "Retooling", capSpace: 1, standing: 18 },
      { id: "CBJ", name: "Columbus Blue Jackets", phase: "Rebuilding", capSpace: 7, standing: 27 },
    ];

    const players = [
      {
        id: "kyrou",
        name: "Jordan Kyrou",
        position: "RW",
        teamId: "STL",
        age: 28,
        capHit: 8.1,
        ptsPace: 74,
        ops: 7.2,
        tradeBlockStatus: "available" as const,
      },
      {
        id: "jvr",
        name: "James van Riemsdyk",
        position: "LW",
        teamId: "CBJ",
        age: 37,
        capHit: 1.0,
        ptsPace: 34,
        ops: 2.1,
        tradeBlockStatus: "available" as const,
      },
      {
        id: "perron",
        name: "David Perron",
        position: "RW",
        teamId: "CBJ",
        age: 38,
        capHit: 1.5,
        ptsPace: 31,
        ops: 1.9,
        tradeBlockStatus: "available" as const,
      },
      {
        id: "coleman",
        name: "Blake Coleman",
        position: "LW",
        teamId: "STL",
        age: 34,
        capHit: 4.9,
        ptsPace: 45,
        ops: 3.4,
      },
    ];

    const targets = rankNeedTargets({
      players,
      teams,
      excludeIds: new Set(["wpg-roster-player"]),
      gapLabel: "OPS",
      homeCapSpace: 4,
    });

    const names = targets.map(t => t.p.name);
    expect(names[0]).toBe("Jordan Kyrou");
    expect(names).toContain("James van Riemsdyk");
    expect(names).toContain("David Perron");
  });

  it("does not suggest no-stats prospects for an OPS gap", () => {
    const teams = [
      { id: "WPG", name: "Winnipeg Jets", phase: "Contender", capSpace: 4, standing: 4 },
      { id: "SEA", name: "Seattle Kraken", phase: "Rebuilding", capSpace: 8, standing: 25 },
    ];

    const players = [
      {
        id: "preston",
        name: "Mathis Preston",
        position: "C",
        teamId: "SEA",
        age: 18,
        capHit: 0.95,
        ptsPace: 55,
        ops: null,
        games: 0,
        hasLiveStats: false,
        draftOverall: 10,
        prospectPtsPace: 55,
        tradeBlockStatus: "available" as const,
      },
      {
        id: "middle-six",
        name: "Proven Middle Six",
        position: "LW",
        teamId: "SEA",
        age: 29,
        capHit: 3.5,
        ptsPace: 42,
        ops: 3.0,
        games: 62,
        hasLiveStats: true,
      },
    ];

    const targets = rankNeedTargets({
      players,
      teams,
      excludeIds: new Set(),
      gapLabel: "OPS",
      homeCapSpace: 4,
    });

    expect(targets.map(t => t.p.name)).toEqual(["Proven Middle Six"]);
  });
});
