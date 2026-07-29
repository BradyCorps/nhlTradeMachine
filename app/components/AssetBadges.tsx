import React from "react";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import {
  getInjuryRisk,
  getPlayerPedigree,
  getProspectTier,
  getShutdownDPedigree,
} from "@/app/lib/player-data";
import { FRANCHISE } from "@/app/lib/season-config";

const badgeStyle = (color: string, background = "transparent"): React.CSSProperties => ({
  color,
  background,
  border: `1px solid ${color}40`,
});

const iconBadgeStyle = (color: string, background = "transparent"): React.CSSProperties => ({
  color,
  background,
  border: `1px solid ${color}66`,
  minWidth: 18,
  height: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});

// Below this many NHL games, a pace-driven deployment role isn't credible —
// the player reads as UNPROVEN rather than being handed a settled line role.
const MIN_ROLE_SAMPLE_GAMES = 15;

const isForward = (position: string) => ["C", "W", "L", "R", "F"].includes(position);

const wingLabel = (position: string) => position === "C" ? "CENTRE" : "WINGER";

function getGoalieRoleTag(asset: Asset, xnav: XNAVResult): { label: string; color: string; title: string } {
  const starts = asset.gamesStarted ?? asset.games ?? 0;
  const gsax = asset.gsax ?? 0;
  const savePct = asset.savePct ?? 0;
  const eliteSignal = xnav.total >= 100 || gsax >= 10 || savePct >= 0.915;

  if (starts >= 50 && eliteSignal) {
    return {
      label: "ELITE STARTER",
      color: "var(--ledger-ink)",
      title: "Elite starter — full starter workload with high-end xNAV, GSAX, or save-percentage signal.",
    };
  }

  if (starts >= 45 || (starts >= 38 && xnav.total >= 70)) {
    return {
      label: "STARTER",
      color: "var(--ledger-ice)",
      title: "Starter — primary netminder workload with clear No. 1 usage.",
    };
  }

  if (starts >= 32 || xnav.total >= 45) {
    return {
      label: "FRINGE STARTER",
      color: "var(--ledger-green)",
      title: "Fringe starter — between tandem and No. 1 usage, or valued close to starter territory.",
    };
  }

  if (starts >= 20) {
    return {
      label: "TANDEM",
      color: "var(--ledger-brown)",
      title: "Tandem goalie — meaningful split workload without clear full-starter usage.",
    };
  }

  return {
    label: "BACKUP",
    color: "var(--ledger-brown)",
    title: "Backup goalie — limited workload or depth role.",
  };
}

