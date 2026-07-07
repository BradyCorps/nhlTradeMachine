"use client";
// Cup Run year-N draft recap — shown instead of the 2026 Draft Night.
import React from "react";
import { createPortal } from "react-dom";
import type { Asset } from "@/app/lib/trade-types";
import type { CapDeltaMoves } from "@/app/lib/cap-delta";

export type CupDraftSummary = {
  seasonLabel: string;
  draftYear: number | null;
  retiredCount: number;
  rookieCount: number;
  depthAddedCount: number;
  breakoutCount: number;
  regressionCount: number;
  topPicks: Array<{ id: string; name: string; teamId: string; position: string; overall: number | null }>;
};

export function CupRunDraftSummaryModal({
  summary,
  onDone,
}: {
  summary: CupDraftSummary;
  onDone: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(28,20,10,0.88)", backdropFilter: "blur(4px)" }}>
      <div className="relative w-full max-w-2xl flex flex-col"
        style={{ background: "var(--ledger-card-light)", borderRadius: "2px", maxHeight: "92vh", boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>
        <div className="shrink-0" style={{ borderTop: "4px double #1c140a", borderBottom: "1px solid #b8a070", padding: "16px 20px 12px" }}>
          <div className="text-[10px] uppercase tracking-[0.4em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
            The Hockey Ledger · Cup Run Off-Season
          </div>
          <h2 className="font-black" style={{ fontSize: "1.35rem", color: "var(--ledger-ink)", lineHeight: 1.1 }}>
            {summary.draftYear ? `${summary.draftYear} Draft Complete` : "Draft Complete"}
          </h2>
          <p className="text-[11px] font-mono mt-1" style={{ color: "var(--ledger-brown)" }}>
            League rolled into {summary.seasonLabel}. Review the board, then resolve your expiring contracts.
          </p>
        </div>

        <div className="overflow-y-auto px-4 sm:px-5 py-4" style={{ flex: 1, minHeight: 0 }}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            {[
              ["Rookies", summary.rookieCount],
              ["Retired", summary.retiredCount],
              ["Depth", summary.depthAddedCount],
              ["Breakouts", summary.breakoutCount],
              ["Regressions", summary.regressionCount],
            ].map(([label, value]) => (
              <div key={label} className="px-2 py-2 text-center" style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
                <div className="text-[9px] uppercase tracking-[0.18em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>{label}</div>
                <div className="font-mono font-black text-[16px]" style={{ color: "var(--ledger-ink)" }}>{value}</div>
              </div>
            ))}
          </div>

          <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono mb-2" style={{ color: "var(--ledger-ink-faint)" }}>
            First Round Ledger
          </div>
          <div className="flex flex-col gap-1">
            {summary.topPicks.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2"
                style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
                <span className="font-mono font-black text-[12px] shrink-0 text-right"
                  style={{ width: 28, color: "var(--ledger-ink-faint)" }}>
                  {p.overall ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-[13px] truncate" style={{ color: "var(--ledger-ink)" }}>{p.name}</div>
                  <div className="font-mono text-[9px] uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
                    {p.teamId} · {p.position}
                  </div>
                </div>
              </div>
            ))}
            {summary.topPicks.length === 0 && (
              <p className="text-[11px] italic" style={{ color: "var(--ledger-brown)" }}>
                No drafted rookies were returned for this rollover.
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 px-5 py-3 flex items-center justify-between gap-3"
          style={{ borderTop: "1px solid #b8a070" }}>
          <p className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
            Drafted players have been added to their clubs on ELCs.
          </p>
          <button onClick={onDone}
            className="text-[11px] font-black uppercase tracking-[0.18em] px-5 py-2 font-mono"
            style={{ background: "var(--ledger-ink)", color: "var(--ledger-card-light)", borderRadius: "2px" }}>
            Done — Re-Sign Phase →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const buildTradeCapMoves = (
  outgoing: Asset[],
  incoming: Asset[],
): { home: CapDeltaMoves; partner: CapDeltaMoves } => ({
  home: {
    incoming: incoming.filter(a => a.position !== "Pick"),
    outgoing: outgoing.filter(a => a.position !== "Pick"),
  },
  partner: {
    incoming: outgoing.filter(a => a.position !== "Pick"),
    outgoing: incoming.filter(a => a.position !== "Pick"),
  },
});

// ============================================================
// MAIN COMPONENT
// ============================================================
