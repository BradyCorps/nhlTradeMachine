import { describe, expect, it } from "vitest";
import { AI_TRADE_RULES, applyAiTrades, resolveAiTrades, type AiTradeContext } from "../app/lib/ai-trades";
import { lineupContributionScore } from "../app/lib/lineup-ranking";
import type { Asset, Team } from "../app/lib/trade-types";

const LIMITS = { ceiling: 104, floor: 76.9 };

const team = (id: string, over: Partial<Team> = {}): Team =>
  ({ id, name: `${id} Club`, capSpace: 10, standing: 15, phase: "Retooling", ...over } as Team);

const player = (id: string, teamId: string, over: Partial<Asset> = {}): Asset =>
  ({
    id, name: `Player ${id}`, teamId, position: "C", age: 27,
    capHit: 4, yearsRemaining: 3, ptsPace: 40, avgTOI: 16, games: 82,
    ...over,
  } as Asset);

/**
 * A club with enough bodies that the protected core does not eat the roster.
 *
 * Cap hits descend with contribution, like a real roster — a flat payroll has
 * no cheap depth player to send back, which is a property of the fixture rather
 * than of the league.
 */
const roster = (teamId: string, count = 12, over: Partial<Asset> = {}): Asset[] =>
  Array.from({ length: count }, (_, i) =>
    player(`${teamId}-${String(i).padStart(2, "0")}`, teamId, {
      ptsPace: 70 - i * 4,
      capHit: Math.round((8.5 - i * 0.7) * 10) / 10,
      // Mixed positions, like a real roster: an all-centre club reads as
      // "thin everywhere else" and inflates every fit score.
      position: i < 7 ? (i % 3 === 0 ? "C" : "W") : i < 11 ? "D" : "G",
      ...over,
    }));

const ctx = (teams: Team[], capSpace: Record<string, number>, over: Partial<AiTradeContext> = {}): AiTradeContext => ({
  teams, capSpace: new Map(Object.entries(capSpace)), limits: LIMITS, ...over,
});

describe("resolveAiTrades — when a trade happens at all", () => {
  it("does nothing when every club is cap-legal", () => {
    const teams = [team("AAA"), team("BBB")];
    const players = [...roster("AAA"), ...roster("BBB")];
    expect(resolveAiTrades(players, ctx(teams, { AAA: 5, BBB: 9 }))).toEqual([]);
  });

  // Cap relief is the motive. Without one this is just shuffling the league.
  it("sheds salary for a club over the ceiling", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding", capSpace: 20 })];
    const players = [...roster("AAA"), ...roster("BBB")];
    const trades = resolveAiTrades(players, ctx(teams, { AAA: -3, BBB: 20 }));
    expect(trades).toHaveLength(1);
    expect(trades[0].fromTeamId).toBe("AAA");
    expect(trades[0].capSaved).toBeGreaterThan(0);
  });

  it("never trades the user's club, in either direction", () => {
    const teams = [team("AAA"), team("USER", { phase: "Rebuilding" })];
    const players = [...roster("AAA"), ...roster("USER")];
    const trades = resolveAiTrades(players, ctx(teams, { AAA: -5, USER: 30 }, { userTeamId: "USER" }));
    expect(trades).toEqual([]);
  });

  it("is deterministic — the same league yields the same trades", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" }), team("CCC", { phase: "Rebuilding" })];
    const players = [...roster("AAA"), ...roster("BBB"), ...roster("CCC")];
    const run = () => JSON.stringify(resolveAiTrades(players, ctx(teams, { AAA: -4, BBB: 25, CCC: 25 })));
    expect(run()).toBe(run());
    // …and does not depend on the order the clubs arrive in.
    const reversed = JSON.stringify(resolveAiTrades(
      [...players].reverse(), ctx([...teams].reverse(), { AAA: -4, BBB: 25, CCC: 25 })));
    expect(reversed).toBe(run());
  });

  it("respects the league-wide trade ceiling", () => {
    const teams = Array.from({ length: 20 }, (_, i) =>
      team(`T${String(i).padStart(2, "0")}`, { phase: i % 2 ? "Rebuilding" : "Retooling" }));
    const players = teams.flatMap(t => roster(t.id));
    const caps = Object.fromEntries(teams.map((t, i) => [t.id, i % 2 ? 40 : -4]));
    expect(resolveAiTrades(players, ctx(teams, caps)).length)
      .toBeLessThanOrEqual(AI_TRADE_RULES.MAX_TRADES);
  });

  it("sheds at most one player per club in an offseason", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" }), team("CCC", { phase: "Rebuilding" })];
    const players = [...roster("AAA"), ...roster("BBB"), ...roster("CCC")];
    const trades = resolveAiTrades(players, ctx(teams, { AAA: -30, BBB: 40, CCC: 40 }));
    expect(trades.filter(t => t.fromTeamId === "AAA").length)
      .toBeLessThanOrEqual(AI_TRADE_RULES.MAX_OUT_PER_TEAM);
  });
});

