import { describe, expect, it } from "vitest";
import {
  hydrateLineupOrdersForRoster,
  type LineupOrderPayload,
  type LineupPlayer,
} from "../app/lib/lineup-order";

const player = (id: string, position: string): LineupPlayer => ({
  id,
  name: id,
  position,
  games: 82,
  avgTOI: 10,
  ptsPace: 20,
});

describe("LineupEditor saved lineup hydration", () => {
  it("preserves saved slot order across tab remounts while merging roster changes", () => {
    const saved: LineupOrderPayload = {
      forwards: ["f3", "departed", "f1"],
      defense: ["d2"],
      goalies: ["g2"],
      scratches: ["f2", "d1", "g1", "f3"],
    };

    const orders = hydrateLineupOrdersForRoster([
      player("f1", "W"),
      player("f2", "C"),
      player("f3", "W"),
      player("f4", "W"),
      player("d1", "D"),
      player("d2", "D"),
      player("g1", "G"),
      player("g2", "G"),
    ], saved);

    expect(orders.F).toEqual(["f3", "f1", "f2", "f4"]);
    expect(orders.D).toEqual(["d2", "d1"]);
    expect(orders.G).toEqual(["g2", "g1"]);
  });
});

// ── AG3 — alternate positions persist into Lineups ───────────────
import { defaultLineupOrdersForRoster, isC, isW, isD } from "../app/lib/lineup-order";

const flexPlayer = (id: string, position: string, secondaryPosition?: string): LineupPlayer => ({
  id, name: id, position, secondaryPosition, games: 82, avgTOI: 20, ptsPace: 60,
});

describe("AG3 — alternate position eligibility", () => {
  it("a winger who also plays center (secondary C) is center-eligible", () => {
    const lehkonen = flexPlayer("lehkonen", "W", "C");
    expect(isC(lehkonen)).toBe(true);   // now eligible at center
    expect(isW(lehkonen)).toBe(true);   // still a winger too
  });

  it("a center who also plays wing (secondary W) is wing-eligible", () => {
    const vilardi = flexPlayer("vilardi", "C", "W");
    expect(isW(vilardi)).toBe(true);
    expect(isC(vilardi)).toBe(true);
  });

  it("a generic F secondary opens both forward slots", () => {
    const swiss = flexPlayer("swiss", "C", "F");
    expect(isC(swiss)).toBe(true);
    expect(isW(swiss)).toBe(true);
  });

  it("default ordering can slot a secondary-center winger in the C column", () => {
    // Only one true center; the secondary-C winger has the most ice time and
    // must be allowed to anchor a center slot rather than being wing-locked.
    const roster: LineupPlayer[] = [
      { ...flexPlayer("lehkonen", "W", "C"), avgTOI: 21 },
      { ...flexPlayer("realC", "C"), avgTOI: 15 },
      { ...flexPlayer("w1", "W"), avgTOI: 14 },
      { ...flexPlayer("w2", "W"), avgTOI: 13 },
    ];
    const orders = defaultLineupOrdersForRoster(roster);
    // Center columns are lineup indices 1, 4, 7, 10.
    const centerSlots = [1, 4, 7, 10].map(i => orders.F[i]).filter(Boolean);
    expect(centerSlots).toContain("lehkonen");
  });

  it("keeps D and G primary-only so a forward is never double-deployed on defense", () => {
    const fdFlex = flexPlayer("fd", "C", "D");
    expect(isD(fdFlex)).toBe(false); // stays a forward — no double-deploy
  });
});
