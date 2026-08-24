import { describe, expect, it } from "vitest";
import type { Asset } from "../app/lib/trade-types";
import {
  auditOffseasonPlayerStates,
  latestOffseasonStates,
  type OffseasonTransaction,
} from "../app/lib/offseason-ledger";

const player = (id: string, teamId = "WPG", contractStatus: Asset["contractStatus"] = "SIGNED"): Asset => ({
  id,
  teamId,
  name: id,
  position: "C",
  age: 25,
  games: 82,
  ptsPace: 40,
  defRate: 0,
  avgTOI: 15,
  capHit: 2,
  yearsRemaining: 1,
  hasNMC: false,
  hasNTC: false,
  canRetain: true,
  retainedPct: 0,
  multiplier: 1,
  expiresThisOffseason: false,
  contractStatus,
});

describe("offseason player-state invariant", () => {
  it("reconciles every terminal bucket against previous plus drafted", () => {
    const previous = [
      player("roster"),
      player("rights"),
      player("rfa"),
      player("ufa"),
      player("signed-elsewhere", "DAL"),
      player("retired"),
    ];
    const drafted = player("drafted", "SJS");
    const current = [
      previous[0],
      previous[1],
      previous[2],
      player("ufa", "FA_POOL", "UFA"),
      player("signed-elsewhere", "CAR"),
      drafted,
    ];

    const diagnostic = auditOffseasonPlayerStates({
      previous,
      current,
      drafted: [drafted],
      retired: [previous[5]],
      retainedRightsIds: ["rights"],
      rfaIds: ["rfa"],
      ufaIds: ["ufa"],
      signedElsewhereIds: ["signed-elsewhere"],
    });

    expect(diagnostic.ok).toBe(true);
    expect(diagnostic.counts).toEqual({
      ROSTER: 2,
      RETAINED_RIGHTS: 1,
      RFA: 1,
      UFA: 1,
      SIGNED_ELSEWHERE: 1,
      RETIRED: 1,
    });
    expect(diagnostic.actualCount).toBe(7);
    expect(diagnostic.expectedCount).toBe(7);
  });

  it("fails when a temporary UFA pool tries to hide a deleted player", () => {
    const diagnostic = auditOffseasonPlayerStates({
      previous: [player("walked")],
      current: [],
      ufaIds: ["walked"],
    });

    expect(diagnostic.ok).toBe(false);
    expect(diagnostic.missingPlayerIds).toEqual(["walked"]);
    expect(diagnostic.conflictingPlayerIds).toEqual(["walked"]);
  });

  it("fails when one player is claimed by two mutually exclusive states", () => {
    const diagnostic = auditOffseasonPlayerStates({
      previous: [player("contested")],
      current: [player("contested")],
      retainedRightsIds: ["contested"],
      rfaIds: ["contested"],
    });

    expect(diagnostic.ok).toBe(false);
    expect(diagnostic.conflictingPlayerIds).toEqual(["contested"]);
  });

  it("discloses only newly generated depth outside the real-player equation", () => {
    const existingDepth = player("depth-2027-wpg-w-1");
    const generatedDepth = player("depth-2028-wpg-w-1");
    const diagnostic = auditOffseasonPlayerStates({
      previous: [existingDepth],
      current: [existingDepth, generatedDepth],
      excludedSyntheticDepthIds: [generatedDepth.id],
    });

    expect(diagnostic.ok).toBe(true);
    expect(diagnostic.counts.ROSTER).toBe(1);
    expect(diagnostic.excludedSyntheticDepthCount).toBe(1);
  });
});

describe("offseason transaction ledger", () => {
  it("uses the last transaction as a player's terminal state", () => {
    const transactions: OffseasonTransaction[] = [
      {
        playerId: "p",
        playerName: "Player",
        kind: "ENTERED_MARKET",
        state: "UFA",
        detail: "Entered market",
      },
      {
        playerId: "p",
        playerName: "Player",
        kind: "SIGNED",
        state: "SIGNED_ELSEWHERE",
        detail: "Signed elsewhere",
      },
    ];

    expect(latestOffseasonStates(transactions).get("p")).toBe("SIGNED_ELSEWHERE");
  });
});
