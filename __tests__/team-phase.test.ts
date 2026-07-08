import { describe, expect, it } from "vitest";
import { deriveTeamPhase } from "../app/armchair-gm/contention";
import type { Asset, XNAVResult } from "../app/lib/trade-types";

const nav = (total: number): XNAVResult => ({ total, off: 0, def: 0, age: 0, cap: 0, upside: 0 });

const skater = (id: string, pos: string): Asset => ({
  id, teamId: "X", name: id, position: pos, age: 26, games: 70,
  ptsPace: 50, defRate: 0.1, avgTOI: 17, capHit: 5, yearsRemaining: 3,
  hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0,
  multiplier: 1, contractStatus: "SIGNED", expiresThisOffseason: false, hasLiveStats: true,
} as Asset);

// A roster of 6F / 3D / 1G, each carrying the given NAV — the present-strength
// slots computeContention scores.
function roster(fNav: number, dNav: number, gNav: number) {
  const players = [
    ...Array.from({ length: 6 }, (_, i) => skater(`f${i}`, "C")),
    ...Array.from({ length: 3 }, (_, i) => skater(`d${i}`, "D")),
    skater("g0", "G"),
  ];
  const navMap: Record<string, XNAVResult> = {};
  players.forEach((p) => {
    navMap[p.id] = nav(p.position === "G" ? gNav : p.position === "D" ? dNav : fNav);
  });
  return { players, navMap };
}

describe("deriveTeamPhase", () => {
  it("reads a stacked roster as a Contender", () => {
    const { players, navMap } = roster(280, 250, 250); // ~2680 present NAV
    expect(deriveTeamPhase(players, navMap)).toBe("Contender");
  });

  it("reads a gutted roster as Rebuilding or Tanking", () => {
    const { players, navMap } = roster(20, 15, 10);
    expect(["Rebuilding", "Tanking"]).toContain(deriveTeamPhase(players, navMap));
  });

  it("climbs the phase ladder as roster value rises", () => {
    const ORDER = ["Tanking", "Rebuilding", "Retooling", "Bubble", "Contender"];
    const phaseFor = (v: number) => {
      const { players, navMap } = roster(v, v * 0.8, v * 0.8);
      const phase = deriveTeamPhase(players, navMap);
      expect(phase).not.toBeNull();
      return phase!;
    };
    const weak = phaseFor(30);
    const mid = phaseFor(130);
    const strong = phaseFor(280);
    expect(ORDER.indexOf(mid)).toBeGreaterThan(ORDER.indexOf(weak));
    expect(ORDER.indexOf(strong)).toBeGreaterThan(ORDER.indexOf(mid));
  });

  it("returns null on a data-thin roster so the seed phase is kept", () => {
    // Fewer than the minimum qualified players → not enough signal to judge.
    expect(deriveTeamPhase([], {})).toBeNull();
    const { players, navMap } = roster(200, 200, 200);
    const thin = players.slice(0, 4); // only 4 valued players
    const thinNav = Object.fromEntries(thin.map(p => [p.id, navMap[p.id]]));
    expect(deriveTeamPhase(thin, thinNav)).toBeNull();
  });

  it("ignores players without a real games sample when judging phase", () => {
    // A full slate of valued players but all with 0 GP (e.g. fresh rookies)
    // carries no present-strength signal → null, keep the seed.
    const { players, navMap } = roster(200, 200, 200);
    const rookies = players.map(p => ({ ...p, games: 0 }));
    expect(deriveTeamPhase(rookies, navMap)).toBeNull();
  });
});
