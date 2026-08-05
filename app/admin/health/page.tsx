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

  const [pushingFa, setPushingFa] = useState(false);
  const pushLimboToFa = async () => {
    setPushingFa(true);
    try {
      const res = await fetch("/api/admin/prune-stale", { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast(`Pushed ${data.pushedToFa} limbo contracts into free agency (${data.skippedRfaEligible?.length ?? 0} RFA-eligible left alone)`, "success");
      setPruneResult(null);
    } catch (e: any) {
      toast(e?.message ?? "Push to FA failed", "error");
    } finally {
      setPushingFa(false);
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

  const [feedHealth, setFeedHealth] = useState<any | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedSyncing, setFeedSyncing] = useState(false);
  const [feedTeam, setFeedTeam] = useState("EDM");

  const runFeedCheck = async () => {
    setFeedLoading(true);
    try {
      const res = await fetch("/api/admin/nhl-feed");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFeedHealth(await res.json());
    } catch (e: any) {
      toast(e?.message ?? "Feed check failed", "error");
    } finally {
      setFeedLoading(false);
    }
  };

  const runFeedSync = async () => {
    setFeedSyncing(true);
    try {
      const res = await fetch("/api/admin/nhl-feed", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: feedTeam.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast(`Captured ${feedTeam.toUpperCase()}: ${data.landingStored} landing + ${data.edgeStored} edge snapshots (${data.failures?.length ?? 0} failures)`, "success");
    } catch (e: any) {
      toast(e?.message ?? "Feed sync failed", "error");
    } finally {
      setFeedSyncing(false);
    }
  };

  const [backfilling, setBackfilling] = useState(false);
  const runFaBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await fetch("/api/admin/fa-backfill", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast(`FA identities: ${data.updated} updated · ${data.notFound?.length ?? 0} not found · ${data.ambiguous?.length ?? 0} ambiguous${data.note ? " · run again" : ""}`, "success");
      if ((data.ambiguous?.length ?? 0) > 0) console.log("[fa-backfill] ambiguous:", data.ambiguous);
      if ((data.notFound?.length ?? 0) > 0) console.log("[fa-backfill] not found:", data.notFound);
    } catch (e: any) {
      toast(e?.message ?? "Backfill failed", "error");
    } finally {
      setBackfilling(false);
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

        {/* NHL Feed (landing + EDGE) */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>
            NHL FEED — LANDING + EDGE
          </div>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.08em", marginBottom: 16, lineHeight: 1.6 }}>
            First-party api-web.nhle.com pipeline. The check probes a canary player on both endpoints and lists any required field the NHL removed (v1 → v2 drift). Capture stores daily snapshots into nhl_snapshots; the nightly cron rotates 4 teams per run.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={runFeedCheck} disabled={feedLoading} style={btnStyle}>
              {feedLoading ? "PROBING…" : "CHECK FEED HEALTH"}
            </button>
            <input
              value={feedTeam}
              onChange={(e) => setFeedTeam(e.target.value)}
              maxLength={3}
              style={{
                width: 56, padding: "6px 8px", fontFamily: "inherit", fontSize: 11, fontWeight: 900,
                textTransform: "uppercase", background: "var(--paper)", color: "var(--ledger-ink)",
                border: "1px solid var(--rule)",
              }}
            />
            <button onClick={runFeedSync} disabled={feedSyncing} style={btnStyle}>
              {feedSyncing ? "CAPTURING…" : "CAPTURE TEAM SNAPSHOTS"}
            </button>
            <button onClick={runFaBackfill} disabled={backfilling} style={btnStyle}
              title="Resolve FA-class rows with age 0 / Unknown position against the NHL search API and write real identities into the players table">
              {backfilling ? "RESOLVING…" : "BACKFILL FA AGES"}
            </button>
          </div>
          {feedHealth && (
            <div style={{ marginTop: 14, fontSize: 10, lineHeight: 1.9 }}>
              {(["landing", "edge"] as const).map((k) => {
                const src = feedHealth[k];
                const ok = src?.ok;
                return (
                  <div key={k}>
                    <span style={{ fontWeight: 900, color: ok ? "var(--ledger-green)" : "var(--ledger-red)" }}>
                      {ok ? "● OK" : "● FAIL"}
                    </span>{" "}
                    <span style={{ fontWeight: 900 }}>{k.toUpperCase()}</span>{" "}
                    <span style={{ color: "var(--ledger-ink-faint)" }}>
                      {src?.reachable ? "reachable" : "unreachable"}
                      {src?.missingFields?.length > 0 && ` — missing: ${src.missingFields.join(", ")}`}
                    </span>
                  </div>
                );
              })}
              <div style={{ color: "var(--ledger-ink-faint)" }}>
                Snapshots stored: <strong style={{ color: "var(--ledger-ink)" }}>{feedHealth.snapshotCount ?? "—"}</strong> · Season {feedHealth.season}
              </div>
            </div>
          )}
        </div>

        {/* Health Check */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>
            SOURCE HEALTH CHECK
          </div>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.08em", marginBottom: 16, lineHeight: 1.6 }}>
            Probes the external data sources (Database, NHL API, MoneyPuck) plus the committed contract baseline. Shows status and latency for each.
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
            Scans all DB players against the committed contract baseline and NHL API rosters. Players missing from both sources
            (and not protected as draftees or extension holders) are flagged stale. Dry-run first, then confirm to delete.
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={runPruneDryRun} disabled={pruneLoading} style={btnOutlineStyle}>
              {pruneLoading ? "SCANNING…" : "DRY RUN"}
            </button>
            <button onClick={pushLimboToFa} disabled={pushingFa} style={btnStyle}
              title="0-year / $0 contracts that aren't RFA-eligible or unsigned draftees become UFAs and enter the free-agent market — the gentler alternative to pruning">
              {pushingFa ? "PUSHING…" : "PUSH LIMBO CONTRACTS TO FA"}
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
                Baseline: {pruneResult.sources.capwagesActive} contracts · NHL: {pruneResult.sources.nhlRostersFetched}/32 rosters fetched
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
                      SOURCES UNHEALTHY — prune blocked. Need &gt;200 contracts in the baseline and &ge;28 NHL rosters.
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
        <div style={{ ...sectionStyle, borderTop: "3px solid var(--ledger-ice)" }}>
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
          Health checks probe external APIs with 8-second timeouts. Prune requires both the contract baseline (&gt;200 contracts) and
          NHL API (&ge;28 rosters) to be healthy before any deletion is allowed. A &gt;60% catastrophic-delete guard also applies.
        </div>
      </div>
    </div>
  );
}
