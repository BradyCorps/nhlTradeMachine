"use client";

import React, { useEffect, useState, useMemo } from "react";

interface ContractRow {
  name:          string;
  team:          string | null;
  position:      string | null;
  finalYears:    number;
  finalCap:      number | null;
  bundledYears:  number | null;
  scrapedYears:  number | null;
  adminYears:    number | null;
  adminCap:      number | null;
  overrideYears: number | null;
  hasNMC:        boolean;
  hasNTC:        boolean;
  expiryStatus:  string | null;
  delta:         number | null;
  source:        string;
}

function SourceBadge({ source }: { source: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    admin:    { bg: "#1e3a5f", color: "#7ec8e3" },
    override: { bg: "#3a2a00", color: "#f0a500" },
    scraper:  { bg: "#1a3a1a", color: "#6bcf6b" },
    bundled:  { bg: "#2a2a2a", color: "#aaaaaa" },
    default:  { bg: "#3a1a1a", color: "#cf6b6b" },
  };
  const s = cfg[source] ?? cfg.default;
  return (
    <span style={{ fontSize: 10, fontWeight: 900, padding: "1px 5px", letterSpacing: "0.1em",
      background: s.bg, color: s.color, border: `1px solid ${s.color}40` }}>
      {source.toUpperCase()}
    </span>
  );
}

