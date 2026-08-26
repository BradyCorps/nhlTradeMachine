"use client";
// ── Team Selection Modal — franchise + mode picker ──
// Portal modal shown on boot (and after Void All Trades). Owns only its
// per-tap "selecting" flash; franchise/mode state lives with the caller.
import React from "react";
import { TeamMark } from "@/app/components/TeamMark";
import { createPortal } from "react-dom";
import { useDialog } from "@/app/lib/use-dialog";
import type { Team } from "@/app/lib/trade-types";
import { teamWindow } from "@/app/lib/team-window";
import { SEASON } from "@/app/lib/season-config";

type SeasonMode = "offseason" | "inseason";

export function franchiseOptionLabel(
  team: Pick<Team, "id" | "name">,
  phase: string,
  mode: SeasonMode,
): string {
  const seasonPhase = mode === "offseason" ? "Off-Season" : "In-Season";
  return `Select ${team.id} — ${team.name} — ${SEASON.label} ${seasonPhase} — ${phase}`;
}

export function TeamSelectModal({
  teams,
  selectedHomeId,
  mode,
  onModeChange,
  onSelectTeam,
  onClose,
}: {
  teams: Team[];
  selectedHomeId: string | undefined;
  mode: SeasonMode;
  onModeChange: (mode: SeasonMode) => void;
  onSelectTeam: (team: Team) => void;
  onClose: () => void;
}) {
  const dialog = useDialog({ open: true, onClose, label: "Select your franchise" });

  const [selectingTeamId, setSelectingTeamId] = React.useState<string | null>(null);

  if (typeof document === "undefined") return null;
  return createPortal(
    (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(28,20,10,0.88)', backdropFilter: 'blur(4px)' }}>
      <div {...dialog} className="relative w-full max-w-lg"
        style={{ background: 'var(--ledger-card-light)', borderRadius: '2px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>

        {/* Header rule */}
        <div style={{ borderTop: '4px double #1c140a', borderBottom: '1px solid #b8a070', padding: '20px 28px 14px' }}>
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-[0.5em] mb-2 text-ledger-ink-faint font-mono">
              Cap & Crease · GM Challenge
            </div>
            <h2 className="font-black" style={{ fontSize: '1.6rem', color: 'var(--ledger-ink)', lineHeight: 1.1 }}>
              Think you can do better<br/>than your GM?
            </h2>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--ledger-brown)', fontStyle: 'italic' }}>
              Pick your franchise. Make your moves. Sim a year and find out if you had what it takes — or if your GM was right all along.
            </p>
          </div>
        </div>

        <div style={{ padding: '16px 28px 20px' }}>
          {/* Mode picker — off-season runs a re-sign phase first */}
          <div className="flex gap-2 mb-4">
            {([
              ["offseason", "Off-Season", "Re-sign free agents, then trade"],
              ["inseason", "In-Season", "Jump straight to trades"],
            ] as const).map(([m, label, sub]) => {
              const active = mode === m;
              return (
                <button key={m} type="button" onClick={() => onModeChange(m)}
                  className="min-h-11 flex-1 text-left px-3 py-2 transition-all"
                  aria-pressed={active}
                  aria-label={`${SEASON.label} ${label}: ${sub}`}
                  style={{
                    background: 'var(--ledger-card)',
                    border: active ? '2px solid var(--ledger-red)' : '1px solid var(--ledger-rule-mid)',
                    borderRadius: '2px',
                  }}>
                  <div className="text-[11px] font-black uppercase tracking-wider font-mono"
                    style={{ color: active ? 'var(--ledger-red)' : 'var(--ledger-ink)' }}>{active ? `◆ ${label}` : label}</div>
                  <div className="text-[9px] font-mono"
                    style={{ color: 'var(--ledger-ink-faint)' }}>{sub}</div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between items-center mb-3">
            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-ledger-ink-faint font-mono">
              Select Your Franchise
            </div>
            <button type="button" onClick={onClose} aria-label="Close franchise picker"
              className="min-h-11 min-w-11 text-[10px] uppercase font-bold text-ledger-ink-faint hover:text-ledger-ink transition-colors inline-flex items-center justify-center px-3 py-2 -mr-2">
              Close ✕
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-4" style={{ maxHeight: '260px', overflowY: 'auto' }}>
            {/* Copy first — `.sort()` mutates, and `teams` is shared store
                state. Sorting it here reordered the league for every other
                consumer as a side effect of opening a modal (CXS1). */}
            {[...teams]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(t => {
                const isSelected = selectedHomeId === t.id;
                const phase = teamWindow(t);
                const phaseColor =
                  phase === "Contender"  ? 'var(--ledger-green)' :
                  phase === "Bubble"     ? 'var(--ledger-ice)' :
                  phase === "Retooling"  ? 'var(--ledger-amber)' :
                  phase === "Rebuilding" ? 'var(--ledger-red)' :
                  'var(--ledger-brown)';
                const isSelecting = selectingTeamId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={Boolean(selectingTeamId)}
                    onClick={() => {
                      setSelectingTeamId(t.id);
                      onSelectTeam(t);
                      window.setTimeout(() => {
                        onClose();
                        setSelectingTeamId(null);
                      }, 120);
                    }}
                    className="min-h-[96px] min-w-[44px] p-2 text-left transition-all disabled:cursor-wait"
                    aria-pressed={isSelected}
                    aria-busy={isSelecting}
                    // The crest is aria-hidden and the only other text was the
                    // stage ("Bubble"), so assistive tech heard 32 buttons named
                    // only by stage. Name each one by its club, and show the
                    // abbreviation so sighted users aren't guessing 32 logos.
                    aria-label={franchiseOptionLabel(t, phase, mode)}
                    style={{
                      background: isSelected ? 'var(--ledger-warm)' : 'var(--ledger-card)',
                      border: isSelected ? '2px solid var(--ledger-red)' : '1px solid var(--ledger-rule-mid)',
                      borderRadius: '2px',
                      opacity: selectingTeamId && !isSelecting ? 0.45 : 1,
                    }}
                  >
                    <div className="flex flex-col items-center justify-center gap-1 py-1">
                      <TeamMark id={t.id} size={32} />
                      <div className="text-[10px] font-black uppercase tracking-wider text-center leading-none"
                        style={{ color: isSelected ? 'var(--ledger-red)' : 'var(--ledger-ink)' }}>
                        {isSelected ? "◆ " : ""}{t.id}
                      </div>
                      <div className="text-[8px] font-bold text-center leading-tight" style={{ color: 'var(--ledger-ink)' }}>
                        {t.name}
                      </div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-center leading-tight" style={{
                        color: phaseColor,
                        lineHeight: 1.1
                      }}>
                        {isSelecting ? "Loading" : phase}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>

          <p className="text-center mt-2 text-[11px] text-ledger-rule font-mono">
            Tap a team to take control. Reset via Void All Trades.
          </p>
        </div>
      </div>
    </div>
    ),
    document.body
  );
}
