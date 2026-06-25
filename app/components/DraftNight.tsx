"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DRAFT_2026_ORDER,
  DRAFT_2026_PROSPECTS,
  autoCpuPicks,
  createDraftRng,
  type DraftProspect,
  type DraftResult,
} from "@/app/lib/draft-2026";

// ── Off-Season Draft Night ────────────────────────────────────────────────
// Interactive projection of the 2026 first round. CPU teams pick best-available
// (with a little seeded reach/slide); when one of YOUR picks comes up you're put
// on the clock and choose from the remaining board. "Re-roll" re-seeds the CPU
// board and restarts; "Done" proceeds to the Re-Sign phase. Display-only —
// nothing here mutates rosters or cap.

export default function DraftNight({
  initialSeed, homeTeamId, onDone,
}: {
  initialSeed: number;
  homeTeamId?: string | null;
  onDone: () => void;
}) {
  const [seed, setSeed] = useState(Math.floor(initialSeed) || 1);
  const [results, setResults] = useState<DraftResult[]>([]);
  const [board, setBoard] = useState<DraftProspect[]>([]);
  const [query, setQuery] = useState("");
  const randRef = useRef<() => number>(() => 0);

  // (Re)start the draft whenever the seed or the GM's team changes: seed a fresh
  // RNG and auto-run CPU picks up to the GM's first slot.
  useEffect(() => {
    const rand = createDraftRng(seed);
    randRef.current = rand;
    const startResults: DraftResult[] = [];
    const startBoard = [...DRAFT_2026_PROSPECTS];
    autoCpuPicks(startResults, startBoard, rand, homeTeamId);
    setResults(startResults);
    setBoard(startBoard);
    setQuery("");
  }, [seed, homeTeamId]);

  const total = DRAFT_2026_ORDER.length;
  const done = results.length >= total;
  const currentSlot = done ? null : DRAFT_2026_ORDER[results.length];
  const onTheClock = !done && Boolean(homeTeamId) && currentSlot?.team === homeTeamId;

  const filteredBoard = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? board.filter((p) => p.name.toLowerCase().includes(q)) : board;
  }, [board, query]);

  function pickProspect(prospect: DraftProspect) {
    if (!currentSlot) return;
    const nextResults = [...results, { ...currentSlot, prospect }];
    const nextBoard = board.filter((p) => p !== prospect);
    autoCpuPicks(nextResults, nextBoard, randRef.current, homeTeamId);
    setResults(nextResults);
    setBoard(nextBoard);
    setQuery("");
  }

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

        {/* On the clock — pick from the remaining board */}
        {onTheClock && currentSlot && (
          <div className="shrink-0 px-5 py-3" style={{ background: "rgba(40,70,110,0.08)", borderBottom: "1px solid #b8a070" }}>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <div className="font-black text-[13px]" style={{ color: "var(--ledger-navy)" }}>
                ⏰ You&apos;re on the clock — Pick #{currentSlot.overall}
                {currentSlot.originalTeam !== currentSlot.team && (
                  <span className="font-mono font-normal text-[10px] ml-1" style={{ color: "var(--ledger-ink-faint)" }}>
                    via {currentSlot.originalTeam}
                  </span>
                )}
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter prospects…"
                className="text-[11px] font-mono px-2 py-1"
                style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px", width: 160 }}
              />
            </div>
            <div className="overflow-y-auto pr-1" style={{ maxHeight: "34vh" }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {filteredBoard.map((p) => (
                  <button key={p.rank} onClick={() => pickProspect(p)}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-left"
                    style={{ background: "var(--ledger-card-light)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
                    <span className="font-mono font-black text-[11px] shrink-0 text-right" style={{ width: 22, color: "var(--ledger-ink-faint)" }}>
                      {p.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-black text-[12px]" style={{ color: "var(--ledger-ink)" }}>{p.name}</span>
                      <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
                        {p.pos} · {p.club}
                      </span>
                    </div>
                    <span className="font-mono text-[9px] shrink-0" style={{ color: "var(--ledger-brown)" }}>
                      {p.pts}P
                    </span>
                  </button>
                ))}
                {filteredBoard.length === 0 && (
                  <p className="text-[11px] font-mono col-span-full py-2" style={{ color: "var(--ledger-ink-faint)" }}>
                    No prospects match “{query}”.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Draft board — running log */}
        <div className="overflow-y-auto px-5 py-4" style={{ flex: 1, minHeight: 0 }}>
          <p className="text-[11px] font-mono mb-3" style={{ color: "var(--ledger-ink-faint)" }}>
            {onTheClock
              ? "Pick a prospect above to make your selection."
              : done
                ? "First round complete — your picks stay tradeable assets."
                : "CPU teams are picking… your picks stay tradeable assets."}
          </p>
          <div className="flex flex-col gap-1">
            {DRAFT_2026_ORDER.map((slot, i) => {
              const r = results[i];
              const via = slot.originalTeam !== slot.team ? ` via ${slot.originalTeam}` : "";
              const mine = homeTeamId && slot.team === homeTeamId;
              const isCurrent = !done && i === results.length;
              return (
                <div key={slot.overall} className="flex items-center gap-3 px-3 py-1.5"
                  style={{
                    background: isCurrent ? "rgba(40,70,110,0.16)" : mine ? "rgba(40,70,110,0.10)" : "var(--paper)",
                    border: `1px solid ${isCurrent || mine ? "var(--ledger-navy)" : "var(--ledger-rule-light)"}`,
                    borderRadius: "2px",
                    opacity: !r && !isCurrent ? 0.55 : 1,
                  }}>
                  <span className="font-mono font-black text-[12px] shrink-0 text-right" style={{ width: 26, color: "var(--ledger-ink-faint)" }}>
                    {slot.overall}
                  </span>
                  <span className="font-mono font-black text-[11px] shrink-0" style={{ width: 64, color: mine ? "var(--ledger-navy)" : "var(--ledger-ink)" }}>
                    {slot.team}<span className="font-normal" style={{ color: "var(--ledger-ink-faint)" }}>{via}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    {r ? (
                      <>
                        <span className="font-black text-[13px]" style={{ color: "var(--ledger-ink)" }}>{r.prospect.name}</span>
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
                          {r.prospect.pos} · {r.prospect.club} ({r.prospect.league})
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-[11px] italic" style={{ color: "var(--ledger-ink-faint)" }}>
                        {isCurrent ? (mine ? "on the clock — your pick" : "on the clock…") : "—"}
                      </span>
                    )}
                  </div>
                  {r && (
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
        <div className="shrink-0 px-5 py-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid #b8a070" }}>
          <p className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
            {done ? "Re-roll for a different board, or proceed to free agency." : "Make your picks to finish the round."}
          </p>
          <button onClick={onDone}
            className="text-[11px] font-black uppercase tracking-[0.18em] px-5 py-2 font-mono"
            style={{
              background: done ? "var(--ledger-ink)" : "var(--ledger-rule-light)",
              color: done ? "var(--ledger-card-light)" : "var(--ledger-ink-faint)",
              borderRadius: "2px",
              cursor: done ? "pointer" : "not-allowed",
            }}
            disabled={!done}>
            Done — Proceed to Re-Sign →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
