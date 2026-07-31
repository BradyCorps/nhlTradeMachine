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
import StrandDisplay from "@/app/components/StrandDisplay";
import { node, type StrandTrait } from "@/app/lib/strand-traits";
import { resolveWorkload, workloadLabel, workloadTitle } from "@/app/lib/goalie-units";
import EdgeStrip from "@/app/components/EdgeStrip";

// ── Trait builders: Asset + XNAVResult → StrandTrait[] ────────
//
// Every node goes through `node()` from `app/lib/strand-traits.ts`, which
// takes the raw input and decides whether there was one. Do NOT pre-substitute
// a fallback (`value: x ?? 0`) — that is precisely the defect the helper
// exists to prevent, and it is how NOIV, SUPP and QoC came to render a
// confident 50 / 35 off no data at all.

export function buildAssetTraits(a: Asset, nav: XNAVResult): {
  off: StrandTrait[]; def: StrandTrait[]
} {
  if (a.position === "G") return buildGoalieTraits(a, nav);

  const isD = a.position === "D";
  const ops = a.ops ?? null;
  const dps = a.dps ?? null;
  const psTotal = ops !== null && dps !== null ? ops + dps : null;
  // NOTE: these are SHARES of a player's Point Shares, not ability percentiles.
  // An elite two-way forward's huge offence makes his defensive share small.
  // The labels say OPS/DPS and the tooltips say "share" for that reason; making
  // the whole rail one consistent scale is Tier 1, not Tier 0.
  const opsShare = psTotal !== null && psTotal > 0 ? ops! / psTotal : null;
  const dpsShare = psTotal !== null && psTotal > 0 ? dps! / psTotal : null;

  return {
    off: [
      ops !== null
        ? node({
            label: "OPS", value: opsShare, min: 0, max: 1,
            title: v => `OPS ${ops.toFixed(1)} — ${(v * 100).toFixed(0)}% of his Point Shares are offensive`,
            raw: () => `${ops.toFixed(1)} OPS`,
            absent: "Offensive Point Shares unavailable",
          })
        : node({
            label: "SCR", value: a.ptsPace ?? null, min: 0, max: isD ? 80 : 100,
            title: v => `Pts/82: ${v.toFixed(1)}`,
            raw: v => `${v.toFixed(0)} P/82`,
            absent: "Scoring pace unavailable",
          }),
      node({
        label: "xG", value: a.xGPace ?? null, min: 0, max: isD ? 25 : 50,
        title: v => `xGoals: ${v.toFixed(1)}/82`,
        raw: v => `${v.toFixed(0)} xG/82`,
        absent: "Expected goals unavailable",
      }),
      node({
        label: "NOIV", value: a.xgRelTM ?? null, min: -12, max: 12,
        title: v => `xG% vs teammates: ${v.toFixed(1)}`,
        raw: v => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
        absent: "On-ice xG relative to teammates unavailable",
      }),
      node({
        label: "TOI", value: a.avgTOI ?? null, min: 10, max: 27,
        title: v => `Ice time: ${v.toFixed(1)} min/gm`,
        raw: v => `${v.toFixed(1)} min`,
        absent: "Ice time unavailable",
      }),
    ],
    def: [
      // No fallback onto the NAV defensive component. That is a different
      // quantity on a different scale, and putting it here under a label the
      // reader cannot distinguish is worse than an honest gap.
      node({
        label: "DPS", value: dpsShare, min: 0, max: 1,
        title: v => `DPS ${dps!.toFixed(1)} — ${(v * 100).toFixed(0)}% of his Point Shares are defensive`,
        raw: () => `${dps!.toFixed(1)} DPS`,
        absent: "Defensive Point Shares unavailable",
      }),
      node({
        label: "SUPP", value: a.xgaRelTM != null ? -a.xgaRelTM : null, min: -1.5, max: 1.5,
        title: v => `Chance suppression vs teammates: ${v.toFixed(2)} (higher = stingier)`,
        raw: v => `${v >= 0 ? "+" : ""}${v.toFixed(2)} xGA`,
        absent: "Chance suppression relative to teammates unavailable",
      }),
      node({
        label: "QoC", value: a.qocIndex ?? null, min: 0, max: 100,
        title: v => `Quality of competition ${Math.round(v)}/100 — how tough his matchups are`,
        absent: "Quality of competition unavailable",
      }),
      node({
        label: "OZ", value: a.dzPct ?? null, min: 0.3, max: 0.7, invert: true,
        title: v => `OZ: ${((1 - v) * 100).toFixed(0)}% offensive zone starts`,
        raw: v => `${Math.round((1 - v) * 100)}% OZ`,
        absent: "Zone deployment unavailable",
      }),
    ],
  };
}

