"use client";
// ── Front Office Memo Modal — the Claude trade evaluation report ──
import React from "react";
import { useDialog } from "@/app/lib/use-dialog";
import type { TradeVerdict } from "@/app/lib/trade-types";

export function MemoModal({
  verdict,
  homeTeamName,
  partnerTeamName,
  onClose,
  onRegenerate,
}: {
  verdict: TradeVerdict;
  homeTeamName: string | undefined;
  partnerTeamName: string | undefined;
  onClose: () => void;
  onRegenerate: () => void;
}) {
  const dialog = useDialog({ open: true, onClose, label: "Trade memorandum" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(28,20,10,0.75)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}>
      <div {...dialog} className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--ledger-card-light)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', borderRadius: '2px' }}
        onClick={e => e.stopPropagation()}>

        {/* Memo letterhead */}
        <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-4" style={{ borderBottom: '2px solid #1c140a' }}>
          <div className="text-center mb-4">
            <div className="text-2xs uppercase tracking-[0.5em] mb-1 text-ledger-ink-faint font-mono">
              Quant Front Office — Internal Memorandum
            </div>
            <div className="font-black text-2xl" style={{ color: 'var(--ledger-ink)' }}>
              Trade Evaluation Report
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-2xs font-mono">
            {[
              ["TO",      "GM & Hockey Operations Leadership"],
              ["FROM",    "Senior Front Office Analyst — Claude"],
              ["DATE",    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
              ["RE",      `${homeTeamName ?? 'Home'} ↔ ${partnerTeamName ?? 'Partner'} Trade`],
              ["VERDICT", verdict.status],
              ["NAV",     `${verdict.metrics.homeNetGain > 0 ? '+' : ''}${verdict.metrics.homeNetGain.toFixed(0)} for ${homeTeamName ?? 'Home'}`],
            ].map(([label, val]) => (
              <div key={label} className="flex gap-3">
                <span className="font-black w-16 shrink-0 text-ledger-brown">{label}:</span>
                <span style={{ color: (label === "VERDICT" && (verdict.status === "WIN" || verdict.status === "FAIR")) ? 'var(--ledger-green)'
                  : (label === "VERDICT" && (verdict.status === "BLOCKED" || verdict.status === "DECLINED")) ? 'var(--ledger-red)'
                  : 'var(--ledger-ink)' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Memo body */}
        <div className="px-4 sm:px-8 py-5 sm:py-6 relative">
          {/* Faint ruled lines like a memo pad */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, rgba(184,160,112,0.2) 28px)',
            backgroundSize: '100% 28px',
            top: '24px'
          }} />
          <p className="relative text-[12px] leading-[1.85]" style={{
            color: 'var(--ledger-ink)',
            whiteSpace: 'pre-wrap',
          }}>
            {verdict.claudeAnalysis}
          </p>
        </div>

        {/* Verdict stamp + disclaimer */}
        <div className="px-4 sm:px-8 pb-5 sm:pb-6 flex items-end justify-between flex-wrap gap-3" style={{ borderTop: '1px solid #b8a070', paddingTop: '16px' }}>
          <div className="text-2xs" style={{ color: 'var(--ledger-ink-faint)', lineHeight: 1.6 }}>
            CONFIDENTIAL — Internal Use Only<br />
            Valuations are analytical estimates only.
          </div>
          <div style={{ transform: 'rotate(-4deg)', transformOrigin: 'center' }}>
            <div className="px-4 py-1.5 text-center font-black text-base uppercase tracking-widest" style={{
              border: `3px solid ${['WIN','FAIR'].includes(verdict.status) ? 'var(--ledger-green)' : 'var(--ledger-red)'}`,
              color: ['WIN','FAIR'].includes(verdict.status) ? 'var(--ledger-green)' : 'var(--ledger-red)',
              opacity: 0.85,
            }}>
              {verdict.status}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-4 sm:px-8 py-3 flex justify-between items-center flex-wrap gap-2" style={{ borderTop: '1px solid #b8a070' }}>
          <button onClick={() => { onClose(); onRegenerate(); }}
            className="text-2xs font-black uppercase tracking-wider transition-opacity hover:opacity-60 text-ledger-ink-faint font-mono">
            ↺ Regenerate
          </button>
          <button onClick={onClose}
            className="text-2xs font-black uppercase tracking-wider px-4 py-1.5"
            style={{ background: 'var(--ledger-ink)', color: 'var(--ledger-card-light)', borderRadius: '2px' }}>
            Close ✕
          </button>
        </div>
      </div>
    </div>
  );
}
