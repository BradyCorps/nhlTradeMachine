"use client";

import React from "react";
import type { TradeVerdict, TradeStatus, FlagSeverity } from "@/app/lib/trade-types";
import { DeltaRow } from "@/app/components/MicroBar";

export const SEVERITY_STYLES: Record<FlagSeverity, { dot: string; bg: string; border: string; text: string; label: string }> = {
  HARD:  { dot: "bg-red-500",    bg: "bg-red-950/20",    border: "border-red-700/40",    text: "text-ledger-ink-deep",    label: "bg-red-900/50 text-ledger-red-deep border-red-800/60" },
  SOFT:  { dot: "bg-orange-500", bg: "bg-orange-950/20", border: "border-orange-700/40", text: "text-orange-300", label: "bg-orange-900/50 text-orange-300 border-orange-800/60" },
  WARN:  { dot: "bg-amber-400",  bg: "bg-amber-950/15",  border: "border-amber-700/30",  text: "text-amber-300",  label: "bg-amber-900/40 text-amber-300 border-amber-800/50" },
  INFO:  { dot: "bg-sky-400",    bg: "bg-sky-950/15",    border: "border-sky-800/30",    text: "text-sky-300",    label: "bg-sky-900/40 text-sky-300 border-sky-800/50" },
};

export const STATUS_CONFIG: Record<TradeStatus, { border: string; headerText: string; icon: string; bg: string; cssColor: string }> = {
  IDLE:     { border: "border-zinc-800",       headerText: "text-zinc-500",    icon: "—", bg: "bg-zinc-900/40",    cssColor: "var(--ledger-rule)"       },
  PENDING:  { border: "border-zinc-700",       headerText: "text-zinc-300",    icon: "…", bg: "bg-zinc-900/40",    cssColor: "var(--ledger-ink-faint)"  },
  FAIR:     { border: "border-sky-600/50",     headerText: "text-sky-300",     icon: "⚖", bg: "bg-sky-950/15",    cssColor: "var(--ledger-navy)"       },
  WIN:      { border: "border-emerald-600/50", headerText: "text-emerald-400", icon: "↑", bg: "bg-emerald-950/15", cssColor: "var(--ledger-green)"      },
  LOSS:     { border: "border-amber-600/50",   headerText: "text-amber-400",   icon: "↓", bg: "bg-amber-950/15",  cssColor: "var(--ledger-amber)"      },
  BLOCKED:  { border: "border-red-600/50",     headerText: "text-rose-400",    icon: "✕", bg: "bg-red-950/20",    cssColor: "var(--ledger-red)"        },
  DECLINED: { border: "border-orange-600/50",  headerText: "text-ledger-red-deep", icon: "✗", bg: "bg-orange-950/20", cssColor: "var(--ledger-orange)" },
};

