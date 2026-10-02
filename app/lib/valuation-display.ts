import type { XNAVResult } from "@/app/lib/trade-types";

/** Presentation only: absence of model stages is not a calculated zero. */
export function navValueForDisplay(result?: XNAVResult | null): number | null {
  if (!result || result.snapshot?.coverage === "contract-only" || result.stages?.length === 0) return null;
  return Number.isFinite(result.total) ? result.total : null;
}

export function navLabelForDisplay(result?: XNAVResult | null): string {
  const value = navValueForDisplay(result);
  return value === null ? "Not priced" : Math.round(value).toLocaleString();
}

export function marketValueLabel(value?: number | null): string {
  return value == null || !Number.isFinite(value) ? "Not priced" : `$${value.toFixed(1)}M`;
}
