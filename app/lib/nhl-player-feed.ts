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
// VERIFIED AGAINST A LIVE RESPONSE
//
// The shapes below were read off `goalie-detail/8478009/20252026/2` via
// `scripts/verify-goalie-edge.ts`, not inferred. Three things that a
// reasonable guess got wrong, kept here because they are the parts most
// likely to be "corrected" back into bugs:
//
//   • the season line is `goalsAgainstAvg`, not `goalsAgainstAverage`;
//   • there is NO shots-against field anywhere in the payload. It is
//     `saves + goalsAgainst`, derived below — Sorokin's 1386 + 144 gives
//     the 1530 the NHL's own page prints;
//   • every percentile is a 0–1 FRACTION (0.7458 is the 75th), so it is
//     scaled here. Reading it as 0–100 renders every goalie under the
//     50th and looks plausible enough to ship.
//
// The capture stores the RAW payload and the read path re-parses it, so
// tightening this parser re-reads every row already on disk rather than
// stranding history behind an old mistake.

export type GoalieZoneKey = "all" | "high" | "mid" | "long";

/** Location codes as the feed emits them: all, high, mid, long. */
const ZONE_ALIASES: Record<GoalieZoneKey, string[]> = {
  all:  ["all"],
  high: ["high"],
  mid:  ["mid", "medium"],
  long: ["long", "low"],
};

export const GOALIE_ZONE_LABEL: Record<GoalieZoneKey, string> = {
  all: "All Locations", high: "High-Danger", mid: "Mid-Range", long: "Long-Range",
};

export interface GoalieZoneSplit {
  zone: GoalieZoneKey;
  /** Save percentage as a 0–1 fraction, matching the rest of the codebase. */
  savePct: number | null;
  savePctLeagueAvg: number | null;
  /** 0–100 rank against the league at this location, rescaled from the
   *  feed's 0–1 fraction. */
  percentile: number | null;
  /** Derived: the feed publishes saves and goals against, never the sum. */
  shotsAgainst: number | null;
  saves: number | null;
  savesLeagueAvg: number | null;
  savesPercentile: number | null;
  goalsAgainst: number | null;
  goalsAgainstLeagueAvg: number | null;
  goalsAgainstPercentile: number | null;
}

/** One cell of the rink map — `shotLocationDetails`, ~17 named areas. */
export interface GoalieAreaDetail {
  area: string;
  saves: number | null;
  savesPercentile: number | null;
  savePct: number | null;
  savePctPercentile: number | null;
}

