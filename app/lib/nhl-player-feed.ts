// ── NHL Player Feed — first-party api-web.nhle.com pipeline ───
// Fetches and parses the two per-player endpoints discovered from the
// NHL's own site traffic:
//   /v1/player/{id}/landing              — identity, season lines, career
//   /v1/edge/skater-detail/{id}/{season}/2 — EDGE shot locations, zone
//                                            time, speed (regular season)
// Parsers are pure and shape-validated so the admin health check can
// detect upstream API drift (e.g. a future v1 → v2 migration) before it
// silently corrupts the historical feed.

const NHL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nhl.com",
  "Referer": "https://www.nhl.com/",
};

export const LANDING_URL = (playerId: number | string) =>
  `https://api-web.nhle.com/v1/player/${playerId}/landing`;
export const EDGE_URL = (playerId: number | string, seasonId: number | string) =>
  `https://api-web.nhle.com/v1/edge/skater-detail/${playerId}/${seasonId}/2`;
export const GOALIE_EDGE_URL = (playerId: number | string, seasonId: number | string) =>
  `https://api-web.nhle.com/v1/edge/goalie-detail/${playerId}/${seasonId}/2`;

const fetchJson = async (url: string, timeoutMs = 8000): Promise<unknown | null> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: NHL_HEADERS });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
};

// ── Shape canaries — the fields the app depends on ────────────
// If any of these paths vanish, the NHL changed the contract.
export const LANDING_REQUIRED_PATHS = [
  "playerId",
  "position",
  "birthDate",
  "featuredStats.season",
  "featuredStats.regularSeason.subSeason.points",
  "featuredStats.regularSeason.subSeason.gamesPlayed",
  "careerTotals.regularSeason.points",
  "seasonTotals",
] as const;

export const EDGE_REQUIRED_PATHS = [
  "player.id",
  "player.gamesPlayed",
  "sogSummary",
  "zoneTimeDetails.offensiveZonePctg",
  "zoneTimeDetails.defensiveZonePctg",
] as const;

export function missingPaths(obj: unknown, paths: readonly string[]): string[] {
  const missing: string[] = [];
  for (const path of paths) {
    let node: unknown = obj;
    for (const key of path.split(".")) {
      node = node != null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
      if (node === undefined) break;
    }
    if (node === undefined || node === null) missing.push(path);
  }
  return missing;
}

// ── Parsed shapes ─────────────────────────────────────────────
export interface LandingFacts {
  playerId: number;
  name: string;
  position: string;
  teamAbbrev: string | null;
  sweaterNumber: number | null;
  birthDate: string;
  birthCountry: string | null;
  draftYear: number | null;
  draftOverall: number | null;
  season: number;                 // e.g. 20252026
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number | null;
  shootingPctg: number | null;
  avgToiMinutes: number | null;   // career regular-season avg, parsed from "21:52"
  careerGamesPlayed: number;
  careerPoints: number;
  nhlSeasonCount: number;         // distinct NHL regular seasons played
}

export interface EdgeFacts {
  playerId: number;
  season: number;
  gamesPlayed: number;
  ozPct: number | null;           // offensive-zone time share
  ozPercentile: number | null;
  dzPct: number | null;
  shotsAll: number | null;
  shootingPctAll: number | null;
  hdShots: number | null;         // high-danger shots on goal
  hdShootingPct: number | null;
  hdShootingPctLeague: number | null;
  hdShotShare: number | null;     // hdShots / shotsAll
  speedMaxMph: number | null;
  burstsOver20: number | null;
  /** Finishing vs shot quality on high-danger chances: negative =
   *  unlucky finisher (breakout-bias fuel), positive = running hot. */
  hdFinishingDelta: number | null;
}

const toiToMinutes = (toi: unknown): number | null => {
  if (typeof toi !== "string" || !/^\d+:\d\d$/.test(toi)) return null;
  const [m, s] = toi.split(":").map(Number);
  return Math.round((m + s / 60) * 10) / 10;
};

// Identity is mandatory; the current-season stat line is not — rookies
// and no-GP players have no featuredStats.regularSeason yet, and they
// should still snapshot (with zeros) instead of counting as failures.
const LANDING_CORE_PATHS = ["playerId", "position", "birthDate"] as const;

