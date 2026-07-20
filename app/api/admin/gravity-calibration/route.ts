import { NextResponse } from "next/server";
import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import { computeGravity } from "@/app/lib/gravity";

export const dynamic = "force-dynamic";

// ── Gravity calibration report ───────────────────────────────────
// Computes the REAL per-position distribution (mean/σ/percentiles) of
// every gravity input from the live league population, plus force
// percentiles under the current constants. The `suggestedCal` block is
// shaped to paste directly over the CAL table in app/lib/gravity.ts,
// and `suggestedTiers` derives cutoffs from actual force percentiles
// instead of hand estimates. Run once a season (or after a data-source
// change), eyeball `top25` for sanity, then apply.

type Num = number | null | undefined;

function stats(values: number[]) {
  const n = values.length;
  if (n === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n) || 1;
  const pct = (p: number) => sorted[Math.min(n - 1, Math.max(0, Math.round((p / 100) * (n - 1))))];
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { n, mean: r(mean), sd: r(sd), p5: r(pct(5)), p50: r(pct(50)), p95: r(pct(95)) };
}

export async function GET() {
  const roster = await assembleCanonicalRoster();
  const skaters = (roster.players as any[]).filter(
    p => p.position !== "G" && p.position !== "Pick" && (p.games ?? 0) >= 20,
  );

  // The same input transforms the engine uses — keep in sync with gravity.ts.
  const inputs: Record<string, (p: any) => Num> = {
    lift: p => {
      const cur = p.xgRelTM;
      const base = p.baselineXgRel != null ? p.baselineXgRel * 100 : null;
      if (cur == null && base == null) return null;
      return base != null ? (cur ?? 0) * 0.4 + base * 0.6 : cur;
    },
    assistsPace: p => p.assistsPace,
    ixg82: p => ((p.baselineIxg82 ?? 0) > 0 ? p.baselineIxg82 : p.goalsPace),
    ppPts82: p => p.ppPtsPace82,
    displacement: p => {
      if (p.edgeOzPct == null) return null;
      const dzStarts = p.dzPct ?? 0.5;
      return p.edgeOzPct - (0.43 + 0.25 * (0.5 - dzStarts));
    },
    speedMax: p => p.edgeSpeedMaxMph,
    bursts82: p => (p.edgeBurstsOver20 != null && p.games ? (p.edgeBurstsOver20 / p.games) * 82 : null),
    xgaSupp: p => (p.xgaRelTM != null ? -p.xgaRelTM : null),
    dps: p => p.dps,
    pkShare: p => p.pkTimeShare,
    toi: p => p.avgTOI,
  };

  const byPos: Record<"F" | "D", any> = { F: {}, D: {} };
  for (const group of ["F", "D"] as const) {
    const pool = skaters.filter(p => (group === "D") === (p.position === "D"));
    for (const [key, fn] of Object.entries(inputs)) {
      const vals = pool.map(fn).filter((v): v is number => v != null && Number.isFinite(v));
      byPos[group][key] = stats(vals);
    }
  }

  // Force distribution under CURRENT constants
  const forces = skaters
    .map(p => ({ name: p.name, position: p.position, teamId: p.teamId, g: computeGravity(p) }))
    .filter(x => x.g !== null)
    .map(x => ({ name: x.name, position: x.position, teamId: x.teamId, force: x.g!.force, masses: x.g!.masses, tier: x.g!.tier }))
    .sort((a, b) => b.force - a.force);

  const forceVals = forces.map(f => f.force);
  const fstats = stats(forceVals)!;
  const sortedF = [...forceVals].sort((a, b) => a - b);
  const pct = (p: number) => sortedF[Math.min(sortedF.length - 1, Math.round((p / 100) * (sortedF.length - 1)))];
  const r2 = (v: number) => Math.round(v * 100) / 100;

  const tierCounts: Record<string, number> = {};
  for (const f of forces) tierCounts[f.tier] = (tierCounts[f.tier] ?? 0) + 1;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    population: { qualifiedSkaters: skaters.length, withGravity: forces.length },
    // Paste-ready: mean/sd per input per position for the CAL table
    suggestedCal: {
      F: Object.fromEntries(Object.entries(byPos.F).map(([k, s]: [string, any]) =>
        [k, s ? { mean: s.mean, sd: s.sd } : null])),
      D: Object.fromEntries(Object.entries(byPos.D).map(([k, s]: [string, any]) =>
        [k, s ? { mean: s.mean, sd: s.sd } : null])),
    },
    inputDistributions: byPos,
    forceDistribution: {
      ...fstats,
      p10: r2(pct(10)), p25: r2(pct(25)), p60: r2(pct(60)),
      p80: r2(pct(80)), p92: r2(pct(92)), p98: r2(pct(98)),
    },
    // Percentile-anchored cutoffs: SUPERMASSIVE = top 2%, STAR = top 8%,
    // MAIN_SEQUENCE = top 20%, SATELLITE = top 40%, BLACK_HOLE = bottom 3%
    suggestedTiers: {
      SUPERMASSIVE: r2(pct(98)),
      STAR: r2(pct(92)),
      MAIN_SEQUENCE: r2(pct(80)),
      SATELLITE: r2(pct(60)),
      BLACK_HOLE_BELOW: r2(pct(3)),
    },
    currentTierCounts: tierCounts,
    top25: forces.slice(0, 25),
    bottom10: forces.slice(-10),
  });
}
