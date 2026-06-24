"use client";

import React, { useEffect, useState, useMemo } from "react";
import { adminErrorMessage, readAdminResponse } from "../admin-response";

interface PickRow {
  id: string;
  originalOwnerId: string;
  currentOwnerId: string;
  round: number;
  year: number;
  isProtected: boolean;
  conditions: string | null;
  hasOverride: boolean;
  teamStanding: number;
}

const ROUND_LABEL = (r: number) => r === 1 ? "1st" : r === 2 ? "2nd" : r === 3 ? "3rd" : `${r}th`;

// All 32 NHL team IDs
const ALL_TEAMS = [
  "ANA","BOS","BUF","CGY","CAR","CHI","COL","CBJ","DAL","DET",
  "EDM","FLA","LAK","MIN","MTL","NSH","NJD","NYI","NYR","OTT",
  "PHI","PIT","SEA","SJS","STL","TBL","TOR","UTA","VAN","VGK",
  "WSH","WPG",
];

function EditPickModal({
  pick,
  onSave,
  onReset,
  onClose,
}: {
  pick: PickRow;
  onSave: (currentOwnerId: string, isProtected: boolean, conditions: string) => Promise<void>;
  onReset: () => Promise<void>;
  onClose: () => void;
}) {
  const [owner, setOwner] = useState(pick.currentOwnerId);
  const [prot, setProt] = useState(pick.isProtected);
  const [cond, setCond] = useState(pick.conditions ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handle = async (reset = false) => {
    setSaving(true);
    setError("");
    try {
      if (reset) {
        await onReset();
      } else {
        await onSave(owner, prot, cond);
      }
      onClose();
    } catch (e) {
      setError(adminErrorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={onClose}>
      <div style={{ background: "#1a1208", border: "1px solid #5a4a2a", padding: 24, minWidth: 360, maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#e4d8b8", marginBottom: 16 }}>
          {pick.year} {ROUND_LABEL(pick.round)} · {pick.originalOwnerId}
        </div>
        {error && <div style={{ color: "#cf6b6b", fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: "#a08060", fontSize: 11, fontWeight: 700, display: "block", marginBottom: 4 }}>CURRENT OWNER</label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}
            style={{ width: "100%", background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "6px 8px", fontSize: 13 }}>
            {ALL_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" id="prot" checked={prot} onChange={(e) => setProt(e.target.checked)} />
          <label htmlFor="prot" style={{ color: "#a08060", fontSize: 12, fontWeight: 700 }}>PROTECTED</label>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: "#a08060", fontSize: 11, fontWeight: 700, display: "block", marginBottom: 4 }}>CONDITIONS (optional)</label>
          <input value={cond} onChange={(e) => setCond(e.target.value)} placeholder="e.g. Top-10 protected 2026"
            style={{ width: "100%", background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "6px 8px", fontSize: 12 }} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => handle(false)} disabled={saving}
            style={{ flex: 1, background: "#1e3a5f", color: "#7ec8e3", border: "none", padding: "8px 0", fontWeight: 900, fontSize: 11, letterSpacing: "0.1em", cursor: "pointer" }}>
            {saving ? "Saving…" : "SAVE"}
          </button>
          {pick.hasOverride && (
            <button onClick={() => handle(true)} disabled={saving}
              style={{ flex: 1, background: "#3a1a1a", color: "#cf6b6b", border: "none", padding: "8px 0", fontWeight: 900, fontSize: 11, letterSpacing: "0.1em", cursor: "pointer" }}>
              RESET TO DEFAULT
            </button>
          )}
          <button onClick={onClose} disabled={saving}
            style={{ background: "transparent", color: "#a08060", border: "1px solid #5a4a2a", padding: "8px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DraftPicksPage() {
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<PickRow | null>(null);

  // Filters
  const [filterTeam, setFilterTeam] = useState("ALL");
  const [filterYear, setFilterYear] = useState("ALL");
  const [filterRound, setFilterRound] = useState("ALL");
  const [showMovedOnly, setShowMovedOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/draft-picks");
      const data = await readAdminResponse<{ picks: PickRow[] }>(res, "Failed to load picks");
      setPicks(data.picks);
    } catch (e) {
      setError(adminErrorMessage(e, "Load failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const years = useMemo(() => [...new Set(picks.map((p) => p.year))].sort(), [picks]);

  const filtered = useMemo(() => picks.filter((p) => {
    if (filterTeam !== "ALL" && p.originalOwnerId !== filterTeam && p.currentOwnerId !== filterTeam) return false;
    if (filterYear !== "ALL" && String(p.year) !== filterYear) return false;
    if (filterRound !== "ALL" && String(p.round) !== filterRound) return false;
    if (showMovedOnly && !p.hasOverride) return false;
    return true;
  }), [picks, filterTeam, filterYear, filterRound, showMovedOnly]);

  const handleSave = async (pick: PickRow, newOwner: string, isProtected: boolean, conditions: string) => {
    const res = await fetch("/api/admin/draft-picks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pick.id,
        originalOwnerId: pick.originalOwnerId,
        currentOwnerId: newOwner,
        round: pick.round,
        year: pick.year,
        isProtected,
        conditions: conditions || null,
      }),
    });
    await readAdminResponse(res, "Save failed");
    setMsg(`✓ Pick updated`);
    setTimeout(() => setMsg(""), 3000);
    await load();
  };

  const handleReset = async (pick: PickRow) => {
    const res = await fetch(`/api/admin/draft-picks?id=${encodeURIComponent(pick.id)}`, { method: "DELETE" });
    await readAdminResponse(res, "Reset failed");
    setMsg(`✓ Pick reset to default`);
    setTimeout(() => setMsg(""), 3000);
    await load();
  };

  const movedCount = picks.filter((p) => p.hasOverride).length;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0a05", color: "#e4d8b8", fontFamily: "'Courier Prime', monospace", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.12em", marginBottom: 4 }}>DRAFT PICK BOARD</h1>
          <p style={{ color: "#a08060", fontSize: 12 }}>
            {movedCount} pick{movedCount !== 1 ? "s" : ""} moved from original owner · click any pick to transfer or protect it
          </p>
          {msg && <div style={{ marginTop: 8, color: "#6bcf6b", fontSize: 12, fontWeight: 700 }}>{msg}</div>}
          {error && <div style={{ marginTop: 8, color: "#cf6b6b", fontSize: 12, fontWeight: 700 }}>{error}</div>}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
          <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
            style={{ background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "5px 8px", fontSize: 12 }}>
            <option value="ALL">All Teams</option>
            {ALL_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
            style={{ background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "5px 8px", fontSize: 12 }}>
            <option value="ALL">All Years</option>
            {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <select value={filterRound} onChange={(e) => setFilterRound(e.target.value)}
            style={{ background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "5px 8px", fontSize: 12 }}>
            <option value="ALL">All Rounds</option>
            {[1,2,3,4,5].map((r) => <option key={r} value={String(r)}>{ROUND_LABEL(r)}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a08060", cursor: "pointer" }}>
            <input type="checkbox" checked={showMovedOnly} onChange={(e) => setShowMovedOnly(e.target.checked)} />
            Moved picks only
          </label>
          <span style={{ color: "#5a4a2a", fontSize: 12 }}>{filtered.length} picks shown</span>
        </div>

        {loading ? (
          <div style={{ color: "#a08060", fontSize: 12, padding: 20 }}>Loading…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #5a4a2a" }}>
                {["Year","Round","Original","Current Owner","Standing","Protected","Conditions",""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#a08060", fontWeight: 900, fontSize: 10, letterSpacing: "0.12em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const moved = p.currentOwnerId !== p.originalOwnerId;
                return (
                  <tr key={p.id}
                    style={{ borderBottom: "1px solid #2a1e10", background: moved ? "rgba(30,58,95,0.15)" : "transparent" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = moved ? "rgba(30,58,95,0.30)" : "rgba(255,255,255,0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = moved ? "rgba(30,58,95,0.15)" : "transparent")}>
                    <td style={{ padding: "6px 10px", color: "#e4d8b8" }}>{p.year}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 900 }}>{ROUND_LABEL(p.round)}</td>
                    <td style={{ padding: "6px 10px", color: moved ? "#a08060" : "#e4d8b8" }}>{p.originalOwnerId}</td>
                    <td style={{ padding: "6px 10px", fontWeight: moved ? 900 : 400, color: moved ? "#7ec8e3" : "#e4d8b8" }}>
                      {p.currentOwnerId}
                      {moved && <span style={{ fontSize: 9, marginLeft: 6, color: "#7ec8e3", background: "#1e3a5f", padding: "1px 4px" }}>MOVED</span>}
                    </td>
                    <td style={{ padding: "6px 10px", color: "#a08060" }}>{p.teamStanding}</td>
                    <td style={{ padding: "6px 10px" }}>
                      {p.isProtected && <span style={{ fontSize: 9, color: "#f0a500", background: "#3a2a00", padding: "1px 4px", fontWeight: 900 }}>PROT</span>}
                    </td>
                    <td style={{ padding: "6px 10px", color: "#7a6a50", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.conditions ?? ""}
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <button onClick={() => setEditing(p)}
                        style={{ background: "transparent", color: "#7ec8e3", border: "1px solid #1e3a5f", padding: "3px 10px", fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", cursor: "pointer" }}>
                        EDIT
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditPickModal
          pick={editing}
          onSave={(owner, prot, cond) => handleSave(editing, owner, prot, cond)}
          onReset={() => handleReset(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
