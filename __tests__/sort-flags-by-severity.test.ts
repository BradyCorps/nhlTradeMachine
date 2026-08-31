import { describe, expect, it } from "vitest";
import { sortFlagsBySeverity } from "@/app/components/QuickTradeMachine";

// Live-tested Aug 31 2026 (see feature-canaries.test.ts for the full
// scenario): a real hard veto could compute correctly and still never show
// its explanation card because the verdict panel took the first four flags
// in insertion order, unsorted, and a 4-player retained package pushed four
// lower-priority notes before the HARD flag.
describe("sortFlagsBySeverity", () => {
  it("puts a HARD flag ahead of SOFT and INFO flags regardless of insertion order", () => {
    const flags = [
      { severity: "SOFT", headline: "overpaying" },
      { severity: "INFO", headline: "franchise 1" },
      { severity: "INFO", headline: "franchise 2" },
      { severity: "INFO", headline: "franchise 3" },
      { severity: "HARD", headline: "Retention Slots Full — Dallas Stars" },
    ];
    const sorted = sortFlagsBySeverity(flags);
    expect(sorted[0].severity).toBe("HARD");
    // The first four (what the verdict panel actually renders) now include
    // the hard veto instead of dropping it for a fourth INFO note.
    expect(sorted.slice(0, 4).some((f) => f.severity === "HARD")).toBe(true);
  });

  it("is a stable sort — same-severity flags keep their original order", () => {
    const flags = [
      { severity: "INFO", headline: "first" },
      { severity: "INFO", headline: "second" },
      { severity: "INFO", headline: "third" },
    ];
    expect(sortFlagsBySeverity(flags).map((f) => f.headline)).toEqual(["first", "second", "third"]);
  });

  it("does not mutate the input array", () => {
    const flags = [{ severity: "INFO", headline: "a" }, { severity: "HARD", headline: "b" }];
    const original = [...flags];
    sortFlagsBySeverity(flags);
    expect(flags).toEqual(original);
  });

  it("ranks in HARD, SOFT, WARN, INFO order", () => {
    const flags = [
      { severity: "INFO", headline: "i" },
      { severity: "WARN", headline: "w" },
      { severity: "SOFT", headline: "s" },
      { severity: "HARD", headline: "h" },
    ];
    expect(sortFlagsBySeverity(flags).map((f) => f.severity)).toEqual(["HARD", "SOFT", "WARN", "INFO"]);
  });

  it("pushes an unrecognized severity to the back rather than the front", () => {
    const flags = [
      { severity: "WEIRD", headline: "unknown" },
      { severity: "INFO", headline: "known" },
    ];
    expect(sortFlagsBySeverity(flags).map((f) => f.headline)).toEqual(["known", "unknown"]);
  });
});
