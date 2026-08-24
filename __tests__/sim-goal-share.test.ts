import { describe, expect, it } from "vitest";
import { simGoalShare, type SimGoalShareSignals } from "../app/lib/sim-goal-share";

const forward = (overrides: Partial<SimGoalShareSignals> = {}) => simGoalShare({
  position: "W",
  anchorGoalShare: 0.36,
  line: 2,
  powerPlayUnit: null,
  avgTOI: 15,
  ...overrides,
});

describe("sim goal-share model (SIM-P1-6)", () => {
  it("tilts validated finishing roles toward goals and distributor roles toward assists", () => {
    expect(forward({ role: "VOLUME_SHOOTER" }))
      .toBeGreaterThan(forward({ role: "HIGH_DANGER_DISTRIBUTOR" }));
  });

  it("uses line and power-play deployment in the goal-vs-assist split", () => {
    expect(forward({ line: 1 })).toBeGreaterThan(forward({ line: 4 }));
    expect(forward({ powerPlayUnit: 1 })).toBeGreaterThan(forward({ powerPlayUnit: 2 }));
    expect(forward({ powerPlayUnit: 2 })).toBeGreaterThan(forward({ powerPlayUnit: null }));
  });

  it("uses prior TOI while treating a missing sample as neutral", () => {
    expect(forward({ avgTOI: 20 })).toBeLessThan(forward({ avgTOI: 10 }));
    expect(forward({ avgTOI: 0 })).toBe(forward({ avgTOI: null }));
    expect(forward({ avgTOI: null })).toBe(forward({ avgTOI: 15 }));
  });

  it("keeps the calibrated split inside positional bounds", () => {
    expect(forward({ anchorGoalShare: 10, line: 1, powerPlayUnit: 1, avgTOI: 1 }))
      .toBeLessThanOrEqual(0.55);
    expect(simGoalShare({ position: "D", anchorGoalShare: -10, line: 3, avgTOI: 30 }))
      .toBeGreaterThanOrEqual(0.12);
  });
});
