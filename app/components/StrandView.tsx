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
import { computeStrandType } from "@/app/lib/strand-type";
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

// ── Strand type label ─────────────────────────────────────────
// Lives in strand-type.ts (pure, tested). Re-exported so call sites keep one import.
export { computeStrandType } from "@/app/lib/strand-type";

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
        ariaDescription={`${asset.name} roster STRAND`}
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
