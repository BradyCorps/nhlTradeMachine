import { describe, it, expect } from "vitest";
import type { Asset } from "../app/lib/trade-types";
import {
  projectFreeAgentContract,
  resolveLeagueOffseason,
  FA,
} from "../app/lib/free-agency";
import { applyCapDelta } from "../app/lib/cap-delta";
import { SEASON } from "../app/lib/season-config";

const mkAsset = (over: Partial<Asset> & { id: string; position: string }): Asset => ({
  teamId: "STL",
  name: over.id,
  age: 27,
  games: 70,
  ptsPace: 0,
  defRate: 0,
  avgTOI: 0,
  capHit: 1.0,
  yearsRemaining: 1,
  hasNMC: false,
  hasNTC: false,
  canRetain: true,
  retainedPct: 0,
  multiplier: 1,
  expiresThisOffseason: true,
  ...over,
});

const STAR_CEILING = SEASON.capCeiling * FA.starCeilingPct;

describe("projectFreeAgentContract", () => {
  it("never prices a player below the CBA minimum", () => {
    const fringe = mkAsset({ id: "fringe", position: "W", age: 30, ptsPace: 0, avgTOI: 8 });
    const c = projectFreeAgentContract(fringe, { seed: 7 });
    expect(c.aav).toBeGreaterThanOrEqual(FA.capMin);
  });

  it("never exceeds the star ceiling, even for an absurd pace", () => {
    const monster = mkAsset({ id: "monster", position: "C", age: 26, ptsPace: 200, baselinePtsPace: 200 });
    const c = projectFreeAgentContract(monster, { seed: 1 });
    expect(c.aav).toBeLessThanOrEqual(STAR_CEILING + 1e-9);
  });

  it("prices a prime UFA forward as an expensive, long-term deal", () => {
    const prime = mkAsset({ id: "prime", position: "C", age: 27, ptsPace: 78, baselinePtsPace: 78, contractStatus: "UFA" });
    const c = projectFreeAgentContract(prime, { seed: 3 });
    expect(c.status).toBe("UFA");
    expect(c.aav).toBeGreaterThan(6);
    expect(c.term).toBeGreaterThanOrEqual(5);
    expect(c.tier === "STAR" || c.tier === "TOP").toBe(true);
  });

  it("discounts a young RFA and keeps the term shorter (bridge)", () => {
    const rfa = mkAsset({ id: "rfa", position: "W", age: 22, ptsPace: 55, baselinePtsPace: 55, contractStatus: "RFA" });
    const ufaComp = mkAsset({ id: "ufacomp", position: "W", age: 22, ptsPace: 55, baselinePtsPace: 55, contractStatus: "UFA" });
    const r = projectFreeAgentContract(rfa, { seed: 5 });
    const u = projectFreeAgentContract(ufaComp, { seed: 5 });
    expect(r.status).toBe("RFA");
    expect(r.aav).toBeLessThan(u.aav); // RFA team-control discount
    expect(r.term).toBeLessThanOrEqual(4);
    expect(r.resignProbability).toBeGreaterThan(0.8); // team holds rights
  });

  it("discounts an aging UFA star on term and price vs his prime", () => {
    const aging = mkAsset({ id: "aging", position: "C", age: 35, ptsPace: 78, baselinePtsPace: 78, contractStatus: "UFA" });
    const c = projectFreeAgentContract(aging, { seed: 3 });
    expect(c.status).toBe("UFA");
    expect(c.term).toBeLessThanOrEqual(3);
  });

  it("values a starting goalie on GSAX, save%, and workload", () => {
    const starter = mkAsset({ id: "starter", position: "G", age: 29, gsax: 12, savePct: 0.918, gamesStarted: 55, contractStatus: "UFA" });
    const backup = mkAsset({ id: "backup", position: "G", age: 29, gsax: -4, savePct: 0.895, gamesStarted: 14, contractStatus: "UFA" });
    expect(projectFreeAgentContract(starter, { seed: 2 }).aav).toBeGreaterThan(5);
    expect(projectFreeAgentContract(backup, { seed: 2 }).aav).toBeLessThan(
      projectFreeAgentContract(starter, { seed: 2 }).aav,
    );
  });

  it("is deterministic for a given seed", () => {
    const a = mkAsset({ id: "det", position: "C", age: 28, ptsPace: 60, baselinePtsPace: 60, contractStatus: "UFA" });
    expect(projectFreeAgentContract(a, { seed: 99 })).toEqual(projectFreeAgentContract(a, { seed: 99 }));
  });
});

