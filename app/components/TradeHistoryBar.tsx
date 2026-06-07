"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTradeStore } from "@/app/store/tradeStore";
import { useScenarioStore, type SavedScenario } from "@/app/store/scenarioStore";

const MONO: React.CSSProperties = { fontFamily: "'Courier Prime', monospace" };

// ── Btn — minimal control button ────────────────────────────
function Btn({ onClick, disabled, children, title, style }: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...MONO,
        fontSize: 10, fontWeight: 900, letterSpacing: "0.12em",
        padding: "4px 10px", cursor: disabled ? "default" : "pointer",
        border: "1px solid",
        transition: "opacity 0.1s",
        opacity: disabled ? 0.3 : 1,
        background: "transparent",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── SaveModal — name input before saving ──────────────────────
function SaveModal({ onSave, onClose }: {
  onSave:  (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a1208", border: "1px solid #5a4a2a",
          padding: "24px", minWidth: 320, ...MONO,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 12, fontWeight: 900, color: "#e4d8b8", marginBottom: 16, letterSpacing: "0.1em" }}>
          SAVE SCENARIO
        </div>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
          placeholder="e.g. Scheifele for Fantilli"
          style={{
            width: "100%", background: "#0f0c07", border: "1px solid #3a2e1a",
            color: "#e4d8b8", padding: "8px 10px", fontSize: 12,
            outline: "none", ...MONO, marginBottom: 16, boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={submit}
            disabled={!name.trim()}
            style={{
              flex: 1, ...MONO, fontSize: 11, fontWeight: 900, letterSpacing: "0.1em",
              padding: "7px 0", background: "#1a3a1a", border: "1px solid #2a6a2a",
              color: "#6bcf6b", cursor: name.trim() ? "pointer" : "default",
              opacity: name.trim() ? 1 : 0.4,
            }}
          >
            SAVE
          </button>
          <button
            onClick={onClose}
            style={{
              ...MONO, fontSize: 11, fontWeight: 900, letterSpacing: "0.1em",
              padding: "7px 16px", background: "transparent", border: "1px solid #2a1e0a",
              color: "#5a4a2a", cursor: "pointer",
            }}
          >
            CANCEL
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

  const commitRename = () => {
    const t = draft.trim();
    if (t && t !== s.name) onRename(t);
    setEditing(false);
  };

  const ago = (() => {
    const diff = Date.now() - s.savedAt;
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px", borderBottom: "1px solid #1a1208",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditing(false); }}
            style={{
              background: "#0f0c07", border: "1px solid #3a2e1a", color: "#e4d8b8",
              fontSize: 11, padding: "2px 6px", outline: "none", width: "100%", ...MONO,
            }}
          />
        ) : (
          <div
            onClick={() => setEditing(true)}
            title="Click to rename"
            style={{ fontSize: 11, fontWeight: 700, color: "#e4d8b8", cursor: "text",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {s.name}
          </div>
        )}
        <div style={{ fontSize: 9, color: "#5a4a2a", letterSpacing: "0.08em", marginTop: 2 }}>
          {s.homeTeam && s.partnerTeam
            ? `${s.homeTeam} ↔ ${s.partnerTeam} · ${ago}`
            : ago}
        </div>
      </div>
      <button
        onClick={onLoad}
        style={{
          ...MONO, fontSize: 9, fontWeight: 900, letterSpacing: "0.1em",
          padding: "3px 8px", background: "#1e3a5f", border: "1px solid #2a5a8f",
          color: "#7ec8e3", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        LOAD
      </button>
      <button
        onClick={onDelete}
        style={{
          ...MONO, fontSize: 9, fontWeight: 900, letterSpacing: "0.1em",
          padding: "3px 6px", background: "transparent", border: "1px solid #3a1a1a",
          color: "#5a3030", cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────
export default function TradeHistoryBar() {
  const past    = useTradeStore(s => s.past);
  const future  = useTradeStore(s => s.future);
  const undo    = useTradeStore(s => s.undo);
  const redo    = useTradeStore(s => s.redo);
  const teams   = useTradeStore(s => s.teams);
  const blocks  = useTradeStore(s => s.blocks);

  const { savedScenarios, saveScenario, deleteScenario, renameScenario } = useScenarioStore();

  const [showSaveModal,    setShowSaveModal]    = useState(false);
  const [showScenarios,    setShowScenarios]    = useState(false);
  const [linkCopied,       setLinkCopied]       = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const canUndo = past.length   > 0;
  const canRedo = future.length > 0;

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); if (canUndo) undo(); }
      if ((e.key === "y") || (e.key === "z" && e.shiftKey)) { e.preventDefault(); if (canRedo) redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canUndo, canRedo, undo, redo]);

  // Close panel on outside click
  useEffect(() => {
    if (!showScenarios) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowScenarios(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showScenarios]);

  const handleSave = (name: string) => {
    const url = window.location.search;
    saveScenario({
      name,
      url,
      homeTeam:    teams[0]?.id ?? null,
      partnerTeam: teams[1]?.id ?? null,
    });
    setShowSaveModal(false);
  };

  const handleLoad = (s: SavedScenario) => {
    window.location.search = s.url;
    setShowScenarios(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const hasActiveTrade = teams[0] || teams[1] || blocks[0].length || blocks[1].length;

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 24px", borderBottom: "1px solid #1a1208",
        background: "#0f0c07", ...MONO,
      }}>
        {/* Undo / Redo */}
        <Btn
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          style={{ borderColor: canUndo ? "#3a2e1a" : "#1a1208", color: "#8a7a5a" }}
        >
          ↩ UNDO
        </Btn>
        <Btn
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          style={{ borderColor: canRedo ? "#3a2e1a" : "#1a1208", color: "#8a7a5a" }}
        >
          REDO ↪
        </Btn>

        <span style={{ color: "#1a1208", fontSize: 10 }}>|</span>

        {/* Save + Share */}
        <Btn
          onClick={() => setShowSaveModal(true)}
          disabled={!hasActiveTrade}
          title="Save this scenario"
          style={{ borderColor: "#1e3a1e", color: "#6bcf6b" }}
        >
          + SAVE
        </Btn>
        <Btn
          onClick={handleCopyLink}
          disabled={!hasActiveTrade}
          title="Copy shareable link"
          style={{ borderColor: "#1e3a5f", color: "#7ec8e3" }}
        >
          {linkCopied ? "✓ COPIED" : "⬡ SHARE"}
        </Btn>

        {/* Scenarios panel trigger */}
        <div style={{ position: "relative" }} ref={panelRef}>
          <Btn
            onClick={() => setShowScenarios(v => !v)}
            style={{
              borderColor: showScenarios ? "#5a4a2a" : "#2a1e0a",
              color: showScenarios ? "#e4d8b8" : "#8a7a5a",
            }}
          >
            SCENARIOS {savedScenarios.length > 0 && `(${savedScenarios.length})`}
          </Btn>

          {showScenarios && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200,
              background: "#1a1208", border: "1px solid #3a2e1a",
              minWidth: 300, maxWidth: 380, maxHeight: 420, overflowY: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            }}>
              {savedScenarios.length === 0 ? (
                <div style={{ padding: "16px 12px", fontSize: 11, color: "#5a4a2a",
                  letterSpacing: "0.1em" }}>
                  NO SAVED SCENARIOS
                </div>
              ) : savedScenarios.map(s => (
                <ScenarioRow
                  key={s.id}
                  s={s}
                  onLoad={() => handleLoad(s)}
                  onDelete={() => deleteScenario(s.id)}
                  onRename={(name) => renameScenario(s.id, name)}
                />
              ))}
            </div>
          )}
        </div>

        {/* History depth indicator */}
        {canUndo && (
          <span style={{ fontSize: 9, color: "#3a2e1a", marginLeft: "auto",
            letterSpacing: "0.08em" }}>
            {past.length} step{past.length !== 1 ? "s" : ""} back
          </span>
        )}
      </div>

      {showSaveModal && (
        <SaveModal onSave={handleSave} onClose={() => setShowSaveModal(false)} />
      )}
    </>
  );
}
