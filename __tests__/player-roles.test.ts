// ── Modern role derivation (PA2) — archetype fixtures ────────────
// Each fixture is a recognizable player shape; the test pins WHICH
// role the evidence produces, so calibration drift is visible.

import { describe, it, expect } from "vitest";
import { derivePlayerRoles, ROLE_DEFS } from "@/app/lib/player-roles";

const base = {
  games: 70, ptsPace: 50, goalsPace: 18, assistsPace: 32,
  baselineIxg82: 10, ppPtsPace82: 8, pkTimeShare: 0.03,
  xgRelTM: 2, xgaRelTM: 0, dps: 1.2,
  baselineHits82: 60, baselineBlocks82: 40,
  edgeOzPct: 0.45, dzPct: 0.5, edgeSpeedMaxMph: 21.5, edgeBurstsOver20: 40,
  avgTOI: 16, qocIndex: 55, hdFinishingDelta: 0,
};

describe("derivePlayerRoles — eligibility", () => {
  it("returns null for goalies, picks, and small samples", () => {
    expect(derivePlayerRoles({ ...base, position: "G" })).toBeNull();
    expect(derivePlayerRoles({ ...base, position: "Pick" })).toBeNull();
    expect(derivePlayerRoles({ ...base, position: "C", games: 10 })).toBeNull();
  });

  it("returns null when no role clears the evidence bar", () => {
    const depth = derivePlayerRoles({
      position: "W", games: 60, ptsPace: 16, goalsPace: 7, assistsPace: 9,
      baselineIxg82: 5, ppPtsPace82: 0.5, pkTimeShare: 0.02,
      xgRelTM: -1, xgaRelTM: 0.1, dps: 0.5,
      baselineHits82: 45, baselineBlocks82: 25,
      edgeOzPct: 0.42, dzPct: 0.5, edgeSpeedMaxMph: 20.9, edgeBurstsOver20: 12,
      avgTOI: 10.5, qocIndex: 40, hdFinishingDelta: -0.02,
    });
    expect(depth).toBeNull();
  });
});

