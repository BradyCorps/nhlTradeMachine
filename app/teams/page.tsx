"use client";

import React, { useState, useEffect, useMemo } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { calcNAV } from "@/app/lib/xnav-engine";
import { computeContention } from "@/app/armchair-gm/contention";
import { computeTeamEdgeProfile, type TeamEdgeProfile } from "@/app/lib/team-edge-profile";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";

interface TeamData {
  id: string;
  name: string;
  capSpace: number;
  standing: number;
  phase: string;
}

type SortKey = "standing" | "present" | "future" | "rosterNAV" | "capSpace" | "speed" | "name";

const PHASE_ORDER: Record<string, number> = {
  Contender: 1, Bubble: 2, Retooling: 3, Rebuilding: 4, Tanking: 5,
};

const PHASE_COLOR: Record<string, string> = {
  Contender: "var(--ledger-green)",
  Bubble: "var(--ledger-amber)",
  Retooling: "var(--ledger-ink-faint)",
  Rebuilding: "var(--ledger-red)",
  Tanking: "var(--ledger-red)",
};

const QUADRANT_LABEL: Record<string, string> = {
  WIN_NOW: "Win Now",
  WINDOW_OPEN: "Window Open",
  WINDOW_OPENING: "Window Opening",
  REBUILDING: "Rebuilding",
};

interface TeamProfile {
  team: TeamData;
  roster: Asset[];
  navMap: Record<string, XNAVResult>;
  contention: ReturnType<typeof computeContention>;
  edge: TeamEdgeProfile | null;
  rosterNAV: number;
  topPlayers: { name: string; nav: number; position: string }[];
  capCommitted: number;
}

function PhaseChip({ phase }: { phase: string }) {
  return (
    <span
      className="inline-block text-[9px] font-black uppercase tracking-[0.12em] px-1.5 py-0.5 border font-mono"
      style={{
        color: PHASE_COLOR[phase] ?? "var(--ledger-ink-faint)",
        borderColor: PHASE_COLOR[phase] ?? "var(--ledger-rule)",
        background: "transparent",
      }}
    >
      {phase}
    </span>
  );
}

