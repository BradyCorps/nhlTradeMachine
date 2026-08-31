"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withProjectedTrade } from "@/app/lib/cap-horizon";
import { effectiveCapHit } from "@/app/lib/cap-delta";
import { CapHorizon } from "@/app/components/CapHorizon";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import TeamStrand from "@/app/components/TeamStrand";
import type { Asset, Team, TradeVerdict, XNAVResult } from "@/app/lib/trade-types";
import { displayPosition } from "@/app/lib/display-position";
import { computeRosterStrand } from "@/app/lib/roster-strand";
import { deriveTeamPhase, type TeamPhase } from "@/app/armchair-gm/contention";
import { fetchNavMap, fetchTradeVerdict } from "@/app/lib/evaluate-client";
import {
  createTradeSharePayload,
  encodeTradeSharePayload,
  resolveTradeShareAssets,
  type TradeSharePayload,
} from "@/app/lib/trade-share";
import { formatPickRound } from "@/app/lib/trade-format";
import { groupTeamRoster, rosterGroupCount, type RosterGroups } from "@/app/lib/roster-picker";
import { ageDecayRate, ageSlotPenalty, SEASON } from "@/app/lib/season-config";
import MeasuredProfile from "@/app/components/MeasuredProfile";
import StrandDisplay from "@/app/components/StrandDisplay";
import EdgeStrip from "@/app/components/EdgeStrip";
import { buildAssetTraits, computeStrandType, StrandLoading } from "@/app/components/StrandView";
import { useStrandCohort } from "@/app/lib/use-strand-cohort";
import { formatCapHit as fmtCap, fmtSigned } from "@/app/lib/display-utils";
import { DataContextRail } from "@/app/components/DataContextRail";
import type { LeagueProvenance } from "@/app/lib/data-context";
import MetricTip from "@/app/components/MetricTip";
import { HelpPopover } from "@/app/components/HelpPopover";

const ZERO_NAV: XNAVResult = { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };

// A BLOCKED/DECLINED verdict's whole point is explaining why — a HARD flag
// (a CBA veto, a clause block) must never be the one truncated out of view
// behind a pile of merely-informational franchise-comparison notes. The
// share-link builder below already sorted by severity before slicing; the
// live on-screen verdict panel did not, so a real hard veto (DATA-05's
// retention-slot check, live-tested Aug 31 2026) could compute correctly,
// win the top-line BLOCKED message, and still never show its explanation
// card if four lower-priority flags happened to be pushed first.
const GM_FLAG_SEVERITY_RANK: Record<string, number> = { HARD: 0, SOFT: 1, WARN: 2, INFO: 3 };
export function sortFlagsBySeverity<T extends { severity: string }>(flags: T[]): T[] {
  return [...flags].sort((a, b) => (GM_FLAG_SEVERITY_RANK[a.severity] ?? 9) - (GM_FLAG_SEVERITY_RANK[b.severity] ?? 9));
}

type LeagueData = {
  teams: Team[];
  players: Asset[];
  capCeiling?: number | null;
  provenance?: LeagueProvenance | null;
};
type VerdictDisplay = Pick<TradeVerdict, "status" | "message" | "metrics" | "sideOutcomes"> & {
  flags: Array<Pick<TradeVerdict["flags"][number], "severity" | "headline" | "explanation">>;
};
type PackageSummary = {
  cap: number;
  production: number;
  goals: number;
  xg: number;
  noiv: number;
  nav: number;
  count: number;
};

const PHASE_ORDER: TeamPhase[] = ["Tanking", "Rebuilding", "Retooling", "Bubble", "Contender"];
function normalizePhase(raw: string | null | undefined): TeamPhase | null {
  if (!raw) return null;
  const match = PHASE_ORDER.find(p => p.toLowerCase() === raw.toLowerCase());
  return match ?? null;
}
// A team's trade stance follows its window: contenders buy (spend futures for
// now), rebuilders sell (move vets for picks/youth), the middle is flexible.
const PHASE_META: Record<TeamPhase, { stance: string; blurb: string; tone: "good" | "bad" | "neutral" }> = {
  Contender:  { stance: "Buyer",    blurb: "win-now, will spend futures", tone: "good" },
  Bubble:     { stance: "Buyer",    blurb: "pushing to lock a spot",       tone: "good" },
  Retooling:  { stance: "Flexible", blurb: "open to deals both ways",      tone: "neutral" },
  Rebuilding: { stance: "Seller",   blurb: "moving vets for futures",      tone: "bad" },
  Tanking:    { stance: "Seller",   blurb: "selling now, wants picks/youth", tone: "bad" },
};

function TeamWindowBadge({ phase, postPhase }: { phase: TeamPhase | null; postPhase: TeamPhase | null }) {
  if (!phase) return null;
  const meta = PHASE_META[phase];
  const color = meta.tone === "good" ? "var(--ledger-green)" : meta.tone === "bad" ? "var(--ledger-amber)" : "var(--ledger-ice)";
  const shifted = postPhase && postPhase !== phase;
  const climbed = shifted && PHASE_ORDER.indexOf(postPhase!) > PHASE_ORDER.indexOf(phase);
  return (
    <div className="border px-3 py-2 flex items-center justify-between gap-3"
      style={{ borderColor: "var(--ledger-rule-light)", background: "rgba(255,255,255,0.22)" }}>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-[0.18em] text-ledger-ink-faint font-mono">Window</div>
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-black" style={{ color }}>{phase}</span>
          <span className="text-[10px] font-black uppercase tracking-[0.14em] font-mono" style={{ color }}>· {meta.stance}</span>
        </div>
        <div className="text-[10px] leading-tight text-ledger-ink-faint">{meta.blurb}</div>
      </div>
      {shifted && (
        <div className="text-right shrink-0">
          <div className="text-[9px] uppercase tracking-[0.16em] text-ledger-ink-faint font-mono">Post-trade</div>
          <div className="text-[12px] font-black" style={{ color: climbed ? "var(--ledger-green)" : "var(--ledger-red)" }}>
            {climbed ? "▲" : "▼"} {postPhase}
          </div>
        </div>
      )}
    </div>
  );
}

function assetLabel(asset: Asset): string {
  if (asset.position === "Pick") {
    const round = formatPickRound(asset.round);
    return `${asset.year ?? ""} ${round} round pick`;
  }
  return `${asset.name} · ${displayPosition(asset.position, asset.secondaryPosition)} · ${fmtCap(asset.capHit ?? 0)}`;
}