describe("derivePlayerRoles — archetype shapes", () => {
  it("Hughes-shape D: Puck-Moving Anchor", () => {
    const r = derivePlayerRoles({
      position: "D", games: 74, ptsPace: 84, goalsPace: 15, assistsPace: 69,
      baselineIxg82: 9, ppPtsPace82: 28, pkTimeShare: 0.02,
      xgRelTM: 11, xgaRelTM: 0, dps: 2.4,
      baselineHits82: 40, baselineBlocks82: 80,
      edgeOzPct: 0.52, dzPct: 0.54, edgeSpeedMaxMph: 22.7, edgeBurstsOver20: 80,
      avgTOI: 24.5, qocIndex: 68, hdFinishingDelta: 0.01,
    })!;
    expect(r.primary.key).toBe("PUCK_MOVING_ANCHOR");
  });

  it("Slavin-shape D: Perimeter Lockdown", () => {
    const r = derivePlayerRoles({
      position: "D", games: 78, ptsPace: 26, goalsPace: 5, assistsPace: 21,
      baselineIxg82: 3.5, ppPtsPace82: 1, pkTimeShare: 0.22,
      xgRelTM: 2, xgaRelTM: -0.55, dps: 4.6,
      baselineHits82: 110, baselineBlocks82: 150,
      edgeOzPct: 0.41, dzPct: 0.6, edgeSpeedMaxMph: 21.6, edgeBurstsOver20: 30,
      avgTOI: 22, qocIndex: 78, hdFinishingDelta: 0,
    })!;
    expect(r.primary.key).toBe("PERIMETER_LOCKDOWN");
  });

  it("shutdown C: Complete Shutdown", () => {
    const r = derivePlayerRoles({
      position: "C", games: 76, ptsPace: 42, goalsPace: 16, assistsPace: 26,
      baselineIxg82: 11, ppPtsPace82: 3, pkTimeShare: 0.17,
      xgRelTM: 3, xgaRelTM: -0.5, dps: 2.9,
      baselineHits82: 90, baselineBlocks82: 60,
      edgeOzPct: 0.42, dzPct: 0.58, edgeSpeedMaxMph: 21.6, edgeBurstsOver20: 35,
      avgTOI: 18.5, qocIndex: 80, hdFinishingDelta: 0,
    })!;
    expect(r.primary.key).toBe("COMPLETE_SHUTDOWN");
  });

  it("speed transporter F: Neutral Zone Engine", () => {
    const r = derivePlayerRoles({
      position: "C", games: 78, ptsPace: 95, goalsPace: 35, assistsPace: 60,
      baselineIxg82: 16, ppPtsPace82: 20, pkTimeShare: 0.04,
      xgRelTM: 7, xgaRelTM: -0.1, dps: 1.8,
      baselineHits82: 55, baselineBlocks82: 30,
      edgeOzPct: 0.51, dzPct: 0.44, edgeSpeedMaxMph: 23.1, edgeBurstsOver20: 110,
      avgTOI: 20.5, qocIndex: 70, hdFinishingDelta: 0.02,
    })!;
    // Elite transporters also raise floors — either reading is the same identity family
    expect(["NEUTRAL_ZONE_ENGINE", "FLOOR_RAISER"]).toContain(r.primary.key);
    expect([r.primary.key, r.secondary?.key]).toContain("NEUTRAL_ZONE_ENGINE");
  });

  it("playmaking winger: High-Danger Distributor", () => {
    const r = derivePlayerRoles({
      position: "W", games: 75, ptsPace: 88, goalsPace: 22, assistsPace: 66,
      baselineIxg82: 11, ppPtsPace82: 26, pkTimeShare: 0.01,
      xgRelTM: 8, xgaRelTM: 0.1, dps: 1.0,
      baselineHits82: 40, baselineBlocks82: 25,
      edgeOzPct: 0.47, dzPct: 0.42, edgeSpeedMaxMph: 21.6, edgeBurstsOver20: 40,
      avgTOI: 18, qocIndex: 62, hdFinishingDelta: 0,
    })!;
    expect(r.primary.key).toBe("HIGH_DANGER_DISTRIBUTOR");
  });

  it("trigger-man: Volume Shooter", () => {
    const r = derivePlayerRoles({
      position: "W", games: 72, ptsPace: 62, goalsPace: 38, assistsPace: 24,
      baselineIxg82: 24, ppPtsPace82: 14, pkTimeShare: 0.01,
      xgRelTM: 2, xgaRelTM: 0.15, dps: 0.8,
      baselineHits82: 55, baselineBlocks82: 20,
      edgeOzPct: 0.46, dzPct: 0.4, edgeSpeedMaxMph: 21.5, edgeBurstsOver20: 35,
      avgTOI: 17, qocIndex: 58, hdFinishingDelta: 0.01,
    })!;
    expect(["VOLUME_SHOOTER", "SLOT_HUNTER"]).toContain(r.primary.key);
  });

  it("banger with a motor: Forecheck Monster", () => {
    const r = derivePlayerRoles({
      position: "W", games: 70, ptsPace: 34, goalsPace: 15, assistsPace: 19,
      baselineIxg82: 9, ppPtsPace82: 1, pkTimeShare: 0.08,
      xgRelTM: 3, xgaRelTM: -0.3, dps: 1.4,
      baselineHits82: 200, baselineBlocks82: 45,
      edgeOzPct: 0.47, dzPct: 0.5, edgeSpeedMaxMph: 21.4, edgeBurstsOver20: 30,
      avgTOI: 13.5, qocIndex: 52, hdFinishingDelta: 0,
    })!;
    expect(r.primary.key).toBe("FORECHECK_MONSTER");
  });
});

describe("derivePlayerRoles — output contract", () => {
  it("confidence is bounded and secondary differs from primary", () => {
    const r = derivePlayerRoles({
      position: "D", games: 74, ptsPace: 84, goalsPace: 15, assistsPace: 69,
      baselineIxg82: 9, ppPtsPace82: 28, pkTimeShare: 0.02,
      xgRelTM: 11, xgaRelTM: -0.2, dps: 2.4,
      baselineHits82: 40, baselineBlocks82: 80,
      edgeOzPct: 0.52, dzPct: 0.54, edgeSpeedMaxMph: 22.7, edgeBurstsOver20: 80,
      avgTOI: 24.5, qocIndex: 68, hdFinishingDelta: 0.01,
    })!;
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    if (r.secondary) expect(r.secondary.key).not.toBe(r.primary.key);
  });

  it("every role key has complete display metadata", () => {
    for (const def of Object.values(ROLE_DEFS)) {
      expect(def.label.length).toBeGreaterThan(3);
      expect(def.blurb.length).toBeGreaterThan(20);
      expect(def.icon.length).toBeGreaterThan(0);
      expect(def.color).toContain("var(--");
    }
  });
});
