import { calculateAssetNAV } from "@/app/lib/asset-nav";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";

/**
 * Build the canonical league-wide valuation map once, beside the cached roster.
 * Individual failures stay absent so clients can request only those misses via
 * the evaluate endpoint instead of losing the otherwise healthy bootstrap.
 */
export function buildLeagueNavMap(
  assets: Asset[],
  capCeiling?: number | null,
): Record<string, XNAVResult> {
  const navMap: Record<string, XNAVResult> = {};

  for (const asset of assets) {
    try {
      navMap[asset.id] = calculateAssetNAV(asset, capCeiling ?? undefined) as XNAVResult;
    } catch (error) {
      console.warn(
        "[league NAV] valuation skipped:",
        asset.id,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return navMap;
}
