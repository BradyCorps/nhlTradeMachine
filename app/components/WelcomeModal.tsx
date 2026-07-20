"use client";
import React, { useState, useEffect } from "react";

const STORAGE_KEY = "hockey-ledger-welcomed";

export default function WelcomeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(44, 36, 22, 0.6)", backdropFilter: "blur(2px)" }}
      onClick={dismiss}
    >
      <div
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
            className="mt-1 text-lg font-black uppercase tracking-[0.1em]"
            style={{ color: "var(--ledger-ink, #2c2416)" }}
          >
            The Hockey Ledger
          </h2>
          <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: "var(--ledger-brown)" }}>
            Welcome, Reader
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 text-[11px] leading-relaxed" style={{ color: "var(--ledger-ink-body, #3d3428)" }}>
          <p>
            <strong>The Hockey Ledger</strong> is an NHL analytics platform that values every player, contract,
            and trade using proprietary models. Here are the key concepts:
          </p>

          <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2">
            <Term t="X-NAV" d="Extended Net Asset Value — a player's total trade value combining on-ice impact, gravity, age, contract, and role." />
            <Term t="STRAND" d="DNA-style visualization showing offensive and defensive trait profiles at a glance." />
            <Term t="GM Audit" d="Automated trade analysis checking cap legality, roster fit, timeline alignment, and fair value." />
            <Term t="FMV" d="Fair Market Value — what a player would earn as a free agent based on their production profile." />
          </div>

          <p style={{ color: "var(--ledger-ink-faint)" }}>
            Hover or tap any dotted-underlined metric for a quick definition.
            Full methodology available in the footer or at <a href="/methodology" className="underline" style={{ color: "var(--ledger-navy)" }}>/methodology</a>.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 text-center" style={{ borderTop: "1px solid var(--ledger-rule-mid, #c8b890)" }}>
          <button
            onClick={dismiss}
            className="font-mono text-[10px] font-black uppercase tracking-[0.2em] px-6 py-2"
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
