"use client";
import React, { useState } from 'react';
import { TeamMark } from "@/app/components/TeamMark";
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from "@/app/lib/use-body-scroll-lock";

export default function LedgerDropdown({ teams, selectedId, onSelect }: {
  teams: any[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = teams.find(t => t.id === selectedId);
  useBodyScrollLock(isOpen);

  return (
    <div className="relative flex-1 min-w-0">
      {/* Headline-style trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-full text-left pb-1 flex justify-between items-baseline group hover:opacity-70 transition-opacity"
        style={{ borderBottom: '2px solid var(--rule)' }}
      >
        <span className="font-black leading-tight truncate pr-2 flex items-center gap-2" style={{
          fontFamily: "'Libre Baskerville', serif",
          color: 'var(--ink)',
          fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
        }}>
          {selected?.id && (
            <TeamMark id={selected.id} size={32} />
          )}
          {selected?.name || "Select Team"}
        </span>
        <span className="text-xs font-black shrink-0" style={{ color: 'var(--rule)' }}>▼</span>
      </button>

      {/* Tear-off modal overlay */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(38,30,18,0.4)', backdropFilter: 'blur(2px)' }}
            onClick={() => setIsOpen(false)}
            onKeyDown={(e) => { if (e.key === "Escape") setIsOpen(false); }}
          >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Select a team"
            className="w-full max-w-sm max-h-[80vh] overflow-y-auto animate-modal-pop"
            style={{
              background: 'var(--paper)',
              border: '2px solid var(--rule)',
              padding: '24px',
              boxShadow: '4px 4px 0 rgba(0,0,0,0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-[9px] font-black uppercase tracking-widest mb-4 pb-2"
              style={{ color: 'var(--ink-faint)', borderBottom: '1px solid var(--rule)', fontFamily: "'Courier Prime', monospace" }}>
              Select a Team
            </div>

            <div className="space-y-0.5">
              {teams.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { onSelect(t.id); setIsOpen(false); }}
                  className="w-full text-left px-3 py-2.5 transition-colors"
                  style={{
                    color: 'var(--ink)',
                    fontFamily: "'Libre Baskerville', serif",
                    fontSize: '13px',
                    fontWeight: selectedId === t.id ? '900' : '700',
                    background: selectedId === t.id ? 'var(--paper-inset)' : 'transparent',
                    borderLeft: selectedId === t.id ? '2px solid var(--red)' : '2px solid transparent',
                  }}
                  onMouseEnter={e => {
                    if (t.id !== selectedId) (e.currentTarget as HTMLElement).style.background = 'var(--paper-card)';
                  }}
                  onMouseLeave={e => {
                    if (t.id !== selectedId) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <div className="flex items-center gap-2">
                      <TeamMark id={t.id} size={20} />
                      <span>{t.name}</span>
                    </div>
                    {t.phase && (
                      <span style={{
                        fontSize: 9, fontWeight: 900, textTransform: 'uppercase',
                        letterSpacing: '0.08em', flexShrink: 0,
                        fontFamily: "'Courier Prime', monospace",
                        color:
                          t.phase === 'Contender'  ? 'var(--green)'  :
                          t.phase === 'Bubble'     ? 'var(--ledger-ice)'   :
                          t.phase === 'Retooling'  ? 'var(--amber)'  :
                          t.phase === 'Rebuilding' ? 'var(--red)'    :
                          'var(--brown)',
                      }}>
                        {t.phase}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        ),
        document.body
      )}
    </div>
  );
}