// Shared goalie trait model (3×3) — used by the Trade Machine / Armchair GM
// (Asset) and the players page (Player) so both read identically. Top rail =
// how well he stops it (GSAX · SV% · HDSV); bottom rail = how much & how tough
// (Workload · Shot volume · GAA). Every node is built from a real field and
// greys out honestly when the source is missing.
export function buildGoalieStrandTraits(g: {
  gsax?: number | null; savePct?: number | null;
  baselineHdsvPct?: number | null; gamesStarted?: number | null;
  startsKnown?: boolean; gamesPlayed?: number | null;
  games?: number | null; shotsPerGame?: number | null; gaa?: number | null;
}): { off: StrandTrait[]; def: StrandTrait[] } {
  const svPct = g.savePct ?? null;
  const spg   = g.shotsPerGame ?? null;
  // Real GAA — goals against per sixty minutes, computed at assembly from the
  // ice time MoneyPuck publishes.
  //
  // It used to be `(1 - svPct) * (spg ?? 30)`: goals per APPEARANCE, off an
  // invented shot rate when volume was missing, printed to two decimals under
  // the label "goals-against average". Both halves of that are fixed —
  // `goalie-units.ts` explains why the two figures diverge and for whom.
  const gaa = g.gaa ?? null;
  const workload = resolveWorkload({ gamesStarted: g.gamesStarted, gamesPlayed: g.gamesPlayed ?? g.games });

  return {
    off: [
      node({
        label: "GSAX", value: g.gsax ?? null, min: -15, max: 25,
        title: v => `GSAX ${v.toFixed(1)} — Goals Saved Above Expected`,
        raw: v => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
        absent: "Goals saved above expected unavailable",
      }),
      node({
        label: "SV%", value: svPct, min: 0.890, max: 0.935,
        title: v => `Save %: ${(v * 100).toFixed(1)}%`,
        raw: v => `${(v * 100).toFixed(1)}`,
        absent: "Save percentage unavailable",
      }),
      node({
        label: "HDSV", value: g.baselineHdsvPct ?? null, min: 0.780, max: 0.880,
        title: v => `High-Danger SV%: ${(v * 100).toFixed(1)}%`,
        raw: v => `${(v * 100).toFixed(1)}`,
        absent: "High-danger save % unavailable (no EDGE sample)",
      }),
    ],
    def: [
      node({
        // "GS" only when they really are starts. MoneyPuck publishes no starts
        // column, so for most goalies this is appearances and now says so.
        label: "WRKLD", value: workload.games > 0 ? workload.games : null, min: 10, max: 65,
        title: () => workloadTitle(workload),
        raw: () => workloadLabel(workload),
        absent: "Workload unavailable",
      }),
      node({
        label: "BUSY", value: spg, min: 24, max: 34,
        title: v => `Shots faced: ${v.toFixed(1)}/game`,
        raw: v => `${v.toFixed(1)}/gm`,
        absent: "Shot volume unavailable",
      }),
      node({
        label: "GAA", value: gaa, min: 2.0, max: 3.6, invert: true,
        title: v => `Goals-against average: ${v.toFixed(2)} per 60 minutes`,
        raw: v => `${v.toFixed(2)}`,
        absent: "Goals-against average unavailable — no goalie ice time on record",
      }),
    ],
  };
}

function buildGoalieTraits(a: Asset, _nav: XNAVResult): {
  off: StrandTrait[]; def: StrandTrait[]
} {
  return buildGoalieStrandTraits(a);
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

// ── StrandView — Armchair GM entry point ───────────────────────
export default function StrandView({ asset, xnav, compareAsset, compareXnav }: {
  asset: Asset;
  xnav: XNAVResult;
  compareAsset?: Asset | null;
  compareXnav?: XNAVResult | null;
}) {
  const primary   = buildAssetTraits(asset, xnav);
  const secondary = compareAsset && compareXnav ? buildAssetTraits(compareAsset, compareXnav) : null;
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
