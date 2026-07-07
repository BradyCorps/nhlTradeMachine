import { describe, expect, it } from "vitest";
import { computeTeamEdgeProfile } from "../app/lib/team-edge-profile";
import type { Asset } from "../app/lib/trade-types";

const baseAsset = (partial: Partial<Asset>): Asset => ({
  id: partial.id ?? "p",
  teamId: "WPG",
  name: partial.name ?? "Player",
  position: partial.position ?? "C",
  age: 25,
  games: partial.games ?? 10,
  ptsPace: 0,
  defRate: 0,
  avgTOI: 0,
  capHit: 1,
  yearsRemaining: 1,
  hasNMC: false,
  hasNTC: false,
  canRetain: true,
  retainedPct: 0,
  multiplier: 1,
  ...partial,
});

describe("computeTeamEdgeProfile", () => {
  it("aggregates skater EDGE zone-time and speed signals", () => {
    const profile = computeTeamEdgeProfile([
      baseAsset({
        id: "1",
        games: 20,
        edgeOzPct: 0.5,
        edgeOzPercentile: 0.8,
        edgeSpeedMaxMph: 23.4,
        edgeBurstsOver20: 180,
        hdFinishingDelta: -0.02,
      }),
      baseAsset({
        id: "2",
        games: 10,
        edgeOzPct: 0.4,
        edgeOzPercentile: 0.6,
        edgeSpeedMaxMph: 22.2,
        edgeBurstsOver20: 120,
        hdFinishingDelta: 0.04,
      }),
      baseAsset({ id: "3", position: "G", edgeOzPct: 0.9, edgeSpeedMaxMph: 25 }),
    ]);

    expect(profile).not.toBeNull();
    expect(profile?.sampleSize).toBe(2);
    expect(profile?.ozPct).toBeCloseTo(0.467, 3);
    expect(profile?.ozPercentile).toBeCloseTo(0.7, 3);
    expect(profile?.avgSpeedMaxMph).toBeCloseTo(22.8, 1);
    expect(profile?.fastestSpeedMph).toBeCloseTo(23.4, 1);
    expect(profile?.burstsOver20PerPlayer).toBe(150);
    expect(profile?.hdFinishingDelta).toBeCloseTo(0.01, 3);
  });

  it("returns null when a roster has no EDGE sample", () => {
    expect(computeTeamEdgeProfile([baseAsset({ id: "1" })])).toBeNull();
  });
});
