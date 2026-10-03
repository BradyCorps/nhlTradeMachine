import { describe, expect, it } from "vitest";
import { applyPublishedTradeOverlay, buildPublishedTradeCapMoves, resolvePublishedPlayerMove, publishedOwnershipByPlayer } from "@/app/lib/published-roster-ownership";
import { dedupeSameTeamNicknames, findRosterIdentity, removePlayerFromOtherRosters, samePlayerIdentity } from "@/app/lib/player-identity";
import { navLabelForDisplay, navValueForDisplay, marketValueLabel } from "@/app/lib/valuation-display";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import type { TradeRecord } from "@/app/lib/trades";
import { teamCacheKeys, LEAGUE_PLAYERS_CACHE_KEY, LEAGUE_ANALYTICS_CACHE_KEY, LEAGUE_TEAMS_PAYLOAD_CACHE_KEY, DOCKET_ENTRIES_CACHE_KEY } from "@/app/lib/team-cache";

export function ownershipTrade(id = "a", date = "2026-09-28", from = "TOR", to = "CBJ", playerId = "matthewknies"): TradeRecord {
  return { id, executedDate: date, published: true, rosterMutating: true, season: "2026-27", source: "manual", sourceUrl: null, conditions: null, lockedVerdict: null, gradeAtTrade: null,
    sides: [{ teamId: from, assetsGiven: [{ kind: "player", ref: { id: playerId, nameSlug: "matthew-knies" }, inputSnapshot: { name: "Matthew Knies", position: "W", capHit: 7.75 }, navAtTrade: 50, retainedPct: 0.25 }] }, { teamId: to, assetsGiven: [] }] };
}
const player = { id: "8482720", name: "Matthew Knies", position: "W", teamId: "TOR", capHit: 7.75 };

describe("effective published roster ownership", () => {
  it("uses one TOR/CBJ resolution for public players and stored contracts without mutating either", () => {
    const trades = [ownershipTrade()];
    const before = JSON.stringify(trades);
    expect(applyPublishedTradeOverlay([player], trades)).toMatchObject([{ id: "8482720", teamId: "CBJ" }]);
    expect(resolvePublishedPlayerMove({ ...player, id: "matthewknies" }, trades)?.teamId).toBe("CBJ");
    expect(player.teamId).toBe("TOR");
    expect(JSON.stringify(trades)).toBe(before);
  });
  it("sorts subsequent trades by date then id, ignores non-roster and unpublished records, and stays idempotent", () => {
    const trades = [ownershipTrade("z", "2026-09-29", "CBJ", "VAN", "8482720"), ownershipTrade(), { ...ownershipTrade("zzz", "2026-09-30", "VAN", "ANA"), published: false }, { ...ownershipTrade("zzzz", "2026-09-30", "VAN", "ANA"), rosterMutating: false }];
    const once = applyPublishedTradeOverlay([player], trades);
    expect(once).toHaveLength(1);
    expect(once[0].teamId).toBe("VAN");
    expect(applyPublishedTradeOverlay(once, trades)).toEqual(once);
    expect(resolvePublishedPlayerMove(player, [ownershipTrade("b", "2026-09-28", "CBJ", "VAN"), ownershipTrade("a")])?.teamId).toBe("VAN");
  });
  it("prefers an exact stable id and rejects ambiguous name-only trade matches", () => {
    const centre = { id: "eliaspettersson", name: "Elias Pettersson", position: "C", teamId: "VAN" };
    const defender = { ...centre, id: "eliaspettersson-d", position: "D" };
    const trade = ownershipTrade();
    trade.sides[0].assetsGiven[0].ref = { id: centre.id, nameSlug: "elias-pettersson" };
    trade.sides[0].assetsGiven[0].inputSnapshot = { name: centre.name };
    expect(applyPublishedTradeOverlay([centre, defender], [trade]).map(p => p.teamId)).toEqual(["CBJ", "VAN"]);
    const live = [{ ...centre, id: "8480012" }, { ...defender, id: "8483678" }];
    expect(applyPublishedTradeOverlay(live, [trade])).toEqual(live);
    expect(buildPublishedTradeCapMoves([trade], live)).toEqual({});
  });
  it("resolves a production-sized contract population without scanning it for every row", () => {
    let nameReads = 0;
    const rows = Array.from({ length: 4500 }, (_, i) => ({ id: `fixture-${i}`, teamId: "TOR", position: "W", get name() { nameReads++; return i === 0 ? "Matthew Knies" : `Other Player ${i}`; } }));
    const ownership = publishedOwnershipByPlayer(rows, [ownershipTrade()]);
    expect(ownership.get(rows[0])?.teamId).toBe("CBJ");
    expect(nameReads).toBeLessThan(45000);
  });
  it("applies only the outstanding cap suffix when source rosters already reflect a later trade", () => {
    const trades = [ownershipTrade("b", "2026-09-29", "CBJ", "VAN", "8482720"), ownershipTrade()];
    const original = buildPublishedTradeCapMoves(trades, [player]);
    expect(original.TOR.outgoing).toHaveLength(1);
    expect(original.CBJ.incoming).toHaveLength(1);
    expect(original.CBJ.outgoing).toHaveLength(1);
    const intermediate = buildPublishedTradeCapMoves(trades, [{ ...player, teamId: "CBJ" }]);
    expect(intermediate.TOR).toBeUndefined();
    expect(intermediate.CBJ.outgoing).toHaveLength(1);
    expect(buildPublishedTradeCapMoves(trades, [{ ...player, teamId: "VAN" }])).toEqual({});
    expect(buildPublishedTradeCapMoves(trades).TOR.outgoing).toHaveLength(1);
  });
});

