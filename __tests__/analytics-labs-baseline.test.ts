// ── Phase 0: Analytics Labs production baseline ───────────────────────────
//
// These fixtures deliberately exercise the public raw-asset boundary rather
// than a copied implementation. Infrastructure work must keep these frozen
// production outputs stable until an explicitly approved analytic promotion.

import { describe, expect, it } from "vitest";
import { calculateAssetNAV, type AssetNavSource } from "@/app/lib/asset-nav";
import { rosterNavByPosition } from "@/app/lib/team-nav-split";

const asOf = "2026-09-11";
const shared = { capCeiling: 104, hasLiveStats: true, yearsRemaining: 3, capHit: 5 };

const cases: Array<{ name: string; asset: AssetNavSource; total: number }> = [
  { name: "elite-forward", total: 487, asset: { id: "labs-elite-f", name: "Labs Elite F", position: "W", age: 27, ptsPace: 120, xGPace: 42, defRate: 0.12, avgTOI: 21, qocIndex: 72, games: 82, ops: 8, dps: 2, ...shared } },
  { name: "middle-forward", total: 75, asset: { id: "labs-middle-f", name: "Labs Middle F", position: "C", age: 27, ptsPace: 48, xGPace: 15, defRate: 0.02, avgTOI: 16, qocIndex: 52, games: 75, ops: 2, dps: 1, ...shared } },
  { name: "low-sample-forward-prospect", total: 240, asset: { id: "labs-prospect-f", name: "Labs Prospect F", position: "W", age: 19, ptsPace: 30, xGPace: 8, defRate: 0, avgTOI: 14, qocIndex: 45, games: 8, ops: 0.5, dps: 0.1, draftOverall: 3, ...shared, capHit: 0.95 } },
  { name: "elite-defense", total: 282, asset: { id: "labs-elite-d", name: "Labs Elite D", position: "D", age: 26, ptsPace: 65, xGPace: 16, defRate: 0.1, avgTOI: 24, qocIndex: 75, games: 82, ops: 5, dps: 5, xgaRelTM: -0.8, corsiAgainstRel: -5, ...shared } },
  { name: "middle-defense", total: 67, asset: { id: "labs-middle-d", name: "Labs Middle D", position: "D", age: 27, ptsPace: 32, xGPace: 7, defRate: 0.03, avgTOI: 19, qocIndex: 55, games: 70, ops: 1.5, dps: 2, xgaRelTM: -0.1, corsiAgainstRel: -1, ...shared } },
  { name: "low-sample-defense", total: 8, asset: { id: "labs-low-d", name: "Labs Low D", position: "D", age: 22, ptsPace: 25, xGPace: 5, defRate: 0, avgTOI: 15, qocIndex: 50, games: 10, ops: 0.3, dps: 0.5, xgaRelTM: null, corsiAgainstRel: null, ...shared } },
  { name: "elite-goalie", total: 315, asset: { id: "labs-elite-g", name: "Labs Elite G", position: "G", age: 27, gsax: 30, games: 60, gamesStarted: 60, savePct: 0.925, ...shared } },
  { name: "tandem-goalie", total: 44, asset: { id: "labs-tandem-g", name: "Labs Tandem G", position: "G", age: 28, gsax: 8, games: 35, gamesStarted: 35, savePct: 0.915, ...shared } },
  { name: "low-sample-goalie", total: -33, asset: { id: "labs-low-g", name: "Labs Low G", position: "G", age: 23, gsax: 2, games: 8, gamesStarted: 8, savePct: 0.91, ...shared } },
];

describe("Analytics Labs Phase 0 production baseline", () => {
  it.each(cases)("keeps $name at its frozen public X-NAV output", ({ asset, total }) => {
    expect(calculateAssetNAV(asset, 104, asOf).total).toBe(total);
  });

  it("keeps representative team signed and positive-only NAV splits distinct", () => {
    const byName = Object.fromEntries(cases.map(entry => [entry.name, entry]));
    const teamOne = [byName["elite-forward"], byName["middle-defense"], byName["tandem-goalie"]];
    const teamTwo = [byName["middle-forward"], byName["low-sample-defense"], byName["low-sample-goalie"]];

    const split = (team: Array<(typeof cases)[number]>) => rosterNavByPosition(
      team.map(({ asset }) => ({ position: asset.position, nav: calculateAssetNAV(asset, 104, asOf).total })),
    );

    expect(split(teamOne)).toMatchObject({ signed: { f: 487, d: 67, g: 44, total: 598 }, f: 487, d: 67, g: 44, xnav: 598 });
    expect(split(teamTwo)).toMatchObject({ signed: { f: 75, d: 8, g: -33, total: 50 }, f: 75, d: 8, g: 0, xnav: 83 });
  });
});
