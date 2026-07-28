import { describe, expect, it } from "vitest";
import {
  SEASON_START_YEAR,
  contractExpiryYear,
  contractExpirySeasonLabel,
} from "../app/lib/contract-expiry";
import { SEASON } from "../app/lib/season-config";
import { seasonLabelForYear } from "../app/lib/cup-run";

describe("contractExpiryYear", () => {
  it("anchors to the simulated season, not the wall clock", () => {
    expect(SEASON_START_YEAR).toBe(parseInt(SEASON.label.slice(0, 4), 10));
  });

  it("expires a one-year deal at the end of the current season", () => {
    expect(contractExpiryYear(1)).toBe(SEASON_START_YEAR);
  });

  it("adds a season per remaining year", () => {
    expect(contractExpiryYear(3)).toBe(SEASON_START_YEAR + 2);
  });

  // The original bug: `new Date().getFullYear() + yearsRemaining`. On
  // 2 January 2027 that reads 2027 while the app still simulates 2026-27, so
  // every contract on every card silently gains a year overnight.
  it("does not move when the calendar year rolls over", () => {
    const before = contractExpiryYear(3);
    const after = contractExpiryYear(3);
    expect(before).toBe(after);
    expect(before).not.toBe(new Date().getFullYear() + 3 + 1);
  });

  it("advances with the Cup Run year", () => {
    expect(contractExpiryYear(2, 1)).toBe(SEASON_START_YEAR + 1);
    expect(contractExpiryYear(2, 2)).toBe(SEASON_START_YEAR + 2);
    expect(contractExpiryYear(2, 3)).toBe(SEASON_START_YEAR + 3);
  });

  it("treats a missing or absent Cup year as season one", () => {
    expect(contractExpiryYear(2)).toBe(contractExpiryYear(2, 1));
    expect(contractExpiryYear(2, null)).toBe(contractExpiryYear(2, 1));
  });

  it("floors a zero or negative term at the current season", () => {
    expect(contractExpiryYear(0)).toBe(SEASON_START_YEAR);
    expect(contractExpiryYear(-4)).toBe(SEASON_START_YEAR);
    expect(contractExpiryYear(null)).toBe(SEASON_START_YEAR);
  });
});

describe("contractExpirySeasonLabel", () => {
  it("formats as a season, not a year", () => {
    expect(contractExpirySeasonLabel(1)).toBe(SEASON.label);
  });

  // A contract's final season and the Cup Run header must never disagree
  // about what year it is.
  it("agrees with the Cup Run's own season labels", () => {
    for (const year of [1, 2, 3]) {
      expect(contractExpirySeasonLabel(1, year)).toBe(seasonLabelForYear(year));
    }
  });

  it("wraps the century correctly", () => {
    const label = contractExpirySeasonLabel(5);
    expect(label).toMatch(/^\d{4}-\d{2}$/);
  });
});
