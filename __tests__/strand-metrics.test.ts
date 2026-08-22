// ── strand-metrics.test.ts ───────────────────────────────────────
//
// The whole point of strand-metrics is that the STRAND rails and the percentile
// card can no longer disagree, because both derive from ONE function. These pin
// that function: the percentile math, the ≥10-cohort gate (no faked 50th), the
// direction handling (SUPP negates, GAA inverts), and — the headline guarantee —
// that a rail's percentile IS metricPercentile of the same raw + cohort.

import { describe, it, expect } from "vitest";
import {
  metricPercentile, buildRail, buildStrandPercentiles, STRAND_METRIC,
  type PlayerLike,
} from "@/app/lib/strand-metrics";

const cohortOf = (field: string, values: number[]): PlayerLike[] =>
  values.map(v => ({ [field]: v }));

describe("metricPercentile", () => {
  it("ranks a value against its cohort", () => {
    const c = Array.from({ length: 100 }, (_, i) => i + 1);   // 1..100
    expect(metricPercentile(50, c)).toBe(50);   // 49 below + half of the tie
    expect(metricPercentile(100, c)).toBeGreaterThanOrEqual(99);
    expect(metricPercentile(1, c)).toBeLessThanOrEqual(1);
  });

  it("returns null below the cohort floor or for a missing value", () => {
    expect(metricPercentile(5, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();   // only 9
    expect(metricPercentile(null, Array(20).fill(1))).toBeNull();
  });

  it("inverts direction when low is good (GAA)", () => {
    const gaa = [2.0, 2.4, 2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0, 4.2];
    // A 2.0 GAA is the BEST → high percentile; a 4.2 is worst → low.
    expect(metricPercentile(2.0, gaa, true)).toBeGreaterThan(90);
    expect(metricPercentile(4.2, gaa, true)).toBeLessThan(10);
  });
});

describe("buildRail", () => {
  it("SUPP negates xgaRelTM so a stingier (lower) value ranks higher", () => {
    // Cohort xgaRelTM from −1 (stingy) to +1 (leaky); our player is −0.8 (good).
    const cohort = cohortOf("xgaRelTM", [-1, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1]);
    const rail = buildRail("supp", { xgaRelTM: -0.8 }, cohort);
    expect(rail.percentile).toBeGreaterThan(70);       // near the stingy end
    expect(rail.unavailable).toBe(false);
    expect(rail.val).toBeCloseTo(rail.percentile! / 100, 9);
  });

  it("marks a rail unavailable (no faked 50th) when the input is missing", () => {
    const cohort = cohortOf("ops", Array.from({ length: 20 }, (_, i) => i));
    const rail = buildRail("ops", { ops: null }, cohort);
    expect(rail.unavailable).toBe(true);
    expect(rail.percentile).toBeNull();
    expect(rail.val).toBe(0.5);   // geometry only — greyed by the renderer
  });

  it("a rail's percentile IS metricPercentile of the same raw + cohort", () => {
    const cohort = cohortOf("ops", [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21]);
    const player = { ops: 13 };
    const rail = buildRail("ops", player, cohort);
    const direct = metricPercentile(
      STRAND_METRIC.ops.extract(player),
      cohort.map(STRAND_METRIC.ops.extract),
    );
    expect(rail.percentile).toBe(direct);
  });
});

describe("buildStrandPercentiles", () => {
  it("returns four skater rails per side and three per goalie side", () => {
    const cohort = Array.from({ length: 20 }, (_, i) => ({ ops: i, dps: i, gsax: i, savePct: 0.9 + i / 1000 }));
    const skater = buildStrandPercentiles({ ops: 10, dps: 10 }, cohort, false);
    expect(skater.off).toHaveLength(4);
    expect(skater.def).toHaveLength(4);
    const goalie = buildStrandPercentiles({ gsax: 10, savePct: 0.91 }, cohort, true);
    expect(goalie.off).toHaveLength(3);
    expect(goalie.def).toHaveLength(3);
  });
});
