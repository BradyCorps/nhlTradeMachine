"use client";

import React, { useEffect, useState } from "react";
import { adminErrorMessage, readAdminResponse } from "../admin-response";

interface FaOverrideRow {
  id: string;
  playerId: string | null;
  playerName: string;
  teamSlug: string | null;
  forceStatus: string;
  season: string;
  notes: string | null;
  updatedAt: number | null;
}

interface PlayerOption {
  id: string;
  name: string;
  teamId: string | null;
  position: string;
  age: number | null;
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

function BulkAddForm({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<ForceStatus>("UFA");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const count = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).length;

  const handle = async () => {
    if (count === 0) { setError("Paste at least one player name"); return; }
    setSaving(true);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/admin/fa-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: text, forceStatus: status, notes: notes.trim() || null }),
      });
      const data = await readAdminResponse<{ added: number; status: string }>(res, "Bulk add failed");
      setResult(`✓ Added/updated ${data.added} player${data.added === 1 ? "" : "s"} as ${data.status}`);
      setText(""); setNotes("");
      onAdded();
    } catch (e) {
      setError(adminErrorMessage(e, "Bulk add failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: "#0e1a26", border: "1px solid #2a4a5a", padding: 20, marginBottom: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "#7ec8e3", letterSpacing: "0.15em", marginBottom: 6 }}>BULK ADD TO UFA / RFA LIST</div>
      <div style={{ fontSize: 10, color: "#6a8a9a", marginBottom: 14, lineHeight: 1.5 }}>
        Paste one player per line (or comma-separated). Each becomes a forced free agent matched by name —
        use this to override the scraper when it reports a wrong expiry year (e.g. a 2026 UFA shown as 2027 / 1-year-left).
      </div>
      {error && <div style={{ color: "#cf6b6b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      {result && <div style={{ color: "#6bcf6b", fontSize: 12, marginBottom: 10, fontWeight: 700 }}>{result}</div>}
      <textarea value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"Gustav Nyquist\nAlex Tuch\nJason Robertson"}
        rows={6}
        style={{ width: "100%", background: "#0a141c", border: "1px solid #2a4a5a", color: "#cfe8f3", padding: "8px 10px", fontSize: 13, fontFamily: "inherit", resize: "vertical", marginBottom: 12, boxSizing: "border-box" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div>
          <label style={{ color: "#6a8a9a", fontSize: 10, fontWeight: 700, display: "block", marginBottom: 3 }}>FORCE STATUS *</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as ForceStatus)}
            style={{ background: "#0a141c", border: "1px solid #2a4a5a", color: "#cfe8f3", padding: "6px 8px", fontSize: 13 }}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ color: "#6a8a9a", fontSize: 10, fontWeight: 700, display: "block", marginBottom: 3 }}>NOTES (applied to all)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="2026 UFA class — scrape override"
            style={{ background: "#0a141c", border: "1px solid #2a4a5a", color: "#cfe8f3", padding: "6px 10px", fontSize: 12, width: 260 }} />
        </div>
        <button onClick={handle} disabled={saving || count === 0}
          style={{ background: "#1e5f7e", color: "#cfe8f3", border: "none", padding: "8px 18px", fontWeight: 900, fontSize: 11, letterSpacing: "0.1em", cursor: count === 0 ? "not-allowed" : "pointer", opacity: count === 0 ? 0.5 : 1 }}>
          {saving ? "Saving…" : `BULK ADD ${count || ""} →`}
        </button>
      </div>
    </div>
  );
}

function AddOverrideForm({ players, onAdded }: { players: PlayerOption[]; onAdded: () => void }) {
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [status, setStatus] = useState<ForceStatus>("UFA");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Picking a DB player pre-fills the name; it stays editable so live-scraped
  // free agents (who are never in the players table) can be forced by name.
  const onPickDbPlayer = (id: string) => {
    setPlayerId(id);
    const selected = players.find((p) => p.id === id);
    if (selected) setPlayerName(selected.name);
  };

  const handle = async () => {
    const selected = players.find((p) => p.id === playerId);
    const name = (selected?.name ?? playerName).trim();
    if (!name) { setError("Enter a player name or pick a DB player"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/fa-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Send the DB id only when the typed name still matches the picked row.
          playerId: selected && selected.name === name ? selected.id : null,
          playerName: name,
          teamSlug: selected && selected.name === name ? selected.teamId : null,
          forceStatus: status,
          notes: notes.trim() || null,
        }),
      });
      await readAdminResponse(res, "Save failed");
      setPlayerId(""); setPlayerName(""); setStatus("UFA"); setNotes("");
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
          <input value={playerName} onChange={(e) => { setPlayerName(e.target.value); setPlayerId(""); }}
            placeholder="Alex Tuch"
            style={{ background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "6px 10px", fontSize: 13, width: 220 }} />
        </div>
        <div>
          <label style={{ color: "#a08060", fontSize: 10, fontWeight: 700, display: "block", marginBottom: 3 }}>OR PICK DB PLAYER</label>
          <select value={playerId} onChange={(e) => onPickDbPlayer(e.target.value)}
            style={{ background: "#2a1e10", border: "1px solid #5a4a2a", color: "#e4d8b8", padding: "6px 8px", fontSize: 13, width: 300 }}>
            <option value="">— optional —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.teamId ?? "No team"} · {p.position}{p.age != null ? ` · ${p.age}` : ""}
              </option>
            ))}
          </select>
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
        Type any player name (live free agents like Alex Tuch are never in the DB players table) or pick a curated DB player to pre-fill the name and store its id.
        Overrides match the off-season roster by id or name.{" "}
        <strong>UFA / RFA</strong> — force into expiring pool (shows in off-season re-sign phase) ·
        <strong> SIGNED</strong> — force out of expiring pool ·
        <strong> EXCLUDE</strong> — hide player from rosters entirely
      </div>
    </div>
  );
}

