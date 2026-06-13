import { describe, expect, it } from "vitest";
import {
  buildDevelopmentInputForDbPlayer,
  buildDevelopmentInputFromPlayerPayload,
  buildDevelopmentInputFromNhlSummary,
  buildDevelopmentInputFromNhlTimeline,
  buildNhlSkaterSummaryMaps,
  buildNhlSkaterSummaryUrl,
  buildRecentNhlSeasonIds,
  confidenceFromAdapterCoverage,
  diagnoseDevelopmentInput,
  fetchCachedNhlSkaterTimelineRowsForPlayer,
  fetchNhlSkaterSummaryRows,
  fetchNhlSkaterTimelineRowsForPlayer,
  mergeTimelineSnapshots,
  normalizeNhlPosition,
  normalizeNhlSkaterSummaryRow,
  parseExternalTimelineRows,
  parseNhlToiMinutes,
  seasonLabelFromNhlSeasonId,
  snapshotFromNhlSkaterSummary,
  snapshotsFromNhlSeasonSummaryMatches,
} from "../app/lib/development-sources";

describe("Development source adapters", () => {
  it("normalizes NHL skater summary rows into timeline seeds", () => {
    const seed = normalizeNhlSkaterSummaryRow({
      playerId: 8483471,
      skaterFullName: "Brad Lambert",
      teamAbbrevs: "WPG",
      positionCode: "R",
      gamesPlayed: 25,
      goals: 4,
      assists: 4,
      timeOnIcePerGame: 690,
      birthDate: "2003-12-19",
    }, new Date("2026-06-13T00:00:00Z"));

    expect(seed).toEqual({
      playerId: "8483471",
      name: "Brad Lambert",
      position: "W",
      teamAbbrev: "WPG",
      games: 25,
      goals: 4,
      assists: 4,
      points: 8,
      ptsPace: 26.2,
      avgTOI: 11.5,
      age: 22,
    });
  });

  it("builds an NHL timeline snapshot from a summary row", () => {
    const snapshot = snapshotFromNhlSkaterSummary({
      playerId: 8483471,
      skaterFullName: "Brad Lambert",
      teamAbbrevs: "WPG",
      positionCode: "C",
      gamesPlayed: 25,
      goals: 4,
      assists: 4,
      timeOnIcePerGame: 690,
    }, { seasonLabel: "2025-26", age: 22, teamId: "WPG" });

    expect(snapshot).toMatchObject({
      season: "2025-26",
      age: 22,
      league: "NHL",
      teamId: "WPG",
      games: 25,
      points: 8,
      ptsPerGame: 0.32,
      nhlePtsPace: 26.2,
      avgTOI: 11.5,
    });
  });

  it("builds DevelopmentProfileInput without computing profile scores", () => {
    const input = buildDevelopmentInputFromNhlSummary({
      playerId: 8483471,
      skaterFullName: "Brad Lambert",
      teamAbbrevs: "WPG",
      positionCode: "C",
      gamesPlayed: 25,
      goals: 4,
      assists: 4,
      timeOnIcePerGame: 690,
    }, {
      age: 22,
      draftOverall: 30,
      teamContext: "AVERAGE",
    });

    expect(input).toMatchObject({
      id: "8483471",
      name: "Brad Lambert",
      position: "C",
      age: 22,
      nhlGames: 25,
      ptsPace: 26.2,
      avgTOI: 11.5,
      draftOverall: 30,
      teamContext: "AVERAGE",
    });
    expect(input?.snapshots).toHaveLength(1);
  });

  it("indexes NHL summary rows by id, slug, and slug-position", () => {
    const map = buildNhlSkaterSummaryMaps([
      {
        playerId: "8483471",
        skaterFullName: "Brad Lambert",
        teamAbbrevs: "WPG",
        positionCode: "C",
        gamesPlayed: 25,
        goals: 4,
        assists: 4,
      },
    ]);

    expect(map.get("id:8483471")?.name).toBe("Brad Lambert");
    expect(map.get("brad-lambert")?.teamAbbrev).toBe("WPG");
    expect(map.get("brad-lambert__C")?.ptsPace).toBe(26.2);
  });

  it("surfaces source diagnostics for risky development inputs", () => {
    const input = buildDevelopmentInputFromNhlSummary({
      playerId: "goalie",
      skaterFullName: "Future Goalie",
      positionCode: "G",
      gamesPlayed: 12,
      goals: 0,
      assists: 0,
    }, { age: 20 });

    expect(input).not.toBeNull();
    const diagnostics = diagnoseDevelopmentInput(input!);
    expect(diagnostics.warnings).toContain("goalie-development-model-not-validated");
    expect(diagnostics.warnings).toContain("limited-nhl-sample-without-pedigree-or-non-nhl-timeline");
  });

  it("keeps adapter coverage separate from model confidence", () => {
    const shallow = buildDevelopmentInputFromNhlSummary({
      playerId: "shallow",
      skaterFullName: "Shallow Sample",
      positionCode: "C",
      gamesPlayed: 10,
      goals: 1,
      assists: 2,
    }, { age: 20 });
    const deeper = buildDevelopmentInputFromNhlSummary({
      playerId: "deeper",
      skaterFullName: "Deeper Sample",
      positionCode: "C",
      gamesPlayed: 160,
      goals: 40,
      assists: 60,
    }, {
      age: 23,
      draftOverall: 5,
      teamContext: "STRONG",
      snapshots: [
        { season: "2023-24", age: 21, league: "NHL", games: 80, goals: 20, assists: 30, points: 50, ptsPerGame: 0.625, nhlePtsPace: 51 },
        { season: "2024-25", age: 22, league: "NHL", games: 80, goals: 20, assists: 30, points: 50, ptsPerGame: 0.625, nhlePtsPace: 51 },
      ],
    });

    expect(confidenceFromAdapterCoverage(deeper!)).toBeGreaterThan(confidenceFromAdapterCoverage(shallow!));
  });

  it("parses NHL position and TOI variants defensively", () => {
    expect(normalizeNhlPosition("L")).toBe("W");
    expect(normalizeNhlPosition("RW")).toBe("W");
    expect(normalizeNhlPosition("D")).toBe("D");
    expect(normalizeNhlPosition("-")).toBeNull();
    expect(parseNhlToiMinutes(690)).toBe(11.5);
    expect(parseNhlToiMinutes("11:30")).toBe(11.5);
    expect(parseNhlToiMinutes("bad")).toBeUndefined();
  });

  it("fetches NHL summary rows through an injectable fetcher", async () => {
    const calls: string[] = [];
    const rows = await fetchNhlSkaterSummaryRows({
      seasonId: "20252026",
      fetcher: (async (url: RequestInfo | URL) => {
        calls.push(String(url));
        return {
          ok: true,
          json: async () => ({ data: [{ playerId: 1, skaterFullName: "Test Player" }] }),
        } as Response;
      }) as typeof fetch,
    });

    expect(calls).toEqual([buildNhlSkaterSummaryUrl("20252026")]);
    expect(rows).toEqual([{ playerId: 1, skaterFullName: "Test Player" }]);
  });

  it("builds recent season ids and labels from NHL season ids", () => {
    expect(buildRecentNhlSeasonIds("20252026", 3)).toEqual(["20232024", "20242025", "20252026"]);
    expect(seasonLabelFromNhlSeasonId("20252026")).toBe("2025-26");
  });

  it("converts multi-season NHL summary matches into ordered snapshots", () => {
    const snapshots = snapshotsFromNhlSeasonSummaryMatches([
      {
        seasonId: "20252026",
        row: {
          playerId: 8483471,
          skaterFullName: "Brad Lambert",
          teamAbbrevs: "WPG",
          positionCode: "C",
          gamesPlayed: 25,
          goals: 4,
          assists: 4,
          timeOnIcePerGame: 690,
        },
      },
      {
        seasonId: "20242025",
        row: {
          playerId: 8483471,
          skaterFullName: "Brad Lambert",
          teamAbbrevs: "WPG",
          positionCode: "C",
          gamesPlayed: 4,
          goals: 1,
          assists: 0,
          timeOnIcePerGame: 520,
        },
      },
    ], { currentAge: 22, currentSeasonId: "20252026" });

    expect(snapshots.map(s => s.season)).toEqual(["2024-25", "2025-26"]);
    expect(snapshots.map(s => s.age)).toEqual([21, 22]);
    expect(snapshots.map(s => s.nhlePtsPace)).toEqual([20.5, 26.2]);
  });

  it("builds DevelopmentProfileInput from a multi-season NHL timeline", () => {
    const input = buildDevelopmentInputFromNhlTimeline([
      {
        seasonId: "20242025",
        row: {
          playerId: "byfield",
          skaterFullName: "Quinton Byfield",
          teamAbbrevs: "LAK",
          positionCode: "C",
          gamesPlayed: 78,
          goals: 23,
          assists: 38,
          timeOnIcePerGame: 1020,
        },
      },
      {
        seasonId: "20252026",
        row: {
          playerId: "byfield",
          skaterFullName: "Quinton Byfield",
          teamAbbrevs: "LAK",
          positionCode: "C",
          gamesPlayed: 78,
          goals: 25,
          assists: 34,
          timeOnIcePerGame: 1080,
        },
      },
    ], { age: 23, draftOverall: 2 });

    expect(input).toMatchObject({
      id: "byfield",
      name: "Quinton Byfield",
      age: 23,
      nhlGames: 78,
      ptsPace: 62,
      draftOverall: 2,
    });
    expect(input?.snapshots?.map(s => s.season)).toEqual(["2024-25", "2025-26"]);
  });

  it("fetches multi-season NHL timeline rows for a specific player id", async () => {
    const rows = await fetchNhlSkaterTimelineRowsForPlayer({
      playerId: 8483471,
      seasonIds: ["20242025", "20252026"],
      fetcher: (async (url: RequestInfo | URL) => {
        const season = String(url).includes("20242025") ? "20242025" : "20252026";
        return {
          ok: true,
          json: async () => ({
            data: [
              { playerId: 1, skaterFullName: "Other Player" },
              {
                playerId: 8483471,
                skaterFullName: "Brad Lambert",
                teamAbbrevs: "WPG",
                positionCode: "C",
                gamesPlayed: season === "20242025" ? 4 : 25,
                goals: season === "20242025" ? 1 : 4,
                assists: season === "20242025" ? 0 : 4,
              },
            ],
          }),
        } as Response;
      }) as typeof fetch,
    });

    expect(rows.map(r => r.seasonId)).toEqual(["20242025", "20252026"]);
    expect(rows.map(r => r.row.gamesPlayed)).toEqual([4, 25]);
  });

  it("reports cache coverage for timeline fetches without requiring Redis", async () => {
    const result = await fetchCachedNhlSkaterTimelineRowsForPlayer({
      playerId: 8483471,
      seasonIds: ["20252026"],
      fetcher: (async () => ({
        ok: true,
        json: async () => ({
          data: [{
            playerId: 8483471,
            skaterFullName: "Brad Lambert",
            teamAbbrevs: "WPG",
            positionCode: "C",
            gamesPlayed: 25,
            goals: 4,
            assists: 4,
          }],
        }),
      }) as Response) as typeof fetch,
    });

    expect(result.matches).toHaveLength(1);
    expect(result.cache).toEqual({
      enabled: false,
      timelineCacheHit: false,
      summaryCacheHits: [],
      liveFetches: ["20252026"],
    });
  });

  it("wires DB pedigree into NHL timeline-backed development input", () => {
    const input = buildDevelopmentInputForDbPlayer({
      id: "8483471",
      name: "Brad Lambert",
      position: "RW",
      age: 22,
      draftYear: 2022,
      draftOverall: 30,
      prospectPtsPace: 34,
    }, [
      {
        seasonId: "20252026",
        row: {
          playerId: 8483471,
          skaterFullName: "Brad Lambert",
          teamAbbrevs: "WPG",
          positionCode: "C",
          gamesPlayed: 25,
          goals: 4,
          assists: 4,
        },
      },
    ]);

    expect(input).toMatchObject({
      id: "8483471",
      name: "Brad Lambert",
      position: "W",
      age: 22,
      draftYear: 2022,
      draftOverall: 30,
      nhlGames: 25,
    });
    expect(input?.snapshots).toHaveLength(1);
  });

  it("falls back to DB prospect pedigree when no NHL timeline rows exist", () => {
    const input = buildDevelopmentInputForDbPlayer({
      id: "draft-pick",
      name: "Draft Pick",
      position: "C",
      age: 18,
      draftYear: 2026,
      draftOverall: 14,
      prospectPtsPace: 42,
    }, []);

    expect(input).toMatchObject({
      id: "draft-pick",
      name: "Draft Pick",
      position: "C",
      age: 18,
      nhlGames: 0,
      ptsPace: 42,
      draftYear: 2026,
      draftOverall: 14,
    });
    expect(input?.snapshots?.[0]).toMatchObject({
      season: "2025-26",
      league: "INTL",
      nhlePtsPace: 42,
    });
  });

  it("builds a route payload development input without changing valuation fields", () => {
    const input = buildDevelopmentInputFromPlayerPayload({
      id: "draft-pick",
      name: "Draft Pick",
      position: "C",
      age: 18,
      games: 0,
      ptsPace: 32,
      avgTOI: 13.5,
      draftOverall: 14,
      draftYear: 2026,
      prospectPtsPace: 42,
    });

    expect(input).toMatchObject({
      id: "draft-pick",
      name: "Draft Pick",
      position: "C",
      age: 18,
      nhlGames: 0,
      ptsPace: 42,
      draftOverall: 14,
    });
    expect(input?.snapshots).toEqual([
      expect.objectContaining({
        season: "2025-26",
        league: "INTL",
        nhlePtsPace: 42,
      }),
    ]);
  });

  it("normalizes guarded external AHL/CHL/NCAA timeline rows with NHLe defaults", () => {
    const parsed = parseExternalTimelineRows([
      {
        season: "2023-24",
        age: 20,
        league: "AHL",
        teamId: "MB",
        games: 64,
        goals: 21,
        assists: 34,
        points: 55,
        avgTOI: "15:30",
      },
      {
        season: "2024-25",
        age: "21",
        league: "OHL",
        games: "56",
        goals: "20",
        assists: "42",
        points: "62",
      },
      {
        season: "2025-26",
        age: 22,
        league: "NCAA",
        games: 38,
        goals: 12,
        assists: 28,
        nhlePtsPace: 39,
      },
    ]);

    expect(parsed.rejected).toEqual([]);
    expect(parsed.snapshots.map(s => [s.season, s.league])).toEqual([
      ["2023-24", "AHL"],
      ["2024-25", "CHL"],
      ["2025-26", "NCAA"],
    ]);
    expect(parsed.snapshots[0]).toMatchObject({
      ptsPerGame: 0.859,
      nhlePtsPace: 33.1,
      avgTOI: 15.5,
    });
    expect(parsed.snapshots[2].nhlePtsPace).toBe(39);
  });

  it("rejects suspicious external timeline rows with explicit reasons", () => {
    const parsed = parseExternalTimelineRows([
      { age: 19, league: "AHL", games: 20, goals: 4, assists: 6 },
      { season: "2025", age: 19, league: "AHL", games: 20, goals: 4, assists: 6 },
      { season: "2025-26", age: 19, league: "MYSTERY", games: 20, goals: 4, assists: 6 },
      { season: "2025-26", age: 14, league: "AHL", games: 20, goals: 4, assists: 6 },
      { season: "2025-26", age: 19, league: "AHL", games: 20, goals: 4, assists: 6, points: 5 },
    ]);

    expect(parsed.snapshots).toEqual([]);
    expect(parsed.rejected.map(r => r.reason)).toEqual([
      "missing-season",
      "invalid-season",
      "unknown-league",
      "age-out-of-range",
      "points-less-than-goals-plus-assists",
    ]);
  });

  it("merges external timeline snapshots with NHL rows before DB player assembly", () => {
    const external = parseExternalTimelineRows([
      { season: "2023-24", age: 20, league: "AHL", games: 64, goals: 21, assists: 34, points: 55 },
      { season: "2024-25", age: 21, league: "AHL", games: 46, goals: 7, assists: 28, points: 35 },
    ]);
    const input = buildDevelopmentInputForDbPlayer({
      id: "8483471",
      name: "Brad Lambert",
      position: "C",
      age: 22,
      draftYear: 2022,
      draftOverall: 30,
    }, [
      {
        seasonId: "20252026",
        row: {
          playerId: 8483471,
          skaterFullName: "Brad Lambert",
          teamAbbrevs: "WPG",
          positionCode: "C",
          gamesPlayed: 25,
          goals: 4,
          assists: 4,
        },
      },
    ], { externalSnapshots: external.snapshots });

    expect(input?.snapshots?.map(s => `${s.season}:${s.league}`)).toEqual([
      "2023-24:AHL",
      "2024-25:AHL",
      "2025-26:NHL",
    ]);
    expect(mergeTimelineSnapshots(external.snapshots, input?.snapshots ?? [])).toHaveLength(3);
  });
});
