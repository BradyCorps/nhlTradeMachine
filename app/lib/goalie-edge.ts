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
