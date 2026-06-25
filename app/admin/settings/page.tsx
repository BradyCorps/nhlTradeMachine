"use client";

import React, { useEffect, useState } from "react";
import { adminErrorMessage, readAdminResponse } from "../admin-response";
import { toast } from "@/app/lib/ledger-toast";

interface Settings {
  capCeiling: number | null;
  capFloor:   number | null;
  defaults:   { capCeiling: number; capFloor: number; label: string };
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [ceiling,  setCeiling]  = useState("");
  const [floor,    setFloor]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [includeTrades, setIncludeTrades] = useState(false);

  const load = () =>
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then((d: Settings) => {
        setSettings(d);
        setCeiling(d.capCeiling?.toString() ?? "");
        setFloor(d.capFloor?.toString()     ?? "");
      });

  useEffect(() => { load(); }, []);

  const save = async (clearOverrides = false) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capCeiling: clearOverrides ? null : (ceiling.trim() !== "" ? parseFloat(ceiling) : null),
          capFloor:   clearOverrides ? null : (floor.trim()   !== "" ? parseFloat(floor)   : null),
        }),
      });
      await readAdminResponse(res, "Save failed");
      toast(clearOverrides ? "Cleared — using season-config defaults" : "Saved · Redis cache busted", "success");
      load();
    } catch (e) {
      toast(adminErrorMessage(e, "Save failed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const clearCache = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_cache" }),
      });
      await readAdminResponse(res, "Cache clear failed");
      toast("Redis cache cleared — reload Armchair GM to see fresh data", "success");
    } catch (e) {
      toast(adminErrorMessage(e, "Cache clear failed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const hardReset = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: resetPhrase, includeTrades }),
      });
      const data = await readAdminResponse<{ deleted?: Record<string, number> }>(res, "Reset failed");
      const total = Object.values(data.deleted ?? {}).reduce((sum, value) => sum + value, 0);
      toast(`Admin reset complete · ${total} rows removed · caches cleared`, "success");
      setResetPhrase("");
      setIncludeTrades(false);
      load();
    } catch (e) {
      toast(adminErrorMessage(e, "Reset failed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const def        = settings?.defaults;
  const hasOverride = settings?.capCeiling !== null || settings?.capFloor !== null;

  const inputStyle: React.CSSProperties = {
    background: "var(--paper)", border: "1px solid var(--rule)",
    color: "var(--ledger-ink)", padding: "8px 12px", fontSize: 13,
    fontFamily: "'Courier Prime', monospace", width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "calc(100vh - 42px)", background: "var(--paper)", color: "var(--ledger-ink)", fontFamily: "'Courier Prime', monospace" }}>

      {/* Page header */}
      <div style={{ borderBottom: "1px solid var(--rule)", padding: "14px 24px" }}>
        <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--ledger-ink-faint)", marginBottom: 2 }}>ADMIN</div>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.18em" }}>SETTINGS</div>
      </div>

      <div style={{ maxWidth: 500, padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Cap ceiling / floor */}
        <div style={{ border: "1px solid var(--rule)", borderTop: "3px solid var(--ledger-ink)", padding: "20px 22px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>CAP CEILING &amp; FLOOR</div>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.08em", marginBottom: 18, lineHeight: 1.6 }}>
            {def
              ? <>Season-config defaults ({def.label}): ceiling ${def.capCeiling}M · floor ${def.capFloor}M<br />Leave blank to use those defaults.</>
              : "Loading…"}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.12em", marginBottom: 4 }}>CAP CEILING ($M)</div>
              <input value={ceiling} onChange={e => setCeiling(e.target.value)}
                placeholder={def ? String(def.capCeiling) : "104"} type="number" step="0.5" style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.12em", marginBottom: 4 }}>CAP FLOOR ($M)</div>
              <input value={floor} onChange={e => setFloor(e.target.value)}
                placeholder={def ? String(def.capFloor) : "65.0"} type="number" step="0.5" style={inputStyle} />
            </div>
          </div>

          {hasOverride && (
            <div style={{ fontSize: 9, color: "var(--amber)", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 900 }}>
              ✎ OVERRIDE ACTIVE — ceiling ${settings?.capCeiling}M · floor ${settings?.capFloor}M
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => save(false)} disabled={saving}
              style={{ flex: 1, padding: "9px 0", background: "var(--ledger-ink)", border: "none",
                color: "var(--paper)", fontSize: 11, fontWeight: 900, cursor: "pointer", letterSpacing: "0.12em" }}>
              {saving ? "SAVING…" : "SAVE & BUST CACHE"}
            </button>
            {hasOverride && (
              <button onClick={() => save(true)} disabled={saving}
                style={{ padding: "9px 14px", background: "transparent", border: "1px solid var(--rule)",
                  color: "var(--ledger-ink-faint)", fontSize: 11, fontWeight: 900, cursor: "pointer", letterSpacing: "0.12em" }}>
                RESET
              </button>
            )}
          </div>
        </div>

        {/* Cache control */}
        <div style={{ border: "1px solid var(--rule)", padding: "20px 22px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>REDIS CACHE</div>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.08em", marginBottom: 16, lineHeight: 1.6 }}>
            Teams cache TTL is 6 hours. Clear it here if cap space or standings look stale after updating TEAMS_DB.
          </div>
          <button onClick={clearCache} disabled={saving}
            style={{ padding: "9px 18px", background: "transparent",
              border: "1px solid var(--rule)", color: "var(--ledger-ink-faint)",
              fontSize: 11, fontWeight: 900, cursor: "pointer", letterSpacing: "0.12em" }}>
            {saving ? "CLEARING…" : "CLEAR TEAMS CACHE"}
          </button>
        </div>

        {/* Admin data reset */}
        <div style={{ border: "1px solid #6a2a2a", borderTop: "3px solid #6a2a2a", padding: "20px 22px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4, color: "#8a2f2f" }}>ADMIN DATA RESET</div>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.08em", marginBottom: 14, lineHeight: 1.6 }}>
            Removes mutable admin data so the next roster load falls back to CapWages contracts and NHL roster scrapes.
            Clears contract DB rows, team overrides, trade-block rows, FA overrides, draft-pick overrides, cap settings, and live caches.
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 10, color: "var(--ledger-ink-faint)", lineHeight: 1.5, marginBottom: 12 }}>
            <input type="checkbox" checked={includeTrades} onChange={e => setIncludeTrades(e.target.checked)} />
            Also delete saved Docket trades and published roster overlays. Leave this off if you only want player/roster data to return to scrape defaults.
          </label>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.12em", marginBottom: 4 }}>
            TYPE RESET ADMIN DATA
          </div>
          <input value={resetPhrase} onChange={e => setResetPhrase(e.target.value)}
            placeholder="RESET ADMIN DATA" style={{ ...inputStyle, marginBottom: 10 }} />
          <button onClick={hardReset} disabled={saving || resetPhrase !== "RESET ADMIN DATA"}
            style={{ padding: "9px 18px", background: resetPhrase === "RESET ADMIN DATA" ? "#6a2a2a" : "transparent",
              border: "1px solid #6a2a2a", color: resetPhrase === "RESET ADMIN DATA" ? "#fff0e8" : "#8a5a5a",
              fontSize: 11, fontWeight: 900, cursor: resetPhrase === "RESET ADMIN DATA" ? "pointer" : "not-allowed", letterSpacing: "0.12em" }}>
            {saving ? "RESETTING…" : "HARD RESET ADMIN DATA"}
          </button>
        </div>

        <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", lineHeight: 1.7, letterSpacing: "0.05em" }}>
          Cap space values come from TEAMS_DB (app/lib/db.ts) and use the active season cap setting.<br />
          CapWages scraping for cap space has been disabled as it returns post-season offseason projections.
        </div>
      </div>

    </div>
  );
}
