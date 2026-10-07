import { describe, expect, it } from "vitest";
import { gameScore, gameStatus, nhlToday, parseNhlGames, validGameDate } from "@/app/lib/nhl-games";

const date = "2026-10-07";
const rawGame = () => ({ id: 2026020054, season: 20262027, gameType: 2, gameDate: date,
  startTimeUTC: "2026-10-07T23:30:00Z", gameState: "FUT", gameScheduleState: "OK",
  awayTeam: { id: 21, abbrev: "COL", name: { default: "Avalanche" }, record: "2-0-0" },
  homeTeam: { id: 52, abbrev: "WPG", name: { default: "Jets" }, record: "2-0-1" },
  venue: { default: "Canada Life Centre" }, tvBroadcasts: [{ network: "Prime" }, { network: "ALT" }, { network: "Prime" }],
});
const board = (games: unknown[] = [rawGame()]) => ({ currentDate: date, games });
const game = () => parseNhlGames(board(), date, 123)!.games[0];

describe("NHL schedule dates", () => {
  it("keeps a late west-coast start on the NHL's Eastern schedule day", () => {
    expect(nhlToday(new Date("2026-10-08T02:00:00Z"))).toBe(date);
    expect(nhlToday(new Date("2026-10-08T04:01:00Z"))).toBe("2026-10-08");
    expect(nhlToday(new Date("2027-01-08T04:30:00Z"))).toBe("2027-01-07");
  });
  it.each(["2026-02-30", "2026-13-01", "2026-2-1", "../now", "2026-10-07T00:00Z", ""]) ("rejects invalid date %s", input => {
    expect(validGameDate(input)).toBe(false);
  });
});

describe("game feed validation", () => {
  it("keeps actual record/source identities and does not infer lines or starting goalies", () => {
    expect(parseNhlGames(board(), date, 123)).toMatchObject({ date, retrievedAt: 123, games: [{ id: 2026020054, season: 20262027, gameType: 2,
      away: { abbrev: "COL", record: "2-0-0", score: null }, home: { abbrev: "WPG", record: "2-0-1" }, broadcasts: ["Prime", "ALT"] }] });
    expect(game().nhlUrl).toBe("https://www.nhl.com/gamecenter/2026020054");
  });
  it("distinguishes a validated upstream empty slate from invalid coverage", () => {
    expect(parseNhlGames(board([]), date)?.games).toEqual([]);
    expect(parseNhlGames({ currentDate: date }, date)).toBeNull();
    expect(parseNhlGames({ currentDate: "2026-10-08", games: [] }, date)).toBeNull();
  });
  it("rejects duplicate games and wrong-day entries rather than silently dropping them", () => {
    expect(parseNhlGames(board([rawGame(), rawGame()]), date)).toBeNull();
    expect(parseNhlGames(board([{ ...rawGame(), gameDate: "2026-10-08" }]), date)).toBeNull();
  });
  it.each([null, {}, { ...rawGame(), awayTeam: null }, { ...rawGame(), startTimeUTC: "bad" }, { ...rawGame(), id: "2026020054" }])("rejects malformed game identity %j", value => {
    expect(parseNhlGames(board([value]), date)).toBeNull();
  });
  it("sorts by actual start time while retaining games after midnight UTC", () => {
    const late = { ...rawGame(), id: 2026020055, startTimeUTC: "2026-10-08T02:00:00Z" };
    expect(parseNhlGames(board([late, rawGame()]), date)?.games.map(g => g.id)).toEqual([2026020054, 2026020055]);
  });
  it("leaves missing records and scores unavailable", () => {
    const raw = rawGame();
    const result = parseNhlGames(board([{ ...raw, awayTeam: { ...raw.awayTeam, record: undefined, score: -1 } }]), date)!;
    expect(result.games[0].away).toMatchObject({ record: null, score: null });
  });
});

describe("observed game status", () => {
  it("does not display scheduled games as 0–0", () => {
    const scheduled = game();
    scheduled.away.score = scheduled.home.score = 0;
    expect(gameScore(scheduled)).toBeNull();
    expect(gameStatus(scheduled)).toBe("7:30 PM EDT");
  });
  it("shows a real zero score, overtime and shootout without fabricating a clock", () => {
    const live = { ...game(), gameState: "LIVE", period: 2, away: { ...game().away, score: 0 }, home: { ...game().home, score: 1 } };
    expect(gameScore(live)).toBe("0–1");
    expect(gameStatus(live)).toBe("Live · Period 2");
    expect(gameStatus({ ...live, gameState: "OFF", periodType: "OT" })).toBe("Final · OT");
    expect(gameStatus({ ...live, gameState: "FINAL", periodType: "SO" })).toBe("Final · SO");
  });
  it("puts postponements ahead of scores or scheduled start times", () => {
    const postponed = { ...game(), gameState: "LIVE", scheduleState: "PPD" };
    expect(gameStatus(postponed)).toBe("Postponed");
    expect(gameScore(postponed)).toBeNull();
    expect(gameStatus({ ...game(), gameState: "UNKNOWN" })).toBe("Schedule update pending");
  });
});
