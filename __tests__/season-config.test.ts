import { describe, it, expect } from "vitest";
import { capGrowthFactor, projectedCapCeiling, CAP_BY_CUP_YEAR } from "@/app/lib/season-config";

describe("capGrowthFactor — the announced curve, as a multiple of today", () => {
  it("is 1 in the current season", () => {
    expect(capGrowthFactor(0)).toBe(1);
    expect(capGrowthFactor(-3)).toBe(1);
  });

  it("tracks the announced ceilings rather than a flat escalator", () => {
    // 104.0 → 113.5 → 123.0. The NAV engine used to compound 4% a year, which
    // reaches 108.2 and 112.5 — several points light on every future contract
    // year, and compounding worst on the long deals.
    expect(capGrowthFactor(1)).toBeCloseTo(113.5 / 104.0, 6);
    expect(capGrowthFactor(2)).toBeCloseTo(123.0 / 104.0, 6);
    expect(capGrowthFactor(1)).toBeGreaterThan(1.04);
    expect(capGrowthFactor(2)).toBeGreaterThan(1.04 ** 2);
  });

  it("keeps climbing past the announced years, and never shrinks", () => {
    let prev = 0;
    for (let i = 0; i <= 8; i++) {
      const f = capGrowthFactor(i);
      expect(f, `season ${i}`).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(capGrowthFactor(8)).toBeGreaterThan(capGrowthFactor(3));
  });

  it("is a shape, so a custom ceiling still governs the level", () => {
    // Armchair GM lets a user set their own cap. A contract has to be priced
    // against THAT world, which is why the engine multiplies its own base by
    // this rather than calling projectedCapCeiling directly.
    const customBase = 90;
    expect(customBase * capGrowthFactor(1)).toBeCloseTo(90 * (113.5 / 104.0), 6);
  });
});
