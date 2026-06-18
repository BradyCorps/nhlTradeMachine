"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTradeStore } from "@/app/store/tradeStore";
import { useScenarioStore, type SavedScenario, type ScenarioAsset } from "@/app/store/scenarioStore";

// ── SaveModal ─────────────────────────────────────────────────
function SaveModal({ onSave, onClose }: {
  onSave:  (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = () => { if (name.trim()) onSave(name.trim()); };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)" }} onClick={onClose}>
      <div className="border p-6 font-mono" onClick={e => e.stopPropagation()}
        style={{ background: "var(--ledger-warm)", borderColor: "var(--ledger-rule)", minWidth: 320 }}>
        <div className="text-2xs font-black uppercase tracking-[0.3em] mb-4"
          style={{ color: "var(--ledger-ink)" }}>
          File This Report
        </div>
        <input
          ref={ref}
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
          <button onClick={submit} disabled={!name.trim()}
            className="flex-1 text-2xs font-black uppercase tracking-widest py-2"
            style={{
              background: "var(--ledger-ink)", color: "var(--ledger-warm)",
              opacity: name.trim() ? 1 : 0.35, cursor: name.trim() ? "pointer" : "default",
            }}>
            File Report
          </button>
          <button onClick={onClose}
            className="text-2xs font-black uppercase tracking-widest px-4 py-2 border"
            style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink-faint)" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AssetLine — one player row inside a trade card ────────────
function AssetLine({ a }: { a: ScenarioAsset }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-[9px] font-black uppercase shrink-0"
          style={{ color: "var(--ledger-ink-faint)" }}>
          {a.position}
        </span>
        <span className="text-[11px] font-bold truncate" style={{ color: "var(--ledger-ink)" }}>
          {a.name}
        </span>
        {a.age && (
          <span className="text-[9px] shrink-0" style={{ color: "var(--ledger-ink-faint)" }}>
            {a.age}
          </span>
        )}
      </div>
      <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--ledger-ink-faint)" }}>
        ${a.capHit.toFixed(2)}M
      </span>
    </div>
  );
}

