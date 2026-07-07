"use client";

import TradePanel from "@/app/components/TradePanel";
import TugBar from "@/app/components/TugBar";
import { SEASON, ageDecayRate, ageSlotPenalty } from "@/app/lib/season-config";
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from "react";
import { createPortal } from "react-dom";
import { useTradeStore } from "@/app/store/tradeStore";
import Header from "@/app/components/Header";
import TradeHistoryBar from "@/app/components/TradeHistoryBar";
import Footer from "@/app/components/Footer";
import type {
  Asset, Team, XNAVResult, TradeVerdict,
} from "@/app/lib/trade-types";
import {
  fetchNavMap, fetchTradeVerdict, clearNavCache, getCachedNav,
} from "@/app/lib/evaluate-client";
import {
  buildTradeQueryString,
  parseTradeQueryState,
  resolveTradeShareAssets,
} from "@/app/lib/trade-share";
import { applyCapDelta } from "@/app/lib/cap-delta";
import { scenarioSeed } from "@/app/lib/sim-engine";
import ResignPhase from "@/app/components/ResignPhase";
import OfferSheetPhase from "@/app/components/OfferSheetPhase";
import DraftNight from "@/app/components/DraftNight";
import { draftedRookieAssets } from "@/app/lib/draft-rookies";
import VerdictPanel, { STATUS_CONFIG } from "@/app/components/VerdictPanel";
import TradeBlockPanel from "@/app/components/TradeBlockPanel";
import { useBodyScrollLock } from "@/app/lib/use-body-scroll-lock";
import { useSimDispatch } from "./useSimDispatch";
import CupRunPanel from "@/app/components/CupRunPanel";
import { computeContention } from "./contention";
import { CupRunDraftSummaryModal, buildTradeCapMoves } from "./CupRunDraftSummaryModal";
import { GmAnalysisTabs, ModeBadge } from "./GmAnalysisTabs";
import { MiniStat } from "./SeasonResultsPager";
import { LoadingScreen, ErrorScreen } from "./Screens";
import { useCupRunLifecycle } from "./useCupRunLifecycle";
import { useOffseasonFlow } from "./useOffseasonFlow";
import { useTradeBench, type SimControls } from "./useTradeBench";

const TradeProposalEngine = lazy(() => import("@/app/components/TradeProposal"));
const PlayerComparison    = lazy(() => import("@/app/components/PlayerComparison"));

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