function StatCell({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className="text-[8px] font-black uppercase tracking-[0.15em] font-mono"
        style={{ color: "var(--ledger-ink-faint)" }}
      >
        {label}
      </div>
      <div
        className="text-[18px] font-black font-mono leading-tight"
        style={{ color: tone ?? "var(--ledger-ink)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="text-[9px] font-mono leading-tight"
          style={{ color: "var(--ledger-ink-faint)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function EdgeMini({ profile }: { profile: TeamEdgeProfile | null }) {
  if (!profile) {
    return (
      <div
        className="text-[9px] font-mono uppercase tracking-[0.1em] py-2 text-center"
        style={{ color: "var(--ledger-ink-faint)", border: "1px dashed var(--ledger-rule)" }}
      >
        No EDGE sample
      </div>
    );
  }
  const pct = (v: number | null, d = 1) => v == null ? "-" : `${(v * 100).toFixed(d)}%`;
  const num = (v: number | null, d = 1) => v == null ? "-" : v.toFixed(d);

  return (
    <div className="grid grid-cols-4 gap-2">
      {[
        { l: "OZ Time", v: pct(profile.ozPct), good: profile.ozPct != null && profile.ozPct > 0.45 },
        { l: "Top Speed", v: `${num(profile.avgSpeedMaxMph)} mph`, good: profile.avgSpeedMaxMph != null && profile.avgSpeedMaxMph > 22.2 },
        { l: "20+ Bursts", v: num(profile.burstsOver20PerPlayer, 0), good: profile.burstsOver20PerPlayer != null && profile.burstsOver20PerPlayer > 120 },
        { l: "HD Finish", v: pct(profile.hdFinishingDelta), good: profile.hdFinishingDelta != null && profile.hdFinishingDelta > 0 },
      ].map(({ l, v, good }) => (
        <div key={l} className="min-w-0">
          <div className="text-[8px] font-black uppercase tracking-[0.1em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
            {l}
          </div>
          <div
            className="text-[13px] font-black font-mono"
            style={{ color: good ? "var(--ledger-green)" : "var(--ledger-red)", fontVariantNumeric: "tabular-nums" }}
          >
            {v}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamCard({ profile, expanded, onToggle }: {
  profile: TeamProfile;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { team, contention, edge, rosterNAV, topPlayers, capCommitted } = profile;
  const capCeiling = 104;

  return (
    <div
      className="border font-mono"
      style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card)" }}
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3 cursor-pointer"
        style={{ background: "transparent", border: "none", color: "inherit" }}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-black uppercase tracking-[0.08em]" style={{ color: "var(--ledger-ink)" }}>
              {team.name}
            </span>
            <PhaseChip phase={team.phase} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: "var(--ledger-ink-faint)", fontVariantNumeric: "tabular-nums" }}>
            <span>#{team.standing}</span>
            <span>Present {contention.present.toFixed(1)}</span>
            <span>Future {contention.future.toFixed(1)}</span>
            <span>NAV {Math.round(rosterNAV)}</span>
            <span>Cap ${team.capSpace > 0 ? "+" : ""}{team.capSpace.toFixed(1)}M</span>
          </div>
        </div>

        {/* Contention bars */}
        <div className="hidden sm:flex items-end gap-1 shrink-0" style={{ width: 60, height: 32 }}>
          <div className="flex flex-col items-center gap-0.5 flex-1">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${Math.max(2, contention.present * 3)}px`,
                background: "var(--ledger-green)",
                opacity: 0.8,
              }}
            />
            <span className="text-[7px] font-black" style={{ color: "var(--ledger-ink-faint)" }}>P</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 flex-1">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${Math.max(2, contention.future * 3)}px`,
                background: "var(--ledger-navy, #334155)",
                opacity: 0.8,
              }}
            />
            <span className="text-[7px] font-black" style={{ color: "var(--ledger-ink-faint)" }}>F</span>
          </div>
        </div>

        <span className="text-[10px] shrink-0" style={{ color: "var(--ledger-ink-faint)" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
          {/* Contention + Cap */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3">
            <StatCell
              label="Present"
              value={contention.present.toFixed(1)}
              sub={contention.presentLabel}
              tone={contention.present >= 6.5 ? "var(--ledger-green)" : contention.present >= 4 ? "var(--ledger-amber)" : "var(--ledger-red)"}
            />
            <StatCell
              label="Future"
              value={contention.future.toFixed(1)}
              sub={contention.futureLabel}
              tone={contention.future >= 6 ? "var(--ledger-green)" : contention.future >= 4 ? "var(--ledger-amber)" : "var(--ledger-red)"}
            />
            <StatCell
              label="Window"
              value={QUADRANT_LABEL[contention.quadrant] ?? contention.quadrant}
            />
            <StatCell
              label="Roster NAV"
              value={Math.round(rosterNAV).toLocaleString()}
              sub={`top 10 skaters + starter`}
            />
          </div>

          {/* Cap situation */}
          <div className="py-2 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
            <div className="text-[9px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: "var(--ledger-ink-faint)" }}>
              Cap Situation
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: "var(--ledger-rule)" }}>
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${Math.min(100, Math.max(0, (capCommitted / capCeiling) * 100))}%`,
                    background: capCommitted > capCeiling ? "var(--ledger-red)" : "var(--ledger-green)",
                    opacity: 0.7,
                  }}
                />
              </div>
              <span
                className="text-[10px] font-black font-mono shrink-0"
                style={{
                  color: team.capSpace < 0 ? "var(--ledger-red)" : "var(--ledger-green)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ${team.capSpace > 0 ? "+" : ""}{team.capSpace.toFixed(1)}M
              </span>
            </div>
            <div className="text-[9px] font-mono" style={{ color: "var(--ledger-ink-faint)", fontVariantNumeric: "tabular-nums" }}>
              ${capCommitted.toFixed(1)}M committed of ${capCeiling}M ceiling
            </div>
          </div>

          {/* EDGE Profile */}
          <div className="py-2 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-black uppercase tracking-[0.15em]" style={{ color: "var(--ledger-ink-faint)" }}>
                EDGE Profile
              </span>
              {edge && (
                <span className="text-[8px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                  {edge.sampleSize} players sampled
                </span>
              )}
            </div>
            <EdgeMini profile={edge} />
          </div>

          {/* Top Players */}
          <div className="py-2 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
            <div className="text-[9px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: "var(--ledger-ink-faint)" }}>
              Top Roster Assets by NAV
            </div>
            <div className="space-y-1">
              {topPlayers.map((p, i) => (
                <div key={p.name} className="flex items-center gap-2 text-[11px]">
                  <span className="text-[9px] font-black w-4 text-right" style={{ color: "var(--ledger-ink-faint)" }}>
                    {i + 1}
                  </span>
                  <span className="font-black flex-1 truncate" style={{ color: "var(--ledger-ink)" }}>
                    {p.name}
                  </span>
                  <span className="text-[9px] font-black uppercase" style={{ color: "var(--ledger-ink-faint)" }}>
                    {p.position}
                  </span>
                  <span
                    className="text-[11px] font-black font-mono w-12 text-right"
                    style={{
                      color: p.nav >= 0 ? "var(--ledger-green)" : "var(--ledger-red)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {p.nav > 0 ? "+" : ""}{Math.round(p.nav)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [players, setPlayers] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("standing");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterPhase, setFilterPhase] = useState<string>("ALL");

  useEffect(() => {
    fetch("/api/league")
      .then((r) => r.json())
      .then((data) => {
        setTeams(data.teams ?? []);
        setPlayers(data.players ?? []);
      })
      .catch((err) => console.error("Failed to load league data:", err))
      .finally(() => setLoading(false));
  }, []);

  const navMap = useMemo(() => {
    const map: Record<string, XNAVResult> = {};
    for (const p of players) {
      if (p.position === "Pick") continue;
      try {
        map[p.id] = calcNAV(p as Parameters<typeof calcNAV>[0]) as unknown as XNAVResult;
      } catch {
        // skip players that fail NAV calc
      }
    }
    return map;
  }, [players]);

  const teamProfiles = useMemo((): TeamProfile[] => {
    return teams.map((team) => {
      const roster = players.filter((p) => p.teamId === team.id && p.position !== "Pick");
      const contention = computeContention(roster, navMap);
      const edge = computeTeamEdgeProfile(roster);
      const rosterNAV = roster.reduce((s, p) => s + Math.max(0, navMap[p.id]?.total ?? 0), 0);
      const capCommitted = roster.reduce((s, p) => s + (p.capHit ?? 0), 0);

      const sorted = roster
        .map((p) => ({ name: p.name, nav: navMap[p.id]?.total ?? 0, position: p.position }))
        .sort((a, b) => b.nav - a.nav)
        .slice(0, 8);

      return { team, roster, navMap, contention, edge, rosterNAV, topPlayers: sorted, capCommitted };
    });
  }, [teams, players, navMap]);

  const filtered = useMemo(() => {
    let list = teamProfiles;
    if (filterPhase !== "ALL") {
      list = list.filter((tp) => tp.team.phase === filterPhase);
    }
    list.sort((a, b) => {
      switch (sortKey) {
        case "standing": return a.team.standing - b.team.standing;
        case "present": return b.contention.present - a.contention.present;
        case "future": return b.contention.future - a.contention.future;
        case "rosterNAV": return b.rosterNAV - a.rosterNAV;
        case "capSpace": return b.team.capSpace - a.team.capSpace;
        case "speed": return (b.edge?.avgSpeedMaxMph ?? 0) - (a.edge?.avgSpeedMaxMph ?? 0);
        case "name": return a.team.name.localeCompare(b.team.name);
        default: return 0;
      }
    });
    return list;
  }, [teamProfiles, sortKey, filterPhase]);

  const phaseGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tp of teamProfiles) {
      counts[tp.team.phase] = (counts[tp.team.phase] ?? 0) + 1;
    }
    return counts;
  }, [teamProfiles]);

  if (loading) {
    return (
      <main className="min-h-screen font-mono" style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)" }}>
        <div className="mx-auto max-w-6xl px-4 py-12 text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.3em] animate-pulse">
            Loading Team Analytics&hellip;
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen font-mono" style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)" }}>
      <div className="mx-auto max-w-5xl px-4 pt-5 pb-8">
        <Header activeTab="teams" />

        {/* Page header */}
        <div className="mt-6 mb-5 border-b pb-4" style={{ borderColor: "var(--ledger-rule)" }}>
          <h2
            className="text-[11px] font-black uppercase tracking-[0.28em] font-mono"
            style={{ color: "var(--ledger-ink)" }}
          >
            Team Analytics
          </h2>
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--ledger-ink-faint)" }}>
            All 32 franchises — contention window, EDGE profile, roster strength, and cap situation.
            Contention ratings are derived from live X-NAV across the top 6 forwards, 3 defensemen, and starting goalie.
          </p>
        </div>

        {/* League overview strip */}
        <div
          className="grid grid-cols-5 gap-2 mb-5 p-3 border"
          style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}
        >
          {["Contender", "Bubble", "Retooling", "Rebuilding", "Tanking"].map((phase) => (
            <button
              key={phase}
              onClick={() => setFilterPhase(filterPhase === phase ? "ALL" : phase)}
              className="text-center cursor-pointer p-1"
              style={{
                background: filterPhase === phase ? "var(--paper-card)" : "transparent",
                border: filterPhase === phase ? "1px solid var(--ledger-rule)" : "1px solid transparent",
                color: "inherit",
              }}
            >
              <div
                className="text-[16px] font-black font-mono"
                style={{ color: PHASE_COLOR[phase], fontVariantNumeric: "tabular-nums" }}
              >
                {phaseGroups[phase] ?? 0}
              </div>
              <div className="text-[8px] font-black uppercase tracking-[0.1em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                {phase}
              </div>
            </button>
          ))}
        </div>

        {/* Sort controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[9px] font-black uppercase tracking-[0.15em]" style={{ color: "var(--ledger-ink-faint)" }}>
            Sort by
          </span>
          {([
            ["standing", "Rank"],
            ["present", "Present"],
            ["future", "Future"],
            ["rosterNAV", "NAV"],
            ["capSpace", "Cap Space"],
            ["speed", "Speed"],
            ["name", "Name"],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className="text-[10px] font-black uppercase tracking-[0.1em] px-2 py-1 cursor-pointer font-mono"
              style={{
                background: sortKey === key ? "var(--ledger-ink)" : "transparent",
                color: sortKey === key ? "var(--paper-bg)" : "var(--ledger-ink-faint)",
                border: `1px solid ${sortKey === key ? "var(--ledger-ink)" : "var(--ledger-rule)"}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Team cards */}
        <div className="space-y-2">
          {filtered.map((tp) => (
            <TeamCard
              key={tp.team.id}
              profile={tp}
              expanded={expandedId === tp.team.id}
              onToggle={() => setExpandedId(expandedId === tp.team.id ? null : tp.team.id)}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div
            className="text-center py-8 text-[11px] font-mono"
            style={{ color: "var(--ledger-ink-faint)" }}
          >
            No teams match the current filter.
          </div>
        )}

        <Footer />
      </div>
    </main>
  );
}
