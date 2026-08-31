import { describe, expect, it } from "vitest";
import {
  capPickReconciliation,
  contractStatusAgeInvariant,
  crossSurfaceValueReconciliation,
  exactNameAliasInvariance,
  freeAgentPoolConsistencyInvariant,
  missingDataUncertaintyInvariant,
  noFutureInformationLeakage,
  retentionSlotGate,
  teamPopulationLineupInvariant,
} from "@/app/lib/release-gates";
import { rosterLegality } from "@/app/lib/roster-legality";

describe("exactNameAliasInvariance", () => {
  it("passes when every canonical name maps to exactly one NHL ID", () => {
    const result = exactNameAliasInvariance([
      { nhlId: 1, name: "Connor McDavid" },
      { nhlId: 2, name: "Kevin Korchinski" },
    ]);
    expect(result.passed).toBe(true);
  });

  it("fails when the same accent-stripped name maps to two different NHL IDs", () => {
    const result = exactNameAliasInvariance([
      { nhlId: 1, name: "Viggo Björck" },
      { nhlId: 2, name: "Viggo Bjorck" },
    ]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("more than one NHL ID");
  });

  it("a known, reviewed real-world collision (two different Elias Perssons) does not fail the gate", () => {
    // Live production export, Aug 31 2026: caught exactly this, which is
    // real and deliberate — build-league-seed.ts's SAME_NAME_ADDITIONS keeps
    // the VAN center and VAN defenseman as distinct, position-salted rows on
    // purpose rather than collapsing them.
    const records = [
      { nhlId: "eliaspettersson", name: "Elias Pettersson" },
      { nhlId: "eliaspettersson-d", name: "Elias Pettersson" },
    ];
    expect(exactNameAliasInvariance(records).passed).toBe(false);
    expect(exactNameAliasInvariance(records, new Set(["elias-pettersson"])).passed).toBe(true);
  });

  it("passes when the same NHL ID reappears under the same spelling", () => {
    const result = exactNameAliasInvariance([
      { nhlId: 1, name: "Connor McDavid" },
      { nhlId: 1, name: "Connor McDavid" },
    ]);
    expect(result.passed).toBe(true);
  });
});

describe("crossSurfaceValueReconciliation", () => {
  it("passes when every surface reports the same snapshot id for a player", () => {
    const result = crossSurfaceValueReconciliation([
      { playerId: "mcdavid", snapshotId: "mcdavid-2026-08-27-abc", total: 568 },
      { playerId: "mcdavid", snapshotId: "mcdavid-2026-08-27-abc", total: 568 },
    ]);
    expect(result.passed).toBe(true);
  });

  it("fails when two surfaces disagree on the snapshot id (the V-04 failure)", () => {
    const result = crossSurfaceValueReconciliation([
      { playerId: "mcdavid", snapshotId: "mcdavid-2026-08-27-abc", total: 568 },
      { playerId: "mcdavid", snapshotId: "mcdavid-2026-08-27-def", total: 570 },
    ]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("mcdavid");
  });
});

describe("contractStatusAgeInvariant", () => {
  const offseasonYear = 2026;

  it("passes a normal signed roster", () => {
    const result = contractStatusAgeInvariant([
      { id: "a", age: 22, expiryStatus: null, expiryYear: null, offseasonYear },
    ]);
    expect(result.passed).toBe(true);
  });

  it("passes a real signed-with-a-known-future-class player (Ian Cole's own verified DATA-03 shape)", () => {
    // A live production export (1,640 players, Aug 31 2026) proved the
    // original version of this gate wrong: it flagged exactly this shape —
    // signed now, a real known future UFA/RFA year — as a violation. That
    // is what the expiry-by-year ledger (DATA-03) exists to represent, not
    // a contradiction.
    const result = contractStatusAgeInvariant([
      { id: "iancole", age: 37, expiryStatus: "UFA", expiryYear: 2027, offseasonYear },
      { id: "eliaspettersson-d", age: 25, expiryStatus: "RFA", expiryYear: 2027, offseasonYear },
    ]);
    expect(result.passed).toBe(true);
  });

  it("fails an asserted RFA/UFA status with no expiryYear behind it (the live Zack Bolduc case)", () => {
    const result = contractStatusAgeInvariant([
      { id: "zackbolduc", age: 22, expiryStatus: "RFA", expiryYear: null, offseasonYear },
    ]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("zackbolduc");
  });

  it("fails a negative age", () => {
    const result = contractStatusAgeInvariant([
      { id: "a", age: -1, expiryStatus: null, expiryYear: null, offseasonYear },
    ]);
    expect(result.passed).toBe(false);
  });

  it("passes a real expired-ELC RFA (the corrected Korchinski shape)", () => {
    const result = contractStatusAgeInvariant([
      { id: "korchinski", age: 22, expiryStatus: "RFA", expiryYear: 2026, offseasonYear },
    ]);
    expect(result.passed).toBe(true);
  });
});

describe("teamPopulationLineupInvariant", () => {
  it("passes when every team can ice a legal lineup", () => {
    const players = Array.from({ length: 12 }, (_, i) => ({ position: "C", teamId: "WPG" }))
      .concat(Array.from({ length: 6 }, () => ({ position: "D", teamId: "WPG" })))
      .concat(Array.from({ length: 2 }, () => ({ position: "G", teamId: "WPG" })));
    const result = teamPopulationLineupInvariant({ WPG: rosterLegality(players, "WPG") });
    expect(result.passed).toBe(true);
  });

  it("fails and names the team when a lineup is short", () => {
    const result = teamPopulationLineupInvariant({
      CGY: rosterLegality([{ position: "C", teamId: "CGY" }], "CGY"),
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("CGY");
  });
});

describe("capPickReconciliation", () => {
  it("passes when the displayed after-cap matches the reconciled delta", () => {
    // Acquiring a $4M player costs cap room: 10 - 4 = 6.
    const result = capPickReconciliation([
      { id: "WPG", capSpaceBefore: 10, capSpaceAfter: 6, moves: { incoming: [{ capHit: 4 }] } },
    ]);
    expect(result.passed).toBe(true);
  });

  it("fails when the displayed total drifts from what the shared delta function computes", () => {
    const result = capPickReconciliation([
      { id: "WPG", capSpaceBefore: 10, capSpaceAfter: 9, moves: { incoming: [{ capHit: 4 }] } },
    ]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("WPG");
  });
});

describe("retentionSlotGate", () => {
  it("passes three retentions and fails four (DATA-05's stress test)", () => {
    const proposed = (n: number) => Array.from({ length: n }, (_, i) => ({
      playerId: `p${i}`, playerName: `P${i}`, pct: 0.3, capHit: 3, yearsRemaining: 1,
    }));
    const three = retentionSlotGate([{ teamId: "WPG", ledger: [], proposed: proposed(3), capCeiling: 104 }]);
    const four = retentionSlotGate([{ teamId: "WPG", ledger: [], proposed: proposed(4), capCeiling: 104 }]);
    expect(three.passed).toBe(true);
    expect(four.passed).toBe(false);
    expect(four.detail).toContain("WPG");
  });
});

describe("missingDataUncertaintyInvariant", () => {
  it("passes a pick with no market value and no fabricated surplus/uncertainty", () => {
    const result = missingDataUncertaintyInvariant([
      { playerId: "pick", marketValue: null, surplus: null, uncertainty: null },
    ]);
    expect(result.passed).toBe(true);
  });

  it("fails when a surplus is asserted with no market value behind it", () => {
    const result = missingDataUncertaintyInvariant([
      { playerId: "pick", marketValue: null, surplus: 5, uncertainty: null },
    ]);
    expect(result.passed).toBe(false);
  });
});

describe("noFutureInformationLeakage", () => {
  it("passes when every input predates the as_of date", () => {
    const result = noFutureInformationLeakage("2027-06-15", [
      { label: "roster snapshot", timestamp: "2027-06-01" },
      { label: "stats capture", timestamp: "2027-05-30" },
    ]);
    expect(result.passed).toBe(true);
  });

  it("fails when a simulated state carries an input dated after its own as_of", () => {
    const result = noFutureInformationLeakage("2027-06-15", [
      { label: "draft result", timestamp: "2027-07-01" },
    ]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("draft result");
  });

  it("fails cleanly on an unparseable as_of rather than silently passing", () => {
    const result = noFutureInformationLeakage("not-a-date", [{ label: "x", timestamp: null }]);
    expect(result.passed).toBe(false);
  });
});

describe("freeAgentPoolConsistencyInvariant", () => {
  it("passes a signed roster player and a genuinely unsigned FA_POOL player", () => {
    const result = freeAgentPoolConsistencyInvariant([
      { id: "rostered", teamId: "WPG", contractStatus: "SIGNED" },
      { id: "unsigned", teamId: "FA_POOL", contractStatus: "UFA" },
    ]);
    expect(result.passed).toBe(true);
  });

  it("does not flag a pending RFA/UFA still on his current roster — that is the normal mid-season state", () => {
    const result = freeAgentPoolConsistencyInvariant([
      { id: "pendingUfa", teamId: "WPG", contractStatus: "UFA" },
    ]);
    expect(result.passed).toBe(true);
  });

  it("fails a player who is in FA_POOL but still reads as SIGNED", () => {
    const result = freeAgentPoolConsistencyInvariant([
      { id: "staleWrite", teamId: "FA_POOL", contractStatus: "SIGNED" },
    ]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("staleWrite");
  });
});
