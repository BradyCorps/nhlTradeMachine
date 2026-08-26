import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("QW-11 mobile spacing and interaction cues", () => {
  it("keeps the Docket ruling disclosure inside the page gutter with a 44px target", () => {
    const docket = read("app/docket/DocketClient.tsx");
    const styles = read("app/globals.css");
    const page = read("app/docket/page.tsx");

    expect(docket).toContain('className="docket-ruling-summary"');
    expect(styles).toMatch(/\.docket-ruling-summary\s*\{[\s\S]*?min-height:\s*44px/);
    expect(styles).toMatch(/\.docket-ruling-summary\s*\{[\s\S]*?padding:/);
    expect(page).toContain('padding: "24px 18px 36px"');
  });

  it("shows a reusable cue beside intentional horizontal control scrollers", () => {
    const cue = read("app/components/HorizontalScrollCue.tsx");
    expect(cue).toContain("Swipe or scroll for more");
    expect(cue).toContain("md:hidden");

    for (const path of [
      "app/players/page.tsx",
      "app/components/TeamNavChart.tsx",
      "app/armchair-gm/GmAnalysisTabs.tsx",
      "app/armchair-gm/MatchResultsPanel.tsx",
      "app/armchair-gm/SeasonResultsPager.tsx",
      "app/components/TradeProposal.tsx",
    ]) {
      expect(read(path), path).toContain("HorizontalScrollCue");
    }
  });

  it("lets touch and keyboard users pin, dismiss, and compare scatter data in a table", () => {
    const scatter = read("app/components/NavLeagueScatter.tsx");

    expect(scatter).toContain("pinnedId");
    expect(scatter).toContain("aria-pressed={isPinned}");
    expect(scatter).toContain("Dismiss pinned player");
    expect(scatter).toContain("Compare all plotted players in a table");
    expect(scatter).toContain("Compared with");
    expect(scatter).toContain("<table");
    expect(scatter).toContain('event.key === "Escape"');
  });

  it("keeps both bottom action sheets above the device safe area", () => {
    const verdict = read("app/armchair-gm/VerdictSheet.tsx");
    const trade = read("app/components/QuickTradeMachine.tsx");

    expect(verdict).toContain("env(safe-area-inset-bottom)");
    expect(trade).toContain("env(safe-area-inset-bottom)");
  });
});
