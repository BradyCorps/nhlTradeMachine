import { describe, expect, it } from "vitest";
import { calcContractIndependentPositionalNavRaw } from "../app/lib/xnav-engine";

describe("contract-independent positional NAV raw", () => {
  it("does not change when target-contract fields change", () => {
    const player = {
      id: "1", name: "Test Forward", position: "C" as const, age: 26,
      capHit: 1_000_000, yearsRemaining: 1, ptsPace: 65, goalsPace: 25,
      assistsPace: 40, xGPace: 22, defRate: 3, avgTOI: 18, games: 70,
      hasLiveStats: true,
    };
    const changedContract = {
      ...player, capHit: 12_000_000, yearsRemaining: 8, retainedPct: 0.5,
      extensionCapHit: 14_000_000, extensionYears: 7, lastCapHit: 9_000_000,
    };
    expect(calcContractIndependentPositionalNavRaw(changedContract)).toEqual(
      calcContractIndependentPositionalNavRaw(player),
    );
  });
});
