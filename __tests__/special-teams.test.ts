import { describe, expect, it } from "vitest";
import {
  PK_SLOTS, PK_UNIT_SIZE, PP_SLOTS, PP_UNIT_SIZE,
  PP_DEFENCE_PER_UNIT, PP_FORWARDS_PER_UNIT,
  PK_DEFENCE_PER_UNIT, PK_FORWARDS_PER_UNIT,
  defaultPenaltyKill, defaultPowerPlay, defaultSpecialTeams,
  hasExplicitSpecialTeams, hydrateSpecialTeams,
  penaltyKillUnit, powerPlayUnit,
  specialTeamsGamesBonus, specialTeamsPointMultiplier,
  unitForSlot,
} from "../app/lib/special-teams";
import type { LineupPlayer } from "../app/lib/lineup-order";

type P = LineupPlayer & { ptsPace?: number; goalsPace?: number; defRate?: number; pkTimeShare?: number };

const fwd = (id: string, over: Partial<P> = {}): P =>
  ({ id, name: id, position: "C", avgTOI: 16, ...over });
const def = (id: string, over: Partial<P> = {}): P =>
  ({ id, name: id, position: "D", avgTOI: 20, ...over });

/** Twelve forwards and six D, descending in both scoring and defence. */
const fullRoster = (): P[] => [
  ...Array.from({ length: 12 }, (_, i) =>
    fwd(`f${i}`, { ptsPace: 90 - i * 5, goalsPace: 40 - i * 2, defRate: 0.5 - i * 0.02, pkTimeShare: 0.3 - i * 0.02 })),
  ...Array.from({ length: 6 }, (_, i) =>
    def(`d${i}`, { ptsPace: 50 - i * 6, goalsPace: 10 - i, defRate: 0.6 - i * 0.05, pkTimeShare: 0.4 - i * 0.05 })),
];

describe("unit geometry", () => {
  it("maps slots to units", () => {
    expect(unitForSlot(0, PP_UNIT_SIZE)).toBe(1);
    expect(unitForSlot(4, PP_UNIT_SIZE)).toBe(1);
    expect(unitForSlot(5, PP_UNIT_SIZE)).toBe(2);
    expect(unitForSlot(9, PP_UNIT_SIZE)).toBe(2);
  });

  it("rejects slots outside the sheet", () => {
    expect(unitForSlot(10, PP_UNIT_SIZE)).toBeNull();
    expect(unitForSlot(-1, PP_UNIT_SIZE)).toBeNull();
    expect(unitForSlot(8, PK_UNIT_SIZE)).toBeNull();
  });
});

describe("default units", () => {
  it("fills both power-play units with the right shape", () => {
    const pp = defaultPowerPlay(fullRoster());
    expect(pp).toHaveLength(PP_SLOTS);
    expect(new Set(pp).size).toBe(PP_SLOTS);

    // Four forwards and a defenceman per unit.
    const unit1 = pp.slice(0, PP_UNIT_SIZE);
    expect(unit1.filter(id => id.startsWith("f"))).toHaveLength(PP_FORWARDS_PER_UNIT);
    expect(unit1.filter(id => id.startsWith("d"))).toHaveLength(PP_DEFENCE_PER_UNIT);
  });

  it("fills both kill units two and two", () => {
    const pk = defaultPenaltyKill(fullRoster());
    expect(pk).toHaveLength(PK_SLOTS);
    const unit1 = pk.slice(0, PK_UNIT_SIZE);
    expect(unit1.filter(id => id.startsWith("f"))).toHaveLength(PK_FORWARDS_PER_UNIT);
    expect(unit1.filter(id => id.startsWith("d"))).toHaveLength(PK_DEFENCE_PER_UNIT);
  });

  it("puts the best scorers on PP1", () => {
    const pp = defaultPowerPlay(fullRoster());
    expect(pp.slice(0, PP_FORWARDS_PER_UNIT)).toEqual(["f0", "f1", "f2", "f3"]);
  });

  // The two sheets rank on different things, which is the point of having both.
  it("does not simply reuse the power play for the kill", () => {
    const roster = [
      ...Array.from({ length: 8 }, (_, i) => fwd(`f${i}`, { ptsPace: 90 - i * 10, pkTimeShare: i * 0.05 })),
      ...Array.from({ length: 4 }, (_, i) => def(`d${i}`, { ptsPace: 40 - i * 5, pkTimeShare: i * 0.05 })),
    ];
    expect(defaultPowerPlay(roster).slice(0, 2)).not.toEqual(defaultPenaltyKill(roster).slice(0, 2));
  });

  it("never assigns the same player twice on one sheet", () => {
    const { powerPlay, penaltyKill } = defaultSpecialTeams(fullRoster());
    expect(new Set(powerPlay).size).toBe(powerPlay.length);
    expect(new Set(penaltyKill).size).toBe(penaltyKill.length);
  });

  it("produces a short sheet rather than inventing players on a thin roster", () => {
    const pp = defaultPowerPlay([fwd("f0"), def("d0")]);
    expect(pp).toEqual(["f0", "d0"]);
  });

  it("is deterministic on tied input", () => {
    const roster = [fwd("zeb"), fwd("abe"), def("d1"), def("d0")];
    expect(defaultPowerPlay(roster)).toEqual(defaultPowerPlay([...roster].reverse()));
  });
});

