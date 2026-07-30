import { describe, expect, it } from "vitest";
import {
  FIT_THRESHOLDS, TIER_MEANING, classifyMatch,
  type MatchCapFit, type MatchFitTier,
} from "../app/lib/match-fit";

const CAP_FITS: MatchCapFit[] = ["FITS", "TIGHT"];

describe("classifyMatch — cap decides possibility, score decides interest", () => {
  // The reported defect: the ladder tested `capFit === "FITS"` between the
  // score bands, so a club scoring 0 was filed as CAP_CLEAR for having room.
  it("does not promote a club for having cap space alone", () => {
    expect(classifyMatch(0, "FITS")).toBe("LONG_SHOT");
    expect(classifyMatch(10, "FITS")).toBe("LONG_SHOT");
  });

  it("files a middling club the same whether its cap is roomy or tight", () => {
    // Cap room is not interest. A rebuilding club has plenty and no reason to help.
    expect(classifyMatch(40, "FITS")).toBe("POSSIBLE");
    expect(classifyMatch(40, "TIGHT")).toBe("POSSIBLE");
  });

  it("keeps LONG_SHOT reachable on a roomy cap", () => {
    // Previously unreachable for any club whose cap FITS, because FITS was
    // caught a line above — so the folder actually meant "tight cap".
    expect(classifyMatch(FIT_THRESHOLDS.POSSIBLE - 1, "FITS")).toBe("LONG_SHOT");
  });

  it("reserves BLOCKED for the cap making it impossible", () => {
    expect(classifyMatch(99, "OVER")).toBe("BLOCKED");
    expect(classifyMatch(0, "OVER")).toBe("BLOCKED");
    // A club that simply is not interested is a long shot, not blocked.
    for (const capFit of CAP_FITS) expect(classifyMatch(0, capFit)).not.toBe("BLOCKED");
  });

  it("leads only on a real score", () => {
    for (const capFit of CAP_FITS) {
      expect(classifyMatch(FIT_THRESHOLDS.LEAD, capFit)).toBe("LEAD");
      expect(classifyMatch(FIT_THRESHOLDS.LEAD - 1, capFit)).toBe("POSSIBLE");
    }
  });

  it("is monotone in score for a given cap fit", () => {
    // Higher interest may never file a club in a worse folder.
    const rank: Record<MatchFitTier, number> = { BLOCKED: 0, LONG_SHOT: 1, POSSIBLE: 2, LEAD: 3 };
    for (const capFit of CAP_FITS) {
      for (let score = 1; score <= 100; score++) {
        const here = rank[classifyMatch(score, capFit)];
        const below = rank[classifyMatch(score - 1, capFit)];
        expect(here, `score ${score} (${capFit})`).toBeGreaterThanOrEqual(below);
      }
    }
  });

  it("never blocks on score alone, at any score", () => {
    for (const capFit of CAP_FITS) {
      for (let score = 0; score <= 100; score++) {
        expect(classifyMatch(score, capFit), `score ${score} (${capFit})`).not.toBe("BLOCKED");
      }
    }
  });

  it("always blocks when the cap is over, at any score", () => {
    for (let score = 0; score <= 100; score++) {
      expect(classifyMatch(score, "OVER")).toBe("BLOCKED");
    }
  });
});

describe("TIER_MEANING", () => {
  it("explains every tier the classifier can return", () => {
    const produced = new Set<MatchFitTier>();
    for (const capFit of ["FITS", "TIGHT", "OVER"] as MatchCapFit[]) {
      for (let score = 0; score <= 100; score += 5) produced.add(classifyMatch(score, capFit));
    }
    for (const tier of produced) {
      expect(TIER_MEANING[tier], tier).toBeTruthy();
    }
    expect(produced.size).toBe(4);
  });

  it("describes BLOCKED as a cap problem, not a lack of interest", () => {
    expect(TIER_MEANING.BLOCKED).toMatch(/cap/i);
  });
});
