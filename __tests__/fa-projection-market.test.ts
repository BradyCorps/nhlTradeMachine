import { describe, expect, it } from "vitest";
import { projectFreeAgentContract } from "../app/lib/free-agency";
import type { Asset } from "../app/lib/trade-types";

const asset = (over: Partial<Asset>): Asset => ({
  id: over.id ?? "x", teamId: "CHI", name: over.name ?? "X", position: "C", age: 27,
  games: 75, ptsPace: 50, defRate: 0.1, avgTOI: 18, capHit: 0, yearsRemaining: 0,
  hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0, multiplier: 1,
  contractStatus: "UFA", hasLiveStats: true, ...over,
} as Asset);

// Post-Carlsson-offer-sheet market: ascending stars get paid for their
// prime, workload-only D stop projecting like offensive stars.
describe("FA projection market calibration", () => {
  it("prices a Bedard-tier ascending RFA in Kaprizov range on max term", () => {
    const c = projectFreeAgentContract(
      asset({ id: "bedard", age: 21, ptsPace: 82, baselinePtsPace: 75, contractStatus: "RFA" }),
    );
    expect(c.aav).toBeGreaterThanOrEqual(14);
    expect(c.aav).toBeLessThanOrEqual(20.8);
    expect(c.term).toBeGreaterThanOrEqual(7);
    expect(c.tier).toBe("STAR");
  });

  it("keeps a workload defensive D out of star money", () => {
    const c = projectFreeAgentContract(
      asset({ id: "ferraro", position: "D", age: 28, ptsPace: 22, baselinePtsPace: 20, avgTOI: 21 }),
    );
    expect(c.aav).toBeLessThanOrEqual(6.2);
    expect(c.aav).toBeGreaterThanOrEqual(3.5);
  });

  it("still pays elite two-way D like elite D", () => {
    const c = projectFreeAgentContract(
      asset({ id: "makar", position: "D", age: 27, ptsPace: 88, baselinePtsPace: 85, avgTOI: 25 }),
    );
    expect(c.aav).toBeGreaterThanOrEqual(11);
  });

  it("leaves an established prime UFA scorer priced off his actual pace", () => {
    const c = projectFreeAgentContract(
      asset({ id: "robertson", position: "W", age: 27, ptsPace: 85, baselinePtsPace: 82 }),
    );
    expect(c.aav).toBeGreaterThanOrEqual(11);
    expect(c.aav).toBeLessThanOrEqual(15);
  });

  it("young RFA money now clears an equivalent veteran's deal (no bargain generational talents)", () => {
    const young = projectFreeAgentContract(
      asset({ id: "y", age: 21, ptsPace: 80, baselinePtsPace: 76, contractStatus: "RFA" }),
    );
    const vet = projectFreeAgentContract(
      asset({ id: "v", age: 28, ptsPace: 80, baselinePtsPace: 76 }),
    );
    expect(young.aav).toBeGreaterThanOrEqual(vet.aav - 1);
  });
});
