"use client";

import React, { useState, useEffect, useMemo } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import { computeContention } from "@/app/armchair-gm/contention";
import { computeTeamEdgeProfile, type TeamEdgeProfile } from "@/app/lib/team-edge-profile";
import { computeRosterStrand } from "@/app/lib/roster-strand";
import TeamStrand, { type TeamStrandData } from "@/app/components/TeamStrand";
import { lineupContributionScore } from "@/app/lib/lineup-ranking";
import { displayPosition } from "@/app/lib/display-position";
import {
  gravityPositionPercentile,
  type GravityProfile,
} from "@/app/lib/gravity";
import { gravityForDisplay } from "@/app/lib/gravity-channels";
import { isGravityV3DisplayEnabled } from "@/app/lib/gravity-feature-flags";
import GravityField from "@/app/components/GravityField";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";

interface TeamRecord {
  wins: number;
  losses: number;
  otLosses: number;
  points: number;
  gamesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  powerPlayPct: number;
  penaltyKillPct: number;
  shotsForPerGame: number;
  shotsAgainstPerGame: number;
  faceoffWinPct: number;
  regulationWins: number;
  streakCode: string;
  streakCount: number;
  l10Record: string;
  clinchIndicator: string;
  playoffPosition: string;
}

interface CapBreakdown {
  ltirUsed: number;
  deadCap: number;
  totalCapHit: number;
  bonuses: number;
}

interface TeamData {
  id: string;
  name: string;
  capSpace: number;
  standing: number;
  phase: string;
  division: string;
  conference: string;
  record: TeamRecord | null;
  capBreakdown: CapBreakdown | null;
}

type SortKey = "division" | "standing" | "present" | "future" | "rosterNAV" | "capSpace" | "goalDiff" | "gravity" | "speed" | "name";
const GRAVITY_DISPLAY_ENABLED = isGravityV3DisplayEnabled();

const CONFERENCE_ORDER = ["Eastern", "Western"] as const;
const DIVISION_ORDER: Record<string, string[]> = {
  Eastern: ["Atlantic", "Metro"],
  Western: ["Central", "Pacific"],
};

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

interface LineEntry {
  name: string;
  position: string;
  nav: number;
  capHit: number;
  age: number;
  ptsPace: number;
  avgTOI: number;
}

interface TeamLines {
  forwards: LineEntry[][]; // 4 lines of 3
  defense: LineEntry[][];  // 3 pairs
  goalies: LineEntry[];
}

interface GravityLeader {
  name: string;
  profile: GravityProfile;
  positionPercentile: number;
}

