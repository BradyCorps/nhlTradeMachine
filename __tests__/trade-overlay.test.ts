import { describe, expect, it } from "vitest";
import { applyTeamCapDeltas } from "../app/lib/cap-delta";
import { applyPublishedTradeOverlay, buildPublishedTradeCapMoves } from "../app/lib/roster-assembly";
import type { TradeRecord } from "../app/lib/trades";

const trade = (published = true): TradeRecord => ({
  id: "trade-overlay-001",
  executedDate: "2026-07-01",
  source: "manual",
  sourceUrl: null,
  season: "2026-27",
  sides: [
    {
      teamId: "WPG",
      assetsGiven: [{
        kind: "player",
        ref: { id: "100", nameSlug: "winnipeg-player" },
        retainedPct: 0.25,
        inputSnapshot: { id: "100", name: "Winnipeg Player", teamId: "WPG" },
        navAtTrade: 75,
      }],
    },
    {
      teamId: "CGY",
      assetsGiven: [{
        kind: "pick",
        ref: { id: "pick-CGY-2027-1", nameSlug: "pick-cgy-2027-1" },
        retainedPct: 0,
        inputSnapshot: { name: "2027 1st Round Pick (CGY)" },
        navAtTrade: 44,
      }],
    },
  ],
  conditions: null,
  lockedVerdict: null,
  gradeAtTrade: null,
  published,
  rosterMutating: true,
});

const playerFor = (id: string, name: string, capHit: number, retainedPct = 0) => ({
  kind: "player" as const,
  ref: { id, nameSlug: name.toLowerCase().replace(/\s+/g, "-") },
  retainedPct,
  inputSnapshot: { id, name, capHit },
  navAtTrade: 50,
});

describe("published trade roster overlay", () => {
  it("moves published player assets to the receiving team and clears session-only block tags", () => {
    const players = [{
      id: "100",
      name: "Winnipeg Player",
      teamId: "WPG",
      position: "C",
      retainedPct: 0,
      tradeBlockStatus: "available",
      tradeBlockNote: "Shopped",
    }];

    expect(applyPublishedTradeOverlay(players, [trade()])).toEqual([{
      ...players[0],
      teamId: "CGY",
      retainedPct: 0.25,
      tradeBlockStatus: null,
      tradeBlockNote: null,
    }]);
  });

  it("ignores unpublished trades and pick-only assets", () => {
    const players = [{
      id: "100",
      name: "Winnipeg Player",
      teamId: "WPG",
      position: "C",
      retainedPct: 0,
    }];

    expect(applyPublishedTradeOverlay(players, [trade(false)])).toEqual(players);
  });

  it("ignores UI-only published trades for roster and cap overlays", () => {
    const uiOnlyTrade: TradeRecord = {
      ...trade(true),
      rosterMutating: false,
    };
    const players = [{
      id: "100",
      name: "Winnipeg Player",
      teamId: "WPG",
      position: "C",
      retainedPct: 0,
    }];

    expect(applyPublishedTradeOverlay(players, [uiOnlyTrade])).toEqual(players);
    expect(buildPublishedTradeCapMoves([uiOnlyTrade])).toEqual({});
  });

  it("can match moved players by frozen name slug when source ids drift", () => {
    const players = [{
      id: "new-live-id",
      name: "Winnipeg Player",
      teamId: "WPG",
      position: "C",
      retainedPct: 0,
    }];

    expect(applyPublishedTradeOverlay(players, [trade()])[0]).toMatchObject({
      id: "new-live-id",
      teamId: "CGY",
    });
  });

  it("builds retention-adjusted cap moves for only published involved teams", () => {
    const published: TradeRecord = {
      ...trade(true),
      sides: [
        { teamId: "WPG", assetsGiven: [playerFor("100", "Winnipeg Player", 6, 0.25)] },
        { teamId: "CGY", assetsGiven: [playerFor("200", "Calgary Player", 8, 0.5)] },
      ],
    };

    const teams = [
      { id: "WPG", capSpace: 10 },
      { id: "CGY", capSpace: 8 },
      { id: "SEA", capSpace: 7 },
    ];
    const moved = applyTeamCapDeltas(teams, buildPublishedTradeCapMoves([published, trade(false)]));

    expect(moved.find(t => t.id === "WPG")?.capSpace).toBe(10.5);
    expect(moved.find(t => t.id === "CGY")?.capSpace).toBe(7.5);
    expect(moved.find(t => t.id === "SEA")?.capSpace).toBe(7);
  });

  it("skips cap moves when the base roster already shows the destination team", () => {
    const published: TradeRecord = {
      ...trade(true),
      sides: [
        { teamId: "WPG", assetsGiven: [playerFor("100", "Winnipeg Player", 6, 0.25)] },
        { teamId: "CGY", assetsGiven: [] },
      ],
    };

    expect(buildPublishedTradeCapMoves([published], [{
      id: "100",
      name: "Winnipeg Player",
      teamId: "CGY",
    }])).toEqual({});
  });
});
