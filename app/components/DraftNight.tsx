"use client";

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { runDraftNight, type DraftResult } from "@/app/lib/draft-2026";

// ── Off-Season Draft Night ────────────────────────────────────────────────
// Display-only projection of the 2026 first round. Walks the real pick order
// (trades baked in) and fills the ranked prospect board best-available with a
// little seeded reach/slide. "Re-roll" re-seeds for a different board; "Done"
// proceeds to the Re-Sign phase. Nothing here mutates rosters or cap.

export default function DraftNight({
  initialSeed, homeTeamId, onDone,
}: {
  initialSeed: number;
  homeTeamId?: string | null;
  onDone: () => void;
}) {
  const [seed, setSeed] = useState(Math.floor(initialSeed) || 1);
  const results: DraftResult[] = useMemo(() => runDraftNight(seed), [seed]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(28,20,10,0.88)", backdropFilter: "blur(4px)" }}>
      <div className="relative w-full max-w-3xl flex flex-col"
        style={{ background: "var(--ledger-card-light)", borderRadius: "2px", maxHeight: "92vh", boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="shrink-0" style={{ borderTop: "4px double #1c140a", borderBottom: "1px solid #b8a070", padding: "16px 24px 12px" }}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
                The Hockey Ledger · Off-Season
              </div>
              <h2 className="font-black" style={{ fontSize: "1.4rem", color: "var(--ledger-ink)", lineHeight: 1.1 }}>
                2026 Draft Night — First Round
              </h2>
            </div>
            <button onClick={() => setSeed((s) => s + 1)}
              className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono"
              style={{ background: "transparent", color: "var(--ledger-navy)", border: "1px solid var(--ledger-navy)", borderRadius: "2px" }}>
              ↻ Re-roll
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4" style={{ flex: 1, minHeight: 0 }}>
          <p className="text-[11px] font-mono mb-3" style={{ color: "var(--ledger-ink-faint)" }}>
            Projected best-available board. Pick order reflects real trades.
            This is a projection only — your picks stay tradeable assets.
          </p>
          <div className="flex flex-col gap-1">
            {results.map((r) => {
              const via = r.originalTeam !== r.team ? ` via ${r.originalTeam}` : "";
              const mine = homeTeamId && r.team === homeTeamId;
              return (
                <div key={r.overall} className="flex items-center gap-3 px-3 py-1.5"
                  style={{
                    background: mine ? "rgba(40,70,110,0.10)" : "var(--paper)",
                    border: `1px solid ${mine ? "var(--ledger-navy)" : "var(--ledger-rule-light)"}`,
                    borderRadius: "2px",
                  }}>
                  <span className="font-mono font-black text-[12px] shrink-0 text-right" style={{ width: 26, color: "var(--ledger-ink-faint)" }}>
                    {r.overall}
                  </span>
                  <span className="font-mono font-black text-[11px] shrink-0" style={{ width: 64, color: mine ? "var(--ledger-navy)" : "var(--ledger-ink)" }}>
                    {r.team}<span className="font-normal" style={{ color: "var(--ledger-ink-faint)" }}>{via}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-black text-[13px]" style={{ color: "var(--ledger-ink)" }}>{r.prospect.name}</span>
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
                      {r.prospect.pos} · {r.prospect.club} ({r.prospect.league})
                    </span>
                  </div>
                  <span className="font-mono text-[10px] shrink-0 text-right" style={{ color: "var(--ledger-brown)" }}>
                    {r.prospect.gp}GP · {r.prospect.pts}P
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid #b8a070" }}>
          <p className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
            Re-roll for a different board, or proceed to free agency.
          </p>
          <button onClick={onDone}
            className="text-[11px] font-black uppercase tracking-[0.18em] px-5 py-2 font-mono"
            style={{ background: "var(--ledger-ink)", color: "var(--ledger-card-light)", borderRadius: "2px" }}>
            Done — Proceed to Re-Sign →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
