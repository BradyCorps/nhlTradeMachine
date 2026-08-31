import { describe, expect, it } from "vitest";
import { rightsStatus, splitFreeAgents } from "@/app/lib/free-agent-board";
import type { Asset } from "@/app/lib/trade-types";

const asset = (id: string, teamId: string, over: Partial<Asset> = {}): Asset => ({
  id, teamId, name: id, position: "C", age: 26, games: 78, ptsPace: 40,
  xGPace: 14, defRate: 0.08, avgTOI: 15, capHit: 2, yearsRemaining: 3,
  hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0, multiplier: 1,
  ...over,
});

const OPTS = { posFilter: "ALL" as const, search: "" };

describe("splitFreeAgents", () => {
  it("only ever pulls from FA_POOL, never a rostered player", () => {
    const players = [
      asset("rostered", "WPG", { contractStatus: "UFA", expiresThisOffseason: true }),
      asset("unsigned", "FA_POOL", { contractStatus: "UFA" }),
    ];

    const { ufa } = splitFreeAgents(players, OPTS);
    expect(ufa.map(p => p.id)).toEqual(["unsigned"]);
  });

  it("splits restricted from unrestricted", () => {
    const players = [
      asset("rfa1", "FA_POOL", { contractStatus: "RFA", capHit: 0, lastCapHit: 2 }),
      asset("ufa1", "FA_POOL", { contractStatus: "UFA", capHit: 0, lastCapHit: 5 }),
    ];

    const { rfa, ufa } = splitFreeAgents(players, OPTS);
    expect(rfa.map(p => p.id)).toEqual(["rfa1"]);
    expect(ufa.map(p => p.id)).toEqual(["ufa1"]);
  });

  it("puts a free agent with no recorded rights class in the unrestricted bucket rather than dropping it", () => {
    const players = [asset("mystery", "FA_POOL", { contractStatus: undefined, expiryStatus: null })];

    const { rfa, ufa } = splitFreeAgents(players, OPTS);
    expect(rfa).toEqual([]);
    expect(ufa.map(p => p.id)).toEqual(["mystery"]);
  });

  it("sorts each bucket by last cap hit, falling back to current cap hit", () => {
    const players = [
      asset("cheap", "FA_POOL", { contractStatus: "UFA", capHit: 0, lastCapHit: 1.5 }),
      asset("expensive", "FA_POOL", { contractStatus: "UFA", capHit: 0, lastCapHit: 8 }),
      asset("midCurrentCap", "FA_POOL", { contractStatus: "UFA", capHit: 4, lastCapHit: undefined }),
    ];

    const { ufa } = splitFreeAgents(players, OPTS);
    expect(ufa.map(p => p.id)).toEqual(["expensive", "midCurrentCap", "cheap"]);
  });

  it("filters by position and search", () => {
    const players = [
      asset("goalie", "FA_POOL", { position: "G", contractStatus: "UFA" }),
      asset("center", "FA_POOL", { position: "C", contractStatus: "UFA" }),
    ];

    expect(splitFreeAgents(players, { posFilter: "G", search: "" }).ufa.map(p => p.id)).toEqual(["goalie"]);
    expect(splitFreeAgents(players, { posFilter: "ALL", search: "center" }).ufa.map(p => p.id)).toEqual(["center"]);
  });
});

describe("rightsStatus", () => {
  it("reads the normalized contractStatus first", () => {
    expect(rightsStatus(asset("a", "FA_POOL", { contractStatus: "RFA" }))).toBe("RFA");
  });

  it("falls back to the raw expiryStatus when contractStatus is absent", () => {
    expect(rightsStatus(asset("a", "FA_POOL", { contractStatus: undefined, expiryStatus: "RFA - Group 2" }))).toBe("RFA");
    expect(rightsStatus(asset("b", "FA_POOL", { contractStatus: undefined, expiryStatus: "UFA" }))).toBe("UFA");
  });

  it("returns null rather than guessing when nothing indicates a class", () => {
    expect(rightsStatus(asset("a", "FA_POOL", { contractStatus: "SIGNED", expiryStatus: null }))).toBeNull();
  });
});
