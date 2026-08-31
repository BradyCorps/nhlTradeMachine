// QW-09 — Players route URL state must recover safely from anything a user
// (or a hand-edited/stale link) can put in the query string.
import { describe, expect, it } from "vitest";
import {
  PLAYERS_URL_DEFAULTS, buildPlayersUrlQuery, parsePlayersUrlState, readPlayersUrlState,
} from "@/app/lib/players-url-state";

describe("parsePlayersUrlState", () => {
  it("returns every default on an empty query string", () => {
    expect(parsePlayersUrlState(new URLSearchParams(""))).toEqual(PLAYERS_URL_DEFAULTS);
  });

  it("reads every recognized field", () => {
    const params = new URLSearchParams(
      "q=mcdavid&pos=D&team=EDM&sort=cap&dir=asc&fpage=3&dpage=2&gpage=4&player=mcdavid001",
    );
    expect(parsePlayersUrlState(params)).toEqual({
      search: "mcdavid", posFilter: "D", teamFilter: "EDM", sortKey: "cap", sortDir: "asc",
      forwardPage: 3, defencePage: 2, goaliePage: 4, playerId: "mcdavid001",
    });
  });

  it("falls back to defaults for an unrecognized position, sort key, or direction", () => {
    const params = new URLSearchParams("pos=WING&sort=not-a-real-key&dir=sideways");
    const parsed = parsePlayersUrlState(params);
    expect(parsed.posFilter).toBe("ALL");
    expect(parsed.sortKey).toBe("seasonPts");
    expect(parsed.sortDir).toBe("desc");
  });

  it("clamps a page number that is zero, negative, or not a number to 1", () => {
    expect(parsePlayersUrlState(new URLSearchParams("fpage=0")).forwardPage).toBe(1);
    expect(parsePlayersUrlState(new URLSearchParams("dpage=-5")).defencePage).toBe(1);
    expect(parsePlayersUrlState(new URLSearchParams("gpage=banana")).goaliePage).toBe(1);
  });

  it("treats an empty player id as no selection rather than an empty-string id", () => {
    expect(parsePlayersUrlState(new URLSearchParams("player=")).playerId).toBeNull();
  });
});

describe("buildPlayersUrlQuery", () => {
  it("produces an empty string when every field is at its default", () => {
    expect(buildPlayersUrlQuery(PLAYERS_URL_DEFAULTS)).toBe("");
  });

  it("includes only the fields that differ from default", () => {
    const query = buildPlayersUrlQuery({ ...PLAYERS_URL_DEFAULTS, posFilter: "D", sortDir: "asc" });
    const params = new URLSearchParams(query);
    expect(params.get("pos")).toBe("D");
    expect(params.get("dir")).toBe("asc");
    expect(params.has("q")).toBe(false);
    expect(params.has("sort")).toBe(false);
  });

  it("round-trips a fully customized state through build then parse", () => {
    const state = {
      search: "conn hellebuyck", posFilter: "G" as const, teamFilter: "WPG",
      sortKey: "svPct" as const, sortDir: "asc" as const,
      forwardPage: 2, defencePage: 3, goaliePage: 1, playerId: "hellebuyck001",
    };
    const roundTripped = parsePlayersUrlState(new URLSearchParams(buildPlayersUrlQuery(state)));
    expect(roundTripped).toEqual(state);
  });
});

describe("readPlayersUrlState", () => {
  it("returns defaults when window is unavailable (server render)", () => {
    expect(typeof window).toBe("undefined");
    expect(readPlayersUrlState()).toEqual(PLAYERS_URL_DEFAULTS);
  });
});