function EditModal({ row, onSave, onClear, onClose }: {
  row:     ContractRow;
  onSave:  (name: string, years: number | null, cap: number | null) => Promise<void>;
  onClear: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [years, setYears] = useState(String(row.adminYears ?? row.finalYears ?? ""));
  const [cap,   setCap]   = useState(String(row.adminCap   ?? row.finalCap   ?? ""));
  const [saving, setSaving] = useState(false);

  const handle = async (clear = false) => {
    setSaving(true);
    if (clear) {
      await onClear(row.name);
    } else {
      const y = parseFloat(years);
      const c = parseFloat(cap);
      await onSave(row.name, isNaN(y) ? null : y, isNaN(c) ? null : c);
    }
    setSaving(false);
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: "#1a1208", border: "1px solid #5a4a2a",
        padding: "24px", minWidth: 340, maxWidth: 420,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#e4d8b8", marginBottom: 16,
          fontFamily: "'Courier Prime', monospace", letterSpacing: "0.05em" }}>
          {row.name}
          <span style={{ fontSize: 11, color: "#8a7a5a", marginLeft: 8 }}>
            {row.position} {row.team && `· ${row.team.toUpperCase()}`}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Bundled", val: row.bundledYears, cap: null },
            { label: "Scraped", val: row.scrapedYears, cap: null },
          ].map(s => (
            <div key={s.label} style={{ background: "#2a1e0a", border: "1px solid #3a2e1a", padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#8a7a5a", textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#c8b890", marginTop: 2 }}>
                {s.val != null ? `${s.val}yr` : "—"}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#8a7a5a", textTransform: "uppercase",
              letterSpacing: "0.1em", marginBottom: 5 }}>
              Years Remaining
            </label>
            <input
              type="number" min={0} max={12} step={1}
              value={years}
              onChange={e => setYears(e.target.value)}
              style={{ width: "100%", background: "#2a1e0a", border: "1px solid #5a4a2a",
                color: "#e4d8b8", padding: "6px 10px", fontSize: 13, fontFamily: "'Courier Prime', monospace" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#8a7a5a", textTransform: "uppercase",
              letterSpacing: "0.1em", marginBottom: 5 }}>
              Cap Hit ($M)
            </label>
            <input
              type="number" min={0} max={20} step={0.001}
              value={cap}
              onChange={e => setCap(e.target.value)}
              style={{ width: "100%", background: "#2a1e0a", border: "1px solid #5a4a2a",
                color: "#e4d8b8", padding: "6px 10px", fontSize: 13, fontFamily: "'Courier Prime', monospace" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => handle(false)} disabled={saving}
            style={{ flex: 1, padding: "8px 0", background: "#1a3a1a", border: "1px solid #2a6a2a",
              color: "#6bcf6b", fontSize: 12, fontWeight: 900, cursor: "pointer",
              letterSpacing: "0.1em", fontFamily: "'Courier Prime', monospace" }}>
            {saving ? "SAVING..." : "SAVE"}
          </button>
          {row.adminYears != null || row.adminCap != null ? (
            <button onClick={() => handle(true)} disabled={saving}
              style={{ padding: "8px 16px", background: "#3a1a1a", border: "1px solid #6a2a2a",
                color: "#cf6b6b", fontSize: 12, fontWeight: 900, cursor: "pointer",
                letterSpacing: "0.1em", fontFamily: "'Courier Prime', monospace" }}>
              CLEAR
            </button>
          ) : null}
          <button onClick={onClose}
            style={{ padding: "8px 16px", background: "#2a1e0a", border: "1px solid #3a2e1a",
              color: "#8a7a5a", fontSize: 12, fontWeight: 900, cursor: "pointer",
              letterSpacing: "0.1em", fontFamily: "'Courier Prime', monospace" }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPlayerForm({ onAdded }: { onAdded: () => void }) {
  const [open,    setOpen]    = useState(false);
  const [name,    setName]    = useState("");
  const [years,   setYears]   = useState("1");
  const [cap,     setCap]     = useState("");
  const [hasNMC,  setHasNMC]  = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setErr("Player name required"); return; }
    const y = parseInt(years);
    const c = parseFloat(cap);
    if (isNaN(y) || y < 1) { setErr("Valid years required (≥1)"); return; }
    if (isNaN(c) || c <= 0) { setErr("Valid cap hit required (> 0)"); return; }
    setSaving(true);
    setErr(null);
    const res = await fetch("/api/admin/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), yearsRemaining: y, capHit: c, hasNMC }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      setName(""); setYears("1"); setCap(""); setHasNMC(false); setOpen(false);
      onAdded();
    } else {
      setErr(data.error ?? "Save failed");
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{ fontSize: 11, fontWeight: 900, padding: "5px 14px",
        background: "#1e3a5f", border: "1px solid #2a5a8f",
        color: "#7ec8e3", cursor: "pointer", letterSpacing: "0.1em" }}>
      + ADD PLAYER
    </button>
  );

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
      background: "#1a1208", border: "1px solid #2a5a8f", padding: "10px 14px" }}>
      <span style={{ fontSize: 10, color: "#7ec8e3", fontWeight: 900, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
        NEW PLAYER
      </span>
      <input placeholder="Full name (exact)" value={name} onChange={e => setName(e.target.value)}
        style={{ fontSize: 11, padding: "5px 8px", background: "#0f0c07",
          border: "1px solid #3a2e1a", color: "#e4d8b8", outline: "none", minWidth: 180 }} />
      <input placeholder="Yrs" type="number" min={1} max={12} value={years}
        onChange={e => setYears(e.target.value)}
        style={{ fontSize: 11, padding: "5px 8px", background: "#0f0c07",
          border: "1px solid #3a2e1a", color: "#e4d8b8", outline: "none", width: 50 }} />
      <input placeholder="Cap $M" type="number" min={0.5} max={20} step={0.001} value={cap}
        onChange={e => setCap(e.target.value)}
        style={{ fontSize: 11, padding: "5px 8px", background: "#0f0c07",
          border: "1px solid #3a2e1a", color: "#e4d8b8", outline: "none", width: 70 }} />
      <label style={{ fontSize: 10, color: "#8a7a5a", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
        <input type="checkbox" checked={hasNMC} onChange={e => setHasNMC(e.target.checked)} />
        NMC
      </label>
      <button onClick={submit} disabled={saving}
        style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
          background: "#1a3a1a", border: "1px solid #2a6a2a",
          color: "#6bcf6b", cursor: "pointer", letterSpacing: "0.1em" }}>
        {saving ? "..." : "SAVE"}
      </button>
      <button onClick={() => { setOpen(false); setErr(null); }}
        style={{ fontSize: 11, fontWeight: 900, padding: "5px 10px",
          background: "transparent", border: "1px solid #2a1e0a",
          color: "#5a4a2a", cursor: "pointer" }}>
        ✕
      </button>
      {err && <span style={{ fontSize: 10, color: "#cf4040" }}>{err}</span>}
    </div>
  );
}

export default function AdminContractsPage() {
  const [contracts, setContracts]   = useState<ContractRow[]>([]);
  const [scrapedRaw, setScrapedRaw] = useState<Record<string, any> | null>(null);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState<"all" | "flagged" | "admin">("all");
  const [editing, setEditing]       = useState<ContractRow | null>(null);
  const [toast, setToast]           = useState<string | null>(null);

  const load = (withScrape = false) => {
    setLoading(true);
    const url = withScrape ? "/api/admin/contracts?scrape=1" : "/api/admin/contracts";
    fetch(url)
      .then(r => r.json())
      .then(d => {
        setContracts(d.contracts ?? []);
        if (d.scrapedRaw && Object.keys(d.scrapedRaw).length > 0) setScrapedRaw(d.scrapedRaw);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(load, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleSave = async (name: string, yearsRemaining: number | null, capHit: number | null) => {
    const res  = await fetch("/api/admin/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, yearsRemaining, capHit }),
    });
    const data = await res.json();
    const dest = data.destination === "bundled" ? " → written to bundled.json" : " → admin override";
    showToast(`Saved ${name}${dest}`);
    load();
  };

  const handleClear = async (name: string) => {
    await fetch("/api/admin/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, clear: true }),
    });
    showToast(`Cleared admin override for ${name}`);
    load();
  };

  const handleSync = async () => {
    if (!scrapedRaw) {
      showToast("Load live data first — click + LIVE DELTA, then sync");
      return;
    }
    setSyncing(true);
    try {
      const res  = await fetch("/api/admin/contracts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: scrapedRaw }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      showToast(`Synced — ${data.added} new players added (${data.total} total)`);
      load();
    } catch (e: any) {
      showToast(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    let list = contracts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || (r.team ?? "").includes(q));
    }
    if (filter === "flagged") list = list.filter(r => (r.delta ?? 0) >= 1);
    if (filter === "admin")   list = list.filter(r => r.source === "admin");
    return list;
  }, [contracts, search, filter]);

  const flaggedCount = contracts.filter(r => (r.delta ?? 0) >= 1).length;
  const adminCount   = contracts.filter(r => r.source === "admin").length;

  return (
    <div style={{ minHeight: "100vh", background: "#0f0c07", color: "#e4d8b8",
      fontFamily: "'Courier Prime', monospace" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #3a2e1a", padding: "16px 24px",
        display: "flex", alignItems: "center", gap: 16 }}>
        <a href="/trade" style={{ fontSize: 11, color: "#8a7a5a", textDecoration: "none",
          letterSpacing: "0.1em" }}>← TRADE MACHINE</a>
        <span style={{ color: "#3a2e1a" }}>|</span>
        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.2em" }}>
          CONTRACT ADMIN
        </span>
        <span style={{ fontSize: 11, color: "#8a7a5a", marginLeft: "auto" }}>
          {contracts.length} players · {flaggedCount} flagged · {adminCount} overrides
        </span>
        <button onClick={handleSync} disabled={syncing || !scrapedRaw}
          title={!scrapedRaw ? "Click + LIVE DELTA first to load CapWages data" : ""}
          style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
            background: syncing ? "#1a1a0a" : scrapedRaw ? "#1e3a1e" : "#1a1a1a",
            border: `1px solid ${scrapedRaw ? "#2a5a2a" : "#2a2a2a"}`,
            color: syncing ? "#5a7a5a" : scrapedRaw ? "#6bcf6b" : "#3a3a3a",
            cursor: (syncing || !scrapedRaw) ? "default" : "pointer", letterSpacing: "0.1em" }}>
          {syncing ? "SYNCING..." : "SYNC CAPWAGES"}
        </button>
        <button onClick={() => load(false)} style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
          background: "#2a1e0a", border: "1px solid #5a4a2a", color: "#c8b890",
          cursor: "pointer", letterSpacing: "0.1em" }}>
          REFRESH
        </button>
        <button onClick={() => load(true)} disabled={loading}
          style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
            background: "#1a1a2a", border: "1px solid #3a3a5a",
            color: loading ? "#3a3a5a" : "#9a9acf",
            cursor: loading ? "default" : "pointer", letterSpacing: "0.1em" }}>
          + LIVE DELTA
        </button>
      </div>

      {/* Add player */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid #2a1e0a" }}>
        <AddPlayerForm onAdded={() => { load(); showToast("Player added to contracts.bundled.json"); }} />
      </div>

      {/* Filter bar */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid #2a1e0a",
        display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player or team..."
          style={{ fontSize: 12, padding: "6px 12px", background: "#1a1208",
            border: "1px solid #3a2e1a", color: "#e4d8b8", outline: "none", minWidth: 200 }}
        />
        {(["all", "flagged", "admin"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
              letterSpacing: "0.1em", cursor: "pointer",
              background: filter === f ? "#2a1e0a" : "transparent",
              border: `1px solid ${filter === f ? "#5a4a2a" : "#2a1e0a"}`,
              color: filter === f ? "#e4d8b8" : "#8a7a5a" }}>
            {f === "all" ? "ALL" : f === "flagged" ? `FLAGGED (${flaggedCount})` : `ADMIN (${adminCount})`}
          </button>
        ))}
        <span style={{ fontSize: 11, color: "#5a4a2a", marginLeft: "auto" }}>
          {filtered.length} shown
        </span>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid",
        gridTemplateColumns: "200px 60px 60px 70px 70px 70px 70px 70px 80px 60px",
        gap: 8, padding: "8px 24px", borderBottom: "1px solid #2a1e0a",
        fontSize: 9, color: "#5a4a2a", fontWeight: 900, textTransform: "uppercase",
        letterSpacing: "0.12em", position: "sticky", top: 0, background: "#0f0c07", zIndex: 10 }}>
        <div>PLAYER</div>
        <div style={{ textAlign: "center" }}>POS</div>
        <div style={{ textAlign: "center" }}>TEAM</div>
        <div style={{ textAlign: "right" }}>FINAL YRS</div>
        <div style={{ textAlign: "right" }}>FINAL CAP</div>
        <div style={{ textAlign: "right" }}>BUNDLED</div>
        <div style={{ textAlign: "right" }}>SCRAPED</div>
        <div style={{ textAlign: "right" }}>DELTA</div>
        <div style={{ textAlign: "center" }}>SOURCE</div>
        <div />
      </div>

      {/* Rows */}
      {loading ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: "#5a4a2a",
          letterSpacing: "0.2em", fontSize: 11 }}>
          LOADING LIVE DATA...
        </div>
      ) : filtered.map(row => {
        const hasDelta   = (row.delta ?? 0) >= 1;
        const hasAdmin   = row.source === "admin";
        const rowBg      = hasAdmin ? "#0d1a0d" : hasDelta ? "#1a0f00" : "transparent";

        return (
          <div key={row.name}
            style={{ display: "grid",
              gridTemplateColumns: "200px 60px 60px 70px 70px 70px 70px 70px 80px 60px",
              gap: 8, padding: "7px 24px", borderBottom: "1px solid #1a1208",
              fontSize: 11, background: rowBg, alignItems: "center",
              transition: "background 0.1s" }}>

            <div style={{ fontWeight: 700, color: "#e4d8b8", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.name}
              {row.hasNMC && <span style={{ fontSize: 9, color: "#cf4040", border: "1px solid #cf404050",
                padding: "0 3px", marginLeft: 5 }}>NMC</span>}
            </div>

            <div style={{ textAlign: "center", color: "#8a7a5a" }}>{row.position ?? "—"}</div>
            <div style={{ textAlign: "center", color: "#8a7a5a", fontSize: 10 }}>
              {row.team ? row.team.replace(/_/g, " ").slice(0, 6).toUpperCase() : "—"}
            </div>

            <div style={{ textAlign: "right", fontWeight: 900,
              color: hasAdmin ? "#7ec8e3" : "#e4d8b8" }}>
              {row.finalYears}yr
            </div>
            <div style={{ textAlign: "right", color: "#c8b890" }}>
              {row.finalCap != null ? `$${row.finalCap.toFixed(2)}M` : "—"}
            </div>
            <div style={{ textAlign: "right", color: "#5a4a2a" }}>
              {row.bundledYears != null ? `${row.bundledYears}yr` : "—"}
            </div>
            <div style={{ textAlign: "right", color: "#5a6a5a" }}>
              {row.scrapedYears != null ? `${row.scrapedYears}yr` : "—"}
            </div>
            <div style={{ textAlign: "right",
              color: (row.delta ?? 0) >= 3 ? "#cf4040" : (row.delta ?? 0) >= 1 ? "#f0a500" : "#3a2e1a",
              fontWeight: (row.delta ?? 0) >= 1 ? 900 : 400 }}>
              {row.delta != null ? (row.delta >= 1 ? `Δ${row.delta}` : "—") : "?"}
            </div>

            <div style={{ textAlign: "center" }}>
              <SourceBadge source={row.source} />
            </div>

            <button onClick={() => setEditing(row)}
              style={{ fontSize: 10, fontWeight: 900, padding: "3px 8px",
                background: "transparent", border: "1px solid #3a2e1a",
                color: "#8a7a5a", cursor: "pointer", letterSpacing: "0.1em" }}>
              EDIT
            </button>
          </div>
        );
      })}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "#5a4a2a",
          letterSpacing: "0.2em", fontSize: 11 }}>
          NO PLAYERS MATCH
        </div>
      )}

      {editing && (
        <EditModal
          row={editing}
          onSave={handleSave}
          onClear={handleClear}
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
