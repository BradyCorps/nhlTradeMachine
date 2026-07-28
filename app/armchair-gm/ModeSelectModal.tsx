"use client";
// ── Mode select — asked BEFORE the offseason, not after ──────────
//
// The Cup Run used to start from the trade bench, which meant the offseason had
// already been played: the draft, every re-signing, every offer sheet. Starting
// a run resets the league to its entry baseline (it must — otherwise year one
// begins on a league someone already changed), so all of that work was thrown
// away and had to be done again.
//
// Asking first costs one click and removes the duplicate offseason entirely.

import React from "react";
import { createPortal } from "react-dom";
import type { Team } from "@/app/lib/trade-types";
import { GAME_MODES, type GameMode } from "@/app/lib/game-mode";

export function ModeSelectModal({
  team, onChoose,
}: {
  team: Team;
  onChoose: (mode: GameMode) => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      style={{ background: "rgba(28,20,10,0.88)", backdropFilter: "blur(4px)" }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-select-title"
        className="w-full max-w-lg"
        style={{ background: "var(--ledger-card-light)", borderRadius: "2px", boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>

        <div style={{ borderTop: "4px double #1c140a", borderBottom: "1px solid #b8a070", padding: "16px 20px 12px" }}>
          <div className="text-[10px] uppercase tracking-[0.4em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
            The Hockey Ledger · Armchair GM
          </div>
          <h2 id="mode-select-title" className="font-black" style={{ fontSize: "1.35rem", color: "var(--ledger-ink)", lineHeight: 1.1 }}>
            {team.name} — Choose Your Term
          </h2>
          <p className="text-[11px] font-mono mt-1.5" style={{ color: "var(--ledger-brown)" }}>
            Decide before the draft. Both modes start at the {GAME_MODES.SINGLE.startsAt} offseason.
          </p>
        </div>

        <ul role="list" className="flex flex-col gap-2 p-4" style={{ listStyle: "none", margin: 0 }}>
          {(Object.keys(GAME_MODES) as GameMode[]).map(key => {
            const m = GAME_MODES[key];
            return (
              <li key={key}>
                <button
                  onClick={() => onChoose(key)}
                  className="tap-target w-full text-left px-4 py-3"
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--ledger-rule)",
                    borderRadius: "2px",
                    cursor: "pointer",
                  }}>
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="font-black text-[14px]" style={{ color: "var(--ledger-ink)" }}>
                      {m.label}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: "var(--ledger-ink-faint)" }}>
                      {m.length}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono mt-1" style={{ color: "var(--ledger-brown)" }}>
                    {m.description}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
