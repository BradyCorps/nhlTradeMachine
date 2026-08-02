import { describe, it, expect } from "vitest";
import artifact from "@/app/data/skater-stability.json";
import {
  FULL_SEASON_GAMES,
  FULL_SEASON_SECONDS,
  MONEYPUCK_BASELINE,
  SKATER_METRIC_KEYS,
  baselineEvidence,
  beliefWeight,
  pooledRate,
  skaterMetric,
  skaterPercentile,
  skaterSeasonPrior,
  skaterStabilityLabel,
  type SeasonPriorInput,
} from "@/app/lib/skater-prior";
import { skaterFmvAav, type SkaterUnit } from "@/app/lib/skater-fmv";

const UNITS: SkaterUnit[] = ["F", "D"];
const CAP = 104;



describe("skater-stability — the artifact", () => {
  it("carries no player rows and names its sources", () => {
    expect(JSON.stringify(artifact)).not.toMatch(/playerId/);
    for (const s of artifact.sources) expect((s as any).sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("measured stability on a panel big enough to mean something", () => {
    expect(artifact.stabilityPanel.skaterSeasons).toBeGreaterThan(8000);
    for (const unit of UNITS) {
      for (const key of SKATER_METRIC_KEYS) {
        expect(skaterMetric(unit, key)!.stability.pairs, `${unit}.${key}`).toBeGreaterThan(1000);
      }
    }
  });

  it("anchors a full season by measurement rather than assumption", () => {
    // The median load of a skater who played 70+ games. If this ever drifts far
    // from a real season's ice time, reliability is calibrated against nothing.
    const minutes = FULL_SEASON_SECONDS / 60;
    expect(minutes).toBeGreaterThan(1000);
    expect(minutes).toBeLessThan(1800);
    expect(artifact.fullSeason.basis).toMatch(/median ice time/);
  });

  it("finds skater production far more repeatable than goalie save work", () => {
    // The reason this prior is a light touch and the goalie one is not. GSAx/60
    // sits at r = 0.13; if skater production ever measured anywhere near that,
    // the shrinkage here would be badly under-powered.
    for (const unit of UNITS) {
      expect(skaterMetric(unit, "pts60")!.stability.r, unit).toBeGreaterThan(0.55);
      expect(skaterMetric(unit, "toiPerGame")!.stability.r, unit).toBeGreaterThan(0.70);
    }
  });

  it("finds deployment more repeatable than production, in both units", () => {
    // A coach's usage is a decision and it persists; scoring is an outcome and
    // it wobbles. If this inverted, one of the two features is mis-measured.
    for (const unit of UNITS) {
      expect(skaterMetric(unit, "toiPerGame")!.stability.r, unit)
        .toBeGreaterThan(skaterMetric(unit, "pts60")!.stability.r);
    }
  });

  it("publishes distributions in the same units the pricing model was fitted on", () => {
    // pts60 is per SIXTY MINUTES. A forward mean near 1.9 is the tell; anything
    // near 60 means a per-82 pace leaked in — the exact trap that clamped every
    // goalie to the domain ceiling.
    expect(skaterMetric("F", "pts60")!.mean).toBeGreaterThan(1);
    expect(skaterMetric("F", "pts60")!.mean).toBeLessThan(3);
    expect(skaterMetric("D", "pts60")!.mean).toBeLessThan(skaterMetric("F", "pts60")!.mean);
    expect(skaterMetric("D", "toiPerGame")!.mean).toBeGreaterThan(skaterMetric("F", "toiPerGame")!.mean);
  });

  it("returns null for a metric or unit it does not carry", () => {
    expect(skaterMetric("F", "nonsense")).toBeNull();
    expect(skaterMetric("G" as SkaterUnit, "pts60")).toBeNull();
  });
});

describe("skater-prior — the measured belief curve", () => {
  it("publishes a curve that reaches the thin seasons it exists for", () => {
    // The eligibility floor for the percentile population is 300 minutes, and
    // a ten-game season is never 300 minutes. Building the curve from the
    // filtered rows silently dropped the two thinnest buckets, leaving a curve
    // that started at 21 games and said nothing about the case it is for.
    for (const unit of UNITS) {
      for (const key of ["pts60", "toiPerGame"] as const) {
        const buckets = skaterMetric(unit, key)!.sampleCurve.buckets;
        expect(buckets[0].minGames, `${unit}.${key}`).toBe(1);
        expect(buckets[0].pairs, `${unit}.${key}`).toBeGreaterThan(60);
        expect(buckets[buckets.length - 1].maxGames, `${unit}.${key}`).toBe(82);
      }
    }
  });

  it("never lets more games count for less", () => {
    // Raw buckets are noisy enough to dip; the build enforces a running max so
    // a 75-game season is never worth less than a 60-game one.
    for (const unit of UNITS) {
      for (const key of SKATER_METRIC_KEYS) {
        let prev = -1;
        for (const b of skaterMetric(unit, key)!.sampleCurve.buckets) {
          expect(b.belief, `${unit}.${key} @${b.minGames}`).toBeGreaterThanOrEqual(prev);
          prev = b.belief;
        }
      }
    }
  });

  it("believes a full season completely and never more than completely", () => {
    for (const unit of UNITS) {
      expect(beliefWeight(unit, "pts60", FULL_SEASON_GAMES)).toBe(1);
      expect(beliefWeight(unit, "pts60", FULL_SEASON_GAMES * 5)).toBe(1);
    }
  });

  it("rises with games and stays inside 0-1", () => {
    let prev = -1;
    for (const games of [1, 5, 15, 30, 50, 70, 82, 200]) {
      const b = beliefWeight("F", "pts60", games);
      expect(b, `${games} games`).toBeGreaterThanOrEqual(prev);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
      prev = b;
    }
  });

  it("treats no games as no signal rather than a little", () => {
    for (const bad of [0, -1, null, undefined, NaN]) {
      expect(beliefWeight("F", "pts60", bad as number)).toBe(0);
    }
  });

  it("credits a short deployment sample far more than a short scoring one", () => {
    // The finding that replaced the derived shrinkage. A coach's usage is
    // readable from ten games; a scoring rate is not. Deriving both from one
    // year-over-year r gave deployment 34% at ten games where the panel says
    // about 82%, and that cost an injured star $1.58M of fair value.
    for (const unit of UNITS) {
      const toi = beliefWeight(unit, "toiPerGame", 10);
      const pts = beliefWeight(unit, "pts60", 10);
      expect(toi, unit).toBeGreaterThan(pts);
    }
    expect(beliefWeight("F", "toiPerGame", 10)).toBeGreaterThan(0.55);
  });

  it("still shrinks a genuinely thin scoring sample hard", () => {
    expect(beliefWeight("F", "pts60", 8)).toBeLessThan(0.4);
  });

  it("returns nothing for a metric it does not carry", () => {
    expect(beliefWeight("F", "nonsense", 82)).toBe(0);
  });
});

describe("skater-prior — how much a baseline is worth", () => {
  it("credits a complete baseline with several seasons of evidence", () => {
    const full = baselineEvidence(MONEYPUCK_BASELINE.fullWeightSum);
    expect(full.priorSeasons).toBeCloseTo(MONEYPUCK_BASELINE.priorSeasons, 6);
    expect(full.overlapShare).toBeCloseTo(MONEYPUCK_BASELINE.currentSeasonShare, 6);
  });

  it("credits a rookie's baseline with nothing beyond the season it already is", () => {
    // At a weight sum of 0.50 the only season in the baseline IS this season.
    // Crediting it as independent evidence would let one year vouch for itself.
    const rookie = baselineEvidence(MONEYPUCK_BASELINE.currentSeasonShare);
    expect(rookie.overlapShare).toBe(1);
  });

  it("scales smoothly between the two, and never claims more than complete", () => {
    let prev = -1;
    for (const w of [0.5, 0.65, 0.8, 0.95, 1.0]) {
      const e = baselineEvidence(w);
      expect(e.priorSeasons).toBeGreaterThan(prev);
      prev = e.priorSeasons;
    }
    expect(baselineEvidence(4).priorSeasons).toBeCloseTo(MONEYPUCK_BASELINE.priorSeasons, 6);
    expect(baselineEvidence(null).priorSeasons).toBeCloseTo(MONEYPUCK_BASELINE.priorSeasons, 6);
  });
});

describe("skater-prior — pooling", () => {
  const base = { unit: "F" as SkaterUnit, key: "pts60" as const };

  it("says nothing when it knows nothing", () => {
    expect(pooledRate({ ...base, current: null, currentGames: null })).toBeNull();
    expect(pooledRate({ ...base, current: 2, currentGames: 0 })).toBeNull();
    expect(pooledRate({ ...base, current: NaN, currentGames: 70 })).toBeNull();
  });

  it("lands between the season and the prior, never outside them", () => {
    const p = pooledRate({
      ...base, current: 1.2, currentGames: FULL_SEASON_GAMES,
      prior: 2.8, priorGames: FULL_SEASON_GAMES * 2, overlapShare: 0,
    })!;
    expect(p.value).toBeGreaterThan(1.2);
    expect(p.value).toBeLessThan(2.8);
    expect(p.usedPrior).toBe(true);
  });

  it("weights by sample, so more history pulls harder", () => {
    const light = pooledRate({ ...base, current: 1.2, currentGames: FULL_SEASON_GAMES, prior: 2.8, priorGames: FULL_SEASON_GAMES * 0.5, overlapShare: 0 })!;
    const heavy = pooledRate({ ...base, current: 1.2, currentGames: FULL_SEASON_GAMES, prior: 2.8, priorGames: FULL_SEASON_GAMES * 4, overlapShare: 0 })!;
    expect(heavy.value).toBeGreaterThan(light.value);
  });

  it("ignores a prior that is entirely the season it is being pooled against", () => {
    // The boundary an earlier draft got backwards: discounting the CURRENT
    // sample here left a fifteen-game player reported as fully sampled.
    const thin = 15;
    const p = pooledRate({ ...base, current: 3.2, currentGames: thin, prior: 3.2, priorGames: FULL_SEASON_GAMES * 1.35, overlapShare: 1 })!;
    expect(p.usedPrior).toBe(false);
    expect(p.effectiveGames).toBe(thin);
    expect(p.thin).toBe(true);
    expect(p.belief).toBeLessThan(0.6);
  });

  it("shrinks a thin sample toward the population and a full one not at all", () => {
    const mean = skaterMetric("F", "pts60")!.mean;
    const thin = pooledRate({ ...base, current: 3.5, currentGames: 12 })!;
    const full = pooledRate({ ...base, current: 3.5, currentGames: FULL_SEASON_GAMES })!;
    expect(thin.value).toBeLessThan(3.5);
    expect(thin.value).toBeGreaterThan(mean);
    expect(full.value).toBeCloseTo(3.5, 6);
  });

  it("shrinks a thin sample upward when it is below the population", () => {
    // Symmetry matters — a cold twelve games is as unreliable as a hot one.
    const mean = skaterMetric("F", "pts60")!.mean;
    const cold = pooledRate({ ...base, current: 0.4, currentGames: 12 })!;
    expect(cold.value).toBeGreaterThan(0.4);
    expect(cold.value).toBeLessThan(mean);
  });
});

describe("skater-prior — the season adapter", () => {
  const season = (over: Partial<SeasonPriorInput> = {}): SeasonPriorInput => ({
    unit: "F", ptsPace: 55, minutesPerGame: 18, games: 80, ...over,
  });

  it("converts a per-82 pace into the per-sixty rate the model wants", () => {
    // 55 points per 82 at 18 minutes a night is 55 / (18 × 82 / 60) ≈ 2.24/60.
    const p = skaterSeasonPrior(season({ games: 82 }));
    expect(p.pts60!).toBeCloseTo(55 / ((18 * 82) / 60), 2);
  });

  it("leaves a full, consistent season essentially where it found it", () => {
    // The load-bearing case. A prior that moves proven players is a prior that
    // has replaced the evidence rather than sharpened it.
    const mcdavid = season({ ptsPace: 120, minutesPerGame: 21.5, games: 80, baselinePtsPace: 118, baselineSeasonsWeighted: 1 });
    const raw = 120 / ((21.5 * 82) / 60);
    const p = skaterSeasonPrior(mcdavid);
    expect(Math.abs(p.pts60! - raw)).toBeLessThan(0.15);
    expect(p.belief).toBe(1);
    expect(p.thin).toBe(false);
  });

  it("pulls a shortened down year back toward the player's own history", () => {
    // Why this module exists: a 67-game season priced Matthews at $8.30M in the
    // comparison run against the live roster.
    const downYear = season({ ptsPace: 55, minutesPerGame: 20.5, games: 67 });
    const withHistory = { ...downYear, baselinePtsPace: 78, baselineSeasonsWeighted: 1 };
    const before = skaterSeasonPrior(downYear).pts60!;
    const after = skaterSeasonPrior(withHistory).pts60!;
    expect(after).toBeGreaterThan(before);

    const priced = (pts60: number) => skaterFmvAav({ pts60, minutesPerGame: 20.5, age: 28, isUfa: true, unit: "F" }, CAP)!;
    expect(priced(after) - priced(before)).toBeGreaterThan(0.5);
  });

  it("does not let a hot call-up price as a star", () => {
    const callup = season({ ptsPace: 60, minutesPerGame: 14.6, games: 12 });
    const p = skaterSeasonPrior(callup);
    expect(p.thin).toBe(true);
    expect(p.belief).toBeLessThan(0.6);
    expect(p.pts60!).toBeLessThan(60 / ((14.6 * 82) / 60));
  });

  it("lets the same rate stand once it is a full season", () => {
    const proven = season({ ptsPace: 60, minutesPerGame: 14.6, games: 82 });
    const p = skaterSeasonPrior(proven);
    expect(p.belief).toBeGreaterThan(0.9);
    expect(p.pts60!).toBeCloseTo(60 / ((14.6 * 82) / 60), 1);
  });

  it("shrinks deployment on a thin sample, since it has no prior of its own", () => {
    const eightGames = skaterSeasonPrior(season({ minutesPerGame: 22, games: 8 }));
    const fullSeason = skaterSeasonPrior(season({ minutesPerGame: 22, games: 80 }));
    expect(eightGames.minutesPerGame!).toBeLessThan(22);
    expect(fullSeason.minutesPerGame!).toBeCloseTo(22, 1);
  });

  it("degrades rather than throwing when the season is missing", () => {
    const nothing = skaterSeasonPrior(season({ ptsPace: null, minutesPerGame: null, games: null }));
    expect(nothing.pts60).toBeNull();
    expect(nothing.thin).toBe(true);
    expect(nothing.belief).toBe(0);
  });

  it("prices both units without a position ever being guessed into the wrong model", () => {
    for (const unit of UNITS) {
      const p = skaterSeasonPrior(season({ unit, baselinePtsPace: 50, baselineSeasonsWeighted: 1 }));
      expect(p.pts60, unit).not.toBeNull();
      // A defenceman pooled against the defence population, not the forward one.
      expect(p.pts60!, unit).toBeGreaterThan(0);
    }
    const asF = skaterSeasonPrior(season({ unit: "F", games: 10 })).pts60!;
    const asD = skaterSeasonPrior(season({ unit: "D", games: 10 })).pts60!;
    expect(asF).not.toBeCloseTo(asD, 3);
  });
});

describe("skater-prior — percentiles and captions", () => {
  it("ranks against the right population for the position", () => {
    // 0.9 pts/60 is a bottom-six forward and an above-average defenceman.
    expect(skaterPercentile("F", "pts60", 0.9)!).toBeLessThan(20);
    expect(skaterPercentile("D", "pts60", 0.9)!).toBeGreaterThan(50);
  });

  it("clamps the tails instead of extrapolating off the table", () => {
    expect(skaterPercentile("F", "pts60", -5)).toBe(1);
    expect(skaterPercentile("F", "pts60", 500)).toBe(99);
  });

  it("returns null rather than a confident 50 when it cannot say", () => {
    expect(skaterPercentile("F", "pts60", null)).toBeNull();
    expect(skaterPercentile("F", "nonsense", 1)).toBeNull();
  });

  it("describes stability in words a caption can use", () => {
    expect(skaterStabilityLabel("F", "toiPerGame")).toMatch(/repeats/);
    expect(skaterStabilityLabel("F", "pts60")).toMatch(/repeats/);
    expect(skaterStabilityLabel("F", "nonsense")).toBeNull();
  });
});
