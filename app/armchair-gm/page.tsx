"use client";

import TradePanel from "@/app/components/TradePanel";
import TugBar from "@/app/components/TugBar";
import { SEASON, ageDecayRate, ageSlotPenalty } from "@/app/lib/season-config";
import PlayoffBracket from "@/app/components/PlayoffBracket";
import TeamStrand, { CHAMP_TEMPLATE, TeamStrandData } from "@/app/components/TeamStrand";
import LineupEditor from "@/app/components/LineupEditor";
import WhatWeNeed from "@/app/components/WhatWeNeed";
import ContentionQuadrant from "@/app/components/ContentionQuadrant";
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from "react";
import { createPortal } from "react-dom";
import { useTradeStore } from "@/app/store/tradeStore";
import Header from "@/app/components/Header";
import TradeHistoryBar from "@/app/components/TradeHistoryBar";
import Footer from "@/app/components/Footer";
import type {
  Asset, Team, XNAVResult, GmFlag, TradeVerdict,
} from "@/app/lib/trade-types";
import {
  fetchNavMap, fetchTradeVerdict, clearNavCache, getCachedNav,
} from "@/app/lib/evaluate-client";
import {
  buildTradeQueryString,
  parseTradeQueryState,
  resolveTradeShareAssets,
} from "@/app/lib/trade-share";
import { scenarioSeed } from "@/app/lib/sim-engine";
import VerdictPanel, { STATUS_CONFIG } from "@/app/components/VerdictPanel";
import TradeBlockPanel from "@/app/components/TradeBlockPanel";

const TradeProposalEngine = lazy(() => import("@/app/components/TradeProposal"));
const PlayerComparison    = lazy(() => import("@/app/components/PlayerComparison"));
const CapProjection       = lazy(() => import("@/app/components/CapProjection"));

const safe = (n: number) => (isNaN(n) || !isFinite(n) ? 0 : n);
const fmt  = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));
type MatchFolder = "LEAD" | "CAP_CLEAR" | "LONG_SHOT" | "BLOCKED";

const MATCH_FOLDERS: Array<{ id: MatchFolder; label: string; stamp: string }> = [
  { id: "LEAD",      label: "Leads",      stamp: "A" },
  { id: "CAP_CLEAR", label: "Cap Clear",  stamp: "B" },
  { id: "LONG_SHOT", label: "Long Shot",  stamp: "C" },
  { id: "BLOCKED",   label: "Blocked",    stamp: "X" },
];

