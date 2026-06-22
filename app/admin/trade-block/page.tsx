"use client";

import React, { useEffect, useState, useMemo } from "react";
import { adminErrorMessage, readAdminResponse } from "../admin-response";

type Status = "requested" | "available" | "untouchable";

interface Entry {
  id:        string;
  name:      string;
  teamId:    string | null;
  status:    Status;
  note:      string | null;
  updatedAt: number | null;
}

interface PlayerOption {
  id:       string;
  name:     string;
  teamId:   string | null;
  position: string;
}

interface TeamOption {
  id:   string;
  name: string;
}

const STATUS_CFG: Record<Status, { label: string; color: string; bg: string }> = {
  requested:   { label: "REQUESTED",   color: "#cf6b6b", bg: "#3a1a1a" },
  available:   { label: "AVAILABLE",   color: "#d4a843", bg: "#3a2a00" },
  untouchable: { label: "UNTOUCHABLE", color: "#7ec8e3", bg: "#1e3a5f" },
};

function pos(p: string) { return (!p || p === "Unknown") ? "—" : p; }

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.available;
  return (
    <span style={{
      fontSize: 9, fontWeight: 900, letterSpacing: "0.1em",
      padding: "2px 6px", background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}50`,
    }}>
      {cfg.label}
    </span>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ entry, onSave, onClose }: {
  entry:   Entry | null;
  onSave:  (data: Omit<Entry, "updatedAt">) => Promise<void>;
  onClose: () => void;
}) {
  const isNew = entry === null;
  const [id,     setId]     = useState(entry?.id     ?? "");
  const [name,   setName]   = useState(entry?.name   ?? "");
  const [teamId, setTeamId] = useState(entry?.teamId ?? "");
  const [status, setStatus] = useState<Status>(entry?.status ?? "available");
  const [note,   setNote]   = useState(entry?.note   ?? "");
  const [saving, setSaving] = useState(false);

  const inp: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "var(--paper)", border: "1px solid var(--rule)",
    color: "var(--ledger-ink)", padding: "7px 10px", fontSize: 12,
    fontFamily: "'Courier Prime', monospace",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: 9, letterSpacing: "0.15em",
    color: "var(--ledger-ink-faint)", marginBottom: 5, textTransform: "uppercase" as const,
  };

  const handle = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id:     id.trim() || name.trim().toLowerCase().replace(/\s+/g, "-"),
        name:   name.trim(),
        teamId: teamId.trim() || null,
        status,
        note:   note.trim() || null,
      });
      onClose();
    } catch {
      // Parent handler reports the failure and keeps this modal open.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        borderTop: "3px solid var(--ledger-ink)",
        padding: "24px", width: "min(420px, 94vw)",
        fontFamily: "'Courier Prime', monospace",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 18 }}>
          {isNew ? "ADD ENTRY" : "EDIT ENTRY"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={lbl}>Player Name</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} />
          </div>
          {isNew && (
            <div>
              <label style={lbl}>ID (leave blank to auto-generate)</label>
              <input value={id} onChange={e => setId(e.target.value)} style={inp}
                placeholder="e.g. connor-mcdavid" />
            </div>
          )}
          <div>
            <label style={lbl}>Team Tricode</label>
            <input value={teamId} onChange={e => setTeamId(e.target.value.toUpperCase())}
              style={inp} placeholder="EDM" maxLength={3} />
          </div>
          <div>
            <label style={lbl}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as Status)}
              style={{ ...inp, appearance: "none" as any }}>
              <option value="requested">Requested</option>
              <option value="available">Available / Being Shopped</option>
              <option value="untouchable">Untouchable</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} style={inp}
              placeholder="e.g. Wants out, NMC limits destinations" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={handle} disabled={saving || !name.trim()}
            style={{
              flex: 1, padding: "9px 0", background: "var(--ledger-ink)",
              border: "none", color: "var(--paper)", fontSize: 11,
              fontWeight: 900, cursor: "pointer", letterSpacing: "0.12em",
            }}>
            {saving ? "SAVING…" : "SAVE"}
          </button>
          <button onClick={onClose}
            style={{
              padding: "9px 16px", background: "transparent",
              border: "1px solid var(--rule)", color: "var(--ledger-ink-faint)",
              fontSize: 11, fontWeight: 900, cursor: "pointer", letterSpacing: "0.12em",
            }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Add Panel — team-first workflow ──────────────────────────────────────
function BulkAddPanel({ allTeams, allPlayers, existingIds, onBulkAdd }: {
  allTeams:    TeamOption[];
  allPlayers:  PlayerOption[];
  existingIds: Set<string>;
  onBulkAdd:   (players: PlayerOption[], status: Status, note: string) => Promise<void>;
}) {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [posFilter,    setPosFilter]    = useState("ALL");
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [status,       setStatus]       = useState<Status>("untouchable");
  const [note,         setNote]         = useState("");
  const [saving,       setSaving]       = useState(false);

  const teamPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    return allPlayers.filter(p => p.teamId === selectedTeam);
  }, [allPlayers, selectedTeam]);

  const filteredPlayers = useMemo(() => {
    if (posFilter === "ALL") return teamPlayers;
    return teamPlayers.filter(p => p.position === posFilter);
  }, [teamPlayers, posFilter]);

  const positions = useMemo(() => {
    const s = new Set(teamPlayers.map(p => p.position).filter(v => v && v !== "Unknown"));
    const order = ["C", "W", "D", "G"];
    return order.filter(p => s.has(p));
  }, [teamPlayers]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const ids = filteredPlayers.map(p => p.id);
    const allSel = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      allSel ? ids.forEach(id => next.delete(id)) : ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleAdd = async () => {
    const toAdd = allPlayers.filter(p => selected.has(p.id));
    if (!toAdd.length) return;
    setSaving(true);
    try {
      await onBulkAdd(toAdd, status, note);
      setSelected(new Set());
      setNote("");
    } catch {
      // Parent handler reports the failure; keep selected players for retry.
    } finally {
      setSaving(false);
    }
  };

  const handleTeamSelect = (team: string) => {
    setSelectedTeam(team);
    setPosFilter("ALL");
    setSelected(new Set());
  };

  const visibleAllSelected = filteredPlayers.length > 0 && filteredPlayers.every(p => selected.has(p.id));

  const inp: React.CSSProperties = {
    background: "var(--paper)", border: "1px solid var(--rule)",
    color: "var(--ledger-ink)", padding: "6px 10px", fontSize: 11,
    fontFamily: "'Courier Prime', monospace",
  };

  const posBtn = (val: string) => (
    <button key={val} onClick={() => setPosFilter(val)}
      style={{
        padding: "3px 9px", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em",
        background: posFilter === val ? "var(--ledger-ink)" : "transparent",
        color: posFilter === val ? "var(--paper)" : "var(--ledger-ink-faint)",
        border: "1px solid var(--rule)", cursor: "pointer",
      }}>
      {val}
    </button>
  );

  return (
    <div style={{
      border: "1px solid var(--rule)", borderTop: "3px solid var(--ledger-ink)",
      margin: "16px 24px", fontFamily: "'Courier Prime', monospace",
    }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em" }}>
          BULK ADD FROM ROSTER
        </div>
        <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", marginTop: 4, letterSpacing: "0.06em" }}>
          Select a team, pick players, choose a status, then add.
        </div>
      </div>

      {/* Step 1: team grid */}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.2em",
          color: "var(--ledger-ink-faint)", marginBottom: 10 }}>
          1 — SELECT TEAM
        </div>
        {allTeams.length === 0 ? (
          <div style={{ fontSize: 10, color: "var(--ledger-ink-faint)", letterSpacing: "0.06em" }}>
            No teams found — ensure the teams table is populated.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allTeams.map(t => (
              <button key={t.id} onClick={() => handleTeamSelect(t.id)}
                title={t.name}
                style={{
                  padding: "4px 10px", fontSize: 10, fontWeight: 900, letterSpacing: "0.1em",
                  background: selectedTeam === t.id ? "var(--ledger-ink)" : "transparent",
                  color: selectedTeam === t.id ? "var(--paper)" : "var(--ledger-ink-faint)",
                  border: "1px solid var(--rule)", cursor: "pointer",
                }}>
                {t.id}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step 2: player checklist */}
      {selectedTeam && (
        <div style={{ borderBottom: "1px solid var(--rule)" }}>
          <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--rule)",
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.2em",
              color: "var(--ledger-ink-faint)" }}>
              2 — SELECT PLAYERS
              <span style={{ fontWeight: 400, marginLeft: 8 }}>
                {selectedTeam} · {teamPlayers.length} player{teamPlayers.length !== 1 ? "s" : ""} in DB
              </span>
            </div>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {["ALL", ...positions].map(p => posBtn(p))}
            </div>
          </div>

          {teamPlayers.length === 0 && (
            <div style={{ padding: "16px 18px", fontSize: 10, color: "var(--ledger-ink-faint)", letterSpacing: "0.06em" }}>
              No players found for {selectedTeam} in the database. Import contracts first.
            </div>
          )}
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {/* Select all */}
            <div onClick={toggleAll} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 18px", cursor: "pointer",
              borderBottom: "2px solid var(--ledger-ink)",
              position: "sticky", top: 0, background: "var(--paper)", zIndex: 1,
            }}>
              <div style={{
                width: 13, height: 13, border: "1px solid var(--rule)", flexShrink: 0,
                background: visibleAllSelected ? "var(--ledger-ink)" : "transparent",
              }} />
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.15em",
                color: "var(--ledger-ink-faint)" }}>
                {visibleAllSelected ? "DESELECT ALL" : "SELECT ALL"} ({filteredPlayers.length})
              </span>
            </div>

            {filteredPlayers.map(p => {
              const checked   = selected.has(p.id);
              const alreadyIn = existingIds.has(p.id);
              return (
                <div key={p.id} onClick={() => toggle(p.id)} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "7px 18px", cursor: "pointer",
                  borderBottom: "1px solid var(--rule)",
                  background: checked ? "rgba(0,0,0,0.04)" : "transparent",
                  opacity: alreadyIn ? 0.42 : 1,
                }}>
                  <div style={{
                    width: 13, height: 13, border: "1px solid var(--rule)", flexShrink: 0,
                    background: checked ? "var(--ledger-ink)" : "transparent",
                  }} />
                  <span style={{ fontSize: 11, fontWeight: checked ? 900 : 400, flex: 1 }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--ledger-ink-faint)",
                    letterSpacing: "0.08em", minWidth: 18, textAlign: "right" }}>
                    {pos(p.position)}
                  </span>
                  {alreadyIn && (
                    <span style={{ fontSize: 8, color: "var(--ledger-ink-faint)",
                      letterSpacing: "0.08em", marginLeft: 4 }}>
                      IN LIST
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: status + submit */}
      <div style={{ padding: "12px 18px", display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "var(--ledger-ink-faint)", marginBottom: 4 }}>
            3 — STATUS
          </div>
          <select value={status} onChange={e => setStatus(e.target.value as Status)}
            style={{ ...inp, appearance: "none" as any, cursor: "pointer" }}>
            <option value="untouchable">Untouchable</option>
            <option value="available">Available</option>
            <option value="requested">Requested</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "var(--ledger-ink-faint)", marginBottom: 4 }}>
            NOTE (OPTIONAL)
          </div>
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Core piece, not moving"
            style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
        </div>
        <button onClick={handleAdd} disabled={saving || selected.size === 0}
          style={{
            padding: "7px 18px", fontSize: 10, fontWeight: 900, letterSpacing: "0.12em",
            whiteSpace: "nowrap", cursor: selected.size > 0 ? "pointer" : "default",
            background: selected.size > 0 ? "var(--ledger-ink)" : "transparent",
            border: "1px solid var(--rule)",
            color: selected.size > 0 ? "var(--paper)" : "var(--ledger-ink-faint)",
          }}>
          {saving ? "ADDING…"
            : selected.size > 0 ? `ADD ${selected.size} PLAYER${selected.size !== 1 ? "S" : ""}`
            : "SELECT PLAYERS"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TradeBlockAdmin() {
  const [entries,    setEntries]    = useState<Entry[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerOption[]>([]);
  const [allTeams,   setAllTeams]   = useState<TeamOption[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<"all" | Status>("all");
  const [search,     setSearch]     = useState("");
  const [editing,    setEditing]    = useState<Entry | null | "new">(null);
  const [showBulk,   setShowBulk]   = useState(false);
  const [patching,   setPatching]   = useState(false);
  const [toast,      setToast]      = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/admin/trade-block");
    const d = await r.json();
    setEntries(d.entries ?? []);
    setAllPlayers(d.players ?? []);
    setAllTeams(d.teams ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const save = async (data: Omit<Entry, "updatedAt">) => {
    try {
      const res = await fetch("/api/admin/trade-block", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await readAdminResponse(res, "Save failed");
      showToast("Saved");
      await load();
    } catch (e) {
      showToast(adminErrorMessage(e, "Save failed"));
      throw e;
    }
  };

  const bulkAdd = async (players: PlayerOption[], status: Status, note: string) => {
    const payload = players.map(p => ({
      id: p.id, name: p.name, teamId: p.teamId,
      status, note: note.trim() || null,
    }));
    try {
      const res = await fetch("/api/admin/trade-block", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await readAdminResponse(res, "Bulk add failed");
      showToast(`Added ${players.length} player${players.length !== 1 ? "s" : ""}`);
      await load();
    } catch (e) {
      showToast(adminErrorMessage(e, "Bulk add failed"));
      throw e;
    }
  };

  const patchTeamIds = async () => {
    setPatching(true);
    showToast("Fetching NHL rosters…");
    try {
      const r = await fetch("/api/admin/patch-team-ids", { method: "POST" });
      const d = await readAdminResponse<{
        failedTeams?: string[];
        patched: number;
        skipped: number;
        totalFromNHL: number;
      }>(r, "Patch failed");
      const failedTeams = d.failedTeams ?? [];
      if (failedTeams.length > 0) {
        showToast(`Patched ${d.patched} · ${d.skipped} skipped · failed: ${failedTeams.join(", ")}`);
      } else if (d.patched === 0 && d.totalFromNHL === 0) {
        showToast("NHL API returned no data — check console for errors");
      } else {
        showToast(`Patched ${d.patched} players (${d.skipped} unmatched)`);
      }
      await load();
    } catch (e) {
      showToast(adminErrorMessage(e, "Patch request failed"));
    } finally {
      setPatching(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from the trade block?`)) return;
    try {
      const res = await fetch("/api/admin/trade-block", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, status: "clear" }),
      });
      await readAdminResponse(res, "Remove failed");
      showToast("Removed");
      await load();
    } catch (e) {
      showToast(adminErrorMessage(e, "Remove failed"));
    }
  };

  const existingIds = useMemo(() => new Set(entries.map(e => e.id)), [entries]);

  const visible = useMemo(() => entries.filter(e => {
    if (filter !== "all" && e.status !== filter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())
      && !(e.teamId ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [entries, filter, search]);

  const counts = useMemo(() => ({
    requested:   entries.filter(e => e.status === "requested").length,
    available:   entries.filter(e => e.status === "available").length,
    untouchable: entries.filter(e => e.status === "untouchable").length,
  }), [entries]);

  const inp: React.CSSProperties = {
    background: "var(--paper)", border: "1px solid var(--rule)",
    color: "var(--ledger-ink)", padding: "6px 10px", fontSize: 11,
    fontFamily: "'Courier Prime', monospace",
  };

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
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--ledger-ink-faint)", marginBottom: 2 }}>ADMIN</div>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.18em" }}>TRADE BLOCK</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tabBtn("all",         `ALL (${entries.length})`)}
          {tabBtn("requested",   `REQUESTED (${counts.requested})`)}
          {tabBtn("available",   `AVAILABLE (${counts.available})`)}
          {tabBtn("untouchable", `UNTOUCHABLE (${counts.untouchable})`)}
        </div>
        {allPlayers.some(p => p.teamId === null) && allPlayers.length > 0 && (
          <button onClick={patchTeamIds} disabled={patching}
            style={{
              padding: "6px 14px", fontSize: 10, fontWeight: 900, cursor: "pointer",
              letterSpacing: "0.15em", background: "transparent",
              border: "1px solid var(--amber)", color: "var(--amber)",
            }}>
            {patching ? "PATCHING…" : "⚠ PATCH TEAM IDs"}
          </button>
        )}
        <button onClick={() => setShowBulk(v => !v)}
          style={{
            padding: "6px 14px", fontSize: 10, fontWeight: 900, cursor: "pointer",
            letterSpacing: "0.15em",
            background: showBulk ? "var(--ledger-ink)" : "transparent",
            border: "1px solid var(--rule)",
            color: showBulk ? "var(--paper)" : "var(--ledger-ink-faint)",
          }}>
          BULK ADD
        </button>
        <button onClick={() => setEditing("new")}
          style={{
            padding: "6px 14px", background: "var(--ledger-ink)", border: "none",
            color: "var(--paper)", fontSize: 10, fontWeight: 900,
            cursor: "pointer", letterSpacing: "0.15em",
          }}>
          + MANUAL
        </button>
      </div>

      {showBulk && (
        <BulkAddPanel
          allTeams={allTeams}
          allPlayers={allPlayers}
          existingIds={existingIds}
          onBulkAdd={bulkAdd}
        />
      )}

      {/* Search */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--rule)" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search player name or team…"
          style={{ ...inp, width: "min(320px, 100%)" }} />
      </div>

      {/* Table */}
      <div style={{ padding: "0 24px 32px" }}>
        {loading ? (
          <div style={{ padding: "40px 0", fontSize: 11, color: "var(--ledger-ink-faint)", letterSpacing: "0.1em" }}>
            LOADING…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: "40px 0", fontSize: 11, color: "var(--ledger-ink-faint)", letterSpacing: "0.1em" }}>
            {entries.length === 0
              ? "No entries — use BULK ADD to flag players from the roster, or + MANUAL for a custom entry."
              : "No entries match this filter."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--ledger-ink)" }}>
                {["PLAYER", "POS", "TEAM", "STATUS", "NOTE", ""].map(h => (
                  <th key={h} style={{
                    textAlign: "left", fontSize: 9, fontWeight: 900,
                    letterSpacing: "0.2em", padding: "6px 10px 8px",
                    color: "var(--ledger-ink-faint)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(e => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                  <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 900 }}>{e.name}</td>
                  <td style={{ padding: "9px 10px", fontSize: 10, color: "var(--ledger-ink-faint)" }}>
                    {(() => {
                      const p = allPlayers.find(p => p.id === e.id);
                      return pos(p?.position ?? "");
                    })()}
                  </td>
                  <td style={{ padding: "9px 10px", fontSize: 11, color: "var(--ledger-ink-faint)" }}>
                    {e.teamId ?? "—"}
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    <StatusBadge status={e.status} />
                  </td>
                  <td style={{
                    padding: "9px 10px", fontSize: 10, color: "var(--ledger-ink-faint)",
                    maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {e.note ?? "—"}
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => setEditing(e)}
                      style={{
                        padding: "3px 10px", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em",
                        background: "transparent", border: "1px solid var(--rule)",
                        color: "var(--ledger-ink-faint)", cursor: "pointer", marginRight: 6,
                      }}>
                      EDIT
                    </button>
                    <button onClick={() => remove(e.id, e.name)}
                      style={{
                        padding: "3px 10px", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em",
                        background: "transparent", border: "1px solid var(--rule)",
                        color: "var(--ledger-ink-faint)", cursor: "pointer",
                      }}>
                      REMOVE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && (
        <EditModal
          entry={editing === "new" ? null : editing}
          onSave={save}
          onClose={() => setEditing(null)}
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
