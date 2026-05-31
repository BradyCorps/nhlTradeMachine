"use client";

import AssetCard from "@/app/components/AssetCard";
import TradePanel from "@/app/components/TradePanel";
import StrandView from "@/app/components/StrandView";
import AssetDropdown from "@/app/components/AssetDropdown";
import TugBar from "@/app/components/TugBar";
import { MicroBar, DeltaRow } from "@/app/components/MicroBar";
import {
  PLAYER_PEDIGREE, PROSPECT_TIERS, SHUTDOWN_D_PEDIGREE, INJURY_RISK,
} from "@/app/lib/player-data";
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from "react";

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

const SEVERITY_STYLES: Record<FlagSeverity, { dot: string; bg: string; border: string; text: string; label: string }> = {
  HARD:  { dot: "bg-red-500",    bg: "bg-red-950/20",    border: "border-red-700/40",    text: "text-red-300",    label: "bg-red-900/50 text-red-300 border-red-800/60" },
  SOFT:  { dot: "bg-orange-500", bg: "bg-orange-950/20", border: "border-orange-700/40", text: "text-orange-300", label: "bg-orange-900/50 text-orange-300 border-orange-800/60" },
  WARN:  { dot: "bg-amber-400",  bg: "bg-amber-950/15",  border: "border-amber-700/30",  text: "text-amber-300",  label: "bg-amber-900/40 text-amber-300 border-amber-800/50" },
  INFO:  { dot: "bg-sky-400",    bg: "bg-sky-950/15",    border: "border-sky-800/30",    text: "text-sky-300",    label: "bg-sky-900/40 text-sky-300 border-sky-800/50" },
};

