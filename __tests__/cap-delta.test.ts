import { describe, expect, it } from "vitest";
import { applyCapDelta } from "../app/lib/cap-delta";

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
});
