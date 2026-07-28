"use client";
// ── Cup Run lifecycle — run state, resume guard, season rollover ──
// Owns the 3-year Cup Run state machine for the Armchair GM page:
// start/abandon, localStorage persistence, the resume-guard prompt
// (a saved ACTIVE run is never restored silently), and the year-advance
// league rollover including the future-draft summary.
//
// Late-bound values arrive through refs because they come from hooks
// that run after this one (useSimDispatch, useTradeBench,
// useOffseasonFlow). The refs are only read inside event handlers,
// which fire after every render has assigned them.
import React, { useState, useEffect, useCallback } from "react";
import type { Asset, Team } from "@/app/lib/trade-types";
import { capForCupYear } from "@/app/lib/season-config";
import { dropSpentDraftPicks, draftYearForCupYear } from "@/app/lib/draft-picks";
import { clearNavCache } from "@/app/lib/evaluate-client";
import {
  startCupRun,
  recordSeason,
  rollLeagueForward,
  rollRetentionLedger,
  reconcileTeamCapSpaces,
  seasonLabelForYear,
  type CupRunState,
  type CupRunSkaterSeason,
} from "@/app/lib/cup-run";
import { toast } from "@/app/lib/ledger-toast";
import type { CupDraftSummary } from "./CupRunDraftSummaryModal";
import { futureDraftPromptForUserPick } from "@/app/lib/future-draft-choice";

export const CUP_RUN_STORAGE_KEY = "cup-run-state-v1";

type LeagueDb = { teams: Team[]; players: Asset[]; capCeiling?: number | null };
type SimStanding = { teamId: string; projectedSkaters?: CupRunSkaterSeason[] };

