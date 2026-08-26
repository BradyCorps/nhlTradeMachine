import { SEASON } from "@/app/lib/season-config";

export const XNAV_MODEL_VERSION = "X-NAV 4.2";

export type ProvenanceKind = "players" | "teams" | "league";
export type ProductRoute = "players" | "teams" | "fantasy" | "trade" | "armchair";

export interface LeagueProvenance {
  asOf: string | null;
  cacheState: "fresh" | "stale" | "expired" | "miss" | "unknown";
  blocked: boolean;
  source: string;
  coverage: string;
  modelVersion: string;
  reconciliation: "passed" | "warning";
  warning: string | null;
}

export interface ContextItem {
  label: string;
  value: string;
}

export interface RouteDataContext {
  items: ContextItem[];
  warning: string | null;
}

export function buildLeagueProvenance(input: {
  kind: ProvenanceKind;
  generatedAt?: unknown;
  cacheState?: unknown;
  blocked?: unknown;
  liveStats?: unknown;
  playerCount?: unknown;
  analyticsCount?: unknown;
  contractsLoaded?: unknown;
  teamCount?: unknown;
}): LeagueProvenance {
  const playerCount = Number(input.playerCount) || 0;
  const analyticsCount = Number(input.analyticsCount) || 0;
  const contractsLoaded = Number(input.contractsLoaded) || 0;
  const teamCount = Number(input.teamCount) || 0;
  const liveStats = input.liveStats === true;
  const cacheState = ["fresh", "stale", "expired", "miss"].includes(String(input.cacheState))
    ? input.cacheState as LeagueProvenance["cacheState"]
    : "unknown";
  const asOf = typeof input.generatedAt === "string" && Number.isFinite(Date.parse(input.generatedAt))
    ? input.generatedAt
    : null;

  const playerHealthy = playerCount > 0 && liveStats && analyticsCount > 0;
  const teamsHealthy = teamCount === 32;
  const reconciliation = input.kind === "players"
    ? playerHealthy
    : input.kind === "teams"
      ? teamsHealthy
      : playerHealthy && teamsHealthy;

  const warnings: string[] = [];
  if (cacheState === "stale") warnings.push("Serving a stale cached snapshot while sources refresh.");
  if (!asOf) warnings.push("Snapshot timestamp is unavailable.");
  if (input.kind !== "teams" && !liveStats) warnings.push("Player analytics source is unavailable; roster and contract fallbacks are shown.");
  if (input.kind !== "players" && teamCount !== 32) warnings.push(`Team coverage is incomplete (${teamCount}/32).`);

  const playerCoverage = `${analyticsCount}/${playerCount} player records with analytics · ${contractsLoaded} contract records`;
  const teamCoverage = `${teamCount}/32 teams · cap ledger · draft-pick inventory`;

  return {
    asOf,
    cacheState,
    blocked: input.blocked === true,
    source: input.kind === "players"
      ? "NHL rosters · MoneyPuck all-situations · contract ledger"
      : input.kind === "teams"
        ? "NHL standings · roster/cap ledger · draft-pick inventory"
        : "NHL rosters/standings · MoneyPuck all-situations · contract ledger",
    coverage: input.kind === "players"
      ? playerCoverage
      : input.kind === "teams"
        ? teamCoverage
        : `${teamCoverage} · ${playerCoverage}`,
    modelVersion: XNAV_MODEL_VERSION,
    reconciliation: reconciliation ? "passed" : "warning",
    warning: warnings.length > 0 ? warnings.join(" ") : null,
  };
}

export function formatDataTimestamp(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(value));
}

export function routeDataContext(
  route: ProductRoute,
  provenance: LeagueProvenance | null | undefined,
  options: { capCeiling?: number | null } = {},
): RouteDataContext {
  const ceiling = Number.isFinite(options.capCeiling)
    ? `$${Number(options.capCeiling).toFixed(1)}M ceiling`
    : "cap ceiling unavailable";
  const routeItems: Record<ProductRoute, ContextItem[]> = {
    players: [
      { label: "Stats", value: `${SEASON.replaySeason} regular season · all situations` },
      { label: "Roster / contracts", value: `${SEASON.label} · ${SEASON.rosterMoveWindow}` },
    ],
    teams: [
      { label: "Completed results", value: `${SEASON.replaySeason} regular season` },
      { label: "Current roster / cap", value: `${SEASON.label} · ${ceiling}` },
      { label: "Future rating", value: "2028-29 age curve, prospects, and draft capital" },
    ],
    fantasy: [
      { label: "Projection", value: `${SEASON.label} fantasy season` },
      { label: "Stats baseline", value: `${SEASON.replaySeason} regular season · all situations` },
    ],
    trade: [
      { label: "Stats", value: `${SEASON.replaySeason} regular season · all situations` },
      { label: "Roster / CBA", value: `${SEASON.label} · ${SEASON.rosterMoveWindow} · ${ceiling}` },
    ],
    armchair: [
      { label: "Simulation", value: `${SEASON.label} start · Cup Run through 2028-29` },
      { label: "Stats baseline", value: `${SEASON.replaySeason} · all situations` },
      { label: "Roster / CBA", value: `${SEASON.rosterMoveWindow} · ${ceiling}` },
    ],
  };

  const resolved = provenance ?? {
    asOf: null,
    source: "Source status unavailable",
    coverage: "Coverage unavailable",
    modelVersion: XNAV_MODEL_VERSION,
    reconciliation: "warning" as const,
    warning: "Data context is unavailable.",
  };

  return {
    items: [
      ...routeItems[route],
      { label: "As of", value: formatDataTimestamp(resolved.asOf) },
      { label: "Source / coverage", value: `${resolved.source} · ${resolved.coverage}` },
      { label: "Model", value: resolved.modelVersion },
      { label: "Reconciliation", value: resolved.reconciliation === "passed" ? "Passed" : "Warning" },
    ],
    warning: resolved.warning,
  };
}
