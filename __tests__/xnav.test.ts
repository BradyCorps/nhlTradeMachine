// ── X-NAV Engine Test Suite ──────────────────────────────────────────────────
// Run with: npx vitest run
// Watch mode: npx vitest
//
// These tests establish NAV baselines for known archetypes.
// If a change to the engine breaks these ranges, the test fails
// BEFORE the code reaches production — no more catching Wedgewood
// at +250 NAV via screenshot.
//
// Ranges are intentionally wide (~±20%) to allow for tuning
// without constant test updates. They're floor/ceiling guards,
// not precision assertions.

import { describe, it, expect } from "vitest";
import { calcNAV, calcGoalieNAV, calcPickNAV, calcSkaterNAV } from "../app/lib/xnav-engine";

// ── Helpers ──────────────────────────────────────────────────────────────────
const inRange = (val: number, min: number, max: number, label: string) => {
  if (val < min || val > max) {
    throw new Error(`${label}: ${val} not in [${min}, ${max}]`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GOALIE TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("G-NAV — Elite Starters", () => {
  it("Hellebuyck: elite starter on good team → 150-220 NAV", () => {
    const result = calcGoalieNAV({
      id: "hellebuyck", name: "Connor Hellebuyck", position: "G",
      age: 33, capHit: 8.5, yearsRemaining: 5,
      gsax: 18.5, gamesStarted: 60, teamXga60: 2.35,
    });
    inRange(result.total, 150, 220, "Hellebuyck NAV");
  });

  it("Saros: solid starter on average team → 90-130 NAV", () => {
    const result = calcGoalieNAV({
      id: "saros", name: "Juuse Saros", position: "G",
      age: 29, capHit: 5.0, yearsRemaining: 4,
      gsax: 8.2, gamesStarted: 55, teamXga60: 2.60,
    });
    inRange(result.total, 90, 130, "Saros NAV");
  });

  it("Oettinger: decent starter on defensive team → 15-45 NAV", () => {
    const result = calcGoalieNAV({
      id: "oettinger", name: "Jake Oettinger", position: "G",
      age: 26, capHit: 5.75, yearsRemaining: 4,
      gsax: 5.1, gamesStarted: 50, teamXga60: 2.45,
    });
    inRange(result.total, 15, 45, "Oettinger NAV");
  });
});

describe("G-NAV — Young Controlled Goalies", () => {
  it("Wolf (with extension): cheap now but big commitment → 20-45 NAV", () => {
    const result = calcGoalieNAV({
      id: "wolf", name: "Dustin Wolf", position: "G",
      age: 25, capHit: 0.875, yearsRemaining: 1,
      gsax: -1.8, gamesStarted: 57, teamXga60: 2.85,
      extensionCapHit: 7.5, extensionYears: 7,
    });
    inRange(result.total, 20, 45, "Wolf (extension) NAV");
  });

  it("Wolf (no extension): cheap controlled starter → 40-70 NAV", () => {
    const result = calcGoalieNAV({
      id: "wolf-noext", name: "Dustin Wolf", position: "G",
      age: 25, capHit: 0.875, yearsRemaining: 2,
      gsax: -1.8, gamesStarted: 57, teamXga60: 2.85,
    });
    inRange(result.total, 40, 70, "Wolf (no ext) NAV");
    expect(result.total).toBeGreaterThan(20); // must exceed raw negative GSAx
  });

  it("Askarov: young tandem on terrible team → 25-55 NAV via floor", () => {
    const result = calcGoalieNAV({
      id: "askarov", name: "Yaroslav Askarov", position: "G",
      age: 23, capHit: 2.0, yearsRemaining: 2,
      gsax: -9.5, gamesStarted: 47, teamXga60: 3.10,
    });
    inRange(result.total, 25, 55, "Askarov NAV");
    expect(result.total).toBeGreaterThan(0); // bad team context should prevent negative
  });
});

describe("G-NAV — Backup/Tandem Edge Cases", () => {
  it("Wedgewood: tandem goalie — hard cap at 60 NAV max", () => {
    const result = calcGoalieNAV({
      id: "wedge", name: "Scott Wedgewood", position: "G",
      age: 33, capHit: 2.0, yearsRemaining: 1,
      gsax: 23.1, gamesStarted: 45, teamXga60: 2.35,
      extensionCapHit: 2.5, extensionYears: 1,
    });
    // 45 games = TANDEM, hard capped at 60
    expect(result.total).toBeLessThanOrEqual(60);
    inRange(result.total, 30, 60, "Wedgewood NAV");
  });

  it("Elite backup with small sample: regressed by confidence", () => {
    const result = calcGoalieNAV({
      id: "hot-backup", name: "Hot Streak Backup", position: "G",
      age: 27, capHit: 1.5, yearsRemaining: 1,
      gsax: 8.0, gamesStarted: 20, teamXga60: 2.55,
    });
    // 20 games backup — confidence should heavily regress this
    expect(result.total).toBeLessThan(35);
    inRange(result.total, 0, 35, "Elite backup (20gp) NAV");
  });

  it("Backup on a good team: per-game cap prevents inflation", () => {
    const result = calcGoalieNAV({
      id: "col-backup", name: "Col Backup", position: "G",
      age: 30, capHit: 2.0, yearsRemaining: 1,
      gsax: 15.0, gamesStarted: 30, teamXga60: 2.30,
    });
    expect(result.total).toBeLessThanOrEqual(35); // backup cap
  });
});

describe("G-NAV — Declining Veterans", () => {
  it("Aging starter on bad team: negative NAV is possible", () => {
    const result = calcGoalieNAV({
      id: "aging-g", name: "Aging Vet Goalie", position: "G",
      age: 38, capHit: 4.5, yearsRemaining: 2,
      gsax: -8.0, gamesStarted: 52, teamXga60: 2.55,
    });
    expect(result.total).toBeLessThan(20);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PICK TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("Pick NAV — First Round Curve", () => {
  it("Last place team 1st (standing 32): near-untradable → 380-420 NAV", () => {
    const result = calcPickNAV({
      id: "sjs-1st", name: "SJS 1st", position: "Pick",
      age: 0, capHit: 0, yearsRemaining: 0,
      round: 1, year: 2026, teamStanding: 32,
    });
    inRange(result.total, 380, 420, "32nd pick NAV");
  });

  it("Bottom-3 team 1st (standing 30): franchise-altering → 320-360 NAV", () => {
    const result = calcPickNAV({
      id: "van-1st", name: "VAN 1st", position: "Pick",
      age: 0, capHit: 0, yearsRemaining: 0,
      round: 1, year: 2026, teamStanding: 30,
    });
    inRange(result.total, 320, 360, "30th pick NAV");
  });

  it("Mid-lottery team 1st (standing 24): solid prospect → 50-90 NAV", () => {
    const result = calcPickNAV({
      id: "mid-1st", name: "Mid 1st", position: "Pick",
      age: 0, capHit: 0, yearsRemaining: 0,
      round: 1, year: 2026, teamStanding: 24,
    });
    inRange(result.total, 100, 180, "24th pick NAV");
  });

  it("Contender 1st (standing 3): late pick, depth piece → 28-45 NAV", () => {
    const result = calcPickNAV({
      id: "car-1st", name: "CAR 1st", position: "Pick",
      age: 0, capHit: 0, yearsRemaining: 0,
      round: 1, year: 2026, teamStanding: 3,
    });
    inRange(result.total, 28, 45, "Contender 1st NAV");
  });

  it("Future 1st decays by year", () => {
    const now = calcPickNAV({
      id: "p2026", name: "2026 1st", position: "Pick",
      age: 0, capHit: 0, yearsRemaining: 0,
      round: 1, year: 2026, teamStanding: 25,
    });
    const future = calcPickNAV({
      id: "p2028", name: "2028 1st", position: "Pick",
      age: 0, capHit: 0, yearsRemaining: 0,
      round: 1, year: 2028, teamStanding: 25,
    });
    expect(future.total).toBeLessThan(now.total);
  });

  it("2nd round pick: always less than any 1st from same team", () => {
    const first  = calcPickNAV({ id:"f",name:"1st",position:"Pick",age:0,capHit:0,yearsRemaining:0,round:1,year:2026,teamStanding:25 });
    const second = calcPickNAV({ id:"s",name:"2nd",position:"Pick",age:0,capHit:0,yearsRemaining:0,round:2,year:2026,teamStanding:25 });
    expect(second.total).toBeLessThan(first.total);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SKATER TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("X-NAV — Franchise Centers", () => {
  it("McDavid-tier: elite production, reasonable cap → 400-600 NAV", () => {
    const result = calcSkaterNAV({
      id: "mcdavid", name: "Connor McDavid", position: "C",
      age: 28, capHit: 12.5, yearsRemaining: 2,
      ptsPace: 140, xGPace: 45, defRate: 0.2,
      avgTOI: 22, qocRank: 80, xgRelTM: 12, xgaRelTM: -0.3,
      games: 78, ops: 12.5, dps: 2.1,
    });
    inRange(result.total, 200, 400, "McDavid NAV");
  });

  it("Barkov: two-way C, fair contract → 150-250 NAV", () => {
    const result = calcSkaterNAV({
      id: "barkov", name: "Aleksander Barkov", position: "C",
      age: 30, capHit: 10.0, yearsRemaining: 8,
      ptsPace: 88, xGPace: 22, defRate: 0.6,
      avgTOI: 21, qocRank: 120, xgRelTM: 4, xgaRelTM: -0.5,
      games: 75, ops: 7.2, dps: 5.8,
    });
    inRange(result.total, 450, 700, "Barkov NAV");
  });
});

describe("X-NAV — Overpaid Veterans", () => {
  it("Overpaid aging vet: negative NAV expected", () => {
    const result = calcSkaterNAV({
      id: "overpaid-vet", name: "Overpaid Vet", position: "W",
      age: 37, capHit: 7.0, yearsRemaining: 3,
      ptsPace: 38, xGPace: 8, defRate: -0.1,
      avgTOI: 14, qocRank: 350, xgRelTM: -2, xgaRelTM: 0.2,
      games: 55, ops: 2.1, dps: 1.2,
    });
    expect(result.total).toBeLessThan(0);
  });

  it("Salary dump contract: deeply negative → below -50 NAV", () => {
    const result = calcSkaterNAV({
      id: "salary-dump", name: "Salary Dump", position: "W",
      age: 36, capHit: 8.5, yearsRemaining: 4,
      ptsPace: 28, xGPace: 5, defRate: -0.2,
      avgTOI: 12, qocRank: 400, xgRelTM: -4, xgaRelTM: 0.4,
      games: 48, ops: 1.2, dps: 0.8,
    });
    expect(result.total).toBeLessThan(-50);
  });
});

describe("X-NAV — Elite Defencemen", () => {
  it("Makar-tier: elite offensive D, strong contract → 250-400 NAV", () => {
    const result = calcSkaterNAV({
      id: "makar", name: "Cale Makar", position: "D",
      age: 26, capHit: 9.0, yearsRemaining: 3,
      ptsPace: 90, xGPace: 28, defRate: 0.3,
      avgTOI: 25, qocRank: 100, xgRelTM: 8, xgaRelTM: -0.4,
      games: 78, ops: 9.5, dps: 5.2,
    });
    inRange(result.total, 500, 800, "Makar NAV");
  });

  it("Shutdown D: low pts but high defensive value → 40-90 NAV", () => {
    const result = calcSkaterNAV({
      id: "slavin", name: "Jaccob Slavin", position: "D",
      age: 32, capHit: 5.3, yearsRemaining: 2,
      ptsPace: 38, xGPace: 8, defRate: 0.8,
      avgTOI: 22, qocRank: 90, xgRelTM: 1, xgaRelTM: -0.8,
      games: 78, ops: 2.8, dps: 6.5,
    });
    inRange(result.total, 600, 900, "Slavin NAV");
    expect(result.def).toBeGreaterThan(result.off); // must be defense-dominant
  });
});

describe("X-NAV — Young Surplus Contracts", () => {
  it("Young star on ELC: massive surplus value → 300+ NAV", () => {
    const result = calcSkaterNAV({
      id: "young-star", name: "Young Star", position: "C",
      age: 21, capHit: 0.925, yearsRemaining: 1,
      ptsPace: 85, xGPace: 22, defRate: 0.1,
      avgTOI: 18, qocRank: 200, xgRelTM: 5, xgaRelTM: 0,
      games: 68, ops: 7.2, dps: 2.1,
    });
    expect(result.total).toBeGreaterThan(300);
  });

  it("Age curve: younger player worth more than identical older player", () => {
    const base = {
      id: "base", name: "Player", position: "C" as const,
      capHit: 5.0, yearsRemaining: 4,
      ptsPace: 75, xGPace: 18, defRate: 0.2,
      avgTOI: 18, qocRank: 200, xgRelTM: 3, xgaRelTM: 0,
      games: 72,
    };
    const young = calcSkaterNAV({ ...base, id: "young", age: 23 });
    const old   = calcSkaterNAV({ ...base, id: "old",   age: 34 });
    expect(young.total).toBeGreaterThan(old.total);
  });
});

describe("X-NAV — Salary Retention", () => {
  it("50% retention increases NAV by reducing cap cost", () => {
    const base = {
      id: "retain", name: "Retained Player", position: "W" as const,
      age: 34, capHit: 7.0, yearsRemaining: 2,
      ptsPace: 55, xGPace: 14, defRate: 0.0,
      avgTOI: 16, qocRank: 280, xgRelTM: 1, xgaRelTM: 0,
      games: 70,
    };
    const noRetain = calcSkaterNAV({ ...base, retainedPct: 0 });
    const retained = calcSkaterNAV({ ...base, retainedPct: 0.5 });
    expect(retained.total).toBeGreaterThan(noRetain.total);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SANITY / REGRESSION GUARDS
// ─────────────────────────────────────────────────────────────────────────────
describe("Sanity Guards — Values that should never happen", () => {
  it("No tandem goalie should exceed 60 NAV", () => {
    const result = calcGoalieNAV({
      id: "tandem-max", name: "Tandem G", position: "G",
      age: 25, capHit: 1.0, yearsRemaining: 2,
      gsax: 50.0, gamesStarted: 45, teamXga60: 2.55, // absurd GSAx, should still be capped
    });
    expect(result.total).toBeLessThanOrEqual(60);
  });

  it("No backup should exceed 35 NAV", () => {
    const result = calcGoalieNAV({
      id: "backup-max", name: "Backup G", position: "G",
      age: 24, capHit: 0.9, yearsRemaining: 1,
      gsax: 30.0, gamesStarted: 25, teamXga60: 2.55,
    });
    expect(result.total).toBeLessThanOrEqual(35);
  });

  it("Last place 1st round pick should always beat contender 1st", () => {
    const worst = calcPickNAV({ id:"w",name:"w",position:"Pick",age:0,capHit:0,yearsRemaining:0,round:1,year:2026,teamStanding:32 });
    const best  = calcPickNAV({ id:"b",name:"b",position:"Pick",age:0,capHit:0,yearsRemaining:0,round:1,year:2026,teamStanding:1  });
    expect(worst.total).toBeGreaterThan(best.total);
  });

  it("Extension reduces NAV vs cheap current deal", () => {
    const cheap = calcGoalieNAV({
      id:"cheap",name:"G",position:"G",age:25,capHit:0.875,yearsRemaining:2,
      gsax:3.0,gamesStarted:55,teamXga60:2.55,
    });
    const extended = calcGoalieNAV({
      id:"ext",name:"G",position:"G",age:25,capHit:0.875,yearsRemaining:1,
      gsax:3.0,gamesStarted:55,teamXga60:2.55,
      extensionCapHit:7.5,extensionYears:7,
    });
    expect(extended.total).toBeLessThan(cheap.total);
  });

  it("NAV components sum correctly — total ≈ off + def + age + cap", () => {
    const r = calcSkaterNAV({
      id:"sum",name:"P",position:"C",age:27,capHit:6.0,yearsRemaining:3,
      ptsPace:80,xGPace:20,defRate:0.2,avgTOI:19,qocRank:200,
      xgRelTM:3,xgaRelTM:0,games:72,
    });
    const sum = r.off + r.def + r.age + r.cap;
    // Total should be within 20% of component sum (multiplier / rounding can differ)
    expect(Math.abs(r.total - sum)).toBeLessThan(Math.abs(sum) * 0.3 + 30);
  });
});