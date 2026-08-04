import { describe, it, expect } from "vitest";
import artifact from "@/app/data/goal-value.json";

const CAP = 104;
const perGoal = artifact.marketRate.capPctPerGoal;

describe("goal-value — the artifact", () => {
  it("carries no player rows and names its sources", () => {
    expect(JSON.stringify(artifact)).not.toMatch(/playerId/);
    for (const s of artifact.sources) expect((s as any).sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("measured replacement level instead of picking a percentile", () => {
    // The first pass used the 10th percentile of a rate distribution because it
    // sounded about right. Replacement is the denominator, so a guess there
    // sets the answer.
    expect(artifact.replacementLevel.contracts).toBeGreaterThan(500);
    expect(artifact.replacementLevel.playersMatched).toBeGreaterThan(200);
    expect(artifact.replacementLevel.basis).toMatch(/minimum/i);
    expect(artifact.replacementLevel.why).toMatch(/not a percentile/i);
  });

  it("excluded entry-level deals from the replacement population", () => {
    // Celebrini is on one. A cheap contract only measures replacement level
    // when the player was free to sign anywhere and nobody bid more.
    expect(artifact.replacementLevel.why).toMatch(/entry-level/i);
  });

  it("puts replacement below the average skater, where it belongs", () => {
    // Value is measured against the league average, so replacement must be
    // negative. A positive figure would mean the freely available player is
    // better than the average one.
    expect(artifact.replacementLevel.per60).toBeLessThan(0);
    expect(artifact.replacementLevel.per60).toBeGreaterThan(-1);
  });
});

describe("goal-value — the rate", () => {
  it("agrees between a fitted slope and a walk of the pay ladder", () => {
    // The ladder walk assumes no functional form. If the two diverge, the
    // linear fit is being dragged by something.
    const gap = Math.abs(perGoal - artifact.marketRate.capPctPerGoalLadderEnds)
      / Math.max(perGoal, artifact.marketRate.capPctPerGoalLadderEnds);
    expect(gap).toBeLessThan(0.2);
  });

  it("prices real players at figures real players sign for", () => {
    // The check that caught the rejected derivation. A median regular near a
    // median contract, and the best season on record inside the legal maximum.
    const s = artifact.marketRate.sanityCheck;
    expect(s.medianFullSeasonCapPct).toBeGreaterThan(0.01);
    expect(s.medianFullSeasonCapPct).toBeLessThan(0.04);
    expect(s.bestSeasonEverCapPct).toBeLessThan(0.20);
    expect(s.bestSeasonEverCapPct * CAP).toBeGreaterThan(8);
  });

  it("publishes the rate as non-constant, because it is", () => {
    // Marginal price per goal roughly triples from the middle of the pay ladder
    // to the top — the same convexity that put skater-fmv on a monotone spline.
    // A single figure is a fair average and a bad extrapolation.
    const bands = artifact.marginalByBand;
    expect(bands.length).toBeGreaterThanOrEqual(4);
    const top = bands[bands.length - 2].capPctPerGoal;
    const middle = bands[1].capPctPerGoal;
    expect(top).toBeGreaterThan(middle * 1.5);
  });
});

describe("goal-value — the derivation that was rejected", () => {
  it("keeps the failed route on the record rather than deleting it", () => {
    // A reader deserves to know the obvious second derivation was tried.
    expect(artifact.budgetConstraintRejected).toBeDefined();
    expect(artifact.budgetConstraintRejected.whyRejected).toMatch(/goaltending|inefficiency/i);
  });

  it("records how badly it failed", () => {
    // Total discretionary payroll divided by the production ONE metric can see.
    // At that rate a median regular costs $6.9M and the best season $67.5M.
    expect(artifact.budgetConstraintRejected.timesHigherThanMarket).toBeGreaterThan(3);
    const absurd = artifact.budgetConstraintRejected.capPctPerGoal * artifact.marketRate.sanityCheck.bestSeasonEverGar;
    expect(absurd).toBeGreaterThan(0.20);   // past the CBA maximum
  });

  it("does not average the two into a compromise", () => {
    // Splitting the difference between a right answer and a wrong one gives a
    // wrong answer with no derivation behind it.
    const mid = (perGoal + artifact.budgetConstraintRejected.capPctPerGoal) / 2;
    expect(perGoal).not.toBeCloseTo(mid, 6);
  });
});
