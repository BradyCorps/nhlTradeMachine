// ── goalie-edge.ts — NHL EDGE goalie boards (PA3) ────────────────
// The EDGE API exposes league-wide goalie leaderboards rather than a
// per-goalie detail feed. We capture the audit-specified endpoints
// nightly alongside the skater snapshots:
//
//   goalie-landing/{season}/2
//   goalie-shot-location-top-10/{shots-against|goals-against|save-pctg|saves}/all/{season}/2
//   goalie-shot-location-top-10/goals-against/high/{season}/2
//
// One combined snapshot row per day (source "goalie-boards"), then
// latestGoalieBoardsMap() parses the latest row into per-goalie board
// appearances that roster assembly joins onto goalie assets.

import { db } from "@/app/db/client";
import { nhlSnapshots } from "@/app/db/schema";
import { ensureNhlSnapshotTable } from "@/app/db/ensure-schema";
import { fetchGoalieEdgeDetail, parseGoalieEdge, mapWithConcurrency } from "@/app/lib/nhl-player-feed";
import type { GoalieEdgeFacts } from "@/app/lib/nhl-player-feed";
import { activeGoalieIds, activeGoalieIdsForTeams, activePlayerById } from "@/app/lib/nhl-active-players";
import { rosterGoalieIds } from "@/app/lib/nhl-feed-capture";
import { TEAMS_DB } from "@/app/lib/db";

const NHL_HEADERS = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };
const EDGE_BASE = "https://api-web.nhle.com/v1/edge";

export interface GoalieBoardEntry {
  /** Which board: save-pctg | saves | shots-against | goals-against | goals-against-high */
  board: string;
  rank: number;
}

const BOARD_URLS = (season: string) => ({
  "landing":            `${EDGE_BASE}/goalie-landing/${season}/2`,
  "shots-against":      `${EDGE_BASE}/goalie-shot-location-top-10/shots-against/all/${season}/2`,
  "goals-against":      `${EDGE_BASE}/goalie-shot-location-top-10/goals-against/all/${season}/2`,
  "save-pctg":          `${EDGE_BASE}/goalie-shot-location-top-10/save-pctg/all/${season}/2`,
  "saves":              `${EDGE_BASE}/goalie-shot-location-top-10/saves/all/${season}/2`,
  "goals-against-high": `${EDGE_BASE}/goalie-shot-location-top-10/goals-against/high/${season}/2`,
});

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: "no-store", headers: NHL_HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface GoalieBoardsCapture {
  boardsFetched: number;
  stored: boolean;
  day: string;
}

/** Fetch all goalie EDGE boards and store one combined snapshot row. */
export async function captureGoalieEdgeBoards(seasonId: string): Promise<GoalieBoardsCapture> {
  const urls = BOARD_URLS(seasonId);
  const entries = await Promise.all(
    Object.entries(urls).map(async ([key, url]) => [key, await fetchJson(url)] as const),
  );
  const payload: Record<string, unknown> = {};
  let boardsFetched = 0;
  for (const [key, data] of entries) {
    if (data != null) { payload[key] = data; boardsFetched++; }
  }
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let stored = false;
  if (boardsFetched > 0) {
    try {
      await ensureNhlSnapshotTable();
      await db.insert(nhlSnapshots).values({
        id: `goalie-boards-${seasonId}-${day}`,
        playerId: 0,
        name: "GOALIE_EDGE_BOARDS",
        season: Number(seasonId),
        source: "goalie-boards",
        capturedAt: Date.now(),
        payload: JSON.stringify(payload),
      }).onConflictDoNothing();
      stored = true;
    } catch { /* table unavailable — capture is best-effort */ }
  }
  return { boardsFetched, stored, day };
}

