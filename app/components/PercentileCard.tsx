"use client";
// ── PercentileCard — the shareable Cap & Crease player card ─────
// PA6/PA7: newspaper plate, free PNG export, branded, and carrying the
// proprietary read — X-NAV breakdown, gravity field, modern role, and
// EDGE tracking — alongside percentiles vs the positional field.
import React, { useMemo, useRef, useCallback, useState } from "react";
import { PlayerAvatar } from "@/app/components/PlayerAvatar";
import { navStageShort, navStagesForDisplay } from "@/app/lib/nav-breakdown";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import { computeGravity } from "@/app/lib/gravity";
import { derivePlayerRoles } from "@/app/lib/player-roles";
import { FieldDiagram } from "@/app/components/GravityField";
import { SEASON } from "@/app/lib/season-config";
import MetricTip from "@/app/components/MetricTip";
import { displayPosition } from "@/app/lib/display-position";
import { contractVerdict, surplusText, MODEL_PRICE_LABEL } from "@/app/lib/contract-verdict";
import {
  cardGravityFromV3,
  type CardImagePayload,
} from "@/app/lib/card-payload";

interface PlayerData {
  /**
   * Set when the deal has run out. `roster-assembly` zeroes `capHit` for these
   * players deliberately; without the flag a $0 hit reads as a huge bargain.
   */
  expiresThisOffseason?: boolean;
  /** The expiring deal's real AAV — never zeroed, unlike `capHit`. */
  lastCapHit?: number | null;

  id: string;
  name: string;
  teamId: string;
  position: string;
  secondaryPosition?: string | null;
  age: number;
  headshot?: string | null;
  ptsPace: number;
  xGPace: number;
  hdFinishingDelta?: number | null;
  edgeOzPct?: number | null;
  edgeSpeedMaxMph?: number | null;
  edgeBurstsOver20?: number | null;
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
  capCeiling?: number;
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

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

