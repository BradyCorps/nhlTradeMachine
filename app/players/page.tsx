"use client";
import StrandDisplay from "@/app/components/StrandDisplay";
import EdgeStrip from "@/app/components/EdgeStrip";
import { buildGoalieStrandTraits } from "@/app/components/StrandView";
import PlayerTimeline from "@/app/components/PlayerTimeline";
import { DevelopmentProfilePanel } from "@/app/components/DevelopmentProfilePanel";
import type { DevelopmentProfile } from "@/app/lib/development-profile";
import {
  getInjuryRisk,
  getPlayerPedigree,
  getProspectTier,
  getShutdownDPedigree,
} from "@/app/lib/player-data";
import { FRANCHISE, SEASON } from "@/app/lib/season-config";
import { calcNAV, classifyForwardArchetype } from "@/app/lib/xnav-engine";
import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import EdgeShotMap from "@/app/components/EdgeShotMap";
import PercentileCard from "@/app/components/PercentileCard";
import { displayPosition } from "@/app/lib/display-position";

// ── Types ─────────────────────────────────────────────────────
interface Player {
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
  edgeOzPercentile?: number | null;
  edgeSpeedMaxMph?: number | null;
  edgeBurstsOver20?: number | null;
  baselineHdsvPct?: number | null;
  avgTOI: number;
  qocIndex?: number | null;
  rosterTier?: string;
  games?: number;
  gsax?: number;
  savePct?: number;
  gamesStarted?: number;
  shotsPerGame?: number | null;
  baselineGsax?: number | null;
  teamXga60?: number | null;
  teamHdca60?: number | null;
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

const formatEdgeLuck = (delta: number | null | undefined): string =>
  delta != null ? `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%` : "-";

const edgeLuckColor = (delta: number | null | undefined): string =>
  delta == null ? "var(--ledger-ink)" :
  delta <= -0.02 ? "var(--ledger-green)" :
  delta >= 0.03 ? "var(--ledger-red)" :
  "var(--ledger-ink)";

const EDGE_LUCK_TITLE = "NHL EDGE high-danger finishing vs league average. Negative means unlucky finishing; positive means hot finishing.";

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
    label = classifyForwardArchetype({
      ptsPace: player.ptsPace,
      goalsPace: player.goalsPace,
      assistsPace: player.assistsPace,
      xGPace: player.xGPace,
      avgTOI: player.avgTOI,
      qocIndex: player.qocIndex,
      xgRelTM: player.xgRelTM,
      ops: player.ops,
      dps: player.dps,
      pkTimeShare: player.pkTimeShare,
      edgeSpeedMaxMph: player.edgeSpeedMaxMph,
      edgeBurstsOver20: player.edgeBurstsOver20,
    });
    color = label === "HIGH_GRAVITY" ? "var(--ledger-ink)"
      : label === "LINE_RAISER" || label === "LINE_ESTABLISHER" ? "var(--ledger-green)"
      : label === "LINE_FINISHER" || label === "SPEED_BURST" ? "var(--blue)"
      : label === "DEFENSIVE" ? "var(--red)"
      : label === "SPACE_OPENER" ? "var(--ledger-amber)"
      : label === "IMPACT_PLAYER" ? "var(--ledger-navy)"
      : "var(--ink-faint)";
  }

  if (!label) return null;
  const icon =
    label === "HIGH_GRAVITY" ? "◆"
    : label === "LINE_RAISER" ? "↗"
    : label === "LINE_FINISHER" ? "◎"
    : label === "SPEED_BURST" ? "≫"
    : label === "SPACE_OPENER" ? "□"
    : label === "IMPACT_PLAYER" || label === "OFF D" ? "●"
    : label === "SHUTDOWN" || label === "DEFENSIVE" ? "■"
    : label === "STARTER" ? "G1"
    : label === "TANDEM" ? "G2"
    : label === "TWO-WAY" || label === "LINE_ESTABLISHER" ? "◇"
    : "•";
  const displayLabel = label.replace(/_/g, " ");

  return (
    <span title={displayLabel} aria-label={displayLabel} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: "18px", height: "18px",
      fontSize: icon.length > 1 ? "8px" : "11px", fontWeight: 900,
      color, border: `1px solid ${color}`,
      padding: "0 3px", letterSpacing: 0,
      opacity: 0.9, whiteSpace: "nowrap", flexShrink: 0,
    }}>{icon}</span>
  );
}

