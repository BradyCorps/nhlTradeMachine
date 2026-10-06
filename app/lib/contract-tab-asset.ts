// ── contract-tab-asset.ts ────────────────────────────────────────
//
// The valuation input for the /players Contract tab ("Contract Projection").
//
// The tab used to hand PlayerTimeline a hand-built subset of the player, which
// dropped baselineToiPerGame, baselineSeasonsWeighted, retainedPct, extension
// terms, contract status and more, and hard-coded retainedPct 0 / multiplier 1 /
// defRate 0.08. The panel's "current" NAV therefore differed from the same
// player's row and card. It now crosses the same `toAssetInput` boundary as
// `calculateAssetNAV`, so every engine input survives.
//
// Cap ceiling: the player's own `capCeiling` (the /players page stamps the live
// ceiling from /api/league/teams onto each row), else the static season
// default — exactly what the row and card use. Nothing is substituted here.
//
// Forecast transformations stay in `calcPlayerTimeline` (age curve, remaining
// term, cap, discount). Year 1 has decay 1.0, so it equals the current NAV.

import { toAssetInput, type AssetNavSource } from "@/app/lib/asset-nav";
import type { AssetInput } from "@/app/lib/xnav-engine";

export function contractTabAsset(player: AssetNavSource): AssetInput {
  return toAssetInput(player);
}