export default function ArmchairGmPage() {
  const [booting, setBooting] = useState(true);
  const [initialNavReady, setInitialNavReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [db, setDb] = useState<{ teams: Team[]; players: Asset[]; capCeiling?: number | null }>({ teams: [], players: [] });
  const [originalDb, setOriginalDb] = useState<{ teams: Team[]; players: Asset[]; capCeiling?: number | null } | null>(null);
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
  const copyTradeLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, []);

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

  const [showMemo, setShowMemo] = useState(false);

  // ── Late-binding refs — bridge hook call order ────────────────
  // useCupRunLifecycle and useTradeBench need values produced by hooks
  // that run after them (useSimDispatch, and each other's resets).
  // These refs are assigned every render below and read only inside
  // event handlers, which always fire after render.
  const simDataRef = useRef<any | null>(null);
  const onSeasonRolledRef = useRef<() => void>(() => {});
  const simControlsRef = useRef<SimControls | null>(null);

  // ── Cup Run Challenge (3-year mode) ──────────────────────────
  const {
    cupRun, setCupRun, cupRunActive, cupAdvancing, cupRunPrompt,
    dismissCupRunPrompt, cupDraftSummary, setCupDraftSummary,
    handleStartCupRun, handleAbandonCupRun, handleCupRunAdvance,
  } = useCupRunLifecycle({
    homeTeam, db, originalDb, setDb, setOriginalDb, setHomeTeamLocked,
    simDataRef, onSeasonRolledRef,
  });

  // ── Off-season / free agency ─────────────────────────────────
  const {
    mode, setMode, draftOpen, setDraftOpen, resignOpen, setResignOpen,
    offerSheetOpen, setOfferSheetOpen, userPending, market, rfaMarket,
    offseasonResolvedRef, resignPlayer, walkPlayer, dropPlayer,
    signMarketPlayer, proceedToOfferSheets, signOfferSheet, finishOffseason,
  } = useOffseasonFlow({
    db, setDb, setOriginalDb, homeTeamId, showTeamSelect, initialNavReady,
    cupRun, cupDraftSummary,
  });

  // ── Trade bench — executed trades, lineups, execute/reset ────
  const {
    executedTrades, setExecutedTrades, showSimPanel, setShowSimPanel,
    lineupStartingGoalies, setLineupStartingGoalies, lineupOrders, setLineupOrders,
    handleGoalieStarterChange, handleLineupChange, executeTrade, resetTrades,
  } = useTradeBench({
    homeTeam, partnerTeam, outgoingBlock, incomingBlock, setBlocks, setVerdict,
    db, setDb, originalDb, setHomeTeamLocked, setShowTeamSelect,
    cupRun, setCupRun, offseasonResolvedRef, simControlsRef,
  });

  useBodyScrollLock(showTeamSelect || tradeBlockOpen || Boolean(tradeRequest?.length) || draftOpen || resignOpen || offerSheetOpen || Boolean(cupDraftSummary));

  // ── Abort controllers — cancel stale Claude requests ─────────
  const memoAbortRef = useRef<AbortController | null>(null);
  const evalAbortRef = useRef<AbortController | null>(null);
  const matchAbortRef = useRef<AbortController | null>(null);
  const initialNavReadyRef = useRef(false);

  // ── Server-fetched NAV map ────────────────────────────────────
  // Populated by /api/evaluate — engine runs server-side only.
  // getXNAV() in this file is a thin cache wrapper, not the real engine.
  const navMap = useTradeStore(s => s.navMap);
  const setNavMap = useTradeStore(s => s.setNavMap);
  const [navLoading, setNavLoading] = useState(false);
  const {
    simResult,
    simLoading,
    simData,
    simYear,
    clearSimResult,
    resetSimulation,
  } = useSimDispatch({
    homeTeam,
    partnerTeam,
    db,
    originalDb,
    executedTrades,
    navMap,
    lineupStartingGoalies,
    lineupOrders,
    computeContention,
    lineupContext: cupRunActive,
    cupRunContext: cupRunActive && cupRun ? {
      teamId: cupRun.teamId,
      teamName: cupRun.teamName,
      year: cupRun.currentYear,
      difficultyLabel: cupRun.difficulty.label,
      stars: cupRun.difficulty.stars,
      seasons: cupRun.seasons.map(s => ({
        seasonLabel: s.seasonLabel,
        championTeamName: s.championTeamName,
        madePlayoffs: s.madePlayoffs,
        wonCup: s.wonCup,
      })),
    } : null,
  });

  // Memoized rosters — stable references stop useEffect churn
  const allHomeRoster = useMemo(
    () => db.players.filter(p => p.teamId === homeTeamId),
    [db.players, homeTeamId]
  );
  const allPartnerRoster = useMemo(
    () => db.players.filter(p => p.teamId === partnerTeamId),
    [db.players, partnerTeamId]
  );

  // Late-binding ref assignments — see the refs block above.
  simDataRef.current = simData;
  simControlsRef.current = { clearSimResult, resetSimulation };
  onSeasonRolledRef.current = () => {
    setExecutedTrades([]);
    resetSimulation();
    setLineupOrders({});
    setLineupStartingGoalies({});
    setShowSimPanel(false);
    setBlocks([[], []]);
    setVerdict(null);
    offseasonResolvedRef.current = false;   // re-resolve FA for the new year
    setMode("offseason");
    setDraftOpen(false);
    setResignOpen(false);
    setOfferSheetOpen(false);
  };

  // Fetch NAV from server whenever db.players changes (after load or trade execution)
  useEffect(() => {
    if (db.players.length === 0) return;
    setNavLoading(true);
    const ctrl = new AbortController();
    fetchNavMap(db.players, ctrl.signal, db.capCeiling)
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
            console.error("[initial NAV]", `Player valuation load incomplete: ${actual}/${expected} unique values ready.${missingSuffix}`);
            setError("Couldn't load league data");
          }
        }
      })
      .catch(e => {
        if (e.name !== "AbortError") {
          setNavLoading(false);
          if (!initialNavReadyRef.current) {
            console.error("[initial NAV]", e);
            setError("Couldn't load league data");
          }
        }
      });
    return () => ctrl.abort();
  }, [db.players, db.capCeiling, setNavMap]);

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
          const original = getCachedNav({ ...a, retainedPct: 0 }, db.capCeiling);
          if (original) updated[a.id] = original;
        }
        return updated;
      });
    }

    if (retainedAssets.length === 0) return;

    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetchNavMap(retainedAssets, ctrl.signal, db.capCeiling)
        .then(fresh => {
          if (!ctrl.signal.aborted) setNavMap(prev => ({ ...prev, ...fresh }));
        })
        .catch((e) => {
          if (e?.name !== "AbortError") console.warn("[retention NAV]", e);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [outgoingBlock, incomingBlock, setNavMap, db.capCeiling]);

  const loadLeagueData = useCallback(() => {
    setBooting(true);
    setError(null);
    setDb({ teams: [], players: [] });
    setOriginalDb({ teams: [], players: [] });
    setNavMap({});
    setInitialNavReady(false);
    initialNavReadyRef.current = false;
    const loadJson = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      return res.json();
    };
    Promise.allSettled([
      loadJson("/api/league/teams"),
      loadJson("/api/league/players"),
    ])
      .then((results) => {
        const [teamResult, playerResult] = results;
        if (teamResult.status !== "fulfilled" || playerResult.status !== "fulfilled") {
          const failures = results
            .filter((r): r is PromiseRejectedResult => r.status === "rejected")
            .map(r => r.reason?.message ?? "unknown API error")
            .join("; ");
          throw new Error(failures || "league data request failed");
        }
        return [teamResult.value, playerResult.value] as const;
      })
      .then(([td, pd]) => {
        const data = {
          teams:      td.teams,
          players:    [...(pd.players ?? []), ...(td.picks ?? [])],
          capCeiling: td.capCeiling,
          capFloor:   td.capFloor,
          liveStats:  pd.liveStats,
        };
        if (!Array.isArray(data.teams) || !Array.isArray(data.players) || data.teams.length === 0 || data.players.length === 0) {
          console.error("[league boot] API returned invalid data", data);
          setError("Couldn't load league data");
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
        console.error("[league boot]", e);
        setError("Couldn't load league data");
        setBooting(false);
      });
  }, [setTeams, setNavMap]);

  useEffect(() => {
    loadLeagueData();
  }, [loadLeagueData]);

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
    matchAbortRef.current?.abort();
    const ctrl = new AbortController();
    matchAbortRef.current = ctrl;
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
        signal: ctrl.signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (ctrl.signal.aborted || matchAbortRef.current !== ctrl) return;
        setMatchResults(data);
        const firstPopulated = MATCH_FOLDERS.find(f =>
          data.matches?.some((m: { fitTier: MatchFolder }) => m.fitTier === f.id)
        );
        setMatchFolder(firstPopulated?.id ?? "LEAD");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error("[findMatches]", e);
    } finally {
      if (matchAbortRef.current === ctrl) {
        matchAbortRef.current = null;
        setMatchLoading(false);
      }
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
        evalAbortRef.current.signal,
        db.capCeiling
      );
      if (v) { setVerdict(v); setVerdictOpen(true); }
    } catch (e: any) {
      if (e.name !== "AbortError") console.error("[runEval]", e.message);
    }
  }, [blocks, teams, db.teams, db.capCeiling, allHomeRoster, allPartnerRoster]);

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
  const capMoves = buildTradeCapMoves(blocks[0], blocks[1]);
  const capA = liveHome ? applyCapDelta(liveHome.capSpace, capMoves.home) : 0;
  const capB = livePartner ? applyCapDelta(livePartner.capSpace, capMoves.partner) : 0;

  if (error) return <ErrorScreen onRetry={loadLeagueData} />;
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
              {/* Mode picker — off-season runs a re-sign phase first */}
              <div className="flex gap-2 mb-4">
                {([
                  ["offseason", "Off-Season", "Re-sign free agents, then trade"],
                  ["inseason", "In-Season", "Jump straight to trades"],
                ] as const).map(([m, label, sub]) => {
                  const active = mode === m;
                  return (
                    <button key={m} onClick={() => setMode(m)}
                      className="flex-1 text-left px-3 py-2 transition-all"
                      style={{
                        background: active ? 'var(--ledger-ink)' : 'var(--ledger-card)',
                        border: `1px solid ${active ? 'var(--ledger-ink)' : 'var(--ledger-rule-mid)'}`,
                        borderRadius: '2px',
                      }}>
                      <div className="text-[11px] font-black uppercase tracking-wider font-mono"
                        style={{ color: active ? 'var(--ledger-card-light)' : 'var(--ledger-ink)' }}>{label}</div>
                      <div className="text-[9px] font-mono"
                        style={{ color: active ? 'var(--ledger-rule-mid)' : 'var(--ledger-ink-faint)' }}>{sub}</div>
                    </button>
                  );
                })}
              </div>
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

      {/* ── Off-Season Draft Night (display-only, before free agency) ── */}
      {draftOpen && (
        <DraftNight
          initialSeed={scenarioSeed({ draft: homeTeamId ?? "", season: SEASON.label })}
          homeTeamId={homeTeamId}
          onDone={(results) => {
            setDraftOpen(false);
            setResignOpen(true);
            setDb(prev => {
              // The off-season draft just happened: spend this year's picks (drop
              // them from the tradeable pool) and sign every selection to a default
              // 3-year ELC so the rookies join their drafting team's roster.
              const withoutPicks = prev.players.filter(
                p => !(p.position === "Pick" && p.year === SEASON.draftYear)
              );
              const existingIds = new Set(withoutPicks.map(p => p.id));
              const rookies = draftedRookieAssets(results).filter(r => !existingIds.has(r.id));
              return { ...prev, players: [...withoutPicks, ...rookies] };
            });
            clearNavCache();
          }}
        />
      )}

      {/* ── Cup Run future drafts are resolved during rollover; summarize before FA ── */}
      {cupDraftSummary && (
        <CupRunDraftSummaryModal
          summary={cupDraftSummary}
          onDone={() => {
            setCupDraftSummary(null);
            setResignOpen(true);
          }}
        />
      )}

      {/* ── Off-Season Re-Sign Phase ────────────────────────────── */}
      {resignOpen && liveHome && (
        <ResignPhase
          homeTeam={liveHome}
          capSpace={liveHome.capSpace ?? 0}
          pending={userPending}
          market={market}
          roster={db.players.filter(p => p.teamId === homeTeamId)}
          onResign={resignPlayer}
          onWalk={walkPlayer}
          onSign={signMarketPlayer}
          onDrop={dropPlayer}
          onDone={proceedToOfferSheets}
        />
      )}

      {/* ── Off-Season RFA Offer Sheet Phase ───────────────────── */}
      {offerSheetOpen && liveHome && (
        <OfferSheetPhase
          homeTeam={liveHome}
          capSpace={liveHome.capSpace ?? 0}
          rfaMarket={rfaMarket}
          teams={db.teams}
          picks={db.players.filter(p => p.position === "Pick")}
          onSign={signOfferSheet}
          onDone={finishOffseason}
        />
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

        {/* ── Cup Run resume guard — never restore a mid-run flag silently ── */}
        {cupRunPrompt && (() => {
          const resumable = cupRunPrompt.currentYear === 1 && cupRunPrompt.seasons.length === 0;
          return (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" style={{ background: 'rgba(20,16,8,0.55)' }}>
              <div className="max-w-md w-full border p-5" style={{ background: 'var(--paper, var(--ledger-cream))', borderColor: 'var(--ledger-ink)', borderRadius: 2 }}>
                <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono mb-2" style={{ color: 'var(--ledger-red)' }}>
                  Cup Run In Progress
                </div>
                <div className="text-[12px] font-serif leading-relaxed mb-1" style={{ color: 'var(--ledger-ink)' }}>
                  <strong>{cupRunPrompt.teamName}</strong> — Year {cupRunPrompt.currentYear} of 3, {cupRunPrompt.difficulty.label} ({cupRunPrompt.difficulty.stars}★)
                </div>
                <div className="text-[11px] font-mono leading-relaxed mb-4" style={{ color: 'var(--ledger-ink-faint)' }}>
                  {resumable
                    ? "Your trades from the previous session were lost with the tab, but the run itself can pick up from the Year 1 offseason."
                    : `The Year ${cupRunPrompt.currentYear} league state (rolled rosters, trades) can't be restored after the tab closed — continuing would leave the GM in a broken half-state. This run has to be abandoned.`}
                </div>
                <div className="flex gap-2">
                  {resumable && (
                    <button
                      onClick={() => dismissCupRunPrompt(true)}
                      className="flex-1 py-2 text-[11px] font-black font-mono uppercase tracking-[0.15em] border"
                      style={{ background: 'var(--ledger-red)', color: '#fff', borderColor: 'var(--ledger-red)', borderRadius: 2, cursor: 'pointer' }}
                    >
                      Resume Run
                    </button>
                  )}
                  <button
                    onClick={() => dismissCupRunPrompt(false)}
                    className="flex-1 py-2 text-[11px] font-black font-mono uppercase tracking-[0.15em] border"
                    style={{
                      background: resumable ? 'transparent' : 'var(--ledger-red)',
                      color: resumable ? 'var(--ledger-ink)' : '#fff',
                      borderColor: resumable ? 'var(--ledger-rule-mid, var(--ledger-ink))' : 'var(--ledger-red)',
                      borderRadius: 2, cursor: 'pointer',
                    }}
                  >
                    {resumable ? "Abandon & Start Fresh" : "Abandon Run"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Cup Run Challenge HUD ── */}
        <CupRunPanel
          run={cupRun}
          canStart={!!homeTeam}
          hasSeasonResult={!!simData?.playoffBracket?.champion}
          advancing={cupAdvancing}
          onStart={handleStartCupRun}
          onRecordAndAdvance={handleCupRunAdvance}
          onAbandon={handleAbandonCupRun}
        />

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
                          onClick={copyTradeLink}
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
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase",
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
                                     color: "var(--ledger-ink-faint)" }}
                                  title="Net Asset Value — the player's tradeable value">NAV</span>
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

        {/* ── Lineups — editable depth charts below the trade ── */}
        {/* ── Analysis Tabs — tabbed sections below the trade grid ── */}
        {teams[0] && teams[1] && (
          <GmAnalysisTabs
            teams={teams as [Team, Team]}
            allHomeRoster={allHomeRoster}
            allPartnerRoster={allPartnerRoster}
            blocks={blocks}
            navMap={navMap}
            db={db}
            handleGoalieStarterChange={handleGoalieStarterChange}
            handleLineupChange={handleLineupChange}
            executedTrades={executedTrades}
            showSimPanel={showSimPanel}
            simYear={simYear}
            simLoading={simLoading}
            simData={simData}
            simResult={simResult}
          />
        )}
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
            <div className="lg:hidden grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={runEval}
                className="py-2.5 font-black uppercase tracking-widest text-[11px] transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: 'var(--ledger-ink)',
                  color: 'var(--ledger-card-light)',
                  borderRadius: '2px',
                }}>
                Re-audit
              </button>
              <button
                onClick={copyTradeLink}
                className="py-2.5 font-black uppercase tracking-widest text-[11px] transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: 'transparent',
                  border: `1px solid ${linkCopied ? 'var(--ledger-green)' : 'var(--ledger-rule)'}`,
                  color: linkCopied ? 'var(--ledger-green)' : 'var(--ledger-ink-faint)',
                  borderRadius: '2px',
                }}>
                {linkCopied ? 'Copied' : 'Copy link'}
              </button>
            </div>
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


