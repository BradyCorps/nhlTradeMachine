"use client";
import PlayerTimeline from "@/app/components/PlayerTimeline";
import { PlayerOutlook } from "@/app/components/PlayerOutlook";
import { TierIcon } from "@/app/components/GravityField";
import { gravityTierColor } from "@/app/lib/gravity";
import { gravityForDisplay } from "@/app/lib/gravity-channels";
import type { DevelopmentProfile } from "@/app/lib/development-profile";
import {
  getInjuryRisk,
  getPlayerPedigree,
  getProspectTier,
  getShutdownDPedigree,
} from "@/app/lib/player-data";
import { FRANCHISE, SEASON } from "@/app/lib/season-config";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import { derivePlayerRoles } from "@/app/lib/player-roles";
import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import PercentileCard from "@/app/components/PercentileCard";
import { PlayerAvatar } from "@/app/components/PlayerAvatar";
import { displayPosition } from "@/app/lib/display-position";
import { orderFreshInk, signedAav, signedRecency, signedTerm } from "@/app/lib/fresh-ink";
import { buildStrandCohort } from "@/app/lib/strand-cohort";
import { buildStrandPercentiles, type PlayerLike } from "@/app/lib/strand-metrics";

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
  baselineXgRel?: number | null;
  baselineIxg82?: number | null;
  ppPtsPace82?: number | null;
  pairDriverScore?: number | null;
  pkTimeShare?: number | null;
  xgRelTM?: number | null;
  xgaRelTM?: number | null;
  dzPct?: number | null;
  defRate?: number | null;
  goalsPace?: number | null;
  assistsPace?: number | null;
  plusMinus?: number | null;
  capHit: number;
  capCeiling?: number;
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

