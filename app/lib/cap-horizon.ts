// ── Cap horizon — what a signing costs you LATER ─────────────────
//
// The offseason had no future tense. Every decision was judged against one
// number — this season's cap space — so signing a $12M winger read as "fits"
// even when it guaranteed you could not extend your own top-pair defenceman two
// summers later. The consequence existed; nothing showed it.
//
// This projects committed money forward across the seasons a Cup Run actually
// spans, and names the contracts that end in each of them: the money is only
// half the story, since space in 2028-29 means nothing if the player it has to
// re-sign is the one expiring that summer.
//
// Pure. `capForCupYear`/`projectedCapCeiling` supply the ceilings, so the
// escalator lives in season-config and not in two places.

import { projectedCapCeiling } from "./season-config";
import { effectiveCapHit } from "./cap-delta";

export interface HorizonPlayer {
  id: string;
  name: string;
  position?: string;
  capHit?: number;
  retainedPct?: number;
  /** Seasons still to be played INCLUDING the upcoming one. 0 = expiring now. */
  yearsRemaining?: number;
  expiryStatus?: string | null;
  teamId?: string;
  /** Signed early; takes over when the current deal runs out (OFF5). */
  pendingExtension?: { aav: number; term: number } | null;
}

export interface HorizonContract {
  id: string;
  name: string;
  position?: string;
  /** Cap charge in this season, after retention. */
  capHit: number;
  /** True when this is the last season of the deal. */
  expiresAfter: boolean;
  expiryStatus: string | null;
}

export interface HorizonSeason {
  /** 0 = the season being entered. */
  offset: number;
  label: string;
  ceiling: number;
  committed: number;
  space: number;
  /** Contracts on the books this season. */
  contracts: HorizonContract[];
  /** Deals ending after this season — next summer's decisions. */
  expiring: HorizonContract[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "2026-27" for the season `offset` years after `startYear`. */
export function horizonSeasonLabel(startYear: number, offset: number): string {
  const y = startYear + offset;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/**
 * Project one team's cap commitments forward.
 *
 * A contract with `yearsRemaining` N covers offsets 0..N-1, so it is on the
 * books in season `offset` when `yearsRemaining > offset`, and it ends after the
 * season where `yearsRemaining === offset + 1`. Picks and unsigned players carry
 * no charge.
 */
export function buildCapHorizon(
  players: HorizonPlayer[],
  opts: {
    teamId: string;
    startYear: number;
    seasons?: number;
    /** Override the ceiling per offset; defaults to the league projection. */
    ceilingFor?: (offset: number) => number;
  },
): HorizonSeason[] {
  const { teamId, startYear, seasons = 3, ceilingFor = projectedCapCeiling } = opts;
  const roster = players.filter(p =>
    p.teamId === teamId && p.position !== "Pick"
    && ((p.yearsRemaining ?? 0) > 0 || p.pendingExtension));

  // An extension is invisible to today's cap and lands in the seasons after the
  // current deal ends. Showing it is the entire reason the horizon exists.
  const chargeFor = (p: HorizonPlayer, offset: number): number | null => {
    const years = p.yearsRemaining ?? 0;
    if (offset < years) return effectiveCapHit(p);
    const ext = p.pendingExtension;
    if (!ext) return null;
    return offset < years + ext.term ? ext.aav : null;
  };
  const endsAfter = (p: HorizonPlayer, offset: number): boolean => {
    const years = p.yearsRemaining ?? 0;
    const ext = p.pendingExtension;
    return ext ? years + ext.term === offset + 1 : years === offset + 1;
  };

  return Array.from({ length: seasons }, (_, offset) => {
    const contracts: HorizonContract[] = roster
      .filter(p => chargeFor(p, offset) != null)
      .map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        capHit: round1(chargeFor(p, offset)!),
        expiresAfter: endsAfter(p, offset),
        expiryStatus: p.expiryStatus ?? null,
      }))
      .sort((a, b) => b.capHit - a.capHit || a.name.localeCompare(b.name));

    // Sum the UNROUNDED hits, then round once. Summing per-contract rounded
    // values compounds the error across a 20-man roster. Space is then derived
    // from the rounded total so the column adds up as displayed.
    const committed = round1(roster
      .reduce((sum, p) => sum + (chargeFor(p, offset) ?? 0), 0));
    const ceiling = ceilingFor(offset);
    return {
      offset,
      label: horizonSeasonLabel(startYear, offset),
      ceiling,
      committed,
      space: round1(ceiling - committed),
      contracts,
      expiring: contracts.filter(c => c.expiresAfter),
    };
  });
}

/**
 * The horizon as it would look after adding one contract.
 *
 * This is the whole point of the view: sign a six-year deal today and watch the
 * season your own pending extension falls due lose its room.
 */
export function withProjectedSigning(
  horizon: HorizonSeason[],
  signing: { id: string; name: string; aav: number; term: number; position?: string },
): HorizonSeason[] {
  return horizon.map(season => {
    if (signing.term <= season.offset) return season;
    const contract: HorizonContract = {
      id: signing.id,
      name: signing.name,
      position: signing.position,
      capHit: round1(signing.aav),
      expiresAfter: signing.term === season.offset + 1,
      expiryStatus: null,
    };
    const contracts = [...season.contracts, contract]
      .sort((a, b) => b.capHit - a.capHit || a.name.localeCompare(b.name));
    const committed = round1(season.committed + contract.capHit);
    return {
      ...season,
      contracts,
      committed,
      space: round1(season.ceiling - committed),
      expiring: contracts.filter(c => c.expiresAfter),
    };
  });
}

/**
 * The horizon a team would carry AFTER a trade.
 *
 * A trade machine that only reports this season's cap delta cannot tell a
 * one-year rental from five years of term — the two look identical today and
 * nothing alike in 2028-29. Outgoing contracts leave the books entirely;
 * incoming ones arrive with their remaining term and any retention already
 * applied by the sending club.
 */
export function withProjectedTrade(
  players: HorizonPlayer[],
  opts: {
    teamId: string;
    startYear: number;
    seasons?: number;
    ceilingFor?: (offset: number) => number;
    incoming?: HorizonPlayer[];
    outgoing?: HorizonPlayer[];
  },
): HorizonSeason[] {
  const { incoming = [], outgoing = [], ...rest } = opts;
  const leaving = new Set(outgoing.map(p => p.id));
  const after = [
    ...players.filter(p => !leaving.has(p.id)),
    // Retag to the acquiring club so the horizon's own team filter keeps them.
    ...incoming.filter(p => p.position !== "Pick").map(p => ({ ...p, teamId: opts.teamId })),
  ];
  return buildCapHorizon(after, rest);
}

/**
 * The first season a signing would put the team over the ceiling, or null.
 * Used to warn at the point of decision rather than two summers later.
 */
export function firstSeasonOverCap(horizon: HorizonSeason[]): HorizonSeason | null {
  return horizon.find(s => s.space < 0) ?? null;
}