// ── TradeCard — read-only summary of one saved scenario ───────
function TradeCard({ s, onDelete, onRename }: {
  s:        SavedScenario;
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

  const date = new Date(s.savedAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="border-b font-mono" style={{ borderColor: "var(--ledger-rule)" }}>
      {/* Card header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-1">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input autoFocus value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
              className="w-full text-[11px] font-mono font-black outline-none"
              style={{ background: "transparent", borderBottom: "1px solid var(--ledger-ink)", color: "var(--ledger-ink)", padding: "1px 2px" }}
            />
          ) : (
            <div onClick={() => setEditing(true)} title="Click to rename"
              className="text-[11px] font-black truncate cursor-text"
              style={{ color: "var(--ledger-ink)" }}>
              {s.name}
            </div>
          )}
          <div className="text-[9px] uppercase tracking-[0.08em] mt-0.5"
            style={{ color: "var(--ledger-ink-faint)" }}>
            {date}
          </div>
        </div>
        <button onClick={onDelete} title="Delete"
          className="text-[10px] px-1.5 py-0.5 border mt-0.5 transition-opacity hover:opacity-70 shrink-0"
          style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink-faint)" }}>
          ✕
        </button>
      </div>

      {/* Trade body */}
      <div className="grid grid-cols-2 gap-0 px-4 pb-3">
        {/* Outgoing */}
        <div className="pr-3 border-r" style={{ borderColor: "var(--ledger-rule)" }}>
          <div className="text-[8px] font-black uppercase tracking-[0.2em] mb-1"
            style={{ color: "var(--ledger-ink-faint)" }}>
            {s.homeTeam?.id ?? "—"} sends
          </div>
          {s.outgoing.length === 0
            ? <div className="text-[9px] italic" style={{ color: "var(--ledger-ink-faint)" }}>nothing</div>
            : s.outgoing.map((a, i) => <AssetLine key={i} a={a} />)
          }
        </div>
        {/* Incoming */}
        <div className="pl-3">
          <div className="text-[8px] font-black uppercase tracking-[0.2em] mb-1"
            style={{ color: "var(--ledger-ink-faint)" }}>
            {s.partnerTeam?.id ?? "—"} sends
          </div>
          {s.incoming.length === 0
            ? <div className="text-[9px] italic" style={{ color: "var(--ledger-ink-faint)" }}>nothing</div>
            : s.incoming.map((a, i) => <AssetLine key={i} a={a} />)
          }
        </div>
      </div>
    </div>
  );
}

// ── TradeHistoryBar ───────────────────────────────────────────
export default function TradeHistoryBar() {
  const teams  = useTradeStore(s => s.teams);
  const blocks = useTradeStore(s => s.blocks);

  const { savedScenarios, saveScenario, deleteScenario, renameScenario } = useScenarioStore();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPanel,     setShowPanel]     = useState(false);
  const [linkCopied,    setLinkCopied]    = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasActiveTrade = (teams[0] || teams[1] || blocks[0].length || blocks[1].length);

  useEffect(() => {
    if (!showPanel) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowPanel(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showPanel]);

  const handleSave = (name: string) => {
    const toAsset = (a: any): ScenarioAsset => ({
      id:       a.id,
      name:     a.name,
      teamId:   a.teamId,
      position: a.position ?? "",
      capHit:   a.capHit   ?? 0,
      age:      a.age,
      retainedPct: a.retainedPct ?? 0,
      round:    a.round ?? null,
      year:     a.year ?? null,
    });

    saveScenario({
      name,
      homeTeam:    teams[0] ? { id: teams[0].id, name: teams[0].name } : null,
      partnerTeam: teams[1] ? { id: teams[1].id, name: teams[1].name } : null,
      outgoing:    blocks[0].map(toAsset),
      incoming:    blocks[1].map(toAsset),
    });
    setShowSaveModal(false);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  return (
    <>
      {/* Bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b font-mono"
        style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-warm)" }}>

        <span className="text-[9px] uppercase tracking-[0.35em] mr-1 hidden sm:block"
          style={{ color: "var(--ledger-ink-faint)" }}>
          Scenarios
        </span>

        {/* Save */}
        <button
          onClick={() => setShowSaveModal(true)}
          disabled={!hasActiveTrade}
          className="text-[10px] font-black uppercase tracking-widest px-3 py-1 border"
          style={{
            borderColor: hasActiveTrade ? "var(--ledger-ink)" : "var(--ledger-rule)",
            color:       hasActiveTrade ? "var(--ledger-ink)" : "var(--ledger-ink-faint)",
            background:  "transparent",
            cursor:      hasActiveTrade ? "pointer" : "default",
            opacity:     hasActiveTrade ? 1 : 0.4,
          }}>
          + Save
        </button>

        {/* Share */}
        <button
          onClick={handleShare}
          disabled={!hasActiveTrade}
          className="text-[10px] font-black uppercase tracking-widest px-3 py-1 border"
          style={{
            borderColor: "var(--ledger-rule)",
            color:       linkCopied ? "var(--ledger-green, #2a7a3c)" : "var(--ledger-ink-faint)",
            background:  "transparent",
            cursor:      hasActiveTrade ? "pointer" : "default",
            opacity:     hasActiveTrade ? 1 : 0.4,
          }}>
          {linkCopied ? "✓ Copied" : "⬡ Share Link"}
        </button>

        {/* Filed Reports panel */}
        <div className="relative ml-auto" ref={panelRef}>
          <button
            onClick={() => setShowPanel(v => !v)}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-1 border transition-colors"
            style={{
              borderColor: showPanel ? "var(--ledger-ink)" : "var(--ledger-rule)",
              color:       showPanel ? "var(--ledger-ink)" : "var(--ledger-ink-faint)",
              background:  showPanel ? "var(--ledger-card)" : "transparent",
            }}>
            Filed Reports{savedScenarios.length > 0 && ` (${savedScenarios.length})`}
          </button>

          {showPanel && (
            <div className="absolute right-0 top-[calc(100%+4px)] z-[200] border overflow-y-auto"
              style={{
                background:  "var(--ledger-warm)",
                borderColor: "var(--ledger-rule)",
                minWidth:    340,
                maxWidth:    420,
                maxHeight:   520,
                boxShadow:   "0 8px 32px rgba(0,0,0,0.25)",
              }}>

              {/* Panel header */}
              <div className="px-4 py-2.5 border-b flex items-center justify-between"
                style={{ borderColor: "var(--ledger-rule)" }}>
                <span className="text-[9px] font-black uppercase tracking-[0.3em]"
                  style={{ color: "var(--ledger-ink-faint)" }}>
                  Trade Analysis Archive
                </span>
                {savedScenarios.length > 0 && (
                  <span className="text-[9px]" style={{ color: "var(--ledger-ink-faint)" }}>
                    {savedScenarios.length} report{savedScenarios.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {savedScenarios.length === 0 ? (
                <div className="px-4 py-6 text-[10px] uppercase tracking-[0.2em] font-mono text-center"
                  style={{ color: "var(--ledger-ink-faint)" }}>
                  No reports filed yet
                </div>
              ) : savedScenarios.map(s => (
                <TradeCard
                  key={s.id}
                  s={s}
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
