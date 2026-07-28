// ── Draft-pick lifecycle ─────────────────────────────────────────
//
// A draft pick is an asset only until its draft is held. After that it has been
// spent: the rookie exists, the pick does not, and it must disappear from every
// selector at once. Getting that boundary wrong is subtle — the pick still looks
// like a valid asset, so a spent 2027 first can be traded a second time, or the
// same first can appear to convey after the player it produced is already on a
// roster.
//
// The rule lives here, in one place, because it was previously written twice
// with two different comparisons.

import { SEASON } from "./season-config";
import type { Asset } from "./trade-types";

/**
 * The draft held when the league enters Cup Run year `cupYear`.
 *
 * Year 1 is entered through the base draft (`SEASON.draftYear`); each later year
 * advances by one, so Year 2 holds 2027 and Year 3 holds 2028.
 */
export function draftYearForCupYear(cupYear: number): number {
  return SEASON.draftYear + Math.max(1, cupYear) - 1;
}

/**
 * Remove picks whose draft has already been held.
 *
 * `completedThroughYear` is the most recent draft that has happened, and it is
 * INCLUSIVE — the draft just held spends that year's picks. The previous code
 * kept `year >= completedThroughYear`, which preserved the picks the rollover
 * had just converted into rookies.
 *
 * A pick with no year is kept: an unresolvable asset is a data problem, and
 * silently deleting something a user may have traded for is worse than showing
 * it.
 */
export function dropSpentDraftPicks(players: Asset[], completedThroughYear: number): Asset[] {
  return players.filter(p =>
    p.position !== "Pick" || (p.year ?? Number.POSITIVE_INFINITY) > completedThroughYear);
}