export default function VerdictPanel({ verdict, sc, expandedFlag, setExpandedFlag, onRequestClaudeAnalysis, onOpenMemo }: {
  verdict: TradeVerdict;
  sc: typeof STATUS_CONFIG[TradeStatus];
  expandedFlag: number | null;
  setExpandedFlag: (i: number | null) => void;
  onRequestClaudeAnalysis: () => void;
  onOpenMemo: () => void;
}) {
  const flags = verdict.flags;
  const flagEntries = flags.map((flag, index) => ({
    flag,
    index,
    key: `${flag.perspective ?? "home"}-${flag.severity}-${flag.category}-${flag.headline}-${index}`,
  }));
  const hardCount = flags.filter((f) => f.severity === "HARD").length;
  const softCount = flags.filter((f) => f.severity === "SOFT").length;
  const warnCount = flags.filter((f) => f.severity === "WARN").length;

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-500 ${sc.bg} ${sc.border}`}>
      {/* Status header */}
      <div className="px-5 py-4 border-b border-zinc-800/30">
        <div className="flex items-center justify-between mb-1">
          <div className={`text-2xl font-black italic uppercase leading-none tracking-tight ${sc.headerText}`}>
            {verdict.status}
          </div>
          <div className={`text-lg font-black font-mono ${sc.headerText}`}>{sc.icon}</div>
        </div>
        <div className="text-2xs text-zinc-500 font-bold">{verdict.message}</div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {hardCount > 0 && <span className="text-2xs font-black px-2 py-0.5 rounded-full bg-red-900 text-darkmode border border-red-800">{hardCount} HARD BLOCK{hardCount > 1 ? "S" : ""}</span>}
          {softCount > 0 && <span className="text-2xs font-black px-2 py-0.5 rounded-full bg-orange-900 text-darkmode border border-orange-800">{softCount} GM VETO{softCount > 1 ? "S" : ""}</span>}
          {warnCount > 0 && <span className="text-2xs font-black px-2 py-0.5 rounded-full bg-amber-900 text-darkmode border border-amber-800">{warnCount} WARNING{warnCount > 1 ? "S" : ""}</span>}
        </div>
      </div>

      {/* Metrics */}
      <div className="px-5 py-3 border-b border-zinc-800/30 font-mono space-y-1">
        <DeltaRow label="Production Δ"   val={verdict.metrics.ptsGain}   unit=" pts/82" />
        <DeltaRow label="Suppression Δ"  val={verdict.metrics.defGain}   unit=" rel" />
        <DeltaRow label="Cap Impact"      val={verdict.metrics.capDelta}  unit="M" invert />
        <DeltaRow label="Imbalance"       val={-verdict.metrics.variance} unit="%" />
        <div className="border-t border-zinc-800/30 pt-1 mt-1">
          <DeltaRow label="Est. Wins Added"     val={verdict.metrics.ewaHome}   unit="W" />
          <DeltaRow label="Window Shift"        val={verdict.metrics.cwiYears}  unit="yr"
            tooltip={verdict.metrics.cwiYears > 0
              ? `Contention window opens ~${Math.abs(verdict.metrics.cwiYears).toFixed(1)}yr sooner`
              : verdict.metrics.cwiYears < 0
              ? `Contention window shortens by ~${Math.abs(verdict.metrics.cwiYears).toFixed(1)}yr`
              : "Neutral impact on window"} />
        </div>
      </div>

      {/* GM Flags — split by perspective */}
      <div className="px-4 py-3 space-y-1.5 border-b border-zinc-800/30">
        <div className="text-2xs font-black text-zinc-700 uppercase tracking-widest mb-2">
          GM Intelligence Flags — click to expand
        </div>
        {flags.length === 0 && <div className="text-2xs text-zinc-700 italic">No flags raised.</div>}

        {/* Home-team flags — your concerns */}
        {flagEntries.filter(entry => entry.flag.perspective !== "partner").map(({ flag, index, key }) => {
          const fs = SEVERITY_STYLES[flag.severity];
          const isOpen = expandedFlag === index;
          return (
            <div key={key}
              className={`rounded-lg border overflow-hidden cursor-pointer transition-all duration-200 ${fs.bg} ${fs.border} hover:opacity-90`}
              onClick={() => setExpandedFlag(isOpen ? null : index)}>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${fs.dot}`} />
                <span className={`text-2xs font-black uppercase tracking-tight flex-1 leading-tight ${fs.text}`}>
                  {flag.headline}
                </span>
                {flag.affectedAsset && (
                  <span className={`text-2xs font-black px-1.5 py-0.5 rounded border shrink-0 ${fs.label}`}>
                    {flag.affectedAsset.split(" ").pop()}
                  </span>
                )}
                <span className={`text-2xs font-black shrink-0 ml-1 ${fs.text}`}>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && (
                <div className={`px-3 pb-3 pt-0.5 border-t ${fs.border}`}>
                  <p className={`text-2xs leading-relaxed font-medium ${fs.text}`}>{flag.explanation}</p>
                  {flag.vetoesSide !== undefined && (
                    <div className={`mt-2 text-2xs font-black uppercase tracking-wide border-t pt-1.5 ${fs.border} ${fs.text} opacity-70`}>
                      Vetoes: {flag.vetoesSide === 0 ? "Home team GM declines" : "Partner GM declines"}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Partner-side flags — the other team's concerns */}
        {flags.some(f => f.perspective === "partner") && (
          <div className="mt-3">
            <div className="text-2xs font-black text-zinc-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span style={{ opacity: 0.5 }}>◈</span> Concerns for the other side
            </div>
            {flagEntries.filter(entry => entry.flag.perspective === "partner").map(({ flag, index, key }) => {
              const isOpen = expandedFlag === index;
              return (
                <div key={key}
                  className="rounded-lg border overflow-hidden cursor-pointer transition-all duration-200 hover:opacity-90 mb-1.5"
                  style={{ background: 'rgba(28,20,10,0.04)', borderColor: 'var(--ledger-rule-mid)', opacity: 0.85 }}
                  onClick={() => setExpandedFlag(isOpen ? null : index)}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--ledger-ink-faint)' }} />
                    <span className="text-2xs font-black uppercase tracking-tight flex-1 leading-tight"
                      style={{ color: 'var(--ledger-ink-faint)' }}>
                      {flag.headline}
                    </span>
                    {flag.affectedAsset && (
                      <span className="text-2xs font-black px-1.5 py-0.5 rounded border shrink-0"
                        style={{ color: 'var(--ledger-ink-faint)', borderColor: 'var(--ledger-rule-mid)' }}>
                        {flag.affectedAsset.split(" ").pop()}
                      </span>
                    )}
                    <span className="text-2xs font-black shrink-0 ml-1"
                      style={{ color: 'var(--ledger-ink-faint)' }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-0.5 border-t" style={{ borderColor: 'var(--ledger-rule-mid)' }}>
                      <p className="text-2xs leading-relaxed font-medium" style={{ color: 'var(--ledger-ink-faint)' }}>
                        {flag.explanation}
                      </p>
                      <div className="mt-1.5 text-2xs font-black uppercase tracking-wide"
                        style={{ color: 'var(--ledger-rule)', opacity: 0.8 }}>
                        This flag applies to the other side — good intel for your negotiation.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Claude GM Analysis — triggers modal ───────────────── */}
      <div className="px-4 py-3">
        {!verdict.claudeAnalysis && !verdict.claudeLoading && (
          <button
            onClick={onRequestClaudeAnalysis}
            className="w-full py-2.5 font-black text-2xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            style={{ background: 'transparent', border: '1px solid #b8a070', color: 'var(--ledger-brown)', borderRadius: '2px' }}
          >
            <span className="text-ledger-red">✦</span> Generate Front Office Memo
          </button>
        )}

        {verdict.claudeLoading && (
          <div className="flex items-center gap-2.5 py-3 px-1">
            <div className="w-3 h-3 rounded-full border-t-transparent animate-spin shrink-0" style={{ borderColor: 'var(--ledger-red)', borderTopColor: 'transparent', borderWidth: '2px' }} />
            <span className="text-2xs font-bold text-ledger-ink-faint font-mono">Claude is reviewing the trade...</span>
          </div>
        )}

        {verdict.claudeAnalysis && !verdict.claudeLoading && (
          <button
            onClick={onOpenMemo}
            className="w-full py-2.5 font-black text-2xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            style={{ background: 'var(--ledger-green)', border: '1px solid #0f3d1e', color: 'white', borderRadius: '2px' }}
          >
            ✦ Read Front Office Memo
          </button>
        )}
      </div>
    </div>
  );
}
