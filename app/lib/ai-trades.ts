// ── AI cap-clearing offseason trades (OFF7) ──────────────────────
//
// Every club in the league resolves its own free agency, and some of them come
// out of it over the ceiling. Until now nothing happened next: an AI club could
// sit $6M over the cap all season and the simulation ran anyway, so the one
// constraint the whole app is about applied to the user and to nobody else.
//
// This closes that. A club that cannot be cap-legal sheds salary — but only
// into a trade a real front office would make, which is the harder half. The
// failure mode to avoid is not "too few trades", it is a league that quietly
// launders its best players into whoever had room.
//
// Six rules do that work, and each exists because of a specific bad trade it
// prevents:
//
//   1. Only a club that is actually over the ceiling trades. Cap relief is the
//      motive; without a motive this is just shuffling the league.
//   2. The buyer must WANT the player — `blockFitsTeam`, the same scorer the
//      Partner Finder uses, above a real threshold. A rebuilding club does not
//      absorb a 34-year-old because it happened to have room.
//   3. A club does not dump its best players. The top of the roster by lineup
//      contribution is protected, so a cap crunch costs you a middle piece.
//   4. The smallest move that solves the problem wins. Shedding $9M to fix a
//      $2M overage is not cap management.
//   5. A body comes back. Without a return the seller's roster shrinks every
//      offseason, and across a three-year Cup Run clubs run out of players —
//      this is structural, not just cosmetic realism.
//   6. Neither club may end up outside the payroll range. Checked with
//      `findCapBreaches`, the same rule the trade audit applies to the user.
//
// Deterministic by construction: clubs, candidates and partners are all held in
// a total order, so the same league state yields the same trades. No seeded
// RNG, because "which trades happened" should be a fact about the league rather
// than a roll.

import type { Asset, Team } from "./trade-types";
import { blockFitsTeam } from "./trade-logic";
import { lineupContributionScore } from "./lineup-ranking";
import { findCapBreaches, type CapLimits } from "./cap-limits";

export const AI_TRADE_RULES = {
  /**
   * Fit below this and the buyer has no reason beyond having room.
   *
   * Calibrated against `blockFitsTeam` rather than picked: measured on a deep
   * roster it returns ~38 for a club with the room, the right phase and the
   * right age profile, 8 when the age is wrong for the phase, and 3 when there
   * is no room. Thirty admits the first and rejects the other two, and rises
   * to ~58 when the club is genuinely thin at the position.
   */
  MIN_FIT_SCORE: 30,
  /** Below this cap hit, moving a player is not cap management. */
  MIN_CAP_HIT: 1.5,
  /** Top-of-roster players a club will not move to solve a cap problem. */
  PROTECTED_CORE: 6,
  /** A club sheds at most this many players in one offseason. */
  MAX_OUT_PER_TEAM: 1,
  /**
   * And absorbs at most this many. A rebuilding club with $40M of room would
   * otherwise become the league's waste-disposal site in a single July.
   */
  MAX_IN_PER_TEAM: 2,
  /** League-wide ceiling on a single offseason's AI trades. */
  MAX_TRADES: 8,
  /** The return piece must cost well less than the player leaving. */
  MAX_RETURN_FRACTION: 0.5,
} as const;

export interface AiTrade {
  fromTeamId: string;
  toTeamId: string;
  /** Player leaving the cap-stressed club. */
  outPlayerId: string;
  outPlayerName: string;
  /** Body coming back, so neither roster shrinks. */
  inPlayerId: string;
  inPlayerName: string;
  capSaved: number;
  fitScore: number;
  reason: string;
}

const effectiveCap = (a: Asset): number => (a.capHit ?? 0) * (1 - (a.retainedPct ?? 0));

/** Movable at all: a real contract, no full no-move, not flagged untouchable. */
function isMovable(p: Asset): boolean {
  if (p.position === "Pick") return false;
  if (p.hasNMC) return false;
  if (p.tradeBlockStatus === "untouchable") return false;
  return true;
}

/** Total order, so which trades happen never depends on iteration accidents. */
function byId(a: Asset, b: Asset): number {
  return a.id.localeCompare(b.id);
}

export interface AiTradeContext {
  teams: Team[];
  /** Cap space per club AFTER free agency has resolved. */
  capSpace: Map<string, number>;
  limits: CapLimits;
  /** The user's club is the user's business. */
  userTeamId?: string | null;
}