// ── Per-goalie EDGE detail ───────────────────────────────────────
//
// The boards above rank the top ten at each location; this is the same
// data for EVERY goalie, one request each.
//
// TWO CALLERS, TWO SHAPES. The nightly cron takes one night's teams off
// an 8-day rotation, so it never asks for more than ~20 goalies and the
// whole league takes eight nights to land. The backfill (admin route and
// `scripts/backfill-goalie-edge.ts`) wants all 144 in one sitting, which
// is more than a 60s serverless invocation can promise — so the run is
// sliced by `offset`/`limit` and reports `nextOffset`, and a caller that
// has no clock (the script) just passes no limit and takes the lot.
//
// The RAW payload is what gets stored. `latestGoalieEdgeDetailMap` parses
// on read, so tightening the parser later re-reads every row already
// captured instead of stranding a season of history behind a bad guess.
//
// FAILURES ARE THE POINT. This pipeline had captured zero rows for weeks
// without anything saying so, because the cron's only report was a count
// nobody read. Every id that does not end in a stored row comes back
// named and with a reason, and `goalieEdgeCoverage` states the standing
// total against the 144 goalies we know about.

export interface GoalieCaptureFailure {
  playerId: string;
  /** From the bundled snapshot when known — a bare id is useless in a log. */
  name: string | null;
  /** `unreachable`: the NHL returned nothing. `write`: the insert threw. */
  reason: "unreachable" | "write";
  detail?: string;
}

export interface GoalieDetailCapture {
  /** Ids resolved before slicing — what a full backfill would cover. */
  eligible: number;
  /** Ids actually attempted in this run (`eligible` minus the slice). */
  requested: number;
  /** Rows newly written. */
  stored: number;
  /** Already captured today: the daily id collided, so nothing was written. */
  skipped: number;
  /** Stored payloads the parser read facts from. */
  parsed: number;
  /** Stored, but `parseGoalieEdge` returned null — a feed-shape warning. */
  unparsed: string[];
  failures: GoalieCaptureFailure[];
  /** Where a sliced caller resumes, or null when the run finished the list. */
  nextOffset: number | null;
  elapsedMs: number;
  day: string;
}

export interface GoalieCaptureOptions {
  /** Explicit ids. Skips both `teams` and the bundled snapshot. */
  playerIds?: Array<string | number>;
  /** Club abbreviations — the snapshot's goalies for those teams. */
  teams?: string[];
  /**
   * Union the resolved ids with the goalies on the live NHL rosters.
   * The bundled snapshot has no rookies, and a rookie goalie is exactly
   * the player whose dossier shows nothing, so a backfill that means to
   * be complete should ask. Costs 32 roster requests; degrades to the
   * snapshot alone if they fail.
   */
  discover?: boolean;
  /** Skip this many resolved ids — for resuming a sliced run. */
  offset?: number;
  /** Attempt at most this many ids. Omit to take the whole list. */
  limit?: number;
  /** Requests in flight. Five is friendly to the NHL and fits an invocation. */
  concurrency?: number;
}

/** Ids to attempt, in a stable order, after teams/explicit/slice resolution. */
export function resolveGoalieIds(
  options: Pick<GoalieCaptureOptions, "playerIds" | "teams" | "offset" | "limit">,
  discovered: Array<string | number> = [],
): { ids: string[]; eligible: number; nextOffset: number | null } {
  const seed = options.playerIds ?? (options.teams ? activeGoalieIdsForTeams(options.teams) : activeGoalieIds());
  // Sorted so a sliced run resumes against the same list it started on:
  // `offset` means nothing if the order can shift between invocations.
  const all = [...new Set([...seed, ...discovered].map(String))].sort();

  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const limit = options.limit == null ? all.length : Math.max(0, Math.trunc(options.limit));
  const ids = all.slice(offset, offset + limit);
  const consumed = offset + ids.length;
  return { ids, eligible: all.length, nextOffset: consumed < all.length ? consumed : null };
}

/** Goalie ids on the live NHL roster feeds — the rookies the snapshot misses. */
export async function discoverGoalieIds(teams?: string[]): Promise<string[]> {
  const clubs = (teams?.length ? teams : TEAMS_DB.map(t => t.id)).map(t => t.toUpperCase());
  const lists = await Promise.all(clubs.map(rosterGoalieIds));
  return [...new Set(lists.flat().map(String))];
}