function PlayerIconBadges({ player }: { player: Player }) {
  const position = player.position === "D" || player.position === "G" || player.position === "C" ? player.position : "W";
  const xnav = useMemo(() => calcNAV({
    id: player.id,
    name: player.name,
    position,
    age: player.age,
    capHit: player.capHit,
    yearsRemaining: player.yearsRemaining,
    capCeiling: SEASON.capCeiling,
    ptsPace: player.ptsPace,
    xGPace: player.xGPace,
    edgeSpeedMaxMph: player.edgeSpeedMaxMph,
    edgeBurstsOver20: player.edgeBurstsOver20,
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
  }), [player, position]);

  const prospectTier = getProspectTier(player.name);
  const pedigree = getPlayerPedigree(player.name);
  const injuryRisk = getInjuryRisk(player.name);
  const shutdownPedigree = getShutdownDPedigree(player.name);
  const isMegalodon = xnav.total >= FRANCHISE.megalodon;
  const isFranchise = !isMegalodon && xnav.total >= FRANCHISE.threshold;
  const isSurplus = xnav.cap > 0 && xnav.total > player.capHit * 18 && xnav.total > 50;
  const hasAwards = (pedigree?.awards?.length ?? 0) > 0;

  const badges = [
    isMegalodon ? { key: "megalodon", icon: "♛", color: "var(--ledger-amber)", title: `Megalodon tier — NAV ${xnav.total} ≥ ${FRANCHISE.megalodon}.` } : null,
    isFranchise ? { key: "franchise", icon: "◆", color: "var(--ledger-ink)", title: `Franchise tier — NAV ${xnav.total} ≥ ${FRANCHISE.threshold}.` } : null,
    isSurplus ? { key: "surplus", icon: "★", color: "var(--ledger-green)", title: "Surplus contract — on-ice value significantly exceeds cap hit." } : null,
    prospectTier ? { key: "prospect", icon: prospectTier.tier === 1 ? "★" : prospectTier.tier === 2 ? "◆" : "◇", color: prospectTier.tier === 1 ? "var(--ledger-navy)" : prospectTier.tier === 2 ? "var(--ledger-green)" : "var(--ledger-brown)", title: prospectTier.tier === 1 ? "Franchise prospect pedigree." : prospectTier.tier === 2 ? "Top prospect pedigree." : "Prospect pedigree." } : null,
    hasAwards ? { key: "awards", icon: "A", color: "var(--ledger-amber)", title: `Award pedigree — ${Array.from(new Set(pedigree!.awards)).join(" · ")}.` } : null,
    injuryRisk ? { key: "injury", icon: "!", color: "var(--ledger-red)", title: injuryRisk.note } : null,
    shutdownPedigree ? { key: "shutdown", icon: "■", color: "var(--ledger-amber)", title: shutdownPedigree.note } : null,
  ].filter(Boolean) as { key: string; icon: string; color: string; title: string }[];

  if (badges.length === 0) return null;
  return (
    <>
      {badges.slice(0, 4).map(badge => (
        <span key={badge.key} title={badge.title} aria-label={badge.title} style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "18px",
          height: "18px",
          fontSize: badge.icon.length > 1 ? "8px" : "11px",
          fontWeight: 900,
          color: badge.color,
          border: `1px solid ${badge.color}`,
          background: "rgba(255,255,255,0.18)",
          padding: "0 3px",
          lineHeight: 1,
          flexShrink: 0,
        }}>
          {badge.icon}
        </span>
      ))}
    </>
  );
}

const PLAYER_ICON_KEY = [
  ["♛", "Megalodon", "Extreme franchise-value tier."],
  ["◆", "Franchise", "Franchise-value player or top prospect marker."],
  ["★", "Surplus", "Strong surplus contract, prospect pedigree, or elite pedigree signal."],
  ["◇", "Prospect", "Tracked prospect or depth prospect marker."],
  ["A", "Awards", "Award pedigree on the player record."],
  ["!", "Risk", "Elevated injury or availability risk."],
  ["■", "Shutdown", "Elite shutdown or defensive pedigree signal."],
] as const;

function PlayersIconKey() {
  return (
    <section aria-label="Player icon key" style={{
      maxWidth: 1100,
      margin: "10px auto 0",
      padding: "0 16px",
      position: "sticky",
      top: 0,
      zIndex: 5,
    }}>
      <div style={{
        border: "1px solid #b8a070",
        background: "var(--paper-card)",
        padding: "8px 10px",
        boxShadow: "0 2px 0 rgba(64, 45, 18, 0.12)",
      }}>
        <div style={{
          fontSize: "10px",
          fontWeight: 900,
          color: "var(--ledger-ink)",
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          marginBottom: "6px",
        }}>
          Icon Key
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "7px 12px",
        }}>
          {PLAYER_ICON_KEY.map(([icon, label, definition]) => (
            <div key={`${icon}-${label}`} title={definition} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: "7px", alignItems: "center" }}>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "20px",
                height: "20px",
                border: "1px solid var(--ledger-rule)",
                color: "var(--ledger-ink)",
                fontSize: "11px",
                fontWeight: 900,
                lineHeight: 1,
              }}>
                {icon}
              </span>
              <span>
                <span style={{
                  display: "block",
                  fontSize: "10px",
                  fontWeight: 900,
                  color: "var(--ledger-ink-light)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  lineHeight: 1.1,
                }}>
                  {label}
                </span>
                <span style={{
                  display: "block",
                  marginTop: "1px",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "var(--ledger-ink-faint)",
                  lineHeight: 1.2,
                }}>
                  {definition}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Expanded player tab types ─────────────────────────────────
