import { describe, it, expect } from "vitest";
import {
  NHL_ASSET_HOST,
  MUG_SEASONS,
  isNhlPlayerId,
  isTeamCode,
  isNhlAssetUrl,
  mugUrl,
  headshotCandidates,
  teamLogoCandidates,
  candidateAt,
} from "@/app/lib/league-imagery";
import { SEASON } from "@/app/lib/season-config";

describe("league-imagery — key shapes", () => {
  it("accepts NHL player ids and rejects our own name slugs", () => {
    expect(isNhlPlayerId("8476392")).toBe(true);
    expect(isNhlPlayerId(8476392)).toBe(true);
    expect(isNhlPlayerId("84763921")).toBe(true);   // 8 digits also occur
    expect(isNhlPlayerId("connorbedard")).toBe(false);
    expect(isNhlPlayerId("847639")).toBe(false);    // too short
    expect(isNhlPlayerId("")).toBe(false);
    expect(isNhlPlayerId(null)).toBe(false);
    expect(isNhlPlayerId(undefined)).toBe(false);
  });

  it("accepts three-letter club codes only", () => {
    for (const code of ["WPG", "ANA", "UTA", "ARI"]) expect(isTeamCode(code)).toBe(true);
    for (const bad of ["wpg", "WPGX", "WP", "", null, undefined]) expect(isTeamCode(bad)).toBe(false);
  });

  it("treats only the league's own https host as a league asset", () => {
    expect(isNhlAssetUrl(`${NHL_ASSET_HOST}/mugs/nhl/20262027/WPG/8476392.png`)).toBe(true);
    expect(isNhlAssetUrl("https://example.com/mug.png")).toBe(false);
    expect(isNhlAssetUrl("http://assets.nhle.com/mugs/x.png")).toBe(false);
    // A lookalike host must not pass on a prefix match.
    expect(isNhlAssetUrl("https://assets.nhle.com.evil.test/x.png")).toBe(false);
    expect(isNhlAssetUrl(null)).toBe(false);
  });
});

describe("league-imagery — mug URLs", () => {
  it("builds the documented URL shape", () => {
    expect(mugUrl("8476392", "WPG", "20262027"))
      .toBe("https://assets.nhle.com/mugs/nhl/20262027/WPG/8476392.png");
  });

  it("returns null rather than a URL that is certain to 404", () => {
    expect(mugUrl("connorbedard", "CHI", "20262027")).toBeNull();
    expect(mugUrl("8476392", "chi", "20262027")).toBeNull();
    expect(mugUrl("8476392", "WPG", "2026")).toBeNull();
    expect(mugUrl(null, null, "20262027")).toBeNull();
  });

  it("tries the projected season before the last completed one", () => {
    expect(MUG_SEASONS[0]).toBe(SEASON.apiSeasonId);
    expect(new Set(MUG_SEASONS).size).toBe(MUG_SEASONS.length);
    expect(MUG_SEASONS.every(s => /^[0-9]{8}$/.test(s))).toBe(true);
  });
});

describe("league-imagery — headshot candidates", () => {
  const feedUrl = `${NHL_ASSET_HOST}/mugs/nhl/20252026/WPG/8476392.png`;

  it("leads with the feed's own URL, then derives", () => {
    const out = headshotCandidates({ id: "8476392", teamId: "WPG", headshot: feedUrl });
    expect(out[0]).toBe(feedUrl);
    expect(out.length).toBeGreaterThan(1);
    expect(out).toContain(mugUrl("8476392", "WPG", SEASON.apiSeasonId));
  });

  it("derives for a player the roster feed never covered", () => {
    const out = headshotCandidates({ id: "8484100", teamId: "ANA", headshot: null });
    expect(out).toEqual(MUG_SEASONS.map(s => mugUrl("8484100", "ANA", s)));
  });

  it("keeps a feed photo usable after a trade moves the club code", () => {
    // The mug for the NEW club does not exist yet; the feed URL still shows
    // the person, which is the whole point of the image.
    const traded = headshotCandidates({ id: "8476392", teamId: "TOR", headshot: feedUrl });
    expect(traded[0]).toBe(feedUrl);
  });

  it("never points at a non-league host", () => {
    const out = headshotCandidates({ id: "notanid", teamId: "WPG", headshot: "https://evil.test/x.png" });
    expect(out).toEqual([]);
  });

  it("returns nothing for a DB-only prospect with no feed photo", () => {
    expect(headshotCandidates({ id: "gavinmckenna", teamId: "SJS", headshot: null })).toEqual([]);
    expect(headshotCandidates({})).toEqual([]);
  });

  it("emits no duplicates even when the feed URL is one we would derive", () => {
    const derived = mugUrl("8476392", "WPG", SEASON.apiSeasonId)!;
    const out = headshotCandidates({ id: "8476392", teamId: "WPG", headshot: derived });
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("league-imagery — club logos", () => {
  it("offers the light variant first", () => {
    expect(teamLogoCandidates("WPG")).toEqual([
      "https://assets.nhle.com/logos/nhl/svg/WPG_light.svg",
      "https://assets.nhle.com/logos/nhl/svg/WPG_dark.svg",
    ]);
  });

  it("declines to guess a URL for anything that is not a club code", () => {
    expect(teamLogoCandidates("FA")).toEqual([]);
    expect(teamLogoCandidates(undefined)).toEqual([]);
  });
});

describe("league-imagery — fallback walk", () => {
  const list = ["a", "b"];

  it("advances one candidate per failure and then gives up", () => {
    expect(candidateAt(list, 0)).toBe("a");
    expect(candidateAt(list, 1)).toBe("b");
    expect(candidateAt(list, 2)).toBeNull();
    expect(candidateAt(list, 99)).toBeNull();
  });

  it("terminates for every list — the walk cannot loop", () => {
    for (const l of [[], ["a"], ["a", "b", "c"]]) {
      expect(candidateAt(l, l.length)).toBeNull();
    }
  });

  it("has nothing to show when there are no candidates", () => {
    expect(candidateAt([], 0)).toBeNull();
  });
});
