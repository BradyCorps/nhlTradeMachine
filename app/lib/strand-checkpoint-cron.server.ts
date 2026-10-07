// ── strand-checkpoint-cron.server.ts ─────────────────────────────
//
// The Season profile evolution stage of the nightly NHL feed cron.
//
// UPSTREAM COST: it reads the league skater summary through the
// shared `readObservedSummary` (a cache miss/refresh can add one request, also used by the
// stat strip) and the EDGE rows the existing snapshot capture already stored. No
// league-wide EDGE refresh, no per-player request, no per-viewer write.
//
// SAFETY
//   • Writes off unless STRAND_CHECKPOINT_CAPTURE=1; authenticated dry runs can run while off.
//   • Never throws. A failure here returns a distinct status and the existing
//     feed capture response is unchanged apart from the extra `strandCheckpoints` key.
//   • Bounded: at most MAX_WRITES checkpoint rows, plus cohorts; one I/O deadline.
//   • Retry-safe: capture is idempotent (identical content inserts nothing).
//   • Missing data keeps its reason; EDGE values/percentiles are withheld by the
//     panel's alignment and coverage rules, which this stage does not relax.
//   • `seasonComplete` (the END checkpoint) is only ever set by an explicit
//     authenticated request (?strandEnd=1), never by the schedule.

import { nhlSnapshots } from "@/app/db/schema";
import { readObservedSummary } from "@/app/lib/observed-stats.server";
import { DEFAULT_OBSERVED_SELECTION, type ObservedSelection } from "@/app/lib/observed-season";
import { planMilestone } from "@/app/lib/strand-evolution";
import { captureStrandCheckpoints, latestStoredEdge, type CaptureReport } from "@/app/lib/strand-checkpoints.server";
import { checkpointBudget, CheckpointBudgetExceeded } from "@/app/lib/strand-checkpoint-budget.server";

export const MAX_WRITES = 300;
export const BUDGET_MS = 20_000;
export const RESPONSE_RESERVE_MS = 5_000;

export type StrandCaptureStatus = "disabled" | "ok" | "store-unavailable" | "summary-unavailable" | "budget-exhausted" | "failed";
export interface StrandCaptureOutcome {
  status: StrandCaptureStatus;
  dryRun?: boolean;
  report?: CaptureReport;
  /** True when no skater was inside a milestone window, so nothing was read or written. */
  idle?: boolean;
  error?: string;
}

type Db = Parameters<typeof captureStrandCheckpoints>[0];
export interface StrandCaptureDeps {
  db: Db;
  env?: Record<string, string | undefined>;
  selection?: ObservedSelection;
  readSummary?: typeof readObservedSummary;
  readEdge?: typeof latestStoredEdge;
  now?: () => number;
  /** Absolute checkpoint deadline, including time already spent in the route. */
  deadlineMs?: number;
  seasonComplete?: boolean;
  dryRun?: boolean;
}

const tableMissing = (e: unknown) =>
  /no such table: (main\.)?strand_/i.test(`${(e as any)?.message ?? ""} ${(e as any)?.cause?.message ?? ""}`);

export async function runStrandCheckpointCapture(d: StrandCaptureDeps): Promise<StrandCaptureOutcome> {
  const env = d.env ?? process.env;
  if (env.STRAND_CHECKPOINT_CAPTURE !== "1" && !d.dryRun) return { status: "disabled" };
  const selection = d.selection ?? DEFAULT_OBSERVED_SELECTION;
  const now = d.now ?? Date.now;
  const started = now();
  const deadlineMs = Math.min(started + BUDGET_MS, d.deadlineMs ?? Infinity);
  const budget = checkpointBudget(deadlineMs, now);
  try {
    const summary = await budget.run(() => (d.readSummary ?? readObservedSummary)(selection, "skater"));
    if (summary.coverage !== "available") return { status: "summary-unavailable", dryRun: d.dryRun };
    // Most nights nobody is inside a milestone window: skip the EDGE table read and write nothing.
    const anyInWindow = summary.rows.some(r => typeof r.gamesPlayed === "number"
      && planMilestone({ gp: r.gamesPlayed, gameType: selection.gameType, seasonComplete: d.seasonComplete, captured: new Set() }).milestone != null);
    if (!anyInWindow) return { status: "ok", dryRun: d.dryRun, idle: true,
      report: { considered: 0, inserted: 0, unchanged: 0, corrected: 0, noMilestone: 0, cohortsInserted: 0, deferred: 0 } };
    const edgeByPlayer = await budget.run(() => (d.readEdge ?? latestStoredEdge)(d.db, nhlSnapshots, Number(selection.season)));
    const report = await captureStrandCheckpoints(d.db, {
      season: selection.season, gameType: selection.gameType,
      summaryRows: summary.rows, summaryRetrievedAt: summary.retrievedAt,
      edgeByPlayer, now: started, seasonComplete: d.seasonComplete,
      maxWrites: MAX_WRITES, deadlineMs, clock: now, dryRun: d.dryRun,
    });
    return { status: "ok", dryRun: d.dryRun, report };
  } catch (e) {
    return { status: e instanceof CheckpointBudgetExceeded ? "budget-exhausted" : tableMissing(e) ? "store-unavailable" : "failed", dryRun: d.dryRun, error: String((e as any)?.message ?? e).slice(0, 300) };
  }
}
