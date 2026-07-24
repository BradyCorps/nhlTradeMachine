// ── Head-to-head stat bar geometry (audit #8) ────────────────────
// Pure comparison math for PlayerComparison's head-to-head bars. Extracted so
// the correctness fixes are unit-testable:
//   • a side with no data (null) never "wins" — an empty package must not read
//     as the youngest/cheapest/best just because its aggregate is 0;
//   • bar length is on a common scale anchored at 0, so for a higher-is-better
//     stat a more-negative value is SHORTER, not longer (the old abs() scale
//     gave a worse, more-negative NAV the longer bar).

export interface StatBarCompare {
  homeWins: boolean;
  partWins: boolean;
  homePct: number; // 0–100 bar fill
  partPct: number;
}

export function compareStat(
  homeVal: number | null,
  partnerVal: number | null,
  higherIsBetter = true,
): StatBarCompare {
  const homeMissing = homeVal == null;
  const partMissing = partnerVal == null;
  const h = homeVal ?? 0;
  const p = partnerVal ?? 0;

  const homeWins = !homeMissing && (partMissing || (higherIsBetter ? h >= p : h <= p));
  const partWins = !partMissing && (homeMissing || (higherIsBetter ? p >= h : p <= h));

  const lo = Math.min(h, p, 0);
  const hi = Math.max(h, p, 0.01);
  const higherPct = (v: number) => Math.max(8, ((v - lo) / (hi - lo)) * 100);
  const lowerPct = (v: number) => {
    const worst = Math.max(h, p);
    const best = Math.min(h, p);
    if (worst === best) return 100;
    return Math.max(8, ((worst - v) / (worst - best)) * 100);
  };
  const pctOf = (v: number, missing: boolean) =>
    missing ? 0 : higherIsBetter ? higherPct(v) : lowerPct(v);

  return {
    homeWins,
    partWins,
    homePct: pctOf(h, homeMissing),
    partPct: pctOf(p, partMissing),
  };
}
