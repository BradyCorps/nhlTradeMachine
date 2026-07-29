import { describe, expect, it } from "vitest";
import {
  buildRosterRows,
  projectedSeasonIndex,
  rosterTotals,
  simTeamFor,
  type ProjectedSeason,
} from "../app/lib/roster-view";
import type { Asset } from "../app/lib/trade-types";

const player = (over: Partial<Asset> & { id: string; name: string }): Asset => ({
  teamId: "WPG", position: "C", age: 26, games: 82,
  ptsPace: 0, xGPace: 0, defRate: 0, avgTOI: 18, capHit: 5, yearsRemaining: 2,
  capCeiling: 95.5, hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0,
  multiplier: 1, goalsPace: 0, assistsPace: 0, round: 0, year: 0, teamStanding: 16,
  gsax: 0, savePct: 0, gamesStarted: 0, baselinePtsPace: 0, pkTimeShare: 0,
  ...over,
} as Asset);

const sim = (over: Partial<ProjectedSeason> & { playerId: string }): ProjectedSeason => ({
  name: "x", projectedPts: 0, projectedGoals: 0, projectedAssists: 0, gamesPlayed: 82,
  ...over,
});

describe("buildRosterRows", () => {
  it("orders by points, highest first", () => {
    const rows = buildRosterRows([
      player({ id: "a", name: "Low", goalsPace: 10, assistsPace: 10 }),
      player({ id: "b", name: "High", goalsPace: 40, assistsPace: 50 }),
    ], {});
    expect(rows.map(r => r.asset.name)).toEqual(["High", "Low"]);
  });

  it("excludes draft picks", () => {
    const rows = buildRosterRows([
      player({ id: "p", name: "2027 1st", position: "Pick" }),
      player({ id: "a", name: "Skater", goalsPace: 20, assistsPace: 20 }),
    ], {});
    expect(rows.map(r => r.asset.name)).toEqual(["Skater"]);
  });

  // An 82-game pace beside a simulated 61-game total would put two different
  // units in the same column.
  it("scales baseline pace to games actually played", () => {
    const [row] = buildRosterRows(
      [player({ id: "a", name: "Half", games: 41, goalsPace: 40, assistsPace: 40 })], {});
    expect(row.goals).toBe(20);
    expect(row.assists).toBe(20);
    expect(row.points).toBe(40);
    expect(row.simulated).toBe(false);
  });

  it("keeps goals plus assists equal to the points column", () => {
    const rows = buildRosterRows([
      player({ id: "a", name: "A", games: 63, goalsPace: 33, assistsPace: 41 }),
      player({ id: "b", name: "B", games: 77, goalsPace: 19, assistsPace: 28 }),
    ], {});
    for (const r of rows) expect(r.goals + r.assists).toBe(r.points);
  });

  // The point of "refresh from the prior sim season".
  it("prefers the simulated season over the baseline", () => {
    const projected = new Map([["a", sim({ playerId: "a", projectedGoals: 30, projectedAssists: 45, projectedPts: 75, gamesPlayed: 79 })]]);
    const [row] = buildRosterRows(
      [player({ id: "a", name: "Star", goalsPace: 5, assistsPace: 5 })], {}, projected);

    expect(row.simulated).toBe(true);
    expect(row.points).toBe(75);
    expect(row.games).toBe(79);
  });

  it("falls back per player, not all-or-nothing", () => {
    const projected = new Map([["a", sim({ playerId: "a", projectedPts: 60 })]]);
    const rows = buildRosterRows([
      player({ id: "a", name: "Simmed" }),
      player({ id: "b", name: "Callup", games: 12, goalsPace: 20, assistsPace: 20 }),
    ], {}, projected);

    expect(rows.find(r => r.asset.name === "Simmed")?.simulated).toBe(true);
    expect(rows.find(r => r.asset.name === "Callup")?.simulated).toBe(false);
  });

  it("re-sorts on the simulated numbers, not the baseline", () => {
    const projected = new Map([
      ["a", sim({ playerId: "a", projectedPts: 20 })],
      ["b", sim({ playerId: "b", projectedPts: 90 })],
    ]);
    const rows = buildRosterRows([
      player({ id: "a", name: "Faded", goalsPace: 50, assistsPace: 50 }),
      player({ id: "b", name: "Broke Out", goalsPace: 1, assistsPace: 1 }),
    ], {}, projected);
    expect(rows.map(r => r.asset.name)).toEqual(["Broke Out", "Faded"]);
  });

  it("breaks ties deterministically so rows cannot jitter", () => {
    const roster = [
      player({ id: "a", name: "Zeb", goalsPace: 10, assistsPace: 10 }),
      player({ id: "b", name: "Abe", goalsPace: 10, assistsPace: 10 }),
    ];
    expect(buildRosterRows(roster, {}).map(r => r.asset.name))
      .toEqual(buildRosterRows([...roster].reverse(), {}).map(r => r.asset.name));
  });

  it("carries NAV through when present and null when not", () => {
    const rows = buildRosterRows(
      [player({ id: "a", name: "A" }), player({ id: "b", name: "B" })],
      { a: { total: 120 } as any });
    expect(rows.find(r => r.asset.id === "a")?.nav).toBe(120);
    expect(rows.find(r => r.asset.id === "b")?.nav).toBeNull();
  });

  it("handles an empty roster", () => {
    expect(buildRosterRows([], {})).toEqual([]);
  });
});

