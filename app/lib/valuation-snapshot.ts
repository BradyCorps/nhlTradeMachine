// ── valuation-snapshot.ts ────────────────────────────────────────────────
//
// DATA-02: one immutable valuation snapshot across all surfaces.
//
// THE BUG THIS EXISTS TO CLOSE
//
// V-04 found that McDavid and Thompson reconciled numerically across routes
// on the day it was run, but the result carried no `valuation_snapshot_id`,
// model version, input timestamp, contract snapshot, uncertainty, or
// coverage — the only timestamp was an undisplayed cache `generatedAt`, and
// five surfaces independently recompute through the same engine rather than
// reading one recorded result. The observed equality was therefore
// coincidence, not a contract: nothing made it true, and nothing would have
// caught it silently going false.
//
// HOW IT IS CLOSED
//
// A `valuationSnapshotId` is CONTENT-ADDRESSED: it hashes the exact engine
// inputs, the model version, and the day the valuation was struck. This
// makes the guarantee structural instead of aspirational —
//
//   • immutable by construction: the id names the inputs, so it cannot ever
//     be reattached to a different total, component set, or contract;
//   • reproducible without a shared store: any surface holding the same
//     inputs on the same day computes the identical id, so "the same
//     snapshot ID for the same player/date" holds even before a persisted
//     snapshot table exists (that stateful service is DATA-06's job);
//   • self-invalidating: a changed input, a changed model version, or a new
//     day produces a different id automatically — nothing to remember to
//     bust.
//
// This module wraps `calculateAssetNAV`'s boundary (see asset-nav.ts) rather
// than the engine itself, so calcSkaterNAV/calcGoalieNAV/etc. stay pure and
// their extensive direct unit tests are untouched.

import { createHash } from "crypto";
import type { AssetInput, XNAVResult } from "@/app/lib/xnav-engine";
import { XNAV_MODEL_VERSION } from "@/app/lib/data-context";

export interface ValuationContractSnapshot {
  capHit: number;
  yearsRemaining: number;
  lastCapHit: number | null;
  expiresThisOffseason: boolean;
  extensionCapHit: number | null;
  extensionYears: number | null;
  retainedPct: number | null;
}

export interface ValuationUncertainty {
  /** The fitted model's own walk-forward error band around `marketValue`. */
  low: number;
  high: number;
}

export type ValuationCoverage = "full" | "partial" | "contract-only";

export interface ValuationSnapshot {
  /** Content-addressed — see module header. Never reused for a different valuation. */
  snapshotId: string;
  playerId: string;
  /** Calendar date (YYYY-MM-DD) the valuation was struck, not a cache-build timestamp. */
  asOf: string;
  modelVersion: string;
  total: number;
  components: XNAVResult["stages"];
  marketValue: number | null;
  /** `marketValue - contract.capHit`, null when no market price exists (picks/prospects). */
  surplus: number | null;
  /** Null — not zero — when the model produced no error band for this asset kind. */
  uncertainty: ValuationUncertainty | null;
  coverage: ValuationCoverage;
  contract: ValuationContractSnapshot;
}

/** Recursively sort object keys so the same inputs always hash the same way. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

/** Calendar-day granularity — "the same snapshot ID for the same player/date". */
export function snapshotDate(asOf: Date = new Date()): string {
  return asOf.toISOString().slice(0, 10);
}

export function buildValuationSnapshotId(
  asset: AssetInput,
  asOfDate: string,
  modelVersion: string = XNAV_MODEL_VERSION,
): string {
  const digest = createHash("sha256")
    .update(stableStringify(asset))
    .update("|").update(asOfDate)
    .update("|").update(modelVersion)
    .digest("hex");
  return `${asset.id}-${asOfDate}-${digest.slice(0, 16)}`;
}

/** "full" when the engine produced an explained breakdown, "contract-only" when it didn't. */
function resolveCoverage(result: XNAVResult): ValuationCoverage {
  if (!result.stages || result.stages.length === 0) return "contract-only";
  const hasNonContractStage = result.stages.some(
    (s) => s.key !== "cap" && s.key !== "youngFloor",
  );
  return hasNonContractStage ? "full" : "partial";
}

/**
 * The one place a raw-asset valuation becomes a shareable, immutable record.
 * Called from the `asset-nav.ts` boundary so every surface — Players, the
 * dossier, Teams, Trade Machine, Armchair GM, and (once wired) Fantasy —
 * that goes through `calculateAssetNAV` gets the same envelope for the same
 * inputs, without any of them recomputing what a snapshot is.
 */
export function buildValuationSnapshot(
  asset: AssetInput,
  result: XNAVResult,
  asOfDate: string = snapshotDate(),
  modelVersion: string = XNAV_MODEL_VERSION,
): ValuationSnapshot {
  const marketValue = typeof result.fmvAav === "number" ? result.fmvAav : null;
  return {
    snapshotId: buildValuationSnapshotId(asset, asOfDate, modelVersion),
    playerId: asset.id,
    asOf: asOfDate,
    modelVersion,
    total: result.total,
    components: result.stages,
    marketValue,
    surplus: marketValue == null ? null : Math.round((marketValue - asset.capHit) * 100) / 100,
    uncertainty:
      typeof result.fmvLow === "number" && typeof result.fmvHigh === "number"
        ? { low: result.fmvLow, high: result.fmvHigh }
        : null,
    coverage: resolveCoverage(result),
    contract: {
      capHit: asset.capHit,
      yearsRemaining: asset.yearsRemaining,
      lastCapHit: asset.lastCapHit ?? null,
      expiresThisOffseason: asset.expiresThisOffseason ?? false,
      extensionCapHit: asset.extensionCapHit ?? null,
      extensionYears: asset.extensionYears ?? null,
      retainedPct: asset.retainedPct ?? null,
    },
  };
}
