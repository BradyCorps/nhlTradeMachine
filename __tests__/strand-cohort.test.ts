// ── strand-cohort.test.ts ────────────────────────────────────────
//
// strand-cohort is the ONE definition of "who a player is ranked against" —
// same position group, ≥20 GP, including the player. Before it, the dossier
// built this filter inline while the trade machine used a different (min-max)
// scale entirely, so the same player read one number on the dossier and another
// in a trade panel. These pin the filter and, the headline guarantee, that a
// STRAND built off this cohort matches a percentile computed directly against
// the same field — the two surfaces can no longer disagree.

import { describe, it, expect } from "vitest";
import {
  posGroupOf, cohortForGroup, buildStrandCohort,
  STRAND_COHORT_NOUN, STRAND_COHORT_MIN_GP,
} from "@/app/lib/strand-cohort";
import { buildStrandPercentiles, metricPercentile } from "@/app/lib/strand-metrics";

function skater(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { position: "C", games: 40, ops: 5, dps: 3, ptsPace: 60, xGPace: 20, avgTOI: 18, ...over };
}

describe("posGroupOf", () => {
  it("folds wings and centres into F, keeps D and G", () => {
    expect(posGroupOf("C")).toBe("F");
    expect(posGroupOf("L")).toBe("F");
    expect(posGroupOf("R")).toBe("F");
    expect(posGroupOf("W")).toBe("F");
    expect(posGroupOf("D")).toBe("D");
    expect(posGroupOf("G")).toBe("G");
  });
});

describe("cohortForGroup", () => {
  const roster = [
    skater({ position: "C", games: 40 }),   // in F
    skater({ position: "L", games: 25 }),   // in F
    skater({ position: "C", games: 10 }),   // too few games
    skater({ position: "D", games: 50 }),   // in D
    skater({ position: "G", games: 40 }),   // in G
    { position: "Pick", games: 99 },        // never a player
    null,                                    // defensive: skip junk
  ];

  it("keeps the position group with enough games and drops the rest", () => {
    const f = cohortForGroup(roster as never, "F");
    expect(f).toHaveLength(2);
    const d = cohortForGroup(roster as never, "D");
    expect(d).toHaveLength(1);
    const g = cohortForGroup(roster as never, "G");
    expect(g).toHaveLength(1);
  });

  it("uses the ≥20 GP gate the percentile card applies", () => {
    expect(STRAND_COHORT_MIN_GP).toBe(20);
    const justUnder = cohortForGroup([skater({ games: 19 })] as never, "F");
    const justOver = cohortForGroup([skater({ games: 20 })] as never, "F");
    expect(justUnder).toHaveLength(0);
    expect(justOver).toHaveLength(1);
  });

  it("slims members to the metric fields the rails read", () => {
    const [m] = cohortForGroup([skater({ ops: 7, name: "Nobody", teamId: "XYZ" })] as never, "F");
    expect(m.ops).toBe(7);
    expect((m as Record<string, unknown>).name).toBeUndefined();
    expect((m as Record<string, unknown>).teamId).toBeUndefined();
  });
});

describe("buildStrandCohort", () => {
  it("derives the group from the player's position", () => {
    const roster = [skater({ position: "C" }), skater({ position: "D" })];
    expect(buildStrandCohort(roster as never, { position: "R" })).toHaveLength(1); // the F
    expect(buildStrandCohort(roster as never, { position: "D" })).toHaveLength(1); // the D
  });

  it("includes the player himself, exactly as the card does", () => {
    const player = skater({ position: "C", ops: 9 });
    const roster = [player, ...Array.from({ length: 14 }, (_, i) => skater({ ops: i }))];
    const cohort = buildStrandCohort(roster as never, player as { position: string });
    expect(cohort).toHaveLength(15);
    expect(cohort.some(m => m.ops === 9)).toBe(true);
  });
});

// The reason this module exists: a STRAND rail built off the cohort must equal a
// percentile computed directly against the same field. If these ever diverge,
// the dossier and the trade machine are showing two different numbers again.
describe("the cohort feeds one derivation everywhere", () => {
  it("a rail's percentile IS metricPercentile of the same raw + cohort", () => {
    const player = skater({ position: "C", ops: 6, dps: 4 });
    const roster = [player, ...Array.from({ length: 30 }, (_, i) =>
      skater({ position: "C", ops: i * 0.4, dps: i * 0.2 }))];
    const cohort = buildStrandCohort(roster as never, player as { position: string });

    const strand = buildStrandPercentiles(player as never, cohort, false);
    const opsRail = strand.off.find(r => r.label === "OPS")!;
    const direct = metricPercentile(6, cohort.map(m => m.ops as number));

    expect(opsRail.percentile).toBe(direct);
    expect(opsRail.unavailable).toBe(false);
  });
});

describe("STRAND_COHORT_NOUN", () => {
  it("names each group for the 'ranked vs …' caption", () => {
    expect(STRAND_COHORT_NOUN.F).toBe("forwards");
    expect(STRAND_COHORT_NOUN.D).toBe("defensemen");
    expect(STRAND_COHORT_NOUN.G).toBe("goalies");
  });
});
