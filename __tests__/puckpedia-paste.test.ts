import { describe, it, expect } from "vitest";
import {
  parsePuckPediaPaste,
  toIngestPayload,
  normaliseTeam,
  seasonFromPct,
} from "@/app/lib/puckpedia-paste";

/** One record, exactly as Sportsnet's transactions page copies out. */
const ONE = `MTL
Maksymilian Szuber
D
Maksymilian Szuber
AGE23
CAP HIT$850,000
LENGTH1 yr
TOTAL$850,000
% OF CAP0.82%
TYPERFA
CLAUSE`;

const MANY = `MTL
Maksymilian Szuber
D
Maksymilian Szuber
AGE23
CAP HIT$850,000
LENGTH1 yr
TOTAL$850,000
% OF CAP0.82%
TYPERFA
CLAUSE
JUL 31, 2026
SJSSJS
Collin Graf
F
Collin Graf
AGE23
CAP HIT$4,250,000
LENGTH3 yrs
TOTAL$12,750,000
% OF CAP4.09%
TYPERFA
CLAUSE
Details
PITPIT
Thomas Novak
F
Thomas Novak
AGE29
CAP HIT$4,650,000
LENGTH3 yrs
TOTAL$13,950,000
% OF CAP4.10%
TYPEUFA
CLAUSE
Details
JUL 30, 2026
NJDNJD
Colin White
F
Colin White
AGE29
CAP HIT$900,000
LENGTH1 yr
TOTAL$900,000
% OF CAP0.87%
TYPEUFA
CLAUSE
JUL 29, 2026
DETDET
Carter Gylander
G
Carter Gylander
AGE25
CAP HIT$850,000
LENGTH1 yr
TOTAL$850,000
% OF CAP0.82%
TYPERFA
CLAUSE
NJDNJD
Topias Vilen
D
Topias Vilen
AGE23
CAP HIT$850,000
LENGTH1 yr
TOTAL$850,000
% OF CAP0.82%
TYPERFA
CLAUSE
SJSSJS
Macklin Celebrini
F
Macklin Celebrini
AGE20
CAP HIT$18,800,000
LENGTH5 yrs
TOTAL$94,000,000
% OF CAP16.56%
TYPERFA
CLAUSE`;

describe("puckpedia-paste — the real thing", () => {
  it("reads a single record", () => {
    const { signings, skipped } = parsePuckPediaPaste(ONE);
    expect(signings).toHaveLength(1);
    expect(skipped).toEqual([]);
    expect(signings[0]).toMatchObject({
      name: "Maksymilian Szuber", team: "MTL", position: "D",
      age: 23, capHit: 850_000, years: 1, total: 850_000, type: "RFA",
    });
  });

  it("reads a whole list without dropping a line", () => {
    const { signings, skipped, needsReview } = parsePuckPediaPaste(MANY);
    expect(signings).toHaveLength(7);
    // Nothing silently swallowed — a parser that quietly discards half a paste
    // is worse than one that fails, because the operator cannot tell.
    expect(skipped).toEqual([]);
    expect(needsReview).toBe(false);
    expect(signings.map(s => s.name)).toEqual([
      "Maksymilian Szuber", "Collin Graf", "Thomas Novak",
      "Colin White", "Carter Gylander", "Topias Vilen", "Macklin Celebrini",
    ]);
  });

  it("halves the doubled team cell the copy produces", () => {
    expect(normaliseTeam("SJSSJS")).toBe("SJS");
    expect(normaliseTeam("NJDNJD")).toBe("NJD");
    expect(normaliseTeam("MTL")).toBe("MTL");
    const { signings } = parsePuckPediaPaste(MANY);
    expect(signings.map(s => s.team)).toEqual(["MTL", "SJS", "PIT", "NJD", "DET", "NJD", "SJS"]);
  });

  it("applies a date header downward, to the rows beneath it", () => {
    const { signings } = parsePuckPediaPaste(MANY);
    // Szuber sits above the first header, so his date is genuinely unknown
    // rather than inherited from a later one.
    expect(signings[0].signDate).toBeNull();
    expect(signings[1].signDate).toBe("JUL 31, 2026");
    expect(signings[3].signDate).toBe("JUL 30, 2026");
    expect(signings[6].signDate).toBe("JUL 29, 2026");
  });

  it("keeps D and G but refuses to guess what an F is", () => {
    // PuckPedia's "F" cannot be told from a centre or a winger, and guessing
    // would overwrite a position the roster already has right.
    const { signings } = parsePuckPediaPaste(MANY);
    expect(signings[0].position).toBe("D");
    expect(signings[4].position).toBe("G");
    expect(signings[1].position).toBe("");
    expect(signings[1].rawPosition).toBe("F");
  });
});

