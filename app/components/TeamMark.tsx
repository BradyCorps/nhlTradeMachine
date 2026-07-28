"use client";
// ── TeamMark — set in type, not borrowed ─────────────────────────
// Club logos were hotlinked straight from assets.nhle.com: registered marks,
// served by their owner, rendered under our brand. A three-letter abbreviation
// in the masthead face is unambiguous to any hockey fan, loads instantly, never
// 404s, and belongs to the paper.

import React from "react";

export function TeamMark({ id, size = 32 }: { id: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 inline-flex items-center justify-center font-mono font-black"
      style={{
        width: size, height: size,
        fontSize: Math.round(size * 0.34),
        letterSpacing: "0.04em",
        color: "var(--ledger-ink)",
        background: "var(--paper-inset)",
        border: "1px solid var(--ledger-rule)",
        borderRadius: 2,
      }}>
      {id}
    </span>
  );
}
