"use client";
import React, { useMemo } from "react";
import { calcNAV } from "@/app/lib/xnav-engine";
import { SEASON } from "@/app/lib/season-config";
import MetricTip from "@/app/components/MetricTip";

interface PlayerData {
  id: string;
  name: string;
  teamId: string;
  position: string;
  age: number;
  headshot?: string | null;
  ptsPace: number;
  xGPace: number;
  hdFinishingDelta?: number | null;
  avgTOI: number;
  qocIndex?: number | null;
  games?: number;
  gsax?: number;
  savePct?: number;
  gamesStarted?: number;
  ops?: number | null;
  dps?: number | null;
  xgRelTM?: number | null;
  xgaRelTM?: number | null;
  dzPct?: number | null;
  defRate?: number | null;
  goalsPace?: number | null;
  assistsPace?: number | null;
  capHit: number;
  yearsRemaining: number;
  hasLiveStats?: boolean;
  baselinePtsPace?: number | null;
  pkTimeShare?: number | null;
}

type StatDef = {
  key: string;
  label: string;
  extract: (p: PlayerData) => number | null;
  invert?: boolean;
  format?: (v: number) => string;
};

const FWD_STATS: StatDef[] = [
  { key: "pts",     label: "PTS/82",  extract: p => p.ptsPace,                                       format: v => v.toFixed(1) },
  { key: "goals",   label: "G/82",    extract: p => p.goalsPace ?? null,                              format: v => v.toFixed(1) },
  { key: "assists", label: "A/82",    extract: p => p.assistsPace ?? null,                            format: v => v.toFixed(1) },
  { key: "xg",      label: "xG/82",   extract: p => p.xGPace,                                        format: v => v.toFixed(1) },
  { key: "toi",     label: "TOI",     extract: p => p.avgTOI,                                        format: v => v.toFixed(1) },
  { key: "ops",     label: "OPS",     extract: p => p.ops ?? null,                                   format: v => v.toFixed(1) },
  { key: "dps",     label: "DPS",     extract: p => p.dps ?? null,                                   format: v => v.toFixed(1) },
  { key: "xgrel",   label: "xG%+",    extract: p => p.xgRelTM ?? null,                               format: v => `${v > 0 ? "+" : ""}${v.toFixed(1)}` },
  { key: "supp",    label: "SUPP",    extract: p => p.xgaRelTM != null ? -(p.xgaRelTM as number) : null, format: v => v.toFixed(2) },
];

const DEF_STATS: StatDef[] = [
  { key: "pts",   label: "PTS/82",  extract: p => p.ptsPace,                                       format: v => v.toFixed(1) },
  { key: "toi",   label: "TOI",     extract: p => p.avgTOI,                                        format: v => v.toFixed(1) },
  { key: "ops",   label: "OPS",     extract: p => p.ops ?? null,                                   format: v => v.toFixed(1) },
  { key: "dps",   label: "DPS",     extract: p => p.dps ?? null,                                   format: v => v.toFixed(1) },
  { key: "xgrel", label: "xG%+",    extract: p => p.xgRelTM ?? null,                               format: v => `${v > 0 ? "+" : ""}${v.toFixed(1)}` },
  { key: "supp",  label: "SUPP",    extract: p => p.xgaRelTM != null ? -(p.xgaRelTM as number) : null, format: v => v.toFixed(2) },
  { key: "qoc",   label: "QoC",     extract: p => p.qocIndex ?? null,                              format: v => v.toFixed(0) },
  { key: "oz",    label: "OZ%",     extract: p => p.dzPct != null ? (1 - (p.dzPct as number)) * 100 : null, format: v => `${v.toFixed(0)}%` },
];

const GOALIE_STATS: StatDef[] = [
  { key: "gsax",  label: "GSAx",  extract: p => p.gsax ?? null,                          format: v => v.toFixed(1) },
  { key: "svpct", label: "SV%",   extract: p => p.savePct ?? null,                       format: v => v.toFixed(3) },
  { key: "gp",    label: "GP",    extract: p => p.gamesStarted ?? p.games ?? null,        format: v => v.toFixed(0) },
];

function getPositionGroup(pos: string): "F" | "D" | "G" {
  if (pos === "D") return "D";
  if (pos === "G") return "G";
  return "F";
}

function computePercentile(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 50;
  let count = 0;
  for (const v of sorted) {
    if (v < value) count++;
    else if (v === value) count += 0.5;
  }
  return Math.round((count / sorted.length) * 100);
}

function percentileColor(pct: number): string {
  if (pct >= 90) return "#1a5e1f";
  if (pct >= 75) return "#3a8f3f";
  if (pct >= 60) return "#5aaa4f";
  if (pct >= 40) return "#8a7530";
  if (pct >= 25) return "#b06030";
  return "#a83030";
}

