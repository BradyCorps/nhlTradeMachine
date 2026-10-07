import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PlayerTimeline from "@/app/components/PlayerTimeline";
import { calculateAssetNAV, type AssetNavSource } from "@/app/lib/asset-nav";
import { contractTabAsset } from "@/app/lib/contract-tab-asset";
import { SEASON } from "@/app/lib/season-config";
import { calcNAV } from "@/app/lib/xnav-engine";
import { calcPlayerTimeline } from "@/app/lib/player-timeline";

// Fixture inputs, not live data.
const player: AssetNavSource = {
  id: "p", name: "Fixture C", position: "C", age: 28, games: 60, hasLiveStats: true,
  ptsPace: 125, xGPace: 40, defRate: 0.1, avgTOI: 20,
  baselinePtsPace: 125, baselineToiPerGame: 22.5, baselineSeasonsWeighted: 3,
  capHit: 6, yearsRemaining: 3, retainedPct: 0.5, capCeiling: 104,
  expiresThisOffseason: false, lastCapHit: 6, extensionCapHit: 9, extensionYears: 2,
};

describe("Contract tab input adapter", () => {
  it("keeps fields the old inline literal dropped", () => {
    const a = contractTabAsset(player) as any;
    for (const k of ["baselineToiPerGame", "baselineSeasonsWeighted", "retainedPct", "lastCapHit", "extensionCapHit", "extensionYears", "expiresThisOffseason"]) {
      expect(a[k], k).toBe((player as any)[k]);
    }
    expect(a.capCeiling).toBe(104);
  });

  it("current-year value equals the card's value for the same player", () => {
    const a = contractTabAsset(player);
    expect(calcNAV(a).total).toBe(calculateAssetNAV(player).total);
    expect(calcNAV(a).fmvAav).toBe(calculateAssetNAV(player).fmvAav);
  });

  it("Year 1 of the forecast equals the card value when there is no extension", () => {
    const noExt = { ...player, extensionCapHit: undefined, extensionYears: undefined };
    expect(calcPlayerTimeline(contractTabAsset(noExt))[0].nav).toBe(Math.round(calculateAssetNAV(noExt).total));
  });

  it("characterization: the timeline deliberately excludes an extension from its per-year NAV", () => {
    // player-timeline.ts clears extension fields inside its loop and prices the
    // extension years from extensionCapHit instead. The headline (calcNAV on the
    // full asset) includes it. Unchanged by this correction.
    const withExt = calcPlayerTimeline(contractTabAsset(player))[0].nav;
    expect(withExt).not.toBe(Math.round(calculateAssetNAV(player).total));
  });

  it("uses the player's own cap ceiling, and the static default only when absent", () => {
    expect(contractTabAsset({ ...player, capCeiling: 108.5 }).capCeiling).toBe(108.5);
    const { capCeiling: _omit, ...noCap } = player;
    expect(contractTabAsset(noCap).capCeiling).toBe(SEASON.capCeiling);
    expect(typeof contractTabAsset(noCap).capCeiling).toBe("number");
  });

  it("the rendered panel reflects the preserved inputs", () => {
    const html = renderToStaticMarkup(createElement(PlayerTimeline, { asset: contractTabAsset(player) }));
    const dropped = { ...player, baselineToiPerGame: undefined, baselineSeasonsWeighted: undefined, retainedPct: 0 };
    const htmlDropped = renderToStaticMarkup(createElement(PlayerTimeline, { asset: contractTabAsset(dropped) }));
    expect(html).not.toBe(htmlDropped);
    expect(html).toContain("Contract Projection");
  });

  it("the Contract tab passes the adapter, not a hand-built literal", () => {
    const src = readFileSync("app/players/page.tsx", "utf8");
    expect(src).toContain("<PlayerTimeline asset={contractTabAsset(player)} />");
    expect(src).not.toMatch(/retainedPct:\s*0,\s*\n\s*multiplier:\s*1\.0/);
  });
});
