import { describe, expect, it } from "vitest";
import {
  AUDIT_BUDGET,
  TARGET_PARTNERS,
  bestPerTeam,
  compareCandidates,
  planAuditOrder,
  stopAfterWave,
  summariseAudit,
  type PlannedCandidate,
} from "../app/lib/proposal-plan";

const c = (
  teamId: string, packageIndex: number, fitScore: number, standing = 10,
): PlannedCandidate => ({ teamId, teamName: `${teamId} Club`, standing, fitScore, packageIndex });

describe("compareCandidates", () => {
  it("puts the better fit first", () => {
    expect(compareCandidates(c("A", 0, 80), c("B", 0, 40))).toBeLessThan(0);
  });

  // The defect: every package from one club carries the SAME fitScore, because
  // fit is computed per team and copied onto each package. With nothing else to
  // compare, the winner was whichever audit resolved first.
  it("separates two packages from the same club", () => {
    expect(compareCandidates(c("A", 0, 60), c("A", 1, 60))).toBeLessThan(0);
  });

  it("is a total order — no two distinct candidates compare equal", () => {
    const all = [
      c("A", 0, 60), c("A", 1, 60), c("B", 0, 60, 3), c("B", 1, 60, 3),
      c("C", 0, 60, 3), c("D", 0, 80),
    ];
    for (const x of all) {
      for (const y of all) {
        if (x === y) continue;
        expect(compareCandidates(x, y), `${x.teamId}#${x.packageIndex} vs ${y.teamId}#${y.packageIndex}`)
          .not.toBe(0);
      }
    }
  });

  it("breaks a true tie by standing, then name", () => {
    expect(compareCandidates(c("A", 0, 60, 20), c("B", 0, 60, 2))).toBeGreaterThan(0);
    expect(compareCandidates(c("A", 0, 60, 5), c("B", 0, 60, 5))).toBeLessThan(0);
  });
});

describe("planAuditOrder", () => {
  it("audits every club's preferred package before any club's second", () => {
    // Sorting by fit alone let one high-fit club spend four slots of the budget
    // while clubs further down were never contacted at all.
    const candidates = [
      c("HIGH", 0, 90), c("HIGH", 1, 90), c("HIGH", 2, 90), c("HIGH", 3, 90),
      c("MID", 0, 50), c("LOW", 0, 20),
    ];
    const order = planAuditOrder(candidates).map(x => `${x.teamId}#${x.packageIndex}`);
    expect(order.slice(0, 3)).toEqual(["HIGH#0", "MID#0", "LOW#0"]);
  });

  it("still leads with the best fit within a round", () => {
    const order = planAuditOrder([c("LOW", 0, 20), c("HIGH", 0, 90), c("MID", 0, 50)]);
    expect(order.map(x => x.teamId)).toEqual(["HIGH", "MID", "LOW"]);
  });

  it("is stable across shuffles of the same input", () => {
    const base = [c("A", 0, 60), c("B", 1, 60, 4), c("C", 0, 60, 4), c("A", 1, 60), c("D", 0, 75)];
    const key = (xs: PlannedCandidate[]) => xs.map(x => `${x.teamId}#${x.packageIndex}`).join(",");
    const first = key(planAuditOrder(base));
    for (const shuffled of [[...base].reverse(), [base[2], base[0], base[4], base[1], base[3]]]) {
      expect(key(planAuditOrder(shuffled))).toBe(first);
    }
  });

  it("respects the budget", () => {
    const many = Array.from({ length: 200 }, (_, i) => c(`T${i}`, 0, 50));
    expect(planAuditOrder(many)).toHaveLength(AUDIT_BUDGET);
    expect(planAuditOrder(many, 5)).toHaveLength(5);
  });

  it("does not mutate the caller's array", () => {
    const input = [c("B", 0, 10), c("A", 0, 90)];
    const before = input.map(x => x.teamId);
    planAuditOrder(input);
    expect(input.map(x => x.teamId)).toEqual(before);
  });
});

describe("bestPerTeam", () => {
  it("keeps one file per club", () => {
    const kept = bestPerTeam([c("A", 1, 60), c("A", 0, 60), c("B", 0, 40)]);
    expect(kept.map(x => x.teamId)).toEqual(["A", "B"]);
  });

  // The whole point: the survivor must not depend on arrival order.
  it("keeps the same package whatever order the audits came back in", () => {
    const packages = [c("A", 0, 60), c("A", 1, 60), c("A", 2, 60)];
    const orders = [
      packages,
      [...packages].reverse(),
      [packages[1], packages[2], packages[0]],
      [packages[2], packages[0], packages[1]],
    ];
    for (const order of orders) {
      expect(bestPerTeam(order)[0].packageIndex).toBe(0);
    }
  });

  it("prefers the better package index even when it arrived last", () => {
    expect(bestPerTeam([c("A", 3, 60), c("A", 2, 60)])[0].packageIndex).toBe(2);
  });

  it("returns clubs in ranked order", () => {
    const kept = bestPerTeam([c("LOW", 0, 20), c("HIGH", 0, 90), c("MID", 0, 50)]);
    expect(kept.map(x => x.teamId)).toEqual(["HIGH", "MID", "LOW"]);
  });

  it("handles an empty list", () => {
    expect(bestPerTeam([])).toEqual([]);
  });
});

describe("stopAfterWave", () => {
  it("stops once enough clubs have a viable offer", () => {
    expect(stopAfterWave(TARGET_PARTNERS, 12, 36)).toBe(true);
  });

  it("keeps going while partners are thin", () => {
    expect(stopAfterWave(TARGET_PARTNERS - 1, 12, 36)).toBe(false);
    expect(stopAfterWave(0, 6, 36)).toBe(false);
  });

  it("stops when the list is exhausted", () => {
    expect(stopAfterWave(0, 36, 36)).toBe(true);
  });

  it("never asks for more audits than exist", () => {
    expect(stopAfterWave(1, 40, 36)).toBe(true);
  });
});

describe("summariseAudit", () => {
  it("reports partners when any package passed", () => {
    expect(summariseAudit({ candidates: 10, audited: 10, viable: 2, failed: 3 }).kind).toBe("PARTNERS");
  });

  it("says nothing was viable when every check answered honestly", () => {
    const out = summariseAudit({ candidates: 10, audited: 10, viable: 0, failed: 0 });
    expect(out).toEqual({ kind: "NONE_VIABLE", audited: 10 });
  });

  // The reported defect: a dead network produced the confident message
  // "No realistic trade partners found."
  it("refuses to claim no partners when checks did not return", () => {
    const out = summariseAudit({ candidates: 10, audited: 10, viable: 0, failed: 10 });
    expect(out.kind).toBe("INCOMPLETE");
    if (out.kind === "INCOMPLETE") {
      expect(out.failed).toBe(10);
      expect(out.audited).toBe(10);
    }
  });

  it("treats even one unanswered check as not knowing", () => {
    expect(summariseAudit({ candidates: 10, audited: 10, viable: 0, failed: 1 }).kind).toBe("INCOMPLETE");
  });

  it("distinguishes an empty pre-screen from a completed search", () => {
    // Nothing survived pre-screening, so no audit ran and no network was used.
    expect(summariseAudit({ candidates: 0, audited: 0, viable: 0, failed: 0 }))
      .toEqual({ kind: "NO_CANDIDATES" });
  });
});
