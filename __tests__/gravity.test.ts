// ── Gravity Engine v3 "Spacetime" — zone-mass model tests ────────
// Archetype fixtures verify the field SHAPE (which zone carries the
// mass) as well as the magnitude (force, tier). The engine is
// position-normalized: defensemen are z-scored against D calibration,
// forwards against F, then force is one agnostic currency.

import { describe, it, expect } from "vitest";
import { computeGravity, classifyTier, simOnIceDelta } from "@/app/lib/gravity";

// Minimal asset factory — only fields gravity reads
function asset(overrides: Record<string, unknown>) {
  return {
    id: "t", name: "Test", teamId: "TST",
    age: 26, capHit: 5, yearsRemaining: 3,
    canRetain: false, retainedPct: 0, multiplier: 1,
    hasNMC: false, hasNTC: false,
    ...overrides,
  } as any;
}

describe("computeGravity v3 — eligibility", () => {
  it("returns null for goalies, picks, and tiny samples", () => {
    expect(computeGravity(asset({ position: "G", games: 50 }))).toBeNull();
    expect(computeGravity(asset({ position: "Pick", games: 50 }))).toBeNull();
    expect(computeGravity(asset({ position: "C", games: 5 }))).toBeNull();
  });
});

describe("computeGravity v3 — bounds and structure", () => {
  it("force and all masses stay bounded in (−1, +1) even at absurd inputs", () => {
    const g = computeGravity(asset({
      position: "C", games: 82, avgTOI: 25,
      ptsPace: 160, goalsPace: 70, assistsPace: 90,
      xgRelTM: 40, baselineXgRel: 0.40, xgaRelTM: -2,
      baselineIxg82: 45, ppPtsPace82: 45,
      edgeOzPct: 0.60, dzPct: 0.30,
      edgeSpeedMaxMph: 24, edgeBurstsOver20: 200,
      dps: 8, pkTimeShare: 0.4, qocIndex: 95,
    }))!;
    expect(Math.abs(g.force)).toBeLessThan(1);
    expect(Math.abs(g.masses.oz)).toBeLessThan(1);
    expect(Math.abs(g.masses.nz)).toBeLessThan(1);
    expect(Math.abs(g.masses.dz)).toBeLessThan(1);
    expect(Math.abs(g.navResidual)).toBeLessThan(1);
  });

  it("navResidual is smaller than force when the full field is positive", () => {
    const g = computeGravity(asset({
      position: "C", games: 70, avgTOI: 19,
      assistsPace: 50, goalsPace: 30, baselineIxg82: 20,
      xgRelTM: 10, baselineXgRel: 0.09, xgaRelTM: -0.3,
      ppPtsPace82: 20, dps: 1.5, pkTimeShare: 0.02,
      edgeOzPct: 0.50, dzPct: 0.45, edgeSpeedMaxMph: 22.3, edgeBurstsOver20: 60,
    }))!;
    expect(g.navResidual).toBeLessThan(g.force);
    expect(g.navResidual).toBeGreaterThan(0); // transition signal survives
  });

  it("Release A keeps direct offense out of navResidual while OZ remains descriptive", () => {
    const base = {
      position: "C", games: 82, avgTOI: 18,
      assistsPace: 26, goalsPace: 20, baselineIxg82: 12,
      xgRelTM: 4, baselineXgRel: 0.04, xgaRelTM: -0.1,
      ppPtsPace82: 8, dps: 1, pkTimeShare: 0.04,
      edgeOzPct: 0.46, dzPct: 0.48,
      edgeSpeedMaxMph: 21.8, edgeBurstsOver20: 35,
    };
    const original = computeGravity(asset(base))!;
    const assists = computeGravity(asset({ ...base, assistsPace: 80 }))!;
    const powerPlay = computeGravity(asset({ ...base, ppPtsPace82: 40 }))!;
    const individualXg = computeGravity(asset({ ...base, baselineIxg82: 35, goalsPace: 55 }))!;
    const transition = computeGravity(asset({
      ...base,
      edgeOzPct: 0.58,
      edgeSpeedMaxMph: 23.5,
      edgeBurstsOver20: 140,
    }))!;

    expect(assists.masses.oz).not.toBe(original.masses.oz);
    expect(assists.navResidual).toBe(original.navResidual);
    expect(powerPlay.navResidual).toBe(original.navResidual);
    expect(individualXg.navResidual).toBe(original.navResidual);
    expect(transition.navResidual).not.toBe(original.navResidual);
  });

  it("QoC and TOI do not inflate per-rate zone masses", () => {
    const base = {
      position: "D", games: 70,
      assistsPace: 30, goalsPace: 8, baselineIxg82: 8,
      xgRelTM: 5, baselineXgRel: 0.05, xgaRelTM: -0.2,
      ppPtsPace82: 10, dps: 3, pkTimeShare: 0.1,
      edgeOzPct: 0.47, dzPct: 0.5,
      edgeSpeedMaxMph: 21.8, edgeBurstsOver20: 30,
    };
    const sheltered = computeGravity(asset({ ...base, avgTOI: 12, qocIndex: 20 }))!;
    const heavilyUsed = computeGravity(asset({ ...base, avgTOI: 27, qocIndex: 95 }))!;

    expect(heavilyUsed.masses).toEqual(sheltered.masses);
    expect(heavilyUsed.force).toBe(sheltered.force);
  });
});

