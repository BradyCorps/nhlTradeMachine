// ── strand-traits.ts ─────────────────────────────────────────────
//
// Building a STRAND node from data that might not be there.
//
// THE BUG THIS EXISTS TO CLOSE
//
// Every STRAND rail draws a 0–100 index. Half the nodes greyed out honestly
// when their source was missing; the other half quietly substituted a value
// that looked measured:
//
//   NOIV   `norm(xgRelTM ?? 0, -12, 12)`   → 50, no flag
//   SUPP   `norm(-(xgaRelTM ?? 0), …)`     → 50, no flag
//   QoC    `(qocIndex ?? 35) / 100`        → 35, no flag
//   DPS    `dpsNorm ?? norm(nav.def, …)`   → the NAV defensive component, a
//                                            DIFFERENT quantity on a different
//                                            scale, under the same label
//   GAA    `(1 - svPct) * (spg ?? 30)`     → a goals-against figure computed
//                                            from an assumed league shot rate
//                                            and printed to two decimals
//
// A reader cannot tell those apart from real measurements, and 50 is the worst
// possible lie: it reads as "average" — an actual finding — rather than "we do
// not know". A player with three real inputs and one with ten looked identical.
//
// So: absence is a value here, not something to be papered over. `node()` takes
// a possibly-missing input and returns a trait that is either measured or
// explicitly unavailable, and `strandCoverage` counts how much of a profile is
// real so the display can say so.
//
// The 0.5 on an unavailable node is geometry, not a reading. `StrandDisplay`
// greys the node and prints "—"; the helix still needs a y-coordinate, and
// mid-rail is the least misleading place to put one.

export interface StrandTrait {
  label:       string;
  val:         number;
  title?:      string;
  idx?:        number;
  raw?:        string;
  ps?:         string | null;
  display?:    number;
  unavailable?: boolean;
}

export const safe = (n: number): number => (isNaN(n) || !isFinite(n) ? 0 : n);

export const norm = (val: number, mn: number, mx: number): number =>
  Math.max(0, Math.min(1, (val - mn) / (mx - mn)));

/** Present and usable — `0` counts, `null`/`undefined`/`NaN` do not. */
export const measured = (v: number | null | undefined): v is number =>
  v != null && isFinite(v);

export interface NodeSpec {
  label: string;
  /** The measurement. Missing means missing — do not pass a default in. */
  value: number | null | undefined;
  /** Range the index is scaled against. */
  min: number;
  max: number;
  /** True when a LOW raw value is good (GAA, defensive-zone share). */
  invert?: boolean;
  /** Tooltip when the value is present. */
  title: (v: number) => string;
  /** Faint raw figure under the label. */
  raw?: (v: number) => string;
  /** Tooltip when it is not. Should say what is missing, not just "unavailable". */
  absent: string;
}

/**
 * One node, honest about whether it measured anything.
 *
 * The caller passes the raw input and the range. It must NOT pre-substitute a
 * fallback: `node({ value: x ?? 0 })` reintroduces exactly the defect this
 * function exists to prevent.
 */
export function node(spec: NodeSpec): StrandTrait {
  if (!measured(spec.value)) {
    return { label: spec.label, val: 0.5, title: spec.absent, unavailable: true };
  }
  const scaled = norm(spec.value, spec.min, spec.max);
  return {
    label: spec.label,
    val: spec.invert ? 1 - scaled : scaled,
    title: spec.title(spec.value),
    raw: spec.raw?.(spec.value),
  };
}

// ── Coverage ─────────────────────────────────────────────────────

export interface StrandCoverage {
  /** Nodes built from a real measurement. */
  measured: number;
  /** Nodes on the profile. */
  total: number;
}

export function strandCoverage(...groups: StrandTrait[][]): StrandCoverage {
  const all = groups.flat();
  return { measured: all.filter(t => !t.unavailable).length, total: all.length };
}

/**
 * What to print beside a partial profile, or null when it is complete.
 *
 * Silent on a full profile — a badge that always shows is one nobody reads, and
 * the point is to mark the exceptions.
 */
export function coverageLabel(cov: StrandCoverage): string | null {
  if (cov.total === 0) return "No data";
  if (cov.measured === cov.total) return null;
  if (cov.measured === 0) return "No data";
  return `${cov.measured} of ${cov.total} measured`;
}

/**
 * Whether a profile has enough behind it to characterise a player at all.
 *
 * Under half the nodes and the shape is mostly the flat mid-rail that stands in
 * for missing data, which is a drawing rather than a reading.
 */
export const COVERAGE_FLOOR = 0.5;
export const coverageIsThin = (cov: StrandCoverage): boolean =>
  cov.total > 0 && cov.measured / cov.total < COVERAGE_FLOOR;
