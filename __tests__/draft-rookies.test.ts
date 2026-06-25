import { describe, it, expect } from "vitest";
import { draftedRookieAssets, rookieAssetFromDraft, ROOKIE_ELC_CAP_HIT, ROOKIE_ELC_YEARS } from "@/app/lib/draft-rookies";
import type { DraftResult } from "@/app/lib/draft-2026";

function result(over: number, team: string, name: string, pos: string, league: string, gp: number, pts: number): DraftResult {
  return {
    overall: over, team, originalTeam: team,
    prospect: { rank: over, name, pos, league, club: "Club", gp, g: 0, a: pts, pts },
  };
}

describe("draft rookies", () => {
  it("signs a drafted prospect to a default 3-year ELC on his drafting team", () => {
    const a = rookieAssetFromDraft(result(5, "BUF", "Test Prospect", "C", "OHL", 60, 60));
    expect(a.teamId).toBe("BUF");
    expect(a.capHit).toBe(ROOKIE_ELC_CAP_HIT);
    expect(a.yearsRemaining).toBe(ROOKIE_ELC_YEARS);
    expect(a.contractStatus).toBe("SIGNED");
    expect(a.expiresThisOffseason).toBe(false);
    expect(a.draftOverall).toBe(5);
    expect(a.position).toBe("C");
  });

  it("normalizes scouting positions to roster slots", () => {
    expect(rookieAssetFromDraft(result(1, "TOR", "A", "LW/RW", "SHL", 40, 20)).position).toBe("W");
    expect(rookieAssetFromDraft(result(2, "SJS", "B", "F", "WHL", 40, 20)).position).toBe("W");
    expect(rookieAssetFromDraft(result(3, "VAN", "C", "D", "OHL", 40, 20)).position).toBe("D");
    expect(rookieAssetFromDraft(result(4, "CHI", "D", "G", "WHL", 40, 20)).position).toBe("G");
  });

  it("projects an NHL-equivalent scoring pace from junior production", () => {
    // 60 pts in 60 GP in the OHL (factor 0.30) → 1.0 ppg * 0.30 * 82 ≈ 24.6
    const a = rookieAssetFromDraft(result(7, "MTL", "Scorer", "C", "OHL", 60, 60));
    expect(a.prospectPtsPace).toBeCloseTo(24.6, 1);
  });

  it("gives every selection a unique id and keeps each on its drafting team", () => {
    const assets = draftedRookieAssets([
      result(1, "TOR", "One", "C", "NCAA", 30, 30),
      result(2, "SJS", "Two", "D", "WHL", 50, 40),
    ]);
    expect(assets).toHaveLength(2);
    expect(new Set(assets.map(a => a.id)).size).toBe(2);
    expect(assets[1].teamId).toBe("SJS");
  });
});