function ErrorNotice({
  onRetry,
  title = "Couldn't load league data",
  detail = "Something went wrong while loading teams and players.",
}: {
  onRetry?: () => void;
  title?: string;
  detail?: string;
}) {
  return (
    <div className="border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      style={{ borderColor: "var(--ledger-red)", color: "var(--ledger-red)", background: "var(--ledger-card-light)" }}>
      <div>
        <div className="text-[12px] font-black uppercase tracking-[0.18em]">{title}</div>
        <div className="mt-1 text-[11px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
          {detail}
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-[0.98]"
          style={{ background: "var(--ledger-ink)", color: "var(--ledger-card-light)", borderRadius: "2px" }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

function TeamSelect({
  label,
  teams,
  value,
  excludeId,
  onChange,
}: {
  label: string;
  teams: Team[];
  value: string;
  excludeId?: string;
  onChange: (teamId: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint">
        {label}
      </span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full border px-3 py-3 text-[13px] font-black uppercase tracking-[0.08em] bg-transparent outline-none"
        style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}
      >
        <option value="">Select team</option>
        {teams.filter(team => team.id !== excludeId).map(team => (
          <option key={team.id} value={team.id}>{team.name}</option>
        ))}
      </select>
    </label>
  );
}

// TM1 — the visual roster grid. Team-first: once a team is picked, its
// roster shows as tappable cards grouped by position (no global alphabetical
// player list, no dropdown). Tapping a card sends the player to the block;
// removing them there returns them here. Fully keyboard-operable.
function RosterCard({ asset, nav, onAdd }: { asset: Asset; nav: XNAVResult; onAdd: (a: Asset) => void }) {
  const isPick = asset.position === "Pick";
  const isGoalie = asset.position === "G";
  const stat = isPick
    ? asset.teamId
    : isGoalie
      ? `${((asset.savePct ?? 0.9) * 100).toFixed(1)} SV%`
      : `${(asset.ptsPace ?? 0).toFixed(0)} P82`;
  const navTone = nav.total > 0 ? "var(--ledger-green)" : nav.total < 0 ? "var(--ledger-red)" : "var(--ledger-ink-faint)";
  return (
    <button
      type="button"
      onClick={() => onAdd({ ...asset, retainedPct: 0 })}
      aria-label={`Add ${isPick ? assetLabel(asset) : asset.name} to the package`}
      className="group text-left border px-2.5 py-2 flex flex-col gap-1 transition-colors hover:bg-[var(--paper-inset)] focus:outline-none focus-visible:ring-2"
      style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-bg)" }}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-black truncate" style={{ color: "var(--ledger-ink)" }}>
          {isPick ? assetLabel(asset) : asset.name}
        </span>
        {!isPick && (
          <span className="text-[10px] font-black font-mono tabular-nums shrink-0" style={{ color: navTone }}>
            {nav.total > 0 ? "+" : ""}{Math.round(nav.total)}
          </span>
        )}
      </span>
      <span className="flex items-center justify-between gap-2 text-[9px] font-mono uppercase tracking-[0.1em] text-ledger-ink-faint">
        <span className="truncate">
          {isPick ? "Draft pick" : `${displayPosition(asset.position, asset.secondaryPosition)} · ${fmtCap(asset.capHit)}`}
        </span>
        <span className="shrink-0" style={{ color: "var(--ledger-ink-body)" }}>{stat}</span>
      </span>
      <span aria-hidden="true" className="text-[8px] font-black uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
        style={{ color: "var(--ledger-red)" }}>
        + Add to block
      </span>
    </button>
  );
}

function RosterGridSection({ heading, assets, navMap, onAdd }: {
  heading: string;
  assets: Asset[];
  navMap: Record<string, XNAVResult>;
  onAdd: (a: Asset) => void;
}) {
  if (assets.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[9px] font-black uppercase tracking-[0.22em] font-mono text-ledger-ink-faint">
        {heading} <span style={{ color: "var(--ledger-ink-body)" }}>({assets.length})</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {assets.map(asset => (
          <RosterCard key={asset.id} asset={asset} nav={navMap[asset.id] ?? ZERO_NAV} onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}

function RosterGridPicker({
  label,
  team,
  assets,
  selected,
  navMap,
  onAdd,
}: {
  label: string;
  team: Team | null;
  assets: Asset[];
  selected: Asset[];
  navMap: Record<string, XNAVResult>;
  onAdd: (asset: Asset) => void;
}) {
  const selectedIds = useMemo(() => new Set(selected.map(a => a.id)), [selected]);
  const groups: RosterGroups = useMemo(
    () => groupTeamRoster(assets, team?.id, selectedIds, a => (navMap[a.id]?.total ?? 0)),
    [assets, team?.id, selectedIds, navMap],
  );
  const total = rosterGroupCount(groups);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint">
        {label}
      </span>
      {!team ? (
        <div className="border px-4 py-8 text-center text-[10px] font-black uppercase tracking-[0.2em] font-mono text-ledger-ink-faint"
          style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
          Select a team to see its roster
        </div>
      ) : total === 0 ? (
        <div className="border px-4 py-8 text-center text-[10px] font-black uppercase tracking-[0.2em] font-mono text-ledger-ink-faint"
          style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
          Whole roster is on the block
        </div>
      ) : (
        <div className="border p-2.5 flex flex-col gap-3 max-h-[320px] overflow-y-auto"
          style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}>
          <RosterGridSection heading="Forwards" assets={groups.forwards} navMap={navMap} onAdd={onAdd} />
          <RosterGridSection heading="Defense" assets={groups.defense} navMap={navMap} onAdd={onAdd} />
          <RosterGridSection heading="Goalies" assets={groups.goalies} navMap={navMap} onAdd={onAdd} />
          <RosterGridSection heading="Draft Capital" assets={groups.picks} navMap={navMap} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}

function AssetRow({
  asset,
  navMap,
  onRemove,
  onRetain,
}: {
  asset: Asset;
  navMap: Record<string, XNAVResult>;
  onRemove?: (assetId: string) => void;
  onRetain?: (assetId: string, retainedPct: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const isPick = asset.position === "Pick";
  const nav = navMap[asset.id] ?? ZERO_NAV;
  const isGoalie = asset.position === "G";
  const { ready: strandReady, cohortFor } = useStrandCohort();
  const traits = !isPick && strandReady ? buildAssetTraits(asset, cohortFor(asset)) : null;
  const strandType = !traits ? "" : isGoalie
    ? "GOALTENDER"
    : computeStrandType(traits.off, traits.def, asset.ops ?? null, asset.dps ?? null);

  // Collapsed subline: position/cap/term, plus a scannable stat chip.
  const subline = isPick
    ? asset.teamId
    : `${displayPosition(asset.position, asset.secondaryPosition)} · ${fmtCap(asset.capHit)} · ${asset.yearsRemaining}yr`;
  const statChip = isPick
    ? null
    : isGoalie
      ? `${((asset.savePct ?? 0.9) * 100).toFixed(1)} SV% · ${(asset.gsax ?? 0) > 0 ? "+" : ""}${(asset.gsax ?? 0).toFixed(1)} GSAx`
      : `${(asset.ptsPace ?? 0).toFixed(0)} pts/82 · ${(asset.avgTOI ?? 0).toFixed(1)} TOI`;

  return (
    <div>
      <div className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => !isPick && setOpen(o => !o)}
          aria-expanded={!isPick ? open : undefined}
          aria-label={isPick ? undefined : `${open ? "Hide" : "Show"} ${asset.name} scouting detail`}
          className="min-w-0 text-left flex items-start gap-2"
          style={{ background: "transparent", cursor: isPick ? "default" : "pointer" }}>
          {!isPick && (
            <span className="text-[11px] mt-0.5 shrink-0" style={{ color: "var(--ledger-ink-faint)" }}>{open ? "▾" : "▸"}</span>
          )}
          <span className="min-w-0">
            <span className="text-[13px] font-black truncate block" style={{ color: "var(--ledger-ink)" }}>
              {isPick ? assetLabel(asset) : asset.name}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-ledger-ink-faint">
              {subline}{statChip ? ` · ${statChip}` : ""}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {!isPick && (
            <MetricTip term="NAV" className="text-[11px] font-black font-mono tabular-nums">
              <span style={{ color: nav.total > 0 ? "var(--ledger-green)" : nav.total < 0 ? "var(--ledger-red)" : "var(--ledger-ink-faint)" }}>
                {nav.total > 0 ? "+" : ""}{Math.round(nav.total)} NAV
              </span>
            </MetricTip>
          )}
          {!isPick && onRetain && (
            <select
              value={Math.round((asset.retainedPct ?? 0) * 100)}
              onChange={event => onRetain(asset.id, Number(event.target.value) / 100)}
              className="border px-2 py-1 text-[10px] font-mono bg-transparent"
              style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}
            >
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(value => (
                <option key={value} value={value}>{value}% retained</option>
              ))}
            </select>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(asset.id)}
              className="border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]"
              style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-red)" }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {open && !isPick && (
        <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2" style={{ background: "var(--paper-inset)" }}>
          <MeasuredProfile asset={asset} />
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
              STRAND{traits ? ` · ${strandType}` : ""}
            </div>
            {traits ? (
              <StrandDisplay
                ariaDescription={`${asset.name} Trade Machine STRAND`}
                offTraits={traits.off}
                defTraits={traits.def}
                ops={asset.ops ?? null}
                dps={asset.dps ?? null}
                strandType={strandType}
                footer={<EdgeStrip asset={asset} heading={false} />}
                W={280}
                H={200}
                amplitude={42}
              />
            ) : (
              <StrandLoading />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AssetList({
  title,
  assets,
  navMap = {},
  onRemove,
  onRetain,
}: {
  title: string;
  assets: Asset[];
  navMap?: Record<string, XNAVResult>;
  onRemove?: (assetId: string) => void;
  onRetain?: (assetId: string, retainedPct: number) => void;
}) {
  return (
    // TM3: fixed height with an internally scrollable list so the block
    // never resizes the page as assets are added.
    <div className="border h-[280px] flex flex-col" style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}>
      <div className="shrink-0 px-4 py-2 border-b flex items-center justify-between text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint"
        style={{ borderColor: "var(--ledger-rule)" }}>
        <span>{title}</span>
        {assets.some(a => a.position !== "Pick") && (
          <span className="text-[9px] tracking-[0.12em]" style={{ color: "var(--ledger-ink-faint)" }}>tap a player for scouting</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "var(--ledger-rule-light)" }}>
        {assets.length === 0 && (
          <div className="px-4 py-10 text-center text-[10px] font-black uppercase tracking-[0.2em] text-ledger-ink-faint">
            No assets selected
          </div>
        )}
        {assets.map(asset => (
          <AssetRow key={asset.id} asset={asset} navMap={navMap} onRemove={onRemove} onRetain={onRetain} />
        ))}
      </div>
      {assets.length > 3 && (
        <div className="shrink-0 border-t px-4 py-1 text-center text-[8px] font-black uppercase tracking-[0.2em] font-mono text-ledger-ink-faint"
          style={{ borderColor: "var(--ledger-rule-light)" }} aria-hidden="true">
          Scroll for {assets.length - 3} more
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-ledger-ink-faint">{label}</div>
      <div className="text-[15px] font-black" style={{ color: "var(--ledger-ink)" }}>{value}</div>
    </div>
  );
}

function summarizePackage(assets: Asset[], navMap: Record<string, XNAVResult>): PackageSummary {
  const players = assets.filter(asset => asset.position !== "Pick");
  // DATA-05: was a fourth independent copy of this formula (xnav-engine,
  // cap-delta.ts, and the unused CapProjection.tsx each had their own) — the
  // exact drift risk the ledger tickets exist to close, even where every
  // copy still agrees today.
  const cap = players.reduce((sum, asset) => sum + effectiveCapHit(asset), 0);
  const production = players.reduce((sum, asset) => sum + (asset.ptsPace ?? 0), 0);
  const goals = players.reduce((sum, asset) => sum + (asset.goalsPace ?? 0), 0);
  const xg = players.reduce((sum, asset) => sum + (asset.xGPace ?? 0), 0);
  const noiv = players.length
    ? players.reduce((sum, asset) => sum + (asset.xgRelTM ?? 0), 0) / players.length
    : 0;
  const picks = assets.filter(asset => asset.position === "Pick");
  const pickValue = picks.reduce((sum, asset) => sum + (navMap[asset.id]?.total ?? 0), 0);
  const sortedPlayers = [...players]
    .map(asset => ({ nav: navMap[asset.id]?.total ?? 0, age: asset.age ?? 27 }))
    .sort((a, b) => b.nav - a.nav);
  const compressedPlayers = sortedPlayers.reduce((sum, asset, index) => {
    const marginalValue = index === 0
      ? asset.nav
      : (asset.nav * Math.pow(ageDecayRate(asset.age), index)) - ageSlotPenalty(asset.age);
    return sum + Math.max(0, marginalValue);
  }, 0);
  const linearNav = assets.reduce((sum, asset) => sum + (navMap[asset.id]?.total ?? 0), 0);
  const compressedNav = pickValue + compressedPlayers;
  const nav = compressedNav > 0 ? compressedNav : linearNav;
  return { cap, production, goals, xg, noiv, nav, count: assets.length };
}


function SummaryMetric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const color = tone === "good"
    ? "var(--ledger-green)"
    : tone === "bad"
      ? "var(--ledger-red)"
      : "var(--ledger-ink)";

  return (
    <div className="border px-3 py-2" style={{ borderColor: "var(--ledger-rule-light)", background: "rgba(255,255,255,0.22)" }}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-ledger-ink-faint font-mono">{label}</div>
      <div className="text-[14px] font-black font-mono" style={{ color }}>{value}</div>
    </div>
  );
}

function TeamTradeSummary({
  label,
  team,
  sends,
  receives,
  navLoading,
}: {
  label: string;
  team: Team | null;
  sends: PackageSummary;
  receives: PackageSummary;
  navLoading: boolean;
}) {
  const currentCap = team?.capSpace ?? 0;
  const projectedCap = team ? currentCap + sends.cap - receives.cap : 0;
  const capDelta = sends.cap - receives.cap;
  const productionDelta = receives.production - sends.production;
  const noivDelta = receives.noiv - sends.noiv;
  const navDelta = receives.nav - sends.nav;
  const capTone = projectedCap >= 0 ? "good" : "bad";

  return (
    <div className="border p-3 flex flex-col gap-3" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
      <div>
        <div className="text-[9px] font-black uppercase tracking-[0.24em] font-mono text-ledger-ink-faint">
          {label}
        </div>
        <div className="text-[16px] font-black" style={{ color: "var(--ledger-ink)" }}>
          {team?.name ?? "Select Team"}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <SummaryMetric label="Current Cap Space" value={team ? fmtCap(currentCap) : "--"} tone={currentCap >= 0 ? "good" : "bad"} />
        <SummaryMetric label="Projected Cap Space" value={team ? fmtCap(projectedCap) : "--"} tone={capTone} />
        <SummaryMetric label="Cap Delta" value={team ? `${fmtSigned(capDelta)}M` : "--"} tone={capDelta >= 0 ? "good" : undefined} />
        <SummaryMetric label="Production" value={`${fmtSigned(productionDelta, 0)} pts/82`} tone={productionDelta >= 0 ? "good" : "bad"} />
        <SummaryMetric label="NOIV" value={sends.count || receives.count ? fmtSigned(noivDelta, 1) : "--"} tone={noivDelta >= 0 ? "good" : "bad"} />
        <SummaryMetric label="Net NAV" value={navLoading ? "Loading" : fmtSigned(navDelta, 1)} tone={navDelta >= 0 ? "good" : "bad"} />
      </div>
    </div>
  );
}

// TM3: the GM Logic Signal lives between Cap in Play and Team STRANDs —
// a league-context strip, not a per-column detail.
function GmLogicSignal({
  homeTeam, partnerTeam, homePhase, homePostPhase, partnerPhase, partnerPostPhase,
}: {
  homeTeam: Team | null;
  partnerTeam: Team | null;
  homePhase: TeamPhase | null;
  homePostPhase: TeamPhase | null;
  partnerPhase: TeamPhase | null;
  partnerPostPhase: TeamPhase | null;
}) {
  if (!homeTeam && !partnerTeam) return null;
  return (
    <section className="border p-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}
      aria-label="GM logic signal — contention window before and after the trade">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint">
        GM Logic Signal
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { team: homeTeam, phase: homePhase, postPhase: homePostPhase },
          { team: partnerTeam, phase: partnerPhase, postPhase: partnerPostPhase },
        ].map((side, i) => side.team && (
          <div key={side.team.id ?? i} className="flex items-center justify-between gap-3 border px-3 py-2"
            style={{ borderColor: "var(--ledger-rule-light)", background: "var(--ledger-cream)" }}>
            <span className="text-[12px] font-black font-mono truncate" style={{ color: "var(--ledger-ink)" }}>
              {side.team.name}
            </span>
            <TeamWindowBadge phase={side.phase} postPhase={side.postPhase} />
          </div>
        ))}
      </div>
    </section>
  );
}

function TradeBalanceStrip({
  outgoing,
  incoming,
  navLoading,
}: {
  outgoing: PackageSummary;
  incoming: PackageSummary;
  navLoading: boolean;
}) {
  const navGap = incoming.nav - outgoing.nav;
  const capMoved = outgoing.cap + incoming.cap;
  const productionMoved = outgoing.production + incoming.production;

  return (
    <section className="border p-4 grid grid-cols-1 md:grid-cols-4 gap-2"
      style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
      <SummaryMetric label="Total Cap In Play" value={fmtCap(capMoved)} />
      <SummaryMetric label="Production In Play" value={`${productionMoved.toFixed(0)} pts/82`} />
      <SummaryMetric label="Package NAV Balance" value={navLoading ? "Loading" : fmtSigned(navGap, 1)} tone={Math.abs(navGap) <= 10 ? "good" : undefined} />
      <SummaryMetric label="GM Audit" value="Required" />
    </section>
  );
}

function VerdictSummary({ verdict }: { verdict: VerdictDisplay }) {
  const statusColor =
    verdict.status === "WIN" || verdict.status === "FAIR" ? "var(--ledger-green)" :
    verdict.status === "LOSS" ? "var(--ledger-amber)" :
    verdict.status === "BLOCKED" || verdict.status === "DECLINED" ? "var(--ledger-red)" :
    "var(--ledger-ink)";

  return (
    <div className="border p-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint">
            Locked Verdict
          </div>
          <div className="text-3xl font-black uppercase italic" style={{ color: statusColor }}>
            {verdict.status}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-right font-mono">
          <Metric label="NAV Out" value={verdict.metrics.navOut.toFixed(1)} />
          <Metric label="NAV In" value={verdict.metrics.navIn.toFixed(1)} />
          <Metric label="Net" value={verdict.metrics.homeNetGain.toFixed(1)} />
          <Metric label="Cap" value={`${verdict.metrics.capDelta.toFixed(1)}M`} />
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-body)" }}>
        {verdict.message}
      </p>
      {verdict.sideOutcomes && verdict.sideOutcomes.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {verdict.sideOutcomes.map(side => {
            const color = side.outcome === "WIN"
              ? "var(--ledger-green)"
              : side.outcome === "LOSS"
                ? "var(--ledger-red)"
                : "var(--ledger-ice)";
            return (
              <div key={`${side.side}-${side.teamId}`} className="border px-3 py-2"
                style={{ borderColor: "var(--ledger-rule-light)", background: "var(--ledger-card)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-ledger-ink-faint">
                      {side.teamName}
                    </div>
                    <div className="text-[15px] font-black uppercase italic" style={{ color }}>
                      {side.outcome === "EVEN" ? "Even" : side.outcome}
                    </div>
                  </div>
                  <div className="text-right text-[10px] font-mono text-ledger-ink-faint">
                    <div>{fmtSigned(side.navNet, 0)} NAV</div>
                    <div>{fmtSigned(side.winsAdded)} W</div>
                    <div>{fmtSigned(side.windowYears)} yr</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {side.drivers.map(driver => (
                    <span key={driver} className="border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]"
                      style={{ borderColor: "var(--ledger-rule-light)", color: "var(--ledger-ink-faint)" }}>
                      {driver}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {verdict.flags.length > 0 && (
        <div className="mt-4 space-y-2">
          {sortFlagsBySeverity(verdict.flags).slice(0, 4).map((flag, index) => (
            <div key={`${flag.headline}-${index}`} className="border px-3 py-2"
              style={{ borderColor: "var(--ledger-rule-light)", background: "var(--ledger-card)" }}>
              <div className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: "var(--ledger-ink)" }}>
                {flag.severity} · {flag.headline}
              </div>
              <div className="text-[11px] leading-relaxed text-ledger-ink-faint">
                {flag.explanation}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamStrandPreview({
  homeTeam,
  partnerTeam,
  homeRoster,
  partnerRoster,
  outgoing,
  incoming,
  navMap,
}: {
  homeTeam: Team | null;
  partnerTeam: Team | null;
  homeRoster: Asset[];
  partnerRoster: Asset[];
  outgoing: Asset[];
  incoming: Asset[];
  navMap: Record<string, XNAVResult>;
}) {
  const hasActiveTrade = outgoing.length > 0 || incoming.length > 0;
  const effectiveHomeRoster = useMemo(() => {
    const outgoingIds = new Set(outgoing.map(asset => asset.id));
    return [
      ...homeRoster.filter(asset => !outgoingIds.has(asset.id)),
      ...incoming.filter(asset => asset.position !== "Pick"),
    ];
  }, [homeRoster, outgoing, incoming]);
  const effectivePartnerRoster = useMemo(() => {
    const incomingIds = new Set(incoming.map(asset => asset.id));
    return [
      ...partnerRoster.filter(asset => !incomingIds.has(asset.id)),
      ...outgoing.filter(asset => asset.position !== "Pick"),
    ];
  }, [partnerRoster, incoming, outgoing]);

  const homeStrand = useMemo(() => computeRosterStrand(effectiveHomeRoster, navMap), [effectiveHomeRoster, navMap]);
  const partnerStrand = useMemo(() => computeRosterStrand(effectivePartnerRoster, navMap), [effectivePartnerRoster, navMap]);
  const preTradeHomeStrand = useMemo(() => hasActiveTrade ? computeRosterStrand(homeRoster, navMap) : null, [hasActiveTrade, homeRoster, navMap]);
  const preTradePartnerStrand = useMemo(() => hasActiveTrade ? computeRosterStrand(partnerRoster, navMap) : null, [hasActiveTrade, partnerRoster, navMap]);

  // TM3: goaltending metric — a goalie acquisition must read as a crease
  // change, never as only an OFF/DEF skater decline. Stable GSAx (same
  // 0.4/0.6 blend EWA uses) summed across each roster's goalies.
  const creaseGsax = (roster: Asset[]) =>
    roster.filter(p => p.position === "G").reduce((sum, g) => {
      const stable = g.baselineGsax != null && g.baselineGsax !== 0
        ? (g.gsax ?? 0) * 0.4 + g.baselineGsax * 0.6
        : (g.gsax ?? 0);
      return sum + stable;
    }, 0);
  const homeCrease = { pre: creaseGsax(homeRoster), post: creaseGsax(effectiveHomeRoster) };
  const partnerCrease = { pre: creaseGsax(partnerRoster), post: creaseGsax(effectivePartnerRoster) };

  if (!homeTeam || !partnerTeam || !homeStrand || !partnerStrand) return null;

  const CreaseLine = ({ crease }: { crease: { pre: number; post: number } }) => {
    const delta = crease.post - crease.pre;
    const deltaColor = delta > 0.5 ? "var(--ledger-green)" : delta < -0.5 ? "var(--ledger-red)" : "var(--ledger-ink-body)";
    return (
      <div className="mt-2 flex items-center justify-between border-t pt-2"
        style={{ borderColor: "var(--ledger-rule-light)" }}>
        <HelpPopover label="Crease GSAx" definition="Team goaltending — stable goals saved above expected, summed across the roster’s goalies.">
          Crease GSAx
        </HelpPopover>
        <span className="text-[11px] font-black font-mono" style={{ fontVariantNumeric: "tabular-nums", color: "var(--ledger-ink)" }}>
          {hasActiveTrade ? (
            <>
              {crease.pre.toFixed(1)} → {crease.post.toFixed(1)}{" "}
              <span style={{ color: deltaColor }}>({delta > 0 ? "+" : ""}{delta.toFixed(1)})</span>
            </>
          ) : crease.pre.toFixed(1)}
        </span>
      </div>
    );
  };

  return (
    <section className="border p-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint">
          Team Strands
        </div>
        {hasActiveTrade && (
          <div className="text-[9px] font-black uppercase tracking-[0.18em] font-mono" style={{ color: "var(--ledger-brown)" }}>
            Pre/Post Delta
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border p-3" style={{ borderColor: "var(--ledger-rule-light)", background: "var(--ledger-cream)" }}>
          <TeamStrand
            strand={homeStrand}
            teamName={homeTeam.name}
            label={hasActiveTrade ? "Post-trade" : undefined}
            compare={preTradeHomeStrand ?? undefined}
          />
          <CreaseLine crease={homeCrease} />
        </div>
        <div className="border p-3" style={{ borderColor: "var(--ledger-rule-light)", background: "var(--ledger-cream)" }}>
          <TeamStrand
            strand={partnerStrand}
            teamName={partnerTeam.name}
            label={hasActiveTrade ? "Post-trade" : undefined}
            compare={preTradePartnerStrand ?? undefined}
          />
          <CreaseLine crease={partnerCrease} />
        </div>
      </div>
    </section>
  );
}

export function SharedTradeView({ code }: { code: string }) {
  const [payload, setPayload] = useState<TradeSharePayload | null>(null);
  const [data, setData] = useState<LeagueData>({ teams: [], players: [] });
  const [error, setError] = useState<string | null>(null);
  const [navMap, setNavMap] = useState<Record<string, XNAVResult>>({});
  const navRunRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    import("@/app/lib/trade-share")
      .then(({ decodeTradeSharePayload }) => {
        if (mounted) setPayload(decodeTradeSharePayload(code));
      })
      .catch(() => {
        if (mounted) setError("This trade link could not be decoded.");
      });
    return () => { mounted = false; };
  }, [code]);

  const loadSharedLeagueData = useCallback(() => {
    setError(null);
    Promise.all([
      fetch("/api/league/teams").then(response => {
        if (!response.ok) throw new Error(`/api/league/teams returned ${response.status}`);
        return response.json();
      }),
      fetch("/api/league/players").then(response => {
        if (!response.ok) throw new Error(`/api/league/players returned ${response.status}`);
        return response.json();
      }),
    ])
      .then(([teamData, playerData]) => {
        setData({
          teams: teamData.teams ?? [],
          players: [...(playerData.players ?? []), ...(teamData.picks ?? [])],
          capCeiling: teamData.capCeiling ?? null,
          provenance: playerData.provenance ?? teamData.provenance ?? null,
        });
      })
      .catch(event => {
        console.error("[quick shared league load]", event);
        setError("Couldn't load league data");
      });
  }, []);

  useEffect(() => {
    loadSharedLeagueData();
  }, [loadSharedLeagueData]);

  const homeTeam = payload ? data.teams.find(team => team.id === payload.teams.homeTeamId) ?? null : null;
  const partnerTeam = payload ? data.teams.find(team => team.id === payload.teams.partnerTeamId) ?? null : null;
  const outgoing = useMemo(() => payload ? resolveTradeShareAssets(payload.blocks.outgoing, data.players) : [], [payload, data.players]);
  const incoming = useMemo(() => payload ? resolveTradeShareAssets(payload.blocks.incoming, data.players) : [], [payload, data.players]);

  useEffect(() => {
    const assets = [...outgoing, ...incoming];
    if (assets.length === 0) {
      setNavMap({});
      return;
    }
    const ctrl = new AbortController();
    const runId = ++navRunRef.current;
    fetchNavMap(assets, ctrl.signal, data.capCeiling)
      .then(nextMap => {
        if (ctrl.signal.aborted || runId !== navRunRef.current) return;
        setNavMap(nextMap);
      })
      .catch(event => {
        if (event.name !== "AbortError") console.error("[quick shared NAV]", event);
      });
    return () => ctrl.abort();
  }, [outgoing, incoming, data.capCeiling]);

  return (
    <main className="min-h-screen font-serif antialiased" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <div className="relative w-full max-w-5xl mx-auto px-4 lg:px-6 py-6 lg:py-8 flex flex-col gap-5">
        <Header activeTab="trade" />
        <DataContextRail route="trade" provenance={data.provenance} capCeiling={data.capCeiling} />
        <section className="border p-5 sm:p-6" style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono text-ledger-ink-faint">
            Shared Trade
          </div>
          <h1 className="mt-1 text-3xl sm:text-4xl font-black leading-none" style={{ color: "var(--ledger-ink)" }}>
            {homeTeam && partnerTeam ? `${homeTeam.name} / ${partnerTeam.name}` : "Reconstructing Trade"}
          </h1>
          {payload && (
            <p className="mt-3 text-[12px] font-mono uppercase tracking-[0.12em] text-ledger-ink-faint">
              Created {new Date(payload.createdAt).toLocaleDateString()} · Verdict locked at creation
            </p>
          )}
        </section>

        {error && (error === "Couldn't load league data"
          ? <ErrorNotice onRetry={loadSharedLeagueData} />
          : <ErrorNotice title="This trade link couldn't be opened" detail="The shared trade link is invalid or expired." />)}

        {payload && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AssetList title={`${homeTeam?.name ?? payload.teams.homeTeamId} sends`} assets={outgoing} navMap={navMap} />
              <AssetList title={`${partnerTeam?.name ?? payload.teams.partnerTeamId} sends`} assets={incoming} navMap={navMap} />
            </div>
            {payload.lockedVerdict && <VerdictSummary verdict={payload.lockedVerdict} />}
          </>
        )}
        <Footer />
      </div>
    </main>
  );
}

export default function QuickTradeMachine() {
  const [data, setData] = useState<LeagueData>({ teams: [], players: [] });
  const [booting, setBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [shareFeedback, setShareFeedback] = useState<"" | "copied" | "error">("");
  const [error, setError] = useState<string | null>(null);
  const [homeTeamId, setHomeTeamId] = useState("");
  const [partnerTeamId, setPartnerTeamId] = useState("");
  const [mobileSide, setMobileSide] = useState<"A" | "B">("A");
  const [outgoing, setOutgoing] = useState<Asset[]>([]);
  const [incoming, setIncoming] = useState<Asset[]>([]);
  const [verdict, setVerdict] = useState<TradeVerdict | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [navMap, setNavMap] = useState<Record<string, XNAVResult>>({});
  const [navLoading, setNavLoading] = useState(false);
  const [rosterNavMap, setRosterNavMap] = useState<Record<string, XNAVResult>>({});
  const navRunRef = useRef(0);
  const rosterNavRunRef = useRef(0);
  const verdictRunRef = useRef(0);
  const verdictAbortRef = useRef<AbortController | null>(null);

  const loadTradeMachineData = useCallback(() => {
    setBooting(true);
    setError(null);
    setBootProgress(8);
    Promise.all([
      fetch("/api/league/teams").then(response => {
        if (!response.ok) throw new Error(`/api/league/teams returned ${response.status}`);
        setBootProgress(prev => Math.max(prev, 45));
        return response.json();
      }),
      fetch("/api/league/players").then(response => {
        if (!response.ok) throw new Error(`/api/league/players returned ${response.status}`);
        setBootProgress(prev => Math.max(prev, 80));
        return response.json();
      }),
    ])
      .then(([teamData, playerData]) => {
        setBootProgress(100);
        const nextData = {
          teams: teamData.teams ?? [],
          players: [...(playerData.players ?? []), ...(teamData.picks ?? [])],
          capCeiling: teamData.capCeiling ?? null,
          provenance: playerData.provenance ?? teamData.provenance ?? null,
        };
        if (!Array.isArray(nextData.teams) || !Array.isArray(nextData.players) || nextData.teams.length === 0 || nextData.players.length === 0) {
          throw new Error("league API returned invalid data");
        }
        setData(nextData);
        setBooting(false);
      })
      .catch(event => {
        console.error("[quick trade load]", event);
        setError("Couldn't load league data");
        setBooting(false);
      });
  }, []);

  useEffect(() => {
    loadTradeMachineData();
  }, [loadTradeMachineData]);

  const homeTeam = data.teams.find(team => team.id === homeTeamId) ?? null;
  const partnerTeam = data.teams.find(team => team.id === partnerTeamId) ?? null;
  const allHomeRoster = useMemo(() => data.players.filter(player => player.teamId === homeTeamId), [data.players, homeTeamId]);
  const allPartnerRoster = useMemo(() => data.players.filter(player => player.teamId === partnerTeamId), [data.players, partnerTeamId]);
  const canEvaluate = Boolean(homeTeam && partnerTeam && (outgoing.length || incoming.length));
  const selectedAssets = useMemo(() => [...outgoing, ...incoming], [outgoing, incoming]);
  const outgoingSummary = useMemo(() => summarizePackage(outgoing, navMap), [outgoing, navMap]);
  const incomingSummary = useMemo(() => summarizePackage(incoming, navMap), [incoming, navMap]);

  // Live contention window per team — falls back to the seed phase when the
  // roster lacks enough valued players to judge (deriveTeamPhase returns null).
  const fullNav = useMemo(() => ({ ...rosterNavMap, ...navMap }), [rosterNavMap, navMap]);
  const hasActiveTrade = outgoing.length > 0 || incoming.length > 0;
  const effHomeRoster = useMemo(() => {
    const outIds = new Set(outgoing.map(a => a.id));
    return [...allHomeRoster.filter(a => !outIds.has(a.id)), ...incoming.filter(a => a.position !== "Pick")];
  }, [allHomeRoster, outgoing, incoming]);
  const effPartnerRoster = useMemo(() => {
    const inIds = new Set(incoming.map(a => a.id));
    return [...allPartnerRoster.filter(a => !inIds.has(a.id)), ...outgoing.filter(a => a.position !== "Pick")];
  }, [allPartnerRoster, incoming, outgoing]);
  // Post-trade commitments by season. A cap delta cannot separate a one-year
  // rental from five years of term; this can.
  const seasonStartYear = parseInt(SEASON.label.slice(0, 4), 10);
  const homeHorizon = useMemo(
    () => homeTeam
      ? withProjectedTrade(data.players, {
          teamId: homeTeam.id, startYear: seasonStartYear,
          incoming, outgoing,
        })
      : [],
    [data.players, homeTeam, incoming, outgoing, seasonStartYear],
  );
  const partnerHorizon = useMemo(
    () => partnerTeam
      ? withProjectedTrade(data.players, {
          teamId: partnerTeam.id, startYear: seasonStartYear,
          // Mirrored: what the home team sends is what the partner receives.
          incoming: outgoing, outgoing: incoming,
        })
      : [],
    [data.players, partnerTeam, incoming, outgoing, seasonStartYear],
  );

  const homePhase = useMemo(() => deriveTeamPhase(allHomeRoster, fullNav) ?? normalizePhase(homeTeam?.phase), [allHomeRoster, fullNav, homeTeam?.phase]);
  const partnerPhase = useMemo(() => deriveTeamPhase(allPartnerRoster, fullNav) ?? normalizePhase(partnerTeam?.phase), [allPartnerRoster, fullNav, partnerTeam?.phase]);
  const homePostPhase = useMemo(() => hasActiveTrade ? (deriveTeamPhase(effHomeRoster, fullNav) ?? homePhase) : null, [hasActiveTrade, effHomeRoster, fullNav, homePhase]);
  const partnerPostPhase = useMemo(() => hasActiveTrade ? (deriveTeamPhase(effPartnerRoster, fullNav) ?? partnerPhase) : null, [hasActiveTrade, effPartnerRoster, fullNav, partnerPhase]);

  useEffect(() => {
    if (selectedAssets.length === 0) {
      setNavMap({});
      setNavLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const runId = ++navRunRef.current;
    setNavLoading(true);
    fetchNavMap(selectedAssets, ctrl.signal, data.capCeiling)
      .then(nextMap => {
        if (ctrl.signal.aborted || runId !== navRunRef.current) return;
        setNavMap(nextMap);
      })
      .catch(event => {
        if (event.name !== "AbortError") {
          console.error("[quick trade NAV]", event);
          setError("Couldn't load player values. Try again in a moment.");
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setNavLoading(false);
      });
    return () => ctrl.abort();
  }, [selectedAssets, data.capCeiling]);

  // Full-roster NAV for both selected teams — powers the live contention
  // window / buyer-seller read (deriveTeamPhase needs the whole roster valued,
  // not just the package). Runs once per team pairing, independent of the deal.
  useEffect(() => {
    const roster = [...allHomeRoster, ...allPartnerRoster].filter(p => p.position !== "Pick");
    if (roster.length === 0) {
      setRosterNavMap({});
      return;
    }
    const ctrl = new AbortController();
    const runId = ++rosterNavRunRef.current;
    fetchNavMap(roster, ctrl.signal, data.capCeiling)
      .then(nextMap => {
        if (ctrl.signal.aborted || runId !== rosterNavRunRef.current) return;
        setRosterNavMap(nextMap);
      })
      .catch(event => {
        if (event.name !== "AbortError") console.error("[quick trade roster NAV]", event);
      });
    return () => ctrl.abort();
  }, [allHomeRoster, allPartnerRoster, data.capCeiling]);

  useEffect(() => {
    verdictAbortRef.current?.abort();
    verdictRunRef.current += 1;
    setVerdict(null);
    setShareUrl("");
    // The audit was cancelled and nothing restarts it here — clear the
    // in-flight flag too, or the button stays stuck on "Auditing" forever
    // (the aborted request's finally deliberately won't reset it).
    setEvaluating(false);
  }, [outgoing, incoming]);

  useEffect(() => () => verdictAbortRef.current?.abort(), []);

  useEffect(() => {
    setOutgoing([]);
    setVerdict(null);
    setShareUrl("");
  }, [homeTeamId]);

  useEffect(() => {
    setIncoming([]);
    setVerdict(null);
    setShareUrl("");
  }, [partnerTeamId]);

  const runVerdict = async () => {
    if (!homeTeam || !partnerTeam || !canEvaluate) return;
    verdictAbortRef.current?.abort();
    const ctrl = new AbortController();
    verdictAbortRef.current = ctrl;
    const runId = ++verdictRunRef.current;
    const outgoingSnapshot = outgoing;
    const incomingSnapshot = incoming;
    setEvaluating(true);
    setError(null);
    setShareUrl("");
    try {
      const nextVerdict = await fetchTradeVerdict(
        outgoingSnapshot,
        incomingSnapshot,
        homeTeam,
        partnerTeam,
        allHomeRoster,
        allPartnerRoster,
        ctrl.signal,
        data.capCeiling,
      );
      if (ctrl.signal.aborted || runId !== verdictRunRef.current) return;
      setVerdict(nextVerdict);
    } catch (event: any) {
      if (event.name !== "AbortError") {
        console.error("[quick trade audit]", event);
        setError("Couldn't run the trade audit. Try again in a moment.");
      }
    } finally {
      if (!ctrl.signal.aborted && runId === verdictRunRef.current) setEvaluating(false);
    }
  };

  const createShare = () => {
    if (!homeTeam || !partnerTeam || !verdict) return;
    setShareFeedback("");
    try {
      // Slim the verdict for the URL: keep the ruling and the flags that
      // decide it, trim long-form prose so the link survives Discord,
      // Reddit, and proxy URL limits.
      const slimVerdict = {
        ...verdict,
        message: (verdict.message ?? "").slice(0, 500),
        flags: sortFlagsBySeverity(verdict.flags ?? [])
          .slice(0, 8)
          .map((f: any) => ({ ...f, explanation: (f.explanation ?? "").slice(0, 300) })),
      };
      const payload = createTradeSharePayload({
        homeTeam,
        partnerTeam,
        outgoing,
        incoming,
        verdict: slimVerdict,
        mode: "trade-machine",
        season: SEASON.label,
      });
      const code = encodeTradeSharePayload(payload);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setShareUrl(`${origin}/t/${code}`);
    } catch (event) {
      console.error("[quick trade share]", event);
      setShareUrl("");
      setError("Couldn't build the share link — re-run the GM Audit and try again.");
    }
  };

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareFeedback("copied");
      setTimeout(() => setShareFeedback(""), 2500);
    } catch {
      setShareFeedback("error");
    }
  };

  return (
    <main className="min-h-screen font-serif antialiased" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <div className="relative w-full max-w-6xl mx-auto px-4 lg:px-6 pt-6 pb-36 lg:py-8 flex flex-col gap-5">
        <Header activeTab="trade" />

        <DataContextRail route="trade" provenance={data.provenance} capCeiling={data.capCeiling} />

        <section className="border p-5 sm:p-6" style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono text-ledger-ink-faint">
            The Trade Desk
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-black leading-none" style={{ color: "var(--ledger-ink)" }}>
            NHL Trade Machine
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--ledger-ink-body)" }}>
            <strong>Put a deal on the record.</strong> The X-NAV engine prices both packages, the GM Audit
            rules on whether the deal survives a real front office, and the locked verdict
            becomes a share link built for the group-chat debate.
          </p>
          <ol className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2" aria-label="How the trade desk works">
            {[
              ["1", "Build", "Pick two teams and stack the packages — retention included."],
              ["2", "Audit", "Run the GM Audit: cap, clauses, calibre, fit, and window."],
              ["3", "Share", "Lock the verdict into a link that replays the whole case."],
            ].map(([num, label, desc]) => (
              <li key={label} className="border px-3 py-2.5 flex items-start gap-2.5"
                style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
                <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center border font-mono text-[11px] font-black"
                  style={{ borderColor: "var(--ledger-ink)", color: "var(--ledger-red)" }} aria-hidden="true">
                  {num}
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--ledger-ink)" }}>{label}</span>
                  <span className="block text-[11px] leading-snug mt-0.5" style={{ color: "var(--ledger-ink-body)" }}>{desc}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {error && (
          <ErrorNotice
            title={error}
            detail={error === "Couldn't load league data"
              ? "Something went wrong while loading teams and players."
              : "The technical details were logged. You can try the action again."}
            onRetry={error === "Couldn't load league data" ? loadTradeMachineData : undefined}
          />
        )}

        {booting ? (
          <div className="border p-8" role="status" aria-live="polite"
            style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
            <div className="text-center text-[11px] font-black uppercase tracking-[0.25em] font-mono" style={{ color: "var(--ledger-ink)" }}>
              Setting the trade desk — {bootProgress < 45 ? "team ledgers" : bootProgress < 80 ? "player & EDGE data" : "final assembly"}
            </div>
            <div className="mt-4 mx-auto max-w-md h-[10px] border relative overflow-hidden"
              role="progressbar" aria-valuenow={bootProgress} aria-valuemin={0} aria-valuemax={100}
              style={{ borderColor: "var(--ledger-ink)", background: "var(--paper-bg)" }}>
              <div className="h-full transition-all duration-500"
                style={{ width: `${bootProgress}%`, background: "var(--ledger-red)", opacity: 0.75 }} />
            </div>
            <div className="mt-1.5 text-center text-[10px] font-black font-mono" style={{ color: "var(--ledger-ink-body)", fontVariantNumeric: "tabular-nums" }}>
              {bootProgress}%
            </div>
          </div>
        ) : (
          <>
            <div
              className="grid grid-cols-2 border lg:hidden"
              role="group"
              aria-label="Choose trade team"
              style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}
            >
              <button
                id="trade-team-a-tab"
                type="button"
                aria-controls="trade-team-a"
                aria-pressed={mobileSide === "A"}
                onClick={() => setMobileSide("A")}
                className="min-h-11 border-r px-3 py-2.5 text-left font-mono"
                style={{
                  borderColor: "var(--ledger-rule)",
                  background: mobileSide === "A" ? "var(--ledger-warm)" : "transparent",
                  color: mobileSide === "A" ? "var(--ledger-red)" : "var(--ledger-ink-body)",
                }}
              >
                <span className="block text-[9px] font-black uppercase tracking-[0.2em]">Team A</span>
                <span className="mt-0.5 block truncate text-[11px] font-black">{homeTeam?.name ?? "Choose team"}</span>
              </button>
              <button
                id="trade-team-b-tab"
                type="button"
                aria-controls="trade-team-b"
                aria-pressed={mobileSide === "B"}
                onClick={() => setMobileSide("B")}
                className="min-h-11 px-3 py-2.5 text-left font-mono"
                style={{
                  background: mobileSide === "B" ? "var(--ledger-warm)" : "transparent",
                  color: mobileSide === "B" ? "var(--ledger-red)" : "var(--ledger-ink-body)",
                }}
              >
                <span className="block text-[9px] font-black uppercase tracking-[0.2em]">Team B</span>
                <span className="mt-0.5 block truncate text-[11px] font-black">{partnerTeam?.name ?? "Choose team"}</span>
              </button>
            </div>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div
                id="trade-team-a"
                role="region"
                aria-labelledby="trade-team-a-tab"
                className={`${mobileSide === "A" ? "flex" : "hidden"} border p-4 flex-col gap-4 lg:flex`}
                style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card-light)" }}
              >
                <TeamSelect label="Team sending assets" teams={data.teams} value={homeTeamId} excludeId={partnerTeamId} onChange={setHomeTeamId} />
                <RosterGridPicker label="Tap a player to add" team={homeTeam} assets={data.players} selected={outgoing} navMap={rosterNavMap} onAdd={asset => setOutgoing(prev => [...prev, asset])} />
                <AssetList
                  title={homeTeam ? `${homeTeam.name} sends` : "Outgoing package"}
                  assets={outgoing}
                  navMap={navMap}
                  onRemove={assetId => setOutgoing(prev => prev.filter(asset => asset.id !== assetId))}
                  onRetain={(assetId, retainedPct) => setOutgoing(prev => prev.map(asset => asset.id === assetId ? { ...asset, retainedPct } : asset))}
                />
                <TeamTradeSummary
                  label="Team cap and production"
                  team={homeTeam}
                  sends={outgoingSummary}
                  receives={incomingSummary}
                  navLoading={navLoading}
                />
              </div>
              <div
                id="trade-team-b"
                role="region"
                aria-labelledby="trade-team-b-tab"
                className={`${mobileSide === "B" ? "flex" : "hidden"} border p-4 flex-col gap-4 lg:flex`}
                style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card-light)" }}
              >
                <TeamSelect label="Team sending return" teams={data.teams} value={partnerTeamId} excludeId={homeTeamId} onChange={setPartnerTeamId} />
                <RosterGridPicker label="Tap a player to add" team={partnerTeam} assets={data.players} selected={incoming} navMap={rosterNavMap} onAdd={asset => setIncoming(prev => [...prev, asset])} />
                <AssetList
                  title={partnerTeam ? `${partnerTeam.name} sends` : "Incoming package"}
                  assets={incoming}
                  navMap={navMap}
                  onRemove={assetId => setIncoming(prev => prev.filter(asset => asset.id !== assetId))}
                  onRetain={(assetId, retainedPct) => setIncoming(prev => prev.map(asset => asset.id === assetId ? { ...asset, retainedPct } : asset))}
                />
                <TeamTradeSummary
                  label="Team cap and production"
                  team={partnerTeam}
                  sends={incomingSummary}
                  receives={outgoingSummary}
                  navLoading={navLoading}
                />
              </div>
            </section>

            <TradeBalanceStrip outgoing={outgoingSummary} incoming={incomingSummary} navLoading={navLoading} />

            {(homeTeam || partnerTeam) && (
              <section className="grid gap-3 md:grid-cols-2">
                {homeTeam && (
                  <CapHorizon
                    title={`${homeTeam.name} — Cap Horizon`}
                    horizon={homeHorizon}
                    projectionLabel={outgoing.length || incoming.length ? "this trade" : null}
                  />
                )}
                {partnerTeam && (
                  <CapHorizon
                    title={`${partnerTeam.name} — Cap Horizon`}
                    horizon={partnerHorizon}
                    projectionLabel={outgoing.length || incoming.length ? "this trade" : null}
                  />
                )}
              </section>
            )}

            <GmLogicSignal
              homeTeam={homeTeam}
              partnerTeam={partnerTeam}
              homePhase={homePhase}
              homePostPhase={homePostPhase}
              partnerPhase={partnerPhase}
              partnerPostPhase={partnerPostPhase}
            />

            <TeamStrandPreview
              homeTeam={homeTeam}
              partnerTeam={partnerTeam}
              homeRoster={allHomeRoster}
              partnerRoster={allPartnerRoster}
              outgoing={outgoing}
              incoming={incoming}
              navMap={fullNav}
            />

            <section className="border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
              <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-ledger-ink-faint">
                {canEvaluate ? "Ready for GM Audit" : "Select two teams and at least one asset"}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={!canEvaluate || evaluating}
                  onClick={runVerdict}
                  className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.22em] font-mono disabled:opacity-40"
                  style={{ background: "var(--ledger-red)", color: "white" }}
                >
                  {evaluating ? "Auditing" : "Run GM Audit"}
                </button>
                <button
                  type="button"
                  disabled={!verdict}
                  onClick={createShare}
                  className="border px-5 py-3 text-[10px] font-black uppercase tracking-[0.22em] font-mono disabled:opacity-40"
                  style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-brown)", background: "var(--ledger-warm)" }}
                >
                  Generate Share Link
                </button>
              </div>
            </section>

            {verdict && <VerdictSummary verdict={verdict} />}

            {shareUrl && (
              <section className="border p-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}>
                <div className="text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint">
                  Share Link
                </div>
                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    aria-label="Locked verdict share link"
                    onFocus={e => e.currentTarget.select()}
                    className="flex-1 min-w-0 border px-3 py-3 text-[11px] font-mono bg-transparent"
                    style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}
                  />
                  <button
                    type="button"
                    onClick={copyShareUrl}
                    aria-label="Copy share link to clipboard"
                    className="border px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] font-mono"
                    style={{
                      borderColor: shareFeedback === "copied" ? "var(--ledger-green)" : "var(--ledger-rule)",
                      color: shareFeedback === "copied" ? "var(--ledger-green)" : "var(--ledger-brown)",
                      background: "var(--ledger-warm)",
                    }}
                  >
                    {shareFeedback === "copied" ? "Copied ✓" : shareFeedback === "error" ? "Select & copy" : "Copy"}
                  </button>
                </div>
              </section>
            )}

            <section
              className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none lg:hidden"
              aria-label="Mobile trade package summary"
            >
              <div
                className="pointer-events-auto mx-auto max-w-6xl border px-3 py-2.5 shadow-[0_-8px_24px_rgba(28,22,18,0.16)]"
                style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}
              >
                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 font-mono">
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-black uppercase tracking-[0.16em] text-ledger-ink-faint">
                      A · {homeTeam?.id ?? "Team A"}
                    </div>
                    <div className="mt-0.5 text-[12px] font-black" style={{ color: "var(--ledger-ink)" }}>
                      {outgoing.length} {outgoing.length === 1 ? "asset" : "assets"} out
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-black uppercase tracking-[0.16em] text-ledger-ink-faint">
                      B · {partnerTeam?.id ?? "Team B"}
                    </div>
                    <div className="mt-0.5 text-[12px] font-black" style={{ color: "var(--ledger-ink)" }}>
                      {incoming.length} {incoming.length === 1 ? "asset" : "assets"} out
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-ledger-ink-faint">A net NAV</div>
                    <div className="mt-0.5 text-[12px] font-black tabular-nums" style={{ color: "var(--ledger-ink)" }}>
                      {navLoading ? "Loading" : fmtSigned(incomingSummary.nav - outgoingSummary.nav, 1)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canEvaluate || evaluating}
                  onClick={runVerdict}
                  className="mt-2 min-h-11 w-full px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.22em] font-mono disabled:opacity-40"
                  style={{ background: "var(--ledger-red)", color: "white" }}
                >
                  {evaluating ? "Auditing" : "Run Audit"}
                </button>
              </div>
            </section>
          </>
        )}

        <Footer />
      </div>
    </main>
  );
}
