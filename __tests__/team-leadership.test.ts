import { describe, expect, it } from "vitest";
import { teamLeadership, letterFor, MAX_ALTERNATES } from "../app/lib/team-leadership";
import { leadershipFor, LEADERSHIP } from "../app/data/leadership";

const p = (name: string, position = "C", id = name) => ({ id, name, position });

describe("leadershipFor", () => {
  it("resolves a curated captain", () => {
    expect(leadershipFor("Connor McDavid")).toBe("C");
    expect(leadershipFor("Cale Makar")).toBe("A");
  });

  // ST3 found this exact failure in SECONDARY_POSITIONS: a raw exact-string
  // lookup silently dropped every accented feed name.
  it("is accent-, case- and punctuation-insensitive", () => {
    expect(leadershipFor("connor mcdavid")).toBe("C");
    expect(leadershipFor("Sidney  Crosby")).toBe("C");
  });

  it("returns null for an unlettered player", () => {
    expect(leadershipFor("Some Fourth Liner")).toBeNull();
    expect(leadershipFor(null)).toBeNull();
    expect(leadershipFor("")).toBeNull();
  });

  it("resolves every curated row, so the table cannot silently rot", () => {
    for (const name of Object.keys(LEADERSHIP)) {
      expect(leadershipFor(name), name).not.toBeNull();
    }
  });
});

describe("teamLeadership", () => {
  it("returns the captain and up to two alternates", () => {
    const result = teamLeadership([
      p("Connor McDavid"),
      p("Leon Draisaitl"),
      p("Ryan Nugent-Hopkins"),
      p("Some Fourth Liner"),
    ]);

    expect(result.captain).toBe("Connor McDavid");
    expect(result.alternates).toHaveLength(MAX_ALTERNATES);
    expect(result.alternates).toContain("Leon Draisaitl");
  });

  // Reading the curated table directly would dress three alternates.
  it("never dresses more than two alternates", () => {
    const result = teamLeadership([
      p("Cale Makar"), p("Mikko Rantanen"), p("Sebastian Aho"), p("Kyle Connor"),
    ]);
    expect(result.alternates).toHaveLength(2);
  });

  it("ranks alternates by the supplied order, not roster order", () => {
    const roster = [p("Leon Draisaitl"), p("Ryan Nugent-Hopkins")];
    const rank = (x: { name: string }) => (x.name === "Ryan Nugent-Hopkins" ? 100 : 1);
    expect(teamLeadership(roster, rank).alternates[0]).toBe("Ryan Nugent-Hopkins");
  });

  it("breaks ties on name so the letters cannot jitter between renders", () => {
    const roster = [p("Leon Draisaitl"), p("Cale Makar")];
    expect(teamLeadership(roster).alternates)
      .toEqual(teamLeadership([...roster].reverse()).alternates);
  });

  // Promoting an alternate would put a C on a player who does not wear one.
  it("reports no captain rather than promoting an alternate", () => {
    const result = teamLeadership([p("Cale Makar", "D"), p("Kyle Connor", "W")]);
    expect(result.captain).toBeNull();
    expect(result.alternates.length).toBeGreaterThan(0);
  });

  it("never letters a goaltender or a draft pick", () => {
    const result = teamLeadership([
      { id: "g", name: "Connor McDavid", position: "G" },
      { id: "pick", name: "Cale Makar", position: "Pick" },
    ]);
    expect(result.captain).toBeNull();
    expect(result.alternates).toEqual([]);
  });

  it("handles an empty roster", () => {
    expect(teamLeadership([])).toEqual({ captain: null, alternates: [] });
  });
});

describe("letterFor", () => {
  it("letters only the players who actually dress one", () => {
    const leadership = { captain: "Connor McDavid", alternates: ["Leon Draisaitl"] };
    expect(letterFor("Connor McDavid", leadership)).toBe("C");
    expect(letterFor("Leon Draisaitl", leadership)).toBe("A");
    expect(letterFor("Ryan Nugent-Hopkins", leadership)).toBeNull();
  });

  // The distinction that matters: a curated "A" who is third in line wears
  // nothing, because only two are dressed.
  it("does not letter a curated alternate who missed the cut", () => {
    const roster = [p("Cale Makar"), p("Mikko Rantanen"), p("Sebastian Aho")];
    const leadership = teamLeadership(roster);
    const lettered = roster.filter(x => letterFor(x.name, leadership) != null);
    expect(lettered).toHaveLength(2);
  });

  it("returns null for a missing name", () => {
    expect(letterFor(null, { captain: null, alternates: [] })).toBeNull();
  });
});
