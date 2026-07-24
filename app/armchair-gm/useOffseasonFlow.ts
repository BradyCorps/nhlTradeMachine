"use client";
// ── Off-season flow — league FA resolution + the user's phases ──
// Owns the Armchair GM off-season: mode, the Draft Night / Re-Sign /
// Offer Sheet phase toggles, the user's pending FAs and both markets,
// and every roster/cap mutation those phases perform. The league-wide
// resolution runs exactly once per season (offseasonResolvedRef), and
// Cup Run rollovers reset that ref so year 2-3 re-resolve.
import React, { useState, useEffect, useCallback, useRef } from "react";
import type { Asset, Team } from "@/app/lib/trade-types";
import { SEASON } from "@/app/lib/season-config";
import { scenarioSeed } from "@/app/lib/sim-engine";
import { resolveLeagueOffseason, applyOffseasonToRoster, resolveOfferSheetCompensation, type OffseasonPending } from "@/app/lib/free-agency";
import { applyCapDelta, applyTeamCapDeltas } from "@/app/lib/cap-delta";
import { clearNavCache } from "@/app/lib/evaluate-client";
import { cupRunOffseasonEntry, type CupRunState } from "@/app/lib/cup-run";
import type { CupDraftSummary } from "./CupRunDraftSummaryModal";

type LeagueDb = { teams: Team[]; players: Asset[]; capCeiling?: number | null };

