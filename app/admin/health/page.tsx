"use client";

import React, { useState } from "react";
import { toast } from "@/app/lib/ledger-toast";

interface SourceCheck {
  name: string;
  status: "ok" | "degraded" | "down";
  detail: string;
  latencyMs?: number;
}

interface HealthResult {
  overall: string;
  checkedAt: string;
  season: string;
  sources: SourceCheck[];
}

interface PruneDryRun {
  dryRun: true;
  totalInDb: number;
  staleCount: number;
  wouldKeep: number;
  sourcesHealthy: boolean;
  sources: { capwagesActive: number; nhlRostersFetched: number };
  stale: { name: string; teamId: string | null; capHit: number | null; yearsRemaining: number | null }[];
}

interface SeedResult {
  ok: boolean;
  inserted: number;
  filled: number;
  skipped: number;
  total: number;
  clearedCacheKeys?: string[];
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--rule)",
  borderTop: "3px solid var(--ledger-ink)",
  padding: "20px 22px",
};

const btnStyle: React.CSSProperties = {
  padding: "9px 18px",
  background: "var(--ledger-ink)",
  border: "none",
  color: "var(--paper)",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  letterSpacing: "0.12em",
  fontFamily: "'Courier Prime', monospace",
};

const btnOutlineStyle: React.CSSProperties = {
  ...btnStyle,
  background: "transparent",
  border: "1px solid var(--rule)",
  color: "var(--ledger-ink-faint)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.15em",
  color: "var(--ledger-ink-faint)",
  fontWeight: 900,
};

