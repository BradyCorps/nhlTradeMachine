import { describe, expect, it } from "vitest";
import { burstProfile } from "../app/lib/burst-channel";

describe("burstProfile", () => {
  it("rewards elite explosiveness with a rush lift and a fatter upside tail", () => {
    const elite = burstProfile({ position: "C", edgeBurstsOver20: 45, edgeSpeedMaxMph: 23 });
    expect(elite.rushLift).toBeGreaterThan(1);
    expect(elite.varianceKick).toBeGreaterThan(0);
  });

  it("scales down for merely strong explosiveness", () => {
    const strong = burstProfile({ position: "W", edgeBurstsOver20: 28, edgeSpeedMaxMph: 21.2 });
    const elite = burstProfile({ position: "W", edgeBurstsOver20: 45, edgeSpeedMaxMph: 23 });
    expect(strong.rushLift).toBeGreaterThan(1);
    expect(strong.rushLift).toBeLessThan(elite.rushLift);
    expect(strong.varianceKick).toBeLessThan(elite.varianceKick);
  });

  it("applies to explosive defensemen too (not age- or position-gated for skaters)", () => {
    const rushD = burstProfile({ position: "D", edgeBurstsOver20: 42 });
    expect(rushD.rushLift).toBeGreaterThan(1);
  });

  it("is a strict no-op with no EDGE sample — explosiveness is never invented", () => {
    const noSample = burstProfile({ position: "C" });
    expect(noSample).toEqual({ rushLift: 1, varianceKick: 0 });
  });

  it("never touches goalies", () => {
    const g = burstProfile({ position: "G", edgeBurstsOver20: 50, edgeSpeedMaxMph: 24 });
    expect(g).toEqual({ rushLift: 1, varianceKick: 0 });
  });

  it("cruiser-speed skaters get nothing even with a sample", () => {
    const cruiser = burstProfile({ position: "W", edgeBurstsOver20: 8, edgeSpeedMaxMph: 19 });
    expect(cruiser).toEqual({ rushLift: 1, varianceKick: 0 });
  });
});