const getXNAV = (asset: Asset): XNAVResult =>
  getCachedNav(asset) ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ArmchairGmPage() {
  const [booting, setBooting] = useState(true);
  const [initialNavReady, setInitialNavReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [db, setDb] = useState<{ teams: Team[]; players: Asset[] }>({ teams: [], players: [] });
  const [originalDb, setOriginalDb] = useState<{ teams: Team[]; players: Asset[] } | null>(null);
  const teams = useTradeStore(s => s.teams);
  const setTeams = useTradeStore(s => s.setTeams);
  const blocks = useTradeStore(s => s.blocks);
  const setBlocks = useTradeStore(s => s.setBlocks);
  const homeTeam = teams[0];
  const partnerTeam = teams[1];
  const outgoingBlock = blocks[0];
  const incomingBlock = blocks[1];
  const homeTeamId = homeTeam?.id;
  const partnerTeamId = partnerTeam?.id;
  const [verdict, setVerdict] = useState<TradeVerdict | null>(null);
  const [matchResults, setMatchResults] = useState<null | {
    matches: Array<{
      teamId: string; teamName: string; phase: string; score: number;
      fitTier: MatchFolder;
      navDelta: number; capFit: "FITS"|"TIGHT"|"OVER";
      fitReasons: string[]; warnReasons: string[]; returnProfile: string;
    }>;
    packageNAV: number; packageCap: number; avgAge: number;
  }>(null);
  const [matchLoading,    setMatchLoading]    = useState(false);
  const [approvedOnly,    setApprovedOnly]    = useState(true);
  const [matchFolder,     setMatchFolder]     = useState<MatchFolder>("LEAD");

  // ── Shared trade links — URL serialisation ────────────────────────────────
  // Format: ?home=WPG&partner=SJS&out=id1,id2:50&in=id3
  // where id2:50 means 50% retention. Updates without a full navigation.
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!db.teams.length || (!homeTeamId && !partnerTeamId)) return;
    setTeams(prev => {
      const nextHome = homeTeamId ? db.teams.find(t => t.id === homeTeamId) ?? prev[0] : prev[0];
      const nextPartner = partnerTeamId ? db.teams.find(t => t.id === partnerTeamId) ?? prev[1] : prev[1];
      if (nextHome === prev[0] && nextPartner === prev[1]) return prev;
      return [nextHome, nextPartner];
    });
  }, [db.teams, homeTeamId, partnerTeamId, setTeams]);

  // Sync state → URL on every trade change
  useEffect(() => {
    if (!teams[0] && !teams[1] && !blocks[0].length && !blocks[1].length) return;
    const query = buildTradeQueryString({
      homeTeamId: teams[0]?.id ?? null,
      partnerTeamId: teams[1]?.id ?? null,
      outgoing: blocks[0].map(a => ({ id: a.id, retainedPct: a.retainedPct ?? 0 })),
      incoming: blocks[1].map(a => ({ id: a.id, retainedPct: a.retainedPct ?? 0 })),
    });
    const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [teams, blocks]);

  // Parse URL → state on cold load (after db is ready)
  useEffect(() => {
    if (!db || db.players.length === 0) return;
    const parsed = parseTradeQueryState(window.location.search);
    if (!parsed.homeTeamId && !parsed.partnerTeamId && !parsed.outgoing.length && !parsed.incoming.length) return;

    const homeTeam    = parsed.homeTeamId    ? db.teams.find(t => t.id === parsed.homeTeamId)    ?? null : null;
    const partnerTeam = parsed.partnerTeamId ? db.teams.find(t => t.id === parsed.partnerTeamId) ?? null : null;
    const outgoing    = resolveTradeShareAssets(parsed.outgoing, db.players);
    const incoming    = resolveTradeShareAssets(parsed.incoming, db.players);

    if (homeTeam || partnerTeam || outgoing.length || incoming.length) {
      setTeams([homeTeam, partnerTeam]);
      setBlocks([outgoing, incoming]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);
  const [verdictOpen, setVerdictOpen] = useState(false);   // bottom sheet expanded
  const [showTeamSelect, setShowTeamSelect] = useState(false); // Team select modal open
  const [selectingTeamId, setSelectingTeamId] = useState<string | null>(null);
  const [tradeBlockOpen, setTradeBlockOpen] = useState(false);
  const [tradeRequest,   setTradeRequest]   = useState<Asset[] | null>(null);

  // Freeze body scroll when any modal/overlay is open
  React.useEffect(() => {
    if (verdictOpen || showTeamSelect || tradeBlockOpen || (tradeRequest && tradeRequest.length > 0)) {
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
  }, [verdictOpen, showTeamSelect, tradeBlockOpen, tradeRequest]);
  const tradeInputKey = useMemo(() => JSON.stringify({
    homeTeamId,
    partnerTeamId,
    outgoing: outgoingBlock.map(a => `${a.id}:${a.retainedPct ?? 0}`),
    incoming: incomingBlock.map(a => `${a.id}:${a.retainedPct ?? 0}`),
  }), [homeTeamId, partnerTeamId, outgoingBlock, incomingBlock]);
  const previousTradeInputKey = useRef(tradeInputKey);
  const [expandedFlag,   setExpandedFlag]   = useState<number | null>(null);

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
  const initialNavReadyRef = useRef(false);

  // ── Server-fetched NAV map ────────────────────────────────────
  // Populated by /api/evaluate — engine runs server-side only.
  // getXNAV() in this file is a thin cache wrapper, not the real engine.
  const navMap = useTradeStore(s => s.navMap);
  const setNavMap = useTradeStore(s => s.setNavMap);
  const [navLoading, setNavLoading] = useState(false);

  // Memoized rosters — stable references stop useEffect churn
  const allHomeRoster = useMemo(
    () => db.players.filter(p => p.teamId === homeTeamId),
    [db.players, homeTeamId]
  );
  const allPartnerRoster = useMemo(
    () => db.players.filter(p => p.teamId === partnerTeamId),
    [db.players, partnerTeamId]
  );

  // Fetch NAV from server whenever db.players changes (after load or trade execution)
  useEffect(() => {
    if (db.players.length === 0) return;
    setNavLoading(true);
    const ctrl = new AbortController();
    fetchNavMap(db.players, ctrl.signal)
      .then(map => {
        setNavMap(map);
        setNavLoading(false);
        if (!initialNavReadyRef.current) {
          const expectedIds = new Set(db.players.map(asset => asset.id));
          const expected = expectedIds.size;
          const actual = Object.keys(map).filter(id => expectedIds.has(id)).length;
          if (actual >= expected) {
            initialNavReadyRef.current = true;
            setInitialNavReady(true);
          } else {
            const missingIds = [...expectedIds].filter(id => !map[id]).slice(0, 5);
            const missingSuffix = missingIds.length ? ` Missing: ${missingIds.join(", ")}` : "";
            setError(`Player valuation load incomplete: ${actual}/${expected} unique values ready.${missingSuffix}`);
          }
        }
      })
      .catch(e => {
        if (e.name !== "AbortError") {
          setNavLoading(false);
          if (!initialNavReadyRef.current) {
            setError(`Player valuation load failed: ${e.message}`);
          }
        }
      });
    return () => ctrl.abort();
  }, [db.players, setNavMap]);

  // Re-fetch NAV for any block assets with retention applied.
  // Clear trade partner match results whenever the outgoing package changes —
  // stale "who wants this" results from a previous package should never persist.
  useEffect(() => { setMatchResults(null); }, [outgoingBlock]);

  // When retention returns to 0, immediately restore the original cached value
  // so the display doesn't stay stuck showing the retained NAV.
  // Debounced for non-zero retention to avoid API hammering on every slider tick.
  useEffect(() => {
    const retainedAssets = [...outgoingBlock, ...incomingBlock]
      .filter(a => a.position !== "Pick" && (a.retainedPct || 0) > 0);
    const zeroedAssets = [...outgoingBlock, ...incomingBlock]
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
  }, [outgoingBlock, incomingBlock, setNavMap]);

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
  }, [setTeams]);

  // ── Execute Trade — moves players between teams in db state ──
  const executeTrade = useCallback(() => {
    if (!homeTeam || !partnerTeam || (!outgoingBlock.length && !incomingBlock.length)) return;

    const outgoingById = new Map(outgoingBlock.map(a => [a.id, a]));
    const incomingById = new Map(incomingBlock.map(a => [a.id, a]));
    const outIds = new Set(outgoingById.keys());
    const inIds  = new Set(incomingById.keys());

    setDb(prev => {
      const clearSessionTradeBlock = (p: Asset): Asset =>
        p.position === "Pick"
          ? p
          : { ...p, tradeBlockStatus: null, tradeBlockNote: null };

      // Update player teamIds
      const updatedPlayers = prev.players.map(p => {
        const outgoingAsset = outgoingById.get(p.id);
        if (outgoingAsset) {
          return clearSessionTradeBlock({
            ...p,
            teamId: partnerTeam.id,
            retainedPct: outgoingAsset.retainedPct ?? p.retainedPct ?? 0,
          });
        }
        const incomingAsset = incomingById.get(p.id);
        if (incomingAsset) {
          return clearSessionTradeBlock({
            ...p,
            teamId: homeTeam.id,
            retainedPct: incomingAsset.retainedPct ?? p.retainedPct ?? 0,
          });
        }
        return p;
      });

      // Recalculate cap space using DELTA only — not a full rebuild from ceiling.
      // The API cap space already accounts for LTIR, retained salaries, bonuses etc.
      // Rebuilding from CAP_CEILING - rosterCap ignores all of that complexity.
      // Delta approach: add outgoing cap hits back, subtract incoming cap hits.
      const outCapHome = outgoingBlock
        .filter(a => a.position !== "Pick")
        .reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0);
      const inCapHome = incomingBlock
        .filter(a => a.position !== "Pick")
        .reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0);

      const strengthByTeam = new Map<string, number>();
      for (const team of prev.teams) {
        const roster = updatedPlayers
          .filter(p => p.teamId === team.id && p.position !== "Pick")
          .map(p => {
            if (p.position === "G") return Math.max(0, (p.gsax ?? 0) * 2 + (p.gamesStarted ?? 0) * 0.5);
            const toiCredit = Math.max(0, (p.avgTOI ?? 0) - 10) * 2;
            return (p.ptsPace ?? 0) + toiCredit + Math.max(0, p.defRate ?? 0) * 12;
          })
          .sort((a, b) => b - a);
        strengthByTeam.set(team.id, roster.slice(0, 18).reduce((s, v, i) => s + v * Math.pow(0.93, i), 0));
      }
      const projectedStandingByTeam = new Map(
        [...strengthByTeam.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([teamId], index) => [teamId, index + 1])
      );
      const phaseFromStanding = (standing: number): string =>
        standing <= 6 ? "Contender" :
        standing <= 10 ? "Bubble" :
        standing <= 23 ? "Retooling" :
        standing <= 29 ? "Rebuilding" :
        "Tanking";

      const updatedTeams = prev.teams.map(team => {
        const projectedStanding = projectedStandingByTeam.get(team.id) ?? team.standing;
        const projectedPhase = phaseFromStanding(projectedStanding);
        if (team.id === homeTeam.id) {
          return {
            ...team,
            capSpace: Math.round((team.capSpace + outCapHome - inCapHome) * 10) / 10,
            standing: projectedStanding,
            phase: projectedPhase,
          };
        }
        if (team.id === partnerTeam.id) {
          return {
            ...team,
            capSpace: Math.round((team.capSpace + inCapHome - outCapHome) * 10) / 10,
            standing: projectedStanding,
            phase: projectedPhase,
          };
        }
        return { ...team, standing: projectedStanding, phase: projectedPhase };
      });

      const standingByOwner = new Map(updatedTeams.map(team => [team.id, team.standing]));
      const playersWithDynamicPickValues = updatedPlayers.map(p =>
        p.position === "Pick"
          ? { ...p, teamStanding: standingByOwner.get(p.teamId) ?? p.teamStanding }
          : p
      );

      return { players: playersWithDynamicPickValues, teams: updatedTeams };
    });

    // Record the trade
    setExecutedTrades(prev => [...prev, {
      id:              `trade-${Date.now()}`,
      homeTeamName:    homeTeam.name,
      partnerTeamName: partnerTeam.name,
      outgoing:        outgoingBlock,
      incoming:        incomingBlock,
      timestamp:       Date.now(),
    }]);

    // Clear nav cache so post-trade rosters get fresh server-side NAV
    clearNavCache();

    // Clear the blocks and verdict
    setBlocks([[], []]);
    setVerdict(null);
    setSimResult(null);
    setShowSimPanel(true);
  }, [homeTeam, partnerTeam, outgoingBlock, incomingBlock, setBlocks]);

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
  }, [originalDb, setBlocks]);

  // ── Sim a Year — native engine projects, Claude narrates only ─────
  const simYear = useCallback(async () => {
    if (!homeTeam || executedTrades.length === 0) return;
    setSimLoading(true);
    setSimResult(null);
    setSimData(null);

    // ── Step 1: Run projection engine ─────────────────────────
    let sim: any = null;
    try {
      const simTeams = originalDb?.teams ?? db.teams;
      const simPlayers = originalDb?.players ?? db.players;
      const simTrades = executedTrades.map(t => ({
        homeTeamId:    simTeams.find(x => x.name === t.homeTeamName)?.id ?? "",
        partnerTeamId: simTeams.find(x => x.name === t.partnerTeamName)?.id ?? "",
        outgoing: t.outgoing,
        incoming: t.incoming,
      }));
      const seed = scenarioSeed({
        mode: SEASON.simulationMode,
        homeTeamId: homeTeam.id,
        partnerTeamId: partnerTeam?.id ?? "",
        trades: simTrades.map(t => ({
          homeTeamId: t.homeTeamId,
          partnerTeamId: t.partnerTeamId,
          outgoing: t.outgoing.map(a => ({ id: a.id, retainedPct: a.retainedPct ?? 0 })),
          incoming: t.incoming.map(a => ({ id: a.id, retainedPct: a.retainedPct ?? 0 })),
        })),
      });

      const simRes = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeamId:    homeTeam.id,
          partnerTeamId: partnerTeam?.id ?? "",
          teams:   simTeams,
          players: simPlayers,
          trades:  simTrades,
          seed,
        }),
      });
      if (simRes.ok) {
        sim = await simRes.json();
        setSimData(sim);
      }
    } catch (_) {}

    if (!sim) {
      setSimResult("Simulation unavailable — deterministic projection engine did not return results.");
      setSimLoading(false);
      return;
    }

    // ── Step 2: Build trade summary ────────────────────────────
    const tradesSummary = executedTrades.map(t => {
      const outNames = t.outgoing.map(a => a.position === "Pick"
        ? `${a.year} ${a.round === 1 ? "1st" : a.round === 2 ? "2nd" : "3rd"} round pick`
        : `${a.name} (${a.position}, $${a.capHit}M)`).join(", ");
      const inNames = t.incoming.map(a => a.position === "Pick"
        ? `${a.year} ${a.round === 1 ? "1st" : a.round === 2 ? "2nd" : "3rd"} round pick`
        : `${a.name} (${a.position}, $${a.capHit}M)`).join(", ");
      return [
        `OFFSEASON MOVE: ${t.homeTeamName} ↔ ${t.partnerTeamName}`,
        `  ${t.homeTeamName} MOVED: ${outNames}`,
        `  ${t.homeTeamName} ACQUIRED: ${inNames}`,
      ].join("\n");
    }).join("\n\n");

    const homeRoster = db.players
      .filter(p => p.teamId === homeTeam.id && p.position !== "Pick")
      .sort((a, b) => b.ptsPace - a.ptsPace)
      .slice(0, 12)
      .map(p => `${p.name} (${p.position}, age ${p.age})`);

    const isRebuilding = ["Rebuilding","Tanking","Retooling"].includes(homeTeam.phase ?? "");

    const teamNarrative = (t: Team): string => {
      const p = t.phase;
      if (p === "Tanking" || p === "Rebuilding") return "opening the year with a future-first roster construction";
      if (p === "Retooling") return "opening the year trying to turn a transitional roster into a playoff-calibre group";
      if (p === "Bubble") return "opening the year with a roster built to chase a playoff spot";
      if (p === "Contender") return "opening the year with a roster built to contend immediately";
      return "opening the year with an unsettled organizational direction";
    };
    const homeContention = computeContention(db.players.filter(p => p.teamId === homeTeam.id), navMap);

    if (simAbortRef.current) simAbortRef.current.abort();
    simAbortRef.current = new AbortController();

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: simAbortRef.current.signal,
        body: JSON.stringify({
          kind: "season_recap",
          model: "claude-sonnet-4-5",
          max_tokens: 1800,
          payload: {
            simulationMode: sim.simulationMode ?? SEASON.simulationMode,
            replaySeason: sim.replaySeason ?? SEASON.replaySeason,
            rosterMoveWindow: sim.rosterMoveWindow ?? SEASON.rosterMoveWindow,
            latestCompleted: sim.latestCompleted ?? SEASON.latestCompleted,
            homeTeamName: homeTeam.name,
            partnerTeamName: partnerTeam?.name ?? null,
            homeTeam: sim.homeTeam ?? null,
            partnerTeam: sim.partnerTeam ?? null,
            leaders: sim.leaders ?? {},
            playoffBracket: sim.playoffBracket ?? null,
            playoffTeams: sim.playoffTeams ?? [],
            tradedPlayerOutcomes: sim.tradedPlayerOutcomes ?? [],
            executedTrades: executedTrades.map(t => ({
              homeTeamName: t.homeTeamName,
              partnerTeamName: t.partnerTeamName,
              outgoing: t.outgoing,
              incoming: t.incoming,
            })),
            homeRoster,
            homePhase: homeTeam.phase,
            homeContention,
            seasonStartOutlook: teamNarrative(homeTeam),
            isRebuilding,
            seed: sim.seed ?? null,
            generatedLabel: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
          },
        }),
      });
      const data = await res.json();
      setSimResult(data.content?.[0]?.text ?? "Simulation unavailable.");
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setSimResult("Simulation unavailable — please try again.");
    }
    setSimLoading(false);
  }, [homeTeam, partnerTeam, db, originalDb, executedTrades, navMap]);
  useEffect(() => {
    // Issue 10: Don't auto-evaluate. Clear old verdict so user must click "Make the call" again.
    if (previousTradeInputKey.current !== tradeInputKey) {
      previousTradeInputKey.current = tradeInputKey;
      setVerdict(null);
      setVerdictOpen(false);
    }
  }, [tradeInputKey]);

  // ── Claude GM Analysis ────────────────────────────────────────
  const generateClaudeAnalysis = useCallback(async () => {
    if (!verdict || !teams[0] || !teams[1]) return;

    setVerdict(v => v ? { ...v, claudeLoading: true, claudeAnalysis: undefined } : v);

    const outgoing = blocks[0];
    const incoming = blocks[1];

    if (memoAbortRef.current) memoAbortRef.current.abort();
    memoAbortRef.current = new AbortController();

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: memoAbortRef.current.signal,
        body: JSON.stringify({
          kind: "trade_memo",
          model: "claude-sonnet-4-5",
          max_tokens: 700,
          payload: {
            homeTeam: teams[0],
            partnerTeam: teams[1],
            outgoing,
            incoming,
            metrics: verdict.metrics,
            status: verdict.status,
            flags: verdict.flags.map(f => ({
              severity: f.severity,
              headline: f.headline,
            })),
          },
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
      if (res.ok) {
        const data = await res.json();
        setMatchResults(data);
        const firstPopulated = MATCH_FOLDERS.find(f =>
          data.matches?.some((m: { fitTier: MatchFolder }) => m.fitTier === f.id)
        );
        setMatchFolder(firstPopulated?.id ?? "LEAD");
      }
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
      if (v) { setVerdict(v); setVerdictOpen(true); }
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
  const navBootLoading = navLoading && Object.keys(navMap).length === 0;
  const cNavA = compressBlock(blocks[0]);
  const cNavB = compressBlock(blocks[1]);
  const displayNavA = cNavA > 0 ? cNavA : navA;
  const displayNavB = cNavB > 0 ? cNavB : navB;
  const homeNetGain = displayNavB - displayNavA;

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

  if (error) return <ErrorScreen msg={error} />;
  const dataReady = db.teams.length > 0 && db.players.length > 0;
  if (booting || !dataReady || !initialNavReady) {
    return (
      <LoadingScreen
        teamsReady={db.teams.length > 0}
        playersReady={db.players.length > 0}
        navReady={initialNavReady}
        playerCount={db.players.length}
        navCount={Object.keys(navMap).length}
      />
    );
  }

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
            setVerdict(null);
          }}
        />
        </Suspense>
      )}
      {/* ── Trade Block Panel ───────────────────────────────────── */}
      {tradeBlockOpen && db.players.length > 0 && (
        <TradeBlockPanel
          players={db.players}
          teams={db.teams}
          onSelectTeam={(teamId) => {
            const partnerTeam = db.teams.find(t => t.id === teamId) ?? null;
            setTeams([teams[0], partnerTeam]);
            setBlocks([[], []]);
            setVerdict(null);
          }}
          onClose={() => setTradeBlockOpen(false)}
        />
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
                    const isSelecting = selectingTeamId === t.id;
                    return (
                      <button
                        key={t.id}
                        disabled={Boolean(selectingTeamId)}
                        onClick={() => {
                          setSelectingTeamId(t.id);
                          setTeams(prev => {
                            const partner = prev[1]?.id === t.id
                              ? db.teams.find(x => x.id !== t.id) ?? null
                              : prev[1];
                            return [t, partner];
                          });
                          setBlocks([[], []]);
                          setHomeTeamLocked(true);
                          window.setTimeout(() => {
                            setShowTeamSelect(false);
                            setSelectingTeamId(null);
                          }, 120);
                        }}
                        className="p-2 text-left transition-all disabled:cursor-wait"
                        style={{
                          background: isSelected ? 'var(--ledger-ink)' : 'var(--ledger-card)',
                          border: `1px solid ${isSelected ? 'var(--ledger-ink)' : 'var(--ledger-rule-mid)'}`,
                          borderRadius: '2px',
                          opacity: selectingTeamId && !isSelecting ? 0.45 : 1,
                        }}
                      >
                        <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                          <img src={`https://assets.nhle.com/logos/nhl/svg/${t.id}_light.svg`} alt={t.id} className="w-8 h-8 opacity-90 mix-blend-multiply" onError={(e) => (e.currentTarget.style.display = 'none')} />
                          <div className="text-[9px] font-black uppercase tracking-widest text-center leading-tight" style={{
                            color: isSelected ? 'var(--ledger-ink-faint)' : phaseColor,
                            lineHeight: 1.1
                          }}>
                            {isSelecting ? "Loading" : phase}
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>

              <p className="text-center mt-2 text-[11px] text-ledger-rule font-mono">
                Tap a team to take control. Reset via Void All Trades.
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

        <Header activeTab="armchair-gm" />

        <TradeHistoryBar />

        {navBootLoading && (
          <div className="border px-4 py-2 text-center font-mono text-[9px] font-black uppercase tracking-[0.22em]"
            style={{
              background: "var(--paper-inset)",
              borderColor: "var(--ledger-rule)",
              color: "var(--ledger-ink-faint)",
            }}>
            Calculating player values before roster selection finishes
          </div>
        )}

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

        {/* ── Lineups — editable depth charts, own section ── */}
        {teams[0] && teams[1] && (
          <div className="mb-4">
            <LineupEditor
              home={{
                teamName: teams[0]!.name, label: "Your Franchise",
                roster: allHomeRoster, outgoing: blocks[0],
                incoming: blocks[1].filter(a => a.position !== "Pick"),
              }}
              partner={{
                teamName: teams[1]!.name, label: "Trade Partner",
                roster: allPartnerRoster, outgoing: blocks[1],
                incoming: blocks[0].filter(a => a.position !== "Pick"),
              }}
              hasActiveTrade={blocks[0].length > 0 || blocks[1].length > 0}
              navMap={navMap}
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
                        onClick={runEval}
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

            {/* ── Trade Block ── */}
            {db.players.length > 0 && (
              <button
                onClick={() => setTradeBlockOpen(true)}
                className="w-full py-2.5 font-black uppercase tracking-widest text-[11px] transition-all duration-200 active:scale-[0.97]"
                style={{
                  background: 'var(--red-dim)',
                  color: 'var(--red)',
                  border: '1px solid rgba(166,53,36,0.4)',
                  fontFamily: 'monospace',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                ◉ Trade Block
              </button>
            )}

            {/* ── Match Results ── */}
            {matchResults && matchResults.matches.length > 0 && (() => {
              const capScreened = approvedOnly
                ? matchResults.matches.filter(m => m.capFit !== "OVER")
                : matchResults.matches;
              const folderCounts = MATCH_FOLDERS.reduce<Record<MatchFolder, number>>((acc, folder) => {
                acc[folder.id] = capScreened.filter(m => m.fitTier === folder.id).length;
                return acc;
              }, { LEAD: 0, CAP_CLEAR: 0, LONG_SHOT: 0, BLOCKED: 0 });
              const activeFolder = folderCounts[matchFolder] > 0
                ? matchFolder
                : (MATCH_FOLDERS.find(f => folderCounts[f.id] > 0)?.id ?? matchFolder);
              const displayed = capScreened.filter(m => m.fitTier === activeFolder);
              const fullCount = matchResults.matches.length;
              const visibleCount = capScreened.length;
              return (
              <div className="mt-3">
                <div className="flex items-end gap-1 overflow-x-auto pb-0.5"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--ledger-rule) transparent' }}>
                  {MATCH_FOLDERS.map(folder => {
                    const active = folder.id === activeFolder;
                    return (
                      <button
                        key={folder.id}
                        onClick={() => setMatchFolder(folder.id)}
                        className="shrink-0 px-2.5 py-1.5 text-2xs font-black uppercase font-mono transition-all"
                        style={{
                          minWidth: 74,
                          background: active ? 'var(--ledger-card-light)' : 'var(--ledger-cream)',
                          color: active ? 'var(--ledger-ink)' : 'var(--ledger-ink-faint)',
                          border: active ? '2px solid var(--ledger-navy)' : '1px solid var(--ledger-rule)',
                          borderBottom: active ? '0' : '1px solid var(--ledger-rule)',
                          borderRadius: '6px 6px 0 0',
                          transform: active ? 'translateY(1px)' : 'none',
                        }}>
                        <span style={{ marginRight: 4, color: active ? 'var(--ledger-red)' : 'var(--ledger-rule)' }}>
                          {folder.stamp}
                        </span>
                        {folder.label}
                        <span style={{ marginLeft: 5, color: 'var(--ledger-ink-faint)' }}>
                          {folderCounts[folder.id]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="p-3"
                  style={{
                    background: 'var(--ledger-card-light)',
                    border: '2px solid var(--ledger-navy)',
                    boxShadow: 'inset 0 0 0 1px var(--ledger-rule-light)',
                  }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-2xs font-black uppercase tracking-[0.35em] font-mono"
                        style={{ color: 'var(--ledger-navy)' }}>
                        Partner Dossier
                      </div>
                      <div className="text-2xs font-mono mt-1" style={{ color: 'var(--ledger-ink-faint)' }}>
                        {visibleCount} of {fullCount} clubs filed
                      </div>
                    </div>
                    <button
                      onClick={() => setApprovedOnly(v => !v)}
                      className="text-2xs font-mono px-2 py-1 transition-colors"
                      style={{
                        background: approvedOnly ? 'var(--ledger-green)' : 'var(--ledger-rule-light)',
                        color: approvedOnly ? 'white' : 'var(--ledger-ink-faint)',
                        fontWeight: 900, border: '1px solid var(--ledger-rule)', cursor: 'pointer',
                      }}>
                      {approvedOnly ? 'CAP SCREEN' : 'ALL CLUBS'}
                    </button>
                  </div>
                  <div className="text-2xs font-mono mb-3 text-center py-1"
                    style={{
                      color: 'var(--ledger-ink-faint)',
                      borderTop: '1px solid var(--ledger-rule-light)',
                      borderBottom: '1px solid var(--ledger-rule-light)',
                    }}>
                    Package: {matchResults.packageNAV > 0 ? "+" : ""}{matchResults.packageNAV.toFixed(0)} NAV
                    · ${matchResults.packageCap.toFixed(1)}M cap
                    {matchResults.avgAge > 0 ? ` · avg ${matchResults.avgAge.toFixed(0)} yrs old` : ""}
                  </div>
                  {displayed.length === 0 && (
                    <div className="text-center text-2xs font-mono py-4" style={{ color: 'var(--ledger-ink-faint)' }}>
                      No clubs in this folder.
                      {approvedOnly && (
                        <button onClick={() => setApprovedOnly(false)} className="ml-2 underline">Open full file</button>
                      )}
                    </div>
                  )}
                  <div className="space-y-2 overflow-y-auto pr-1"
                    style={{ maxHeight: '440px', scrollbarWidth: 'thin', scrollbarColor: 'var(--ledger-rule) transparent' }}>
                    {displayed.map((m, i) => (
                      <div key={m.teamId} className="p-2.5"
                      style={{
                        background: i === 0 ? 'rgba(26,46,92,0.08)' : 'var(--ledger-card)',
                        border: i === 0 ? '1px solid var(--ledger-navy)' : '1px solid var(--ledger-rule)',
                        borderRadius: 3,
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
                      scroll file · {displayed.length} clubs in folder
                    </div>
                  )}
                  </div>
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

            {(simData || simResult) && (
              <SeasonResultsPager simData={simData} simResult={simResult} />
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
        <Footer />

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
    def.Usage+= norm(p.qocIndex ?? 35, 0, 100);
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

function SeasonResultsPager({ simData, simResult }: { simData: any | null; simResult: string | null }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"next" | "prev">("next");

  const renderRecapLine = (line: string, i: number) => {
    if (line.startsWith('## ') || line.startsWith('**THE ') || line.startsWith('**EDMONTON') || line.startsWith('**AROUND') || line.startsWith('**THE YEAR') || line.startsWith('**DRAFT') || line.startsWith('**VERDICT')) {
      const text = line.replace(/^\#{1,3}\s+/, '').replace(/\*\*/g, '');
      return <div key={i} className="font-black text-[11px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--ledger-ink)', borderBottom: '1px solid #c8b890', paddingBottom: '4px' }}>{text}</div>;
    }
    if (line.startsWith('- **') || line.startsWith('- ')) {
      const text = line.replace(/^-\s+/, '').replace(/\*\*(.*?)\*\*/g, '$1');
      return <div key={i} className="text-[11px] leading-relaxed pl-3" style={{ color: 'var(--ledger-ink-mid)', borderLeft: '2px solid #b8a070' }}>{text}</div>;
    }
    if (line.trim() === '' || line.startsWith('#')) return null;
    const boldParts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <p key={i} className="text-[11px] leading-[1.8]" style={{ color: 'var(--ledger-ink-mid)' }}>
        {boldParts.map((part, j) => j % 2 === 0 ? part : <strong key={j}>{part}</strong>)}
      </p>
    );
  };

  const shortName = (name?: string) => name?.split(' ').pop() ?? '—';
  const playerLine = (p: any, suffix = "pts") => p ? `${shortName(p.name)} ${p.projectedPts ?? p.pts}${suffix}` : '—';
  const StatCell = ({ label, val }: { label: string; val: any }) => (
    <div style={{ background: 'var(--ledger-cream)', border: '1px solid #c8b890', padding: '5px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: '6px', color: 'var(--ledger-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: '9px', fontWeight: 900, color: 'var(--ledger-ink)', marginTop: '1px' }}>{val ?? '—'}</div>
    </div>
  );
  const TeamNumbers = ({ t }: { t: any }) => {
    const skaters = t.projectedSkaters ?? [];
    const goalsLeader = [...skaters].sort((a, b) => (b.projectedGoals ?? 0) - (a.projectedGoals ?? 0))[0];
    const assistsLeader = [...skaters].sort((a, b) => (b.projectedAssists ?? 0) - (a.projectedAssists ?? 0))[0];
    const breakout = skaters.find((p: any) => p.breakoutTag === "BREAKOUT" || p.breakoutTag === "VETERAN_HOLD");
    const regression = skaters.find((p: any) => p.breakoutTag === "REGRESSION");
    const topSixPts = skaters.slice(0, 6).reduce((s: number, p: any) => s + (p.projectedPts ?? 0), 0);
    const topNinePts = skaters.slice(0, 9).reduce((s: number, p: any) => s + (p.projectedPts ?? 0), 0);
    const dPts = skaters.filter((p: any) => p.position === "D").reduce((s: number, p: any) => s + (p.projectedPts ?? 0), 0);
    const avgAge = skaters.length
      ? (skaters.reduce((s: number, p: any) => s + (p.age ?? 0), 0) / skaters.length).toFixed(1)
      : '—';

    return (
      <div style={{ background: 'var(--ledger-card)', border: '1px solid #b8a070', padding: '10px 12px' }}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <div>
            <div className="font-black text-[12px] text-ledger-ink font-serif">{t.teamName}</div>
            <div className="text-[8px] uppercase tracking-widest text-ledger-ink-faint font-mono mt-0.5">
              {t.phase ?? 'Unknown'} · #{t.leagueRank} league · #{t.divisionRank} {t.division}
            </div>
          </div>
          <span className="text-2xs font-black px-1.5 py-0.5 shrink-0" style={{
            color: t.madePlayoffs ? 'var(--ledger-green)' : 'var(--ledger-red)',
            border: `1px solid ${t.madePlayoffs ? 'rgba(26,92,46,0.4)' : 'rgba(184,48,32,0.4)'}`,
          }}>
            {t.madePlayoffs ? 'PLAYOFFS' : 'MISSED'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <StatCell label="Points" val={t.projectedPoints} />
          <StatCell label="Top Scorer" val={playerLine(t.topScorer)} />
          <StatCell label="Goals" val={goalsLeader ? `${shortName(goalsLeader.name)} ${goalsLeader.projectedGoals}G` : '—'} />
          <StatCell label="Assists" val={assistsLeader ? `${shortName(assistsLeader.name)} ${assistsLeader.projectedAssists}A` : '—'} />
          <StatCell label="Top 6 Pts" val={topSixPts} />
          <StatCell label="Top 9 Pts" val={topNinePts} />
          <StatCell label="D Pts" val={dPts} />
          <StatCell label="Avg Age" val={avgAge} />
          <StatCell label="Top D" val={playerLine(t.topDefenseman)} />
          <StatCell label="Goalie" val={t.goalie?.name ? shortName(t.goalie.name) : '—'} />
          <StatCell label="GAA" val={t.goalie?.projectedGAA ?? '—'} />
          <StatCell label="SV%" val={t.goalie?.projectedSVP?.toFixed(3) ?? '—'} />
          <StatCell label="Breakout" val={breakout ? `${shortName(breakout.name)} ${breakout.projectedPts}pts` : '—'} />
          <StatCell label="Risk" val={regression ? `${shortName(regression.name)} ${regression.projectedPts}pts` : '—'} />
          <StatCell label="Skater Pool" val={`${skaters.length} tracked`} />
          <StatCell label="Seed" val={simData?.seed ?? '—'} />
        </div>
      </div>
    );
  };

  const teamPage = simData ? {
    label: "Team Numbers",
    node: (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[simData.homeTeam, simData.partnerTeam].filter(Boolean).map((t: any) => <TeamNumbers key={t.teamId} t={t} />)}
      </div>
    ),
  } : null;

  const leaguePage = simData ? {
    label: "League Numbers",
    node: (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {[
          { label: "Presidents' Trophy", val: `${simData.leaders?.presidentsTrophy?.teamName} (${simData.leaders?.presidentsTrophy?.projectedPoints}pts)` },
          { label: "Reigning Cup", val: simData.latestCompleted?.stanleyCupChampion?.teamName ?? SEASON.latestCompleted.stanleyCupChampion.teamName },
          { label: "Stanley Cup", val: simData.playoffBracket?.champion?.teamName ?? simData.leaders?.cupWinner?.teamName },
          { label: "Points Leader", val: `${simData.leaders?.topScorer?.name?.split(' ').pop()} ${simData.leaders?.topScorer?.pts}pts` },
          { label: "Goals Leader", val: `${simData.leaders?.goalsLeader?.name?.split(' ').pop()} ${simData.leaders?.goalsLeader?.goals}G` },
          { label: "Assists Leader", val: `${simData.leaders?.assistsLeader?.name?.split(' ').pop()} ${simData.leaders?.assistsLeader?.assists}A` },
          { label: "Hart", val: `${simData.leaders?.hart?.name?.split(' ').pop()} ${simData.leaders?.hart?.pts}pts` },
          { label: "Norris", val: `${simData.leaders?.norris?.name?.split(' ').pop()} ${simData.leaders?.norris?.pts}pts` },
          { label: "Vezina", val: `${simData.leaders?.vezina?.name?.split(' ').pop()} ${simData.leaders?.vezina?.svp?.toFixed?.(3) ?? simData.leaders?.vezina?.svp}` },
          { label: "Calder", val: `${simData.leaders?.calder?.name?.split(' ').pop()} · ${simData.leaders?.calder?.team}` },
          { label: "Draft Lottery", val: `${simData.leaders?.draftLottery?.teamName} (${simData.leaders?.draftLottery?.projectedPoints}pts)` },
        ].map((s: any) => (
          <div key={s.label} style={{ background: 'var(--ledger-card)', border: '1px solid #b8a070', padding: '6px 8px' }}>
            <div style={{ fontSize: '6.5px', color: 'var(--ledger-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>{s.label}</div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ledger-ink)' }}>{s.val}</div>
          </div>
        ))}
      </div>
    ),
  } : null;

  const playoffPage = simData?.playoffBracket ? {
    label: "Bracket",
    node: <PlayoffBracket bracket={simData.playoffBracket} />,
  } : null;

  const recapPage = simResult ? {
    label: "Recap",
    node: <div className="space-y-4">{simResult.split('\n').map(renderRecapLine)}</div>,
  } : null;

  const pages = [teamPage, leaguePage, playoffPage, recapPage].filter(Boolean) as Array<{ label: string; node: React.ReactNode }>;
  const activePage = pages[activeIndex] ?? pages[0];
  const goToPage = (nextIndex: number) => {
    if (!pages.length) return;
    const wrapped = (nextIndex + pages.length) % pages.length;
    setSlideDirection(wrapped > activeIndex || (activeIndex === pages.length - 1 && wrapped === 0) ? "next" : "prev");
    setActiveIndex(wrapped);
  };

  if (!activePage) return null;

  return (
    <div style={{ borderTop: '1px solid #b8a070', padding: '16px 20px 12px' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-ledger-ink-faint font-mono">
            Season Results
          </div>
          <div className="text-2xs text-ledger-rule font-mono mt-1">
            Simulation #{simData?.seed ?? "—"}
          </div>
        </div>
        {pages.length > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => goToPage(activeIndex - 1)} className="trade-file-arrow" aria-label="Previous season result">‹</button>
            <div className="text-[10px] font-black uppercase tracking-widest min-w-20 text-center" style={{ color: '#7f6740', fontFamily: "'Courier Prime', monospace" }}>
              {activeIndex + 1} / {pages.length}
            </div>
            <button onClick={() => goToPage(activeIndex + 1)} className="trade-file-arrow" aria-label="Next season result">›</button>
          </div>
        )}
      </div>

      {pages.length > 1 && (
        <div className="trade-file-tabs" aria-label="Season result sections">
          {pages.map((page, i) => (
            <button key={page.label} onClick={() => goToPage(i)} className={i === activeIndex ? "active" : ""}>
              {page.label}
            </button>
          ))}
        </div>
      )}

      <div key={`${activePage.label}-${slideDirection}`} className={`trade-file-card slide-${slideDirection}`} style={{ background: '#e8dab8', border: '1px solid #b8a070', padding: '12px' }}>
        {activePage.node}
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

function LoadingScreen({
  teamsReady = false,
  playersReady = false,
  navReady = false,
  playerCount = 0,
  navCount = 0,
}: {
  teamsReady?: boolean;
  playersReady?: boolean;
  navReady?: boolean;
  playerCount?: number;
  navCount?: number;
}) {
  const Check = ({ ready, label, detail }: { ready: boolean; label: string; detail?: string }) => (
    <div className="flex items-center justify-between gap-6 text-[10px] font-black uppercase tracking-widest">
      <span className={ready ? "text-emerald-700" : "text-zinc-600"}>{ready ? "Loaded" : "Loading"}</span>
      <span className="text-zinc-800">{label}</span>
      {detail && <span className="text-zinc-500 font-mono">{detail}</span>}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
      <div className="relative">
        <div className="w-12 h-12 border-2 border-zinc-800 rounded-full" />
        <div className="w-12 h-12 border-2 border-t-cyan-500 rounded-full animate-spin absolute inset-0" />
      </div>
      <div className="text-2xs font-black uppercase tracking-[0.5em] text-zinc-600 animate-pulse">
        Confirming Full Player Load
      </div>
      <div className="text-2xs text-zinc-800 font-black uppercase tracking-widest">
        MoneyPuck · NHL API · X-NAV 2.0
      </div>
      <div className="mt-2 w-full max-w-md space-y-2 border border-zinc-300 bg-white/35 p-4">
        <Check ready={teamsReady} label="Teams" />
        <Check ready={playersReady} label="Player Assets" detail={playerCount ? `${playerCount}` : undefined} />
        <Check ready={navReady} label="Player Values" detail={playerCount ? `${Math.min(navCount, playerCount)}/${playerCount}` : undefined} />
      </div>
      <div className="text-[10px] text-zinc-600 font-black uppercase tracking-widest text-center">
        Armchair GM unlocks after every roster value is ready.
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
