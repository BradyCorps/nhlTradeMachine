// ── strand-checkpoints.server.ts ─────────────────────────────────
//
// Capture and read immutable STRAND-evolution checkpoints.
//
// NOT WIRED TO ANYTHING. Nothing schedules `captureStrandCheckpoints`, no route
// calls it, and the tables it writes exist only after migration 0012 is applied.
// docs/strand-evolution-2026-10-06/README.md describes the future wiring. The
// database is injected so tests run against an isolated file and so this module
// never opens a connection of its own.
//
// RULES (all tested)
//   • Insert-only. Database triggers abort UPDATE and DELETE.
//   • A retry with identical content inserts nothing.
//   • A target already captured at a different GP is left alone: a later capture
//     is a later GP, not the same milestone.
//   • The same GP with different content (the source corrected itself) becomes a
//     NEW revision that names the row it supersedes. Nothing is overwritten.
//   • Never invents a checkpoint: no row is written unless `planMilestone` finds
//     the observed GP inside a milestone window. Missing milestones stay missing.

import { and, eq } from "drizzle-orm";
import { strandCheckpoints, strandReferenceCohorts } from "@/app/db/schema";
import { parseEdge } from "@/app/lib/nhl-player-feed";
import {
  EVOLUTION_DEFINITION_VERSION, MILESTONE_MAX_OVERSHOOT, EMPTY_INPUTS, planMilestone, traitValues, TRAIT_KEYS,
  type CheckpointInputs, type Milestone, type ReferenceCohort, type StoredCheckpoint,
} from "@/app/lib/strand-evolution";
import { buildReferenceCohort, sha256 } from "@/app/lib/strand-cohort-builder.server";

type Db = { insert: (...a: any[]) => any; select: (...a: any[]) => any; run: (q: any) => Promise<unknown> };

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const num = (v: unknown): number | null => (fin(v) ? v : null);

/** Cohort floor: skaters need at least this many games to be ranked against. */
export const END_COHORT_MIN_GP = 20;
export const cohortMinGpFor = (m: Milestone): number =>
  m === "END" ? END_COHORT_MIN_GP : Math.max(1, Number(m) - MILESTONE_MAX_OVERSHOOT);

export const posGroupOf = (code: unknown): "F" | "D" | null =>
  code === "G" ? null : code === "D" ? "D" : typeof code === "string" && code ? "F" : null;

/** One player's raw inputs from an NHL summary row and an optional EDGE payload. */
export function inputsFromSources(summaryRow: Record<string, unknown> | undefined, edgeRaw: unknown, season: string): CheckpointInputs {
  const edge = edgeRaw ? parseEdge(edgeRaw, Number(season)) : null;
  return {
    ...EMPTY_INPUTS,
    gp: num(summaryRow?.gamesPlayed),
    points: num(summaryRow?.points),
    toiSecondsPerGame: num(summaryRow?.timeOnIcePerGame),
    edgeGp: edge ? num(edge.gamesPlayed) : null,
    edgeShotsAll: edge ? num(edge.shotsAll) : null,
    edgeHdShots: edge ? num(edge.hdShots) : null,
    edgeOzPct: edge ? num(edge.ozPct) : null,
  };
}

export interface CaptureArgs {
  season: string;
  gameType: number;
  /** One league-wide NHL skater summary (a single upstream request, shared). */
  summaryRows: readonly Record<string, unknown>[];
  summaryRetrievedAt: number;
  /** Latest stored EDGE payload per player id, from nhl_snapshots. */
  edgeByPlayer: ReadonlyMap<number, { raw: unknown; capturedAt: number }>;
  now: number;
  seasonComplete?: boolean;
  /** Restrict to these players (e.g. tonight's rotation); the cohort still uses the whole league. */
  onlyPlayerIds?: ReadonlySet<number>;
}

export interface CaptureReport {
  considered: number;
  inserted: number;
  unchanged: number;
  corrected: number;
  noMilestone: number;
  cohortsInserted: number;
}

interface Existing { id: string; milestone: string; revision: number; observedGp: number; contentHash: string }

