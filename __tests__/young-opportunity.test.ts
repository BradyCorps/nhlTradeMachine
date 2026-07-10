import { describe, it, expect } from "vitest";
import { opportunityPace, type OpportunityInput } from "../app/lib/young-opportunity";

// A talented 20-yo with a thin NHL sample (low established pace) but real
// prospect/pedigree signal — the Björck case.
const bjorck = (over: Partial<OpportunityInput> = {}): OpportunityInput => ({
  age: 20, priorGames: 20, stablePace: 16, prospectPace: 55, draftOverall: 16,
  isProspectProfile: true, isYoungRegular: true,
  deploymentActive: true, deploymentGroup: "F", deploymentSlot: 3, // 2nd line
  ...over,
});

describe("opportunityPace — opportunity unlocks a young player's ceiling", () => {
  it("lifts a pedigreed 20-yo on the 2nd line well above his thin NHL pace", () => {
    expect(opportunityPace(bjorck())).toBeGreaterThan(28); // raw pace is 16
  });

  it("gives more on the 2nd line than buried on the 4th", () => {
    const second = opportunityPace(bjorck({ deploymentSlot: 3 }));
    const fourth = opportunityPace(bjorck({ deploymentSlot: 9 }));
    expect(second).toBeGreaterThan(fourth);
  });

  it("never drags a young player below his established pace", () => {
    // Already producing above his role → no downward pull.
    expect(opportunityPace(bjorck({ stablePace: 60, deploymentSlot: 9 }))).toBe(60);
  });

  it("does not touch an established veteran", () => {
    const vet = bjorck({ age: 30, isProspectProfile: false, isYoungRegular: false, stablePace: 40, priorGames: 82 });
    expect(opportunityPace(vet)).toBe(40);
  });

  it("gives a blue-chip (1st overall) more lift than an undrafted young player", () => {
    const chip = opportunityPace(bjorck({ draftOverall: 1 }));
    const undrafted = opportunityPace(bjorck({ draftOverall: null, prospectPace: 16 }));
    expect(chip).toBeGreaterThan(undrafted);
  });
});
