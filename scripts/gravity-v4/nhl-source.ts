// ── Gravity v4 — NHL source access (cache, pacing, projection) ───
//
// Shared by the coverage spike and the stint emitter so both hit the same
// endpoints, honour the same rate limits, and read from the same cache. Every
// response is cached to .gravity-v4-cache/ (gitignored), which makes reruns
// deterministic and lets `--offline` work with no network at all.
//
// Nothing here interprets hockey; it fetches and projects. The reconstruction
// logic lives in core.ts and stays pure.

import fs from "fs";
import path from "path";
import type { PbpEvent, PositionCode, RosterSpot } from "./core";
import { parseClock } from "./core";

export const CACHE_DIR = path.join(process.cwd(), ".gravity-v4-cache");

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export const scheduleUrl = (date: string) => `https://api-web.nhle.com/v1/schedule/${date}`;
export const shiftsUrl = (gameId: number) =>
  `https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=${gameId}`;
export const pbpUrl = (gameId: number) =>
  `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`;

export interface FetcherOptions {
  offline?: boolean;
  /** Per-request floor for api-web.nhle.com, which rate-limits harder. */
  apiWebGapMs?: number;
  /** Per-request floor for api.nhle.com (the shift charts). */
  apiGapMs?: number;
}

/**
 * Returns a reason string when a payload is unusable, or null when it is fine.
 *
 * This exists because the NHL endpoints answer **HTTP 200 with an empty body**
 * under load rather than 429ing. Without a content check those empty responses
 * cache as if they were real data, and a game silently contributes nothing —
 * indistinguishable from a game that legitimately has no events.
 */
export type PayloadValidator = (payload: any) => string | null;

export type Fetcher = (key: string, url: string, validate?: PayloadValidator) => Promise<any>;

export const validShiftPayload: PayloadValidator = p =>
  Array.isArray(p?.data) && p.data.length > 0 ? null : "empty shiftcharts payload";

export const validPbpPayload: PayloadValidator = p =>
  !Array.isArray(p?.plays) || p.plays.length === 0 ? "play-by-play has no plays"
  : !Array.isArray(p?.rosterSpots) || p.rosterSpots.length === 0 ? "play-by-play has no rosterSpots"
  : p?.homeTeam?.id == null || p?.awayTeam?.id == null ? "play-by-play has no team ids"
  : null;

/**
 * Cached fetch with per-host pacing and content validation.
 *
 * api-web.nhle.com rate-limits noticeably harder than api.nhle.com, so each host
 * gets its own floor between requests plus a cooldown that ratchets up on 429
 * and relaxes again after a clean response. Requests must stay sequential —
 * firing two at once per game is what tripped the limiter originally.
 *
 * An invalid payload is retried like a transport error and is **never cached**.
 * A cache entry that fails validation is deleted and refetched, so a cache
 * poisoned by an earlier throttled run heals itself on the next online run
 * instead of silently producing an empty dataset forever.
 */
