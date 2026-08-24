"use client";

import Header from "@/app/components/Header";

export default function TeamsLoading() {
  return (
    <main
      className="min-h-screen font-mono"
      aria-busy="true"
      aria-label="Loading Team Analytics"
      style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)" }}
    >
      <div className="mx-auto max-w-6xl px-4 pt-5 pb-8">
        <Header activeTab="teams" />

        <div className="mt-6 mb-5 border-b pb-4" style={{ borderColor: "var(--ledger-rule)" }}>
          <div className="h-3 w-36 animate-pulse" style={{ background: "var(--ledger-rule)" }} />
          <div className="mt-2 h-2.5 w-full max-w-xl animate-pulse" style={{ background: "var(--ledger-rule-light)" }} />
        </div>

        <div className="mb-5 grid grid-cols-5 gap-2 border p-3" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-10 animate-pulse" style={{ background: "var(--ledger-rule-light)" }} />
          ))}
        </div>

        <div className="mb-5 h-44 border p-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card)" }}>
          <div className="h-full animate-pulse" style={{ background: "var(--paper-inset)" }} />
        </div>

        <div className="space-y-2" role="status">
          <span className="sr-only">Loading team records and league values</span>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-16 border p-3" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card)" }}>
              <div className="h-full animate-pulse" style={{ background: "var(--paper-inset)" }} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
