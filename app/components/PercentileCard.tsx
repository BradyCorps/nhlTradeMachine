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
  // Goalie context — without these, calcNAV values a goalie on defaults
  // (career baseline = 0) and an elite starter reads as replacement level.
  shotsPerGame?: number | null;
  baselineGsax?: number | null;
  baselineHdsvPct?: number | null;
  teamXga60?: number | null;
  teamHdca60?: number | null;
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

// Bar-fill tones — darkened so white/dark text and the newsprint ground both
// clear WCAG AA. These are decorative (the number carries the real value), but
// kept legible for low-vision users who read the fill.
function percentileColor(pct: number): string {
  if (pct >= 90) return "#146a24";
  if (pct >= 75) return "#2f7d34";
  if (pct >= 60) return "#4e7a2c";
  if (pct >= 40) return "#8a6a1e";
  if (pct >= 25) return "#a85a24";
  return "#9c2b1f";
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
      // Goalie career + team context so an elite starter isn't valued on defaults.
      baselineGsax: player.baselineGsax ?? undefined,
      baselineHdsvPct: player.baselineHdsvPct ?? undefined,
      teamXga60: player.teamXga60 ?? undefined,
      teamHdca60: player.teamHdca60 ?? undefined,
    });

    return { percentiles: pcts, xnav: nav };
  }, [player, allPlayers, posGroup, statDefs]);

  const avgPercentile = Math.round(
    percentiles.reduce((s, p) => s + p.pct, 0) / percentiles.length
  );

  const peerLabel = posGroup === "F" ? "all forwards" : posGroup === "D" ? "all defensemen" : "all goalies";

  // FMV → surplus: the market AAV vs what he's actually paid. This is the read
  // that matters — a big FMV only means "bargain" relative to the cap hit.
  const fmv = xnav.fmvAav ?? 0;
  const surplus = fmv - player.capHit;
  const surplusTone = surplus >= 1 ? "good" : surplus <= -1 ? "bad" : "neutral";
  const surplusWord = surplus >= 1 ? "BARGAIN" : surplus <= -1 ? "OVERPAY" : "FAIR DEAL";
  const GOOD = "#146a24", BAD = "#9c2b1f", INK = "#1c140a", BODY = "#4a3820";
  const toneColor = (t: string) => t === "good" ? GOOD : t === "bad" ? BAD : INK;

  const navCells = [
    { label: "OFF", val: xnav.off, term: "OFF" },
    { label: "DEF", val: xnav.def, term: "DEF" },
    { label: "AGE", val: xnav.age, term: "YNG" },
    { label: "CAP", val: xnav.cap, term: "CAP" },
  ];

  return (
    <div className="pcard" role="group"
      aria-label={`${player.name} value card — X-NAV ${xnav.total}, ${percentileLabel(avgPercentile)} vs ${peerLabel}`}>
      <style>{`
        .pcard { width: 100%; max-width: 620px; margin: 0 auto;
          background: #ede4cc; border: 2px solid #b8a070; border-radius: 3px;
          font-family: var(--font-mono, ui-monospace, monospace); color: #1c140a; }
        .pcard *:focus-visible { outline: 2px solid #1a2e5c; outline-offset: 2px; border-radius: 2px; }
        .pcard-head { background: #1c140a; color: #efe6cc; padding: 12px 16px;
          display: flex; align-items: center; gap: 12px; }
        .pcard-head img { width: 52px; height: 52px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35); flex-shrink: 0; }
        .pcard-name { font-size: 16px; font-weight: 900; line-height: 1.15;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pcard-sub { font-size: 11px; color: #d8c9a2; margin-top: 3px;
          text-transform: uppercase; letter-spacing: 0.1em; }
        .pcard-nav-total { font-size: 26px; font-weight: 900; line-height: 1; }
        .pcard-nav-label { font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.14em; color: #d8c9a2; margin-top: 3px; }
        .pcard-value-strip { display: grid; grid-template-columns: repeat(3, 1fr);
          border-bottom: 1px solid #b8a070; }
        .pcard-vcell { padding: 8px 12px; text-align: center;
          border-right: 1px solid #d6c8a5; }
        .pcard-vcell:last-child { border-right: none; }
        .pcard-vlabel { font-size: 10px; font-weight: 700; color: #4a3820;
          text-transform: uppercase; letter-spacing: 0.1em; }
        .pcard-vval { font-size: 16px; font-weight: 900; margin-top: 2px; }
        .pcard-vnote { font-size: 10px; font-weight: 700; margin-top: 1px;
          text-transform: uppercase; letter-spacing: 0.08em; }
        .pcard-body { display: grid; grid-template-columns: 1fr; gap: 0; }
        @media (min-width: 540px) { .pcard-body { grid-template-columns: 1.55fr 1fr; } }
        .pcard-tablewrap { padding: 10px 14px 12px; }
        .pcard-table { width: 100%; border-collapse: collapse; }
        .pcard-table caption { text-align: left; font-size: 11px; font-weight: 700;
          color: #4a3820; text-transform: uppercase; letter-spacing: 0.1em;
          padding-bottom: 6px; }
        .pcard-table th, .pcard-table td { padding: 3px 4px; vertical-align: middle; }
        .pcard-table thead th { font-size: 10px; font-weight: 700; color: #4a3820;
          text-transform: uppercase; letter-spacing: 0.08em;
          border-bottom: 1px solid #cdbd93; }
        .pcard-th-stat { text-align: left; }
        .pcard-th-pct { text-align: left; }
        .pcard-th-num { text-align: right; }
        .pcard-stat { font-size: 12px; font-weight: 900; color: #3d2e18;
          text-transform: uppercase; letter-spacing: 0.04em; text-align: left; white-space: nowrap; }
        .pcard-barcell { width: 99%; }
        .pcard-barrow { display: flex; align-items: center; gap: 7px; }
        .pcard-bar { position: relative; flex: 1; height: 16px; min-width: 60px;
          background: #d6c8a5; border: 1px solid #c1b088; border-radius: 3px; overflow: hidden; }
        .pcard-fill { position: absolute; top: 0; left: 0; height: 100%;
          border-radius: 2px 0 0 2px; transition: width 0.35s ease; }
        .pcard-median { position: absolute; top: -1px; left: 50%; width: 2px;
          height: calc(100% + 2px); background: #1c140a; opacity: 0.45; }
        .pcard-pctnum { font-size: 12px; font-weight: 900; color: #1c140a;
          font-variant-numeric: tabular-nums; min-width: 30px; text-align: right; }
        .pcard-val { font-size: 12px; font-weight: 800; color: #1c140a;
          text-align: right; font-variant-numeric: tabular-nums; }
        .pcard-med { font-size: 11px; font-weight: 600; color: #6e5a3d;
          text-align: right; font-variant-numeric: tabular-nums; }
        .pcard-side { border-top: 1px solid #b8a070; padding: 10px 14px; }
        @media (min-width: 540px) { .pcard-side { border-top: none; border-left: 1px solid #b8a070; } }
        .pcard-side-h { font-size: 10px; font-weight: 700; color: #4a3820;
          text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 7px; }
        .pcard-navrow { display: flex; align-items: baseline; justify-content: space-between;
          padding: 4px 0; border-bottom: 1px solid #ddd0ab; }
        .pcard-navrow:last-child { border-bottom: none; }
        .pcard-navrow dt { font-size: 12px; font-weight: 700; color: #4a3820; }
        .pcard-navrow dd { font-size: 13px; font-weight: 900; margin: 0;
          font-variant-numeric: tabular-nums; }
        .pcard-foot { border-top: 1px solid #b8a070; padding: 6px 14px;
          font-size: 10px; color: #4a3820; text-align: center;
          text-transform: uppercase; letter-spacing: 0.12em; }
        @media (prefers-reduced-motion: reduce) { .pcard-fill { transition: none; } }
      `}</style>

      {/* Header */}
      <div className="pcard-head">
        {player.headshot && <img src={player.headshot} alt="" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pcard-name">{player.name}</div>
          <div className="pcard-sub">{teamName ?? player.teamId} · {player.position} · Age {player.age}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="pcard-nav-total">{xnav.total}</div>
          <div className="pcard-nav-label"><MetricTip term="X-NAV">X-NAV</MetricTip></div>
        </div>
      </div>

      {/* Valuation strip: cap hit vs market AAV vs surplus */}
      <div className="pcard-value-strip">
        <div className="pcard-vcell">
          <div className="pcard-vlabel">Cap Hit</div>
          <div className="pcard-vval" style={{ color: INK }}>${player.capHit.toFixed(1)}M</div>
          <div className="pcard-vnote" style={{ color: BODY }}>× {player.yearsRemaining}yr</div>
        </div>
        <div className="pcard-vcell">
          <div className="pcard-vlabel"><MetricTip term="FMV">Market AAV</MetricTip></div>
          <div className="pcard-vval" style={{ color: INK }}>${fmv.toFixed(1)}M</div>
          <div className="pcard-vnote" style={{ color: BODY }}>fair value</div>
        </div>
        <div className="pcard-vcell">
          <div className="pcard-vlabel">Surplus</div>
          <div className="pcard-vval" style={{ color: toneColor(surplusTone) }}>
            {surplus > 0 ? "+" : surplus < 0 ? "−" : ""}${Math.abs(surplus).toFixed(1)}M
          </div>
          <div className="pcard-vnote" style={{ color: toneColor(surplusTone) }}>{surplusWord}</div>
        </div>
      </div>

      {/* Body: percentile table + value breakdown */}
      <div className="pcard-body">
        <div className="pcard-tablewrap">
          <table className="pcard-table">
            <caption>Percentiles vs {peerLabel} (≥20 GP)</caption>
            <thead>
              <tr>
                <th scope="col" className="pcard-th-stat">Stat</th>
                <th scope="col" className="pcard-th-pct">Percentile</th>
                <th scope="col" className="pcard-th-num">Val</th>
                <th scope="col" className="pcard-th-num">Med</th>
              </tr>
            </thead>
            <tbody>
              {percentiles.map(stat => (
                <tr key={stat.key}>
                  <th scope="row" className="pcard-stat">
                    <MetricTip term={stat.label.replace("/82", "").replace("%+", "")}>{stat.label}</MetricTip>
                  </th>
                  <td className="pcard-barcell">
                    <div className="pcard-barrow">
                      <div className="pcard-bar" role="img"
                        aria-label={`${stat.pct}th percentile — ${percentileLabel(stat.pct).toLowerCase()}`}>
                        <div className="pcard-fill" style={{ width: `${stat.pct}%`, background: percentileColor(stat.pct) }} />
                        <div className="pcard-median" />
                      </div>
                      <span className="pcard-pctnum">{stat.pct}</span>
                    </div>
                  </td>
                  <td className="pcard-val">{stat.formatted}</td>
                  <td className="pcard-med">{stat.median}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pcard-side">
          <div className="pcard-side-h">Value Breakdown</div>
          <dl style={{ margin: 0 }}>
            {navCells.map(c => (
              <div key={c.label} className="pcard-navrow">
                <dt><MetricTip term={c.term}>{c.label}</MetricTip></dt>
                <dd style={{ color: Math.round(c.val) >= 0 ? INK : BAD }}>
                  {c.val >= 0.5 ? "+" : c.val <= -0.5 ? "−" : ""}{Math.abs(Math.round(c.val))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="pcard-foot">
        {percentileLabel(avgPercentile)} · avg {avgPercentile}th percentile vs {peerLabel}
      </div>
    </div>
  );
}