describe("projectedSeasonIndex", () => {
  it("indexes skaters by id", () => {
    const idx = projectedSeasonIndex({ projectedSkaters: [sim({ playerId: "a" })] });
    expect(idx?.get("a")).toBeDefined();
  });

  // Null is the signal to fall back to the baseline rather than render empty.
  it("returns null when there is no simulated season", () => {
    expect(projectedSeasonIndex(null)).toBeNull();
    expect(projectedSeasonIndex({})).toBeNull();
    expect(projectedSeasonIndex({ projectedSkaters: [] })).toBeNull();
  });

  it("coerces numeric ids so the lookup cannot miss on type", () => {
    const idx = projectedSeasonIndex({ projectedSkaters: [sim({ playerId: 8484153 as any })] });
    expect(idx?.get("8484153")).toBeDefined();
  });
});

describe("simTeamFor", () => {
  it("finds the club in either response shape", () => {
    expect(simTeamFor({ homeTeam: { teamId: "WPG" } }, "WPG")).toEqual({ teamId: "WPG" });
    expect(simTeamFor({ partnerTeam: { teamId: "CGY" } }, "CGY")).toEqual({ teamId: "CGY" });
    expect(simTeamFor({ standings: [{ teamId: "BOS" }] }, "BOS")).toEqual({ teamId: "BOS" });
  });

  it("returns null rather than the wrong club", () => {
    expect(simTeamFor({ homeTeam: { teamId: "WPG" } }, "CGY")).toBeNull();
    expect(simTeamFor(null, "WPG")).toBeNull();
    expect(simTeamFor({ homeTeam: { teamId: "WPG" } }, null)).toBeNull();
  });
});

describe("rosterTotals", () => {
  it("sums the roster and nets out retention", () => {
    const rows = buildRosterRows([
      player({ id: "a", name: "A", goalsPace: 20, assistsPace: 30, capHit: 8, retainedPct: 0.5 }),
      player({ id: "b", name: "B", goalsPace: 10, assistsPace: 10, capHit: 4 }),
    ], {});
    const totals = rosterTotals(rows);

    expect(totals.players).toBe(2);
    expect(totals.goals).toBe(30);
    expect(totals.assists).toBe(40);
    expect(totals.points).toBe(70);
    expect(totals.capHit).toBeCloseTo(8, 5);
  });
});
