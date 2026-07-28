"use client";

import { useCallback, useRef, useState } from "react";
import { SEASON } from "@/app/lib/season-config";
import { formatPickRound } from "@/app/lib/trade-format";
import { scenarioSeed } from "@/app/lib/sim-engine";
import type { LineupOrderPayload } from "@/app/components/LineupEditor";
import type { Asset, Team, XNAVResult } from "@/app/lib/trade-types";
import { teamWindow } from "@/app/lib/team-window";

type LeagueState = {
  teams: Team[];
  players: Asset[];
  capCeiling?: number | null;
};

type ExecutedTrade = {
  id: string;
  homeTeamName: string;
  partnerTeamName: string;
  outgoing: Asset[];
  incoming: Asset[];
  timestamp: number;
};

type ContentionSummary = {
  present: number;
  future: number;
  quadrant: "WIN_NOW" | "WINDOW_OPEN" | "WINDOW_OPENING" | "REBUILDING";
  presentLabel: string;
  futureLabel: string;
};

export function useSimDispatch({
  homeTeam,
  partnerTeam,
  db,
  originalDb,
  executedTrades,
  navMap,
  lineupStartingGoalies,
  lineupOrders,
  computeContention,
  lineupContext = false,
  cupRunContext = null,
}: {
  homeTeam: Team | null | undefined;
  partnerTeam: Team | null | undefined;
  db: LeagueState;
  originalDb: LeagueState | null;
  executedTrades: ExecutedTrade[];
  navMap: Record<string, XNAVResult>;
  lineupStartingGoalies: Record<string, string | null>;
  lineupOrders: Record<string, LineupOrderPayload>;
  computeContention: (roster: Asset[], navMap: Record<string, XNAVResult>) => ContentionSummary;
  lineupContext?: boolean; // Cup Run mode: slot weighting in the sim
  cupRunContext?: {
    teamId: string;
    teamName: string;
    year: number;               // 1-3
    runSeed: number;            // the run's base seed — folded into each season's seed
    difficultyLabel: string;
    stars: number;
    seasons: { seasonLabel: string; championTeamName: string; madePlayoffs: boolean; wonCup: boolean }[];
  } | null;
}) {
  const [simResult, setSimResult] = useState<string | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simData, setSimData] = useState<any | null>(null);
  const simAbortRef = useRef<AbortController | null>(null);

  const clearSimResult = useCallback(() => {
    setSimResult(null);
  }, []);

  const resetSimulation = useCallback(() => {
    setSimResult(null);
    setSimData(null);
  }, []);

  const simYear = useCallback(async () => {
    // A season can be simulated with zero trades — the baseline league is a
    // valid scenario. Only a chosen home team is required.
    if (!homeTeam) return;
    setSimLoading(true);
    setSimResult(null);
    setSimData(null);

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
        // Cup Run: fold in the run's seed and the season year so Years 1-3 (and
        // different runs) get independent, reproducible rolls instead of the
        // same seed every year (audit #3). Omitted outside a run, so ordinary
        // single-season seeds are unchanged.
        ...(cupRunContext
          ? { cupRunSeed: cupRunContext.runSeed, cupRunYear: cupRunContext.year }
          : {}),
        trades: simTrades.map(t => ({
          homeTeamId: t.homeTeamId,
          partnerTeamId: t.partnerTeamId,
          outgoing: t.outgoing.map(a => ({ id: a.id, retainedPct: a.retainedPct ?? 0 })),
          incoming: t.incoming.map(a => ({ id: a.id, retainedPct: a.retainedPct ?? 0 })),
        })),
      });
      const baselinePlayerIds = new Set(simPlayers.map(p => p.id));
      const newlyAddedPlayers = originalDb
        ? db.players.filter(p => !baselinePlayerIds.has(p.id))
        : [];
      const simPlayerPool = newlyAddedPlayers.length > 0
        ? [...simPlayers, ...newlyAddedPlayers]
        : simPlayers;

      const simRes = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeamId:    homeTeam.id,
          partnerTeamId: partnerTeam?.id ?? "",
          teams:   simTeams,
          players: simPlayerPool,
          trades:  simTrades,
          lineup: {
            startingGoalies: lineupStartingGoalies,
            orders: lineupOrders,
          },
          seed,
          lineupContext,
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

    // Cup Run: the Claude recap only runs when the run ends (Cup won or
    // year 3 complete) and tells the whole multi-season story. Mid-run
    // seasons get numbers only — the arc isn't finished yet.
    const runEndsHere = cupRunContext
      ? sim.playoffBracket?.champion?.teamId === cupRunContext.teamId || cupRunContext.year >= 3
      : true;
    if (cupRunContext && !runEndsHere) {
      setSimResult(null);
      setSimLoading(false);
      return;
    }

    const tradesSummary = executedTrades.map(t => {
      const outNames = t.outgoing.map(a => a.position === "Pick"
        ? `${a.year} ${formatPickRound(a.round)} round pick`
        : `${a.name} (${a.position}, $${a.capHit}M)`).join(", ");
      const inNames = t.incoming.map(a => a.position === "Pick"
        ? `${a.year} ${formatPickRound(a.round)} round pick`
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

    const isRebuilding = ["Rebuilding","Tanking","Retooling"].includes(teamWindow(homeTeam));

    const teamNarrative = (t: Team): string => {
      const p = teamWindow(t);
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
            homePhase: teamWindow(homeTeam),
            homeContention,
            seasonStartOutlook: teamNarrative(homeTeam),
            isRebuilding,
            seed: sim.seed ?? null,
            generatedLabel: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" }),
            cupRunStory: cupRunContext ? {
              teamName: cupRunContext.teamName,
              finalYear: cupRunContext.year,
              difficulty: `${cupRunContext.stars}/5 — ${cupRunContext.difficultyLabel}`,
              wonCup: sim.playoffBracket?.champion?.teamId === cupRunContext.teamId,
              priorSeasons: cupRunContext.seasons,
            } : null,
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
  }, [
    homeTeam,
    partnerTeam,
    db,
    originalDb,
    executedTrades,
    navMap,
    lineupStartingGoalies,
    lineupOrders,
    computeContention,
    lineupContext,
    cupRunContext,
  ]);

  return {
    simResult,
    simLoading,
    simData,
    simYear,
    clearSimResult,
    resetSimulation,
  };
}
