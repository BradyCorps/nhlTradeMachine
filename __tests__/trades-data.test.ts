import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../app/db/schema";
import type { Asset, Team, TradeVerdict, XNAVResult } from "../app/lib/trade-types";
import {
  createFrozenTrade,
  createTrade,
  deleteTrade,
  getTrade,
  listPublishedTrades,
  updateTrade,
  type TradeFreezeEvaluator,
  type TradeRecord,
} from "../app/lib/trades";

const client = createClient({ url: "file::memory:" });
const testDb = drizzle(client, { schema });

beforeEach(async () => {
  await testDb.run(`DROP TABLE IF EXISTS trades`);
  await testDb.run(`
    CREATE TABLE trades (
      id TEXT PRIMARY KEY NOT NULL,
      executed_date TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      season TEXT NOT NULL,
      sides TEXT NOT NULL,
      conditions TEXT,
      locked_verdict TEXT,
      grade_at_trade TEXT,
      published INTEGER NOT NULL DEFAULT 0,
      roster_mutating INTEGER NOT NULL DEFAULT 1
    )
  `);
});

describe("trades data layer", () => {
  it("round-trips trade sides with input snapshots intact", async () => {
    const trade: TradeRecord = {
      id: "trade-2026-001",
      executedDate: "2026-06-23",
      source: "manual",
      sourceUrl: "https://example.com/trade",
      season: "2026-27",
      sides: [
        {
          teamId: "WPG",
          assetsGiven: [{
            kind: "player",
            ref: { id: "player-kyle-connor", nameSlug: "kyle-connor" },
            retainedPct: 0.25,
            inputSnapshot: {
              name: "Kyle Connor",
              capHit: 7.142857,
              yearsRemaining: 1,
              navInputs: { ptsPace: 82, avgTOI: 20.1 },
            },
            navAtTrade: 152,
          }],
        },
        {
          teamId: "BUF",
          assetsGiven: [{
            kind: "pick",
            ref: { id: "BUF-2027-1", nameSlug: "buf-2027-1" },
            retainedPct: 0,
            inputSnapshot: {
              round: 1,
              year: 2027,
              teamStanding: 18,
            },
            navAtTrade: 64,
          }],
        },
      ],
      conditions: "Pick upgrades if Buffalo reaches the conference final.",
      lockedVerdict: {
        status: "FAIR",
        message: "Even value at execution.",
        metrics: {
          navOut: 152,
          navIn: 154,
          homeNetGain: 2,
          ptsGain: 0,
          defGain: 0,
          capDelta: 1.8,
          variance: 0.2,
          ewaHome: 0,
          cwiYears: 1,
        },
        flags: [],
      },
      gradeAtTrade: {
        perTeamNetNav: { WPG: 2, BUF: -2 },
        winner: null,
        fairness: "even",
      },
      published: false,
      rosterMutating: true,
    };

    await createTrade(trade, testDb);

    await expect(getTrade(trade.id, testDb)).resolves.toEqual(trade);
  });

  it("freezes the at-trade verdict and asset inputs when saving", async () => {
    const homeTeam: Team = { id: "WPG", name: "Winnipeg Jets", capSpace: 8, standing: 12 };
    const partnerTeam: Team = { id: "BUF", name: "Buffalo Sabres", capSpace: 10, standing: 18 };
    const outgoing: Asset = {
      id: "player-kyle-connor",
      teamId: "WPG",
      name: "Kyle Connor",
      position: "W",
      age: 29,
      games: 82,
      ptsPace: 82,
      defRate: 0,
      avgTOI: 20.1,
      capHit: 7.142857,
      yearsRemaining: 1,
      hasNMC: false,
      hasNTC: false,
      canRetain: true,
      retainedPct: 0.25,
      multiplier: 1,
    };
    const incoming: Asset = {
      id: "BUF-2027-1",
      teamId: "BUF",
      name: "BUF 2027 1st",
      position: "Pick",
      age: 0,
      games: 0,
      ptsPace: 0,
      defRate: 0,
      avgTOI: 0,
      capHit: 0,
      yearsRemaining: 0,
      hasNMC: false,
      hasNTC: false,
      canRetain: false,
      retainedPct: 0,
      multiplier: 1,
      round: 1,
      year: 2027,
      teamStanding: 18,
    };
    const verdict: TradeVerdict = {
      status: "WIN",
      message: "+28.0 NAV Surplus",
      metrics: {
        navOut: 150,
        navIn: 178,
        homeNetGain: 28,
        ptsGain: -82,
        defGain: 0,
        capDelta: -5.35,
        variance: 18.6,
        ewaHome: -1,
        cwiYears: 2,
      },
      flags: [{
        severity: "INFO",
        category: "GOOD",
        headline: "Snapshot",
        explanation: "Frozen at ingestion.",
      }],
    };
    const navMap: Record<string, XNAVResult> = {
      [outgoing.id]: { total: 150, off: 100, def: 0, age: 10, cap: 40, upside: 0 },
      [incoming.id]: { total: 178, off: 0, def: 0, age: 0, cap: 0, upside: 178 },
    };
    const evaluate: TradeFreezeEvaluator = () => ({ verdict, navMap });

    await createFrozenTrade({
      id: "trade-freeze-001",
      executedDate: "2026-06-23",
      source: "manual",
      season: "2026-27",
      sides: [
        { team: homeTeam, assetsGiven: [{ kind: "player", asset: outgoing }] },
        { team: partnerTeam, assetsGiven: [{ kind: "pick", asset: incoming }] },
      ],
      conditions: "None.",
    }, evaluate, testDb);

    outgoing.ptsPace = 12;
    verdict.message = "Changed after save";
    navMap[outgoing.id].total = 1;

    const saved = await getTrade("trade-freeze-001", testDb);

    expect(saved?.lockedVerdict?.message).toBe("+28.0 NAV Surplus");
    expect(saved?.gradeAtTrade).toEqual({
      perTeamNetNav: { WPG: 28, BUF: -28 },
      winner: "WPG",
      fairness: "WIN",
    });
    expect(saved?.sides[0].assetsGiven[0].navAtTrade).toBe(150);
    expect(saved?.sides[0].assetsGiven[0].retainedPct).toBe(0.25);
    expect(saved?.sides[0].assetsGiven[0].inputSnapshot).toMatchObject({
      name: "Kyle Connor",
      ptsPace: 82,
      capHit: 7.142857,
    });
  });

  it("lists only published trades in deterministic overlay order", async () => {
    const makeTrade = (id: string, executedDate: string, published: boolean): TradeRecord => ({
      id,
      executedDate,
      source: "manual",
      sourceUrl: null,
      season: "2026-27",
      sides: [
        { teamId: "WPG", assetsGiven: [] },
        { teamId: "BUF", assetsGiven: [] },
      ],
      conditions: null,
      lockedVerdict: null,
      gradeAtTrade: null,
      published,
      rosterMutating: true,
    });

    await createTrade(makeTrade("trade-late", "2026-07-02", true), testDb);
    await createTrade(makeTrade("trade-draft", "2026-07-01", false), testDb);
    await createTrade(makeTrade("trade-early-b", "2026-07-01", true), testDb);
    await createTrade(makeTrade("trade-early-a", "2026-07-01", true), testDb);

    await expect(listPublishedTrades(testDb)).resolves.toMatchObject([
      { id: "trade-early-a", published: true },
      { id: "trade-early-b", published: true },
      { id: "trade-late", published: true },
    ]);
  });

  it("updates publish state and editable trade metadata without replacing frozen sides", async () => {
    const trade: TradeRecord = {
      id: "trade-edit-001",
      executedDate: "2026-07-01",
      source: "manual",
      sourceUrl: null,
      season: "2026-27",
      sides: [
        { teamId: "WPG", assetsGiven: [{ kind: "player", ref: { id: "100", nameSlug: "player-one" }, inputSnapshot: { name: "Player One" }, navAtTrade: 50 }] },
        { teamId: "CGY", assetsGiven: [] },
      ],
      conditions: null,
      lockedVerdict: null,
      gradeAtTrade: null,
      published: false,
      rosterMutating: true,
    };

    await createTrade(trade, testDb);
    await updateTrade(trade.id, {
      executedDate: "2026-07-02",
      sourceUrl: "https://example.com/edit",
      conditions: "Updated condition",
      published: true,
      rosterMutating: false,
    }, testDb);

    await expect(getTrade(trade.id, testDb)).resolves.toMatchObject({
      id: trade.id,
      executedDate: "2026-07-02",
      sourceUrl: "https://example.com/edit",
      conditions: "Updated condition",
      published: true,
      rosterMutating: false,
      sides: trade.sides,
    });
  });

  it("deletes a saved trade by id", async () => {
    const trade: TradeRecord = {
      id: "trade-delete-001",
      executedDate: "2026-07-01",
      source: "manual",
      sourceUrl: null,
      season: "2026-27",
      sides: [
        { teamId: "WPG", assetsGiven: [] },
        { teamId: "CGY", assetsGiven: [] },
      ],
      conditions: null,
      lockedVerdict: null,
      gradeAtTrade: null,
      published: true,
      rosterMutating: true,
    };

    await createTrade(trade, testDb);

    await expect(deleteTrade(trade.id, testDb)).resolves.toBe(true);
    await expect(getTrade(trade.id, testDb)).resolves.toBeNull();
    await expect(deleteTrade(trade.id, testDb)).resolves.toBe(false);
  });
});
