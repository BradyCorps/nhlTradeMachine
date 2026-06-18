"use client";
// ── StrandView — STRAND wrapper for Armchair GM ────────────────
// Computes traits from Asset + XNAVResult, then delegates rendering
// to StrandDisplay. The players page uses its own trait builder
// (computePlayerTraits) and also renders StrandDisplay directly.
//
// Why the split: StrandDisplay owns all rendering.
//                StrandView/computePlayerTraits own data normalisation.
import React from "react";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import { PLAYER_PEDIGREE, INJURY_RISK } from "@/app/lib/player-data";
import StrandDisplay, { StrandTrait } from "@/app/components/StrandDisplay";

function safe(n: number) { return isNaN(n) || !isFinite(n) ? 0 : n; }
const norm = (val: number, mn: number, mx: number) =>
  Math.max(0, Math.min(1, (val - mn) / (mx - mn)));

// ── Trait builder: Asset + XNAVResult → StrandTrait[] ────────
// Called by StrandView (Armchair GM). 10 traits: 5 OFF + 5 DEF.
export function buildAssetTraits(a: Asset, nav: XNAVResult): {
  off: StrandTrait[]; def: StrandTrait[]
} {
  const isD = a.position === "D";
  const ops = a.ops ?? null;
  const dps = a.dps ?? null;
  const psTotal = ops !== null && dps !== null ? ops + dps : null;
  const opsNorm = psTotal !== null && psTotal > 0 ? Math.max(0, Math.min(1, ops! / Math.max(psTotal, 1))) : null;
  const dpsNorm = psTotal !== null && psTotal > 0 ? Math.max(0, Math.min(1, dps! / Math.max(psTotal, 1))) : null;

  return {
    off: [
      { label: ops !== null ? "OPS" : "SCR",
        val: opsNorm ?? norm(safe(a.ptsPace), 0, isD ? 80 : 100),
        title: ops !== null ? `OPS ${ops.toFixed(1)} — Offensive Point Shares` : `Pts/82: ${a.ptsPace.toFixed(1)}`,
        ps: ops !== null ? ops.toFixed(1) : null },
      { label: "xG",   val: norm(safe(a.xGPace ?? 0), 0, isD ? 25 : 50),
        title: `xGoals: ${(a.xGPace ?? 0).toFixed(1)}/82` },
      { label: "NOIV", val: norm(safe(a.xgRelTM ?? 0), -12, 12),
        title: `xG% vs teammates: ${(a.xgRelTM ?? 0).toFixed(1)}` },
      { label: "TOI+", val: norm(safe(a.avgTOI), 10, 27),
        title: `Ice time: ${safe(a.avgTOI).toFixed(1)} min/gm` },
    ],
    def: [
      { label: dps !== null ? "DPS" : "DEF",
        val: dpsNorm ?? norm(nav.def, -60, 150),
        title: dps !== null ? `DPS ${dps.toFixed(1)} — Defensive Point Shares` : "Defensive NAV component",
        ps: dps !== null ? dps.toFixed(1) : null },
      { label: "SUPP", val: norm(-(a.xgaRelTM ?? 0), -1.5, 1.5),
        title: `xGA suppression vs teammates: ${(a.xgaRelTM ?? 0).toFixed(2)}` },
      { label: "Usage",  val: (a.qocIndex ?? 35) / 100,
        title: `QoC ${a.qocIndex ?? "—"}/100 — deployment difficulty (ice-time rank, PK share, d-zone starts)` },
      { label: "OZ",   val: a.dzPct != null ? 1 - norm(safe(a.dzPct), 0.3, 0.7) : 0.5,
        title: a.dzPct != null
          ? `OZ: ${((1-a.dzPct)*100).toFixed(0)}% offensive zone starts`
          : "Zone deployment unavailable",
        display: a.dzPct != null ? Math.round((1 - a.dzPct) * 100) : undefined,
        unavailable: a.dzPct == null },
    ],
  };
}

// ── Strand type label (computed from traits) ──────────────────
export function computeStrandType(
  offTraits: StrandTrait[], defTraits: StrandTrait[],
  ops: number | null, dps: number | null
): string {
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

// ── StrandView — Armchair GM entry point ───────────────────────
export default function StrandView({ asset, xnav, compareAsset, compareXnav }: {
  asset: Asset;
  xnav: XNAVResult;
  compareAsset?: Asset | null;
  compareXnav?: XNAVResult | null;
}) {
  const primary   = buildAssetTraits(asset, xnav);
  const secondary = compareAsset && compareXnav ? buildAssetTraits(compareAsset, compareXnav) : null;
  const strandType = computeStrandType(primary.off, primary.def, asset.ops ?? null, asset.dps ?? null);

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
      />
    </div>
  );
}
