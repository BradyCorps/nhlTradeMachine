import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { nhlSnapshots } from "@/app/db/schema";
import { ensureNhlSnapshotTable } from "@/app/db/ensure-schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import { SEASON } from "@/app/lib/season-config";
import {
  fetchPlayerLanding,
  fetchEdgeDetail,
  mapWithConcurrency,
  missingPaths,
  LANDING_REQUIRED_PATHS,
  EDGE_REQUIRED_PATHS,
  LANDING_URL,
  EDGE_URL,
} from "@/app/lib/nhl-player-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A stable, always-rostered probe player for the drift check.
const CANARY_PLAYER_ID = 8478402; // Connor McDavid
const seasonId = () => Number(SEASON.nhleSeasonId);

// GET /api/admin/nhl-feed — source health check. Probes both endpoints
// with a canary player and reports any required field that vanished, so
// an upstream contract change (v1 → v2 someday) is caught in the admin
// panel instead of silently corrupting the feed.
export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const [landing, edge] = await Promise.all([
    fetchPlayerLanding(CANARY_PLAYER_ID),
    fetchEdgeDetail(CANARY_PLAYER_ID, seasonId()),
  ]);

  const landingMissing = landing.raw ? missingPaths(landing.raw, LANDING_REQUIRED_PATHS) : [...LANDING_REQUIRED_PATHS];
  const edgeMissing = edge.raw ? missingPaths(edge.raw, EDGE_REQUIRED_PATHS) : [...EDGE_REQUIRED_PATHS];

  let snapshotCount: number | null = null;
  try {
    await ensureNhlSnapshotTable();
    const rows = await db.select({ id: nhlSnapshots.id }).from(nhlSnapshots);
    snapshotCount = rows.length;
  } catch { /* table unavailable */ }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    season: seasonId(),
    landing: {
      url: LANDING_URL(CANARY_PLAYER_ID),
      reachable: landing.raw != null,
      parsed: landing.facts != null,
      missingFields: landingMissing,
      ok: landing.facts != null && landingMissing.length === 0,
    },
    edge: {
      url: EDGE_URL(CANARY_PLAYER_ID, seasonId()),
      reachable: edge.raw != null,
      parsed: edge.facts != null,
      missingFields: edgeMissing,
      ok: edge.facts != null && edgeMissing.length === 0,
    },
    snapshotCount,
  });
}

// POST /api/admin/nhl-feed — capture snapshots into the historical feed.
// Body: { team?: "EDM" } to sync one team's current roster, or
//       { ids?: number[] } for explicit NHL player ids (max 40/call so a
//       sync stays inside one serverless invocation).
export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({})) as { team?: string; ids?: number[] };
  await ensureNhlSnapshotTable();

  let ids: number[] = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isFinite(n)) : [];
  if (ids.length === 0 && body.team) {
    try {
      const res = await fetch(`https://api-web.nhle.com/v1/roster/${body.team.toUpperCase()}/current`, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      });
      if (res.ok) {
        const roster = await res.json();
        ids = [...(roster.forwards ?? []), ...(roster.defensemen ?? []), ...(roster.goalies ?? [])]
          .map((p: { id?: number }) => p.id)
          .filter((n: unknown): n is number => Number.isFinite(n));
      }
    } catch { /* roster unreachable */ }
  }
  ids = ids.slice(0, 40);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide { team } or { ids } — no players resolved." }, { status: 400 });
  }

  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const season = seasonId();
  let landingStored = 0;
  let edgeStored = 0;
  const failures: number[] = [];

  await mapWithConcurrency(ids, 5, async (playerId) => {
    const [landing, edge] = await Promise.all([
      fetchPlayerLanding(playerId),
      fetchEdgeDetail(playerId, season),
    ]);
    if (landing.facts && landing.raw) {
      await db.insert(nhlSnapshots).values({
        id: `${playerId}-${season}-landing-${day}`,
        playerId,
        name: landing.facts.name,
        season,
        source: "landing",
        capturedAt: Date.now(),
        gamesPlayed: landing.facts.gamesPlayed,
        goals: landing.facts.goals,
        assists: landing.facts.assists,
        points: landing.facts.points,
        shootingPctg: landing.facts.shootingPctg,
        payload: JSON.stringify(landing.raw),
      }).onConflictDoNothing().then(() => { landingStored++; }).catch(() => {});
    }
    if (edge.facts && edge.raw) {
      await db.insert(nhlSnapshots).values({
        id: `${playerId}-${season}-edge-${day}`,
        playerId,
        name: landing.facts?.name ?? null,
        season,
        source: "edge",
        capturedAt: Date.now(),
        gamesPlayed: edge.facts.gamesPlayed,
        ozPct: edge.facts.ozPct,
        hdShots: edge.facts.hdShots,
        hdShootingPct: edge.facts.hdShootingPct,
        hdFinishingDelta: edge.facts.hdFinishingDelta,
        payload: JSON.stringify(edge.raw),
      }).onConflictDoNothing().then(() => { edgeStored++; }).catch(() => {});
    }
    if (!landing.facts && !edge.facts) failures.push(playerId);
  });

  return NextResponse.json({
    ok: true,
    requested: ids.length,
    landingStored,
    edgeStored,
    failures,
    day,
    season,
  });
}
