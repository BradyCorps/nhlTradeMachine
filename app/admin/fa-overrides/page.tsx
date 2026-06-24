"use client";

import React, { useEffect, useState } from "react";
import { adminErrorMessage, readAdminResponse } from "../admin-response";

interface FaOverrideRow {
  id: string;
  playerName: string;
  teamSlug: string | null;
  forceStatus: string;
  season: string;
  notes: string | null;
  updatedAt: number | null;
}

const STATUS_OPTIONS = ["UFA", "RFA", "SIGNED", "EXCLUDE"] as const;
type ForceStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_COLOR: Record<ForceStatus, { bg: string; color: string }> = {
  UFA:     { bg: "#1a3a1a", color: "#6bcf6b" },
  RFA:     { bg: "#1e3a5f", color: "#7ec8e3" },
  SIGNED:  { bg: "#2a2a2a", color: "#aaaaaa" },
  EXCLUDE: { bg: "#3a1a1a", color: "#cf6b6b" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_COLOR[status as ForceStatus] ?? { bg: "#2a2a2a", color: "#aaa" };
  return (
    <span style={{ fontSize: 10, fontWeight: 900, padding: "1px 6px", letterSpacing: "0.1em", background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }}>
      {status}
    </span>
  );
}

function AddOverrideForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [status, setStatus] = useState<ForceStatus>("UFA");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handle = async () => {
    if (!name.trim()) { setError("Player name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/fa-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: name.trim(), teamSlug: team.trim() || null, forceStatus: status, notes: notes.trim() || null }),
      });
      await readAdminResponse(res, "Save failed");
      setName(""); setTeam(""); setStatus("UFA"); setNotes("");
      onAdded();
    } catch (e) {
      setError(adminErrorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: "#1a1208", border: "1px solid #5a4a2a", padding: 20, marginBottom: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "#a08060", letterSpacing: "0.15em", marginBottom: 14 }}>ADD / UPDATE OVERRIDE</div>
      {error && <div style={{ color: "#cf6b6b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div>
          <label style={{ color: "#a08060", fontSize: 10, fontWeight: 700, display: "block", marginBottom: 3 }}>PLAYER NAME *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Tuch"
            style={{ background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "6px 10px", fontSize: 13, width: 200 }} />
        </div>
        <div>
          <label style={{ color: "#a08060", fontSize: 10, fontWeight: 700, display: "block", marginBottom: 3 }}>TEAM SLUG (optional)</label>
          <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="buffalo_sabres"
            style={{ background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "6px 10px", fontSize: 12, width: 160 }} />
        </div>
        <div>
          <label style={{ color: "#a08060", fontSize: 10, fontWeight: 700, display: "block", marginBottom: 3 }}>FORCE STATUS *</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as ForceStatus)}
            style={{ background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "6px 8px", fontSize: 13 }}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ color: "#a08060", fontSize: 10, fontWeight: 700, display: "block", marginBottom: 3 }}>NOTES</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="CapWages missing expiry"
            style={{ background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "6px 10px", fontSize: 12, width: 220 }} />
        </div>
        <button onClick={handle} disabled={saving}
          style={{ background: "#1e3a5f", color: "#7ec8e3", border: "none", padding: "8px 18px", fontWeight: 900, fontSize: 11, letterSpacing: "0.1em", cursor: "pointer" }}>
          {saving ? "Saving…" : "ADD →"}
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: "#7a6a50", lineHeight: 1.5 }}>
        <strong>UFA / RFA</strong> — force into expiring pool (shows in off-season re-sign phase) ·
        <strong> SIGNED</strong> — force out of expiring pool ·
        <strong> EXCLUDE</strong> — hide player from rosters entirely
      </div>
    </div>
  );
}

export default function FaOverridesPage() {
  const [rows, setRows] = useState<FaOverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/fa-overrides");
      const data = await readAdminResponse<{ overrides: FaOverrideRow[] }>(res, "Failed to load overrides");
      setRows(data.overrides);
    } catch (e) {
      setError(adminErrorMessage(e, "Load failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove override for "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/fa-overrides?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await readAdminResponse(res, "Delete failed");
      setMsg(`✓ Override for "${name}" removed`);
      setTimeout(() => setMsg(""), 3000);
      await load();
    } catch (e) {
      setError(adminErrorMessage(e, "Delete failed"));
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0a05", color: "#e4d8b8", fontFamily: "'Courier Prime', monospace", padding: "32px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.12em", marginBottom: 4 }}>FREE AGENT OVERRIDES</h1>
          <p style={{ color: "#a08060", fontSize: 12 }}>
            Manually force a player's free-agent status when the CapWages scraper misses them.
            Changes apply to the next roster load (clear Redis cache from Settings if needed).
          </p>
          {msg && <div style={{ marginTop: 8, color: "#6bcf6b", fontSize: 12, fontWeight: 700 }}>{msg}</div>}
          {error && <div style={{ marginTop: 8, color: "#cf6b6b", fontSize: 12, fontWeight: 700 }}>{error}</div>}
        </div>

        <AddOverrideForm onAdded={load} />

        {loading ? (
          <div style={{ color: "#a08060", fontSize: 12, padding: 20 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: "#7a6a50", fontSize: 13, padding: "20px 0", fontStyle: "italic" }}>
            No overrides yet. Use the form above to add players like Alex Tuch.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #5a4a2a" }}>
                {["Player","Team Slug","Status","Season","Notes",""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 12px", color: "#a08060", fontWeight: 900, fontSize: 10, letterSpacing: "0.12em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #2a1e10" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "#e4d8b8" }}>{r.playerName}</td>
                  <td style={{ padding: "8px 12px", color: "#a08060", fontSize: 11 }}>{r.teamSlug ?? "—"}</td>
                  <td style={{ padding: "8px 12px" }}><StatusBadge status={r.forceStatus} /></td>
                  <td style={{ padding: "8px 12px", color: "#7a6a50", fontSize: 11 }}>{r.season}</td>
                  <td style={{ padding: "8px 12px", color: "#7a6a50", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notes ?? "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <button onClick={() => handleDelete(r.id, r.playerName)}
                      style={{ background: "transparent", color: "#cf6b6b", border: "1px solid #3a1a1a", padding: "3px 10px", fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", cursor: "pointer" }}>
                      REMOVE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
