"use client";

import AssetCard from "@/app/components/AssetCard";
import TradePanel from "@/app/components/TradePanel";
import AssetDropdown from "@/app/components/AssetDropdown";
import TradeHistoryBar from "@/app/components/TradeHistoryBar";
import TugBar from "@/app/components/TugBar";
import { MicroBar, DeltaRow } from "@/app/components/MicroBar";
import { SEASON, ageDecayRate, ageSlotPenalty } from "@/app/lib/season-config";
import PlayoffBracket from "@/app/components/PlayoffBracket";
import TeamStrand, { CHAMP_TEMPLATE, TeamStrandData } from "@/app/components/TeamStrand";
import LineupCard from "@/app/components/LineupCard";
import WhatWeNeed from "@/app/components/WhatWeNeed";
import ContentionQuadrant from "@/app/components/ContentionQuadrant";
import {
  PLAYER_PEDIGREE, PROSPECT_TIERS, SHUTDOWN_D_PEDIGREE, INJURY_RISK,
} from "@/app/lib/player-data";
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from "react";
import { createPortal } from "react-dom";

// Lazy-load heavy components — defers their JS from the initial bundle.
// Each one is only parsed/executed when first rendered.
// Shared with xnav-engine.ts — change both together (or move to player-data.ts)
const DPS_NAV_MULTIPLIER = 120; // dps * 15 (display) * 8 (NAV) = dps * 120

const TradeProposalEngine = lazy(() => import("@/app/components/TradeProposal"));
const PlayerComparison    = lazy(() => import("@/app/components/PlayerComparison"));
const CapProjection       = lazy(() => import("@/app/components/CapProjection"));
const LedgerDropdown      = lazy(() => import("@/app/components/LedgerDropdown"));
import { 
  HISTORICAL_MAX_OFF, 
  HISTORICAL_MAX_DEF 
} from "../lib/historical-benchmarks";
import { useTradeStore } from "@/app/store/tradeStore";

import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import type {
  Asset, Team, XNAVResult, GmFlag, FlagSeverity, FlagCategory,
  TradeVerdict, TradeStatus, TradeMetrics,
} from "@/app/lib/trade-types";
import {
  fetchNavMap, fetchTradeVerdict, clearNavCache, getCachedNav,
} from "@/app/lib/evaluate-client";

// ── Display-only constants (labels/badges only — no math) ────
// The real valuation data lives server-side in /api/evaluate.
// These are purely for rendering badges in the UI.


const safe  = (n: number) => (isNaN(n) || !isFinite(n) ? 0 : n);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const fmt   = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));

// Synchronous NAV lookup — reads from client-side cache populated by /api/evaluate
// Falls back to 0 for assets not yet fetched (shouldn't happen after initial load)
const getXNAV = (asset: Asset): XNAVResult =>
  getCachedNav(asset) ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };


// ============================================================
// UTILS
// ============================================================
const nullMetrics = () => ({
  navOut: 0, navIn: 0, homeNetGain: 0, ptsGain: 0,
  defGain: 0, capDelta: 0, variance: 0, ewaHome: 0, cwiYears: 0,
});

