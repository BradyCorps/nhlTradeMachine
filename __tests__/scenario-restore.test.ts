import { describe, expect, it } from "vitest";
import { isSaveableTrade, restoreScenario, type StoredScenario } from "../app/lib/scenario-restore";
import type { Asset, Team } from "../app/lib/trade-types";

const player = (id: string, name: string, over: Partial<Asset> = {}): Asset => ({
  id, name, teamId: "WPG", position: "C", age: 26,
  capHit: 6, yearsRemaining: 3, ptsPace: 70, avgTOI: 19,
  ...over,
} as Asset);

const team = (id: string, name: string): Team => ({ id, name, capSpace: 10, standing: 8 } as Team);

const POOL = {
  teams: [team("WPG", "Winnipeg Jets"), team("ANA", "Anaheim Ducks")],
  players: [
    player("8479400", "Kyle Connor"),
    player("8482124", "Mason McTavish", { teamId: "ANA" }),
    player("8484999", "Viggo Björck", { teamId: "ANA" }),
  ],
};

const scenario = (over: Partial<StoredScenario> = {}): StoredScenario => ({
  homeTeam: { id: "WPG", name: "Winnipeg Jets" },
  partnerTeam: { id: "ANA", name: "Anaheim Ducks" },
  outgoing: [{ id: "8479400", name: "Kyle Connor" }],
  incoming: [{ id: "8482124", name: "Mason McTavish" }],
  ...over,
});

describe("restoreScenario", () => {
  it("puts both clubs and both packages back", () => {
    const r = restoreScenario(scenario(), POOL);
    expect(r.homeTeam?.id).toBe("WPG");
    expect(r.partnerTeam?.id).toBe("ANA");
    expect(r.outgoing.map(a => a.name)).toEqual(["Kyle Connor"]);
    expect(r.incoming.map(a => a.name)).toEqual(["Mason McTavish"]);
    expect(r.missingAssets).toEqual([]);
  });

  // The reason a restore is a lookup rather than a reconstruction: a
  // SavedScenario keeps none of the paces or baselines the engine reads, so a
  // rebuilt player would price at zero.
  it("returns the LIVE asset, not the stored summary", () => {
    const r = restoreScenario(scenario(), POOL);
    expect(r.outgoing[0]).toBe(POOL.players[0]);
    expect(r.outgoing[0].ptsPace).toBe(70);
  });

  it("keeps the retention the deal was filed with", () => {
    // Retention is a term of the trade, not a property of the player.
    const r = restoreScenario(
      scenario({ outgoing: [{ id: "8479400", name: "Kyle Connor", retainedPct: 50 }] }), POOL);
    expect(r.outgoing[0].retainedPct).toBe(50);
    // …and does not scribble it onto the pooled asset.
    expect(POOL.players[0].retainedPct).toBeUndefined();
  });

  it("does not copy the asset when there is no retention to apply", () => {
    expect(restoreScenario(scenario(), POOL).incoming[0]).toBe(POOL.players[1]);
  });

  // A scenario outlives the league it was filed against — retirements, trades,
  // rollovers, resets. Loading a smaller trade in silence is the bad outcome.
  it("names an asset that has left the league instead of dropping it quietly", () => {
    const r = restoreScenario(
      scenario({ incoming: [{ id: "gone", name: "Departed Winger" }] }), POOL);
    expect(r.incoming).toEqual([]);
    expect(r.missingAssets).toEqual(["Departed Winger"]);
  });

  it("reports a club that no longer exists", () => {
    const r = restoreScenario(scenario({ partnerTeam: { id: "ZZZ", name: "Phantom Club" } }), POOL);
    expect(r.partnerTeam).toBeNull();
    expect(r.missingTeams).toEqual(["Phantom Club"]);
  });

  it("restores everything it can even when part is gone", () => {
    const r = restoreScenario(scenario({
      outgoing: [{ id: "8479400", name: "Kyle Connor" }, { id: "gone", name: "Ghost" }],
    }), POOL);
    expect(r.outgoing.map(a => a.name)).toEqual(["Kyle Connor"]);
    expect(r.missingAssets).toEqual(["Ghost"]);
  });

  // Scenarios filed before ids were stored, and the diacritic case that has
  // bitten the draft reconcile.
  it("falls back to the name, through the canonical slug", () => {
    const r = restoreScenario(
      scenario({ incoming: [{ name: "Viggo Bjorck" }] }), POOL);
    expect(r.incoming.map(a => a.id)).toEqual(["8484999"]);
    expect(r.missingAssets).toEqual([]);
  });

  it("prefers the id over the name when both are present", () => {
    const r = restoreScenario(
      scenario({ outgoing: [{ id: "8482124", name: "Kyle Connor" }] }), POOL);
    expect(r.outgoing[0].name).toBe("Mason McTavish");
  });

  it("handles an empty pool without throwing", () => {
    const r = restoreScenario(scenario(), { teams: [], players: [] });
    expect(r.outgoing).toEqual([]);
    expect(r.homeTeam).toBeNull();
    expect(r.missingAssets).toEqual(["Kyle Connor", "Mason McTavish"]);
    expect(r.missingTeams).toHaveLength(2);
  });

  it("handles a scenario with no clubs recorded", () => {
    const r = restoreScenario(scenario({ homeTeam: null, partnerTeam: null }), POOL);
    expect(r.homeTeam).toBeNull();
    expect(r.missingTeams).toEqual([]);
  });
});

describe("isSaveableTrade", () => {
  // The reported defect: Armchair GM selects a home club at startup, and the
  // old gate counted a selected club as an active trade — so Save was live from
  // page load and filed a report reading "nothing" against "nothing".
  it("refuses an empty bench", () => {
    expect(isSaveableTrade([[], []])).toBe(false);
  });

  it("accepts a one-sided package", () => {
    expect(isSaveableTrade([[{}], []])).toBe(true);
    expect(isSaveableTrade([[], [{}]])).toBe(true);
  });

  it("accepts a real two-sided trade", () => {
    expect(isSaveableTrade([[{}], [{}]])).toBe(true);
  });
});
