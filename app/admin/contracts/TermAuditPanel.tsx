"use client";

// ── Does anything stand behind this contract's term? ─────────────
//
// `yearsRemaining` is a fact about a contract AND a season, and the row does
// not record which season. Hanifin is six years from 2026-27 and five from
// 2027-28 without anything about the contract changing. Nothing in the app
// advances that — so every term here is right for whatever season it was
// captured in, and the rows that need moving look exactly like the ones that
// do not.
//
// `expiryYear` is the fix, and it is already a column: the calendar year the
// player reaches the market, which does not drift. Anchor the row to it and
// the term is derived rather than decremented, which makes the rollover
// idempotent — run it twice, or over a row pasted five minutes ago, and
// nothing moves twice.
//
// Both write actions preview first. The refusals are the part worth reading:
// a row that cannot be anchored safely is telling you something about itself.

import { useCallback, useEffect, useState } from "react";
import { adminErrorMessage, readAdminResponse } from "@/app/admin/admin-response";

const MONO = "'Courier Prime', 'Courier New', monospace";

interface Row {
  id: string; name: string; teamId: string | null; capHit: number;
  yearsRemaining: number; expiryYear: number | null; expiryStatus: string | null;
  suggestedExpiryYear: number | null; reconciledYears: number | null; why: string;
}

interface Report {
  seasonStartYear: number;
  checkedAt: string;
  total: number;
  counts: Record<string, number>;
  backfillable: number;
  reconcilable: number;
  rows: Record<string, Row[]>;
}

interface WriteResult {
  action: string; dryRun: boolean; changedCount: number; refusedCount: number;
  changed: { name: string; from: string; to: string }[];
  refused: { name: string; why: string }[];
}

type Issue = "badAnchor" | "overMaxTerm" | "atMaxTerm" | "anchorDisagrees" | "pendingFaNoAnchor" | "zeroTermNoStatus" | "noAnchor";

const BUCKETS: { key: Issue; label: string; tone: string; blurb: string }[] = [
  {
    key: "badAnchor", label: "Expiry year of 0", tone: "var(--ledger-red)",
    blurb: "Carrying an expiry year that cannot be one — almost always a stored 0. The editor posts expiryYear: null whenever the status is SIGNED, and the endpoint ran that through Number(), where null becomes 0. Every hand-edited signed contract was stamped with it. That is worse than an empty anchor: the read path tests \"expiry year ≤ this season\", and 0 passes, so any such row that also carries a UFA/RFA class reads as a free agent forever. The coercion is fixed; these are the rows it already wrote, and the backfill overwrites the ones whose term is trustworthy.",
  },
  {
    key: "anchorDisagrees", label: "Anchor disagrees", tone: "var(--ledger-red)",
    blurb: "The expiry year and the term contradict each other. Which one is right is not knowable from the row, so nothing is changed automatically — but a reconcile would take the anchor's word for it.",
  },
  {
    key: "overMaxTerm", label: "Longer than the CBA allows", tone: "var(--ledger-red)",
    blurb: "More than eight years remaining, which no contract may be. The term is wrong, not merely unanchored. Fix it by hand.",
  },
  {
    key: "atMaxTerm", label: "Sitting at the maximum", tone: "var(--ledger-amber)",
    blurb: "Exactly eight years remaining, which is only true of a deal signed this offseason. Far more likely the term AT SIGNING was stored instead of the term remaining. Anchoring one of these would make the error permanent, so they are refused — check them against the source and correct the term first.",
  },
  {
    key: "pendingFaNoAnchor", label: "Pending FA, no anchor", tone: "var(--ledger-amber)",
    blurb: "Carries a UFA/RFA class with no expiry year. The read path is falling back to \"term ≤ 1\" to treat him as pending, so writing an anchor would push him a year out and quietly sign him again. Set the expiry year by hand, or leave it.",
  },
  {
    key: "zeroTermNoStatus", label: "No term, no class", tone: "var(--ledger-amber)",
    blurb: "Zero years and no free-agency class, so nothing on the row says when the deal ends.",
  },
  {
    key: "noAnchor", label: "To anchor", tone: "var(--ledger-ink-faint)",
    blurb: "Not anchored yet — the term is plausible and carries no class that anchoring would change. These are what the backfill writes. It writes the term you already have, so anchoring only makes the CURRENT number permanent: a term that was already a season stale becomes a wrong anchor. Scan the expensive ones against the source before writing, since those are the ones that move a team's cap picture.",
  },
];

