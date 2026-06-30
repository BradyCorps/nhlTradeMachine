import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import type { TeamStrandData } from "@/app/components/TeamStrand";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const norm = (value: number, min: number, max: number) => clamp01((value - min) / (max - min));

export function computeRosterStrand(roster: Asset[], navMap: Record<string, XNAVResult>): TeamStrandData | null {
  const fwds = roster
    .filter(p => ["C", "W", "L", "R"].includes(p.position) && p.hasLiveStats && (p.games ?? 0) >= 20)
    .sort((a, b) => (b.avgTOI ?? 0) - (a.avgTOI ?? 0))
    .slice(0, 9);
  const dmen = roster
    .filter(p => p.position === "D" && p.hasLiveStats && (p.games ?? 0) >= 20)
    .sort((a, b) => (b.avgTOI ?? 0) - (a.avgTOI ?? 0))
    .slice(0, 4);
  const qualified = [...fwds, ...dmen];
  if (qualified.length === 0) return null;

  const safe = (v: number | null | undefined) => v ?? 0;
  const totals = {
    off: { OPS: 0, xG: 0, NOIV: 0, TOI: 0 },
    def: { DPS: 0, SUPP: 0, Usage: 0, OZ: 0 },
  };

  for (const p of qualified) {
    const isD = p.position === "D";
    const xnav = navMap[p.id];
    totals.off.OPS += p.ops != null ? norm(p.ops, 0, 7) : norm(safe(p.ptsPace), 0, isD ? 80 : 100);
    totals.off.xG += norm(safe(p.xGPace), 0, isD ? 25 : 50);
    totals.off.NOIV += norm(safe(p.xgRelTM), -12, 12);
    totals.off.TOI += norm(safe(p.avgTOI), 10, 27);
    totals.def.DPS += p.dps != null ? norm(p.dps, 0, 4.5) : norm(xnav?.def ?? 0, -60, 150);
    totals.def.SUPP += norm(-(p.xgaRelTM ?? 0), -1.5, 1.5);
    totals.def.Usage += norm(p.qocIndex ?? 35, 0, 100);
    totals.def.OZ += p.dzPct != null ? 1 - norm(safe(p.dzPct), 0.3, 0.7) : 0.5;
  }

  const n = qualified.length;
  return {
    off: { OPS: totals.off.OPS / n, xG: totals.off.xG / n, NOIV: totals.off.NOIV / n, TOI: totals.off.TOI / n },
    def: { DPS: totals.def.DPS / n, SUPP: totals.def.SUPP / n, Usage: totals.def.Usage / n, OZ: totals.def.OZ / n },
  };
}
