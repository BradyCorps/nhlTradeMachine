// ── edge-display.ts ──────────────────────────────────────────────
//
// What the dossier is allowed to print from an NHL EDGE shot-location row.
//
// THE DEFECTS THIS CLOSES
//
//   1. `(s.shootingPctg * 100).toFixed(1)` on a zone with no shots printed
//      "NaN%", and the "vs league" delta printed "NaN". The feed has no shooting
//      percentage for a zero-attempt split (0 / 0), and a missing field is
//      `undefined`, not 0. A shooting percentage with no attempts is UNAVAILABLE.
//      It is not 0.0% — that would be an invented measurement. A genuine
//      measured zero (shots > 0, goals = 0) is a real 0.0% and still prints.
//
//   2. `shotsPercentile` on a zone with zero shots arrived as 0.94–0.99 and was
//      drawn as the darkest tile. A count of zero is the minimum of any "more is
//      higher" ranking, so 94th–99th is only consistent with a tie convention
//      that scores a value by the share of the field at-or-below it — which, for
//      a zone nearly everyone leaves empty, is nearly everyone. The feed does not
//      document the convention, its population or its tie handling, so the
//      repo cannot prove what the number means. It is therefore never reversed,
//      rescaled or reinterpreted: where the count is zero the percentile is
//      withheld and the raw count is what is shown.
//
//      For non-zero counts the percentile is shown as EDGE's own figure, with
//      the same caveat attached. A percentile outside 0–1 or non-finite is
//      treated as absent.

export const finiteOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** A shooting percentage that may be absent. `shots` is the exposure. */
export interface ShootingReading {
  /** Fraction 0–1, or null when it cannot be stated. */
  value: number | null;
  /** Why it is null, for the reader. */
  reason: "no-attempts" | "missing" | null;
}

/**
 * Shooting percentage from the feed's own figure, falling back to goals/shots
 * when the feed omitted it. Zero attempts is never a percentage.
 */
export function shootingReading(input: {
  shots?: unknown;
  goals?: unknown;
  shootingPctg?: unknown;
}): ShootingReading {
  const shots = finiteOrNull(input.shots);
  if (shots == null) return { value: null, reason: "missing" };
  if (shots <= 0) return { value: null, reason: "no-attempts" };
  const given = finiteOrNull(input.shootingPctg);
  if (given != null && given >= 0 && given <= 1) return { value: given, reason: null };
  const goals = finiteOrNull(input.goals);
  if (goals != null && goals >= 0 && goals <= shots) return { value: goals / shots, reason: null };
  return { value: null, reason: "missing" };
}

export const formatPct = (fraction: number | null, digits = 1): string =>
  fraction == null || !Number.isFinite(fraction) ? "—" : `${(fraction * 100).toFixed(digits)}%`;

export function shootingText(r: ShootingReading): string {
  if (r.value != null) return formatPct(r.value);
  return r.reason === "no-attempts" ? "n/a (no shots)" : "n/a";
}

/** Percentage-point gap to the league figure, or null when either side is not a number. */
export function pointsVsLeague(player: ShootingReading, leagueAvg: unknown): number | null {
  const league = finiteOrNull(leagueAvg);
  if (player.value == null || league == null || league < 0 || league > 1) return null;
  return (player.value - league) * 100;
}

export function vsLeagueText(points: number | null): string | null {
  if (points == null) return null;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)} pts vs league`;
}

// ── Percentile gate ──────────────────────────────────────────────

export type PercentileStatus = "ranked" | "zero-count" | "unavailable";
export interface PercentileReading {
  status: PercentileStatus;
  /** 0–1 as supplied. Only set when status is "ranked". */
  value: number | null;
}

/** Whether a supplied EDGE percentile may be shown for this count. */
export function percentileReading(shots: unknown, percentile: unknown): PercentileReading {
  const count = finiteOrNull(shots);
  const p = finiteOrNull(percentile);
  if (count == null || p == null || p < 0 || p > 1) return { status: "unavailable", value: null };
  if (count <= 0) return { status: "zero-count", value: null };
  return { status: "ranked", value: p };
}

export const PERCENTILE_CAVEAT =
  "Percentiles are NHL EDGE's own figures; the feed does not document their population or tie handling, so a zero count is shown as a count only.";

// ── Sample size ──────────────────────────────────────────────────

/** Games below which a zone count is mostly noise. Display-only. */
export const EDGE_SMALL_SAMPLE_GP = 20;

export function sampleNote(gamesPlayed: unknown): string | null {
  const gp = finiteOrNull(gamesPlayed);
  if (gp == null) return "Games played not reported for this EDGE sample.";
  if (gp >= EDGE_SMALL_SAMPLE_GP) return null;
  return `Small sample: ${gp} GP. Zone counts of a few shots can swing the percentile and the shooting percentage by a lot.`;
}

// ── Ice time ─────────────────────────────────────────────────────

/** Average ice time per game as m:ss. The NHL summary reports whole seconds. */
export function formatToi(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "—";
  const total = Math.round(minutes * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