describe("computeGravity v3 — archetype shapes", () => {
  // Adam Fox, 2025-26 real numbers (55 GP)
  const fox = () => computeGravity(asset({
    position: "D", games: 55, avgTOI: 23.6,
    ptsPace: 79, goalsPace: 13.4, assistsPace: 65.6,
    xgRelTM: 22.5, baselineXgRel: 0.111, xgaRelTM: -0.63,
    baselineIxg82: 13.31, ppPtsPace82: 28.23,
    dps: 3.4, pkTimeShare: 0.053, pairDriverScore: 21.35,
    qocIndex: 73, dzPct: 0.5,
    edgeOzPct: 0.48, edgeSpeedMaxMph: 21.1, edgeBurstsOver20: 15,
  }))!;

  it("Fox: high positive field, but bounded — no usage/QoC retuning", () => {
    const g = fox();
    expect(g.force).toBeGreaterThanOrEqual(0.4);
    expect(g.force).toBeLessThan(0.9);
    expect(["STAR", "SUPERMASSIVE"]).toContain(g.tier);
  });

  it("Fox: broad two-zone basin — OZ dominant, DZ dome real, all positive", () => {
    const g = fox();
    expect(g.masses.oz).toBeGreaterThan(g.masses.nz);
    expect(g.masses.oz).toBeGreaterThan(0.6);
    expect(g.masses.dz).toBeGreaterThan(0.2);
    expect(g.masses.nz).toBeGreaterThan(0);
  });

  it("Hughes-type: transition D — NZ well outweighs DZ dome", () => {
    const g = computeGravity(asset({
      position: "D", games: 70, avgTOI: 24,
      ptsPace: 85, goalsPace: 15, assistsPace: 70,
      xgRelTM: 12, baselineXgRel: 0.10, xgaRelTM: 0.1, // not a suppression profile
      baselineIxg82: 10, ppPtsPace82: 30,
      dps: 2.2, pkTimeShare: 0.01, pairDriverScore: 18,
      qocIndex: 68, dzPct: 0.55,           // deployed in his own end...
      edgeOzPct: 0.52,                      // ...but play lives in the O-zone
      edgeSpeedMaxMph: 22.8, edgeBurstsOver20: 90,
    }))!;
    expect(g.masses.nz).toBeGreaterThan(0.5);
    expect(g.masses.nz).toBeGreaterThan(g.masses.dz);
    expect(g.tier === "SUPERMASSIVE" || g.tier === "STAR").toBe(true);
  });

  it("shutdown D: DZ dome dominant, force meaningful but not supermassive", () => {
    const g = computeGravity(asset({
      position: "D", games: 75, avgTOI: 21.5,
      ptsPace: 25, goalsPace: 4, assistsPace: 21,
      xgRelTM: 2, baselineXgRel: 0.01, xgaRelTM: -0.8, // heavy suppression
      baselineIxg82: 3.5, ppPtsPace82: 0.5,
      dps: 4.8, pkTimeShare: 0.24, pairDriverScore: 8,
      qocIndex: 80, dzPct: 0.62,
      edgeOzPct: 0.40, edgeSpeedMaxMph: 21.4, edgeBurstsOver20: 25,
    }))!;
    expect(g.masses.dz).toBeGreaterThan(g.masses.oz);
    expect(g.masses.dz).toBeGreaterThan(0.5);
    expect(g.force).toBeGreaterThan(0.08);
    expect(g.force).toBeLessThan(0.55);
  });

  it("elite F and elite transition D land in comparable tiers — one currency", () => {
    const eliteF = computeGravity(asset({
      position: "C", games: 78, avgTOI: 21.5,
      ptsPace: 130, goalsPace: 40, assistsPace: 90,
      xgRelTM: 9, baselineXgRel: 0.10, xgaRelTM: 0,
      baselineIxg82: 28, ppPtsPace82: 40,
      dps: 1.2, pkTimeShare: 0.05, qocIndex: 75, dzPct: 0.40,
      edgeOzPct: 0.51, edgeSpeedMaxMph: 23.2, edgeBurstsOver20: 120,
    }))!;
    const eliteD = computeGravity(asset({
      position: "D", games: 70, avgTOI: 24,
      ptsPace: 85, goalsPace: 15, assistsPace: 70,
      xgRelTM: 12, baselineXgRel: 0.10, xgaRelTM: 0.1,
      baselineIxg82: 10, ppPtsPace82: 30,
      dps: 2.2, pkTimeShare: 0.01, pairDriverScore: 18,
      qocIndex: 68, dzPct: 0.55, edgeOzPct: 0.52,
      edgeSpeedMaxMph: 22.8, edgeBurstsOver20: 90,
    }))!;
    expect(eliteF.tier === "SUPERMASSIVE" || eliteF.tier === "STAR").toBe(true);
    expect(eliteD.tier === "SUPERMASSIVE" || eliteD.tier === "STAR").toBe(true);
    expect(Math.abs(eliteF.force - eliteD.force)).toBeLessThan(0.3);
  });

  it("replacement-level grinder: negligible field", () => {
    const g = computeGravity(asset({
      position: "W", games: 60, avgTOI: 11,
      ptsPace: 18, goalsPace: 8, assistsPace: 10,
      xgRelTM: -1, baselineXgRel: -0.005, xgaRelTM: 0.05,
      baselineIxg82: 6, ppPtsPace82: 0.5,
      dps: 0.6, pkTimeShare: 0.06, qocIndex: 42, dzPct: 0.52,
      edgeOzPct: 0.42, edgeSpeedMaxMph: 21.2, edgeBurstsOver20: 18,
    }))!;
    // Position-normalized scale: a below-average grinder sits mildly
    // negative, inside the wide ASTEROID band — never a BLACK_HOLE.
    expect(g.force).toBeGreaterThan(-0.22);
    expect(g.force).toBeLessThan(0.15);
    expect(g.tier === "ASTEROID" || g.tier === "SATELLITE").toBe(true);
  });

  it("black hole: negative lift + caved defense = negative force", () => {
    const g = computeGravity(asset({
      position: "W", games: 55, avgTOI: 13,
      ptsPace: 22, goalsPace: 10, assistsPace: 12,
      xgRelTM: -9, baselineXgRel: -0.08, xgaRelTM: 0.7, // team bleeds with him out
      baselineIxg82: 8, ppPtsPace82: 2,
      dps: 0.3, pkTimeShare: 0.0, qocIndex: 45, dzPct: 0.48,
      edgeOzPct: 0.39, edgeSpeedMaxMph: 20.8, edgeBurstsOver20: 10,
    }))!;
    expect(g.force).toBeLessThan(-0.22);
    expect(g.tier).toBe("BLACK_HOLE");
    expect(g.masses.oz).toBeLessThan(0);
    expect(g.masses.dz).toBeLessThan(0);
  });
});