function getRoleTag(asset: Asset, xnav: XNAVResult): { label: string; color: string; title: string } | null {
  if (asset.position === "Pick") return null;
  if (asset.position === "G") return getGoalieRoleTag(asset, xnav);

  const pts = asset.ptsPace ?? 0;
  const toi = asset.avgTOI ?? 0;
  const qocIdx = asset.qocIndex ?? 0;
  const ppPace = asset.ppPtsPace82 ?? 0;
  const pkShare = asset.pkTimeShare ?? 0;
  const tier = xnav.rosterTier ?? asset.rosterTier;
  const posLabel = wingLabel(asset.position);
  const completeForward = isForward(asset.position)
    && pts >= 55
    && (xnav.def >= 12 || qocIdx >= 62 || pkShare >= 0.10)
    && toi >= 17;

  if (asset.position === "D") {
    if (ppPace >= 18 && pts >= 40) {
      return {
        label: "POWERPLAY D",
        color: "var(--ledger-ice)",
        title: "Powerplay defenceman — meaningful production driven by special-teams offense.",
      };
    }
    if (toi >= 22 && pts >= 35) {
      return {
        label: "TOP PAIR D",
        color: "var(--ledger-green)",
        title: "Top-pair defenceman — heavy minutes with enough production to carry first-pair usage.",
      };
    }
    if ((tier === "ELITE_SHUTDOWN" || getShutdownDPedigree(asset.name)) || (pts < 30 && toi >= 19 && qocIdx >= 60)) {
      return {
        label: "SHUTDOWN D",
        color: "var(--ledger-amber)",
        title: `Shutdown defenceman — tough 5v5 deployment (EV QoC ${qocIdx}/100) with defensive usage value.`,
      };
    }
    if (toi >= 18) {
      return {
        label: "SECOND PAIR D",
        color: "var(--ledger-brown)",
        title: "Second-pair defenceman — regular NHL deployment without elite top-pair indicators.",
      };
    }
    return {
      label: "DEPTH D",
      color: "var(--ledger-brown)",
      title: "Depth defenceman — limited deployment.",
    };
  }

  if (!isForward(asset.position)) return null;

  if (xnav.total >= FRANCHISE.threshold) {
    return {
      label: asset.position === "C" ? "1ST LINE CENTRE" : "1ST LINE WINGER",
      color: "var(--ledger-ink)",
      title: "Franchise-level NAV — current valuation supports a first-line role even when current production or minutes are distributed.",
    };
  }

  if (completeForward) {
    return {
      label: "COMPLETE PLAYER",
      color: "var(--ledger-green)",
      title: "Complete player — top-six offense with credible defensive or matchup usage.",
    };
  }

  if (ppPace >= 22 && pts >= 45 && pkShare < 0.08) {
    return {
      label: "POWERPLAY SPECIALIST",
      color: "var(--ledger-ice)",
      title: "Powerplay specialist — a major share of value comes from man-advantage production.",
    };
  }

  if (tier === "ELITE_1ST_LINE") {
    return {
      label: `1ST LINE ${posLabel}`,
      color: "var(--ledger-ink)",
      title: "First-line player — elite normalized production and workload.",
    };
  }

  if (tier === "1ST_LINE_HIGH_2C") {
    return {
      label: asset.position === "C" ? "HIGH-END 2C" : "1ST LINE WINGER",
      color: "var(--ledger-ice)",
      title: "High-end top-six player — first-line winger profile or strong second-line centre profile.",
    };
  }

  if (tier === "FRINGE_1ST_LINE_2C") {
    return {
      label: "FRINGE 1ST LINE",
      color: "var(--ledger-ice)",
      title: "Fringe first-line player — strong top-six production below clear first-line thresholds.",
    };
  }

  if (tier === "ELITE_SHUTDOWN") {
    return {
      label: "ELITE SHUTDOWN",
      color: "var(--ledger-amber)",
      title: "Elite shutdown forward — high EV QoC, defensive-zone deployment, regular EV minutes, and PK leverage.",
    };
  }

  if (tier === "PK_SPECIALIST") {
    return {
      label: "PK SPECIALIST",
      color: "var(--ledger-amber)",
      title: "Penalty-kill specialist — strong short-handed usage without regular top-nine EV minutes.",
    };
  }

  // A thin NHL sample can't support a settled deployment role: a 3-GP call-up
  // whose per-82 pace happens to clear the middle-six bar is not a "2nd line
  // winger" (VAL2). Franchise/elite-tier reads above already fired, so an
  // injured star keeps his status; only unproven pace-driven roles are gated.
  if ((asset.games ?? 0) < MIN_ROLE_SAMPLE_GAMES) {
    return {
      label: "UNPROVEN",
      color: "var(--ledger-brown)",
      title: `Limited NHL sample (${asset.games ?? 0} GP) — not enough to project a settled role.`,
    };
  }

  if (tier === "MIDDLE_SIX" || pts >= 35 || toi >= 14) {
    return {
      label: asset.position === "C" ? "3C / MIDDLE SIX" : "2ND LINE WINGER",
      color: "var(--ledger-brown)",
      title: "Middle-six player — useful NHL production or deployment below clear top-line thresholds.",
    };
  }

  return {
    label: "BOTTOM SIX",
    color: "var(--ledger-brown)",
    title: "Bottom-six player — depth role or limited offensive production.",
  };
}

