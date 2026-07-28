import { describe, expect, it } from "vitest";
import { regulationWinsFrom } from "../app/lib/nhl-standings-fields";

describe("regulationWinsFrom", () => {
  // The stats REST endpoint spells it `winsInRegulation`. Reading only
  // `regulationWins` meant every club sourced from it reported 0 RW.
  it("reads winsInRegulation from the stats endpoint", () => {
    expect(regulationWinsFrom({ winsInRegulation: 42 })).toBe(42);
  });

  it("reads regulationWins from the web standings endpoint", () => {
    expect(regulationWinsFrom({ regulationWins: 42 })).toBe(42);
  });

  it("prefers the stats spelling when a row somehow carries both", () => {
    expect(regulationWinsFrom({ winsInRegulation: 42, regulationWins: 0 })).toBe(42);
  });

  it("treats a genuine zero as a value, not a missing field", () => {
    expect(regulationWinsFrom({ winsInRegulation: 0, regulationWins: 9 })).toBe(0);
  });

  it("falls back to 0 rather than NaN so sorts and renders stay sane", () => {
    expect(regulationWinsFrom({})).toBe(0);
    expect(regulationWinsFrom(null)).toBe(0);
    expect(regulationWinsFrom({ winsInRegulation: null })).toBe(0);
    expect(regulationWinsFrom({ winsInRegulation: "42" })).toBe(0);
    expect(regulationWinsFrom({ winsInRegulation: Number.NaN })).toBe(0);
  });

  // The bug was not only cosmetic: RW is the NHL's first tiebreaker after
  // points, and a field that always read 0 silently disabled it.
  it("keeps regulation wins working as the points tiebreaker", () => {
    const rows = [
      { teamId: "A", points: 95, winsInRegulation: 30 },
      { teamId: "B", points: 95, winsInRegulation: 41 },
      { teamId: "C", points: 99, winsInRegulation: 20 },
    ];

    const sorted = [...rows].sort((a, b) =>
      b.points !== a.points
        ? b.points - a.points
        : regulationWinsFrom(b) - regulationWinsFrom(a));

    expect(sorted.map(r => r.teamId)).toEqual(["C", "B", "A"]);
  });
});
