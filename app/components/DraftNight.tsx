"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { offseasonCta } from "@/app/lib/offseason-phases";
import { createPortal } from "react-dom";
import { useDialog } from "@/app/lib/use-dialog";
import {
  DRAFT_2026_ORDER,
  DRAFT_2026_PROSPECTS,
  autoCpuPicks,
  createDraftRng,
  type DraftProspect,
  type DraftResult,
} from "@/app/lib/draft-2026";

// ── Off-Season Draft Night ────────────────────────────────────────────────
// Two distinct modal modes — never both visible at once:
//
//  PICK MODE  (it's your pick): Full-focus prospect board. No draft log.
//             A compact breadcrumb shows how many picks have gone before yours.
//
//  LOG MODE   (CPU is picking / round is done): Scrollable 32-row draft log.
//             No prospect picker. "Re-roll" lives here.
//
// Nothing here mutates rosters or cap.

export default function DraftNight({
  initialSeed, homeTeamId, onDone,
}: {
  initialSeed: number;
  homeTeamId?: string | null;
  onDone: (results: DraftResult[]) => void;
}) {
  const dialog = useDialog({ open: true, label: "Draft Night" });
  const [seed, setSeed]       = useState(Math.floor(initialSeed) || 1);
  const [results, setResults] = useState<DraftResult[]>([]);
  const [board, setBoard]     = useState<DraftProspect[]>([]);
  const [query, setQuery]     = useState("");
  const randRef = useRef<() => number>(() => 0);

  useEffect(() => {
    const rand = createDraftRng(seed);
    randRef.current = rand;
    // The board is exactly the 32-prospect class for the 32-slot order — it
    // must stay whole so every slot is fillable. Already-rostered prospects
    // (the Björck-vs-Bjorck duplicate case) are deduped when results are
    // applied to the roster, not by shrinking the board here.
    const startResults: DraftResult[] = [];
    const startBoard = [...DRAFT_2026_PROSPECTS];
    autoCpuPicks(startResults, startBoard, rand, homeTeamId);
    setResults(startResults);
    setBoard(startBoard);
    setQuery("");
  }, [seed, homeTeamId]);

  const total      = DRAFT_2026_ORDER.length;
  const done       = results.length >= total;
  const currentSlot = done ? null : DRAFT_2026_ORDER[results.length];
  const onTheClock  = !done && Boolean(homeTeamId) && currentSlot?.team === homeTeamId;

  const filteredBoard = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? board.filter((p) => p.name.toLowerCase().includes(q)) : board;
  }, [board, query]);

  function pickProspect(prospect: DraftProspect) {
    if (!currentSlot) return;
    const nextResults = [...results, { ...currentSlot, prospect }];
    const nextBoard   = board.filter((p) => p !== prospect);
    autoCpuPicks(nextResults, nextBoard, randRef.current, homeTeamId);
    setResults(nextResults);
    setBoard(nextBoard);
    setQuery("");
  }

  if (typeof document === "undefined") return null;

  // ── PICK MODE ─────────────────────────────────────────────────────────────
  if (onTheClock && currentSlot) {
    return createPortal(
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
        style={{ background: "rgba(28,20,10,0.92)", backdropFilter: "blur(4px)" }}>
        <div {...dialog} className="relative w-full max-w-2xl flex flex-col"
          style={{ background: "var(--ledger-card-light)", borderRadius: "2px", maxHeight: "92vh", boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>

          {/* Pick header */}
          <div className="shrink-0" style={{ borderTop: "4px double #1c140a", borderBottom: "1px solid #b8a070", padding: "14px 20px 12px" }}>
            <div className="text-[9px] uppercase tracking-[0.4em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
              Cap & Crease · 2026 Draft Night
            </div>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-black text-[1.25rem] leading-tight" style={{ color: "var(--ledger-ice)" }}>
                  ⏰ You&apos;re on the clock
                </h2>
                <div className="font-mono font-black text-[11px] mt-0.5" style={{ color: "var(--ledger-ink-faint)" }}>
                  Pick #{currentSlot.overall}
                  {currentSlot.originalTeam !== currentSlot.team && (
                    <span className="font-normal ml-1">via {currentSlot.originalTeam}</span>
                  )}
                  <span className="mx-2" style={{ color: "var(--ledger-rule)" }}>·</span>
                  {results.length} of {total} picks made
                </div>
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter prospects…"
                className="text-[11px] font-mono px-2 py-1"
                style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px", width: 160 }}
              />
            </div>
          </div>

          {/* Prospect board — full remaining height */}
          <div className="overflow-y-auto px-4 py-3" style={{ flex: 1, minHeight: 0 }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {filteredBoard.map((p) => (
                <button key={p.rank} onClick={() => pickProspect(p)}
                  className="flex items-center gap-2.5 px-3 py-2 text-left"
                  style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
                  <span className="font-mono font-black text-[11px] shrink-0 text-right" style={{ width: 22, color: "var(--ledger-ink-faint)" }}>
                    {p.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-[13px]" style={{ color: "var(--ledger-ink)" }}>{p.name}</div>
                    <div className="font-mono text-[9px] uppercase tracking-wide mt-0.5" style={{ color: "var(--ledger-ink-faint)" }}>
                      {p.pos} · {p.club} · {p.league}
                    </div>
                  </div>
                  <div className="font-mono text-[9px] shrink-0 text-right" style={{ color: "var(--ledger-brown)" }}>
                    <div className="font-black">{p.pts}P</div>
                    <div style={{ color: "var(--ledger-rule)" }}>{p.gp}GP</div>
                  </div>
                </button>
              ))}
              {filteredBoard.length === 0 && (
                <p className="text-[11px] font-mono col-span-full py-3 text-center" style={{ color: "var(--ledger-ink-faint)" }}>
                  No prospects match &ldquo;{query}&rdquo;.
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-2.5 flex items-center justify-between gap-3"
            style={{ borderTop: "1px solid #b8a070", background: "var(--paper-inset)" }}>
            <p className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
              Select a prospect to make your pick.
            </p>
            <button onClick={() => setSeed((s) => s + 1)}
              className="text-[9px] font-black uppercase tracking-wider px-3 py-1.5 font-mono"
              style={{ background: "transparent", color: "var(--ledger-ice)", border: "1px solid var(--ledger-ice)", borderRadius: "2px" }}>
              ↻ Re-roll board
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // ── LOG MODE (CPU picking or round complete) ──────────────────────────────
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(28,20,10,0.88)", backdropFilter: "blur(4px)" }}>
      <div {...dialog} className="relative w-full max-w-3xl flex flex-col"
        style={{ background: "var(--ledger-card-light)", borderRadius: "2px", maxHeight: "92vh", boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="shrink-0" style={{ borderTop: "4px double #1c140a", borderBottom: "1px solid #b8a070", padding: "16px 24px 12px" }}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
                Cap & Crease · Off-Season
              </div>
              <h2 className="font-black" style={{ fontSize: "1.4rem", color: "var(--ledger-ink)", lineHeight: 1.1 }}>
                2026 Draft Night — First Round
              </h2>
            </div>
            <button onClick={() => setSeed((s) => s + 1)}
              className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono"
              style={{ background: "transparent", color: "var(--ledger-ice)", border: "1px solid var(--ledger-ice)", borderRadius: "2px" }}>
              ↻ Re-roll
            </button>
          </div>
        </div>

        {/* Draft log */}
        <div className="overflow-y-auto px-5 py-4" style={{ flex: 1, minHeight: 0 }}>
          <p className="text-[11px] font-mono mb-3" style={{ color: "var(--ledger-ink-faint)" }}>
            {done
              ? "First round complete — your picks stay tradeable assets."
              : "CPU teams are picking… you'll be notified when it's your turn."}
          </p>
          <div className="flex flex-col gap-1">
            {DRAFT_2026_ORDER.map((slot, i) => {
              const r       = results[i];
              const via     = slot.originalTeam !== slot.team ? ` via ${slot.originalTeam}` : "";
              const mine    = homeTeamId && slot.team === homeTeamId;
              const isCurrent = !done && i === results.length;
              return (
                <div key={slot.overall} className="flex items-center gap-3 px-3 py-1.5"
                  style={{
                    background: isCurrent ? "rgba(40,70,110,0.16)" : mine ? "rgba(40,70,110,0.10)" : "var(--paper)",
                    border: `1px solid ${isCurrent || mine ? "var(--ledger-ice)" : "var(--ledger-rule-light)"}`,
                    borderRadius: "2px",
                    opacity: !r && !isCurrent ? 0.55 : 1,
                  }}>
                  <span className="font-mono font-black text-[12px] shrink-0 text-right"
                    style={{ width: 26, color: "var(--ledger-ink-faint)" }}>
                    {slot.overall}
                  </span>
                  <span className="font-mono font-black text-[11px] shrink-0"
                    style={{ width: 64, color: mine ? "var(--ledger-ice)" : "var(--ledger-ink)" }}>
                    {slot.team}
                    <span className="font-normal" style={{ color: "var(--ledger-ink-faint)" }}>{via}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    {r?.prospect ? (
                      <>
                        <span className="font-black text-[13px]" style={{ color: "var(--ledger-ink)" }}>{r.prospect.name}</span>
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
                          {r.prospect.pos} · {r.prospect.club} ({r.prospect.league})
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-[11px] italic" style={{ color: "var(--ledger-ink-faint)" }}>
                        {isCurrent ? "on the clock…" : "—"}
                      </span>
                    )}
                  </div>
                  {r?.prospect && (
                    <span className="font-mono text-[10px] shrink-0 text-right" style={{ color: "var(--ledger-brown)" }}>
                      {r.prospect.gp}GP · {r.prospect.pts}P
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 flex items-center justify-between gap-3"
          style={{ borderTop: "1px solid #b8a070" }}>
          <p className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
            {done ? "Re-roll for a different board, or proceed to free agency." : "Watching CPU picks…"}
          </p>
          <button onClick={() => onDone(results)}
            className="text-[11px] font-black uppercase tracking-[0.18em] px-5 py-2 font-mono"
            style={{
              background: done ? "var(--ledger-ink)" : "var(--ledger-rule-light)",
              color: done ? "var(--ledger-card-light)" : "var(--ledger-ink-faint)",
              borderRadius: "2px",
              cursor: done ? "pointer" : "not-allowed",
            }}
            disabled={!done}>
            {offseasonCta("DRAFT_NIGHT")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
