"use client";

import React, { useEffect, useState, useMemo } from "react";

interface ContractRow {
  name:            string;
  team:            string | null;
  position:        string | null;
  finalYears:      number;
  finalCap:        number | null;
  bundledYears:    number | null;
  scrapedYears:    number | null;
  adminYears:      number | null;
  adminCap:        number | null;
  overrideYears:   number | null;
  hasNMC:          boolean;
  hasNTC:          boolean;
  extensionCapHit: number | null;
  extensionYears:  number | null;
  expiryStatus:    string | null;
  delta:           number | null;
  source:          string;
}

// ── Source badge ──────────────────────────────────────────────────────────────
const SOURCE_CFG: Record<string, { color: string; bg: string }> = {
  admin:    { color: "#7ec8e3", bg: "rgba(126,200,227,0.12)" },
  override: { color: "#d4a843", bg: "rgba(212,168,67,0.12)"  },
  scraper:  { color: "#7fc97f", bg: "rgba(127,201,127,0.12)" },
  bundled:  { color: "var(--ledger-ink-faint)", bg: "rgba(0,0,0,0.06)" },
  default:  { color: "#cf6b6b", bg: "rgba(207,107,107,0.12)" },
};

function SourceBadge({ source }: { source: string }) {
  const s = SOURCE_CFG[source] ?? SOURCE_CFG.default;
  return (
    <span style={{
      fontSize: 9, fontWeight: 900, letterSpacing: "0.1em",
      padding: "2px 6px", color: s.color, background: s.bg,
      border: `1px solid ${s.color}40`,
    }}>
      {source.toUpperCase()}
    </span>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ row, onSave, onClear, onClose }: {
  row:     ContractRow;
  onSave:  (name: string, years: number | null, cap: number | null, extCap: number | null, extYears: number | null) => Promise<void>;
  onClear: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [years,    setYears]    = useState(String(row.adminYears ?? row.finalYears ?? ""));
  const [cap,      setCap]      = useState(String(row.adminCap   ?? row.finalCap   ?? ""));
  const [extCap,   setExtCap]   = useState(String(row.extensionCapHit ?? ""));
  const [extYears, setExtYears] = useState(String(row.extensionYears  ?? ""));
  const [saving,   setSaving]   = useState(false);

  const handle = async (clear = false) => {
    setSaving(true);
    if (clear) {
      await onClear(row.name);
    } else {
      const y  = parseFloat(years);
      const c  = parseFloat(cap);
      const ec = parseFloat(extCap);
      const ey = parseInt(extYears);
      await onSave(
        row.name,
        isNaN(y)  ? null : y,
        isNaN(c)  ? null : c,
        isNaN(ec) ? null : ec,
        isNaN(ey) ? null : ey,
      );
    }
    setSaving(false);
    onClose();
  };

  const inp: React.CSSProperties = {
    width: "100%", background: "var(--paper)", border: "1px solid var(--rule)",
    color: "var(--ledger-ink)", padding: "6px 10px", fontSize: 12,
    fontFamily: "'Courier Prime', monospace", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: 9, color: "var(--ledger-ink-faint)",
    textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        borderTop: "3px solid var(--ledger-ink)",
        padding: "24px", width: "min(400px, 94vw)",
        fontFamily: "'Courier Prime', monospace",
      }} onClick={e => e.stopPropagation()}>

        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 4 }}>{row.name}</div>
        <div style={{ fontSize: 10, color: "var(--ledger-ink-faint)", marginBottom: 18, letterSpacing: "0.08em" }}>
          {row.position ?? "—"}{row.team ? ` · ${row.team.toUpperCase()}` : ""}
        </div>

        {/* Reference values */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          {[
            { label: "Bundled",   val: row.bundledYears  != null ? `${row.bundledYears}yr`  : "—" },
            { label: "Scraped",   val: row.scrapedYears  != null ? `${row.scrapedYears}yr`  : "—" },
          ].map(({ label, val }) => (
            <div key={label} style={{
              background: "rgba(0,0,0,0.04)", border: "1px solid var(--rule)",
              padding: "8px 10px",
            }}>
              <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.12em", marginBottom: 3 }}>
                {label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 900 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Edit fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={lbl}>Years Remaining</label>
            <input type="number" min={0} max={12} step={1} value={years}
              onChange={e => setYears(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Cap Hit ($M)</label>
            <input type="number" min={0} max={20} step={0.001} value={cap}
              onChange={e => setCap(e.target.value)} style={inp} />
          </div>
        </div>

        {/* Extension fields */}
        <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.15em",
          textTransform: "uppercase", marginBottom: 6 }}>
          Extension (leave blank to clear)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={lbl}>Extension Cap Hit ($M)</label>
            <input type="number" min={0} max={25} step={0.001} value={extCap}
              onChange={e => setExtCap(e.target.value)} style={inp} placeholder="e.g. 17.000" />
          </div>
          <div>
            <label style={lbl}>Extension Years</label>
            <input type="number" min={1} max={12} step={1} value={extYears}
              onChange={e => setExtYears(e.target.value)} style={inp} placeholder="e.g. 8" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => handle(false)} disabled={saving}
            style={{
              flex: 1, padding: "8px 0", background: "var(--ledger-ink)", border: "none",
              color: "var(--paper)", fontSize: 11, fontWeight: 900,
              cursor: "pointer", letterSpacing: "0.12em",
            }}>
            {saving ? "SAVING…" : "SAVE"}
          </button>
          {(row.adminYears != null || row.adminCap != null) && (
            <button onClick={() => handle(true)} disabled={saving}
              style={{
                padding: "8px 14px", background: "transparent", border: "1px solid var(--rule)",
                color: "var(--ledger-ink-faint)", fontSize: 11, fontWeight: 900,
                cursor: "pointer", letterSpacing: "0.12em",
              }}>
              CLEAR
            </button>
          )}
          <button onClick={onClose}
            style={{
              padding: "8px 14px", background: "transparent", border: "1px solid var(--rule)",
              color: "var(--ledger-ink-faint)", fontSize: 11, fontWeight: 900,
              cursor: "pointer", letterSpacing: "0.12em",
            }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add player modal ──────────────────────────────────────────────────────────
function AddPlayerModal({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const [name,   setName]   = useState("");
  const [pos,    setPos]    = useState("C");
  const [team,   setTeam]   = useState("");
  const [years,  setYears]  = useState("1");
  const [cap,    setCap]    = useState("");
  const [hasNMC, setHasNMC] = useState(false);
  const [hasNTC, setHasNTC] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  const inp: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "var(--paper)", border: "1px solid var(--rule)",
    color: "var(--ledger-ink)", padding: "7px 10px", fontSize: 12,
    fontFamily: "'Courier Prime', monospace",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: 9, color: "var(--ledger-ink-faint)",
    textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4,
  };

  const submit = async () => {
    if (!name.trim()) { setErr("Player name required"); return; }
    const y = parseInt(years);
    const c = parseFloat(cap);
    if (isNaN(y) || y < 1) { setErr("Valid years required (≥ 1)"); return; }
    if (isNaN(c) || c <= 0) { setErr("Valid cap hit required (> 0)"); return; }
    setSaving(true);
    setErr(null);
    const res = await fetch("/api/admin/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(), yearsRemaining: y, capHit: c,
        hasNMC, hasNTC,
        position: pos, team: team.trim().toUpperCase() || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) { onAdded(); onClose(); }
    else setErr(data.error ?? "Save failed");
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        borderTop: "3px solid var(--ledger-ink)",
        padding: "24px", width: "min(440px, 94vw)",
        fontFamily: "'Courier Prime', monospace",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 18 }}>
          ADD PLAYER
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={lbl}>Full Name (exact)</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp}
              placeholder="Connor McDavid" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>Position</label>
              <select value={pos} onChange={e => setPos(e.target.value)}
                style={{ ...inp, appearance: "none" as any, cursor: "pointer" }}>
                {["C","W","D","G"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Team</label>
              <input value={team} onChange={e => setTeam(e.target.value.toUpperCase())}
                style={inp} placeholder="EDM" maxLength={3} />
            </div>
            <div>
              <label style={lbl}>Years</label>
              <input type="number" min={1} max={12} value={years}
                onChange={e => setYears(e.target.value)} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Cap Hit ($M)</label>
            <input type="number" min={0.5} max={20} step={0.001} value={cap}
              onChange={e => setCap(e.target.value)} style={inp} placeholder="8.500" />
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {[
              { label: "NMC", val: hasNMC, set: setHasNMC },
              { label: "NTC", val: hasNTC, set: setHasNTC },
            ].map(({ label, val, set }) => (
              <label key={label} style={{ display: "flex", alignItems: "center", gap: 7,
                fontSize: 11, color: "var(--ledger-ink)", cursor: "pointer", letterSpacing: "0.08em" }}>
                <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
          {err && <div style={{ fontSize: 10, color: "#cf6b6b", letterSpacing: "0.05em" }}>{err}</div>}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={submit} disabled={saving}
            style={{
              flex: 1, padding: "9px 0", background: "var(--ledger-ink)", border: "none",
              color: "var(--paper)", fontSize: 11, fontWeight: 900,
              cursor: "pointer", letterSpacing: "0.12em",
            }}>
            {saving ? "SAVING…" : "SAVE"}
          </button>
          <button onClick={onClose}
            style={{
              padding: "9px 16px", background: "transparent", border: "1px solid var(--rule)",
              color: "var(--ledger-ink-faint)", fontSize: 11, fontWeight: 900,
              cursor: "pointer", letterSpacing: "0.12em",
            }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminContractsPage() {
  const [contracts,  setContracts]  = useState<ContractRow[]>([]);
  const [scrapedRaw, setScrapedRaw] = useState<Record<string, any> | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [syncing,    setSyncing]    = useState(false);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState<"all" | "flagged" | "admin">("all");
  const [editing,    setEditing]    = useState<ContractRow | null>(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [toast,      setToast]      = useState<string | null>(null);

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

  useEffect(() => load(), []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const handleSave = async (
    name: string,
    yearsRemaining: number | null,
    capHit: number | null,
    extensionCapHit: number | null,
    extensionYears: number | null,
  ) => {
    const res  = await fetch("/api/admin/contracts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, yearsRemaining, capHit, extensionCapHit, extensionYears }),
    });
    const data = await res.json();
    showToast(`Saved ${name}${data.destination === "db-insert" ? " (new entry)" : ""}`);
    load();
  };

  const handleClear = async (name: string) => {
    await fetch("/api/admin/contracts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, clear: true }),
    });
    showToast(`Cleared override for ${name}`);
    load();
  };

  const handleSync = async () => {
    if (!scrapedRaw) { showToast("Load live data first — click LIVE DELTA, then sync"); return; }
    setSyncing(true);
    try {
      const res  = await fetch("/api/admin/contracts", {
        method: "PUT", headers: { "Content-Type": "application/json" },
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

  const tabBtn = (val: typeof filter, label: string) => (
    <button key={val} onClick={() => setFilter(val)}
      style={{
        padding: "5px 12px", fontSize: 9, fontWeight: 900, letterSpacing: "0.15em",
        background: filter === val ? "var(--ledger-ink)" : "transparent",
        color: filter === val ? "var(--paper)" : "var(--ledger-ink-faint)",
        border: "1px solid var(--rule)", cursor: "pointer",
      }}>
      {label}
    </button>
  );

  return (
    <div style={{
      background: "var(--paper)", color: "var(--ledger-ink)",
      fontFamily: "'Courier Prime', monospace",
      minHeight: "calc(100vh - 42px)",
    }}>

      {/* Page header */}
      <div style={{
        borderBottom: "1px solid var(--rule)", padding: "14px 24px",
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--ledger-ink-faint)", marginBottom: 2 }}>ADMIN</div>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.18em" }}>CONTRACTS</div>
        </div>
        <div style={{ fontSize: 10, color: "var(--ledger-ink-faint)", marginLeft: 8 }}>
          {contracts.length} players · {flaggedCount} flagged · {adminCount} overrides
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={handleSync} disabled={syncing || !scrapedRaw}
          title={!scrapedRaw ? "Click LIVE DELTA first to load scraped data" : ""}
          style={{
            fontSize: 10, fontWeight: 900, padding: "5px 12px", letterSpacing: "0.1em",
            background: "transparent", cursor: (syncing || !scrapedRaw) ? "default" : "pointer",
            border: "1px solid var(--rule)",
            color: scrapedRaw ? "var(--ledger-ink)" : "var(--ledger-ink-faint)",
            opacity: !scrapedRaw ? 0.4 : 1,
          }}>
          {syncing ? "SYNCING…" : "SYNC"}
        </button>
        <button onClick={() => load(false)}
          style={{
            fontSize: 10, fontWeight: 900, padding: "5px 12px", letterSpacing: "0.1em",
            background: "transparent", border: "1px solid var(--rule)",
            color: "var(--ledger-ink-faint)", cursor: "pointer",
          }}>
          REFRESH
        </button>
        <button onClick={() => load(true)} disabled={loading}
          style={{
            fontSize: 10, fontWeight: 900, padding: "5px 12px", letterSpacing: "0.1em",
            background: scrapedRaw ? "var(--ledger-ink)" : "transparent",
            border: "1px solid var(--rule)",
            color: scrapedRaw ? "var(--paper)" : "var(--ledger-ink-faint)",
            cursor: loading ? "default" : "pointer",
          }}>
          {scrapedRaw ? "LIVE ✓" : "LIVE DELTA"}
        </button>
        <button onClick={() => setShowAdd(true)}
          style={{
            fontSize: 10, fontWeight: 900, padding: "5px 14px", letterSpacing: "0.1em",
            background: "var(--ledger-ink)", border: "none",
            color: "var(--paper)", cursor: "pointer",
          }}>
          + ADD PLAYER
        </button>
      </div>

      {/* Filter + search bar */}
      <div style={{
        padding: "10px 24px", borderBottom: "1px solid var(--rule)",
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player or team…"
          style={{
            fontSize: 11, padding: "6px 12px",
            background: "var(--paper)", border: "1px solid var(--rule)",
            color: "var(--ledger-ink)", outline: "none", minWidth: 200,
            fontFamily: "'Courier Prime', monospace",
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {tabBtn("all",     `ALL (${contracts.length})`)}
          {tabBtn("flagged", `FLAGGED (${flaggedCount})`)}
          {tabBtn("admin",   `ADMIN (${adminCount})`)}
        </div>
        <span style={{ fontSize: 10, color: "var(--ledger-ink-faint)", marginLeft: "auto" }}>
          {filtered.length} shown
        </span>
      </div>

      {/* Column headers — sticky below layout nav (top: 42px) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(160px,1fr) 50px 55px 70px 72px 65px 65px 62px 80px 52px",
        gap: 6, padding: "7px 24px",
        borderBottom: "2px solid var(--ledger-ink)",
        fontSize: 8, color: "var(--ledger-ink-faint)", fontWeight: 900,
        textTransform: "uppercase", letterSpacing: "0.12em",
        position: "sticky", top: 42, background: "var(--paper)", zIndex: 10,
      }}>
        <div>PLAYER</div>
        <div style={{ textAlign: "center" }}>POS</div>
        <div style={{ textAlign: "center" }}>TEAM</div>
        <div style={{ textAlign: "right" }}>YRS</div>
        <div style={{ textAlign: "right" }}>CAP HIT</div>
        <div style={{ textAlign: "right" }}>BUNDLED</div>
        <div style={{ textAlign: "right" }}>SCRAPED</div>
        <div style={{ textAlign: "right" }}>DELTA</div>
        <div style={{ textAlign: "center" }}>SOURCE</div>
        <div />
      </div>

      {/* Rows */}
      {loading ? (
        <div style={{ padding: "60px 24px", textAlign: "center",
          color: "var(--ledger-ink-faint)", letterSpacing: "0.2em", fontSize: 11 }}>
          LOADING…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center",
          color: "var(--ledger-ink-faint)", letterSpacing: "0.15em", fontSize: 11 }}>
          NO PLAYERS MATCH
        </div>
      ) : filtered.map(row => {
        const hasDelta = (row.delta ?? 0) >= 1;
        const hasAdmin = row.source === "admin";
        return (
          <div key={row.name} style={{
            display: "grid",
            gridTemplateColumns: "minmax(160px,1fr) 50px 55px 70px 72px 65px 65px 62px 80px 52px",
            gap: 6, padding: "6px 24px", borderBottom: "1px solid var(--rule)",
            fontSize: 11, alignItems: "center",
            background: hasAdmin ? "rgba(126,200,227,0.04)" : hasDelta ? "rgba(212,168,67,0.04)" : "transparent",
          }}>
            <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.name}
              {row.hasNMC && (
                <span style={{ fontSize: 8, color: "#cf6b6b", border: "1px solid rgba(207,107,107,0.4)",
                  padding: "0 3px", marginLeft: 5, letterSpacing: "0.05em" }}>NMC</span>
              )}
              {row.hasNTC && (
                <span style={{ fontSize: 8, color: "#d4a843", border: "1px solid rgba(212,168,67,0.4)",
                  padding: "0 3px", marginLeft: 4, letterSpacing: "0.05em" }}>NTC</span>
              )}
            </div>

            <div style={{ textAlign: "center", color: "var(--ledger-ink-faint)", fontSize: 10 }}>
              {row.position ?? "—"}
            </div>
            <div style={{ textAlign: "center", color: "var(--ledger-ink-faint)", fontSize: 10 }}>
              {row.team ? row.team.replace(/_/g, " ").slice(0, 6).toUpperCase() : "—"}
            </div>
            <div style={{ textAlign: "right", fontWeight: 900,
              color: hasAdmin ? "#7ec8e3" : "var(--ledger-ink)" }}>
              {row.finalYears}yr
            </div>
            <div style={{ textAlign: "right", color: "var(--ledger-ink-faint)" }}>
              {row.finalCap != null ? `$${row.finalCap.toFixed(2)}M` : "—"}
            </div>
            <div style={{ textAlign: "right", color: "var(--ledger-ink-faint)", fontSize: 10 }}>
              {row.bundledYears != null ? `${row.bundledYears}yr` : "—"}
            </div>
            <div style={{ textAlign: "right", color: "var(--ledger-ink-faint)", fontSize: 10 }}>
              {row.scrapedYears != null ? `${row.scrapedYears}yr` : "—"}
            </div>
            <div style={{
              textAlign: "right", fontWeight: (row.delta ?? 0) >= 1 ? 900 : 400,
              color: (row.delta ?? 0) >= 3 ? "#cf6b6b"
                   : (row.delta ?? 0) >= 1 ? "#d4a843"
                   : "var(--ledger-ink-faint)",
            }}>
              {row.delta != null ? ((row.delta >= 1) ? `Δ${row.delta}` : "—") : "?"}
            </div>
            <div style={{ textAlign: "center" }}>
              <SourceBadge source={row.source} />
            </div>
            <button onClick={() => setEditing(row)}
              style={{
                fontSize: 9, fontWeight: 900, padding: "3px 8px",
                background: "transparent", border: "1px solid var(--rule)",
                color: "var(--ledger-ink-faint)", cursor: "pointer", letterSpacing: "0.1em",
              }}>
              EDIT
            </button>
          </div>
        );
      })}

      {/* Modals */}
      {editing && (
        <EditModal
          row={editing}
          onSave={handleSave}
          onClear={handleClear}
          onClose={() => setEditing(null)}
        />
      )}
      {showAdd && (
        <AddPlayerModal
          onAdded={() => { load(); showToast("Player added"); }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: "var(--ledger-ink)", color: "var(--paper)",
          padding: "10px 16px", fontSize: 11, fontWeight: 900,
          letterSpacing: "0.1em", zIndex: 300,
          fontFamily: "'Courier Prime', monospace",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
