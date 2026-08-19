// ── team-nav-split.ts — roster NAV decomposed by position ────────
//
// The League X-NAV Rankings chart shows a team's combined roster value and
// lets the reader split it into forwards / defense / goaltending. "Combined"
// has to mean exactly that: the three splits must sum back to the total, or
// the toggle is quietly telling three different stories. This is the one
// place that guarantees it — every contribution is clamped at zero the same
// way, and every skater lands in exactly one bucket.

export interface PosNavEntry {
  /** NHL position code: C | L | R | W | D | G (anything else folds to F). */
  position: string;
  /** The player's total NAV; null/NaN is treated as zero. */
  nav: number | null | undefined;
}

export interface RosterNavSplit {
  /** f + d + g — the combined roster value ("X-NAV"). */
  xnav: number;
  f: number;
  d: number;
  g: number;
}

/**
 * Sum roster NAV into position buckets.
 *
 * Each contribution is clamped at zero (a below-replacement player subtracts
 * nothing, matching the rosterNAV convention the chart already used), goalies
 * go to `g`, blueliners to `d`, and every other skater to `f` — an
 * "else forwards" fold so no rostered player is dropped and `xnav` is exactly
 * `f + d + g`.
 */
export function rosterNavByPosition(entries: PosNavEntry[]): RosterNavSplit {
  let f = 0, d = 0, g = 0;
  for (const e of entries) {
    const raw = typeof e.nav === "number" && Number.isFinite(e.nav) ? e.nav : 0;
    const v = Math.max(0, raw);
    if (e.position === "G") g += v;
    else if (e.position === "D") d += v;
    else f += v;
  }
  return { xnav: f + d + g, f, d, g };
}
