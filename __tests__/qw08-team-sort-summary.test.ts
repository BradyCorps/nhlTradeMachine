import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { teamSortSummary, type TeamSortFacts } from "@/app/lib/team-sort-summary";

const FACTS: TeamSortFacts = {
  standing: 4,
  present: 7.26,
  future: 6.84,
  rosterNAV: 1275.8,
  capSpace: 5.25,
  goalDiff: 18,
  gravityPercentile: 92.2,
  speedMph: 22.37,
};

describe("QW-08 Teams active-sort summary", () => {
  it("formats the exact controlling metric with its league rank", () => {
    expect(teamSortSummary("present", FACTS, 2)).toBe("Present 7.3 · 2nd");
    expect(teamSortSummary("future", FACTS, 3)).toBe("Future 6.8 · 3rd");
    expect(teamSortSummary("rosterNAV", FACTS, 1)).toBe("NAV 1,276 · 1st");
    expect(teamSortSummary("capSpace", FACTS, 5)).toBe("Cap space +$5.3M · 5th");
    expect(teamSortSummary("goalDiff", FACTS, 4)).toBe("Goal diff +18 · 4th");
    expect(teamSortSummary("gravity", FACTS, 6)).toBe("Gravity 92nd pct · 6th");
    expect(teamSortSummary("speed", FACTS, 7)).toBe("Speed 22.4 mph · 7th");
  });

  it("describes standing and alphabetical order without inventing a metric", () => {
    expect(teamSortSummary("standing", FACTS, 4)).toBe("Standing 4th");
    expect(teamSortSummary("name", FACTS, 8)).toBe("Name A–Z · 8th");
    expect(teamSortSummary("division", FACTS, 0)).toBeNull();
  });

  it("labels unavailable optional samples instead of displaying a false zero", () => {
    const missing = { ...FACTS, gravityPercentile: null, speedMph: null };
    expect(teamSortSummary("gravity", missing, 32)).toBe("Gravity — · 32nd");
    expect(teamSortSummary("speed", missing, 32)).toBe("Speed — · 32nd");
  });

  it("renders the summary in collapsed rows and marks the selected sort", () => {
    const page = readFileSync("app/teams/page.tsx", "utf8");
    expect(page).toContain("sortRankByTeamId");
    expect(page).toContain("sortSummary={teamSortSummary(");
    expect(page).toContain("{sortSummary && (");
    expect(page).toContain('aria-label={`Sorted by ${sortSummary}`}');
    expect(page).toContain("aria-pressed={sortKey === key}");
  });
});