export function parseLanding(raw: unknown): LandingFacts | null {
  if (missingPaths(raw, LANDING_CORE_PATHS).length > 0) return null;
  const r = raw as any;
  const sub = r.featuredStats?.regularSeason?.subSeason ?? {};
  const career = r.careerTotals?.regularSeason ?? r.featuredStats?.regularSeason?.career ?? {};
  const nhlSeasons = new Set(
    (Array.isArray(r.seasonTotals) ? r.seasonTotals : [])
      .filter((s: any) => s?.leagueAbbrev === "NHL" && s?.gameTypeId === 2)
      .map((s: any) => s.season),
  );
  return {
    playerId: Number(r.playerId),
    name: `${r.firstName?.default ?? ""} ${r.lastName?.default ?? ""}`.trim(),
    position: String(r.position ?? ""),
    teamAbbrev: r.currentTeamAbbrev ?? null,
    sweaterNumber: r.sweaterNumber ?? null,
    birthDate: String(r.birthDate),
    birthCountry: r.birthCountry ?? null,
    draftYear: r.draftDetails?.year ?? null,
    draftOverall: r.draftDetails?.overallPick ?? null,
    season: Number(r.featuredStats?.season ?? 0),
    gamesPlayed: Number(sub.gamesPlayed ?? 0),
    goals: Number(sub.goals ?? 0),
    assists: Number(sub.assists ?? 0),
    points: Number(sub.points ?? 0),
    plusMinus: sub.plusMinus ?? null,
    shootingPctg: sub.shootingPctg ?? null,
    avgToiMinutes: toiToMinutes(career.avgToi),
    careerGamesPlayed: Number(career.gamesPlayed ?? 0),
    careerPoints: Number(career.points ?? 0),
    nhlSeasonCount: nhlSeasons.size,
  };
}

export function parseEdge(raw: unknown, seasonId: number): EdgeFacts | null {
  if (missingPaths(raw, EDGE_REQUIRED_PATHS).length > 0) return null;
  const r = raw as any;
  const sog = Array.isArray(r.sogSummary) ? r.sogSummary : [];
  const all = sog.find((s: any) => s?.locationCode === "all") ?? null;
  const high = sog.find((s: any) => s?.locationCode === "high") ?? null;
  const zone = r.zoneTimeDetails ?? {};
  const hdShots = high?.shots ?? null;
  const shotsAll = all?.shots ?? null;
  const hdShootingPct = high?.shootingPctg ?? null;
  const hdLeague = high?.shootingPctgLeagueAvg ?? null;
  return {
    playerId: Number(r.player.id),
    season: seasonId,
    gamesPlayed: Number(r.player.gamesPlayed ?? 0),
    ozPct: zone.offensiveZonePctg ?? null,
    ozPercentile: zone.offensiveZonePercentile ?? null,
    dzPct: zone.defensiveZonePctg ?? null,
    shotsAll,
    shootingPctAll: all?.shootingPctg ?? null,
    hdShots,
    hdShootingPct,
    hdShootingPctLeague: hdLeague,
    hdShotShare: hdShots != null && shotsAll ? Math.round((hdShots / shotsAll) * 1000) / 1000 : null,
    speedMaxMph: r.skatingSpeed?.speedMax?.imperial ?? null,
    burstsOver20: r.skatingSpeed?.burstsOver20?.value ?? null,
    hdFinishingDelta: hdShootingPct != null && hdLeague != null
      ? Math.round((hdShootingPct - hdLeague) * 1000) / 1000
      : null,
  };
}

// ── Goalie EDGE detail ────────────────────────────────────────
//
// `/v1/edge/goalie-detail/{id}/{season}/2` is the feed behind the NHL's
// own goalie pages: a season line, three headline stats, and the shot
// data split by location — all locations, high-danger, mid-range and
// long-range — each carrying the goalie's figure, the league average and
// a percentile.
//
// WHY THIS PARSER IS DEFENSIVE
//
// The skater sibling above pins exact paths because its shape was read
// off a live response. This one was written from the rendered page and
// the location taxonomy the goalie board URLs already use (`…/all/…`,
// `…/high/…`), so the field SPELLINGS are inferred rather than observed.
// Two consequences, both deliberate:
//
//   • the location array is found by shape — the first array whose
//     entries carry a `locationCode` — rather than by key name, so it
//     survives being called `sogAgainstSummary` or `savePctSummary`;
//   • every metric is read through an alias list, and anything that does
//     not resolve stays null rather than defaulting to a number that
//     would silently enter a valuation.
//
// The capture stores the RAW payload, and the read path re-parses it, so
// correcting a wrong guess here fixes every row already on disk without
// re-fetching. `scripts/verify-goalie-edge.ts` prints the real keys
// against a live response; run it somewhere the NHL API is reachable and
// tighten the aliases below to what it reports.

export type GoalieZoneKey = "all" | "high" | "mid" | "long";