/**
 * Capture `/edge/goalie-detail` for a set of goalies.
 *
 * Defaults to every goalie in the bundled active-player snapshot, which
 * has no rookies — pass `discover: true` (or explicit `playerIds`) when
 * the run is meant to be complete rather than nightly.
 */
export async function captureGoalieEdgeDetail(
  seasonId: string,
  options: GoalieCaptureOptions = {},
): Promise<GoalieDetailCapture> {
  const startedAt = Date.now();
  const season = Number(seasonId);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const discovered = options.discover
    ? await discoverGoalieIds(options.teams).catch(() => [])
    : [];
  const { ids, eligible, nextOffset } = resolveGoalieIds(options, discovered);

  const failures: GoalieCaptureFailure[] = [];
  const unparsed: string[] = [];
  let stored = 0;
  let skipped = 0;
  let parsed = 0;

  const fail = (playerId: string, reason: GoalieCaptureFailure["reason"], detail?: string) => {
    failures.push({ playerId, name: activePlayerById(playerId)?.name ?? null, reason, ...(detail ? { detail } : {}) });
  };

  await ensureNhlSnapshotTable().catch(() => {});

  await mapWithConcurrency(ids, Math.max(1, options.concurrency ?? 5), async (playerId) => {
    const { facts, raw } = await fetchGoalieEdgeDetail(playerId, season);
    if (raw == null) { fail(playerId, "unreachable"); return; }
    if (facts) parsed++; else unparsed.push(playerId);
    try {
      // `returning` is what separates a real write from a same-day re-run:
      // the conflict clause makes both resolve, and only one wrote a row.
      const written = await db.insert(nhlSnapshots).values({
        id: `${playerId}-${season}-goalie-detail-${day}`,
        playerId: Number(playerId),
        name: activePlayerById(playerId)?.name ?? null,
        season,
        source: "goalie-detail",
        capturedAt: Date.now(),
        gamesPlayed: facts?.gamesPlayed ?? null,
        payload: JSON.stringify(raw),
      }).onConflictDoNothing().returning({ id: nhlSnapshots.id });
      if (written.length > 0) stored++; else skipped++;
    } catch (e: any) {
      fail(playerId, "write", String(e?.message ?? e));
    }
  });

  return {
    eligible,
    requested: ids.length,
    stored,
    skipped,
    parsed,
    unparsed,
    failures,
    nextOffset,
    elapsedMs: Date.now() - startedAt,
    day,
  };
}

export interface GoalieEdgeCoverage {
  season: number;
  /** Distinct goalies with at least one detail row this season. */
  goaliesCaptured: number;
  /** Goalies in the bundled snapshot — the denominator a backfill targets. */
  goaliesKnown: number;
  rows: number;
  /** Most recent capture, ISO, or null when the pipeline has never run. */
  lastCapturedAt: string | null;
}

/**
 * Standing state of the goalie-detail pipeline.
 *
 * Exists so "capture has never run" is visible in the admin panel rather
 * than being inferred from empty dossier panels — which is how it went
 * unnoticed the first time.
 */
export async function goalieEdgeCoverage(seasonId: string): Promise<GoalieEdgeCoverage> {
  const season = Number(seasonId);
  const coverage: GoalieEdgeCoverage = {
    season,
    goaliesCaptured: 0,
    goaliesKnown: activeGoalieIds().length,
    rows: 0,
    lastCapturedAt: null,
  };
  try {
    await ensureNhlSnapshotTable();
    const rows = await db.select({
      playerId: nhlSnapshots.playerId,
      capturedAt: nhlSnapshots.capturedAt,
      source: nhlSnapshots.source,
      season: nhlSnapshots.season,
    }).from(nhlSnapshots);

    const seen = new Set<number>();
    let latest = 0;
    for (const r of rows) {
      if (r.source !== "goalie-detail" || r.season !== season) continue;
      coverage.rows++;
      seen.add(r.playerId);
      if (r.capturedAt > latest) latest = r.capturedAt;
    }
    coverage.goaliesCaptured = seen.size;
    coverage.lastCapturedAt = latest > 0 ? new Date(latest).toISOString() : null;
  } catch { /* feed table unavailable — reported as never captured */ }
  return coverage;
}