const STATUS_CONFIG: Record<TradeStatus, { border: string; headerText: string; icon: string; bg: string }> = {
  IDLE:     { border: "border-zinc-800",      headerText: "text-zinc-500",    icon: "—", bg: "bg-zinc-900/40" },
  PENDING:  { border: "border-zinc-700",      headerText: "text-zinc-300",    icon: "…", bg: "bg-zinc-900/40" },
  FAIR:     { border: "border-sky-600/50",    headerText: "text-sky-300",     icon: "⚖", bg: "bg-sky-950/15" },
  WIN:      { border: "border-emerald-600/50",headerText: "text-emerald-400", icon: "↑", bg: "bg-emerald-950/15" },
  LOSS:     { border: "border-amber-600/50",  headerText: "text-amber-400",   icon: "↓", bg: "bg-amber-950/15" },
  BLOCKED:  { border: "border-red-600/50",    headerText: "text-red-400",     icon: "✕", bg: "bg-red-950/20" },
  DECLINED: { border: "border-orange-600/50", headerText: "text-orange-400",  icon: "✗", bg: "bg-orange-950/20" },
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function TradeMachine() {
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [db, setDb] = useState<{ teams: Team[]; players: Asset[] }>({ teams: [], players: [] });
  const [originalDb, setOriginalDb] = useState<{ teams: Team[]; players: Asset[] } | null>(null);
  const [teams, setTeams] = useState<[Team | null, Team | null]>([null, null]);
  const [blocks, setBlocks] = useState<[Asset[], Asset[]]>([[], []]);
  const [verdict, setVerdict] = useState<TradeVerdict | null>(null);
  const [evaluated, setEvaluated] = useState(false);
  const [expandedFlag,   setExpandedFlag]   = useState<number | null>(null);
  const [tradeRequest,   setTradeRequest]   = useState<Asset[] | null>(null);

  // ── Team lock state ───────────────────────────────────────────
  const [homeTeamLocked, setHomeTeamLocked] = useState(false);
  const [showTeamSelect, setShowTeamSelect] = useState(false);

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
  const [navMap, setNavMap] = useState<Record<string, XNAVResult>>({});
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
    fetch("/api/league")
      .then((r) => r.json())
      .then((data) => {
        if (!data.teams || !data.players) {
          setError(`API returned invalid data: ${JSON.stringify(data)}`);
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

  const CAP_CEILING = 104.0; // NHL salary cap ceiling

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
  Calder Trophy: Matthew Schaefer, New York Islanders — unanimous (198 first-place votes)
  Draft Lottery: ${sim.leaders?.draftLottery?.teamName ?? "—"} finished last (${sim.leaders?.draftLottery?.projectedPoints ?? "—"} pts)
  Simulation seed: #${sim.seed ?? "—"}

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
- Calder: Matthew Schaefer, New York Islanders — unanimous. Do NOT give to anyone else.
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

Write 6 sections. The numbers are given — your job is to bring them to life.

**THE TRADE, ONE YEAR LATER**
3-4 sentences. Use the projected stats above. How did the key players perform for their NEW teams?

**${teams[0]!.name.toUpperCase()}'S SEASON**
${isRebuilding
  ? `4-5 sentences. Use the exact finish position from the projection above. Paint the narrative around those numbers — low point, bright spot, draft pick significance.`
  : `4-5 sentences. Use the exact finish and playoff result from above. One defining moment. One unexpected development.`}

**AROUND THE LEAGUE**
4-5 sentences. 3 storylines — one surprise (refer to the standings above for context), one injury, one off-ice story.

**THE YEAR IN NUMBERS**
Use ONLY the numbers from PROJECTED SEASON RESULTS above. Do not invent alternatives.
- **Goals:** [Player who led in pts, approximated goals]
- **Points:** ${sim?.leaders?.topScorer?.name ?? "[Points leader]"}, ${sim?.leaders?.topScorer?.team ?? ""} — ${sim?.leaders?.topScorer?.pts ?? "??"} pts
- **GAA:** ${sim?.leaders?.topGoalie?.name ?? "[GAA leader]"}, ${sim?.leaders?.topGoalie?.team ?? ""} — ${sim?.leaders?.topGoalie?.gaa ?? "??"}
- **Save %:** ${sim?.leaders?.topGoalie?.name ?? "[SV% leader]"}, ${sim?.leaders?.topGoalie?.team ?? ""} — ${sim?.leaders?.topGoalie?.svp ?? "??"}
- **Presidents' Trophy:** ${sim?.leaders?.presidentsTrophy?.teamName ?? "[Team]"} — ${sim?.leaders?.presidentsTrophy?.projectedPoints ?? "??"}  pts
- **Stanley Cup Champion:** ${sim?.leaders?.cupWinner?.teamName ?? "[Team]"} — one line
- **Conn Smythe:** [Best player from Cup winner's roster]
- **Calder Trophy:** Matthew Schaefer, New York Islanders — unanimous

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
    if (evaluated) runEval();
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
      if (v) { setVerdict(v); setEvaluated(true); }
    } catch (e: any) {
      if (e.name !== "AbortError") console.error("[runEval]", e.message);
    }
  }, [blocks, teams, db.teams, allHomeRoster, allPartnerRoster]);

  const navA = blocks[0].reduce((s, a) => s + (navMap[a.id]?.total ?? 0), 0);
  const navB = blocks[1].reduce((s, a) => s + (navMap[a.id]?.total ?? 0), 0);
  const homeNetGain = navB - navA;

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
      {showTeamSelect && db.teams.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
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

            {/* Team grid */}
            <div style={{ padding: '16px 28px 20px' }}>
              <div className="text-[11px] font-black uppercase tracking-[0.3em] mb-3 text-ledger-ink-faint font-mono">
                Select Your Franchise
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
                        <div className="text-2xs font-black" style={{
                          color: isSelected ? 'var(--ledger-card-light)' : 'var(--ledger-ink)',
                          lineHeight: 1.1,
                        }}>
                          {t.id}
                        </div>
                        <div className="text-2xs font-black leading-tight mt-0.5" style={{
                          color: isSelected ? 'var(--ledger-rule-mid)' : 'var(--ledger-ink-body)',
                        }}>
                          {teamName}
                        </div>
                        <div className="text-2xs mt-0.5 font-black uppercase tracking-wide" style={{
                          color: isSelected ? 'var(--ledger-ink-faint)' : phaseColor,
                        }}>
                          {phase}
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

        <TugBar homeNetGain={homeNetGain} navA={navA} navB={navB} />

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
            />
          </div>
        )}

        {/* ── Main Trade Grid ── */}
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_260px_1fr] xl:grid-cols-[1fr_280px_1fr] gap-4 lg:gap-5 items-start">
          {/* Home panel */}
          <TradePanel idx={0} team={teams[0]} nav={navA} capSpace={capA} db={db} blocks={blocks}
            setTeams={setTeams} setBlocks={setBlocks} label="Your Franchise" accent="HOME"
            navMap={navMap}
            locked={homeTeamLocked}
            onRequestTrade={(a) => setTradeRequest([a])}
            onRequestBlockTrade={(block) => setTradeRequest(block)} />

          {/* Middle controls — on mobile sits between panels */}
          <div className="flex flex-col gap-3 lg:pt-8 order-last lg:order-none">
            {teams[0] && teams[1] && (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <ModeBadge team={teams[0]} roster={allHomeRoster} label="Home Mode" />
                  <ModeBadge team={teams[1]} roster={allPartnerRoster} label="Partner Mode" />
                </div>
              </div>
            )}

            <button onClick={runEval} disabled={!blocks[0].length && !blocks[1].length}
              className="w-full py-4 font-black uppercase tracking-widest text-[11px] transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed active:scale-[0.97] btn-stamp"
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--ledger-red-dark)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--ledger-red)')}>
              ✦ Run GM Audit ✦
            </button>

            {verdict && (verdict.status === "FAIR" || verdict.status === "WIN") && (
              <button onClick={() => { executeTrade(); setHomeTeamLocked(true); }}
                className="w-full py-3 font-black uppercase tracking-widest text-[11px] transition-all duration-200 active:scale-[0.97] btn-green-ink">
                ✓ Execute Trade — File It
              </button>
            )}

            {/* My Team, My Call — override for DECLINED/BLOCKED/LOSS
                Cannot override: hard NMC refusal, cap violations, floor violations
                These are CBA rules — not GM preference */}
            {verdict && (verdict.status === "DECLINED" || verdict.status === "BLOCKED" || verdict.status === "LOSS")
              && !verdict.flags.some(f => f.severity === "HARD" && (
                f.category === "CLAUSE" ||
                f.category === "CAP_VIOLATION" ||
                f.category === "FLOOR_VIOLATION"
              )) && (
              <button onClick={() => { executeTrade(); setHomeTeamLocked(true); }}
                className="w-full py-2.5 font-black uppercase tracking-widest text-2xs transition-all duration-200 active:scale-[0.97]"
                style={{
                  background: 'transparent',
                  border: '1px solid #b83020',
                  color: 'var(--ledger-red)',
                }}
                title="You're giving up value — but it's your team, your call. This trade will be locked in.">
                ⚠ My Team, My Call
              </button>
            )}

            {executedTrades.length > 0 && (
              <button onClick={resetTrades}
                className="w-full py-2 font-black uppercase tracking-widest text-2xs transition-all btn-ghost">
                ↺ Void All Trades
              </button>
            )}

            {(blocks[0].length > 0 || blocks[1].length > 0) && (
              <div className="grid grid-cols-2 gap-1.5">
                <MiniStat label="Out" val={blocks[0].length.toString()} />
                <MiniStat label="In" val={blocks[1].length.toString()} />
                <MiniStat label="Variance" val={verdict ? `${verdict.metrics.variance.toFixed(0)}%` : "—"} />
                <MiniStat label="Cap Δ" val={verdict ? `${verdict.metrics.capDelta > 0 ? "+" : ""}${verdict.metrics.capDelta.toFixed(1)}M` : "—"} />
              </div>
            )}

            {verdict && verdict.status !== "IDLE" && (
              <VerdictPanel verdict={verdict} sc={sc} expandedFlag={expandedFlag} setExpandedFlag={setExpandedFlag} onRequestClaudeAnalysis={generateClaudeAnalysis} onOpenMemo={() => setShowMemo(true)} />
            )}
          </div>

          <TradePanel idx={1} team={teams[1]} nav={navB} capSpace={capB} db={db} blocks={blocks}
            setTeams={setTeams} setBlocks={setBlocks} label="Trade Partner" accent="PARTNER"
            navMap={navMap}
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
                    ⚡ Projected Season Results
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
                    { label: "Stanley Cup", val: simData.leaders?.cupWinner?.teamName },
                    { label: "Points Leader", val: `${simData.leaders?.topScorer?.name?.split(' ').pop()} ${simData.leaders?.topScorer?.pts}pts` },
                    { label: "Draft Lottery", val: `${simData.leaders?.draftLottery?.teamName} (${simData.leaders?.draftLottery?.projectedPoints}pts)` },
                  ].map((s: any) => (
                    <div key={s.label} style={{ background: 'var(--ledger-card)', border: '1px solid #b8a070', padding: '6px 8px' }}>
                      <div style={{ fontSize: '6.5px', color: 'var(--ledger-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>{s.label}</div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ledger-ink)' }}>{s.val}</div>
                    </div>
                  ))}
                </div>
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
                  <span className="font-black font-mono">QoC — Quality of Competition</span>
                  <p className="mt-0.5">Rank of opponents faced by ice time. Lower rank = harder matchups. Rank 1 faces the toughest competition in the league every night. A player with QoC rank 50 and good SUPP is genuinely shutting down the opposition's best players.</p>
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
const CHAMPIONSHIP_TEMPLATE = {
  off: { SCR: 0.55, xG: 0.52, OFF: 0.58, NOIV: 0.55, TOI: 0.68 },
  def: { SUPP: 0.55, QoC: 0.60, DEF: 0.52, DZ: 0.50, AGE: 0.52 },
};

