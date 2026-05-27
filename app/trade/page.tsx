"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ContractSyncer from "@/app/components/ContractSyncer";
import TradeProposalEngine from "@/app/components/TradeProposal";
import PlayerComparison from "@/app/components/PlayerComparison";
import CapProjection from "@/app/components/CapProjection";
import LedgerDropdown from "@/app/components/LedgerDropdown";

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
const PLAYER_PEDIGREE: Record<string, { peakPtsPace?: number; peakGsax?: number; careerGsax?: number; awards?: string[]; allStarYears?: number }> = {
  // ── Elite Goalies ──
  "Connor Hellebuyck":  { peakGsax: 28.4, careerGsax: 108, awards: ["Hart","Vezina","Vezina","Vezina"], allStarYears: 5 },
  "Igor Shesterkin":    { peakGsax: 25.1, careerGsax: 72,  awards: ["Vezina","Vezina"], allStarYears: 4 },
  "Andrei Vasilevskiy": { peakGsax: 22.1, careerGsax: 95,  awards: ["Vezina","Conn Smythe"], allStarYears: 4 },
  "Frederik Andersen":  { peakGsax: 18.2, careerGsax: 48,  awards: [], allStarYears: 1 },
  "Jake Oettinger":     { peakGsax: 16.4, careerGsax: 38,  awards: [], allStarYears: 1 },
  "Juuse Saros":        { peakGsax: 19.8, careerGsax: 52,  awards: [], allStarYears: 2 },
  "Ilya Sorokin":       { peakGsax: 21.3, careerGsax: 55,  awards: [], allStarYears: 2 },
  "Linus Ullmark":      { peakGsax: 22.5, careerGsax: 44,  awards: ["Vezina"], allStarYears: 2 },
  "Jeremy Swayman":     { peakGsax: 17.2, careerGsax: 32,  awards: [], allStarYears: 1 },
  "Thatcher Demko":     { peakGsax: 18.9, careerGsax: 41,  awards: [], allStarYears: 1 },
  "Stuart Skinner":     { peakGsax: 12.1, careerGsax: 22,  awards: [], allStarYears: 0 },
  "Samuel Montembeault":{ peakGsax: 14.2, careerGsax: 28,  awards: [], allStarYears: 0 },

  // ── Elite Forwards ──
  "Connor McDavid":     { peakPtsPace: 153, awards: ["Hart","Hart","Hart","Ted Lindsay","Ted Lindsay","Ted Lindsay","Calder"], allStarYears: 8 },
  "Leon Draisaitl":     { peakPtsPace: 128, awards: ["Hart","Ted Lindsay","Art Ross"], allStarYears: 5 },
  "Nathan MacKinnon":   { peakPtsPace: 140, awards: ["Hart","Hart","Ted Lindsay","Ted Lindsay"], allStarYears: 7 },
  "Nikita Kucherov":    { peakPtsPace: 144, awards: ["Hart","Ted Lindsay","Art Ross","Conn Smythe"], allStarYears: 5 },
  "Auston Matthews":    { peakPtsPace: 124, awards: ["Hart","Calder","Rocket Richard","Rocket Richard","Rocket Richard"], allStarYears: 5 },
  "Sidney Crosby":      { peakPtsPace: 120, awards: ["Hart","Hart","Hart","Conn Smythe","Conn Smythe"], allStarYears: 9 },
  "Alexander Ovechkin": { peakPtsPace: 115, awards: ["Hart","Hart","Hart","Art Ross","Rocket Richard","Rocket Richard","Rocket Richard"], allStarYears: 13 },
  "David Pastrnak":     { peakPtsPace: 118, awards: ["Rocket Richard"], allStarYears: 4 },
  "Mikko Rantanen":     { peakPtsPace: 122, awards: ["Ted Lindsay"], allStarYears: 3 },
  "Aleksander Barkov":  { peakPtsPace: 98,  awards: ["Selke","Selke"], allStarYears: 3 },
  "Mitch Marner":       { peakPtsPace: 101, awards: [], allStarYears: 3 },
  "Jonathan Huberdeau": { peakPtsPace: 115, awards: [], allStarYears: 2 },
  "Elias Pettersson":   { peakPtsPace: 102, awards: [], allStarYears: 2 },
  "Brady Tkachuk":      { peakPtsPace: 88,  awards: [], allStarYears: 1 },
  "Matthew Tkachuk":    { peakPtsPace: 109, awards: ["Conn Smythe"], allStarYears: 3 },
  "Mark Scheifele":     { peakPtsPace: 92,  awards: [], allStarYears: 2 },
  "Kyle Connor":        { peakPtsPace: 90,  awards: [], allStarYears: 1 },
  "Jake Guentzel":      { peakPtsPace: 84,  awards: [], allStarYears: 1 },
  "Jason Robertson":    { peakPtsPace: 102, awards: [], allStarYears: 2 },
  "Brock Boeser":       { peakPtsPace: 82,  awards: [], allStarYears: 1 },
  "Jesper Bratt":       { peakPtsPace: 92,  awards: [], allStarYears: 1 },
  "Tage Thompson":      { peakPtsPace: 103, awards: [], allStarYears: 2 },
  "J.T. Miller":        { peakPtsPace: 99,  awards: [], allStarYears: 1 },
  "Sebastian Aho":      { peakPtsPace: 94,  awards: [], allStarYears: 2 },
  "Andrei Svechnikov":  { peakPtsPace: 80,  awards: [], allStarYears: 1 },
  "Travis Konecny":     { peakPtsPace: 88,  awards: [], allStarYears: 1 },
  "Kirill Marchenko":   { peakPtsPace: 76,  awards: [], allStarYears: 0 },
  "Jake Zibanejad":     { peakPtsPace: 92,  awards: [], allStarYears: 2 },
  "Mika Zibanejad":     { peakPtsPace: 92,  awards: [], allStarYears: 2 },
  "Vincent Trocheck":   { peakPtsPace: 78,  awards: [], allStarYears: 1 },
  "Nico Hischier":      { peakPtsPace: 82,  awards: [], allStarYears: 1 },
  "Jack Hughes":        { peakPtsPace: 99,  awards: [], allStarYears: 2 },
  "Trevor Zegras":      { peakPtsPace: 74,  awards: [], allStarYears: 1 },
  "Tim Stützle":        { peakPtsPace: 88,  awards: [], allStarYears: 1 },
  "Dylan Cozens":       { peakPtsPace: 80,  awards: [], allStarYears: 1 },
  "Roope Hintz":        { peakPtsPace: 88,  awards: [], allStarYears: 1 },
  "Ryan Nugent-Hopkins":{ peakPtsPace: 84,  awards: [], allStarYears: 1 },
  "Evgeni Malkin":      { peakPtsPace: 112, awards: ["Hart","Art Ross","Conn Smythe"], allStarYears: 6 },
  "Jack Eichel":        { peakPtsPace: 95,  awards: [], allStarYears: 2 },
  "Artemi Panarin":     { peakPtsPace: 108, awards: ["Calder"], allStarYears: 4 },
  "Steven Stamkos":     { peakPtsPace: 98,  awards: ["Rocket Richard"], allStarYears: 4 },

  // ── Elite Defencemen ──
  "Cale Makar":         { peakPtsPace: 93,  awards: ["Calder","Norris","Norris","Conn Smythe"], allStarYears: 4 },
  "Roman Josi":         { peakPtsPace: 96,  awards: ["Norris"], allStarYears: 3 },
  "Adam Fox":           { peakPtsPace: 102, awards: ["Norris","Norris"], allStarYears: 3 },
  "Quinn Hughes":       { peakPtsPace: 102, awards: ["Norris"], allStarYears: 3 },
  "Josh Morrissey":     { peakPtsPace: 76,  awards: [], allStarYears: 1 },
  "Jaccob Slavin":      { peakPtsPace: 42,  awards: [], allStarYears: 0 },
  "Rasmus Dahlin":      { peakPtsPace: 88,  awards: [], allStarYears: 2 },
  "Evan Bouchard":      { peakPtsPace: 82,  awards: [], allStarYears: 1 },
  "Devon Toews":        { peakPtsPace: 62,  awards: [], allStarYears: 1 },
  "Dougie Hamilton":    { peakPtsPace: 72,  awards: [], allStarYears: 2 },
  "Victor Hedman":      { peakPtsPace: 74,  awards: ["Norris","Conn Smythe"], allStarYears: 5 },
  "Drew Doughty":       { peakPtsPace: 68,  awards: ["Norris","Conn Smythe"], allStarYears: 5 },
  "Erik Karlsson":      { peakPtsPace: 100, awards: ["Norris","Norris","Norris"], allStarYears: 6 },
  "Brent Burns":        { peakPtsPace: 76,  awards: ["Norris"], allStarYears: 4 },
  "Thomas Chabot":      { peakPtsPace: 72,  awards: [], allStarYears: 1 },
  "Miro Heiskanen":     { peakPtsPace: 68,  awards: [], allStarYears: 2 },
  "Jakob Chychrun":     { peakPtsPace: 62,  awards: [], allStarYears: 1 },
  "Zach Werenski":      { peakPtsPace: 72,  awards: [], allStarYears: 1 },
  "Moritz Seider":      { peakPtsPace: 58,  awards: ["Calder"], allStarYears: 1 },
  "Owen Power":         { peakPtsPace: 62,  awards: [], allStarYears: 1 },
  "Noah Dobson":        { peakPtsPace: 72,  awards: [], allStarYears: 1 },
  "Mikhail Sergachev":  { peakPtsPace: 66,  awards: [], allStarYears: 1 },
  "Samuel Girard":      { peakPtsPace: 48,  awards: [], allStarYears: 0 },
  "Darnell Nurse":      { peakPtsPace: 52,  awards: [], allStarYears: 0 },
};

const PROSPECT_TIERS: Record<string, { tier: 1|2|3|4; navFloor: number; ceiling: number; note: string }> = {
  // Tier 1 — Franchise cornerstones, already proven or near-certain
  "Connor Bedard":      { tier: 1, navFloor: 180, ceiling: 50, note: "2023 #1 overall" },
  "Macklin Celebrini":  { tier: 1, navFloor: 160, ceiling: 50, note: "2024 #1 overall" },
  "Gavin McKenna":      { tier: 1, navFloor: 200, ceiling: 60, note: "2026 #1 overall" },
  "Matthew Schaefer":   { tier: 1, navFloor: 140, ceiling: 45, note: "2025 #1 overall" },
  "Ivan Demidov":       { tier: 1, navFloor: 130, ceiling: 45, note: "2025 #5 overall, elite skill" },
  "Cayden Lindstrom":   { tier: 1, navFloor: 120, ceiling: 40, note: "2024 #4 overall" },
  "Leo Carlsson":       { tier: 1, navFloor: 115, ceiling: 40, note: "2023 #2 overall" },
  // Tier 2 — High-end prospects, likely top-6/top-4
  "Matvei Michkov":     { tier: 2, navFloor: 95,  ceiling: 40, note: "Elite skill, PHI" },
  "Beckett Sennecke":   { tier: 2, navFloor: 90,  ceiling: 35, note: "2024 #3 overall" },
  "Will Smith":         { tier: 2, navFloor: 85,  ceiling: 30, note: "2023 #4 overall" },
  "Brayden Yager":      { tier: 2, navFloor: 80,  ceiling: 30, note: "2023 #14 overall" },
  "David Reinbacher":   { tier: 2, navFloor: 75,  ceiling: 30, note: "2023 #5 overall, D" },
  "Zach Benson":        { tier: 2, navFloor: 75,  ceiling: 28, note: "2023 #13 overall" },
  "Luca Fantilli":      { tier: 2, navFloor: 72,  ceiling: 28, note: "2023 #6 overall" },
  "Dalibor Dvoracek":   { tier: 2, navFloor: 70,  ceiling: 28, note: "2024 top prospect" },
  "Tanner Molendyk":    { tier: 2, navFloor: 68,  ceiling: 25, note: "D prospect, OTT" },
  // Tier 3 — Solid prospects, likely NHLers
  "Cole Eiserman":      { tier: 3, navFloor: 55,  ceiling: 22, note: "Goal scorer, BOS" },
  "Danny Nelson":       { tier: 3, navFloor: 50,  ceiling: 20, note: "2024 top-10" },
  "Konsta Helenius":    { tier: 3, navFloor: 48,  ceiling: 20, note: "2024 top-10, CHI" },
};

