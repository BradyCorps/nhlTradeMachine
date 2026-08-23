import { describe, it, expect } from "vitest";
import { rosterLegality, rosterLegalityMessage, NHL_ROSTER_MINIMUMS } from "../app/lib/roster-legality";

const make = (teamId: string, position: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${teamId}-${position}-${i}`, position, teamId }));

const legalRoster = (teamId = "WPG") => [
  ...make(teamId, "C", 4),
  ...make(teamId, "L", 4),
  ...make(teamId, "R", 4), // 12 forwards
  ...make(teamId, "D", 6), // 6 defense
  ...make(teamId, "G", 2), // 2 goalies
];

describe("rosterLegality", () => {
  it("passes a legal 12F/6D/2G roster", () => {
    const out = rosterLegality(legalRoster(), "WPG");
    expect(out).toMatchObject({ forwards: 12, defense: 6, goalies: 2, legal: true, shortfall: null });
  });

  it("flags the audit's 10F/3D/1G collapse with the exact shortfall", () => {
    const roster = [...make("WPG", "C", 10), ...make("WPG", "D", 3), ...make("WPG", "G", 1)];
    const out = rosterLegality(roster, "WPG");
    expect(out.legal).toBe(false);
    expect(out.deficits).toEqual({ forwards: 2, defense: 3, goalies: 1 });
    expect(out.shortfall).toBe("2 forwards, 3 defensemen, and 1 goaltender");
  });

  it("uses singular nouns for a one-player shortfall", () => {
    const roster = [...make("WPG", "C", 12), ...make("WPG", "D", 6), ...make("WPG", "G", 1)];
    expect(rosterLegality(roster, "WPG").shortfall).toBe("1 goaltender");
  });

  it("ignores picks and other teams' players", () => {
    const roster = [
      ...legalRoster("WPG"),
      ...make("WPG", "Pick", 5),   // picks never count toward the lineup
      ...make("CGY", "D", 9),      // another team's players are irrelevant
    ];
    const out = rosterLegality(roster, "WPG");
    expect(out).toMatchObject({ forwards: 12, defense: 6, goalies: 2, legal: true });
  });

  it("scores the whole array when no teamId is given", () => {
    expect(rosterLegality(legalRoster("WPG")).legal).toBe(true);
  });

  it("treats every non-D/G/Pick position as a forward (C/L/R/W/F)", () => {
    const roster = [
      ...make("WPG", "C", 3), ...make("WPG", "L", 3), ...make("WPG", "R", 3),
      ...make("WPG", "W", 2), ...make("WPG", "F", 1), // 12 forwards across position spellings
      ...make("WPG", "D", 6), ...make("WPG", "G", 2),
    ];
    expect(rosterLegality(roster, "WPG").legal).toBe(true);
  });

  it("honours a custom minimum set", () => {
    const roster = [...make("WPG", "C", 12), ...make("WPG", "D", 6), ...make("WPG", "G", 1)];
    expect(rosterLegality(roster, "WPG", { ...NHL_ROSTER_MINIMUMS, goalies: 1 }).legal).toBe(true);
  });

  it("builds an actionable message", () => {
    const roster = [...make("WPG", "C", 10), ...make("WPG", "D", 3), ...make("WPG", "G", 1)];
    const msg = rosterLegalityMessage("Winnipeg", rosterLegality(roster, "WPG"));
    expect(msg).toContain("Winnipeg can't ice a legal lineup");
    expect(msg).toContain("10F / 3D / 1G");
    expect(msg).toContain("Sign or acquire players");
  });
});
