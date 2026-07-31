// ── roster-strand.ts ─────────────────────────────────────────────
//
// The club-level STRAND: the same eight traits, averaged over the players who
// actually drive a team's identity (top nine forwards, top four defencemen by
// ice time, 20+ games).
//
// A team average has a sharper version of the missing-data problem than a
// player card does. Every unmeasured player used to contribute a manufactured
// value to the mean — `xgRelTM ?? 0` normalising to 0.5, `qocIndex ?? 35`, and
// a DPS fallback onto the NAV defensive component, a different quantity on a
// different scale. Thirteen players with five real NOIV readings between them
// produced a number that looked like a team's measured on-ice impact and was
// mostly eight copies of "we do not know", pulled hard toward the middle.
//
// So each trait is now averaged over the players who HAVE it, and reports how
// many that was. A trait nobody has is null, not 0.5.

import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import type { TeamStrandData } from "@/app/components/TeamStrand";
import { measured, norm } from "@/app/lib/strand-traits";

/** Mean of the players who had the measurement, and how many that was. */
export interface TraitAverage {
  /** 0–1, or null when nobody on the roster had this input. */
  value: number | null;
  measured: number;
  total: number;
}

export interface RosterStrandDetail {
  off: Record<"OPS" | "xG" | "NOIV" | "TOI", TraitAverage>;
  def: Record<"DPS" | "SUPP" | "Usage" | "OZ", TraitAverage>;
}

/** Accumulates a mean without letting absent inputs vote. */
class Mean {
  private sum = 0;
  private n = 0;
  add(value: number | null | undefined, min: number, max: number) {
    if (!measured(value)) return;
    this.sum += norm(value, min, max);
    this.n += 1;
  }
  /** Pre-normalised contribution, for a trait whose scaling is caller-specific. */
  addNormalised(value: number | null | undefined) {
    if (!measured(value)) return;
    this.sum += Math.max(0, Math.min(1, value));
    this.n += 1;
  }
  result(total: number): TraitAverage {
    return { value: this.n > 0 ? this.sum / this.n : null, measured: this.n, total };
  }
}

/**
 * The club's trait averages, with coverage attached.
 *
 * `navMap` is no longer read: it was only ever used to substitute the NAV
 * defensive component when Point Shares were missing, which put a different
 * quantity into a DPS average. The parameter stays for call-site compatibility.
 */
export function computeRosterStrandDetail(
  roster: Asset[],
  _navMap?: Record<string, XNAVResult>,
): RosterStrandDetail | null {
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

  const acc = {
    OPS: new Mean(), xG: new Mean(), NOIV: new Mean(), TOI: new Mean(),
    DPS: new Mean(), SUPP: new Mean(), Usage: new Mean(), OZ: new Mean(),
  };

  for (const p of qualified) {
    const isD = p.position === "D";
    // Point Shares where we have them, scoring pace as the stand-in — the same
    // substitution the player card makes, and the only one kept, because both
    // sides measure offensive production rather than two different things.
    if (measured(p.ops)) acc.OPS.add(p.ops, 0, 7);
    else acc.OPS.add(p.ptsPace, 0, isD ? 80 : 100);

    acc.xG.add(p.xGPace, 0, isD ? 25 : 50);
    acc.NOIV.add(p.xgRelTM, -12, 12);
    acc.TOI.add(p.avgTOI, 10, 27);
    acc.DPS.add(p.dps, 0, 4.5);
    acc.SUPP.add(measured(p.xgaRelTM) ? -p.xgaRelTM! : null, -1.5, 1.5);
    acc.Usage.add(p.qocIndex, 0, 100);
    acc.OZ.addNormalised(measured(p.dzPct) ? 1 - norm(p.dzPct!, 0.3, 0.7) : null);
  }

  const n = qualified.length;
  return {
    off: { OPS: acc.OPS.result(n), xG: acc.xG.result(n), NOIV: acc.NOIV.result(n), TOI: acc.TOI.result(n) },
    def: { DPS: acc.DPS.result(n), SUPP: acc.SUPP.result(n), Usage: acc.Usage.result(n), OZ: acc.OZ.result(n) },
  };
}

/** How much of the club profile rests on real measurements. */
export function rosterStrandCoverage(detail: RosterStrandDetail): { measured: number; total: number } {
  const traits = [...Object.values(detail.off), ...Object.values(detail.def)];
  return {
    measured: traits.reduce((s, t) => s + t.measured, 0),
    total: traits.reduce((s, t) => s + t.total, 0),
  };
}

/**
 * The shape the chart wants: plain 0–1 numbers.
 *
 * A trait nobody had becomes 0.5 here because the renderer needs a coordinate.
 * Callers that care about the difference should read the detail instead — the
 * point of the split is that the 0.5 is no longer indistinguishable from a
 * measurement upstream of the drawing.
 */
export function computeRosterStrand(
  roster: Asset[],
  navMap: Record<string, XNAVResult>,
): TeamStrandData | null {
  const detail = computeRosterStrandDetail(roster, navMap);
  if (!detail) return null;
  const v = (t: TraitAverage) => t.value ?? 0.5;
  return {
    off: { OPS: v(detail.off.OPS), xG: v(detail.off.xG), NOIV: v(detail.off.NOIV), TOI: v(detail.off.TOI) },
    def: { DPS: v(detail.def.DPS), SUPP: v(detail.def.SUPP), Usage: v(detail.def.Usage), OZ: v(detail.def.OZ) },
  };
}