export function resolveAiTrades(players: Asset[], ctx: AiTradeContext): AiTrade[] {
  const { teams, limits, userTeamId } = ctx;
  const capSpace = new Map(ctx.capSpace);
  const trades: AiTrade[] = [];
  const movedIds = new Set<string>();
  const sentOutBy = new Map<string, number>();
  const takenInBy = new Map<string, number>();

  const rosterOf = (teamId: string) =>
    players.filter(p => p.teamId === teamId && p.position !== "Pick" && !movedIds.has(p.id));

  // Clubs in a fixed order, most over the cap first — the club in the deepest
  // trouble gets first pick of the partners with room.
  const overCap = teams
    .filter(t => t.id !== userTeamId && (capSpace.get(t.id) ?? 0) < 0)
    .sort((a, b) => (capSpace.get(a.id) ?? 0) - (capSpace.get(b.id) ?? 0)
      || a.id.localeCompare(b.id));

  for (const seller of overCap) {
    if (trades.length >= AI_TRADE_RULES.MAX_TRADES) break;
    if ((sentOutBy.get(seller.id) ?? 0) >= AI_TRADE_RULES.MAX_OUT_PER_TEAM) continue;

    const shortfall = -(capSpace.get(seller.id) ?? 0);
    if (shortfall <= 0) continue;

    const sellerRoster = rosterOf(seller.id);
    // Rule 3 — the core is not for sale to fix a cap problem.
    const protectedIds = new Set(
      [...sellerRoster]
        .sort((a, b) => lineupContributionScore(b) - lineupContributionScore(a) || byId(a, b))
        .slice(0, AI_TRADE_RULES.PROTECTED_CORE)
        .map(p => p.id),
    );

    // Rule 4 — the smallest contract that covers the shortfall, then next
    // smallest. Sorting by cap hit ascending means the club sheds what it must
    // rather than the first name it happens to look at.
    const candidates = sellerRoster
      .filter(p => isMovable(p) && !protectedIds.has(p.id)
        && effectiveCap(p) >= AI_TRADE_RULES.MIN_CAP_HIT)
      .sort((a, b) => effectiveCap(a) - effectiveCap(b) || byId(a, b));

    const solves = candidates.filter(p => effectiveCap(p) >= shortfall);
    const ordered = solves.length > 0 ? solves : [...candidates].reverse();

    const trade = firstViableTrade(seller, ordered, {
      teams, players, capSpace, limits, userTeamId, movedIds, rosterOf, takenInBy,
    });
    if (!trade) continue;

    trades.push(trade);
    movedIds.add(trade.outPlayerId);
    movedIds.add(trade.inPlayerId);
    sentOutBy.set(seller.id, (sentOutBy.get(seller.id) ?? 0) + 1);
    takenInBy.set(trade.toTeamId, (takenInBy.get(trade.toTeamId) ?? 0) + 1);
    capSpace.set(seller.id, (capSpace.get(seller.id) ?? 0) + trade.capSaved);
    capSpace.set(trade.toTeamId, (capSpace.get(trade.toTeamId) ?? 0) - trade.capSaved);
  }

  return trades;
}

function firstViableTrade(
  seller: Team,
  candidates: Asset[],
  s: {
    teams: Team[];
    players: Asset[];
    capSpace: Map<string, number>;
    limits: CapLimits;
    userTeamId?: string | null;
    movedIds: Set<string>;
    rosterOf: (teamId: string) => Asset[];
    takenInBy: Map<string, number>;
  },
): AiTrade | null {
  const buyers = s.teams
    .filter(t => t.id !== seller.id && t.id !== s.userTeamId
      && (s.takenInBy.get(t.id) ?? 0) < AI_TRADE_RULES.MAX_IN_PER_TEAM)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const outPlayer of candidates) {
    const outCap = effectiveCap(outPlayer);

    // Rule 2 — score every club, take the one that most wants him. Ties break
    // on id so the winner is a property of the league, not of array order.
    const ranked = buyers
      .map(buyer => ({
        buyer,
        roster: s.rosterOf(buyer.id),
        fit: blockFitsTeam(
          { ...buyer, capSpace: s.capSpace.get(buyer.id) ?? 0 },
          [outPlayer],
          s.rosterOf(buyer.id),
          {},
        ),
      }))
      .filter(x => x.fit >= AI_TRADE_RULES.MIN_FIT_SCORE)
      .sort((a, b) => b.fit - a.fit || a.buyer.id.localeCompare(b.buyer.id));

    for (const { buyer, roster, fit } of ranked) {
      // Rule 5 — a body comes back, and it has to be cheap enough that the
      // seller actually saves money.
      const returnPiece = roster
        .filter(p => isMovable(p) && !s.movedIds.has(p.id)
          && effectiveCap(p) <= outCap * AI_TRADE_RULES.MAX_RETURN_FRACTION)
        .sort((a, b) => effectiveCap(b) - effectiveCap(a) || byId(a, b))[0];
      if (!returnPiece) continue;

      const capSaved = outCap - effectiveCap(returnPiece);
      if (capSaved <= 0) continue;

      // Rule 6 — the same payroll-range rule the user's trades are held to.
      const breaches = findCapBreaches([
        { teamName: seller.name, side: 0,
          capSpaceBefore: s.capSpace.get(seller.id) ?? 0, capDelta: -capSaved },
        { teamName: buyer.name, side: 1,
          capSpaceBefore: s.capSpace.get(buyer.id) ?? 0, capDelta: capSaved },
      ], s.limits);
      // The seller may still be over after the move — it was over before, and
      // a partial fix is progress. What it may not do is breach the FLOOR, or
      // push the buyer through the ceiling.
      const blocking = breaches.filter(b =>
        b.kind === "FLOOR" || (b.kind === "CEILING" && b.side === 1));
      if (blocking.length > 0) continue;

      return {
        fromTeamId: seller.id,
        toTeamId: buyer.id,
        outPlayerId: outPlayer.id,
        outPlayerName: outPlayer.name,
        inPlayerId: returnPiece.id,
        inPlayerName: returnPiece.name,
        capSaved: Math.round(capSaved * 100) / 100,
        fitScore: fit,
        reason: `${seller.name} cleared $${capSaved.toFixed(1)}M — ${buyer.name} had the room and a need`,
      };
    }
  }
  return null;
}

/** Move the players. Pure; mirrors how re-signings are applied. */
export function applyAiTrades(players: Asset[], trades: AiTrade[]): Asset[] {
  if (trades.length === 0) return players;
  const destination = new Map<string, string>();
  for (const t of trades) {
    destination.set(t.outPlayerId, t.toTeamId);
    destination.set(t.inPlayerId, t.fromTeamId);
  }
  return players.map(p => {
    const to = destination.get(p.id);
    return to ? { ...p, teamId: to } : p;
  });
}