export function makeFetcher(opts: FetcherOptions = {}): Fetcher {
  const gapByHost: Record<string, number> = {
    "api-web.nhle.com": opts.apiWebGapMs ?? 450,
    "api.nhle.com": opts.apiGapMs ?? 400,
  };
  const lastHit: Record<string, number> = {};
  const cooldown: Record<string, number> = {};

  const pace = async (host: string) => {
    const gap = (gapByHost[host] ?? 300) + (cooldown[host] ?? 0);
    const since = Date.now() - (lastHit[host] ?? 0);
    if (since < gap) await wait(gap - since);
    lastHit[host] = Date.now();
  };

  return async function fetchCached(
    key: string, url: string, validate?: PayloadValidator,
  ): Promise<any> {
    const safe = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const body = path.join(CACHE_DIR, `${safe}.json`);

    if (fs.existsSync(body)) {
      let cached: any = null, reason: string | null = null;
      try { cached = JSON.parse(fs.readFileSync(body, "utf8")); }
      catch { reason = "cached payload is not valid JSON"; }
      if (!reason && validate) reason = validate(cached);
      if (!reason) return cached;
      if (opts.offline) throw new Error(`cached ${key}: ${reason}`);
      // Poisoned by an earlier throttled run — drop it and fetch again.
      fs.rmSync(body, { force: true });
    }
    if (opts.offline) throw new Error(`offline cache miss: ${key}`);

    const host = new URL(url).host;
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      await pace(host);
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20_000);
        let res: Response;
        try { res = await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(timer); }

        if (res.status === 429) {
          cooldown[host] = Math.min((cooldown[host] ?? 0) + 250, 2000);
          const retryAfter = Number(res.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 2000 * 2 ** attempt;
          if (attempt < 5) { await wait(waitMs); continue; }
        }
        if (res.status >= 500 && attempt < 5) { await wait(1000 * 2 ** attempt); continue; }
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

        const text = await res.text();
        const payload = JSON.parse(text);

        // An empty 200 is this API's quiet way of saying "slow down". Treat it
        // exactly like a 429: back the host off, retry, and do not cache it.
        const reason = validate?.(payload) ?? null;
        if (reason) {
          cooldown[host] = Math.min((cooldown[host] ?? 0) + 250, 2000);
          lastErr = new Error(`${reason} for ${url}`);
          if (attempt < 5) { await wait(1500 * 2 ** attempt); continue; }
          throw lastErr;
        }

        fs.writeFileSync(body, text);
        if (cooldown[host]) cooldown[host] = Math.max(0, cooldown[host] - 50);
        return payload;
      } catch (e) {
        lastErr = e;
        if (attempt < 5) await wait(1000 * 2 ** attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  };
}

/**
 * Walk the schedule forward from the season opener until `count` final
 * regular-season game ids are collected. Ids come back in schedule order, so a
 * larger `count` is a superset of a smaller one — reruns stay comparable.
 */
export async function collectGameIds(
  fetchCached: Fetcher, season: string, count: number,
): Promise<number[]> {
  const startYear = Number(season.slice(0, 4));
  const ids: number[] = [];
  const seen = new Set<number>();
  const cursor = new Date(Date.UTC(startYear, 9, 1)); // Oct 1
  for (let week = 0; week < 200 && ids.length < count; week++) {
    const date = cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    let payload: any;
    try { payload = await fetchCached(`schedule-${date}`, scheduleUrl(date)); } catch { continue; }
    for (const wk of payload?.gameWeek ?? []) {
      for (const g of wk?.games ?? []) {
        if (g?.gameType === 2 && (g.gameState === "OFF" || g.gameState === "FINAL")) {
          if (!seen.has(g.id)) { seen.add(g.id); ids.push(g.id); }
          if (ids.length >= count) break;
        }
      }
      if (ids.length >= count) break;
    }
  }
  return ids.slice(0, count);
}

export function rosterFromPbp(pbp: any):
  { roster: RosterSpot[]; homeTeamId: number; awayTeamId: number } {
  const roster: RosterSpot[] = (pbp?.rosterSpots ?? []).map((s: any) => ({
    playerId: s.playerId,
    teamId: s.teamId,
    positionCode: s.positionCode as PositionCode,
    fullName: `${s.firstName?.default ?? ""} ${s.lastName?.default ?? ""}`.trim(),
  }));
  return { roster, homeTeamId: pbp?.homeTeam?.id, awayTeamId: pbp?.awayTeam?.id };
}

/**
 * Project the play-by-play into the flat event shape the reconstruction and
 * emitter consume. A goal carries `scoringPlayerId`; other shot events carry
 * `shootingPlayerId`, so the shooter is read from whichever is present.
 */
export function eventsFromPbp(pbp: any): (PbpEvent & { xCoord: number | null })[] {
  return (pbp?.plays ?? []).map((p: any) => {
    const d = p?.details ?? {};
    return {
      period: p?.periodDescriptor?.number,
      sec: parseClock(p?.timeInPeriod) ?? -1,
      typeDescKey: p?.typeDescKey,
      situationCode: p?.situationCode ?? null,
      eventOwnerTeamId: d.eventOwnerTeamId ?? null,
      shooterId: d.scoringPlayerId ?? d.shootingPlayerId ?? null,
      xCoord: d.xCoord ?? null,
      yCoord: d.yCoord ?? null,
      zoneCode: d.zoneCode ?? null,
      homeScore: d.homeScore ?? null,
      awayScore: d.awayScore ?? null,
    };
  }).filter((e: PbpEvent) => e.period != null && e.sec >= 0);
}
