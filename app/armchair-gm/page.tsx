"use client";

import TradePanel from "@/app/components/TradePanel";
import TugBar from "@/app/components/TugBar";
import { SEASON, ageDecayRate, ageSlotPenalty } from "@/app/lib/season-config";
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from "react";
import { useTradeStore } from "@/app/store/tradeStore";
import Header from "@/app/components/Header";
import TradeHistoryBar from "@/app/components/TradeHistoryBar";
import Footer from "@/app/components/Footer";
import type {
  Asset, Team, TradeVerdict,
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
import { reconcileDraftedRookies } from "@/app/lib/draft-reconcile";
import TradeBlockPanel from "@/app/components/TradeBlockPanel";
import { useBodyScrollLock } from "@/app/lib/use-body-scroll-lock";
import { useSimDispatch } from "./useSimDispatch";
import CupRunPanel from "@/app/components/CupRunPanel";
import { computeContention, deriveTeamPhase } from "./contention";
import { CupRunDraftSummaryModal, buildTradeCapMoves } from "./CupRunDraftSummaryModal";
import { GmAnalysisTabs, ModeBadge } from "./GmAnalysisTabs";
import { MiniStat } from "./SeasonResultsPager";
import { LoadingScreen, ErrorScreen } from "./Screens";
import { useCupRunLifecycle } from "./useCupRunLifecycle";
import { useOffseasonFlow } from "./useOffseasonFlow";
import { useTradeBench, type SimControls } from "./useTradeBench";
import { TeamSelectModal } from "./TeamSelectModal";
import { MemoModal } from "./MemoModal";
import { CupRunResumePrompt } from "./CupRunResumePrompt";
import { VerdictSheet } from "./VerdictSheet";
import { MatchResultsPanel, MATCH_FOLDERS, type MatchFolder, type TradeMatchResults } from "./MatchResultsPanel";
import { applyFutureDraftChoice, type FutureDraftChoice } from "@/app/lib/future-draft-choice";

const TradeProposalEngine = lazy(() => import("@/app/components/TradeProposal"));
const PlayerComparison    = lazy(() => import("@/app/components/PlayerComparison"));

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
  const [matchResults, setMatchResults] = useState<TradeMatchResults | null>(null);
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

  // ── Live team timelines ───────────────────────────────────────
  // Recompute every team's phase from its current roster whenever rosters or
  // valuations change (trades, offseason signings, Cup Run rollover). The seed
  // phase was a static standing snapshot that never moved; this keeps the
  // HOME/PARTNER timeline badge — and the trade-willingness logic that reads
  // team.phase server-side — honest about what each roster actually is now.
  // Depends on players + navMap only, and no-ops when nothing changed, so
  // writing back to db.teams can't loop.
  useEffect(() => {
    if (db.players.length === 0 || Object.keys(navMap).length === 0) return;
    setDb(prev => {
      let changed = false;
      const teams = prev.teams.map(team => {
        const roster = prev.players.filter(p => p.teamId === team.id);
        const phase = deriveTeamPhase(roster, navMap);
        // null = not enough roster signal → keep the seed phase (no regression
        // to "Tanking" on thin/partial data).
        if (phase == null || phase === team.phase) return team;
        changed = true;
        return { ...team, phase };
      });
      return changed ? { ...prev, teams } : prev;
    });
  }, [db.players, navMap]);

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

  const selectFutureDraftPick = (pickId: string, choice: FutureDraftChoice) => {
    const applyTo = (state: { teams: Team[]; players: Asset[]; capCeiling?: number | null }) => {
      const res = applyFutureDraftChoice(state.players, pickId, choice);
      return { next: { ...state, players: res.players }, changedPicks: res.changedPicks };
    };
    const current = applyTo(db);
    setDb(current.next);
    setOriginalDb(prev => prev ? applyTo(prev).next : prev);
    setCupDraftSummary(prev => {
      if (!prev?.userPick) return prev;
      const changedByOverall = new Map(current.changedPicks.map(p => [p.draftOverall ?? null, p]));
      const topPicks = prev.topPicks.map(p => {
        const changed = changedByOverall.get(p.overall);
        return changed
          ? { ...p, id: changed.id, name: changed.name, position: changed.position }
          : p;
      });
      return {
        ...prev,
        topPicks,
        userPick: {
          ...prev.userPick,
          pickId: current.changedPicks[0]?.id ?? prev.userPick.pickId,
          currentName: choice.name,
          selectedName: choice.name,
        },
      };
    });
    clearNavCache();
  };

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
      {showTeamSelect && db.teams.length > 0 && (
        <TeamSelectModal
          teams={db.teams}
          selectedHomeId={teams[0]?.id}
          mode={mode}
          onModeChange={setMode}
          onSelectTeam={(t) => {
            setTeams(prev => {
              const partner = prev[1]?.id === t.id
                ? db.teams.find(x => x.id !== t.id) ?? null
                : prev[1];
              return [t, partner];
            });
            setBlocks([[], []]);
            setHomeTeamLocked(true);
          }}
          onClose={() => setShowTeamSelect(false)}
        />
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
              // Diacritic-safe reconcile (AG4/VAL1): a prospect already on a
              // roster (e.g. seeded "Viggo Bjorck" vs a drafted "Viggo Björck")
              // must not produce a second entry — but dropping the drafted
              // rookie discarded its draft context (draftOverall + NHLe pace),
              // leaving the seeded copy to value at 0. Backfill that context
              // onto the existing entry instead of dropping the rookie.
              const rookies = draftedRookieAssets(results.filter(r => r.prospect != null));
              return { ...prev, players: reconcileDraftedRookies(withoutPicks, rookies) };
            });
            clearNavCache();
          }}
        />
      )}

      {/* ── Cup Run future drafts are resolved during rollover; summarize before FA ── */}
      {cupDraftSummary && (
        <CupRunDraftSummaryModal
          summary={cupDraftSummary}
          onSelectUserPick={selectFutureDraftPick}
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
          navMap={navMap}
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
        <MemoModal
          verdict={verdict}
          homeTeamName={teams[0]?.name}
          partnerTeamName={teams[1]?.name}
          onClose={() => setShowMemo(false)}
          onRegenerate={generateClaudeAnalysis}
        />
      )}

      <div className="fixed inset-0 pointer-events-none bg-newsprint" />

      <div className="relative w-full max-w-[1700px] mx-auto px-4 lg:px-6 py-6 lg:py-8 flex flex-col gap-5 overflow-x-hidden">

        <Header activeTab="armchair-gm" />

        <TradeHistoryBar />

        {/* ── Cup Run resume guard — never restore a mid-run flag silently ── */}
        {cupRunPrompt && (
          <CupRunResumePrompt prompt={cupRunPrompt} onDismiss={dismissCupRunPrompt} />
        )}


        {/* ── Cup Run Challenge HUD ── */}
        <CupRunPanel
          run={cupRun}
          canStart={!!homeTeam}
          hasSeasonResult={!!simData?.playoffBracket?.champion}
          advancing={cupAdvancing}
          onStart={handleStartCupRun}
          onRecordAndAdvance={handleCupRunAdvance}
          onAbandon={() => { handleAbandonCupRun(); resetTrades(); }}
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
        <div className="armchair-trade-flow lg:grid-cols-[1fr_260px_1fr] xl:grid-cols-[1fr_280px_1fr] gap-4 lg:gap-5 items-stretch mt-2">
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
                        aria-label="Run GM audit for the current trade"
                        className="tap-target flex-grow py-3.5 font-black uppercase tracking-widest text-[11px] transition-all duration-200 disabled:opacity-40 md:disabled:opacity-25 md:disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]"
                        style={{ background: 'var(--ledger-ink)', color: 'var(--ledger-card-light)', borderRadius: '2px' }}
                        onMouseEnter={e => ready && (e.currentTarget.style.opacity = '0.8')}
                        onMouseLeave={e => ready && (e.currentTarget.style.opacity = '1')}>
                        Make the Call
                      </button>
                      
                      {(teams[0] || teams[1] || blocks[0].length > 0) && (
                        <button
                          onClick={copyTradeLink}
                          aria-label={linkCopied ? "Trade link copied" : "Copy trade link"}
                          className="tap-target shrink-0 flex items-center justify-center w-12 transition-all duration-200"
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
                aria-label="Find teams interested in this trade package"
                className="tap-target w-full py-3 font-black uppercase tracking-widest text-[11px] transition-all duration-200 disabled:opacity-50 active:scale-[0.97]"
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
                aria-label="Open trade block"
                className="tap-target w-full py-2.5 font-black uppercase tracking-widest text-[11px] transition-all duration-200 active:scale-[0.97]"
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
            {matchResults && matchResults.matches.length > 0 && (
              <MatchResultsPanel
                matchResults={matchResults}
                matchFolder={matchFolder}
                setMatchFolder={setMatchFolder}
                approvedOnly={approvedOnly}
                setApprovedOnly={setApprovedOnly}
              />
            )}


            {/* My Team, My Call and Execute Trade moved to Verdict Bottom Sheet */}

            {executedTrades.length > 0 && (
              <button onClick={resetTrades}
                aria-label="Void all executed trades"
                className="tap-target w-full py-2 font-black uppercase tracking-widest text-2xs transition-all btn-ghost">
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
                                  title="X-NAV — Extended Net Asset Value, the player’s tradeable value">NAV</span>
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
            lineupOrders={lineupOrders}
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

    {/* ── Verdict Bottom Sheet — see VerdictSheet.tsx ── */}
    {verdict && verdict.status !== "IDLE" && (
      <VerdictSheet
        verdict={verdict}
        verdictOpen={verdictOpen}
        setVerdictOpen={setVerdictOpen}
        homeTeamName={teams[0]?.name}
        expandedFlag={expandedFlag}
        setExpandedFlag={setExpandedFlag}
        onRunEval={runEval}
        onCopyLink={copyTradeLink}
        linkCopied={linkCopied}
        onRequestClaudeAnalysis={generateClaudeAnalysis}
        onOpenMemo={() => setShowMemo(true)}
        onExecute={() => { executeTrade(); setHomeTeamLocked(true); setVerdictOpen(false); }}
      />
    )}


    {/* Bottom padding so page content isn't hidden behind verdict bar */}
    {verdict && verdict.status !== "IDLE" && <div style={{ height: 52 }} />}
  </>
  );
}
