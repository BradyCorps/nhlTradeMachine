// QW-09 / V-05 — Teams index URL state. Which team is being VIEWED already
// round-trips through the path (`/teams/[team]` reuses this page
// component), so this only covers sort/filter/expand/collapse/nav-metric.
import { describe, expect, it } from "vitest";
import {
  TEAMS_URL_DEFAULTS, buildTeamsUrlQuery, parseTeamsUrlState, readTeamsUrlState,
} from "@/app/lib/teams-url-state";

describe("parseTeamsUrlState", () => {
  it("returns every default on an empty query string", () => {
    expect(parseTeamsUrlState(new URLSearchParams(""))).toEqual(TEAMS_URL_DEFAULTS);
  });

  it("reads every recognized field", () => {
    const params = new URLSearchParams("sort=capSpace&phase=Contender&expand=EDM&collapsed=1&metric=fNav");
    expect(parseTeamsUrlState(params)).toEqual({
      sortKey: "capSpace", filterPhase: "Contender", expandedId: "EDM", detailCollapsed: true, navDim: "fNav",
    });
  });

  it("falls back to defaults for an unrecognized sort key, phase, or nav metric", () => {
    const parsed = parseTeamsUrlState(new URLSearchParams("sort=not-a-real-key&phase=Playoffs&metric=hNav"));
    expect(parsed.sortKey).toBe("division");
    expect(parsed.filterPhase).toBe("ALL");
    expect(parsed.navDim).toBe("xnav");
  });

  it("treats an empty expand id as no selection rather than an empty-string id", () => {
    expect(parseTeamsUrlState(new URLSearchParams("expand=")).expandedId).toBeNull();
  });

  it("only reads collapsed=1 as true — anything else, including collapsed=true, is false", () => {
    expect(parseTeamsUrlState(new URLSearchParams("collapsed=1")).detailCollapsed).toBe(true);
    expect(parseTeamsUrlState(new URLSearchParams("collapsed=true")).detailCollapsed).toBe(false);
    expect(parseTeamsUrlState(new URLSearchParams("")).detailCollapsed).toBe(false);
  });
});

describe("buildTeamsUrlQuery", () => {
  it("produces an empty string when every field is at its default", () => {
    expect(buildTeamsUrlQuery(TEAMS_URL_DEFAULTS)).toBe("");
  });

  it("includes only the fields that differ from default", () => {
    const params = new URLSearchParams(buildTeamsUrlQuery({ ...TEAMS_URL_DEFAULTS, sortKey: "goalDiff" }));
    expect(params.get("sort")).toBe("goalDiff");
    expect(params.has("phase")).toBe(false);
    expect(params.has("expand")).toBe(false);
    expect(params.has("collapsed")).toBe(false);
    expect(params.has("metric")).toBe(false);
  });

  it("round-trips a fully customized state through build then parse", () => {
    const state = {
      sortKey: "speed" as const, filterPhase: "Rebuilding" as const,
      expandedId: "CHI", detailCollapsed: true, navDim: "gNav" as const,
    };
    expect(parseTeamsUrlState(new URLSearchParams(buildTeamsUrlQuery(state)))).toEqual(state);
  });
});

describe("readTeamsUrlState", () => {
  it("returns defaults when window is unavailable (server render)", () => {
    expect(typeof window).toBe("undefined");
    expect(readTeamsUrlState()).toEqual(TEAMS_URL_DEFAULTS);
  });
});
