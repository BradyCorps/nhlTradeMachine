"use client";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { useDialog } from "@/app/lib/use-dialog";

// Bumped with the rename: a returning visitor should be told the paper changed
// its name once, rather than silently finding a different masthead.
const STORAGE_KEY = "cap-and-crease-welcomed-v1";

export default function WelcomeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Storage can be unavailable in private browsing; dismissal still works
      // for the current page even when it cannot be persisted.
    }
    setVisible(false);
  }, []);

  const dialog = useDialog({
    open: visible,
    onClose: dismiss,
    labelledBy: "welcome-title",
  });

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(44, 36, 22, 0.6)", backdropFilter: "blur(2px)" }}
      onClick={dismiss}
    >
      <div
        {...dialog}
        className="relative w-full max-w-lg font-mono"
        style={{
          background: "var(--ledger-cream, #f5efe0)",
          border: "2px solid var(--ledger-brown, #8b7355)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-3 text-center"
          style={{
            borderBottom: "2px solid var(--ledger-brown, #8b7355)",
            background: "var(--paper-card, #f0e8d5)",
          }}
        >
          <div className="text-[9px] uppercase tracking-[0.3em]" style={{ color: "var(--ledger-rule)" }}>
            Est. 2026 — Vol. I — Trade Edition
          </div>
          <h2
            id="welcome-title"
            className="mt-1 text-lg font-black uppercase tracking-[0.1em]"
            style={{ color: "var(--ledger-ink, #2c2416)" }}
          >
            Cap & Crease
          </h2>
          <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: "var(--ledger-brown)" }}>
            Welcome, Reader
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 text-[11px] leading-relaxed" style={{ color: "var(--ledger-ink-body, #3d3428)" }}>
          <p>
            <strong>Cap & Crease</strong> is an NHL analytics platform that values every player, contract,
            and trade. Pick a desk to begin, or read about the models when you want the detail.
          </p>

          <nav aria-label="Choose a product" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href="/players"
              onClick={dismiss}
              className="min-h-11 flex items-center justify-center border-2 px-3 py-2 text-center text-[9px] font-black uppercase tracking-[0.12em] no-underline"
              style={{ borderColor: "var(--ledger-ice)", color: "var(--ledger-ice)" }}
            >
              Search Players
            </Link>
            <Link
              href="/trade-machine"
              onClick={dismiss}
              className="min-h-11 flex items-center justify-center border-2 px-3 py-2 text-center text-[9px] font-black uppercase tracking-[0.12em] no-underline"
              style={{ borderColor: "var(--ledger-red)", color: "var(--ledger-red)" }}
            >
              Build a Trade
            </Link>
            <Link
              href="/teams"
              onClick={dismiss}
              className="min-h-11 flex items-center justify-center border-2 px-3 py-2 text-center text-[9px] font-black uppercase tracking-[0.12em] no-underline"
              style={{ borderColor: "var(--ledger-green)", color: "var(--ledger-green)" }}
            >
              Explore Teams
            </Link>
          </nav>

          <details className="border-t pt-2" style={{ borderColor: "var(--ledger-rule-mid, #c8b890)" }}>
            <summary className="min-h-11 flex cursor-pointer items-center font-black uppercase tracking-[0.14em]"
              style={{ color: "var(--ledger-brown)" }}>
              How the models work
            </summary>
            <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 pb-2">
              <Term t="X-NAV" d="Extended Net Asset Value — a player's total trade value combining on-ice impact, age, contract, and role; experimental Gravity value is separately gated." />
              <Term t="STRAND" d="DNA-style visualization showing offensive and defensive trait profiles at a glance." />
              <Term t="GM Audit" d="Automated trade analysis checking cap legality, roster fit, timeline alignment, and fair value." />
              <Term t="FMV" d="Fair Market Value — what a player would earn as a free agent based on their production profile." />
            </div>
            <p className="pb-2" style={{ color: "var(--ledger-ink-faint)" }}>
              Metric help is available beside each value. Read the full explanation in the{" "}
              <Link href="/methodology" onClick={dismiss} className="underline" style={{ color: "var(--ledger-ice)" }}>
                methodology
              </Link>.
            </p>
          </details>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 text-center" style={{ borderTop: "1px solid var(--ledger-rule-mid, #c8b890)" }}>
          <button
            onClick={dismiss}
            className="min-h-11 font-mono text-[10px] font-black uppercase tracking-[0.2em] px-6 py-2"
            style={{
              background: "var(--ledger-ink, #2c2416)",
              color: "var(--ledger-cream, #f5efe0)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Enter the Ledger
          </button>
        </div>
      </div>
    </div>
  );
}

function Term({ t, d }: { t: string; d: string }) {
  return (
    <>
      <span className="font-black text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink)" }}>
        {t}
      </span>
      <span>{d}</span>
    </>
  );
}
