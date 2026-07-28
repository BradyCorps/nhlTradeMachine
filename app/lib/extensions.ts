// ── Contract extensions ──────────────────────────────────────────
//
// A GM's most consequential quiet decision: signing a player who still has a
// year left, before he can reach the market. The app had no such lever — every
// contract ran to expiry and every renewal happened in the scramble of free
// agency, which is not how a front office actually works and removed the one
// move that trades present cap room for future certainty.
//
// The important property is that an extension costs NOTHING this season. It
// begins when the current deal ends, so it is invisible to a cap-space readout
// and visible only in a forward projection — which is exactly what the cap
// horizon shows. Extending your winger at $9M × 6 and watching the season your
// defenceman's own extension falls due fill up IS the decision.

import type { Asset } from "./trade-types";
import { projectFreeAgentContract } from "./free-agency";
import { projectedCapCeiling } from "./season-config";
import { lineupContributionScore } from "./lineup-ranking";

export interface PendingExtension {
  aav: number;
  term: number;
  /** UFA/RFA status the player would have carried into the market. */
  wouldHaveBeen: "UFA" | "RFA";
}

export interface ExtensionOffer {
  playerId: string;
  teamId: string;
  extension: PendingExtension;
}

/**
 * A player may be extended in the final year of his deal, and only once.
 *
 * Picks are not people, players already carrying an extension cannot sign a
 * second, and anyone whose contract has already expired belongs to the
 * re-signing flow rather than here.
 */
export function isExtensionEligible(p: Asset): boolean {
  if (p.position === "Pick") return false;
  if (p.pendingExtension) return false;
  if (p.expiresThisOffseason) return false;
  return (p.yearsRemaining ?? 0) === 1;
}

/**
 * Terms a player would sign a year early.
 *
 * Priced off the same market model as free agency, then discounted: signing
 * before the market opens is a trade of upside for certainty, and the player is
 * accepting a deal without hearing 31 other offers. A player who would still be
 * restricted is already discounted by the projection's own team-control factor,
 * so only the early-signing discount applies on top.
 */
export const EXTENSION_EARLY_DISCOUNT = 0.95;

export function projectExtension(p: Asset, capCeiling?: number): PendingExtension {
  // A year from now he is a year older, and priced against that season's cap.
  const atExpiry = { ...p, age: (p.age ?? 27) + 1 } as Asset;
  const contract = projectFreeAgentContract(atExpiry, {
    capCeiling: capCeiling ?? projectedCapCeiling(1),
  });
  return {
    aav: Math.round(contract.aav * EXTENSION_EARLY_DISCOUNT * 20) / 20, // $0.05M grid
    term: contract.term,
    wouldHaveBeen: contract.status,
  };
}

/** Attach signed extensions to the roster. Pure. */
export function applyExtensions(players: Asset[], offers: ExtensionOffer[]): Asset[] {
  if (offers.length === 0) return players;
  const byId = new Map(offers.map(o => [o.playerId, o.extension]));
  return players.map(p => {
    const ext = byId.get(p.id);
    return ext ? { ...p, pendingExtension: ext } : p;
  });
}

/**
 * Turn a matured extension into the live contract.
 *
 * Called by the season rollover when the current deal runs out. Without this the
 * extension is a promise nothing ever keeps, and the player walks anyway.
 */
export function activateMaturedExtension(p: Asset): Asset {
  const ext = p.pendingExtension;
  if (!ext || (p.yearsRemaining ?? 0) > 0) return p;
  return {
    ...p,
    capHit: ext.aav,
    lastCapHit: p.capHit,
    yearsRemaining: ext.term,
    pendingExtension: undefined,
    expiresThisOffseason: false,
    contractStatus: "SIGNED",
    expiryStatus: null,
  };
}

// ── AI extensions ────────────────────────────────────────────────

/** Contribution below which a club lets a player reach the market instead. */
const AI_EXTEND_MIN_CONTRIBUTION = 90;

/**
 * Which players AI clubs extend.
 *
 * A club extends a player it wants to keep, in its own priority order, while
 * next season's books can carry the raise. Judged against NEXT season's ceiling
 * and commitments, not this one's — the whole point of an extension is that it
 * spends future room, so checking present cap space would let a club extend its
 * way into a wall it cannot see.
 */
export function resolveAiExtensions(
  players: Asset[],
  opts: {
    teamIds: string[];
    userTeamId?: string;
    capCeiling?: number;
    /** Room a club keeps free next season for its own pending business. */
    reserve?: number;
  },
): ExtensionOffer[] {
  const { teamIds, userTeamId, capCeiling = projectedCapCeiling(1), reserve = 6 } = opts;
  const offers: ExtensionOffer[] = [];

  for (const teamId of teamIds) {
    if (teamId === userTeamId) continue;           // the user's calls are the user's
    const roster = players.filter(p => p.teamId === teamId && p.position !== "Pick");

    // Committed next season: everyone signed beyond this year, plus extensions
    // already agreed this pass.
    let committedNext = roster
      .filter(p => (p.yearsRemaining ?? 0) > 1)
      .reduce((s, p) => s + (p.capHit ?? 0) * (1 - (p.retainedPct ?? 0)), 0);

    const candidates = roster
      .filter(isExtensionEligible)
      .filter(p => lineupContributionScore(p) >= AI_EXTEND_MIN_CONTRIBUTION)
      .sort((a, b) => lineupContributionScore(b) - lineupContributionScore(a));

    for (const p of candidates) {
      const extension = projectExtension(p, capCeiling);
      if (committedNext + extension.aav > capCeiling - reserve) continue;
      committedNext += extension.aav;
      offers.push({ playerId: p.id, teamId, extension });
    }
  }
  return offers;
}
