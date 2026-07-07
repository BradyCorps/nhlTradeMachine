"use client";
// ── EdgeStrip — NHL EDGE signal tiles for a player card ────────
// Surfaces the real EDGE snapshot fields carried on an Asset (skater:
// high-danger finishing luck, offensive-zone share, top skating speed,
// 20+ mph bursts; goalie: high-danger save % and goals saved above
// expected). Renders nothing when no EDGE signal is present, so it can
// be dropped into any card without guarding at the call site.
import React from "react";
import type { Asset } from "@/app/lib/trade-types";

type Tile = {
  label: string;
  value: string;
  color: string;
  title: string;
};

// A muted-to-strong tone so a glance reads good (green) / neutral (navy)
// / caution (red) without relying on the number alone.
const GOOD = "var(--ledger-green)";
const NEUTRAL = "var(--ledger-navy)";
const WARN = "var(--ledger-red)";
const FAINT = "var(--ledger-ink-faint)";

function skaterTiles(a: Asset): Tile[] {
  const tiles: Tile[] = [];
  const hd = a.hdFinishingDelta;
  if (hd != null) {
    // Cold finishing on quality chances = bounce-back candidate; hot = due to cool off.
    const cold = hd <= -0.02;
    const hot = hd >= 0.03;
    tiles.push({
      label: "HD Finish",
      value: `${hd > 0 ? "+" : ""}${(hd * 100).toFixed(1)}%`,
      color: cold ? GOOD : hot ? WARN : NEUTRAL,
      title: "NHL EDGE high-danger finishing vs league average. Cold shooters (green) are bounce-back candidates; hot shooters (red) are regression risks.",
    });
  }
  const oz = a.edgeOzPercentile ?? (a.edgeOzPct != null ? Math.round(a.edgeOzPct * 100) : null);
  if (a.edgeOzPct != null) {
    tiles.push({
      label: "OZ Time",
      value: `${(a.edgeOzPct * 100).toFixed(0)}%${a.edgeOzPercentile != null ? ` · ${a.edgeOzPercentile}%ile` : ""}`,
      color: (oz ?? 50) >= 55 ? GOOD : (oz ?? 50) <= 40 ? WARN : NEUTRAL,
      title: "NHL EDGE offensive-zone time share — how much of a player's ice time is spent attacking.",
    });
  }
  if (a.edgeSpeedMaxMph != null) {
    tiles.push({
      label: "Top Speed",
      value: `${a.edgeSpeedMaxMph.toFixed(1)} mph`,
      color: a.edgeSpeedMaxMph >= 22 ? GOOD : a.edgeSpeedMaxMph <= 19 ? WARN : NEUTRAL,
      title: "NHL EDGE max skating speed recorded this season.",
    });
  }
  if (a.edgeBurstsOver20 != null) {
    tiles.push({
      label: "20+ Bursts",
      value: `${a.edgeBurstsOver20}`,
      color: NEUTRAL,
      title: "NHL EDGE count of skating bursts over 20 mph — an explosiveness signal.",
    });
  }
  return tiles;
}

function goalieTiles(a: Asset): Tile[] {
  const tiles: Tile[] = [];
  if (a.baselineHdsvPct != null) {
    const pct = a.baselineHdsvPct * 100;
    tiles.push({
      label: "HD Save%",
      value: `${pct.toFixed(1)}%`,
      color: a.baselineHdsvPct >= 0.83 ? GOOD : a.baselineHdsvPct <= 0.80 ? WARN : NEUTRAL,
      title: "High-danger save percentage — stopping the chances that matter most (NHL EDGE danger zones).",
    });
  }
  if (a.gsax != null) {
    tiles.push({
      label: "GSAx",
      value: `${a.gsax > 0 ? "+" : ""}${a.gsax.toFixed(1)}`,
      color: a.gsax >= 0 ? GOOD : WARN,
      title: "Goals Saved Above Expected — save value over an average goalie facing the same shot quality.",
    });
  }
  // SV% and GS live in the conventional stat tiles; the EDGE strip keeps to
  // the danger-zone signals (HD save %, GSAx) so nothing is duplicated.
  return tiles;
}

export default function EdgeStrip({ asset, heading = true }: { asset: Asset; heading?: boolean }) {
  const tiles = asset.position === "G" ? goalieTiles(asset) : skaterTiles(asset);
  if (tiles.length === 0) return null;

  return (
    <div>
      {heading && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] font-mono" style={{ color: FAINT }}>
            NHL EDGE
          </span>
          <span className="h-px flex-1" style={{ background: "var(--ledger-rule-light)" }} />
        </div>
      )}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, minmax(0, 1fr))` }}>
        {tiles.map((tile) => (
          <div
            key={tile.label}
            title={tile.title}
            className="p-1.5 text-center"
            style={{ background: "var(--ledger-cream)", border: "1px solid #b8a070", borderTop: `2px solid ${tile.color}` }}>
            <div className="text-[10px] font-black uppercase tracking-tight font-mono" style={{ color: FAINT }}>
              {tile.label}
            </div>
            <div className="text-[13px] font-black font-mono" style={{ color: tile.color }}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