interface TeamProfile {
  team: TeamData;
  roster: Asset[];
  navMap: Record<string, XNAVResult>;
  contention: ReturnType<typeof computeContention>;
  edge: TeamEdgeProfile | null;
  strand: TeamStrandData | null;
  rosterNAV: number;
  topPlayers: { name: string; nav: number; position: string }[];
  capCommitted: number;
  lines: TeamLines;
  avgAge: number;
  rosterSize: number;
  ufaCount: number;
  rfaCount: number;
  gravityLeaders: GravityLeader[];
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

const DIV_SHORT: Record<string, string> = {
  Atlantic: "ATL", Metro: "MET", Central: "CEN", Pacific: "PAC",
};

function DivisionChip({ division, conference }: { division: string; conference: string }) {
  if (!division) return null;
  return (
    <span
      className="inline-block text-[8px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 font-mono"
      style={{
        color: "var(--ledger-ink-faint)",
        background: "var(--paper-inset)",
        border: "1px solid var(--ledger-rule)",
      }}
    >
      {DIV_SHORT[division] ?? division} · {conference === "Western" ? "WEST" : "EAST"}
    </span>
  );
}

function PlayoffChip({ position, clinch }: { position: string; clinch: string }) {
  if (!position && !clinch) return null;

  let label = "";
  let color = "";

  if (clinch === "y" || clinch === "z") {
    label = clinch === "z" ? "Presidents'" : "Div. Champ";
    color = "var(--ledger-green)";
  } else if (clinch === "x") {
    label = "Clinched";
    color = "var(--ledger-green)";
  } else if (clinch === "e") {
    label = "Eliminated";
    color = "var(--ledger-red)";
  } else if (position.startsWith("WC")) {
    label = position;
    color = "var(--ledger-amber)";
  } else if (position.startsWith("DIV")) {
    label = position.replace("DIV-", "Div #");
    color = "var(--ledger-green)";
  }

  if (!label) return null;

  return (
    <span
      className="inline-block text-[8px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 font-mono"
      style={{ color, border: `1px solid ${color}`, background: "transparent" }}
    >
      {label}
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

function buildTeamLines(roster: Asset[], navMap: Record<string, XNAVResult>): TeamLines {
  const toEntry = (p: Asset): LineEntry => ({
    name: p.name,
    position: displayPosition(p.position, p.secondaryPosition),
    nav: navMap[p.id]?.total ?? 0,
    capHit: p.capHit ?? 0,
    age: p.age ?? 0,
    ptsPace: p.ptsPace ?? 0,
    avgTOI: p.avgTOI ?? 0,
  });

  const score = (p: Asset) => lineupContributionScore(
    { name: p.name, position: p.position, avgTOI: p.avgTOI, ptsPace: p.ptsPace, games: p.games },
    navMap[p.id]?.total,
  );

  const canPlayWing = (p: Asset) =>
    ["W", "L", "R"].includes(p.position) || p.secondaryPosition === "W";

  const forwards = roster
    .filter(p => ["C", "W", "L", "R"].includes(p.position))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 12);

  const defense = roster
    .filter(p => p.position === "D")
    .sort((a, b) => score(b) - score(a))
    .slice(0, 6);

  const goalies = roster
    .filter(p => p.position === "G")
    .sort((a, b) => score(b) - score(a))
    .slice(0, 2);

  // Separate true centers (no wing flex) from flex players
  const pureCenters = forwards.filter(p => p.position === "C" && !canPlayWing(p));
  const flexCenters = forwards.filter(p => p.position === "C" && canPlayWing(p));
  const wingers = forwards.filter(p => p.position !== "C");

  // Slot top 4 pure centers first, then flex centers fill remaining center slots
  const centerSlots: (Asset | null)[] = [null, null, null, null];
  let ci = 0;
  for (const c of pureCenters) {
    if (ci >= 4) break;
    centerSlots[ci++] = c;
  }
  for (const c of flexCenters) {
    if (ci >= 4) break;
    centerSlots[ci++] = c;
  }

  const usedIds = new Set(centerSlots.filter(Boolean).map(c => c!.id));
  // Flex centers who didn't get a center slot go to the wing pool
  const wingPool = [
    ...wingers,
    ...flexCenters.filter(c => !usedIds.has(c.id)),
  ].sort((a, b) => score(b) - score(a));

  const fwdLines: LineEntry[][] = [];
  for (let i = 0; i < 4; i++) {
    const line: LineEntry[] = [];
    const c = centerSlots[i];
    if (c) line.push(toEntry(c));
    fwdLines.push(line);
  }
  for (let i = 0; i < 4; i++) {
    while (fwdLines[i].length < 3 && wingPool.length > 0) {
      const w = wingPool.shift()!;
      if (usedIds.has(w.id)) continue;
      usedIds.add(w.id);
      fwdLines[i].push(toEntry(w));
    }
  }

  const defPairs: LineEntry[][] = [];
  for (let i = 0; i < 3; i++) {
    defPairs.push(defense.slice(i * 2, i * 2 + 2).map(toEntry));
  }

  return {
    forwards: fwdLines,
    defense: defPairs,
    goalies: goalies.map(toEntry),
  };
}

function LineupSection({ lines }: { lines: TeamLines }) {
  const LINE_NAMES = ["1st Line", "2nd Line", "3rd Line", "4th Line"];
  const PAIR_NAMES = ["1st Pair", "2nd Pair", "3rd Pair"];

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: "var(--ledger-ink-faint)" }}>
        Projected Lines
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Forwards */}
        <div>
          <div className="text-[8px] font-black uppercase tracking-[0.12em] mb-1.5" style={{ color: "var(--ledger-ink-faint)" }}>
            Forwards
          </div>
          {lines.forwards.map((line, i) => (
            <div key={i} className="mb-1.5">
              <div className="text-[8px] font-black uppercase tracking-[0.1em] mb-0.5" style={{ color: "var(--ledger-ink-faint)", opacity: 0.6 }}>
                {LINE_NAMES[i]}
              </div>
              <div className="flex flex-wrap gap-x-2">
                {line.map((p) => (
                  <span key={p.name} className="text-[10px] font-mono" style={{ color: "var(--ledger-ink)" }}>
                    <span className="font-black">{p.name}</span>
                    <span className="text-[8px] ml-0.5" style={{ color: "var(--ledger-ink-faint)" }}>
                      {p.position}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Defense + Goalies */}
        <div>
          <div className="text-[8px] font-black uppercase tracking-[0.12em] mb-1.5" style={{ color: "var(--ledger-ink-faint)" }}>
            Defense
          </div>
          {lines.defense.map((pair, i) => (
            <div key={i} className="mb-1.5">
              <div className="text-[8px] font-black uppercase tracking-[0.1em] mb-0.5" style={{ color: "var(--ledger-ink-faint)", opacity: 0.6 }}>
                {PAIR_NAMES[i]}
              </div>
              <div className="flex flex-wrap gap-x-2">
                {pair.map((p) => (
                  <span key={p.name} className="text-[10px] font-mono" style={{ color: "var(--ledger-ink)" }}>
                    <span className="font-black">{p.name}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-2">
            <div className="text-[8px] font-black uppercase tracking-[0.12em] mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
              Goalies
            </div>
            <div className="flex flex-wrap gap-x-3">
              {lines.goalies.map((g, i) => (
                <span key={g.name} className="text-[10px] font-mono" style={{ color: "var(--ledger-ink)" }}>
                  <span className="font-black">{g.name}</span>
                  <span className="text-[8px] ml-1" style={{ color: "var(--ledger-ink-faint)" }}>
                    {i === 0 ? "Starter" : "Backup"}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ profile, expanded, onToggle, capCeiling }: {
  profile: TeamProfile;
  expanded: boolean;
  onToggle: () => void;
  capCeiling: number;
}) {
  const { team, contention, edge, strand, rosterNAV, topPlayers, capCommitted, lines, avgAge, rosterSize, ufaCount, rfaCount, gravityLeaders } = profile;

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
            <DivisionChip division={team.division} conference={team.conference} />
            <PlayoffChip position={team.record?.playoffPosition ?? ""} clinch={team.record?.clinchIndicator ?? ""} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] flex-wrap" style={{ color: "var(--ledger-ink-faint)", fontVariantNumeric: "tabular-nums" }}>
            <span>#{team.standing}</span>
            {team.record && <span>{team.record.wins}-{team.record.losses}-{team.record.otLosses}</span>}
            {team.record?.l10Record && <span>L10: {team.record.l10Record}</span>}
            {team.record?.streakCode && team.record.streakCount > 0 && (
              <span style={{ color: team.record.streakCode === "W" ? "var(--ledger-green)" : team.record.streakCode === "L" ? "var(--ledger-red)" : "var(--ledger-ink-faint)" }}>
                {team.record.streakCode}{team.record.streakCount}
              </span>
            )}
            <span>NAV {Math.round(rosterNAV).toLocaleString()}</span>
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
                background: "var(--ledger-ice, #334155)",
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
              sub={`${rosterSize} players`}
            />
          </div>

          {/* Season Record */}
          {team.record && (
            <div className="py-2 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black uppercase tracking-[0.15em]" style={{ color: "var(--ledger-ink-faint)" }}>
                  Season Record
                </span>
                <div className="flex items-center gap-3 text-[10px] font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {team.record.l10Record && (
                    <span style={{ color: "var(--ledger-ink-faint)" }}>
                      L10: <span className="font-black">{team.record.l10Record}</span>
                    </span>
                  )}
                  {team.record.streakCode && team.record.streakCount > 0 && (
                    <span className="font-black" style={{
                      color: team.record.streakCode === "W" ? "var(--ledger-green)" : team.record.streakCode === "L" ? "var(--ledger-red)" : "var(--ledger-amber)",
                    }}>
                      Streak: {team.record.streakCode}{team.record.streakCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                <StatCell
                  label="Record"
                  value={`${team.record.wins}-${team.record.losses}-${team.record.otLosses}`}
                  sub={`${team.record.points} pts · ${team.record.regulationWins} RW`}
                />
                <StatCell
                  label="Goal Diff"
                  value={`${team.record.goalsFor - team.record.goalsAgainst > 0 ? "+" : ""}${team.record.goalsFor - team.record.goalsAgainst}`}
                  sub={`${team.record.goalsFor} GF / ${team.record.goalsAgainst} GA`}
                  tone={(team.record.goalsFor - team.record.goalsAgainst) > 0 ? "var(--ledger-green)" : "var(--ledger-red)"}
                />
                <StatCell
                  label="PP%"
                  value={`${(team.record.powerPlayPct * 100).toFixed(1)}%`}
                  tone={team.record.powerPlayPct > 0.22 ? "var(--ledger-green)" : team.record.powerPlayPct < 0.18 ? "var(--ledger-red)" : undefined}
                />
                <StatCell
                  label="PK%"
                  value={`${(team.record.penaltyKillPct * 100).toFixed(1)}%`}
                  tone={team.record.penaltyKillPct > 0.82 ? "var(--ledger-green)" : team.record.penaltyKillPct < 0.78 ? "var(--ledger-red)" : undefined}
                />
                <StatCell
                  label="SF/Game"
                  value={team.record.shotsForPerGame.toFixed(1)}
                  sub={`${team.record.shotsAgainstPerGame.toFixed(1)} SA`}
                />
                <StatCell
                  label="FO%"
                  value={`${(team.record.faceoffWinPct * 100).toFixed(1)}%`}
                  tone={team.record.faceoffWinPct > 0.51 ? "var(--ledger-green)" : team.record.faceoffWinPct < 0.49 ? "var(--ledger-red)" : undefined}
                />
              </div>
            </div>
          )}

          {/* Roster overview strip */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 py-2 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
            <StatCell label="Avg Age" value={avgAge.toFixed(1)} />
            <StatCell label="Roster" value={`${rosterSize}`} sub="players" />
            <StatCell label="Pending UFA" value={`${ufaCount}`} tone={ufaCount > 5 ? "var(--ledger-red)" : undefined} />
            <StatCell label="Pending RFA" value={`${rfaCount}`} />
          </div>

          {/* Cap situation */}
          <div className="py-2 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
            <div className="text-[9px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: "var(--ledger-ink-faint)" }}>
              Cap Situation
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: "var(--ledger-rule)" }}>
                {(() => {
                  const effectiveUsed = capCeiling - team.capSpace;
                  const pct = Math.min(100, Math.max(0, (effectiveUsed / capCeiling) * 100));
                  return (
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${pct}%`,
                        background: team.capSpace < 0 ? "var(--ledger-red)" : "var(--ledger-green)",
                        opacity: 0.7,
                      }}
                    />
                  );
                })()}
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
              ${(capCeiling - team.capSpace).toFixed(1)}M committed of ${capCeiling}M ceiling
            </div>
            {team.capBreakdown && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-mono" style={{ color: "var(--ledger-ink-faint)", fontVariantNumeric: "tabular-nums" }}>
                {team.capBreakdown.ltirUsed > 0 && (
                  <span>LTIR Relief: <span className="font-black" style={{ color: "var(--ledger-amber)" }}>${team.capBreakdown.ltirUsed.toFixed(1)}M</span></span>
                )}
                {team.capBreakdown.deadCap > 0 && (
                  <span>Dead Cap: <span className="font-black" style={{ color: "var(--ledger-red)" }}>${team.capBreakdown.deadCap.toFixed(1)}M</span></span>
                )}
                {team.capBreakdown.bonuses > 0 && (
                  <span>Bonuses: <span className="font-black">${team.capBreakdown.bonuses.toFixed(1)}M</span></span>
                )}
                {team.capBreakdown.totalCapHit > 0 && (
                  <span>Total Cap Hit: <span className="font-black">${team.capBreakdown.totalCapHit.toFixed(1)}M</span></span>
                )}
              </div>
            )}
          </div>

          {/* Team Strand */}
          {strand && (
            <div className="py-2 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
              <div className="text-[9px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: "var(--ledger-ink-faint)" }}>
                Team DNA
              </div>
              <TeamStrand strand={strand} teamName={team.name} />
            </div>
          )}

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

          {/* Gravity Leaders */}
          {gravityLeaders.length > 0 && (
            <div className="py-2 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
              <div className="text-[9px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: "var(--ledger-ink-faint)" }}>
                Position-relative Gravity Leaders
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Top gravity player — full field diagram */}
                <GravityField
                  profile={gravityLeaders[0].profile}
                  playerName={gravityLeaders[0].name}
                  mode="full"
                />
                {/* #2 and #3 — compact readouts */}
                {gravityLeaders.length > 1 && (
                  <div className="space-y-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.1em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                      Other field generators
                    </div>
                    {gravityLeaders.slice(1).map((g) => (
                      <div key={g.name} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--ledger-rule)" }}>
                        <span className="text-[11px] font-black font-mono truncate" style={{ color: "var(--ledger-ink)" }}>
                          {g.name}
                        </span>
                        <GravityField profile={g.profile} playerName={g.name} mode="compact" />
                      </div>
                    ))}
                    {/* Team gravity summary */}
                    <div className="mt-2 p-2 border" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
                      <div className="text-[8px] font-black uppercase tracking-[0.1em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
                        Team Gravity Field
                      </div>
                      <div className="text-[9px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                        {(() => {
                          const avgPercentile = gravityLeaders.reduce(
                            (sum, leader) => sum + leader.positionPercentile,
                            0,
                          ) / gravityLeaders.length;
                          const topPercentile = gravityLeaders[0].positionPercentile;
                          return (
                            <>
                              Avg top-{gravityLeaders.length} position percentile:{" "}
                              <span className="font-black" style={{
                                color: avgPercentile >= 80 ? "var(--ledger-green)" : "var(--ledger-ink)",
                                fontVariantNumeric: "tabular-nums",
                              }}>
                                {avgPercentile.toFixed(0)}
                              </span>
                              {topPercentile >= 92 && (
                                <span> — elite within-position field presence</span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Projected Lines */}
          <div className="py-2 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
            <LineupSection lines={lines} />
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
  const [capCeiling, setCapCeiling] = useState(104);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("division");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterPhase, setFilterPhase] = useState<string>("ALL");

  useEffect(() => {
    fetch("/api/league")
      .then((r) => r.json())
      .then((data) => {
        setTeams((data.teams ?? []).map((t: any) => ({
          ...t,
          division: t.division ?? "",
          conference: t.conference ?? "",
          capBreakdown: t.capBreakdown ?? null,
        })));
        setPlayers(data.players ?? []);
        if (data.capCeiling) setCapCeiling(data.capCeiling);
      })
      .catch((err) => console.error("Failed to load league data:", err))
      .finally(() => setLoading(false));
  }, []);

  const navMap = useMemo(() => {
    const map: Record<string, XNAVResult> = {};
    for (const p of players) {
      if (p.position === "Pick") continue;
      try {
        map[p.id] = calculateAssetNAV(p, capCeiling) as unknown as XNAVResult;
      } catch {
        // skip players that fail NAV calc
      }
    }
    return map;
  }, [players, capCeiling]);

  const teamProfiles = useMemo((): TeamProfile[] => {
    const computedGravity = players.flatMap((player) => {
      const profile = gravityForDisplay(player);
      return profile ? [{ player, profile }] : [];
    });
    const gravityPopulation = computedGravity.map(result => result.profile);
    const gravityByPlayerId = new Map(computedGravity.map(({ player, profile }) => [
      player.id,
      {
        profile,
        positionPercentile: gravityPositionPercentile(profile, gravityPopulation),
      },
    ]));

    return teams.map((team) => {
      const roster = players.filter((p) => p.teamId === team.id && p.position !== "Pick");
      const contention = computeContention(roster, navMap);
      const edge = computeTeamEdgeProfile(roster);
      const strand = computeRosterStrand(roster, navMap);
      const rosterNAV = roster.reduce((s, p) => s + Math.max(0, navMap[p.id]?.total ?? 0), 0);
      const capCommitted = roster.reduce((s, p) => s + (p.capHit ?? 0), 0);
      const lines = buildTeamLines(roster, navMap);

      const ages = roster.filter(p => p.age).map(p => p.age!);
      const avgAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
      const ufaCount = roster.filter(p => p.contractStatus === "UFA").length;
      const rfaCount = roster.filter(p => p.contractStatus === "RFA").length;

      const sorted = roster
        .map((p) => ({
          name: p.name,
          nav: navMap[p.id]?.total ?? 0,
          position: displayPosition(p.position, p.secondaryPosition),
        }))
        .sort((a, b) => b.nav - a.nav)
        .slice(0, 10);

      const gravityLeaders = roster
        .flatMap((p) => {
          const gravity = gravityByPlayerId.get(p.id);
          return gravity?.profile.evidenceStatus === "QUALIFIED"
            && gravity.positionPercentile != null
            ? [{
                name: p.name,
                profile: gravity.profile,
                positionPercentile: gravity.positionPercentile,
              }]
            : [];
        })
        .sort((a, b) => (
          b.positionPercentile - a.positionPercentile
          || b.profile.force - a.profile.force
        ))
        .slice(0, 3);

      return {
        team, roster, navMap, contention, edge, strand, rosterNAV,
        topPlayers: sorted, capCommitted, lines,
        avgAge, rosterSize: roster.length, ufaCount, rfaCount,
        gravityLeaders,
      };
    });
  }, [teams, players, navMap]);

  const applySort = (list: TeamProfile[], key: SortKey) => {
    list.sort((a, b) => {
      switch (key) {
        case "division":
        case "standing": return a.team.standing - b.team.standing;
        case "present": return b.contention.present - a.contention.present;
        case "future": return b.contention.future - a.contention.future;
        case "rosterNAV": return b.rosterNAV - a.rosterNAV;
        case "capSpace": return b.team.capSpace - a.team.capSpace;
        case "goalDiff": {
          const aDiff = (a.team.record?.goalsFor ?? 0) - (a.team.record?.goalsAgainst ?? 0);
          const bDiff = (b.team.record?.goalsFor ?? 0) - (b.team.record?.goalsAgainst ?? 0);
          return bDiff - aDiff;
        }
        case "gravity": return (b.gravityLeaders[0]?.positionPercentile ?? -1)
          - (a.gravityLeaders[0]?.positionPercentile ?? -1);
        case "speed": return (b.edge?.avgSpeedMaxMph ?? 0) - (a.edge?.avgSpeedMaxMph ?? 0);
        case "name": return a.team.name.localeCompare(b.team.name);
        default: return 0;
      }
    });
    return list;
  };

  const filtered = useMemo(() => {
    let list = [...teamProfiles];
    if (filterPhase !== "ALL") {
      list = list.filter((tp) => tp.team.phase === filterPhase);
    }
    return applySort(list, sortKey);
  }, [teamProfiles, sortKey, filterPhase]);

  const divisionGroups = useMemo(() => {
    if (sortKey !== "division") return null;
    const groups: { conference: string; division: string; teams: TeamProfile[] }[] = [];
    for (const conf of CONFERENCE_ORDER) {
      for (const div of DIVISION_ORDER[conf]) {
        let divTeams = filtered.filter((tp) => tp.team.division === div);
        divTeams = applySort([...divTeams], "standing");
        if (divTeams.length > 0) {
          groups.push({ conference: conf, division: div, teams: divTeams });
        }
      }
    }
    return groups;
  }, [filtered, sortKey]);

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
      <div className="mx-auto max-w-6xl px-4 pt-5 pb-8">
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
            All 32 franchises — contention window, team DNA, EDGE profile, projected lines, and cap situation.
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
            ["division", "Division"],
            ["standing", "All Teams"],
            ["present", "Present"],
            ["future", "Future"],
            ["rosterNAV", "NAV"],
            ["capSpace", "Cap Space"],
            ["goalDiff", "Goal Diff"],
            ...(GRAVITY_DISPLAY_ENABLED ? [["gravity", "Gravity"] as [SortKey, string]] : []),
            ["speed", "Speed"],
            ["name", "Name"],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className="text-[10px] font-black uppercase tracking-[0.1em] px-2 py-1 cursor-pointer font-mono"
              style={{
                background: sortKey === key ? "var(--ledger-red, #b83020)" : "transparent",
                color: sortKey === key ? "#fff" : "var(--ledger-ink-faint)",
                border: `1px solid ${sortKey === key ? "var(--ledger-red, #b83020)" : "var(--ledger-rule)"}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Team cards */}
        {divisionGroups ? (
          <div className="space-y-6">
            {divisionGroups.map(({ conference, division, teams: divTeams }, gi) => (
              <div key={division}>
                <div className="flex items-center gap-3 mb-2">
                  <h3
                    className="text-[12px] font-black uppercase tracking-[0.15em] font-mono"
                    style={{ color: "var(--ledger-ink)" }}
                  >
                    {division}
                  </h3>
                  <span
                    className="text-[9px] font-black uppercase tracking-[0.1em] font-mono"
                    style={{ color: "var(--ledger-ink-faint)" }}
                  >
                    {conference} Conference
                  </span>
                  {gi > 0 && gi % 2 === 0 && (
                    <div className="flex-1 h-px" style={{ background: "var(--ledger-ink-faint)", opacity: 0.3 }} />
                  )}
                </div>
                <div className="space-y-1.5">
                  {divTeams.map((tp, rank) => (
                    <div key={tp.team.id} className="flex items-start gap-0">
                      <span
                        className="text-[11px] font-black font-mono shrink-0 w-5 text-right mt-3.5 mr-1.5"
                        style={{ color: "var(--ledger-ink-faint)", fontVariantNumeric: "tabular-nums" }}
                      >
                        {rank + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <TeamCard
                          profile={tp}
                          expanded={expandedId === tp.team.id}
                          onToggle={() => setExpandedId(expandedId === tp.team.id ? null : tp.team.id)}
                          capCeiling={capCeiling}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((tp) => (
              <TeamCard
                key={tp.team.id}
                profile={tp}
                expanded={expandedId === tp.team.id}
                onToggle={() => setExpandedId(expandedId === tp.team.id ? null : tp.team.id)}
                capCeiling={capCeiling}
              />
            ))}
          </div>
        )}

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
