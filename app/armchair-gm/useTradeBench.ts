"use client";
// ── Trade bench — executed trades, lineups, execute/reset ──
// Owns the Armchair GM's persistent trade-session state: the executed
// trade log, the sim panel toggle, hand-set lineups, and the two big
// roster mutations (executeTrade, resetTrades). Sim controls arrive
// through a ref because useSimDispatch runs after this hook — the ref
// is only read inside event handlers, after render has assigned it.
import React, { useState, useCallback, useEffect, useRef } from "react";
import type { Asset, Team, TradeVerdict } from "@/app/lib/trade-types";
import type { LineupOrderPayload } from "@/app/components/LineupEditor";
import { SEASON } from "@/app/lib/season-config";
import { pickEffectiveStanding } from "@/app/lib/pick-value";
import { teamWindow } from "@/app/lib/team-window";
import { applyCapDelta } from "@/app/lib/cap-delta";
import { clearNavCache } from "@/app/lib/evaluate-client";
import { tradeAssetKey } from "@/app/store/tradeStore";
import { retentionCheck, addRetention, type CupRunState, type RetentionEntry } from "@/app/lib/cup-run";
import { toast } from "@/app/lib/ledger-toast";
import { buildTradeCapMoves } from "./CupRunDraftSummaryModal";

type LeagueDb = { teams: Team[]; players: Asset[]; capCeiling?: number | null };

export type ExecutedTrade = {
  id: string;
  homeTeamName: string;
  partnerTeamName: string;
  outgoing: Asset[];
  incoming: Asset[];
  timestamp: number;
};

export type SimControls = {
  clearSimResult: () => void;
  resetSimulation: () => void;
};

