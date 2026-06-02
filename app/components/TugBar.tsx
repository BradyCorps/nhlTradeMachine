"use client";
// ── TugBar — visual NAV surplus/deficit indicator ─────────────
import React from "react";
function clamp(n: number, mn: number, mx: number) { return Math.min(mx, Math.max(mn, n)); }
const fmt = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));

interface TugBarProps {
  homeNetGain: number; // compressed NAV delta
  navA: number;        // linear outgoing NAV
  navB: number;        // linear incoming NAV
  cNavA?: number;      // compressed outgoing (undefined = no compression)
  cNavB?: number;      // compressed incoming
}

function TugBar({ homeNetGain, navA, navB, cNavA, cNavB }: TugBarProps) {
  const total = Math.max((cNavA ?? navA) + (cNavB ?? navB), 1);
  const leftPct = clamp(((cNavA ?? navA) / total) * 100, 5, 95);

  // Show compression note when the slot penalty meaningfully reduces a package
  const deltaA = navA - (cNavA ?? navA);
  const deltaB = navB - (cNavB ?? navB);
  const showCompA = deltaA > 40 && blocks_ge_3(navA, cNavA);
  const showCompB = deltaB > 40 && blocks_ge_3(navB, cNavB);

  // Helper: compression is only meaningful when the package has 3+ assets
  // (single and 2-asset trades don't trigger the slot penalty visually)
  // We infer this from the delta: decay alone on 2 assets gives < 40 NAV delta
  function blocks_ge_3(linear: number, compressed: number | undefined): boolean {
    if (compressed === undefined) return false;
    const delta = linear - compressed;
    // With δ=0.60 and μ=50: 2 assets → max delta ≈ 0.4×value₂ + 50
    // Only show if delta is large enough to indicate 3+ assets
    return delta > 40;
  }

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

      {/* Main bar */}
      <div className="w-full h-9 border rounded-2xl relative overflow-hidden flex items-center shadow-inner">
        <div className="absolute inset-0 flex">
          <div className="h-full bg-rose-500/20 transition-all duration-700 ease-out" style={{ width: `${leftPct}%` }} />
          <div className="h-full bg-emerald-500/15 transition-all duration-700 ease-out flex-1" />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 h-full w-px bg-zinc-700/50" />
        <div className="z-10 w-full flex justify-between px-3 sm:px-5 font-black text-2xs uppercase tracking-[0.3em] text-zinc-700">
          <span className={`hidden sm:inline ${homeNetGain < -5 ? "text-rose-500" : ""}`}>Outgoing Value</span>
          <span className={`sm:hidden ${homeNetGain < -5 ? "text-rose-500" : ""}`}>OUT</span>
          <span className="bg-zinc-950 text-zinc-300 px-3 py-1 rounded-lg border border-zinc-800 font-mono text-2xs tracking-tight">
            {(cNavA ?? navA).toFixed(0)} ←→ {(cNavB ?? navB).toFixed(0)} NAV
          </span>
          <span className={`hidden sm:inline ${homeNetGain > 5 ? "text-emerald-400" : ""}`}>Incoming Value</span>
          <span className={`sm:hidden ${homeNetGain > 5 ? "text-emerald-400" : ""}`}>IN</span>
        </div>
      </div>

      {/* Compression note — passive, informational, only when slot penalty is material */}
      {(showCompA || showCompB) && (
        <div className="flex justify-between px-1 mt-0.5" style={{ fontSize: "10px", color: "var(--ledger-ink-faint)", fontFamily: "Courier Prime, monospace" }}>
          {/* Left side — outgoing compression */}
          <span style={{ opacity: showCompA ? 0.75 : 0 }}>
            {showCompA && (
              <>
                <span style={{ color: "var(--ledger-ink-body)", fontWeight: 900 }}>OUT</span>
                {" "}linear {navA.toFixed(0)} → <span style={{ color: "var(--ledger-red)", fontWeight: 900 }}>{(cNavA ?? navA).toFixed(0)}</span>
                {" "}(−{deltaA.toFixed(0)} slot penalty)
              </>
            )}
          </span>
          {/* Right side — incoming compression */}
          <span style={{ opacity: showCompB ? 0.75 : 0, textAlign: "right" }}>
            {showCompB && (
              <>
                <span style={{ color: "var(--ledger-ink-body)", fontWeight: 900 }}>IN</span>
                {" "}linear {navB.toFixed(0)} → <span style={{ color: "var(--ledger-red)", fontWeight: 900 }}>{(cNavB ?? navB).toFixed(0)}</span>
                {" "}(−{deltaB.toFixed(0)} slot penalty)
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export default TugBar;