describe("computeGravity v3 — signal quality", () => {
  it("signal stability damps conflicting current and baseline lift", () => {
    const base = {
      position: "W", games: 65, avgTOI: 16,
      ptsPace: 55, goalsPace: 22, assistsPace: 33,
      baselineIxg82: 14, ppPtsPace82: 10,
      dps: 1.0, pkTimeShare: 0.02, qocIndex: 55, dzPct: 0.45,
      edgeOzPct: 0.46, edgeSpeedMaxMph: 21.8, edgeBurstsOver20: 45,
      xgaRelTM: 0,
    };
    const stable = computeGravity(asset({ ...base, xgRelTM: 8, baselineXgRel: 0.075 }))!;
    const flipped = computeGravity(asset({ ...base, xgRelTM: 8, baselineXgRel: -0.06 }))!;
    expect(flipped.signalStability).toBeLessThan(stable.signalStability);
    expect(stable.partnerIndependence).toBe(stable.signalStability);
    expect(flipped.force).toBeLessThan(stable.force);
  });

  it("missing EDGE zone time → explicit coverage, partial data, and lower reliability", () => {
    const base = {
      position: "C", games: 70, avgTOI: 18,
      ptsPace: 70, goalsPace: 28, assistsPace: 42,
      xgRelTM: 6, baselineXgRel: 0.05, xgaRelTM: -0.2,
      baselineIxg82: 18, ppPtsPace82: 18,
      dps: 1.4, pkTimeShare: 0.04, qocIndex: 60, dzPct: 0.47,
      edgeSpeedMaxMph: 22.0, edgeBurstsOver20: 55,
    };
    const full = computeGravity(asset({ ...base, edgeOzPct: 0.47 }))!;
    const partial = computeGravity(asset({ ...base, edgeOzPct: null }))!;
    expect(full.dataQuality).toBe("full");
    expect(partial.dataQuality).toBe("partial");
    expect(partial.coverage.nz.missingInputs).toContain("edgeZoneTimeDisplacement");
    expect(partial.coverage.nz.presentWeight).toBe(0.5);
    expect(partial.coverage.nz.possibleWeight).toBe(1);
    expect(partial.reliability).toBeLessThan(full.reliability);
    expect(partial.confidence).toBe(partial.reliability);
  });

  it("records all absent zone evidence as neutral shrinkage", () => {
    const sparse = computeGravity(asset({
      position: "W", games: 60, avgTOI: 15,
    }))!;

    expect(sparse.coverage.oz.ratio).toBe(0);
    expect(sparse.coverage.nz.ratio).toBe(0);
    expect(sparse.coverage.dz.ratio).toBe(0);
    expect(sparse.coverage.oz.missingInputs).toContain("assistsPace");
    expect(sparse.masses).toEqual({ oz: 0, nz: 0, dz: 0 });
    expect(sparse.dataQuality).toBe("partial");
  });
});

