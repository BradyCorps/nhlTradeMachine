import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateAssetNAV } from "../app/lib/asset-nav";
import { buildLeagueNavMap } from "../app/lib/league-nav";
import { clearNavCache, fetchNavMap, primeNavCache } from "../app/lib/evaluate-client";
import type { Asset } from "../app/lib/trade-types";

const skater: Asset = {
  id: "skater-1",
  name: "Test Skater",
  position: "C",
  teamId: "WPG",
  age: 25,
  capHit: 5,
  yearsRemaining: 3,
  games: 82,
  ptsPace: 70,
  xGPace: 25,
  defRate: 0.1,
  avgTOI: 19,
  hasNMC: false,
  hasNTC: false,
  canRetain: true,
  retainedPct: 0,
  multiplier: 1,
};

const pick: Asset = {
  id: "pick-1",
  name: "2027 1st Round Pick",
  position: "Pick",
  teamId: "WPG",
  age: 18,
  games: 0,
  ptsPace: 0,
  defRate: 0,
  avgTOI: 0,
  round: 1,
  year: 2027,
  capHit: 0,
  yearsRemaining: 0,
  hasNMC: false,
  hasNTC: false,
  canRetain: false,
  retainedPct: 0,
  multiplier: 1,
};

describe("league NAV precompute", () => {
  beforeEach(() => {
    clearNavCache();
    vi.unstubAllGlobals();
  });

  it("builds the same keyed NAV results as the canonical asset adapter", () => {
    const capCeiling = 104;
    const navMap = buildLeagueNavMap([skater, pick], capCeiling);

    expect(navMap[skater.id]).toEqual(calculateAssetNAV(skater, capCeiling));
    expect(navMap[pick.id]).toEqual(calculateAssetNAV(pick, capCeiling));
  });

  it("primes the exact-input client cache so bootstrap does not POST the full league again", async () => {
    const capCeiling = 104;
    const navMap = buildLeagueNavMap([skater], capCeiling);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    primeNavCache([skater], navMap, capCeiling);

    await expect(fetchNavMap([skater], undefined, capCeiling)).resolves.toEqual(navMap);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
