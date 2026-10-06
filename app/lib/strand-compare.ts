// ── strand-compare.ts ────────────────────────────────────────────
//
// Who a dossier player can be compared with, and the rows of that comparison.
// Pure; the page ships the result to the client picker and table.
//
// Eligibility is the SAME rule the STRAND cohort uses (same position group,
// at least STRAND_COHORT_MIN_GP games in the baseline season) because the
// percentiles on both sides are ranked inside that cohort — a player outside it
// has no percentile to compare. Saying why a player is missing is part of the
// feature: a reader who cannot find a rookie should be told the rookie has too
// few games, not left to wonder whether search is broken.

import { posGroupOf, STRAND_COHORT_MIN_GP, STRAND_COHORT_NOUN } from "@/app/lib/strand-cohort";
import { dashSeason } from "@/app/lib/dossier-context";
import { SEASON } from "@/app/lib/season-config";
import type { StrandRail } from "@/app/lib/strand-metrics";

export interface ComparePeerOption {
  id: string; name: string; position: string; teamId?: string | null;
}
export interface ExcludedPlayer {
  id: string; name: string; position: string; teamId?: string | null; reason: string;
}

export function compareEligibility(allPlayers: readonly Record<string, any>[], player: { id: unknown; position: string }) {
  const group = posGroupOf(player.position);
  const eligible: ComparePeerOption[] = [];
  const excluded: ExcludedPlayer[] = [];
  for (const p of allPlayers) {
    if (!p || String(p.id) === String(player.id) || p.position === "Pick") continue;
    if (posGroupOf(String(p.position)) !== group) continue;
    const games = typeof p.games === "number" ? p.games : 0;
    const base = { id: String(p.id), name: String(p.name), position: String(p.position), teamId: p.teamId ?? null };
    if (games >= STRAND_COHORT_MIN_GP) eligible.push(base);
    else excluded.push({ ...base, reason: `${games} GP in ${dashSeason(SEASON.replaySeason)}; needs ${STRAND_COHORT_MIN_GP}` });
  }
  eligible.sort((a, b) => a.name.localeCompare(b.name));
  excluded.sort((a, b) => a.name.localeCompare(b.name));
  return { eligible, excluded };
}

export function eligibilityRule(player: { position: string }): string {
  const noun = STRAND_COHORT_NOUN[posGroupOf(player.position)];
  return `Only ${noun} with at least ${STRAND_COHORT_MIN_GP} games in ${dashSeason(SEASON.replaySeason)} can be compared, because both profiles are ranked against that same group.`;
}

export interface CompareRow {
  label: string;
  rawA: string; pctA: number | null;
  rawB: string; pctB: number | null;
}

/** Row i of A against row i of B; rails share order by construction. */
export function compareRows(a: StrandRail[], b: StrandRail[]): CompareRow[] {
  return a.map((ra, i) => {
    const rb = b[i];
    return {
      label: ra.label,
      rawA: ra.unavailable ? "—" : (ra.raw ?? "—"), pctA: ra.unavailable ? null : ra.percentile,
      rawB: !rb || rb.unavailable ? "—" : (rb.raw ?? "—"), pctB: !rb || rb.unavailable ? null : rb.percentile,
    };
  });
}
