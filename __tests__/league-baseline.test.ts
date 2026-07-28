// ── ST1: the entry baseline must survive a Cup Run ────────────────
// A new run restarts at the 2026-27 offseason. That is only possible if some
// reference to the league as first loaded still exists — and `originalDb` is
// not it, because every season rollover overwrites it.
import { describe, expect, it } from "vitest";
import { cloneLeague } from "@/app/lib/league-baseline";
import type { Asset, Team } from "@/app/lib/trade-types";

const team = (id: string, capSpace: number): Team =>
  ({ id, name: id, capSpace } as Team);

const player = (id: string, teamId: string, age: number, capHit: number): Asset =>
  ({ id, name: id, teamId, age, capHit, position: "C" } as Asset);

const league = () => ({
  teams: [team("WPG", 5), team("SJS", 12)],
  players: [player("p1", "WPG", 24, 8), player("p2", "SJS", 31, 6)],
  capCeiling: 104,
});

describe("cloneLeague", () => {
  it("reproduces the league by value", () => {
    const db = league();
    expect(cloneLeague(db)).toEqual(db);
  });

  it("shares no team or player object with the source", () => {
    const db = league();
    const snap = cloneLeague(db);
    expect(snap.players[0]).not.toBe(db.players[0]);
    expect(snap.teams[0]).not.toBe(db.teams[0]);
    expect(snap.players).not.toBe(db.players);
  });

  it("survives the mutation a season rollover performs", () => {
    // The rollover ages players and rewrites cap space. If the baseline shared
    // those objects, restarting a run would restore an already-aged league.
    const db = league();
    const baseline = cloneLeague(db);

    for (const p of db.players) { p.age += 3; p.capHit = 1; }
    for (const t of db.teams) { t.capSpace = 0; }

    expect(baseline.players.map(p => p.age)).toEqual([24, 31]);
    expect(baseline.players.map(p => p.capHit)).toEqual([8, 6]);
    expect(baseline.teams.map(t => t.capSpace)).toEqual([5, 12]);
  });

  it("gives each restore its own copy, so two runs cannot interfere", () => {
    const baseline = cloneLeague(league());
    const first = cloneLeague(baseline);
    const second = cloneLeague(baseline);

    first.players[0].age = 99;

    expect(second.players[0].age).toBe(24);
    expect(baseline.players[0].age).toBe(24);
  });

  it("carries the cap ceiling, including a rolled-forward one", () => {
    // Year 3 raises the ceiling; the baseline must still hold the 2026-27 value.
    const baseline = cloneLeague(league());
    const rolled = { ...league(), capCeiling: 113 };
    expect(baseline.capCeiling).toBe(104);
    expect(cloneLeague(rolled).capCeiling).toBe(113);
  });
});
