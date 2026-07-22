// ── PA12 — redefined analytics Outlook ───────────────────────────
import { describe, it, expect } from "vitest";
import {
  deriveOutlook,
  parseTrajectory,
  trajectoryDirection,
  edgeReads,
} from "@/app/lib/player-outlook";
import type { DevelopmentProfile } from "@/app/lib/development-profile";

const baseProfile = (over: Partial<DevelopmentProfile> = {}): DevelopmentProfile => ({
  currentFantasyScore: 60, dynastyScore: 60, breakoutProbability: 40, regressionRisk: 30,
  developmentPhase: "PEAK_WINDOW", timelineTrend: "FLAT",
  projectionBand: { floorPts82: 60, medianPts82: 80, ceilingPts82: 100, confidence: 88 },
  volatility: 30, boomBustScore: 50, boomBustSignal: "STABLE", boomScore: 40, bustScore: 20,
  nhlExperienceScore: 90, pedigreeScore: 50, productionScore: 80, roleGrowthScore: 60,
  durabilityScore: 85, tags: [], rationale: [],
  season: "2025-26", age: 29, league: "NHL", games: 82, goals: 40, assists: 60, points: 100,
  ptsPerGame: 1.2,
  ...over,
} as any);

describe("parseTrajectory + trajectoryDirection", () => {
  it("parses '2023-24: 142 pts/82' labels into numbers", () => {
    const s = parseTrajectory(["2023-24: 142 pts/82", "2024-25: 122 pts/82", "2025-26: 138 pts/82"]);
    expect(s).toEqual([
      { season: "2023-24", pace: 142 },
      { season: "2024-25", pace: 122 },
      { season: "2025-26", pace: 138 },
    ]);
  });

  it("classifies direction on an 8 pts/82 threshold", () => {
    expect(trajectoryDirection([{ season: "a", pace: 40 }, { season: "b", pace: 60 }])).toBe("RISING");
    expect(trajectoryDirection([{ season: "a", pace: 60 }, { season: "b", pace: 40 }])).toBe("COOLING");
    expect(trajectoryDirection([{ season: "a", pace: 60 }, { season: "b", pace: 63 }])).toBe("STEADY");
    expect(trajectoryDirection([{ season: "a", pace: 60 }])).toBe("UNKNOWN");
  });
});

describe("edgeReads — leading indicators", () => {
  it("reads cold finishing as a bounce-back (good), hot as cool-off (warn)", () => {
    const cold = edgeReads({ hdFinishingDelta: -0.04 }, true).find(r => r.label === "Finishing Luck")!;
    expect(cold.tone).toBe("good");
    expect(cold.read).toMatch(/bounce back/i);
    const hot = edgeReads({ hdFinishingDelta: 0.05 }, true).find(r => r.label === "Finishing Luck")!;
    expect(hot.tone).toBe("warn");
    expect(hot.read).toMatch(/cool-off/i);
  });

  it("normalizes bursts to a per-82 rate", () => {
    const r = edgeReads({ edgeBurstsOver20: 60, games: 40 }, false).find(x => x.label === "20+ mph Bursts")!;
    expect(r.value).toBe("123/82"); // 60/40*82
  });

  it("only emits reads for signals that are present", () => {
    expect(edgeReads({}, false)).toHaveLength(0);
    expect(edgeReads({ edgeSpeedMaxMph: 23 }, false).map(r => r.label)).toEqual(["Top Speed"]);
  });
});

describe("deriveOutlook headline", () => {
  it("does not slap fantasy dynasty/boom-bust on an established star — it reads the trend", () => {
    // McDavid-shaped: peak window, elite projection, steady scoring.
    const o = deriveOutlook(
      baseProfile({
        developmentPhase: "PEAK_WINDOW", timelineTrend: "FLAT", peakYearsLeft: 3,
        projectionBand: { floorPts82: 125, medianPts82: 135, ceilingPts82: 147, confidence: 99 },
        scoringTrajectory: ["2023-24: 142 pts/82", "2024-25: 122 pts/82", "2025-26: 138 pts/82"],
        careerPeakPts82: 153,
      }),
      { age: 29, games: 80, edgeSpeedMaxMph: 23.1, hdFinishingDelta: 0.021 },
    );
    expect(o.headline).toBe("IN HIS PRIME");
    expect(o.tone).toBe("good");
    expect(o.projection.median).toBe(135);
    expect(o.trajectory.careerPeak).toBe(153);
    expect(o.edgeReads.some(r => r.label === "Top Speed")).toBe(true);
  });

  it("calls a young riser ASCENDING", () => {
    const o = deriveOutlook(
      baseProfile({ developmentPhase: "EMERGING", timelineTrend: "RISING",
        scoringTrajectory: ["2023-24: 30 pts/82", "2024-25: 55 pts/82"] }),
      { age: 21, games: 78 },
    );
    expect(o.headline).toBe("ASCENDING");
    expect(o.trajectory.direction).toBe("RISING");
  });

  it("calls an aging, cooling player PAST PEAK — DECLINING", () => {
    const o = deriveOutlook(
      baseProfile({ developmentPhase: "DECLINING", timelineTrend: "FALLING", peakYearsLeft: 0,
        scoringTrajectory: ["2023-24: 70 pts/82", "2024-25: 55 pts/82", "2025-26: 44 pts/82"] }),
      { age: 35, games: 70 },
    );
    expect(o.headline).toBe("PAST PEAK — DECLINING");
    expect(o.tone).toBe("bad");
    expect(o.trajectory.direction).toBe("COOLING");
  });

  it("flags a thin, volatile sample instead of pretending to project it", () => {
    const o = deriveOutlook(baseProfile({ timelineTrend: "VOLATILE" }), { age: 24, games: 18 });
    expect(o.headline).toBe("UNSETTLED");
    expect(o.tone).toBe("warn");
  });
});
