import { describe, expect, it } from "vitest";
import { calcDevelopmentProfile, type DevelopmentProfileInput } from "../app/lib/development-profile";

const profile = (input: DevelopmentProfileInput) => calcDevelopmentProfile(input);

describe("Development Timeline Layer — fixture archetypes", () => {
  it("labels ordinary mid-career players as peak-window instead of UNKNOWN", () => {
    const p = profile({
      id: "mid-career",
      name: "Middle Six Forward",
      position: "W",
      age: 27,
      nhlGames: 310,
      ptsPace: 38,
      avgTOI: 13,
      snapshots: [
        { season: "2024-25", age: 26, league: "NHL", games: 72, goals: 13, assists: 21, points: 34, ptsPerGame: 0.47, nhlePtsPace: 38, avgTOI: 13 },
      ],
    });

    expect(p.developmentPhase).toBe("PEAK_WINDOW");
  });

  it("does not call low-volatility low-confidence profiles high variance", () => {
    const p = profile({
      id: "stable-small-sample",
      name: "Stable Small Sample",
      position: "W",
      age: 24,
      nhlGames: 55,
      ptsPace: 32,
      avgTOI: 12,
      snapshots: [
        { season: "2024-25", age: 23, league: "NHL", games: 25, goals: 4, assists: 6, points: 10, ptsPerGame: 0.4, nhlePtsPace: 32, avgTOI: 11.5 },
        { season: "2025-26", age: 24, league: "NHL", games: 30, goals: 5, assists: 7, points: 12, ptsPerGame: 0.4, nhlePtsPace: 32, avgTOI: 12 },
      ],
    });

    expect(p.volatility).toBeLessThanOrEqual(35);
    expect(p.boomBustSignal).not.toBe("HIGH_VARIANCE");
  });

  it("dampens one-snapshot role growth instead of saturating it", () => {
    const p = profile({
      id: "single-role-jump",
      name: "Single Role Jump",
      position: "C",
      age: 22,
      nhlGames: 30,
      ptsPace: 36,
      avgTOI: 16,
      snapshots: [
        { season: "2025-26", age: 22, league: "NHL", games: 30, goals: 5, assists: 8, points: 13, ptsPerGame: 0.43, nhlePtsPace: 36, avgTOI: 9 },
      ],
    });

    expect(p.roleGrowthScore).toBeLessThan(80);
  });

  it("Brad Lambert is volatile boom-or-bust with limited NHL experience", () => {
    const p = profile({
      id: "8483471",
      name: "Brad Lambert",
      position: "C",
      age: 22,
      nhlGames: 25,
      ptsPace: 26,
      avgTOI: 11.5,
      draftOverall: 30,
      teamContext: "AVERAGE",
      snapshots: [
        { season: "2023-24", age: 20, league: "AHL", games: 64, goals: 21, assists: 34, points: 55, ptsPerGame: 0.86, nhlePtsPace: 34, avgTOI: 15 },
        { season: "2024-25", age: 21, league: "AHL", games: 46, goals: 7, assists: 28, points: 35, ptsPerGame: 0.76, nhlePtsPace: 30, avgTOI: 15.5 },
        { season: "2025-26", age: 22, league: "NHL", games: 25, goals: 4, assists: 4, points: 8, ptsPerGame: 0.32, nhlePtsPace: 26, avgTOI: 11.5 },
      ],
    });

    expect(p.developmentPhase).toBe("BREAKOUT_CANDIDATE");
    expect(p.tags).toContain("BOOM_BUST");
    expect(["BUST_LEAN", "HIGH_VARIANCE"]).toContain(p.boomBustSignal);
    expect(p.boomScore).toBeGreaterThan(0);
    expect(p.bustScore).toBeGreaterThan(0);
    expect(p.nhlExperienceScore).toBeLessThan(15);
    expect(p.boomBustScore).toBeGreaterThanOrEqual(65);
    expect(p.projectionBand.ceilingPts82 - p.projectionBand.floorPts82).toBeGreaterThan(25);
  });

  it("Quinton Byfield is young but materially more bankable than Lambert", () => {
    const lambert = profile({
      id: "lambert",
      name: "Brad Lambert",
      position: "C",
      age: 22,
      nhlGames: 25,
      ptsPace: 26,
      draftOverall: 30,
      snapshots: [
        { season: "2023-24", age: 20, league: "AHL", games: 64, goals: 21, assists: 34, points: 55, ptsPerGame: 0.86, nhlePtsPace: 34 },
        { season: "2025-26", age: 22, league: "NHL", games: 25, goals: 4, assists: 4, points: 8, ptsPerGame: 0.32, nhlePtsPace: 26 },
      ],
    });
    const byfield = profile({
      id: "byfield",
      name: "Quinton Byfield",
      position: "C",
      age: 23,
      nhlGames: 260,
      ptsPace: 62,
      avgTOI: 18,
      draftOverall: 2,
      snapshots: [
        { season: "2023-24", age: 21, league: "NHL", games: 80, goals: 20, assists: 35, points: 55, ptsPerGame: 0.69, nhlePtsPace: 56, avgTOI: 16 },
        { season: "2024-25", age: 22, league: "NHL", games: 78, goals: 23, assists: 38, points: 61, ptsPerGame: 0.78, nhlePtsPace: 64, avgTOI: 17 },
        { season: "2025-26", age: 23, league: "NHL", games: 78, goals: 25, assists: 34, points: 59, ptsPerGame: 0.76, nhlePtsPace: 62, avgTOI: 18 },
      ],
    });

    expect(byfield.developmentPhase).toBe("BREAKOUT_CANDIDATE");
    expect(byfield.nhlExperienceScore).toBeGreaterThan(lambert.nhlExperienceScore);
    expect(byfield.dynastyScore).toBeGreaterThan(lambert.dynastyScore);
    expect(byfield.boomBustScore).toBeLessThan(lambert.boomBustScore);
    expect(byfield.boomScore).toBeGreaterThan(byfield.bustScore);
    expect(byfield.projectionBand.confidence).toBeGreaterThan(lambert.projectionBand.confidence);
  });

  it("Celebrini and Bedard are elite emerging studs, with Bedard carrying context drag", () => {
    const celebrini = profile({
      id: "celebrini",
      name: "Macklin Celebrini",
      position: "C",
      age: 19,
      nhlGames: 140,
      ptsPace: 82,
      avgTOI: 20,
      draftOverall: 1,
      internationalScore: 88,
      teamContext: "AVERAGE",
      snapshots: [
        { season: "2024-25", age: 18, league: "NHL", games: 70, goals: 28, assists: 40, points: 68, ptsPerGame: 0.97, nhlePtsPace: 80, avgTOI: 19 },
        { season: "2025-26", age: 19, league: "NHL", games: 70, goals: 32, assists: 38, points: 70, ptsPerGame: 1.0, nhlePtsPace: 82, avgTOI: 20 },
      ],
    });
    const bedard = profile({
      id: "bedard",
      name: "Connor Bedard",
      position: "C",
      age: 20,
      nhlGames: 210,
      ptsPace: 88,
      avgTOI: 20.5,
      draftOverall: 1,
      internationalScore: 95,
      teamContext: "WEAK",
      linemateContext: "WEAK",
      snapshots: [
        { season: "2023-24", age: 18, league: "NHL", games: 68, goals: 22, assists: 39, points: 61, ptsPerGame: 0.9, nhlePtsPace: 74, avgTOI: 19 },
        { season: "2024-25", age: 19, league: "NHL", games: 78, goals: 30, assists: 48, points: 78, ptsPerGame: 1.0, nhlePtsPace: 82, avgTOI: 20 },
        { season: "2025-26", age: 20, league: "NHL", games: 76, goals: 36, assists: 45, points: 81, ptsPerGame: 1.07, nhlePtsPace: 88, avgTOI: 20.5 },
      ],
    });

    expect(celebrini.developmentPhase).toBe("EMERGING");
    expect(bedard.developmentPhase).toBe("EMERGING");
    expect(celebrini.tags).toContain("ELITE_PEDIGREE");
    expect(bedard.tags).toContain("CONTEXT_DRAG");
    expect(bedard.dynastyScore).toBeGreaterThanOrEqual(celebrini.dynastyScore - 10);
    expect(bedard.breakoutProbability).toBeLessThan(celebrini.breakoutProbability);
  });

  it("Ivar Stenberg is an emerging draft profile with low NHL confidence", () => {
    const p = profile({
      id: "stenberg",
      name: "Ivar Stenberg",
      position: "W",
      age: 18,
      nhlGames: 0,
      ptsPace: 0,
      draftOverall: 14,
      internationalScore: 78,
      snapshots: [
        { season: "2024-25", age: 17, league: "SHL", games: 45, goals: 9, assists: 12, points: 21, ptsPerGame: 0.47, nhlePtsPace: 28 },
        { season: "2025-26", age: 18, league: "SHL", games: 50, goals: 15, assists: 20, points: 35, ptsPerGame: 0.7, nhlePtsPace: 42 },
      ],
    });

    expect(p.developmentPhase).toBe("EMERGING");
    expect(p.timelineTrend).toBe("RISING");
    expect(p.projectionBand.confidence).toBeLessThan(50);
    expect(p.tags).toContain("LOW_CONFIDENCE");
  });

  it("Seider is an established young defenseman while Schaefer is emerging after a Calder-level season", () => {
    const seider = profile({
      id: "seider",
      name: "Moritz Seider",
      position: "D",
      age: 25,
      nhlGames: 380,
      ptsPace: 48,
      avgTOI: 23.5,
      draftOverall: 6,
      snapshots: [
        { season: "2023-24", age: 23, league: "NHL", games: 82, goals: 9, assists: 33, points: 42, ptsPerGame: 0.51, nhlePtsPace: 42, avgTOI: 23 },
        { season: "2024-25", age: 24, league: "NHL", games: 82, goals: 8, assists: 38, points: 46, ptsPerGame: 0.56, nhlePtsPace: 46, avgTOI: 23.3 },
        { season: "2025-26", age: 25, league: "NHL", games: 82, goals: 10, assists: 38, points: 48, ptsPerGame: 0.59, nhlePtsPace: 48, avgTOI: 23.5 },
      ],
    });
    const schaefer = profile({
      id: "schaefer",
      name: "Matthew Schaefer",
      position: "D",
      age: 19,
      nhlGames: 82,
      ptsPace: 52,
      avgTOI: 21,
      draftOverall: 1,
      internationalScore: 82,
      snapshots: [
        { season: "2024-25", age: 18, league: "CHL", games: 56, goals: 15, assists: 42, points: 57, ptsPerGame: 1.02, nhlePtsPace: 36, avgTOI: 24 },
        { season: "2025-26", age: 19, league: "NHL", games: 82, goals: 12, assists: 40, points: 52, ptsPerGame: 0.63, nhlePtsPace: 52, avgTOI: 21 },
      ],
    });

    expect(seider.developmentPhase).toBe("PEAK_WINDOW");
    expect(schaefer.developmentPhase).toBe("EMERGING");
    expect(seider.projectionBand.confidence).toBeGreaterThan(schaefer.projectionBand.confidence);
    expect(schaefer.dynastyScore).toBeGreaterThanOrEqual(seider.dynastyScore - 10);
  });

  it("Scheifele's career year at 33 is regression risk, while McDavid remains the generational baseline", () => {
    const scheifele = profile({
      id: "scheifele",
      name: "Mark Scheifele",
      position: "C",
      age: 33,
      nhlGames: 900,
      ptsPace: 96,
      avgTOI: 20,
      draftOverall: 7,
      snapshots: [
        { season: "2023-24", age: 31, league: "NHL", games: 74, goals: 25, assists: 47, points: 72, ptsPerGame: 0.97, nhlePtsPace: 80, avgTOI: 19 },
        { season: "2024-25", age: 32, league: "NHL", games: 78, goals: 31, assists: 46, points: 77, ptsPerGame: 0.99, nhlePtsPace: 81, avgTOI: 19.4 },
        { season: "2025-26", age: 33, league: "NHL", games: 80, goals: 42, assists: 52, points: 94, ptsPerGame: 1.18, nhlePtsPace: 96, avgTOI: 20 },
      ],
    });
    const mcdavid = profile({
      id: "mcdavid",
      name: "Connor McDavid",
      position: "C",
      age: 29,
      nhlGames: 800,
      ptsPace: 130,
      avgTOI: 22,
      draftOverall: 1,
      internationalScore: 100,
      snapshots: [
        { season: "2023-24", age: 27, league: "NHL", games: 76, goals: 35, assists: 95, points: 130, ptsPerGame: 1.71, nhlePtsPace: 140, avgTOI: 22 },
        { season: "2024-25", age: 28, league: "NHL", games: 74, goals: 34, assists: 84, points: 118, ptsPerGame: 1.59, nhlePtsPace: 130, avgTOI: 22 },
        { season: "2025-26", age: 29, league: "NHL", games: 76, goals: 36, assists: 85, points: 121, ptsPerGame: 1.59, nhlePtsPace: 130, avgTOI: 22 },
      ],
    });

    expect(scheifele.developmentPhase).toBe("REGRESSION_RISK");
    expect(scheifele.tags).toContain("REGRESSION_RISK");
    expect(mcdavid.developmentPhase).toBe("PEAK_WINDOW");
    expect(mcdavid.dynastyScore).toBeGreaterThan(scheifele.dynastyScore);
    expect(mcdavid.projectionBand.confidence).toBeGreaterThan(80);
  });

  it("separates extreme elite scorers in production and projection instead of flattening them", () => {
    const elite = profile({
      id: "elite-center",
      name: "Elite Center",
      position: "C",
      age: 27,
      nhlGames: 520,
      ptsPace: 92,
      avgTOI: 20,
      draftOverall: 3,
      snapshots: [
        { season: "2023-24", age: 25, league: "NHL", games: 78, goals: 34, assists: 50, points: 84, ptsPerGame: 1.08, nhlePtsPace: 88, avgTOI: 19.5 },
        { season: "2024-25", age: 26, league: "NHL", games: 80, goals: 36, assists: 53, points: 89, ptsPerGame: 1.11, nhlePtsPace: 91, avgTOI: 20 },
        { season: "2025-26", age: 27, league: "NHL", games: 82, goals: 38, assists: 54, points: 92, ptsPerGame: 1.12, nhlePtsPace: 92, avgTOI: 20 },
      ],
    });
    const highElite = profile({
      id: "high-elite-center",
      name: "High Elite Center",
      position: "C",
      age: 27,
      nhlGames: 520,
      ptsPace: 135,
      avgTOI: 22,
      draftOverall: 1,
      internationalScore: 100,
      snapshots: [
        { season: "2023-24", age: 25, league: "NHL", games: 78, goals: 43, assists: 74, points: 117, ptsPerGame: 1.5, nhlePtsPace: 123, avgTOI: 21.5 },
        { season: "2024-25", age: 26, league: "NHL", games: 80, goals: 48, assists: 82, points: 130, ptsPerGame: 1.63, nhlePtsPace: 133, avgTOI: 22 },
        { season: "2025-26", age: 27, league: "NHL", games: 82, goals: 50, assists: 85, points: 135, ptsPerGame: 1.65, nhlePtsPace: 135, avgTOI: 22 },
      ],
    });
    const generational = profile({
      id: "generational-center",
      name: "Generational Center",
      position: "C",
      age: 27,
      nhlGames: 520,
      ptsPace: 150,
      avgTOI: 22,
      draftOverall: 1,
      internationalScore: 100,
      snapshots: [
        { season: "2023-24", age: 25, league: "NHL", games: 78, goals: 48, assists: 82, points: 130, ptsPerGame: 1.67, nhlePtsPace: 137, avgTOI: 21.5 },
        { season: "2024-25", age: 26, league: "NHL", games: 80, goals: 52, assists: 92, points: 144, ptsPerGame: 1.8, nhlePtsPace: 148, avgTOI: 22 },
        { season: "2025-26", age: 27, league: "NHL", games: 82, goals: 56, assists: 94, points: 150, ptsPerGame: 1.83, nhlePtsPace: 150, avgTOI: 22 },
      ],
    });

    expect(elite.productionScore).toBeLessThan(100);
    expect(generational.productionScore).toBeGreaterThan(elite.productionScore);
    expect(generational.projectionBand.medianPts82).toBeGreaterThan(highElite.projectionBand.medianPts82);
    expect(generational.projectionBand.ceilingPts82).toBeGreaterThan(highElite.projectionBand.ceilingPts82);
  });

  it("uses games played durability to separate identical per-82 profiles", () => {
    const durable = profile({
      id: "durable-wing",
      name: "Durable Wing",
      position: "W",
      age: 27,
      nhlGames: 246,
      ptsPace: 70,
      avgTOI: 18,
      snapshots: [
        { season: "2023-24", age: 25, league: "NHL", games: 82, goals: 30, assists: 40, points: 70, ptsPerGame: 0.85, nhlePtsPace: 70, avgTOI: 18 },
        { season: "2024-25", age: 26, league: "NHL", games: 82, goals: 30, assists: 40, points: 70, ptsPerGame: 0.85, nhlePtsPace: 70, avgTOI: 18 },
        { season: "2025-26", age: 27, league: "NHL", games: 82, goals: 30, assists: 40, points: 70, ptsPerGame: 0.85, nhlePtsPace: 70, avgTOI: 18 },
      ],
    });
    const injuryProne = profile({
      id: "injury-prone-wing",
      name: "Injury Prone Wing",
      position: "W",
      age: 27,
      nhlGames: 90,
      ptsPace: 70,
      avgTOI: 18,
      snapshots: [
        { season: "2023-24", age: 25, league: "NHL", games: 30, goals: 11, assists: 15, points: 26, ptsPerGame: 0.87, nhlePtsPace: 70, avgTOI: 18 },
        { season: "2024-25", age: 26, league: "NHL", games: 30, goals: 11, assists: 15, points: 26, ptsPerGame: 0.87, nhlePtsPace: 70, avgTOI: 18 },
        { season: "2025-26", age: 27, league: "NHL", games: 30, goals: 11, assists: 15, points: 26, ptsPerGame: 0.87, nhlePtsPace: 70, avgTOI: 18 },
      ],
    });

    expect(durable.durabilityScore).toBeGreaterThan(injuryProne.durabilityScore);
    expect(injuryProne.regressionRisk).toBeGreaterThan(durable.regressionRisk);
    expect(injuryProne.bustScore).toBeGreaterThan(durable.bustScore);
    expect(durable.projectionBand.confidence).toBeGreaterThan(injuryProne.projectionBand.confidence);
  });

  it("adds peak-years-left framing only for established veterans", () => {
    const veteran = profile({
      id: "veteran-star",
      name: "Veteran Star",
      position: "C",
      age: 33,
      nhlGames: 850,
      ptsPace: 102,
      avgTOI: 20,
      draftOverall: 4,
      snapshots: [
        { season: "2023-24", age: 31, league: "NHL", games: 76, goals: 35, assists: 55, points: 90, ptsPerGame: 1.18, nhlePtsPace: 96, avgTOI: 20 },
        { season: "2024-25", age: 32, league: "NHL", games: 78, goals: 37, assists: 58, points: 95, ptsPerGame: 1.22, nhlePtsPace: 100, avgTOI: 20 },
        { season: "2025-26", age: 33, league: "NHL", games: 80, goals: 40, assists: 60, points: 100, ptsPerGame: 1.25, nhlePtsPace: 102, avgTOI: 20 },
      ],
    });
    const prospect = profile({
      id: "young-prospect",
      name: "Young Prospect",
      position: "W",
      age: 22,
      nhlGames: 120,
      ptsPace: 52,
      avgTOI: 16,
      draftOverall: 5,
      snapshots: [
        { season: "2024-25", age: 21, league: "NHL", games: 58, goals: 16, assists: 20, points: 36, ptsPerGame: 0.62, nhlePtsPace: 51, avgTOI: 15 },
        { season: "2025-26", age: 22, league: "NHL", games: 62, goals: 18, assists: 21, points: 39, ptsPerGame: 0.63, nhlePtsPace: 52, avgTOI: 16 },
      ],
    });

    expect(veteran.peakYearsLeft).toBeDefined();
    expect(veteran.peakYearsLeft).toBeGreaterThanOrEqual(0);
    expect(prospect.peakYearsLeft).toBeUndefined();
  });

  it("elite peak players do not fall to UNKNOWN when the route only has current-season games", () => {
    const p = profile({
      id: "mcdavid-route",
      name: "Connor McDavid",
      position: "C",
      age: 29,
      nhlGames: 52,
      ptsPace: 130,
      avgTOI: 22,
      draftOverall: 1,
      snapshots: [
        { season: "2025-26", age: 29, league: "NHL", games: 52, goals: 25, assists: 58, points: 83, ptsPerGame: 1.6, nhlePtsPace: 130, avgTOI: 22 },
      ],
    });

    expect(p.developmentPhase).toBe("PEAK_WINDOW");
    expect(p.boomBustSignal).not.toBe("BUST_LEAN");
  });

  it("uses NHL timeline games as career experience when the route only has current-season GP", () => {
    const p = profile({
      id: "trocheck-route",
      name: "Vincent Trocheck",
      position: "C",
      age: 32,
      nhlGames: 68,
      ptsPace: 62,
      avgTOI: 18,
      draftOverall: 64,
      snapshots: [
        { season: "2023-24", age: 30, league: "NHL", games: 82, goals: 25, assists: 52, points: 77, ptsPerGame: 0.939, nhlePtsPace: 77, avgTOI: 19 },
        { season: "2024-25", age: 31, league: "NHL", games: 80, goals: 26, assists: 33, points: 59, ptsPerGame: 0.738, nhlePtsPace: 60, avgTOI: 18.5 },
        { season: "2025-26", age: 32, league: "NHL", games: 68, goals: 20, assists: 31, points: 51, ptsPerGame: 0.75, nhlePtsPace: 62, avgTOI: 18 },
      ],
    });

    expect(p.nhlExperienceScore).toBeGreaterThan(65);
    expect(p.developmentPhase).not.toBe("BREAKOUT_CANDIDATE");
    expect(p.rationale[0]).toContain("Established NHL sample");
  });

  it("decays draft pedigree once established NHL production is more predictive", () => {
    const lafreniere = profile({
      id: "lafreniere",
      name: "Alexis Lafreniere",
      position: "W",
      age: 24,
      nhlGames: 420,
      ptsPace: 53,
      avgTOI: 16.5,
      draftOverall: 1,
      snapshots: [
        { season: "2023-24", age: 22, league: "NHL", games: 82, goals: 28, assists: 29, points: 57, ptsPerGame: 0.70, nhlePtsPace: 57, avgTOI: 16 },
        { season: "2024-25", age: 23, league: "NHL", games: 82, goals: 17, assists: 28, points: 45, ptsPerGame: 0.55, nhlePtsPace: 45, avgTOI: 15.8 },
        { season: "2025-26", age: 24, league: "NHL", games: 82, goals: 24, assists: 33, points: 57, ptsPerGame: 0.70, nhlePtsPace: 57, avgTOI: 16.5 },
      ],
    });
    const jarvis = profile({
      id: "jarvis",
      name: "Seth Jarvis",
      position: "W",
      age: 24,
      nhlGames: 390,
      ptsPace: 73,
      avgTOI: 18.5,
      draftOverall: 13,
      snapshots: [
        { season: "2023-24", age: 22, league: "NHL", games: 81, goals: 33, assists: 34, points: 67, ptsPerGame: 0.83, nhlePtsPace: 68, avgTOI: 17.9 },
        { season: "2024-25", age: 23, league: "NHL", games: 73, goals: 32, assists: 35, points: 67, ptsPerGame: 0.92, nhlePtsPace: 75, avgTOI: 18.3 },
        { season: "2025-26", age: 24, league: "NHL", games: 72, goals: 28, assists: 38, points: 66, ptsPerGame: 0.92, nhlePtsPace: 75, avgTOI: 18.5 },
      ],
    });

    expect(lafreniere.pedigreeScore).toBeGreaterThan(jarvis.pedigreeScore);
    expect(lafreniere.effectivePedigreeScore).toBe(0);
    expect(jarvis.productionScore).toBeGreaterThan(lafreniere.productionScore);
    expect(jarvis.dynastyScore).toBeGreaterThan(lafreniere.dynastyScore);
    expect(lafreniere.rationale.join(" ")).toContain("Draft pedigree is mostly historical now");
    expect(jarvis.scoringTrajectory).toHaveLength(3);
  });

  it("Giroux and Patrick Kane are late-career declining profiles", () => {
    for (const veteran of [
      { name: "Claude Giroux", position: "C" as const, ptsPace: 48 },
      { name: "Patrick Kane", position: "W" as const, ptsPace: 54 },
    ]) {
      const p = profile({
        id: veteran.name.toLowerCase().replace(/\s/g, "-"),
        name: veteran.name,
        position: veteran.position,
        age: 38,
        nhlGames: 1200,
        ptsPace: veteran.ptsPace,
        avgTOI: 15,
        draftOverall: veteran.name === "Patrick Kane" ? 1 : 22,
        snapshots: [
          { season: "2023-24", age: 36, league: "NHL", games: 78, goals: 20, assists: 42, points: 62, ptsPerGame: 0.79, nhlePtsPace: 65, avgTOI: 17 },
          { season: "2024-25", age: 37, league: "NHL", games: 72, goals: 18, assists: 35, points: 53, ptsPerGame: 0.74, nhlePtsPace: 60, avgTOI: 16 },
          { season: "2025-26", age: 38, league: "NHL", games: 66, goals: 15, assists: 28, points: 43, ptsPerGame: 0.65, nhlePtsPace: veteran.ptsPace, avgTOI: 15 },
        ],
      });

      expect(p.developmentPhase).toBe("DECLINING");
      expect(p.timelineTrend).toBe("FALLING");
      expect(p.regressionRisk).toBeGreaterThanOrEqual(70);
      expect(p.dynastyScore).toBeLessThan(55);
    }
  });
});
