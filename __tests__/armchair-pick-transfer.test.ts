import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useTradeBench } from "@/app/armchair-gm/useTradeBench";
import { canOfferPick, teamPickAssets } from "@/app/lib/pick-ownership";
import type { Asset, Team } from "@/app/lib/trade-types";

vi.mock("@/app/lib/evaluate-client", () => ({ clearNavCache: vi.fn() }));

describe("Armchair pick ownership transfer", () => {
  it("executes through the existing bench without duplicating the pick, restoring its original owner, or charging cap", () => {
    const teams: Team[] = ["CBJ", "VAN", "WPG"].map(id => ({ id, name: id, capSpace: 10, standing: 10 }));
    const asset = { id: "pick-TOR-2027-2", originalOwnerId: "TOR", currentOwnerId: "CBJ",
      teamId: "CBJ", name: "Toronto second", position: "Pick", year: 2027, round: 2,
      capHit: 0, retainedPct: 0, pickOwnership: "verified" } as Asset;
    let db = { teams, players: [asset], capCeiling: 104 };
    const transfer = (from: string, to: string) => {
      let bench: ReturnType<typeof useTradeBench> | undefined;
      function Fixture() {
        bench = useTradeBench({ homeTeam: teams.find(t => t.id === from)!, partnerTeam: teams.find(t => t.id === to)!,
          outgoingBlock: [db.players[0]], incomingBlock: [], setBlocks: vi.fn(), setVerdict: vi.fn(), db,
          setDb: next => { db = typeof next === "function" ? next(db) as typeof db : next as typeof db; },
          originalDb: null, setHomeTeamLocked: vi.fn(), setShowTeamSelect: vi.fn(), cupRun: null,
          setCupRun: vi.fn(), offseasonResolvedRef: { current: true }, simControlsRef: { current: null } });
        return null;
      }
      renderToStaticMarkup(React.createElement(Fixture));
      bench!.executeTrade();
    };
    transfer("CBJ", "VAN");
    transfer("VAN", "WPG");
    expect(db.players).toHaveLength(1);
    expect(db.players[0]).toMatchObject({ id: asset.id, originalOwnerId: "TOR", currentOwnerId: "WPG", teamId: "WPG" });
    expect(teamPickAssets(db.players, "CBJ")).toEqual([]);
    expect(teamPickAssets(db.players, "VAN")).toEqual([]);
    expect(teamPickAssets(db.players, "WPG")).toHaveLength(1);
    expect(canOfferPick(db.players[0])).toBe(true);
    expect(db.teams.map(t => t.capSpace)).toEqual([10, 10, 10]);
    expect(db.capCeiling).toBe(104);
  });
});
