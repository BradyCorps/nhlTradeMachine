import { describe, it, expect } from "vitest";
import {
  navStagesForDisplay,
  reconcileStages,
  stageDrift,
  stagesReconcile,
  type NavStage,
} from "@/app/lib/nav-breakdown";

const stage = (key: string, value: number): NavStage =>
  ({ key, label: key.toUpperCase(), value, kind: "component" });

const sum = (rows: NavStage[]) => rows.reduce((s, r) => s + r.value, 0);

describe("nav-breakdown — the identity", () => {
  it("makes rounded rows add up to the rounded headline", () => {
    const stages = [stage("off", 120.4), stage("def", 33.3), stage("cap", -41.9)];
    const total = 111.8;
    const rows = reconcileStages(stages, total);
    expect(sum(rows)).toBe(Math.round(total));
    expect(stagesReconcile(rows, total)).toBe(true);
  });

  it("holds for adversarial rounding — three halves under a rounded total", () => {
    // Naive independent rounding gives 1+1+1 = 3 against a headline of 2.
    const rows = reconcileStages([stage("a", 0.5), stage("b", 0.5), stage("c", 0.5)], 1.5);
    expect(sum(rows)).toBe(2);
  });

  it("keeps every row within one of its true value", () => {
    const stages = [stage("a", 10.6), stage("b", 20.6), stage("c", 30.6), stage("d", -5.4)];
    const rows = reconcileStages(stages, 56.4);
    rows.forEach((r, i) => expect(Math.abs(r.value - stages[i].value), r.key).toBeLessThan(1));
    expect(sum(rows)).toBe(56);
  });

  it("holds across a sweep of random decompositions", () => {
    // The property, not a handful of cases: whatever the parts, the printed
    // rows must account for the printed headline.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let trial = 0; trial < 400; trial++) {
      const n = 1 + Math.floor(rand() * 8);
      const stages = Array.from({ length: n }, (_, i) => stage(`s${i}`, (rand() - 0.4) * 300));
      const total = sum(stages);
      const rows = reconcileStages(stages, total);
      expect(sum(rows), `trial ${trial}`).toBe(Math.round(total));
    }
  });

  it("handles negative totals and all-negative parts", () => {
    const rows = reconcileStages([stage("cap", -30.5), stage("age", -12.2)], -42.7);
    expect(sum(rows)).toBe(-43);
  });

  it("reconciles a single stage to itself", () => {
    expect(reconcileStages([stage("pick", 47.6)], 47.6)).toEqual([
      { key: "pick", label: "PICK", value: 48, kind: "component" },
    ]);
  });
});

describe("nav-breakdown — degenerate input", () => {
  it("draws nothing when there is nothing to draw", () => {
    expect(reconcileStages([], 0)).toEqual([]);
    expect(navStagesForDisplay(undefined, 0)).toEqual([]);
  });

  it("refuses to print an empty panel under a real headline", () => {
    // Better to say the whole number is unexplained than to imply it decomposed.
    const rows = reconcileStages([], 214);
    expect(rows).toHaveLength(1);
    expect(sum(rows)).toBe(214);
  });

  it("still adds up when the engine hands over stages that do not explain the total", () => {
    // The display has no honest alternative to adding up. The test below is
    // what catches an engine in this state.
    const rows = reconcileStages([stage("off", 10), stage("cap", 5)], 900);
    expect(sum(rows)).toBe(900);
  });

  it("measures how far the parts are from the whole", () => {
    expect(stageDrift([stage("off", 10), stage("cap", 5)], 15)).toBe(0);
    expect(stageDrift([stage("off", 10)], 900)).toBe(890);
    expect(stageDrift([], 0)).toBe(0);
  });
});

describe("nav-breakdown — what gets drawn", () => {
  it("drops rows that rounded away, without breaking the identity", () => {
    const stages = [stage("off", 120), stage("grav", 0.2), stage("cap", -20)];
    const rows = navStagesForDisplay(stages, 100.2);
    expect(rows.map(r => r.key)).toEqual(["off", "cap"]);
    expect(sum(rows)).toBe(100);
  });

  it("keeps a row that is small but not zero", () => {
    const rows = navStagesForDisplay([stage("off", 100), stage("grav", 1)], 101);
    expect(rows.map(r => r.key)).toEqual(["off", "grav"]);
  });

  it("preserves order — a waterfall read out of sequence is not a waterfall", () => {
    const stages = [stage("off", 50), stage("def", 20), stage("cap", -10), stage("floor", 5)];
    expect(navStagesForDisplay(stages, 65).map(r => r.key)).toEqual(["off", "def", "cap", "floor"]);
  });

  it("carries the kind through, so measurement and judgement stay separable", () => {
    const stages: NavStage[] = [
      { key: "off", label: "OFF", value: 100, kind: "component" },
      { key: "dev", label: "Development risk", value: -18, kind: "adjustment" },
    ];
    const rows = navStagesForDisplay(stages, 82);
    expect(rows.map(r => r.kind)).toEqual(["component", "adjustment"]);
  });
});