export async function captureStrandCheckpoints(db: Db, a: CaptureArgs): Promise<CaptureReport> {
  const report: CaptureReport = { considered: 0, inserted: 0, unchanged: 0, corrected: 0, noMilestone: 0, cohortsInserted: 0 };
  if (a.gameType !== 2) return report;

  const prior: Existing[] = await db.select({
    id: strandCheckpoints.id, milestone: strandCheckpoints.milestone, revision: strandCheckpoints.revision,
    observedGp: strandCheckpoints.observedGp, contentHash: strandCheckpoints.contentHash, playerId: strandCheckpoints.playerId,
  }).from(strandCheckpoints).where(and(eq(strandCheckpoints.season, a.season), eq(strandCheckpoints.gameType, a.gameType)));
  const latestByKey = new Map<string, Existing>();
  for (const r of prior as Array<Existing & { playerId: number }>) {
    const k = `${r.playerId}:${r.milestone}`;
    const cur = latestByKey.get(k);
    if (!cur || r.revision > cur.revision) latestByKey.set(k, r);
  }

  // Every skater's inputs once; the cohorts are built from the same pass.
  const league = a.summaryRows.flatMap(row => {
    const playerId = num(row.playerId), group = posGroupOf(row.positionCode);
    if (playerId == null || group == null) return [];
    const edge = a.edgeByPlayer.get(playerId);
    return [{ playerId, group, inputs: inputsFromSources(row, edge?.raw, a.season), edgeCapturedAt: edge?.capturedAt ?? null }];
  });

  const cohorts = new Map<string, ReferenceCohort>();
  const cohortFor = async (m: Milestone, group: "F" | "D"): Promise<ReferenceCohort> => {
    const key = `${m}:${group}`;
    const hit = cohorts.get(key);
    if (hit) return hit;
    const cohort = buildReferenceCohort({
      season: a.season, gameType: a.gameType, posGroup: group, minGp: cohortMinGpFor(m),
      players: league.filter(p => p.group === group).map(p => p.inputs),
      capturedAt: a.now, source: "NHL stats summary + latest stored NHL EDGE rows",
    });
    const written = await db.insert(strandReferenceCohorts).values({
      id: cohort.id, season: cohort.season, gameType: cohort.gameType, posGroup: cohort.posGroup,
      definitionVersion: cohort.definitionVersion, minGp: cohort.minGp, gpMin: cohort.gpMin, gpMax: cohort.gpMax, n: cohort.n,
      valuesJson: JSON.stringify(cohort.values),
      provenanceJson: JSON.stringify({ source: cohort.source, summaryRetrievedAt: a.summaryRetrievedAt }),
      capturedAt: cohort.capturedAt,
    }).onConflictDoNothing().returning({ id: strandReferenceCohorts.id });
    if (written.length > 0) report.cohortsInserted++;
    cohorts.set(key, cohort);
    return cohort;
  };

  for (const p of league) {
    if (a.onlyPlayerIds && !a.onlyPlayerIds.has(p.playerId)) continue;
    report.considered++;
    const gp = p.inputs.gp;
    // Which window is this GP in, ignoring what is already stored?
    const candidate = planMilestone({ gp: gp ?? 0, gameType: a.gameType, seasonComplete: a.seasonComplete, captured: new Set() });
    if (candidate.milestone == null) { report.noMilestone++; continue; }
    const m = candidate.milestone;
    const stored = latestByKey.get(`${p.playerId}:${m}`);
    if (stored && stored.observedGp !== gp) { report.noMilestone++; continue; } // later GP is not this milestone

    // The hash covers the player's own observation only. A retry later the same day
    // sees a slightly different league field; that must not read as a source
    // correction, and the cohort pinned to the original row stays as it was.
    const contentHash = sha256({
      playerId: p.playerId, season: a.season, gameType: a.gameType, milestone: m, observedGp: gp,
      definitionVersion: EVOLUTION_DEFINITION_VERSION, inputs: p.inputs,
    });
    if (stored && stored.contentHash === contentHash) { report.unchanged++; continue; }
    const cohort = await cohortFor(m, p.group);
    const missing = Object.fromEntries(TRAIT_KEYS.flatMap(k => { const t = traitValues(p.inputs)[k]; return t.missing ? [[k, t.missing]] : []; }));
    const revision = stored ? stored.revision + 1 : 0;
    const written = await db.insert(strandCheckpoints).values({
      id: `${p.playerId}:${a.season}:${a.gameType}:${m}:r${revision}`,
      playerId: p.playerId, season: a.season, gameType: a.gameType, milestone: m, revision,
      supersedesId: stored?.id ?? null, status: "observed", observedGp: gp!, posGroup: p.group,
      capturedAt: a.now, sourceAsOf: null, definitionVersion: EVOLUTION_DEFINITION_VERSION,
      inputsJson: JSON.stringify(p.inputs), missingJson: JSON.stringify(missing), cohortId: cohort.id,
      provenanceJson: JSON.stringify({
        summary: { report: "skater/summary", season: a.season, gameType: a.gameType, retrievedAt: a.summaryRetrievedAt },
        edge: p.edgeCapturedAt == null ? null : { table: "nhl_snapshots", capturedAt: p.edgeCapturedAt, lagBehindSummaryMs: a.summaryRetrievedAt - p.edgeCapturedAt },
        asOfNote: "NHL feeds carry no as-of timestamp; capturedAt is when this app read them.",
        plan: candidate.reason,
      }),
      contentHash,
    }).onConflictDoNothing().returning({ id: strandCheckpoints.id });
    if (written.length === 0) { report.unchanged++; continue; } // lost a race to an identical row
    if (stored) report.corrected++; else report.inserted++;
  }
  return report;
}

