import { describe, expect, it } from "vitest";
import { applyCapDelta, applyTeamCapDeltas, effectiveCapHit } from "../app/lib/cap-delta";

describe("effectiveCapHit — the single source of truth for retention math", () => {
  it("returns the post-retention cap hit (a $10M player at 50% moves $5M)", () => {
    expect(effectiveCapHit({ capHit: 10, retainedPct: 0.5 })).toBe(5);
  });

  it("is the full cap hit with no retention", () => {
    expect(effectiveCapHit({ capHit: 8.25, retainedPct: 0 })).toBe(8.25);
    expect(effectiveCapHit({ capHit: 8.25 })).toBe(8.25);
  });

  it("defaults a missing cap hit to zero (picks / prospects)", () => {
    expect(effectiveCapHit({ retainedPct: 0.5 })).toBe(0);
    expect(effectiveCapHit({})).toBe(0);
  });
});

describe("applyCapDelta", () => {
  it("applies a straight swap against baseline cap space", () => {
    expect(applyCapDelta(10, {
      incoming: [{ capHit: 5, retainedPct: 0 }],
      outgoing: [{ capHit: 3, retainedPct: 0 }],
    })).toBe(8);
  });

  it("accounts for retained salary on incoming and outgoing assets", () => {
    expect(applyCapDelta(10, {
      incoming: [{ capHit: 8, retainedPct: 0.5 }],
      outgoing: [{ capHit: 6, retainedPct: 0.25 }],
    })).toBeCloseTo(10.5);
  });

  it("leaves cap space unchanged for pick-only moves", () => {
    expect(applyCapDelta(10, {
      incoming: [{ retainedPct: 0 }],
      outgoing: [{ capHit: null, retainedPct: 0 }],
    })).toBe(10);
  });

  it("applies modeled moves only to involved teams", () => {
    const teams = [
      { id: "WPG", capSpace: 10, name: "Winnipeg" },
      { id: "CGY", capSpace: 8, name: "Calgary" },
      { id: "SEA", capSpace: 7, name: "Seattle" },
    ];

    const result = applyTeamCapDeltas(teams, {
      WPG: {
        incoming: [{ capHit: 8, retainedPct: 0.5 }],
        outgoing: [{ capHit: 6, retainedPct: 0 }],
      },
      CGY: {
        incoming: [{ capHit: 6, retainedPct: 0 }],
        outgoing: [{ capHit: 8, retainedPct: 0.5 }],
      },
    });

    expect(result.find(t => t.id === "WPG")?.capSpace).toBe(12);
    expect(result.find(t => t.id === "CGY")?.capSpace).toBe(6);
    expect(result.find(t => t.id === "SEA")?.capSpace).toBe(7);
  });

  it("preserves static baseline cap space when no moves are applied", () => {
    const teams = [{ id: "WPG", capSpace: 10, name: "Winnipeg" }];

    expect(applyTeamCapDeltas(teams)).toEqual(teams);
  });
});
