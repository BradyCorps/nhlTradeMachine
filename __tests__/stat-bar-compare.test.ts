// ── Head-to-head stat bar geometry (audit #8) ────────────────────
import { describe, it, expect } from "vitest";
import { compareStat } from "@/app/lib/stat-bar-compare";

describe("compareStat — bar geometry handles negatives (audit #8)", () => {
  it("gives a more-negative NAV the SHORTER bar for a higher-is-better stat", () => {
    // -50 vs +10: +10 is better and must get the longer bar.
    const r = compareStat(-50, 10, true);
    expect(r.partWins).toBe(true);
    expect(r.homeWins).toBe(false);
    expect(r.partPct).toBeGreaterThan(r.homePct);
  });

  it("ranks two negative values correctly (less negative is better)", () => {
    const r = compareStat(-10, -50, true);
    expect(r.homeWins).toBe(true);           // -10 beats -50
    expect(r.homePct).toBeGreaterThan(r.partPct);
  });

  it("keeps the positive case intuitive (bigger value, longer bar)", () => {
    const r = compareStat(40, 20, true);
    expect(r.homeWins).toBe(true);
    expect(r.homePct).toBeGreaterThan(r.partPct);
  });

  it("lower-is-better: the smaller value wins with the longer bar", () => {
    const r = compareStat(2.0, 8.5, false); // cap hit — cheaper is better
    expect(r.homeWins).toBe(true);
    expect(r.homePct).toBeGreaterThan(r.partPct);
  });
});

describe("compareStat — an empty side never wins (audit #8)", () => {
  it("does not let a null (picks-only) side win a lower-is-better stat", () => {
    // Age: an empty package must NOT read as the youngest.
    const r = compareStat(null, 28, false);
    expect(r.homeWins).toBe(false);
    expect(r.partWins).toBe(true);
    expect(r.homePct).toBe(0);     // no bar for the missing side
  });

  it("does not let a null side win a higher-is-better stat", () => {
    const r = compareStat(null, 60, true);
    expect(r.homeWins).toBe(false);
    expect(r.partWins).toBe(true);
  });

  it("the present side wins when the other is missing", () => {
    const r = compareStat(19.5, null, true);
    expect(r.homeWins).toBe(true);
    expect(r.partWins).toBe(false);
    expect(r.partPct).toBe(0);
  });

  it("neither side wins when both are missing", () => {
    const r = compareStat(null, null, true);
    expect(r.homeWins).toBe(false);
    expect(r.partWins).toBe(false);
  });
});
