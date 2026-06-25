"use client";

import React, { useEffect, useState, useMemo } from "react";
import { adminErrorMessage, readAdminResponse } from "../admin-response";
import { toast } from "@/app/lib/ledger-toast";

interface TeamRow {
  id:               string;
  name:             string;
  fallbackPhase:    string;
  fallbackStanding: number;
  phaseOverride:    string | null;
  standingOverride: number | null;
}

const PHASES = ["Contender", "Bubble", "Retooling", "Rebuilding", "Tanking"];

function EditModal({ team, onSave, onClose }: {
  team: TeamRow;
  onSave: (id: string, phase: string | null, standing: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const [phase,    setPhase]    = useState(team.phaseOverride ?? "");
  const [standing, setStanding] = useState(team.standingOverride?.toString() ?? "");
  const [saving,   setSaving]   = useState(false);

  const handle = async (clear = false) => {
    setSaving(true);
    try {
      if (clear) {
        await onSave(team.id, null, null);
      } else {
        await onSave(
          team.id,
          phase.trim()    !== "" ? phase.trim()       : null,
          standing.trim() !== "" ? parseInt(standing) : null,
        );
      }
      onClose();
    } catch {
      // Parent handler reports the failure and keeps this modal open.
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "var(--paper)", border: "1px solid var(--rule)",
    color: "var(--ledger-ink)", padding: "6px 10px", fontSize: 12,
    fontFamily: "'Courier Prime', monospace", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 9, color: "var(--ledger-ink-faint)",
    textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3,
    fontFamily: "'Courier Prime', monospace",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(28,20,10,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        borderTop: "3px solid var(--ledger-ink)", padding: 24,
        minWidth: 320, maxWidth: 380, fontFamily: "'Courier Prime', monospace",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "var(--ledger-ink)", marginBottom: 4 }}>{team.name}</div>
        <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", marginBottom: 18, letterSpacing: "0.1em" }}>
          FALLBACK: {team.fallbackPhase} · #{team.fallbackStanding}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>Phase Override</label>
            <select value={phase} onChange={e => setPhase(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">— use live —</option>
              {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Standing Override</label>
            <input value={standing} onChange={e => setStanding(e.target.value)}
              placeholder={String(team.fallbackStanding)} type="number" min="1" max="32" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => handle(false)} disabled={saving}
            style={{ flex: 1, padding: "8px 0", background: "var(--ledger-ink)", border: "none",
              color: "var(--paper)", fontSize: 11, fontWeight: 900, cursor: "pointer", letterSpacing: "0.12em" }}>
            {saving ? "SAVING…" : "SAVE"}
          </button>
          <button onClick={() => handle(true)} disabled={saving}
            style={{ padding: "8px 12px", background: "transparent", border: "1px solid var(--rule)",
              color: "var(--ledger-ink-faint)", fontSize: 11, fontWeight: 900, cursor: "pointer", letterSpacing: "0.12em" }}>
            CLEAR
          </button>
          <button onClick={onClose}
            style={{ padding: "8px 12px", background: "transparent", border: "1px solid var(--rule)",
              color: "var(--ledger-ink-faint)", fontSize: 11, fontWeight: 900, cursor: "pointer", letterSpacing: "0.12em" }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTeams() {
  const [teams,   setTeams]   = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [search,  setSearch]  = useState("");
  const load = () => {
    setLoading(true);
    fetch("/api/admin/teams")
      .then(r => r.json())
      .then(d => { setTeams(d.teams ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = async (id: string, phase: string | null, standing: number | null) => {
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, phaseOverride: phase, standingOverride: standing }),
      });
      await readAdminResponse(res, "Save failed");
      toast(`Saved ${id}`, "success");
      load();
    } catch (e) {
      toast(adminErrorMessage(e, "Save failed"), "error");
      throw e;
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return teams;
    const q = search.toLowerCase();
    return teams.filter(t => t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [teams, search]);

  const hasOverride = (t: TeamRow) => t.phaseOverride !== null || t.standingOverride !== null;

  return (
    <div style={{ minHeight: "calc(100vh - 42px)", background: "var(--paper)", color: "var(--ledger-ink)", fontFamily: "'Courier Prime', monospace" }}>

      {/* Page header */}
      <div style={{ borderBottom: "1px solid var(--rule)", padding: "14px 24px",
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--ledger-ink-faint)", marginBottom: 2 }}>ADMIN</div>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.18em" }}>TEAM OVERRIDES</div>
        </div>
        <span style={{ fontSize: 10, color: "var(--ledger-ink-faint)", marginLeft: "auto" }}>
          {teams.filter(hasOverride).length} overrides active
        </span>
        <button onClick={load}
          style={{ fontSize: 10, fontWeight: 900, padding: "5px 12px", background: "transparent",
            border: "1px solid var(--rule)", color: "var(--ledger-ink-faint)", cursor: "pointer", letterSpacing: "0.1em" }}>
          REFRESH
        </button>
      </div>

      <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--rule)" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team…"
          style={{ fontSize: 11, padding: "6px 12px", background: "var(--paper)",
            border: "1px solid var(--rule)", color: "var(--ledger-ink)", outline: "none",
            minWidth: 200, fontFamily: "'Courier Prime', monospace" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 120px 90px 50px",
        gap: 8, padding: "7px 24px", borderBottom: "1px solid var(--rule)",
        fontSize: 8, color: "var(--ledger-ink-faint)", fontWeight: 900,
        textTransform: "uppercase", letterSpacing: "0.12em",
        position: "sticky", top: 42, background: "var(--paper)", zIndex: 10 }}>
        <div>ID</div><div>NAME</div>
        <div style={{ textAlign: "center" }}>PHASE</div>
        <div style={{ textAlign: "center" }}>STANDING</div>
        <div />
      </div>

      {loading ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--ledger-ink-faint)", letterSpacing: "0.2em", fontSize: 11 }}>LOADING…</div>
      ) : filtered.map(t => (
        <div key={t.id} style={{ display: "grid", gridTemplateColumns: "70px 1fr 120px 90px 50px",
          gap: 8, padding: "7px 24px", borderBottom: "1px solid var(--rule)",
          fontSize: 11, alignItems: "center",
          background: hasOverride(t) ? "rgba(148,105,20,0.04)" : "transparent" }}>
          <div style={{ fontWeight: 900, letterSpacing: "0.1em" }}>{t.id}</div>
          <div style={{ color: "var(--ledger-ink-faint)" }}>{t.name}</div>
          <div style={{ textAlign: "center", fontSize: 10 }}>
            {t.phaseOverride
              ? <span style={{ color: "var(--amber)", fontWeight: 900 }}>{t.phaseOverride} ✎</span>
              : <span style={{ color: "var(--ledger-ink-faint)" }}>{t.fallbackPhase}</span>}
          </div>
          <div style={{ textAlign: "center", fontFamily: "monospace", fontSize: 10 }}>
            {t.standingOverride !== null
              ? <span style={{ color: "var(--amber)", fontWeight: 900 }}>#{t.standingOverride} ✎</span>
              : <span style={{ color: "var(--ledger-ink-faint)" }}>#{t.fallbackStanding}</span>}
          </div>
          <button onClick={() => setEditing(t)}
            style={{ fontSize: 9, fontWeight: 900, padding: "3px 8px", background: "transparent",
              border: "1px solid var(--rule)", color: "var(--ledger-ink-faint)", cursor: "pointer", letterSpacing: "0.1em" }}>
            EDIT
          </button>
        </div>
      ))}

      {editing && <EditModal team={editing} onSave={handleSave} onClose={() => setEditing(null)} />}

    </div>
  );
}
