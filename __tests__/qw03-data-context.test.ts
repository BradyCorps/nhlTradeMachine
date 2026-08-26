import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  XNAV_MODEL_VERSION,
  buildLeagueProvenance,
  routeDataContext,
} from "@/app/lib/data-context";

const fresh = buildLeagueProvenance({
  kind: "league",
  generatedAt: "2026-08-24T14:10:00.000Z",
  cacheState: "fresh",
  blocked: false,
  liveStats: true,
  playerCount: 780,
  analyticsCount: 742,
  contractsLoaded: 780,
  teamCount: 32,
});

describe("QW-03 route data context", () => {
  it("provides season, situation, timestamp, coverage, model, and reconciliation on every product", () => {
    for (const route of ["players", "teams", "fantasy", "trade", "armchair"] as const) {
      const context = routeDataContext(route, fresh, { capCeiling: 104 });
      const text = context.items.map(item => `${item.label}: ${item.value}`).join(" · ");

      expect(text).toContain("2025-26");
      expect(text).toContain("2026-27");
      expect(text).toContain("As of:");
      expect(text).toContain("Source / coverage:");
      expect(text).toContain(`Model: ${XNAV_MODEL_VERSION}`);
      expect(text).toContain("Reconciliation: Passed");
      if (route !== "armchair") expect(text).toContain("regular season");
    }
  });

  it("distinguishes completed, current, and three-year Teams horizons", () => {
    const context = routeDataContext("teams", fresh, { capCeiling: 104 });
    expect(context.items).toEqual(expect.arrayContaining([
      { label: "Completed results", value: "2025-26 regular season" },
      { label: "Current roster / cap", value: "2026-27 · $104.0M ceiling" },
      { label: "Future rating", value: "2028-29 age curve, prospects, and draft capital" },
    ]));
  });

  it("makes stale and failed coverage explicit instead of claiming Live", () => {
    const stale = buildLeagueProvenance({
      kind: "players",
      generatedAt: "2026-08-23T14:10:00.000Z",
      cacheState: "stale",
      blocked: false,
      liveStats: false,
      playerCount: 780,
      analyticsCount: 0,
      contractsLoaded: 780,
    });
    const context = routeDataContext("players", stale);
    expect(context.warning).toContain("stale cached snapshot");
    expect(context.warning).toContain("analytics source is unavailable");
    expect(context.items).toContainEqual({ label: "Reconciliation", value: "Warning" });
  });

  it("renders the shared rail on all requested routes and publishes API provenance", () => {
    const routeSources = [
      "app/players/page.tsx",
      "app/teams/page.tsx",
      "app/fantasy/page.tsx",
      "app/components/QuickTradeMachine.tsx",
      "app/armchair-gm/page.tsx",
    ].map(file => readFileSync(file, "utf8"));
    for (const source of routeSources) expect(source).toContain("DataContextRail");

    for (const file of [
      "app/api/league/route.ts",
      "app/api/league/teams/route.ts",
      "app/api/league/players/route.ts",
    ]) {
      expect(readFileSync(file, "utf8")).toContain("buildLeagueProvenance");
    }
  });
});
