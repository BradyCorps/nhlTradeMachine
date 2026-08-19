// ── nhl-active-players.test.ts ───────────────────────────────────
// The bundled id snapshot is a capture seed, so what matters is that it
// parses cleanly, covers the league, and survives a bad row without
// taking the rest of the file with it.

import { describe, it, expect } from "vitest";
import {
  activePlayers, activeGoalies, activeGoalieIds,
  activeGoalieIdsForTeams, activePlayerById,
} from "@/app/lib/nhl-active-players";

describe("nhl-active-players", () => {
  it("parses the bundled snapshot", () => {
    const rows = activePlayers();
    expect(rows.length).toBeGreaterThan(1000);
  });

  it("covers all 32 clubs", () => {
    const teams = new Set(activePlayers().map(r => r.team));
    expect(teams.size).toBe(32);
  });

  it("every id is a seven- or eight-digit NHL id", () => {
    for (const r of activePlayers()) expect(r.id).toMatch(/^\d{7,8}$/);
  });

  it("ids are unique", () => {
    const rows = activePlayers();
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length);
  });

  it("carries a goalie for every club", () => {
    const byTeam = new Set(activeGoalies().map(r => r.team));
    expect(byTeam.size).toBe(32);
    expect(activeGoalieIds().length).toBeGreaterThan(60);
  });

  it("preserves non-ASCII names rather than mangling them", () => {
    // The first CSV supplied for this arrived mis-decoded — "Välimäki" had
    // become "VÃ¤limÃ¤ki". This pins that the bundled file is real UTF-8.
    const rows = activePlayers();
    const text = rows.map(r => r.name).join(" ");
    expect(text).not.toContain("Ã");
    expect(text).not.toContain("Â");
    expect(rows.some(r => r.lastName === "Välimäki")).toBe(true);
  });

  it("filters goalies by club for a rotating capture", () => {
    const ids = activeGoalieIdsForTeams(["NYI"]);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain("8478009");                    // Ilya Sorokin
    for (const id of ids) {
      expect(activePlayerById(id)!.team).toBe("NYI");
      expect(activePlayerById(id)!.position).toBe("G");
    }
    expect(activeGoalieIdsForTeams(["nyi"])).toEqual(ids); // case-insensitive
    expect(activeGoalieIdsForTeams([])).toEqual([]);
  });

  it("looks a player up by id, and misses cleanly", () => {
    expect(activePlayerById("8478009")?.name).toBe("Ilya Sorokin");
    expect(activePlayerById(8478009)?.position).toBe("G");
    // A rookie absent from the snapshot must read as "ask the API", not as
    // a crash and not as a fabricated row.
    expect(activePlayerById("9999999")).toBeNull();
  });
});
