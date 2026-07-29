import { describe, expect, it } from "vitest";
import {
  dealDailyHand,
  findOptimalCombos,
  findOptimalScore,
  overlapWithOptimal,
  scoreHand,
  assessDeal,
  dealIsPlayable,
  obviousHand,
  buildShareText,
  CARDS_DEALT,
  DEAL_RULES,
  HAND_SIZE,
  PEG_BOARD_LENGTH,
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

// ── Curated deals ────────────────────────────────────────────────
//
// The deal used to be `shuffled.slice(0, 6)` under a comment claiming it
// ensured scoring potential. It did not, and measured over a year: the optimum
// ran 3–19 against a board hard-coded to 15, only 42% of days had a unique
// perfect hand, and one day in six weeks dealt a hand where all fifteen
// combinations scored identically — every pick perfect, no puzzle at all.
describe("daily deal is constructed, not drawn", () => {
  const YEAR = Array.from({ length: 200 }, (_, i) => dealDailyHand(PRESS_BOX_POOL, i + 1));

  it("deals the full table plus a call-up, with no card appearing twice", () => {
    for (const hand of YEAR) {
      expect(hand.dealt).toHaveLength(CARDS_DEALT);
      const ids = new Set(hand.dealt.map(p => p.id));
      expect(ids.size, `day ${hand.dayNumber}`).toBe(CARDS_DEALT);
      expect(ids.has(hand.callUp.id), `day ${hand.dayNumber} dealt its own call-up`).toBe(false);
    }
  });

  it("is the same puzzle for everyone, search included", () => {
    const a = dealDailyHand(PRESS_BOX_POOL, 42);
    const b = dealDailyHand(PRESS_BOX_POOL, 42);
    expect(a.dealt.map(p => p.id)).toEqual(b.dealt.map(p => p.id));
    expect(a.callUp.id).toBe(b.callUp.id);
    expect(a.candidatesTried).toBe(b.candidatesTried);
  });

  it("keeps every optimum inside the band the board is drawn for", () => {
    for (const hand of YEAR) {
      expect(hand.optimal.score, `day ${hand.dayNumber}`)
        .toBeGreaterThanOrEqual(DEAL_RULES.MIN_OPTIMUM);
      expect(hand.optimal.score, `day ${hand.dayNumber}`)
        .toBeLessThanOrEqual(PEG_BOARD_LENGTH);
    }
  });

  it("never deals a hand where every combination ties", () => {
    // The 2%-of-days case that made the puzzle a no-op.
    for (const hand of YEAR) {
      const q = assessDeal(hand.dealt, hand.callUp);
      expect(q.perfectHands, `day ${hand.dayNumber}`).toBeLessThanOrEqual(DEAL_RULES.MAX_PERFECT_HANDS);
      expect(q.optimum, `day ${hand.dayNumber}`).toBeGreaterThan(q.runnerUp);
    }
  });

  it("leaves a runner-up close enough to be tempting", () => {
    for (const hand of YEAR) {
      const q = assessDeal(hand.dealt, hand.callUp);
      expect(q.optimum - q.runnerUp, `day ${hand.dayNumber}`)
        .toBeLessThanOrEqual(DEAL_RULES.MAX_RUNNER_UP_GAP);
    }
  });

  it("builds the answer from several scoring categories", () => {
    for (const hand of YEAR) {
      expect(assessDeal(hand.dealt, hand.callUp).categories, `day ${hand.dayNumber}`)
        .toBeGreaterThanOrEqual(DEAL_RULES.MIN_CATEGORIES);
    }
  });

  it("makes the most visible grouping a decoy, never the answer", () => {
    for (const hand of YEAR) {
      expect(assessDeal(hand.dealt, hand.callUp).obviousIsAnswer, `day ${hand.dayNumber}`).toBe(false);
    }
  });

  it("reports whether it actually found a curated deal", () => {
    // The fallback exists so a drifting pool can never produce a blank page.
    // Against today's pool it should never be needed.
    for (const hand of YEAR) expect(hand.curated, `day ${hand.dayNumber}`).toBe(true);
  });

  it("agrees with itself about the optimum", () => {
    for (const hand of YEAR.slice(0, 40)) {
      expect(hand.optimal.score).toBe(findOptimalScore(hand.dealt, hand.callUp));
    }
  });

  it("finds a deal in a handful of candidates", () => {
    const worst = Math.max(...YEAR.map(h => h.candidatesTried));
    expect(worst).toBeLessThan(DEAL_RULES.MAX_CANDIDATES);
  });
});

describe("obviousHand", () => {
  it("names the largest single-trait group when one reaches a full hand", () => {
    const dealt = [
      player("a", { team: "EDM" }), player("b", { team: "EDM" }),
      player("c", { team: "EDM" }), player("d", { team: "EDM" }),
      player("e", { team: "BOS", division: "Atlantic" }),
    ];
    expect(obviousHand(dealt)).toEqual(["a", "b", "c", "d"]);
  });

  it("reports nothing when no trait groups four cards", () => {
    const dealt = [
      player("a", { team: "EDM", division: "Pacific", nationality: "CAN", draftYear: 2015, position: "C" }),
      player("b", { team: "BOS", division: "Atlantic", nationality: "USA", draftYear: 2016, position: "D" }),
      player("c", { team: "NYR", division: "Metro", nationality: "SWE", draftYear: 2017, position: "G" }),
    ];
    expect(obviousHand(dealt)).toBeNull();
  });
});

describe("dealIsPlayable", () => {
  const good = {
    optimum: 14, perfectHands: 1, runnerUp: 12,
    categories: 3, obviousIsAnswer: false,
  };

  it("accepts a well-formed deal", () => {
    expect(dealIsPlayable(good)).toBe(true);
  });

  it("rejects each failure on its own", () => {
    expect(dealIsPlayable({ ...good, optimum: DEAL_RULES.MIN_OPTIMUM - 1, runnerUp: 9 })).toBe(false);
    expect(dealIsPlayable({ ...good, optimum: DEAL_RULES.MAX_OPTIMUM + 1, runnerUp: 18 })).toBe(false);
    expect(dealIsPlayable({ ...good, perfectHands: DEAL_RULES.MAX_PERFECT_HANDS + 1 })).toBe(false);
    expect(dealIsPlayable({ ...good, categories: DEAL_RULES.MIN_CATEGORIES - 1 })).toBe(false);
    expect(dealIsPlayable({ ...good, runnerUp: 14 })).toBe(false);   // a tie is not a runner-up
    expect(dealIsPlayable({ ...good, runnerUp: 14 - DEAL_RULES.MAX_RUNNER_UP_GAP - 1 })).toBe(false);
    expect(dealIsPlayable({ ...good, obviousIsAnswer: true })).toBe(false);
  });
});

describe("share text", () => {
  it("scores against today's optimum, not a fixed ceiling", () => {
    // "8/15 ★★★★★ PERFECT HAND" told winners they had scored 53%.
    const text = buildShareText(7, 13, 13, [9, 11, 13]);
    expect(text).toContain("13/13");
    expect(text).toContain("PERFECT HAND");
    expect(text).toContain("3/5");
    expect(text).not.toContain("/15");
  });

  it("marks an unsolved day", () => {
    const text = buildShareText(7, 11, 14, [9, 10, 11, 11, 11]);
    expect(text).toContain("X/5");
    expect(text).not.toContain("PERFECT HAND");
  });
});

describe("hand size", () => {
  it("still asks for four cards out of the eight dealt", () => {
    expect(HAND_SIZE).toBe(4);
    expect(CARDS_DEALT).toBeGreaterThan(HAND_SIZE);
  });
});