/** Which upstream location codes map onto each zone we display. */
const ZONE_ALIASES: Record<GoalieZoneKey, string[]> = {
  all:  ["all", "alllocations", "total"],
  high: ["high", "highdanger", "hd"],
  mid:  ["medium", "mid", "midrange", "md"],
  long: ["low", "long", "longrange", "ld"],
};

export const GOALIE_ZONE_LABEL: Record<GoalieZoneKey, string> = {
  all: "All Locations", high: "High-Danger", mid: "Mid-Range", long: "Long-Range",
};

export interface GoalieZoneSplit {
  zone: GoalieZoneKey;
  /** Save percentage as a 0–1 fraction, matching the rest of the codebase. */
  savePct: number | null;
  savePctLeagueAvg: number | null;
  /** 0–100 rank against the league at this location. */
  percentile: number | null;
  shotsAgainst: number | null;
  saves: number | null;
  goalsAgainst: number | null;
}

export interface GoalieEdgeFacts {
  playerId: number;
  season: number;
  gamesPlayed: number | null;
  wins: number | null;
  losses: number | null;
  otLosses: number | null;
  gaa: number | null;
  savePct: number | null;
  shotsAgainst: number | null;
  saves: number | null;
  goalsAgainst: number | null;
  /** Saves ÷ shots inside 29 ft of the net centre, bounded by the face-off
   *  dots — the most repeatable goalie skill signal the feed carries. */
  highDangerSavePct: number | null;
  highDangerGoalsAgainst: number | null;
  /** Share of starts finishing above a .900 save percentage — consistency
   *  rather than peak, and the one figure here the feed may not publish
   *  directly (the NHL derives it from game logs). */
  startsAbove900Pct: number | null;
  zones: GoalieZoneSplit[];
}