type PlayerTab = "stats" | "strand" | "card" | "outlook" | "contract" | "edge";

const PLUM = "#5e3a6e";
const PLUM_LIGHT = "#7a4f8a";
const PLUM_FAINT = "rgba(94, 58, 110, 0.08)";

function PlayerTabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 0",
        padding: "10px 6px",
        fontSize: "11px",
        fontWeight: 900,
        fontFamily: "var(--font-mono, monospace)",
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: active ? "#fff" : PLUM,
        background: active ? PLUM : "transparent",
        border: `2px solid ${active ? PLUM : "var(--ledger-rule, #b8a070)"}`,
        borderBottom: active ? `2px solid ${PLUM}` : "2px solid var(--ledger-rule, #b8a070)",
        cursor: "pointer",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
        minWidth: 0,
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.target as HTMLElement).style.background = PLUM_FAINT;
          (e.target as HTMLElement).style.borderColor = PLUM_LIGHT;
          (e.target as HTMLElement).style.color = PLUM;
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.target as HTMLElement).style.background = "transparent";
          (e.target as HTMLElement).style.borderColor = "var(--ledger-rule, #b8a070)";
          (e.target as HTMLElement).style.color = PLUM;
        }
      }}
    >
      {label}
    </button>
  );
}

// ── Expanded player row ───────────────────────────────────────
function ExpandedPlayer({ player, team, allPlayers }: { player: Player; team?: Team; allPlayers: Player[] }) {
  const isG = player.position === "G";
  const hasOutlook = player.position !== "G" && !!player.developmentProfile;
  const hasStrand = true;
  const hasContract = player.yearsRemaining > 0;

  const tabs: { key: PlayerTab; label: string }[] = [
    { key: "stats", label: "Stats" },
    ...(hasStrand ? [{ key: "strand" as PlayerTab, label: "Strand" }] : []),
    { key: "card", label: "Player Card" },
    ...(/^\d+$/.test(String(player.id)) && player.position !== "G" ? [{ key: "edge" as PlayerTab, label: "Edge" }] : []),
    ...(hasContract ? [{ key: "contract" as PlayerTab, label: "Contract" }] : []),
    ...(hasOutlook ? [{ key: "outlook" as PlayerTab, label: "Outlook" }] : []),
  ];

  const [activeTab, setActiveTab] = useState<PlayerTab>("stats");

  const seasonPoints = Math.round((player.ptsPace / 82) * (player.games ?? 82));
  const statItems: Array<{ label: string; val: string; title?: string; color?: string }> = isG ? [
    { label: "GP",    val: player.gamesStarted?.toString() ?? "—" },
    { label: "GSAx",  val: (player.gsax ?? 0).toFixed(1) },
    { label: "SV%",   val: player.savePct?.toFixed(3) ?? "—" },
    { label: "Tier",  val: goalieTeir(player.gamesStarted ?? 0) },
  ] : [
    { label: "PTS",    val: seasonPoints.toString() },
    { label: "PTS/82", val: player.ptsPace.toFixed(1) },
    { label: "G/82",   val: player.goalsPace != null ? (player.goalsPace as number).toFixed(1) : "—" },
    { label: "A/82",   val: player.assistsPace != null ? (player.assistsPace as number).toFixed(1) : "—" },
    { label: "xG/82",  val: player.xGPace.toFixed(1) },
    { label: "TOI",    val: player.avgTOI.toFixed(1) },
    { label: "xG%+",   val: player.xgRelTM != null ? `${(player.xgRelTM as number) > 0 ? "+" : ""}${(player.xgRelTM as number).toFixed(1)}` : "—" },
    { label: "OZ%",    val: player.dzPct != null ? `${(((1 - (player.dzPct as number)) * 100)).toFixed(0)}%` : "—" },
    { label: "EDGE HD", val: formatEdgeLuck(player.hdFinishingDelta), title: EDGE_LUCK_TITLE, color: edgeLuckColor(player.hdFinishingDelta) },
  ];

  return (
    <div className="player-expanded-panel" style={{
      background: "#d6c8a5", borderTop: `3px solid ${PLUM}`,
    }}>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: 0,
        padding: "0",
        background: "#e4d8b8",
        borderBottom: `2px solid ${PLUM}`,
      }}>
        {tabs.map(t => (
          <PlayerTabButton
            key={t.key}
            label={t.label}
            active={activeTab === t.key}
            onClick={() => setActiveTab(t.key)}
          />
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: "14px 16px" }}>

        {/* ── Stats tab ──────────────────────────── */}
        {activeTab === "stats" && (
          <div>
            <div className="stat-grid-4" style={{ marginBottom: "10px" }}>
              {statItems.map(s => (
                <div key={s.label} title={s.title} style={{
                  background: "#e4d8b8", border: "1px solid #b8a070",
                  padding: "6px 8px", textAlign: "center",
                }}>
                  <div style={{ fontSize: "11px", color: "var(--ledger-ink-faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
                  <div style={{ fontSize: "11px", fontWeight: 900, color: s.color ?? "var(--ledger-ink)", marginTop: "2px" }}>{s.val}</div>
                </div>
              ))}
            </div>
            {!isG && player.ops != null && player.dps != null && (
              <div style={{ display: "flex", gap: "6px" }}>
                <div style={{ padding: "3px 8px", background: "var(--paper-card)", border: "1px solid var(--rule-light)", fontSize: "11px", fontWeight: 900 }}>
                  <span style={{ color: "var(--rule)", marginRight: "4px" }}>PS</span>
                  <span style={{ color: "var(--ink)" }}>{(player.ops + player.dps).toFixed(1)}</span>
                </div>
              </div>
            )}
            <div className="player-expanded-contract" style={{ marginTop: "10px", fontSize: "11px", color: "var(--ink-faint)" }}>
              <span style={{ color: PLUM, marginRight: "6px", fontWeight: 900 }}>CONTRACT</span>
              ${player.capHit}M × {player.yearsRemaining}yr
              {player.hasNMC && <span style={{ marginLeft: "8px", color: "var(--red)", border: "1px solid var(--red)", padding: "0 3px" }}>NMC</span>}
              {player.hasNTC && !player.hasNMC && <span style={{ marginLeft: "8px", color: "#8a5c00", border: "1px solid #8a5c00", padding: "0 3px" }}>NTC</span>}
            </div>
          </div>
        )}

        {/* ── Strand tab ─────────────────────────── */}
        {activeTab === "strand" && hasStrand && (
          <div>
            <div className="strand-svg-wrap" style={{ background: "#e4d8b8", border: "1px solid #b8a070", padding: "8px" }}>
              <FullStrand player={player} />
            </div>
          </div>
        )}

        {/* ── Player Card tab ────────────────────── */}
        {activeTab === "edge" && (
          <EdgeShotMap nhlPlayerId={player.id} />
        )}

        {activeTab === "card" && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PercentileCard
              player={player}
              allPlayers={allPlayers}
              teamName={team?.name}
            />
          </div>
        )}

        {/* ── Contract tab ───────────────────────── */}
        {activeTab === "contract" && hasContract && (
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
              hdFinishingDelta: player.hdFinishingDelta ?? undefined,
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

        {/* ── Outlook tab ────────────────────────── */}
        {activeTab === "outlook" && hasOutlook && (
          <div style={{ background: "#e4d8b8", border: "1px solid #b8a070", padding: "8px 12px" }}>
            <div style={{ fontSize: "11px", color: PLUM, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "6px", fontWeight: 900 }}>
              Development Outlook
            </div>
            <DevelopmentProfilePanel asset={{ ...player } as any} />
          </div>
        )}
      </div>
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
  const norm = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const safe = (n: number) => isNaN(n) || !isFinite(n) ? 0 : n;

  if (player.position === "G") {
    const goalie = buildGoalieStrandTraits(player);
    return (
      <StrandDisplay
        offTraits={goalie.off}
        defTraits={goalie.def}
        ops={null} dps={null}
        strandType="GOALTENDER"
        footer={<EdgeStrip asset={player} heading={false} />}
        W={300} H={200} amplitude={42} maxWidth={460}
      />
    );
  }

  const isD  = player.position === "D";
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
      raw: ops !== null ? `${ops.toFixed(1)} OPS` : `${player.ptsPace.toFixed(0)} P/82`,
      title: ops !== null ? `OPS ${ops.toFixed(1)} — Offensive Point Shares` : `Pts/82: ${player.ptsPace.toFixed(1)}` },
    { label: "xG",   val: player.xGPace != null ? norm(safe(player.xGPace), 0, isD ? 25 : 50) : 0.5,
      raw: player.xGPace != null ? `${player.xGPace.toFixed(0)} xG/82` : undefined,
      title: player.xGPace != null ? `xG/82: ${player.xGPace.toFixed(1)}` : "xG data unavailable",
      unavailable: player.xGPace == null },
    { label: "NOIV", val: norm(safe(player.xgRelTM ?? 0), -12, 12),
      raw: `${(player.xgRelTM ?? 0) >= 0 ? "+" : ""}${(player.xgRelTM ?? 0).toFixed(1)}%`,
      title: `xG% vs teammates: ${player.xgRelTM != null ? (player.xgRelTM as number).toFixed(1) : "—"}` },
    { label: "TOI", val: norm(safe(player.avgTOI), 10, 27),
      raw: `${player.avgTOI.toFixed(1)} min`,
      title: `Ice time: ${player.avgTOI.toFixed(1)} min/gm` },
  ];
  const defTraits = [
    { label: dps !== null ? "DPS" : "DEF",
      val: dpsNorm ?? norm(safe(player.defRate ?? 0), -0.3, 0.3),
      raw: dps !== null ? `${dps.toFixed(1)} DPS` : undefined,
      unavailable: dps === null && player.defRate == null,
      title: dps !== null ? `DPS ${dps.toFixed(1)} — Defensive Point Shares` : "Defensive NAV component" },
    { label: "SUPP", val: norm(-(safe(player.xgaRelTM ?? 0)), -1.5, 1.5),
      raw: `${(-(player.xgaRelTM ?? 0)) >= 0 ? "+" : ""}${(-(player.xgaRelTM ?? 0)).toFixed(2)} xGA`,
      title: `Chance suppression vs teammates: ${player.xgaRelTM != null ? (-(player.xgaRelTM as number)).toFixed(2) : "—"} (higher = stingier)` },
    { label: "QoC",  val: (player.qocIndex ?? 35) / 100,
      raw: undefined,
      title: `Quality of competition ${player.qocIndex ?? "—"}/100 — how tough his matchups are` },
    { label: "OZ",   val: ozScore, raw: dzAvail ? `${ozRaw}% OZ` : undefined, unavailable: !dzAvail,
      title: dzAvail ? `OZ%: ${ozRaw}% offensive zone starts` : "Zone deployment unavailable" },
  ];

  return (
    <StrandDisplay
      offTraits={offTraits}
      defTraits={defTraits}
      ops={ops}
      dps={dps}
      footer={<EdgeStrip asset={player} heading={false} />}
      W={300}
      H={200}
      amplitude={42}
      maxWidth={460}
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

type PlayerSortKey =
  | "seasonPts" | "ppg" | "pts" | "toi" | "ops" | "dps" | "age" | "cap" | "term"
  | "supp" | "gsax" | "svPct" | "gaa" | "gp";
type PlayerSection = "F" | "D" | "G";
type PlayerColumn = { key: PlayerSortKey; label: string };

const PLAYER_COLUMNS: Record<PlayerSection, PlayerColumn[]> = {
  F: [
    { key: "seasonPts", label: "PTS" },
    { key: "ppg",       label: "PPG" },
    { key: "pts",       label: "P/82" },
    { key: "ops",       label: "OPS" },
    { key: "dps",       label: "DPS" },
    { key: "toi",       label: "TOI" },
    { key: "age",       label: "Age" },
    { key: "cap",       label: "Cap" },
    { key: "term",      label: "Term" },
  ],
  D: [
    { key: "seasonPts", label: "PTS" },
    { key: "ops",       label: "OPS" },
    { key: "dps",       label: "DPS" },
    { key: "toi",       label: "TOI" },
    { key: "age",       label: "Age" },
    { key: "cap",       label: "Contract" },
    { key: "term",      label: "Yrs left" },
    { key: "supp",      label: "Supp" },
  ],
  G: [
    { key: "gsax",  label: "GSAx" },
    { key: "svPct", label: "SV%" },
    { key: "gaa",   label: "GAA" },
    { key: "cap",   label: "Contract" },
    { key: "term",  label: "Yrs left" },
    { key: "gp",    label: "GP" },
  ],
};

const playerGridTemplate = (section: PlayerSection): string => {
  const stats = PLAYER_COLUMNS[section].length;
  return `36px 40px minmax(210px,1.2fr) 88px repeat(${stats},minmax(58px,0.55fr)) 24px`;
};

const playerGridMinWidth = (section: PlayerSection): string => {
  if (section === "G") return "720px";
  if (section === "D") return "820px";
  return "880px";
};

const seasonPointsOf = (p: Player): number => Math.round((p.ptsPace / 82) * (p.games ?? 82));
const goalieGamesOf = (p: Player): number => p.games ?? p.gamesStarted ?? 0;
const goalieGaaOf = (p: Player): number | null => {
  if (p.position !== "G" || p.savePct == null) return null;
  const shotsPerGame = p.shotsPerGame && p.shotsPerGame > 0 ? p.shotsPerGame : 30;
  return (1 - p.savePct) * shotsPerGame;
};
const suppressionSortValue = (p: Player): number | null =>
  p.xgaRelTM == null ? null : -p.xgaRelTM;

const signedOneDecimal = (n: number): string => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

const statDisplay = (p: Player, key: PlayerSortKey, actualPPG: (p: Player) => number): string => {
  switch (key) {
    case "seasonPts": return seasonPointsOf(p).toString();
    case "ppg":       return actualPPG(p).toFixed(3);
    case "pts":       return p.ptsPace.toFixed(1);
    case "ops":       return p.ops != null ? p.ops.toFixed(1) : "—";
    case "dps":       return p.dps != null ? p.dps.toFixed(1) : "—";
    case "toi":       return p.avgTOI.toFixed(1);
    case "age":       return `${p.age}`;
    case "cap":       return `$${p.capHit}M`;
    case "term":      return `${p.yearsRemaining}yr`;
    case "supp":      return p.xgaRelTM != null ? signedOneDecimal(p.xgaRelTM) : "—";
    case "gsax":      return (p.gsax ?? 0).toFixed(1);
    case "svPct":     return p.savePct?.toFixed(3) ?? "—";
    case "gaa": {
      const gaa = goalieGaaOf(p);
      return gaa != null ? gaa.toFixed(2) : "—";
    }
    case "gp":        return `${goalieGamesOf(p)}`;
    default:          return "—";
  }
};

function SortHeader({ k, label, active, dir, onClick }: {
  k: PlayerSortKey;
  label: string;
  active: boolean;
  dir: "desc" | "asc";
  onClick: (k: PlayerSortKey) => void;
}) {
  return (
    <button
      className={`col-header${active ? " active" : ""}`}
      style={{ width: "100%", justifySelf: "stretch", textAlign: "center", fontSize: "11px", letterSpacing: "0.04em" }}
      onClick={() => onClick(k)}
    >
      {label} {active ? (dir === "desc" ? "▼" : "▲") : ""}
    </button>
  );
}

// ── Player row ────────────────────────────────────────────────
function PlayerRow({ player, team, rank, sortKey, actualPPG, section, allPlayers }: {
  player: Player; team?: Team; rank: number;
  sortKey: PlayerSortKey;
  actualPPG: (p: Player) => number;
  section: PlayerSection;
  allPlayers: Player[];
}) {
  const [expanded, setExpanded] = useState(false);
  const isG = player.position === "G";
  const columns = PLAYER_COLUMNS[section];
  const primary = columns[0];
  const secondary = columns[1] ?? columns[0];
  const tertiary = columns[2];

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
          gridTemplateColumns: playerGridTemplate(section),
          minWidth: playerGridMinWidth(section),
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
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)", whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.15, display: "block" }}>
              {player.name}
            </span>
            <ArchetypeBadge player={player} />
            <PlayerIconBadges player={player} />
            {player.hasNMC && <span style={{ fontSize: "11px", color: "var(--red)", border: "1px solid var(--red)", padding: "0 3px" }}>NMC</span>}
          </div>
          <div style={{ fontSize: "11px", color: "var(--rule)", marginTop: "1px" }}>
            {team?.name ?? player.teamId} · {displayPosition(player.position, player.secondaryPosition)} · Age {player.age}
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

        {columns.map(({ key }) => (
          <div key={key} style={{
            textAlign: "center",
            fontSize: "11px",
            color: key === "ops" || key === "gsax" || key === "svPct" ? "var(--blue)"
              : key === "dps" || key === "supp" || key === "gaa" ? "var(--red)"
              : key === "seasonPts" || key === "ppg" || key === "pts" ? "var(--ink)"
              : "var(--ink-light)",
            fontWeight: sortKey === key ? 900 : key === "seasonPts" || key === "gsax" ? 900 : 700,
          }}>
            {statDisplay(player, key, actualPPG)}
          </div>
        ))}
        <span style={{ fontSize: "11px", color: "var(--rule)", textAlign: "right" }}>{expanded ? "▲" : "▼"}</span>
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
            <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)", whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.15 }}>
                {player.name}
              </span>
              <ArchetypeBadge player={player} />
              <PlayerIconBadges player={player} />
              {player.hasNMC && <span style={{ fontSize: "10px", color: "var(--red)", border: "1px solid var(--red)", padding: "0 3px", flexShrink: 0 }}>NMC</span>}
            </div>
            <div style={{ fontSize: "11px", color: "var(--rule)", marginTop: "2px" }}>
              {teamAbbr} · {displayPosition(player.position, player.secondaryPosition)} · Age {player.age}
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
            <StatPill value={statDisplay(player, primary.key, actualPPG)} label={primary.label} accent />
            <StatPill value={statDisplay(player, secondary.key, actualPPG)} label={secondary.label} />
            {tertiary && (
              <StatPill value={statDisplay(player, tertiary.key, actualPPG)} label={tertiary.label} />
            )}
            {/* Contract shorthand */}
            {!columns.some(c => c.key === "cap") && (
              <StatPill value={`$${player.capHit}M`} label={`${player.yearsRemaining}yr`} />
            )}
          </div>
        </div>
      </div>

      {expanded && <ExpandedPlayer player={player} team={team} allPlayers={allPlayers} />}
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

function SectionColumnHeader({ section, sortKey, sortDir, onSort }: {
  section: PlayerSection;
  sortKey: PlayerSortKey;
  sortDir: "desc" | "asc";
  onSort: (k: PlayerSortKey) => void;
}) {
  return (
    <div className="players-column-header" style={{
      display: "grid",
      gridTemplateColumns: playerGridTemplate(section),
      minWidth: playerGridMinWidth(section),
      gap: "8px",
      padding: "6px 12px",
      borderBottom: "1px solid #1c140a",
      background: "#f2ecd7",
    }}>
      <div style={{ fontSize: "10px", color: "var(--rule)", textAlign: "right", textTransform: "uppercase", fontWeight: 900 }}>Rank</div>
      <div style={{ fontSize: "10px", color: "var(--rule)", textTransform: "uppercase", fontWeight: 900 }}>Photo</div>
      <div style={{ fontSize: "10px", color: "var(--rule)", textTransform: "uppercase", fontWeight: 900 }}>Player</div>
      <div style={{ fontSize: "10px", color: "var(--rule)", textTransform: "uppercase", fontWeight: 900, textAlign: "center" }}>
        {section === "G" ? "Role" : "Strand"}
      </div>
      {PLAYER_COLUMNS[section].map(({ key, label }) => (
        <SortHeader
          key={key}
          k={key}
          label={label}
          active={sortKey === key}
          dir={sortDir}
          onClick={onSort}
        />
      ))}
      <div />
    </div>
  );
}

function SectionPager({ total, pageSize, page, onPage }: {
  total: number;
  pageSize: number;
  page: number;
  onPage: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  return (
    <div style={{ padding: "10px 12px", borderTop: "1px solid var(--rule-light)", background: "#f2ecd7" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "8px", alignItems: "center" }}>
        <button className="filter-btn" style={{ width: "100%", padding: "8px", fontSize: "11px", letterSpacing: "0.04em" }} disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>
          ‹ Prev
        </button>
        <span style={{ fontSize: "11px", fontWeight: 900, color: "var(--rule)", textTransform: "uppercase", letterSpacing: "0.12em", whiteSpace: "nowrap" }}>
          Page {page} of {pageCount}
        </span>
        <button className="filter-btn" style={{ width: "100%", padding: "8px", fontSize: "11px", letterSpacing: "0.04em" }} disabled={page >= pageCount} onClick={() => onPage(Math.min(pageCount, page + 1))}>
          Next ›
        </button>
      </div>
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
  const [sortKey, setSortKey] = useState<PlayerSortKey>("ppg");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [forwardPage, setForwardPage] = useState(1);
  const [defencePage, setDefencePage] = useState(1);
  const [goaliePage, setGoaliePage] = useState(1);

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
    Promise.all([
      fetch("/api/league/teams").then(r => {
        if (!r.ok) throw new Error(`/api/league/teams returned ${r.status}`);
        return r.json();
      }),
      fetch("/api/league/players").then(r => {
        if (!r.ok) throw new Error(`/api/league/players returned ${r.status}`);
        return r.json();
      }),
    ])
      .then(([td, pd]) => {
        const nextPlayers = (pd.players ?? []).filter((p: Player) => p.position !== "Pick");
        const nextTeams = td.teams ?? [];
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
    setForwardPage(1);
    setDefencePage(1);
    setGoaliePage(1);
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
        case "seasonPts": return compare(seasonPointsOf(a), seasonPointsOf(b));
        case "ppg": return compare(actualPPG(a), actualPPG(b));
        case "pts": return compare(a.ptsPace, b.ptsPace);
        case "toi": return compare(a.avgTOI, b.avgTOI);
        case "ops": return compare(a.ops, b.ops);
        case "dps": return compare(a.dps, b.dps);
        case "age": return compare(a.age, b.age);
        case "cap": return compare(a.capHit, b.capHit);
        case "term": return compare(a.yearsRemaining, b.yearsRemaining);
        case "supp": return compare(suppressionSortValue(a), suppressionSortValue(b));
        default:    return compare(actualPPG(a), actualPPG(b));
      }
    };
    const goalieSort = (a: Player, b: Player): number => {
      const tie = a.name.localeCompare(b.name) || a.teamId.localeCompare(b.teamId) || String(a.id).localeCompare(String(b.id));
      const compare = (av: number | null | undefined, bv: number | null | undefined): number => {
        const aHas = Number.isFinite(av);
        const bHas = Number.isFinite(bv);
        if (!aHas && !bHas) return tie;
        if (!aHas) return 1;
        if (!bHas) return -1;
        return (sortDir === "desc" ? bv! - av! : av! - bv!) || tie;
      };
      if (sortKey === "age") return compare(a.age, b.age);
      if (sortKey === "cap") return compare(a.capHit, b.capHit);
      if (sortKey === "term") return compare(a.yearsRemaining, b.yearsRemaining);
      if (sortKey === "gsax") return compare(a.gsax, b.gsax);
      if (sortKey === "svPct") return compare(a.savePct, b.savePct);
      if (sortKey === "gaa") {
        const aGaa = goalieGaaOf(a);
        const bGaa = goalieGaaOf(b);
        return compare(aGaa == null ? null : -aGaa, bGaa == null ? null : -bGaa);
      }
      if (sortKey === "gp") return compare(goalieGamesOf(a), goalieGamesOf(b));
      return compare(a.gsax, b.gsax);
    };

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
  const pageSlice = <T,>(items: T[], page: number, pageSize: number): T[] =>
    items.slice((page - 1) * pageSize, page * pageSize);
  const visibleForwards = pageSlice(forwards, forwardPage, FORWARD_CAP);
  const visibleDefence = pageSlice(defence, defencePage, DEFENCE_CAP);
  const visibleGoalies = pageSlice(goalies, goaliePage, GOALIE_CAP);
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
                  style={{ fontSize: "11px", letterSpacing: "0.04em" }}
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

      <PlayersIconKey />

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
            {/* Forwards */}
            {showForwards && (
              <div className="section-shell" style={{ border: "1px solid #b8a070", borderTop: "2px solid #1c140a", marginTop: "16px" }}>
                <SectionHeader label="Forwards" count={forwards.length} />
                <SectionColumnHeader section="F" sortKey={sortKey} sortDir={sortDir} onSort={handleSortKey} />
                {visibleForwards.map((p, i) => (
                  <PlayerRow key={`${p.id}::${p.teamId}`} player={p} team={teamMap.get(p.teamId)} rank={(forwardPage - 1) * FORWARD_CAP + i + 1} sortKey={sortKey} actualPPG={actualPPG} section="F" allPlayers={players} />
                ))}
                <SectionPager total={forwards.length} pageSize={FORWARD_CAP} page={forwardPage} onPage={setForwardPage} />
              </div>
            )}

            {/* Defence */}
            {showDefence && (
              <div className="section-shell" style={{ border: "1px solid #b8a070", borderTop: "2px solid #1c140a", marginTop: "16px" }}>
                <SectionHeader label="Defence" count={defence.length} />
                <SectionColumnHeader section="D" sortKey={sortKey} sortDir={sortDir} onSort={handleSortKey} />
                {visibleDefence.map((p, i) => (
                  <PlayerRow key={`${p.id}::${p.teamId}`} player={p} team={teamMap.get(p.teamId)} rank={(defencePage - 1) * DEFENCE_CAP + i + 1} sortKey={sortKey} actualPPG={actualPPG} section="D" allPlayers={players} />
                ))}
                <SectionPager total={defence.length} pageSize={DEFENCE_CAP} page={defencePage} onPage={setDefencePage} />
              </div>
            )}

            {/* Goalies */}
            {showGoalies && (
              <div className="section-shell" style={{ border: "1px solid #b8a070", borderTop: "2px solid #1c140a", marginTop: "16px" }}>
                <SectionHeader label="Goalies" count={goalies.length} />
                <SectionColumnHeader section="G" sortKey={sortKey} sortDir={sortDir} onSort={handleSortKey} />
                {visibleGoalies.map((p, i) => (
                  <PlayerRow key={`${p.id}::${p.teamId}`} player={p} team={teamMap.get(p.teamId)} rank={(goaliePage - 1) * GOALIE_CAP + i + 1} sortKey={sortKey} actualPPG={actualPPG} section="G" allPlayers={players} />
                ))}
                <SectionPager total={goalies.length} pageSize={GOALIE_CAP} page={goaliePage} onPage={setGoaliePage} />
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