import VerdictPanel, { SEVERITY_STYLES, STATUS_CONFIG } from "@/app/components/VerdictPanel";

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function TradeMachine() {
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [db, setDb] = useState<{ teams: Team[]; players: Asset[] }>({ teams: [], players: [] });
  const [originalDb, setOriginalDb] = useState<{ teams: Team[]; players: Asset[] } | null>(null);
  const teams = useTradeStore(s => s.teams);
  const setTeams = useTradeStore(s => s.setTeams);
  const blocks = useTradeStore(s => s.blocks);
  const setBlocks = useTradeStore(s => s.setBlocks);
  const [verdict, setVerdict] = useState<TradeVerdict | null>(null);
  const [matchResults, setMatchResults] = useState<null | {
    matches: Array<{
      teamId: string; teamName: string; phase: string; score: number;
      navDelta: number; capFit: "FITS"|"TIGHT"|"OVER";
      fitReasons: string[]; warnReasons: string[]; returnProfile: string;
    }>;
    packageNAV: number; packageCap: number; avgAge: number;
  }>(null);
  const [matchLoading,    setMatchLoading]    = useState(false);
  const [approvedOnly,    setApprovedOnly]    = useState(true);

  // ── Shared trade links — URL serialisation ────────────────────────────────
  // Format: ?home=WPG&partner=SJS&out=id1,id2:50&in=id3
  // where id2:50 means 50% retention. Updates without a full navigation.
  const [linkCopied, setLinkCopied] = useState(false);

  // Sync state → URL on every trade change
  useEffect(() => {
    if (!teams[0] && !teams[1] && !blocks[0].length && !blocks[1].length) return;
    const p = new URLSearchParams();
    if (teams[0]) p.set('home', teams[0].id);
    if (teams[1]) p.set('partner', teams[1].id);
    if (blocks[0].length) p.set('out', blocks[0].map(a =>
      (a.retainedPct ?? 0) > 0 ? `${a.id}:${Math.round(a.retainedPct! * 100)}` : a.id
    ).join(','));
    if (blocks[1].length) p.set('in', blocks[1].map(a => a.id).join(','));
    const newUrl = `${window.location.pathname}?${p.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [teams, blocks]);

  // Parse URL → state on cold load (after db is ready)
  useEffect(() => {
    if (!db || db.players.length === 0) return;
    const p = new URLSearchParams(window.location.search);
    const homeId    = p.get('home');
    const partnerId = p.get('partner');
    const outStr    = p.get('out');
    const inStr     = p.get('in');
    if (!homeId && !partnerId && !outStr && !inStr) return;

    const parseBlock = (str: string | null): Asset[] => {
      if (!str) return [];
      return str.split(',').flatMap(token => {
        const [id, retStr] = token.split(':');
        const asset = db.players.find(pl => pl.id === id);
        if (!asset) return [];
        return [{ ...asset, retainedPct: retStr ? parseInt(retStr) / 100 : 0 }];
      });
    };

    const homeTeam    = homeId    ? db.teams.find(t => t.id === homeId)    ?? null : null;
    const partnerTeam = partnerId ? db.teams.find(t => t.id === partnerId) ?? null : null;
    const outgoing    = parseBlock(outStr);
    const incoming    = parseBlock(inStr);

    if (homeTeam || partnerTeam || outgoing.length || incoming.length) {
      setTeams([homeTeam, partnerTeam]);
      setBlocks([outgoing, incoming]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);
  const [verdictOpen, setVerdictOpen] = useState(false);   // bottom sheet expanded
  const [showTeamSelect, setShowTeamSelect] = useState(false); // Team select modal open

  // Freeze body scroll when verdict panel or team select modal is open
  React.useEffect(() => {
    if (verdictOpen || showTeamSelect) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.paddingRight = '0px';
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    }
    return () => {
      document.body.style.paddingRight = '0px';
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    };
  }, [verdictOpen, showTeamSelect]);
  const [evaluated, setEvaluated] = useState(false);
  const [expandedFlag,   setExpandedFlag]   = useState<number | null>(null);
  const [tradeRequest,   setTradeRequest]   = useState<Asset[] | null>(null);

  // ── Team lock state ───────────────────────────────────────────
  const [homeTeamLocked, setHomeTeamLocked] = useState(false);

  // ── Persistent trade simulation state ────────────────────────
  const [executedTrades, setExecutedTrades] = useState<{
    id: string;
    homeTeamName: string;
    partnerTeamName: string;
    outgoing: Asset[];
    incoming: Asset[];
    timestamp: number;
  }[]>([]);
  const [simResult, setSimResult]   = useState<string | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simData, setSimData]       = useState<any | null>(null);
  const [showSimPanel, setShowSimPanel] = useState(false);
  const [showMemo, setShowMemo] = useState(false);

  // ── Abort controllers — cancel stale Claude requests ─────────
  const simAbortRef  = useRef<AbortController | null>(null);
  const memoAbortRef = useRef<AbortController | null>(null);
  const evalAbortRef = useRef<AbortController | null>(null);

  // ── Server-fetched NAV map ────────────────────────────────────
  // Populated by /api/evaluate — engine runs server-side only.
  // getXNAV() in this file is a thin cache wrapper, not the real engine.
  const navMap = useTradeStore(s => s.navMap);
  const setNavMap = useTradeStore(s => s.setNavMap);
  const [navLoading, setNavLoading] = useState(false);

  // Memoized rosters — stable references stop useEffect churn
  const allHomeRoster = useMemo(
    () => db.players.filter(p => p.teamId === teams[0]?.id),
    [db.players, teams[0]?.id]
  );
  const allPartnerRoster = useMemo(
    () => db.players.filter(p => p.teamId === teams[1]?.id),
    [db.players, teams[1]?.id]
  );

  // Fetch NAV from server whenever db.players changes (after load or trade execution)
  useEffect(() => {
    if (db.players.length === 0) return;
    setNavLoading(true);
    const ctrl = new AbortController();
    fetchNavMap(db.players, ctrl.signal)
      .then(map => { setNavMap(map); setNavLoading(false); })
      .catch(e => { if (e.name !== "AbortError") setNavLoading(false); });
    return () => ctrl.abort();
  }, [db.players]);

  // Re-fetch NAV for any block assets with retention applied.
  // Clear trade partner match results whenever the outgoing package changes —
  // stale "who wants this" results from a previous package should never persist.
  useEffect(() => { setMatchResults(null); }, [blocks[0]]);

  // When retention returns to 0, immediately restore the original cached value
  // so the display doesn't stay stuck showing the retained NAV.
  // Debounced for non-zero retention to avoid API hammering on every slider tick.
  useEffect(() => {
    const retainedAssets = [...blocks[0], ...blocks[1]]
      .filter(a => a.position !== "Pick" && (a.retainedPct || 0) > 0);
    const zeroedAssets = [...blocks[0], ...blocks[1]]
      .filter(a => a.position !== "Pick" && (a.retainedPct || 0) === 0);

    // Immediately restore zero-retention assets from cache — no debounce needed
    if (zeroedAssets.length > 0) {
      setNavMap(prev => {
        const updated = { ...prev };
        for (const a of zeroedAssets) {
          const original = getCachedNav({ ...a, retainedPct: 0 });
          if (original) updated[a.id] = original;
        }
        return updated;
      });
    }

    if (retainedAssets.length === 0) return;

    const timer = setTimeout(() => {
      const ctrl = new AbortController();
      fetchNavMap(retainedAssets, ctrl.signal)
        .then(fresh => setNavMap(prev => ({ ...prev, ...fresh })))
        .catch(() => {});
      return () => ctrl.abort();
    }, 300);

    return () => clearTimeout(timer);
  }, [blocks]);

  useEffect(() => {
    Promise.all([
      fetch("/api/league/teams").then((r) => r.json()),
      fetch("/api/league/players").then((r) => r.json()),
    ])
      .then(([td, pd]) => {
        const data = {
          teams:      td.teams,
          players:    [...(pd.players ?? []), ...(td.picks ?? [])],
          capCeiling: td.capCeiling,
          capFloor:   td.capFloor,
          liveStats:  pd.liveStats,
        };
        if (!data.teams || !data.players) {
          setError(`API returned invalid data`);
          setBooting(false);
          return;
        }
        setDb(data);
        setOriginalDb(data);
        // Don't auto-select teams — show the franchise selection modal
        const wpg = data.teams.find((t: Team) => t.id === "WPG") ?? data.teams[1] ?? null;
        setTeams([null, wpg]);
        setShowTeamSelect(true);
        setBooting(false);
      })
      .catch((e) => {
        setError(`Network error: ${e.message}`);
        setBooting(false);
      });
  }, []);

  // ── Live NAV totals for trade blocks ─────────────────────────

  const CAP_CEILING = SEASON.capCeiling; // NHL salary cap ceiling

  // ── Execute Trade — moves players between teams in db state ──
  const executeTrade = useCallback(() => {
    if (!teams[0] || !teams[1] || (!blocks[0].length && !blocks[1].length)) return;

    const outIds = new Set(blocks[0].map(a => a.id));
    const inIds  = new Set(blocks[1].map(a => a.id));

    setDb(prev => {
      // Update player teamIds
      const updatedPlayers = prev.players.map(p => {
        if (outIds.has(p.id)) return { ...p, teamId: teams[1]!.id };
        if (inIds.has(p.id))  return { ...p, teamId: teams[0]!.id };
        return p;
      });

      // Recalculate cap space using DELTA only — not a full rebuild from ceiling.
      // The API cap space already accounts for LTIR, retained salaries, bonuses etc.
      // Rebuilding from CAP_CEILING - rosterCap ignores all of that complexity.
      // Delta approach: add outgoing cap hits back, subtract incoming cap hits.
      const outCapHome = blocks[0]
        .filter(a => a.position !== "Pick")
        .reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0);
      const inCapHome = blocks[1]
        .filter(a => a.position !== "Pick")
        .reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0);

      const updatedTeams = prev.teams.map(team => {
        if (team.id === teams[0]!.id) {
          return { ...team, capSpace: Math.round((team.capSpace + outCapHome - inCapHome) * 10) / 10 };
        }
        if (team.id === teams[1]!.id) {
          return { ...team, capSpace: Math.round((team.capSpace + inCapHome - outCapHome) * 10) / 10 };
        }
        return team;
      });

      return { players: updatedPlayers, teams: updatedTeams };
    });

    // Record the trade
    setExecutedTrades(prev => [...prev, {
      id:              `trade-${Date.now()}`,
      homeTeamName:    teams[0]!.name,
      partnerTeamName: teams[1]!.name,
      outgoing:        blocks[0],
      incoming:        blocks[1],
      timestamp:       Date.now(),
    }]);

    // Clear nav cache so post-trade rosters get fresh server-side NAV
    clearNavCache();

    // Clear the blocks and verdict
    setBlocks([[], []]);
    setVerdict(null);
    setEvaluated(false);
    setSimResult(null);
    setShowSimPanel(true);
  }, [teams, blocks]);

  // ── Reset to original rosters ─────────────────────────────────
  const resetTrades = useCallback(() => {
    if (originalDb) {
      clearNavCache();
      setDb(originalDb);
      setExecutedTrades([]);
      setSimResult(null);
      setSimData(null);
      setShowSimPanel(false);
      setBlocks([[], []]);
      setVerdict(null);
      setHomeTeamLocked(false);
      setShowTeamSelect(true);
    }
  }, [originalDb]);

  // ── Sim a Year — Claude Haiku projects one season forward ─────
  const simYear = useCallback(async () => {
    if (!teams[0] || executedTrades.length === 0) return;
    setSimLoading(true);
    setSimResult(null);
    setSimData(null);

    // ── Step 1: Run projection engine ─────────────────────────
    let sim: any = null;
    try {
      const simRes = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeamId:    teams[0]!.id,
          partnerTeamId: teams[1]?.id ?? "",
          teams:   db.teams,
          players: db.players,
          trades:  executedTrades.map(t => ({
            homeTeamId:    db.teams.find(x => x.name === t.homeTeamName)?.id ?? "",
            partnerTeamId: db.teams.find(x => x.name === t.partnerTeamName)?.id ?? "",
            outgoing: t.outgoing,
            incoming: t.incoming,
          })),
        }),
      });
      if (simRes.ok) {
        sim = await simRes.json();
        setSimData(sim);
      }
    } catch (_) {}

    // ── Step 2: Build trade summary ────────────────────────────
    const tradesSummary = executedTrades.map(t => {
      const outNames = t.outgoing.map(a => a.position === "Pick"
        ? `${a.year} ${a.round === 1 ? "1st" : a.round === 2 ? "2nd" : "3rd"} round pick`
        : `${a.name} (${a.position}, $${a.capHit}M)`).join(", ");
      const inNames = t.incoming.map(a => a.position === "Pick"
        ? `${a.year} ${a.round === 1 ? "1st" : a.round === 2 ? "2nd" : "3rd"} round pick`
        : `${a.name} (${a.position}, $${a.capHit}M)`).join(", ");
      return [
        `TRADE: ${t.homeTeamName} ↔ ${t.partnerTeamName}`,
        `  ${t.homeTeamName} GAVE AWAY: ${outNames}`,
        `  ${t.homeTeamName} RECEIVED: ${inNames}`,
      ].join("\n");
    }).join("\n\n");

    const homeRoster = db.players
      .filter(p => p.teamId === teams[0]!.id && p.position !== "Pick")
      .sort((a, b) => b.ptsPace - a.ptsPace)
      .slice(0, 12)
      .map(p => `${p.name} (${p.position}, ${p.ptsPace.toFixed(0)}pts/82, age ${p.age})`);

    const partnerTeam = teams[1];
    const isRebuilding = ["Rebuilding","Tanking","Retooling"].includes(teams[0]!.phase ?? "");

    // ── Step 3: Build structured prompt ───────────────────────
    // If sim engine succeeded, Claude gets exact numbers and writes narrative only.
    // If sim engine failed, Claude falls back to its own projection (old behavior).
    const simContext = sim ? `
PROJECTED SEASON RESULTS — USE THESE EXACT NUMBERS, DO NOT INVENT ALTERNATIVES:

${teams[0]!.name}: ${sim.homeTeam?.projectedPoints ?? "?"} pts · Finished #${sim.homeTeam?.leagueRank ?? "?"}/32 · ${sim.homeTeam?.madePlayoffs ? "MADE PLAYOFFS" : "MISSED PLAYOFFS"}
  Top scorer: ${sim.homeTeam?.topScorer?.name ?? "—"} — ${sim.homeTeam?.topScorer?.projectedPts ?? "—"} pts
  Starting goalie: ${sim.homeTeam?.goalie?.name ?? "—"} — ${sim.homeTeam?.goalie?.projectedGAA ?? "—"} GAA / ${sim.homeTeam?.goalie?.projectedSVP ?? "—"} SV%

${partnerTeam?.name ?? ""}: ${sim.partnerTeam?.projectedPoints ?? "?"} pts · Finished #${sim.partnerTeam?.leagueRank ?? "?"}/32 · ${sim.partnerTeam?.madePlayoffs ? "MADE PLAYOFFS" : "MISSED PLAYOFFS"}
  Top scorer: ${sim.partnerTeam?.topScorer?.name ?? "—"} — ${sim.partnerTeam?.topScorer?.projectedPts ?? "—"} pts
  Starting goalie: ${sim.partnerTeam?.goalie?.name ?? "—"} — ${sim.partnerTeam?.goalie?.projectedGAA ?? "—"} GAA / ${sim.partnerTeam?.goalie?.projectedSVP ?? "—"} SV%

LEAGUE RESULTS (LOCKED — do not contradict):
  Presidents' Trophy: ${sim.leaders?.presidentsTrophy?.teamName ?? "—"} — ${sim.leaders?.presidentsTrophy?.projectedPoints ?? "—"} pts
  Stanley Cup Champion: ${sim.leaders?.cupWinner?.teamName ?? "—"} 
  Points Leader: ${sim.leaders?.topScorer?.name ?? "—"}, ${sim.leaders?.topScorer?.team ?? "—"} — ${sim.leaders?.topScorer?.pts ?? "—"} pts
  GAA Leader: ${sim.leaders?.topGoalie?.name ?? "—"}, ${sim.leaders?.topGoalie?.team ?? "—"} — ${sim.leaders?.topGoalie?.gaa ?? "—"} GAA
  SV% Leader: ${sim.leaders?.topGoalie?.name ?? "—"}, ${sim.leaders?.topGoalie?.team ?? "—"} — ${sim.leaders?.topGoalie?.svp ?? "—"} SV%
  Calder Trophy: ${sim.leaders?.calder?.name ?? "—"}, ${sim.leaders?.calder?.team ?? "—"} — ${sim.leaders?.calder?.note ?? ""}
  Vezina Trophy: ${sim.leaders?.vezina?.name ?? "—"}, ${sim.leaders?.vezina?.team ?? "—"} — ${sim.leaders?.vezina?.gaa ?? "—"} GAA
  Hart Trophy (MVP): ${sim.leaders?.hart?.name ?? "—"}, ${sim.leaders?.hart?.team ?? "—"} — ${sim.leaders?.hart?.pts ?? "—"} pts
  Norris Trophy: ${sim.leaders?.norris?.name ?? "—"}, ${sim.leaders?.norris?.team ?? "—"} — ${sim.leaders?.norris?.pts ?? "—"} pts
  Draft Lottery: ${sim.leaders?.draftLottery?.teamName ?? "—"} finished last (${sim.leaders?.draftLottery?.projectedPoints ?? "—"} pts)
  Simulation seed: #${sim.seed ?? "—"}

CRITICAL ACCURACY RULES:
- Every stat (pts, GAA, SV%) must match the exact number above — no rounding, no approximating
- Do not add stats for players not listed above
- Do not add context (injuries, feuds, locker room issues) not in the data above

PLAYOFF TEAMS: ${sim.playoffTeams?.join(", ") ?? "—"}

YOUR ROLE: Write the narrative column using ONLY these numbers.
Do not invent standings, stat lines, or results.
Claude is the storyteller — the simulation engine is the source of truth.` : `
NOTE: Projection engine unavailable. Use your best judgment for outcomes but follow all constraints below.`;

    const prompt = (() => {
      const allTradedNames = executedTrades.flatMap(t => [
        ...t.outgoing.map(a => a.name),
        ...t.incoming.map(a => a.name),
      ]);
      const franchiseMoved = (name: string) => allTradedNames.includes(name);
      const WILD_CARDS = ["WPG","TOR","CGY","EDM","NYR"];
      const homeIsWildCard    = WILD_CARDS.includes(teams[0]!.id);
      const partnerIsWildCard = teams[1] && WILD_CARDS.includes(teams[1].id);

      const teamNarrative = (t: Team): string => {
        const p = t.phase; const s = t.standing;
        if (p === "Tanking" || p === "Rebuilding") return "deep in a rebuild — draft positioning is the only currency that matters";
        if (s <= 3)  return "legitimate Presidents' Trophy contender — Cup or bust";
        if (s <= 8)  return "locked into the playoff race with real Cup upside";
        if (s <= 14) return "bubble team fighting to survive the final weeks";
        if (s <= 20) return "underperforming their talent — fans restless, GM on notice";
        return "fading season — playing for draft lottery position";
      };

      return `You are a senior NHL beat reporter writing the definitive end-of-season trade retrospective column.
${simContext}

THE TRADE IS THE DIVERGENCE POINT. Honor it above all real-world events.
${franchiseMoved("Auston Matthews") ? "Matthews was TRADED — Toronto's season is reflected in the numbers above." : ""}
${franchiseMoved("Connor Hellebuyck") ? "Hellebuyck was TRADED — Winnipeg's identity changed." : ""}

LOCKED FACTS (pre-deadline, cannot change):
- Florida Panthers did NOT win the Cup (won 2023, 2024, 2025).
- Utah Hockey Club is now the Utah Mammoth (UTA). Arizona Coyotes do not exist.

NHL STRUCTURE:
Eastern: Atlantic (BOS,BUF,DET,FLA,MTL,OTT,TBL,TOR) · Metro (CAR,CBJ,NJD,NYI,NYR,PHI,PIT,WSH)
Western: Central (UTA,CHI,COL,DAL,MIN,NSH,STL,WPG) · Pacific (ANA,CGY,EDM,LAK,SEA,SJS,VAN,VGK)

TRADE SUMMARY:
${tradesSummary}

${teams[0]!.name} ROSTER (top 12):
${homeRoster.join("\n")}
Phase: ${teams[0]!.phase} · Pre-trade standing: #${teams[0]!.standing}/32
Contention ratings (X-NAV derived): Present ${computeContention(db.players.filter(p => p.teamId === teams[0]!.id), navMap).present.toFixed(1)}/10 · Future ${computeContention(db.players.filter(p => p.teamId === teams[0]!.id), navMap).future.toFixed(1)}/10
Narrative entering second half: ${teamNarrative(teams[0]!)}

${sim?.playoffBracket ? `PLAYOFF BRACKET (simulated):
Eastern: ${sim.playoffBracket.eastern.r1.map((s: any) => `${s.home.teamName} ${s.homeWins}-${s.awayWins} ${s.away.teamName}`).join(' | ')}
  → ${sim.playoffBracket.eastern.r2.map((s: any) => `${s.winner.teamName}`).join(' def ')} · ECF: ${sim.playoffBracket.eastern.cf.home.teamName} ${sim.playoffBracket.eastern.cf.homeWins}-${sim.playoffBracket.eastern.cf.awayWins} ${sim.playoffBracket.eastern.cf.away.teamName} → ${sim.playoffBracket.eastern.champion.teamName} advance
Western: ${sim.playoffBracket.western.r1.map((s: any) => `${s.home.teamName} ${s.homeWins}-${s.awayWins} ${s.away.teamName}`).join(' | ')}
  → ${sim.playoffBracket.western.r2.map((s: any) => `${s.winner.teamName}`).join(' def ')} · WCF: ${sim.playoffBracket.western.cf.home.teamName} ${sim.playoffBracket.western.cf.homeWins}-${sim.playoffBracket.western.cf.awayWins} ${sim.playoffBracket.western.cf.away.teamName} → ${sim.playoffBracket.western.champion.teamName} advance
Stanley Cup Final: ${sim.playoffBracket.final.home.teamName} ${sim.playoffBracket.final.homeWins}-${sim.playoffBracket.final.awayWins} ${sim.playoffBracket.final.away.teamName} → ${sim.playoffBracket.champion.teamName} WIN THE CUP` : ''}

Write 6 sections. Every number comes from the sim data above — do not estimate, approximate, or invent stats.

**THE TRADE, ONE YEAR LATER**
3-4 sentences. Use the projected stats above. How did the key players perform for their NEW teams?

**${teams[0]!.name.toUpperCase()}'S SEASON**
${isRebuilding
  ? `4-5 sentences. Use the exact finish position from the projection above. Paint the narrative around those numbers — low point, bright spot, draft pick significance.`
  : `4-5 sentences. Use the exact finish and playoff result from the bracket above. One defining moment. One unexpected development.`}

**AROUND THE LEAGUE**
4-5 sentences. 3 storylines — one surprise (refer to the standings and bracket above), one injury, one off-ice story.

**THE YEAR IN NUMBERS**
Use ONLY the numbers provided. Do not approximate, estimate, or calculate anything not given here.
- **Points leader:** ${sim?.leaders?.topScorer?.name ?? "—"}, ${sim?.leaders?.topScorer?.team ?? ""} — ${sim?.leaders?.topScorer?.pts ?? "??"} pts
- **Goals leader:** ${sim?.leaders?.goalsLeader?.name ?? "—"}, ${sim?.leaders?.goalsLeader?.team ?? ""} — ${sim?.leaders?.goalsLeader?.goals ?? "?"} G
- **Assists leader:** ${sim?.leaders?.assistsLeader?.name ?? "—"}, ${sim?.leaders?.assistsLeader?.team ?? ""} — ${sim?.leaders?.assistsLeader?.assists ?? "?"} A
- **GAA leader:** ${sim?.leaders?.topGoalie?.name ?? "—"}, ${sim?.leaders?.topGoalie?.team ?? ""} — ${sim?.leaders?.topGoalie?.gaa ?? "??"} GAA / .${String(Math.round((sim?.leaders?.topGoalie?.svp ?? 0) * 1000)).padStart(3,"0")} SV%
- **Presidents' Trophy:** ${sim?.leaders?.presidentsTrophy?.teamName ?? "—"} — ${sim?.leaders?.presidentsTrophy?.projectedPoints ?? "??"} pts
- **Stanley Cup Champion:** ${sim?.playoffBracket?.champion?.teamName ?? sim?.leaders?.cupWinner?.teamName ?? "—"} def ${sim?.playoffBracket?.final ? `${sim.playoffBracket.final.home.teamName === sim.playoffBracket.champion.teamName ? sim.playoffBracket.final.away.teamName : sim.playoffBracket.final.home.teamName} ${sim.playoffBracket.final.homeWins}-${sim.playoffBracket.final.awayWins}` : "—"}
- **Hart Trophy (MVP):** ${sim?.leaders?.hart?.name ?? "—"}, ${sim?.leaders?.hart?.team ?? ""} — ${sim?.leaders?.hart?.pts ?? "?"} pts
- **Norris Trophy (best D):** ${sim?.leaders?.norris?.name ?? "—"}, ${sim?.leaders?.norris?.team ?? ""} — ${sim?.leaders?.norris?.pts ?? "?"} pts
- **Vezina Trophy (best G):** ${sim?.leaders?.vezina?.name ?? "—"}, ${sim?.leaders?.vezina?.team ?? ""} — ${sim?.leaders?.vezina?.gaa ?? "??"} GAA
- **Conn Smythe:** ${sim?.leaders?.connSmythe?.name ?? "—"}, ${sim?.leaders?.connSmythe?.team ?? ""}
- **Calder Trophy:** ${sim?.leaders?.calder?.name ?? "—"}, ${sim?.leaders?.calder?.team ?? ""}

**THE DRAFT LOTTERY**
${(() => {
  const tradedAwayPick = executedTrades.some((t: any) =>
    t.outgoing.some((a: any) => a.position === "Pick" && (a.round ?? 1) === 1)
  );
  if (tradedAwayPick) return `${teams[0]!.name} traded away their 1st round pick. 2 sentences about watching another team use it.`;
  if (sim?.homeTeam && !sim.homeTeam.madePlayoffs)
    return `${teams[0]!.name} finished #${sim.homeTeam.leagueRank}/32 with ${sim.homeTeam.projectedPoints} pts. 3 sentences on what their lottery position means and who they might draft.`;
  return `2 sentences. ${sim?.leaders?.draftLottery?.teamName ?? "The worst team"} won the lottery. Who is the top prospect?`;
})()}

**VERDICT**
Two sentences per team — what went right or wrong, definitive judgment on the GM's call.

Simulation #${sim?.seed ?? "—"} · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}. Write like someone who watched every game.`;
    })();

    if (simAbortRef.current) simAbortRef.current.abort();
    simAbortRef.current = new AbortController();

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: simAbortRef.current.signal,
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1800,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      setSimResult(data.content?.[0]?.text ?? "Simulation unavailable.");
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setSimResult("Simulation unavailable — please try again.");
    }
    setSimLoading(false);
  }, [teams, db, executedTrades]);
  useEffect(() => {
    // Issue 10: Don't auto-evaluate. Clear old verdict so user must click "Make the call" again.
    if (evaluated) {
      setEvaluated(false);
      setVerdict(null);
      setVerdictOpen(false);
    }
  }, [blocks, teams]);

  // ── Claude GM Analysis ────────────────────────────────────────
  const generateClaudeAnalysis = useCallback(async () => {
    if (!verdict || !teams[0] || !teams[1]) return;

    setVerdict(v => v ? { ...v, claudeLoading: true, claudeAnalysis: undefined } : v);

    const outgoing = blocks[0];
    const incoming = blocks[1];

    const describeAssets = (assets: Asset[]) =>
      assets.map(a =>
        a.position === "Pick"
          ? `${a.year} ${a.round === 1 ? "1st" : a.round === 2 ? "2nd" : `${a.round}th`} round pick`
          : `${a.name} (${a.position}, age ${a.age}, $${a.capHit}M x ${a.yearsRemaining}yr, ${a.ptsPace.toFixed(0)} pts/82)`
      ).join(", ");

    const flagSummary = verdict.flags
      .filter(f => f.severity === "HARD" || f.severity === "SOFT")
      .map(f => `• [${f.severity}] ${f.headline}`)
      .join("\n");

    const prompt = `You are a senior NHL front office analyst writing an internal trade evaluation memo. Base your analysis ONLY on the data provided — do not invent injuries, contract disputes, locker room issues, or league context not shown here.

TRADE DETAILS:
${teams[0].name} (${teams[0].phase}, #${teams[0].standing}/32, $${teams[0].capSpace}M cap space) sends:
  ${describeAssets(outgoing)}

${teams[1].name} (${teams[1].phase}, #${teams[1].standing}/32, $${teams[1].capSpace}M cap space) sends:
  ${describeAssets(incoming)}

ANALYTICS:
- NAV balance: ${teams[0].name} nets ${verdict.metrics.homeNetGain > 0 ? "+" : ""}${verdict.metrics.homeNetGain.toFixed(0)} NAV points
- Estimated Wins Added: ${verdict.metrics.ewaHome > 0 ? "+" : ""}${verdict.metrics.ewaHome.toFixed(1)} wins in the standings
- Contention Window Shift: ${verdict.metrics.cwiYears > 0 ? "opens/extends by" : verdict.metrics.cwiYears < 0 ? "shortens by" : "neutral,"} ${Math.abs(verdict.metrics.cwiYears).toFixed(1)} years
- Production delta: ${verdict.metrics.ptsGain > 0 ? "+" : ""}${verdict.metrics.ptsGain.toFixed(1)} pts/82
- Cap impact: ${verdict.metrics.capDelta > 0 ? "+" : ""}${verdict.metrics.capDelta.toFixed(1)}M
- Value imbalance: ${verdict.metrics.variance.toFixed(0)}%
- Verdict: ${verdict.status}

GM LOGIC FLAGS:
${flagSummary || "None — trade passes all logic checks"}

Write a concise 3-paragraph front office memo. Each paragraph maximum 4 sentences.
1. What each team's organizational motivation is based on their phase and standing — stick to what the data shows
2. Whether the analytics support the trade for BOTH teams — use the NAV/EWA/CWI numbers directly
3. One clear recommendation — accept, reject, or counter with specific conditions

RULES: No invented context. No speculation about players not in this trade. Complete every sentence. Use the numbers provided.`;

    if (memoAbortRef.current) memoAbortRef.current.abort();
    memoAbortRef.current = new AbortController();

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: memoAbortRef.current.signal,
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 700,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[Claude memo] API error:", data);
        setVerdict(v => v ? { ...v, claudeAnalysis: "Analysis unavailable — please try again.", claudeLoading: false } : v);
        return;
      }
      const text = data.content?.[0]?.text ?? "Analysis unavailable.";
      setVerdict(v => v ? { ...v, claudeAnalysis: text, claudeLoading: false } : v);
    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("[Claude memo] fetch error:", e);
      setVerdict(v => v ? { ...v, claudeAnalysis: `Analysis unavailable — please try again.`, claudeLoading: false } : v);
    }
  }, [verdict, teams, blocks]);

  // ── Trade Partner Finder ─────────────────────────────────────
  // "Who wants this package?" — scores all 32 teams on fit
  const findMatches = useCallback(async (packageBlocks: Asset[]) => {
    if (!packageBlocks.length || !teams[0]) return;
    setMatchLoading(true);
    setMatchResults(null);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assets:     packageBlocks,
          homeTeamId: teams[0]?.id ?? "",
          allTeams:   db.teams,
          allPlayers: db.players,
          navMap:     Object.fromEntries(
            Object.entries(navMap).map(([id, r]) => [id, {
              total: r.total, off: r.off, def: r.def, age: r.age, cap: r.cap
            }])
          ),
        }),
      });
      if (res.ok) setMatchResults(await res.json());
    } catch (e) {
      console.error("[findMatches]", e);
    } finally {
      setMatchLoading(false);
    }
  }, [teams, db, navMap]);

  const runEval = useCallback(async () => {
    const liveT0 = db.teams.find(t => t.id === teams[0]?.id) ?? teams[0];
    const liveT1 = db.teams.find(t => t.id === teams[1]?.id) ?? teams[1];

    if (evalAbortRef.current) evalAbortRef.current.abort();
    evalAbortRef.current = new AbortController();

    try {
      const v = await fetchTradeVerdict(
        blocks[0], blocks[1], liveT0, liveT1,
        allHomeRoster, allPartnerRoster,
        evalAbortRef.current.signal
      );
      if (v) { setVerdict(v); setEvaluated(true); setVerdictOpen(true); }
    } catch (e: any) {
      if (e.name !== "AbortError") console.error("[runEval]", e.message);
    }
  }, [blocks, teams, db.teams, allHomeRoster, allPartnerRoster]);

  // Client-side package compression — mirrors evaluate/route.ts compressPackage
  // Shows users the roster-slot-aware value as they build, so the audit result
  // isn't a surprise. Only visible when compression materially changes things.
  // Package compression — age tier constants from season-config (single source of truth).
  // Formula mirrors compressPackage in xnav-engine; rates change by editing season-config only.
  const compressBlock = (block: Asset[]): number => {
    if (block.length === 0) return 0;
    const picks   = block.filter(a => a.position === "Pick");
    const players = block.filter(a => a.position !== "Pick");
    const pickValue = picks.reduce((s, a) => s + (navMap[a.id]?.total ?? 0), 0);
    if (players.length === 0) return pickValue;
    const sorted = [...players]
      .map(a => ({ nav: navMap[a.id]?.total ?? 0, age: a.age ?? 27 }))
      .sort((a, b) => b.nav - a.nav);
    let decaySum = 0, penaltySum = 0;
    sorted.forEach((a, i) => {
      decaySum += a.nav * Math.pow(ageDecayRate(a.age), i);
      if (i > 0) penaltySum += ageSlotPenalty(a.age);
    });
    return pickValue + Math.max(0, decaySum - penaltySum);
  };

  const navA = blocks[0].reduce((s, a) => s + (navMap[a.id]?.total ?? 0), 0);
  const navB = blocks[1].reduce((s, a) => s + (navMap[a.id]?.total ?? 0), 0);
  const cNavA = compressBlock(blocks[0]);
  const cNavB = compressBlock(blocks[1]);
  const homeNetGain = cNavB - cNavA;

  // Always pull live cap space from db — teams state can be stale after trade execution
  const liveHome    = db.teams.find(t => t.id === teams[0]?.id) ?? teams[0];
  const livePartner = db.teams.find(t => t.id === teams[1]?.id) ?? teams[1];
  const capA = liveHome
    ? liveHome.capSpace
        + blocks[0].reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0)
        - blocks[1].reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0)
    : 0;
  const capB = livePartner
    ? livePartner.capSpace
        + blocks[1].reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0)
        - blocks[0].reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0)
    : 0;

  if (booting) return <LoadingScreen />;
  if (error) return <ErrorScreen msg={error} />;

  const sc = verdict ? STATUS_CONFIG[verdict.status] : STATUS_CONFIG.IDLE;

  return (
    <>
    <main className="min-h-screen antialiased select-none overflow-x-hidden bg-paper text-ink font-serif">

      {/* Trade Proposal Engine Modal */}
      {tradeRequest && tradeRequest.length > 0 && (
        <Suspense fallback={<LoadingScreen />}>
        <TradeProposalEngine
          outgoingBlock={tradeRequest}
          homeTeam={teams[0]}
          allTeams={db.teams}
          allPlayers={db.players}
          navMap={(() => {
            const base = Object.fromEntries(Object.entries(navMap).map(([id, r]) => [id, r.total]));
            // Retained assets are already updated in navMap via the blocks useEffect
            // No client-side getXNAV calls needed
            return base;
          })()}
          onClose={() => setTradeRequest(null)}
          onLoadTrade={(partner: Team, outgoing: Asset[], incoming: Asset[]) => {
            const partnerTeam = db.teams.find(t => t.id === partner.id) ?? null;
            setTeams([teams[0], partnerTeam]);
            setBlocks([outgoing, incoming]);
            setTradeRequest(null);
            setEvaluated(false);
            setVerdict(null);
          }}
        />
        </Suspense>
      )}
      {/* ── Team Selection Modal ─────────────────────────────────── */}
      {showTeamSelect && db.teams.length > 0 && typeof document !== 'undefined' && createPortal(
        (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(28,20,10,0.88)', backdropFilter: 'blur(4px)' }}>
          <div className="relative w-full max-w-lg"
            style={{ background: 'var(--ledger-card-light)', borderRadius: '2px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>

            {/* Header rule */}
            <div style={{ borderTop: '4px double #1c140a', borderBottom: '1px solid #b8a070', padding: '20px 28px 14px' }}>
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-[0.5em] mb-2 text-ledger-ink-faint font-mono">
                  The Hockey Ledger · GM Challenge
                </div>
                <h2 className="font-black" style={{ fontSize: '1.6rem', color: 'var(--ledger-ink)', lineHeight: 1.1 }}>
                  Think you can do better<br/>than your GM?
                </h2>
                <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--ledger-brown)', fontStyle: 'italic' }}>
                  Pick your franchise. Make your moves. Sim a year and find out if you had what it takes — or if your GM was right all along.
                </p>
              </div>
            </div>

            <div style={{ padding: '16px 28px 20px' }}>
              <div className="flex justify-between items-center mb-3">
                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-ledger-ink-faint font-mono">
                  Select Your Franchise
                </div>
                <button onClick={() => setShowTeamSelect(false)} className="text-[10px] uppercase font-bold text-ledger-ink-faint hover:text-ledger-ink transition-colors">
                  Close ✕
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5 mb-4" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {db.teams
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(t => {
                    const isSelected = teams[0]?.id === t.id;
                    const phase = t.phase ?? "";
                    const phaseColor =
                      phase === "Contender"  ? 'var(--ledger-green)' :
                      phase === "Bubble"     ? 'var(--ledger-navy)' :
                      phase === "Retooling"  ? 'var(--ledger-amber)' :
                      phase === "Rebuilding" ? 'var(--ledger-red)' :
                      'var(--ledger-brown)';
                    const cityName = t.name.split(' ').slice(0, -1).join(' ');
                    const teamName = t.name.split(' ').slice(-1)[0];
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTeams(prev => {
                            const partner = prev[1]?.id === t.id
                              ? db.teams.find(x => x.id !== t.id) ?? null
                              : prev[1];
                            return [t, partner];
                          });
                          setBlocks([[], []]);
                        }}
                        className="p-2 text-left transition-all"
                        style={{
                          background: isSelected ? 'var(--ledger-ink)' : 'var(--ledger-card)',
                          border: `1px solid ${isSelected ? 'var(--ledger-ink)' : 'var(--ledger-rule-mid)'}`,
                          borderRadius: '2px',
                        }}
                      >
                        <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                          <img src={`https://assets.nhle.com/logos/nhl/svg/${t.id}_light.svg`} alt={t.id} className="w-8 h-8 opacity-90 mix-blend-multiply" onError={(e) => (e.currentTarget.style.display = 'none')} />
                          <div className="text-[9px] font-black uppercase tracking-widest text-center leading-tight" style={{
                            color: isSelected ? 'var(--ledger-ink-faint)' : phaseColor,
                            lineHeight: 1.1
                          }}>
                            {phase}
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>

              {/* Selected team summary */}
              {teams[0] && (
                <div className="mb-4 p-3" style={{ background: 'var(--ledger-card)', border: '1px solid #b8a070' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-black text-[14px] text-ledger-ink font-serif">
                        {teams[0].name}
                      </div>
                      <div className="text-[11px] mt-0.5 text-ledger-ink-faint font-mono">
                        #{teams[0].standing}/32 · {teams[0].phase} · ${teams[0].capSpace.toFixed(1)}M cap space
                      </div>
                    </div>
                    <div className="text-2xs font-black px-2 py-1" style={{
                      color: 'var(--ledger-red)', border: '1px solid rgba(184,48,32,0.4)',
                    }}>
                      YOUR FRANCHISE
                    </div>
                  </div>
                </div>
              )}

              <button
                disabled={!teams[0]}
                onClick={() => {
                  setHomeTeamLocked(true); // lock immediately on confirm
                  setShowTeamSelect(false);
                }}
                className="w-full py-3.5 font-black uppercase tracking-widest text-[11px] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: teams[0] ? 'var(--ledger-ink)' : 'var(--ledger-rule-mid)',
                  color: 'var(--ledger-card-light)',
                  borderRadius: '2px',
                }}
              >
                {teams[0] ? `✦ Take Control of the ${teams[0].name} ✦` : 'Select a team to begin'}
              </button>

              <p className="text-center mt-2 text-[11px] text-ledger-rule font-mono">
                Your franchise locks in when you confirm. Reset via Void All Trades.
              </p>
            </div>
          </div>
        </div>
        ),
        document.body
      )}

      {/* ── Front Office Memo Modal ───────────────────────────── */}
      {showMemo && verdict?.claudeAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          style={{ background: 'rgba(28,20,10,0.75)', backdropFilter: 'blur(3px)' }}
          onClick={() => setShowMemo(false)}>
          <div className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--ledger-card-light)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', borderRadius: '2px' }}
            onClick={e => e.stopPropagation()}>

            {/* Memo letterhead */}
            <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-4" style={{ borderBottom: '2px solid #1c140a' }}>
              <div className="text-center mb-4">
                <div className="text-2xs uppercase tracking-[0.5em] mb-1 text-ledger-ink-faint font-mono">
                  Quant Front Office — Internal Memorandum
                </div>
                <div className="font-black text-2xl" style={{ color: 'var(--ledger-ink)' }}>
                  Trade Evaluation Report
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-2xs font-mono">
                {[
                  ["TO",      "GM & Hockey Operations Leadership"],
                  ["FROM",    "Senior Front Office Analyst — Claude"],
                  ["DATE",    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
                  ["RE",      `${teams[0]?.name ?? 'Home'} ↔ ${teams[1]?.name ?? 'Partner'} Trade`],
                  ["VERDICT", verdict.status],
                  ["NAV",     `${verdict.metrics.homeNetGain > 0 ? '+' : ''}${verdict.metrics.homeNetGain.toFixed(0)} for ${teams[0]?.name ?? 'Home'}`],
                ].map(([label, val]) => (
                  <div key={label} className="flex gap-3">
                    <span className="font-black w-16 shrink-0 text-ledger-brown">{label}:</span>
                    <span style={{ color: (label === "VERDICT" && (verdict.status === "WIN" || verdict.status === "FAIR")) ? 'var(--ledger-green)'
                      : (label === "VERDICT" && (verdict.status === "BLOCKED" || verdict.status === "DECLINED")) ? 'var(--ledger-red)'
                      : 'var(--ledger-ink)' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Memo body */}
            <div className="px-4 sm:px-8 py-5 sm:py-6 relative">
              {/* Faint ruled lines like a memo pad */}
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, rgba(184,160,112,0.2) 28px)',
                backgroundSize: '100% 28px',
                top: '24px'
              }} />
              <p className="relative text-[12px] leading-[1.85]" style={{
                color: 'var(--ledger-ink)',
                whiteSpace: 'pre-wrap',
              }}>
                {verdict.claudeAnalysis}
              </p>
            </div>

            {/* Verdict stamp + disclaimer */}
            <div className="px-4 sm:px-8 pb-5 sm:pb-6 flex items-end justify-between flex-wrap gap-3" style={{ borderTop: '1px solid #b8a070', paddingTop: '16px' }}>
              <div className="text-2xs" style={{ color: 'var(--ledger-ink-faint)', lineHeight: 1.6 }}>
                CONFIDENTIAL — Internal Use Only<br />
                Valuations are analytical estimates only.
              </div>
              <div style={{ transform: 'rotate(-4deg)', transformOrigin: 'center' }}>
                <div className="px-4 py-1.5 text-center font-black text-base uppercase tracking-widest" style={{
                  border: `3px solid ${['WIN','FAIR'].includes(verdict.status) ? 'var(--ledger-green)' : 'var(--ledger-red)'}`,
                  color: ['WIN','FAIR'].includes(verdict.status) ? 'var(--ledger-green)' : 'var(--ledger-red)',
                  opacity: 0.85,
                }}>
                  {verdict.status}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-4 sm:px-8 py-3 flex justify-between items-center flex-wrap gap-2" style={{ borderTop: '1px solid #b8a070' }}>
              <button onClick={() => { setShowMemo(false); generateClaudeAnalysis(); }}
                className="text-2xs font-black uppercase tracking-wider transition-opacity hover:opacity-60 text-ledger-ink-faint font-mono">
                ↺ Regenerate
              </button>
              <button onClick={() => setShowMemo(false)}
                className="text-2xs font-black uppercase tracking-wider px-4 py-1.5"
                style={{ background: 'var(--ledger-ink)', color: 'var(--ledger-card-light)', borderRadius: '2px' }}>
                Close ✕
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 pointer-events-none bg-newsprint" />

      <div className="relative w-full max-w-[1700px] mx-auto px-4 lg:px-6 py-6 lg:py-8 flex flex-col gap-5 overflow-x-hidden">

        <Header activeTab="trade" />
        <TradeHistoryBar db={db.players.length > 0 ? db : null} />

        {/* ── Team Strands — full width above trade grid ── */}
        {teams[0] && teams[1] && (
          <div className="mb-4">
            <TeamDNA
              homeTeam={teams[0]}
              partnerTeam={teams[1]}
              homeRoster={allHomeRoster}
              partnerRoster={allPartnerRoster}
              homeBlocks={blocks[0]}
              partnerBlocks={blocks[1]}
              navMap={navMap}
              db={db}
            />
          </div>
        )}

        <TugBar homeNetGain={homeNetGain} navA={navA} navB={navB} cNavA={cNavA} cNavB={cNavB} />

        {/* ── Main Trade Grid ── */}
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_260px_1fr] xl:grid-cols-[1fr_280px_1fr] gap-4 lg:gap-5 items-stretch mt-2">
          {/* Home panel */}
          <TradePanel idx={0} team={teams[0]} nav={navA} capSpace={capA} db={db}
            label="Your Franchise" accent="HOME"
            locked={homeTeamLocked}
            onRequestTrade={(a) => setTradeRequest([a])}
            onRequestBlockTrade={(block) => setTradeRequest(block)} />

          {/* Middle controls — on mobile sits between panels */}
          <div className="flex flex-col gap-3 lg:pt-8">
            {teams[0] && teams[1] && (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <ModeBadge team={teams[0]} roster={allHomeRoster} label="Home Timeline" />
                  <ModeBadge team={teams[1]} roster={allPartnerRoster} label="Partner Timeline" />
                </div>
              </div>
            )}

            {/* ── GM Audit button — only active when both sides have assets ── */}
            {(() => {
              const missingHome    = blocks[0].length === 0;
              const missingPartner = blocks[1].length === 0;
              const missingTeams   = !teams[0] || !teams[1];
              const ready = !missingHome && !missingPartner && !missingTeams;

              const hint = missingTeams
                ? "Select both teams to enable the audit"
                : missingHome && missingPartner
                ? "Add assets to both sides to begin"
                : missingHome
                ? `Add assets to ${teams[0]?.name ?? "your side"} to continue`
                : missingPartner
                ? `Add assets to ${teams[1]?.name ?? "the other side"} to continue`
                : null;

              return (
                <>
                  <div className={`py-3 lg:py-0 ${verdict && verdict.status !== "IDLE" ? "hidden lg:block" : ""}`}>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { runEval(); setVerdictOpen(true); }}
                        disabled={!ready}
                        className="flex-grow py-3.5 font-black uppercase tracking-widest text-[11px] transition-all duration-200 disabled:opacity-40 md:disabled:opacity-25 md:disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]"
                        style={{ background: 'var(--ledger-ink)', color: 'var(--ledger-card-light)', borderRadius: '2px' }}
                        onMouseEnter={e => ready && (e.currentTarget.style.opacity = '0.8')}
                        onMouseLeave={e => ready && (e.currentTarget.style.opacity = '1')}>
                        Make the Call
                      </button>
                      
                      {(teams[0] || teams[1] || blocks[0].length > 0) && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.href).then(() => {
                              setLinkCopied(true);
                              setTimeout(() => setLinkCopied(false), 2000);
                            });
                          }}
                          className="shrink-0 flex items-center justify-center w-12 transition-all duration-200"
                          style={{
                            background: 'transparent',
                            border: `1px solid ${linkCopied ? 'var(--ledger-green)' : 'var(--ledger-rule)'}`,
                            color: linkCopied ? 'var(--ledger-green)' : 'var(--ledger-ink-faint)',
                            borderRadius: '2px',
                          }}
                          title="Copy Trade Link"
                        >
                          {linkCopied ? '✓' : '🔗'}
                        </button>
                      )}
                    </div>
                    {hint && (
                      <p className="text-center font-mono mt-2" style={{ fontSize: "10px", color: "var(--ledger-ink-faint)" }}>
                        {hint}
                      </p>
                    )}
                  </div>
                </>
              );
            })()}

            {/* ── Who Wants This? — Trade Partner Finder ── */}
            {(blocks[0].length > 0 || blocks[1].length > 0) && (
              <button
                onClick={() => findMatches(blocks[0].length > 0 ? blocks[0] : blocks[1])}
                disabled={matchLoading}
                className="w-full py-3 font-black uppercase tracking-widest text-[11px] transition-all duration-200 disabled:opacity-50 active:scale-[0.97]"
                style={{ background: 'var(--ledger-navy)', color: 'white', border: '2px solid var(--ledger-navy)' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                {matchLoading ? "Finding matches…" : "◈ Who Wants This Package?"}
              </button>
            )}

            {/* ── Match Results ── */}
            {matchResults && matchResults.matches.length > 0 && (() => {
              const displayed = approvedOnly
                ? matchResults.matches.filter(m => m.capFit !== "OVER")
                : matchResults.matches;
              return (
              <div className="mt-3 border-t-2 pt-3" style={{ borderColor: 'var(--ledger-navy)' }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-2xs font-black uppercase tracking-[0.4em] font-mono"
                    style={{ color: 'var(--ledger-navy)' }}>
                    Best-Fit Trade Partners
                  </div>
                  <button
                    onClick={() => setApprovedOnly(v => !v)}
                    className="text-2xs font-mono px-2 py-0.5 rounded transition-colors"
                    style={{
                      background: approvedOnly ? 'var(--ledger-green)' : 'var(--ledger-rule-light)',
                      color: approvedOnly ? 'white' : 'var(--ledger-ink-faint)',
                      fontWeight: 900, border: 'none', cursor: 'pointer',
                    }}>
                    {approvedOnly ? '✓ Approved' : 'All Teams'}
                  </button>
                </div>
                <div className="text-2xs font-mono mb-3 text-center" style={{ color: 'var(--ledger-ink-faint)' }}>
                  Package: {matchResults.packageNAV > 0 ? "+" : ""}{matchResults.packageNAV.toFixed(0)} NAV
                  · ${matchResults.packageCap.toFixed(1)}M cap
                  {matchResults.avgAge > 0 ? ` · avg ${matchResults.avgAge.toFixed(0)} yrs old` : ""}
                  {approvedOnly && ` · ${displayed.length} of ${matchResults.matches.length} teams`}
                </div>
                {displayed.length === 0 && (
                  <div className="text-center text-2xs font-mono py-3" style={{ color: 'var(--ledger-ink-faint)' }}>
                    No teams can absorb this package under the cap.
                    <button onClick={() => setApprovedOnly(false)} className="ml-2 underline">Show all</button>
                  </div>
                )}
                <div className="space-y-2 overflow-y-auto pr-1"
                  style={{ maxHeight: '420px', scrollbarWidth: 'thin', scrollbarColor: 'var(--ledger-rule) transparent' }}>
                  {displayed.map((m, i) => (
                    <div key={m.teamId} className="rounded p-2.5"
                      style={{
                        background: i === 0 ? 'rgba(26,46,92,0.08)' : 'var(--ledger-card)',
                        border: i === 0 ? '1px solid var(--ledger-navy)' : '1px solid var(--ledger-rule)',
                      }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs font-black" style={{ color: 'var(--ledger-ink-faint)', fontFamily: 'monospace' }}>
                            #{i + 1}
                          </span>
                          <span className="font-black text-[11px]" style={{ color: 'var(--ledger-ink)' }}>
                            {m.teamName}
                          </span>
                          <span className="text-2xs font-mono px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--ledger-rule-light)', color: 'var(--ledger-ink-body)' }}>
                            {m.phase}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs font-mono"
                            style={{ color: m.capFit === "FITS" ? 'var(--ledger-green)' : m.capFit === "TIGHT" ? 'var(--ledger-amber)' : 'var(--ledger-red)' }}>
                            {m.capFit}
                          </span>
                          {/* Score bar */}
                          <div className="flex items-center gap-1">
                            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ledger-rule-light)' }}>
                              <div className="h-full rounded-full"
                                style={{ width: `${m.score}%`, background: m.score >= 65 ? 'var(--ledger-navy)' : m.score >= 45 ? 'var(--ledger-amber)' : 'var(--ledger-red)' }} />
                            </div>
                            <span className="text-2xs font-black font-mono" style={{ color: 'var(--ledger-ink)', minWidth: 24 }}>
                              {m.score}
                            </span>
                          </div>
                        </div>
                      </div>
                      {m.fitReasons.length > 0 && (
                        <div className="text-2xs font-mono space-y-0.5 mb-1">
                          {m.fitReasons.map((r, j) => (
                            <div key={j} style={{ color: 'var(--ledger-green)' }}>✓ {r}</div>
                          ))}
                        </div>
                      )}
                      {m.warnReasons.length > 0 && (
                        <div className="text-2xs font-mono space-y-0.5 mb-1">
                          {m.warnReasons.map((r, j) => (
                            <div key={j} style={{ color: 'var(--ledger-amber)' }}>⚠ {r}</div>
                          ))}
                        </div>
                      )}
                      <div className="text-2xs font-mono mt-1 pt-1" style={{ color: 'var(--ledger-ink-faint)', borderTop: '1px solid var(--ledger-rule-light)' }}>
                        Return profile: {m.returnProfile}
                      </div>
                    </div>
                  ))}
                </div>
                {displayed.length > 3 && (
                  <div className="text-2xs font-mono text-center mt-1.5"
                    style={{ color: 'var(--ledger-ink-faint)' }}>
                    ↕ scroll · {displayed.length} teams ranked
                  </div>
                )}
              </div>
              );
            })()}

            {/* My Team, My Call and Execute Trade moved to Verdict Bottom Sheet */}

            {executedTrades.length > 0 && (
              <button onClick={resetTrades}
                className="w-full py-2 font-black uppercase tracking-widest text-2xs transition-all btn-ghost">
                ↺ Void All Trades
              </button>
            )}

            {(blocks[0].length > 0 || blocks[1].length > 0) && (
              <>
                {/* Home Net Gain — prominent, right below TugBar context */}
                {verdict && verdict.status !== "IDLE" && (
                  <div style={{
                    textAlign: "center", padding: "6px 10px",
                    background: "var(--ledger-card)", border: "1px solid #c8b890",
                    fontFamily: "'Courier Prime', monospace",
                  }}>
                    <div style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase",
                                  letterSpacing: "0.15em", color: "var(--ledger-ink-faint)",
                                  marginBottom: 2 }}>
                      {teams[0]?.name?.split(" ").pop() ?? "Home"} Net Gain
                    </div>
                    <div style={{
                      fontSize: 20, fontWeight: 900, lineHeight: 1,
                      color: verdict.metrics.homeNetGain > 2   ? "var(--ledger-green)"
                           : verdict.metrics.homeNetGain < -2  ? "var(--ledger-red)"
                           : "var(--ledger-ink)",
                    }}>
                      {verdict.metrics.homeNetGain > 0 ? "+" : ""}
                      {verdict.metrics.homeNetGain.toFixed(0)}
                      <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 3,
                                     color: "var(--ledger-ink-faint)" }}>NAV</span>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <MiniStat label="Variance" val={verdict ? `${verdict.metrics.variance.toFixed(0)}%` : "—"} />
                  <MiniStat label="Cap Δ" val={verdict ? `${verdict.metrics.capDelta > 0 ? "+" : ""}${verdict.metrics.capDelta.toFixed(1)}M` : "—"} />
                </div>
              </>
            )}

            {verdict && verdict.status !== "IDLE" && (
              // Verdict now shown in sticky bottom sheet — see below
              <div className="text-2xs font-mono text-center py-2 rounded"
                style={{ background: 'var(--ledger-card)', color: 'var(--ledger-ink-faint)' }}>
                {verdict.status} — see verdict bar ↓
              </div>
            )}
          </div>

          <TradePanel idx={1} team={teams[1]} nav={navB} capSpace={capB} db={db}
            label="Trade Partner" accent="PARTNER"
            onRequestTrade={(a) => setTradeRequest([a])} />
        </div>

        {/* ── Executed Trades Log + Sim Panel ── */}
        {(executedTrades.length > 0 || showSimPanel) && (
          <div className="mt-6 bg-zinc-900/30 border border-zinc-800/40 rounded-2xl overflow-hidden">
            <div className="px-3 sm:px-6 py-3 border-b border-zinc-800/40 flex items-center justify-between">
              <span className="text-2xs font-black uppercase tracking-[0.4em] text-zinc-600">
                Simulated Universe — {executedTrades.length} Trade{executedTrades.length !== 1 ? "s" : ""} Executed
              </span>
              <div className="flex items-center gap-2">
                <button onClick={simYear} disabled={simLoading || executedTrades.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-black uppercase tracking-widest bg-purple-950 border border-purple-800 text-purple-400 hover:bg-purple-900 disabled:opacity-40 transition-all">
                  {simLoading
                    ? <><div className="w-2.5 h-2.5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin"/>Simulating...</>
                    : <>⚡ Sim a Year</>}
                </button>
              </div>
            </div>

            {/* Trade log */}
            <div className="px-5 py-3 space-y-2">
              {executedTrades.map((t) => (
                <div key={t.id} className="flex items-start gap-3 text-2xs">
                  <span className="text-emerald-500 font-black shrink-0">✓</span>
                  <div>
                    <span className="font-black text-zinc-300">{t.homeTeamName}</span>
                    <span className="text-zinc-600 mx-1.5">sent</span>
                    <span className="text-rose-400">{t.outgoing.map(a => a.name).join(", ")}</span>
                    <span className="text-zinc-600 mx-1.5">→ received</span>
                    <span className="text-cyan-400">{t.incoming.map(a => a.name).join(", ")}</span>
                    <span className="text-zinc-600 mx-1.5">from</span>
                    <span className="font-black text-zinc-300">{t.partnerTeamName}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Sim result */}
            {/* ── Projected Season Breakdown ── */}
            {simData && (
              <div style={{ borderTop: '1px solid #b8a070', padding: '16px 20px 12px' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-black uppercase tracking-widest text-ledger-ink-faint font-mono">
                    ⚡ Season Results
                  </span>
                  <span className="text-2xs text-ledger-rule font-mono">
                    Simulation #{simData.seed}
                  </span>
                </div>

                {/* Two team cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  {[simData.homeTeam, simData.partnerTeam].filter(Boolean).map((t: any) => (
                    <div key={t.teamId} style={{ background: 'var(--ledger-card)', border: '1px solid #b8a070', padding: '10px 12px' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-black text-[12px] text-ledger-ink font-serif">{t.teamName}</span>
                        <span className={`text-2xs font-black px-1.5 py-0.5`} style={{
                          color: t.madePlayoffs ? 'var(--ledger-green)' : 'var(--ledger-red)',
                          border: `1px solid ${t.madePlayoffs ? 'rgba(26,92,46,0.4)' : 'rgba(184,48,32,0.4)'}`,
                        }}>
                          {t.madePlayoffs ? '✓ PLAYOFFS' : '✗ MISSED'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { label: 'PTS', val: t.projectedPoints },
                          { label: 'RANK', val: `#${t.leagueRank}` },
                          { label: 'TOP SCORER', val: t.topScorer ? `${t.topScorer.name.split(' ').pop()} ${t.topScorer.projectedPts}pts` : '—' },
                          { label: 'GOALIE', val: t.goalie?.name.split(' ').pop() ?? '—' },
                          { label: 'GAA', val: t.goalie?.projectedGAA ?? '—' },
                          { label: 'SV%', val: t.goalie?.projectedSVP?.toFixed(3) ?? '—' },
                        ].map((s: any) => (
                          <div key={s.label} style={{ background: 'var(--ledger-cream)', border: '1px solid #c8b890', padding: '4px 6px', textAlign: 'center' }}>
                            <div style={{ fontSize: '6px', color: 'var(--ledger-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
                            <div style={{ fontSize: '9px', fontWeight: 900, color: 'var(--ledger-ink)', marginTop: '1px' }}>{s.val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* League results strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { label: "Presidents' Trophy", val: `${simData.leaders?.presidentsTrophy?.teamName} (${simData.leaders?.presidentsTrophy?.projectedPoints}pts)` },
                    { label: "Stanley Cup", val: simData.playoffBracket?.champion?.teamName ?? simData.leaders?.cupWinner?.teamName },
                    { label: "Points Leader", val: `${simData.leaders?.topScorer?.name?.split(' ').pop()} ${simData.leaders?.topScorer?.pts}pts` },
                    { label: "Draft Lottery", val: `${simData.leaders?.draftLottery?.teamName} (${simData.leaders?.draftLottery?.projectedPoints}pts)` },
                  ].map((s: any) => (
                    <div key={s.label} style={{ background: 'var(--ledger-card)', border: '1px solid #b8a070', padding: '6px 8px' }}>
                      <div style={{ fontSize: '6.5px', color: 'var(--ledger-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>{s.label}</div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ledger-ink)' }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* ── Playoff Bracket ── */}
                {simData.playoffBracket && (
                  <PlayoffBracket bracket={simData.playoffBracket} />
                )}
              </div>
            )}

            {simResult && (
              <div className="px-5 py-5" style={{ borderTop: '1px solid #b8a070' }}>
                <div className="flex items-center gap-2 mb-4" style={{ borderBottom: '1px solid #c8b890', paddingBottom: '8px' }}>
                  <span className="text-ledger-red">⚡</span>
                  <span className="text-2xs font-black uppercase tracking-widest text-ledger-ink-faint font-mono">
                    Claude · One Year Later
                  </span>
                </div>
                <div className="space-y-4">
                  {simResult.split('\n').map((line, i) => {
                    if (line.startsWith('## ') || line.startsWith('**THE ') || line.startsWith('**EDMONTON') || line.startsWith('**AROUND') || line.startsWith('**THE YEAR') || line.startsWith('**DRAFT') || line.startsWith('**VERDICT')) {
                      const text = line.replace(/^\#{1,3}\s+/, '').replace(/\*\*/g, '');
                      return <div key={i} className="font-black text-[11px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--ledger-ink)', borderBottom: '1px solid #c8b890', paddingBottom: '4px' }}>{text}</div>;
                    }
                    if (line.startsWith('- **') || line.startsWith('- ')) {
                      const text = line.replace(/^-\s+/, '').replace(/\*\*(.*?)\*\*/g, '$1');
                      return <div key={i} className="text-[11px] leading-relaxed pl-3" style={{ color: 'var(--ledger-ink-mid)', borderLeft: '2px solid #b8a070' }}>{text}</div>;
                    }
                    if (line.trim() === '' || line.startsWith('#')) return null;
                    // Split on **bold** markers and render with <strong> — no dangerouslySetInnerHTML
                    const boldParts = line.split(/\*\*(.*?)\*\*/g);
                    return (
                      <p key={i} className="text-[11px] leading-[1.8]" style={{ color: 'var(--ledger-ink-mid)' }}>
                        {boldParts.map((part, j) => j % 2 === 0 ? part : <strong key={j}>{part}</strong>)}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Player Comparison + Cap Projection ── */}
        {(blocks[0].length > 0 || blocks[1].length > 0) && (
          <Suspense fallback={<div className="h-32 animate-pulse bg-ledger-card rounded" />}>
            <>
              <PlayerComparison
                outgoing={blocks[0]}
                incoming={blocks[1]}
                navMap={navMap}
              />
              <CapProjection
                homeTeam={teams[0]}
                partnerTeam={teams[1]}
                homeRoster={allHomeRoster}
                partnerRoster={allPartnerRoster}
                outgoing={blocks[0]}
                incoming={blocks[1]}
              />
            </>
          </Suspense>
        )}

        {(blocks[0].length > 0 || blocks[1].length > 0) && <BreakdownTable blocks={blocks} navMap={navMap} />}
        {/* ── Footer — Glossary & Methodology ── */}
        <footer className="mt-12 pt-8" style={{ borderTop: '2px solid #1c140a' }}>
          <div className="text-center mb-6">
            <div className="text-2xs uppercase tracking-[0.5em] mb-1 text-ledger-ink-faint font-mono">
              Methodology & Glossary
            </div>
            <h2 className="text-xl font-black" style={{ color: 'var(--ledger-ink)' }}>
              How The Hockey Ledger Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
            {/* Valuation */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: 'var(--ledger-ink)', borderBottom: '1px solid #b8a070' }}>
                Player Valuation
              </div>
              <div className="space-y-3 text-[11px] text-ledger-ink-body leading-relaxed">
                <div>
                  <span className="font-black font-mono">NAV (Net Asset Value)</span>
                  <p className="mt-0.5">A player's overall trade value on a scale from roughly -100 to +1000. Combines offensive production, defensive contribution, contract cost, and age. Think of it as "how much is this player worth versus what they cost?" Positive NAV = providing more value than salary. Negative NAV = contract liability.</p>
                </div>
                <div>
                  <span className="font-black font-mono">NOIV (Net On-Ice Value)</span>
                  <p className="mt-0.5">A contextual multiplier based on how much a player elevates their teammates. Measures xG% relative to teammates on ice vs off, xGA suppression, and defensive zone deployment. A player with NOIV significantly above their raw stats is a hidden gem whose impact outstrips the box score.</p>
                </div>
                <div>
                  <span className="font-black font-mono">OPS · DPS · PS</span>
                  <p className="mt-0.5">Offensive and Defensive Point Shares — computed dynamically from the NHL Stats API using the Kubatko marginal goals framework. OPS measures offensive contribution to team points; DPS measures defensive contribution. These replace heuristic OFF/DEF estimates when live data is available.</p>
                </div>
              </div>
            </div>

            {/* STRAND metrics */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: 'var(--ledger-ink)', borderBottom: '1px solid #b8a070' }}>
                STRAND™ Node Glossary
              </div>
              <div className="space-y-2 text-[11px] text-ledger-ink-body leading-relaxed">
                <div>
                  <span className="font-black font-mono">SCR — Scoring Pace</span>
                  <p className="mt-0.5">Points per 82 games, normalized by position. D-men scored against a 0-80 scale; forwards against 0-100. A 73 SCR for a defenceman means he scores at the top of the D-man range — not that he scores like a forward.</p>
                </div>
                <div>
                  <span className="font-black font-mono">xG — Expected Goals</span>
                  <p className="mt-0.5">Shot quality and volume generated per 82 games. Accounts for where shots come from, not just how many. A player who generates high-danger chances scores higher than one who fires from the perimeter.</p>
                </div>
                <div>
                  <span className="font-black font-mono">TOI+ — Ice Time</span>
                  <p className="mt-0.5">Average time on ice per game. Normalized 10-27 minutes. Reflects coach trust and role deployment — players earning 24+ minutes are being used in every situation. Normalized so 27+ min = 100.</p>
                </div>
                <div>
                  <span className="font-black font-mono">SUPP — xGA Suppression</span>
                  <p className="mt-0.5">On-ice expected goals against vs off-ice, relative to teammates. Positive = team leaks fewer chances with this player on ice. Range -1.5 to +1.5. The defensive counterpart to xG — how well does this player prevent quality shots against?</p>
                </div>
                <div>
                  <span className="font-black font-mono">QoC — Opponent Ice-Time Rank</span>
                  <p className="mt-0.5">Rank of opponents faced by ice time — a measure of deployment difficulty, not raw opponent quality. Lower rank = harder matchups. Rank 1 faces the toughest competition in the league every night. A player with QoC rank 50 and good SUPP is genuinely shutting down the opposition's best players.</p>
                </div>
                <div>
                  <span className="font-black font-mono">DZ% — Defensive Zone Starts</span>
                  <p className="mt-0.5">Percentage of shifts starting in the defensive zone. High DZ% means the coach deploys this player specifically to protect their own net — a mark of trust in their defensive reliability. Inverted in STRAND so higher score = more defensive deployment.</p>
                </div>
                <div>
                  <span className="font-black font-mono">AGE — Age Curve</span>
                  <p className="mt-0.5">The trajectory of a player's value over the life of their contract. Young players show positive age curves (improving). Veterans past their peak show negative curves (declining). Used in the defensive strand to show whether a player's contribution will grow or shrink.</p>
                </div>
              </div>
            </div>

            {/* Archetypes & GM Logic */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: 'var(--ledger-ink)', borderBottom: '1px solid #b8a070' }}>
                Archetypes & GM Logic
              </div>
              <div className="space-y-3 text-[11px] text-ledger-ink-body leading-relaxed">
                <div>
                  <span className="font-black font-mono">D-Man Archetypes</span>
                  <p className="mt-0.5"><strong>Offensive D</strong> — 45+ pts/82, valued for scoring and powerplay (Makar, Bouchard). <strong>Two-Way D</strong> — 28-45 pts/82 with heavy minutes and balanced PS ratio (Morrissey, Josi). <strong>Shutdown D</strong> — under 28 pts/82 but faces elite competition, DPS dominates OPS (Slavin). <strong>Depth D</strong> — sheltered deployment, standard evaluation.</p>
                </div>
                <div>
                  <span className="font-black font-mono">EWA (Estimated Wins Added)</span>
                  <p className="mt-0.5">Translates NAV into actual standings wins. Roughly 7 NAV points equals one win above replacement, adjusted for where the team sits in the standings.</p>
                </div>
                <div>
                  <span className="font-black font-mono">CWI (Contention Window Index)</span>
                  <p className="mt-0.5">Estimates how a trade affects a team's championship window in years. Young players on cheap deals push CWI up. Aging veterans on long contracts push it down.</p>
                </div>
                <div>
                  <span className="font-black font-mono">GM Flags</span>
                  <p className="mt-0.5">The audit engine checks 15+ real-world factors: cap compliance, positional depth, NMC/NTC clause probability, timeline mismatch, defensive dependency, same-division conflicts. HARD flags block; SOFT flags warn. DECLINED means the model believes one side's GM wouldn't sign off — not that the trade is bad hockey.</p>
                </div>
              </div>
            </div>

            {/* STRAND visualization */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: 'var(--ledger-ink)', borderBottom: '1px solid #b8a070' }}>
                STRAND™ Visualization
              </div>
              <div className="space-y-3 text-[11px] text-ledger-ink-body leading-relaxed">
                <div>
                  <span className="font-black font-mono">What is STRAND™?</span>
                  <p className="mt-0.5">STRAND — Stylistic Trait & Rating Analysis for NHL Development — is a proprietary double-helix visualization encoding a player's complete on-ice identity into two intertwined strands. Navy = offensive profile. Red = defensive profile.</p>
                </div>
                <div>
                  <span className="font-black font-mono">Reading the Helix</span>
                  <p className="mt-0.5">A tight symmetric helix signals an elite two-way player. A helix where one strand dominates reveals a specialist — not a weakness, a definition. Slavin's helix is almost entirely red. That's not a criticism; it's the most accurate visual description of what makes him valuable. Node size scales with trait strength. Values shown directly on each node.</p>
                </div>
                <div>
                  <span className="font-black font-mono">Archetype Classification</span>
                  <p className="mt-0.5">When Point Shares data is available, the OPS/DPS ratio directly determines archetype: players with psRatio {'>'} 0.62 are Offensive, {'<'} 0.38 are Defensive, 0.38-0.62 with strong both strands are Two-Way or Elite Two-Way. Heuristic scoring fills in when PS data isn't available.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Value vs Worth note */}
          <div className="mb-6 p-4" style={{ border: '1px solid #b8a070', background: 'var(--ledger-card)' }}>
            <div className="text-2xs uppercase tracking-[0.4em] mb-2 text-ledger-ink-faint font-mono">
              A Note on Value vs Worth
            </div>
            <p className="text-[11px]" style={{ color: 'var(--ledger-ink-body)', lineHeight: 1.8, fontStyle: 'italic' }}>
              Every player in this database plays in the NHL. That alone puts them in the top 0.1% of hockey players on earth. A negative NAV does not mean a negative player — it means the contract represents negative trade value relative to production and term. Hockey is rooted in reality: every player who dresses for an NHL game is fundamentally one of the best athletes in the world at what they do. These numbers measure tradeable asset value, not human worth. Use them as a starting point for conversation, not a final verdict.
            </p>
          </div>

          <Footer />
        </footer>

      </div>
    </main>

    {/* ── Verdict Bottom Sheet ─────────────────────────────────────
        Always anchored to the bottom of the viewport — no scrolling needed.
        Collapsed: shows status pill + net NAV + tap to expand.
        Expanded: full VerdictPanel slides up into view.
        Auto-opens when GM Audit completes. */}
    {verdict && verdict.status !== "IDLE" && (() => {
      const v = verdict!; // narrow to non-null for TypeScript
      return (
      <div
        className="fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-out"
        style={{
          transform: verdictOpen ? 'translateY(0)' : 'translateY(calc(100% - 52px))',
          maxHeight: verdictOpen ? '70vh' : '52px',
          boxShadow: '0 -4px 32px rgba(28,20,10,0.35)',
          background: 'var(--ledger-card-light)',
          borderTop: `3px solid ${sc.cssColor}`,
        }}>

        {/* ── Handle / collapsed strip ─────────────────────────── */}
        <button
          onClick={() => setVerdictOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 sm:px-6"
          style={{ height: 52, background: 'transparent' }}>
          <div className="flex items-center gap-3">
            {/* Status pill */}
            <span className="px-2.5 py-0.5 font-black text-2xs uppercase tracking-widest rounded-sm"
              style={{ background: sc.cssColor, color: 'white', letterSpacing: '0.15em' }}>
              {v.status}
            </span>

            {/* Context-aware summary — NAV for WIN/LOSS/FAIR, flags for BLOCKED/DECLINED */}
            {(v.status === 'WIN' || v.status === 'FAIR' || v.status === 'LOSS') && (
              <span className="font-black text-[13px]" style={{
                color: v.status === 'WIN' ? 'var(--ledger-green)' : v.status === 'LOSS' ? 'var(--ledger-red)' : 'var(--ledger-ink)'
              }}>
                {v.metrics.homeNetGain > 0 ? '+' : ''}{v.metrics.homeNetGain.toFixed(0)} NAV
                <span className="font-normal text-2xs ml-2 font-mono" style={{ color: 'var(--ledger-ink-faint)' }}>
                  for {teams[0]?.name ?? 'Home'}
                </span>
              </span>
            )}

            {(v.status === 'BLOCKED' || v.status === 'DECLINED') && (() => {
              const hardFlags = v.flags.filter(f => f.severity === 'HARD');
              const topFlag   = hardFlags[0];
              return (
                <span className="font-black text-[13px]" style={{ color: 'var(--ledger-red)' }}>
                  {topFlag ? topFlag.headline : 'Trade blocked'}
                  {hardFlags.length > 1 && (
                    <span className="font-normal text-2xs ml-2 font-mono" style={{ color: 'var(--ledger-ink-faint)' }}>
                      +{hardFlags.length - 1} more
                    </span>
                  )}
                </span>
              );
            })()}

            {/* Soft flag count — shown for all statuses when present */}
            {v.flags.filter(f => f.severity === 'HARD').length > 0
              && v.status !== 'BLOCKED' && v.status !== 'DECLINED' && (
              <span className="text-2xs font-mono px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(166,53,36,0.12)', color: 'var(--ledger-red)' }}>
                {v.flags.filter(f => f.severity === 'HARD').length} hard flag{v.flags.filter(f => f.severity === 'HARD').length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <span className="text-2xs font-mono" style={{ color: 'var(--ledger-ink-faint)' }}>
            {verdictOpen ? 'collapse ↓' : 'expand ↑'}
          </span>
        </button>

        {/* ── Expanded content — scrollable ────────────────────── */}
        {verdictOpen && (
          <div className="overflow-y-auto px-4 sm:px-6 pb-6 pt-1"
            style={{ maxHeight: 'calc(70vh - 52px)', scrollbarWidth: 'thin', scrollbarColor: 'var(--ledger-rule) transparent' }}>
            <VerdictPanel
              verdict={v}
              sc={sc}
              expandedFlag={expandedFlag}
              setExpandedFlag={setExpandedFlag}
              onRequestClaudeAnalysis={generateClaudeAnalysis}
              onOpenMemo={() => setShowMemo(true)} />

            {/* ── Execute Trade Actions ── */}
            <div className="mt-4 flex flex-col gap-2">
              {(v.status === "FAIR" || v.status === "WIN") && (
                <button onClick={() => { executeTrade(); setHomeTeamLocked(true); setVerdictOpen(false); }}
                  className="w-full py-4 font-black uppercase tracking-widest text-[13px] transition-all duration-200 active:scale-[0.97] btn-green-ink rounded shadow-lg">
                  ✓ Execute Trade — File It
                </button>
              )}

              {/* My Team, My Call — override for DECLINED/BLOCKED/LOSS
                  Cannot override: hard NMC refusal, cap violations, floor violations
                  Cannot override: Hard flags raised by the opposing GM (they refuse the trade) */}
              {(v.status === "DECLINED" || v.status === "BLOCKED" || v.status === "LOSS") && (() => {
                const hasHardNhlRule = v.flags.some(f => f.severity === "HARD" && (
                  f.category === "CLAUSE" ||
                  f.category === "CAP_VIOLATION" ||
                  f.category === "FLOOR_VIOLATION"
                ));
                const isVetoCat = (cat: string) => ["POSITIONAL_REDUNDANCY", "TIMELINE_MISMATCH", "CLAUSE", "ASSET_SHAPE_MISMATCH", "ELITE_BLOCKADE", "REBUILD_LOGIC", "VALUE_VETO"].includes(cat);
                const partnerVetoed = v.flags.some(f => 
                  (f.vetoesSide === 1 || f.perspective === "partner") && 
                  (f.severity === "HARD" || isVetoCat(f.category))
                );
                
                const canOverride = !hasHardNhlRule && !partnerVetoed;

                if (canOverride) {
                  return (
                    <button onClick={() => { executeTrade(); setHomeTeamLocked(true); setVerdictOpen(false); }}
                      className="w-full py-3.5 font-black uppercase tracking-widest text-xs transition-all duration-200 active:scale-[0.97] rounded shadow-lg"
                      style={{
                        background: 'transparent',
                        border: '2px solid #b83020',
                        color: 'var(--ledger-red)',
                      }}
                      title="You're giving up value — but it's your team, your call. This trade will be locked in.">
                      ⚠ My Team, My Call — Override & Execute
                    </button>
                  );
                } else if (partnerVetoed) {
                  return (
                    <div className="w-full py-3 text-center font-mono text-[11px] rounded bg-red-950/20 text-red-500 border border-red-900/50">
                      Opposing GM has vetoed this trade.
                    </div>
                  );
                } else if (hasHardNhlRule) {
                  return (
                    <div className="w-full py-3 text-center font-mono text-[11px] rounded bg-red-950/20 text-red-500 border border-red-900/50">
                      Blocked by CBA regulations.
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        )}
      </div>
      );
    })()}

    {/* Bottom padding so page content isn't hidden behind verdict bar */}
    {verdict && verdict.status !== "IDLE" && <div style={{ height: 52 }} />}
  </>
  );
}

// ============================================================
// TRADE PANEL
// ============================================================

// ============================================================
// ASSET CARD — with retention slider and contract details
// ============================================================
// ============================================================
// ASSET CARD — with retention slider and contract details
// ============================================================

// ============================================================
// STRAND™ — Stylistic Trait & Rating Analysis for NHL Development
// A double-helix visualization of a player's offensive/defensive DNA.
// Strand A (top): Offensive traits — scoring, playmaking, xG generation
// Strand B (bottom): Defensive traits — suppression, compete, zone starts
// The two strands intertwine — balanced players have a tight helix,
// one-dimensional players show one strand dominating.
// ============================================================

// ============================================================
// ASSET DROPDOWN
// ============================================================

// ============================================================
// TUG-OF-WAR BAR
// ============================================================

// ── UI-only team classification ────────────────────────────────
// The real classifyTeam logic runs server-side. This stub just reads
// the phase field that the API already computed and attached to each team.
type TeamMode = "CONTENDER" | "BUBBLE" | "RETOOLING" | "REBUILDING" | "TANKING";

const classifyTeam = (team: Team, _roster: Asset[]): TeamMode => {
  const phase = team.phase ?? "";
  if (phase === "Contender")  return "CONTENDER";
  if (phase === "Bubble")     return "BUBBLE";
  if (phase === "Retooling")  return "RETOOLING";
  if (phase === "Tanking")    return "TANKING";
  if (phase === "Rebuilding") return "REBUILDING";
  // Fallback from standing if phase is missing
  if (team.standing <= 8)  return "CONTENDER";
  if (team.standing <= 14) return "BUBBLE";
  if (team.standing > 24)  return "TANKING";
  if (team.standing > 18)  return "REBUILDING";
  return "RETOOLING";
};

// ============================================================
// TEAM DNA — Aggregate STRAND™ for an entire roster
// Shows collective offensive/defensive profile and gaps vs
// championship template. Drives Need Score for GM logic.
// ============================================================

// Championship template — normalized 0-1 values calibrated to tighter ranges
// Based on Cup winner roster profiles (top-9F + top-4D TOI-weighted averages)
// computeRosterStrand — aggregates top-13 contributors' analytics into
// team-level trait scores (4 off + 4 def) using the same normalised 0–1 scale
// as the player STRAND. Trait order matches TeamStrand component.
function computeRosterStrand(roster: Asset[], navMap: Record<string, XNAVResult>): TeamStrandData | null {
  const fwds = roster
    .filter(p => ["C","W","L","R"].includes(p.position) && p.hasLiveStats && (p.games ?? 0) >= 20)
    .sort((a, b) => (b.avgTOI ?? 0) - (a.avgTOI ?? 0))
    .slice(0, 9);
  const dmen = roster
    .filter(p => p.position === "D" && p.hasLiveStats && (p.games ?? 0) >= 20)
    .sort((a, b) => (b.avgTOI ?? 0) - (a.avgTOI ?? 0))
    .slice(0, 4);
  const qualified = [...fwds, ...dmen];
  if (qualified.length === 0) return null;

  const norm = (val: number, mn: number, mx: number) =>
    Math.max(0, Math.min(1, (val - mn) / (mx - mn)));
  const safe = (v: number | null | undefined) => v ?? 0;

  let off = { OPS: 0, xG: 0, NOIV: 0, TOI: 0 };
  let def = { DPS: 0, SUPP: 0, Usage: 0, OZ: 0 };
  const n = qualified.length;

  for (const p of qualified) {
    const xnav = navMap[p.id] ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };
    const isD  = p.position === "D";
    const ops  = (p as any).ops as number | null | undefined;
    const dps  = (p as any).dps as number | null | undefined;
    const opsMax = 7, dpsMax = 4.5;   // team averages, not individual player ceilings
    // OPS: use point shares if available, fall back to scoring pace
    off.OPS  += ops != null ? norm(ops, 0, opsMax) : norm(safe(p.ptsPace), 0, isD ? 80 : 100);
    off.xG   += norm(safe(p.xGPace ?? 0), 0, isD ? 25 : 50);
    off.NOIV += norm(safe(p.xgRelTM ?? 0), -12, 12);
    off.TOI  += norm(safe(p.avgTOI), 10, 27);
    def.DPS  += dps != null ? norm(dps, 0, dpsMax) : norm(xnav.def, -60, 150);
    def.SUPP += norm(-(p.xgaRelTM ?? 0), -1.5, 1.5);
    def.Usage+= norm(400 - safe(p.qocRank ?? 400), 50, 380);
    def.OZ   += p.dzPct != null ? 1 - norm(safe(p.dzPct), 0.3, 0.7) : 0.5;
  }

  return {
    off: { OPS: off.OPS/n, xG: off.xG/n, NOIV: off.NOIV/n, TOI: off.TOI/n },
    def: { DPS: def.DPS/n, SUPP: def.SUPP/n, Usage: def.Usage/n, OZ: def.OZ/n },
  };
}

// ── Contention Cycle// ── Contention Cycle Computation ─────────────────────────────
// Derives Present and Future ratings (0-10) from X-NAV data.
// Present: what the roster is worth RIGHT NOW
// Future:  what the roster will be worth in ~3 years (age decay + prospects)
//
// Calibration:
//   10 = perfect elite roster (~2800 NAV across top 10 players)
//   7+ = legitimate Cup contender
//   5-7 = playoff team, window open
//   3-5 = bubble / retooling
//   0-3 = rebuilding / tanking

const PRESENT_RATING_MAX = 2800; // NAV benchmark for a "perfect 10" roster

function computeContention(
  roster: Asset[],
  navMap: Record<string, XNAVResult>,
): {
  present: number;
  future:  number;
  quadrant: "WIN_NOW" | "WINDOW_OPEN" | "WINDOW_OPENING" | "REBUILDING";
  presentLabel: string;
  futureLabel:  string;
} {
  if (roster.length === 0) return {
    present: 0, future: 0,
    quadrant: "REBUILDING",
    presentLabel: "No Data",
    futureLabel: "No Data",
  };

  const qualified = roster.filter(p =>
    p.position !== "Pick" && (p.games ?? 0) >= 10
  );

  // ── Present Rating ──────────────────────────────────────────
  // Top 6 forwards + top 3 D + top 1 goalie by NAV
  const forwards = qualified
    .filter(p => ["C","W","L","R","F"].includes(p.position))
    .sort((a, b) => (navMap[b.id]?.total ?? 0) - (navMap[a.id]?.total ?? 0))
    .slice(0, 6);

  const dmen = qualified
    .filter(p => p.position === "D")
    .sort((a, b) => (navMap[b.id]?.total ?? 0) - (navMap[a.id]?.total ?? 0))
    .slice(0, 3);

  const goalies = qualified
    .filter(p => p.position === "G")
    .sort((a, b) => (navMap[b.id]?.total ?? 0) - (navMap[a.id]?.total ?? 0))
    .slice(0, 1);

  const presentNAV = [...forwards, ...dmen, ...goalies]
    .reduce((s, p) => s + Math.max(0, navMap[p.id]?.total ?? 0), 0);

  const present = Math.min(10, Math.max(0,
    Math.round((presentNAV / PRESENT_RATING_MAX) * 10 * 10) / 10
  ));

  // ── Future Rating ───────────────────────────────────────────
  // Apply 3-year age decay to each player's NAV
  // Young players (≤23) get an upside bonus
  // Prospects in PROSPECT_TIERS add future value
  const peakAge = (pos: string) => pos === "D" ? 27 : pos === "G" ? 29 : 26;

  const futureNAV = [...forwards, ...dmen, ...goalies].reduce((s, p) => {
    const nav    = Math.max(0, navMap[p.id]?.total ?? 0);
    const age3   = p.age + 3;
    const peak   = peakAge(p.position);
    let decayFactor: number;

    if (age3 <= peak) {
      // Still approaching peak — slight upside
      decayFactor = 1.0 + Math.max(0, (peak - age3) * 0.02);
    } else {
      // Past peak — decline curve
      const yearsOver = age3 - peak;
      decayFactor = Math.max(0.3, 1.0 - (Math.pow(yearsOver, 1.4) * 0.05));
    }
    return s + nav * decayFactor;
  }, 0);

  // Prospect bonus — young players on roster with high upside
  const prospectBonus = qualified
    .filter(p => p.age <= 23 && (navMap[p.id]?.upside ?? 0) > 20)
    .reduce((s, p) => s + Math.min(150, (navMap[p.id]?.upside ?? 0) * 0.5), 0);

  const future = Math.min(10, Math.max(0,
    Math.round(((futureNAV + prospectBonus) / PRESENT_RATING_MAX) * 10 * 10) / 10
  ));

  // ── Quadrant classification ──────────────────────────────────
  const quadrant =
    present >= 6.5 && future >= 5.0 ? "WIN_NOW"        :
    present >= 5.0 && future >= 5.0 ? "WINDOW_OPEN"    :
    present >= 5.0 && future <  5.0 ? "WIN_NOW"        : // high present, low future = win now
    present <  5.0 && future >= 5.5 ? "WINDOW_OPENING" :
    "REBUILDING";

  const presentLabel =
    present >= 8.0 ? "Elite" :
    present >= 6.5 ? "Contender" :
    present >= 5.0 ? "Playoff Calibre" :
    present >= 3.5 ? "Fringe Playoff" :
    present >= 2.0 ? "Rebuilding" : "Tanking";

  const futureLabel =
    future >= 8.0 ? "Bright" :
    future >= 6.0 ? "Strong" :
    future >= 4.5 ? "Solid" :
    future >= 3.0 ? "Limited" : "Bleak";

  return { present, future, quadrant, presentLabel, futureLabel };
}

function TeamDNA({
  homeTeam, partnerTeam, homeRoster, partnerRoster, homeBlocks, partnerBlocks, navMap, db
}: {
  homeTeam: Team | null;
  partnerTeam: Team | null;
  homeRoster: Asset[];
  partnerRoster: Asset[];
  homeBlocks: Asset[];
  partnerBlocks: Asset[];
  navMap: Record<string, XNAVResult>;
  db: { players: Asset[]; teams: Team[] };
}) {
  const [expanded, setExpanded] = React.useState(true);

  // Post-trade roster: remove outgoing, add incoming
  // This makes the panel react live to trade changes
  const effectiveHomeRoster = React.useMemo(() => {
    const outIds = new Set(homeBlocks.map(a => a.id));
    const inIds  = new Set(partnerBlocks.map(a => a.id));
    return [
      ...homeRoster.filter(p => !outIds.has(p.id)),
      ...partnerBlocks.filter(a => a.position !== "Pick"),
    ];
  }, [homeRoster, homeBlocks, partnerBlocks]);

  const effectivePartnerRoster = React.useMemo(() => {
    const outIds = new Set(partnerBlocks.map(a => a.id));
    return [
      ...partnerRoster.filter(p => !outIds.has(p.id)),
      ...homeBlocks.filter(a => a.position !== "Pick"),
    ];
  }, [partnerRoster, homeBlocks, partnerBlocks]);

  const hasActiveTrade = homeBlocks.length > 0 || partnerBlocks.length > 0;

  const homeStrand    = computeRosterStrand(effectiveHomeRoster, navMap);
  const partnerStrand = computeRosterStrand(effectivePartnerRoster, navMap);
  if (!homeStrand || !partnerStrand) return null;

  // Contention ratings — derived from X-NAV
  const homeContention    = computeContention(effectiveHomeRoster, navMap);
  const partnerContention = computeContention(effectivePartnerRoster, navMap);

  // Gap vs championship template — negative = below template, positive = above
  const homeGaps = {
    off: Object.entries(CHAMP_TEMPLATE.off).map(([k, target]) => ({
      label: k, gap: (homeStrand.off as any)[k] - target
    })),
    def: Object.entries(CHAMP_TEMPLATE.def).map(([k, target]) => ({
      label: k, gap: (homeStrand.def as any)[k] - target
    })),
  };

  // Top needs: biggest negative gaps
  const allGaps = [...homeGaps.off, ...homeGaps.def]
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 3);

  // Team Strand displays — use TeamStrand component for clean 4+4 helix
  return (
    <div className="strands-panel">
      <button className="strands-header" onClick={() => setExpanded(e => !e)}>
        <div className="strands-header-left">
          <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
            <path d="M0,3 C2,3 2,9 4,9 C6,9 6,3 8,3 C10,3 10,9 12,9 C14,9 14,3 16,3"
              fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M0,9 C2,9 2,3 4,3 C6,3 6,9 8,9 C10,9 10,3 12,3 C14,3 14,9 16,9"
              fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="strands-title">Team Strands</span>
          {hasActiveTrade && <span className="strands-post-trade-badge">Post-Trade</span>}
        </div>
        <div className="strands-header-right" style={{ flexWrap: 'wrap', gap: '4px' }}>
          {allGaps.slice(0, 3).map(g => (
            <span key={g.label} className={`strands-need-pill${g.gap < -0.15 ? ' urgent' : ''}`}>
              {g.label} {g.gap < -0.15 ? '↓' : '~'}
            </span>
          ))}
          <span className="data-label">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="strands-body">
          <p className="strands-context" style={{ wordBreak: "break-word", overflowWrap: "break-word" }}>
            Each helix shows a team's aggregate offensive (navy) and defensive (red) profile across their top-9 forwards and top-4 D by ice time. The dashed gold line is the championship template. The dotted green line is the playoff threshold. Gaps below either line are roster needs.{hasActiveTrade ? " Updated to reflect the current trade." : ""}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-4" style={{ overflowX: 'auto' }}>
            {([
              { strand: homeStrand,    team: homeTeam,    label: hasActiveTrade ? "Post-trade" : undefined },
              { strand: partnerStrand, team: partnerTeam, label: undefined },
            ]).map(({ strand, team, label }: { strand: TeamStrandData | null; team: any; label: string | undefined }) => strand && team ? (
              <div key={team.id} style={{ flex: 1, minWidth: 260, background: 'var(--ledger-cream)',
                                         border: '1px solid #c8b890', padding: '10px 12px' }}>
                <TeamStrand strand={strand} teamName={team.name} label={label} />
              </div>
            ) : null)}
          </div>

          {/* ── Contention Quadrant ── */}
          {homeTeam && partnerTeam && (
            <div style={{ marginBottom: 16 }}>
              <ContentionQuadrant
                home={homeContention}
                partner={partnerContention}
                homeTeamName={homeTeam.name}
                partnerTeamName={partnerTeam.name}
              />
            </div>
          )}

          <div className="strands-gaps-header">
            {homeTeam?.name} — Roster Gaps vs Playoff & Championship Thresholds{hasActiveTrade ? " (post-trade)" : ""}
          </div>

          {/* ── Lineup Depth Charts ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { team: homeTeam,    roster: homeRoster,    out: homeBlocks,    inc: partnerBlocks.filter(a => a.position !== 'Pick'), label: 'Your Franchise' },
              { team: partnerTeam, roster: partnerRoster, out: partnerBlocks, inc: homeBlocks.filter(a => a.position !== 'Pick'),    label: 'Trade Partner' },
            ].filter(x => x.team).map(({ team, roster, out, inc, label }) => (
              <div key={team!.id} style={{ background: 'var(--ledger-cream)', border: '1px solid #c8b890', padding: '10px 12px' }}>
                <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--ledger-ink)', fontFamily: "'Courier Prime', monospace", marginBottom: 6, letterSpacing: '0.05em' }}>
                  {team!.name}
                  <span style={{ color: 'var(--ledger-ink-faint)', fontWeight: 400 }}> — {label}</span>
                </div>
                <LineupCard roster={roster} outgoing={out} incoming={inc} />
              </div>
            ))}
          </div>

          {/* Metric explanations + WhatWeNeed */}
          {(() => {
            const GAP_EXPLAIN: Record<string, { full: string; need: string }> = {
              OPS:   { full: "Offensive Point Shares", need: "More offensive output across the lineup"    },
              xG:    { full: "Expected Goals",         need: "Higher quality shot generation"            },
              NOIV:  { full: "On-Ice Impact",          need: "Players who elevate their linemates"       },
              TOI:   { full: "Ice Time Quality",       need: "Heavier usage from top players"            },
              DPS:   { full: "Defensive Point Shares", need: "More defensive value across the roster"    },
              SUPP:  { full: "Shot Suppression",       need: "Better defensive structure under pressure" },
              Usage: { full: "Ice Time Deployment",    need: "Players who can handle tougher matchups"   },
              OZ:    { full: "Zone Deployment",        need: "More offensive-zone focused personnel"     },
            };
            const allGapsSorted = [...homeGaps.off, ...homeGaps.def].sort((a, b) => a.gap - b.gap);
            const gapsWithExplain = allGapsSorted.map(g => ({
              ...g,
              full: GAP_EXPLAIN[g.label]?.full ?? g.label,
              need: GAP_EXPLAIN[g.label]?.need ?? `Improve ${g.label}`,
            }));
            const excludeIds = new Set([
              ...homeRoster.map(p => p.id),
              ...partnerRoster.map(p => p.id),
            ]);
            return (
              <>
                {/* What This Team Needs — gaps with real player suggestions */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--ledger-ink-faint)',
                                textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6,
                                fontFamily: "'Courier Prime', monospace" }}>
                    🔍 What This Team Needs{hasActiveTrade ? ' (post-trade)' : ''}
                  </div>
                  <WhatWeNeed
                    gaps={gapsWithExplain}
                    db={db}
                    excludeIds={excludeIds}
                    homeCapSpace={homeTeam ? (db.teams.find(t => t.id === homeTeam.id)?.capSpace ?? 8) : 8}
                  />
                </div>

                {/* Gap bars */}
                <div className="strands-gaps-grid">
                  {allGapsSorted.map(g => {
                    const pct = Math.min(48, Math.abs(g.gap) * 180);
                    const valClass = g.gap < -0.10 ? 'deficit' : g.gap > 0.05 ? 'surplus' : 'neutral';
                    const explain = GAP_EXPLAIN[g.label];
                    return (
                      <div key={g.label} className="strands-gap-row" title={explain ? `${explain.full}: ${explain.need}` : g.label}>
                        <span className="strands-gap-label" style={{ cursor: 'help' }} title={explain?.full}>{g.label}</span>
                        <div className="strands-gap-track">
                          <div className="strands-gap-left">
                            {g.gap < 0 && (
                              <div className="strands-gap-fill-deficit" style={{ width: `${pct * 2}%` }}/>
                            )}
                          </div>
                          <div className="strands-gap-divider"/>
                          <div className="strands-gap-right">
                            {g.gap >= 0 && (
                              <div className="strands-gap-fill-surplus" style={{ width: `${pct * 2}%` }}/>
                            )}
                          </div>
                        </div>
                        <span className={`strands-gap-value ${valClass}`}>
                          {g.gap > 0 ? '+' : ''}{(g.gap * 100).toFixed(0)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          <div className="strands-legend">
            <span><span style={{ color: 'var(--red)' }}>■</span> Below playoff threshold</span>
            <span><span style={{ color: 'var(--green)' }}>■</span> Exceeds template</span>
            <span><span className="text-ledger-green">· ·</span> Playoff threshold</span>
            <span><span style={{ color: 'var(--rule)' }}>— —</span> Championship standard</span>
            <span style={{ color: 'var(--ledger-ink-faint)', fontSize: '7px' }}>Hover metric labels for explanations</span>
          </div>
        </div>
      )}
    </div>
  );
}
// ============================================================
// TEAM MODE BADGE
// ============================================================
function ModeBadge({ team, roster, label }: { team: Team; roster: Asset[]; label: string }) {
  const mode = classifyTeam(team, roster);
  const config: Record<TeamMode, { color: string; bg: string }> = {
    CONTENDER:  { color: "text-emerald-300", bg: "bg-emerald-950/40 border-emerald-800/50" },
    BUBBLE:     { color: "text-sky-300",     bg: "bg-sky-950/40 border-sky-800/50" },
    RETOOLING:  { color: "text-amber-300",   bg: "bg-amber-950/40 border-amber-800/50" },
    REBUILDING: { color: "text-orange-300",  bg: "bg-orange-950/40 border-orange-800/50" },
    TANKING:    { color: "text-rose-300",    bg: "bg-rose-950/40 border-rose-800/50" },
  };
  const c = config[mode];
  return (
    <div className={`border rounded-lg px-2 py-1.5 text-center ${c.bg}`}>
      <div className="text-2xs font-black uppercase tracking-widest text-zinc-700 mb-0.5">{label}</div>
      <div className={`text-2xs font-black uppercase tracking-tight ${c.color}`}>{mode}</div>
    </div>
  );
}

// ============================================================

// ============================================================
// BREAKDOWN TABLE
// ============================================================
// ============================================================
// BREAKDOWN TABLE
// ============================================================
function BreakdownTable({ blocks, navMap }: { blocks: [Asset[], Asset[]]; navMap: Record<string, XNAVResult> }) {
  const allAssets = [
    ...blocks[0].map((a) => ({ ...a, side: "OUT" as const })),
    ...blocks[1].map((a) => ({ ...a, side: "IN" as const })),
  ];

  return (
    <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-2xl overflow-hidden">
      <div className="px-3 sm:px-6 py-3 border-b border-zinc-800/40 flex items-center gap-2">
        <span className="text-2xs font-black uppercase tracking-[0.4em] text-zinc-600">Full NAV Breakdown</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="border-b border-zinc-800/30">
              {["Side", "Player", "Pos", "Age", "Pts/82", "xG/82", "DefRate", "Avg TOI", "Cap", "Term", "X-NAV", "Off", "Def", "Age/YNG", "Cap Cost"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-2xs font-black uppercase tracking-wider text-zinc-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allAssets.map((a) => {
              const xnav = navMap[a.id] ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };
              const isOut = a.side === "OUT";
              return (
                <tr key={a.id} className={`border-b border-zinc-900 hover:bg-zinc-800/20 transition-colors ${isOut ? "bg-rose-950/5" : "bg-emerald-950/5"}`}>
                  <td className="px-3 py-2">
                    <span className={`text-2xs font-black px-1.5 py-0.5 rounded ${isOut ? "bg-rose-900/30 text-rose-400" : "bg-emerald-900/30 text-emerald-400"}`}>
                      {a.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-sans font-black text-white text-[11px] whitespace-nowrap">{a.name}</td>
                  <td className="px-3 py-2 text-zinc-500">{a.position}</td>
                  <td className="px-3 py-2 text-zinc-400">{a.age}</td>
                  <td className="px-3 py-2 text-cyan-400">{a.position === "Pick" ? "—" : a.position === "G" ? `${(a.savePct ?? 0).toFixed(3)}` : a.ptsPace.toFixed(1)}</td>
                  <td className="px-3 py-2 text-violet-400">{a.position === "Pick" ? "—" : a.position === "G" ? `${(a.gsax ?? 0).toFixed(1)} GSAx` : (a.xGPace ?? 0).toFixed(1)}</td>
                  <td className={`px-3 py-2 ${a.defRate > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {a.position === "Pick" ? "—" : fmt(a.defRate, 2)}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{a.position === "Pick" ? "—" : a.avgTOI.toFixed(1)}</td>
                  {/* ── NEW: Extension styling on the Cap Hit column ── */}
                  <td className={`px-3 py-2 ${a.hasExtension ? "text-amber-500 font-bold" : "text-amber-400"}`} title={a.hasExtension ? "Valuation based on future extension AAV" : undefined}>
                    {a.position === "Pick" ? "—" : `$${a.capHit.toFixed(2)}M${a.hasExtension ? '*' : ''}`}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{a.position === "Pick" ? "—" : `${a.yearsRemaining}yr`}</td>
                  <td className={`px-3 py-2 font-black text-[12px] ${xnav.total > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {fmt(xnav.total, 1)}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{xnav.off.toFixed(0)}</td>
                  <td className="px-3 py-2 text-zinc-500">{xnav.def.toFixed(0)}</td>
                  <td className={`px-3 py-2 ${xnav.age > 0 ? "text-violet-400" : "text-amber-500"}`}>
                    {fmt(xnav.age, 0)}
                  </td>
                  <td className="px-3 py-2 text-rose-500">{xnav.cap.toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// MICRO COMPONENTS
// ============================================================


function MiniStat({ label, val }: { label: string; val: string }) {
  return (
    <div className="p-2 text-center">
      <div className="text-2xs font-black uppercase tracking-widest mb-0.5">{label}</div>
      <div className="text-[13px] font-black" style={{ color: 'var(--ledger-ink)',  }}>{val}</div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-12 h-12 border-2 border-zinc-800 rounded-full" />
        <div className="w-12 h-12 border-2 border-t-cyan-500 rounded-full animate-spin absolute inset-0" />
      </div>
      <div className="text-2xs font-black uppercase tracking-[0.5em] text-zinc-600 animate-pulse">
        Syncing NHL Data Core
      </div>
      <div className="text-2xs text-zinc-800 font-black uppercase tracking-widest">
        MoneyPuck · NHL API · X-NAV 1.1
      </div>
    </div>
  );
}

function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="text-rose-500 font-black text-lg">Data Pipeline Error</div>
      <div className="text-zinc-600 text-sm font-mono">{msg}</div>
      <div className="text-zinc-700 text-xs">Check that /api/league/teams and /api/league/players are deployed and reachable.</div>
    </div>
  );
}