// ── Reading ──────────────────────────────────────────────────────

const parse = <T,>(text: string | null | undefined, fallback: T): T => {
  try { return text ? JSON.parse(text) as T : fallback; } catch { return fallback; }
};

/** All stored revisions for one player, each with its pinned cohort. */
export async function readStoredCheckpoints(db: Db, playerId: number, season: string, gameType: number): Promise<StoredCheckpoint[]> {
  const rows: any[] = await db.select().from(strandCheckpoints)
    .where(and(eq(strandCheckpoints.playerId, playerId), eq(strandCheckpoints.season, season), eq(strandCheckpoints.gameType, gameType)));
  const out: StoredCheckpoint[] = [];
  const cohortCache = new Map<string, ReferenceCohort | null>();
  for (const r of rows) {
    let cohort: ReferenceCohort | null = null;
    if (r.cohortId) {
      if (!cohortCache.has(r.cohortId)) {
        const c: any[] = await db.select().from(strandReferenceCohorts).where(eq(strandReferenceCohorts.id, r.cohortId));
        cohortCache.set(r.cohortId, c[0] ? {
          id: c[0].id, season: c[0].season, gameType: c[0].gameType, posGroup: c[0].posGroup,
          definitionVersion: c[0].definitionVersion, minGp: c[0].minGp, gpMin: c[0].gpMin, gpMax: c[0].gpMax, n: c[0].n,
          values: parse(c[0].valuesJson, { pts_gp: [], sog_gp: [], hd_sog_gp: [], toi_gp: [], oz_time: [] }),
          capturedAt: c[0].capturedAt, source: parse<{ source?: string }>(c[0].provenanceJson, {}).source ?? "",
        } : null);
      }
      cohort = cohortCache.get(r.cohortId) ?? null;
    }
    out.push({
      milestone: r.milestone, revision: r.revision, status: r.status, observedGp: r.observedGp,
      capturedAt: r.capturedAt, sourceAsOf: r.sourceAsOf,
      inputs: { ...EMPTY_INPUTS, ...parse<Partial<CheckpointInputs>>(r.inputsJson, {}) },
      cohort, provenance: parse(r.provenanceJson, {}),
    });
  }
  return out;
}

/** Latest stored EDGE payload per player — the caller's `edgeByPlayer`. Offline job use only. */
export async function latestStoredEdge(db: Db, nhlSnapshotsTable: any, season: number): Promise<Map<number, { raw: unknown; capturedAt: number }>> {
  const rows: any[] = await db.select({ playerId: nhlSnapshotsTable.playerId, capturedAt: nhlSnapshotsTable.capturedAt, payload: nhlSnapshotsTable.payload })
    .from(nhlSnapshotsTable).where(and(eq(nhlSnapshotsTable.season, season), eq(nhlSnapshotsTable.source, "edge")));
  const out = new Map<number, { raw: unknown; capturedAt: number }>();
  for (const r of rows) {
    const cur = out.get(r.playerId);
    if (cur && cur.capturedAt >= r.capturedAt) continue;
    out.set(r.playerId, { raw: parse(r.payload, null), capturedAt: r.capturedAt });
  }
  return out;
}

