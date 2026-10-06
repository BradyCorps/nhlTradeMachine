// Server loader for the dossier's STRAND-evolution panel. Reads only: one shared
// league summary per season (already SWR-cached for the stat strip), the player's
// EDGE row through the same cached reader the shot map uses, and stored
// checkpoints. No capture, no write, no per-viewer upstream request of its own.
import { db } from "@/app/db/client";
import { readObservedSummary } from "@/app/lib/observed-stats.server";
import { readObservedEdge } from "@/app/lib/observed-edge.server";
import type { ObservedSelection } from "@/app/lib/observed-season";
import { buildReferenceCohort } from "@/app/lib/strand-cohort-builder.server";
import { inputsFromSources, posGroupOf, readStoredCheckpoints } from "@/app/lib/strand-checkpoints.server";
import { STRAND_COHORT_MIN_GP } from "@/app/lib/strand-cohort";
import {
  buildEvolutionView, type CheckpointInputs, type EvolutionView, type ReferenceCohort, type StoredCheckpoint,
} from "@/app/lib/strand-evolution";

const PREVIOUS: Record<string, string | undefined> = { "20262027": "20252026" };

async function liveCohort(selection: ObservedSelection, group: "F" | "D"): Promise<ReferenceCohort | null> {
  const summary = await readObservedSummary(selection, "skater");
  if (summary.coverage !== "available") return null;
  const players = summary.rows
    .filter(r => posGroupOf(r.positionCode) === group)
    .map(r => inputsFromSources(r, null, selection.season));
  const cohort = buildReferenceCohort({
    season: selection.season, gameType: selection.gameType, posGroup: group, minGp: STRAND_COHORT_MIN_GP,
    players, capturedAt: summary.retrievedAt, source: "NHL stats summary, read live",
  });
  return cohort.n >= 10 ? cohort : null;
}

export async function loadStrandEvolution(player: { id: unknown; position: string }, selection: ObservedSelection): Promise<EvolutionView | null> {
  const group = posGroupOf(player.position);
  if (group == null || !/^\d+$/.test(String(player.id))) return null;
  const playerId = Number(player.id);

  const skaters = await readObservedSummary(selection, "skater");
  const row = skaters.rows.find(r => Number(r.playerId) === playerId);
  let latestInputs: CheckpointInputs | null = null;
  if (row) {
    const edge = await readObservedEdge(playerId, selection);
    latestInputs = inputsFromSources(row, edge.raw, selection.season);
  }
  const latestCohort = await liveCohort(selection, group);

  const previous = PREVIOUS[selection.season];
  let baselineInputs: CheckpointInputs | null = null, baselineCohort: ReferenceCohort | null = null;
  if (previous && selection.gameType === 2) {
    const baselineSel: ObservedSelection = { season: previous as ObservedSelection["season"], gameType: 2 };
    const baseSummary = await readObservedSummary(baselineSel, "skater");
    const baseRow = baseSummary.rows.find(r => Number(r.playerId) === playerId);
    if (baseRow) {
      const baseEdge = await readObservedEdge(playerId, baselineSel);
      baselineInputs = inputsFromSources(baseRow, baseEdge.raw, previous);
      baselineCohort = await liveCohort(baselineSel, group);
    }
  }

  let checkpoints: StoredCheckpoint[] = [];
  let storeUnavailable = false;
  if (selection.gameType === 2) {
    try { checkpoints = await readStoredCheckpoints(db as any, playerId, selection.season, 2); }
    catch { storeUnavailable = true; } // table absent until migration 0012 is applied
  }

  return buildEvolutionView({
    season: selection.season, gameType: selection.gameType,
    latestInputs, latestCapturedAt: skaters.retrievedAt || null, latestCohort,
    baselineSeason: previous && baselineInputs ? previous : null, baselineInputs, baselineCohort,
    checkpoints, storeUnavailable,
  });
}
