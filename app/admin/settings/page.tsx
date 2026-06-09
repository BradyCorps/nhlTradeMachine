"use client";

import React, { useEffect, useState } from "react";

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
  const [toast,    setToast]    = useState<string | null>(null);

  const load = () =>
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then((d: Settings) => {
        setSettings(d);
        setCeiling(d.capCeiling?.toString() ?? "");
        setFloor(d.capFloor?.toString()     ?? "");
      });

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const save = async (clearOverrides = false) => {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capCeiling: clearOverrides ? null : (ceiling.trim() !== "" ? parseFloat(ceiling) : null),
        capFloor:   clearOverrides ? null : (floor.trim()   !== "" ? parseFloat(floor)   : null),
      }),
    });
    setSaving(false);
    showToast(clearOverrides ? "Cleared — using season-config defaults" : "Saved · Redis cache busted");
    load();
  };

  const clearCache = async () => {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_cache" }),
    });
    setSaving(false);
    showToast("Redis cache cleared — reload the trade machine to see fresh data");
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
                placeholder={def ? String(def.capCeiling) : "95.5"} type="number" step="0.5" style={inputStyle} />
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

        <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", lineHeight: 1.7, letterSpacing: "0.05em" }}>
          Cap space values come from TEAMS_DB (app/lib/db.ts) — anchored to start of 2025-26.<br />
          CapWages scraping for cap space has been disabled as it returns post-season offseason projections.
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--ledger-ink)",
          color: "var(--paper)", padding: "10px 16px", fontSize: 11, fontWeight: 900,
          letterSpacing: "0.1em", zIndex: 200, fontFamily: "'Courier Prime', monospace" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
