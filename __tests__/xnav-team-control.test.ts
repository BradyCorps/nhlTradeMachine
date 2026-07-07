import { describe, expect, it } from "vitest";
import { calcNAV, type AssetInput } from "../app/lib/xnav-engine";

// Growth-adjusted surplus + team-control option value. The bug these pin
// against: FMV held flat across a deal's term made 8 years of a 23-year-old
// worth barely more than 1 year of him, and long deals for aging players
// no worse than short ones.
const skater = (over: Partial<AssetInput> = {}): AssetInput => ({
  id: "x", teamId: "CAR", name: "Probe", position: "W", age: 23, games: 81,
  ptsPace: 41, defRate: 0.1, avgTOI: 16, capHit: 6, yearsRemaining: 8,
  hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0, multiplier: 1,
  draftYear: 2021, draftOverall: 47, hasLiveStats: true, baselinePtsPace: 44,
  ...over,
} as AssetInput);

describe("x-nav team control and growth-adjusted surplus", () => {
  it("values long team control of a pre-peak player well above a rental of him", () => {
    const longDeal = calcNAV(skater()).total;
    const rental = calcNAV(skater({ yearsRemaining: 1 })).total;
    expect(longDeal).toBeGreaterThan(rental + 15);
  });

  it("keeps the same long deal on a 30-year-old far below the 23-year-old", () => {
    const young = calcNAV(skater()).total;
    const old = calcNAV(skater({ age: 30 })).total;
    expect(young - old).toBeGreaterThan(35);
  });

  it("separates identical long deals widely by which side of the age curve they sit on", () => {
    const youngLong = calcNAV(skater({ yearsRemaining: 8 }));
    const oldLong = calcNAV(skater({ age: 30, yearsRemaining: 8 }));
    // growth years accrue surplus for the 23-year-old; decline drift
    // erodes the 30-year-old's — the cap components must diverge hard.
    expect(youngLong.cap - oldLong.cap).toBeGreaterThan(25);
  });

  it("gives fringe youth little team-control credit", () => {
    // 4th-line 22yo on a long deal: low production/role signal
    const fringe = calcNAV(skater({ age: 22, ptsPace: 12, baselinePtsPace: 11, avgTOI: 9, capHit: 0.9, draftOverall: 180 }));
    expect(fringe.upside).toBeLessThan(12);
  });

  it("still respects the 50% retention discount direction", () => {
    const full = calcNAV(skater());
    const retained = calcNAV(skater({ retainedPct: 0.5 }));
    expect(retained.total).toBeGreaterThan(full.total); // retained salary makes the asset cheaper to hold
  });
});

describe("EDGE luck adjustment in x-nav", () => {
  it("discounts hot finishers and credits unlucky ones, bounded", () => {
    const neutral = calcNAV(skater());
    const hot = calcNAV(skater({ hdFinishingDelta: 0.06 } as Partial<AssetInput>));
    const unlucky = calcNAV(skater({ hdFinishingDelta: -0.05 } as Partial<AssetInput>));
    expect(hot.off).toBeLessThan(neutral.off);
    expect(unlucky.off).toBeGreaterThan(neutral.off);
    expect(Math.abs(hot.off - neutral.off)).toBeLessThanOrEqual(10);
    expect(Math.abs(unlucky.off - neutral.off)).toBeLessThanOrEqual(12);
  });
});

// ── Thin-sample credibility — the recurring "26yo AHLer worth +140" phantom ──
describe("x-nav thin-sample credibility", () => {
  const base = (over: Partial<AssetInput> = {}): AssetInput => ({
    id: "p", teamId: "BOS", name: "Rolled AHLer", position: "C", age: 26,
    ptsPace: 82, baselinePtsPace: 82, defRate: 0.1, avgTOI: 11, capHit: 0.8,
    yearsRemaining: 1, hasNMC: false, hasNTC: false, canRetain: true,
    retainedPct: 0, multiplier: 1, hasLiveStats: true, games: 1,
    ...over,
  } as AssetInput);

  it("does not crown a 1-game player an elite scorer off an annualized pace", () => {
    const phantom = calcNAV(base({ games: 1 }));
    const proven  = calcNAV(base({ games: 80 }));
    expect(proven.total).toBeGreaterThan(90);           // real 82-pt season is elite
    expect(phantom.total).toBeLessThan(proven.total * 0.45); // 1 game is not
  });

  it("does not apply a franchise-cornerstone floor to a thin sample", () => {
    // A 95-pt pace on 5 games must not be floored to franchise value. The age-26
    // forward floor is 220; with the sample gate this player prices well below it.
    const thin = calcNAV(base({ games: 5, ptsPace: 95, baselinePtsPace: 95 }));
    expect(thin.total).toBeLessThan(200);
  });

  it("protects a drafted prospect's value on a thin sample where a no-name AHLer is cut", () => {
    // Same thin sample; only the draft pedigree differs. The prospect keeps full
    // credibility (draft slot, age <= 23); the pedigree-less player is regressed.
    const prospect = calcNAV(base({ games: 8, age: 22, draftOverall: 5, ptsPace: 55, baselinePtsPace: 50 }));
    const noName   = calcNAV(base({ games: 8, age: 22, ptsPace: 55, baselinePtsPace: 50 }));
    expect(prospect.total).toBeGreaterThan(noName.total);
  });
});
