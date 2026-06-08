"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTradeStore } from "@/app/store/tradeStore";
import { useScenarioStore, type SavedScenario } from "@/app/store/scenarioStore";
import type { Asset, Team } from "@/app/lib/trade-types";

interface Props {
  db: { teams: Team[]; players: Asset[] } | null;
}

// ── SaveModal ─────────────────────────────────────────────────
function SaveModal({ onSave, onClose }: {
  onSave:  (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => { if (name.trim()) onSave(name.trim()); };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className="border p-6 font-mono"
        style={{
          background: "var(--ledger-warm)", borderColor: "var(--ledger-rule)",
          minWidth: 320,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-2xs font-black uppercase tracking-[0.3em] mb-4"
          style={{ color: "var(--ledger-ink)" }}>
          Name This Scenario
        </div>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
          placeholder="e.g. Scheifele for Fantilli"
          className="w-full text-[12px] font-mono mb-4 outline-none"
          style={{
            background: "var(--ledger-card)", borderBottom: "2px solid var(--ledger-ink)",
            color: "var(--ledger-ink)", padding: "6px 2px",
          }}
        />
        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="flex-1 text-2xs font-black uppercase tracking-widest py-2 transition-opacity"
            style={{
              background: "var(--ledger-ink)", color: "var(--ledger-warm)",
              opacity: name.trim() ? 1 : 0.35, cursor: name.trim() ? "pointer" : "default",
            }}
          >
            File Report
          </button>
          <button
            onClick={onClose}
            className="text-2xs font-black uppercase tracking-widest px-4 py-2 border"
            style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink-faint)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ScenarioRow ───────────────────────────────────────────────
function ScenarioRow({ s, onLoad, onDelete, onRename }: {
  s:        SavedScenario;
  onLoad:   () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(s.name);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== s.name) onRename(t);
    setEditing(false);
  };

  const ago = (() => {
    const m = Math.floor((Date.now() - s.savedAt) / 60000);
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b font-mono"
      style={{ borderColor: "var(--ledger-rule)" }}>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            className="w-full text-[11px] font-mono outline-none"
            style={{ background: "transparent", borderBottom: "1px solid var(--ledger-ink)", color: "var(--ledger-ink)", padding: "1px 2px" }}
          />
        ) : (
          <div
            onClick={() => setEditing(true)}
            title="Click to rename"
            className="text-[11px] font-black truncate cursor-text"
            style={{ color: "var(--ledger-ink)" }}
          >
            {s.name}
          </div>
        )}
        <div className="text-[9px] uppercase tracking-[0.1em] mt-0.5"
          style={{ color: "var(--ledger-ink-faint)" }}>
          {s.homeTeam && s.partnerTeam
            ? `${s.homeTeam} ↔ ${s.partnerTeam} · ${ago}`
            : ago}
        </div>
      </div>
      <button
        onClick={onLoad}
        className="text-[9px] font-black uppercase tracking-widest px-2 py-1 border shrink-0 transition-opacity hover:opacity-70"
        style={{ borderColor: "var(--ledger-ink)", color: "var(--ledger-ink)", background: "transparent" }}
      >
        Load
      </button>
      <button
        onClick={onDelete}
        className="text-[10px] px-1.5 py-1 border transition-opacity hover:opacity-70"
        style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink-faint)" }}
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}

// ── TradeHistoryBar ───────────────────────────────────────────
export default function TradeHistoryBar({ db }: Props) {
  const teams     = useTradeStore(s => s.teams);
  const blocks    = useTradeStore(s => s.blocks);
  const setTeams  = useTradeStore(s => s.setTeams);
  const setBlocks = useTradeStore(s => s.setBlocks);

  const { savedScenarios, saveScenario, deleteScenario, renameScenario } = useScenarioStore();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPanel,     setShowPanel]     = useState(false);
  const [linkCopied,    setLinkCopied]    = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasActiveTrade = teams[0] || teams[1] || blocks[0].length || blocks[1].length;

  useEffect(() => {
    if (!showPanel) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowPanel(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showPanel]);

  const handleSave = (name: string) => {
    saveScenario({
      name,
      url:         window.location.search,
      homeTeam:    teams[0]?.id ?? null,
      partnerTeam: teams[1]?.id ?? null,
    });
    setShowSaveModal(false);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  // Load scenario in-place — no page reload, no team-select modal
  const handleLoad = (s: SavedScenario) => {
    if (!db) return;
    const p = new URLSearchParams(s.url);

    const homeTeam    = db.teams.find(t => t.id === p.get("home"))    ?? null;
    const partnerTeam = db.teams.find(t => t.id === p.get("partner")) ?? null;

    const parseBlock = (str: string | null): Asset[] => {
      if (!str) return [];
      return str.split(",").flatMap(token => {
        const [id, retStr] = token.split(":");
        const asset = db.players.find(pl => pl.id === id);
        if (!asset) return [];
        return [{ ...asset, retainedPct: retStr ? parseInt(retStr) / 100 : 0 }];
      });
    };

    setTeams([homeTeam, partnerTeam]);
    setBlocks([parseBlock(p.get("out")), parseBlock(p.get("in"))]);

    // Sync URL without triggering a reload
    window.history.replaceState({}, "", `${window.location.pathname}${s.url}`);
    setShowPanel(false);
  };

  return (
    <>
      {/* Bar */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b font-mono"
        style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-warm)" }}
      >
        <span className="text-[9px] uppercase tracking-[0.35em] mr-1 hidden sm:block"
          style={{ color: "var(--ledger-ink-faint)" }}>
          Scenarios
        </span>

        {/* Save */}
        <button
          onClick={() => setShowSaveModal(true)}
          disabled={!hasActiveTrade}
          className="text-[10px] font-black uppercase tracking-widest px-3 py-1 border transition-opacity"
          style={{
            borderColor: hasActiveTrade ? "var(--ledger-ink)" : "var(--ledger-rule)",
            color:       hasActiveTrade ? "var(--ledger-ink)" : "var(--ledger-ink-faint)",
            background:  "transparent",
            cursor:      hasActiveTrade ? "pointer" : "default",
            opacity:     hasActiveTrade ? 1 : 0.4,
          }}
        >
          + Save
        </button>

        {/* Share link */}
        <button
          onClick={handleShare}
          disabled={!hasActiveTrade}
          className="text-[10px] font-black uppercase tracking-widest px-3 py-1 border transition-opacity"
          style={{
            borderColor: "var(--ledger-rule)",
            color:       linkCopied ? "var(--ledger-green, #2a7a3c)" : "var(--ledger-ink-faint)",
            background:  "transparent",
            cursor:      hasActiveTrade ? "pointer" : "default",
            opacity:     hasActiveTrade ? 1 : 0.4,
          }}
        >
          {linkCopied ? "✓ Copied" : "⬡ Share Link"}
        </button>

        {/* Scenarios dropdown */}
        <div className="relative ml-auto" ref={panelRef}>
          <button
            onClick={() => setShowPanel(v => !v)}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-1 border transition-colors"
            style={{
              borderColor: showPanel ? "var(--ledger-ink)" : "var(--ledger-rule)",
              color:       showPanel ? "var(--ledger-ink)" : "var(--ledger-ink-faint)",
              background:  showPanel ? "var(--ledger-card)" : "transparent",
            }}
          >
            Filed Reports{savedScenarios.length > 0 && ` (${savedScenarios.length})`}
          </button>

          {showPanel && (
            <div
              className="absolute right-0 top-[calc(100%+4px)] z-[200] border overflow-y-auto"
              style={{
                background:  "var(--ledger-warm)",
                borderColor: "var(--ledger-rule)",
                minWidth:    300,
                maxWidth:    380,
                maxHeight:   400,
                boxShadow:   "0 8px 32px rgba(0,0,0,0.25)",
              }}
            >
              {savedScenarios.length === 0 ? (
                <div className="px-4 py-5 text-[10px] uppercase tracking-[0.2em] font-mono"
                  style={{ color: "var(--ledger-ink-faint)" }}>
                  No filed reports yet
                </div>
              ) : savedScenarios.map(s => (
                <ScenarioRow
                  key={s.id}
                  s={s}
                  onLoad={() => handleLoad(s)}
                  onDelete={() => deleteScenario(s.id)}
                  onRename={name => renameScenario(s.id, name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showSaveModal && (
        <SaveModal onSave={handleSave} onClose={() => setShowSaveModal(false)} />
      )}
    </>
  );
}
