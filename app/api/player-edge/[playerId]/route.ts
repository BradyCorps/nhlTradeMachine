import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { nhlSnapshots } from "@/app/db/schema";
import { ensureNhlSnapshotTable } from "@/app/db/ensure-schema";
import { SEASON } from "@/app/lib/season-config";

export const dynamic = "force-dynamic";

// GET /api/player-edge/{nhlPlayerId} — the latest stored EDGE snapshot
// for a player, shaped for the shot-location tab. Public read: this is
// display data captured by the nightly feed; no snapshot yet → 404.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId: rawPlayerId } = await params;
  const playerId = Number(rawPlayerId);
  if (!Number.isFinite(playerId) || playerId <= 0) {
    return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
  }

  try {
    await ensureNhlSnapshotTable();
    const rows = await db.select({
      playerId: nhlSnapshots.playerId,
      season: nhlSnapshots.season,
      source: nhlSnapshots.source,
      capturedAt: nhlSnapshots.capturedAt,
      payload: nhlSnapshots.payload,
    }).from(nhlSnapshots);

    const season = Number(SEASON.nhleSeasonId);
    const latest = rows
      .filter((r) => r.playerId === playerId && r.source === "edge" && r.season === season)
      .sort((a, b) => b.capturedAt - a.capturedAt)[0];
    if (!latest) {
      return NextResponse.json({ error: "No EDGE snapshot for this player yet" }, { status: 404 });
    }

    const raw = JSON.parse(latest.payload);
    return NextResponse.json({
      playerId,
      season,
      capturedAt: latest.capturedAt,
      sogDetails: raw.sogDetails ?? [],
      sogSummary: raw.sogSummary ?? [],
      zoneTime: raw.zoneTimeDetails ?? null,
      speedMax: raw.skatingSpeed?.speedMax?.imperial ?? null,
      speedMaxPercentile: raw.skatingSpeed?.speedMax?.percentile ?? null,
      burstsOver20: raw.skatingSpeed?.burstsOver20?.value ?? null,
      topShotSpeed: raw.topShotSpeed?.imperial ?? null,
      distancePerGameMax: raw.distanceMaxGame?.imperial ?? null,
    }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    console.warn("[player-edge] read failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Snapshot store unavailable" }, { status: 503 });
  }
}