describe("puckpedia-paste — reading the season off the percentage", () => {
  it("recovers the ceiling the percentage was taken against", () => {
    expect(seasonFromPct(850_000, 0.82)).toBe("2026-27");
    expect(seasonFromPct(18_800_000, 16.56)).toBe("2027-28");
  });

  it("spots that Celebrini's deal starts after his entry-level contract", () => {
    // 16.56% of $18.8M implies a $113.5M ceiling, which is 2027-28. The list it
    // came from is dated July 2026. That gap is real information about when the
    // money starts, and it falls straight out of the arithmetic.
    const { signings } = parsePuckPediaPaste(MANY);
    const celebrini = signings.find(s => s.name === "Macklin Celebrini")!;
    expect(celebrini.impliedSeason).toBe("2027-28");
    expect(signings.find(s => s.name === "Collin Graf")!.impliedSeason).toBe("2026-27");
  });

  it("says nothing rather than guessing when no ceiling fits", () => {
    expect(seasonFromPct(5_000_000, 50)).toBeNull();
  });
});

describe("puckpedia-paste — the self-checks", () => {
  it("catches a cap hit that disagrees with the total", () => {
    const bad = ONE.replace("TOTAL$850,000", "TOTAL$3,400,000");
    const { signings, needsReview } = parsePuckPediaPaste(bad);
    expect(needsReview).toBe(true);
    expect(signings[0].warnings.join(" ")).toMatch(/total says/);
    // It still parses. A warning is for the operator to judge, not a reason to
    // throw away a row that is probably fine.
    expect(signings[0].capHit).toBe(850_000);
  });

  it("catches a percentage that matches no season", () => {
    const bad = ONE.replace("% OF CAP0.82%", "% OF CAP7.40%");
    const { signings } = parsePuckPediaPaste(bad);
    expect(signings[0].warnings.join(" ")).toMatch(/do not agree with any season/);
  });

  it("notices when the name does not appear twice", () => {
    // The duplicate name is the cheapest possible check that the field order
    // has not slipped a line.
    const bad = ONE.replace("D\nMaksymilian Szuber\nAGE23", "D\nAGE23");
    const { signings } = parsePuckPediaPaste(bad);
    expect(signings[0].warnings.join(" ")).toMatch(/did not appear twice/);
  });

  it("assumes a single year when the term is missing, and says so", () => {
    const bad = ONE.replace("LENGTH1 yr\n", "");
    const { signings } = parsePuckPediaPaste(bad);
    expect(signings[0].years).toBe(1);
    expect(signings[0].warnings.join(" ")).toMatch(/assumed 1 year/);
  });

  it("drops a record with no cap hit rather than inventing one", () => {
    const bad = ONE.replace("CAP HIT$850,000\n", "");
    const { signings, skipped } = parsePuckPediaPaste(bad);
    expect(signings).toHaveLength(0);
    expect(skipped.join(" ")).toMatch(/no cap hit/);
  });
});

describe("puckpedia-paste — handing it to the ingest endpoint", () => {
  it("converts dollars to the millions the database stores", () => {
    const { signings } = parsePuckPediaPaste(MANY);
    const payload = toIngestPayload(signings);
    expect(payload["Macklin Celebrini"].capHit).toBe(18.8);
    expect(payload["Maksymilian Szuber"].capHit).toBe(0.85);
    expect(payload["Collin Graf"].yearsRemaining).toBe(3);
  });

  it("sends a position only when it knows one", () => {
    const payload = toIngestPayload(parsePuckPediaPaste(MANY).signings);
    expect(payload["Maksymilian Szuber"].position).toBe("D");
    expect(payload["Collin Graf"].position).toBeUndefined();
  });

  it("survives an empty or junk paste without throwing", () => {
    expect(parsePuckPediaPaste("").signings).toEqual([]);
    const junk = parsePuckPediaPaste("hello\nworld\n123");
    expect(junk.signings).toEqual([]);
    expect(junk.skipped.length).toBeGreaterThan(0);
  });
});
