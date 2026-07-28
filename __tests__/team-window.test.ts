import { describe, expect, it } from "vitest";
import { teamWindow } from "../app/lib/team-window";
import { difficultyForTeam } from "../app/lib/cup-run";

describe("teamWindow", () => {
  it("prefers the live roster window over the standings tier", () => {
    expect(teamWindow({ phase: "Contender", rosterWindow: "Rebuilding" })).toBe("Rebuilding");
  });

  it("falls back to the standings tier before Armchair GM has derived one", () => {
    expect(teamWindow({ phase: "Contender" })).toBe("Contender");
  });

  it("ignores an empty window rather than reporting a blank tier", () => {
    expect(teamWindow({ phase: "Bubble", rosterWindow: "" })).toBe("Bubble");
    expect(teamWindow({ phase: "Bubble", rosterWindow: "   " })).toBe("Bubble");
  });

  it("returns an empty string when neither is known", () => {
    expect(teamWindow({})).toBe("");
    expect(teamWindow(null)).toBe("");
    expect(teamWindow(undefined)).toBe("");
  });

  // The whole point of splitting the field: a club can be top of the table and
  // a gutted roster at the same time, and each reader gets the one it means.
  it("keeps the standings tier readable after a roster window is set", () => {
    const team = { id: "COL", phase: "Contender", rosterWindow: "Tanking" };
    expect(team.phase).toBe("Contender");
    expect(teamWindow(team)).toBe("Tanking");
  });
});

describe("competitive-window consumers", () => {
  // Cup Run difficulty is about the roster you are handed, not last season's
  // table. Before the split, Armchair GM's overwrite made this accidentally
  // correct; now it is deliberate.
  it("rates Cup Run difficulty off the roster window", () => {
    const stripped = { id: "COL", phase: "Contender", rosterWindow: "Rebuilding", standing: 1 };
    const intact = { id: "COL", phase: "Contender", standing: 1 };

    expect(difficultyForTeam(stripped).label).toBe("LONG SHOT");
    expect(difficultyForTeam(intact).label).toBe("FRONT RUNNER");
  });
});
