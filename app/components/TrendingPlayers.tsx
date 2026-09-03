"use client";
import React, { useEffect, useState } from "react";
import { PlayerAvatar } from "@/app/components/PlayerAvatar";
import Link from "next/link";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import { gravityPositionPercentile, gravityTierColor } from "@/app/lib/gravity";
import type { GravityProfile, GravityTier } from "@/app/lib/gravity";
import { gravityForDisplay } from "@/app/lib/gravity-channels";
import { isGravityV3DisplayEnabled } from "@/app/lib/gravity-feature-flags";
import { TierIcon, FieldDiagram } from "@/app/components/GravityField";
import { displayPosition } from "@/app/lib/display-position";
import { seasonTotal } from "@/app/lib/display-utils";
import { buildAssetTraits, computeStrandType, StrandLoading } from "@/app/components/StrandView";
import { useStrandCohort } from "@/app/lib/use-strand-cohort";
import type { XNAVResult } from "@/app/lib/trade-types";
import { contractVerdict, verdictColor, MODEL_PRICE_SHORT } from "@/app/lib/contract-verdict";
import { PLAYER_STATS_CONTEXT, navLabelForPosition } from "@/app/lib/player-terminology";

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
  avgTOI: number;
  games?: number;
  goalsPace?: number | null;
  assistsPace?: number | null;
  plusMinus?: number | null;
  capHit: number;
  yearsRemaining: number;
  ops?: number | null;
  dps?: number | null;
  xgRelTM?: number | null;
  xgaRelTM?: number | null;
  dzPct?: number | null;
  defRate?: number | null;
  hasLiveStats?: boolean;
  gsax?: number;
  savePct?: number;
  gamesStarted?: number;
  shotsPerGame?: number | null;
  baselineGsax?: number | null;
  baselineHdsvPct?: number | null;
  teamXga60?: number | null;
  teamHdca60?: number | null;
  baselinePtsPace?: number | null;
  baselineXgRel?: number | null;
  pkTimeShare?: number | null;
  qocIndex?: number | null;
  hdFinishingDelta?: number | null;
  edgeOzPct?: number | null;
  edgeOzPercentile?: number | null;
  edgeSpeedMaxMph?: number | null;
  edgeBurstsOver20?: number | null;
  baselineIxg82?: number | null;
  baselineHits82?: number | null;
  baselineBlocks82?: number | null;
  pairXgfPct?: number | null;
  pairDriverScore?: number | null;
  ppPtsPace82?: number | null;
  hasNMC?: boolean;
  hasNTC?: boolean;
  draftYear?: number | null;
  draftOverall?: number | null;
  prospectPtsPace?: number | null;
  rosterTier?: string;
  baselineGameScore?: number | null;
  baselineDpsProxy?: number | null;
  tradeBlockStatus?: "requested" | "available" | "blocked" | "untouchable" | null;
}

interface TeamData {
  id: string;
  name: string;
}

const TIER_LABEL: Record<GravityTier, string> = {
  SUPERMASSIVE: "Supermassive",
  STAR: "Star",
  MAIN_SEQUENCE: "Main Sequence",
  SATELLITE: "Satellite",
  ASTEROID: "Asteroid",
  BLACK_HOLE: "Black Hole",
};

interface RankedPlayer {
  player: PlayerData;
  nav: number;
  xnav: XNAVResult;
  gravity: GravityProfile | null;
  gravityPercentile: number | null;
  teamName: string;
}

type SortMode = "nav" | "gravity";
const GRAVITY_DISPLAY_ENABLED = isGravityV3DisplayEnabled();