function percentileLabel(pct: number): string {
  if (pct >= 90) return "ELITE";
  if (pct >= 75) return "ABOVE AVG";
  if (pct >= 50) return "AVERAGE";
  if (pct >= 25) return "BELOW AVG";
  return "POOR";
}

interface PercentileCardProps {
  player: PlayerData;
  allPlayers: PlayerData[];
  teamName?: string;
}

export default function PercentileCard({ player, allPlayers, teamName }: PercentileCardProps) {
  const posGroup = getPositionGroup(player.position);
  const statDefs = posGroup === "G" ? GOALIE_STATS : posGroup === "D" ? DEF_STATS : FWD_STATS;

  const { percentiles, xnav } = useMemo(() => {
    const peers = allPlayers.filter(p => {
      const g = getPositionGroup(p.position);
      if (g !== posGroup) return false;
      if ((p.games ?? 0) < 20) return false;
      return true;
    });

    const sortedMaps = new Map<string, number[]>();
    for (const stat of statDefs) {
      const vals = peers
        .map(p => stat.extract(p))
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);
      sortedMaps.set(stat.key, vals);
    }

    const pcts: { key: string; label: string; value: number | null; pct: number; formatted: string; median: string }[] = [];
    for (const stat of statDefs) {
      const raw = stat.extract(player);
      const sorted = sortedMaps.get(stat.key) ?? [];
      const pct = raw !== null ? computePercentile(stat.invert ? -raw : raw, stat.invert ? sorted.map(v => -v).sort((a, b) => a - b) : sorted) : 50;
      const medianVal = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null;
      pcts.push({
        key: stat.key,
        label: stat.label,
        value: raw,
        pct,
        formatted: raw !== null ? (stat.format?.(raw) ?? raw.toFixed(1)) : "—",
        median: medianVal !== null ? (stat.format?.(medianVal) ?? medianVal.toFixed(1)) : "—",
      });
    }

    const position = player.position === "D" || player.position === "G" || player.position === "C"
      ? player.position : "W";
    const nav = calcNAV({
      id: player.id,
      name: player.name,
      position,
      age: player.age,
      capHit: player.capHit,
      yearsRemaining: player.yearsRemaining,
      capCeiling: SEASON.capCeiling,
      ptsPace: player.ptsPace,
      xGPace: player.xGPace,
      hdFinishingDelta: player.hdFinishingDelta ?? undefined,
      defRate: player.defRate ?? 0.08,
      avgTOI: player.avgTOI,
      qocIndex: player.qocIndex,
      xgRelTM: player.xgRelTM,
      xgaRelTM: player.xgaRelTM,
      dzPct: player.dzPct,
      ops: player.ops,
      dps: player.dps,
      games: player.games ?? 40,
      gsax: player.gsax,
      savePct: player.savePct,
      gamesStarted: player.gamesStarted,
      hasLiveStats: player.hasLiveStats,
      baselinePtsPace: player.baselinePtsPace ?? undefined,
      pkTimeShare: player.pkTimeShare ?? undefined,
    });

    return { percentiles: pcts, xnav: nav };
  }, [player, allPlayers, posGroup, statDefs]);

  const avgPercentile = Math.round(
    percentiles.reduce((s, p) => s + p.pct, 0) / percentiles.length
  );

  return (
    <div style={{
      background: "var(--paper-card, #e8dcc0)",
      border: "2px solid var(--ledger-rule, #b8a070)",
      padding: 0,
      width: "100%",
      maxWidth: "380px",
      fontFamily: "var(--font-mono, monospace)",
    }}>
      {/* Header */}
      <div style={{
        background: "var(--ledger-ink, #2a1f0e)",
        color: "var(--paper-card, #e8dcc0)",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}>
        {player.headshot && (
          <img
            src={player.headshot}
            alt=""
            style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)" }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: "14px", fontWeight: 900, lineHeight: 1.15,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {player.name}
          </div>
          <div style={{
            fontSize: "10px", opacity: 0.7, marginTop: "2px",
            textTransform: "uppercase", letterSpacing: "0.12em",
          }}>
            {teamName ?? player.teamId} · {player.position} · Age {player.age}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "22px", fontWeight: 900, lineHeight: 1 }}>
            {xnav.total}
          </div>
          <div style={{
            fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.15em",
            opacity: 0.6, marginTop: "2px",
          }}>
            <MetricTip term="X-NAV">X-NAV</MetricTip>
          </div>
        </div>
      </div>

      {/* Contract bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "6px 14px",
        borderBottom: "1px solid var(--ledger-rule, #b8a070)",
        fontSize: "10px", fontWeight: 700,
        color: "var(--ledger-ink-faint, #7a6940)",
        textTransform: "uppercase", letterSpacing: "0.1em",
      }}>
        <span>${player.capHit}M × {player.yearsRemaining}yr</span>
        <span><MetricTip term="FMV">FMV</MetricTip> ${(xnav.fmvAav ? xnav.fmvAav : 0).toFixed(1)}M</span>
        <span style={{ color: percentileColor(avgPercentile), fontWeight: 900 }}>
          {percentileLabel(avgPercentile)}
        </span>
      </div>

      {/* Percentile bars */}
      <div style={{ padding: "8px 14px 12px" }}>
        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "52px 1fr 40px 40px",
          alignItems: "center",
          gap: "8px",
          marginBottom: "4px",
          paddingBottom: "3px",
          borderBottom: "1px solid var(--ledger-rule-light, #d4c8a8)",
        }}>
          <span style={{ fontSize: "8px", fontWeight: 700, color: "var(--ledger-ink-faint, #7a6940)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Stat
          </span>
          <span style={{ fontSize: "8px", fontWeight: 700, color: "var(--ledger-ink-faint, #7a6940)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>
            Percentile
          </span>
          <span style={{ fontSize: "8px", fontWeight: 700, color: "var(--ledger-ink-faint, #7a6940)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right" }}>
            Val
          </span>
          <span style={{ fontSize: "8px", fontWeight: 700, color: "var(--ledger-ink-faint, #7a6940)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right" }}>
            Avg
          </span>
        </div>
        {percentiles.map((stat) => (
          <div key={stat.key} style={{
            display: "grid",
            gridTemplateColumns: "52px 1fr 40px 40px",
            alignItems: "center",
            gap: "8px",
            marginBottom: "5px",
          }}>
            <span style={{
              fontSize: "10px", fontWeight: 900,
              color: "var(--ledger-ink-faint, #7a6940)",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {stat.label}
            </span>
            <div
              title={`Position median: ${stat.median}`}
              style={{
                position: "relative",
                height: "14px",
                background: "var(--ledger-rule-light, #d4c8a8)",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: `${stat.pct}%`,
                background: percentileColor(stat.pct),
                borderRadius: "2px",
                transition: "width 0.3s ease",
              }} />
              {/* 50th percentile median marker */}
              <div style={{
                position: "absolute",
                top: 0,
                left: "50%",
                width: "1.5px",
                height: "100%",
                background: "var(--ledger-ink, #2a1f0e)",
                opacity: 0.4,
                zIndex: 1,
              }} />
              <span style={{
                position: "absolute",
                top: "50%",
                left: stat.pct > 20 ? `${stat.pct / 2}%` : "50%",
                transform: "translate(-50%, -50%)",
                fontSize: "9px",
                fontWeight: 900,
                color: stat.pct >= 55 ? "rgba(255,255,255,0.95)" : "var(--ledger-ink, #2a1f0e)",
                letterSpacing: "0.04em",
                textShadow: stat.pct >= 55 ? "0 1px 2px rgba(0,0,0,0.3)" : "none",
                zIndex: 2,
              }}>
                {stat.pct}th
              </span>
            </div>
            <span style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "var(--ledger-ink, #2a1f0e)",
              textAlign: "right",
            }}>
              {stat.formatted}
            </span>
            <span style={{
              fontSize: "9px",
              fontWeight: 600,
              color: "var(--ledger-ink-faint, #7a6940)",
              textAlign: "right",
              opacity: 0.7,
            }}>
              {stat.median}
            </span>
          </div>
        ))}
      </div>

      {/* NAV breakdown footer */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        borderTop: "1px solid var(--ledger-rule, #b8a070)",
        textAlign: "center",
      }}>
        {[
          { label: "OFF", val: xnav.off },
          { label: "DEF", val: xnav.def },
          { label: "AGE", val: xnav.age },
          { label: "CAP", val: xnav.cap },
        ].map(c => (
          <div key={c.label} style={{
            padding: "6px 4px",
            borderRight: c.label !== "CAP" ? "1px solid var(--ledger-rule-light, #d4c8a8)" : "none",
          }}>
            <div style={{
              fontSize: "9px", fontWeight: 700,
              color: "var(--ledger-ink-faint, #7a6940)",
              textTransform: "uppercase", letterSpacing: "0.1em",
            }}>{c.label}</div>
            <div style={{
              fontSize: "13px", fontWeight: 900,
              color: c.val >= 0 ? "var(--ledger-ink, #2a1f0e)" : "var(--ledger-red, #8b0000)",
              marginTop: "1px",
            }}>
              {c.val > 0 ? "+" : ""}{c.val}
            </div>
          </div>
        ))}
      </div>

      {/* Position group label */}
      <div style={{
        borderTop: "1px solid var(--ledger-rule, #b8a070)",
        padding: "4px 14px",
        fontSize: "9px",
        color: "var(--ledger-ink-faint, #7a6940)",
        textAlign: "center",
        textTransform: "uppercase",
        letterSpacing: "0.15em",
      }}>
        Percentiles vs. {posGroup === "F" ? "All Forwards" : posGroup === "D" ? "All Defensemen" : "All Goalies"} (≥20 GP)
      </div>
    </div>
  );
}
