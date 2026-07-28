import { describe, expect, it } from "vitest";
import {
  buildDocketEntries,
  docketReturns,
  filterAndSortDocketEntries,
  type DocketEntry,
} from "../app/lib/docket-view";
import type { TradeRecord } from "../app/lib/trades";

const trade = (
  id: string,
  executedDate: string,
  published: boolean,
  winner: string | null,
  margin: number,
): TradeRecord => ({
  id,
  executedDate,
  source: "manual",
  sourceUrl: "https://example.com/source",
  season: "2026-27",
  sides: [
    {
      teamId: "WPG",
      assetsGiven: [{
        kind: "player",
        ref: { id: `${id}-player`, nameSlug: "winnipeg-player" },
        retainedPct: 0.25,
        inputSnapshot: {
          id: `${id}-player`,
          teamId: "WPG",
          name: "Winnipeg Player",
          position: "C",
          age: 27,
          games: 82,
          ptsPace: 68,
          defRate: 0.12,
          avgTOI: 19.2,
          capHit: 6.2,
          yearsRemaining: 3,
          hasNMC: false,
          hasNTC: false,
          canRetain: true,
          retainedPct: 0.25,
          multiplier: 1,
          developmentProfile: { developmentPhase: "PEAK_WINDOW" },
        },
        navAtTrade: 90,
      }],
    },
    {
      teamId: "CGY",
      assetsGiven: [{
        kind: "pick",
        ref: { id: `${id}-pick`, nameSlug: "calgary-first" },
        retainedPct: 0,
        inputSnapshot: { name: "Calgary First" },
        navAtTrade: 50,
      }],
    },
  ],
  conditions: null,
  lockedVerdict: {
    status: winner ? "WIN" : "FAIR",
    message: winner ? `${winner} wins the value ledger` : "Even value at trade",
    metrics: {
      navOut: 90,
      navIn: 50,
      homeNetGain: margin,
      ptsGain: 0,
      defGain: 0,
      capDelta: 0,
      variance: 0,
      ewaHome: 0,
      cwiYears: 0,
    },
    flags: [],
  },
  gradeAtTrade: {
    perTeamNetNav: { WPG: margin, CGY: -margin },
    winner,
    fairness: winner ? "WIN" : "FAIR",
  },
  published,
  rosterMutating: true,
});

describe("Docket view model", () => {
  it("builds entries only from published graded trades", () => {
    const draft = trade("draft", "2026-07-01", false, "WPG", 20);
    const ungraded: TradeRecord = { ...trade("ungraded", "2026-07-02", true, "CGY", 12), gradeAtTrade: null };
    const published = trade("published", "2026-07-03", true, null, 0);

    expect(buildDocketEntries([draft, ungraded, published])).toMatchObject([{
      id: "published",
      winner: null,
      navMargin: 0,
      lockedVerdict: published.lockedVerdict,
      todayVerdict: "Pending live re-grade",
    }]);
  });

  it("carries frozen player detail for expanded Docket entries", () => {
    const [entry] = buildDocketEntries([{ ...trade("detail", "2026-07-04", true, "WPG", 18), conditions: "Pick upgrades if WPG wins a round." }]);
    const player = entry.packages[0].assets[0];
    const pick = entry.packages[1].assets[0];

    expect(entry.conditions).toBe("Pick upgrades if WPG wins a round.");
    expect(player.asset).toMatchObject({
      id: "detail-player",
      teamId: "WPG",
      name: "Winnipeg Player",
      position: "C",
      ptsPace: 68,
      retainedPct: 0.25,
      developmentProfile: { developmentPhase: "PEAK_WINDOW" },
    });
    expect(pick.asset.position).toBe("Pick");
    expect(pick.navAtTrade).toBe(50);
  });

  it("filters by team, winner, and search query", () => {
    const entries = buildDocketEntries([
      trade("one", "2026-07-01", true, "WPG", 24),
      trade("two", "2026-07-02", true, "CGY", -12),
    ]);

    expect(filterAndSortDocketEntries(entries, { teamId: "WPG" })).toHaveLength(2);
    expect(filterAndSortDocketEntries(entries, { winner: "WPG" }).map(e => e.id)).toEqual(["one"]);
    expect(filterAndSortDocketEntries(entries, { query: "Calgary First" }).map(e => e.id)).toEqual(["two", "one"]);
  });

  it("sorts by date and NAV margin without mutating the source list", () => {
    const entries: DocketEntry[] = buildDocketEntries([
      trade("small", "2026-07-01", true, "CGY", -8),
      trade("large", "2026-07-02", true, "WPG", 32),
    ]);

    expect(filterAndSortDocketEntries(entries, { sort: "nav-desc" }).map(e => e.id)).toEqual(["large", "small"]);
    expect(filterAndSortDocketEntries(entries, { sort: "date-asc" }).map(e => e.id)).toEqual(["small", "large"]);
    expect(entries.map(e => e.id)).toEqual(["small", "large"]);
  });

  // The Docket headed each package "{team} RECEIVED" while listing the assets
  // that club GAVE — every entry read backwards.
  it("reports what each club received, not what it sent", () => {
    const [entry] = buildDocketEntries([trade("one", "2026-07-01", true, "WPG", 24)]);
    const returns = docketReturns(entry);

    const wpg = returns.find(r => r.teamId === "WPG");
    const cgy = returns.find(r => r.teamId === "CGY");

    // WPG sent the player and got the pick back.
    expect(wpg?.direction).toBe("received");
    expect(wpg?.assets.map(a => a.name)).toEqual(["Calgary First"]);
    expect(wpg?.navTotal).toBe(50);

    expect(cgy?.direction).toBe("received");
    expect(cgy?.assets.map(a => a.name)).toEqual(["Winnipeg Player"]);
    expect(cgy?.navTotal).toBe(90);
  });

  it("labels a three-way by what the record actually holds", () => {
    const base = trade("three", "2026-07-01", true, "WPG", 10);
    const threeWay = {
      ...base,
      sides: [...base.sides, { teamId: "TOR", assetsGiven: [] }],
    } as typeof base;

    const [entry] = buildDocketEntries([threeWay]);
    const returns = docketReturns(entry);

    // No destination is recorded, so "received" cannot be derived. Say SENT
    // rather than guess.
    expect(returns).toHaveLength(3);
    expect(returns.every(r => r.direction === "sent")).toBe(true);
    expect(returns.find(r => r.teamId === "WPG")?.assets.map(a => a.name))
      .toEqual(["Winnipeg Player"]);
  });
});
