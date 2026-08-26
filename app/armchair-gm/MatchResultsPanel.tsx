"use client";
// ── Partner Dossier — "Who wants this package?" match results ──
// Folder-tabbed dossier of the 32-team fit scan. Owns the folder
// taxonomy (MATCH_FOLDERS); the fetch and its state live with the caller.
import React from "react";
import { TIER_MEANING, type MatchFitTier } from "@/app/lib/match-fit";
import { HorizontalScrollCue } from "@/app/components/HorizontalScrollCue";

// CXH5 — "Cap Clear" is gone. It named a cap condition while being used as an
// interest tier, so a club with a score of zero was filed under it for having
// room. The folders are interest bands now; whether the money works is the
// separate `capFit` column on every row.
export type MatchFolder = MatchFitTier;

export const MATCH_FOLDERS: Array<{ id: MatchFolder; label: string; stamp: string }> = [
  { id: "LEAD",      label: "Leads",      stamp: "A" },
  { id: "POSSIBLE",  label: "Possible",   stamp: "B" },
  { id: "LONG_SHOT", label: "Long Shot",  stamp: "C" },
  { id: "BLOCKED",   label: "Cap Blocked", stamp: "X" },
];

export type TradeMatchResults = {
  matches: Array<{
    teamId: string; teamName: string; phase: string; score: number;
    fitTier: MatchFolder;
    navDelta: number; capFit: "FITS"|"TIGHT"|"OVER";
    fitReasons: string[]; warnReasons: string[]; returnProfile: string;
  }>;
  packageNAV: number; packageCap: number; avgAge: number;
};

