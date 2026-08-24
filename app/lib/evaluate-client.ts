// ============================================================
// CLIENT-SIDE EVALUATE API HELPER
// Replaces direct getXNAV / evaluateTrade calls in the UI.
// All math runs server-side — this just handles the fetch.
// ============================================================

import type {
  Asset, Team, XNAVResult, TradeVerdict,
  EvaluateRequest, EvaluateResponse
} from "@/app/lib/trade-types";

// Cache for navMap results. Include model version + valuation inputs so
// deployment/math changes cannot reuse stale results while the app is open.
// Prevents redundant API calls when assets haven't changed
const _navCache = new Map<string, XNAVResult>();
const XNAV_CLIENT_CACHE_VERSION = "xnav-2.2-full-input-key-v1";

function stableStringify(value: unknown): string {
  if (typeof value === "undefined") return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function assetCacheKey(a: Asset, capCeiling?: number | null): string {
  return stableStringify({
    XNAV_CLIENT_CACHE_VERSION,
    capCeiling: capCeiling ?? a.capCeiling ?? null,
    asset: a,
  });
}

/** Seed exact-input NAV results supplied by the cached league bootstrap. */
export function primeNavCache(
  assets: Asset[],
  navMap: Record<string, XNAVResult>,
  capCeiling?: number | null,
): void {
  for (const asset of assets) {
    const result = navMap[asset.id];
    if (result) _navCache.set(assetCacheKey(asset, capCeiling), result);
  }
}

// Fetch NAV values for a list of assets
// Uses cache for unchanged assets, only fetches stale/new ones
export async function fetchNavMap(
  assets: Asset[],
  signal?: AbortSignal,
  capCeiling?: number | null
): Promise<Record<string, XNAVResult>> {
  // Split into cached and uncached
  const uncached = assets.filter(a => !_navCache.has(assetCacheKey(a, capCeiling)));
  
  // Return cached results immediately if nothing new
  if (uncached.length === 0) {
    return Object.fromEntries(assets.map(a => [a.id, _navCache.get(assetCacheKey(a, capCeiling))!]));
  }

  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ assets: uncached, capCeiling } satisfies EvaluateRequest),
  });

  if (!res.ok) throw new Error(`evaluate API ${res.status}`);
  const data: EvaluateResponse = await res.json();

  // Store new results in cache
  for (const a of uncached) {
    const result = data.navMap[a.id];
    if (!result) throw new Error(`evaluate API omitted NAV for ${a.name || a.id}`);
    _navCache.set(assetCacheKey(a, capCeiling), result);
  }

  // Return merged cached + fresh
  return Object.fromEntries(assets.map(a => {
    const result = data.navMap[a.id] ?? _navCache.get(assetCacheKey(a, capCeiling));
    if (!result) throw new Error(`evaluate API omitted NAV for ${a.name || a.id}`);
    return [a.id, result];
  }));
}

// Run full trade evaluation (GM logic + verdict)
export async function fetchTradeVerdict(
  outgoing: Asset[],
  incoming: Asset[],
  homeTeam: Team | null,
  partnerTeam: Team | null,
  allHomeRoster: Asset[],
  allPartnerRoster: Asset[],
  signal?: AbortSignal,
  capCeiling?: number | null
): Promise<TradeVerdict | null> {
  if (!homeTeam || !partnerTeam) return null;

  // Only the traded assets need returned NAV values. The server still receives
  // full rosters for GM logic, but it can compute roster context internally
  // without rebuilding the whole client NAV cache on every verdict call.
  const allAssets = [...outgoing, ...incoming];
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
      capCeiling,
      runTrade:          true,
    } satisfies EvaluateRequest),
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("evaluate API not found — engine file missing");
    throw new Error(`evaluate API ${res.status}`);
  }
  const data: EvaluateResponse = await res.json();

  // Update cache with all returned nav values
  for (const a of uniqueAssets) {
    const result = data.navMap[a.id];
    if (result) _navCache.set(assetCacheKey(a, capCeiling), result);
  }

  return data.verdict ?? null;
}

// Clear nav cache (call after executing trades)
export function clearNavCache(): void {
  _navCache.clear();
}

// Get a single asset's NAV synchronously from cache (after initial load)
export function getCachedNav(asset: Asset, capCeiling?: number | null): XNAVResult | null {
  return _navCache.get(assetCacheKey(asset, capCeiling)) ?? null;
}