export interface GoalieEdgeFacts {
  playerId: number;
  season: number;
  gamesPlayed: number | null;
  wins: number | null;
  losses: number | null;
  otLosses: number | null;
  gaa: number | null;
  gaaPercentile: number | null;
  gaaLeagueAvg: number | null;
  savePct: number | null;
  shotsAgainst: number | null;
  saves: number | null;
  goalsAgainst: number | null;
  /** Saves ÷ shots inside 29 ft of the net centre, bounded by the face-off
   *  dots — the most repeatable goalie skill signal the feed carries. */
  highDangerSavePct: number | null;
  highDangerGoalsAgainst: number | null;
  /** Share of starts finishing above a .900 save percentage, as a
   *  percentage (44.4, not 0.444) — consistency rather than peak. Lives at
   *  `stats.gamesAbove900`, not on the season line. */
  startsAbove900Pct: number | null;
  startsAbove900Percentile: number | null;
  startsAbove900LeagueAvg: number | null;
  zones: GoalieZoneSplit[];
  /** The rink map: per-area save data, feed order preserved. */
  areas: GoalieAreaDetail[];
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

/** Save percentages arrive as either .906 or 90.6 depending on endpoint —
 *  normalise to the 0–1 fraction the valuation and STRAND rails expect.
 *  Mirrors the same guard roster assembly applies to the NHL stats feed. */
const asFraction = (v: number | null): number | null =>
  v == null ? null : v > 1 ? v / 100 : v;

/** The feed states percentiles as 0–1 (0.7458 = 75th). Rescale to 0–100,
 *  tolerating a feed that some day switches to whole numbers. */
const asPercentile = (v: number | null): number | null =>
  v == null ? null : v <= 1 ? v * 100 : v;

/** `stats.{key}` carries a `{ value, percentile, leagueAvg }` triple. */
const statTriple = (stats: any, key: string): {
  value: number | null; percentile: number | null; leagueAvg: number | null;
} => {
  const node = stats?.[key];
  return {
    value: pick(node, ["value"]),
    percentile: asPercentile(pick(node, ["percentile"])),
    leagueAvg: pick(node, ["leagueAvg"]),
  };
};

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
    const saves = pick(e, ["saves"]);
    const goalsAgainst = pick(e, ["goalsAgainst"]);
    zones.push({
      zone,
      savePct:          asFraction(pick(e, ["savePctg"])),
      savePctLeagueAvg: asFraction(pick(e, ["savePctgLeagueAvg"])),
      percentile:       asPercentile(pick(e, ["savePctgPercentile"])),
      // Not published anywhere in the payload: a shot against is a save or
      // a goal, and nothing else, so the sum is the figure the NHL prints.
      shotsAgainst:     saves != null && goalsAgainst != null ? saves + goalsAgainst : null,
      saves,
      savesLeagueAvg:   pick(e, ["savesLeagueAvg"]),
      savesPercentile:  asPercentile(pick(e, ["savesPercentile"])),
      goalsAgainst,
      goalsAgainstLeagueAvg:  pick(e, ["goalsAgainstLeagueAvg"]),
      goalsAgainstPercentile: asPercentile(pick(e, ["goalsAgainstPercentile"])),
    });
  }

  const byZone = (z: GoalieZoneKey) => zones.find(s => s.zone === z) ?? null;
  const all = byZone("all");
  const high = byZone("high");

  // The rink map. Areas keep whatever name the feed gives them ("Behind the
  // Net", …) rather than being mapped onto a fixed vocabulary, so a renamed
  // or added zone shows up instead of silently vanishing.
  const areas: GoalieAreaDetail[] = (Array.isArray(r.shotLocationDetails) ? r.shotLocationDetails : [])
    .map((a: any): GoalieAreaDetail => ({
      area: String(a?.area ?? "").trim(),
      saves:             pick(a, ["saves"]),
      savesPercentile:   asPercentile(pick(a, ["savesPercentile"])),
      savePct:           asFraction(pick(a, ["savePctg"])),
      savePctPercentile: asPercentile(pick(a, ["savePctgPercentile"])),
    }))
    .filter((a: GoalieAreaDetail) => a.area.length > 0);

  const line = r.player ?? r;
  const stats = r.stats ?? {};
  const gaaStat = statTriple(stats, "goalsAgainstAvg");
  const above900 = statTriple(stats, "gamesAbove900");

  return {
    playerId,
    season: seasonId,
    gamesPlayed: pick(line, ["gamesPlayed"]),
    wins:        pick(line, ["wins"]),
    losses:      pick(line, ["losses"]),
    otLosses:    pick(line, ["overtimeLosses", "otLosses"]),
    gaa:           pick(line, ["goalsAgainstAvg"]) ?? gaaStat.value,
    gaaPercentile: gaaStat.percentile,
    gaaLeagueAvg:  gaaStat.leagueAvg,
    savePct:      asFraction(pick(line, ["savePctg"])) ?? all?.savePct ?? null,
    shotsAgainst: all?.shotsAgainst ?? null,
    saves:        all?.saves ?? null,
    goalsAgainst: all?.goalsAgainst ?? null,
    highDangerSavePct:      high?.savePct ?? null,
    highDangerGoalsAgainst: high?.goalsAgainst ?? null,
    // Stated as a fraction upstream (0.4444); the panel prints a percentage.
    startsAbove900Pct:        above900.value == null ? null : above900.value * 100,
    startsAbove900Percentile: above900.percentile,
    startsAbove900LeagueAvg:  above900.leagueAvg == null ? null : above900.leagueAvg * 100,
    zones,
    areas,
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