export function useTradeBench({
  homeTeam,
  partnerTeam,
  outgoingBlock,
  incomingBlock,
  setBlocks,
  setVerdict,
  db,
  setDb,
  originalDb,
  setHomeTeamLocked,
  setShowTeamSelect,
  cupRun,
  setCupRun,
  offseasonResolvedRef,
  simControlsRef,
}: {
  homeTeam: Team | null;
  partnerTeam: Team | null;
  outgoingBlock: Asset[];
  incomingBlock: Asset[];
  setBlocks: (blocks: [Asset[], Asset[]]) => void;
  setVerdict: (v: TradeVerdict | null) => void;
  db: LeagueDb;
  setDb: React.Dispatch<React.SetStateAction<LeagueDb>>;
  originalDb: LeagueDb | null;
  setHomeTeamLocked: (locked: boolean) => void;
  setShowTeamSelect: (open: boolean) => void;
  cupRun: CupRunState | null;
  setCupRun: React.Dispatch<React.SetStateAction<CupRunState | null>>;
  offseasonResolvedRef: React.MutableRefObject<boolean>;
  /** Assigned each render after useSimDispatch — read only in handlers. */
  simControlsRef: React.MutableRefObject<SimControls | null>;
}) {
  // ── Persistent trade simulation state ────────────────────────
  const [executedTrades, setExecutedTrades] = useState<ExecutedTrade[]>([]);
  const [lineupStartingGoalies, setLineupStartingGoalies] = useState<Record<string, string | null>>({});
  const [lineupOrders, setLineupOrders] = useState<Record<string, LineupOrderPayload>>({});

  const handleGoalieStarterChange = useCallback((teamId: string, goalieId: string | null) => {
    setLineupStartingGoalies(prev =>
      prev[teamId] === goalieId ? prev : { ...prev, [teamId]: goalieId }
    );
  }, []);

  const handleLineupChange = useCallback((teamId: string, order: LineupOrderPayload) => {
    setLineupOrders(prev => {
      const current = prev[teamId];
      if (current && JSON.stringify(current) === JSON.stringify(order)) return prev;
      return { ...prev, [teamId]: order };
    });
  }, []);

  // ── Execute Trade — moves players between teams in db state ──
  const executeTrade = useCallback(() => {
    if (!homeTeam || !partnerTeam || (!outgoingBlock.length && !incomingBlock.length)) return;

    // Cup Run: retention is a scarce cross-season resource. Slots stay
    // occupied for the retained contract's full term, so the ledger is
    // checked and charged here at execution time.
    const retainedOutgoing = outgoingBlock
      .filter(a => a.position !== "Pick" && (a.retainedPct ?? 0) > 0)
      .map(a => ({
        playerId: a.id,
        playerName: a.name,
        pct: a.retainedPct ?? 0,
        capHit: a.capHit,
        yearsRemaining: a.yearsRemaining,
      }));
    if (retainedOutgoing.length > 0) {
      const inCupRun = cupRun?.status === "ACTIVE";
      // One check, two ledgers: a run's ledger carries across seasons, a
      // session's does not, but the limits themselves are identical.
      const ledger = inCupRun ? cupRun!.retentionLedger : sessionRetentionRef.current;
      const check = retentionCheck(ledger, retainedOutgoing, db.capCeiling ?? SEASON.capCeiling);
      if (!check.ok) {
        toast(check.reason ?? "Retention limit reached.", "error");
        return;
      }
      if (inCupRun) {
        setCupRun(prev => prev && prev.status === "ACTIVE"
          ? { ...prev, retentionLedger: addRetention(prev.retentionLedger, retainedOutgoing) }
          : prev);
      } else {
        setSessionRetention(prev => addRetention(prev, retainedOutgoing));
      }
    }

    const outgoingByKey = new Map(outgoingBlock.map(a => [tradeAssetKey(a), a]));
    const incomingByKey = new Map(incomingBlock.map(a => [tradeAssetKey(a), a]));

    setDb(prev => {
      const clearSessionTradeBlock = (p: Asset): Asset =>
        p.position === "Pick"
          ? p
          : { ...p, tradeBlockStatus: null, tradeBlockNote: null };

      // Update player teamIds
      const updatedPlayers = prev.players.map(p => {
        const outgoingAsset = outgoingByKey.get(tradeAssetKey(p));
        if (outgoingAsset) {
          return clearSessionTradeBlock({
            ...p,
            teamId: partnerTeam.id,
            retainedPct: outgoingAsset.retainedPct ?? p.retainedPct ?? 0,
          });
        }
        const incomingAsset = incomingByKey.get(tradeAssetKey(p));
        if (incomingAsset) {
          return clearSessionTradeBlock({
            ...p,
            teamId: homeTeam.id,
            retainedPct: incomingAsset.retainedPct ?? p.retainedPct ?? 0,
          });
        }
        return p;
      });

      const capMoves = buildTradeCapMoves(outgoingBlock, incomingBlock);

      const updatedTeams = prev.teams.map(team => {
        if (team.id === homeTeam.id) {
          return {
            ...team,
            capSpace: Math.round(applyCapDelta(team.capSpace, capMoves.home) * 10) / 10,
          };
        }
        if (team.id === partnerTeam.id) {
          return {
            ...team,
            capSpace: Math.round(applyCapDelta(team.capSpace, capMoves.partner) * 10) / 10,
          };
        }
        return team;
      });

      const teamCtxByOwner = new Map(updatedTeams.map(team => [team.id, team]));
      const playersWithDynamicPickValues = updatedPlayers.map(p => {
        if (p.position !== "Pick") return p;
        const owner = teamCtxByOwner.get(p.teamId);
        return {
          ...p,
          teamStanding: pickEffectiveStanding(teamWindow(owner), owner?.standing ?? p.teamStanding),
        };
      });

      // Preserve db metadata (capCeiling, etc.) — returning only {players,
      // teams} dropped the live cap ceiling after the first trade, so later
      // NAV/audits silently reverted to the static default (CX4).
      return { ...prev, players: playersWithDynamicPickValues, teams: updatedTeams };
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

    // Clear the blocks and verdict, and fully invalidate the simulation — the
    // roster just changed, so the old standings/bracket in simData are stale and
    // must not stay eligible for display or Cup-season recording (CX4). Clearing
    // only the narrative left simData behind.
    setBlocks([[], []]);
    setVerdict(null);
    simControlsRef.current?.resetSimulation();
  }, [homeTeam, partnerTeam, outgoingBlock, incomingBlock, setBlocks, setVerdict, setDb, cupRun, setCupRun, db.capCeiling, simControlsRef]);

  // ── Reset to original rosters ─────────────────────────────────
  // CX8 — retention slots are a LEAGUE rule (three slots, 50% a contract, a
  // share of the ceiling), not a Cup Run rule. The check was gated on an
  // active run, so in single-season play a user could retain 50% on any number
  // of players with nothing to stop them. The Cup Run ledger persists across
  // seasons; this one covers a single session, and both feed the same check.
  const [sessionRetention, setSessionRetention] = useState<RetentionEntry[]>([]);
  // Read through a ref so `executeTrade` always sees the current ledger without
  // taking it as a dependency — otherwise the callback is rebuilt after every
  // retained trade, and a stale closure would check against an old ledger and
  // let a fourth retention through.
  const sessionRetentionRef = useRef(sessionRetention);
  useEffect(() => { sessionRetentionRef.current = sessionRetention; }, [sessionRetention]);

  const resetTrades = useCallback(() => {
    if (originalDb) {
      clearNavCache();
      setDb(originalDb);
      setExecutedTrades([]);
      setSessionRetention([]);
      simControlsRef.current?.resetSimulation();
      // CXH2 — both halves of the lineup, not just the crease. Reset restores
      // the original database, so a hand-built forward group left behind here
      // was re-applied to a roster that no longer contained those players: the
      // sheet came back holding men the club had never traded for.
      setLineupStartingGoalies({});
      setLineupOrders({});
      setBlocks([[], []]);
      setVerdict(null);
      setHomeTeamLocked(false);
      setShowTeamSelect(true);
      offseasonResolvedRef.current = false;
    }
  }, [originalDb, setDb, setBlocks, setVerdict, setHomeTeamLocked, setShowTeamSelect, offseasonResolvedRef, simControlsRef]);

  return {
    executedTrades,
    setExecutedTrades,
    lineupStartingGoalies,
    setLineupStartingGoalies,
    lineupOrders,
    setLineupOrders,
    handleGoalieStarterChange,
    handleLineupChange,
    executeTrade,
    resetTrades,
  };
}
