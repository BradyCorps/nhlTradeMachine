// ── D1 — CSV trade ingestion ─────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  parseTradeCsv,
  parsePickToken,
  groupTradeRows,
  resolveTrades,
  type ResolveContext,
} from "@/app/lib/trade-csv";

const HEADER = "date,from,to,asset,retained,conditions";

const ctx = (players: Array<Record<string, any>> = []): ResolveContext => ({
  players,
  teamIds: new Set(["WPG", "CGY", "SJS", "TOR"]),
  firstTradablePickYear: 2027,
});

const skater = (name: string, teamId: string, over: Record<string, any> = {}) => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name, teamId, position: "C", age: 27, capHit: 5, yearsRemaining: 2, games: 70,
  ...over,
});

describe("parseTradeCsv", () => {
  it("parses valid rows and normalizes team ids + retention", () => {
    const { rows, issues } = parseTradeCsv([
      HEADER,
      "2026-06-28,wpg,cgy,Nikolaj Ehlers,25%,",
      "2026-06-28,CGY,WPG,2027 1st,,",
    ].join("\n"));
    expect(issues).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0].from).toBe("WPG");
    expect(rows[0].retainedPct).toBeCloseTo(0.25);
    expect(rows[1].retainedPct).toBe(0);
  });

  it("rejects a missing/incorrect header outright", () => {
    const { rows, issues } = parseTradeCsv("player,team\nfoo,bar");
    expect(rows).toHaveLength(0);
    expect(issues[0].message).toContain("Header must be");
  });

  it("reports per-line issues without dropping the good rows", () => {
    const { rows, issues } = parseTradeCsv([
      HEADER,
      "06/28/2026,WPG,CGY,Bad Date Guy,,",   // bad date
      "2026-06-28,WPG,WPG,Self Trade,,",     // same team
      "2026-06-28,WPG,CGY,Good Guy,80%,",    // retention over cap
      "2026-06-28,WPG,CGY,Kept Guy,10%,",    // valid
    ].join("\n"));
    expect(rows.map(r => r.asset)).toEqual(["Kept Guy"]);
    expect(issues).toHaveLength(3);
  });

  it("handles quoted fields with commas", () => {
    const { rows, issues } = parseTradeCsv([
      HEADER,
      '2026-06-28,WPG,CGY,2027 1st,,"top-10 protected, else 2028"',
    ].join("\n"));
    expect(issues).toHaveLength(0);
    expect(rows[0].conditions).toBe("top-10 protected, else 2028");
  });
});

describe("parsePickToken", () => {
  it("reads the common pick spellings", () => {
    expect(parsePickToken("2027 1st")).toEqual({ year: 2027, round: 1, viaTeamId: null });
    expect(parsePickToken("2028 3rd round")).toEqual({ year: 2028, round: 3, viaTeamId: null });
    expect(parsePickToken("2029 R2")).toEqual({ year: 2029, round: 2, viaTeamId: null });
    expect(parsePickToken("2027 round 4")).toEqual({ year: 2027, round: 4, viaTeamId: null });
    expect(parsePickToken("2027 1st Round Pick")).toEqual({ year: 2027, round: 1, viaTeamId: null });
  });

  it("reads the via clause for another club's pick", () => {
    expect(parsePickToken("2028 3rd (via SJS)")).toEqual({ year: 2028, round: 3, viaTeamId: "SJS" });
    expect(parsePickToken("2028 3rd via sjs")).toEqual({ year: 2028, round: 3, viaTeamId: "SJS" });
  });

  it("returns null for player names — they are not picks", () => {
    expect(parsePickToken("Nikolaj Ehlers")).toBeNull();
    expect(parsePickToken("2027 8th")).toBeNull(); // no 8th round
  });
});

describe("groupTradeRows", () => {
  it("merges rows sharing a date + team pair into one trade, both directions", () => {
    const { rows } = parseTradeCsv([
      HEADER,
      "2026-06-28,WPG,CGY,Player A,,",
      "2026-06-28,CGY,WPG,Player B,,",
      "2026-07-01,WPG,TOR,Player C,,",
      "2026-07-01,TOR,WPG,Player D,,",
    ].join("\n"));
    const { trades, issues } = groupTradeRows(rows);
    expect(issues).toHaveLength(0);
    expect(trades).toHaveLength(2);
    expect(trades[0].rows).toHaveLength(2);
  });

  it("flags one-way trades", () => {
    const { rows } = parseTradeCsv([HEADER, "2026-06-28,WPG,CGY,Player A,,"].join("\n"));
    const { issues } = groupTradeRows(rows);
    expect(issues[0].message).toContain("one-way");
  });
});

