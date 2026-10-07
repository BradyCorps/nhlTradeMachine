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
      // GmAnalysisTabs no longer scrolls: its tabs wrap below lg, so it has
      // no scroller to cue (see mob-journeys-2026-09.test.ts).
      "app/armchair-gm/MatchResultsPanel.tsx",
      "app/armchair-gm/SeasonResultsPager.tsx",
      "app/components/TradeProposal.tsx",
    ]) {
      expect(read(path), path).toContain("HorizontalScrollCue");
    }
  });

  it("lets touch and keyboard users select, remove, and compare scatter data in a table", () => {
    const scatter = read("app/components/NavLeagueScatter.tsx");

    // Selection goes through the shared searchable picker and removable chips,
    // never a tab stop per plotted point; the old pin/dismiss intent is kept.
    expect(scatter).toContain("PlayerPicker");
    expect(scatter).toContain("Remove ${p.name} from the comparison");
    expect(scatter).toContain("Reset comparisons");
    expect(scatter).toContain("Compare all plotted players in a table");
    expect(scatter).toContain("vs {lastName(currentPlayer)}");
    expect(scatter).toContain("<table");
    const plot = read("app/components/NavLeagueScatterPlot.tsx");
    expect(plot).toContain("accessibilityLayer={false}");           // no tab stop per point
    expect(scatter + plot).not.toContain('role="button"');
    expect(scatter).not.toMatch(/tabIndex=\{0\}\s*\n?\s*aria-pressed/);
  });

  it("keeps both bottom action sheets above the device safe area", () => {
    const verdict = read("app/armchair-gm/VerdictSheet.tsx");
    const trade = read("app/components/QuickTradeMachine.tsx");

    expect(verdict).toContain("env(safe-area-inset-bottom)");
    expect(trade).toContain("env(safe-area-inset-bottom)");
  });
});
