// ── NHL feed capture — shared by the admin sync and the nightly cron ──
import { db } from "@/app/db/client";
import { nhlSnapshots } from "@/app/db/schema";
import { ensureNhlSnapshotTable } from "@/app/db/ensure-schema";
import { fetchPlayerLanding, fetchEdgeDetail, mapWithConcurrency } from "./nhl-player-feed";

const NHL_HEADERS = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };

export async function rosterPlayerIds(team: string): Promise<number[]> {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/roster/${team.toUpperCase()}/current`, {
      cache: "no-store",
      headers: NHL_HEADERS,
    });
    if (!res.ok) return [];
    const roster = await res.json();
    return [...(roster.forwards ?? []), ...(roster.defensemen ?? []), ...(roster.goalies ?? [])]
      .map((p: { id?: number }) => p.id)
      .filter((n: unknown): n is number => Number.isFinite(n));
  } catch {
    return [];
  }
}

export interface CaptureResult {
  requested: number;
  landingStored: number;
  edgeStored: number;
  failures: number[];
  day: string;
}

export async function capturePlayerSnapshots(playerIds: number[], season: number): Promise<CaptureResult> {
  await ensureNhlSnapshotTable();
  const ids = playerIds.slice(0, 120);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
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

  return { requested: ids.length, landingStored, edgeStored, failures, day };
}

export interface EdgeSignals {
  hdFinishingDelta: number | null;
  ozPct: number | null;
  ozPercentile: number | null;
  speedMaxMph: number | null;
  burstsOver20: number | null;
}

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const payloadSignals = (payload: string): Omit<EdgeSignals, "hdFinishingDelta"> => {
  try {
    const raw = JSON.parse(payload);
    return {
      ozPct: finiteOrNull(raw?.zoneTimeDetails?.offensiveZonePctg),
      ozPercentile: finiteOrNull(raw?.zoneTimeDetails?.offensiveZonePercentile),
      speedMaxMph: finiteOrNull(raw?.skatingSpeed?.speedMax?.imperial),
      burstsOver20: finiteOrNull(raw?.skatingSpeed?.burstsOver20?.value),
    };
  } catch {
    return { ozPct: null, ozPercentile: null, speedMaxMph: null, burstsOver20: null };
  }
};

/** Latest EDGE signals per NHL player id — joined onto rosters at read time
 *  so valuation, sim, and team presentation all consume the same snapshot. */
export async function latestEdgeSignalMap(season: number): Promise<Map<string, EdgeSignals>> {
  const map = new Map<string, EdgeSignals>();
  try {
    await ensureNhlSnapshotTable();
    const rows = await db.select({
      playerId: nhlSnapshots.playerId,
      capturedAt: nhlSnapshots.capturedAt,
      hdFinishingDelta: nhlSnapshots.hdFinishingDelta,
      ozPct: nhlSnapshots.ozPct,
      payload: nhlSnapshots.payload,
      source: nhlSnapshots.source,
      season: nhlSnapshots.season,
    }).from(nhlSnapshots);
    const latest = new Map<number, { at: number; signals: EdgeSignals }>();
    for (const r of rows) {
      if (r.source !== "edge" || r.season !== season) continue;
      const prev = latest.get(r.playerId);
      if (prev && r.capturedAt <= prev.at) continue;
      const fromPayload = payloadSignals(r.payload);
      latest.set(r.playerId, {
        at: r.capturedAt,
        signals: {
          hdFinishingDelta: finiteOrNull(r.hdFinishingDelta),
          ozPct: finiteOrNull(r.ozPct) ?? fromPayload.ozPct,
          ozPercentile: fromPayload.ozPercentile,
          speedMaxMph: fromPayload.speedMaxMph,
          burstsOver20: fromPayload.burstsOver20,
        },
      });
    }
    for (const [id, v] of latest) map.set(String(id), v.signals);
  } catch { /* feed table unavailable — signal simply absent */ }
  return map;
}

/** Back-compat helper for valuation and older call sites that only need the
 *  high-danger finishing luck signal. */
export async function latestEdgeLuckMap(season: number): Promise<Map<string, number>> {
  const signals = await latestEdgeSignalMap(season);
  const map = new Map<string, number>();
  for (const [id, s] of signals) {
    if (s.hdFinishingDelta != null) map.set(id, s.hdFinishingDelta);
  }
  return map;
}
