import { describe, expect, it } from "vitest";
import {
  calculateAssetNAV,
  normalizeNavPosition,
  toAssetInput,
  type AssetNavSource,
} from "@/app/lib/asset-nav";
import { navSplit, stageDrift } from "@/app/lib/nav-breakdown";

const skater = (overrides: Partial<AssetNavSource> = {}): AssetNavSource => ({
  id: "skater",
  name: "Test Skater",
  position: "RW",
  age: 24,
  games: 18,
  ptsPace: 30,
  xGPace: 14,
  defRate: 0.1,
  avgTOI: 15,
  capHit: 2.5,
  yearsRemaining: 3,
  hasLiveStats: true,
  ...overrides,
});

describe("canonical raw-asset NAV boundary", () => {
  it("normalizes position and preserves every high-risk valuation input", () => {
    const input = toAssetInput(skater({
      lastCapHit: 4.25,
      expiresThisOffseason: true,
      baselinePtsPace: 62,
      baselineToiPerGame: 20.5,
      baselineSeasonsWeighted: 2.4,
      iceTimeSeconds: 123_456,
      hdFinishingDelta: -0.03,
      edgeOzPct: 0.43,
      edgeSpeedMaxMph: 23.6,
      edgeBurstsOver20: 84,
      baselineXgRel: 0.04,
      pairDriverScore: 7.5,
      retainedPct: 0.5,
      extensionCapHit: 6.25,
      extensionYears: 5,
      tradeBlockStatus: "requested",
    }), 110);

    expect(input).toEqual(expect.objectContaining({
      position: "W",
      capCeiling: 110,
      lastCapHit: 4.25,
      expiresThisOffseason: true,
      baselinePtsPace: 62,
      baselineToiPerGame: 20.5,
      baselineSeasonsWeighted: 2.4,
      iceTimeSeconds: 123_456,
      hdFinishingDelta: -0.03,
      edgeOzPct: 0.43,
      edgeSpeedMaxMph: 23.6,
      edgeBurstsOver20: 84,
      baselineXgRel: 0.04,
      pairDriverScore: 7.5,
      retainedPct: 0.5,
      extensionCapHit: 6.25,
      extensionYears: 5,
      tradeBlockStatus: "requested",
    }));
    expect(normalizeNavPosition("lw")).toBe("W");
    expect(normalizeNavPosition("Pick")).toBe("Pick");
  });

  it("books a pedigree lift to an explicit stage without changing contract or upside", () => {
    const current = skater({
      name: "Generic Prime Center",
      position: "C",
      age: 30,
      games: 18,
      ptsPace: 25,
      baselinePtsPace: undefined,
      capHit: 10,
      yearsRemaining: 4,
    });
    const generic = calculateAssetNAV(current, 110);
    const barkov = calculateAssetNAV({ ...current, id: "barkov", name: "Aleksander Barkov" }, 110);
    const floor = barkov.stages?.find((row) => row.key === "historicalFloor");
    const genericSplit = navSplit(generic.stages, generic.total);
    const barkovSplit = navSplit(barkov.stages, barkov.total);

    expect(floor?.value).toBeGreaterThan(0);
    expect(barkov.total - generic.total).toBe(floor?.value);
    expect(barkov.cap).toBe(generic.cap);
    expect(barkov.upside).toBe(generic.upside);
    expect(barkovSplit.production - genericSplit.production).toBe(floor?.value);
    expect(barkovSplit.contract).toBe(genericSplit.contract);
    expect(Math.abs(stageDrift(barkov.stages ?? [], barkov.total))).toBeLessThan(1);
  });
});
