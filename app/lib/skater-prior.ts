// ── skater-prior.ts ──────────────────────────────────────────────
//
// What a skater's rate stats imply about the skater, rather than what they
// happened to be.
//
// THE PROBLEM THIS SOLVES
//
// `skater-fmv.ts` prices from two numbers — points per sixty minutes and
// minutes per game — read off one season. One season is a sample. In the
// comparison run against the live roster that showed up as Auston Matthews at
// $8.30M off a 67-game year, Elias Pettersson at $6.83M, Drew Doughty at
// $5.18M: three players whose latest season is the least representative thing
// about them.
//
// SKATERS ARE NOT GOALIES, AND THE FIX IS DIFFERENT
//
// The goalie prior is heavy — a 1:2 current-to-career blend — because GSAx/60
// carries r = 0.13 from one season to the next. It is nearly all noise. The
// measured equivalents for skaters (`app/data/skater-stability.json`, 11,702
// skater-seasons, 2008-2025):
//
//   Forward TOI/game   r = 0.84        Defence TOI/game   r = 0.80
//   Forward pts/60     r = 0.72        Defence pts/60     r = 0.69
//
// A skater's season is mostly signal. So this is a light touch by design, and
// a full healthy season passes through it unchanged. Copying the goalie
// treatment would have compressed the whole league toward the mean for no
// reason — the same mistake that had to be undone on the goalie side when a
// single-season feature was fed to a three-season fit.
//
// WHY IT SHRINKS TOWARD A FULL SEASON AND NOT TOWARD THE TRUTH
//
// The temptation is to regress every input toward the population mean by its
// reliability. That would be wrong here, and quietly so. `skater-fmv.ts` was
// fitted on raw single-season features, so its coefficients are already
// attenuated by exactly that much noise — the slope it learned is a slope
// through noisy inputs. Cleaning the inputs and leaving the slope alone
// shrinks twice and systematically underprices stars.
//
// What this does instead: pool the seasons available to get a lower-variance
// estimate, then shrink only to the extent the pooled sample falls SHORT of
// the one full season the fit was built on. At a full season nothing moves —
// the input matches what the fit expects. Below one season it shrinks toward
// the population mean, so a twelve-game call-up at 3.5 pts/60 does not price
// as a star. Above one season it is capped, because the fit cannot make use of
// being handed something cleaner than it was trained on.
//
// HOW MUCH TO BELIEVE IS MEASURED, NOT DERIVED
//
// The obvious way to set that shrink is `n / (n + k)` with `k` calibrated so a
// full season reproduces the published `r` — which is what the goalie side
// does and what this shipped with. It is only right if everything `r` falls
// short of 1 is sampling noise, and for deployment it is not: most of what
// stops last season's TOI predicting this season's is that the coach changed
// his mind. The derived form gave a ten-game TOI sample 34% credibility where
// the panel says 82%, and that cost an injured star $1.58M of fair value.
//
// So the artifact publishes the correlation bucketed by how many games the
// predictor season had, and `beliefWeight` reads it off that curve.

import artifact from "@/app/data/skater-stability.json";
import type { SkaterUnit } from "@/app/lib/skater-fmv";

export interface SampleBucket {
  minGames: number;
  maxGames: number;
  meanGames: number;
  pairs: number;
  r: number;
  rMonotone: number;
  /** Share of a full season's predictive power a sample this long retains. */
  belief: number;
}

export interface SkaterMetric {
  label: string;
  unit: string;
  note: string;
  n: number;
  mean: number;
  sd: number;
  quantiles: Record<string, number>;
  stability: { pairs: number; r: number };
  sampleCurve: {
    basis: string;
    monotoneEnforced: boolean;
    fullSeasonR: number;
    buckets: SampleBucket[];
  };
}

const BY_UNIT = artifact.byUnit as unknown as Record<SkaterUnit, {
  label: string;
  skaterSeasons: number;
  players: number;
  metrics: Record<string, SkaterMetric>;
}>;

export type SkaterMetricKey = "pts60" | "toiPerGame" | "gameScore60";

export const SKATER_METRIC_KEYS: SkaterMetricKey[] = ["pts60", "toiPerGame", "gameScore60"];

/** Where the scale and the correlations come from, for a caption that must say. */
export const STABILITY_PANEL = artifact.stabilityPanel;
export const PERCENTILE_WINDOW = artifact.percentileWindow;
export const FULL_SEASON = artifact.fullSeason;

/**
 * Ice time in a full skater season, in seconds — roughly 1,373 minutes.
 *
 * Measured as the median load of a skater-season with 70+ games played.
 * Published for callers that want to describe a sample in minutes; the belief
 * curve is keyed on games, so nothing here depends on it.
 */
