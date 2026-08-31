import { describe, expect, it } from "vitest";
import {
  buildTeamContentionSnapshot,
  buildTeamContentionSnapshotId,
  teamSnapshotDate,
  type TeamContentionInput,
} from "@/app/lib/team-contention-snapshot";

const wpg = (overrides: Partial<TeamContentionInput> = {}): TeamContentionInput => ({
  teamId: "WPG",
  phase: "Bubble",
  rosterWindow: "Contender",
  contention: {
    present: 7.2, future: 6.1, quadrant: "WIN_NOW",
    presentLabel: "Contender", futureLabel: "Strong",
  },
  capSpace: 4.5,
  capBreakdown: null,
  ...overrides,
});

describe("DATA-03: team contention snapshot", () => {
  it("is deterministic — identical inputs on the same day produce the identical id (two independent surfaces)", () => {
    const surfaceA = buildTeamContentionSnapshot(wpg(), "2026-08-25");
    const surfaceB = buildTeamContentionSnapshot(wpg(), "2026-08-25");
    expect(surfaceA.snapshotId).toBeTruthy();
    expect(surfaceA.snapshotId).toBe(surfaceB.snapshotId);
    expect(surfaceA).toEqual(surfaceB);
  });

  it("changes id when any input changes — never a stale id on a different read", () => {
    const base = buildTeamContentionSnapshot(wpg(), "2026-08-25");
    const changed = buildTeamContentionSnapshot(wpg({ capSpace: 5.0 }), "2026-08-25");
    expect(changed.snapshotId).not.toBe(base.snapshotId);
  });

  it("changes id on a new day, not on a re-request the same day", () => {
    const day1 = buildTeamContentionSnapshot(wpg(), "2026-08-25");
    const day2 = buildTeamContentionSnapshot(wpg(), "2026-08-26");
    expect(day2.snapshotId).not.toBe(day1.snapshotId);
  });

  it("changes id across a model version bump", () => {
    const v1 = buildTeamContentionSnapshotId(wpg(), "2026-08-25", "X-NAV 4.2");
    const v2 = buildTeamContentionSnapshotId(wpg(), "2026-08-25", "X-NAV 4.3");
    expect(v1).not.toBe(v2);
  });

  it("names the exact team+day it was struck for so the id can never be reattached elsewhere", () => {
    const id = buildTeamContentionSnapshotId(wpg(), "2026-08-25");
    expect(id.startsWith("WPG-2026-08-25-")).toBe(true);
  });

  it("declares the calendar day at whole-day granularity", () => {
    expect(teamSnapshotDate(new Date("2026-08-27T23:59:00Z"))).toBe("2026-08-27");
  });

  it("computes window via the same teamWindow() reconciler everything else reads — never a second opinion", () => {
    const snap = buildTeamContentionSnapshot(wpg({ phase: "Retooling", rosterWindow: "Contender" }));
    expect(snap.window).toBe("Contender");
  });

  it("falls back to phase in the window field when no live roster window exists", () => {
    const snap = buildTeamContentionSnapshot(wpg({ phase: "Retooling", rosterWindow: null }));
    expect(snap.window).toBe("Retooling");
  });

  it("never fabricates a contention score or cap breakdown that isn't there", () => {
    const snap = buildTeamContentionSnapshot(wpg({ contention: null, capBreakdown: null }));
    expect(snap.contention).toBeNull();
    expect(snap.capBreakdown).toBeNull();
  });

  describe("coverage", () => {
    it("classifies full when both a live contention read and a cap breakdown exist", () => {
      const snap = buildTeamContentionSnapshot(wpg({
        capBreakdown: { ltirUsed: 0, deadCap: 0, totalCapHit: 82, bonuses: 0 },
      }));
      expect(snap.coverage).toBe("full");
    });

    it("classifies partial when only one of the two exists", () => {
      const contentionOnly = buildTeamContentionSnapshot(wpg({ capBreakdown: null }));
      expect(contentionOnly.coverage).toBe("partial");

      const capOnly = buildTeamContentionSnapshot(wpg({
        contention: null,
        capBreakdown: { ltirUsed: 0, deadCap: 0, totalCapHit: 82, bonuses: 0 },
      }));
      expect(capOnly.coverage).toBe("partial");
    });

    it("classifies phase-only when the roster was too data-thin to score and no cap breakdown exists — the team analogue of contract-only", () => {
      const snap = buildTeamContentionSnapshot(wpg({ contention: null, capBreakdown: null }));
      expect(snap.coverage).toBe("phase-only");
    });
  });
});
