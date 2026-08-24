"use client";
// ── Off-season flow — league FA resolution + the user's phases ──
// Owns the Armchair GM off-season: mode, the Draft Night / Re-Sign /
// Offer Sheet phase toggles, the user's pending FAs and both markets,
// and every roster/cap mutation those phases perform. The league-wide
// resolution runs exactly once per season (offseasonResolvedRef), and
// Cup Run rollovers reset that ref so year 2-3 re-resolve.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Asset, Team } from "@/app/lib/trade-types";
import { SEASON } from "@/app/lib/season-config";
import { scenarioSeed } from "@/app/lib/sim-engine";
import {
  resolveLeagueOffseason,
  applyOffseasonToRoster,
  movePendingToUfaMarket,
  projectFreeAgentContract,
  resolveOfferSheetCompensation,
  type OffseasonPending,
} from "@/app/lib/free-agency";
import { applyCapDelta, applyTeamCapDeltas } from "@/app/lib/cap-delta";
import { applyExtensions } from "@/app/lib/extensions";
import { clearNavCache } from "@/app/lib/evaluate-client";
import { cupRunOffseasonEntry, type CupRunState } from "@/app/lib/cup-run";
import {
  auditOffseasonPlayerStates,
  latestOffseasonStates,
  type OffseasonTransaction,
} from "@/app/lib/offseason-ledger";
import { normalizeName } from "@/app/lib/name-normalize";
import type { CupDraftSummary } from "./CupRunDraftSummaryModal";

type LeagueDb = { teams: Team[]; players: Asset[]; capCeiling?: number | null };