describe("resolveAiTrades — rejecting incoherent dumps", () => {
  // The failure mode that matters: a league that launders its best players
  // into whoever happened to have cap room.
  it("does not move a club's core to solve a cap problem", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" })];
    const players = [...roster("AAA"), ...roster("BBB")];
    const trades = resolveAiTrades(players, ctx(teams, { AAA: -4, BBB: 30 }));
    // Ranked by the same function the rule uses. Sorting by ptsPace instead
    // would be testing a proxy for the rule rather than the rule.
    const core = [...players.filter(p => p.teamId === "AAA")]
      .sort((a, b) => lineupContributionScore(b) - lineupContributionScore(a))
      .slice(0, AI_TRADE_RULES.PROTECTED_CORE)
      .map(p => p.id);
    for (const t of trades) expect(core).not.toContain(t.outPlayerId);
  });

  it("will not move a player nobody wants", () => {
    // Every club is a contender with no room and no need — no fit anywhere.
    const teams = [team("AAA"), team("BBB", { phase: "Contender", capSpace: 0 })];
    const players = [...roster("AAA"), ...roster("BBB")];
    expect(resolveAiTrades(players, ctx(teams, { AAA: -4, BBB: 0 }))).toEqual([]);
  });

  it("respects a no-move clause", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" })];
    const players = [
      ...roster("AAA").map(p => ({ ...p, hasNMC: true })),
      ...roster("BBB"),
    ];
    expect(resolveAiTrades(players, ctx(teams, { AAA: -4, BBB: 30 }))).toEqual([]);
  });

  it("respects an untouchable trade-block flag", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" })];
    const players = [
      ...roster("AAA").map(p => ({ ...p, tradeBlockStatus: "untouchable" as const })),
      ...roster("BBB"),
    ];
    expect(resolveAiTrades(players, ctx(teams, { AAA: -4, BBB: 30 }))).toEqual([]);
  });

  it("never moves a draft pick", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" })];
    const players = [
      ...roster("AAA"),
      player("pick-AAA-2027-1", "AAA", { position: "Pick", capHit: 0 }),
      ...roster("BBB"),
    ];
    const trades = resolveAiTrades(players, ctx(teams, { AAA: -4, BBB: 30 }));
    for (const t of trades) {
      expect(t.outPlayerId).not.toContain("pick-");
      expect(t.inPlayerId).not.toContain("pick-");
    }
  });

  it("does not push the buyer through the ceiling", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" })];
    const players = [...roster("AAA"), ...roster("BBB")];
    // BBB is rebuilding and wants the player, but has only $0.5M of room.
    expect(resolveAiTrades(players, ctx(teams, { AAA: -4, BBB: 0.5 }))).toEqual([]);
  });

  it("does not drop the seller below the floor", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" })];
    const players = [...roster("AAA"), ...roster("BBB")];
    // A payroll range so narrow that every legal move overshoots: AAA sits at
    // 104.5 against a 104 ceiling and a 103.9 floor, and the cheapest trade
    // available clears $1.4M. Staying over the ceiling is the honest outcome —
    // there is no move that fixes it without breaking the other end.
    const trades = resolveAiTrades(players, ctx(teams,
      { AAA: -0.5, BBB: 30 }, { limits: { ceiling: 104, floor: 103.9 } }));
    expect(trades).toEqual([]);
  });
});