describe("hydrateSpecialTeams", () => {
  it("keeps a saved sheet intact when nothing changed", () => {
    const roster = fullRoster();
    const saved = defaultSpecialTeams(roster);
    expect(hydrateSpecialTeams(roster, saved)).toEqual(saved);
  });

  it("drops a departed player and closes the gap", () => {
    const roster = fullRoster();
    const saved = defaultSpecialTeams(roster);
    const traded = roster.filter(p => p.id !== "f0");

    const next = hydrateSpecialTeams(traded, saved);
    expect(next.powerPlay).not.toContain("f0");
    // A unit with a hole in it would play short, which does not happen.
    expect(next.powerPlay).toHaveLength(PP_SLOTS);
  });

  it("fills an empty saved sheet from the defaults", () => {
    const roster = fullRoster();
    expect(hydrateSpecialTeams(roster, null).powerPlay).toHaveLength(PP_SLOTS);
    expect(hydrateSpecialTeams(roster, {}).penaltyKill).toHaveLength(PK_SLOTS);
  });

  it("ignores ids that are not on the roster", () => {
    const roster = fullRoster();
    const next = hydrateSpecialTeams(roster, { powerPlay: ["ghost", "f0"] });
    expect(next.powerPlay).not.toContain("ghost");
    expect(next.powerPlay[0]).toBe("f0");
  });

  it("never exceeds the sheet size", () => {
    const roster = fullRoster();
    const overfull = { powerPlay: roster.map(p => p.id) };
    expect(hydrateSpecialTeams(roster, overfull).powerPlay).toHaveLength(PP_SLOTS);
  });
});

describe("sim contribution", () => {
  const order = { powerPlay: ["pp1", "b", "c", "d", "e", "pp2"], penaltyKill: ["pk1", "x", "y", "z", "pk2"] };

  it("reads a player's unit", () => {
    expect(powerPlayUnit("pp1", order)).toBe(1);
    expect(powerPlayUnit("pp2", order)).toBe(2);
    expect(powerPlayUnit("nobody", order)).toBeNull();
    expect(penaltyKillUnit("pk1", order)).toBe(1);
    expect(penaltyKillUnit("pk2", order)).toBe(2);
  });

  it("pays first-unit power play more than second", () => {
    expect(specialTeamsPointMultiplier("pp1", order))
      .toBeGreaterThan(specialTeamsPointMultiplier("pp2", order));
  });

  it("leaves a player on neither unit untouched", () => {
    expect(specialTeamsPointMultiplier("nobody", order)).toBe(1);
    expect(specialTeamsGamesBonus("nobody", order)).toBe(0);
  });

  // PK time displaces even-strength time, so a heavy killer scores slightly
  // less — but is trusted with more games.
  it("costs a killer points and pays him games", () => {
    expect(specialTeamsPointMultiplier("pk1", order)).toBeLessThan(1);
    expect(specialTeamsGamesBonus("pk1", order)).toBeGreaterThan(0);
  });

  it("keeps special teams a modest lever beside the line multipliers", () => {
    // The sim's line multipliers span 0.90-1.10; special teams must not swamp
    // them or the sheet stops mattering.
    const all = ["pp1", "pp2", "pk1", "pk2", "nobody"]
      .map(id => specialTeamsPointMultiplier(id, order));
    for (const m of all) {
      expect(m).toBeGreaterThan(0.9);
      expect(m).toBeLessThan(1.2);
    }
  });
});

describe("hasExplicitSpecialTeams", () => {
  // The sim's pkTimeShare heuristic must switch OFF once real units exist, or
  // a killer is counted twice — the same double-count RL7 avoided.
  it("detects a user-set sheet", () => {
    expect(hasExplicitSpecialTeams({ powerPlay: ["a"] })).toBe(true);
    expect(hasExplicitSpecialTeams({ penaltyKill: ["a"] })).toBe(true);
  });

  it("treats absent or empty as no sheet", () => {
    expect(hasExplicitSpecialTeams(null)).toBe(false);
    expect(hasExplicitSpecialTeams({})).toBe(false);
    expect(hasExplicitSpecialTeams({ powerPlay: [], penaltyKill: [] })).toBe(false);
  });
});