export default function TrendingPlayers() {
  const [allPlayers, setAllPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("nav");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pd, td] = await Promise.all([
          fetch("/api/league/players").then(r => r.json()),
          fetch("/api/league/teams").then(r => r.json()),
        ]);
        if (cancelled) return;

        const teams: TeamData[] = td.teams ?? [];
        const teamMap = new Map(teams.map(t => [t.id, t.name]));
        const players: PlayerData[] = (pd.players ?? []).filter(
          (p: PlayerData) => p.position !== "Pick" && p.position !== "G" && (p.games ?? 0) >= 20
        );

        const computed = players.map(p => {
          const xnav = calculateAssetNAV(p, td.capCeiling);
          const grav = gravityForDisplay(p as any);
          return {
            player: p,
            nav: xnav.total,
            xnav,
            gravity: grav,
            teamName: teamMap.get(p.teamId) ?? p.teamId,
          };
        });
        const gravityPopulation = computed
          .map(result => result.gravity)
          .filter((profile): profile is GravityProfile => profile !== null);
        const results: RankedPlayer[] = computed.map(result => ({
          ...result,
          gravityPercentile: result.gravity
            ? gravityPositionPercentile(result.gravity, gravityPopulation)
            : null,
        }));

        setAllPlayers(results);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="text-2xs uppercase tracking-[0.2em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
          Loading player data…
        </div>
      </div>
    );
  }

  if (allPlayers.length === 0) return null;

  const ranked = [...allPlayers]
    .sort(sort === "nav"
      ? (a, b) => b.nav - a.nav
      : (a, b) => (
          (b.gravityPercentile ?? -1) - (a.gravityPercentile ?? -1)
          || (b.gravity?.force ?? -1) - (a.gravity?.force ?? -1)
        )
    )
    .slice(0, 10);

  const items: React.ReactNode[] = [];
  for (let i = 0; i < ranked.length; i += 2) {
    const pair = ranked.slice(i, i + 2);
    const expandedInRow = pair.find(r => r.player.id === expanded);

    pair.forEach((r, j) => {
      items.push(
        <PlayerCard
          key={r.player.id}
          rank={i + j + 1}
          data={r}
          sortMode={sort}
          isExpanded={expanded === r.player.id}
          onToggle={() => setExpanded(expanded === r.player.id ? null : r.player.id)}
        />
      );
    });

    if (expandedInRow) {
      items.push(
        <div
          key={`detail-${expandedInRow.player.id}`}
          style={{ gridColumn: "1 / -1" }}
        >
          <ExpandedPanel
            player={expandedInRow.player}
            xnav={expandedInRow.xnav}
            gravity={expandedInRow.gravity}
            teamName={expandedInRow.teamName}
          />
        </div>
      );
    }
  }

  return (
    <div>
      {/* Sort toggle */}
      <div className="flex items-center gap-1 mb-4" role="tablist" aria-label="Sort trending players">
        {([
          { mode: "nav" as SortMode, label: "By NAV" },
          ...(GRAVITY_DISPLAY_ENABLED
            ? [{ mode: "gravity" as SortMode, label: "By Gravity" }]
            : []),
        ]).map(tab => (
          <button
            key={tab.mode}
            role="tab"
            aria-selected={sort === tab.mode}
            onClick={() => { setSort(tab.mode); setExpanded(null); }}
            className="font-mono text-[10px] font-black uppercase tracking-[0.14em] px-3 py-1.5 transition-colors"
            style={{
              color: sort === tab.mode ? "var(--ledger-ink)" : "var(--ledger-ink-faint)",
              background: sort === tab.mode ? "var(--paper-card)" : "transparent",
              border: sort === tab.mode ? "1px solid var(--ledger-rule)" : "1px solid transparent",
            }}
          >
            {tab.mode === "gravity" && <TierIcon tier="SUPERMASSIVE" size={10} />}
            {" "}{tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items}
      </div>
    </div>
  );
}

function PlayerCard({
  rank, data, sortMode, isExpanded, onToggle,
}: {
  rank: number;
  data: RankedPlayer;
  sortMode: SortMode;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { player: p, nav, xnav, gravity, gravityPercentile, teamName } = data;
  const gp = p.games ?? 0;
  const goals = p.goalsPace != null ? seasonTotal(p.goalsPace, gp) : null;
  const assists = p.assistsPace != null ? seasonTotal(p.assistsPace, gp) : null;
  const pts = seasonTotal(p.ptsPace, gp);
  const pm = p.plusMinus;
  const pos = displayPosition(p.position, p.secondaryPosition);
  const capStr = p.capHit > 0 ? `$${p.capHit.toFixed(1)}M` : "—";
  const gravityTier = gravity?.tier;
  const tierColor = gravityTier ? gravityTierColor(gravityTier) : undefined;

  return (
    <div
      className="border transition-colors cursor-pointer"
      style={{
        background: "var(--paper-card)",
        borderColor: isExpanded ? "var(--ledger-ink-faint)" : "var(--ledger-rule)",
      }}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${p.name} player card`}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
    >
      {/* Header: rank + identity */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        <div
          className="flex items-center justify-center font-mono text-[10px] font-black shrink-0"
          style={{
            width: 22, height: 22,
            border: "1.5px solid var(--ledger-rule)",
            color: "var(--ledger-ink-faint)",
          }}
        >
          {rank}
        </div>
        {(
          <PlayerAvatar name={p.name} position={p.position} size={36}
            playerId={p.id} teamId={p.teamId} headshot={p.headshot} />
        )}
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-black leading-tight truncate" style={{ color: "var(--ledger-ink)" }}>
            {p.name}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] leading-snug truncate" style={{ color: "var(--ledger-ink-faint)" }}>
            {teamName} · {pos} · Age {p.age}
          </div>
        </div>
        <div className="ml-auto shrink-0 text-right">
          {sortMode === "gravity" ? (
            <>
              <div className="font-mono text-[18px] font-black leading-none" style={{ color: tierColor ?? "var(--ledger-ink)" }}>
                {gravityPercentile ?? "—"}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: "var(--ledger-ink-faint)" }}>
                {gravityPercentile != null ? "Position pct" : gravity ? "Insufficient" : "Unavailable"}
              </div>
            </>
          ) : (
            <>
              <div className="font-mono text-[18px] font-black leading-none" style={{ color: "var(--ledger-ink)" }}>
                {nav}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: "var(--ledger-ink-faint)" }}>
                {navLabelForPosition(p.position)}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mx-3" style={{ height: 1, background: "var(--ledger-rule-light)" }} />

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-0 px-3 py-2">
        {[
          { label: "GP", val: gp.toString() },
          { label: "G", val: goals?.toString() ?? "—" },
          { label: "A", val: assists?.toString() ?? "—" },
          { label: "PTS", val: pts.toString() },
            { label: "Plus/minus", val: pm != null ? `${pm > 0 ? "+" : ""}${pm}` : "—",
            color: pm != null ? (pm > 0 ? "var(--ledger-green)" : pm < 0 ? "var(--ledger-red)" : undefined) : undefined },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>
              {s.label}
            </div>
            <div className="font-mono text-[12px] font-black" style={{ color: (s as any).color ?? "var(--ledger-ink)" }}>
              {s.val}
            </div>
          </div>
        ))}
      </div>

      <div className="mx-3" style={{ height: 1, background: "var(--ledger-rule-light)" }} />

      {/* Bottom row: NAV breakdown + Gravity + Contract */}
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        <div className="flex gap-2">
          {[
            { label: "OFF", val: xnav.off },
            { label: "DEF", val: xnav.def },
            { label: "CAP", val: xnav.cap },
          ].map(c => (
            <div key={c.label} className="text-center">
              <div className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>
                {c.label}
              </div>
              <div className="font-mono text-[11px] font-black" style={{ color: c.val > 0 ? "var(--ledger-green)" : c.val < 0 ? "var(--ledger-red)" : "var(--ledger-ink)" }}>
                {c.val > 0 ? "+" : ""}{c.val}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {gravityTier && <TierIcon tier={gravityTier} size={14} />}
          <div className="font-mono text-[10px] font-black uppercase tracking-[0.08em]" style={{ color: "var(--ledger-ink-body, var(--ledger-ink))" }}>
            {isExpanded ? "▲ Collapse" : "▼ Expand"}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>
            CAP HIT
          </div>
          <div className="font-mono text-[11px] font-black" style={{ color: "var(--ledger-ink)" }}>
            {capStr} × {p.yearsRemaining}yr
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpandedPanel({
  player: p, xnav, gravity, teamName,
}: {
  player: PlayerData;
  xnav: XNAVResult;
  gravity: GravityProfile | null;
  teamName: string;
}) {
  const { ready: strandReady, cohortFor } = useStrandCohort();
  const traits = strandReady ? buildAssetTraits(p as any, cohortFor(p)) : null;
  const strandType = traits ? computeStrandType(traits.off, traits.def, p.ops ?? null, p.dps ?? null) : "";
  const tierColor = gravity?.tier ? gravityTierColor(gravity.tier) : undefined;
  const pos = displayPosition(p.position, p.secondaryPosition);

  const advancedStats = [
    { label: "PTS/82", val: p.ptsPace.toFixed(1) },
    { label: "xG/82", val: (p.xGPace ?? 0).toFixed(1) },
    { label: "TOI", val: p.avgTOI.toFixed(1) },
    { label: "xG%+", val: p.xgRelTM != null ? `${p.xgRelTM > 0 ? "+" : ""}${p.xgRelTM.toFixed(1)}` : "—" },
    { label: "OPS", val: p.ops != null ? p.ops.toFixed(1) : "—" },
    { label: "DPS", val: p.dps != null ? p.dps.toFixed(1) : "—" },
  ];

  return (
    <div
      className="border px-4 py-4"
      style={{ borderColor: "var(--ledger-ink-faint)", background: "var(--paper-inset)", marginTop: -16 }}
    >
      {/* Player identity bar */}
      <div className="flex items-center gap-3 mb-4 pb-3" style={{ borderBottom: "1px solid var(--ledger-rule)" }}>
        {(
          <PlayerAvatar name={p.name} position={p.position} size={40}
            playerId={p.id} teamId={p.teamId} headshot={p.headshot} />
        )}
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-black leading-tight truncate" style={{ color: "var(--ledger-ink)" }}>
            {p.name}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] leading-snug" style={{ color: "var(--ledger-ink-faint)" }}>
            {teamName} · {pos} · Age {p.age}
          </div>
        </div>
        <div className="ml-auto shrink-0 text-right">
          <div className="font-mono text-[22px] font-black leading-none" style={{ color: "var(--ledger-ink)" }}>
            {xnav.total}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: "var(--ledger-ink-faint)" }}>
            {navLabelForPosition(p.position)}
          </div>
        </div>
      </div>

      <div className="font-mono text-[9px] font-black uppercase tracking-[0.12em] mb-2" style={{ color: "var(--ledger-ink-faint)" }}>
        {PLAYER_STATS_CONTEXT}
      </div>

      {/* Two-column layout: Gravity diagram left, stats right */}
      <div className={`grid gap-5 grid-cols-1 ${gravity ? "md:grid-cols-[minmax(200px,280px)_1fr]" : ""}`}>

        {/* Left: Gravity field diagram */}
        {gravity && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--ledger-ink-faint)" }}>
                Gravity Field
              </div>
              <div className="flex items-center gap-1.5">
                {gravity.tier ? <TierIcon tier={gravity.tier} size={14} /> : null}
                <span className="font-mono text-[9px] font-black uppercase" style={{ color: tierColor }}>
                  {gravity.tier ? TIER_LABEL[gravity.tier] : "Insufficient evidence"}
                </span>
              </div>
            </div>
            <div
              className="border p-2"
              style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-bg)" }}
            >
              <FieldDiagram profile={gravity} />
            </div>
          </div>
        )}

        {/* Right: stats + STRAND + market */}
        <div className="space-y-3 min-w-0">
          {/* Advanced stats */}
          <div>
            <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] mb-1.5" style={{ color: "var(--ledger-ink-faint)" }}>
              Advanced
            </div>
            <div className="grid grid-cols-6 gap-0">
              {advancedStats.map(s => (
                <div key={s.label} className="text-center">
                  <div className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--ledger-ink-faint)" }}>
                    {s.label}
                  </div>
                  <div className="font-mono text-[11px] font-black" style={{ color: "var(--ledger-ink)" }}>
                    {s.val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* STRAND DNA */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--ledger-ink-faint)" }}>
                STRAND DNA
              </div>
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink)" }}>
                {strandType}
              </div>
            </div>
            {!traits ? <StrandLoading height={80} /> : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {[...traits.off, ...traits.def].map(t => (
                <div key={t.label} className="flex items-center gap-2">
                  <div className="font-mono text-[9px] uppercase tracking-[0.06em] w-[46px] shrink-0 text-right" style={{ color: "var(--ledger-ink-faint)" }}>
                    {t.label}
                  </div>
                  <div className="flex-1 h-[5px] relative" style={{ background: "var(--ledger-rule-light)" }}>
                    <div
                      className="absolute left-0 top-0 h-full"
                      style={{
                        width: `${Math.max(2, t.val * 100)}%`,
                        background: t.val > 0.6 ? "var(--ledger-green)" : t.val > 0.35 ? "var(--ledger-ink-faint)" : "var(--ledger-rule)",
                      }}
                    />
                  </div>
                  <div className="font-mono text-[9px] font-black w-[22px] text-right" style={{ color: "var(--ledger-ink)" }}>
                    {t.display ?? Math.round(t.val * 100)}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

          {/* NAV breakdown */}
          <div>
            <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] mb-1.5" style={{ color: "var(--ledger-ink-faint)" }}>
              NAV Components
            </div>
            <div className="grid grid-cols-6 gap-0">
              {[
                { label: "OFF", val: xnav.off },
                { label: "DEF", val: xnav.def },
                { label: "GRAV", val: xnav.grav ?? 0 },
                { label: "AGE", val: xnav.age },
                { label: "CAP", val: xnav.cap },
                { label: "UPS", val: xnav.upside },
              ].map(c => (
                <div key={c.label} className="text-center">
                  <div className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>
                    {c.label}
                  </div>
                  <div className="font-mono text-[12px] font-black" style={{
                    color: c.val > 0 ? "var(--ledger-green)" : c.val < 0 ? "var(--ledger-red)" : "var(--ledger-ink)",
                  }}>
                    {c.val > 0 ? "+" : ""}{c.val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Market value + link */}
          {xnav.fmvAav != null && (
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--ledger-rule-light)" }}>
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>{MODEL_PRICE_SHORT} </span>
                <span className="font-mono text-[11px] font-black" style={{ color: "var(--ledger-ink)" }}>
                  ${xnav.fmvAav.toFixed(1)}M
                </span>
              </div>
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>Surplus </span>
                <span className="font-mono text-[11px] font-black"
                  title={contractVerdict({ fmvAav: xnav.fmvAav, capHit: p.capHit, position: p.position, expiresThisOffseason: p.expiresThisOffseason, lastCapHit: p.lastCapHit }).note}
                  style={{ color: verdictColor(contractVerdict({ fmvAav: xnav.fmvAav, capHit: p.capHit, position: p.position, expiresThisOffseason: p.expiresThisOffseason, lastCapHit: p.lastCapHit }).tone) }}>
                  {(xnav.fmvAav - p.capHit) > 0 ? "+" : ""}${(xnav.fmvAav - p.capHit).toFixed(1)}M
                </span>
              </div>
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>Cap </span>
                <span className="font-mono text-[11px] font-black" style={{ color: "var(--ledger-ink)" }}>
                  ${p.capHit.toFixed(1)}M × {p.yearsRemaining}yr
                </span>
              </div>
              <Link
                href={/^\d+$/.test(String(p.id)) ? `/players/${p.id}` : "/players"}
                className="font-mono text-[9px] font-black uppercase tracking-[0.1em] no-underline hover:underline"
                style={{ color: "var(--ledger-ink-faint)" }}
              >
                {/^\d+$/.test(String(p.id)) ? "Full Profile" : "Player Analytics"} &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