export default function AdminHealth() {
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [pruneResult, setPruneResult] = useState<PruneDryRun | null>(null);
  const [pruneLoading, setPruneLoading] = useState(false);
  const [pruning, setPruning] = useState(false);

  const [seedLoading, setSeedLoading] = useState(false);

  const runHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/admin/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHealth(data);
      toast(data.overall === "healthy" ? "All sources healthy" : "Some sources degraded — check details", data.overall === "healthy" ? "success" : "error");
    } catch (e: any) {
      toast(e?.message ?? "Health check failed", "error");
    } finally {
      setHealthLoading(false);
    }
  };

  const runPruneDryRun = async () => {
    setPruneLoading(true);
    setPruneResult(null);
    try {
      const res = await fetch("/api/admin/prune-stale");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPruneResult(data);
      toast(`Dry run: ${data.staleCount} stale of ${data.totalInDb} total`, "success");
    } catch (e: any) {
      toast(e?.message ?? "Prune scan failed", "error");
    } finally {
      setPruneLoading(false);
    }
  };

  const executePrune = async () => {
    setPruning(true);
    try {
      const res = await fetch("/api/admin/prune-stale", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Prune refused", "error");
        return;
      }
      toast(`Pruned ${data.deleted} stale rows · ${data.remaining} remaining`, "success");
      setPruneResult(null);
    } catch (e: any) {
      toast(e?.message ?? "Prune failed", "error");
    } finally {
      setPruning(false);
    }
  };

  const runSeed = async () => {
    setSeedLoading(true);
    try {
      const res = await fetch("/api/admin/seed", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SeedResult = await res.json();
      toast(`Seeded: ${data.inserted} inserted · ${data.filled} filled · ${data.skipped} skipped`, "success");
    } catch (e: any) {
      toast(e?.message ?? "Seed failed", "error");
    } finally {
      setSeedLoading(false);
    }
  };

  return (
    <div className="admin-page" style={{
      minHeight: "calc(100vh - 42px)",
      background: "var(--paper)",
      color: "var(--ledger-ink)",
      fontFamily: "'Courier Prime', monospace",
    }}>
      <div style={{ borderBottom: "1px solid var(--rule)", padding: "14px 24px" }}>
        <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--ledger-ink-faint)", marginBottom: 2 }}>ADMIN</div>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.18em" }}>DATA HEALTH</div>
      </div>

      <div style={{ maxWidth: 700, padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Health Check */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>
            SOURCE HEALTH CHECK
          </div>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.08em", marginBottom: 16, lineHeight: 1.6 }}>
            Probes all five external data sources (Database, NHL API, MoneyPuck, CapWages) plus static baseline files. Shows status and latency for each.
          </div>

          <button onClick={runHealthCheck} disabled={healthLoading} style={btnStyle}>
            {healthLoading ? "CHECKING…" : "RUN HEALTH CHECK"}
          </button>

          {health && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                fontSize: 11, fontWeight: 900, letterSpacing: "0.1em",
                color: health.overall === "healthy" ? "var(--ledger-green)" : "var(--ledger-red)",
              }}>
                <span style={{
                  display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                  background: health.overall === "healthy" ? "var(--ledger-green)" : "var(--ledger-red)",
                }} />
                {health.overall.toUpperCase()} · {health.season}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}>
                {health.sources.map((s) => (
                  <div key={s.name} style={{
                    display: "grid", gridTemplateColumns: "150px 50px 1fr 60px",
                    gap: 8, padding: "8px 12px", background: "var(--paper)", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em" }}>{s.name}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 900, letterSpacing: "0.08em",
                      color: s.status === "ok" ? "var(--ledger-green)" : s.status === "degraded" ? "var(--ledger-amber)" : "var(--ledger-red)",
                    }}>
                      {s.status.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--ledger-ink-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.detail}
                    </span>
                    <span style={{ fontSize: 9, color: "var(--ledger-ink-faint)", textAlign: "right" }}>
                      {s.latencyMs != null ? `${s.latencyMs}ms` : "—"}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 8, fontSize: 9, color: "var(--ledger-ink-faint)" }}>
                Checked {new Date(health.checkedAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* Prune Stale */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>
            PRUNE STALE PLAYERS
          </div>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.08em", marginBottom: 16, lineHeight: 1.6 }}>
            Scans all DB players against live CapWages contracts and NHL API rosters. Players missing from both sources
            (and not protected as draftees or extension holders) are flagged stale. Dry-run first, then confirm to delete.
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={runPruneDryRun} disabled={pruneLoading} style={btnOutlineStyle}>
              {pruneLoading ? "SCANNING…" : "DRY RUN"}
            </button>
          </div>

          {pruneResult && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", marginBottom: 12 }}>
                {[
                  { label: "TOTAL IN DB", value: pruneResult.totalInDb },
                  { label: "STALE", value: pruneResult.staleCount },
                  { label: "WOULD KEEP", value: pruneResult.wouldKeep },
                  { label: "SOURCES OK", value: pruneResult.sourcesHealthy ? "YES" : "NO" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "var(--paper)", padding: "10px 12px" }}>
                    <div style={labelStyle}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>{String(value)}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", marginBottom: 8 }}>
                CapWages: {pruneResult.sources.capwagesActive} active contracts · NHL: {pruneResult.sources.nhlRostersFetched}/32 rosters fetched
              </div>

              {pruneResult.staleCount > 0 && (
                <>
                  <details style={{ marginBottom: 12 }}>
                    <summary style={{ fontSize: 10, fontWeight: 900, cursor: "pointer", letterSpacing: "0.1em", color: "var(--ledger-ink-faint)" }}>
                      {pruneResult.staleCount} STALE PLAYERS ▾
                    </summary>
                    <div style={{
                      maxHeight: 200, overflowY: "auto", marginTop: 8,
                      border: "1px solid var(--rule)", padding: "8px 12px",
                      fontSize: 10, lineHeight: 1.8, color: "var(--ledger-ink-faint)",
                    }}>
                      {pruneResult.stale.map((p) => (
                        <div key={p.name}>
                          {p.name} <span style={{ opacity: 0.5 }}>· {p.teamId ?? "—"} · ${p.capHit ?? 0}M × {p.yearsRemaining ?? 0}yr</span>
                        </div>
                      ))}
                    </div>
                  </details>

                  {pruneResult.sourcesHealthy ? (
                    <button onClick={executePrune} disabled={pruning}
                      style={{ ...btnStyle, background: "#6a2a2a" }}>
                      {pruning ? "PRUNING…" : `DELETE ${pruneResult.staleCount} STALE ROWS`}
                    </button>
                  ) : (
                    <div style={{ fontSize: 9, color: "var(--ledger-red)", fontWeight: 900, letterSpacing: "0.08em" }}>
                      SOURCES UNHEALTHY — prune blocked. Need &gt;200 CapWages contracts and &ge;28 NHL rosters.
                    </div>
                  )}
                </>
              )}

              {pruneResult.staleCount === 0 && (
                <div style={{ fontSize: 10, color: "var(--ledger-green)", fontWeight: 900, letterSpacing: "0.08em" }}>
                  NO STALE PLAYERS FOUND
                </div>
              )}
            </div>
          )}
        </div>

        {/* Re-seed */}
        <div style={{ ...sectionStyle, borderTop: "3px solid var(--ledger-navy)" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>
            RE-SEED BASELINE
          </div>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.08em", marginBottom: 16, lineHeight: 1.6 }}>
            Reload the canonical contract/FA baseline from league-seed.json into the players table.
            Inserts missing players, fills NMC/NTC and FA class on existing seed/sync rows.
            Never overwrites editor-curated rows.
          </div>
          <button onClick={runSeed} disabled={seedLoading} style={btnOutlineStyle}>
            {seedLoading ? "SEEDING…" : "RE-SEED PLAYERS TABLE"}
          </button>
        </div>

        <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", lineHeight: 1.7, letterSpacing: "0.05em" }}>
          Health checks probe external APIs with 8-second timeouts. Prune requires both CapWages (&gt;200 contracts) and
          NHL API (&ge;28 rosters) to be healthy before any deletion is allowed. A &gt;60% catastrophic-delete guard also applies.
        </div>
      </div>
    </div>
  );
}
