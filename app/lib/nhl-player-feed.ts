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

export function parseLanding(raw: unknown): LandingFacts | null {
  if (missingPaths(raw, LANDING_REQUIRED_PATHS).length > 0) return null;
  const r = raw as any;
  const sub = r.featuredStats.regularSeason.subSeason;
  const career = r.careerTotals?.regularSeason ?? r.featuredStats.regularSeason.career ?? {};
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
    season: Number(r.featuredStats.season),
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

// ── Fetchers ──────────────────────────────────────────────────
export async function fetchPlayerLanding(playerId: number | string): Promise<{ facts: LandingFacts | null; raw: unknown | null }> {
  const raw = await fetchJson(LANDING_URL(playerId));
  return { facts: raw ? parseLanding(raw) : null, raw };
}

export async function fetchEdgeDetail(playerId: number | string, seasonId: number): Promise<{ facts: EdgeFacts | null; raw: unknown | null }> {
  const raw = await fetchJson(EDGE_URL(playerId, seasonId));
  return { facts: raw ? parseEdge(raw, seasonId) : null, raw };
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