    // A missing stat renders as "no data" — it never fakes a 50th
    // percentile (the source of the suspiciously uniform columns).
    const pcts: { key: string; label: string; value: number | null; pct: number | null; formatted: string; median: string }[] = [];
    for (const stat of statDefs) {
      const raw = stat.extract(player);
      const sorted = sortedMaps.get(stat.key) ?? [];
      const pct = raw !== null && sorted.length >= 10
        ? computePercentile(stat.invert ? -raw : raw, stat.invert ? sorted.map(v => -v).sort((a, b) => a - b) : sorted)
        : null;
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

    const nav = calculateAssetNAV(player);

    return { percentiles: pcts, xnav: nav };
  }, [player, allPlayers, posGroup, statDefs]);

  const { gravity, gravityPercentile } = useMemo(() => {
    if (posGroup === "G") return { gravity: null, gravityPercentile: null };
    const profile = computeGravity(player as any);
    if (!profile) return { gravity: null, gravityPercentile: null };
    const peerForces = allPlayers
      .filter(peer => getPositionGroup(peer.position) === posGroup && (peer.games ?? 0) >= 20)
      .map(peer => computeGravity(peer as any)?.force)
      .filter((force): force is number => force != null)
      .sort((a, b) => a - b);
    return {
      gravity: profile,
      gravityPercentile: peerForces.length >= 10
        ? computePercentile(profile.force, peerForces)
        : null,
    };
  }, [player, allPlayers, posGroup]);
  const publicGravity = useMemo(
    () => gravity
      ? cardGravityFromV3(gravity, {
          season: SEASON.replaySeason,
          gravityPercentile,
        })
      : null,
    [gravity, gravityPercentile],
  );
  const roles = useMemo(() => derivePlayerRoles(player as any), [player]);

  const scored = percentiles.filter(p => p.pct !== null);
  const avgPercentile = scored.length > 0
    ? Math.round(scored.reduce((s, p) => s + (p.pct as number), 0) / scored.length)
    : null;

  const peerLabel = posGroup === "F" ? "all forwards" : posGroup === "D" ? "all defensemen" : "all goalies";

  const fmv = xnav.fmvAav ?? 0;
  // Decided by the model's own walk-forward error, not a round $1M. See
  // `contract-verdict.ts` — the old threshold was smaller than the model is
  // wrong by, so a gap inside the noise printed as an OVERPAY.
  const verdict = contractVerdict({
    fmvAav: xnav.fmvAav, capHit: player.capHit, position: player.position,
    expiresThisOffseason: player.expiresThisOffseason, lastCapHit: player.lastCapHit,
  });
  const surplus = verdict.surplus ?? 0;
  const surplusTone = verdict.tone;
  const surplusWord = verdict.label;
  const GOOD = "#146a24", BAD = "#9c2b1f", INK = "#1c140a";
  const toneColor = (t: string) => t === "good" ? GOOD : t === "bad" ? BAD : INK;

  // The engine's waterfall, which sums to the X-NAV headline. The old fixed
  // list could not: it printed the descriptive DEF rating instead of the value
  // in the total, and showed none of the multiplicative steps.
  const navCells = navStagesForDisplay(xnav.stages, xnav.total).map(st => ({
    label: navStageShort(st.key),
    val: st.value,
    term: navStageShort(st.key),
  }));

  // EDGE tracking strip (PA7) — only rows with real data render
  const edgeCells = [
    player.edgeOzPct != null ? { label: "OZ Time", val: `${(player.edgeOzPct * 100).toFixed(0)}%` } : null,
    player.edgeSpeedMaxMph != null ? { label: "Top Speed", val: `${player.edgeSpeedMaxMph.toFixed(1)} mph` } : null,
    player.edgeBurstsOver20 != null ? { label: "20+ Bursts", val: `${player.edgeBurstsOver20}` } : null,
    player.hdFinishingDelta != null ? {
      label: "HD Finish",
      val: `${player.hdFinishingDelta > 0 ? "+" : ""}${(player.hdFinishingDelta * 100).toFixed(1)}%`,
      color: player.hdFinishingDelta > 0 ? GOOD : player.hdFinishingDelta < 0 ? BAD : undefined,
    } : null,
  ].filter(Boolean) as { label: string; val: string; color?: string }[];

  const exportPng = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // Server-side render (Satori/next-og) rather than a client rasterizer.
      // The old client path drew black backgrounds in some browsers (Firefox)
      // because it never honored the card's <style>-block class backgrounds.
      // Here the browser ships an already-formatted payload and the route
      // renders a guaranteed-solid PNG — deterministic across every browser.

      const payload: CardImagePayload = {
        name: player.name,
        sub: `${teamName ?? player.teamId} · ${displayPosition(player.position, player.secondaryPosition)} · Age ${player.age}`,
        roleLabel: roles?.primary.label,
        roleColor: roles?.primary.color,
        xnavTotal: xnav.total,
        capHitLabel: `$${player.capHit.toFixed(1)}M`,
        yearsLabel: `${player.yearsRemaining} yr`,
        fmvLabel: `$${fmv.toFixed(1)}M`,
        surplusLabel: `${surplusText(verdict)} · ${surplusWord}`,
        surplusColor: toneColor(surplusTone),
        gravity: publicGravity,
        edgeCells,
        stats: percentiles.map(s => ({
          label: s.label,
          pct: s.pct,
          formatted: s.formatted,
          median: s.median,
          barColor: s.pct !== null ? percentileColor(s.pct) : null,
        })),
        navCells: navCells.map(c => ({ label: c.label, val: c.val })),
        peerLabel,
        avgPercentile,
      };

      const res = await fetch("/api/card-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`card-image responded ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${player.name.replace(/\s+/g, "-").toLowerCase()}-cap-and-crease-card.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (event) {
      console.error("[player card export]", event);
    } finally {
      setExporting(false);
    }
  }, [
    player, teamName, roles, xnav, fmv, surplus, surplusWord, surplusTone,
    publicGravity, edgeCells, percentiles, navCells, peerLabel, avgPercentile, exporting,
  ]);

  return (
    <div style={{ width: "100%", maxWidth: 620, margin: "0 auto" }}>
      <div ref={cardRef} className="pcard" role="group"
        style={{ background: "#ede4cc" }}
        aria-label={`${player.name} value card — X-NAV ${xnav.total}${avgPercentile !== null ? `, ${percentileLabel(avgPercentile)} vs ${peerLabel}` : ""}`}>
      <style>{`
        .pcard { width: 100%;
          background: #ede4cc; border: 2px solid #1c140a; border-radius: 3px;
          font-family: var(--font-mono, ui-monospace, monospace); color: #1c140a;
          /* Scope the ledger palette to fixed newspaper tones so the embedded
             gravity rink renders in-card and exports cleanly in any theme. */
          --ledger-ink: #1c140a; --ledger-ink-body: #4a3820; --ledger-ink-faint: #6e5a3d;
          --ledger-rule: #b8a070; --ledger-rule-light: #d6c8a5;
          --paper-bg: #ede4cc; --paper-card: #ede4cc; --paper-inset: #e4d8b8;
          --ledger-green: #146a24; --ledger-red: #9c2b1f;
          --ledger-ice: #1a4b5b; --ledger-amber: #d4a017; --ledger-brown: #6e5a3d; }
        .pcard *:focus-visible { outline: 2px solid #1a4b5b; outline-offset: 2px; border-radius: 2px; }
        .pcard-head { background: #e4d8b8; color: #1c140a; padding: 12px 16px;
          border-bottom: 2px solid #1c140a;
          display: flex; align-items: center; gap: 12px; }
        .pcard-head img { width: 52px; height: 52px; border-radius: 50%;
          border: 2px solid #1c140a; flex-shrink: 0; }
        .pcard-name { font-size: 16px; font-weight: 900; line-height: 1.15; color: #1c140a;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pcard-sub { font-size: 11px; color: #4a3820; margin-top: 3px;
          text-transform: uppercase; letter-spacing: 0.1em; }
        .pcard-role { font-size: 10px; font-weight: 900; margin-top: 3px;
          text-transform: uppercase; letter-spacing: 0.06em; }
        .pcard-nav-total { font-size: 26px; font-weight: 900; line-height: 1; color: #1c140a; }
        .pcard-nav-label { font-size: 8px; text-transform: uppercase;
          letter-spacing: 0.08em; color: #4a3820; margin-top: 3px; max-width: 110px; }
        .pcard-contract { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 18px;
          padding: 8px 16px; border-bottom: 1px solid #b8a070; font-size: 12px; }
        .pcard-contract .lbl { font-size: 9px; font-weight: 700; color: #4a3820;
          text-transform: uppercase; letter-spacing: 0.1em; margin-right: 5px; }
        .pcard-contract .num { font-weight: 900; font-variant-numeric: tabular-nums; }
        .pcard-grav { padding: 10px 12px 6px; border-bottom: 1px solid #b8a070;
          background: #e4d8b8; }
        .pcard-grav-h { display: flex; align-items: center; justify-content: space-between; gap: 8px;
          margin-bottom: 2px; }
        .pcard-grav-title { font-size: 10px; font-weight: 700; color: #4a3820;
          text-transform: uppercase; letter-spacing: 0.12em; }
        .pcard-edge { display: grid; grid-template-columns: repeat(4, 1fr);
          border-bottom: 1px solid #b8a070; }
        .pcard-ecell { padding: 6px 8px; text-align: center; border-right: 1px solid #d6c8a5; }
        .pcard-ecell:last-child { border-right: none; }
        .pcard-elabel { font-size: 9px; font-weight: 700; color: #4a3820;
          text-transform: uppercase; letter-spacing: 0.08em; }
        .pcard-eval { font-size: 12px; font-weight: 900; margin-top: 1px; font-variant-numeric: tabular-nums; }
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
        .pcard-nodata { font-size: 10px; font-weight: 700; color: #6e5a3d;
          text-transform: uppercase; letter-spacing: 0.08em; }
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
        .pcard-foot { border-top: 2px solid #1c140a; padding: 6px 14px;
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          font-size: 10px; color: #4a3820;
          text-transform: uppercase; letter-spacing: 0.12em; }
        @media (prefers-reduced-motion: reduce) { .pcard-fill { transition: none; } }
      `}</style>

      {/* Header — paper plate, ink reserved for text (PA7) */}
      <div className="pcard-head">
        {/* The site may show the league's photo; the exported card may not.
            That split lives in PlayerAvatar, not here. */}
        <PlayerAvatar name={player.name} position={player.position} size={56}
          playerId={player.id} teamId={player.teamId} headshot={player.headshot} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pcard-name">{player.name}</div>
          <div className="pcard-sub">{teamName ?? player.teamId} · {displayPosition(player.position, player.secondaryPosition)} · Age {player.age}</div>
          {roles && (
            <div className="pcard-role" style={{ color: roles.primary.color }}>
              {roles.primary.icon} {roles.primary.label}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="pcard-nav-total">{xnav.total}</div>
          <div className="pcard-nav-label">X-NAV · Extended Net Asset Value</div>
        </div>
      </div>

      {/* Contract line — one compact plate (PA7) */}
      <div className="pcard-contract">
        <span><span className="lbl">Cap Hit</span><span className="num" style={{ color: INK }}>${player.capHit.toFixed(1)}M × {player.yearsRemaining}yr</span></span>
        <span><span className="lbl"><MetricTip term="FMV">{MODEL_PRICE_LABEL}</MetricTip></span><span className="num" style={{ color: INK }}>${fmv.toFixed(1)}M</span></span>
        <span><span className="lbl">Surplus</span><span className="num" style={{ color: toneColor(surplusTone) }} title={verdict.note}>
          {surplusText(verdict)} · {surplusWord}
        </span></span>
      </div>

      {/* Gravity field — the full spacetime rink (PA7) */}
      {gravity && (
        <div className="pcard-grav">
          <div className="pcard-grav-h">
            <span className="pcard-grav-title">Player Gravity · {publicGravity?.fieldLabel}</span>
            <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6e5a3d" }}>
              {publicGravity?.season} · {publicGravity?.situation}
            </span>
          </div>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.05em", color: "#6e5a3d", textTransform: "uppercase", marginTop: 3 }}>
            {publicGravity?.modelLabel} · Reliability {publicGravity?.reliabilityLabel} · Data {publicGravity?.coverageLabel} · Gravity {gravityPercentile != null ? `${gravityPercentile}th pct` : "pct unavailable"}
          </div>
          <FieldDiagram profile={gravity} />
          <div style={{ fontSize: 9, color: "#6e5a3d", lineHeight: 1.35, padding: "0 4px 4px" }}>
            {publicGravity?.fieldDisclaimer}
          </div>
        </div>
      )}

      {/* EDGE tracking strip (PA7) */}
      {edgeCells.length > 0 && (
        <div className="pcard-edge" style={{ gridTemplateColumns: `repeat(${edgeCells.length}, 1fr)` }}>
          {edgeCells.map(c => (
            <div key={c.label} className="pcard-ecell">
              <div className="pcard-elabel">{c.label}</div>
              <div className="pcard-eval" style={{ color: c.color ?? INK }}>{c.val}</div>
            </div>
          ))}
        </div>
      )}

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
                    {stat.pct !== null ? (
                      <div className="pcard-barrow">
                        <div className="pcard-bar" role="img"
                          aria-label={`${stat.pct}th percentile — ${percentileLabel(stat.pct).toLowerCase()}`}>
                          <div className="pcard-fill" style={{ width: `${stat.pct}%`, background: percentileColor(stat.pct) }} />
                          <div className="pcard-median" />
                        </div>
                        <span className="pcard-pctnum">{stat.pct}</span>
                      </div>
                    ) : (
                      <span className="pcard-nodata">No data</span>
                    )}
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
        <span style={{ fontWeight: 900, color: INK }}>CAP & CREASE</span>
        <span>
          {avgPercentile !== null
            ? `${percentileLabel(avgPercentile)} · avg ${avgPercentile}th pct vs ${peerLabel}`
            : `vs ${peerLabel}`}
        </span>
      </div>
      </div>

      {/* Export control — outside the captured plate (PA6) */}
      <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          onClick={exportPng}
          disabled={exporting}
          aria-label={`Export ${player.name}'s card as a PNG image`}
          style={{
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em",
            padding: "7px 16px", border: "1.5px solid #1c140a",
            background: "#e4d8b8", color: "#1c140a",
            cursor: exporting ? "wait" : "pointer", opacity: exporting ? 0.6 : 1,
          }}
        >
          {exporting ? "Rendering…" : "⬇ Export Card (PNG)"}
        </button>
      </div>
    </div>
  );
}
