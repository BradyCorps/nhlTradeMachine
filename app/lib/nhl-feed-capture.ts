// ── NHL feed capture — shared by the admin sync and the nightly cron ──
import { db } from "@/app/db/client";
import { nhlSnapshots } from "@/app/db/schema";
import { ensureNhlSnapshotTable } from "@/app/db/ensure-schema";
import { fetchPlayerLanding, fetchEdgeDetail, mapWithConcurrency } from "./nhl-player-feed";
import { activeSkaterIds, activeSkaterIdsForTeams, activePlayerById } from "@/app/lib/nhl-active-players";
import { TEAMS_DB } from "@/app/lib/db";

const NHL_HEADERS = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };

/** Snapshot source for a skater the NHL has no EDGE rows for this season.
 *  Distinct from "edge" so the read path (`latestEdgeSignalMap`) never sees a
 *  tombstone, and coverage can tell "asked, nothing there" from "never asked". */
export const NO_EDGE_DATA_SOURCE = "edge-none";

const ROSTER_URL = (team: string) => `https://api-web.nhle.com/v1/roster/${team.toUpperCase()}/current`;

/** A club's current roster, or null when the feed is unreachable. */
async function fetchRoster(team: string): Promise<any | null> {
  try {
    const res = await fetch(ROSTER_URL(team), { cache: "no-store", headers: NHL_HEADERS });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const rosterIds = (group: unknown): number[] =>
  ((group as Array<{ id?: number }> | undefined) ?? [])
    .map(p => p.id)
    .filter((n): n is number => Number.isFinite(n));

export async function rosterPlayerIds(team: string): Promise<number[]> {
  const roster = await fetchRoster(team);
  if (!roster) return [];
  return [...rosterIds(roster.forwards), ...rosterIds(roster.defensemen), ...rosterIds(roster.goalies)];
}

/** Goalie ids on a club's current roster — the seed the bundled CSV
 *  snapshot cannot give, because it predates this season's call-ups. */
export async function rosterGoalieIds(team: string): Promise<number[]> {
  const roster = await fetchRoster(team);
  return roster ? rosterIds(roster.goalies) : [];
}

export interface CaptureResult {
  requested: number;
  landingStored: number;
  edgeStored: number;
  failures: number[];
  day: string;
}

interface OneSkaterResult {
  /** The NHL returned landing OR edge facts — the player was reachable. */
  reached: boolean;
  landingStored: boolean;
  landingSkipped: boolean;
  edgeStored: boolean;
  edgeSkipped: boolean;
  /** edge returned facts the parser read (vs stored-but-unparsed). */
  edgeParsed: boolean;
  /** HTTP status of the edge fetch (0 = never got an answer). */
  edgeStatus: number;
  /** edge 404 — the NHL has no EDGE rows for this skater this season. */
  noEdgeData: boolean;
  /** an insert threw. */
  wrote_error: boolean;
}

/** Record that the NHL has no EDGE rows for this skater this season — one row
 *  per skater per season (upserted), so a full-league backfill does not leave
 *  coverage stuck at "0 of 1187" for everyone who has not been tracked. */
async function markNoEdgeData(playerId: number, season: number, name: string | null): Promise<void> {
  await db.insert(nhlSnapshots).values({
    id: `${playerId}-${season}-edge-none`,
    playerId,
    name,
    season,
    source: NO_EDGE_DATA_SOURCE,
    capturedAt: Date.now(),
    payload: "{}",
  }).onConflictDoUpdate({ target: nhlSnapshots.id, set: { capturedAt: Date.now() } });
}

/** Fetch + store one skater's landing and edge snapshots. Shared by the cron
 *  sync and the on-demand backfill so both count writes the same way — a real
 *  insert vs a same-day re-run — via `returning()` on the conflict clause. */
async function captureOneSkater(playerId: number, season: number, day: string): Promise<OneSkaterResult> {
  const [landing, edge] = await Promise.all([
    fetchPlayerLanding(playerId),
    fetchEdgeDetail(playerId, season),
  ]);
  const r: OneSkaterResult = {
    reached: false, landingStored: false, landingSkipped: false,
    edgeStored: false, edgeSkipped: false, edgeParsed: false,
    edgeStatus: edge.status, noEdgeData: false, wrote_error: false,
  };

  if (landing.facts && landing.raw) {
    r.reached = true;
    try {
      const w = await db.insert(nhlSnapshots).values({
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
      }).onConflictDoNothing().returning({ id: nhlSnapshots.id });
      if (w.length > 0) r.landingStored = true; else r.landingSkipped = true;
    } catch { r.wrote_error = true; }
  }

  if (edge.facts && edge.raw) {
    r.reached = true;
    r.edgeParsed = true;
    try {
      const w = await db.insert(nhlSnapshots).values({
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
      }).onConflictDoNothing().returning({ id: nhlSnapshots.id });
      if (w.length > 0) r.edgeStored = true; else r.edgeSkipped = true;
    } catch { r.wrote_error = true; }
  } else if (edge.status === 404) {
    r.noEdgeData = true;
    await markNoEdgeData(playerId, season, landing.facts?.name ?? activePlayerById(playerId)?.name ?? null).catch(() => {});
  }

  return r;
}

export async function capturePlayerSnapshots(playerIds: number[], season: number): Promise<CaptureResult> {
  await ensureNhlSnapshotTable();
  const ids = playerIds.slice(0, 120);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let landingStored = 0;
  let edgeStored = 0;
  const failures: number[] = [];

  await mapWithConcurrency(ids, 5, async (playerId) => {
    const r = await captureOneSkater(playerId, season, day);
    if (r.landingStored) landingStored++;
    if (r.edgeStored) edgeStored++;
    if (!r.reached) failures.push(playerId);
  });

  return { requested: ids.length, landingStored, edgeStored, failures, day };
}

// ── On-demand skater EDGE backfill ───────────────────────────────
// The nightly cron rotates four teams a night, so a fresh database has no
// skater EDGE rows for a week and a bit — and EDGE zone-time/speed/bursts are
// exactly the inputs the gravity model's NZ well reads, so gravity sits
// uncovered until they land. This is the same on-demand, resumable backfill
// the goalie EDGE pipeline got: the whole league in sliced batches, with a
// legible report and a 404 recorded rather than counted as a failure.

export interface SkaterCaptureFailure {
  playerId: string;
  name: string | null;
  /** `unreachable`: no landing and no edge answer. `write`: an insert threw. */
  reason: "unreachable" | "write";
  status?: number;
}

export interface SkaterEdgeCapture {
  eligible: number;
  requested: number;
  landingStored: number;
  edgeStored: number;
  /** Already captured today — the daily id collided, nothing written. */
  edgeSkipped: number;
  /** 404 — the NHL has no EDGE rows for this skater this season (expected for
   *  anyone not tracked); recorded as a tombstone, not a failure. */
  noEdgeData: string[];
  failures: SkaterCaptureFailure[];
  nextOffset: number | null;
  elapsedMs: number;
  day: string;
}

export interface SkaterCaptureOptions {
  playerIds?: Array<string | number>;
  teams?: string[];
  discover?: boolean;
  offset?: number;
  limit?: number;
  concurrency?: number;
}

/** Skater ids on a club's current roster — forwards + defensemen, the call-ups
 *  the bundled snapshot predates. */
export async function rosterSkaterIds(team: string): Promise<number[]> {
  const roster = await fetchRoster(team);
  if (!roster) return [];
  return [...rosterIds(roster.forwards), ...rosterIds(roster.defensemen)];
}

/** Skater ids on the live NHL rosters — the rookies the snapshot misses. */
export async function discoverSkaterIds(teams?: string[]): Promise<string[]> {
  const clubs = (teams?.length ? teams : TEAMS_DB.map(t => t.id)).map(t => t.toUpperCase());
  const lists = await Promise.all(clubs.map(rosterSkaterIds));
  return [...new Set(lists.flat().map(String))];
}

/** Ids to attempt, in a stable sorted order, after teams/explicit/slice. */
export function resolveSkaterIds(
  options: Pick<SkaterCaptureOptions, "playerIds" | "teams" | "offset" | "limit">,
  discovered: Array<string | number> = [],
): { ids: string[]; eligible: number; nextOffset: number | null } {
  const seed = options.playerIds ?? (options.teams ? activeSkaterIdsForTeams(options.teams) : activeSkaterIds());
  const all = [...new Set([...seed, ...discovered].map(String))].sort();
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const limit = options.limit == null ? all.length : Math.max(0, Math.trunc(options.limit));
  const ids = all.slice(offset, offset + limit);
  const consumed = offset + ids.length;
  return { ids, eligible: all.length, nextOffset: consumed < all.length ? consumed : null };
}

export async function backfillSkaterEdge(
  seasonId: string | number,
  options: SkaterCaptureOptions = {},
): Promise<SkaterEdgeCapture> {
  const startedAt = Date.now();
  const season = Number(seasonId);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const discovered = options.discover ? await discoverSkaterIds(options.teams).catch(() => []) : [];
  const { ids, eligible, nextOffset } = resolveSkaterIds(options, discovered);

  const failures: SkaterCaptureFailure[] = [];
  const noEdgeData: string[] = [];
  let landingStored = 0, edgeStored = 0, edgeSkipped = 0;

  await ensureNhlSnapshotTable().catch(() => {});

  await mapWithConcurrency(ids, Math.max(1, options.concurrency ?? 6), async (idStr) => {
    const playerId = Number(idStr);
    const r = await captureOneSkater(playerId, season, day);
    if (r.landingStored) landingStored++;
    if (r.edgeStored) edgeStored++;
    if (r.edgeSkipped) edgeSkipped++;
    if (r.noEdgeData) noEdgeData.push(idStr);
    if (r.wrote_error) {
      failures.push({ playerId: idStr, name: activePlayerById(idStr)?.name ?? null, reason: "write" });
    } else if (!r.reached && !r.noEdgeData) {
      failures.push({ playerId: idStr, name: activePlayerById(idStr)?.name ?? null, reason: "unreachable", status: r.edgeStatus });
    }
  });

  return {
    eligible, requested: ids.length, landingStored, edgeStored, edgeSkipped,
    noEdgeData, failures, nextOffset, elapsedMs: Date.now() - startedAt, day,
  };
}

export interface SkaterEdgeCoverage {
  season: number;
  /** Distinct skaters with an EDGE row this season. */
  skatersCaptured: number;
  /** Asked, and the NHL had nothing (404) — not yet tracked. */
  skatersWithoutEdgeData: number;
  skatersKnown: number;
  /** Known skaters in neither bucket — the number a backfill drives to zero. */
  skatersUnaccounted: number;
  edgeRows: number;
  lastCapturedAt: string | null;
}

/** Standing state of the skater EDGE pipeline — the gravity coverage denominator. */
export async function skaterEdgeCoverage(seasonId: string | number): Promise<SkaterEdgeCoverage> {
  const season = Number(seasonId);
  const known = activeSkaterIds();
  const coverage: SkaterEdgeCoverage = {
    season, skatersCaptured: 0, skatersWithoutEdgeData: 0,
    skatersKnown: known.length, skatersUnaccounted: known.length,
    edgeRows: 0, lastCapturedAt: null,
  };
  try {
    await ensureNhlSnapshotTable();
    const rows = await db.select({
      playerId: nhlSnapshots.playerId,
      capturedAt: nhlSnapshots.capturedAt,
      source: nhlSnapshots.source,
      season: nhlSnapshots.season,
    }).from(nhlSnapshots);

    const captured = new Set<number>();
    const empty = new Set<number>();
    let latest = 0;
    for (const row of rows) {
      if (row.season !== season) continue;
      if (row.source === "edge") {
        coverage.edgeRows++;
        captured.add(row.playerId);
        if (row.capturedAt > latest) latest = row.capturedAt;
      } else if (row.source === NO_EDGE_DATA_SOURCE) {
        empty.add(row.playerId);
      }
    }
    for (const id of captured) empty.delete(id);
    coverage.skatersCaptured = captured.size;
    coverage.skatersWithoutEdgeData = empty.size;
    coverage.skatersUnaccounted = known.filter(id => !captured.has(Number(id)) && !empty.has(Number(id))).length;
    coverage.lastCapturedAt = latest > 0 ? new Date(latest).toISOString() : null;
  } catch { /* feed table unavailable */ }
  return coverage;
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
