import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeasonResultsPager } from "@/app/armchair-gm/SeasonResultsPager";
import { AI_SEASON_RECAP_PAUSED_MESSAGE } from "@/app/lib/season-recap";

describe("paused AI season recap presentation", () => {
  it("explains the pause while preserving simulated team numbers and Season Review", () => {
    const html = renderToStaticMarkup(createElement(SeasonResultsPager, {
      simResult: null,
      simData: { seed: 123, homeTeam: {
        teamId: "WPG", teamName: "Winnipeg Jets", projectedPoints: 98,
        projectedSkaters: [], madePlayoffs: true,
      } },
    }));
    expect(html).toContain(AI_SEASON_RECAP_PAUSED_MESSAGE);
    expect(html).toContain("Winnipeg Jets");
    expect(html).toContain("98");
    expect(html).toContain("Season Review");
    expect(html).not.toContain(">Recap</button>");
  });

  it("retains simulation failures instead of claiming results are available", () => {
    const message = "Simulation unavailable — deterministic projection engine did not return results.";
    const html = renderToStaticMarkup(createElement(SeasonResultsPager, {
      simData: null, simResult: message,
    }));
    expect(html).toContain(message);
    const withResults = renderToStaticMarkup(createElement(SeasonResultsPager, {
      simData: { seed: 123 }, simResult: message,
    }));
    expect(withResults).toContain(">Simulation status</button>");
    expect(withResults).not.toContain(">Recap</button>");
    expect(html).not.toContain(AI_SEASON_RECAP_PAUSED_MESSAGE);
  });

  it("does not show a results notice before simulation", () => {
    expect(renderToStaticMarkup(createElement(SeasonResultsPager, {
      simData: null, simResult: null,
    }))).toBe("");
  });
});
