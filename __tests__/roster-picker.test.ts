// ── TM1 — visual roster grid grouping ────────────────────────────
import { describe, it, expect } from "vitest";
import { groupTeamRoster, rosterGroupCount } from "@/app/lib/roster-picker";
import type { Asset } from "@/app/lib/trade-types";

const p = (id: string, teamId: string, position: string, capHit = 5, name = id): Asset =>
  ({ id, name, teamId, position, age: 27, capHit, yearsRemaining: 2 } as any);

const roster: Asset[] = [
  p("c1", "WPG", "C", 8, "Center One"),
  p("w1", "WPG", "W", 6, "Wing One"),
  p("w2", "WPG", "L", 3, "Wing Two"),
  p("d1", "WPG", "D", 7, "Dman One"),
  p("d2", "WPG", "D", 4, "Dman Two"),
  p("g1", "WPG", "G", 5, "Goalie One"),
  p("pk1", "WPG", "Pick", 0, "2027 1st"),
  p("other", "CGY", "C", 9, "Other Team"),
];

describe("groupTeamRoster", () => {
  it("splits one team's roster into F/D/G/picks and excludes other teams", () => {
    const g = groupTeamRoster(roster, "WPG", new Set());
    expect(g.forwards.map(a => a.id)).toEqual(["c1", "w1", "w2"]); // by cap desc
    expect(g.defense.map(a => a.id)).toEqual(["d1", "d2"]);
    expect(g.goalies.map(a => a.id)).toEqual(["g1"]);
    expect(g.picks.map(a => a.id)).toEqual(["pk1"]);
    expect(g.forwards.some(a => a.teamId !== "WPG")).toBe(false);
    expect(rosterGroupCount(g)).toBe(7); // 3F + 2D + 1G + 1 pick
  });

  it("drops players already staged on the block", () => {
    const g = groupTeamRoster(roster, "WPG", new Set(["c1", "d1"]));
    expect(g.forwards.map(a => a.id)).toEqual(["w1", "w2"]);
    expect(g.defense.map(a => a.id)).toEqual(["d2"]);
  });

  it("ranks by the provided scorer (NAV) before cap", () => {
    const nav: Record<string, number> = { c1: 10, w1: 90, w2: 50 };
    const g = groupTeamRoster(roster, "WPG", new Set(), a => nav[a.id] ?? 0);
    expect(g.forwards.map(a => a.id)).toEqual(["w1", "w2", "c1"]); // NAV desc, not cap
  });

  it("returns empty groups when no team is selected", () => {
    const g = groupTeamRoster(roster, null, new Set());
    expect(rosterGroupCount(g)).toBe(0);
  });
});
