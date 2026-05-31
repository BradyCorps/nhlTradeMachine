"use client";
// ── TugBar — visual NAV surplus/deficit indicator ─────────────
import React from "react";
function clamp(n: number, mn: number, mx: number) { return Math.min(mx, Math.max(mn, n)); }
const fmt = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));

function TugBar({ homeNetGain, navA, navB }: { homeNetGain: number; navA: number; navB: number }) {
  const total = Math.max(navA + navB, 1);
  const leftPct = clamp((navA / total) * 100, 5, 95);

  return (
    <div className="flex flex-col gap-1">
      {/* Home Net Gain — centered above the bar */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-2xs uppercase tracking-[0.35em] font-black text-ledger-ink-faint font-mono">
          Home Net Gain
        </span>
        <span className={`text-xl font-black font-mono tabular-nums transition-colors duration-500 ${Math.abs(homeNetGain) < 5 ? "text-sky-400" : homeNetGain > 0 ? "text-emerald-400" : "text-rose-500"}`}>
          {fmt(homeNetGain, 1)}
        </span>
        <span className="text-2xs font-bold text-ledger-ink-faint">NAV</span>
      </div>
      <div className="w-full h-9 border rounded-2xl relative overflow-hidden flex items-center shadow-inner">
        <div className="absolute inset-0 flex">
          <div className="h-full bg-rose-500/8 transition-all duration-700 ease-out" style={{ width: `${leftPct}%` }} />
          <div className="h-full bg-emerald-500/8 transition-all duration-700 ease-out flex-1" />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 h-full w-px bg-zinc-700/50" />
        <div className="z-10 w-full flex justify-between px-3 sm:px-5 font-black text-2xs uppercase tracking-[0.3em] text-zinc-700">
          <span className={`hidden sm:inline ${homeNetGain < -5 ? "text-rose-500" : ""}`}>Outgoing Value</span>
          <span className={`sm:hidden ${homeNetGain < -5 ? "text-rose-500" : ""}`}>OUT</span>
          <span className="bg-zinc-950 text-zinc-300 px-3 py-1 rounded-lg border border-zinc-800 font-mono text-2xs tracking-tight">
            {navA.toFixed(0)} ←→ {navB.toFixed(0)} NAV
          </span>
          <span className={`hidden sm:inline ${homeNetGain > 5 ? "text-emerald-400" : ""}`}>Incoming Value</span>
          <span className={`sm:hidden ${homeNetGain > 5 ? "text-emerald-400" : ""}`}>IN</span>
        </div>
      </div>
    </div>
  );
}


export default TugBar;