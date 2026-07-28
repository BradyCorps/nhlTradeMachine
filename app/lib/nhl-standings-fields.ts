// ── NHL feed field names — the two endpoints disagree ────────────
//
// The app reads standings from two upstream feeds and they do not use the same
// key for the same stat. Regulation wins are `winsInRegulation` on the stats
// REST endpoint (api.nhle.com/stats/rest/en/team/summary) and `regulationWins`
// on the web standings endpoint (api-web.nhle.com/v1/standings/now).
//
// Reading only `regulationWins` meant every club sourced from the stats feed
// reported 0 RW — Buffalo showed 50 wins and 0 regulation wins — and, worse, the
// standings sort silently lost its first tiebreaker: with every value 0, clubs
// tied on points fell back to input order rather than regulation wins.
//
// Both spellings are accepted here rather than at the call sites, because the
// bug was not a typo — it was the same typo made independently in two routes.

/** A standings row from either NHL feed. */
type StandingsRow = {
  winsInRegulation?: unknown;
  regulationWins?: unknown;
};

/**
 * Regulation wins for one club, whichever feed the row came from.
 *
 * Returns 0 when neither key carries a finite number, so callers can sort and
 * render without null-guarding — a missing tiebreaker should not reorder the
 * league or blank the standings page.
 */
export function regulationWinsFrom(row: StandingsRow | null | undefined): number {
  if (!row) return 0;
  const stats = row.winsInRegulation;
  if (typeof stats === "number" && Number.isFinite(stats)) return stats;
  const web = row.regulationWins;
  if (typeof web === "number" && Number.isFinite(web)) return web;
  return 0;
}
