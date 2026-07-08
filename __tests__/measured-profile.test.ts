import { describe, expect, it } from "vitest";
import { computeMeasuredProfile } from "../app/lib/measured-profile";
import type { Asset } from "../app/lib/trade-types";

const skater = (over: Partial<Asset> = {}): Asset => ({
  id: "1", teamId: "WPG", name: "Test", position: "C", age: 25, games: 78,
  ptsPace: 55, defRate: 0.1, avgTOI: 17, capHit: 5, yearsRemaining: 3,
  hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0,
  multiplier: 1, contractStatus: "SIGNED", expiresThisOffseason: false, hasLiveStats: true,
  ...over,
} as Asset);

const dim = (a: Asset, key: string) =>
  computeMeasuredProfile(a).dimensions.find(d => d.key === key)!;

describe("computeMeasuredProfile", () => {
  it("skips picks and goalies", () => {
    expect(computeMeasuredProfile(skater({ position: "Pick" })).isSkater).toBe(false);
    expect(computeMeasuredProfile(skater({ position: "G" })).isSkater).toBe(false);
  });

  it("scores production and ice time as percentiles vs the position band", () => {
    const elite = dim(skater({ ptsPace: 90, avgTOI: 21 }), "production");
    const depth = dim(skater({ ptsPace: 18, avgTOI: 11 }), "production");
    expect(elite.pct).toBeGreaterThan(depth.pct);
    expect(elite.pct).toBeGreaterThan(90);
    expect(dim(skater({ avgTOI: 21 }), "opportunity").pct).toBeGreaterThan(
      dim(skater({ avgTOI: 12 }), "opportunity").pct);
  });

  it("greys out burst and finishing when there is no EDGE sample — never invents", () => {
    const p = computeMeasuredProfile(skater()); // no edge fields
    const burst = p.dimensions.find(d => d.key === "burst")!;
    const finishing = p.dimensions.find(d => d.key === "finishing")!;
    expect(burst.hasSample).toBe(false);
    expect(burst.rawLabel).toContain("no EDGE sample");
    expect(finishing.hasSample).toBe(false);
  });

  it("reads EDGE burst as a percentile with the raw value", () => {
    const explosive = dim(skater({ edgeBurstsOver20: 45, edgeSpeedMaxMph: 23.2 }), "burst");
    expect(explosive.hasSample).toBe(true);
    expect(explosive.edge).toBe(true);
    expect(explosive.pct).toBeGreaterThan(70);
    expect(explosive.rawLabel).toContain("45 bursts");
    expect(explosive.rawLabel).toContain("23.2 mph");
  });

  it("frames finishing as luck: cold = bounce-back (good), hot = cool-off (warn)", () => {
    const cold = dim(skater({ hdFinishingDelta: -0.04 }), "finishing");
    const hot = dim(skater({ hdFinishingDelta: 0.05 }), "finishing");
    expect(cold.tone).toBe("good");
    expect(cold.note).toBe("bounce-back");
    expect(hot.tone).toBe("warn");
    expect(hot.note).toBe("running hot");
    expect(cold.pct).toBeGreaterThan(hot.pct); // cold ranks higher on the bounce-back axis
  });

  it("credits draft/NHLe pedigree and flags none for the undrafted", () => {
    const bluechip = dim(skater({ age: 20, draftOverall: 3, prospectPtsPace: 60 }), "pedigree");
    const undrafted = dim(skater({ age: 20, draftOverall: null, prospectPtsPace: 0 }), "pedigree");
    expect(bluechip.hasSample).toBe(true);
    expect(bluechip.pct).toBeGreaterThan(undrafted.pct);
    expect(undrafted.hasSample).toBe(false);
  });
});
