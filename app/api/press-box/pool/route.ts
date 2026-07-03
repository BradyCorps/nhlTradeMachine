import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { PRESS_BOX_POOL, DIVISIONS } from "@/app/data/press-box-pool";
import { makePlayerId, safeNhlRosterPlayer } from "@/app/lib/player-identity";
import { TEAMS_DB } from "@/app/lib/db";
import { SEASON } from "@/app/lib/season-config";
import type { PressBoxPlayer } from "@/app/lib/press-box-engine";

export const dynamic = "force-dynamic";

// GET /api/press-box/pool
//
// The curated pool file owns *identity* (who is famous enough to deal, plus
// nationality and jersey number, which essentially never change). This route
// owns *currency*: team, age, and draft year are overlaid from the players
// table — the same synced source of truth the trade machine reads — so the
// daily hand stops going stale every time a star gets traded.
//
// Overlay rules are deliberately conservative because seeded DB rows carry
// teamId: null. A null team means "unknown", not "unsigned" — only a valid
// tricode replaces the curated team, and only retired/excluded rows drop a
// player from the pool.

const TEAM_NAMES = new Map(TEAMS_DB.map((t) => [t.id, t.name]));

interface CacheEntry { players: PressBoxPlayer[]; source: string; builtAt: number }
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — pool must stay stable within a day, fresh across days

const NHL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nhl.com",
  "Referer": "https://www.nhl.com/",
};

const fetchWithTimeout = (url: string, ms: number): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, cache: "no-store", headers: NHL_HEADERS }).finally(() => clearTimeout(t));
};

// name-key → mugshot URL from the live NHL rosters. Best-effort: an
// unreachable NHL API just means cards fall back to the flag face.
async function fetchHeadshots(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const results = await Promise.allSettled(
      TEAMS_DB.map((t) =>
        fetchWithTimeout(`https://api-web.nhle.com/v1/roster/${t.id}/current`, 5000)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() =>
            fetchWithTimeout(`https://api-web.nhle.com/v1/roster/${t.id}/${SEASON.nhleSeasonId}`, 5000)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
      )
    );
    for (const res of results) {
      if (res.status !== "fulfilled" || !res.value) continue;
      const roster = [...(res.value.forwards ?? []), ...(res.value.defensemen ?? []), ...(res.value.goalies ?? [])];
      for (const raw of roster) {
        const p = safeNhlRosterPlayer(raw);
        if (p?.headshot) map.set(makePlayerId(p.name), p.headshot);
      }
    }
  } catch (e) {
    console.warn("[press-box pool] headshot fetch skipped:", e instanceof Error ? e.message : e);
  }
  return map;
}

async function buildPool(): Promise<{ players: PressBoxPlayer[]; source: string }> {
  const readRows = async () => {
    try {
      return await db
        .select({
          id: playersTable.id,
          teamId: playersTable.teamId,
          age: playersTable.age,
          draftYear: playersTable.draftYear,
          retired: playersTable.retired,
          excludeFromRoster: playersTable.excludeFromRoster,
        })
        .from(playersTable);
    } catch (e) {
      console.warn("[press-box pool] DB read failed, serving curated pool:", e instanceof Error ? e.message : e);
      return [];
    }
  };
  const [headshots, rows] = await Promise.all([fetchHeadshots(), readRows()]);
  const withMug = (p: PressBoxPlayer): PressBoxPlayer => ({
    ...p,
    headshot: headshots.get(makePlayerId(p.name)) ?? null,
  });

  if (rows.length === 0) return { players: PRESS_BOX_POOL.map(withMug), source: "static" };

  const byId = new Map(rows.map((r) => [r.id, r]));
  const players: PressBoxPlayer[] = [];
  for (const p of PRESS_BOX_POOL) {
    const row = byId.get(makePlayerId(p.name));
    if (!row) {
      players.push(withMug(p));
      continue;
    }
    if (row.retired || row.excludeFromRoster) continue;
    const dbTeam = row.teamId && DIVISIONS[row.teamId] ? row.teamId : null;
    players.push(withMug({
      ...p,
      team: dbTeam ?? p.team,
      teamName: dbTeam ? (TEAM_NAMES.get(dbTeam) ?? p.teamName) : p.teamName,
      division: dbTeam ? DIVISIONS[dbTeam] : p.division,
      age: row.age ?? p.age,
      draftYear: row.draftYear ?? p.draftYear,
    }));
  }
  return { players, source: "db" };
}

export async function GET() {
  const now = Date.now();
  if (!cache || now - cache.builtAt > CACHE_TTL_MS) {
    const built = await buildPool();
    cache = { ...built, builtAt: now };
  }
  return NextResponse.json(
    { players: cache.players, source: cache.source, builtAt: cache.builtAt },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } }
  );
}