describe("resolveAiTrades — the shape of the deal", () => {
  it("sends a body back so neither roster shrinks", () => {
    // Structural, not cosmetic: without a return the seller loses a player
    // every offseason and a three-year run runs clubs out of bodies.
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" })];
    const players = [...roster("AAA"), ...roster("BBB")];
    const [t] = resolveAiTrades(players, ctx(teams, { AAA: -4, BBB: 30 }));
    expect(t.inPlayerId).toBeTruthy();
    expect(t.inPlayerId).not.toBe(t.outPlayerId);
  });

  it("keeps the return cheap enough that the seller actually saves", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" })];
    const players = [...roster("AAA"), ...roster("BBB")];
    const [t] = resolveAiTrades(players, ctx(teams, { AAA: -4, BBB: 30 }));
    const out = players.find(p => p.id === t.outPlayerId)!;
    const back = players.find(p => p.id === t.inPlayerId)!;
    expect(back.capHit).toBeLessThanOrEqual(out.capHit * AI_TRADE_RULES.MAX_RETURN_FRACTION);
    expect(t.capSaved).toBeCloseTo(out.capHit - back.capHit);
  });

  it("does not bother moving a league-minimum contract", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" })];
    const players = [
      ...roster("AAA", 12, { capHit: 0.8 }),
      ...roster("BBB"),
    ];
    expect(resolveAiTrades(players, ctx(teams, { AAA: -0.5, BBB: 30 }))).toEqual([]);
  });

  it("carries a reason naming both clubs and the money", () => {
    const teams = [team("AAA"), team("BBB", { phase: "Rebuilding" })];
    const players = [...roster("AAA"), ...roster("BBB")];
    const [t] = resolveAiTrades(players, ctx(teams, { AAA: -4, BBB: 30 }));
    expect(t.reason).toContain("AAA Club");
    expect(t.reason).toContain("BBB Club");
    expect(t.reason).toMatch(/\$\d/);
  });

  // The fit ranking has to do real work, not just clear a threshold. In a
  // uniform league every club scores identically and the tiebreak decides;
  // where the clubs genuinely differ, the one with the need must win.
  it("sends the player to the club that most wants him", () => {
    const teams = [
      team("AAA"),
      team("RICH", { phase: "Rebuilding" }),   // room, but stacked at every spot
      team("NEEDY", { phase: "Rebuilding" }),  // room AND thin on defence
    ];
    const players = [
      ...roster("AAA"),
      ...roster("RICH"),
      // NEEDY carries two defencemen, so a D arriving fills a real hole.
      ...roster("NEEDY").filter(p => p.position !== "D"),
      player("NEEDY-d1", "NEEDY", { position: "D", capHit: 3, ptsPace: 20 }),
      player("NEEDY-d2", "NEEDY", { position: "D", capHit: 2, ptsPace: 18 }),
    ];
    const trades = resolveAiTrades(players, ctx(teams, { AAA: -3, RICH: 30, NEEDY: 30 }));
    expect(trades).toHaveLength(1);
    const moved = players.find(p => p.id === trades[0].outPlayerId)!;
    if (moved.position === "D") expect(trades[0].toTeamId).toBe("NEEDY");
    expect(trades[0].fitScore).toBeGreaterThanOrEqual(AI_TRADE_RULES.MIN_FIT_SCORE);
  });

  it("does not turn one club into the league's waste-disposal site", () => {
    // A rebuilder with $40M would otherwise absorb every cap casualty in July.
    const sellers = ["S1", "S2", "S3", "S4"].map(id => team(id));
    const teams = [...sellers, team("DUMP", { phase: "Rebuilding" })];
    const players = teams.flatMap(t => roster(t.id));
    const caps = { S1: -4, S2: -4, S3: -4, S4: -4, DUMP: 60 };
    const trades = resolveAiTrades(players, ctx(teams, caps));
    expect(trades.filter(t => t.toTeamId === "DUMP").length)
      .toBeLessThanOrEqual(AI_TRADE_RULES.MAX_IN_PER_TEAM);
  });

  it("never trades the same player twice in one offseason", () => {
    const teams = [
      team("AAA"), team("DDD"),
      team("BBB", { phase: "Rebuilding" }), team("CCC", { phase: "Rebuilding" }),
    ];
    const players = teams.flatMap(t => roster(t.id));
    const trades = resolveAiTrades(players, ctx(teams,
      { AAA: -4, DDD: -4, BBB: 40, CCC: 40 }));
    const moved = trades.flatMap(t => [t.outPlayerId, t.inPlayerId]);
    expect(new Set(moved).size).toBe(moved.length);
  });
});

describe("applyAiTrades", () => {
  it("moves both players to their new clubs", () => {
    const players = [player("a", "AAA"), player("b", "BBB"), player("c", "CCC")];
    const moved = applyAiTrades(players, [{
      fromTeamId: "AAA", toTeamId: "BBB",
      outPlayerId: "a", outPlayerName: "Player a",
      inPlayerId: "b", inPlayerName: "Player b",
      capSaved: 2, fitScore: 60, reason: "",
    }]);
    expect(moved.find(p => p.id === "a")!.teamId).toBe("BBB");
    expect(moved.find(p => p.id === "b")!.teamId).toBe("AAA");
    expect(moved.find(p => p.id === "c")!.teamId).toBe("CCC");
  });

  it("returns the same array when there is nothing to apply", () => {
    const players = [player("a", "AAA")];
    expect(applyAiTrades(players, [])).toBe(players);
  });

  it("does not mutate the players it was given", () => {
    const players = [player("a", "AAA"), player("b", "BBB")];
    applyAiTrades(players, [{
      fromTeamId: "AAA", toTeamId: "BBB",
      outPlayerId: "a", outPlayerName: "a", inPlayerId: "b", inPlayerName: "b",
      capSaved: 1, fitScore: 60, reason: "",
    }]);
    expect(players[0].teamId).toBe("AAA");
  });

  it("keeps every player — a trade moves people, it does not delete them", () => {
    const players = [player("a", "AAA"), player("b", "BBB")];
    const moved = applyAiTrades(players, [{
      fromTeamId: "AAA", toTeamId: "BBB",
      outPlayerId: "a", outPlayerName: "a", inPlayerId: "b", inPlayerName: "b",
      capSaved: 1, fitScore: 60, reason: "",
    }]);
    expect(moved).toHaveLength(players.length);
  });
});
