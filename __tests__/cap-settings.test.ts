import { describe, expect, it } from "vitest";
import { buildTeamCapSpaceMap, contractCapCharge, parseStoredCapCeiling, parseStoredCapFloor } from "../app/lib/cap-settings";
import { SEASON } from "../app/lib/season-config";

describe("cap settings", () => {
  it("ignores stale legacy cap defaults after the season default changes", () => {
    expect(parseStoredCapCeiling("95.5", SEASON.capCeiling)).toBeNull();
    expect(parseStoredCapFloor("65", SEASON.capFloor)).toBeNull();
  });

  it("keeps real custom cap overrides", () => {
    expect(parseStoredCapCeiling("106.5", SEASON.capCeiling)).toBe(106.5);
    expect(parseStoredCapFloor("78.5", SEASON.capFloor)).toBe(78.5);
  });

  it("rejects malformed stored cap values", () => {
    expect(parseStoredCapCeiling("abc", SEASON.capCeiling)).toBeNull();
    expect(parseStoredCapCeiling("140", SEASON.capCeiling)).toBeNull();
    expect(parseStoredCapFloor("-1", SEASON.capFloor)).toBeNull();
  });

  it("derives team cap space from synced active contract rows", () => {
    const contracts = Array.from({ length: 12 }, (_, idx) => ({
      teamId: "WPG",
      position: idx === 0 ? "G" : "C",
      capHit: 7,
      yearsRemaining: 1,
    }));

    expect(buildTeamCapSpaceMap(contracts, 104).get("WPG")).toBe(20);
  });

  it("does not derive cap space from incomplete or inactive rows", () => {
    expect(buildTeamCapSpaceMap([
      { teamId: "WPG", position: "C", capHit: 8, yearsRemaining: 1 },
      { teamId: "WPG", position: "D", capHit: 6, yearsRemaining: 1 },
    ], 104).has("WPG")).toBe(false);

    expect(contractCapCharge({ teamId: "WPG", position: "C", capHit: 8, yearsRemaining: 0 })).toBe(0);
    expect(contractCapCharge({ teamId: "WPG", position: "C", capHit: 8, yearsRemaining: 1, isLtir: true })).toBe(0);
    expect(contractCapCharge({ teamId: "WPG", position: "Pick", capHit: 8, yearsRemaining: 1 })).toBe(0);
  });
});
