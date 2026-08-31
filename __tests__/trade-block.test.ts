// Regression coverage for the fix in this session: FA_POOL players leaking
// into the Trade Block panel, printing "FA_POOL" where a real team
// abbreviation belongs and letting a click try to set it as a trade partner.
import { describe, expect, it } from "vitest";
import {
  filterTradeBlockPlayers, isAutoAvailable, tradeBlockCounts,
} from "@/app/lib/trade-block";
import type { Asset, Team } from "@/app/lib/trade-types";

const asset = (id: string, teamId: string, over: Partial<Asset> = {}): Asset => ({
  id, teamId, name: id, position: "C", age: 26, games: 78, ptsPace: 40,
  xGPace: 14, defRate: 0.08, avgTOI: 15, capHit: 2, yearsRemaining: 3,
  hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0, multiplier: 1,
  ...over,
});

const OPTS = { posFilter: "ALL" as const, showStatus: "all" as const, search: "" };

describe("filterTradeBlockPlayers — FA_POOL is not a team", () => {
  it("never returns a free agent, even when flagged available/requested/untouchable", () => {
    const players = [
      asset("signed", "WPG", { capHit: 4, tradeBlockStatus: "available" }),
      asset("fa1", "FA_POOL", { tradeBlockStatus: "available" }),
      asset("fa2", "FA_POOL", { tradeBlockStatus: "requested" }),
      asset("fa3", "FA_POOL", { tradeBlockStatus: "untouchable" }),
    ];

    const shown = filterTradeBlockPlayers(players, new Map(), OPTS);

    expect(shown.map(p => p.id)).toEqual(["signed"]);
    expect(shown.some(p => p.teamId === "FA_POOL")).toBe(false);
  });

  it("excludes picks alongside free agents, leaving only real rostered players", () => {
    const players = [
      asset("skater", "WPG", { tradeBlockStatus: "available" }),
      asset("pick", "WPG", { position: "Pick", tradeBlockStatus: "available" }),
      asset("fa", "FA_POOL", { tradeBlockStatus: "available" }),
    ];

    expect(filterTradeBlockPlayers(players, new Map(), OPTS).map(p => p.id)).toEqual(["skater"]);
  });

  it("excludes a free agent even when its attributes would otherwise read as a computer-available seller", () => {
    // isAutoAvailable itself only looks at player attributes + club phase, not
    // identity — a veteran shaped like a sell candidate qualifies regardless
    // of whose "team" the phase came from. The free-agent exclusion in
    // filterTradeBlockPlayers runs upstream of that check specifically so a
    // pool player can never reach it.
    const phases = new Map([["FA_POOL", "Tanking"]]);
    const fa = asset("fa", "FA_POOL", { age: 32, yearsRemaining: 1, capHit: 5, tradeBlockStatus: null });

    expect(isAutoAvailable(fa, phases.get(fa.teamId))).toBe(true);
    expect(filterTradeBlockPlayers([fa], phases, OPTS)).toEqual([]);
  });
});

describe("tradeBlockCounts — header counts match what the list shows", () => {
  it("does not count a free agent's trade-block flag toward the header totals", () => {
    const players = [
      asset("real1", "WPG", { tradeBlockStatus: "requested" }),
      asset("real2", "TOR", { tradeBlockStatus: "available" }),
      asset("fa", "FA_POOL", { tradeBlockStatus: "requested" }),
    ];

    expect(tradeBlockCounts(players)).toEqual({ requested: 1, available: 1 });
  });
});
