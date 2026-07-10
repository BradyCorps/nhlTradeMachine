import { describe, it, expect } from "vitest";
import { careerPeakFromSnapshots } from "../app/lib/development-profile";

const snap = (season: string, ptsPerGame: number, games = 82, league: string = "NHL", nhlePtsPace?: number) =>
  ({ season, league, games, goals: 0, assists: 0, points: Math.round(ptsPerGame * games), ptsPerGame, nhlePtsPace } as any);

describe("careerPeakFromSnapshots", () => {
  it("returns the best real NHL season pace (Scheifele: 103, not a stale 88)", () => {
    const peak = careerPeakFromSnapshots([
      snap("2023-24", 52 / 82),
      snap("2024-25", 67 / 82),
      snap("2025-26", 103 / 82), // 36G 67A = 103
    ]);
    expect(peak).toBe(103);
  });
  it("ignores tiny samples and non-NHL leagues", () => {
    const peak = careerPeakFromSnapshots([
      snap("2024-25", 120 / 82, 3),            // 3 GP — ignored
      snap("2025-26-AHL", 90 / 82, 60, "AHL"), // not NHL — ignored
      snap("2025-26", 70 / 82, 80),
    ]);
    expect(peak).toBe(70);
  });
  it("returns undefined with no qualifying seasons", () => {
    expect(careerPeakFromSnapshots([])).toBeUndefined();
  });
});