/** Latest per-goalie EDGE detail, keyed by NHL player id (string). */
export async function latestGoalieEdgeDetailMap(seasonId: string): Promise<Map<string, GoalieEdgeFacts>> {
  const map = new Map<string, GoalieEdgeFacts>();
  try {
    await ensureNhlSnapshotTable();
    const rows = await db.select({
      playerId: nhlSnapshots.playerId,
      capturedAt: nhlSnapshots.capturedAt,
      source: nhlSnapshots.source,
      season: nhlSnapshots.season,
      payload: nhlSnapshots.payload,
    }).from(nhlSnapshots);

    const season = Number(seasonId);
    const latest = new Map<number, { at: number; payload: string }>();
    for (const r of rows) {
      if (r.source !== "goalie-detail" || r.season !== season) continue;
      const prev = latest.get(r.playerId);
      if (prev && r.capturedAt <= prev.at) continue;
      latest.set(r.playerId, { at: r.capturedAt, payload: r.payload });
    }

    for (const [id, v] of latest) {
      try {
        const facts = parseGoalieEdge(JSON.parse(v.payload), season);
        if (facts) map.set(String(id), facts);
      } catch { /* one unparseable row must not sink the rest */ }
    }
  } catch { /* feed table unavailable — detail simply absent */ }
  return map;
}

// ── Tolerant board parsing ───────────────────────────────────────
// The EDGE leaderboard schema is not formally documented; entries are
// located by shape (any array whose objects carry a player id field),
// so a payload format shift degrades to "no data", never a crash.

const entryPlayerId = (e: any): number | null => {
  const cand = e?.playerId ?? e?.goalieId ?? e?.id ?? e?.player?.playerId ?? e?.player?.id;
  return typeof cand === "number" && Number.isFinite(cand) ? cand : null;
};

function collectEntries(node: unknown, out: any[], depth = 0): void {
  if (depth > 4 || node == null) return;
  if (Array.isArray(node)) {
    if (node.length > 0 && node.some(e => entryPlayerId(e) != null)) {
      out.push(...node.filter(e => entryPlayerId(e) != null));
      return;
    }
    for (const item of node) collectEntries(item, out, depth + 1);
    return;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) collectEntries(v, out, depth + 1);
  }
}

/** Latest per-goalie board appearances, keyed by NHL player id (string). */
export async function latestGoalieBoardsMap(seasonId: string): Promise<Map<string, GoalieBoardEntry[]>> {
  const map = new Map<string, GoalieBoardEntry[]>();
  try {
    await ensureNhlSnapshotTable();
    const rows = await db.select({
      capturedAt: nhlSnapshots.capturedAt,
      source: nhlSnapshots.source,
      season: nhlSnapshots.season,
      payload: nhlSnapshots.payload,
    }).from(nhlSnapshots);

    let latest: { at: number; payload: string } | null = null;
    const seasonNum = Number(seasonId);
    for (const r of rows) {
      if (r.source !== "goalie-boards" || r.season !== seasonNum) continue;
      if (!latest || r.capturedAt > latest.at) latest = { at: r.capturedAt, payload: r.payload };
    }
    if (!latest) return map;

    const payload = JSON.parse(latest.payload) as Record<string, unknown>;
    for (const [board, data] of Object.entries(payload)) {
      if (board === "landing") continue; // landing is league context, not a ranked board
      const entries: any[] = [];
      collectEntries(data, entries);
      entries.forEach((e, i) => {
        const pid = entryPlayerId(e);
        if (pid == null) return;
        const rank = typeof e?.rank === "number" ? e.rank : i + 1;
        const key = String(pid);
        const list = map.get(key) ?? [];
        list.push({ board, rank });
        map.set(key, list);
      });
    }
  } catch { /* feed table unavailable — boards simply absent */ }
  return map;
}