export const FULL_SEASON_SECONDS = artifact.fullSeason.seconds;

export const skaterMetric = (unit: SkaterUnit, key: string): SkaterMetric | null =>
  BY_UNIT[unit]?.metrics?.[key] ?? null;

/**
 * How much of the MoneyPuck multi-season baseline is independent evidence.
 *
 * `baselinePtsPace` is an exponentially-weighted mean over up to four seasons
 * at 0.50 / 0.30 / 0.15 / 0.05. Two consequences, both of which matter here:
 *
 *   • With all four present its effective sample size is 1 / Σw² ≈ 2.7
 *     seasons, not four.
 *   • The CURRENT season sits inside it at weight 0.50, so pooling it against
 *     the current season would count this year roughly one and a half times.
 *
 * `currentSeasonShare` handles the second: the current season's own sample is
 * discounted by that much before pooling, so it is counted once.
 */
export const MONEYPUCK_BASELINE = {
  /** Effective seasons when every one of the four is present. */
  priorSeasons: 2.7,
  /** The current season's weight inside the baseline. */
  currentSeasonShare: 0.5,
  /** Weight sum when every season is present — what the builder tops out at. */
  fullWeightSum: 1.0,
};

/**
 * What a player's baseline is actually worth, from the weight sum behind it.
 *
 * A rookie with one qualifying season carries `totalSeasonsWeighted` = 0.50,
 * and that half is the CURRENT season — the baseline tells us nothing we do
 * not already have. An established player carries 1.00 and roughly 2.7
 * seasons of real evidence. Treating both as 2.7 seasons, which an earlier
 * draft of this did, hands a rookie's single season the authority of a career.
 *
 * Returns the prior's effective seasons and how much of it is this year.
 */
export function baselineEvidence(totalSeasonsWeighted: number | null | undefined): {
  priorSeasons: number;
  overlapShare: number;
} {
  const w = totalSeasonsWeighted != null && isFinite(totalSeasonsWeighted) && totalSeasonsWeighted > 0
    ? Math.min(MONEYPUCK_BASELINE.fullWeightSum, totalSeasonsWeighted)
    : MONEYPUCK_BASELINE.fullWeightSum;
  return {
    priorSeasons: MONEYPUCK_BASELINE.priorSeasons * (w / MONEYPUCK_BASELINE.fullWeightSum),
    // At w = 0.50 the baseline is nothing but this season, so all of it
    // overlaps and the current sample is discounted to zero rather than
    // counted alongside a copy of itself.
    overlapShare: Math.min(1, MONEYPUCK_BASELINE.currentSeasonShare / w),
  };
}

/** Games in a full season — the unit everything here is pooled and weighted in. */
export const FULL_SEASON_GAMES = 82;

/**
 * How much of the observed value to believe, relative to a full season.
 *
 * MEASURED, NOT DERIVED
 *
 * The first version of this took the standard shrinkage form, `n / (n + k)`
 * with `k` set so a full season reproduced the published year-over-year `r`.
 * That is only correct if everything `r` falls short of 1 is sampling noise.
 * For deployment it plainly is not: most of what stops last season's TOI
 * predicting this season's is that the coach changed his mind, and no amount
 * of extra sample fixes that.
 *
 * The error was large and in the damaging direction. The derived form gave a
 * ten-game TOI sample 34% credibility, so an established star who missed most
 * of a season had his minutes dragged from 20 a night to 16.7 and his price
 * cut by $1.58M. Measured against the panel, a ten-game season predicts the
 * next one at r = 0.74 against a full season's 0.90 — about 82%.
 *
 * So the artifact now publishes the correlation bucketed by how many games the
 * predictor season had, and this interpolates it. Below the first bucket's
 * mean it runs down to zero at zero games; above the last it is 1.
 */
export function beliefWeight(
  unit: SkaterUnit,
  key: string,
  games: number | null | undefined,
): number {
  const curve = skaterMetric(unit, key)?.sampleCurve;
  if (!curve || !curve.buckets.length) return 0;
  if (games == null || !isFinite(games) || games <= 0) return 0;

  const buckets = curve.buckets;
  const first = buckets[0];
  if (games <= first.meanGames) {
    return Math.max(0, Math.min(1, (games / first.meanGames) * first.belief));
  }
  for (let i = 1; i < buckets.length; i++) {
    const lo = buckets[i - 1], hi = buckets[i];
    if (games <= hi.meanGames) {
      const span = hi.meanGames - lo.meanGames;
      const t = span === 0 ? 1 : (games - lo.meanGames) / span;
      return Math.max(0, Math.min(1, lo.belief + (hi.belief - lo.belief) * t));
    }
  }
  return 1;
}

