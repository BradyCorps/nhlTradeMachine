// ── team-nav-split.ts — roster NAV decomposed by position ────────
//
// The League X-NAV Rankings chart shows a team's combined roster value and
// lets the reader split it into forwards / defense / goaltending. "Combined"
// has to mean exactly that: the three splits must sum back to the total, or
// the toggle is quietly telling three different stories. This is the one
// place that guarantees it — every contribution is clamped at zero the same
// way, and every skater lands in exactly one bucket.
//
// NAV-01's acceptance line requires the signed and positive-only totals never
// share a label: `f`/`d`/`g`/`xnav` below are Σ max(0, nav) — "Roster X-NAV+"
// — because the chart bars this feeds cannot render a negative value. `signed`
// is the real total, every player's actual NAV with no floor, for any surface
// that isn't constrained to a bar's [0, max] domain (a team's headline NAV
// number, its NAV sort). A weak roster with real negative-value contracts
// should sort and display as weaker, not have those contracts silently erased.

export interface PosNavEntry {
  /** NHL position code: C | L | R | W | D | G (anything else folds to F). */
  position: string;
  /** The player's total NAV; null/NaN is treated as zero. */
  nav: number | null | undefined;
}

export interface RosterNavSplit {
  /** f + d + g — Σ max(0, nav) per bucket. "Roster X-NAV+": the
   *  positive-assets-only view, for the chart bars that can't go negative.
   *  NOT the signed roster total — see `signed` below. */
  xnav: number;
  f: number;
  d: number;
  g: number;
  /** True signed totals — every player's real NAV, no floor. "Roster X-NAV"
   *  per NAV-01's acceptance line. `total` is NOT `f + d + g` from above;
   *  it is its own sum over unclamped values. */
  signed: { f: number; d: number; g: number; total: number };
}

/**
 * Sum roster NAV into position buckets, both floored-at-zero (`f`/`d`/`g`/
 * `xnav`, "X-NAV+") and signed (`signed`, "X-NAV" — the real total).
 *
 * Goalies go to `g`, blueliners to `d`, and every other skater to `f` — an
 * "else forwards" fold so no rostered player is dropped. `xnav` is exactly
 * `f + d + g` (each already clamped); `signed.total` is exactly
 * `signed.f + signed.d + signed.g` (never clamped).
 */
export function rosterNavByPosition(entries: PosNavEntry[]): RosterNavSplit {
  let f = 0, d = 0, g = 0;
  let sf = 0, sd = 0, sg = 0;
  for (const e of entries) {
    const raw = typeof e.nav === "number" && Number.isFinite(e.nav) ? e.nav : 0;
    const v = Math.max(0, raw);
    if (e.position === "G") { g += v; sg += raw; }
    else if (e.position === "D") { d += v; sd += raw; }
    else { f += v; sf += raw; }
  }
  return { xnav: f + d + g, f, d, g, signed: { f: sf, d: sd, g: sg, total: sf + sd + sg } };
}
