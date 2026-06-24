import { describe, expect, it } from "vitest";
import { parseCapWagesPlayerRow } from "../app/services/scraper";

const bradLambertRow = [
  "Lambert, Brad",
  "",
  "WPG",
  "RW, C",
  "R",
  173,
  73,
  "FIN",
  22,
  25,
  3,
  3,
  6,
  0,
  0,
  3,
  2,
  0,
  8.86667,
  8.55,
  0,
  3.75,
  11.36667,
  648,
  "RFA",
  22,
  "Kevin Cheveldayoff",
  "",
  18,
  27,
  "03-12-19",
  "Lahti, FIN",
];

const aatuRatyRow = [
  "Raty, Aatu",
  "",
  "VAN",
  "C",
  "L",
  188,
  86,
  "FIN",
  23,
  33,
  3,
  2,
  4,
  0,
  0,
  2,
  1,
  0,
  8.125,
  7.75,
  0,
  2.1,
  10.225,
  112,
  "RFA (Arb)",
  25,
  "Patrik Allvin",
  "",
  22,
  27,
  "11-14-02",
  "Oulu, FIN",
];

describe("CapWages row parser", () => {
  it("parses Lambert's compact team abbreviation, age, position, and 2027 expiry", () => {
    const parsed = parseCapWagesPlayerRow(bradLambertRow);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.reason);

    expect(parsed.name).toBe("Brad Lambert");
    expect(parsed.contractData).toMatchObject({
      capHit: 0.887,
      yearsRemaining: 1,
      expiryStatus: "RFA",
      expiryYear: 2027,
      position: "RW, C",
      teamSlug: "wpg",
      age: 22,
    });
    expect(parsed.aliases).toContain("Brad Lambert__RW, C");
    expect(parsed.aliases).toContain("Brad Lambert__wpg");
  });

  it("parses Raty without requiring accented source text", () => {
    const parsed = parseCapWagesPlayerRow(aatuRatyRow);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.reason);

    expect(parsed.name).toBe("Aatu Raty");
    expect(parsed.contractData).toMatchObject({
      capHit: 0.813,
      yearsRemaining: 1,
      expiryStatus: "RFA (Arb)",
      expiryYear: 2027,
      position: "C",
      teamSlug: "van",
      age: 23,
    });
  });

  it("surfaces the expiry year as the free-agency signal (yearsRemaining is floored)", () => {
    const ufa2026 = [...bradLambertRow];
    ufa2026[24] = "UFA";
    ufa2026[29] = 26; // expires summer 2026 → pending FA this offseason
    const parsed = parseCapWagesPlayerRow(ufa2026);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.contractData.expiryStatus).toBe("UFA");
    expect(parsed.contractData.expiryYear).toBe(2026);
    // floored to 1 by the pipeline — which is exactly why expiryYear is the FA signal
    expect(parsed.contractData.yearsRemaining).toBe(1);
  });

  it("rejects a shifted row before a non-numeric cap becomes believable data", () => {
    const shifted = [...bradLambertRow];
    shifted[18] = "RFA";
    const parsed = parseCapWagesPlayerRow(shifted);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected row reject");
    expect(parsed.reason).toContain("capRaw");
  });

  it("rejects implausible age and position fields", () => {
    const badAge = [...bradLambertRow];
    badAge[8] = 88;
    const ageResult = parseCapWagesPlayerRow(badAge);
    expect(ageResult.ok).toBe(false);
    if (ageResult.ok) throw new Error("expected age reject");
    expect(ageResult.reason).toContain("age=88");

    const badPosition = [...bradLambertRow];
    badPosition[3] = "Coach";
    const positionResult = parseCapWagesPlayerRow(badPosition);
    expect(positionResult.ok).toBe(false);
    if (positionResult.ok) throw new Error("expected position reject");
    expect(positionResult.reason).toContain("invalid position");
  });
});
