"use client";
// ── Cup Run resume guard — never restore a mid-run flag silently ──
// A saved ACTIVE run's rolled league lives only in React state, so a
// reloaded session can only safely resume Year 1 pre-rollover.
import React from "react";
import type { CupRunState } from "@/app/lib/cup-run";
import { useDialog } from "@/app/lib/use-dialog";

export function CupRunResumePrompt({
  prompt,
  onDismiss,
}: {
  prompt: CupRunState;
  onDismiss: (resume: boolean) => void;
}) {
  const resumable = prompt.currentYear === 1 && prompt.seasons.length === 0;
  const dialog = useDialog({ open: true, label: "Cup Run in progress" });

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" style={{ background: 'rgba(20,16,8,0.55)' }}>
      <div {...dialog} className="max-w-md w-full border p-5" style={{ background: 'var(--paper, var(--ledger-cream))', borderColor: 'var(--ledger-ink)', borderRadius: 2 }}>
        <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono mb-2" style={{ color: 'var(--ledger-red)' }}>
          Cup Run In Progress
        </div>
        <div className="text-[12px] font-serif leading-relaxed mb-1" style={{ color: 'var(--ledger-ink)' }}>
          <strong>{prompt.teamName}</strong> — Year {prompt.currentYear} of 3, {prompt.difficulty.label} ({prompt.difficulty.stars}★)
        </div>
        <div className="text-[11px] font-mono leading-relaxed mb-4" style={{ color: 'var(--ledger-ink-faint)' }}>
          {resumable
            ? "Your trades from the previous session were lost with the tab, but the run itself can pick up from the Year 1 offseason."
            : `The Year ${prompt.currentYear} league state (rolled rosters, trades) can't be restored after the tab closed — continuing would leave the GM in a broken half-state. This run has to be abandoned.`}
        </div>
        <div className="flex gap-2">
          {resumable && (
            <button
              onClick={() => onDismiss(true)}
              className="flex-1 py-2 text-[11px] font-black font-mono uppercase tracking-[0.15em] border"
              style={{ background: 'var(--ledger-red)', color: '#fff', borderColor: 'var(--ledger-red)', borderRadius: 2, cursor: 'pointer' }}
            >
              Resume Run
            </button>
          )}
          <button
            onClick={() => onDismiss(false)}
            className="flex-1 py-2 text-[11px] font-black font-mono uppercase tracking-[0.15em] border"
            style={{
              background: resumable ? 'transparent' : 'var(--ledger-red)',
              color: resumable ? 'var(--ledger-ink)' : '#fff',
              borderColor: resumable ? 'var(--ledger-rule-mid, var(--ledger-ink))' : 'var(--ledger-red)',
              borderRadius: 2, cursor: 'pointer',
            }}
          >
            {resumable ? "Abandon & Start Fresh" : "Abandon Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
