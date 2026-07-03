import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { PRESS_BOX_POOL, DIVISIONS } from "@/app/data/press-box-pool";
import { makePlayerId } from "@/app/lib/player-identity";
import { TEAMS_DB } from "@/app/lib/db";
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

async function buildPool(): Promise<{ players: PressBoxPlayer[]; source: string }> {
  let rows: {
    id: string;
    teamId: string | null;
    age: number | null;
    draftYear: number | null;
    retired: boolean | null;
    excludeFromRoster: boolean | null;
  }[] = [];
  try {
    rows = await db
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
    return { players: PRESS_BOX_POOL, source: "static" };
  }
  if (rows.length === 0) return { players: PRESS_BOX_POOL, source: "static" };

  const byId = new Map(rows.map((r) => [r.id, r]));
  const players: PressBoxPlayer[] = [];
  for (const p of PRESS_BOX_POOL) {
    const row = byId.get(makePlayerId(p.name));
    if (!row) {
      players.push(p);
      continue;
    }
    if (row.retired || row.excludeFromRoster) continue;
    const dbTeam = row.teamId && DIVISIONS[row.teamId] ? row.teamId : null;
    players.push({
      ...p,
      team: dbTeam ?? p.team,
      teamName: dbTeam ? (TEAM_NAMES.get(dbTeam) ?? p.teamName) : p.teamName,
      division: dbTeam ? DIVISIONS[dbTeam] : p.division,
      age: row.age ?? p.age,
      draftYear: row.draftYear ?? p.draftYear,
    });
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
