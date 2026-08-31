// ── team-contention-snapshot.ts ────────────────────────────────────────────
//
// DATA-03: one carried, provenance-stamped contention record per team.
//
// THE GAP THIS EXISTS TO CLOSE
//
// Phase (standings tier), roster window (live-derived), present/future
// contention, and cap space are all real, already-computed values — but
// nothing carries them together. `computeContention` alone is called
// independently from four different places (Armchair GM's page, its sim
// dispatch hook, its analysis tabs, and the Teams page), each re-running the
// same math on its own roster/navMap slice with no shared record, no
// `asOf`, no `modelVersion`, and nothing to prove two surfaces reading the
// "same" team on the "same" day actually agree.
//
// HOW IT IS CLOSED — mirrors DATA-02's `valuation-snapshot.ts` exactly
//
// This module does not compute phase, window, contention, or cap space
// itself — it takes them as already-computed inputs (the same relationship
// `buildValuationSnapshot` has to `calcNAV`'s output) and wraps them into one
// content-addressed, immutable record. `snapshotId` hashes the inputs, the
// day, and the model version, so — exactly as with player valuations — any
// two callers holding the same inputs on the same day compute the identical
// id with no shared store required, and a changed input, model version, or
// day always produces a different one.
//
// `window` is computed by calling the existing `teamWindow()` reconciler
// rather than re-deriving it, so the snapshot's window can never disagree
// with what every other surface already shows — the literal "unexplained
// contradictory phase/window labels" acceptance line is satisfied by
// construction, not by convention.

import { createHash } from "crypto";
import { stableStringify } from "@/app/lib/valuation-snapshot";
import { XNAV_MODEL_VERSION } from "@/app/lib/data-context";
import { teamWindow } from "@/app/lib/team-window";
import type { ContentionQuadrantKey } from "@/app/armchair-gm/contention";

export interface TeamContentionScore {
  present: number;
  future: number;
  quadrant: ContentionQuadrantKey;
  presentLabel: string;
  futureLabel: string;
}

export interface TeamCapBreakdown {
  ltirUsed: number;
  deadCap: number;
  totalCapHit: number;
  bonuses: number;
}

export type TeamContentionCoverage = "full" | "partial" | "phase-only";

export interface TeamContentionSnapshot {
  /** Content-addressed — see module header. Never reused for a different read. */
  snapshotId: string;
  teamId: string;
  /** Calendar date (YYYY-MM-DD) the read was struck, not a cache-build timestamp. */
  asOf: string;
  modelVersion: string;
  /** Standings-tier phase — never overwritten by a live roster read. */
  phase: string;
  /**
   * Live roster-derived window, or null on a data-thin roster (see
   * `deriveTeamPhase`'s own qualified-player floor) — never fabricated.
   */
  rosterWindow: string | null;
  /** The one label a user actually sees — `teamWindow()`'s reconciliation. */
  window: string;
  /** Null only when the roster was too data-thin to score at all. */
  contention: TeamContentionScore | null;
  capSpace: number;
  /** Null when no richer breakdown is available — never fabricated as zero. */
  capBreakdown: TeamCapBreakdown | null;
  coverage: TeamContentionCoverage;
}

export interface TeamContentionInput {
  teamId: string;
  phase: string;
  rosterWindow: string | null;
  contention: TeamContentionScore | null;
  capSpace: number;
  capBreakdown: TeamCapBreakdown | null;
}

/** Calendar-day granularity — "the same snapshot ID for the same team/date". */
export function teamSnapshotDate(asOf: Date = new Date()): string {
  return asOf.toISOString().slice(0, 10);
}

export function buildTeamContentionSnapshotId(
  input: TeamContentionInput,
  asOfDate: string,
  modelVersion: string = XNAV_MODEL_VERSION,
): string {
  const digest = createHash("sha256")
    .update(stableStringify(input))
    .update("|").update(asOfDate)
    .update("|").update(modelVersion)
    .digest("hex");
  return `${input.teamId}-${asOfDate}-${digest.slice(0, 16)}`;
}

/**
 * "full" when both a live contention read and a real cap breakdown exist;
 * "phase-only" when neither does (the roster was too data-thin to score and
 * no cap breakdown was available) — the team-level analogue of
 * `ValuationCoverage`'s "contract-only".
 */
function resolveCoverage(input: TeamContentionInput): TeamContentionCoverage {
  const hasContention = input.contention != null;
  const hasCapBreakdown = input.capBreakdown != null;
  if (hasContention && hasCapBreakdown) return "full";
  if (hasContention || hasCapBreakdown) return "partial";
  return "phase-only";
}

/**
 * The one place a team's separately-computed phase/window/contention/cap
 * facts become a shareable, immutable record. Not wired into a single
 * choke point the way `calculateAssetNAV` is — no such point exists yet for
 * teams (each route/surface still builds its own team object) — so callers
 * build this directly from what they already have on hand.
 */
export function buildTeamContentionSnapshot(
  input: TeamContentionInput,
  asOfDate: string = teamSnapshotDate(),
  modelVersion: string = XNAV_MODEL_VERSION,
): TeamContentionSnapshot {
  return {
    snapshotId: buildTeamContentionSnapshotId(input, asOfDate, modelVersion),
    teamId: input.teamId,
    asOf: asOfDate,
    modelVersion,
    phase: input.phase,
    rosterWindow: input.rosterWindow,
    window: teamWindow({ phase: input.phase, rosterWindow: input.rosterWindow ?? undefined }),
    contention: input.contention,
    capSpace: input.capSpace,
    capBreakdown: input.capBreakdown,
    coverage: resolveCoverage(input),
  };
}