function computeRosterStrand(roster: Asset[], navMap: Record<string, XNAVResult>) {
  // Weight by ice time and use only meaningful contributors
  // Top-9 forwards by TOI + top-4 D by TOI — excludes depth drag
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

  const norm = (val: number, min: number, max: number) =>
    Math.max(0, Math.min(1, (val - min) / (max - min)));

  let offTotals = { SCR: 0, xG: 0, OFF: 0, NOIV: 0, TOI: 0 };
  let defTotals = { SUPP: 0, QoC: 0, DEF: 0, DZ: 0, AGE: 0 };
  const n = qualified.length;

  for (const p of qualified) {
    const xnav = navMap[p.id] ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };
    const isD  = p.position === "D";
    // Use same tighter ranges as StrandView for consistency
    offTotals.SCR  += norm(safe(p.ptsPace), 0, isD ? 80 : 100);
    offTotals.xG   += norm(safe(p.xGPace ?? 0), 0, isD ? 25 : 50);
    offTotals.OFF  += norm(xnav.off, -80, 300);
    offTotals.NOIV += norm(safe(p.xgRelTM ?? 0), -12, 12);
    offTotals.TOI  += norm(safe(p.avgTOI), 10, 27);
    defTotals.SUPP += norm(-(p.xgaRelTM ?? 0), -1.5, 1.5);
    defTotals.QoC  += norm(400 - safe(p.qocRank /* iceTimeRank — ice time volume rank, NOT competition quality */ ?? 400), 50, 380);
    defTotals.DEF  += norm(xnav.def, -60, 150);
    defTotals.DZ   += 1 - norm(safe(p.dzPct ?? 0.5), 0.3, 0.7);
    defTotals.AGE  += norm(xnav.age, -80, 60);
  }

  return {
    off: {
      SCR:  offTotals.SCR  / n,
      xG:   offTotals.xG   / n,
      OFF:  offTotals.OFF  / n,
      NOIV: offTotals.NOIV / n,
      TOI:  offTotals.TOI  / n,
    },
    def: {
      SUPP: defTotals.SUPP / n,
      QoC:  defTotals.QoC  / n,
      DEF:  defTotals.DEF  / n,
      DZ:   defTotals.DZ   / n,
      AGE:  defTotals.AGE  / n,
    },
  };
}