// ── Mini STRAND — paired OFF/DEF dots on a shared 0–100 track ──
// Replaces the old twin-sine "wave", which mapped a percentile to a wobble
// amplitude nobody could read a value off. `offV`/`defV` are the mean of the
// off / def rail percentiles (0–1) — the SAME percentiles the dossier draws,
// against the same same-position ≥20 GP cohort — so the row and the dossier read
// off one derivation. Two stacked tracks share the 0–100 x-scale, so OFF (blue)
// and DEF (red) are directly comparable and never collide. A dot is drawn only
// when its value is measured; a missing rail leaves the track empty (no faked
// midpoint).
function MiniHelix({ offV, defV }: {
  offV: number | null; defV: number | null;
}) {
  const W = 80, H = 28;
  const x0 = 8, x1 = 72, trackW = x1 - x0;
  const yOff = 9, yDef = 19;
  const xAt = (v: number) => x0 + Math.max(0, Math.min(1, v)) * trackW;
  const track = "var(--rule-light, #ddd2b8)";
  const ring = "var(--paper-bg, #f7f1e1)";
  const o = offV == null ? null : Math.round(offV * 100);
  const d = defV == null ? null : Math.round(defV * 100);
  const label = `STRAND percentile — offense ${o ?? "n/a"}, defense ${d ?? "n/a"}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", margin: "0 auto" }}
      role="img" aria-label={label}>
      <title>{`OFF ${o ?? "—"} · DEF ${d ?? "—"} (percentile vs same-position peers)`}</title>
      {/* midpoint (50) reference */}
      <line x1={x0 + trackW / 2} y1={4} x2={x0 + trackW / 2} y2={H - 4}
        stroke={track} strokeWidth={1} opacity={0.7} />
      {/* two shared-scale tracks */}
      <line x1={x0} y1={yOff} x2={x1} y2={yOff} stroke={track} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={x0} y1={yDef} x2={x1} y2={yDef} stroke={track} strokeWidth={1.5} strokeLinecap="round" />
      {offV != null && (
        <circle cx={xAt(offV)} cy={yOff} r={3.6} fill="var(--blue)" stroke={ring} strokeWidth={1.6} />
      )}
      {defV != null && (
        <circle cx={xAt(defV)} cy={yDef} r={3.6} fill="var(--red)" stroke={ring} strokeWidth={1.6} />
      )}
    </svg>
  );
}

// ── Modern role badge (PA2) — derived identity, not legacy labels ──
function ArchetypeBadge({ player }: { player: Player }) {
  let label = "";
  let icon = "•";
  let color = "var(--ink-faint)";
  let blurb = "";

  const roles = derivePlayerRoles(player);
  if (roles) {
    label = roles.primary.label;
    icon = roles.primary.icon;
    color = roles.primary.color;
    blurb = roles.primary.blurb;
  } else if (player.position === "G") {
    // No role evidence yet — fall back to the workload tier chip
    const tier = goalieTeir(player.gamesStarted ?? 0);
    label = tier;
    icon = tier === "STARTER" ? "G1" : tier === "TANDEM" ? "G2" : "G3";
    color = tier === "STARTER" ? "var(--green)" : tier === "TANDEM" ? "var(--blue)" : "var(--ink-faint)";
  } else {
    return null;
  }

  if (!label) return null;
  const displayLabel = blurb ? `${label} — ${blurb}` : label;

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
  const xnav = useMemo(() => calculateAssetNAV(player), [player]);

  const prospectTier = getProspectTier(player.name);
  const pedigree = getPlayerPedigree(player.name);
  const injuryRisk = getInjuryRisk(player.name);
  const shutdownPedigree = getShutdownDPedigree(player.name);
  const gravProfile = useMemo(() => {
    if (player.position === "G" || (player.games ?? 0) < 10) return null;
    return gravityForDisplay(player as any);
  }, [player]);
  const gravTier = gravProfile?.tier;
  const showGravBadge = gravTier === "SUPERMASSIVE" || gravTier === "STAR";

  const isMegalodon = xnav.total >= FRANCHISE.megalodon;
  const isFranchise = !isMegalodon && xnav.total >= FRANCHISE.threshold;
  const isSurplus = xnav.cap > 0 && xnav.total > player.capHit * 18 && xnav.total > 50;
  const hasAwards = (pedigree?.awards?.length ?? 0) > 0;

  const badges = [
    isMegalodon ? { key: "megalodon", icon: "♛", color: "var(--ledger-amber)", title: `Megalodon tier — NAV ${xnav.total} ≥ ${FRANCHISE.megalodon}.` } : null,
    isFranchise ? { key: "franchise", icon: "◆", color: "var(--ledger-ink)", title: `Franchise tier — NAV ${xnav.total} ≥ ${FRANCHISE.threshold}.` } : null,
    isSurplus ? { key: "surplus", icon: "★", color: "var(--ledger-green)", title: "Surplus contract — on-ice value significantly exceeds cap hit." } : null,
    prospectTier ? { key: "prospect", icon: prospectTier.tier === 1 ? "★" : prospectTier.tier === 2 ? "◆" : "◇", color: prospectTier.tier === 1 ? "var(--ledger-ice)" : prospectTier.tier === 2 ? "var(--ledger-green)" : "var(--ledger-brown)", title: prospectTier.tier === 1 ? "Franchise prospect pedigree." : prospectTier.tier === 2 ? "Top prospect pedigree." : "Prospect pedigree." } : null,
    hasAwards ? { key: "awards", icon: "A", color: "var(--ledger-amber)", title: `Award pedigree — ${Array.from(new Set(pedigree!.awards)).join(" · ")}.` } : null,
    injuryRisk ? { key: "injury", icon: "!", color: "var(--ledger-red)", title: injuryRisk.note } : null,
    shutdownPedigree ? { key: "shutdown", icon: "■", color: "var(--ledger-amber)", title: shutdownPedigree.note } : null,
  ].filter(Boolean) as { key: string; icon: string; color: string; title: string }[];

  if (badges.length === 0 && !showGravBadge) return null;
  return (
    <>
      {showGravBadge && gravTier && (
        <span
          title={`${gravTier === "SUPERMASSIVE" ? "Supermassive" : "Star"} gravity — force ${gravProfile!.force.toFixed(2)}`}
          aria-label={`${gravTier === "SUPERMASSIVE" ? "Supermassive" : "Star"} gravity tier`}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            minWidth: "18px", height: "18px",
            border: `1px solid ${gravityTierColor(gravTier)}`,
            background: "rgba(255,255,255,0.18)",
            padding: "0 2px", flexShrink: 0,
          }}
        >
          <TierIcon tier={gravTier} size={14} />
        </span>
      )}
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
  ["✦", "Gravity", "Supermassive or Star gravity tier — elite gravitational pull."],
  ["♛", "Megalodon", "Extreme franchise-value tier."],
  ["◆", "Franchise", "Franchise-value player or top prospect marker."],
  ["★", "Surplus", "Strong surplus contract, prospect pedigree, or elite pedigree signal."],
  ["◇", "Prospect", "Tracked prospect or depth prospect marker."],
  ["A", "Awards", "Award pedigree on the player record."],
  ["!", "Risk", "Elevated injury or availability risk."],
  ["■", "Shutdown", "Elite shutdown or defensive pedigree signal."],
] as const;

function PlayersIconKey() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: "3px 10px",
          border: "1px solid var(--ledger-rule)",
          background: open ? "var(--paper-card)" : "transparent",
          color: "var(--ledger-ink-faint)",
          fontSize: "9px",
          fontWeight: 900,
          fontFamily: "'Courier Prime', monospace",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: "11px", fontWeight: 900 }}>?</span>
        Icon Key
        <span style={{ fontSize: "8px", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
      </button>
      {open && (
        <div style={{
          border: "1px solid var(--ledger-rule)",
          borderTop: "none",
          background: "var(--paper-card)",
          padding: "8px 10px",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "6px 12px",
          }}>
            {PLAYER_ICON_KEY.map(([icon, label, definition]) => (
              <div key={`${icon}-${label}`} title={definition} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: "6px", alignItems: "center" }}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "18px",
                  height: "18px",
                  border: "1px solid var(--ledger-rule)",
                  color: "var(--ledger-ink)",
                  fontSize: "10px",
                  fontWeight: 900,
                  lineHeight: 1,
                }}>
                  {icon}
                </span>
                <span>
                  <span style={{
                    fontSize: "9px",
                    fontWeight: 900,
                    color: "var(--ledger-ink-light)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}>
                    {label}
                  </span>
                  {" "}
                  <span style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "var(--ledger-ink-faint)",
                  }}>
                    {definition}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Expanded player tab types ─────────────────────────────────
type PlayerTab = "card" | "stats" | "contract" | "outlook";

const PLUM = "var(--fig)";
const PLUM_LIGHT = "var(--fig-bright)";
const PLUM_FAINT = "rgba(83, 46, 59, 0.08)";

function PlayerTabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      role="tab"
      aria-selected={active}
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
  const hasContract = player.yearsRemaining > 0;
  // Deep analytics (STRAND, Player Card, EDGE, Gravity) live on the
  // dedicated dossier at /players/{nhlid} — the index stays light.
  const hasDossier = /^\d+$/.test(String(player.id));

  const tabs: { key: PlayerTab; label: string }[] = [
    { key: "card", label: "Player Card" },
    { key: "stats", label: "Stats" },
    ...(hasContract ? [{ key: "contract" as PlayerTab, label: "Contract" }] : []),
    ...(hasOutlook ? [{ key: "outlook" as PlayerTab, label: "Outlook" }] : []),
  ];

  const [activeTab, setActiveTab] = useState<PlayerTab>("card");

  const gp = player.games ?? 82;
  const seasonGoals = player.goalsPace != null ? Math.round((player.goalsPace / 82) * gp) : null;
  const seasonAssists = player.assistsPace != null ? Math.round((player.assistsPace / 82) * gp) : null;
  const seasonPoints = Math.round((player.ptsPace / 82) * gp);
  const pm = player.plusMinus;
  const statItems: Array<{ label: string; val: string; title?: string; color?: string }> = isG ? [
    { label: "GP",    val: player.gamesStarted?.toString() ?? "—" },
    { label: "GSAx",  val: (player.gsax ?? 0).toFixed(1) },
    { label: "SV%",   val: player.savePct?.toFixed(3) ?? "—" },
    { label: "Tier",  val: goalieTeir(player.gamesStarted ?? 0) },
  ] : [
    { label: "GP",     val: gp.toString() },
    { label: "G",      val: seasonGoals?.toString() ?? "—" },
    { label: "A",      val: seasonAssists?.toString() ?? "—" },
    { label: "PTS",    val: seasonPoints.toString() },
    { label: "+/−",    val: pm != null ? `${pm > 0 ? "+" : ""}${pm}` : "—", color: pm != null ? (pm > 0 ? "var(--ledger-green)" : pm < 0 ? "var(--ledger-red)" : undefined) : undefined },
    { label: "TOI",    val: player.avgTOI.toFixed(1) },
    { label: "xG%+",   val: player.xgRelTM != null ? `${(player.xgRelTM as number) > 0 ? "+" : ""}${(player.xgRelTM as number).toFixed(1)}` : "—" },
    { label: "EDGE HD", val: formatEdgeLuck(player.hdFinishingDelta), title: EDGE_LUCK_TITLE, color: edgeLuckColor(player.hdFinishingDelta) },
  ];

  return (
    <div className="player-expanded-panel" style={{
      background: "#d6c8a5", borderTop: `3px solid ${PLUM}`,
    }}>
      {/* Tab bar */}
      <div role="tablist" style={{
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
        {hasDossier && (
          <a
            href={`/players/${player.id}`}
            className="no-underline"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "10px 14px",
              marginLeft: "auto",
              color: "var(--ledger-red)",
              borderBottom: "2px solid transparent",
            }}
          >
            Advanced Analytics →
          </a>
        )}
      </div>

      {/* Tab content */}
      <div style={{ padding: "14px 16px" }}>

        {/* ── Player Card tab ────────────────────── */}
        {activeTab === "card" && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PercentileCard
              player={player}
              allPlayers={allPlayers}
              teamName={team?.name}
            />
          </div>
        )}

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
              capCeiling: player.capCeiling,
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
              Player Outlook
            </div>
            <PlayerOutlook asset={{ ...player } as any} />
          </div>
        )}
      </div>
    </div>
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

  // Mini-STRAND strengths — the mean of the off / def rail percentiles against
  // the same same-position ≥20 GP cohort the dossier ranks against, so the row
  // shape and the dossier STRAND read one derivation. Skaters only.
  const strandVals = useMemo(() => {
    if (isG) return null;
    const cohort = buildStrandCohort(allPlayers as unknown as Record<string, unknown>[], player);
    if (cohort.length < 10) return null;
    const s = buildStrandPercentiles(player as unknown as PlayerLike, cohort, false);
    const mean = (rs: { val: number }[]) => rs.length ? rs.reduce((a, r) => a + r.val, 0) / rs.length : 0.5;
    return { offV: mean(s.off), defV: mean(s.def) };
  }, [player, allPlayers, isG]);

  // Abbreviated team name for mobile (use teamId which is already short)
  const teamAbbr = player.teamId;

  return (
    <>
      {/* ── Desktop row (≥640px) — original 6-column grid ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(x => !x); } }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${player.name}, ${displayPosition(player.position, player.secondaryPosition)}, age ${player.age}`}
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

        <PlayerAvatar name={player.name} position={player.position} size={32} shape="round"
          playerId={player.id} teamId={player.teamId} headshot={player.headshot} />

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
            ? <MiniHelix offV={strandVals?.offV ?? null} defV={strandVals?.defV ?? null}/>
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

      {/* ── Mobile card (≤639px) — 2-line layout with labelled stats ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(x => !x); } }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${player.name}, ${displayPosition(player.position, player.secondaryPosition)}, age ${player.age}`}
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
          <PlayerAvatar name={player.name} position={player.position} size={36} shape="round"
            playerId={player.id} teamId={player.teamId} headshot={player.headshot} />

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
        {section !== "G" && (
          <div style={{ display: "flex", gap: "7px", justifyContent: "center", marginTop: "2px", fontSize: "8px", fontWeight: 700 }}
            title="Offensive and defensive percentile vs same-position peers (0–100)">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", display: "inline-block" }} />OFF
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", display: "inline-block" }} />DEF
            </span>
          </div>
        )}
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
  const [sortKey, setSortKey] = useState<PlayerSortKey>("seasonPts");
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
        const nextPlayers = (pd.players ?? [])
          .filter((p: Player) => p.position !== "Pick")
          .map((p: Player) => ({ ...p, capCeiling: td.capCeiling }));
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

  // PA8 — the freshest ink, ordered by when it was actually signed (newest
  // first), with an AAV fallback for undated bundle extensions.
  const freshInk = useMemo(() => orderFreshInk(players as any[]), [players]);

  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>

      <Header activeTab="players" />

      {/* ── Hot off the Press — freshest signed extensions (PA8) ── */}
      {freshInk.length > 0 && (
        <section aria-label="Hot off the press — latest contract extensions"
          style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 16px 0" }}>
          <div className="text-[9px] font-black font-mono uppercase tracking-[0.25em] mb-2" style={{ color: "var(--ledger-red)" }}>
            ● Hot Off the Press — Fresh Ink
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
            {freshInk.map(p => {
              // Reads the extension's own numbers while it is still future
              // money, and the live contract once it has taken effect.
              const ext = signedAav(p as any);
              const extYears = signedTerm(p as any);
              const signedAt = (p as any).extensionSignedAt as string | null | undefined;
              const inner = (
                <>
                  <span className="font-mono text-[11px] font-black" style={{ color: "var(--ledger-ink)" }}>{p.name}</span>
                  <span className="font-mono text-[10px] font-bold ml-2" style={{ color: "var(--ledger-ink-body, var(--ledger-ink))" }}>
                    ${ext.toFixed(1)}M{extYears ? ` × ${extYears}yr` : ""} extension
                  </span>
                  {signedAt && (
                    <span className="font-mono text-[9px] font-bold ml-2" style={{ color: "var(--ledger-ink-faint)" }}>
                      · {signedRecency(signedAt)}
                    </span>
                  )}
                </>
              );
              const style: React.CSSProperties = {
                flexShrink: 0, border: "1px solid var(--ledger-rule)", background: "var(--paper-card, #e4d8b8)",
                padding: "7px 12px", whiteSpace: "nowrap", textDecoration: "none",
              };
              return /^\d+$/.test(String(p.id))
                ? <a key={p.id} href={`/players/${p.id}`} style={style}>{inner}</a>
                : <div key={p.id} style={style}>{inner}</div>;
            })}
          </div>
        </section>
      )}

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
              aria-label="Search players by name or team"
              style={{
                fontSize: "11px",
                padding: "7px 12px",
                border: "1px solid #b8a070",
                background: "#e4d8b8",
                color: "var(--ledger-ink)",
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
