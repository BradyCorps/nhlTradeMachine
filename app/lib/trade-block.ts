// ── Trade Block filtering ──────────────────────────────────────────
// Extracted from TradeBlockPanel.tsx so the filter pipeline is testable
// without rendering. The one rule worth a regression test: a free agent
// (teamId FA_POOL) must never pass through here. FA_POOL is not a club — see
// app/lib/fa-pool.ts — and this panel's whole job is picking a trade
// PARTNER, which an unsigned player cannot be.

import type { Asset } from "@/app/lib/trade-types";
import { isFreeAgent } from "@/app/lib/fa-pool";

export type TradeBlockStatusFilter = "available_requested" | "all";
export type TradeBlockPosFilter = "ALL" | "C" | "W" | "D" | "G";

// Computer-determined sell candidates — the "what teams could give up" half of
// the trade block. Classic availability profile: veteran on an expiring-ish deal,
// on a team selling (Rebuilding/Tanking/Retooling), real cap hit, not admin-flagged.
export function isAutoAvailable(p: Asset, phase: string | undefined): boolean {
  if (p.tradeBlockStatus) return false;
  if (p.position === "Pick") return false;
  const selling = phase === "Rebuilding" || phase === "Tanking" || phase === "Retooling";
  return selling
    && (p.age ?? 0) >= 29
    && (p.yearsRemaining ?? 99) <= 2
    && (p.capHit ?? 0) >= 3;
}

export function filterTradeBlockPlayers(
  players: Asset[],
  teamPhaseById: Map<string, string | undefined>,
  { posFilter, showStatus, search }: {
    posFilter: TradeBlockPosFilter;
    showStatus: TradeBlockStatusFilter;
    search: string;
  },
): Asset[] {
  const statusSet = showStatus === "available_requested"
    ? new Set(["requested", "available"])
    : new Set(["requested", "available", "untouchable"]);

  return players
    .filter(p => p.position !== "Pick")
    .filter(p => !isFreeAgent(p))
    .filter(p => statusSet.has(p.tradeBlockStatus ?? "")
      || isAutoAvailable(p, teamPhaseById.get(p.teamId)))
    .filter(p => posFilter === "ALL" || p.position === posFilter)
    .filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase())
      || p.teamId.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const rank = (s: string | null | undefined) =>
        s === "requested" ? 0 : s === "available" ? 1 : s === "untouchable" ? 2 : 3;
      const r = rank(a.tradeBlockStatus) - rank(b.tradeBlockStatus);
      if (r !== 0) return r;
      return (b.capHit ?? 0) - (a.capHit ?? 0);
    });
}

export function tradeBlockCounts(players: Asset[]): { requested: number; available: number } {
  return {
    requested: players.filter(p => !isFreeAgent(p) && p.tradeBlockStatus === "requested").length,
    available: players.filter(p => !isFreeAgent(p) && p.tradeBlockStatus === "available").length,
  };
}
