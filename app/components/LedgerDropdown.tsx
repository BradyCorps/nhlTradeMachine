"use client";
import React, { useState, useEffect } from 'react';

export default function LedgerDropdown({ teams, selectedId, onSelect }: {
  teams: any[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = teams.find(t => t.id === selectedId);

  // Lock background scroll & prevent layout shift from scrollbar disappearing
  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.paddingRight = '0px';
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.paddingRight = '0px';
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <div className="relative flex-1 min-w-0">
      {/* Headline-style trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-full text-left pb-1 flex justify-between items-baseline group hover:opacity-70 transition-opacity"
        style={{ borderBottom: '2px solid var(--rule)' }}
      >
        <span className="font-black leading-tight truncate pr-2" style={{
          fontFamily: "'Libre Baskerville', serif",
          color: 'var(--ink)',
          fontSize: 'clamp(1.2rem, 3vw, 1.6rem)',
        }}>
          {selected?.name || "Select Team"}
        </span>
        <span className="text-[8px] font-black shrink-0" style={{ color: 'var(--rule)' }}>▼</span>
      </button>

      {/* Tear-off modal overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(38,30,18,0.4)', backdropFilter: 'blur(2px)' }}
          onClick={() => setIsOpen(false)}
        >
          <div
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
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}