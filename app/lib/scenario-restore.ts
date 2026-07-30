// ── Restoring a filed report (CXS6) ──────────────────────────────
//
// Saved scenarios were a dead end: rename and delete, and nothing else. You
// could file a report and then had to rebuild the trade by hand to look at it
// again, which makes the archive a scrapbook rather than a tool.
//
// The reason loading is not trivial is that a `SavedScenario` is a LOSSY
// projection. It keeps id, name, position, cap hit, age and retention — the
// things worth printing on a card — and none of the paces, baselines or EDGE
// signals the valuation engine reads. Rebuilding an `Asset` from those stored
// fields would produce a player who values at zero, which is the same failure
// CXH3 hit when walked free agents were dropped from `db.players`.
//
// So a restore is a LOOKUP, not a reconstruction: resolve each saved id against
// the live pool and take the real asset. What the scenario keeps authority over
// is `retainedPct`, because retention is a term of the deal rather than a
// property of the player.
//
// And a scenario outlives the league it was filed against — it sits in
// localStorage across trades, rollovers and resets. Players retire, get moved,
// or vanish when the season rolls. Silently dropping them would load a
// DIFFERENT trade than the one saved and say nothing, so anything unresolvable
// comes back named.

import type { Asset, Team } from "./trade-types";
import { canonicalNameSlug } from "./player-identity";

export interface StoredAsset {
  id?: string;
  name: string;
  position?: string;
  retainedPct?: number;
}

export interface StoredScenario {
  homeTeam: { id: string; name: string } | null;
  partnerTeam: { id: string; name: string } | null;
  outgoing: StoredAsset[];
  incoming: StoredAsset[];
}

export interface RestoredScenario {
  homeTeam: Team | null;
  partnerTeam: Team | null;
  outgoing: Asset[];
  incoming: Asset[];
  /** Saved assets no longer in the league, by the name they were filed under. */
  missingAssets: string[];
  /** Saved clubs no longer in the league (relocation, a trimmed pool). */
  missingTeams: string[];
}

/**
 * Find the live asset a saved entry refers to.
 *
 * By id first, because that is exact. The name fallback exists for scenarios
 * filed before an id was stored, and it matches through `canonicalNameSlug` so
 * a diacritic change — the Björck/Bjorck case that has bitten the draft
 * reconcile — does not read as a different player.
 */
function resolveAsset(
  stored: StoredAsset,
  byId: Map<string, Asset>,
  bySlug: Map<string, Asset>,
): Asset | null {
  if (stored.id) {
    const hit = byId.get(stored.id);
    if (hit) return hit;
  }
  return bySlug.get(canonicalNameSlug(stored.name)) ?? null;
}

export function restoreScenario(
  scenario: StoredScenario,
  pool: { teams: Team[]; players: Asset[] },
): RestoredScenario {
  const byId = new Map(pool.players.map(p => [p.id, p]));
  // Last writer wins is fine: a duplicate slug means two players the pool
  // itself cannot tell apart, and the id path already covers the real case.
  const bySlug = new Map(pool.players.map(p => [canonicalNameSlug(p.name), p]));
  const teamsById = new Map(pool.teams.map(t => [t.id, t]));

  const missingAssets: string[] = [];
  const missingTeams: string[] = [];

  const side = (stored: StoredAsset[]): Asset[] => {
    const out: Asset[] = [];
    for (const entry of stored) {
      const live = resolveAsset(entry, byId, bySlug);
      if (!live) { missingAssets.push(entry.name); continue; }
      // Retention is a term of the trade, not a fact about the player, so the
      // scenario keeps authority over it. Everything else comes from the pool.
      out.push(entry.retainedPct ? { ...live, retainedPct: entry.retainedPct } : live);
    }
    return out;
  };

  const team = (stored: { id: string; name: string } | null): Team | null => {
    if (!stored) return null;
    const live = teamsById.get(stored.id);
    if (!live) { missingTeams.push(stored.name); return null; }
    return live;
  };

  const homeTeam = team(scenario.homeTeam);
  const partnerTeam = team(scenario.partnerTeam);

  return {
    homeTeam,
    partnerTeam,
    outgoing: side(scenario.outgoing),
    incoming: side(scenario.incoming),
    missingAssets,
    missingTeams,
  };
}

/**
 * Whether the current bench holds a trade worth filing.
 *
 * A selected club is not a trade. `hasActiveTrade` counted one, and Armchair GM
 * selects a home club at startup, so Save was enabled from the moment the page
 * loaded and would file a report reading "nothing" against "nothing".
 */
export function isSaveableTrade(blocks: [unknown[], unknown[]]): boolean {
  return blocks[0].length > 0 || blocks[1].length > 0;
}