export function useOffseasonFlow({
  db,
  setDb,
  setOriginalDb,
  homeTeamId,
  showTeamSelect,
  initialNavReady,
  cupRun,
  cupDraftSummary,
}: {
  db: LeagueDb;
  setDb: React.Dispatch<React.SetStateAction<LeagueDb>>;
  setOriginalDb: (next: LeagueDb) => void;
  homeTeamId: string | undefined;
  showTeamSelect: boolean;
  initialNavReady: boolean;
  cupRun: CupRunState | null;
  cupDraftSummary: CupDraftSummary | null;
}) {
  const [mode, setMode] = useState<"offseason" | "inseason">("offseason");
  const [draftOpen, setDraftOpen] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  const [offerSheetOpen, setOfferSheetOpen] = useState(false);
  const [userPending, setUserPending] = useState<OffseasonPending[]>([]);
  const [market, setMarket] = useState<OffseasonPending[]>([]);
  const [rfaMarket, setRfaMarket] = useState<OffseasonPending[]>([]);
  const offseasonResolvedRef = useRef(false);

  // ── Off-Season: resolve the league's pending free agents (once) ──
  // Auto-handles the other 31 teams (re-signs / walks) and sets the user's own
  // pending free agents aside for the manual Re-Sign phase. Mirrors the
  // executeTrade roster/cap mutation pattern.
  const applyLeagueOffseason = useCallback(() => {
    if (offseasonResolvedRef.current || !homeTeamId) return;
    offseasonResolvedRef.current = true;

    const seed = scenarioSeed({ offseason: homeTeamId, season: SEASON.label });
    const res = resolveLeagueOffseason(db.players, {
      seed,
      userTeamId: homeTeamId,
      capCeiling: db.capCeiling ?? SEASON.capCeiling,
      teams: db.teams,
    });
    setUserPending(res.userPending);
    setMarket(res.market);
    setRfaMarket(res.rfaMarket);

    setDb(prev => {
      // Walked-to-market players are relocated to the FA pool, not deleted, so
      // they keep a NAV and stay signable across the offseason (CXH3 / AI3).
      const players = applyOffseasonToRoster(prev.players, res);
      const teams = applyTeamCapDeltas(prev.teams, res.teamCapMoves)
        .map(t => ({ ...t, capSpace: Math.round(t.capSpace * 10) / 10 }));

      // Free pending FAs' expiring contracts from the user's cap upfront so
      // the re-sign phase shows true available space (like real NHL July 1).
      const pendingCap = res.userPending.reduce(
        (sum, fa) => sum + (fa.player.lastCapHit ?? fa.player.capHit), 0);
      if (pendingCap > 0 && homeTeamId) {
        const idx = teams.findIndex(t => t.id === homeTeamId);
        if (idx >= 0) {
          teams[idx] = { ...teams[idx], capSpace: Math.round((teams[idx].capSpace + pendingCap) * 10) / 10 };
        }
      }

      return { ...prev, players, teams };
    });
    clearNavCache();
    // Draft Night runs first, then the Re-Sign phase. In Cup Run years 2-3
    // the draft has already been resolved at rollover from the new standings,
    // so show that summary popup and then continue to re-signing. If no summary
    // exists (defensive fallback), still open re-signing so 0-year contracts
    // cannot stay parked on the roster.
    const entry = cupRunOffseasonEntry(cupRun, Boolean(cupDraftSummary));
    if (entry === "DRAFT_NIGHT") {
      setDraftOpen(true);
    } else if (entry === "DRAFT_SUMMARY") {
      setDraftOpen(false);
      setResignOpen(false);
    } else {
      setDraftOpen(false);
      setResignOpen(true);
    }
  }, [db.players, db.teams, db.capCeiling, homeTeamId, cupRun, cupDraftSummary, setDb]);

  // Re-sign one of your pending free agents at the projected terms.
  // Old salary was already freed from cap at phase start, so only deduct
  // the new AAV.
  const resignPlayer = useCallback((fa: OffseasonPending) => {
    setDb(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === fa.player.id
          ? { ...p, capHit: fa.contract.aav, yearsRemaining: fa.contract.term, expiresThisOffseason: false, contractStatus: "SIGNED" as const }
          : p),
      teams: prev.teams.map(t =>
        t.id === fa.player.teamId
          ? { ...t, capSpace: Math.round(applyCapDelta(t.capSpace, { incoming: [{ capHit: fa.contract.aav }] }) * 10) / 10 }
          : t),
    }));
    setUserPending(prev => prev.filter(p => p.player.id !== fa.player.id));
    clearNavCache();
  }, [setDb]);

  // Let a pending free agent walk — opens a roster hole and drops him into
  // the open market. Cap already freed at phase start.
  const walkPlayer = useCallback((fa: OffseasonPending) => {
    setDb(prev => ({
      ...prev,
      players: prev.players.filter(p => p.id !== fa.player.id),
    }));
    setUserPending(prev => prev.filter(p => p.player.id !== fa.player.id));
    setMarket(prev => [{ player: fa.player, contract: fa.contract }, ...prev]);
    clearNavCache();
  }, [setDb]);

  // Release a signed player — clean release frees his full cap hit and removes
  // him from the roster (no dead-cap retention).
  const dropPlayer = useCallback((player: Asset) => {
    setDb(prev => ({
      ...prev,
      players: prev.players.filter(p => p.id !== player.id),
      teams: prev.teams.map(t =>
        t.id === player.teamId
          ? { ...t, capSpace: Math.round(applyCapDelta(t.capSpace, { outgoing: [{ capHit: player.capHit }] }) * 10) / 10 }
          : t),
    }));
    clearNavCache();
  }, [setDb]);

  // Sign a free agent off the open market onto your roster.
  const signMarketPlayer = useCallback((fa: OffseasonPending) => {
    if (!homeTeamId) return;
    setDb(prev => {
      const signed: Asset = {
        ...fa.player, teamId: homeTeamId, capHit: fa.contract.aav, yearsRemaining: fa.contract.term,
        retainedPct: 0, expiresThisOffseason: false, contractStatus: "SIGNED",
      };
      return {
        ...prev,
        players: [...prev.players.filter(p => p.id !== fa.player.id), signed],
        teams: prev.teams.map(t =>
          t.id === homeTeamId
            ? { ...t, capSpace: Math.round(applyCapDelta(t.capSpace, { incoming: [{ capHit: fa.contract.aav }] }) * 10) / 10 }
            : t),
      };
    });
    setMarket(prev => prev.filter(p => p.player.id !== fa.player.id));
    clearNavCache();
  }, [homeTeamId, setDb]);

  // Re-sign phase done — auto-walk any remaining pending FAs (cap already
  // freed at phase start), then open offer sheet phase for other teams' RFAs.
  const proceedToOfferSheets = useCallback(() => {
    setUserPending(prev => {
      if (prev.length > 0) {
        const walkIds = new Set(prev.map(fa => fa.player.id));
        setDb(dbPrev => ({
          ...dbPrev,
          players: dbPrev.players.filter(p => !walkIds.has(p.id)),
        }));
        setMarket(m => [...prev.map(fa => ({ player: fa.player, contract: fa.contract })), ...m]);
        clearNavCache();
      }
      return [];
    });
    setResignOpen(false);
    setOfferSheetOpen(true);
  }, [setDb]);

  // Sign an RFA via offer sheet: move player to the user's roster; the
  // compensation picks CONVEY to the original club (not deleted), and the
  // original club frees the RFA's current cap hit (the already-expired old deal
  // is not added back — CX6).
  const signOfferSheet = useCallback((fa: OffseasonPending, compensation: string[]) => {
    if (!homeTeamId) return;
    const originalTeamId = fa.player.teamId;
    const { transferPickIds } = resolveOfferSheetCompensation(homeTeamId, db.players, compensation);
    const transferSet = new Set(transferPickIds);

    setDb(prev => {
      const signed: Asset = {
        ...fa.player, teamId: homeTeamId, capHit: fa.contract.aav, yearsRemaining: fa.contract.term,
        retainedPct: 0, expiresThisOffseason: false, contractStatus: "SIGNED",
      };
      return {
        ...prev,
        players: prev.players
          .filter(p => p.id !== fa.player.id)
          // Compensation picks convey to the original club instead of vanishing.
          .map(p => transferSet.has(p.id) ? { ...p, teamId: originalTeamId } : p)
          .concat(signed),
        teams: prev.teams.map(t =>
          t.id === homeTeamId
            ? { ...t, capSpace: Math.round(applyCapDelta(t.capSpace, { incoming: [{ capHit: fa.contract.aav }] }) * 10) / 10 }
            : t.id === originalTeamId
              ? { ...t, capSpace: Math.round(applyCapDelta(t.capSpace, { outgoing: [{ capHit: fa.contract.aav }] }) * 10) / 10 }
              : t),
      };
    });
    setRfaMarket(prev => prev.filter(p => p.player.id !== fa.player.id));
    clearNavCache();
  }, [homeTeamId, db.players, setDb]);

  // Commit the off-season as the new baseline and open the trade flow.
  const finishOffseason = useCallback(() => {
    setOfferSheetOpen(false);
    setOriginalDb(db);
  }, [db, setOriginalDb]);

  // Trigger the league off-season once a franchise is chosen in off-season mode.
  useEffect(() => {
    if (mode === "offseason" && homeTeamId && !showTeamSelect && initialNavReady && !offseasonResolvedRef.current) {
      applyLeagueOffseason();
    }
  }, [mode, homeTeamId, showTeamSelect, initialNavReady, applyLeagueOffseason]);

  return {
    mode,
    setMode,
    draftOpen,
    setDraftOpen,
    resignOpen,
    setResignOpen,
    offerSheetOpen,
    setOfferSheetOpen,
    userPending,
    market,
    rfaMarket,
    offseasonResolvedRef,
    resignPlayer,
    walkPlayer,
    dropPlayer,
    signMarketPlayer,
    proceedToOfferSheets,
    signOfferSheet,
    finishOffseason,
  };
}