describe("classifyTier", () => {
  it("maps the bounded force scale to tiers", () => {
    expect(classifyTier(0.60)).toBe("SUPERMASSIVE");
    expect(classifyTier(0.45)).toBe("STAR");
    expect(classifyTier(0.30)).toBe("MAIN_SEQUENCE");
    expect(classifyTier(0.10)).toBe("SATELLITE");
    expect(classifyTier(0.0)).toBe("ASTEROID");
    expect(classifyTier(-0.15)).toBe("ASTEROID");
    expect(classifyTier(-0.30)).toBe("BLACK_HOLE");
  });
});

// ── G4 — simOnIceDelta: the sim engine's gravity term ────────────
// Points pace prices scoring; this term adds what it misses. It must
// credit defense/transition heavily, scoring shape barely, stay bounded,
// and shrink with thin data so a 20-game mirage can't move a season sim.
describe("simOnIceDelta (G4 sim propagation)", () => {
  const shutdownD = () => computeGravity(asset({
    position: "D", games: 75, avgTOI: 21.5,
    ptsPace: 25, goalsPace: 4, assistsPace: 21,
    xgRelTM: 2, baselineXgRel: 0.01, xgaRelTM: -0.8,
    baselineIxg82: 3.5, ppPtsPace82: 0.5,
    dps: 4.8, pkTimeShare: 0.24, pairDriverScore: 8,
    qocIndex: 80, dzPct: 0.62,
    edgeOzPct: 0.40, edgeSpeedMaxMph: 21.4, edgeBurstsOver20: 25,
  }));

  it("returns 0 for null profiles (goalies, picks, tiny samples)", () => {
    expect(simOnIceDelta(null)).toBe(0);
    expect(simOnIceDelta(computeGravity(asset({ position: "G", games: 50 })))).toBe(0);
  });

  it("credits a shutdown D with meaningful on-ice value pts pace misses", () => {
    const delta = simOnIceDelta(shutdownD());
    expect(delta).toBeGreaterThan(2);
    expect(delta).toBeLessThanOrEqual(8);
  });

  it("penalizes a black hole", () => {
    const bh = computeGravity(asset({
      position: "W", games: 55, avgTOI: 13,
      ptsPace: 22, goalsPace: 10, assistsPace: 12,
      xgRelTM: -9, baselineXgRel: -0.08, xgaRelTM: 0.7,
      baselineIxg82: 8, ppPtsPace82: 2,
      dps: 0.3, pkTimeShare: 0.0, qocIndex: 45, dzPct: 0.48,
      edgeOzPct: 0.39, edgeSpeedMaxMph: 20.8, edgeBurstsOver20: 10,
    }));
    expect(simOnIceDelta(bh)).toBeLessThan(0);
  });

  it("stays bounded at ±8 even for absurd fields", () => {
    const max = simOnIceDelta({
      force: 0.99, masses: { oz: 1, nz: 1, dz: 1 }, navResidual: 0.9,
      signalStability: 1, partnerIndependence: 1,
      reliability: 1, confidence: 1, dataQuality: "full",
      coverage: {
        oz: { presentWeight: 1, possibleWeight: 1, ratio: 1, missingInputs: [] },
        nz: { presentWeight: 1, possibleWeight: 1, ratio: 1, missingInputs: [] },
        dz: { presentWeight: 1, possibleWeight: 1, ratio: 1, missingInputs: [] },
      },
      isDefenseman: false, tier: "SUPERMASSIVE", description: "",
    } as any);
    expect(Math.abs(max)).toBeLessThanOrEqual(8);
  });

  it("reliability-damps thin samples: same rate signals, fewer games → smaller delta", () => {
    // Counting stats scale with games so the per-82 rates are identical —
    // the ONLY difference between the two runs is sample reliability.
    const fields = (games: number) => ({
      position: "D", games, avgTOI: 21.5,
      ptsPace: 25, goalsPace: 4, assistsPace: 21,
      xgRelTM: 2, baselineXgRel: 0.01, xgaRelTM: -0.8,
      baselineIxg82: 3.5, ppPtsPace82: 0.5,
      dps: 4.8, pkTimeShare: 0.24, pairDriverScore: 8,
      qocIndex: 80, dzPct: 0.62,
      edgeOzPct: 0.40, edgeSpeedMaxMph: 21.4,
      edgeBurstsOver20: Math.round(games * (25 / 75)),
    });
    const thin = simOnIceDelta(computeGravity(asset(fields(20))));
    const full = simOnIceDelta(computeGravity(asset(fields(75))));
    expect(Math.abs(thin)).toBeLessThan(Math.abs(full));
  });
});
