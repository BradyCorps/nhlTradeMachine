"use client";

// ── What the contract pipeline could not resolve ──────────────
//
// The page's existing "needs data" filter looks at DB contract ROWS. This looks
// at the assembled ROSTER, which is a different question: a player can be
// dressed for a team tonight and have no contract row anywhere, and the row
// view cannot show you someone who has no row.
//
// `roster-assembly` has computed `contractMissing` all along, under a comment
// saying it was "surfaced for the admin's needs-data view". That view did not
// exist, so the flag was computed and dropped — which is why a pending free
// agent being advertised as a $9.6M bargain had to be found by reading a player
// page rather than by looking at a list.
//
// Sorted by games played, because a missing contract on a first-liner is a
// launch problem and the same gap on a call-up is housekeeping.

import { useCallback, useEffect, useState } from "react";
import { adminErrorMessage, readAdminResponse } from "@/app/admin/admin-response";

const MONO = "'Courier Prime', 'Courier New', monospace";

interface Row {
  id: string;
  name: string;
  teamId: string;
  position: string;
  age: number;
  games: number;
  capHit: number;
  lastCapHit: number | null;
  yearsRemaining: number;
  expiryStatus: string | null;
}

interface Report {
  checkedAt: string;
  total: number;
  counts: { missing: number; pendingFa: number; placeholder: number; healthy: number };
  missing: Row[];
  pendingFa: Row[];
  placeholder: Row[];
}

type Bucket = "missing" | "pendingFa" | "placeholder";

/** Each bucket is a different problem and wants different words. */
const BUCKETS: { key: Bucket; label: string; tone: string; blurb: string }[] = [
  {
    key: "missing", label: "No contract found", tone: "var(--ledger-red)",
    blurb: "No deal resolved from any source, and not a drafted or entry-level player where a placeholder is reasonable. The cap hit these carry is a guess. Enter them by hand.",
  },
  {
    key: "pendingFa", label: "Pending free agent", tone: "var(--ledger-amber)",
    blurb: "The deal has run out, so the cap hit is zeroed on purpose and trade pricing treats him as a nought-year rental. Correct — but a player who has just re-signed looks exactly like this until the source catches up, so scan for names you know are under contract.",
  },
  {
    key: "placeholder", label: "On the league-minimum default", tone: "var(--ledger-ink-faint)",
    blurb: "Carrying the $0.925M placeholder without being flagged missing, and playing regularly. Usually fine for a young player. A star sitting here is a source failure wearing a disguise.",
  },
];

const cell: React.CSSProperties = { padding: "5px 10px", fontSize: 11, whiteSpace: "nowrap" };
const head: React.CSSProperties = {
  ...cell, fontWeight: 900, letterSpacing: "0.1em", textAlign: "left",
  borderBottom: "1px solid var(--rule)", color: "var(--ledger-ink-faint)",
};

export default function NeedsDataPanel({ onPick }: { onPick?: (name: string) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Bucket | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/needs-data");
      setReport(await readAdminResponse<Report>(res, "Could not check the roster"));
    } catch (e) {
      // Say what went wrong. A silent empty panel reads as "no problems", which
      // is the one thing it must never claim when it does not know.
      setError(adminErrorMessage(e, "Could not check the roster"));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = open && report ? report[open] : [];

  return (
    <div style={{ border: "1px solid var(--rule)", background: "var(--paper-card)", margin: "0 24px 16px", fontFamily: MONO }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--rule)" }}>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.18em" }}>ROSTER GAPS</span>
        <span style={{ fontSize: 10, color: "var(--ledger-ink-faint)" }}>
          players the pipeline could not price — separate from the contract-row view below
        </span>
        <button onClick={() => void load()} disabled={loading}
          style={{
            marginLeft: "auto", fontSize: 10, fontWeight: 900, padding: "4px 10px", letterSpacing: "0.1em",
            background: "transparent", border: "1px solid var(--rule)", color: "var(--ledger-ink)",
            cursor: loading ? "wait" : "pointer",
          }}>
          {loading ? "CHECKING…" : "RECHECK"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px 14px", fontSize: 11, color: "var(--ledger-red)" }}>
          {error} — the roster would not assemble, which is worse than a missing contract. Nothing below is trustworthy until this clears.
        </div>
      )}

      {!error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
            {BUCKETS.map(b => {
              const n = report?.counts[b.key] ?? 0;
              const active = open === b.key;
              return (
                <button key={b.key}
                  onClick={() => setOpen(active ? null : b.key)}
                  disabled={!report || n === 0}
                  title={b.blurb}
                  style={{
                    textAlign: "left", padding: "10px 14px", cursor: n === 0 ? "default" : "pointer",
                    background: active ? "var(--paper-inset)" : "transparent",
                    border: 0, borderRight: "1px solid var(--rule)",
                    borderBottom: active ? "2px solid var(--ledger-ink)" : "2px solid transparent",
                    fontFamily: MONO, color: "var(--ledger-ink)",
                  }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--ledger-ink-faint)" }}>
                    {b.label.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: n > 0 ? b.tone : "var(--ledger-ink-faint)" }}>
                    {report ? n : "—"}
                  </div>
                </button>
              );
            })}
            <div style={{ padding: "10px 14px" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--ledger-ink-faint)" }}>PRICED CLEANLY</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "var(--ledger-green)" }}>
                {report ? report.counts.healthy : "—"}
              </div>
              <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)" }}>
                {report ? `of ${report.total}` : ""}
              </div>
            </div>
          </div>

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
                      <th style={head}>Pos</th>
                      <th style={{ ...head, textAlign: "right" }}>Age</th>
                      <th style={{ ...head, textAlign: "right" }}>GP</th>
                      <th style={{ ...head, textAlign: "right" }}>Cap hit</th>
                      <th style={{ ...head, textAlign: "right" }}>Last deal</th>
                      <th style={head}>Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}
                        onClick={() => onPick?.(r.name)}
                        style={{ borderBottom: "1px solid var(--rule-light)", cursor: onPick ? "pointer" : "default" }}
                        title={onPick ? `Search the contract table for ${r.name}` : undefined}>
                        <td style={{ ...cell, fontWeight: 700 }}>{r.name}</td>
                        <td style={cell}>{r.teamId}</td>
                        <td style={cell}>{r.position}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{r.age}</td>
                        <td style={{ ...cell, textAlign: "right", fontWeight: r.games >= 40 ? 900 : 400 }}>{r.games}</td>
                        <td style={{ ...cell, textAlign: "right" }}>${r.capHit.toFixed(3)}M</td>
                        <td style={{ ...cell, textAlign: "right", color: "var(--ledger-ink-faint)" }}>
                          {r.lastCapHit != null && r.lastCapHit > 0 ? `$${r.lastCapHit.toFixed(3)}M` : "—"}
                        </td>
                        <td style={{ ...cell, color: "var(--ledger-ink-faint)" }}>{r.expiryStatus ?? "—"}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={8} style={{ ...cell, color: "var(--ledger-ink-faint)" }}>Nothing in this bucket.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report && (
            <div style={{ padding: "6px 14px", fontSize: 9, color: "var(--ledger-ink-faint)", borderTop: "1px solid var(--rule)" }}>
              Checked {new Date(report.checkedAt).toLocaleString()} · assembled from the live pipeline, not the contract table
            </div>
          )}
        </>
      )}
    </div>
  );
}
