import { describe, expect, it } from "vitest";
import { calculateAssetNAV, toAssetInput, type AssetNavSource } from "@/app/lib/asset-nav";
import { stageDrift } from "@/app/lib/nav-breakdown";
import {
  buildValuationSnapshot,
  buildValuationSnapshotId,
  snapshotDate,
} from "@/app/lib/valuation-snapshot";
import { calcSkaterNAV, type AssetInput } from "@/app/lib/xnav-engine";

const mcdavid = (overrides: Partial<AssetNavSource> = {}): AssetNavSource => ({
  id: "mcdavid",
  name: "Connor McDavid",
  position: "C",
  age: 29,
  games: 60,
  ptsPace: 130,
  xGPace: 40,
  defRate: 0.4,
  avgTOI: 21,
  capHit: 12.5,
  yearsRemaining: 2,
  hasLiveStats: true,
  ...overrides,
});

describe("DATA-02: valuation snapshot", () => {
  it("is deterministic — identical inputs on the same day produce the identical id (two independent surfaces)", () => {
    const surfaceA = calculateAssetNAV(mcdavid(), 104, "2026-08-25");
    const surfaceB = calculateAssetNAV(mcdavid(), 104, "2026-08-25");
    expect(surfaceA.snapshot?.snapshotId).toBeTruthy();
    expect(surfaceA.snapshot?.snapshotId).toBe(surfaceB.snapshot?.snapshotId);
    expect(surfaceA.snapshot).toEqual(surfaceB.snapshot);
  });

  it("changes id when any engine input changes — never a stale id on a different valuation", () => {
    const base = calculateAssetNAV(mcdavid(), 104, "2026-08-25");
    const richer = calculateAssetNAV(mcdavid({ capHit: 13 }), 104, "2026-08-25");
    expect(richer.snapshot?.snapshotId).not.toBe(base.snapshot?.snapshotId);
  });

  it("changes id on a new day, not on a re-request the same day", () => {
    const day1 = calculateAssetNAV(mcdavid(), 104, "2026-08-25");
    const day2 = calculateAssetNAV(mcdavid(), 104, "2026-08-26");
    expect(day2.snapshot?.snapshotId).not.toBe(day1.snapshot?.snapshotId);
  });

  it("changes id across a model version bump", () => {
    const input = toAssetInput(mcdavid(), 104);
    const result = calcSkaterNAV(input);
    const v1 = buildValuationSnapshot(input, result, "2026-08-25", "X-NAV 4.2");
    const v2 = buildValuationSnapshot(input, result, "2026-08-25", "X-NAV 4.3");
    expect(v1.snapshotId).not.toBe(v2.snapshotId);
  });

  it("names the exact asset+day it was struck for so the id can never be reattached elsewhere", () => {
    const id = buildValuationSnapshotId(toAssetInput(mcdavid(), 104), "2026-08-25");
    expect(id.startsWith("mcdavid-2026-08-25-")).toBe(true);
  });

  it("declares the calendar day at whole-day granularity", () => {
    expect(snapshotDate(new Date("2026-08-27T23:59:00Z"))).toBe("2026-08-27");
  });

  it("components sum to the total (the accounting identity DATA-02 requires)", () => {
    const result = calculateAssetNAV(mcdavid(), 104, "2026-08-25");
    const snap = result.snapshot!;
    expect(Math.abs(stageDrift(snap.components ?? [], snap.total))).toBeLessThan(1);
  });

  it("computes surplus as marketValue minus the contract's cap hit", () => {
    const result = calculateAssetNAV(mcdavid(), 104, "2026-08-25");
    const snap = result.snapshot!;
    if (snap.marketValue != null) {
      expect(snap.surplus).toBeCloseTo(snap.marketValue - snap.contract.capHit, 2);
    }
  });

  it("reports uncertainty as null, not zero, when the model produced no error band", () => {
    const pick: AssetInput = {
      id: "pick", name: "2028 1st", position: "Pick", age: 0, capHit: 0, yearsRemaining: 0,
      round: 1, year: 2028, teamStanding: 16,
    };
    const snap = buildValuationSnapshot(pick, { total: 10, off: 0, def: 0, age: 0, cap: 0, upside: 0 }, "2026-08-25");
    expect(snap.uncertainty).toBeNull();
    expect(snap.marketValue).toBeNull();
    expect(snap.surplus).toBeNull();
  });

  it("classifies coverage as contract-only when the engine produced no breakdown", () => {
    const input = toAssetInput({ id: "x", name: "X", position: "C", age: 25, capHit: 1, yearsRemaining: 1 });
    const snap = buildValuationSnapshot(input, { total: 1, off: 0, def: 0, age: 0, cap: 0, upside: 0 }, "2026-08-25");
    expect(snap.coverage).toBe("contract-only");
  });

  it("classifies coverage as full once a non-contract stage fired", () => {
    const input = toAssetInput({ id: "x", name: "X", position: "C", age: 25, capHit: 1, yearsRemaining: 1 });
    const snap = buildValuationSnapshot(
      input,
      { total: 5, off: 4, def: 0, age: 0, cap: 1, upside: 0, stages: [
        { key: "off", label: "Off", value: 4, kind: "component" },
        { key: "cap", label: "Cap", value: 1, kind: "component" },
      ] },
      "2026-08-25",
    );
    expect(snap.coverage).toBe("full");
  });
});
