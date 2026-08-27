import { describe, expect, it } from "vitest";
import { deriveAge, estimateAgeFromDraftYear, resolvePlayerAge } from "../app/lib/player-age";

describe("deriveAge", () => {
  it("computes exact calendar age as of a given date", () => {
    expect(deriveAge("2004-06-21", new Date("2026-08-27"))).toBe(22);
    expect(deriveAge("2003-01-15", new Date("2026-08-27"))).toBe(23);
  });

  it("has not yet had this year's birthday", () => {
    expect(deriveAge("2004-12-25", new Date("2026-08-27"))).toBe(21);
  });

  it("counts a birthday today as already turned", () => {
    expect(deriveAge("2004-08-27", new Date("2026-08-27"))).toBe(22);
  });

  it("returns null for missing or unparsable input", () => {
    expect(deriveAge(null)).toBeNull();
    expect(deriveAge(undefined)).toBeNull();
    expect(deriveAge("not-a-date")).toBeNull();
  });
});

describe("estimateAgeFromDraftYear", () => {
  it("is 18 in the draft year and climbs one per elapsed season", () => {
    expect(estimateAgeFromDraftYear(2026, 2026)).toBe(18);
    expect(estimateAgeFromDraftYear(2023, 2026)).toBe(21);
  });

  it("never estimates a future draft as already older", () => {
    expect(estimateAgeFromDraftYear(2027, 2026)).toBe(18);
  });

  it("returns null with no draft year", () => {
    expect(estimateAgeFromDraftYear(null, 2026)).toBeNull();
  });
});

describe("resolvePlayerAge", () => {
  const seasonStartYear = 2026;

  it("prefers a birthdate over a stale stored age (the DATA-01 bug)", () => {
    // A player whose static `age` column was written years ago and never
    // revisited would otherwise still read 18 today.
    expect(
      resolvePlayerAge({ birthDate: "2004-06-21", storedAge: 18, draftYear: 2022, seasonStartYear }),
    ).toBe(22);
  });

  it("falls back to a stored age when no birthdate is known", () => {
    expect(resolvePlayerAge({ storedAge: 29, draftYear: 2015, seasonStartYear })).toBe(29);
  });

  it("falls back to a draft-year estimate when neither birthdate nor stored age exist", () => {
    expect(resolvePlayerAge({ draftYear: 2023, seasonStartYear })).toBe(21);
  });

  it("never fabricates an age when nothing anchors one", () => {
    expect(resolvePlayerAge({ seasonStartYear })).toBeNull();
  });
});
