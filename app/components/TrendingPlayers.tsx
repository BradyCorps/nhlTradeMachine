"use client";
import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { calcNAV } from "@/app/lib/xnav-engine";
import { computeGravity, gravityTierColor } from "@/app/lib/gravity";
import type { GravityTier } from "@/app/lib/gravity";
import { TierIcon } from "@/app/components/GravityField";
import { displayPosition } from "@/app/lib/display-position";

interface PlayerData {
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
  tradeBlockStatus?: string | null;
}

interface TeamData {
  id: string;
  name: string;
}

const TIER_LABEL: Record<GravityTier, string> = {
  SUPERMASSIVE: "Supermassive",
  STAR: "Star",
  MAIN_SEQUENCE: "Main Seq.",
  SATELLITE: "Satellite",
  ASTEROID: "Asteroid",
  BLACK_HOLE: "Black Hole",
};

interface RankedPlayer {
  player: PlayerData;
  nav: number;
  off: number;
  def: number;
  cap: number;
  fmvAav?: number;
  gravityTier?: GravityTier;
  gravityScore?: number;
  teamName: string;
}

export default function TrendingPlayers() {
  const [ranked, setRanked] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);

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

        const results: RankedPlayer[] = players.map(p => {
          const xnav = calcNAV(p as any);
          const grav = computeGravity(p as any);
          return {
            player: p,
            nav: xnav.total,
            off: xnav.off,
            def: xnav.def,
            cap: xnav.cap,
            fmvAav: xnav.fmvAav,
            gravityTier: grav?.tier,
            gravityScore: grav?.force,
            teamName: teamMap.get(p.teamId) ?? p.teamId,
          };
        });

        results.sort((a, b) => b.nav - a.nav);
        setRanked(results.slice(0, 12));
      } catch {
        // silent — homepage still works without trending
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

  if (ranked.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ranked.map((r, i) => (
        <PlayerCard key={r.player.id} rank={i + 1} data={r} />
      ))}
    </div>
  );
}

function PlayerCard({ rank, data }: { rank: number; data: RankedPlayer }) {
  const { player: p, nav, off, def, cap, fmvAav, gravityTier, gravityScore, teamName } = data;
  const gp = p.games ?? 0;
  const goals = p.goalsPace != null ? Math.round((p.goalsPace / 82) * gp) : null;
  const assists = p.assistsPace != null ? Math.round((p.assistsPace / 82) * gp) : null;
  const pts = Math.round((p.ptsPace / 82) * gp);
  const pm = p.plusMinus;
  const pos = displayPosition(p.position, p.secondaryPosition);
  const capStr = p.capHit > 0 ? `$${p.capHit.toFixed(1)}M` : "—";
  const tierColor = gravityTier ? gravityTierColor(gravityTier) : undefined;

  return (
    <Link
      href="/players"
      className="no-underline block border transition-colors hover:border-[var(--ledger-ink-faint)]"
      style={{
        background: "var(--paper-card)",
        borderColor: "var(--ledger-rule)",
      }}
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
        {p.headshot && (
          <img
            src={p.headshot}
            alt=""
            className="rounded-full shrink-0"
            style={{ width: 36, height: 36, border: "1.5px solid var(--ledger-rule)", objectFit: "cover" }}
          />
        )}
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-black leading-tight truncate" style={{ color: "var(--ledger-ink)" }}>
            {p.name}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] leading-snug truncate" style={{ color: "var(--ledger-ink-faint)" }}>
            {teamName} · {pos} · Age {p.age}
          </div>
        </div>
        {/* NAV badge */}
        <div className="ml-auto shrink-0 text-right">
          <div className="font-mono text-[18px] font-black leading-none" style={{ color: "var(--ledger-ink)" }}>
            {nav}
          </div>
          <div className="font-mono text-[8px] uppercase tracking-[0.14em]" style={{ color: "var(--ledger-ink-faint)" }}>
            X-NAV
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3" style={{ height: 1, background: "var(--ledger-rule-light)" }} />

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-0 px-3 py-2">
        {[
          { label: "GP", val: gp.toString() },
          { label: "G", val: goals?.toString() ?? "—" },
          { label: "A", val: assists?.toString() ?? "—" },
          { label: "PTS", val: pts.toString() },
          { label: "+/−", val: pm != null ? `${pm > 0 ? "+" : ""}${pm}` : "—",
            color: pm != null ? (pm > 0 ? "var(--ledger-green)" : pm < 0 ? "var(--ledger-red)" : undefined) : undefined },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="font-mono text-[8px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>
              {s.label}
            </div>
            <div className="font-mono text-[11px] font-black" style={{ color: (s as any).color ?? "var(--ledger-ink)" }}>
              {s.val}
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="mx-3" style={{ height: 1, background: "var(--ledger-rule-light)" }} />

      {/* Bottom row: NAV breakdown + Gravity + Contract */}
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        {/* NAV components */}
        <div className="flex gap-2">
          {[
            { label: "OFF", val: off, color: off > 0 ? "var(--ledger-green)" : "var(--ledger-red)" },
            { label: "DEF", val: def, color: def > 0 ? "var(--ledger-green)" : "var(--ledger-red)" },
            { label: "CAP", val: cap, color: cap > 0 ? "var(--ledger-green)" : "var(--ledger-red)" },
          ].map(c => (
            <div key={c.label} className="text-center">
              <div className="font-mono text-[7px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>
                {c.label}
              </div>
              <div className="font-mono text-[10px] font-black" style={{ color: c.color }}>
                {c.val > 0 ? "+" : ""}{c.val}
              </div>
            </div>
          ))}
        </div>

        {/* Gravity tier */}
        {gravityTier && (
          <div className="flex items-center gap-1.5">
            <TierIcon tier={gravityTier} size={14} />
            <div className="font-mono text-[8px] font-black uppercase tracking-[0.08em]" style={{ color: tierColor }}>
              {TIER_LABEL[gravityTier]}
            </div>
          </div>
        )}

        {/* Cap hit */}
        <div className="text-right shrink-0">
          <div className="font-mono text-[7px] uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>
            CAP HIT
          </div>
          <div className="font-mono text-[10px] font-black" style={{ color: "var(--ledger-ink)" }}>
            {capStr} × {p.yearsRemaining}yr
          </div>
        </div>
      </div>
    </Link>
  );
}
