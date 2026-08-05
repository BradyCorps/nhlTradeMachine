"use client";

import React, { useEffect, useState, useMemo } from "react";
import { adminErrorMessage, readAdminResponse } from "../admin-response";
import { toast } from "@/app/lib/ledger-toast";
import { TEAMS_DB } from "@/app/lib/db";
import NeedsDataPanel from "@/app/admin/contracts/NeedsDataPanel";
import PastePanel from "@/app/admin/contracts/PastePanel";

// The 32 clubs, alphabetical by name, for the admin team pickers.
const TEAM_OPTIONS = [...TEAMS_DB].sort((a, b) => a.name.localeCompare(b.name));

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
  retired:       boolean;
  retiredDate:   string | null;
  expiryStatus:  string | null;
  expiryYear:    number | null;
  extensionCapHit: number | null;
  extensionYears:  number | null;
  excludeFromRoster: boolean;
  dbSource:      string | null;
  needsData:     boolean;
  delta:         number | null;
  source:        string;
}

const POSITION_OPTIONS = ["C", "W", "D", "G"] as const;
const MONO = "'Courier Prime', monospace";

// Shared light-paper field styling for inputs/selects/textareas.
const field: React.CSSProperties = {
  background: "var(--paper)", border: "1px solid var(--rule)",
  color: "var(--ledger-ink)", fontFamily: MONO, outline: "none",
};

function SourceBadge({ source }: { source: string }) {
  // Light-theme badges: a soft accent tint with the saturated accent text.
  const cfg: Record<string, { bg: string; color: string }> = {
    // DB provenance (the single source of truth).
    editor:   { bg: "#e3e7f1", color: "#1a4b5b" },
    sync:     { bg: "#e0eee0", color: "#1a5c2e" },
    seed:     { bg: "#e4d8b8", color: "#6b5030" },
    missing:  { bg: "#f4e0db", color: "#b83020" },
    // Legacy scrape-preview labels (only when ?scrape=1 delta view is active).
    admin:    { bg: "#e3e7f1", color: "#1a4b5b" },
    override: { bg: "#f1e7d0", color: "#8a5c00" },
    scraper:  { bg: "#e0eee0", color: "#1a5c2e" },
    bundled:  { bg: "#e4d8b8", color: "#6b5030" },
    default:  { bg: "#f4e0db", color: "#b83020" },
  };
  const s = cfg[source] ?? cfg.default;
  return (
    <span style={{ fontSize: 10, fontWeight: 900, padding: "1px 5px", letterSpacing: "0.1em",
      background: s.bg, color: s.color, border: `1px solid ${s.color}40` }}>
      {source.toUpperCase()}
    </span>
  );
}

function FaBadge({ status, year }: { status: string | null; year: number | null }) {
  if (!status) return null;
  const u = status.toUpperCase();
  const color = u === "RFA" ? "#8a5c00" : "#b83020";
  return (
    <span title={year ? `Expires ${year}` : undefined}
      style={{ fontSize: 9, fontWeight: 900, padding: "0 3px", marginLeft: 5,
        color, border: `1px solid ${color}50`, letterSpacing: "0.08em" }}>
      {u}{year ? ` ${year}` : ""}
    </span>
  );
}

interface ContractEdit {
  name: string;
  yearsRemaining: number | null;
  capHit: number | null;
  position: string | null;
  teamId: string | null;
  expiryStatus: string | null;       // "UFA" | "RFA" | null (SIGNED)
  expiryYear: number | null;
  extensionCapHit: number | null;
  extensionYears: number | null;
  clearExtension?: boolean;
  excludeFromRoster: boolean;
}

const FA_OPTIONS = ["SIGNED", "UFA", "RFA"] as const;

