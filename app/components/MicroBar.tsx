"use client";
// ── MicroBar — compact NAV component bar ─────────────────────
import React from "react";
function clamp(n: number, mn: number, mx: number) { return Math.min(mx, Math.max(mn, n)); }

function MicroBar({ label, val, max, color, invert = false, tooltip }: {
  label: string; val: number; max: number; color: string; invert?: boolean; tooltip?: string;
}) {
  const norm = clamp(Math.abs(val) / max, 0, 1);
  
  // FIX: Let the text display the true value, don't clamp it!
  const displayVal = val; 
  
  const colorMap: Record<string, string> = {
    cyan:    "var(--ledger-navy)",
    emerald: "var(--ledger-green)",
    violet:  "var(--ledger-violet)",
    amber:   "var(--ledger-amber-dark)",
    rose:    "var(--ledger-red-deep)",
  };
  const barColor = val < 0 ? "var(--ledger-red-deep)" : colorMap[color];
  const numColor = invert
    ? (val < -40 ? 'var(--ledger-red-deep)' : val < -20 ? 'var(--ledger-amber-dark)' : 'var(--ledger-green)')
    : (val < 0 ? 'var(--ledger-red-deep)' : 'var(--ledger-green)');

  return (
    <div className="rounded p-2 text-center" title={tooltip}>
      <div className="text-2xs font-black uppercase tracking-wider mb-1.5">{label}</div>
      <div className="h-1.5 rounded-full mb-1.5 overflow-hidden" style={{ background: 'var(--ledger-rule-light)' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${norm * 100}%`, background: barColor, opacity: 0.85 }} />
      </div>
      <div className="text-[11px] font-black tabular-nums" style={{
        color: numColor
      }}>
        {displayVal > 0 ? "+" : ""}{displayVal.toFixed(0)}
      </div>
    </div>
  );
}

function DeltaRow({ label, val, unit, invert = false, tooltip }: {
  label: string; val: number; unit: string; invert?: boolean; tooltip?: string;
}) {
  const isGood    = invert ? val <= 0 : val >= 0;
  const isNeutral = Math.abs(val) < 0.5;
  return (
    <div className="flex justify-between items-center" title={tooltip}>
      <span className="text-zinc-700 text-2xs uppercase tracking-tight font-black">{label}</span>
      <span className={`font-black text-2xs ${isNeutral ? "text-zinc-600" : isGood ? "text-emerald-400" : "text-rose-400"}`}>
        {val > 0 ? "+" : ""}{val.toFixed(1)}{unit}
      </span>
    </div>
  );
}


export { MicroBar, DeltaRow };