export default function FaOverridesPage() {
  const [rows, setRows] = useState<FaOverrideRow[]>([]);
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<"ALL" | ForceStatus>("ALL");

  const counts = STATUS_OPTIONS.reduce(
    (acc, s) => { acc[s] = rows.filter((r) => r.forceStatus === s).length; return acc; },
    {} as Record<ForceStatus, number>,
  );
  const visibleRows = filter === "ALL" ? rows : rows.filter((r) => r.forceStatus === filter);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/fa-overrides");
      const data = await readAdminResponse<{ overrides: FaOverrideRow[]; playerOptions: PlayerOption[] }>(res, "Failed to load overrides");
      setRows(data.overrides);
      setPlayerOptions(data.playerOptions ?? []);
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

        <BulkAddForm onAdded={load} />
        <AddOverrideForm players={playerOptions} onAdded={load} />

        {/* Status filter — UFA / RFA lists at a glance */}
        {!loading && rows.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {(["ALL", ...STATUS_OPTIONS] as const).map((s) => {
              const active = filter === s;
              const n = s === "ALL" ? rows.length : counts[s];
              return (
                <button key={s} onClick={() => setFilter(s)}
                  style={{
                    background: active ? "#5a4a2a" : "transparent",
                    color: active ? "#f0e4c0" : "#a08060",
                    border: "1px solid #5a4a2a", padding: "4px 12px",
                    fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", cursor: "pointer",
                  }}>
                  {s} · {n}
                </button>
              );
            })}
          </div>
        )}

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
                {["Player","Player ID","Team","Status","Season","Notes",""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 12px", color: "#a08060", fontWeight: 900, fontSize: 10, letterSpacing: "0.12em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #2a1e10" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "#e4d8b8" }}>{r.playerName}</td>
                  <td style={{ padding: "8px 12px", color: "#7a6a50", fontSize: 10 }}>{r.playerId ?? "legacy name"}</td>
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
