"use client";

import React, { useEffect, useState, useMemo } from "react";
import { adminErrorMessage, readAdminResponse } from "../admin-response";
import { toast } from "@/app/lib/ledger-toast";
import { ALL_DRAFT_ROUNDS } from "@/app/lib/draft-picks";

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

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--paper)", border: "1px solid var(--rule)",
  color: "var(--ledger-ink)", padding: "6px 8px", fontSize: 13,
  fontFamily: "'Courier Prime', monospace",
};

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
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,20,10,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={onClose}>
      <div className="admin-modal-card" style={{ background: "var(--ledger-card-light)", border: "1px solid var(--rule)", borderTop: "3px solid var(--ledger-ink)", padding: 24, minWidth: 360, maxWidth: 440, fontFamily: "'Courier Prime', monospace" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "var(--ledger-ink)", marginBottom: 16 }}>
          {pick.year} {ROUND_LABEL(pick.round)} · {pick.originalOwnerId}
        </div>
        {error && <div style={{ color: "var(--ledger-red)", fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: "var(--ledger-ink-faint)", fontSize: 11, fontWeight: 700, display: "block", marginBottom: 4 }}>CURRENT OWNER</label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} style={inputStyle}>
            {ALL_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" id="prot" checked={prot} onChange={(e) => setProt(e.target.checked)} />
          <label htmlFor="prot" style={{ color: "var(--ledger-ink-faint)", fontSize: 12, fontWeight: 700 }}>PROTECTED</label>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: "var(--ledger-ink-faint)", fontSize: 11, fontWeight: 700, display: "block", marginBottom: 4 }}>CONDITIONS (optional)</label>
          <input value={cond} onChange={(e) => setCond(e.target.value)} placeholder="e.g. Top-10 protected 2026" style={{ ...inputStyle, fontSize: 12 }} />
        </div>

        <div className="admin-dialog-actions" style={{ display: "flex", gap: 8 }}>
          <button onClick={() => handle(false)} disabled={saving}
            style={{ flex: 1, background: "var(--ledger-ice)", color: "#fff", border: "none", padding: "8px 0", fontWeight: 900, fontSize: 11, letterSpacing: "0.1em", cursor: "pointer" }}>
            {saving ? "Saving…" : "SAVE"}
          </button>
          {pick.hasOverride && (
            <button onClick={() => handle(true)} disabled={saving}
              style={{ flex: 1, background: "transparent", color: "var(--ledger-red)", border: "1px solid var(--ledger-red)", padding: "8px 0", fontWeight: 900, fontSize: 11, letterSpacing: "0.1em", cursor: "pointer" }}>
              RESET TO DEFAULT
            </button>
          )}
          <button onClick={onClose} disabled={saving}
            style={{ background: "transparent", color: "var(--ledger-ink-faint)", border: "1px solid var(--rule)", padding: "8px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
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
    toast("Pick updated", "success");
    await load();
  };

  const handleReset = async (pick: PickRow) => {
    const res = await fetch(`/api/admin/draft-picks?id=${encodeURIComponent(pick.id)}`, { method: "DELETE" });
    await readAdminResponse(res, "Reset failed");
    toast("Pick reset to default", "success");
    await load();
  };

  const movedCount = picks.filter((p) => p.hasOverride).length;

  return (
    <div className="admin-page" style={{ minHeight: "calc(100vh - 42px)", background: "var(--paper)", color: "var(--ledger-ink)", fontFamily: "'Courier Prime', monospace", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--ledger-ink-faint)", marginBottom: 4 }}>ADMIN</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.12em", marginBottom: 4 }}>DRAFT PICK BOARD</h1>
          <p style={{ color: "var(--ledger-ink-faint)", fontSize: 12 }}>
            {movedCount} pick{movedCount !== 1 ? "s" : ""} moved from original owner · click any pick to transfer or protect it
          </p>
          {error && <div style={{ marginTop: 8, color: "var(--ledger-red)", fontSize: 12, fontWeight: 700 }}>{error}</div>}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
          <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
            className="admin-filter-control"
            style={{ ...inputStyle, width: "auto", fontSize: 12 }}>
            <option value="ALL">All Teams</option>
            {ALL_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
            className="admin-filter-control"
            style={{ ...inputStyle, width: "auto", fontSize: 12 }}>
            <option value="ALL">All Years</option>
            {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <select value={filterRound} onChange={(e) => setFilterRound(e.target.value)}
            className="admin-filter-control"
            style={{ ...inputStyle, width: "auto", fontSize: 12 }}>
            <option value="ALL">All Rounds</option>
            {ALL_DRAFT_ROUNDS.map((r) => <option key={r} value={String(r)}>{ROUND_LABEL(r)}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ledger-ink-faint)", cursor: "pointer" }}>
            <input type="checkbox" checked={showMovedOnly} onChange={(e) => setShowMovedOnly(e.target.checked)} />
            Moved picks only
          </label>
          <span style={{ color: "var(--ledger-ink-faint)", fontSize: 12 }}>{filtered.length} picks shown</span>
        </div>

        {loading ? (
          <div style={{ color: "var(--ledger-ink-faint)", fontSize: 12, padding: 20 }}>Loading…</div>
        ) : (
          <div className="admin-scroll-table">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--rule)" }}>
                {["Year","Round","Original","Current Owner","Standing","Protected","Conditions",""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--ledger-ink-faint)", fontWeight: 900, fontSize: 10, letterSpacing: "0.12em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const moved = p.currentOwnerId !== p.originalOwnerId;
                return (
                  <tr key={p.id}
                    style={{ borderBottom: "1px solid var(--ledger-rule-light)", background: moved ? "rgba(40,70,110,0.10)" : "transparent" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = moved ? "rgba(40,70,110,0.18)" : "rgba(40,70,110,0.05)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = moved ? "rgba(40,70,110,0.10)" : "transparent")}>
                    <td style={{ padding: "6px 10px", color: "var(--ledger-ink)" }}>{p.year}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 900 }}>{ROUND_LABEL(p.round)}</td>
                    <td style={{ padding: "6px 10px", color: moved ? "var(--ledger-ink-faint)" : "var(--ledger-ink)" }}>{p.originalOwnerId}</td>
                    <td style={{ padding: "6px 10px", fontWeight: moved ? 900 : 400, color: moved ? "var(--ledger-ice)" : "var(--ledger-ink)" }}>
                      {p.currentOwnerId}
                      {moved && <span style={{ fontSize: 9, marginLeft: 6, color: "#fff", background: "var(--ledger-ice)", padding: "1px 4px" }}>MOVED</span>}
                    </td>
                    <td style={{ padding: "6px 10px", color: "var(--ledger-ink-faint)" }}>{p.teamStanding}</td>
                    <td style={{ padding: "6px 10px" }}>
                      {p.isProtected && <span style={{ fontSize: 9, color: "#fff", background: "var(--amber)", padding: "1px 4px", fontWeight: 900 }}>PROT</span>}
                    </td>
                    <td style={{ padding: "6px 10px", color: "var(--ledger-brown)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.conditions ?? ""}
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <button onClick={() => setEditing(p)}
                        style={{ background: "transparent", color: "var(--ledger-ice)", border: "1px solid var(--ledger-ice)", padding: "3px 10px", fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", cursor: "pointer" }}>
                        EDIT
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
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
