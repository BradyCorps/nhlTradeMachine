import { describe, expect, it } from "vitest";
import manifest from "@/data/gravity-calibration/2025-26/manifest.json";
import calibration from "@/data/gravity-calibration/2025-26/tier-calibration.json";
import {
  GRAVITY_V3_PUBLIC_MINIMUM_COVERAGE,
  GRAVITY_V3_PUBLIC_MINIMUM_GAMES,
  GRAVITY_V3_TIER_CALIBRATION,
} from "@/app/lib/gravity";

describe("Gravity v3 qualified-population tier calibration", () => {
  it("is pinned to the integrity-verified frozen population", () => {
    expect(calibration.schemaVersion).toBe("gravity-v3-tier-calibration-v1");
    expect(calibration.modelRelease).toBe("gravity-v3-release-a");
    expect(calibration.source.populationSha256).toBe(manifest.artifacts.populationSha256);
    expect(calibration.source.manifestPayloadSha256).toBe(manifest.manifestPayloadSha256);
    expect(GRAVITY_V3_TIER_CALIBRATION).toEqual(calibration);
  });

  it("uses the documented evidence policy and within-position scope", () => {
    expect(calibration.evidencePolicy.publicMinimumGames).toBe(GRAVITY_V3_PUBLIC_MINIMUM_GAMES);
    expect(calibration.evidencePolicy.publicMinimumCoverage).toBe(GRAVITY_V3_PUBLIC_MINIMUM_COVERAGE);
    expect(calibration.percentileScope).toBe("WITHIN_POSITION");
    expect(calibration.positions.F.qualifiedPlayers).toBe(476);
    expect(calibration.positions.D.qualifiedPlayers).toBe(239);
  });

  it("has ordered cutoffs and reconciled aggregate tier counts", () => {
    for (const position of [calibration.positions.F, calibration.positions.D]) {
      const thresholds = position.thresholds;
      expect(thresholds.supermassiveAtOrAbove).toBeGreaterThan(thresholds.starAtOrAbove);
      expect(thresholds.starAtOrAbove).toBeGreaterThan(thresholds.mainSequenceAtOrAbove);
      expect(thresholds.mainSequenceAtOrAbove).toBeGreaterThan(thresholds.satelliteAtOrAbove);
      expect(thresholds.satelliteAtOrAbove).toBeGreaterThan(thresholds.blackHoleBelow);
      expect(Object.values(position.observedTierCounts).reduce((sum, count) => sum + count, 0))
        .toBe(position.qualifiedPlayers);
    }
  });
});
