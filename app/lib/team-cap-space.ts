// ── Team cap space — one calculation, two routes ─────────────────
//
// `/api/league` and `/api/league/teams` each resolved cap space on their own and
// disagreed by exactly $8.5M for all 32 clubs: Winnipeg read $5.0M in Team
// Analytics and $13.5M in the Trade Machine, Colorado −$1.9M and +$6.6M.
//
// $8.5M is not a coincidence. It is 104.0 − 95.5: the teams route rebased the
// curated cap-space figures onto the live ceiling and the league route did not.
// Two pages quoting different cap space for the same club is the kind of
// contradiction that costs a user's trust in every other number on the page, so
// the rule lives here now and both routes call it.

/**
 * The ceiling the curated `TEAMS_DB.capSpace` values were measured against.
 *
 * Those figures encode real accounting the app does not model — LTIR relief,
 * buried contracts, bonus overages — which is why they are kept rather than
 * recomputed by summing contracts. A club's roster cost is fixed, so a change in
 * the ceiling shifts every club's space by exactly the delta.
 */
export const CURATED_CAPSPACE_CEILING = 95.5;

/**
 * Cap space for one club under the live ceiling.
 *
 * `liveCapSpace` is a scraped figure (CapWages) already measured against the
 * current ceiling, so it is used as-is. Only the curated fallback needs
 * rebasing — rebasing a live value would double-count the delta.
 */
export function resolveTeamCapSpace(args: {
  curatedCapSpace: number;
  capCeiling: number;
  liveCapSpace?: number | null;
}): number {
  const { curatedCapSpace, capCeiling, liveCapSpace } = args;
  if (liveCapSpace != null && Number.isFinite(liveCapSpace)) {
    return Math.round(liveCapSpace * 10) / 10;
  }
  const delta = capCeiling - CURATED_CAPSPACE_CEILING;
  return Math.round((curatedCapSpace + delta) * 10) / 10;
}