describe("resolveLeagueOffseason", () => {
  const players: Asset[] = [
    mkAsset({ id: "stl-rfa", teamId: "STL", position: "C", age: 23, ptsPace: 50, baselinePtsPace: 50, contractStatus: "RFA", capHit: 0.9 }),
    mkAsset({ id: "stl-depth", teamId: "STL", position: "W", age: 31, ptsPace: 18, baselinePtsPace: 18, contractStatus: "UFA", capHit: 1.2 }),
    mkAsset({ id: "stl-signed", teamId: "STL", position: "D", age: 28, capHit: 5, expiresThisOffseason: false }),
    mkAsset({ id: "wpg-ufa", teamId: "WPG", position: "C", age: 29, ptsPace: 70, baselinePtsPace: 70, contractStatus: "UFA", capHit: 6 }),
  ];

  it("excludes non-expiring players and sets the user's team aside", () => {
    const res = resolveLeagueOffseason(players, { seed: 42, userTeamId: "WPG" });
    expect(res.expiringCount).toBe(3); // the signed D is excluded
    expect(res.userPending).toHaveLength(1);
    expect(res.userPending[0].player.id).toBe("wpg-ufa");
    // user team is never auto-applied
    expect(res.teamCapMoves["WPG"]).toBeUndefined();
    expect(res.resignings.some((r) => r.playerId === "wpg-ufa")).toBe(false);
    expect(res.walkAways.some((w) => w.playerId === "wpg-ufa")).toBe(false);
  });

  it("always re-signs RFAs and books the cap swing (old off, new on)", () => {
    const res = resolveLeagueOffseason(players, { seed: 42, userTeamId: "WPG" });
    const rfaResign = res.resignings.find((r) => r.playerId === "stl-rfa");
    expect(rfaResign).toBeTruthy();

    const stl = res.teamCapMoves["STL"]!;
    expect(stl.outgoing?.some((m) => m.capHit === 0.9)).toBe(true);     // old AAV freed
    expect(stl.incoming?.some((m) => m.capHit === rfaResign!.contract.aav)).toBe(true); // new AAV charged
  });

  it("frees exactly the old AAV when a player walks (cap conservation)", () => {
    // Force the depth UFA onto its own team so we can read its moves in isolation.
    const lone: Asset[] = [
      mkAsset({ id: "solo-ufa", teamId: "DAL", position: "W", age: 31, ptsPace: 18, contractStatus: "UFA", capHit: 1.2 }),
    ];
    // Try seeds until we observe a walk (resignProb < 1 for this profile).
    let walked = false;
    for (let seed = 1; seed <= 50 && !walked; seed++) {
      const res = resolveLeagueOffseason(lone, { seed });
      const w = res.walkAways.find((x) => x.playerId === "solo-ufa");
      if (w) {
        walked = true;
        const dal = res.teamCapMoves["DAL"]!;
        expect(dal.incoming ?? []).toHaveLength(0);             // nothing added back
        expect(dal.outgoing).toEqual([{ capHit: 1.2 }]);        // exactly the old AAV freed
        // applyCapDelta should hand the team its old cap hit back
        expect(applyCapDelta(3.0, dal)).toBeCloseTo(4.2, 5);
        expect(res.market.some((m) => m.player.id === "solo-ufa")).toBe(true);
      }
    }
    expect(walked).toBe(true);
  });
});
