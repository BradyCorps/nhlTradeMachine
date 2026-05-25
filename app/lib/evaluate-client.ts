// ============================================================
// CLIENT-SIDE EVALUATE API HELPER
// Replaces direct getXNAV / evaluateTrade calls in the UI.
// All math runs server-side — this just handles the fetch.
// ============================================================

import type {
  Asset, Team, XNAVResult, TradeVerdict,
  EvaluateRequest, EvaluateResponse
} from "@/app/lib/trade-types";

// Cache for navMap results — keyed by a hash of the asset IDs + retainedPct
// Prevents redundant API calls when assets haven't changed
const _navCache = new Map<string, XNAVResult>();

function assetCacheKey(a: Asset): string {
  return `${a.id}:${a.retainedPct ?? 0}`;
}

// Fetch NAV values for a list of assets
// Uses cache for unchanged assets, only fetches stale/new ones
export async function fetchNavMap(
  assets: Asset[],
  signal?: AbortSignal
): Promise<Record<string, XNAVResult>> {
  // Split into cached and uncached
  const uncached = assets.filter(a => !_navCache.has(assetCacheKey(a)));
  
  // Return cached results immediately if nothing new
  if (uncached.length === 0) {
    return Object.fromEntries(assets.map(a => [a.id, _navCache.get(assetCacheKey(a))!]));
  }

  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ assets: uncached } satisfies EvaluateRequest),
  });

  if (!res.ok) throw new Error(`evaluate API ${res.status}`);
  const data: EvaluateResponse = await res.json();

  // Store new results in cache
  for (const a of uncached) {
    const result = data.navMap[a.id];
    if (result) _navCache.set(assetCacheKey(a), result);
  }

  // Return merged cached + fresh
  return Object.fromEntries(
    assets.map(a => [a.id, data.navMap[a.id] ?? _navCache.get(assetCacheKey(a)) ?? {
      total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0
    }])
  );
}

// Run full trade evaluation (GM logic + verdict)
export async function fetchTradeVerdict(
  outgoing: Asset[],
  incoming: Asset[],
  homeTeam: Team | null,
  partnerTeam: Team | null,
  allHomeRoster: Asset[],
  allPartnerRoster: Asset[],
  signal?: AbortSignal
): Promise<TradeVerdict | null> {
  if (!homeTeam || !partnerTeam) return null;

  // All assets in one call — nav + verdict together
  const allAssets = [...outgoing, ...incoming, ...allHomeRoster, ...allPartnerRoster];
  const uniqueAssets = Array.from(new Map(allAssets.map(a => [a.id, a])).values());

  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      assets:            uniqueAssets,
      tradeOutgoing:     outgoing,
      tradeIncoming:     incoming,
      homeTeam,
      partnerTeam,
      allHomeRoster,
      allPartnerRoster,
      runTrade:          true,
    } satisfies EvaluateRequest),
  });

  if (!res.ok) throw new Error(`evaluate API ${res.status}`);
  const data: EvaluateResponse = await res.json();

  // Update cache with all returned nav values
  for (const a of uniqueAssets) {
    const result = data.navMap[a.id];
    if (result) _navCache.set(assetCacheKey(a), result);
  }

  return data.verdict ?? null;
}

// Clear nav cache (call after executing trades)
export function clearNavCache(): void {
  _navCache.clear();
}

// Get a single asset's NAV synchronously from cache (after initial load)
export function getCachedNav(asset: Asset): XNAVResult | null {
  return _navCache.get(assetCacheKey(asset)) ?? null;
}