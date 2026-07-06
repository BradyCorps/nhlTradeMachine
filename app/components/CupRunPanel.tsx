"use client";

// ── Cup Run Panel — 3-year challenge HUD for the Armchair GM ──
// Shows run status (year, difficulty, season history, retention
// ledger) and drives the loop: record the simmed season, advance the
// league a year, or close out with the banner / fired screens.

import React, { useState } from "react";
import type { CupRunState } from "@/app/lib/cup-run";
import { cupRunShareText, seasonLabelForYear, MAX_RETENTION_SLOTS } from "@/app/lib/cup-run";

export default function CupRunPanel({
  run,
  canStart,
  hasSeasonResult,
  advancing,
  onStart,
  onRecordAndAdvance,
  onAbandon,
}: {
  run: CupRunState | null;
  canStart: boolean;             // a home team is locked in
  hasSeasonResult: boolean;      // simData with a champion is available
  advancing: boolean;
  onStart: () => void;
  onRecordAndAdvance: () => void;
  onAbandon: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (!run) return;
    try {
      await navigator.clipboard.writeText(cupRunShareText(run));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  if (!run) {
    return (
      <div
        className="border px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-2"
        style={{ borderColor: "var(--rule)", background: "var(--paper-inset)", borderRadius: 2 }}
      >
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono" style={{ color: "var(--ledger-red)" }}>
            Cup Run Challenge
          </div>
          <div className="text-[11px] font-mono mt-0.5" style={{ color: "var(--ledger-ink-faint)" }}>
            Take this team to a Stanley Cup within 3 seasons.
          </div>
        </div>
        <button
          onClick={onStart}
          disabled={!canStart}
          className="px-4 py-2 text-[11px] font-black font-mono uppercase tracking-[0.15em] border transition-all"
          style={{
            background: canStart ? "var(--ledger-red)" : "var(--paper)",
            color: canStart ? "#fff" : "var(--ledger-ink-faint)",
            borderColor: canStart ? "var(--ledger-red)" : "var(--rule)",
            borderRadius: 2,
            cursor: canStart ? "pointer" : "default",
          }}
        >
          {canStart ? "Start Cup Run" : "Pick a team first"}
        </button>
      </div>
    );
  }

  const stars = "★".repeat(run.difficulty.stars) + "☆".repeat(5 - run.difficulty.stars);
  const activeRetention = run.retentionLedger.filter((e) => e.yearsRemaining > 0);

  return (
    <div
      className="border mb-4"
      style={{
        borderColor: run.status === "WON" ? "var(--ledger-green)" : run.status === "FIRED" ? "var(--ledger-red)" : "var(--ink)",
        background: "var(--paper-inset)",
        borderRadius: 2,
      }}
    >
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b" style={{ borderColor: "var(--rule)" }}>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] font-mono" style={{ color: "var(--ledger-red)" }}>
            Cup Run
          </span>
          <span className="text-[11px] font-black font-mono" style={{ color: "var(--ink)" }}>
            {run.teamName}
          </span>
          <span className="text-[10px] font-mono" style={{ color: "var(--ledger-amber)" }} title={run.difficulty.label}>
            {stars} {run.difficulty.label}
          </span>
        </div>
        {run.status === "ACTIVE" && (
          <span className="text-[10px] font-black font-mono uppercase tracking-wider" style={{ color: "var(--ink)" }}>
            Year {run.currentYear} of 3 — {seasonLabelForYear(run.currentYear)}
          </span>
        )}
      </div>

      {/* Terminal states */}
      {run.status === "WON" && (
        <div className="px-4 py-4 text-center">
          <div className="text-[13px] font-black uppercase tracking-[0.3em] font-mono" style={{ color: "var(--ledger-green)" }}>
            🏆 Stanley Cup Champions
          </div>
          <div className="text-[11px] font-mono mt-1" style={{ color: "var(--ledger-ink-body)" }}>
            {run.teamName} win it all in Year {run.seasons.findIndex((s) => s.wonCup) + 1}.
          </div>
        </div>
      )}
      {run.status === "FIRED" && (
        <div className="px-4 py-4 text-center">
          <div className="text-[13px] font-black uppercase tracking-[0.3em] font-mono" style={{ color: "var(--ledger-red)" }}>
            📰 You&apos;re Fired
          </div>
          <div className="text-[11px] font-mono mt-1" style={{ color: "var(--ledger-ink-body)" }}>
            Three seasons, no Cup. The board has made a change.
          </div>
        </div>
      )}

      {/* Season history */}
      {run.seasons.length > 0 && (
        <div className="px-4 py-2 border-b" style={{ borderColor: "var(--rule-light)" }}>
          {run.seasons.map((s) => (
            <div key={s.year} className="flex items-center justify-between py-1 text-[10px] font-mono">
              <span style={{ color: "var(--ledger-ink-faint)" }}>
                Y{s.year} · {s.seasonLabel}
              </span>
              <span style={{ color: s.wonCup ? "var(--ledger-green)" : "var(--ledger-ink-body)" }} className={s.wonCup ? "font-black" : ""}>
                {s.wonCup ? "🏆 STANLEY CUP" : s.madePlayoffs ? "Made playoffs" : "Missed playoffs"}
                {!s.wonCup && ` — Cup: ${s.championTeamName}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Retention ledger */}
      {run.status === "ACTIVE" && (
        <div className="px-4 py-2 border-b" style={{ borderColor: "var(--rule-light)" }}>
          <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-faint)" }}>
            <span>Retention Ledger</span>
            <span>{activeRetention.length}/{MAX_RETENTION_SLOTS} slots</span>
          </div>
          {activeRetention.length > 0 ? (
            activeRetention.map((e) => (
              <div key={`${e.playerId}-${e.yearsRemaining}`} className="flex items-center justify-between py-0.5 text-[10px] font-mono" style={{ color: "var(--ledger-ink-body)" }}>
                <span>{e.playerName}</span>
                <span>
                  {Math.round(e.pct * 100)}% (${e.aavRetained.toFixed(2)}M) · {e.yearsRemaining}yr{e.yearsRemaining !== 1 ? "s" : ""} left
                </span>
              </div>
            ))
          ) : (
            <div className="py-0.5 text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
              No salary retained — all 3 slots open.
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        {run.status === "ACTIVE" ? (
          <>
            <button
              onClick={onRecordAndAdvance}
              disabled={!hasSeasonResult || advancing}
              className="px-4 py-2 text-[11px] font-black font-mono uppercase tracking-[0.15em] border transition-all"
              style={{
                background: hasSeasonResult && !advancing ? "var(--ledger-red)" : "var(--paper)",
                color: hasSeasonResult && !advancing ? "#fff" : "var(--ledger-ink-faint)",
                borderColor: hasSeasonResult && !advancing ? "var(--ledger-red)" : "var(--rule)",
                borderRadius: 2,
                cursor: hasSeasonResult && !advancing ? "pointer" : "default",
              }}
            >
              {advancing
                ? "Rolling the league forward…"
                : hasSeasonResult
                  ? `Record Season & ${run.currentYear >= 3 ? "Face the Board" : "Advance"}`
                  : "Sim the season first"}
            </button>
            <button
              onClick={onAbandon}
              className="text-[10px] font-mono uppercase tracking-wider underline"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              Abandon run
            </button>
          </>
        ) : (
          <>
            <button
              onClick={share}
              className="px-4 py-2 text-[11px] font-black font-mono uppercase tracking-[0.15em] border"
              style={{
                background: copied ? "var(--ledger-green)" : "var(--ledger-red)",
                color: "#fff",
                borderColor: copied ? "var(--ledger-green)" : "var(--ledger-red)",
                borderRadius: 2,
                cursor: "pointer",
              }}
            >
              {copied ? "Copied!" : "Share the Story"}
            </button>
            <button
              onClick={onAbandon}
              className="text-[10px] font-mono uppercase tracking-wider underline"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              New run
            </button>
          </>
        )}
      </div>
    </div>
  );
}