// ── Contention Cycle Computation ─────────────────────────────
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
  homeTeam, partnerTeam, homeRoster, partnerRoster, homeBlocks, partnerBlocks, navMap
}: {
  homeTeam: Team | null;
  partnerTeam: Team | null;
  homeRoster: Asset[];
  partnerRoster: Asset[];
  homeBlocks: Asset[];
  partnerBlocks: Asset[];
  navMap: Record<string, XNAVResult>;
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
    off: Object.entries(CHAMPIONSHIP_TEMPLATE.off).map(([k, target]) => ({
      label: k, gap: (homeStrand.off as any)[k] - target
    })),
    def: Object.entries(CHAMPIONSHIP_TEMPLATE.def).map(([k, target]) => ({
      label: k, gap: (homeStrand.def as any)[k] - target
    })),
  };

  // Top needs: biggest negative gaps
  const allGaps = [...homeGaps.off, ...homeGaps.def]
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 3);

  const offAvgHome = Object.values(homeStrand.off).reduce((s, v) => s + v, 0) / 5;
  const defAvgHome = Object.values(homeStrand.def).reduce((s, v) => s + v, 0) / 5;
  const offAvgPart = Object.values(partnerStrand.off).reduce((s, v) => s + v, 0) / 5;
  const defAvgPart = Object.values(partnerStrand.def).reduce((s, v) => s + v, 0) / 5;

  const W = 260, H = 80;
  const offColor = "#1a2e5c";
  const defColor = "#b83020";
  const tmplColor = "#9a7d58";
  const freq = (2 * Math.PI) / W;
  const amplitude = 22;

  const buildPath = (offA: number, defA: number, phase: number) => {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = t * W;
      pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${(H/2 - (amplitude * (0.3 + offA * 0.7)) * Math.sin(freq * x * 2 + phase)).toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const buildDefPath = (defA: number, phase: number) => {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = t * W;
      pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${(H/2 + (amplitude * (0.3 + defA * 0.7)) * Math.sin(freq * x * 2 + phase)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  // Championship template averages
  const tmplOff = Object.values(CHAMPIONSHIP_TEMPLATE.off).reduce((s,v) => s+v, 0) / 5;
  const tmplDef = Object.values(CHAMPIONSHIP_TEMPLATE.def).reduce((s,v) => s+v, 0) / 5;

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
          {hasActiveTrade && (
            <span className="strands-post-trade-badge">Post-Trade</span>
          )}
        </div>
        <div className="strands-header-right">
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
          <p className="strands-context">
            Each helix shows a team's aggregate offensive (navy) and defensive (red) profile across their top-9 forwards and top-4 D by ice time. The dashed gold line is the championship template. The dotted green line is the playoff threshold — the minimum profile needed to realistically compete for a postseason spot. Gaps below either line are roster needs.{hasActiveTrade ? " Updated to reflect the current trade." : ""}
          </p>

          {/* ── Contention Cycle ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {[
              { team: homeTeam,    contention: homeContention,    label: "Your Franchise" },
              { team: partnerTeam, contention: partnerContention, label: "Trade Partner"  },
            ].filter(x => x.team).map(({ team, contention, label }) => {
              const quadrantConfig: Record<string, { bg: string; text: string; label: string; desc: string }> = {
                WIN_NOW:        { bg: 'var(--ledger-red)', text: 'white',    label: 'Win Now',        desc: 'Window is open — compete now'              },
                WINDOW_OPEN:    { bg: 'var(--ledger-green)', text: 'white',    label: 'Window Open',    desc: 'Strong present and future'                  },
                WINDOW_OPENING: { bg: 'var(--ledger-navy)', text: 'white',    label: 'Window Opening', desc: 'Building toward contention'                 },
                REBUILDING:     { bg: 'var(--ledger-brown)', text: 'var(--ledger-card-light)', label: 'Rebuilding',     desc: 'Developing for the future'                  },
              };
              const qc = quadrantConfig[contention.quadrant];
              const dotX = (contention.present / 10) * 74 + 4;
              const dotY = 78 - (contention.future / 10) * 74;
              return (
                <div key={team!.id} style={{ background: 'var(--ledger-card)', border: '1px solid #b8a070', borderTop: `3px solid ${qc.bg}`, padding: '12px 14px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '11px', color: 'var(--ledger-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '2px' }}>{label}</div>
                      <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--ledger-ink)', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team!.name}</div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ background: qc.bg, color: qc.text, fontSize: '11px', fontWeight: 900, padding: '4px 8px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px', whiteSpace: 'nowrap' }}>{qc.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ledger-ink-faint)', whiteSpace: 'nowrap' }}>{qc.desc}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                    {/* Mini quadrant chart */}
                    <div style={{ flexShrink: 0 }}>
                      <svg width="130" height="130" viewBox="0 0 82 82">
                        <rect x="1"  y="1"  width="39" height="39" fill="rgba(26,46,92,0.07)"  rx="1"/>
                        <rect x="42" y="1"  width="39" height="39" fill="rgba(26,92,46,0.07)"  rx="1"/>
                        <rect x="1"  y="42" width="39" height="39" fill="rgba(107,80,48,0.07)" rx="1"/>
                        <rect x="42" y="42" width="39" height="39" fill="rgba(184,48,32,0.07)" rx="1"/>
                        <line x1="41" y1="1" x2="41" y2="81" stroke="#c8b890" strokeWidth="1"/>
                        <line x1="1" y1="41" x2="81" y2="41" stroke="#c8b890" strokeWidth="1"/>
                        <text x="20.5" y="10" textAnchor="middle" fontSize="7" fill="#1a2e5c" fontFamily="Courier Prime, monospace" fontWeight="bold" opacity="0.8">OPENING</text>
                        <text x="61.5" y="10" textAnchor="middle" fontSize="7" fill="#1a5c2e" fontFamily="Courier Prime, monospace" fontWeight="bold" opacity="0.8">WIN OPEN</text>
                        <text x="20.5" y="79" textAnchor="middle" fontSize="7" fill="#6b5030" fontFamily="Courier Prime, monospace" fontWeight="bold" opacity="0.8">REBUILD</text>
                        <text x="61.5" y="79" textAnchor="middle" fontSize="7" fill="#b83020" fontFamily="Courier Prime, monospace" fontWeight="bold" opacity="0.8">WIN NOW</text>
                        <circle cx={dotX} cy={dotY} r="6"   fill={qc.bg} opacity="0.2"/>
                        <circle cx={dotX} cy={dotY} r="3.5" fill={qc.bg}/>
                        <circle cx={dotX} cy={dotY} r="1.5" fill="white" opacity="0.7"/>
                      </svg>
                      <div style={{ fontSize: '11px', color: 'var(--ledger-ink-faint)', textAlign: 'center', marginTop: '3px', letterSpacing: '0.05em', fontWeight: 900 }}>PRESENT → / ↑ FUTURE</div>
                    </div>
                    {/* Ratings */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
                      {([
                        { label: 'PRESENT RATING', val: contention.present, sublabel: contention.presentLabel, hint: 'Roster quality right now',      color: contention.present >= 6.5 ? 'var(--ledger-green)' : contention.present >= 5.0 ? 'var(--ledger-amber)' : 'var(--ledger-red)' },
                        { label: 'FUTURE RATING',  val: contention.future,  sublabel: contention.futureLabel,  hint: 'Projected value in ~3 years', color: contention.future  >= 6.0 ? 'var(--ledger-green)' : contention.future  >= 4.5 ? 'var(--ledger-amber)' : 'var(--ledger-red)' },
                      ] as const).map(r => (
                        <div key={r.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px', gap: '4px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--ledger-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>{r.label}</span>
                            <span style={{ fontSize: '11px', color: r.color, fontWeight: 900, whiteSpace: 'nowrap' }}>{r.sublabel}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ flex: 1, height: '6px', background: 'var(--ledger-rule-mid)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${r.val * 10}%`, height: '100%', background: r.color, borderRadius: '3px', transition: 'width 0.5s ease' }}/>
                            </div>
                            <span style={{ fontSize: '14px', fontWeight: 900, color: r.color, minWidth: '30px', textAlign: 'right', lineHeight: 1 }}>{r.val.toFixed(1)}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--ledger-rule)', marginTop: '2px' }}>{r.hint}</div>
                        </div>
                      ))}
                      {hasActiveTrade && (
                        <div style={{ fontSize: '11px', color: 'var(--ledger-green)', borderTop: '1px solid #c8b890', paddingTop: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ↻ Ratings updated for this trade
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {homeTeam && (
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="text-2xs font-black px-2 py-1" style={{
                color: homeTeam.standing <= 8 ? 'var(--ledger-green)' : homeTeam.standing <= 16 ? 'var(--ledger-amber)' : 'var(--ledger-red)',
                border: `1px solid ${homeTeam.standing <= 8 ? 'rgba(26,92,46,0.4)' : homeTeam.standing <= 16 ? 'rgba(138,92,0,0.4)' : 'rgba(184,48,32,0.4)'}`,
              }}>
                {homeTeam.name} · #{homeTeam.standing}/32 · {homeTeam.standing <= 8 ? '✓ IN PLAYOFFS' : homeTeam.standing <= 12 ? '~ BUBBLE' : homeTeam.standing <= 16 ? '~ WILDCARD RANGE' : '✗ OUT'}
              </div>
              {partnerTeam && (
                <div className="text-2xs font-black px-2 py-1" style={{
                  color: partnerTeam.standing <= 8 ? 'var(--ledger-green)' : partnerTeam.standing <= 16 ? 'var(--ledger-amber)' : 'var(--ledger-red)',
                  border: `1px solid ${partnerTeam.standing <= 8 ? 'rgba(26,92,46,0.4)' : partnerTeam.standing <= 16 ? 'rgba(138,92,0,0.4)' : 'rgba(184,48,32,0.4)'}`,
                }}>
                  {partnerTeam.name} · #{partnerTeam.standing}/32 · {partnerTeam.standing <= 8 ? '✓ IN PLAYOFFS' : partnerTeam.standing <= 12 ? '~ BUBBLE' : partnerTeam.standing <= 16 ? '~ WILDCARD RANGE' : '✗ OUT'}
                </div>
              )}
            </div>
          )}

          <div className="strands-helix-grid">
            {[
              { team: homeTeam,    offA: offAvgHome, defA: defAvgHome },
              { team: partnerTeam, offA: offAvgPart, defA: defAvgPart },
            ].map(({ team, offA, defA }) => {
              const W2 = 560; const H2 = 140;
              const freq2 = (2 * Math.PI) / W2;
              const amp2  = 42;
              const buildP = (a: number, flip: boolean) => {
                const pts = [];
                for (let i = 0; i <= 120; i++) {
                  const x = (i / 120) * W2;
                  const y = H2/2 + (flip ? 1 : -1) * (amp2 * (0.25 + a * 0.75)) * Math.sin(freq2 * x * 2);
                  pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
                }
                return pts.join(" ");
              };
              const tmplOffA = Object.values(CHAMPIONSHIP_TEMPLATE.off).reduce((s: number, v) => s + (v as number), 0) / 5;
              const tmplDefA = Object.values(CHAMPIONSHIP_TEMPLATE.def).reduce((s: number, v) => s + (v as number), 0) / 5;
              // Playoff threshold — roughly 80% of championship template
              const playoffOffA = tmplOffA * 0.80;
              const playoffDefA = tmplDefA * 0.80;
              const rungs = [70, 140, 210, 280, 350, 420, 490];
              return (
                <div key={team?.id} className="strands-helix-card">
                  <div className="strands-helix-card-header">
                    <span className="strands-helix-team-name">{team?.name}</span>
                    <div className="strands-helix-scores">
                      <span className="strands-helix-off">OFF {(offA * 100).toFixed(0)}</span>
                      <span className="strands-helix-def">DEF {(defA * 100).toFixed(0)}</span>
                    </div>
                  </div>
                  <svg className="strands-helix-svg" viewBox={`0 0 ${W2} ${H2}`}>
                    {/* Championship template — gold dashed */}
                    <path d={buildP(tmplOffA, false)} fill="none"
                      stroke="var(--rule)" strokeWidth="2" strokeDasharray="8,5" opacity="0.8"/>
                    <path d={buildP(tmplDefA, true)} fill="none"
                      stroke="var(--rule)" strokeWidth="2" strokeDasharray="8,5" opacity="0.8"/>
                    {/* Playoff threshold — green dotted */}
                    <path d={buildP(playoffOffA, false)} fill="none"
                      stroke="#1a5c2e" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.5"/>
                    <path d={buildP(playoffDefA, true)} fill="none"
                      stroke="#1a5c2e" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.5"/>
                    {rungs.map(x => {
                      const oy = H2/2 - (amp2*(0.25+offA*0.75))*Math.sin(freq2*x*2);
                      const dy = H2/2 + (amp2*(0.25+defA*0.75))*Math.sin(freq2*x*2);
                      return <line key={x} x1={x} y1={oy} x2={x} y2={dy}
                        stroke="var(--rule)" strokeWidth="1" opacity="0.2"/>;
                    })}
                    <path d={buildP(defA, true)} fill="none"
                      stroke="var(--red)" strokeWidth="3" strokeLinecap="round" opacity="0.9"/>
                    <path d={buildP(offA, false)} fill="none"
                      stroke="var(--blue)" strokeWidth="3" strokeLinecap="round" opacity="0.9"/>
                    <line x1="14" y1="12" x2="34" y2="12" stroke="var(--blue)" strokeWidth="2.5"/>
                    <text x="38" y="16" fontSize="9" fill="var(--blue)" fontFamily="Courier Prime, monospace" fontWeight="bold">OFFENSE</text>
                    <line x1="14" y1="27" x2="34" y2="27" stroke="var(--red)" strokeWidth="2.5"/>
                    <text x="38" y="31" fontSize="9" fill="var(--red)" fontFamily="Courier Prime, monospace" fontWeight="bold">DEFENSE</text>
                    <line x1="14" y1="42" x2="34" y2="42" stroke="var(--rule)" strokeWidth="2" strokeDasharray="5,3"/>
                    <text x="38" y="46" fontSize="9" fill="var(--rule)" fontFamily="Courier Prime, monospace">CHAMP. TEMPLATE</text>
                    <line x1="14" y1="57" x2="34" y2="57" stroke="#1a5c2e" strokeWidth="1.5" strokeDasharray="4,3"/>
                    <text x="38" y="61" fontSize="9" fill="#1a5c2e" fontFamily="Courier Prime, monospace">PLAYOFF THRESHOLD</text>
                  </svg>
                </div>
              );
            })}
          </div>

          <div className="strands-gaps-header">
            {homeTeam?.name} — Roster Gaps vs Playoff & Championship Thresholds{hasActiveTrade ? " (post-trade)" : ""}
          </div>

          {/* Metric explanations */}
          {(() => {
            const GAP_EXPLAIN: Record<string, { full: string; need: string }> = {
              SCR:  { full: "Scoring Pace",           need: "More offensive production from forwards/D" },
              xG:   { full: "Expected Goals",         need: "Higher quality shot generation"            },
              OFF:  { full: "Offensive NAV",          need: "Better offensive contributors overall"      },
              OPS:  { full: "Offensive Point Shares", need: "More offensive output across the lineup"    },
              NOIV: { full: "On-Ice Impact",          need: "Players who elevate their linemates"        },
              TOI:  { full: "Ice Time Quality",       need: "Heavier usage from top players"             },
              SUPP: { full: "Shot Suppression",       need: "Better defensive structure under pressure"  },
              QoC:  { full: "Competition Quality",    need: "Players who can handle top-line matchups"   },
              DEF:  { full: "Defensive NAV",          need: "Better defensive contributors overall"      },
              DPS:  { full: "Defensive Point Shares", need: "More defensive value across the roster"     },
              DZ:   { full: "Defensive Zone Starts",  need: "More reliable defensive zone players"       },
              AGE:  { full: "Age Curve",              need: "Younger contributors with upside"           },
            };
            const allGapsSorted = [...homeGaps.off, ...homeGaps.def].sort((a, b) => a.gap - b.gap);
            const biggestNeeds = allGapsSorted.filter(g => g.gap < -0.10).slice(0, 3);
            return (
              <>
                {/* What this team needs */}
                {biggestNeeds.length > 0 && (
                  <div style={{ background: 'var(--ledger-cream)', border: '1px solid #c8b890', padding: '8px 12px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ledger-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '6px' }}>
                      🔍 What This Team Needs{hasActiveTrade ? ' (post-trade)' : ''}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {biggestNeeds.map(g => (
                        <div key={g.label} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '8px', fontWeight: 900, color: 'var(--ledger-red)', minWidth: '28px' }}>{g.label}</span>
                          <span style={{ fontSize: '10px', color: 'var(--ledger-ink-mid)' }}>
                            {GAP_EXPLAIN[g.label]?.need ?? `Improve ${GAP_EXPLAIN[g.label]?.full ?? g.label}`}
                          </span>
                          <span style={{ fontSize: '8px', color: 'var(--ledger-red)', marginLeft: 'auto', fontWeight: 900 }}>
                            {(g.gap * 100).toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
// VERDICT PANEL — expandable GM flags
// ============================================================
function VerdictPanel({ verdict, sc, expandedFlag, setExpandedFlag, onRequestClaudeAnalysis, onOpenMemo }: {
  verdict: TradeVerdict;
  sc: typeof STATUS_CONFIG[TradeStatus];
  expandedFlag: number | null;
  setExpandedFlag: (i: number | null) => void;
  onRequestClaudeAnalysis: () => void;
  onOpenMemo: () => void;
}) {
  const flags = verdict.flags;
  const hardCount = flags.filter((f) => f.severity === "HARD").length;
  const softCount = flags.filter((f) => f.severity === "SOFT").length;
  const warnCount = flags.filter((f) => f.severity === "WARN").length;

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-500 ${sc.bg} ${sc.border}`}>
      {/* Status header */}
      <div className="px-5 py-4 border-b border-zinc-800/30">
        <div className="flex items-center justify-between mb-1">
          <div className={`text-2xl font-black italic uppercase leading-none tracking-tight ${sc.headerText}`}>
            {verdict.status}
          </div>
          <div className={`text-lg font-black font-mono ${sc.headerText}`}>{sc.icon}</div>
        </div>
        <div className="text-2xs text-zinc-500 font-bold">{verdict.message}</div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {hardCount > 0 && <span className="text-2xs font-black px-2 py-0.5 rounded-full bg-red-900/50 text-red-300 border border-red-800/50">{hardCount} HARD BLOCK{hardCount > 1 ? "S" : ""}</span>}
          {softCount > 0 && <span className="text-2xs font-black px-2 py-0.5 rounded-full bg-orange-900/50 text-orange-300 border border-orange-800/50">{softCount} GM VETO{softCount > 1 ? "S" : ""}</span>}
          {warnCount > 0 && <span className="text-2xs font-black px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-800/40">{warnCount} WARNING{warnCount > 1 ? "S" : ""}</span>}
        </div>
      </div>

      {/* Metrics */}
      <div className="px-5 py-3 border-b border-zinc-800/30 font-mono space-y-1">
        <DeltaRow label="Production Δ"   val={verdict.metrics.ptsGain}   unit=" pts/82" />
        <DeltaRow label="Suppression Δ"  val={verdict.metrics.defGain}   unit=" rel" />
        <DeltaRow label="Cap Impact"      val={verdict.metrics.capDelta}  unit="M" invert />
        <DeltaRow label="Imbalance"       val={-verdict.metrics.variance} unit="%" />
        <div className="border-t border-zinc-800/30 pt-1 mt-1">
          <DeltaRow label="Est. Wins Added"     val={verdict.metrics.ewaHome}   unit="W" />
          <DeltaRow label="Window Shift"        val={verdict.metrics.cwiYears}  unit="yr"
            tooltip={verdict.metrics.cwiYears > 0
              ? `Contention window opens ~${Math.abs(verdict.metrics.cwiYears).toFixed(1)}yr sooner`
              : verdict.metrics.cwiYears < 0
              ? `Contention window shortens by ~${Math.abs(verdict.metrics.cwiYears).toFixed(1)}yr`
              : "Neutral impact on window"} />
        </div>
      </div>

      {/* GM Flags — expandable */}
      <div className="px-4 py-3 space-y-1.5 border-b border-zinc-800/30">
        <div className="text-2xs font-black text-zinc-700 uppercase tracking-widest mb-2">
          GM Intelligence Flags — click to expand
        </div>
        {flags.length === 0 && <div className="text-2xs text-zinc-700 italic">No flags raised.</div>}
        {flags.map((flag, i) => {
          const fs = SEVERITY_STYLES[flag.severity];
          const isOpen = expandedFlag === i;
          return (
            <div key={i}
              className={`rounded-lg border overflow-hidden cursor-pointer transition-all duration-200 ${fs.bg} ${fs.border} hover:opacity-90`}
              onClick={() => setExpandedFlag(isOpen ? null : i)}>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${fs.dot}`} />
                <span className={`text-2xs font-black uppercase tracking-tight flex-1 leading-tight ${fs.text}`}>
                  {flag.headline}
                </span>
                {flag.affectedAsset && (
                  <span className={`text-2xs font-black px-1.5 py-0.5 rounded border shrink-0 ${fs.label}`}>
                    {flag.affectedAsset.split(" ").pop()}
                  </span>
                )}
                <span className={`text-2xs font-black shrink-0 ml-1 ${fs.text}`}>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && (
                <div className={`px-3 pb-3 pt-0.5 border-t ${fs.border}`}>
                  <p className={`text-2xs leading-relaxed font-medium ${fs.text}`}>{flag.explanation}</p>
                  {flag.vetoesSide !== undefined && (
                    <div className={`mt-2 text-2xs font-black uppercase tracking-wide border-t pt-1.5 ${fs.border} ${fs.text} opacity-70`}>
                      Vetoes: {flag.vetoesSide === 0 ? "Home team GM declines" : "Partner GM declines"}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Claude GM Analysis — triggers modal ───────────────── */}
      <div className="px-4 py-3">
        {!verdict.claudeAnalysis && !verdict.claudeLoading && (
          <button
            onClick={onRequestClaudeAnalysis}
            className="w-full py-2.5 font-black text-2xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            style={{ background: 'transparent', border: '1px solid #b8a070', color: 'var(--ledger-brown)', borderRadius: '2px' }}
          >
            <span className="text-ledger-red">✦</span> Generate Front Office Memo
          </button>
        )}

        {verdict.claudeLoading && (
          <div className="flex items-center gap-2.5 py-3 px-1">
            <div className="w-3 h-3 rounded-full border-t-transparent animate-spin shrink-0" style={{ borderColor: 'var(--ledger-red)', borderTopColor: 'transparent', borderWidth: '2px' }} />
            <span className="text-2xs font-bold text-ledger-ink-faint font-mono">Claude is reviewing the trade...</span>
          </div>
        )}

        {verdict.claudeAnalysis && !verdict.claudeLoading && (
          <button
            onClick={onOpenMemo}
            className="w-full py-2.5 font-black text-2xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            style={{ background: 'var(--ledger-green)', border: '1px solid #0f3d1e', color: 'white', borderRadius: '2px' }}
          >
            ✦ Read Front Office Memo
          </button>
        )}
      </div>
    </div>
  );
}

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
      <div className="text-zinc-700 text-xs">Check that /api/league is deployed and reachable.</div>
    </div>
  );
}