function EditModal({ row, onSave, onClear, onClose }: {
  row:     ContractRow;
  onSave:  (edit: ContractEdit) => Promise<void>;
  onClear: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [years, setYears] = useState(String(row.adminYears ?? row.finalYears ?? ""));
  const [cap,   setCap]   = useState(String(row.adminCap   ?? row.finalCap   ?? ""));
  const [position, setPosition] = useState(POSITION_OPTIONS.includes(row.position as any) ? String(row.position) : "");
  // Team: default to the row's current club if it maps to a real team id
  // (row.team may arrive as a slug/abbrev in mixed case).
  const initTeam = row.team ? (TEAM_OPTIONS.find(t => t.id === row.team!.toUpperCase())?.id ?? "") : "";
  const [teamId, setTeamId] = useState(initTeam);
  const initFa = (row.expiryStatus ?? "").toUpperCase();
  const [fa, setFa] = useState<string>(initFa === "UFA" || initFa === "RFA" ? initFa : "SIGNED");
  const [faYear, setFaYear] = useState(String(row.expiryYear ?? ""));
  const [extCap, setExtCap] = useState(row.extensionCapHit ? String(row.extensionCapHit) : "");
  const [extYrs, setExtYrs] = useState(row.extensionYears ? String(row.extensionYears) : "");
  const [exclude, setExclude] = useState(Boolean(row.excludeFromRoster));
  const [saving, setSaving] = useState(false);
  const hasExt = extCap !== "" && parseFloat(extCap) > 0;

  const handle = async (clear = false) => {
    setSaving(true);
    try {
      if (clear) {
        await onClear(row.name);
      } else {
        const y = parseFloat(years);
        const c = parseFloat(cap);
        const fy = parseInt(faYear);
        const ec = parseFloat(extCap);
        const ey = parseInt(extYrs);
        const expiryStatus = fa === "UFA" || fa === "RFA" ? fa : null;
        const hadExtension = row.extensionCapHit != null && row.extensionCapHit > 0;
        await onSave({
          name: row.name,
          yearsRemaining: isNaN(y) ? null : y,
          capHit: isNaN(c) ? null : c,
          position: position || null,
          teamId: teamId || null,
          expiryStatus,
          expiryYear: expiryStatus ? (isNaN(fy) ? null : fy) : null,
          extensionCapHit: hasExt ? (isNaN(ec) ? null : ec) : null,
          extensionYears: hasExt ? (isNaN(ey) ? null : ey) : null,
          clearExtension: hadExtension && !hasExt,
          excludeFromRoster: exclude,
        });
      }
      onClose();
    } catch {
      // Parent handlers surface the server error.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(28,20,10,0.6)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={onClose}>
      <div className="admin-modal-card" style={{
        background: "var(--ledger-card-light)", border: "1px solid var(--rule)", borderTop: "3px solid var(--ledger-ink)",
        padding: "24px", minWidth: 340, maxWidth: 420,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "var(--ledger-ink)", marginBottom: 16,
          fontFamily: MONO, letterSpacing: "0.05em" }}>
          {row.name}
          <span style={{ fontSize: 11, color: "var(--ledger-ink-faint)", marginLeft: 8 }}>
            {row.position} {row.team && `· ${row.team.toUpperCase()}`}
          </span>
        </div>

        <div className="admin-modal-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Bundled", val: row.bundledYears, cap: null },
            { label: "Scraped", val: row.scrapedYears, cap: null },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--paper-inset)", border: "1px solid var(--ledger-rule-light)", padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "var(--ledger-ink-faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--ledger-ink-body)", marginTop: 2 }}>
                {s.val != null ? `${s.val}yr` : "—"}
              </div>
            </div>
          ))}
        </div>

        <div className="admin-modal-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "var(--ledger-ink-faint)", textTransform: "uppercase",
              letterSpacing: "0.1em", marginBottom: 5 }}>
              Years Remaining
            </label>
            <input
              type="number" min={0} max={12} step={1}
              value={years}
              onChange={e => setYears(e.target.value)}
              style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "var(--ledger-ink-faint)", textTransform: "uppercase",
              letterSpacing: "0.1em", marginBottom: 5 }}>
              Cap Hit ($M)
            </label>
            <input
              type="number" min={0} max={20} step={0.001}
              value={cap}
              onChange={e => setCap(e.target.value)}
              style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "var(--ledger-ink-faint)", textTransform: "uppercase",
              letterSpacing: "0.1em", marginBottom: 5 }}>
              Position
            </label>
            <select
              value={position}
              onChange={e => setPosition(e.target.value)}
              style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 13 }}
            >
              <option value="">Keep</option>
              {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* Team assignment — place the player on (or move them between) clubs */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 10, color: "var(--ledger-ink-faint)", textTransform: "uppercase",
            letterSpacing: "0.1em", marginBottom: 5 }}>
            Team {!initTeam && <span style={{ color: "var(--ledger-red)" }}>· unassigned</span>}
          </label>
          <select
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
            style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 13 }}
          >
            <option value="">{initTeam ? "Keep current team" : "No team (free agent / unassigned)"}</option>
            {TEAM_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)}
          </select>
        </div>

        {/* Extension — signed next contract that kicks in after current deal */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20,
          background: hasExt ? "rgba(26,46,92,0.06)" : "var(--paper-inset)",
          border: `1px solid ${hasExt ? "var(--ledger-ice)" : "var(--ledger-rule-light)"}`, padding: "10px 12px" }}>
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: hasExt ? "var(--ledger-ice)" : "var(--ledger-ink-faint)",
              textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {hasExt ? "EXTENSION ACTIVE" : "EXTENSION"}
            </span>
            {hasExt && <span style={{ fontSize: 9, color: "var(--ledger-ice)", opacity: 0.6 }}>
              Current deal → then ${extCap}M × {extYrs || "?"}yr
            </span>}
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "var(--ledger-ink-faint)", textTransform: "uppercase",
              letterSpacing: "0.1em", marginBottom: 5 }}>Ext Cap ($M)</label>
            <input type="number" min={0} max={25} step={0.001} value={extCap}
              onChange={e => setExtCap(e.target.value)}
              placeholder="—"
              style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "var(--ledger-ink-faint)", textTransform: "uppercase",
              letterSpacing: "0.1em", marginBottom: 5 }}>Ext Years</label>
            <input type="number" min={1} max={8} step={1} value={extYrs}
              onChange={e => setExtYrs(e.target.value)}
              placeholder="—"
              style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 7 }}>
            {hasExt && <button type="button" onClick={() => { setExtCap(""); setExtYrs(""); }}
              style={{ fontSize: 10, fontWeight: 900, padding: "4px 10px",
                background: "transparent", border: "1px solid var(--ledger-red)",
                color: "var(--ledger-red)", cursor: "pointer", letterSpacing: "0.08em",
                fontFamily: MONO }}>
              CLEAR EXT
            </button>}
          </div>
        </div>

        {/* Free-agency status — first-class DB facts (single source of truth) */}
        <div className="admin-modal-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20,
          background: "var(--paper-inset)", border: "1px solid var(--ledger-rule-light)", padding: "10px 12px" }}>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "var(--ledger-ink-faint)", textTransform: "uppercase",
              letterSpacing: "0.1em", marginBottom: 5 }}>FA Status</label>
            <select value={fa} onChange={e => setFa(e.target.value)}
              style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 13 }}>
              {FA_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "var(--ledger-ink-faint)", textTransform: "uppercase",
              letterSpacing: "0.1em", marginBottom: 5 }}>Expiry Yr</label>
            <input type="number" min={2024} max={2035} step={1} value={faYear}
              disabled={fa === "SIGNED"}
              onChange={e => setFaYear(e.target.value)}
              style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 13,
                background: fa === "SIGNED" ? "var(--ledger-rule-light)" : "var(--paper)",
                color: fa === "SIGNED" ? "var(--ledger-ink-faint)" : "var(--ledger-ink)" }} />
          </div>
          <label style={{ display: "flex", alignItems: "flex-end", gap: 6, fontSize: 11, color: "var(--ledger-red)", cursor: "pointer", paddingBottom: 7 }}>
            <input type="checkbox" checked={exclude} onChange={e => setExclude(e.target.checked)} />
            Exclude from roster
          </label>
        </div>

        <div className="admin-dialog-actions" style={{ display: "flex", gap: 8 }}>
          <button onClick={() => handle(false)} disabled={saving}
            style={{ flex: 1, padding: "8px 0", background: "var(--ledger-green)", border: "1px solid var(--ledger-green)",
              color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer",
              letterSpacing: "0.1em", fontFamily: MONO }}>
            {saving ? "SAVING..." : "SAVE"}
          </button>
          {row.adminYears != null || row.adminCap != null ? (
            <button onClick={() => handle(true)} disabled={saving}
              style={{ padding: "8px 16px", background: "transparent", border: "1px solid var(--ledger-red)",
                color: "var(--ledger-red)", fontSize: 12, fontWeight: 900, cursor: "pointer",
                letterSpacing: "0.1em", fontFamily: MONO }}>
              CLEAR
            </button>
          ) : null}
          <button onClick={onClose}
            style={{ padding: "8px 16px", background: "transparent", border: "1px solid var(--rule)",
              color: "var(--ledger-ink-faint)", fontSize: 12, fontWeight: 900, cursor: "pointer",
              letterSpacing: "0.1em", fontFamily: MONO }}>
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
  const [position, setPosition] = useState("W");
  const [teamId,  setTeamId]  = useState("");
  const [hasNMC,  setHasNMC]  = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setErr("Player name required"); return; }
    const y = parseInt(years);
    const c = parseFloat(cap);
    if (isNaN(y) || y < 1) { setErr("Valid years required (≥1)"); return; }
    if (isNaN(c) || c <= 0) { setErr("Valid cap hit required (> 0)"); return; }
    if (!POSITION_OPTIONS.includes(position as any)) { setErr("Valid position required"); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), yearsRemaining: y, capHit: c, position, hasNMC, teamId: teamId || null }),
      });
      await readAdminResponse(res, "Save failed");
      setName(""); setYears("1"); setCap(""); setPosition("W"); setTeamId(""); setHasNMC(false); setOpen(false);
      onAdded();
    } catch (e) {
      setErr(adminErrorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{ fontSize: 11, fontWeight: 900, padding: "5px 14px",
        background: "rgba(26,46,92,0.10)", border: "1px solid var(--ledger-ice)",
        color: "var(--ledger-ice)", cursor: "pointer", letterSpacing: "0.1em" }}>
      + ADD PLAYER
    </button>
  );

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
      background: "var(--ledger-card-light)", border: "1px solid var(--ledger-ice)", padding: "10px 14px" }}>
      <span style={{ fontSize: 10, color: "var(--ledger-ice)", fontWeight: 900, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
        NEW PLAYER
      </span>
      <input placeholder="Full name (exact)" value={name} onChange={e => setName(e.target.value)}
        style={{ ...field, fontSize: 11, padding: "5px 8px", minWidth: 180 }} />
      <input placeholder="Yrs" type="number" min={1} max={12} value={years}
        onChange={e => setYears(e.target.value)}
        style={{ ...field, fontSize: 11, padding: "5px 8px", width: 50 }} />
      <input placeholder="Cap $M" type="number" min={0.5} max={20} step={0.001} value={cap}
        onChange={e => setCap(e.target.value)}
        style={{ ...field, fontSize: 11, padding: "5px 8px", width: 70 }} />
      <select value={position} onChange={e => setPosition(e.target.value)}
        style={{ ...field, fontSize: 11, padding: "5px 8px", width: 58 }}>
        {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={teamId} onChange={e => setTeamId(e.target.value)} aria-label="Team"
        style={{ ...field, fontSize: 11, padding: "5px 8px", width: 130 }}>
        <option value="">No team</option>
        {TEAM_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.id} — {t.name}</option>)}
      </select>
      <label style={{ fontSize: 10, color: "var(--ledger-ink-faint)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
        <input type="checkbox" checked={hasNMC} onChange={e => setHasNMC(e.target.checked)} />
        NMC
      </label>
      <button onClick={submit} disabled={saving}
        style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
          background: "var(--ledger-green)", border: "1px solid var(--ledger-green)",
          color: "#fff", cursor: "pointer", letterSpacing: "0.1em" }}>
        {saving ? "..." : "SAVE"}
      </button>
      <button onClick={() => { setOpen(false); setErr(null); }}
        style={{ fontSize: 11, fontWeight: 900, padding: "5px 10px",
          background: "transparent", border: "1px solid var(--rule)",
          color: "var(--ledger-ink-faint)", cursor: "pointer" }}>
        ✕
      </button>
      {err && <span style={{ fontSize: 10, color: "var(--ledger-red)" }}>{err}</span>}
    </div>
  );
}