const cell: React.CSSProperties = { padding: "5px 10px", fontSize: 11, whiteSpace: "nowrap" };
const head: React.CSSProperties = {
  ...cell, fontWeight: 900, letterSpacing: "0.1em", textAlign: "left",
  borderBottom: "1px solid var(--rule)", color: "var(--ledger-ink-faint)",
};
const button = (on: boolean): React.CSSProperties => ({
  fontSize: 10, fontWeight: 900, padding: "4px 10px", letterSpacing: "0.1em",
  fontFamily: MONO, background: on ? "var(--ledger-ice)" : "transparent",
  border: `1px solid ${on ? "var(--ledger-ice)" : "var(--rule)"}`,
  color: on ? "#fff" : "var(--ledger-ink)", cursor: "pointer",
});

export default function TermAuditPanel({ onWrote }: { onWrote?: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Issue | null>(null);
  const [preview, setPreview] = useState<WriteResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contract-terms");
      setReport(await readAdminResponse<Report>(res, "Could not read the terms"));
    } catch (e) {
      setError(adminErrorMessage(e, "Could not read the terms"));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: "backfill" | "reconcile", dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contract-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, dryRun }),
      });
      const data = await readAdminResponse<WriteResult>(res, "Failed");
      setPreview(data);
      if (!dryRun) { await load(); onWrote?.(); }
    } catch (e) {
      setError(adminErrorMessage(e, "Failed"));
    } finally {
      setBusy(false);
    }
  };

  const rows = open && report ? (report.rows[open] ?? []) : [];
  const season = report ? `${report.seasonStartYear}-${String((report.seasonStartYear + 1) % 100).padStart(2, "0")}` : "";

  return (
    <div style={{ border: "1px solid var(--rule)", background: "var(--paper-card)", margin: "0 24px 16px", fontFamily: MONO }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--rule)" }}>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.18em" }}>CONTRACT TERMS</span>
        <span style={{ fontSize: 10, color: "var(--ledger-ink-faint)" }}>
          a term is only true of one season — {season || "…"} is the one this app is set to
        </span>
        <button onClick={() => void load()} disabled={loading} style={{ ...button(false), marginLeft: "auto", cursor: loading ? "wait" : "pointer" }}>
          {loading ? "CHECKING…" : "RECHECK"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px 14px", fontSize: 11, color: "var(--ledger-red)" }}>{error}</div>
      )}

      {!error && report && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)" }}>
            {BUCKETS.map(b => {
              const n = report.counts[b.key] ?? 0;
              const active = open === b.key;
              return (
                <button key={b.key}
                  onClick={() => setOpen(active ? null : b.key)}
                  disabled={n === 0}
                  title={b.blurb}
                  style={{
                    textAlign: "left", padding: "10px 12px", cursor: n === 0 ? "default" : "pointer",
                    background: active ? "var(--paper-inset)" : "transparent",
                    border: 0, borderRight: "1px solid var(--rule)",
                    borderBottom: active ? "2px solid var(--ledger-ink)" : "2px solid transparent",
                    fontFamily: MONO, color: "var(--ledger-ink)",
                  }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--ledger-ink-faint)", lineHeight: 1.3, minHeight: 24 }}>
                    {b.label.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 900, color: n > 0 ? b.tone : "var(--ledger-ink-faint)" }}>{n}</div>
                </button>
              );
            })}
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--ledger-ink-faint)", lineHeight: 1.3, minHeight: 24 }}>
                ANCHORED &amp; AGREEING
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: "var(--ledger-green)" }}>{report.counts.ok ?? 0}</div>
              <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)" }}>of {report.total}</div>
            </div>
          </div>

          {/* ── The two actions ──────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: "1px solid var(--rule)", flexWrap: "wrap" }}>
            <button onClick={() => void run("backfill", true)} disabled={busy || report.backfillable === 0} style={button(false)}>
              PREVIEW ANCHOR ({report.backfillable})
            </button>
            <button onClick={() => void run("reconcile", true)} disabled={busy} style={button(false)}>
              PREVIEW RECONCILE ({report.reconcilable})
            </button>
            <span style={{ fontSize: 9, color: "var(--ledger-ink-faint)", lineHeight: 1.5, flex: 1, minWidth: 260 }}>
              <b>Anchor</b> writes the expiry year onto rows where it can be derived without changing what the row means —
              it takes the term at its word, so it makes today&apos;s number permanent rather than correcting it.
              <b> Reconcile</b> recomputes every term from its anchor so the table agrees with {season}: that is the season
              rollover, and because it derives rather than decrements, running it twice does nothing the second time.
              Both preview first.
            </span>
          </div>

          {preview && (
            <div style={{ padding: "8px 14px", borderTop: "1px solid var(--rule)", fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 900 }}>
                  {preview.dryRun ? "WOULD" : "DID"} {preview.action === "backfill" ? "anchor" : "reconcile"} {preview.changedCount}
                </span>
                {preview.refusedCount > 0 && (
                  <span style={{ color: "var(--ledger-amber)" }}>· {preview.refusedCount} refused</span>
                )}
                {preview.dryRun && preview.changedCount > 0 && (
                  <button onClick={() => void run(preview.action as "backfill" | "reconcile", false)}
                    disabled={busy} style={button(true)}>
                    {busy ? "WRITING…" : `WRITE ${preview.changedCount}`}
                  </button>
                )}
                <button onClick={() => setPreview(null)} style={{ ...button(false), marginLeft: "auto" }}>DISMISS</button>
              </div>
              {preview.changed.length > 0 && (
                <div style={{ marginTop: 6, maxHeight: 120, overflowY: "auto", fontSize: 10, color: "var(--ledger-ink-faint)", lineHeight: 1.6 }}>
                  {preview.changed.map(c => (
                    <div key={c.name}>{c.name}: {c.from} → <b style={{ color: "var(--ledger-ink)" }}>{c.to}</b></div>
                  ))}
                </div>
              )}
              {preview.refused.length > 0 && (
                <div style={{ marginTop: 6, maxHeight: 120, overflowY: "auto", fontSize: 10, color: "var(--ledger-amber)", lineHeight: 1.6 }}>
                  {preview.refused.map(r => <div key={r.name}>{r.name} — {r.why}</div>)}
                </div>
              )}
            </div>
          )}

          {open && (
            <div style={{ borderTop: "1px solid var(--rule)" }}>
              <div style={{ padding: "8px 14px", fontSize: 10, color: "var(--ledger-ink-faint)", lineHeight: 1.5 }}>
                {BUCKETS.find(b => b.key === open)!.blurb}
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={head}>Player</th>
                      <th style={head}>Tm</th>
                      <th style={{ ...head, textAlign: "right" }}>Cap hit</th>
                      <th style={{ ...head, textAlign: "right" }}>Term</th>
                      <th style={{ ...head, textAlign: "right" }}>Anchor</th>
                      <th style={head}>Class</th>
                      <th style={head}>What the row says</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--rule-light)" }}>
                        <td style={{ ...cell, fontWeight: 700 }}>{r.name}</td>
                        <td style={cell}>{r.teamId ?? "—"}</td>
                        <td style={{ ...cell, textAlign: "right" }}>${r.capHit.toFixed(3)}M</td>
                        <td style={{ ...cell, textAlign: "right", fontWeight: 900 }}>{r.yearsRemaining}yr</td>
                        <td style={{ ...cell, textAlign: "right" }}>
                          {r.expiryYear ?? (
                            <span style={{ color: "var(--ledger-ink-faint)" }}>
                              {r.suggestedExpiryYear ? `→ ${r.suggestedExpiryYear}` : "—"}
                            </span>
                          )}
                        </td>
                        <td style={cell}>{r.expiryStatus ?? "—"}</td>
                        <td style={{ ...cell, whiteSpace: "normal", fontSize: 10, color: "var(--ledger-ink-faint)" }}>{r.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ padding: "6px 14px", fontSize: 9, color: "var(--ledger-ink-faint)", borderTop: "1px solid var(--rule)" }}>
            Checked {new Date(report.checkedAt).toLocaleString()} · the anchor is the year the player reaches the market, so it does not move when the season does
          </div>
        </>
      )}
    </div>
  );
}