/** Percentile of a raw value against the population for that position, 0-100. */
export function skaterPercentile(
  unit: SkaterUnit,
  key: string,
  value: number | null | undefined,
): number | null {
  const metric = skaterMetric(unit, key);
  if (!metric || value == null || !isFinite(value)) return null;

  const points = Object.entries(metric.quantiles)
    .map(([p, v]) => ({ p: Number(p), v }))
    .sort((a, b) => a.p - b.p);
  if (points.length === 0) return null;

  if (value <= points[0].v) return points[0].p;
  const last = points[points.length - 1];
  if (value >= last.v) return last.p;
  for (let i = 1; i < points.length; i++) {
    if (value <= points[i].v) {
      const lo = points[i - 1], hi = points[i];
      const span = hi.v - lo.v;
      return span === 0 ? hi.p : lo.p + ((value - lo.v) / span) * (hi.p - lo.p);
    }
  }
  return last.p;
}

export interface PooledInput {
  unit: SkaterUnit;
  key: SkaterMetricKey;
  /** The current season's observed rate. */
  current: number | null | undefined;
  /** Games behind `current`. */
  currentGames: number | null | undefined;
  /** A multi-season rate for the same player, if one is known. */
  prior?: number | null;
  /** Games of evidence behind `prior`. Defaults to the MoneyPuck baseline's. */
  priorGames?: number | null;
  /**
   * Share of `prior` that is the current season already, 0-1. Only the
   * remainder counts as new evidence, so at 1 the prior adds nothing.
   */
  overlapShare?: number;
}

export interface PooledEstimate {
  /** The number to hand the pricing model. */
  value: number;
  /** Sample the estimate rests on, in games, after de-overlapping. */
  effectiveGames: number;
  /** How much of the pooled value survived, 0-1. Below 1 means it was shrunk. */
  belief: number;
  /** True when a multi-season prior contributed. */
  usedPrior: boolean;
  /** True when the sample is short of a full season even after pooling. */
  thin: boolean;
}

/**
 * Pool a season against a multi-season prior, then shrink for a thin sample.
 *
 * Returns null when there is no usable observation at all — no current season
 * and no prior. A caller that gets null should say it has nothing rather than
 * price a league-average player, which is the whole point of the T0-2 work on
 * the STRAND side.
 */
export function pooledRate(input: PooledInput): PooledEstimate | null {
  const metric = skaterMetric(input.unit, input.key);
  if (!metric) return null;

  const overlap = Math.min(1, Math.max(0, input.overlapShare ?? MONEYPUCK_BASELINE.currentSeasonShare));
  const hasCurrent = input.current != null && isFinite(input.current)
    && input.currentGames != null && isFinite(input.currentGames) && input.currentGames > 0;
  const hasPrior = input.prior != null && isFinite(input.prior) && input.prior > 0;

  if (!hasCurrent && !hasPrior) return null;

  const declaredPriorGames = hasPrior
    ? (input.priorGames != null && isFinite(input.priorGames) && input.priorGames > 0
        ? input.priorGames
        : baselineEvidence(null).priorSeasons * FULL_SEASON_GAMES)
    : 0;

  // Only the part of the prior that is NOT this season counts as evidence.
  //
  // The discount goes here rather than on the current season, which is what an
  // earlier draft did and got wrong at the boundary: a rookie whose baseline
  // is nothing but his own fifteen games would have had the current sample
  // zeroed and the baseline credited with 1.35 full seasons — a fifteen-game
  // player reported as fully sampled. At overlapShare 1 the prior now
  // contributes nothing and the estimate is the current season, thin and
  // labelled thin.
  const priorGames = declaredPriorGames * (1 - overlap);
  const usablePrior = hasPrior && priorGames > 0;
  const currentGames = hasCurrent ? input.currentGames! : 0;

  const totalGames = currentGames + (usablePrior ? priorGames : 0);
  if (totalGames <= 0) return null;

  const pooled = ((hasCurrent ? input.current! * currentGames : 0)
                + (usablePrior ? input.prior! * priorGames : 0)) / totalGames;

  const belief = beliefWeight(input.unit, input.key, totalGames);
  return {
    value: pooled * belief + metric.mean * (1 - belief),
    effectiveGames: totalGames,
    belief,
    usedPrior: usablePrior,
    thin: totalGames < FULL_SEASON_GAMES,
  };
}