export function MatchResultsPanel({
  matchResults,
  matchFolder,
  setMatchFolder,
  approvedOnly,
  setApprovedOnly,
  onSelectPartner,
  activePartnerId,
}: {
  matchResults: TradeMatchResults;
  matchFolder: MatchFolder;
  setMatchFolder: (f: MatchFolder) => void;
  approvedOnly: boolean;
  setApprovedOnly: React.Dispatch<React.SetStateAction<boolean>>;
  /** Load this club into the bench as the trade partner. */
  onSelectPartner?: (teamId: string) => void;
  activePartnerId?: string | null;
}) {
  const capScreened = approvedOnly
    ? matchResults.matches.filter(m => m.capFit !== "OVER")
    : matchResults.matches;
  const folderCounts = MATCH_FOLDERS.reduce<Record<MatchFolder, number>>((acc, folder) => {
    acc[folder.id] = capScreened.filter(m => m.fitTier === folder.id).length;
    return acc;
  }, { LEAD: 0, POSSIBLE: 0, LONG_SHOT: 0, BLOCKED: 0 });
  const activeFolder = folderCounts[matchFolder] > 0
    ? matchFolder
    : (MATCH_FOLDERS.find(f => folderCounts[f.id] > 0)?.id ?? matchFolder);
  const displayed = capScreened.filter(m => m.fitTier === activeFolder);
  const fullCount = matchResults.matches.length;
  const visibleCount = capScreened.length;
  return (
  <div className="mt-3">
    <div className="flex items-end gap-1 overflow-x-auto pb-0.5"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--ledger-rule) transparent' }}>
      {MATCH_FOLDERS.map(folder => {
        const active = folder.id === activeFolder;
        return (
          <button
            key={folder.id}
            onClick={() => setMatchFolder(folder.id)}
            className="shrink-0 px-2.5 py-1.5 text-2xs font-black uppercase font-mono transition-all"
            style={{
              minWidth: 74,
              background: active ? 'var(--ledger-card-light)' : 'var(--ledger-cream)',
              color: active ? 'var(--ledger-ink)' : 'var(--ledger-ink-faint)',
              border: active ? '2px solid var(--ledger-ice)' : '1px solid var(--ledger-rule)',
              borderBottom: active ? '0' : '1px solid var(--ledger-rule)',
              borderRadius: '6px 6px 0 0',
              transform: active ? 'translateY(1px)' : 'none',
            }}>
            <span style={{ marginRight: 4, color: active ? 'var(--ledger-red)' : 'var(--ledger-rule)' }}>
              {folder.stamp}
            </span>
            {folder.label}
            <span style={{ marginLeft: 5, color: 'var(--ledger-ink-faint)' }}>
              {folderCounts[folder.id]}
            </span>
          </button>
        );
      })}
    </div>
    <HorizontalScrollCue label="Swipe or scroll for all match folders" />
    <div className="p-3"
      style={{
        background: 'var(--ledger-card-light)',
        border: '2px solid var(--ledger-ice)',
        boxShadow: 'inset 0 0 0 1px var(--ledger-rule-light)',
      }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-2xs font-black uppercase tracking-[0.35em] font-mono"
            style={{ color: 'var(--ledger-ice)' }}>
            Partner Dossier
          </div>
          <div className="text-2xs font-mono mt-1" style={{ color: 'var(--ledger-ink-faint)' }}>
            {visibleCount} of {fullCount} clubs filed
          </div>
        </div>
        <button
          onClick={() => setApprovedOnly(v => !v)}
          className="text-2xs font-mono px-2 py-1 transition-colors"
          style={{
            background: approvedOnly ? 'var(--ledger-green)' : 'var(--ledger-rule-light)',
            color: approvedOnly ? 'white' : 'var(--ledger-ink-faint)',
            fontWeight: 900, border: '1px solid var(--ledger-rule)', cursor: 'pointer',
          }}>
          {approvedOnly ? 'CAP SCREEN' : 'ALL CLUBS'}
        </button>
      </div>
      <div className="text-2xs font-mono mb-3 text-center py-1"
        style={{
          color: 'var(--ledger-ink-faint)',
          borderTop: '1px solid var(--ledger-rule-light)',
          borderBottom: '1px solid var(--ledger-rule-light)',
        }}>
        Package: {matchResults.packageNAV > 0 ? "+" : ""}{matchResults.packageNAV.toFixed(0)} NAV
        · ${matchResults.packageCap.toFixed(1)}M cap
        {matchResults.avgAge > 0 ? ` · avg ${matchResults.avgAge.toFixed(0)} yrs old` : ""}
      </div>
      {/* What the open folder actually claims. A club filed under "Long Shot"
          is a club with little reason to engage — not a comment on whether the
          cap works, which is the per-row column. */}
      <div className="text-2xs font-mono mb-2 px-1" style={{ color: 'var(--ledger-ink-faint)' }}>
        {TIER_MEANING[activeFolder]}
      </div>
      {displayed.length === 0 && (
        <div className="text-center text-2xs font-mono py-4" style={{ color: 'var(--ledger-ink-faint)' }}>
          No clubs in this folder.
          {approvedOnly && (
            <button onClick={() => setApprovedOnly(false)} className="ml-2 underline">Open full file</button>
          )}
        </div>
      )}
      <div className="space-y-2 overflow-y-auto pr-1"
        style={{ maxHeight: '440px', scrollbarWidth: 'thin', scrollbarColor: 'var(--ledger-rule) transparent' }}>
        {displayed.map((m, i) => (
          <div key={m.teamId} className="p-2.5"
          style={{
            background: i === 0 ? 'rgba(26,46,92,0.08)' : 'var(--ledger-card)',
            border: i === 0 ? '1px solid var(--ledger-ice)' : '1px solid var(--ledger-rule)',
            borderRadius: 3,
          }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-2xs font-black" style={{ color: 'var(--ledger-ink-faint)', fontFamily: 'monospace' }}>
                #{i + 1}
              </span>
              <span className="font-black text-[11px]" style={{ color: 'var(--ledger-ink)' }}>
                {m.teamName}
              </span>
              <span className="text-2xs font-mono px-1.5 py-0.5 rounded"
                style={{ background: 'var(--ledger-rule-light)', color: 'var(--ledger-ink-body)' }}>
                {m.phase}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-2xs font-mono"
                style={{ color: m.capFit === "FITS" ? 'var(--ledger-green)' : m.capFit === "TIGHT" ? 'var(--ledger-amber)' : 'var(--ledger-red)' }}>
                {m.capFit}
              </span>
              {/* Score bar */}
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ledger-rule-light)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${m.score}%`, background: m.score >= 65 ? 'var(--ledger-ice)' : m.score >= 45 ? 'var(--ledger-amber)' : 'var(--ledger-red)' }} />
                </div>
                <span className="text-2xs font-black font-mono" style={{ color: 'var(--ledger-ink)', minWidth: 24 }}>
                  {m.score}
                </span>
              </div>
            </div>
          </div>
          {m.fitReasons.length > 0 && (
            <div className="text-2xs font-mono space-y-0.5 mb-1">
              {m.fitReasons.map((r, j) => (
                <div key={j} style={{ color: 'var(--ledger-green)' }}>✓ {r}</div>
              ))}
            </div>
          )}
          {m.warnReasons.length > 0 && (
            <div className="text-2xs font-mono space-y-0.5 mb-1">
              {m.warnReasons.map((r, j) => (
                <div key={j} style={{ color: 'var(--ledger-amber)' }}>⚠ {r}</div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 mt-1 pt-1"
            style={{ borderTop: '1px solid var(--ledger-rule-light)' }}>
            <span className="text-2xs font-mono" style={{ color: 'var(--ledger-ink-faint)' }}>
              Return profile: {m.returnProfile}
            </span>
            {/* CXH5 — the scan was read-only: it named a partner and then made
                you go find them in the team picker yourself. */}
            {onSelectPartner && (
              <button
                onClick={() => onSelectPartner(m.teamId)}
                disabled={m.teamId === activePartnerId}
                aria-label={m.teamId === activePartnerId
                  ? `${m.teamName} is already your trade partner`
                  : `Open a trade with ${m.teamName}; your package stays on the block`}
                className="tap-target shrink-0 text-2xs font-black font-mono uppercase px-2 py-1"
                style={{
                  background: m.teamId === activePartnerId ? 'var(--ledger-rule-light)' : 'var(--ledger-ice)',
                  color: m.teamId === activePartnerId ? 'var(--ledger-ink-faint)' : 'var(--paper)',
                  border: '1px solid var(--ledger-ice)',
                  borderRadius: 2,
                  cursor: m.teamId === activePartnerId ? 'default' : 'pointer',
                }}>
                {m.teamId === activePartnerId ? 'Current Partner' : 'Open Trade'}
              </button>
            )}
          </div>
        </div>
      ))}
      </div>
      {displayed.length > 3 && (
        <div className="text-2xs font-mono text-center mt-1.5"
          style={{ color: 'var(--ledger-ink-faint)' }}>
          scroll file · {displayed.length} clubs in folder
        </div>
      )}
      </div>
  </div>
  );
}