const SHUTDOWN_D_PEDIGREE: Record<string, { navFloor: number; note: string }> = {
  "Jaccob Slavin":      { navFloor: 55, note: "Perennial Selke candidate, best defensive D in the game" },
  "Joel Edmundson":     { navFloor: 22, note: "Shutdown D, physical presence" },
  "Damon Severson":     { navFloor: 30, note: "Reliable two-way D" },
  "Brent Burns":        { navFloor: 28, note: "Shutdown role in later career" },
  "Luke Schenn":        { navFloor: 18, note: "Physical shutdown D, veteran presence" },
  "Matt Grzelcyk":      { navFloor: 22, note: "Defensive D, penalty kill specialist" },
  "Chris Tanev":        { navFloor: 24, note: "Elite shot-blocking, consistent shutdown role" },
  "Nate Schmidt":       { navFloor: 20, note: "Defensive depth, PK specialist" },
  "Gustav Forsling":    { navFloor: 32, note: "Two-way D, strong defensive metrics" },
  "Noah Hanifin":       { navFloor: 35, note: "Reliable two-way D, proven top-4" },
  "Jake Walman":        { navFloor: 28, note: "Defensive D, strong possession metrics" },
  "Shayne Gostisbehere":{ navFloor: 25, note: "Two-way D, powerplay QB" },
};

