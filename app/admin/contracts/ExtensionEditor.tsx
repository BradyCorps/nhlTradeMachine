"use client";

// Record or edit a signed extension — deliberately separate from correcting the
// current contract. It sends ONLY extension fields, so saving it cannot touch
// the current deal, ownership, clauses or roster flags, and a save that only
// changes the amount cannot move the signing date.
//
// Units are explicit throughout: every dollar field is in $ millions and the
// annual value is the average annual value (AAV), never the total.

import React, { useMemo, useState } from "react";
import {
  buildExtensionPreview,
  EXTENSION_FLAG_TEXT,
  EXTENSION_MAX_TERM,
  formatMillions,
  type ExtensionInputMode,
} from "@/app/lib/extension-terms";
import { SEASON_START_YEAR } from "@/app/lib/contract-expiry";

const MONO = "'Courier Prime', monospace";
const field: React.CSSProperties = {
  background: "var(--paper)", border: "1px solid var(--rule)",
  color: "var(--ledger-ink)", fontFamily: MONO, outline: "none",
};
const label: React.CSSProperties = {
  display: "block", fontSize: 10, color: "var(--ledger-ink-faint)",
  textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5,
};

export interface ExtensionRowFacts {
  id?: string;
  name: string;
  capHit: number | null;
  yearsRemaining: number | null;
  expiryYear: number | null;
  expiryStatus: string | null;
  extensionCapHit: number | null;
  extensionYears: number | null;
  extensionSignedAt: string | null;
}

export interface ExtensionSavePayload {
  id: string;
  name: string;
  extensionCapHit?: number;
  extensionYears?: number;
  extensionTotalValue?: number;
  extensionSignedAt?: string | null;
  clearExtension?: boolean;
}

const num = (text: string): number => (text.trim() === "" ? NaN : Number(text));

