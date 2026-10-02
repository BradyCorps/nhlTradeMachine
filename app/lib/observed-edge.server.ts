import { and, desc, eq } from "drizzle-orm";
import { db } from "@/app/db/client";
import { nhlSnapshots } from "@/app/db/schema";
import { EDGE_URL, GOALIE_EDGE_URL, fetchJsonWithStatus } from "@/app/lib/nhl-player-feed";
import { swrCache } from "@/app/lib/swr-cache";
import { swrStore } from "@/app/lib/swr-store";
import { observedCacheKey, observedSnapshotSource, type ObservedSelection } from "@/app/lib/observed-season";

type EdgeBody = Record<string, any>;
export function edgeMatches(raw: unknown, playerId: number, selection: ObservedSelection, stored = false): raw is EdgeBody {
  if (!raw || typeof raw !== "object") return false;
  const body = raw as EdgeBody;
  if (body.player?.id !== playerId || (!Number.isFinite(body.player?.gamesPlayed) || body.player.gamesPlayed < 0)) return false;
  if (body.player.headshot && !body.player.headshot.includes(`/nhl/${selection.season}/`)) return false;
  // Older stored payloads lack the options list; their qualified storage key is authoritative.
  return (stored && !body.seasonsWithEdgeStats) || body.seasonsWithEdgeStats?.some((s: any) =>
    s.id === Number(selection.season) && s.gameTypes?.includes(selection.gameType)) === true;
}
export async function readObservedEdge(playerId: number, selection: ObservedSelection, goalie = false) {
  const kind = goalie ? "goalie-detail" : "edge";
  const source = (goalie ? GOALIE_EDGE_URL : EDGE_URL)(playerId, selection.season, selection.gameType);
  const { value } = await swrCache({
    store: swrStore, key: observedCacheKey(selection, `${kind}:${playerId}`), freshSeconds: 300, staleSeconds: 300,
    isCacheable: value => value.coverage === "available" || value.coverage === "zero-games",
    build: async () => {
      // Read only. Public requests neither create tables nor capture/repair records.
      const rows = await db.select({ payload: nhlSnapshots.payload, capturedAt: nhlSnapshots.capturedAt })
        .from(nhlSnapshots).where(and(eq(nhlSnapshots.playerId, playerId), eq(nhlSnapshots.season, Number(selection.season)),
          eq(nhlSnapshots.source, observedSnapshotSource(kind, selection.gameType))))
        .orderBy(desc(nhlSnapshots.capturedAt)).limit(1).catch(() => []);
      // Current-season captures can lag the nightly rotation. Query the explicit upstream path.
      // Historical stored snapshots are preserved and preferred; no other season is a fallback.
      if (selection.season === "20252026" && rows[0]) {
        try {
          const raw: unknown = JSON.parse(rows[0].payload);
          if (edgeMatches(raw, playerId, selection, true)) return { ...selection, playerId, raw,
            source: "snapshot", capturedAt: rows[0].capturedAt, coverage: raw.player.gamesPlayed === 0 ? "zero-games" : "available" };
        } catch { /* An invalid snapshot is never substituted for the requested feed. */ }
      }
      const response = await fetchJsonWithStatus(source);
      if (response.status === 200 && edgeMatches(response.data, playerId, selection)) {
        return { ...selection, playerId, raw: response.data, source, capturedAt: Date.now(),
          coverage: response.data.player.gamesPlayed === 0 ? "zero-games" : "available" };
      }
      return { ...selection, playerId, raw: null, source, capturedAt: Date.now(),
        coverage: response.status === 404 ? "missing" : "unavailable" };
    },
  });
  if (value.season !== selection.season || value.gameType !== selection.gameType || value.playerId !== playerId) {
    return { ...selection, playerId, raw: null, source, capturedAt: Date.now(), coverage: "unavailable" };
  }
  return value;
}

if (typeof window !== "undefined") throw new Error("Observed statistics readers require a server runtime");
