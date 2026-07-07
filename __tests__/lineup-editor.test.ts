import { describe, expect, it } from "vitest";
import {
  hydrateLineupOrdersForRoster,
  type LineupOrderPayload,
  type LineupPlayer,
} from "../app/lib/lineup-order";

const player = (id: string, position: string): LineupPlayer => ({
  id,
  name: id,
  position,
  games: 82,
  avgTOI: 10,
  ptsPace: 20,
});

describe("LineupEditor saved lineup hydration", () => {
  it("preserves saved slot order across tab remounts while merging roster changes", () => {
    const saved: LineupOrderPayload = {
      forwards: ["f3", "departed", "f1"],
      defense: ["d2"],
      goalies: ["g2"],
      scratches: ["f2", "d1", "g1", "f3"],
    };

    const orders = hydrateLineupOrdersForRoster([
      player("f1", "W"),
      player("f2", "C"),
      player("f3", "W"),
      player("f4", "W"),
      player("d1", "D"),
      player("d2", "D"),
      player("g1", "G"),
      player("g2", "G"),
    ], saved);

    expect(orders.F).toEqual(["f3", "f1", "f2", "f4"]);
    expect(orders.D).toEqual(["d2", "d1"]);
    expect(orders.G).toEqual(["g2", "g1"]);
  });
});
