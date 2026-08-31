// ── Free Agent Board filtering ─────────────────────────────────────
// Extracted from FreeAgentBoard.tsx so the RFA/UFA split is testable without
// rendering. This is the replacement surface for the population that used to
// leak into the Trade Block panel as a "FA_POOL" team — see trade-block.ts
// and app/lib/fa-pool.ts.

import type { Asset } from "@/app/lib/trade-types";
import { isFreeAgent } from "@/app/lib/fa-pool";
import { matchesPlayerSearch } from "@/app/lib/player-search";

export type FreeAgentPosFilter = "ALL" | "C" | "W" | "D" | "G";

export function rightsStatus(p: Asset): "RFA" | "UFA" | null {
  const status = p.contractStatus ?? p.expiryStatus;
  if (status === "RFA" || status === "UFA") return status;
  if (typeof status === "string") {
    if (/rfa/i.test(status)) return "RFA";
    if (/ufa/i.test(status)) return "UFA";
  }
  return null;
}

export function splitFreeAgents(
  players: Asset[],
  { posFilter, search }: { posFilter: FreeAgentPosFilter; search: string },
): { rfa: Asset[]; ufa: Asset[] } {
  const pool = players
    .filter(isFreeAgent)
    .filter(p => posFilter === "ALL" || p.position === posFilter)
    .filter(p => matchesPlayerSearch(p, search));
  const byCapHit = (a: Asset, b: Asset) => (b.lastCapHit ?? b.capHit ?? 0) - (a.lastCapHit ?? a.capHit ?? 0);
  return {
    // "Unrestricted" bucket also holds an unknown/missing rights status —
    // an unsigned player with no recorded class still belongs somewhere on
    // the board, and treating unknown as restricted would overstate a
    // club's retained rights.
    rfa: pool.filter(p => rightsStatus(p) === "RFA").sort(byCapHit),
    ufa: pool.filter(p => rightsStatus(p) !== "RFA").sort(byCapHit),
  };
}
