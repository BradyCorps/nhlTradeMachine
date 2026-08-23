"use client";
// ── StrandView — STRAND wrapper for Armchair GM ────────────────
// Builds percentile rails from an Asset against the live league cohort, then
// delegates rendering to StrandDisplay. The dossier, the directory and the trade
// machine all read the SAME derivation now (strand-metrics.buildStrandPercentiles
// against the same-position ≥20 GP cohort), so a player's STRAND is identical
// wherever it is drawn — the old min-max index that disagreed with the percentile
// card is gone.
//
// Why the split: StrandDisplay owns all rendering. StrandView owns turning an
// Asset + the league cohort into rails.
import React from "react";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import StrandDisplay from "@/app/components/StrandDisplay";
import type { StrandTrait } from "@/app/lib/strand-traits";
import {
  buildStrandPercentiles,
  type PlayerLike,
  type StrandRail,
} from "@/app/lib/strand-metrics";
import { useStrandCohort } from "@/app/lib/use-strand-cohort";
import EdgeStrip from "@/app/components/EdgeStrip";

// ── Trait builder: Asset + league cohort → percentile rails ────
//
// One derivation for every surface. `buildStrandPercentiles` reads each rail's
// raw value off the asset, ranks it within the cohort (same position group,
// ≥20 GP), and greys the rail out honestly when the input is missing or the
// cohort is too thin — no manufactured 50th. Goalies get the 3×3 rails.
export function buildAssetTraits(
  asset: Asset,
  cohort: PlayerLike[],
): { off: StrandRail[]; def: StrandRail[] } {
  return buildStrandPercentiles(
    asset as unknown as PlayerLike,
    cohort,
    asset.position === "G",
  );
}

// ── Strand type label (computed from traits) ──────────────────
export function computeStrandType(
  offTraits: StrandTrait[], defTraits: StrandTrait[],
  ops: number | null, dps: number | null
): string {
  if (offTraits.length === 0 || defTraits.length === 0) return "UNAVAILABLE";
  const offAvg = offTraits.reduce((s, t) => s + t.val, 0) / offTraits.length;
  const defAvg = defTraits.reduce((s, t) => s + t.val, 0) / defTraits.length;
  const balance = Math.abs(offAvg - defAvg);
  const psRatio = ops != null && dps != null && (ops + dps) > 1
    ? ops / (ops + dps) : null;

  return psRatio !== null && psRatio > 0.70 && offAvg > 0.60              ? "OFFENSIVE FORCE"
    : psRatio !== null && psRatio > 0.60 && offAvg > 0.50                 ? "OFFENSIVE LEAN"
    : psRatio !== null && psRatio < 0.30 && defAvg > 0.55                 ? "DEFENSIVE ANCHOR"
    : psRatio !== null && psRatio < 0.40 && defAvg > 0.45                 ? "DEFENSIVE LEAN"
    : psRatio !== null && psRatio >= 0.40 && psRatio <= 0.60
        && offAvg > 0.58 && defAvg > 0.52                                 ? "ELITE TWO-WAY"
    : psRatio !== null && psRatio >= 0.38 && psRatio <= 0.62              ? "COMPLETE PLAYER"
    : (offAvg > 0.72 && defAvg > 0.60 && balance < 0.20)                 ? "ELITE TWO-WAY"
    : offAvg > defAvg + 0.15
      ? offAvg > 0.65 ? "OFFENSIVE FORCE" : "OFFENSIVE LEAN"
    : defAvg > offAvg + 0.15
      ? defAvg > 0.65 ? "DEFENSIVE ANCHOR" : "DEFENSIVE LEAN"
    : offAvg > 0.52 && defAvg > 0.52 ? "COMPLETE PLAYER"
    : "BALANCED";
}

// ── Shared loading placeholder ────────────────────────────────
// The percentile rails need the league cohort, which client surfaces fetch once
// (useStrandCohort). Until it lands, show this rather than a min-max shape that
// would snap to different numbers — the whole point of the unification is that a
// reader never sees two different STRANDs for one player.
export function StrandLoading({ height = 200 }: { height?: number }) {
  return (
    <div
      className="w-full flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.14em]"
      style={{ minHeight: height, color: "var(--ledger-ink-faint)" }}
      role="status"
    >
      Loading league percentiles…
    </div>
  );
}

// ── StrandView — Armchair GM entry point ───────────────────────
export default function StrandView({ asset, compareAsset }: {
  asset: Asset;
  /** Retained for call-site compatibility; the derivation no longer reads NAV. */
  xnav?: XNAVResult;
  compareAsset?: Asset | null;
  compareXnav?: XNAVResult | null;
}) {
  const { ready, cohortFor } = useStrandCohort();
  if (!ready) {
    return <div className="mt-1 mb-2"><StrandLoading /></div>;
  }

  const primary   = buildAssetTraits(asset, cohortFor(asset));
  const secondary = compareAsset ? buildAssetTraits(compareAsset, cohortFor(compareAsset)) : null;
  const strandType = asset.position === "G"
    ? "GOALTENDER"
    : computeStrandType(primary.off, primary.def, asset.ops ?? null, asset.dps ?? null);

  return (
    <div className="mt-1 mb-2">
      <StrandDisplay
        offTraits={primary.off}
        defTraits={primary.def}
        ops={asset.ops ?? null}
        dps={asset.dps ?? null}
        strandType={strandType}
        compareOff={secondary?.off}
        compareDef={secondary?.def}
        compareLabel={compareAsset?.name.split(" ").pop()}
        footer={<EdgeStrip asset={asset} heading={false} />}
      />
    </div>
  );
}
