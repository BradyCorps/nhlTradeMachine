// ── Teams index URL state (QW-09) ──────────────────────────────────
// Which team is being VIEWED already round-trips through the path
// (`/teams/[team]` reuses this same page component — see app/teams/[team]/
// page.tsx) so it isn't duplicated here. This covers what's left: the index
// view's sort, phase filter, inline-expanded card, and the detail view's
// collapsed toggle. Same recover-safely contract as players-url-state.ts —
// unknown values fall back to defaults rather than breaking the view.

import type { TeamSortKey } from "@/app/lib/team-sort-summary";

export type TeamPhaseFilter = "ALL" | "Contender" | "Bubble" | "Retooling" | "Rebuilding" | "Tanking";

export interface TeamsUrlState {
  sortKey: TeamSortKey;
  filterPhase: TeamPhaseFilter;
  expandedId: string | null;
  detailCollapsed: boolean;
}

export const TEAMS_URL_DEFAULTS: TeamsUrlState = {
  sortKey: "division",
  filterPhase: "ALL",
  expandedId: null,
  detailCollapsed: false,
};

const VALID_SORT_KEYS: readonly TeamSortKey[] = [
  "division", "standing", "present", "future", "rosterNAV", "capSpace", "goalDiff", "gravity", "speed", "name",
];
const VALID_PHASES: readonly TeamPhaseFilter[] = [
  "ALL", "Contender", "Bubble", "Retooling", "Rebuilding", "Tanking",
];

export function parseTeamsUrlState(params: URLSearchParams): TeamsUrlState {
  const sort = params.get("sort");
  const phase = params.get("phase");
  const expand = params.get("expand");
  return {
    sortKey: sort && (VALID_SORT_KEYS as string[]).includes(sort) ? (sort as TeamSortKey) : TEAMS_URL_DEFAULTS.sortKey,
    filterPhase: phase && (VALID_PHASES as string[]).includes(phase) ? (phase as TeamPhaseFilter) : TEAMS_URL_DEFAULTS.filterPhase,
    expandedId: expand && expand.trim() ? expand : TEAMS_URL_DEFAULTS.expandedId,
    detailCollapsed: params.get("collapsed") === "1",
  };
}

/** SSR-safe: returns defaults when `window` isn't available (server render). */
export function readTeamsUrlState(): TeamsUrlState {
  if (typeof window === "undefined") return TEAMS_URL_DEFAULTS;
  return parseTeamsUrlState(new URLSearchParams(window.location.search));
}

export function buildTeamsUrlQuery(state: TeamsUrlState): string {
  const params = new URLSearchParams();
  if (state.sortKey !== TEAMS_URL_DEFAULTS.sortKey) params.set("sort", state.sortKey);
  if (state.filterPhase !== TEAMS_URL_DEFAULTS.filterPhase) params.set("phase", state.filterPhase);
  if (state.expandedId) params.set("expand", state.expandedId);
  if (state.detailCollapsed) params.set("collapsed", "1");
  return params.toString();
}
