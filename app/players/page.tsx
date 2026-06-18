"use client";
import StrandDisplay from "@/app/components/StrandDisplay";
import PlayerTimeline from "@/app/components/PlayerTimeline";
import { DevelopmentProfilePanel } from "@/app/components/DevelopmentProfilePanel";
import type { DevelopmentProfile } from "@/app/lib/development-profile";
import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";

// ── Types ─────────────────────────────────────────────────────
interface Player {
  id: string;
  name: string;
  teamId: string;
  position: string;
  age: number;
  headshot?: string | null;
  ptsPace: number;
  xGPace: number;
  avgTOI: number;
  qocIndex?: number | null;
  rosterTier?: string;
  games?: number;
  gsax?: number;
  savePct?: number;
  gamesStarted?: number;
  ops?: number | null;
  dps?: number | null;
  baselinePtsPace?: number | null;
  pkTimeShare?: number | null;
  xgRelTM?: number | null;
  xgaRelTM?: number | null;
  dzPct?: number | null;
  defRate?: number | null;
  goalsPace?: number | null;
  assistsPace?: number | null;
  capHit: number;
  yearsRemaining: number;
  hasNMC?: boolean;
  hasNTC?: boolean;
  hasLiveStats?: boolean;
  developmentProfile?: DevelopmentProfile | null;
}

interface Team {
  id: string;
  name: string;
  phase: string;
  standing: number;
}

// ── Goalie tier classification ────────────────────────────────
const goalieTeir = (gp: number): "STARTER" | "TANDEM" | "BACKUP" => {
  if (gp >= 40) return "STARTER";
  if (gp >= 25) return "TANDEM";
  return "BACKUP";
};

// ── Mini helix SVG ────────────────────────────────────────────
function MiniHelix({ ops, dps, ptsPace, avgTOI }: {
  ops?: number | null; dps?: number | null;
  ptsPace: number; avgTOI: number;
}) {
  const W = 80; const H = 28; const cy = H / 2;
  const offV = ops != null && dps != null && (ops + dps) > 0
    ? ops / (ops + dps)
    : Math.min(1, ptsPace / 100);
  const defV = 1 - offV;
  const amp  = 9;
  const freq = (2 * Math.PI) / W;

  const buildPath = (v: number, flip: boolean) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const x = (i / 40) * W;
      const y = cy + (flip ? 1 : -1) * (amp * (0.3 + v * 0.7)) * Math.sin(freq * x * 2);
      pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  };

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <path d={buildPath(defV, true)}  fill="none" stroke="var(--red)"  strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
      <path d={buildPath(offV, false)} fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
    </svg>
  );
}

