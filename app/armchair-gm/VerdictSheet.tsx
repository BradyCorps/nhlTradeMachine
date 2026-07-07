"use client";
// ── Verdict Bottom Sheet ──────────────────────────────────────
// Always anchored to the bottom of the viewport — no scrolling needed.
// Collapsed: shows status pill + net NAV + tap to expand.
// Expanded: full VerdictPanel slides up into view.
// Auto-opens when GM Audit completes.
import React from "react";
import type { TradeVerdict } from "@/app/lib/trade-types";
import VerdictPanel, { STATUS_CONFIG } from "@/app/components/VerdictPanel";

export function VerdictSheet({
  verdict,
  verdictOpen,
  setVerdictOpen,
  homeTeamName,
  expandedFlag,
  setExpandedFlag,
  onRunEval,
  onCopyLink,
  linkCopied,
  onRequestClaudeAnalysis,
  onOpenMemo,
  onExecute,
}: {
  verdict: TradeVerdict;
  verdictOpen: boolean;
  setVerdictOpen: React.Dispatch<React.SetStateAction<boolean>>;
  homeTeamName: string | undefined;
  expandedFlag: number | null;
  setExpandedFlag: React.Dispatch<React.SetStateAction<number | null>>;
  onRunEval: () => void;
  onCopyLink: () => void;
  linkCopied: boolean;
  onRequestClaudeAnalysis: () => void;
  onOpenMemo: () => void;
  /** Executes the trade, locks the home team, and collapses the sheet. */
  onExecute: () => void;
}) {
  const v = verdict;
  const sc = STATUS_CONFIG[v.status];
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-out"
      style={{
        transform: verdictOpen ? 'translateY(0)' : 'translateY(calc(100% - 52px))',
        maxHeight: verdictOpen ? '70vh' : '52px',
        boxShadow: '0 -4px 32px rgba(28,20,10,0.35)',
        background: 'var(--ledger-card-light)',
        borderTop: `3px solid ${sc.cssColor}`,
      }}>

      {/* ── Handle / collapsed strip ─────────────────────────── */}
      <button
        onClick={() => setVerdictOpen(o => !o)}
        aria-expanded={verdictOpen}
        aria-label={verdictOpen ? "Collapse trade verdict sheet" : "Expand trade verdict sheet"}
        className="tap-target w-full flex items-center justify-between px-4 sm:px-6"
        style={{ height: 52, background: 'transparent' }}>
        <div className="flex items-center gap-3">
          {/* Status pill */}
          <span className="px-2.5 py-0.5 font-black text-2xs uppercase tracking-widest rounded-sm"
            style={{ background: sc.cssColor, color: 'white', letterSpacing: '0.15em' }}>
            {v.status}
          </span>

          {/* Context-aware summary — NAV for WIN/LOSS/FAIR, flags for BLOCKED/DECLINED */}
          {(v.status === 'WIN' || v.status === 'FAIR' || v.status === 'LOSS') && (
            <span className="font-black text-[13px]" style={{
              color: v.status === 'WIN' ? 'var(--ledger-green)' : v.status === 'LOSS' ? 'var(--ledger-red)' : 'var(--ledger-ink)'
            }}>
              {v.metrics.homeNetGain > 0 ? '+' : ''}{v.metrics.homeNetGain.toFixed(0)} NAV
              <span className="font-normal text-2xs ml-2 font-mono" style={{ color: 'var(--ledger-ink-faint)' }}>
                for {homeTeamName ?? 'Home'}
              </span>
            </span>
          )}

          {(v.status === 'BLOCKED' || v.status === 'DECLINED') && (() => {
            const hardFlags = v.flags.filter(f => f.severity === 'HARD');
            const topFlag   = hardFlags[0];
            return (
              <span className="font-black text-[13px]" style={{ color: 'var(--ledger-red)' }}>
                {topFlag ? topFlag.headline : 'Trade blocked'}
                {hardFlags.length > 1 && (
                  <span className="font-normal text-2xs ml-2 font-mono" style={{ color: 'var(--ledger-ink-faint)' }}>
                    +{hardFlags.length - 1} more
                  </span>
                )}
              </span>
            );
          })()}

          {/* Soft flag count — shown for all statuses when present */}
          {v.flags.filter(f => f.severity === 'HARD').length > 0
            && v.status !== 'BLOCKED' && v.status !== 'DECLINED' && (
            <span className="text-2xs font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(166,53,36,0.12)', color: 'var(--ledger-red)' }}>
              {v.flags.filter(f => f.severity === 'HARD').length} hard flag{v.flags.filter(f => f.severity === 'HARD').length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-2xs font-mono" style={{ color: 'var(--ledger-ink-faint)' }}>
          {verdictOpen ? 'collapse ↓' : 'expand ↑'}
        </span>
      </button>

      {/* ── Expanded content — scrollable ────────────────────── */}
      {verdictOpen && (
        <div className="overflow-y-auto px-4 sm:px-6 pb-6 pt-1"
          style={{ maxHeight: 'calc(70vh - 52px)', scrollbarWidth: 'thin', scrollbarColor: 'var(--ledger-rule) transparent' }}>
          <div className="lg:hidden grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={onRunEval}
              aria-label="Run GM audit again"
              className="tap-target py-2.5 font-black uppercase tracking-widest text-[11px] transition-all duration-200 active:scale-[0.98]"
              style={{
                background: 'var(--ledger-ink)',
                color: 'var(--ledger-card-light)',
                borderRadius: '2px',
              }}>
              Re-audit
            </button>
            <button
              onClick={onCopyLink}
              aria-label={linkCopied ? "Trade link copied" : "Copy trade link"}
              className="tap-target py-2.5 font-black uppercase tracking-widest text-[11px] transition-all duration-200 active:scale-[0.98]"
              style={{
                background: 'transparent',
                border: `1px solid ${linkCopied ? 'var(--ledger-green)' : 'var(--ledger-rule)'}`,
                color: linkCopied ? 'var(--ledger-green)' : 'var(--ledger-ink-faint)',
                borderRadius: '2px',
              }}>
              {linkCopied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <VerdictPanel
            verdict={v}
            sc={sc}
            expandedFlag={expandedFlag}
            setExpandedFlag={setExpandedFlag}
            onRequestClaudeAnalysis={onRequestClaudeAnalysis}
            onOpenMemo={onOpenMemo} />

          {/* ── Execute Trade Actions ── */}
          <div className="mt-4 flex flex-col gap-2">
            {(v.status === "FAIR" || v.status === "WIN") && (
              <button onClick={onExecute}
                aria-label="Execute this trade"
                className="tap-target w-full py-4 font-black uppercase tracking-widest text-[13px] transition-all duration-200 active:scale-[0.97] btn-green-ink rounded shadow-lg">
                ✓ Execute Trade — File It
              </button>
            )}

            {/* My Team, My Call — override for DECLINED/BLOCKED/LOSS
                Cannot override: hard NMC refusal, cap violations, floor violations
                Cannot override: Hard flags raised by the opposing GM (they refuse the trade) */}
            {(v.status === "DECLINED" || v.status === "BLOCKED" || v.status === "LOSS") && (() => {
              const hasHardNhlRule = v.flags.some(f => f.severity === "HARD" && (
                f.category === "CLAUSE" ||
                f.category === "CAP_VIOLATION" ||
                f.category === "FLOOR_VIOLATION"
              ));
              const isVetoCat = (cat: string) => ["POSITIONAL_REDUNDANCY", "TIMELINE_MISMATCH", "CLAUSE", "ASSET_SHAPE_MISMATCH", "ELITE_BLOCKADE", "REBUILD_LOGIC", "VALUE_VETO"].includes(cat);
              const partnerVetoed = v.flags.some(f =>
                (f.vetoesSide === 1 || f.perspective === "partner") &&
                (f.severity === "HARD" || isVetoCat(f.category))
              );

              const canOverride = !hasHardNhlRule && !partnerVetoed;

              if (canOverride) {
                return (
                  <button onClick={onExecute}
                    aria-label="Override the GM audit and execute this trade"
                    className="tap-target w-full py-3.5 font-black uppercase tracking-widest text-xs transition-all duration-200 active:scale-[0.97] rounded shadow-lg"
                    style={{
                      background: 'transparent',
                      border: '2px solid #b83020',
                      color: 'var(--ledger-red)',
                    }}
                    title="You're giving up value — but it's your team, your call. This trade will be locked in.">
                    ⚠ My Team, My Call — Override & Execute
                  </button>
                );
              } else if (partnerVetoed) {
                return (
                  <div className="w-full py-3 text-center font-mono text-[11px] rounded bg-red-950/20 text-red-500 border border-red-900/50">
                    Opposing GM has vetoed this trade.
                  </div>
                );
              } else if (hasHardNhlRule) {
                return (
                  <div className="w-full py-3 text-center font-mono text-[11px] rounded bg-red-950/20 text-red-500 border border-red-900/50">
                    Blocked by CBA regulations.
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
