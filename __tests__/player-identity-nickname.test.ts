// ── Same-team nickname dedup (Matt / Matthew Savoie) ─────────────
import { describe, it, expect } from "vitest";
import { nicknameMergeKey, dedupeSameTeamNicknames } from "@/app/lib/player-identity";

describe("nicknameMergeKey", () => {
  it("collapses common short forms to a formal root, last name intact", () => {
    expect(nicknameMergeKey("Matt Savoie")).toBe(nicknameMergeKey("Matthew Savoie"));
    expect(nicknameMergeKey("Mike Matheson")).toBe(nicknameMergeKey("Michael Matheson"));
    expect(nicknameMergeKey("Alex Ovechkin")).toBe(nicknameMergeKey("Alexander Ovechkin"));
  });

  it("does not collapse different people who merely share a first name", () => {
    expect(nicknameMergeKey("Matthew Savoie")).not.toBe(nicknameMergeKey("Matthew Tkachuk"));
  });

  it("is diacritic-safe and leaves single-token names alone", () => {
    expect(nicknameMergeKey("Tim Stützle")).toBe(nicknameMergeKey("Timothy Stutzle"));
    expect(nicknameMergeKey("Ovechkin")).toBe("ovechkin");
  });
});

describe("dedupeSameTeamNicknames", () => {
  const rec = (name: string, teamId: string, over: Record<string, any> = {}): any => ({
    id: name.toLowerCase().replace(/\s+/g, ""), name, teamId, position: "C", ...over,
  });

  it("merges Matt + Matthew Savoie on the same team, keeping the record with real games", () => {
    const out = dedupeSameTeamNicknames([
      rec("Matthew Savoie", "EDM", { position: "W", games: 0, capHit: 0.89 }),
      rec("Matt Savoie", "EDM", { position: "C", games: 37, capHit: 1.1 }),
      rec("Connor McDavid", "EDM", { games: 80 }),
    ]);
    const savoies = out.filter(p => p.name.includes("Savoie"));
    expect(savoies).toHaveLength(1);
    expect(savoies[0].name).toBe("Matt Savoie"); // 37 GP beats 0 GP
    expect(out).toHaveLength(2); // Savoie collapsed, McDavid kept
  });

  it("NEVER merges across teams — a real trade/two different clubs stay separate", () => {
    const out = dedupeSameTeamNicknames([
      rec("Matthew Savoie", "EDM", { games: 10 }),
      rec("Matt Savoie", "BUF", { games: 20 }), // hypothetical other team
    ]);
    expect(out).toHaveLength(2);
  });

  it("prefers live stats, then a real cap hit, on a games tie", () => {
    const out = dedupeSameTeamNicknames([
      rec("Zach Benson", "BUF", { games: 60, hasLiveStats: false, capHit: 0.95 }),
      rec("Zachary Benson", "BUF", { games: 60, hasLiveStats: true, capHit: 0.95 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].hasLiveStats).toBe(true);
  });

  it("leaves picks and teamless rows untouched", () => {
    const out = dedupeSameTeamNicknames([
      rec("2027 1st Round Pick", "EDM", { position: "Pick" }),
      rec("Matt Savoie", "", { games: 37 }), // no team
      rec("Matthew Savoie", "", { games: 0 }),
    ]);
    expect(out).toHaveLength(3); // nothing collapses without a team
  });
});