describe("live identity preservation", () => {
  it("finds legacy aliases without dropping the NHL id and removes only the same player", () => {
    const live = { id: "8480813", name: "Joseph Veleno", position: "C" };
    const rosters = new Map([["MTL", [live]], ["NYR", []]]);
    expect(findRosterIdentity(rosters, { id: "joeveleno", name: "Joe Veleno", position: "C" })).toBe(live);
    removePlayerFromOtherRosters(rosters, "NYR", live);
    expect(rosters.get("MTL")).toEqual([]);
    expect(samePlayerIdentity(live, { ...live, id: "8489999" })).toBe(false);
  });
  it("keeps Vancouver's centre and defender Elias Pettersson distinct", () => {
    const players = [{ id: "8480012", name: "Elias Pettersson", position: "C", teamId: "VAN" }, { id: "8483678", name: "Elias Pettersson", position: "D", teamId: "VAN" }];
    expect(dedupeSameTeamNicknames(players)).toEqual(players);
    const rosters = new Map([["VAN", players]]);
    removePlayerFromOtherRosters(rosters, "TOR", { id: "eliaspettersson", name: "Elias Pettersson", position: "C" });
    expect(rosters.get("VAN")).toEqual([players[1]]);
  });
});

describe("unavailable valuation presentation", () => {
  it("retains a legitimate rookie with no historical inputs and labels the engine's empty result", () => {
    const rookie = { id: "8486067", name: "Gavin McKenna", teamId: "TOR", position: "W", age: 18, capHit: 1.075, yearsRemaining: 3, pts: 0, games: 0, ptsPace: 0, defRate: 0, avgTOI: 0, hasNMC: false, hasNTC: false, canRetain: false, retainedPct: 0, multiplier: 1, hasLiveStats: false } as Asset;
    const result = calculateAssetNAV(rookie);
    expect(result.snapshot?.coverage).toBe("contract-only");
    expect(navValueForDisplay(result)).toBeNull();
    expect(navLabelForDisplay(result)).toBe("Not priced");
    expect(marketValueLabel(result.fmvAav)).toBe("Not priced");
    expect(applyPublishedTradeOverlay([rookie], [ownershipTrade()])[0]).toEqual(rookie);
  });
  it("preserves a calculated zero and separately distinguishes absent market pricing", () => {
    const zero = { total: 0, stages: [{ key: "off", value: 0 }] } as XNAVResult;
    expect(navValueForDisplay(zero)).toBe(0);
    expect(navLabelForDisplay(zero)).toBe("0");
    expect(marketValueLabel(0)).toBe("$0.0M");
    expect(marketValueLabel(null)).toBe("Not priced");
    expect(navLabelForDisplay()).toBe("Not priced");
  });
});

it("invalidates every affected roster consumer and bypasses the prior deployment's payloads", () => {
  expect(teamCacheKeys(104)).toEqual(expect.arrayContaining([LEAGUE_PLAYERS_CACHE_KEY, LEAGUE_ANALYTICS_CACHE_KEY, LEAGUE_TEAMS_PAYLOAD_CACHE_KEY, DOCKET_ENTRIES_CACHE_KEY]));
  expect(LEAGUE_PLAYERS_CACHE_KEY).toContain("players:v4:");
});