export default function ExtensionEditor({ row, onSave }: {
  row: ExtensionRowFacts;
  onSave: (payload: ExtensionSavePayload) => Promise<void>;
}) {
  const hasStored = row.extensionCapHit != null && row.extensionCapHit > 0;
  const [mode, setMode] = useState<ExtensionInputMode>(hasStored ? "aav" : "total");
  const [years, setYears] = useState(row.extensionYears ? String(row.extensionYears) : "");
  const [value, setValue] = useState(hasStored ? String(row.extensionCapHit) : "");
  const [signed, setSigned] = useState(row.extensionSignedAt ?? "");
  const [signedTouched, setSignedTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => buildExtensionPreview({
    current: {
      capHit: row.capHit, yearsRemaining: row.yearsRemaining,
      expiryYear: row.expiryYear, expiryStatus: row.expiryStatus,
    },
    stored: hasStored
      ? { extensionCapHit: row.extensionCapHit, extensionYears: row.extensionYears, extensionSignedAt: row.extensionSignedAt }
      : { extensionCapHit: null, extensionYears: null, extensionSignedAt: row.extensionSignedAt },
    input: { mode, value: num(value), years: num(years) },
    signedAt: signedTouched ? (signed === "" ? null : signed) : undefined,
    offseasonYear: SEASON_START_YEAR,
  }), [row, hasStored, mode, value, years, signed, signedTouched]);

  const parsed = preview.parsed && preview.parsed.ok ? preview.parsed : null;
  const counterpart = parsed
    ? (mode === "total"
        ? `= ${formatMillions(parsed.aav)} annual (AAV)`
        : `= ${formatMillions(parsed.total)} total contract value`)
    : null;
  const canSave = parsed != null && preview.errors.length === 0 && !saving && Boolean(row.id);
  const nothingToDo = canSave && preview.changes.length === 0;

  const save = async () => {
    if (!parsed || !row.id) return;
    setSaving(true);
    try {
      await onSave({
        id: row.id,
        name: row.name,
        // The AAV is the stored fact. Sending it with the total lets the
        // server confirm the two agree instead of trusting either blindly.
        extensionCapHit: parsed.aav,
        extensionYears: parsed.years,
        ...(mode === "total" ? { extensionTotalValue: parsed.total } : {}),
        ...(signedTouched ? { extensionSignedAt: signed === "" ? null : signed } : {}),
      });
    } catch {
      // The parent surfaces the server error.
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!row.id || !hasStored) return;
    if (!window.confirm(`Remove the recorded extension for ${row.name}? The current contract is not changed.`)) return;
    setSaving(true);
    try {
      await onSave({ id: row.id, name: row.name, clearExtension: true });
    } catch {
      // The parent surfaces the server error.
    } finally {
      setSaving(false);
    }
  };

  const valueId = `ext-value-${row.id ?? "row"}`;
  const yearsId = `ext-years-${row.id ?? "row"}`;
  const signedId = `ext-signed-${row.id ?? "row"}`;

  return (
    <fieldset style={{ border: "1px solid var(--ledger-ice)", background: "rgba(26,46,92,0.05)",
      padding: "12px 14px", margin: "0 0 16px", minWidth: 0 }}>
      <legend style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", color: "var(--ledger-ice)", padding: "0 6px" }}>
        2 · RECORD OR EDIT A SIGNED EXTENSION
      </legend>
      <p style={{ fontSize: 11, margin: "0 0 10px", color: "var(--ledger-ink-body)", lineHeight: 1.5 }}>
        A signed contract that starts after the current one ends. Saving it changes only the extension fields below —
        not the current contract, and not team cap space. Contingent performance bonuses are not guaranteed value:
        enter guaranteed money only (the table stores one annual figure and has no bonus structure).
      </p>

      <div role="radiogroup" aria-label="Enter extension value as" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        {([["total", "Total contract value"], ["aav", "Annual value (AAV)"]] as const).map(([m, text]) => (
          <label key={m} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", minHeight: 32 }}>
            <input type="radio" name={`ext-mode-${row.id ?? "row"}`} checked={mode === m}
              onChange={() => {
                // Switching modes converts what is typed, so a value is never
                // reinterpreted as the other kind.
                if (parsed && mode !== m) setValue(String(m === "total" ? parsed.total : parsed.aav));
                setMode(m);
              }} />
            {text}
          </label>
        ))}
      </div>

      <div className="admin-modal-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
        <div>
          <label htmlFor={yearsId} style={label}>Term (whole years, 1–{EXTENSION_MAX_TERM})</label>
          <input id={yearsId} type="number" inputMode="numeric" min={1} max={EXTENSION_MAX_TERM} step={1}
            value={years} onChange={e => setYears(e.target.value)} placeholder="6"
            style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 16 }} />
        </div>
        <div>
          <label htmlFor={valueId} style={label}>
            {mode === "total" ? "Total value ($ millions)" : "Annual value ($ millions)"}
          </label>
          <input id={valueId} type="number" inputMode="decimal" min={0} step="any"
            value={value} onChange={e => setValue(e.target.value)}
            placeholder={mode === "total" ? "75 = $75,000,000" : "12.5 = $12,500,000"}
            aria-describedby={`${valueId}-calc`}
            style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 16 }} />
          <div id={`${valueId}-calc`} aria-live="polite" style={{ fontSize: 11, marginTop: 4, minHeight: 16, color: "var(--ledger-ice)", fontWeight: 700 }}>
            {counterpart ?? " "}
          </div>
        </div>
      </div>

      <div className="admin-modal-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <span style={label}>Start season (derived)</span>
          <div style={{ fontSize: 13, fontWeight: 900, minHeight: 20 }}>
            {preview.timing?.startSeason ?? "cannot derive"}
          </div>
          <div style={{ fontSize: 10, color: "var(--ledger-ink-faint)", lineHeight: 1.4 }}>
            Derived from the current contract’s expiry year{row.expiryYear ? ` (${row.expiryYear})` : " (not set)"};
            not stored, not editable. Correct the expiry year in section 1 to change it.
          </div>
        </div>
        <div>
          <label htmlFor={signedId} style={label}>Signing date (optional)</label>
          <input id={signedId} type="date" value={signed}
            onChange={e => { setSigned(e.target.value); setSignedTouched(true); }}
            style={{ ...field, width: "100%", padding: "6px 10px", fontSize: 16 }} />
          <div style={{ fontSize: 10, color: "var(--ledger-ink-faint)", lineHeight: 1.4 }}>
            The day it was signed — not today’s date and not the start season.
            {row.extensionSignedAt ? "" : " Unknown stays unknown unless you enter it."}
          </div>
        </div>
      </div>

      {preview.errors.length > 0 && (
        <ul role="alert" style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 11, color: "var(--ledger-red)" }}>
          {preview.errors.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}
      {!row.id && (
        <p role="alert" style={{ fontSize: 11, color: "var(--ledger-red)" }}>
          This row has no stable record id, so an extension cannot be saved against it.
        </p>
      )}

      {parsed && (
        <section aria-label="Extension preview" style={{ border: "1px solid var(--ledger-rule-light)", background: "var(--paper)", padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", color: "var(--ledger-ink-faint)", marginBottom: 6 }}>PREVIEW — NOTHING SAVED YET</div>
          <p style={{ margin: "0 0 3px", fontSize: 12 }}>{preview.currentLine}</p>
          <p style={{ margin: "0 0 3px", fontSize: 12, fontWeight: 700 }}>{preview.extensionLine}</p>
          <p style={{ margin: "0 0 8px", fontSize: 12 }}>{preview.statusLine}</p>
          {!parsed.exact && (
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--amber)" }}>
              {formatMillions(parsed.total)} does not divide evenly; the annual value is rounded to the nearest dollar
              ({formatMillions(parsed.aav)} × {parsed.years}).
            </p>
          )}
          {preview.flags.length > 0 && (
            <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 11, color: "var(--amber)" }}>
              {preview.flags.map(f => <li key={f}>{EXTENSION_FLAG_TEXT[f]}</li>)}
            </ul>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
            <caption style={{ textAlign: "left", fontSize: 10, color: "var(--ledger-ink-faint)", paddingBottom: 3 }}>
              Fields this save changes
            </caption>
            <tbody>
              {preview.changes.length === 0
                ? <tr><td colSpan={3} style={{ padding: "2px 0" }}>None — these values are already stored.</td></tr>
                : preview.changes.map(c => (
                    <tr key={c.field}>
                      <td style={{ padding: "2px 4px 2px 0", overflowWrap: "anywhere" }}>{c.field}</td>
                      <td style={{ padding: "2px 4px", color: "var(--ledger-ink-faint)" }}>{c.from}</td>
                      <td style={{ padding: "2px 0 2px 4px", fontWeight: 900 }}>→ {c.to}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 11, cursor: "pointer", minHeight: 24 }}>Left unchanged</summary>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 11, color: "var(--ledger-ink-body)" }}>
              {preview.unchanged.map(u => <li key={u.field}>{u.field}: {u.to}</li>)}
            </ul>
          </details>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--ledger-ink-faint)" }}>
            Saving does not reconcile any team’s cap space; the extension is future money until its start season.
          </p>
        </section>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={save} disabled={!canSave || nothingToDo}
          style={{ flex: "1 1 160px", minHeight: 40, padding: "8px 12px", background: canSave && !nothingToDo ? "var(--ledger-green)" : "transparent",
            border: "1px solid var(--ledger-green)", color: canSave && !nothingToDo ? "#fff" : "var(--ledger-ink-faint)",
            fontSize: 12, fontWeight: 900, cursor: canSave && !nothingToDo ? "pointer" : "default", letterSpacing: "0.1em", fontFamily: MONO }}>
          {saving ? "SAVING..." : hasStored ? "SAVE EXTENSION CHANGES" : "RECORD EXTENSION"}
        </button>
        {hasStored && (
          <button type="button" onClick={clear} disabled={saving}
            style={{ minHeight: 40, padding: "8px 12px", background: "transparent", border: "1px solid var(--ledger-red)",
              color: "var(--ledger-red)", fontSize: 12, fontWeight: 900, cursor: "pointer", letterSpacing: "0.1em", fontFamily: MONO }}>
            CLEAR EXTENSION
          </button>
        )}
      </div>
    </fieldset>
  );
}
