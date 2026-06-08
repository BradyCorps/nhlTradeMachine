"use client";

import React, { useEffect, useState, useMemo } from "react";

type TBStatus = "requested" | "available" | "blocked" | "untouchable";

interface Override {
  id:        string;
  name:      string;
  teamId:    string | null;
  status:    TBStatus;
  note:      string | null;
  updatedAt: number | null;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  requested:   { bg: "#3a0000", color: "#ff6b6b", label: "REQUESTED"   },
  available:   { bg: "#2a1e00", color: "#f0a500", label: "AVAILABLE"   },
  untouchable: { bg: "#001a1a", color: "#4ecdc4", label: "UNTOUCHABLE" },
  blocked:     { bg: "#1a1a1a", color: "#5a5a5a", label: "BLOCKED"     },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.blocked;
  return (
    <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 6px", letterSpacing: "0.1em",
      background: s.bg, color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  );
}

function EditModal({ initial, onSave, onClose }: {
  initial?: Override;
  onSave: (name: string, teamId: string, status: TBStatus | "clear", note: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name,    setName]    = useState(initial?.name   ?? "");
  const [teamId,  setTeamId]  = useState(initial?.teamId ?? "");
  const [status,  setStatus]  = useState<TBStatus>(initial?.status ?? "available");
  const [note,    setNote]    = useState(initial?.note   ?? "");
  const [saving,  setSaving]  = useState(false);

  const handle = async (clear = false) => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), teamId.trim().toUpperCase(), clear ? "clear" : status, note.trim());
    setSaving(false);
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#2a1e0a", border: "1px solid #5a4a2a",
    color: "#e4d8b8", padding: "6px 10px", fontSize: 12,
    fontFamily: "'Courier Prime', monospace", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 10, color: "#8a7a5a",
    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={onClose}>
      <div style={{ background: "#1a1208", border: "1px solid #5a4a2a", padding: 24,
        minWidth: 360, maxWidth: 420 }} onClick={e => e.stopPropagation()}>

        <div style={{ fontSize: 13, fontWeight: 900, color: "#e4d8b8", marginBottom: 18,
          letterSpacing: "0.05em" }}>
          {initial ? `EDIT — ${initial.name}` : "ADD TRADE BLOCK ENTRY"}
        </div>

        <div style={{ display: "grid", gap: 14, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>Player Name (exact)</label>
            <input value={name} onChange={e => setName(e.target.value)}
              disabled={!!initial} style={{ ...inputStyle, opacity: initial ? 0.6 : 1 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Team ID (e.g. DET)</label>
              <input value={teamId} onChange={e => setTeamId(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as TBStatus)}
                style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="requested">REQUESTED</option>
                <option value="available">AVAILABLE</option>
                <option value="untouchable">UNTOUCHABLE</option>
                <option value="blocked">BLOCKED (hide auto)</option>
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Note / Source</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. ESPN: formal trade request via agent"
              style={inputStyle} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => handle(false)} disabled={saving || !name.trim()}
            style={{ flex: 1, padding: "8px 0", background: "#1a3a1a", border: "1px solid #2a6a2a",
              color: "#6bcf6b", fontSize: 12, fontWeight: 900, cursor: "pointer", letterSpacing: "0.1em" }}>
            {saving ? "SAVING..." : "SAVE"}
          </button>
          {initial && (
            <button onClick={() => handle(true)} disabled={saving}
              style={{ padding: "8px 14px", background: "#3a1a1a", border: "1px solid #6a2a2a",
                color: "#cf6b6b", fontSize: 12, fontWeight: 900, cursor: "pointer", letterSpacing: "0.1em" }}>
              CLEAR
            </button>
          )}
          <button onClick={onClose}
            style={{ padding: "8px 14px", background: "#2a1e0a", border: "1px solid #3a2e1a",
              color: "#8a7a5a", fontSize: 12, fontWeight: 900, cursor: "pointer", letterSpacing: "0.1em" }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TradeBlockAdmin() {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState<Override | "new" | null>(null);
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState<"all" | TBStatus>("all");
  const [toast,     setToast]     = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/trade-block")
      .then(r => r.json())
      .then(d => { setOverrides(d.overrides ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(load, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleSave = async (name: string, teamId: string, status: TBStatus | "clear", note: string) => {
    const res  = await fetch("/api/admin/trade-block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, teamId, status, note }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(status === "clear" ? `Cleared ${name}` : `Saved ${name} → ${status.toUpperCase()}`);
      load();
    }
  };

  const filtered = useMemo(() => {
    let list = overrides;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || (r.teamId ?? "").toLowerCase().includes(q));
    }
    if (filter !== "all") list = list.filter(r => r.status === filter);
    return list;
  }, [overrides, search, filter]);

  const counts = useMemo(() => ({
    requested:   overrides.filter(r => r.status === "requested").length,
    available:   overrides.filter(r => r.status === "available").length,
    untouchable: overrides.filter(r => r.status === "untouchable").length,
    blocked:     overrides.filter(r => r.status === "blocked").length,
  }), [overrides]);

  return (
    <div style={{ minHeight: "100vh", background: "#0f0c07", color: "#e4d8b8",
      fontFamily: "'Courier Prime', monospace" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #3a2e1a", padding: "16px 24px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <a href="/admin/contracts" style={{ fontSize: 11, color: "#8a7a5a", textDecoration: "none",
          letterSpacing: "0.1em" }}>← CONTRACTS</a>
        <span style={{ color: "#3a2e1a" }}>|</span>
        <a href="/trade" style={{ fontSize: 11, color: "#8a7a5a", textDecoration: "none",
          letterSpacing: "0.1em" }}>← TRADE MACHINE</a>
        <span style={{ color: "#3a2e1a" }}>|</span>
        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.2em" }}>TRADE BLOCK</span>
        <span style={{ fontSize: 11, color: "#8a7a5a", marginLeft: "auto" }}>
          {counts.requested} REQUESTED · {counts.available} AVAILABLE · {counts.untouchable} UNTOUCHABLE
        </span>
        <button onClick={() => setEditing("new")}
          style={{ fontSize: 11, fontWeight: 900, padding: "5px 14px",
            background: "#3a0000", border: "1px solid #6a2a2a",
            color: "#ff6b6b", cursor: "pointer", letterSpacing: "0.1em" }}>
          + ADD ENTRY
        </button>
        <button onClick={load}
          style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
            background: "#2a1e0a", border: "1px solid #5a4a2a",
            color: "#c8b890", cursor: "pointer", letterSpacing: "0.1em" }}>
          REFRESH
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid #2a1e0a",
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search player or team..."
          style={{ fontSize: 12, padding: "6px 12px", background: "#1a1208",
            border: "1px solid #3a2e1a", color: "#e4d8b8", outline: "none", minWidth: 200 }} />
        {(["all", "requested", "available", "untouchable", "blocked"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 10, fontWeight: 900, padding: "4px 10px", letterSpacing: "0.1em",
              cursor: "pointer",
              background: filter === f ? "#2a1e0a" : "transparent",
              border: `1px solid ${filter === f ? "#5a4a2a" : "#2a1e0a"}`,
              color: filter === f ? "#e4d8b8" : "#8a7a5a" }}>
            {f === "all" ? "ALL" : f.toUpperCase()}
          </button>
        ))}
        <span style={{ fontSize: 11, color: "#5a4a2a", marginLeft: "auto" }}>
          {filtered.length} entries · auto-algorithm runs on {">"}800 players
        </span>
      </div>

      {/* Table headers */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 70px 80px 120px 1fr 60px",
        gap: 8, padding: "8px 24px", borderBottom: "1px solid #2a1e0a",
        fontSize: 9, color: "#5a4a2a", fontWeight: 900, textTransform: "uppercase",
        letterSpacing: "0.12em", position: "sticky", top: 0, background: "#0f0c07", zIndex: 10 }}>
        <div>PLAYER</div>
        <div style={{ textAlign: "center" }}>TEAM</div>
        <div style={{ textAlign: "center" }}>STATUS</div>
        <div>NOTE</div>
        <div>UPDATED</div>
        <div />
      </div>

      {/* Rows */}
      {loading ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: "#5a4a2a",
          letterSpacing: "0.2em", fontSize: 11 }}>
          LOADING...
        </div>
      ) : filtered.map(row => (
        <div key={row.id}
          style={{ display: "grid",
            gridTemplateColumns: "220px 70px 80px 120px 1fr 60px",
            gap: 8, padding: "7px 24px", borderBottom: "1px solid #1a1208",
            fontSize: 11, alignItems: "center" }}>
          <div style={{ fontWeight: 700, color: "#e4d8b8" }}>{row.name}</div>
          <div style={{ textAlign: "center", color: "#8a7a5a", fontSize: 10 }}>
            {row.teamId ?? "—"}
          </div>
          <div style={{ textAlign: "center" }}>
            <StatusBadge status={row.status} />
          </div>
          <div style={{ color: "#8a7a5a", fontSize: 10, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.note ?? "—"}
          </div>
          <div style={{ color: "#5a4a2a", fontSize: 10 }}>
            {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—"}
          </div>
          <button onClick={() => setEditing(row)}
            style={{ fontSize: 10, fontWeight: 900, padding: "3px 8px",
              background: "transparent", border: "1px solid #3a2e1a",
              color: "#8a7a5a", cursor: "pointer", letterSpacing: "0.1em" }}>
            EDIT
          </button>
        </div>
      ))}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "#5a4a2a",
          letterSpacing: "0.2em", fontSize: 11 }}>
          {overrides.length === 0
            ? "NO MANUAL OVERRIDES — auto-algorithm is generating statuses from team phase + contract data"
            : "NO ENTRIES MATCH FILTER"}
        </div>
      )}

      {editing && (
        <EditModal
          initial={editing === "new" ? undefined : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24,
          background: "#1a3a1a", border: "1px solid #2a6a2a",
          color: "#6bcf6b", padding: "10px 16px", fontSize: 12, fontWeight: 900,
          letterSpacing: "0.1em", zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
