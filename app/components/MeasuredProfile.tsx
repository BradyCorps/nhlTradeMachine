"use client";
// ── MeasuredProfile — the sim's drivers as percentiles vs real NHL ──
// Renders computeMeasuredProfile as labeled percentile bars with the raw
// measured value on the right, explicitly framed as a percentile-vs-population,
// not a 0-99 rating. Dimensions with no measured sample are greyed with a "no
// sample" note rather than showing an invented number.
import React from "react";
import type { Asset } from "@/app/lib/trade-types";
import { computeMeasuredProfile, type ProfileTone } from "@/app/lib/measured-profile";

const TONE_COLOR: Record<ProfileTone, string> = {
  good: "var(--ledger-green)",
  neutral: "var(--ledger-ice)",
  warn: "var(--ledger-red)",
  none: "var(--ledger-ink-faint)",
};

export default function MeasuredProfile({ asset }: { asset: Asset }) {
  const profile = computeMeasuredProfile(asset);
  if (!profile.isSkater) return null;

  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
          Measured Profile
        </span>
        <span className="h-px flex-1" style={{ background: "var(--ledger-rule-light)" }} />
        <span className="text-[9px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
          percentile vs NHL · not a rating
        </span>
      </div>

      <div className="grid gap-1.5">
        {profile.dimensions.map((d) => {
          const color = TONE_COLOR[d.tone];
          return (
            <div key={d.key}>
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-[11px] font-black uppercase tracking-tight font-mono" style={{ color: "var(--ledger-ink)" }}>
                  {d.label}
                  {d.edge && (
                    <span className="ml-1 text-[9px] font-black" style={{ color: "var(--ledger-ice)" }} title="Sourced from an NHL EDGE snapshot">EDGE</span>
                  )}
                </span>
                <span className="text-[10px] font-mono tabular-nums" style={{ color: d.hasSample ? "var(--ledger-ink-body, var(--ledger-ink))" : "var(--ledger-ink-faint)" }}>
                  {d.rawLabel}
                  {d.hasSample && <span className="ml-1.5 font-black" style={{ color }}>{d.pct}%ile</span>}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden" style={{ background: "var(--ledger-rule-light)", border: "1px solid #d8c9a0", borderRadius: 1 }}>
                {d.hasSample ? (
                  <div className="h-full" style={{ width: `${Math.max(2, d.pct)}%`, background: color, borderRadius: 1 }} />
                ) : (
                  // No measured sample — hatched, not an invented value.
                  <div className="h-full w-full" style={{
                    backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(120,100,64,0.25) 3px, rgba(120,100,64,0.25) 6px)",
                  }} />
                )}
              </div>
              {d.note && (
                <div className="text-[9px] font-mono mt-0.5" style={{ color: d.hasSample ? color : "var(--ledger-ink-faint)" }}>
                  {d.note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
