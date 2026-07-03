import { describe, expect, it } from "vitest";
import {
  dealDailyHand,
  findOptimalCombos,
  findOptimalScore,
  overlapWithOptimal,
  scoreHand,
  type PressBoxPlayer,
} from "../app/lib/press-box-engine";
import { PRESS_BOX_POOL } from "../app/data/press-box-pool";

const player = (id: string, over: Partial<PressBoxPlayer> = {}): PressBoxPlayer => ({
  id,
  name: id,
  team: "EDM",
  teamName: "Edmonton Oilers",
  position: "C",
  age: 25,
  nationality: "CAN",
  draftYear: 2015,
  jerseyNumber: 10,
  division: "Pacific",
  ...over,
});

describe("press-box engine", () => {
  it("findOptimalCombos agrees with findOptimalScore and returns real combos", () => {
    const hand = dealDailyHand(PRESS_BOX_POOL, 3);
    const { score, combos } = findOptimalCombos(hand.dealt, hand.callUp);
    expect(score).toBe(findOptimalScore(hand.dealt, hand.callUp));
    expect(combos.length).toBeGreaterThan(0);
    for (const combo of combos) {
      expect(combo).toHaveLength(4);
      const picks = hand.dealt.filter((p) => combo.includes(p.id));
      expect(scoreHand(picks, hand.callUp).total).toBe(score);
    }
  });

  it("overlapWithOptimal counts the best intersection across optimal combos", () => {
    const combos = [
      ["a", "b", "c", "d"],
      ["a", "b", "e", "f"],
    ];
    expect(overlapWithOptimal(["a", "b", "e", "f"], combos)).toBe(4);
    expect(overlapWithOptimal(["a", "b", "c", "x"], combos)).toBe(3);
    expect(overlapWithOptimal(["x", "y", "z", "w"], combos)).toBe(0);
  });

  it("picking an exact optimal combo scores the optimal total", () => {
    const dealt = [
      player("p1", { team: "EDM" }),
      player("p2", { team: "EDM" }),
      player("p3", { team: "TOR", division: "Atlantic", nationality: "SWE", draftYear: 2020 }),
      player("p4", { team: "BOS", division: "Atlantic", nationality: "FIN", draftYear: 2008 }),
      player("p5", { team: "NYR", division: "Metro", nationality: "RUS", draftYear: 2011, position: "G" }),
      player("p6", { team: "LAK", division: "Pacific", nationality: "USA", draftYear: 2023, position: "D" }),
    ];
    const callUp = player("cu", { team: "EDM" });
    const { score, combos } = findOptimalCombos(dealt, callUp);
    expect(overlapWithOptimal(combos[0], combos)).toBe(4);
    const picks = dealt.filter((p) => combos[0].includes(p.id));
    expect(scoreHand(picks, callUp).total).toBe(score);
  });
});
