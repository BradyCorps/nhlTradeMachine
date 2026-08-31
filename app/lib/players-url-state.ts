// ── Players route URL state (QW-09) ────────────────────────────────
// Pure parse/serialize so search, filters, sort, page, and the expanded
// player survive reload, back/forward, and copy/paste without a component
// render. Unknown/out-of-range values fall back to defaults rather than
// producing a broken view — a stale or hand-edited URL must recover safely.
//
// Fields at their default are omitted from the serialized query string, so
// a plain `/players` visit stays canonical-clean (QW-10's canonical tag
// already points at the bare path regardless, but a shorter URL is still
// the better default to copy/share).

export type PlayerSortKey =
  | "seasonPts" | "ppg" | "pts" | "toi" | "ops" | "dps" | "age" | "cap" | "term"
  | "supp" | "gsax" | "svPct" | "gaa" | "gp";
export type PlayerPosFilter = "ALL" | "F" | "D" | "G";
export type SortDir = "asc" | "desc";

export interface PlayersUrlState {
  search: string;
  posFilter: PlayerPosFilter;
  teamFilter: string;
  sortKey: PlayerSortKey;
  sortDir: SortDir;
  forwardPage: number;
  defencePage: number;
  goaliePage: number;
  playerId: string | null;
}

export const PLAYERS_URL_DEFAULTS: PlayersUrlState = {
  search: "",
  posFilter: "ALL",
  teamFilter: "ALL",
  sortKey: "seasonPts",
  sortDir: "desc",
  forwardPage: 1,
  defencePage: 1,
  goaliePage: 1,
  playerId: null,
};

const VALID_SORT_KEYS: readonly PlayerSortKey[] = [
  "seasonPts", "ppg", "pts", "toi", "ops", "dps", "age", "cap", "term",
  "supp", "gsax", "svPct", "gaa", "gp",
];
const VALID_POS_FILTERS: readonly PlayerPosFilter[] = ["ALL", "F", "D", "G"];

function parsePage(raw: string | null): number {
  const n = raw != null ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : PLAYERS_URL_DEFAULTS.forwardPage;
}

export function parsePlayersUrlState(params: URLSearchParams): PlayersUrlState {
  const pos = params.get("pos");
  const sort = params.get("sort");
  const dir = params.get("dir");
  const player = params.get("player");
  return {
    search: params.get("q") ?? PLAYERS_URL_DEFAULTS.search,
    posFilter: pos && (VALID_POS_FILTERS as string[]).includes(pos) ? (pos as PlayerPosFilter) : PLAYERS_URL_DEFAULTS.posFilter,
    teamFilter: params.get("team") || PLAYERS_URL_DEFAULTS.teamFilter,
    sortKey: sort && (VALID_SORT_KEYS as string[]).includes(sort) ? (sort as PlayerSortKey) : PLAYERS_URL_DEFAULTS.sortKey,
    sortDir: dir === "asc" ? "asc" : PLAYERS_URL_DEFAULTS.sortDir,
    forwardPage: parsePage(params.get("fpage")),
    defencePage: parsePage(params.get("dpage")),
    goaliePage: parsePage(params.get("gpage")),
    playerId: player && player.trim() ? player : PLAYERS_URL_DEFAULTS.playerId,
  };
}

/** SSR-safe: returns defaults when `window` isn't available (server render). */
export function readPlayersUrlState(): PlayersUrlState {
  if (typeof window === "undefined") return PLAYERS_URL_DEFAULTS;
  return parsePlayersUrlState(new URLSearchParams(window.location.search));
}

export function buildPlayersUrlQuery(state: PlayersUrlState): string {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set("q", state.search);
  if (state.posFilter !== PLAYERS_URL_DEFAULTS.posFilter) params.set("pos", state.posFilter);
  if (state.teamFilter !== PLAYERS_URL_DEFAULTS.teamFilter) params.set("team", state.teamFilter);
  if (state.sortKey !== PLAYERS_URL_DEFAULTS.sortKey) params.set("sort", state.sortKey);
  if (state.sortDir !== PLAYERS_URL_DEFAULTS.sortDir) params.set("dir", state.sortDir);
  if (state.forwardPage !== PLAYERS_URL_DEFAULTS.forwardPage) params.set("fpage", String(state.forwardPage));
  if (state.defencePage !== PLAYERS_URL_DEFAULTS.defencePage) params.set("dpage", String(state.defencePage));
  if (state.goaliePage !== PLAYERS_URL_DEFAULTS.goaliePage) params.set("gpage", String(state.goaliePage));
  if (state.playerId) params.set("player", state.playerId);
  return params.toString();
}