export interface SeasonPriorInput {
  unit: SkaterUnit;
  /** Points per 82 games this season — what the app carries as `ptsPace`. */
  ptsPace: number | null | undefined;
  /** Minutes per game this season — what the app carries as `avgTOI`. */
  minutesPerGame: number | null | undefined;
  /** Games played this season. */
  games: number | null | undefined;
  /** Multi-season points per 82 — what the app carries as `baselinePtsPace`. */
  baselinePtsPace?: number | null;
  /**
   * Multi-season minutes per game — `baselineToiPerGame`.
   *
   * Added to the MoneyPuck baseline builder for this. Without it, deployment
   * had no history to lean on and an established star who played five games
   * was read as a fourth liner.
   */
  baselineToiPerGame?: number | null;
  /**
   * Sum of the season weights behind that baseline — `totalSeasonsWeighted` in
   * `moneypuck_baselines.json`. Decides how much authority the baseline gets.
   * When absent the baseline is assumed complete, which flatters a rookie, so
   * pass it wherever it is available.
   */
  baselineSeasonsWeighted?: number | null;
}

export interface SkaterPriorResult {
  /** Points per sixty minutes, pooled and shrunk. Feed this to `skaterFmvAav`. */
  pts60: number | null;
  /** Minutes per game, pooled and shrunk. Feed this to `skaterFmvAav`. */
  minutesPerGame: number | null;
  /** Games this season — what the pooling was weighted by. */
  seasonGames: number;
  /** How much of the pooled production estimate survived, 0-1. */
  belief: number;
  /** True when the multi-season baseline contributed. */
  usedPrior: boolean;
  /** True when even the pooled sample is short of a full season. */
  thin: boolean;
}

/** Points per 82 games converted to points per sixty minutes. */
const per82ToPer60 = (per82: number, minutesPerGame: number): number | null =>
  minutesPerGame > 0 ? per82 / ((minutesPerGame * 82) / 60) : null;

/**
 * The adapter from what the roster carries to what the pricing model wants.
 *
 * Both features now have a multi-season anchor. `baselineToiPerGame` was added
 * to the MoneyPuck baseline builder for this — before it, deployment had no
 * history to lean on, and an established star who played five games had his
 * minutes read as a fourth liner's. It also removes an approximation this
 * module shipped with: the baseline points pace is converted to a per-sixty
 * rate against the BASELINE's minutes rather than the current season's, so a
 * player whose role just changed is no longer read at the wrong rate.
 */
export function skaterSeasonPrior(input: SeasonPriorInput): SkaterPriorResult {
  const minutes = input.minutesPerGame != null && isFinite(input.minutesPerGame) && input.minutesPerGame > 0
    ? input.minutesPerGame : null;
  const games = input.games != null && isFinite(input.games) && input.games > 0 ? input.games : 0;
  const evidence = baselineEvidence(input.baselineSeasonsWeighted);
  const priorGames = evidence.priorSeasons * FULL_SEASON_GAMES;

  // Deployment first — its pooled value is the rate the production feature is
  // expressed against, so resolving it before converting points keeps the two
  // features on one consistent picture of the player.
  const deployment = pooledRate({
    unit: input.unit, key: "toiPerGame",
    current: minutes, currentGames: games,
    prior: input.baselineToiPerGame,
    priorGames,
    overlapShare: evidence.overlapShare,
  });
  const pooledMinutes = deployment?.value ?? minutes;

  const currentPts60 = minutes != null && input.ptsPace != null && isFinite(input.ptsPace)
    ? per82ToPer60(input.ptsPace, minutes) : null;
  // The baseline pace is converted against the BASELINE's minutes where they
  // exist, so a player whose role just changed is not read at the wrong rate.
  // That was the approximation this module shipped with; the TOI baseline
  // removes it.
  const priorMinutes = input.baselineToiPerGame != null && isFinite(input.baselineToiPerGame)
    && input.baselineToiPerGame > 0 ? input.baselineToiPerGame : minutes;
  const priorPts60 = priorMinutes != null && input.baselinePtsPace != null
    && isFinite(input.baselinePtsPace) && input.baselinePtsPace > 0
    ? per82ToPer60(input.baselinePtsPace, priorMinutes) : null;

  const production = pooledRate({
    unit: input.unit, key: "pts60",
    current: currentPts60, currentGames: games,
    prior: priorPts60,
    priorGames,
    overlapShare: evidence.overlapShare,
  });

  return {
    pts60: production?.value ?? null,
    minutesPerGame: pooledMinutes,
    seasonGames: games,
    belief: production?.belief ?? 0,
    usedPrior: production?.usedPrior ?? false,
    thin: production?.thin ?? true,
  };
}

/** Plain-language stability, for a tooltip that should not print an r. */
export function skaterStabilityLabel(unit: SkaterUnit, key: string): string | null {
  const metric = skaterMetric(unit, key);
  if (!metric) return null;
  const r = metric.stability.r;
  if (!isFinite(r)) return null;
  if (r >= 0.75) return "repeats strongly year to year";
  if (r >= 0.55) return "repeats well year to year";
  if (r >= 0.35) return "repeats moderately year to year";
  return "repeats weakly year to year — read one season with caution";
}
