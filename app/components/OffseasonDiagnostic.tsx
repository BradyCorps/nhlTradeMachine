import React from "react";
import type {
  OffseasonStateDiagnostic,
  OffseasonTransaction,
} from "@/app/lib/offseason-ledger";

const stateLabels = {
  ROSTER: "Roster",
  RETAINED_RIGHTS: "Retained rights",
  RFA: "RFA",
  UFA: "UFA",
  SIGNED_ELSEWHERE: "Signed elsewhere",
  RETIRED: "Retired",
} as const;

export function OffseasonDiagnostic({
  diagnostic,
  transactions,
  title = "Player-State Audit",
}: {
  diagnostic: OffseasonStateDiagnostic;
  transactions: readonly OffseasonTransaction[];
  title?: string;
}) {
  const problems = [
    diagnostic.missingPlayerIds.length > 0
      ? `Missing: ${diagnostic.missingPlayerIds.join(", ")}`
      : null,
    diagnostic.unexpectedPlayerIds.length > 0
      ? `Unexpected: ${diagnostic.unexpectedPlayerIds.join(", ")}`
      : null,
    diagnostic.duplicatePlayerIds.length > 0
      ? `Duplicate: ${diagnostic.duplicatePlayerIds.join(", ")}`
      : null,
    diagnostic.conflictingPlayerIds.length > 0
      ? `Conflicting states: ${diagnostic.conflictingPlayerIds.join(", ")}`
      : null,
  ].filter((problem): problem is string => Boolean(problem));

  return (
    <details className="mb-4" style={{ background: "var(--paper-inset)", border: `1px solid ${diagnostic.ok ? "var(--ledger-green)" : "var(--ledger-red)"}`, borderRadius: "2px" }}>
      <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-black"
        style={{ color: diagnostic.ok ? "var(--ledger-green)" : "var(--ledger-red)" }}>
        {title}: {diagnostic.ok ? `reconciled ${diagnostic.actualCount}/${diagnostic.expectedCount}` : "invariant failed"}
        <span className="ml-2" style={{ color: "var(--ledger-ink-faint)" }}>
          · {transactions.length} transaction{transactions.length === 1 ? "" : "s"}
        </span>
      </summary>
      <div className="px-3 pb-3" role="status" aria-live="polite">
        <p className="font-mono text-[9px] leading-relaxed" style={{ color: "var(--ledger-ink-body)" }}>
          {diagnostic.equation}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2">
          {Object.entries(stateLabels).map(([state, label]) => (
            <div key={state} className="flex items-center justify-between gap-2 px-2 py-1"
              style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)" }}>
              <span className="font-mono text-[9px] uppercase" style={{ color: "var(--ledger-ink-faint)" }}>{label}</span>
              <span className="font-mono text-[10px] font-black" style={{ color: "var(--ledger-ink)" }}>
                {diagnostic.counts[state as keyof typeof diagnostic.counts]}
              </span>
            </div>
          ))}
        </div>
        {diagnostic.excludedSyntheticDepthCount > 0 && (
          <p className="font-mono text-[9px] mt-2" style={{ color: "var(--ledger-brown)" }}>
            {diagnostic.excludedSyntheticDepthCount} generated depth placeholder{diagnostic.excludedSyntheticDepthCount === 1 ? "" : "s"} disclosed outside the real-player equation.
          </p>
        )}
        {problems.map((problem) => (
          <p key={problem} className="font-mono text-[9px] mt-1 break-all" style={{ color: "var(--ledger-red)" }}>
            {problem}
          </p>
        ))}

        <div className="mt-3 pt-2" style={{ borderTop: "1px solid var(--ledger-rule-light)" }}>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] font-black mb-1.5" style={{ color: "var(--ledger-ink-faint)" }}>
            Transaction Ledger
          </div>
          {transactions.length === 0 ? (
            <p className="text-[10px] italic" style={{ color: "var(--ledger-brown)" }}>No offseason player moves recorded.</p>
          ) : (
            <ol className="flex flex-col gap-1 max-h-48 overflow-y-auto" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {[...transactions].reverse().map((transaction, index) => (
                <li key={`${transaction.playerId}-${transaction.kind}-${transactions.length - index}`}
                  className="px-2 py-1.5" style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)" }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-black text-[10px]" style={{ color: "var(--ledger-ink)" }}>{transaction.playerName}</span>
                    <span className="font-mono text-[8px] uppercase tracking-wider shrink-0" style={{ color: "var(--ledger-ink-faint)" }}>
                      {stateLabels[transaction.state]}
                    </span>
                  </div>
                  <div className="font-mono text-[9px]" style={{ color: "var(--ledger-brown)" }}>{transaction.detail}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </details>
  );
}
