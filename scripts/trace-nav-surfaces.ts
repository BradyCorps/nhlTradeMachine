// Before/after for the Contract tab input correction, on FIXTURES (not live data).
// Run: npx tsx scripts/trace-nav-surfaces.ts
import { calculateAssetNAV, type AssetNavSource } from "../app/lib/asset-nav";
import { contractTabAsset } from "../app/lib/contract-tab-asset";
import { calcNAV, type AssetInput } from "../app/lib/xnav-engine";
import { calcPlayerTimeline } from "../app/lib/player-timeline";

// The removed inline literal from app/players/page.tsx, reproduced verbatim.
const legacy = (p: any): AssetInput => ({
  id: p.id, name: p.name, position: p.position, age: p.age, capHit: p.capHit,
  yearsRemaining: p.yearsRemaining, ptsPace: p.ptsPace, xGPace: p.xGPace,
  defRate: p.defRate ?? 0.08, avgTOI: p.avgTOI, qocIndex: p.qocIndex,
  baselinePtsPace: p.baselinePtsPace ?? undefined, capCeiling: p.capCeiling,
  pkTimeShare: p.pkTimeShare ?? undefined, hdFinishingDelta: p.hdFinishingDelta ?? undefined,
  ops: p.ops ?? undefined, dps: p.dps ?? undefined, xgRelTM: p.xgRelTM ?? undefined,
  xgaRelTM: p.xgaRelTM ?? undefined, dzPct: p.dzPct ?? undefined, gsax: p.gsax,
  savePct: p.savePct, gamesStarted: p.gamesStarted, games: p.games ?? 40,
  hasLiveStats: p.hasLiveStats, retainedPct: 0, multiplier: 1.0,
}) as AssetInput;

const base = { hasLiveStats: true, games: 60, capCeiling: 104 };
const fixtures: AssetNavSource[] = [
  { ...base, id: "f1", name: "Star C (below baseline TOI)", position: "C", age: 28, ptsPace: 125, xGPace: 40, defRate: 0.1, avgTOI: 20, baselinePtsPace: 125, baselineToiPerGame: 22.5, baselineSeasonsWeighted: 3, capHit: 12.5, yearsRemaining: 3 },
  { ...base, id: "f2", name: "Star C (above baseline TOI)", position: "C", age: 28, ptsPace: 125, xGPace: 40, defRate: 0.1, avgTOI: 23.5, baselinePtsPace: 125, baselineToiPerGame: 22, baselineSeasonsWeighted: 3, capHit: 12.5, yearsRemaining: 3 },
  { ...base, id: "f3", name: "Winger, 50% retained", position: "RW", age: 26, ptsPace: 70, xGPace: 25, defRate: 0.1, avgTOI: 17, baselinePtsPace: 68, baselineToiPerGame: 17.5, baselineSeasonsWeighted: 3, capHit: 6, yearsRemaining: 4, retainedPct: 0.5 },
  { ...base, id: "f4", name: "D, expiring", position: "D", age: 30, ptsPace: 40, xGPace: 12, defRate: 0.09, avgTOI: 22, baselinePtsPace: 42, baselineToiPerGame: 22.5, baselineSeasonsWeighted: 3, capHit: 5, yearsRemaining: 1, expiresThisOffseason: true, lastCapHit: 5 },
  { ...base, id: "f5", name: "Complete input, no baseline extras", position: "W", age: 24, ptsPace: 55, xGPace: 20, defRate: 0.1, avgTOI: 16, capHit: 3, yearsRemaining: 2 },
];

const rows = fixtures.map((p) => {
  const card = calculateAssetNAV(p);
  const before = calcNAV(legacy(p));
  const after = calcNAV(contractTabAsset(p));
  return {
    fixture: p.name,
    cardNAV: Math.round(card.total), cardAAV: +(card.fmvAav ?? 0).toFixed(2),
    tabBefore: Math.round(before.total), tabBeforeAAV: +(before.fmvAav ?? 0).toFixed(2),
    tabAfter: Math.round(after.total), tabAfterAAV: +(after.fmvAav ?? 0).toFixed(2),
    year1After: calcPlayerTimeline(contractTabAsset(p))[0]?.nav,
  };
});
console.table(rows);