function BulkFaForm({ onDone }: { onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"UFA" | "RFA" | "SIGNED" | "EXCLUDE">("UFA");
  const [saving, setSaving] = useState(false);
  const count = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length;

  const submit = async () => {
    if (count === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/fa-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: text, status }),
      });
      const data = await readAdminResponse<{ updated: number; created: number }>(res, "Bulk FA failed");
      onDone(`Bulk ${status} — ${data.updated} updated, ${data.created} created`);
      setText(""); setOpen(false);
    } catch (e) {
      onDone(adminErrorMessage(e, "Bulk FA failed"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{ fontSize: 11, fontWeight: 900, padding: "5px 14px",
        background: "rgba(26,46,92,0.10)", border: "1px solid var(--ledger-ice)", color: "var(--ledger-ice)",
        cursor: "pointer", letterSpacing: "0.1em" }}>
      ⇪ BULK FREE AGENTS
    </button>
  );

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap",
      background: "var(--ledger-card-light)", border: "1px solid var(--ledger-ice)", padding: "10px 14px" }}>
      <span style={{ fontSize: 10, color: "var(--ledger-ice)", fontWeight: 900, letterSpacing: "0.1em", whiteSpace: "nowrap", paddingTop: 6 }}>
        BULK FA
      </span>
      <textarea placeholder="One player per line (or comma-separated)…" value={text}
        onChange={e => setText(e.target.value)} rows={3}
        style={{ ...field, fontSize: 11, padding: "5px 8px", minWidth: 260, resize: "vertical" }} />
      <select value={status} onChange={e => setStatus(e.target.value as any)}
        style={{ ...field, fontSize: 11, padding: "5px 8px" }}>
        {(["UFA", "RFA", "SIGNED", "EXCLUDE"] as const).map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button onClick={submit} disabled={saving || count === 0}
        style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
          background: count === 0 ? "transparent" : "var(--ledger-ice)", border: "1px solid var(--ledger-ice)",
          color: count === 0 ? "var(--ledger-ink-faint)" : "#fff", cursor: count === 0 ? "default" : "pointer", letterSpacing: "0.1em" }}>
        {saving ? "..." : `APPLY (${count})`}
      </button>
      <button onClick={() => { setOpen(false); setText(""); }}
        style={{ fontSize: 11, fontWeight: 900, padding: "5px 10px",
          background: "transparent", border: "1px solid var(--rule)", color: "var(--ledger-ink-faint)", cursor: "pointer" }}>
        ✕
      </button>
    </div>
  );
}