export function AssetBadges({ asset, xnav }: { asset: Asset; xnav: XNAVResult }) {
  const isPick = asset.position === "Pick";

  // NAV-driven franchise tier — same thresholds the GM audit uses (season-config)
  const isMegalodon = !isPick && xnav.total >= FRANCHISE.megalodon;
  const isFranchise = !isPick && xnav.total >= FRANCHISE.threshold;
  const roleTag = getRoleTag(asset, xnav);

  // Collapse awards to one chip: lead award + "+N" overflow with full list on hover
  const pedigree = getPlayerPedigree(asset.name);
  const prospectTier = getProspectTier(asset.name);
  const injuryRisk = getInjuryRisk(asset.name);
  const shutdownPedigree = getShutdownDPedigree(asset.name);
  const awardList = pedigree?.awards ?? [];
  const awardEntries = Array.from(new Set(awardList)).map(award => ({
    award,
    count: awardList.filter(a => a === award).length,
  }));
  const awardLabel = (e: { award: string; count: number }) =>
    `${e.count > 1 ? `${e.count}× ` : ""}${e.award}`;

  const hasProspectTier = Boolean(prospectTier && !isFranchise);
  const hasInjuryRisk = Boolean(injuryRisk);
  const hasChangeOfScenery = !isPick && xnav.total < -5 && xnav.total > -40 && asset.age <= 32;
  const hasSalaryDump = !isPick && xnav.total <= -40;
  const hasShutdownPedigree = Boolean(shutdownPedigree);
  const hasLedger = asset.tradeBlockStatus === "requested"
    || asset.tradeBlockStatus === "available"
    || awardEntries.length > 0
    || hasProspectTier
    || hasInjuryRisk
    || hasChangeOfScenery
    || hasSalaryDump
    || hasShutdownPedigree;

  return (
    <div className="asset-badges mt-1 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        {isMegalodon && (
          <span className="text-2xs font-black rounded-sm" style={iconBadgeStyle("var(--ledger-amber)", "rgba(138,92,0,0.10)")}
            title={`Megalodon tier — NAV ${xnav.total} ≥ ${FRANCHISE.megalodon}.`}>
            ♛
          </span>
        )}

        {!isMegalodon && isFranchise && (
          <span className="text-2xs font-black rounded-sm" style={iconBadgeStyle("var(--ledger-ink)")}
            title={`Franchise tier — NAV ${xnav.total} ≥ ${FRANCHISE.threshold}.`}>
            ◆
          </span>
        )}

        {!isPick && (() => {
          const effectiveCap = asset.capHit * (1 - (asset.retainedPct || 0));
          const isSurplus = xnav.cap > 0 && xnav.total > effectiveCap * 18 && xnav.total > 50;
          if (!isSurplus) return null;
          return (
            <span className="text-2xs font-black rounded-sm" style={iconBadgeStyle("var(--ledger-green)", "rgba(26,92,46,0.10)")}
              title="Surplus contract — on-ice value significantly exceeds cap hit.">
              ★
            </span>
          );
        })()}

        {roleTag && (
          <span className="text-2xs px-1.5 py-0.5 font-black uppercase rounded-sm"
            style={badgeStyle(roleTag.color)}
            title={roleTag.title}>
            {roleTag.label}
          </span>
        )}
      </div>

      {hasLedger && (
      <div className="flex flex-wrap items-center gap-1 pl-1 border-l" style={{ borderColor: "rgba(107,80,48,0.35)" }}>
      <span className="text-[10px] font-black uppercase text-ledger-ink-faint">Ledger</span>

      {asset.tradeBlockStatus === "requested" && (
        <span className="text-2xs px-1 py-0.5 font-black" style={badgeStyle("var(--ledger-red)", "var(--red-dim)")}
          title={asset.tradeBlockNote ?? "Formal trade request"}>
          REQUESTED
        </span>
      )}

      {asset.tradeBlockStatus === "available" && (
        <span className="text-2xs px-1 py-0.5 font-black" style={badgeStyle("var(--ledger-amber)", "var(--amber-dim)")}
          title={asset.tradeBlockNote ?? "Being shopped"}>
          SHOPPED
        </span>
      )}

      {/* Awards — single chip with overflow count */}
      {awardEntries.length > 0 && (
        <>
          <span className="text-2xs px-1 py-0.5 font-black"
            style={{ color: 'var(--ledger-amber)', border: '1px solid rgba(138,92,0,0.4)' }}
            title={awardEntries.map(awardLabel).join(" · ")}>
            {awardLabel(awardEntries[0])}
          </span>
          {awardEntries.length > 1 && (
            <span className="text-2xs px-1 py-0.5 font-black"
              style={{ color: 'var(--ledger-amber)', border: '1px solid rgba(138,92,0,0.4)' }}
              title={awardEntries.slice(1).map(awardLabel).join(" · ")}>
              +{awardEntries.length - 1}
            </span>
          )}
        </>
      )}

      {/* Prospect tier badge (name-list) — skip when the NAV tier already says franchise */}
      {hasProspectTier && (
        <span className="text-2xs px-1 py-0.5 font-black" style={{
          color: prospectTier!.tier === 1 ? 'var(--ledger-ice)' : prospectTier!.tier === 2 ? 'var(--ledger-green)' : 'var(--ledger-brown)',
          border: `1px solid ${prospectTier!.tier === 1 ? 'rgba(26,46,92,0.4)' : prospectTier!.tier === 2 ? 'rgba(26,92,46,0.4)' : 'rgba(107,80,48,0.4)'}`,
        }}>
          {prospectTier!.tier === 1 ? "★ FRANCHISE" : prospectTier!.tier === 2 ? "◆ TOP PROSPECT" : "◇ PROSPECT"}
        </span>
      )}
      
      {/* Injury risk badge */}
      {hasInjuryRisk && (
        <span className="text-2xs px-1 py-0.5 font-black" style={{
          color: 'var(--ledger-red)',
          border: '1px solid rgba(184,48,32,0.4)'
        }} title={injuryRisk!.note}>
          ⚕ {injuryRisk!.level} RISK
        </span>
      )}

      {/* Change of scenery badge — negative NAV players that might thrive elsewhere */}
      {hasChangeOfScenery && (
        <span className="text-2xs px-1 py-0.5 font-black" style={{
          color: 'var(--ledger-amber)',
          border: '1px solid rgba(138,92,0,0.45)',
        }} title="Negative NAV on current team — may suit a different system or situation. Teams with cap space and the right roster need sometimes absorb these contracts for picks.">
          ⟳ CHANGE OF SCENERY
        </span>
      )}

      {/* Salary dump badge — deeply negative, hard to move */}
      {hasSalaryDump && (
        <span className="text-2xs px-1 py-0.5 font-black" style={{
          color: 'var(--ledger-red)',
          border: '1px solid rgba(184,48,32,0.45)',
        }} title="Deeply negative contract — moving this requires significant salary retention or picks sweetener.">
          ⚠ SALARY DUMP
        </span>
      )}

      {/* Shutdown D pedigree badge */}
      {hasShutdownPedigree && (
        <span className="text-2xs px-1 py-0.5 font-black" style={{
          color: 'var(--ledger-amber)',
          border: '1px solid rgba(138,92,0,0.5)'
        }} title={shutdownPedigree!.note}>
          ★ ELITE SHUTDOWN
        </span>
      )}
      </div>
      )}
    </div>
  );
}