export function useCupRunLifecycle({
  homeTeam,
  db,
  originalDb,
  setDb,
  setOriginalDb,
  setHomeTeamLocked,
  simDataRef,
  onSeasonRolledRef,
}: {
  homeTeam: Team | null;
  db: LeagueDb;
  originalDb: LeagueDb | null;
  setDb: React.Dispatch<React.SetStateAction<LeagueDb>>;
  setOriginalDb: (next: LeagueDb) => void;
  setHomeTeamLocked: (locked: boolean) => void;
  /** Latest sim payload (standings/bracket) — assigned each render after useSimDispatch. */
  simDataRef: React.MutableRefObject<any | null>;
  /** Resets trades/lineups/offseason UI for the new year — assigned each render. */
  onSeasonRolledRef: React.MutableRefObject<() => void>;
}) {
  const [cupRun, setCupRun] = useState<CupRunState | null>(null);
  const [cupAdvancing, setCupAdvancing] = useState(false);
  // A saved ACTIVE run found on load — held here until the user decides.
  // Restoring it silently is a trap: the rolled league lives only in
  // React state, so a reloaded session is a fresh 2026 league wearing a
  // mid-run flag (offseason popups gated off, everything "broken").
  const [cupRunPrompt, setCupRunPrompt] = useState<CupRunState | null>(null);
  const [cupDraftSummary, setCupDraftSummary] = useState<CupDraftSummary | null>(null);
  const cupRunActive = cupRun?.status === "ACTIVE";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUP_RUN_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.version === 1) {
          if (saved.status === "ACTIVE") setCupRunPrompt(saved);
          else setCupRun(saved); // WON/FIRED — just shows the final panel
        }
      }
    } catch { /* corrupted save — start fresh */ }
  }, []);

  useEffect(() => {
    try {
      if (cupRun) localStorage.setItem(CUP_RUN_STORAGE_KEY, JSON.stringify(cupRun));
    } catch { /* storage unavailable */ }
  }, [cupRun]);

  const dismissCupRunPrompt = useCallback((resume: boolean) => {
    setCupRunPrompt(prev => {
      if (resume && prev) {
        // Year 1 pre-rollover state matches the fresh league; executed
        // trades were lost with the session, so the retention ledger
        // resets with them.
        setCupRun({ ...prev, retentionLedger: [] });
      } else {
        try { localStorage.removeItem(CUP_RUN_STORAGE_KEY); } catch { /* ignore */ }
      }
      return null;
    });
  }, []);

  const handleStartCupRun = useCallback(() => {
    if (!homeTeam) return;
    const run = startCupRun(homeTeam);
    setCupRun(run);
    setHomeTeamLocked(true);
    toast(`Cup Run started: ${homeTeam.name} — ${run.difficulty.label} (${run.difficulty.stars}★)`, "info");
  }, [homeTeam, setHomeTeamLocked]);

  const handleAbandonCupRun = useCallback(() => {
    setCupRun(null);
    try { localStorage.removeItem(CUP_RUN_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const handleCupRunAdvance = useCallback(() => {
    if (!cupRun || cupRun.status !== "ACTIVE") return;
    const simData = simDataRef.current;
    const champion = simData?.playoffBracket?.champion;
    if (!champion) return;

    const madePlayoffs = (simData.playoffTeams ?? []).includes(cupRun.teamId);
    const next = recordSeason(cupRun, {
      championTeamId: champion.teamId,
      championTeamName: champion.teamName,
      madePlayoffs,
    });
    if (next.status !== "ACTIVE") {
      setCupRun(next);
      return;
    }

    // Roll the whole league into the next season
    setCupAdvancing(true);
    try {
      // The cap ceiling steps up with the new season (2026-27 → 2027-28 →
      // 2028-29). AI cap-legality and every team's cap space must be judged
      // against the year the league is entering, not a stale $104M.
      const nextCap = capForCupYear(next.currentYear).ceiling;
      const standings = (simData.standings ?? []).map((t: SimStanding, i: number) => ({
        teamId: t.teamId,
        standing: i + 1,
      }));
      const simSkaterSeasons = (simData.standings ?? []).flatMap((t: SimStanding) =>
        Array.isArray(t.projectedSkaters) ? t.projectedSkaters : [],
      );
      const rolled = rollLeagueForward({
        players: db.players,
        seasonStartPlayers: originalDb?.players ?? db.players,
        state: next,
        teams: db.teams,
        standings,
        capCeiling: nextCap,
        simSkaterSeasons,
      });
      const drafted = [...rolled.draftedRookies]
        .sort((a, b) => (a.draftOverall ?? 999) - (b.draftOverall ?? 999));
      setCupDraftSummary({
        seasonLabel: seasonLabelForYear(next.currentYear),
        draftYear: drafted[0]?.draftYear ?? null,
        retiredCount: rolled.retiredCount,
        rookieCount: rolled.rookieCount,
        depthAddedCount: rolled.depthAddedCount,
        breakoutCount: rolled.events.filter(e => e.type === "breakout").length,
        regressionCount: rolled.events.filter(e => e.type === "regression").length,
        topPicks: drafted.slice(0, 10).map(p => ({
          id: p.id,
          name: p.name,
          teamId: p.teamId,
          position: p.position,
          overall: p.draftOverall ?? null,
        })),
        userPick: drafted[0]?.draftYear
          ? futureDraftPromptForUserPick(drafted, drafted[0].draftYear, next.teamId)
          : null,
      });
      setCupRun({ ...next, retentionLedger: rollRetentionLedger(next.retentionLedger) });
      clearNavCache();
      // Prune spent draft picks. Entering this season HELD a draft — Year 2
      // holds 2027 — so that year's picks were just converted into rookies and
      // must leave every selector. The old boundary kept them (`>=` where the
      // draft year itself is already spent), so a traded 2027 first stayed
      // tradeable after conveying (ST2).
      const livePlayers = dropSpentDraftPicks(
        rolled.players, draftYearForCupYear(next.currentYear));
      // The user's team is reconciled too — new ceiling, rolled roster, and its
      // still-active retained-salary obligations (paid on players it moved).
      const rolledLedger = rollRetentionLedger(next.retentionLedger);
      const userRetainedAav = rolledLedger.reduce((s, e) => s + e.aavRetained, 0);
      const rolledTeams = reconcileTeamCapSpaces(db.teams, livePlayers, nextCap, next.teamId, userRetainedAav);
      setDb(prev => ({ ...prev, teams: rolledTeams, players: livePlayers, capCeiling: nextCap }));
      setOriginalDb({ teams: rolledTeams, players: livePlayers, capCeiling: nextCap });
      onSeasonRolledRef.current();
      const breakouts = rolled.events.filter(e => e.type === "breakout").length;
      toast(
        `Welcome to ${seasonLabelForYear(next.currentYear)} — ${rolled.retiredCount} retired, ${rolled.rookieCount} drafted, ${breakouts} breakouts`,
        "success",
      );
    } finally {
      setCupAdvancing(false);
    }
  }, [cupRun, db, originalDb, setDb, setOriginalDb, simDataRef, onSeasonRolledRef]);

  return {
    cupRun,
    setCupRun,
    cupRunActive,
    cupAdvancing,
    cupRunPrompt,
    dismissCupRunPrompt,
    cupDraftSummary,
    setCupDraftSummary,
    handleStartCupRun,
    handleAbandonCupRun,
    handleCupRunAdvance,
  };
}