export default function AdminContractsPage() {
  const [contracts, setContracts]   = useState<ContractRow[]>([]);
  const [scrapedRaw, setScrapedRaw] = useState<Record<string, any> | null>(null);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState<"all" | "flagged" | "editor" | "needs" | "ext">("all");
  const [editing, setEditing]       = useState<ContractRow | null>(null);
  const [dbError, setDbError]       = useState<string | null>(null);
  const [resettingSource, setResettingSource] = useState(false);

  const load = () => {
    setLoading(true);
    const url = "/api/admin/contracts";
    fetch(url)
      .then(r => r.json())
      .then(d => {
        setContracts(d.contracts ?? []);
        setDbError(d.dbError ?? null);
        if (d.scrapedRaw && Object.keys(d.scrapedRaw).length > 0) setScrapedRaw(d.scrapedRaw);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = async (edit: ContractEdit) => {
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      await readAdminResponse<{ destination?: string }>(res, "Save failed");
      toast(`Saved ${edit.name} → editor-curated`, "success");
      load();
    } catch (e) {
      toast(adminErrorMessage(e, "Save failed"), "error");
      throw e;
    }
  };

  const handleSeed = async () => {
    try {
      const res = await fetch("/api/admin/seed", { method: "POST" });
      const data = await readAdminResponse<{ inserted: number; filled: number; skipped: number }>(res, "Load baseline failed");
      toast(`Baseline loaded — ${data.inserted} added, ${data.filled} FA-filled, ${data.skipped} kept`, "success");
      load();
    } catch (e) {
      toast(adminErrorMessage(e, "Load baseline failed"), "error");
    }
  };

  const handleClear = async (name: string) => {
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, clear: true }),
      });
      await readAdminResponse(res, "Clear failed");
      toast(`Cleared admin override for ${name}`, "success");
      load();
    } catch (e) {
      toast(adminErrorMessage(e, "Clear failed"), "error");
      throw e;
    }
  };

  const handleRetire = async (row: ContractRow) => {
    const retired = !row.retired;
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: row.name, retired }),
      });
      await readAdminResponse(res, retired ? "Retire failed" : "Un-retire failed");
      toast(retired ? `Retired ${row.name}` : `Restored ${row.name}`, "success");
      load();
    } catch (e) {
      toast(adminErrorMessage(e, retired ? "Retire failed" : "Un-retire failed"), "error");
    }
  };

  const handleSync = async () => {
    if (!scrapedRaw) {
      toast("Load live data first — click + LIVE DELTA, then sync", "error");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: scrapedRaw }),
      });
      const data = await readAdminResponse<{
        added: number;
        updated?: number;
        positionsBackfilled?: number;
        total: number;
        watch?: Record<string, any>;
      }>(res, "Sync failed");
      const watched = Object.entries(data.watch ?? {})
        .map(([name, info]: [string, any]) => `${name}: ${info.resolvedTeamId ?? info.currentTeamId ?? "no-team"}`)
        .join(" · ");
      const posNote = data.positionsBackfilled ? ` · ${data.positionsBackfilled} positions filled` : "";
      toast(`Synced — ${data.added} added, ${data.updated ?? 0} updated (${data.total} total)${posNote}${watched ? ` · ${watched}` : ""}`, "success");
      load();
    } catch (e: any) {
      toast(`Sync failed: ${adminErrorMessage(e, "request failed")}`, "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleResetEditorsToSync = async () => {
    if (editorCount === 0) {
      toast("No editor-curated rows to reset", "success");
      return;
    }
    const ok = window.confirm(
      `Switch ${editorCount} editor-curated player rows back to sync and clear curated FA/exclude flags?`
    );
    if (!ok) return;
    setResettingSource(true);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-source", clearCurated: true }),
      });
      const data = await readAdminResponse<{ updated: number }>(res, "Source reset failed");
      toast(`Reset ${data.updated} editor rows back to sync`, "success");
      load();
    } catch (e) {
      toast(adminErrorMessage(e, "Source reset failed"), "error");
    } finally {
      setResettingSource(false);
    }
  };

  const filtered = useMemo(() => {
    let list = contracts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || (r.team ?? "").includes(q));
    }
    if (filter === "flagged") list = list.filter(r => (r.delta ?? 0) >= 1);
    if (filter === "editor")  list = list.filter(r => r.dbSource === "editor");
    if (filter === "needs")   list = list.filter(r => r.needsData);
    if (filter === "ext")     list = list.filter(r => r.extensionCapHit != null && r.extensionCapHit > 0);
    return list;
  }, [contracts, search, filter]);

  const flaggedCount = contracts.filter(r => (r.delta ?? 0) >= 1).length;
  const editorCount  = contracts.filter(r => r.dbSource === "editor").length;
  const needsCount   = contracts.filter(r => r.needsData).length;
  const extCount     = contracts.filter(r => r.extensionCapHit != null && r.extensionCapHit > 0).length;

  return (
    <div className="admin-page" style={{ minHeight: "calc(100vh - 42px)", background: "var(--paper)", color: "var(--ledger-ink)",
      fontFamily: MONO }}>

      {/* Header */}
      <div className="admin-toolbar" style={{ borderBottom: "1px solid var(--rule)", padding: "16px 24px",
        display: "flex", alignItems: "center", gap: 16 }}>
        <a href="/admin" style={{ fontSize: 11, color: "var(--ledger-ink-faint)", textDecoration: "none",
          letterSpacing: "0.1em" }}>← DASHBOARD</a>
        <span style={{ color: "var(--rule)" }}>|</span>
        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.2em" }}>
          CONTRACT ADMIN
        </span>
        <span style={{ fontSize: 11, color: "var(--ledger-ink-faint)", marginLeft: "auto" }}>
          {contracts.length} players · {editorCount} editor · {needsCount} need data
        </span>
        <button onClick={handleSeed}
          title="Load the committed contract/FA baseline into the DB (idempotent; keeps editor rows)"
          style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
            background: "rgba(26,46,92,0.10)", border: "1px solid var(--ledger-ice)", color: "var(--ledger-ice)",
            cursor: "pointer", letterSpacing: "0.1em" }}>
          LOAD BASELINE
        </button>
        <button onClick={handleSync} disabled={syncing || !scrapedRaw}
          title="Push the contracts you have entered into the DB"
          style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
            background: scrapedRaw && !syncing ? "var(--ledger-green)" : "transparent",
            border: `1px solid ${scrapedRaw && !syncing ? "var(--ledger-green)" : "var(--rule)"}`,
            color: scrapedRaw && !syncing ? "#fff" : "var(--ledger-ink-faint)",
            cursor: (syncing || !scrapedRaw) ? "default" : "pointer", letterSpacing: "0.1em" }}>
          {syncing ? "SYNCING..." : "SYNC LIVE"}
        </button>
        <button onClick={handleResetEditorsToSync} disabled={resettingSource || editorCount === 0}
          title="Switch all editor-curated player rows back to sync and clear curated FA/exclude flags"
          style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
            background: editorCount > 0 && !resettingSource ? "rgba(184,48,32,0.08)" : "transparent",
            border: `1px solid ${editorCount > 0 && !resettingSource ? "var(--ledger-red)" : "var(--rule)"}`,
            color: editorCount > 0 && !resettingSource ? "var(--ledger-red)" : "var(--ledger-ink-faint)",
            cursor: editorCount > 0 && !resettingSource ? "pointer" : "default", letterSpacing: "0.1em" }}>
          {resettingSource ? "RESETTING..." : "EDITOR → SYNC"}
        </button>
        <button onClick={() => load()} style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
          background: "transparent", border: "1px solid var(--rule)", color: "var(--ledger-ink-body)",
          cursor: "pointer", letterSpacing: "0.1em" }}>
          REFRESH
        </button>
      </div>

      {/* DB error banner */}
      {dbError && (
        <div style={{ padding: "10px 24px", background: "rgba(184,48,32,0.10)", borderBottom: "1px solid var(--ledger-red)",
          color: "var(--ledger-red)", fontSize: 11, fontWeight: 900, letterSpacing: "0.05em" }}>
          ⚠ DATABASE READ FAILED — {dbError}
        </div>
      )}

      {/* Add player + bulk FA */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--ledger-rule-light)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <AddPlayerForm onAdded={() => { load(); toast("Player added to the DB (editor-curated)", "success"); }} />
        <BulkFaForm onDone={(msg) => { load(); toast(msg, "success"); }} />
      </div>

      {/* Roster gaps — players the pipeline could not price. Distinct from the
          "needs" filter below, which looks at contract ROWS and therefore
          cannot show a player who has no row at all. */}
      <NeedsDataPanel onPick={name => { setSearch(name); setFilter("all"); }} />

      {/* Paste a signings list. The replacement for the scrape: a human copies
          a transactions page, the parser checks itself, nothing is written
          until it has been looked at. */}
      <PastePanel onSaved={() => load()} />

      {/* Filter bar */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--ledger-rule-light)",
        display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player or team..."
          className="admin-fluid-input"
          style={{ ...field, fontSize: 12, padding: "6px 12px", minWidth: 200 }}
        />
        {(["all", "flagged", "editor", "needs", "ext"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 11, fontWeight: 900, padding: "5px 12px",
              letterSpacing: "0.1em", cursor: "pointer",
              background: filter === f ? "var(--paper-inset)" : "transparent",
              border: `1px solid ${filter === f ? "var(--rule)" : "var(--ledger-rule-light)"}`,
              color: filter === f ? "var(--ledger-ink)" : "var(--ledger-ink-faint)" }}>
            {f === "all" ? "ALL"
              : f === "flagged" ? `FLAGGED (${flaggedCount})`
              : f === "editor" ? `EDITOR (${editorCount})`
              : f === "ext" ? `EXT (${extCount})`
              : `NEEDS DATA (${needsCount})`}
          </button>
        ))}
        <span style={{ fontSize: 11, color: "var(--ledger-ink-faint)", marginLeft: "auto" }}>
          {filtered.length} shown
        </span>
      </div>

      <div className="admin-scroll-table">
      {/* Column headers */}
      <div style={{ display: "grid",
        gridTemplateColumns: "200px 60px 60px 70px 70px 70px 70px 70px 80px 128px",
        gap: 8, padding: "8px 24px", borderBottom: "1px solid var(--rule)",
        fontSize: 9, color: "var(--ledger-ink-faint)", fontWeight: 900, textTransform: "uppercase",
        letterSpacing: "0.12em", position: "sticky", top: 0, background: "var(--paper)", zIndex: 10 }}>
        <div>PLAYER</div>
        <div style={{ textAlign: "center" }}>POS</div>
        <div style={{ textAlign: "center" }}>TEAM</div>
        <div style={{ textAlign: "right" }}>FINAL YRS</div>
        <div style={{ textAlign: "right" }}>FINAL CAP</div>
        <div style={{ textAlign: "right" }}>BUNDLED</div>
        <div style={{ textAlign: "right" }}>SCRAPED</div>
        <div style={{ textAlign: "right" }}>DELTA</div>
        <div style={{ textAlign: "center" }}>SOURCE</div>
        <div style={{ textAlign: "right" }}>ACTIONS</div>
      </div>

      {/* Rows */}
      {loading ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--ledger-ink-faint)",
          letterSpacing: "0.2em", fontSize: 11 }}>
          LOADING LIVE DATA...
        </div>
      ) : filtered.map(row => {
        const hasDelta   = (row.delta ?? 0) >= 1;
        const hasAdmin   = row.source === "admin";
        const rowBg      = hasAdmin ? "rgba(26,92,46,0.06)" : hasDelta ? "rgba(148,105,20,0.07)" : "transparent";

        return (
          <div key={row.name}
            style={{ display: "grid",
              gridTemplateColumns: "200px 60px 60px 70px 70px 70px 70px 70px 80px 128px",
              gap: 8, padding: "7px 24px", borderBottom: "1px solid var(--ledger-rule-light)",
              fontSize: 11, background: rowBg, alignItems: "center",
              transition: "background 0.1s" }}>

            <div style={{ fontWeight: 700, color: "var(--ledger-ink)", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.name}
              {row.hasNMC && <span style={{ fontSize: 9, color: "#b83020", border: "1px solid #b8302050",
                padding: "0 3px", marginLeft: 5 }}>NMC</span>}
              <FaBadge status={row.expiryStatus} year={row.expiryYear} />
              {row.extensionCapHit != null && row.extensionCapHit > 0 && <span style={{ fontSize: 9, color: "#1a4b5b", border: "1px solid #1a4b5b50",
                padding: "0 3px", marginLeft: 5, background: "rgba(26,46,92,0.08)" }}>EXT</span>}
              {row.excludeFromRoster && <span style={{ fontSize: 9, color: "#b83020", border: "1px solid #b8302050",
                padding: "0 3px", marginLeft: 5 }}>EXCL</span>}
            </div>

            <div style={{ textAlign: "center", color: "var(--ledger-ink-faint)" }}>{row.position ?? "—"}</div>
            <div style={{ textAlign: "center", color: "var(--ledger-ink-faint)", fontSize: 10 }}>
              {row.team ? row.team.replace(/_/g, " ").slice(0, 6).toUpperCase() : "—"}
            </div>

            <div style={{ textAlign: "right", fontWeight: 900,
              color: hasAdmin ? "var(--ledger-ice)" : "var(--ledger-ink)" }}>
              {row.finalYears}yr
            </div>
            <div style={{ textAlign: "right", color: "var(--ledger-ink-body)" }}>
              {row.finalCap != null ? `$${row.finalCap.toFixed(2)}M` : "—"}
            </div>
            <div style={{ textAlign: "right", color: "var(--ledger-ink-faint)" }}>
              {row.bundledYears != null ? `${row.bundledYears}yr` : "—"}
            </div>
            <div style={{ textAlign: "right", color: "var(--ledger-ink-faint)" }}>
              {row.scrapedYears != null ? `${row.scrapedYears}yr` : "—"}
            </div>
            <div style={{ textAlign: "right",
              color: (row.delta ?? 0) >= 3 ? "var(--ledger-red)" : (row.delta ?? 0) >= 1 ? "var(--amber)" : "var(--ledger-rule)",
              fontWeight: (row.delta ?? 0) >= 1 ? 900 : 400 }}>
              {row.delta != null ? (row.delta >= 1 ? `Δ${row.delta}` : "—") : "?"}
            </div>

          <div style={{ textAlign: "center" }}>
              {row.retired
                ? <span title={row.retiredDate ?? undefined} style={{ fontSize: 10, fontWeight: 900, padding: "1px 5px", letterSpacing: "0.1em",
                  background: "#f4e0db", color: "#b83020", border: "1px solid #b8302040" }}>RETIRED</span>
                : <SourceBadge source={row.dbSource ?? "missing"} />}
            </div>

            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(row)}
                style={{ fontSize: 10, fontWeight: 900, padding: "3px 8px",
                  background: "transparent", border: "1px solid var(--rule)",
                  color: "var(--ledger-ink-faint)", cursor: "pointer", letterSpacing: "0.1em" }}>
                EDIT
              </button>
              <button onClick={() => handleRetire(row)}
                style={{ fontSize: 10, fontWeight: 900, padding: "3px 8px",
                  background: "transparent",
                  border: `1px solid ${row.retired ? "var(--ledger-green)" : "var(--ledger-red)"}`,
                  color: row.retired ? "var(--ledger-green)" : "var(--ledger-red)", cursor: "pointer", letterSpacing: "0.1em" }}>
                {row.retired ? "RESTORE" : "RETIRE"}
              </button>
            </div>
          </div>
        );
      })}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--ledger-ink-faint)",
          letterSpacing: "0.2em", fontSize: 11 }}>
          NO PLAYERS MATCH
        </div>
      )}
      </div>

      {editing && (
        <EditModal
          row={editing}
          onSave={handleSave}
          onClear={handleClear}
          onClose={() => setEditing(null)}
        />
      )}

    </div>
  );
}