export function useOffseasonFlow({
  db,
  setDb,
  setOriginalDb,
  homeTeamId,
  showTeamSelect,
  initialNavReady,
  modeChosen,
  cupRun,
  cupDraftSummary,
}: {
  db: LeagueDb;
  setDb: React.Dispatch<React.SetStateAction<LeagueDb>>;
  setOriginalDb: (next: LeagueDb) => void;
  homeTeamId: string | undefined;
  showTeamSelect: boolean;
  initialNavReady: boolean;
  /** Single season or Cup Run — asked before the draft, so the offseason is
   *  played once for the mode the user actually wants (not replayed after). */
  modeChosen: boolean;
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
  const [offseasonBaseline, setOffseasonBaseline] = useState<Asset[]>([]);
  const [draftedPlayers, setDraftedPlayers] = useState<Asset[]>([]);
  const [offseasonTransactions, setOffseasonTransactions] = useState<OffseasonTransaction[]>([]);
  const offseasonResolvedRef = useRef(false);

  const appendTransactions = useCallback((entries: OffseasonTransaction[]) => {
    if (entries.length > 0) setOffseasonTransactions((previous) => [...previous, ...entries]);
  }, []);

  const offseasonDiagnostic = useMemo(() => {
    const latestStates = latestOffseasonStates(offseasonTransactions);
    return auditOffseasonPlayerStates({
      previous: offseasonBaseline,
      current: db.players,
      drafted: draftedPlayers,
      retainedRightsIds: userPending
        .filter((pending) => pending.contract.status === "RFA")
        .map((pending) => pending.player.id),
      rfaIds: rfaMarket.map((pending) => pending.player.id),
      ufaIds: [
        ...userPending.filter((pending) => pending.contract.status === "UFA"),
        ...market,
      ].map((pending) => pending.player.id),
      signedElsewhereIds: [...latestStates]
        .filter(([, state]) => state === "SIGNED_ELSEWHERE")
        .map(([playerId]) => playerId),
    });
  }, [db.players, draftedPlayers, market, offseasonBaseline, offseasonTransactions, rfaMarket, userPending]);

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
      capFloor: SEASON.capFloor,
      teams: db.teams,
    });
    setOffseasonBaseline(db.players);
    setDraftedPlayers([]);
    setOffseasonTransactions(res.transactions);
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
    appendTransactions([{
      playerId: fa.player.id,
      playerName: fa.player.name,
      kind: "RE_SIGNED",
      state: "ROSTER",
      fromTeamId: fa.player.teamId,
      toTeamId: fa.player.teamId,
      detail: `Re-signed with ${fa.player.teamId} for ${fa.contract.term} year${fa.contract.term === 1 ? "" : "s"} at $${fa.contract.aav.toFixed(2)}M`,
    }]);
    clearNavCache();
  }, [appendTransactions, setDb]);

  // Extend a player who still has a year left. No cap effect now — the deal
  // starts when the current one ends, so only the horizon changes (OFF5).
  const extendPlayer = useCallback((
    player: Asset,
    extension: { aav: number; term: number; wouldHaveBeen: "UFA" | "RFA" },
  ) => {
    setDb((prev) => ({
      ...prev,
      players: applyExtensions(prev.players, [
        { playerId: player.id, teamId: player.teamId, extension },
      ]),
    }));
    appendTransactions([{
      playerId: player.id,
      playerName: player.name,
      kind: "EXTENDED",
      state: "ROSTER",
      fromTeamId: player.teamId,
      toTeamId: player.teamId,
      detail: `Extended by ${player.teamId} for ${extension.term} year${extension.term === 1 ? "" : "s"} at $${extension.aav.toFixed(2)}M`,
    }]);
    clearNavCache();
  }, [appendTransactions, setDb]);

  // Let a pending free agent walk — opens a roster hole and drops him into
  // the open market. Cap already freed at phase start.
  const walkPlayer = useCallback((fa: OffseasonPending) => {
    const marketFa = movePendingToUfaMarket(fa);
    setDb(prev => ({
      ...prev,
      players: prev.players.map((player) => player.id === fa.player.id ? marketFa.player : player),
    }));
    setUserPending(prev => prev.filter(p => p.player.id !== fa.player.id));
    setMarket(prev => [marketFa, ...prev.filter((pending) => pending.player.id !== fa.player.id)]);
    appendTransactions([{
      playerId: fa.player.id,
      playerName: fa.player.name,
      kind: "ENTERED_MARKET",
      state: "UFA",
      fromTeamId: fa.player.teamId,
      toTeamId: "FA_POOL",
      detail: `Rights surrendered by ${fa.player.teamId}; entered the unrestricted market`,
    }]);
    clearNavCache();
  }, [appendTransactions, setDb]);

  // Release a signed player — clean release frees his full cap hit and moves
  // him to the UFA pool (no dead-cap retention, no deletion from the league).
  const dropPlayer = useCallback((player: Asset) => {
    const releasedPlayer: Asset = {
      ...player,
      teamId: "FA_POOL",
      retainedPct: 0,
      yearsRemaining: 0,
      expiresThisOffseason: true,
      contractStatus: "UFA",
      expiryStatus: "UFA",
    };
    const projected = projectFreeAgentContract(releasedPlayer, {
      seed: scenarioSeed({ release: player.id, season: SEASON.label }),
      capCeiling: db.capCeiling ?? SEASON.capCeiling,
    });
    const releasedFa: OffseasonPending = {
      player: releasedPlayer,
      contract: { ...projected, status: "UFA", term: Math.min(projected.term, 7) },
    };
    setDb(prev => ({
      ...prev,
      players: prev.players.map((candidate) => candidate.id === player.id ? releasedPlayer : candidate),
      teams: prev.teams.map(t =>
        t.id === player.teamId
          ? { ...t, capSpace: Math.round(applyCapDelta(t.capSpace, { outgoing: [{ capHit: player.capHit }] }) * 10) / 10 }
          : t),
    }));
    setMarket((previous) => [releasedFa, ...previous.filter((pending) => pending.player.id !== player.id)]);
    appendTransactions([{
      playerId: player.id,
      playerName: player.name,
      kind: "RELEASED",
      state: "UFA",
      fromTeamId: player.teamId,
      toTeamId: "FA_POOL",
      detail: `Released by ${player.teamId}; entered the unrestricted market`,
    }]);
    clearNavCache();
  }, [appendTransactions, db.capCeiling, setDb]);

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
    const previousTeamId = offseasonBaseline.find((player) => player.id === fa.player.id)?.teamId
      ?? fa.player.teamId;
    appendTransactions([{
      playerId: fa.player.id,
      playerName: fa.player.name,
      kind: "SIGNED",
      state: previousTeamId === homeTeamId ? "ROSTER" : "SIGNED_ELSEWHERE",
      fromTeamId: previousTeamId,
      toTeamId: homeTeamId,
      detail: `Signed with ${homeTeamId} for ${fa.contract.term} year${fa.contract.term === 1 ? "" : "s"} at $${fa.contract.aav.toFixed(2)}M`,
    }]);
    clearNavCache();
  }, [appendTransactions, homeTeamId, offseasonBaseline, setDb]);

  // Re-sign phase done — auto-walk any remaining pending FAs (cap already
  // freed at phase start), then open offer sheet phase for other teams' RFAs.
  const proceedToOfferSheets = useCallback(() => {
    if (userPending.length > 0) {
      const walked = userPending.map(movePendingToUfaMarket);
      const byId = new Map(walked.map((pending) => [pending.player.id, pending.player]));
      setDb(dbPrev => ({
        ...dbPrev,
        players: dbPrev.players.map((player) => byId.get(player.id) ?? player),
      }));
      setMarket((previous) => [
        ...walked,
        ...previous.filter((pending) => !byId.has(pending.player.id)),
      ]);
      appendTransactions(userPending.map((fa) => ({
        playerId: fa.player.id,
        playerName: fa.player.name,
        kind: "ENTERED_MARKET",
        state: "UFA",
        fromTeamId: fa.player.teamId,
        toTeamId: "FA_POOL",
        detail: `Rights surrendered by ${fa.player.teamId}; entered the unrestricted market`,
      })));
      clearNavCache();
    }
    setUserPending([]);
    setResignOpen(false);
    setOfferSheetOpen(true);
  }, [appendTransactions, setDb, userPending]);

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
    appendTransactions([{
      playerId: fa.player.id,
      playerName: fa.player.name,
      kind: "SIGNED",
      state: "SIGNED_ELSEWHERE",
      fromTeamId: originalTeamId,
      toTeamId: homeTeamId,
      detail: `Offer sheet accepted: ${originalTeamId} to ${homeTeamId} at $${fa.contract.aav.toFixed(2)}M`,
    }]);
    clearNavCache();
  }, [appendTransactions, homeTeamId, db.players, setDb]);

  // Draft Night runs inside this same offseason. Only genuinely new identities
  // join the right side of the equation; a diacritic-normalized roster prospect
  // is enriched in place by reconcileDraftedRookies and is not counted twice.
  const recordDraftedPlayers = useCallback((rookies: Asset[]) => {
    const knownIds = new Set([...offseasonBaseline, ...draftedPlayers].map((player) => player.id));
    const knownNames = new Set([...offseasonBaseline, ...draftedPlayers].map((player) => normalizeName(player.name)));
    const additions: Asset[] = [];
    for (const rookie of rookies) {
      const name = normalizeName(rookie.name);
      if (knownIds.has(rookie.id) || knownNames.has(name)) continue;
      knownIds.add(rookie.id);
      knownNames.add(name);
      additions.push(rookie);
    }
    if (additions.length === 0) return;
    setDraftedPlayers((previous) => [...previous, ...additions]);
    appendTransactions(additions.map((rookie) => ({
      playerId: rookie.id,
      playerName: rookie.name,
      kind: "DRAFTED",
      state: "ROSTER",
      toTeamId: rookie.teamId,
      detail: `Drafted by ${rookie.teamId}${rookie.draftOverall ? ` at #${rookie.draftOverall}` : ""}`,
    })));
  }, [appendTransactions, draftedPlayers, offseasonBaseline]);

  // A future-draft board choice swaps synthetic player ids while keeping the
  // same draft slots. Replace those identities in the captured baseline so the
  // live free-agency audit does not mistake a user selection for a disappearance.
  const reconcileDraftSelections = useCallback((selections: Asset[]) => {
    const draftedSelections = selections.filter((player) =>
      player.draftYear != null && player.draftOverall != null);
    if (draftedSelections.length === 0) return;
    const bySlot = new Map(draftedSelections.map((player) => [
      `${player.draftYear}:${player.draftOverall}`,
      player,
    ]));
    setOffseasonBaseline((previous) => previous.map((player) =>
      bySlot.get(`${player.draftYear ?? ""}:${player.draftOverall ?? ""}`) ?? player));
    appendTransactions(draftedSelections.map((player) => ({
      playerId: player.id,
      playerName: player.name,
      kind: "DRAFTED",
      state: "ROSTER",
      toTeamId: player.teamId,
      detail: `Draft board selection finalized by ${player.teamId}${player.draftOverall ? ` at #${player.draftOverall}` : ""}`,
    })));
  }, [appendTransactions]);

  // Commit the off-season as the new baseline and open the trade flow.
  const finishOffseason = useCallback(() => {
    setOfferSheetOpen(false);
    setOriginalDb(db);
  }, [db, setOriginalDb]);

  // Trigger the league off-season once a franchise is chosen in off-season mode.
  useEffect(() => {
    if (mode === "offseason" && homeTeamId && !showTeamSelect && initialNavReady && modeChosen && !offseasonResolvedRef.current) {
      applyLeagueOffseason();
    }
  }, [mode, homeTeamId, showTeamSelect, initialNavReady, modeChosen, applyLeagueOffseason]);

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
    offseasonTransactions,
    offseasonDiagnostic,
    offseasonResolvedRef,
    resignPlayer,
    extendPlayer,
    walkPlayer,
    dropPlayer,
    signMarketPlayer,
    proceedToOfferSheets,
    signOfferSheet,
    recordDraftedPlayers,
    reconcileDraftSelections,
    finishOffseason,
  };
}
