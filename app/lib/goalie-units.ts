// ── goalie-units.ts ──────────────────────────────────────────────
//
// Two unit errors in the goalie pipeline, both of which made a number mean
// something other than its label.
//
// STARTS WERE APPEARANCES
//
// `gamesStarted` was fed the MoneyPuck `games_played` count. A goalie who came
// on in relief four times read as four extra starts, and that field gates the
// starter / tandem / backup classification — which in turn sets the role
// ceiling on G-NAV. So relief work moved a valuation.
//
// The sharpest version: the NHL stats API publishes a real `gamesStarted`, the
// assembly already fetches it alongside MoneyPuck, and the merge let MoneyPuck
// win — the correct number was retrieved and then overwritten. It is kept now,
// and `startsKnown` records whether a workload figure is genuinely starts or
// only appearances, so nothing downstream has to guess and no label claims more
// than its source supports.
//
// GAA WAS NOT GAA
//
// STRAND computed `(1 - savePct) * shotsPerGame` and called it goals-against
// average. That is goals per APPEARANCE. GAA is per sixty minutes, and the two
// diverge by however far a goalie's average outing is from a full game — pulled
// starts and relief appearances, precisely the population the number is most
// used to judge. It also fell back to an assumed 30 shots a game when volume
// was missing, so it could be fabricated outright and still printed to two
// decimals.
//
// The MoneyPuck goalie CSV carries `icetime` in seconds. The assembly already
// parses it for the team xGA denominator and then discarded it. Real GAA is
// computable from data we already hold.
//
// (Not to be confused with `goalie-workload.ts`, which splits a projected
// season between a starter and his backup inside the sim.)

/** Seconds in the sixty minutes a rate stat is quoted against. */
export const SECONDS_PER_HOUR = 3600;

/**
 * Goals against per sixty minutes — the real thing.
 *
 * Returns null rather than a plausible-looking number when an input is
 * missing, because the previous version's willingness to invent one is half of
 * what this file exists to fix. Zero goals against is a legitimate answer; zero
 * ice time is not a denominator.
 */
export function goalsAgainstAverage(
  goalsAgainst: number | null | undefined,
  iceTimeSeconds: number | null | undefined,
): number | null {
  if (goalsAgainst == null || iceTimeSeconds == null) return null;
  if (!isFinite(goalsAgainst) || !isFinite(iceTimeSeconds)) return null;
  if (goalsAgainst < 0 || iceTimeSeconds <= 0) return null;
  return (goalsAgainst * SECONDS_PER_HOUR) / iceTimeSeconds;
}

export interface WorkloadInput {
  /** Real starts, where a source publishes them. */
  gamesStarted?: number | null;
  /** Appearances. Always available; includes relief. */
  gamesPlayed?: number | null;
}

export interface Workload {
  /** The figure to classify and display on. */
  games: number;
  /** True when `games` is genuinely starts rather than appearances. */
  startsKnown: boolean;
}

/**
 * The best workload figure available, and whether it is what it claims.
 *
 * Prefers real starts; falls back to appearances. The fallback is deliberate —
 * a goalie whose starts we cannot source still has a workload, and refusing to
 * classify him would be worse than classifying him on appearances and saying
 * so. `startsKnown` is how every consumer can tell which it got.
 */
export function resolveWorkload(input: WorkloadInput): Workload {
  const starts = input.gamesStarted;
  if (starts != null && isFinite(starts) && starts > 0) {
    return { games: Math.round(starts), startsKnown: true };
  }
  const played = input.gamesPlayed;
  if (played != null && isFinite(played) && played > 0) {
    return { games: Math.round(played), startsKnown: false };
  }
  return { games: 0, startsKnown: false };
}

/** "52 GS" when those are starts, "55 GP" when they are appearances. */
export function workloadLabel(w: Workload): string {
  return `${w.games} ${w.startsKnown ? "GS" : "GP"}`;
}

/** The long form, for a tooltip with room to be exact. */
export function workloadTitle(w: Workload): string {
  return w.startsKnown
    ? `Games started: ${w.games}`
    : `Appearances: ${w.games} — starts are not published by this source, so relief outings are included`;
}