/** Finite number, or null. Strings like "99th" and ".906" are accepted —
 *  the feed is not consistent about quoting numerics. */
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** First alias present on the object, coerced to a number. */
const pick = (obj: any, keys: string[]): number | null => {
  if (obj == null || typeof obj !== "object") return null;
  const lower = new Map(Object.keys(obj).map(k => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = lower.get(key.toLowerCase());
    if (actual !== undefined) {
      const v = num(obj[actual]);
      if (v !== null) return v;
    }
  }
  return null;
};

/**
 * First alias found across several candidate objects, in order.
 *
 * The season line is not reliably in one place: the skater sibling keeps
 * games played under `player` while rate stats sit at the root. Searching
 * a single object meant whichever one was checked first hid the other —
 * `goalsAgainstAverage` at the root went missing the moment `player`
 * existed.
 */
const pickAny = (objs: any[], keys: string[]): number | null => {
  for (const obj of objs) {
    const v = pick(obj, keys);
    if (v !== null) return v;
  }
  return null;
};

/** Save percentages arrive as either .906 or 90.6 depending on endpoint —
 *  normalise to the 0–1 fraction the valuation and STRAND rails expect.
 *  Mirrors the same guard roster assembly applies to the NHL stats feed. */
const asFraction = (v: number | null): number | null =>
  v == null ? null : v > 1 ? v / 100 : v;

/** Recursively find the first array whose entries carry a location code. */
function findLocationArray(node: unknown, depth = 0): any[] | null {
  if (depth > 5 || node == null) return null;
  if (Array.isArray(node)) {
    if (node.some(e => e && typeof e === "object" && "locationCode" in e)) return node;
    for (const item of node) {
      const hit = findLocationArray(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      const hit = findLocationArray(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function zoneOf(locationCode: unknown): GoalieZoneKey | null {
  const code = String(locationCode ?? "").toLowerCase().replace(/[^a-z]/g, "");
  for (const [zone, aliases] of Object.entries(ZONE_ALIASES) as [GoalieZoneKey, string[]][]) {
    if (aliases.includes(code)) return zone;
  }
  return null;
}

export function parseGoalieEdge(raw: unknown, seasonId: number): GoalieEdgeFacts | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as any;
  const playerId = num(r?.player?.id ?? r?.playerId ?? r?.player?.playerId);
  // Without an id the row cannot be joined onto anything, so it is worthless
  // however rich the rest of it is.
  if (playerId == null) return null;

  const entries = findLocationArray(r) ?? [];
  const zones: GoalieZoneSplit[] = [];
  const seen = new Set<GoalieZoneKey>();
  for (const e of entries) {
    const zone = zoneOf(e?.locationCode);
    if (zone == null || seen.has(zone)) continue;
    seen.add(zone);
    zones.push({
      zone,
      savePct:          asFraction(pick(e, ["savePctg", "savePct", "savePctage", "saveP"])),
      savePctLeagueAvg: asFraction(pick(e, ["savePctgLeagueAvg", "savePctLeagueAvg", "leagueAvg", "savePctgLeague"])),
      percentile:       pick(e, ["percentile", "savePctgPercentile", "savePctPercentile", "rank"]),
      shotsAgainst:     pick(e, ["shotsAgainst", "shots", "sog", "sogAgainst"]),
      saves:            pick(e, ["saves", "savesMade"]),
      goalsAgainst:     pick(e, ["goalsAgainst", "goals", "ga"]),
    });
  }

  const byZone = (z: GoalieZoneKey) => zones.find(s => s.zone === z) ?? null;
  const all = byZone("all");
  const high = byZone("high");

  // The season line is split across the root and a nested `player` object
  // on the skater sibling, so search both rather than picking one.
  const line = [r.player, r.seasonTotals, r].filter(o => o != null && typeof o === "object");

  return {
    playerId,
    season: seasonId,
    gamesPlayed: pickAny(line, ["gamesPlayed", "gp", "games"]),
    wins:        pickAny(line, ["wins", "w"]),
    losses:      pickAny(line, ["losses", "l"]),
    otLosses:    pickAny(line, ["otLosses", "ot", "overtimeLosses"]),
    gaa:         pickAny(line, ["goalsAgainstAverage", "gaa"]),
    savePct:     asFraction(pickAny(line, ["savePctg", "savePct"])) ?? all?.savePct ?? null,
    shotsAgainst: all?.shotsAgainst ?? pickAny(line, ["shotsAgainst"]),
    saves:        all?.saves ?? pickAny(line, ["saves"]),
    goalsAgainst: all?.goalsAgainst ?? pickAny(line, ["goalsAgainst"]),
    highDangerSavePct:      high?.savePct ?? null,
    highDangerGoalsAgainst: high?.goalsAgainst ?? null,
    startsAbove900Pct: pick(r, [
      "startsAbove900Pctg", "pctStartsAbove900", "startsOver900Pctg", "qualityStartsPctg",
    ]),
    zones,
  };
}

// ── Fetchers ──────────────────────────────────────────────────
export async function fetchPlayerLanding(playerId: number | string): Promise<{ facts: LandingFacts | null; raw: unknown | null }> {
  const raw = await fetchJson(LANDING_URL(playerId));
  return { facts: raw ? parseLanding(raw) : null, raw };
}

export async function fetchEdgeDetail(playerId: number | string, seasonId: number): Promise<{ facts: EdgeFacts | null; raw: unknown | null }> {
  const raw = await fetchJson(EDGE_URL(playerId, seasonId));
  return { facts: raw ? parseEdge(raw, seasonId) : null, raw };
}

export async function fetchGoalieEdgeDetail(playerId: number | string, seasonId: number): Promise<{ facts: GoalieEdgeFacts | null; raw: unknown | null }> {
  const raw = await fetchJson(GOALIE_EDGE_URL(playerId, seasonId));
  return { facts: raw ? parseGoalieEdge(raw, seasonId) : null, raw };
}

/** Bounded-concurrency map so a team-sized sync stays inside one
 *  serverless invocation without hammering the NHL. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Player search (name → NHL id) ─────────────────────────────
// Used by the FA identity backfill: teamless free agents never appear
// in roster snapshots, so their ids resolve via the NHL search API.
export const PLAYER_SEARCH_URL = (q: string) =>
  `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=10&q=${encodeURIComponent(q)}`;

export interface PlayerSearchHit { playerId: number; name: string; positionCode: string | null }

export function parsePlayerSearch(raw: unknown): PlayerSearchHit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({
      playerId: Number(r?.playerId ?? r?.id ?? NaN),
      name: String(r?.name ?? [r?.firstName, r?.lastName].filter(Boolean).join(" ") ?? ""),
      positionCode: r?.positionCode ?? r?.position ?? null,
    }))
    .filter((h) => Number.isFinite(h.playerId) && h.playerId > 0 && h.name.length > 0);
}

/** Exactly one case-insensitive exact-name match → safe to use.
 *  Zero or several (the two Elias Petterssons) → null, report instead. */
export function pickSearchMatch(hits: PlayerSearchHit[], name: string): PlayerSearchHit | null {
  const target = name.trim().toLowerCase();
  const exact = hits.filter((h) => h.name.trim().toLowerCase() === target);
  return exact.length === 1 ? exact[0] : null;
}

export async function searchPlayer(name: string): Promise<PlayerSearchHit[]> {
  const raw = await fetchJson(PLAYER_SEARCH_URL(name));
  return parsePlayerSearch(raw);
}