const INJURY_RISK: Record<string, { level: "HIGH"|"MODERATE"; note: string }> = {
  // High risk — repeated significant injuries or chronic conditions
  "Erik Karlsson":       { level: "HIGH",     note: "Two Achilles surgeries, wrist issues" },
  "Evander Kane":        { level: "HIGH",     note: "Wrist surgery, repeated absences" },
  "Tristan Jarry":       { level: "HIGH",     note: "Foot injury, significant missed time" },
  "Ryan Johansen":       { level: "HIGH",     note: "Hernia and leg surgery history" },
  "Ondrej Palat":        { level: "HIGH",     note: "Repeated lower-body issues" },
  "Zach Hyman":          { level: "HIGH",     note: "Multiple knee surgeries" },
  "Jonathan Drouin":     { level: "HIGH",     note: "Mental health leave, wrist surgery" },
  "Max Domi":            { level: "HIGH",     note: "Type 1 diabetes, injury history" },
  // Moderate risk — documented history but generally available
  "Nathan MacKinnon":    { level: "MODERATE", note: "History of upper-body injuries" },
  "Elias Pettersson":    { level: "MODERATE", note: "Wrist/shoulder concerns" },
  "Jack Eichel":         { level: "MODERATE", note: "Disk fusion surgery history" },
  "Thomas Chabot":       { level: "MODERATE", note: "History of concussions" },
  "Nazem Kadri":         { level: "MODERATE", note: "Suspension history, thumb injury" },
  "Brock Boeser":        { level: "MODERATE", note: "Hip surgery, recurring absences" },
  "Jakob Chychrun":      { level: "MODERATE", note: "Multiple lower-body surgeries" },
  "Samuel Girard":       { level: "MODERATE", note: "Spinal fracture history" },
  "Dougie Hamilton":     { level: "MODERATE", note: "Leg fracture, ankle issues" },
  "Victor Hedman":       { level: "MODERATE", note: "Recurring lower-body issues" },
  "Rickard Rakell":      { level: "MODERATE", note: "Concussion history" },
  "Anthony Mantha":      { level: "MODERATE", note: "Shoulder surgery, extended absences" },
  "Andrei Svechnikov":   { level: "MODERATE", note: "ACL tear history" },
  "Timo Meier":          { level: "MODERATE", note: "Lower-body injury history" },
  "Bryan Rust":          { level: "MODERATE", note: "Recurring lower-body issues" },
  "Tom Wilson":          { level: "MODERATE", note: "Knee ligament surgery history" },
  "Ondrej Kase":         { level: "HIGH",     note: "Severe concussion history, limited games" },
  "Nick Foligno":        { level: "MODERATE", note: "Recurring lower-body issues" },
  "Ryan Reaves":         { level: "MODERATE", note: "Concussion history" },
};

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
      <ContractSyncer />

      {/* Trade Proposal Engine Modal */}
      {tradeRequest && tradeRequest.length > 0 && (
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
      )}
      {/* ── Team Selection Modal ─────────────────────────────────── */}
      {showTeamSelect && db.teams.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(28,20,10,0.88)', backdropFilter: 'blur(4px)' }}>
          <div className="relative w-full max-w-lg"
            style={{ background: '#f0e6cc', borderRadius: '2px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>

            {/* Header rule */}
            <div style={{ borderTop: '4px double #1c140a', borderBottom: '1px solid #b8a070', padding: '20px 28px 14px' }}>
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-[0.5em] mb-2" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                  The Hockey Ledger · GM Challenge
                </div>
                <h2 className="font-black" style={{ fontFamily: "'Libre Baskerville', serif", fontSize: '1.6rem', color: '#1c140a', lineHeight: 1.1 }}>
                  Think you can do better<br/>than your GM?
                </h2>
                <p className="mt-3 text-[11px] leading-relaxed" style={{ color: '#6b5030', fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic' }}>
                  Pick your franchise. Make your moves. Sim a year and find out if you had what it takes — or if your GM was right all along.
                </p>
              </div>
            </div>

            {/* Team grid */}
            <div style={{ padding: '16px 28px 20px' }}>
              <div className="text-[11px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                Select Your Franchise
              </div>
              <div className="grid grid-cols-4 gap-1.5 mb-4" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {db.teams
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(t => {
                    const isSelected = teams[0]?.id === t.id;
                    const phase = t.phase ?? "";
                    const phaseColor =
                      phase === "Contender"  ? '#1a5c2e' :
                      phase === "Bubble"     ? '#1a2e5c' :
                      phase === "Retooling"  ? '#8a5c00' :
                      phase === "Rebuilding" ? '#b83020' :
                      '#6b5030';
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
                          background: isSelected ? '#1c140a' : '#e4d8b8',
                          border: `1px solid ${isSelected ? '#1c140a' : '#c8b890'}`,
                          borderRadius: '2px',
                        }}
                      >
                        <div className="text-[10px] font-black" style={{
                          color: isSelected ? '#f0e6cc' : '#1c140a',
                          fontFamily: "'Courier Prime', monospace",
                          lineHeight: 1.1,
                        }}>
                          {t.id}
                        </div>
                        <div className="text-[7px] font-black leading-tight mt-0.5" style={{
                          color: isSelected ? '#c8b890' : '#4a3820',
                          fontFamily: "'Libre Baskerville', serif",
                        }}>
                          {teamName}
                        </div>
                        <div className="text-[6px] mt-0.5 font-black uppercase tracking-wide" style={{
                          color: isSelected ? '#9a7d58' : phaseColor,
                          fontFamily: "'Courier Prime', monospace",
                        }}>
                          {phase}
                        </div>
                      </button>
                    );
                  })}
              </div>

              {/* Selected team summary */}
              {teams[0] && (
                <div className="mb-4 p-3" style={{ background: '#e4d8b8', border: '1px solid #b8a070' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-black text-[14px]" style={{ color: '#1c140a', fontFamily: "'Libre Baskerville', serif" }}>
                        {teams[0].name}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                        #{teams[0].standing}/32 · {teams[0].phase} · ${teams[0].capSpace.toFixed(1)}M cap space
                      </div>
                    </div>
                    <div className="text-[9px] font-black px-2 py-1" style={{
                      color: '#b83020', border: '1px solid rgba(184,48,32,0.4)',
                      fontFamily: "'Courier Prime', monospace",
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
                  background: teams[0] ? '#1c140a' : '#c8b890',
                  color: '#f0e6cc',
                  fontFamily: "'Courier Prime', monospace",
                  borderRadius: '2px',
                }}
              >
                {teams[0] ? `✦ Take Control of the ${teams[0].name} ✦` : 'Select a team to begin'}
              </button>

              <p className="text-center mt-2 text-[11px]" style={{ color: '#b8a070', fontFamily: "'Courier Prime', monospace" }}>
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
            style={{ background: '#f0e6cc', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', borderRadius: '2px' }}
            onClick={e => e.stopPropagation()}>

            {/* Memo letterhead */}
            <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-4" style={{ borderBottom: '2px solid #1c140a' }}>
              <div className="text-center mb-4">
                <div className="text-[9px] uppercase tracking-[0.5em] mb-1" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                  Quant Front Office — Internal Memorandum
                </div>
                <div className="font-black text-2xl" style={{ fontFamily: "'Libre Baskerville', serif", color: '#1c140a' }}>
                  Trade Evaluation Report
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-[10px]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                {[
                  ["TO",      "GM & Hockey Operations Leadership"],
                  ["FROM",    "Senior Front Office Analyst — Claude"],
                  ["DATE",    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
                  ["RE",      `${teams[0]?.name ?? 'Home'} ↔ ${teams[1]?.name ?? 'Partner'} Trade`],
                  ["VERDICT", verdict.status],
                  ["NAV",     `${verdict.metrics.homeNetGain > 0 ? '+' : ''}${verdict.metrics.homeNetGain.toFixed(0)} for ${teams[0]?.name ?? 'Home'}`],
                ].map(([label, val]) => (
                  <div key={label} className="flex gap-3">
                    <span className="font-black w-16 shrink-0" style={{ color: '#6b5030' }}>{label}:</span>
                    <span style={{ color: (label === "VERDICT" && (verdict.status === "WIN" || verdict.status === "FAIR")) ? '#1a5c2e'
                      : (label === "VERDICT" && (verdict.status === "BLOCKED" || verdict.status === "DECLINED")) ? '#b83020'
                      : '#1c140a' }}>{val}</span>
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
                color: '#1c140a',
                fontFamily: "'Libre Baskerville', serif",
                whiteSpace: 'pre-wrap',
              }}>
                {verdict.claudeAnalysis}
              </p>
            </div>

            {/* Verdict stamp + disclaimer */}
            <div className="px-4 sm:px-8 pb-5 sm:pb-6 flex items-end justify-between flex-wrap gap-3" style={{ borderTop: '1px solid #b8a070', paddingTop: '16px' }}>
              <div className="text-[9px]" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace", lineHeight: 1.6 }}>
                CONFIDENTIAL — Internal Use Only<br />
                Valuations are analytical estimates only.
              </div>
              <div style={{ transform: 'rotate(-4deg)', transformOrigin: 'center' }}>
                <div className="px-4 py-1.5 text-center font-black text-base uppercase tracking-widest" style={{
                  border: `3px solid ${['WIN','FAIR'].includes(verdict.status) ? '#1a5c2e' : '#b83020'}`,
                  color: ['WIN','FAIR'].includes(verdict.status) ? '#1a5c2e' : '#b83020',
                  fontFamily: "'Courier Prime', monospace",
                  opacity: 0.85,
                }}>
                  {verdict.status}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-4 sm:px-8 py-3 flex justify-between items-center flex-wrap gap-2" style={{ borderTop: '1px solid #b8a070' }}>
              <button onClick={() => { setShowMemo(false); generateClaudeAnalysis(); }}
                className="text-[9px] font-black uppercase tracking-wider transition-opacity hover:opacity-60"
                style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                ↺ Regenerate
              </button>
              <button onClick={() => setShowMemo(false)}
                className="text-[9px] font-black uppercase tracking-wider px-4 py-1.5"
                style={{ background: '#1c140a', color: '#f0e6cc', fontFamily: "'Courier Prime', monospace", borderRadius: '2px' }}>
                Close ✕
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 pointer-events-none bg-newsprint" />

      <div className="relative w-full max-w-[1700px] mx-auto px-4 lg:px-6 py-6 lg:py-8 flex flex-col gap-5 overflow-x-hidden">

        <header className="flex flex-col pb-5 border-b" style={{ borderColor: '#b8a070' }}>
          <div className="w-full">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: '#b83020' }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#b83020' }} />
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.4em]" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>Live Data Feed Active</span>
            </div>

            {/* Masthead — fully centered */}
            <div style={{ borderTop: '4px double #1c140a', borderBottom: '4px double #1c140a', padding: '8px 0 6px', marginBottom: '4px' }}>
              <div className="text-center">
                <div className="text-[8px] uppercase tracking-[0.4em] mb-1" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                  Est. 2025 &nbsp;—&nbsp; Vol. I &nbsp;—&nbsp; Trade Edition
                </div>
                <a href="/" style={{ textDecoration: 'none' }}>
                  <h1 className="font-black leading-none transition-opacity hover:opacity-70" style={{ color: '#1c140a', fontFamily: "'Libre Baskerville', Georgia, serif",
                    fontSize: 'clamp(1.8rem, 5vw, 3rem)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                    cursor: 'pointer',
                  }}>
                    The Hockey Ledger
                  </h1>
                </a>
                <div className="text-[11px] uppercase tracking-[0.3em] mt-1.5 hidden sm:block" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                  X-NAV Analytics &nbsp;·&nbsp; xG Suppression &nbsp;·&nbsp; GM Logic Engine &nbsp;·&nbsp; Live Statistics
                </div>
                <div className="mt-2 flex items-center justify-center gap-4">
                  <a href="/players" className="text-[12px] font-black uppercase tracking-[0.2em]"
                    style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace", textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#1c140a')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#9a7d58')}>
                    ◇ PLAYER ANALYTICS
                  </a>
                  <span style={{ color: '#c8b890' }}>|</span>
                  <span className="text-[12px] font-black uppercase tracking-[0.2em]" style={{ color: '#1c140a', fontFamily: "'Courier Prime', monospace" }}>
                    ◆ TRADE MACHINE
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

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
              onMouseEnter={e => (e.currentTarget.style.background = '#d43820')}
              onMouseLeave={e => (e.currentTarget.style.background = '#b83020')}>
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
                className="w-full py-2.5 font-black uppercase tracking-widest text-[10px] transition-all duration-200 active:scale-[0.97]"
                style={{
                  background: 'transparent',
                  border: '1px solid #b83020',
                  color: '#b83020',
                  fontFamily: "'Courier Prime', monospace",
                }}
                title="You're giving up value — but it's your team, your call. This trade will be locked in.">
                ⚠ My Team, My Call
              </button>
            )}

            {executedTrades.length > 0 && (
              <button onClick={resetTrades}
                className="w-full py-2 font-black uppercase tracking-widest text-[10px] transition-all btn-ghost">
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
              <span className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600">
                Simulated Universe — {executedTrades.length} Trade{executedTrades.length !== 1 ? "s" : ""} Executed
              </span>
              <div className="flex items-center gap-2">
                <button onClick={simYear} disabled={simLoading || executedTrades.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-purple-950 border border-purple-800 text-purple-400 hover:bg-purple-900 disabled:opacity-40 transition-all">
                  {simLoading
                    ? <><div className="w-2.5 h-2.5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin"/>Simulating...</>
                    : <>⚡ Sim a Year</>}
                </button>
              </div>
            </div>

            {/* Trade log */}
            <div className="px-5 py-3 space-y-2">
              {executedTrades.map((t) => (
                <div key={t.id} className="flex items-start gap-3 text-[10px]">
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
                  <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                    ⚡ Projected Season Results
                  </span>
                  <span className="text-[7px]" style={{ color: '#b8a070', fontFamily: "'Courier Prime', monospace" }}>
                    Simulation #{simData.seed}
                  </span>
                </div>

                {/* Two team cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  {[simData.homeTeam, simData.partnerTeam].filter(Boolean).map((t: any) => (
                    <div key={t.teamId} style={{ background: '#e4d8b8', border: '1px solid #b8a070', padding: '10px 12px' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-black text-[12px]" style={{ color: '#1c140a', fontFamily: "'Libre Baskerville', serif" }}>{t.teamName}</span>
                        <span className={`text-[8px] font-black px-1.5 py-0.5`} style={{
                          color: t.madePlayoffs ? '#1a5c2e' : '#b83020',
                          border: `1px solid ${t.madePlayoffs ? 'rgba(26,92,46,0.4)' : 'rgba(184,48,32,0.4)'}`,
                          fontFamily: "'Courier Prime', monospace",
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
                          <div key={s.label} style={{ background: '#dfd0a8', border: '1px solid #c8b890', padding: '4px 6px', textAlign: 'center' }}>
                            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '6px', color: '#9a7d58', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
                            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', fontWeight: 900, color: '#1c140a', marginTop: '1px' }}>{s.val}</div>
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
                    <div key={s.label} style={{ background: '#e4d8b8', border: '1px solid #b8a070', padding: '6px 8px' }}>
                      <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '6.5px', color: '#9a7d58', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>{s.label}</div>
                      <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: '10px', fontWeight: 700, color: '#1c140a' }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {simResult && (
              <div className="px-5 py-5" style={{ borderTop: '1px solid #b8a070' }}>
                <div className="flex items-center gap-2 mb-4" style={{ borderBottom: '1px solid #c8b890', paddingBottom: '8px' }}>
                  <span style={{ color: '#b83020' }}>⚡</span>
                  <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                    Claude · One Year Later
                  </span>
                </div>
                <div className="space-y-4">
                  {simResult.split('\n').map((line, i) => {
                    if (line.startsWith('## ') || line.startsWith('**THE ') || line.startsWith('**EDMONTON') || line.startsWith('**AROUND') || line.startsWith('**THE YEAR') || line.startsWith('**DRAFT') || line.startsWith('**VERDICT')) {
                      const text = line.replace(/^\#{1,3}\s+/, '').replace(/\*\*/g, '');
                      return <div key={i} className="font-black text-[11px] uppercase tracking-widest mt-4 mb-1" style={{ color: '#1c140a', fontFamily: "'Courier Prime', monospace", borderBottom: '1px solid #c8b890', paddingBottom: '4px' }}>{text}</div>;
                    }
                    if (line.startsWith('- **') || line.startsWith('- ')) {
                      const text = line.replace(/^-\s+/, '').replace(/\*\*(.*?)\*\*/g, '$1');
                      return <div key={i} className="text-[11px] leading-relaxed pl-3" style={{ color: '#3d2e18', borderLeft: '2px solid #b8a070' }}>{text}</div>;
                    }
                    if (line.trim() === '' || line.startsWith('#')) return null;
                    // Split on **bold** markers and render with <strong> — no dangerouslySetInnerHTML
                    const boldParts = line.split(/\*\*(.*?)\*\*/g);
                    return (
                      <p key={i} className="text-[11px] leading-[1.8]" style={{ color: '#3d2e18', fontFamily: "'Libre Baskerville', serif" }}>
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
        )}

        {(blocks[0].length > 0 || blocks[1].length > 0) && <BreakdownTable blocks={blocks} navMap={navMap} />}
        {/* ── Footer — Glossary & Methodology ── */}
        <footer className="mt-12 pt-8" style={{ borderTop: '2px solid #1c140a' }}>
          <div className="text-center mb-6">
            <div className="text-[9px] uppercase tracking-[0.5em] mb-1" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              Methodology & Glossary
            </div>
            <h2 className="text-xl font-black" style={{ fontFamily: "'Libre Baskerville', serif", color: '#1c140a' }}>
              How The Hockey Ledger Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
            {/* Valuation */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: '#1c140a', borderBottom: '1px solid #b8a070', fontFamily: "'Libre Baskerville', serif" }}>
                Player Valuation
              </div>
              <div className="space-y-3 text-[11px]" style={{ color: '#4a3820', lineHeight: 1.7 }}>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>NAV (Net Asset Value)</span>
                  <p className="mt-0.5">A player's overall trade value on a scale from roughly -100 to +1000. Combines offensive production, defensive contribution, contract cost, and age. Think of it as "how much is this player worth versus what they cost?" Positive NAV = providing more value than salary. Negative NAV = contract liability.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>NOIV (Net On-Ice Value)</span>
                  <p className="mt-0.5">A contextual multiplier based on how much a player elevates their teammates. Measures xG% relative to teammates on ice vs off, xGA suppression, and defensive zone deployment. A player with NOIV significantly above their raw stats is a hidden gem whose impact outstrips the box score.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>OPS · DPS · PS</span>
                  <p className="mt-0.5">Offensive and Defensive Point Shares — computed dynamically from the NHL Stats API using the Kubatko marginal goals framework. OPS measures offensive contribution to team points; DPS measures defensive contribution. These replace heuristic OFF/DEF estimates when live data is available.</p>
                </div>
              </div>
            </div>

            {/* STRAND metrics */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: '#1c140a', borderBottom: '1px solid #b8a070', fontFamily: "'Libre Baskerville', serif" }}>
                STRAND™ Node Glossary
              </div>
              <div className="space-y-2 text-[11px]" style={{ color: '#4a3820', lineHeight: 1.7 }}>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>SCR — Scoring Pace</span>
                  <p className="mt-0.5">Points per 82 games, normalized by position. D-men scored against a 0-80 scale; forwards against 0-100. A 73 SCR for a defenceman means he scores at the top of the D-man range — not that he scores like a forward.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>xG — Expected Goals</span>
                  <p className="mt-0.5">Shot quality and volume generated per 82 games. Accounts for where shots come from, not just how many. A player who generates high-danger chances scores higher than one who fires from the perimeter.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>TOI+ — Ice Time</span>
                  <p className="mt-0.5">Average time on ice per game. Normalized 10-27 minutes. Reflects coach trust and role deployment — players earning 24+ minutes are being used in every situation. Normalized so 27+ min = 100.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>SUPP — xGA Suppression</span>
                  <p className="mt-0.5">On-ice expected goals against vs off-ice, relative to teammates. Positive = team leaks fewer chances with this player on ice. Range -1.5 to +1.5. The defensive counterpart to xG — how well does this player prevent quality shots against?</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>QoC — Quality of Competition</span>
                  <p className="mt-0.5">Rank of opponents faced by ice time. Lower rank = harder matchups. Rank 1 faces the toughest competition in the league every night. A player with QoC rank 50 and good SUPP is genuinely shutting down the opposition's best players.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>DZ% — Defensive Zone Starts</span>
                  <p className="mt-0.5">Percentage of shifts starting in the defensive zone. High DZ% means the coach deploys this player specifically to protect their own net — a mark of trust in their defensive reliability. Inverted in STRAND so higher score = more defensive deployment.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>AGE — Age Curve</span>
                  <p className="mt-0.5">The trajectory of a player's value over the life of their contract. Young players show positive age curves (improving). Veterans past their peak show negative curves (declining). Used in the defensive strand to show whether a player's contribution will grow or shrink.</p>
                </div>
              </div>
            </div>

            {/* Archetypes & GM Logic */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: '#1c140a', borderBottom: '1px solid #b8a070', fontFamily: "'Libre Baskerville', serif" }}>
                Archetypes & GM Logic
              </div>
              <div className="space-y-3 text-[11px]" style={{ color: '#4a3820', lineHeight: 1.7 }}>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>D-Man Archetypes</span>
                  <p className="mt-0.5"><strong>Offensive D</strong> — 45+ pts/82, valued for scoring and powerplay (Makar, Bouchard). <strong>Two-Way D</strong> — 28-45 pts/82 with heavy minutes and balanced PS ratio (Morrissey, Josi). <strong>Shutdown D</strong> — under 28 pts/82 but faces elite competition, DPS dominates OPS (Slavin). <strong>Depth D</strong> — sheltered deployment, standard evaluation.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>EWA (Estimated Wins Added)</span>
                  <p className="mt-0.5">Translates NAV into actual standings wins. Roughly 7 NAV points equals one win above replacement, adjusted for where the team sits in the standings.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>CWI (Contention Window Index)</span>
                  <p className="mt-0.5">Estimates how a trade affects a team's championship window in years. Young players on cheap deals push CWI up. Aging veterans on long contracts push it down.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>GM Flags</span>
                  <p className="mt-0.5">The audit engine checks 15+ real-world factors: cap compliance, positional depth, NMC/NTC clause probability, timeline mismatch, defensive dependency, same-division conflicts. HARD flags block; SOFT flags warn. DECLINED means the model believes one side's GM wouldn't sign off — not that the trade is bad hockey.</p>
                </div>
              </div>
            </div>

            {/* STRAND visualization */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: '#1c140a', borderBottom: '1px solid #b8a070', fontFamily: "'Libre Baskerville', serif" }}>
                STRAND™ Visualization
              </div>
              <div className="space-y-3 text-[11px]" style={{ color: '#4a3820', lineHeight: 1.7 }}>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>What is STRAND™?</span>
                  <p className="mt-0.5">STRAND — Stylistic Trait & Rating Analysis for NHL Development — is a proprietary double-helix visualization encoding a player's complete on-ice identity into two intertwined strands. Navy = offensive profile. Red = defensive profile.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>Reading the Helix</span>
                  <p className="mt-0.5">A tight symmetric helix signals an elite two-way player. A helix where one strand dominates reveals a specialist — not a weakness, a definition. Slavin's helix is almost entirely red. That's not a criticism; it's the most accurate visual description of what makes him valuable. Node size scales with trait strength. Values shown directly on each node.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>Archetype Classification</span>
                  <p className="mt-0.5">When Point Shares data is available, the OPS/DPS ratio directly determines archetype: players with psRatio {'>'} 0.62 are Offensive, {'<'} 0.38 are Defensive, 0.38-0.62 with strong both strands are Two-Way or Elite Two-Way. Heuristic scoring fills in when PS data isn't available.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Value vs Worth note */}
          <div className="mb-6 p-4" style={{ border: '1px solid #b8a070', background: '#e4d8b8' }}>
            <div className="text-[9px] uppercase tracking-[0.4em] mb-2" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              A Note on Value vs Worth
            </div>
            <p className="text-[11px]" style={{ color: '#4a3820', lineHeight: 1.8, fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic' }}>
              Every player in this database plays in the NHL. That alone puts them in the top 0.1% of hockey players on earth. A negative NAV does not mean a negative player — it means the contract represents negative trade value relative to production and term. Hockey is rooted in reality: every player who dresses for an NHL game is fundamentally one of the best athletes in the world at what they do. These numbers measure tradeable asset value, not human worth. Use them as a starting point for conversation, not a final verdict.
            </p>
          </div>

          <div className="text-center pt-4" style={{ borderTop: '1px solid #b8a070' }}>
            <p className="text-[9px] uppercase tracking-[0.4em]" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              Data: NHL API · MoneyPuck · CapWages &nbsp;·&nbsp; Models: X-NAV 1.1 · G-NAV · NOIV · STRAND™ &nbsp;·&nbsp; AI: Claude Sonnet
            </p>
            <p className="text-[8px] mt-1" style={{ color: '#b8a070', fontFamily: "'Courier Prime', monospace" }}>
              All valuations are analytical estimates, not financial advice. Player values fluctuate with injury, performance, and market conditions.
            </p>
          </div>
        </footer>

      </div>
    </main>
  );
}

// ============================================================
// TRADE PANEL
// ============================================================
function TradePanel({
  idx, team, nav, capSpace, db, blocks, setTeams, setBlocks, label, accent, navMap, locked, onRequestTrade, onRequestBlockTrade
}: {
  idx: 0 | 1;
  team: Team | null;
  nav: number;
  capSpace: number;
  db: { teams: Team[]; players: Asset[] };
  blocks: [Asset[], Asset[]];
  setTeams: React.Dispatch<React.SetStateAction<[Team | null, Team | null]>>;
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
  label: string;
  accent: string;
  navMap: Record<string, XNAVResult>;
  locked?: boolean;
  onRequestTrade?: (a: Asset) => void;
  onRequestBlockTrade?: (block: Asset[]) => void;
}) {
  const isLeft = idx === 0;

  return (
    <div className="relative border rounded-2xl p-4 lg:p-6 flex flex-col min-h-[400px] lg:min-h-[740px]" style={{
      background: '#ede4cc',
      borderColor: isLeft ? '#9a7d58' : '#b8a070',
    }}>
      {/* Badge */}
      <div className={`absolute -top-3 left-6 px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em] border`} style={{
        background: '#e8dab8',
        borderColor: '#b8a070',
        color: '#6b5030',
        borderRadius: '2px'
      }}>
        {accent}
      </div>

      {/* Section dateline */}
      <div className="mb-4 pb-3">
        <div className="text-[8px] font-black uppercase tracking-[0.5em] mb-1">
          {label}
        </div>
        <div className="flex justify-between items-end gap-3">
          {locked && idx === 0 ? (
            <div className="flex items-center gap-2 flex-1">
              <span className="font-black text-[15px]" style={{ color: '#1c140a', fontFamily: "'Libre Baskerville', serif" }}>
                {team?.name}
              </span>
              <span className="text-[7px] font-black px-1.5 py-0.5" style={{
                color: '#b83020', border: '1px solid rgba(184,48,32,0.4)',
                fontFamily: "'Courier Prime', monospace",
              }}>LOCKED</span>
            </div>
          ) : (
          <LedgerDropdown
            teams={db.teams}
            selectedId={team?.id ?? ""}
            onSelect={(id) => {
              const found = db.teams.find((t) => t.id === id) ?? null;
              setTeams((prev) => { const n = [...prev] as [Team | null, Team | null]; n[idx] = found; return n; });
              setBlocks((prev) => { const n = [...prev] as [Asset[], Asset[]]; n[idx] = []; return n; });
            }}
          />
          )}

          <div className="text-right shrink-0 ml-3">
            <div className="font-black leading-none" style={{ fontSize: '1.4rem', color: '#1c140a', fontFamily: "'Courier Prime', monospace", fontStyle: 'italic' }}>
              {nav.toFixed(1)}
            </div>
            <div className="text-[8px] font-black uppercase tracking-widest">NAV</div>
            <div className="text-[9px] font-black px-1.5 py-0.5 mt-0.5" style={{
              fontFamily: "'Courier Prime', monospace",
              color: capSpace < 0 ? '#b83020' : '#1a5c2e',
              background: capSpace < 0 ? 'rgba(184,48,32,0.08)' : 'rgba(26,92,46,0.08)',
              border: `1px solid ${capSpace < 0 ? 'rgba(184,48,32,0.25)' : 'rgba(26,92,46,0.25)'}`,
            }}>
              {capSpace >= 0 ? `+${capSpace.toFixed(1)}M` : `${capSpace.toFixed(1)}M`}
            </div>
          </div>
        </div>
      </div>

      {/* Asset list */}
      <div className="flex-grow overflow-y-auto space-y-2 mb-4 pr-1">
        {!team && idx === 1 && (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9px", color: "#9a7d58", textAlign: "center", letterSpacing: "0.2em", textTransform: "uppercase" }}>
              Select a trade partner<br/>above to begin
            </div>
            <div style={{ color: "#c8b890", fontSize: "24px" }}>⇄</div>
          </div>
        )}
        {blocks[idx].length === 0 && team && (
          <div className="flex items-center justify-center h-32 border-2 border-dashed" >
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">No assets on the block</span>
          </div>
        )}
        {blocks[idx].map((a) => (
          <AssetCard
            key={a.id}
            asset={a}
            idx={idx}
            blocks={blocks}
            setBlocks={setBlocks}
            onRequestTrade={onRequestTrade}
            navResult={navMap[a.id]}
            navMap={navMap}
          />
        ))}
      </div>

      {/* Find Trade Partners button — only on outgoing (home) side with assets */}
      {idx === 0 && blocks[0].length > 0 && onRequestBlockTrade && (
        <button
          onClick={() => onRequestBlockTrade(blocks[0])}
          className="w-full py-2.5 font-black text-[10px] uppercase tracking-widest transition-all mb-2 flex items-center justify-center gap-2 btn-ink"
        >
          ⚡ Find Trade Partners for This Package
        </button>
      )}

      {/* Asset selector */}
      <AssetDropdown idx={idx} team={team} db={db} blocks={blocks} setBlocks={setBlocks} navMap={navMap} />
    </div>
  );
}

// ============================================================
// ASSET CARD — with retention slider and contract details
// ============================================================
// ============================================================
// ASSET CARD — with retention slider and contract details
// ============================================================
function AssetCard({
  asset, idx, blocks, setBlocks, onRequestTrade, navResult, navMap
}: {
  asset: Asset;
  idx: 0 | 1;
  blocks: [Asset[], Asset[]];
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
  onRequestTrade?: (a: Asset) => void;
  navResult?: XNAVResult;
  navMap?: Record<string, XNAVResult>;
}) {
  const [view, setView] = React.useState<"STATS" | "STRAND">("STATS");
  const [compareId, setCompareId] = React.useState<string>("");
  const xnav   = navResult ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };
  const isPick = asset.position === "Pick";

  const otherBlock = blocks[1 - idx].filter(a =>
    a.position !== "Pick" && a.position !== "G" && a.id !== asset.id
  );
  const compareAsset = otherBlock.find(a => a.id === compareId) ?? null;
  const compareXnav  = compareAsset
    ? (navMap?.[compareAsset.id] ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 })
    : null;

  const updateAsset = (partial: Partial<Asset>) => {
    setBlocks((prev) => {
      const n = [...prev] as [Asset[], Asset[]];
      n[idx] = n[idx].map((a) => a.id === asset.id ? { ...a, ...partial } : a);
      return n;
    });
  };

  const removeAsset = () => {
    setBlocks((prev) => {
      const n = [...prev] as [Asset[], Asset[]];
      n[idx] = n[idx].filter((a) => a.id !== asset.id);
      return n;
    });
  };

  const navColor = xnav.total > 80 ? '#1a5c2e' : xnav.total > 20 ? '#1a2e5c' : xnav.total > -20 ? '#6b5030' : '#b83020';

  return (
    <div className="p-3 transition-all">
      <div className="flex justify-between items-start mb-2.5">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {asset.headshot && (
            <img src={asset.headshot} alt={asset.name}
              className="w-8 h-8 object-cover shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <div className="min-w-0">
            <div className="font-black leading-tight truncate flex items-center gap-1.5"
              style={{ fontSize: '13px', color: '#1c140a' }}>
              {asset.name}
              {asset.hasNMC && <span className="text-[7px] px-1 font-black shrink-0" style={{ color: '#b83020', border: '1px solid #b83020' }}>NMC</span>}
              {asset.hasNTC && !asset.hasNMC && <span className="text-[7px] px-1 font-black shrink-0" style={{ color: '#8a5c00', border: '1px solid #8a5c00' }}>NTC</span>}
              {!asset.hasLiveStats && !isPick && <span className="text-[7px] px-1 font-black shrink-0" style={{ color: '#9a7d58', border: '1px solid #b8a070' }}>EST</span>}
              {/* ── NEW: Extension Badge ── */}
              {asset.hasExtension && (
                <span className="text-[7px] px-1 font-black shrink-0 shadow-sm rounded-sm" 
                  style={{ background: '#d97706', color: '#fff', border: '1px solid #b45309' }} 
                  title="Future contract extension applied to valuation">
                  EXTENSION
                </span>
              )}
            </div>
            
            {/* ── NEW: Future AAV Text formatting ── */}
            <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              {isPick
                ? `${asset.year} · ${asset.round === 1 ? "1st" : asset.round === 2 ? "2nd" : "3rd"} Round`
                : (() => {
                    const expiryYear = new Date().getFullYear() + (asset.yearsRemaining ?? 1);
                    if (asset.hasExtension) {
                      return (
                        <span style={{ color: '#d97706' }}>
                          {asset.position} · Age {asset.age} · FUTURE AAV: ${asset.capHit.toFixed(2)}M × {asset.yearsRemaining}yr
                        </span>
                      );
                    }
                    return `${asset.position} · Age ${asset.age} · $${asset.capHit.toFixed(2)}M × ${asset.yearsRemaining}yr · Exp. ${expiryYear}`;
                  })()}
            </div>
            
            {/* Awards badges */}
            {PLAYER_PEDIGREE[asset.name]?.awards && PLAYER_PEDIGREE[asset.name].awards!.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {Array.from(new Set(PLAYER_PEDIGREE[asset.name].awards)).map((award) => {
                  const count = PLAYER_PEDIGREE[asset.name].awards!.filter(a => a === award).length;
                  return (
                    <span key={award} className="text-[7px] px-1 py-0.5 font-black" style={{ color: '#8a5c00', border: '1px solid rgba(138,92,0,0.4)',  }}>
                      {count > 1 ? `${count}× ` : ""}{award}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Prospect tier badge */}
            {PROSPECT_TIERS[asset.name] && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[7px] px-1 py-0.5 font-black" style={{
                  color: PROSPECT_TIERS[asset.name].tier === 1 ? '#1a2e5c' : PROSPECT_TIERS[asset.name].tier === 2 ? '#1a5c2e' : '#6b5030',
                  border: `1px solid ${PROSPECT_TIERS[asset.name].tier === 1 ? 'rgba(26,46,92,0.4)' : PROSPECT_TIERS[asset.name].tier === 2 ? 'rgba(26,92,46,0.4)' : 'rgba(107,80,48,0.4)'}`,
                  
                }}>
                  {PROSPECT_TIERS[asset.name].tier === 1 ? "★ FRANCHISE" : PROSPECT_TIERS[asset.name].tier === 2 ? "◆ TOP PROSPECT" : "◇ PROSPECT"}
                </span>
              </div>
            )}
            {/* Injury risk badge */}
            {INJURY_RISK[asset.name] && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[7px] px-1 py-0.5 font-black" style={{
                  color: '#b83020',
                  border: '1px solid rgba(184,48,32,0.4)',
                  fontFamily: "'Courier Prime', monospace"
                }} title={INJURY_RISK[asset.name].note}>
                  ⚕ {INJURY_RISK[asset.name].level} RISK
                </span>
              </div>
            )}
            {/* D-man archetype badge */}
            {asset.position === "D" && !isPick && (() => {
              const pts = asset.ptsPace ?? 0;
              const toi = asset.avgTOI ?? 0;
              const qoc = asset.qocRank ?? 450;
              let arch = "DEPTH D";
              let color = '#6b5030';
              let title = "5th/6th defender — limited deployment";
              if (pts >= 45) {
                arch = "OFFENSIVE D"; color = '#1a2e5c';
                title = "Offensive defenceman — primary value from scoring and powerplay";
              } else if (pts >= 28 && toi >= 21) {
                arch = "TWO-WAY D"; color = '#1a5c2e';
                title = "Two-way defenceman — contributes offensively and defensively";
              } else if (pts < 28 && toi >= 19 && qoc < 220) {
                arch = "SHUTDOWN D"; color = '#8a5c00';
                title = `Shutdown defenceman — faces elite competition (QoC rank: ${qoc}), valued for defensive role not scoring`;
              }
              return (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[7px] px-1 py-0.5 font-black" style={{
                    color, border: `1px solid ${color}40`,
                    fontFamily: "'Courier Prime', monospace"
                  }} title={title}>
                    {arch}
                  </span>
                </div>
              );
            })()}
            {/* Forward archetype badge */}
            {["C","W","L","R"].includes(asset.position) && !isPick && xnav.fArchetype && (() => {
              const archMap: Record<string, { color: string; title: string }> = {
                SNIPER:     { color: '#1a2e5c', title: "Sniper — primary value from goal generation" },
                PLAYMAKER:  { color: '#1a5c2e', title: "Playmaker — primary value from assist generation and play-driving" },
                TWO_WAY:    { color: '#8a5c00', title: "Two-Way Forward — balanced offense with strong defensive suppression" },
                GRINDER:    { color: '#b83020', title: "Grinder — defensive deployment, physical play, limited offensive upside" },
                SCORER:     { color: '#1a2e5c', title: "Scoring Forward — balanced offensive production" },
              };
              const cfg = archMap[xnav.fArchetype];
              if (!cfg) return null;
              return (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[7px] px-1 py-0.5 font-black" style={{
                    color: cfg.color,
                    border: `1px solid ${cfg.color}40`,
                    fontFamily: "'Courier Prime', monospace",
                  }} title={cfg.title}>
                    {xnav.fArchetype.replace("_", " ")}
                  </span>
                </div>
              );
            })()}

            {/* Change of scenery badge — negative NAV players that might thrive elsewhere */}
            {!isPick && xnav.total < -5 && xnav.total > -40 && asset.age <= 32 && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[7px] px-1 py-0.5 font-black" style={{
                  color: '#946914',
                  border: '1px solid rgba(148,105,20,0.45)',
                  fontFamily: "'Courier Prime', monospace",
                }} title={`Negative NAV on current team — may suit a different system or situation. Teams with cap space and the right roster need sometimes absorb these contracts for picks.`}>
                  ⟳ CHANGE OF SCENERY
                </span>
              </div>
            )}

            {/* Salary dump badge — deeply negative, hard to move */}
            {!isPick && xnav.total <= -40 && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[7px] px-1 py-0.5 font-black" style={{
                  color: '#b83020',
                  border: '1px solid rgba(184,48,32,0.45)',
                  fontFamily: "'Courier Prime', monospace",
                }} title="Deeply negative contract — moving this requires significant salary retention or picks sweetener.">
                  ⚠ SALARY DUMP
                </span>
              </div>
            )}

            {/* Surplus contract stamp */}
            {!isPick && (() => {
              const effectiveCap = asset.capHit * (1 - (asset.retainedPct || 0));
              const isSurplus = xnav.total > effectiveCap * 18 && xnav.total > 50;
              if (!isSurplus) return null;
              return (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[7px] px-1 py-0.5 font-black" style={{
                    color: '#1a5c2e',
                    border: '1px solid rgba(26,92,46,0.5)',
                    fontFamily: "'Courier Prime', monospace",
                  }} title="Surplus contract — this player's on-ice value significantly exceeds their cap hit.">
                    ★ SURPLUS CONTRACT
                  </span>
                </div>
              );
            })()}
            {/* Shutdown D pedigree badge */}
            {SHUTDOWN_D_PEDIGREE[asset.name] && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[7px] px-1 py-0.5 font-black" style={{
                  color: '#8a5c00',
                  border: '1px solid rgba(138,92,0,0.5)',
                  fontFamily: "'Courier Prime', monospace"
                }} title={SHUTDOWN_D_PEDIGREE[asset.name].note}>
                  ★ ELITE SHUTDOWN
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className="flex flex-col items-end gap-0.5">
          <span className="font-black" style={{
            fontSize: '1.1rem',
            fontStyle: 'italic',
            color: xnav.total > 80 ? '#1a5c2e' : xnav.total > 20 ? '#1a2e5c' : xnav.total > -20 ? '#6b5030' : '#b83020',
            fontFamily: "'Courier Prime', monospace",
          }}>
            {fmt(xnav.total, 0)}
          </span>
          {xnav.noivImpact !== undefined && Math.abs(xnav.noivImpact) >= 2 && (
            <span className="text-[8px] font-black" style={{
              color: xnav.noivImpact > 0 ? '#1a5c2e' : '#b83020',
              fontFamily: "'Courier Prime', monospace",
              letterSpacing: '0.05em',
            }} title={`NOIV Impact: ${xnav.noivImpact > 0 ? '+' : ''}${xnav.noivImpact.toFixed(0)}. ${xnav.noivImpact > 0 ? 'Elevates teammates beyond raw stats.' : 'On-ice context reduces value vs raw stats.'}`}>
              {xnav.noivImpact > 0 ? '↑' : '↓'} {Math.abs(xnav.noivImpact).toFixed(0)} NOIV
            </span>
          )}
          </div>
          {!isPick && (
            <button onClick={() => onRequestTrade?.(asset)} title="Generate trade proposals"
              className="font-bold leading-none transition-colors text-ink-faint text-[11px]">
              ⚡
            </button>
          )}
          <button onClick={removeAsset} className="font-bold leading-none transition-colors text-ink-faint text-[13px]">
            ✕
          </button>
        </div>
      </div>

      {/* STRAND / STATS tab toggle — only for skaters with live data */}
      {!isPick && asset.position !== "G" && asset.hasLiveStats && (
        <div className="flex gap-0 mb-2" style={{ borderBottom: '1px solid #c8b890' }}>
          {(["STATS", "STRAND"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-3 py-1.5 transition-all"
              style={{
                color: view === v ? '#1c140a' : '#9a7d58',
                borderBottom: view === v ? '2px solid #1c140a' : '2px solid transparent',
                fontFamily: "'Courier Prime', monospace",
                marginBottom: '-1px',
                background: 'transparent',
              }}>
              {v === "STRAND" ? (
                <>
                  {/* Mini double helix SVG icon */}
                  <svg width="14" height="10" viewBox="0 0 14 10" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                    <path d="M0,2 C2,2 2,8 4,8 C6,8 6,2 8,2 C10,2 10,8 12,8 C14,8 14,2 14,2"
                      fill="none" stroke={view === "STRAND" ? "#1a2e5c" : "#9a7d58"} strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M0,8 C2,8 2,2 4,2 C6,2 6,8 8,8 C10,8 10,2 12,2 C14,2 14,8 14,8"
                      fill="none" stroke={view === "STRAND" ? "#b83020" : "#c8b890"} strokeWidth="1.5" strokeLinecap="round"/>
                    {[2, 5, 8, 11].map(x => (
                      <line key={x} x1={x} y1={2} x2={x} y2={8}
                        stroke={view === "STRAND" ? "#9a7d58" : "#c8b890"} strokeWidth="0.8" opacity="0.6"/>
                    ))}
                  </svg>
                  STRAND™
                </>
              ) : "STATS"}
            </button>
          ))}
        </div>
      )}

      {/* STRAND™ — Stylistic Trait & Rating Analysis for NHL Development */}
      {view === "STRAND" && !isPick && asset.position !== "G" && (
        <>
          {otherBlock.length > 0 && (
            <div className="flex items-center gap-2 mb-1.5 px-0.5">
              <span className="text-[7px] font-black uppercase tracking-wider shrink-0"
                style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                Compare vs
              </span>
              <select
                value={compareId}
                onChange={e => setCompareId(e.target.value)}
                className="text-[8px] font-black flex-1 py-0.5 px-1 appearance-none"
                style={{ background: '#dfd0a8', border: '1px solid #c8b890', color: '#1c140a', fontFamily: "'Courier Prime', monospace", borderRadius: '1px' }}
              >
                <option value="">— none —</option>
                {otherBlock.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.position})</option>
                ))}
              </select>
            </div>
          )}
          <StrandView
            asset={asset}
            xnav={xnav}
            compareAsset={compareAsset}
            compareXnav={compareXnav}
          />
        </>
      )}

      {/* Standard STATS view */}
      {(view === "STATS" || isPick || asset.position === "G") && (<>
      {asset.position === "G" && !isPick && (
        <div className="grid grid-cols-3 gap-1.5 mb-2.5 sm:grid-cols-3">
          {[
            { label: 'GSAx', val: (asset.gsax??0).toFixed(1), good: (asset.gsax??0) >= 0 },
            { label: 'SV%',  val: ((asset.savePct??0.9)*100).toFixed(1), good: (asset.savePct??0) >= 0.910 },
            { label: 'GP',   val: String(asset.gamesStarted ?? 0), good: true },
          ].map(s => (
            <div key={s.label} className="p-2 text-center">
              <div className="text-[7px] font-black uppercase tracking-tight mb-0.5">{s.label}</div>
              <div className="text-[11px] font-black" style={{ color: s.good ? '#1a5c2e' : '#b83020' }}>{s.val}</div>
            </div>
          ))}
          {/* Role badge */}
          <div className="col-span-3 px-2 py-1 flex justify-between items-center">
            {(() => {
              const gp = asset.gamesStarted ?? asset.games ?? 0;
              const isBackup  = gp < 33;
              const isStarter = gp >= 40;
              return (
                <span className="text-[7px] px-1 py-0.5 font-black" style={{
                  color: isStarter ? '#1a2e5c' : isBackup ? '#9a6b00' : '#6b5030',
                  border: `1px solid ${isStarter ? 'rgba(26,46,92,0.4)' : isBackup ? 'rgba(154,107,0,0.4)' : 'rgba(107,80,48,0.4)'}`,
                  fontFamily: "'Courier Prime', monospace",
                }} title={isBackup ? "Backup goalie — NAV capped at 55. Per-game rates on <25 starts are unreliable predictors of full-season value." : isStarter ? "Starter — played 35+ games, full valuation applied" : "Tandem — shared starter role"}>
                  {isBackup ? "BACKUP" : isStarter ? "STARTER" : "TANDEM"}
                </span>
              );
            })()}
            {PLAYER_PEDIGREE[asset.name]?.careerGsax && (
              <span className="text-[9px] font-black" style={{ color: '#1a2e5c', fontFamily: "'Courier Prime', monospace" }}>
                +{PLAYER_PEDIGREE[asset.name].careerGsax} career · Peak {PLAYER_PEDIGREE[asset.name].peakGsax}
              </span>
            )}
          </div>
        </div>
      )}

      {/* SKATER NAV breakdown bars */}
      {!isPick && asset.position !== "G" && (
        <div className="mb-2.5">
          {/* Point Shares — shown when available */}
          {(asset.ops != null || asset.dps != null) && (
            <div className="flex gap-1.5 mb-1.5">
              {asset.ops != null && (
                <div className="flex items-center gap-1 px-1.5 py-0.5" style={{ background: 'rgba(26,46,92,0.08)', border: '1px solid rgba(26,46,92,0.2)', borderRadius: '2px' }}>
                  <span className="text-[6.5px] font-black uppercase tracking-wider" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>OPS</span>
                  <span className="text-[8px] font-black" style={{ color: '#1a2e5c', fontFamily: "'Courier Prime', monospace" }}>{asset.ops.toFixed(1)}</span>
                </div>
              )}
              {asset.dps != null && (
                <div className="flex items-center gap-1 px-1.5 py-0.5" style={{ background: 'rgba(184,48,32,0.08)', border: '1px solid rgba(184,48,32,0.2)', borderRadius: '2px' }}>
                  <span className="text-[6.5px] font-black uppercase tracking-wider" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>DPS</span>
                  <span className="text-[8px] font-black" style={{ color: '#b83020', fontFamily: "'Courier Prime', monospace" }}>{asset.dps.toFixed(1)}</span>
                </div>
              )}
              {asset.ops != null && asset.dps != null && (asset.ops + asset.dps) > 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5" style={{ background: 'rgba(107,80,48,0.08)', border: '1px solid rgba(107,80,48,0.2)', borderRadius: '2px' }}>
                  <span className="text-[6.5px] font-black uppercase tracking-wider" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>PS</span>
                  <span className="text-[8px] font-black" style={{ color: '#6b5030', fontFamily: "'Courier Prime', monospace" }}>{(asset.ops + asset.dps).toFixed(1)}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>NAV Breakdown</span>
            <span
              className="text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center cursor-help shrink-0"
              style={{ color: '#9a7d58', border: '1px solid #c8b890' }}
              title="OFF: Offensive production value (pts/82 pace, xG). DEF: Defensive suppression (xG against, TOI quality). YNG: Option value from proven youth on cheap deal. CAP: Contract cost penalty — overpaid contracts drag total NAV."
            >i</span>
          </div>
          <div className="stat-grid-4">
            <MicroBar label="OFF" val={xnav.off} max={300} color="cyan"
              tooltip="Offensive impact — scoring production (pts/82, xG rate)" />
            <MicroBar label="DEF" val={xnav.def} max={150} color="emerald"
              tooltip="Defensive value — xG suppression weighted by ice time quality" />
            <MicroBar label={xnav.age > 0 ? "YNG" : "AGE"} val={xnav.age} max={80}
              color={xnav.age > 0 ? "violet" : "amber"}
              tooltip={xnav.age > 0
                ? "Youth premium — proven production on a cheap contract creates surplus value"
                : "Age penalty — decline curve discount for veterans past peak age"} />
            <MicroBar label="CAP" val={xnav.cap} max={100} color="rose" invert
              tooltip="Contract cost — overpaid contracts drag total NAV. Negative = cap hit exceeds on-ice value" />
          </div>
          {/* Peak pts for established skaters with pedigree */}
          {PLAYER_PEDIGREE[asset.name]?.peakPtsPace && (
            <div className="mt-1.5 px-1 py-1 flex justify-between items-center" style={{ borderTop: '1px solid #c8b890' }}>
              <span className="text-[7px] font-black uppercase tracking-tight" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>Career Peak</span>
              <span className="text-[9px] font-black" style={{ color: '#1a2e5c', fontFamily: "'Courier Prime', monospace" }}>
                {PLAYER_PEDIGREE[asset.name].peakPtsPace} pts/82
              </span>
            </div>
          )}
        </div>
      )}

      {/* Goalie G-NAV + CAP bars */}
      {!isPick && asset.position === "G" && (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span>G-NAV Breakdown</span>
            <span
              className="text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center cursor-help shrink-0 badge-rule"
              title="G-NAV: Goals Saved Above Expected (GSAx) — how many goals this goalie prevented vs an average starter. CAP: Contract cost penalty."
            >i</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <MicroBar label="G-NAV" val={xnav.def} max={150} color="emerald"
              tooltip="Goalie NAV — based on GSAx (goals saved above expected) from MoneyPuck" />
            <MicroBar label="CAP" val={xnav.cap} max={100} color="rose" invert
              tooltip="Contract cost — overpaid contracts drag total NAV" />
          </div>
        </div>
      )}

      {/* ── Player stat line (skaters only) ───────────────────── */}
      {!isPick && asset.position !== "G" && asset.hasLiveStats && (
        <div className="mt-2 pt-2" style={{ borderTop: '1px solid #c8b890' }}>
          {/* Box score row */}
          <div className="stat-grid-4 mb-1.5">
            {[
              { label: 'GP',    val: asset.games.toString() },
              { label: 'G',     val: ((asset.goalsPace    ?? 0) * asset.games / 82).toFixed(0) },
              { label: 'A',     val: ((asset.assistsPace ?? 0) * asset.games / 82).toFixed(0) },
              { label: 'PTS',   val: (asset.ptsPace ? (asset.ptsPace * asset.games / 82).toFixed(0) : '—') },
            ].map(s => (
              <div key={s.label} className="text-center p-1" style={{ background: '#dfd0a8', border: '1px solid #b8a070' }}>
                <div className="text-[7px] font-black uppercase tracking-tight" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>{s.label}</div>
                <div className="text-[11px] font-black" style={{ color: '#1c140a', fontFamily: "'Courier Prime', monospace" }}>{s.val}</div>
              </div>
            ))}
          </div>
          {/* Advanced row */}
          <div className="stat-grid-4">
            {[
              { label: 'TOI',   val: asset.avgTOI?.toFixed(1) ?? '—',   tooltip: 'Average time on ice per game (minutes)' },
              { label: 'xG/82', val: asset.xGPace?.toFixed(1)  ?? '—',  tooltip: 'Expected goals generated per 82 games' },
              { label: 'xG%+', val: asset.xgRelTM != null ? `${(asset.xgRelTM as number) > 0 ? '+' : ''}${(asset.xgRelTM as number).toFixed(1)}` : '—', tooltip: 'xG% relative to teammates — positive means team controls more shots when this player is on ice vs off' },
              { label: 'QoC',   val: asset.qocRank?.toString() ?? '—',  tooltip: 'Quality of competition rank — lower = harder opponents faced' },
            ].map(s => (
              <div key={s.label} className="text-center p-1" title={s.tooltip} style={{ background: '#e8dab8', border: '1px solid #b8a070' }}>
                <div className="text-[7px] font-black uppercase tracking-tight" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>{s.label}</div>
                <div className="text-[10px] font-black" style={{ color: '#1a2e5c', fontFamily: "'Courier Prime', monospace" }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retention slider (only for eligible players) */}
      {asset.canRetain && !isPick && (
        <div className="mt-2 border-t border-zinc-800/50 pt-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[9px] text-zinc-600 font-black uppercase tracking-wider">Salary Retention</span>
            <span className="text-[9px] font-mono text-zinc-400 font-black">
              {(asset.retainedPct * 100).toFixed(0)}% (${(asset.capHit * asset.retainedPct).toFixed(2)}M)
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            step="5"
            value={(asset.retainedPct * 100).toFixed(0)}
            onChange={(e) => updateAsset({ retainedPct: (parseFloat(e.target.value) || 0) / 100 })}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
          
          />
          <div className="flex justify-between text-[8px] text-zinc-700 font-black mt-0.5">
            <span>0%</span><span>25%</span><span>50% MAX</span>
          </div>
        </div>
      )}

      {/* Pick protection toggle */}
      {isPick && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-zinc-600 font-black uppercase tracking-wider">Protected</span>
          <button
            onClick={() => updateAsset({ isProtected: !asset.isProtected })}
            className={`text-[9px] font-black px-2 py-0.5 rounded border transition-colors ${
              asset.isProtected
                ? "bg-amber-900/30 border-amber-800/50 text-amber-400"
                : "bg-zinc-800 border-zinc-700 text-zinc-500"
            }`}
          >
            {asset.isProtected ? "Protected ↓" : "Unprotected"}
          </button>
        </div>
      )}
      {/* Close STATS view wrapper */}
      </>)}
    </div>
  );
}

// ============================================================
// STRAND™ — Stylistic Trait & Rating Analysis for NHL Development
// A double-helix visualization of a player's offensive/defensive DNA.
// Strand A (top): Offensive traits — scoring, playmaking, xG generation
// Strand B (bottom): Defensive traits — suppression, compete, zone starts
// The two strands intertwine — balanced players have a tight helix,
// one-dimensional players show one strand dominating.
// ============================================================
function StrandView({ asset, xnav, compareAsset, compareXnav }: {
  asset: Asset;
  xnav: XNAVResult;
  compareAsset?: Asset | null;
  compareXnav?: XNAVResult | null;
}) {
  const W = 320, H = 210;
  const cy = H / 2;
  const amplitude = 42;
  const freq = (2 * Math.PI) / W;

  const norm = (val: number, mn: number, mx: number) =>
    Math.max(0, Math.min(1, (val - mn) / (mx - mn)));

  const buildTraits = (a: Asset, nav: XNAVResult) => {
    const isD = a.position === "D";
    const ops = a.ops ?? null;
    const dps = a.dps ?? null;
    const psTotal = ops !== null && dps !== null ? ops + dps : null;
    const opsNorm = psTotal !== null && psTotal > 0 ? Math.max(0, Math.min(1, ops! / Math.max(psTotal, 1))) : null;
    const dpsNorm = psTotal !== null && psTotal > 0 ? Math.max(0, Math.min(1, dps! / Math.max(psTotal, 1))) : null;

    return {
      off: [
        { label: "SCR",  val: norm(safe(a.ptsPace), 0, isD ? 80 : 100),
          title: "Scoring pace per 82" },
        { label: "xG",   val: norm(safe(a.xGPace ?? 0), 0, isD ? 25 : 50),
          title: "Expected Goals generated" },
        { label: ops !== null ? "OPS" : "OFF",
          val: opsNorm ?? norm(nav.off, -80, 300),
          title: ops !== null ? `OPS ${ops.toFixed(1)} — Offensive Point Shares` : "Offensive NAV component",
          ps: ops !== null ? ops.toFixed(1) : null },
        { label: "NOIV", val: norm(safe(a.xgRelTM ?? 0), -12, 12),
          title: "xG% relative to teammates" },
        { label: "TOI+", val: norm(safe(a.avgTOI), 10, 27),
          title: "Ice time deployment" },
      ],
      def: [
        { label: "SUPP", val: norm(-(a.xgaRelTM ?? 0), -1.5, 1.5),
          title: "xGA suppression vs teammates" },
        { label: "QoC",  val: norm(400 - safe(a.qocRank ?? 400), 50, 380),
          title: "Quality of competition" },
        { label: dps !== null ? "DPS" : "DEF",
          val: dpsNorm ?? norm(nav.def, -60, 150),
          title: dps !== null ? `DPS ${dps.toFixed(1)} — Defensive Point Shares` : "Defensive NAV component",
          ps: dps !== null ? dps.toFixed(1) : null },
        { label: "DZ%",  val: 1 - norm(safe(a.dzPct ?? 0.5), 0.3, 0.7),
          title: "Offensive zone deployment" },
        { label: "AGE",  val: norm(nav.age, -80, 60),
          title: "Age curve trajectory" },
      ],
    };
  };

  const primary   = buildTraits(asset, xnav);
  const secondary = compareAsset && compareXnav ? buildTraits(compareAsset, compareXnav) : null;

  const offAvg = primary.off.reduce((s, t) => s + t.val, 0) / primary.off.length;
  const defAvg = primary.def.reduce((s, t) => s + t.val, 0) / primary.def.length;
  const balance = Math.abs(offAvg - defAvg);

  // PS ratio is the most accurate archetype signal when available —
  // it directly measures fraction of value that is offensive vs defensive.
  // Morrissey OPS 3.5 / DPS 5.0 = psRatio 0.41 → correctly identified as defensive
  const psRatio = (asset.ops != null && asset.dps != null && (asset.ops + asset.dps) > 1)
    ? asset.ops / (asset.ops + asset.dps)
    : null;

  const strandType =
    // PS ratio overrides heuristics when live data is available
    psRatio !== null && psRatio > 0.70 && offAvg > 0.60              ? "OFFENSIVE FORCE"
    : psRatio !== null && psRatio > 0.60 && offAvg > 0.50            ? "OFFENSIVE LEAN"
    : psRatio !== null && psRatio < 0.30 && defAvg > 0.55            ? "DEFENSIVE ANCHOR"
    : psRatio !== null && psRatio < 0.40 && defAvg > 0.45            ? "DEFENSIVE LEAN"
    : psRatio !== null && psRatio >= 0.40 && psRatio <= 0.60
        && offAvg > 0.58 && defAvg > 0.52                            ? "ELITE TWO-WAY"
    : psRatio !== null && psRatio >= 0.38 && psRatio <= 0.62         ? "COMPLETE PLAYER"
    // Fallback heuristics when no PS data
    : (offAvg > 0.72 && defAvg > 0.60 && balance < 0.20)            ? "ELITE TWO-WAY"
    : offAvg > defAvg + 0.15
      ? offAvg > 0.65 ? "OFFENSIVE FORCE" : "OFFENSIVE LEAN"
    : defAvg > offAvg + 0.15
      ? defAvg > 0.65 ? "DEFENSIVE ANCHOR" : "DEFENSIVE LEAN"
    : offAvg > 0.52 && defAvg > 0.52 ? "COMPLETE PLAYER"
    : "BALANCED";

  const offColor = "#1a2e5c";
  const defColor = "#b83020";
  const cmpOff   = "#4a7c9b";
  const cmpDef   = "#c86040";

  const buildPath = (traits: {label:string;val:number;title:string}[], isOff: boolean) => {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t    = i / 80;
      const x    = t * W;
      const ti   = Math.min(4, Math.floor(t * 5));
      const amp  = amplitude * (0.35 + traits[ti].val * 0.65);
      const y    = cy + (isOff ? -1 : 1) * amp * Math.sin(freq * x * 2.5);
      pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  };

  return (
    <div className="mt-1 mb-2">
      <div className="relative" style={{ background: "#dfd0a8", border: "1px solid #c8b890", borderRadius: "2px" }}>
        <div className="strand-svg-wrap">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(t => (
            <line key={t} x1={t*W} y1={12} x2={t*W} y2={H-12} stroke="#c8b890" strokeWidth="0.5" strokeDasharray="3,3"/>
          ))}
          <line x1={0} y1={cy} x2={W} y2={cy} stroke="#c8b890" strokeWidth="0.5"/>

          {/* Strand type badge — top left */}
          <rect x={4} y={4} width={strandType.length * 5.2 + 8} height={13} fill="#dfd0a8" rx="1"/>
          <text x={8} y={13.5} fontSize="7.5" fill={
            strandType === "ELITE TWO-WAY" ? "#1a5c2e" :
            strandType === "COMPLETE PLAYER" ? "#245e39" :
            strandType.includes("OFFENSIVE") ? "#1a2e5c" :
            strandType.includes("DEFENSIVE") ? "#b83020" : "#6b5030"
          } fontFamily="Courier Prime, monospace" fontWeight="bold">{strandType}</text>

          {/* Compare strands */}
          {secondary && (<>
            <path d={buildPath(secondary.off, true)}  fill="none" stroke={cmpOff} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.6" strokeLinecap="round"/>
            <path d={buildPath(secondary.def, false)} fill="none" stroke={cmpDef} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.6" strokeLinecap="round"/>
          </>)}

          {/* Rungs */}
          {Array.from({ length: 18 }, (_, i) => {
            const t = (i + 0.5) / 18;
            const x = t * W;
            const ti = Math.min(4, Math.floor(t * 5));
            const oA = amplitude * (0.35 + primary.off[ti].val * 0.65);
            const dA = amplitude * (0.35 + primary.def[ti].val * 0.65);
            const oy = cy - oA * Math.sin(freq * x * 2.5);
            const dy = cy + dA * Math.sin(freq * x * 2.5);
            return <line key={i} x1={x} y1={oy} x2={x} y2={dy} stroke="#9a7d58" strokeWidth="0.8" opacity={0.12 + Math.abs(Math.sin(freq * x * 2.5)) * 0.25}/>;
          })}

          {/* Strands */}
          <path d={buildPath(primary.def, false)} fill="none" stroke={defColor} strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
          <path d={buildPath(primary.off, true)}  fill="none" stroke={offColor} strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>

          {/* Offensive nodes */}
          {primary.off.map((t, i) => {
            const x = ((i + 0.5) / 5) * W;
            const amp = amplitude * (0.35 + t.val * 0.65);
            const y = cy - amp * Math.sin(freq * x * 2.5);
            const hasPs = (t as any).ps != null;
            const displayVal = hasPs ? (t as any).ps : Math.round(t.val * 100);
            // Label always above the node, value below label — both above center line
            const labelY = Math.min(y - 12, cy - 16);
            const valY   = labelY + 9;
            return <g key={t.label}>
              <circle cx={x} cy={y} r={t.val * 4 + 2.5} fill={offColor} opacity="0.15"/>
              <circle cx={x} cy={y} r={hasPs ? 4 : 3} fill={offColor}/>
              <line x1={x} y1={y - (hasPs ? 4 : 3)} x2={x} y2={labelY + 2} stroke={offColor} strokeWidth="0.8" opacity="0.4"/>
              <text x={x} y={labelY} textAnchor="middle" fontSize="7.5" fill={offColor} fontFamily="Courier Prime, monospace" fontWeight="bold">{t.label}</text>
              <text x={x} y={valY}   textAnchor="middle" fontSize="6.5" fill={offColor} fontFamily="Courier Prime, monospace" opacity="0.9">{displayVal}</text>
            </g>;
          })}

          {/* Defensive nodes */}
          {primary.def.map((t, i) => {
            const x = ((i + 0.5) / 5) * W;
            const amp = amplitude * (0.35 + t.val * 0.65);
            const y = cy + amp * Math.sin(freq * x * 2.5);
            const hasPs = (t as any).ps != null;
            const displayVal = hasPs ? (t as any).ps : Math.round(t.val * 100);
            // Label always below the node, value above label — both below center line
            const labelY = Math.max(y + 14, cy + 18);
            const valY   = labelY + 9;
            return <g key={t.label}>
              <circle cx={x} cy={y} r={t.val * 4 + 2.5} fill={defColor} opacity="0.15"/>
              <circle cx={x} cy={y} r={hasPs ? 4 : 3} fill={defColor}/>
              <line x1={x} y1={y + (hasPs ? 4 : 3)} x2={x} y2={labelY - 4} stroke={defColor} strokeWidth="0.8" opacity="0.4"/>
              <text x={x} y={labelY} textAnchor="middle" fontSize="7.5" fill={defColor} fontFamily="Courier Prime, monospace" fontWeight="bold">{t.label}</text>
              <text x={x} y={valY}   textAnchor="middle" fontSize="6.5" fill={defColor} fontFamily="Courier Prime, monospace" opacity="0.9">{displayVal}</text>
            </g>;
          })}

          {/* Compare legend */}
          {secondary && (
            <g>
              <line x1={W-95} y1={H-8} x2={W-81} y2={H-8} stroke={cmpOff} strokeWidth="1.5" strokeDasharray="4,2"/>
              <text x={W-78} y={H-4} fontSize="6.5" fill={cmpOff} fontFamily="Courier Prime, monospace">
                {compareAsset?.name.split(" ").pop()}
              </text>
            </g>
          )}
        </svg>
        </div>
      </div>

      {/* Compact trait bars — 2-col grid, OFF on left, DEF on right */}
      <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {[
          { label: "◆ OFFENSE", traits: primary.off, color: offColor, ps: asset.ops ?? null, psLabel: "OPS" },
          { label: "◆ DEFENSE", traits: primary.def, color: defColor, ps: asset.dps ?? null, psLabel: "DPS" },
        ].map(({ label, traits, color, ps, psLabel }) => (
          <div key={label} style={{ background: "#e4d8b8", border: "1px solid #c8b890", padding: "6px 8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
              <span style={{ fontSize: "7px", fontWeight: 900, color, fontFamily: "'Courier Prime', monospace" }}>{label}</span>
              {ps !== null && ps !== undefined && (
                <span style={{ fontSize: "7px", fontWeight: 900, color, fontFamily: "'Courier Prime', monospace" }}>
                  {psLabel} {(ps as number).toFixed(1)}
                </span>
              )}
            </div>
            {traits.map(t => (
              <div key={t.label} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "3px" }} title={t.title}>
                <span style={{ fontSize: "6.5px", fontWeight: 900, width: "26px", flexShrink: 0, color: "#6b5030", fontFamily: "'Courier Prime', monospace" }}>{t.label}</span>
                <div style={{ flex: 1, height: "4px", background: "#c8b890", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ width: `${t.val * 100}%`, height: "100%", background: color, opacity: 0.85 }}/>
                </div>
                <span style={{ fontSize: "6.5px", fontWeight: 900, width: "18px", textAlign: "right", flexShrink: 0, color, fontFamily: "'Courier Prime', monospace" }}>{Math.round(t.val * 100)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="text-[7px] mt-1 text-center" style={{ color: "#b8a070", fontFamily: "'Courier Prime', monospace" }}>
        STRAND™ — Stylistic Trait & Rating Analysis for NHL Development
      </div>
    </div>
  );
}

// ============================================================
// ASSET DROPDOWN
// ============================================================
function AssetDropdown({
  idx, team, db, blocks, setBlocks, navMap
}: {
  idx: 0 | 1;
  team: Team | null;
  db: { teams: Team[]; players: Asset[] };
  blocks: [Asset[], Asset[]];
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
  navMap: Record<string, XNAVResult>;
}) {
  const label = idx === 0 ? "+ ADD OUTGOING ASSET" : "+ REQUEST INCOMING ASSET";

  const eligible = db.players
    .filter((p) => p.teamId === team?.id && !blocks[idx].some((a: Asset) => a.id === p.id))
    .sort((a, b) => {
      const navA = navMap[a.id]?.total ?? 0;
      const navB = navMap[b.id]?.total ?? 0;
      return navB - navA;
    });

  const skaters = eligible.filter((p) => p.position !== "Pick");
  const picks = eligible.filter((p) => p.position === "Pick");

  return (
    <select
      className="w-full border p-3.5 rounded-xl font-black uppercase tracking-widest text-[9px] outline-none appearance-none cursor-pointer transition-colors"
      style={{ background: '#e8dab8', borderColor: '#b8a070', color: '#6b5030' }}
      onChange={(e) => {
        const asset = db.players.find((p) => p.id === e.target.value);
        if (asset) {
          setBlocks((prev) => {
            const n = [...prev] as [Asset[], Asset[]];
            n[idx] = [...n[idx], { ...asset, retainedPct: 0 }];
            return n;
          });
        }
        e.target.value = "";
      }}
      defaultValue=""
    >
      <option value="" disabled>{label}</option>
      {skaters.length > 0 && (
        <optgroup label="── SKATERS ──">
          {skaters.map((p) => (
            <option key={p.id} value={p.id} className="bg-zinc-900 text-sm">
              {p.name} [{p.position}] ${p.capHit.toFixed(1)}M — NAV {(navMap[p.id]?.total ?? 0).toFixed(0)}
            </option>
          ))}
        </optgroup>
      )}
      {picks.length > 0 && (
        <optgroup label="── DRAFT PICKS ──">
          {picks.map((p) => (
            <option key={p.id} value={p.id} className="bg-zinc-900 text-sm">
              {p.name} — NAV {(navMap[p.id]?.total ?? 0).toFixed(0)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// ============================================================
// TUG-OF-WAR BAR
// ============================================================
function TugBar({ homeNetGain, navA, navB }: { homeNetGain: number; navA: number; navB: number }) {
  const total = Math.max(navA + navB, 1);
  const leftPct = clamp((navA / total) * 100, 5, 95);

  return (
    <div className="flex flex-col gap-1">
      {/* Home Net Gain — centered above the bar */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-[9px] uppercase tracking-[0.35em] font-black" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
          Home Net Gain
        </span>
        <span className={`text-xl font-black font-mono tabular-nums transition-colors duration-500 ${Math.abs(homeNetGain) < 5 ? "text-sky-400" : homeNetGain > 0 ? "text-emerald-400" : "text-rose-500"}`}>
          {fmt(homeNetGain, 1)}
        </span>
        <span className="text-[10px] font-bold" style={{ color: '#9a7d58' }}>NAV</span>
      </div>
      <div className="w-full h-9 border rounded-2xl relative overflow-hidden flex items-center shadow-inner">
        <div className="absolute inset-0 flex">
          <div className="h-full bg-rose-500/8 transition-all duration-700 ease-out" style={{ width: `${leftPct}%` }} />
          <div className="h-full bg-emerald-500/8 transition-all duration-700 ease-out flex-1" />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 h-full w-px bg-zinc-700/50" />
        <div className="z-10 w-full flex justify-between px-3 sm:px-5 font-black text-[9px] uppercase tracking-[0.3em] text-zinc-700">
          <span className={`hidden sm:inline ${homeNetGain < -5 ? "text-rose-500" : ""}`}>Outgoing Value</span>
          <span className={`sm:hidden ${homeNetGain < -5 ? "text-rose-500" : ""}`}>OUT</span>
          <span className="bg-zinc-950 text-zinc-300 px-3 py-1 rounded-lg border border-zinc-800 font-mono text-[10px] tracking-tight">
            {navA.toFixed(0)} ←→ {navB.toFixed(0)} NAV
          </span>
          <span className={`hidden sm:inline ${homeNetGain > 5 ? "text-emerald-400" : ""}`}>Incoming Value</span>
          <span className={`sm:hidden ${homeNetGain > 5 ? "text-emerald-400" : ""}`}>IN</span>
        </div>
      </div>
    </div>
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
    defTotals.QoC  += norm(400 - safe(p.qocRank ?? 400), 50, 380);
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
  const [expanded, setExpanded] = React.useState(false);

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

          {/* Playoff standing context */}
          {homeTeam && (
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="text-[8px] font-black px-2 py-1" style={{
                fontFamily: "'Courier Prime', monospace",
                color: homeTeam.standing <= 8 ? '#1a5c2e' : homeTeam.standing <= 16 ? '#8a5c00' : '#b83020',
                border: `1px solid ${homeTeam.standing <= 8 ? 'rgba(26,92,46,0.4)' : homeTeam.standing <= 16 ? 'rgba(138,92,0,0.4)' : 'rgba(184,48,32,0.4)'}`,
              }}>
                {homeTeam.name} · #{homeTeam.standing}/32 · {homeTeam.standing <= 8 ? '✓ IN PLAYOFFS' : homeTeam.standing <= 12 ? '~ BUBBLE' : homeTeam.standing <= 16 ? '~ WILDCARD RANGE' : '✗ OUT'}
              </div>
              {partnerTeam && (
                <div className="text-[8px] font-black px-2 py-1" style={{
                  fontFamily: "'Courier Prime', monospace",
                  color: partnerTeam.standing <= 8 ? '#1a5c2e' : partnerTeam.standing <= 16 ? '#8a5c00' : '#b83020',
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

          <div className="strands-gaps-grid">
            {[...homeGaps.off, ...homeGaps.def]
              .sort((a, b) => a.gap - b.gap)
              .map(g => {
                const pct = Math.min(48, Math.abs(g.gap) * 180);
                const valClass = g.gap < -0.10 ? 'deficit' : g.gap > 0.05 ? 'surplus' : 'neutral';
                return (
                  <div key={g.label} className="strands-gap-row">
                    <span className="strands-gap-label">{g.label}</span>
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

          <div className="strands-legend">
            <span><span style={{ color: 'var(--red)' }}>■</span> Below playoff threshold</span>
            <span><span style={{ color: 'var(--green)' }}>■</span> Exceeds template</span>
            <span><span style={{ color: '#1a5c2e' }}>· ·</span> Playoff threshold</span>
            <span><span style={{ color: 'var(--rule)' }}>— —</span> Championship standard</span>
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
      <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5">{label}</div>
      <div className={`text-[10px] font-black uppercase tracking-tight ${c.color}`}>{mode}</div>
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
        <div className="text-[10px] text-zinc-500 font-bold">{verdict.message}</div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {hardCount > 0 && <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-red-900/50 text-red-300 border border-red-800/50">{hardCount} HARD BLOCK{hardCount > 1 ? "S" : ""}</span>}
          {softCount > 0 && <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-orange-900/50 text-orange-300 border border-orange-800/50">{softCount} GM VETO{softCount > 1 ? "S" : ""}</span>}
          {warnCount > 0 && <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-800/40">{warnCount} WARNING{warnCount > 1 ? "S" : ""}</span>}
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
        <div className="text-[8px] font-black text-zinc-700 uppercase tracking-widest mb-2">
          GM Intelligence Flags — click to expand
        </div>
        {flags.length === 0 && <div className="text-[10px] text-zinc-700 italic">No flags raised.</div>}
        {flags.map((flag, i) => {
          const fs = SEVERITY_STYLES[flag.severity];
          const isOpen = expandedFlag === i;
          return (
            <div key={i}
              className={`rounded-lg border overflow-hidden cursor-pointer transition-all duration-200 ${fs.bg} ${fs.border} hover:opacity-90`}
              onClick={() => setExpandedFlag(isOpen ? null : i)}>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${fs.dot}`} />
                <span className={`text-[9px] font-black uppercase tracking-tight flex-1 leading-tight ${fs.text}`}>
                  {flag.headline}
                </span>
                {flag.affectedAsset && (
                  <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border shrink-0 ${fs.label}`}>
                    {flag.affectedAsset.split(" ").pop()}
                  </span>
                )}
                <span className={`text-[9px] font-black shrink-0 ml-1 ${fs.text}`}>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && (
                <div className={`px-3 pb-3 pt-0.5 border-t ${fs.border}`}>
                  <p className={`text-[10px] leading-relaxed font-medium ${fs.text}`}>{flag.explanation}</p>
                  {flag.vetoesSide !== undefined && (
                    <div className={`mt-2 text-[8px] font-black uppercase tracking-wide border-t pt-1.5 ${fs.border} ${fs.text} opacity-70`}>
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
            className="w-full py-2.5 font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            style={{ background: 'transparent', border: '1px solid #b8a070', color: '#6b5030', fontFamily: "'Courier Prime', monospace", borderRadius: '2px' }}
          >
            <span style={{ color: '#b83020' }}>✦</span> Generate Front Office Memo
          </button>
        )}

        {verdict.claudeLoading && (
          <div className="flex items-center gap-2.5 py-3 px-1">
            <div className="w-3 h-3 rounded-full border-t-transparent animate-spin shrink-0" style={{ borderColor: '#b83020', borderTopColor: 'transparent', borderWidth: '2px' }} />
            <span className="text-[10px] font-bold" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>Claude is reviewing the trade...</span>
          </div>
        )}

        {verdict.claudeAnalysis && !verdict.claudeLoading && (
          <button
            onClick={onOpenMemo}
            className="w-full py-2.5 font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            style={{ background: '#1a5c2e', border: '1px solid #0f3d1e', color: '#fff', fontFamily: "'Courier Prime', monospace", borderRadius: '2px' }}
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
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600">Full NAV Breakdown</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="border-b border-zinc-800/30">
              {["Side", "Player", "Pos", "Age", "Pts/82", "xG/82", "DefRate", "Avg TOI", "Cap", "Term", "X-NAV", "Off", "Def", "Age/YNG", "Cap Cost"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-wider text-zinc-600">{h}</th>
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
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isOut ? "bg-rose-900/30 text-rose-400" : "bg-emerald-900/30 text-emerald-400"}`}>
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
function MicroBar({ label, val, max, color, invert = false, tooltip }: {
  label: string; val: number; max: number; color: string; invert?: boolean; tooltip?: string;
}) {
  const norm = clamp(Math.abs(val) / max, 0, 1);
  const colorMap: Record<string, string> = {
    cyan:    "#1a3a6b",
    emerald: "#1a6b3a",
    violet:  "#5b4a9b",
    amber:   "#9a6b00",
    rose:    "#c0392b",
  };
  // Bar color: negative values always red, positive use their assigned color
  // CAP (invert) is always rose colored — it's always a cost
  const barColor = val < 0 ? "#c0392b" : colorMap[color];
  const numColor = invert
    ? (val < -40 ? '#c0392b' : val < -20 ? '#9a6b00' : '#1a5c2e')
    : (val < 0 ? '#c0392b' : '#1a5c2e');

  return (
    <div className="rounded p-2 text-center" title={tooltip}>
      <div className="text-[9px] font-black uppercase tracking-wider mb-1.5">{label}</div>
      <div className="h-1.5 rounded-full mb-1.5 overflow-hidden" style={{ background: '#c8b078' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${norm * 100}%`, background: barColor, opacity: 0.85 }} />
      </div>
      <div className="text-[11px] font-black tabular-nums" style={{
        color: numColor,
        fontFamily: "'Courier Prime', monospace"
      }}>
        {val > 0 ? "+" : ""}{val.toFixed(0)}
      </div>
    </div>
  );
}

function DeltaRow({ label, val, unit, invert = false, tooltip }: {
  label: string; val: number; unit: string; invert?: boolean; tooltip?: string;
}) {
  const isGood    = invert ? val <= 0 : val >= 0;
  const isNeutral = Math.abs(val) < 0.5;
  return (
    <div className="flex justify-between items-center" title={tooltip}>
      <span className="text-zinc-700 text-[9px] uppercase tracking-tight font-black">{label}</span>
      <span className={`font-black text-[10px] ${isNeutral ? "text-zinc-600" : isGood ? "text-emerald-400" : "text-rose-400"}`}>
        {val > 0 ? "+" : ""}{val.toFixed(1)}{unit}
      </span>
    </div>
  );
}

function MiniStat({ label, val }: { label: string; val: string }) {
  return (
    <div className="p-2 text-center">
      <div className="text-[8px] font-black uppercase tracking-widest mb-0.5">{label}</div>
      <div className="text-[13px] font-black" style={{ color: '#1c140a',  }}>{val}</div>
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
      <div className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-600 animate-pulse">
        Syncing NHL Data Core
      </div>
      <div className="text-[9px] text-zinc-800 font-black uppercase tracking-widest">
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