// ── Archetype badge ───────────────────────────────────────────
function ArchetypeBadge({ player }: { player: Player }) {
  const ops = player.ops ?? null;
  const dps = player.dps ?? null;
  const psTotal = ops !== null && dps !== null ? ops + dps : null;
  const psRatio = psTotal !== null && psTotal > 1 ? ops! / psTotal : null;

  let label = "";
  let color = "var(--ink-faint)";

  if (player.position === "G") {
    const tier = goalieTeir(player.gamesStarted ?? 0);
    label = tier;
    color = tier === "STARTER" ? "var(--green)" : tier === "TANDEM" ? "var(--blue)" : "var(--ink-faint)";
  } else if (player.position === "D") {
    if (psRatio !== null) {
      if (psRatio > 0.62)       { label = "OFF D";    color = "var(--blue)"; }
      else if (psRatio < 0.35)  { label = "SHUTDOWN"; color = "var(--red)"; }
      else                      { label = "TWO-WAY";  color = "var(--green)"; }
    } else {
      if (player.ptsPace >= 45)      { label = "OFF D";    color = "var(--blue)"; }
      else if (player.avgTOI >= 22)  { label = "TWO-WAY";  color = "var(--green)"; }
      else                           { label = "DEPTH D";  color = "var(--ink-faint)"; }
    }
  } else {
    // Forward archetype — uses goals/assists ratio as primary style signal
    const goals   = player.goalsPace ?? null;
    const assists = player.assistsPace ?? null;
    const pts     = player.ptsPace;
    const assistRatio = goals != null && assists != null && pts > 0 ? assists / pts : null;
    const goalRatio   = goals != null && assists != null && pts > 0 ? goals   / pts : null;

    if      (pts >= 95 && assistRatio != null && assistRatio >= 0.55)
      { label = "FRANCHISE"; color = "var(--ledger-ink)"; }
    else if (pts >= 95 && player.xgRelTM != null && (player.xgRelTM as number) > 4)
      { label = "FRANCHISE"; color = "var(--ledger-ink)"; }
    else if (goalRatio != null && goalRatio > 0.53 && pts >= 25)
      { label = "SNIPER";    color = "var(--blue)"; }
    else if (assistRatio != null && assistRatio > 0.60 && pts >= 35)
      { label = "PLAYMAKER"; color = "var(--ledger-green)"; }
    else if (psRatio !== null) {
      if (psRatio > 0.65)      { label = "SCORER";   color = "var(--blue)"; }
      else if (psRatio < 0.35) { label = "CHECKER";  color = "var(--red)"; }
      else                     { label = "TWO-WAY";  color = "var(--green)"; }
    } else {
      if (pts >= 70)               { label = "SCORER";  color = "var(--blue)"; }
      else if (player.avgTOI >= 16){ label = "TWO-WAY"; color = "var(--green)"; }
      else                         { label = "DEPTH";   color = "var(--ink-faint)"; }
    }
  }

  if (!label) return null;
  return (
    <span style={{
      fontSize: "11px", fontWeight: 900,
      color, border: `1px solid ${color}`,
      padding: "1px 4px", letterSpacing: "0.1em",
      opacity: 0.9, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

// ── Expanded player row ───────────────────────────────────────
function ExpandedPlayer({ player, team }: { player: Player; team?: Team }) {
  const isG = player.position === "G";
  const stats = isG ? [
    { label: "GP",    val: player.gamesStarted?.toString() ?? "—" },
    { label: "GSAx",  val: (player.gsax ?? 0).toFixed(1) },
    { label: "SV%",   val: player.savePct?.toFixed(3) ?? "—" },
    { label: "Tier",  val: goalieTeir(player.gamesStarted ?? 0) },
  ] : [
    // Standard stats first — what fans recognise immediately
    { label: "PTS/82", val: player.ptsPace.toFixed(1) },
    { label: "G/82",   val: player.goalsPace != null ? (player.goalsPace as number).toFixed(1) : "—" },
    { label: "A/82",   val: player.assistsPace != null ? (player.assistsPace as number).toFixed(1) : "—" },
    // Analytics layer
    { label: "xG/82",  val: player.xGPace.toFixed(1) },
    { label: "TOI",    val: player.avgTOI.toFixed(1) },
    { label: "xG%+",   val: player.xgRelTM != null ? `${(player.xgRelTM as number) > 0 ? "+" : ""}${(player.xgRelTM as number).toFixed(1)}` : "—" },
    { label: "OZ%",    val: player.dzPct != null ? `${(((1 - (player.dzPct as number)) * 100)).toFixed(0)}%` : "—" },
  ];

  return (
    <div className="player-expanded-panel" style={{
      background: "#d6c8a5", borderTop: "1px solid #b8a070",
      padding: "12px 16px",
    }}>
      <div className="expanded-player-grid">
        {/* Left — stats */}
        <div>
          <div className="stat-grid-4" style={{ marginBottom: "10px" }}>
            {stats.map(s => (
              <div key={s.label} style={{
                background: "#e4d8b8", border: "1px solid #b8a070",
                padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: "11px", color: "var(--ledger-ink-faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
                <div style={{ fontSize: "11px", fontWeight: 900, color: "var(--ledger-ink)", marginTop: "2px" }}>{s.val}</div>
              </div>
            ))}
          </div>
          {!isG && (player.ops != null || player.dps != null) && (
            <div style={{ display: "flex", gap: "6px" }}>
              {player.ops != null && (
                <div style={{ padding: "3px 8px", background: "var(--blue-dim)", border: "1px solid rgba(43,63,102,0.3)", fontSize: "11px", fontWeight: 900 }}>
                  <span style={{ color: "var(--rule)", marginRight: "4px" }}>OPS</span>
                  <span style={{ color: "var(--blue)" }}>{player.ops.toFixed(1)}</span>
                </div>
              )}
              {player.dps != null && (
                <div style={{ padding: "3px 8px", background: "var(--red-dim)", border: "1px solid rgba(166,53,36,0.3)", fontSize: "11px", fontWeight: 900 }}>
                  <span style={{ color: "var(--rule)", marginRight: "4px" }}>DPS</span>
                  <span style={{ color: "var(--red)" }}>{player.dps.toFixed(1)}</span>
                </div>
              )}
              {player.ops != null && player.dps != null && (
                <div style={{ padding: "3px 8px", background: "var(--paper-card)", border: "1px solid var(--rule-light)", fontSize: "11px", fontWeight: 900 }}>
                  <span style={{ color: "var(--rule)", marginRight: "4px" }}>PS</span>
                  <span style={{ color: "var(--ink)" }}>{(player.ops + player.dps).toFixed(1)}</span>
                </div>
              )}
            </div>
          )}
          <div className="player-expanded-contract" style={{ marginTop: "10px", fontSize: "11px", color: "var(--ink-faint)" }}>
            <span style={{ color: "var(--rule)", marginRight: "6px" }}>CONTRACT</span>
            ${player.capHit}M × {player.yearsRemaining}yr
            {player.hasNMC && <span style={{ marginLeft: "8px", color: "var(--red)", border: "1px solid var(--red)", padding: "0 3px" }}>NMC</span>}
            {player.hasNTC && !player.hasNMC && <span style={{ marginLeft: "8px", color: "#8a5c00", border: "1px solid #8a5c00", padding: "0 3px" }}>NTC</span>}
          </div>
        </div>

        {/* Right — helix + timeline */}
        <div>
          {!isG && (
            <>
              <div style={{ fontSize: "11px", color: "var(--ledger-ink-faint)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "6px" }}>
                STRAND Profile
              </div>
              <div className="strand-svg-wrap" style={{ background: "#e4d8b8", border: "1px solid #b8a070", padding: "8px", marginBottom: "12px" }}>
                <FullStrand player={player} />
              </div>
            </>
          )}
          {player.yearsRemaining > 0 && (
            <div style={{ background: "#e4d8b8", border: "1px solid #b8a070", padding: "8px" }}>
              <PlayerTimeline asset={{
                id:             player.id,
                name:           player.name,
                position:       player.position as any,
                age:            player.age,
                capHit:         player.capHit,
                yearsRemaining: player.yearsRemaining,
                ptsPace:        player.ptsPace,
                xGPace:         player.xGPace,
                defRate:        player.defRate ?? 0.08,
                avgTOI:         player.avgTOI,
                qocIndex:       player.qocIndex,
                baselinePtsPace: player.baselinePtsPace ?? undefined,
                pkTimeShare:    player.pkTimeShare ?? undefined,
                ops:            player.ops ?? undefined,
                dps:            player.dps ?? undefined,
                xgRelTM:        player.xgRelTM ?? undefined,
                xgaRelTM:       player.xgaRelTM ?? undefined,
                dzPct:          player.dzPct ?? undefined,
                gsax:           player.gsax,
                savePct:        player.savePct,
                gamesStarted:   player.gamesStarted,
                games:          player.games ?? 40,
                hasLiveStats:   player.hasLiveStats,
                retainedPct:    0,
                multiplier:     1.0,
              }} />
               </div>
                    )}
        </div>
    
      </div>
      {player.position !== "G" && player.developmentProfile && (
        <div style={{ marginTop: "12px", background: "#e4d8b8", border: "1px solid #b8a070", padding: "8px 12px" }}>
          <div style={{ fontSize: "11px", color: "var(--ledger-ink-faint)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "6px" }}>
            Development Outlook
          </div>
          <DevelopmentProfilePanel asset={{ ...player } as any} />
        </div>
      )}
    </div>
  );
}

// ── Inline full strand ────────────────────────────────────────
// Computes Player traits and delegates rendering to the shared
// StrandDisplay component — same renderer used by the trade machine.
// Player page uses 8 traits (4+4); trade machine uses 10 (5+5).
// The extra 2 in the trade machine come from evaluate/route.ts
// (nav.off/def detailed components + nav.age) which needs evaluation.
function FullStrand({ player }: { player: Player }) {
  const isD  = player.position === "D";
  const norm = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const safe = (n: number) => isNaN(n) || !isFinite(n) ? 0 : n;

  const ops = player.ops ?? null;
  const dps = player.dps ?? null;
  const psTotal  = ops !== null && dps !== null ? ops + dps : null;
  const opsNorm  = psTotal !== null && psTotal > 0 ? Math.max(0, Math.min(1, ops! / psTotal)) : null;
  const dpsNorm  = psTotal !== null && psTotal > 0 ? Math.max(0, Math.min(1, dps! / psTotal)) : null;
  const dzAvail  = player.dzPct != null;
  const ozRaw    = dzAvail ? Math.round((1 - (player.dzPct as number)) * 100) : undefined;
  const ozScore  = dzAvail ? 1 - norm(player.dzPct as number, 0.3, 0.7) : 0.5;

  const offTraits = [
    { label: ops !== null ? "OPS" : "SCR",
      val: opsNorm ?? norm(safe(player.ptsPace), 0, isD ? 80 : 100),
      ps: ops?.toFixed(1),
      title: ops !== null ? `OPS ${ops.toFixed(1)} — Offensive Point Shares` : `Pts/82: ${player.ptsPace.toFixed(1)}` },
    { label: "xG",   val: norm(safe(player.xGPace ?? 0), 0, isD ? 25 : 50),
      title: `xG/82: ${(player.xGPace ?? 0).toFixed(1)}` },
    { label: "NOIV", val: norm(safe(player.xgRelTM ?? 0), -12, 12),
      title: `xG% vs teammates: ${player.xgRelTM != null ? (player.xgRelTM as number).toFixed(1) : "—"}` },
    { label: "TOI+", val: norm(safe(player.avgTOI), 10, 27),
      title: `Ice time: ${player.avgTOI.toFixed(1)} min/gm` },
  ];
  const defTraits = [
    { label: dps !== null ? "DPS" : "DEF",
      val: dpsNorm ?? norm(safe(player.defRate ?? 0), -0.3, 0.3),
      ps: dps?.toFixed(1),
      unavailable: dps === null && player.defRate == null,
      title: dps !== null ? `DPS ${dps.toFixed(1)} — Defensive Point Shares` : "Defensive NAV component" },
    { label: "SUPP", val: norm(-(safe(player.xgaRelTM ?? 0)), -1.5, 1.5),
      title: `xGA suppression vs teammates: ${player.xgaRelTM != null ? (player.xgaRelTM as number).toFixed(2) : "—"}` },
    { label: "Usage",  val: (player.qocIndex ?? 35) / 100,
      title: `QoC ${player.qocIndex ?? "—"}/100 — deployment difficulty (ice-time rank, PK share, d-zone starts)` },
    { label: "OZ",   val: ozScore, display: ozRaw, unavailable: !dzAvail,
      title: dzAvail ? `OZ%: ${ozRaw}% offensive zone starts` : "Zone deployment unavailable" },
  ];

  return (
    <StrandDisplay
      offTraits={offTraits}
      defTraits={defTraits}
      ops={ops}
      dps={dps}
      W={280}
      H={135}
      amplitude={34}
    />
  );
}

// ── Stat pill — labelled stat for mobile card ─────────────────
function StatPill({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
      <span style={{
        fontSize: "12px", fontWeight: 900,
        color: accent ? "var(--ink)" : "var(--ink-light)",
        lineHeight: 1,
      }}>{value}</span>
      <span style={{
        fontSize: "9px", color: "var(--rule)",
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginTop: "2px", whiteSpace: "nowrap",
      }}>{label}</span>
    </div>
  );
}

// ── Player row ────────────────────────────────────────────────
function PlayerRow({ player, team, rank, sortKey, actualPPG }: {
  player: Player; team?: Team; rank: number;
  sortKey: string;
  actualPPG: (p: Player) => number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isG = player.position === "G";

  // Derive labelled stat pairs based on sort key
  const primaryVal = isG
    ? (player.gsax ?? 0).toFixed(1)
    : sortKey === "ppg"   ? actualPPG(player).toFixed(3)
    : sortKey === "pts"   ? player.ptsPace.toFixed(1)
    : sortKey === "ops"   ? (player.ops != null ? player.ops.toFixed(1) : "—")
    : sortKey === "dps"   ? (player.dps != null ? player.dps.toFixed(1) : "—")
    : sortKey === "toi"   ? player.avgTOI.toFixed(1)
    : sortKey === "age"   ? `${player.age}`
    : sortKey === "cap"   ? `$${player.capHit}M`
    : actualPPG(player).toFixed(3);

  const primaryLabel = isG ? "GSAx"
    : sortKey === "ppg" ? "PPG"
    : sortKey === "pts" ? "P/82"
    : sortKey === "ops" ? "OPS"
    : sortKey === "dps" ? "DPS"
    : sortKey === "toi" ? "TOI"
    : sortKey === "age" ? "Age"
    : sortKey === "cap" ? "Cap"
    : "PPG";

  const secondaryVal = isG
    ? (player.savePct?.toFixed(3) ?? "—")
    : sortKey === "dps" || sortKey === "ops" ? player.ptsPace.toFixed(1)
    : sortKey === "toi"   ? actualPPG(player).toFixed(3)
    : sortKey === "age"   ? `$${player.capHit}M`
    : sortKey === "cap"   ? `${player.yearsRemaining}yr`
    : player.avgTOI.toFixed(1);

  const secondaryLabel = isG ? "SV%"
    : sortKey === "dps" || sortKey === "ops" ? "P/82"
    : sortKey === "toi"   ? "PPG"
    : sortKey === "age"   ? "Cap"
    : sortKey === "cap"   ? "Left"
    : "TOI";

  // Abbreviated team name for mobile (use teamId which is already short)
  const teamAbbr = player.teamId;

  return (
    <>
      {/* ── Desktop row (≥540px) — original 6-column grid ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        className="player-row player-row-desktop"
        style={{
          display: "grid",
          gridTemplateColumns: "32px 36px 1fr 80px 72px 64px",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderBottom: "1px solid var(--rule-light)",
          cursor: "pointer",
          background: expanded ? "var(--paper-card)" : "transparent",
          transition: "background 0.15s",
        }}
      >
        <div style={{ fontSize: "11px", color: "var(--rule)", textAlign: "right" }}>{rank}</div>

        <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: "var(--paper-dark)", flexShrink: 0 }}>
          {player.headshot
            ? <img src={player.headshot} alt={player.name} width={32} height={32} style={{ objectFit: "cover" }}/>
            : <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "var(--rule)" }}>
                {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
          }
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap", overflow: "hidden", minWidth: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", display: "block" }}>
              {player.name}
            </span>
            <ArchetypeBadge player={player} />
            {player.hasNMC && <span style={{ fontSize: "11px", color: "var(--red)", border: "1px solid var(--red)", padding: "0 3px" }}>NMC</span>}
          </div>
          <div style={{ fontSize: "11px", color: "var(--rule)", marginTop: "1px" }}>
            {team?.name ?? player.teamId} · {player.position} · Age {player.age}
          </div>
        </div>

        <div className="players-hide-mobile">
          {!isG
            ? <MiniHelix ops={player.ops} dps={player.dps} ptsPace={player.ptsPace} avgTOI={player.avgTOI}/>
            : <div style={{ fontSize: "11px", color: "var(--ink-faint)", textAlign: "center" }}>
                {goalieTeir(player.gamesStarted ?? 0)}
              </div>
          }
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", fontWeight: 900, color: "var(--ink)" }}>{primaryVal}</div>
          <div style={{ fontSize: "11px", color: "var(--rule)", textTransform: "uppercase" }}>{primaryLabel}</div>
        </div>

        <div style={{ textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "var(--ink-light)" }}>{secondaryVal}</div>
            <div style={{ fontSize: "11px", color: "var(--rule)", textTransform: "uppercase" }}>{secondaryLabel}</div>
          </div>
          <span style={{ fontSize: "11px", color: "var(--rule)" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* ── Mobile card (≤539px) — 2-line layout with labelled stats ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        className="player-row player-row-mobile"
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--rule-light)",
          cursor: "pointer",
          background: expanded ? "var(--paper-card)" : "transparent",
          transition: "background 0.15s",
        }}
      >
        {/* Line 1: headshot + name block + expand arrow */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          {/* Headshot */}
          <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", background: "var(--paper-dark)", flexShrink: 0 }}>
            {player.headshot
              ? <img src={player.headshot} alt={player.name} width={36} height={36} style={{ objectFit: "cover" }}/>
              : <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "var(--rule)" }}>
                  {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
            }
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "nowrap", overflow: "hidden" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {player.name}
              </span>
              <ArchetypeBadge player={player} />
              {player.hasNMC && <span style={{ fontSize: "10px", color: "var(--red)", border: "1px solid var(--red)", padding: "0 3px", flexShrink: 0 }}>NMC</span>}
            </div>
            <div style={{ fontSize: "11px", color: "var(--rule)", marginTop: "2px" }}>
              {teamAbbr} · {player.position} · Age {player.age}
            </div>
          </div>

          {/* Expand toggle */}
          <span style={{ fontSize: "12px", color: "var(--rule)", flexShrink: 0 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>

        {/* Line 2: rank pill + stats row */}
        <div style={{ display: "flex", alignItems: "center", gap: "0", paddingLeft: "46px", minWidth: 0 }}>
          {/* Rank */}
          <span style={{
            fontSize: "10px", color: "var(--rule)",
            marginRight: "10px", minWidth: "18px", textAlign: "right",
          }}>#{rank}</span>

          {/* Divider line */}
          <div style={{ width: "1px", height: "28px", background: "var(--rule-light)", marginRight: "10px", flexShrink: 0 }} />

          {/* Stats */}
          <div className="player-mobile-stat-row">
            <StatPill value={primaryVal} label={primaryLabel} accent />
            <StatPill value={secondaryVal} label={secondaryLabel} />
            {/* Always show TOI for context unless TOI IS the primary/secondary */}
            {!isG && sortKey !== "toi" && secondaryLabel !== "TOI" && (
              <StatPill value={player.avgTOI.toFixed(1)} label="TOI" />
            )}
            {/* Contract shorthand */}
            <StatPill value={`$${player.capHit}M`} label={`${player.yearsRemaining}yr`} />
          </div>
        </div>
      </div>

      {expanded && <ExpandedPlayer player={player} team={team} />}
    </>
  );
}

// ── Section header ────────────────────────────────────────────
function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      padding: "5px 12px",
      background: "var(--ledger-ink)",
      borderBottom: "1px solid #b8a070",
      display: "flex", alignItems: "center", gap: "10px",
    }}>
      <span style={{ fontSize: "11px", fontWeight: 900, color: "#e4d8b8", textTransform: "uppercase", letterSpacing: "0.25em" }}>
        {label}
      </span>
      <span style={{ fontSize: "11px", color: "var(--ledger-ink-faint)" }}>
        · {count} players
      </span>
    </div>
  );
}

function SectionToggle({ total, visible, expanded, onToggle }: {
  total: number;
  visible: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (total <= visible) return null;
  return (
    <div style={{ padding: "10px 12px", borderTop: "1px solid var(--rule-light)", background: "#f2ecd7" }}>
      <button className="filter-btn" onClick={onToggle}>
        {expanded ? `Show top ${visible}` : `Show all ${total}`}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function PlayersPage() {
  const [players, setPlayers]   = useState<Player[]>([]);
  const [teams, setTeams]       = useState<Team[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const deferredSearch = useDeferredValue(search);
  const [posFilter, setPosFilter] = useState<"ALL" | "F" | "D" | "G">("ALL");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<"ppg" | "pts" | "toi" | "ops" | "dps" | "age" | "cap">("ppg");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [showAllF, setShowAllF] = useState(false);
  const [showAllD, setShowAllD] = useState(false);
  const [showAllG, setShowAllG] = useState(false);

  const handleSortKey = (k: typeof sortKey) => {
    if (k === sortKey) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  // PPG = actual points per game played (not pace-projected)
  const ppg = (p: Player): number => {
    const gp = p.games ?? 0;
    if (gp < 5) return 0; // ignore tiny sample sizes
    return (p.ptsPace / 82) * gp / gp; // ptsPace = pts/82 * 82 / gp ... simplifies to ptsPace/82
  };

  // Simpler: derive actual points from ptsPace and games
  const actualPPG = (p: Player): number => {
    const gp = p.games ?? 0;
    if (gp <= 0) return 0;
    const actualPts = (p.ptsPace / 82) * gp;
    return actualPts / gp;
  };

  useEffect(() => {
    fetch("/api/league")
      .then(r => {
        if (!r.ok) throw new Error(`/api/league returned ${r.status}`);
        return r.json();
      })
      .then(d => {
        const nextPlayers = (d.players ?? []).filter((p: Player) => p.position !== "Pick");
        const nextTeams = d.teams ?? [];
        if (!Array.isArray(nextPlayers) || !Array.isArray(nextTeams)) throw new Error("API returned invalid league payload");
        setPlayers(nextPlayers);
        setTeams(nextTeams);
        setLoadError(null);
        setLoading(false);
      })
      .catch((e: any) => {
        setLoadError(e?.message ?? "Failed to load players");
        setLoading(false);
      });
  }, []);

  const teamMap = useMemo(() => {
    const m = new Map<string, Team>();
    teams.forEach(t => m.set(t.id, t));
    return m;
  }, [teams]);

  const filtered = useMemo(() => {
    let list = players;

    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.teamId.toLowerCase().includes(q)
      );
    }

    if (posFilter !== "ALL") {
      if (posFilter === "F") list = list.filter(p => ["C","W","L","R"].includes(p.position));
      else list = list.filter(p => p.position === posFilter);
    }

    if (teamFilter !== "ALL") {
      list = list.filter(p => p.teamId === teamFilter);
    }

    return list;
  }, [players, deferredSearch, posFilter, teamFilter]);

  useEffect(() => {
    setShowAllF(false);
    setShowAllD(false);
    setShowAllG(false);
  }, [search, posFilter, teamFilter, sortKey, sortDir]);

  // Sort and split into sections
  const { forwards, defence, skaters, goalies } = useMemo(() => {
    const sk = filtered.filter(p => p.position !== "G");
    const go = filtered.filter(p => p.position === "G");

    const sortFn = (a: Player, b: Player): number => {
      const tie = a.name.localeCompare(b.name) || a.teamId.localeCompare(b.teamId) || String(a.id).localeCompare(String(b.id));
      const compare = (av: number | null | undefined, bv: number | null | undefined): number => {
        const aHas = Number.isFinite(av);
        const bHas = Number.isFinite(bv);
        if (!aHas && !bHas) return tie;
        if (!aHas) return 1;
        if (!bHas) return -1;
        return (sortDir === "desc" ? bv! - av! : av! - bv!) || tie;
      };
      switch (sortKey) {
        case "ppg": return compare(actualPPG(a), actualPPG(b));
        case "pts": return compare(a.ptsPace, b.ptsPace);
        case "toi": return compare(a.avgTOI, b.avgTOI);
        case "ops": return compare(a.ops, b.ops);
        case "dps": return compare(a.dps, b.dps);
        case "age": return compare(a.age, b.age);
        case "cap": return compare(a.capHit, b.capHit);
        default:    return compare(actualPPG(a), actualPPG(b));
      }
    };
    const goalieSort = (a: Player, b: Player): number =>
      ((b.gsax ?? Number.NEGATIVE_INFINITY) - (a.gsax ?? Number.NEGATIVE_INFINITY))
      || a.name.localeCompare(b.name)
      || a.teamId.localeCompare(b.teamId)
      || String(a.id).localeCompare(String(b.id));

    const sortedSkaters = [...sk].sort(sortFn);
    return {
      skaters: sortedSkaters,
      forwards: sortedSkaters.filter(p => p.position !== "D"),
      defence: sortedSkaters.filter(p => p.position === "D"),
      goalies: [...go].sort(goalieSort),
    };
  }, [filtered, sortKey, sortDir]);

  const FORWARD_CAP = 25;
  const DEFENCE_CAP = 10;
  const GOALIE_CAP = 5;
  const visibleForwards = showAllF ? forwards : forwards.slice(0, FORWARD_CAP);
  const visibleDefence = showAllD ? defence : defence.slice(0, DEFENCE_CAP);
  const visibleGoalies = showAllG ? goalies : goalies.slice(0, GOALIE_CAP);
  const showForwards = (posFilter === "ALL" || posFilter === "F") && forwards.length > 0;
  const showDefence = (posFilter === "ALL" || posFilter === "D") && defence.length > 0;
  const showGoalies = (posFilter === "ALL" || posFilter === "G") && goalies.length > 0;

  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>

      <Header activeTab="players" />

      {/* ── Filter bar ── */}
      <div className="players-filter-bar">
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 16px 10px" }}>

          {/* Row 1: count + search */}
          <div className="players-filter-row1">
            <span style={{ fontSize: "11px", color: "var(--rule)", whiteSpace: "nowrap", letterSpacing: "0.05em" }}>
              {players.length > 0 ? `${skaters.length + goalies.length} players · Live data` : "Loading..."}
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search player or team..."
              style={{
                fontSize: "11px",
                padding: "7px 12px",
                border: "1px solid #b8a070",
                background: "#e4d8b8",
                color: "var(--ledger-ink)",
                outline: "none",
                flex: 1,
                minWidth: "140px",
                maxWidth: "260px",
              }}
            />
          </div>

          {/* Row 2: pos filters + team dropdown */}
          <div className="players-filter-row2">
            <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
              {(["ALL","F","D","G"] as const).map(p => (
                <button key={p} className={`filter-btn${posFilter === p ? " active" : ""}`}
                  onClick={() => setPosFilter(p)}>
                  {p === "ALL" ? "All" : p === "F" ? "Forwards" : p === "D" ? "Defence" : "Goalies"}
                </button>
              ))}
            </div>
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              style={{
                fontSize: "11px",
                padding: "6px 10px",
                border: "1px solid #b8a070",
                background: "#e4d8b8",
                color: "var(--ledger-ink)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <option value="ALL">All Teams</option>
              {teams.sort((a,b) => a.name.localeCompare(b.name)).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* Table */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 0 40px" }}>
        {loading ? (
          <div style={{ padding: "60px 20px", textAlign: "center", fontSize: "11px", color: "var(--rule)", letterSpacing: "0.2em" }}>
            LOADING ROSTER DATA...
          </div>
        ) : loadError ? (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: "11px", color: "var(--red)", letterSpacing: "0.12em" }}>
            PLAYER LEDGER LOAD FAILED: {loadError}
          </div>
        ) : (
          <>
            {/* Mobile sort strip — only visible on mobile when skaters shown */}
            {(posFilter === "ALL" || posFilter === "F" || posFilter === "D") && skaters.length > 0 && (
              <div className="players-mobile-sort-strip">
                <span style={{ fontSize: "10px", color: "var(--rule)", textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap", marginRight: "6px" }}>Sort:</span>
                <div style={{ display: "flex", gap: "4px", overflowX: "auto", WebkitOverflowScrolling: "touch" as any }}>
                  {(["ppg","pts","ops","dps","toi","age","cap"] as const).map(k => (
                    <button key={k} className={`col-header${sortKey === k ? " active" : ""}`}
                      onClick={() => handleSortKey(k)}
                      style={{ flexShrink: 0 }}>
                      {k === "ppg" ? "PPG" : k === "pts" ? "P/82" : k.toUpperCase()}
                      {sortKey === k && (
                        <span style={{ marginLeft: "2px", fontSize: "8px" }}>
                          {sortDir === "desc" ? "▼" : "▲"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Column headers — desktop only */}
            {(posFilter === "ALL" || posFilter === "F" || posFilter === "D") && skaters.length > 0 && (
              <div className="players-column-header" style={{
                display: "grid",
                gridTemplateColumns: "32px 36px 1fr 80px 72px 64px",
                gap: "8px",
                padding: "6px 12px",
                borderBottom: "2px solid #1c140a",
                background: "#f2ecd7",
                position: "sticky", top: 0, zIndex: 10,
                borderTop: "1px solid #b8a070",
              }}>
                <div style={{ fontSize: "10px", color: "var(--rule)", textAlign: "right", textTransform: "uppercase", fontWeight: 900 }}>Rank</div>
                <div style={{ fontSize: "10px", color: "var(--rule)", textTransform: "uppercase", fontWeight: 900 }}>Photo</div>
                <div style={{ fontSize: "10px", color: "var(--rule)", textTransform: "uppercase", fontWeight: 900 }}>Player</div>
                <div style={{ fontSize: "10px", color: "var(--rule)", textTransform: "uppercase", fontWeight: 900, textAlign: "center" }}>Strand</div>
                <button className={`col-header${sortKey === "ppg" ? " active" : ""}`} onClick={() => handleSortKey("ppg")}>
                  Primary {sortKey === "ppg" ? (sortDir === "desc" ? "▼" : "▲") : ""}
                </button>
                <div style={{ fontSize: "10px", color: "var(--rule)", textTransform: "uppercase", fontWeight: 900, textAlign: "right" }}>Secondary</div>
              </div>
            )}

            {/* Forwards */}
            {showForwards && (
              <div className="section-shell" style={{ border: "1px solid #b8a070", borderTop: "2px solid #1c140a", marginTop: "16px" }}>
                <SectionHeader label="Forwards" count={forwards.length} />
                {visibleForwards.map((p, i) => (
                  <PlayerRow key={`${p.id}::${p.teamId}`} player={p} team={teamMap.get(p.teamId)} rank={i + 1} sortKey={sortKey} actualPPG={actualPPG} />
                ))}
                <SectionToggle total={forwards.length} visible={FORWARD_CAP} expanded={showAllF} onToggle={() => setShowAllF(v => !v)} />
              </div>
            )}

            {/* Defence */}
            {showDefence && (
              <div className="section-shell" style={{ border: "1px solid #b8a070", borderTop: "2px solid #1c140a", marginTop: "16px" }}>
                <SectionHeader label="Defence" count={defence.length} />
                {visibleDefence.map((p, i) => (
                  <PlayerRow key={`${p.id}::${p.teamId}`} player={p} team={teamMap.get(p.teamId)} rank={i + 1} sortKey={sortKey} actualPPG={actualPPG} />
                ))}
                <SectionToggle total={defence.length} visible={DEFENCE_CAP} expanded={showAllD} onToggle={() => setShowAllD(v => !v)} />
              </div>
            )}

            {/* Goalies */}
            {showGoalies && (
              <div className="section-shell" style={{ border: "1px solid #b8a070", borderTop: "2px solid #1c140a", marginTop: "16px" }}>
                <SectionHeader label="Goalies · GSAx" count={goalies.length} />
                {visibleGoalies.map((p, i) => (
                  <PlayerRow key={`${p.id}::${p.teamId}`} player={p} team={teamMap.get(p.teamId)} rank={i + 1} sortKey={sortKey} actualPPG={actualPPG} />
                ))}
                <SectionToggle total={goalies.length} visible={GOALIE_CAP} expanded={showAllG} onToggle={() => setShowAllG(v => !v)} />
              </div>
            )}

            {filtered.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", fontSize: "11px", color: "var(--rule)", letterSpacing: "0.15em" }}>
                NO PLAYERS MATCH YOUR SEARCH
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}