describe("resolveTrades", () => {
  const league = [
    skater("Nikolaj Ehlers", "WPG"),
    skater("Yegor Sharangovich", "CGY"),
    skater("Stale Roster Guy", "TOR"),
  ];

  const resolve = (csv: string[]) => {
    const { rows } = parseTradeCsv([HEADER, ...csv].join("\n"));
    const { trades } = groupTradeRows(rows);
    return resolveTrades(trades, ctx(league));
  };

  it("resolves a full player+pick trade and produces the pick transfer", () => {
    const [t] = resolve([
      "2026-06-28,WPG,CGY,Nikolaj Ehlers,25%,",
      "2026-06-28,CGY,WPG,Yegor Sharangovich,,",
      "2026-06-28,CGY,WPG,2027 1st,,",
    ]);
    expect(t.errors).toHaveLength(0);
    // CGY < WPG alphabetically → teamA = CGY
    expect(t.teamA).toBe("CGY");
    expect(t.sideB.map(a => a.kind)).toEqual(["player"]);
    expect(t.sideA.map(a => a.kind)).toEqual(["player", "pick"]);
    expect((t.sideB[0].asset as any).retainedPct).toBeCloseTo(0.25);
    expect(t.pickTransfers).toEqual([{
      pickId: "pick-CGY-2027-1",
      originalOwnerId: "CGY",
      currentOwnerId: "WPG",
      round: 1, year: 2027, conditions: null,
    }]);
  });

  it("a via pick keeps its original owner in the pick id", () => {
    const [t] = resolve([
      "2026-06-28,WPG,CGY,Nikolaj Ehlers,,",
      "2026-06-28,CGY,WPG,2028 3rd (via SJS),,",
    ]);
    expect(t.errors).toHaveLength(0);
    expect(t.pickTransfers[0].pickId).toBe("pick-SJS-2028-3");
    expect(t.pickTransfers[0].originalOwnerId).toBe("SJS");
    expect(t.pickTransfers[0].currentOwnerId).toBe("WPG");
  });

  it("rejects picks from drafts that already happened", () => {
    const [t] = resolve([
      "2026-06-28,WPG,CGY,Nikolaj Ehlers,,",
      "2026-06-28,CGY,WPG,2026 1st,,",
    ]);
    expect(t.errors.some(e => e.includes("already happened"))).toBe(true);
  });

  it("errors on unknown players, warns (but ingests) on roster-lag team mismatch", () => {
    const [t] = resolve([
      "2026-06-28,WPG,CGY,Made Up Player,,",
      "2026-06-28,WPG,CGY,Stale Roster Guy,,",   // listed on TOR in our data
      "2026-06-28,CGY,WPG,Yegor Sharangovich,,",
    ]);
    expect(t.errors.some(e => e.includes('"Made Up Player" not found'))).toBe(true);
    expect(t.warnings.some(w => w.includes("listed on TOR"))).toBe(true);
    // The mismatched player still resolved onto the sending side.
    expect(t.sideB.some(a => (a.asset as any).name === "Stale Roster Guy")).toBe(true);
  });

  it("matches player names diacritics-insensitively", () => {
    const withAccents = [skater("Viggo Björck", "WPG"), skater("Yegor Sharangovich", "CGY")];
    const { rows } = parseTradeCsv([
      HEADER,
      "2026-06-28,WPG,CGY,Viggo Bjorck,,",
      "2026-06-28,CGY,WPG,Yegor Sharangovich,,",
    ].join("\n"));
    const { trades } = groupTradeRows(rows);
    const [t] = resolveTrades(trades, ctx(withAccents));
    expect(t.errors).toHaveLength(0);
    expect(t.sideB.some(a => (a.asset as any).name === "Viggo Björck")).toBe(true);
  });
});
