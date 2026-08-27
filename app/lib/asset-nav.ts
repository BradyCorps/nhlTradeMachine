// ── Canonical raw-asset → X-NAV boundary ────────────────────────────────
//
// Public roster payloads carry more fields than AssetInput and may use raw
// wing labels (L/R/LW/RW). Keep that transport concern here. The valuation
// engine remains strict, while every raw-asset surface crosses the same
// boundary and therefore cannot silently omit a newly added engine input.

import { SEASON } from "@/app/lib/season-config";
import { calcNAV, type AssetInput, type XNAVResult } from "@/app/lib/xnav-engine";
import { buildValuationSnapshot, snapshotDate } from "@/app/lib/valuation-snapshot";

type NullableAssetInput = {
  [K in keyof AssetInput]?: AssetInput[K] | null;
};

export type AssetNavSource = Omit<NullableAssetInput, "id" | "name" | "position"> & {
  id: string;
  name: string;
  position: string;
};

export function normalizeNavPosition(position: string): AssetInput["position"] {
  const normalized = position.trim().toUpperCase();
  if (normalized === "PICK") return "Pick";
  if (normalized === "C" || normalized === "D" || normalized === "G") return normalized;
  return "W";
}

/**
 * Convert a roster/API asset into the complete engine contract.
 *
 * Spreading first is deliberate: all existing and future engine inputs survive
 * unless this boundary explicitly normalizes them. The required scalar defaults
 * match the public request contract; optional evidence stays absent so the
 * engine can apply its own evidence gates rather than receive invented values.
 */
export function toAssetInput(
  asset: AssetNavSource,
  capCeiling = asset.capCeiling ?? SEASON.capCeiling,
): AssetInput {
  return {
    ...asset,
    id: asset.id,
    name: asset.name,
    position: normalizeNavPosition(asset.position),
    age: asset.age ?? 27,
    capHit: asset.capHit ?? 0,
    yearsRemaining: asset.yearsRemaining ?? 1,
    capCeiling,
  } as AssetInput;
}

/** The only public raw-asset valuation entry point. */
export function calculateAssetNAV(
  asset: AssetNavSource,
  capCeiling = asset.capCeiling ?? SEASON.capCeiling,
  asOfDate: string = snapshotDate(),
): XNAVResult {
  const input = toAssetInput(asset, capCeiling);
  const result = calcNAV(input);
  // Every caller of this boundary gets the same immutable envelope (DATA-02)
  // for the same inputs on the same day — see valuation-snapshot.ts.
  result.snapshot = buildValuationSnapshot(input, result, asOfDate);
  return result;
}
