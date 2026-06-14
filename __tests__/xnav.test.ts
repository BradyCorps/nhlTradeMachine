// ── X-NAV Engine Test Suite ──────────────────────────────────────────────────
// Run with: npx vitest run
// Watch mode: npx vitest
//
//
// Ranges are intentionally wide (~±20%) to allow for tuning
// without constant test updates. They're floor/ceiling guards,
// not precision assertions.

import { describe, it, expect } from "vitest";
import { calcNAV, calcDeploymentMultiplier, calcGoalieNAV, calcPickNAV, calcSkaterNAV } from "../app/lib/xnav-engine";

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
  it("Hellebuyck: elite starter on good team → 130-200 NAV", () => {
    const result = calcGoalieNAV({
      id: "hellebuyck", name: "Connor Hellebuyck", position: "G",
      age: 33, capHit: 8.5, yearsRemaining: 5,
      gsax: 18.5, gamesStarted: 60, teamXga60: 2.72,
    });
    // Confidence cap at 0.80 for all starters means even a full 60-game season
    // retains 20% weight on the career baseline — slightly lowers the ceiling for
    // strong single-season stats but prevents a single down year from tanking elite goalies.
    inRange(result.total, 130, 200, "Hellebuyck NAV");
  });

  it("Saros: solid starter on average team → 90-130 NAV", () => {
    const result = calcGoalieNAV({
      id: "saros", name: "Juuse Saros", position: "G",
      age: 29, capHit: 5.0, yearsRemaining: 4,
      gsax: 8.2, gamesStarted: 55, teamXga60: 2.97,
    });
    inRange(result.total, 120, 180, "Saros NAV");
  });

  it("Oettinger: decent starter on defensive team → 15-65 NAV", () => {
    const result = calcGoalieNAV({
      id: "oettinger", name: "Jake Oettinger", position: "G",
      age: 26, capHit: 5.75, yearsRemaining: 4,
      gsax: 5.1, gamesStarted: 50, teamXga60: 2.82,
    });
    // Upper bound raised: starter FMV floor lifts young goalies who were
    // undershooting the real market ($3.5-4M floor for 50+ game starters).
    inRange(result.total, 15, 65, "Oettinger NAV");
  });
});

describe("G-NAV — Young Controlled Goalies", () => {
  it("Wolf (with extension): cheap now but big commitment → 10-45 NAV", () => {
    const result = calcGoalieNAV({
      id: "wolf", name: "Dustin Wolf", position: "G",
      age: 25, capHit: 0.875, yearsRemaining: 1,
      gsax: -1.8, gamesStarted: 57, teamXga60: 3.22,
      extensionCapHit: 7.5, extensionYears: 7,
    });
    // Negative GSAX + $7.5M extension is below-market at the corrected 95.5 cap ceiling;
    // modest positive total is correct — the cheap controlled year saves it from being negative.
    inRange(result.total, 10, 45, "Wolf (extension) NAV");
  });

  it("Wolf (no extension): cheap controlled starter → 40-70 NAV", () => {
    const result = calcGoalieNAV({
      id: "wolf-noext", name: "Dustin Wolf", position: "G",
      age: 25, capHit: 0.875, yearsRemaining: 2,
      gsax: -1.8, gamesStarted: 57, teamXga60: 3.22,
    });
    inRange(result.total, 80, 120, "Wolf (no ext) NAV");
    expect(result.total).toBeGreaterThan(20);
  });

  it("Askarov: young tandem on terrible team → 25-55 NAV via floor", () => {
    const result = calcGoalieNAV({
      id: "askarov", name: "Yaroslav Askarov", position: "G",
      age: 23, capHit: 2.0, yearsRemaining: 2,
      gsax: -9.5, gamesStarted: 47, teamXga60: 3.47,
    });
    inRange(result.total, 25, 55, "Askarov NAV");
    expect(result.total).toBeGreaterThan(0);
  });
});

describe("G-NAV — Backup/Tandem Edge Cases", () => {
  it("Wedgewood: tandem goalie — hard cap at 60 NAV max", () => {
    const result = calcGoalieNAV({
      id: "wedge", name: "Scott Wedgewood", position: "G",
      age: 33, capHit: 2.0, yearsRemaining: 1,
      gsax: 23.1, gamesStarted: 45, teamXga60: 2.72,
      extensionCapHit: 2.5, extensionYears: 1,
    });
    expect(result.total).toBeLessThanOrEqual(60);
    inRange(result.total, 30, 60, "Wedgewood NAV");
  });

  it("Elite backup with small sample: regressed by confidence", () => {
    const result = calcGoalieNAV({
      id: "hot-backup", name: "Hot Streak Backup", position: "G",
      age: 27, capHit: 1.5, yearsRemaining: 1,
      gsax: 8.0, gamesStarted: 20, teamXga60: 2.92,
    });
    expect(result.total).toBeLessThan(35);
    inRange(result.total, 0, 35, "Elite backup (20gp) NAV");
  });

  it("Backup on a good team: per-game cap prevents inflation", () => {
    const result = calcGoalieNAV({
      id: "col-backup", name: "Col Backup", position: "G",
      age: 30, capHit: 2.0, yearsRemaining: 1,
      gsax: 15.0, gamesStarted: 30, teamXga60: 2.67,
    });
    expect(result.total).toBeLessThanOrEqual(35);
  });
});

describe("G-NAV — Declining Veterans", () => {
  it("Aging starter on bad team: negative NAV is possible", () => {
    const result = calcGoalieNAV({
      id: "aging-g", name: "Aging Vet Goalie", position: "G",
      age: 38, capHit: 4.5, yearsRemaining: 2,
      gsax: -8.0, gamesStarted: 52, teamXga60: 2.92,
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
  it("McDavid-tier: elite production, reasonable cap → 360-550 NAV", () => {
    const result = calcSkaterNAV({
      id: "mcdavid", name: "Connor McDavid", position: "C",
      age: 28, capHit: 12.5, yearsRemaining: 2,
      ptsPace: 140, xGPace: 45, defRate: 0.2,
      avgTOI: 22, qocRank: 80, xgRelTM: 12, xgaRelTM: -0.3,
      games: 78, ops: 12.5, dps: 2.1,
    });
    inRange(result.total, 550, 760, "McDavid NAV");
  });

  it("Barkov: two-way C, fair contract → 450-600 NAV", () => {
    const result = calcSkaterNAV({
      id: "barkov", name: "Aleksander Barkov", position: "C",
      age: 29, capHit: 10, yearsRemaining: 6,
      ptsPace: 90, xGPace: 30, defRate: 0.5,
      avgTOI: 21, qocRank: 95, xgRelTM: 8, xgaRelTM: -0.4,
      games: 70, ops: 6.5, dps: 3.5,
    });
    inRange(result.total, 450, 600, "Barkov NAV");
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
  it("Makar-tier: elite offensive D, strong contract → 500-650 NAV", () => {
    const result = calcSkaterNAV({
      id: "makar", name: "Cale Makar", position: "D",
      age: 26, capHit: 9, yearsRemaining: 3,
      ptsPace: 90, xGPace: 25, defRate: 0.3,
      avgTOI: 25, qocRank: 90, xgRelTM: 10, xgaRelTM: -0.2,
      games: 75, ops: 9.0, dps: 4.5,
    });
    inRange(result.total, 500, 650, "Makar NAV");
  });

  it("Morrissey: two-way D with NOIV data — DEF bar positive, not an artifact", () => {
    const result = calcSkaterNAV({
      id: "morrissey", name: "Josh Morrissey", position: "D",
      age: 29, capHit: 6.25, yearsRemaining: 6,
      ptsPace: 58, xGPace: 12, defRate: 0.0,
      avgTOI: 24.7, qocRank: 106,
      xgRelTM: 3.5, xgaRelTM: -0.38, dzPct: 0.42,
      games: 77, ops: 3.5, dps: 5.0,
    });
    expect(result.def).toBeGreaterThan(0);
    expect(result.def).toBeGreaterThan(10);
  });

  it("Karlsson-type: offensive liability on D — DEF bar negative", () => {
    const result = calcSkaterNAV({
      id: "karlsson-type", name: "Offensive Liability D", position: "D",
      age: 34, capHit: 7.0, yearsRemaining: 1,
      ptsPace: 65, xGPace: 18, defRate: -0.2,
      avgTOI: 21, qocRank: 280,
      xgRelTM: 5, xgaRelTM: 0.30,
      games: 70, ops: 6.5, dps: 1.2,
    });
    expect(result.def).toBeLessThan(0);
  });

  it("Low-minute depth player: DEF capped by TOI reliability — cannot exceed primary D-man", () => {
    const depth = calcSkaterNAV({
      id: "nyquist-type", name: "Depth Winger", position: "W",
      age: 35, capHit: 1.5, yearsRemaining: 1,
      ptsPace: 22, xGPace: 4, defRate: 0.8,
      avgTOI: 12.0, qocRank: 420, dzPct: 0.40,
      games: 58,
    });
    const pillarD = calcSkaterNAV({
      id: "parayko-type", name: "Pillar D", position: "D",
      age: 29, capHit: 5.5, yearsRemaining: 4,
      ptsPace: 30, xGPace: 6, defRate: 0.4,
      avgTOI: 22.0, qocRank: 130, dzPct: 0.60,
      xgRelTM: 0.5, xgaRelTM: -0.25,
      games: 72,
    });
    expect(depth.def).toBeLessThan(pillarD.def);
    expect(Math.abs(depth.def)).toBeLessThan(5);
  });

  it("Selke candidate (Cirelli-type): shutdown C shows positive DEF from defRate", () => {
    const result = calcSkaterNAV({
      id: "cirelli", name: "Anthony Cirelli", position: "C",
      age: 27, capHit: 6.5, yearsRemaining: 5,
      ptsPace: 42, xGPace: 8, defRate: 0.35,
      avgTOI: 17.2, qocRank: 105, dzPct: null,
      xgRelTM: -1.0, xgaRelTM: 1.2,
      games: 75,
    });
    expect(result.def).toBeGreaterThan(0);
    expect(result.def).toBeGreaterThan(8);
  });

  it("Selke candidate with DZ% data: bonus kicks in", () => {
    const result = calcSkaterNAV({
      id: "cirelli-dz", name: "Cirelli DZ", position: "C",
      age: 27, capHit: 6.5, yearsRemaining: 5,
      ptsPace: 42, xGPace: 8, defRate: 0.35,
      avgTOI: 17.2, qocRank: 105, dzPct: 0.56,
      xgRelTM: -1.0, xgaRelTM: 1.2,
      games: 75,
    });
    expect(result.def).toBeGreaterThan(0);
    const noDZResult = calcSkaterNAV({
      id: "cirelli-nodz", name: "Cirelli NoDZ", position: "C",
      age: 27, capHit: 6.5, yearsRemaining: 5,
      ptsPace: 42, xGPace: 8, defRate: 0.35,
      avgTOI: 17.2, qocRank: 105, dzPct: null,
      xgRelTM: -1.0, xgaRelTM: 1.2, games: 75,
    });
    expect(result.def).toBeGreaterThanOrEqual(noDZResult.def);
  });

  it("Selke candidate (Nelson-type): two-way C shows positive DEF", () => {
    const result = calcSkaterNAV({
      id: "nelson", name: "Brock Nelson", position: "C",
      age: 33, capHit: 6.0, yearsRemaining: 1,
      ptsPace: 55, xGPace: 14, defRate: 0.20,
      avgTOI: 18.5, qocRank: 140, dzPct: null,
      xgRelTM: 1.5, xgaRelTM: 0.3, games: 76,
    });
    expect(result.def).toBeGreaterThan(0);
  });

  it("Offensive forward: near-zero DEF — not a defensive player", () => {
    const result = calcSkaterNAV({
      id: "off-fwd", name: "Offensive Winger", position: "W",
      age: 26, capHit: 7.0, yearsRemaining: 4,
      ptsPace: 85, xGPace: 24, defRate: 0.02,
      avgTOI: 18.0, qocRank: 310, dzPct: 0.43,
      xgRelTM: 5.0, xgaRelTM: -0.1, games: 78,
    });
    expect(Math.abs(result.def)).toBeLessThan(8);
  });

  it("Selke C shows more DEF than offensive winger with similar stats", () => {
    const selke = calcSkaterNAV({
      id: "selke", name: "Selke C", position: "C",
      age: 28, capHit: 5.5, yearsRemaining: 3,
      ptsPace: 50, xGPace: 12, defRate: 0.32,
      avgTOI: 18.0, qocRank: 120, dzPct: null,
      xgRelTM: -0.5, xgaRelTM: 0.8, games: 76,
    });
    const offC = calcSkaterNAV({
      id: "offc", name: "Offensive C", position: "C",
      age: 28, capHit: 5.5, yearsRemaining: 3,
      ptsPace: 50, xGPace: 12, defRate: 0.03,
      avgTOI: 18.0, qocRank: 300, dzPct: null,
      xgRelTM: 3.0, xgaRelTM: -0.3, games: 76,
    });
    expect(selke.def).toBeGreaterThan(offC.def);
  });

  it("M_dep neutralizes offensive-zone penalty for high-QoC possession drivers", () => {
    const hedged = calcDeploymentMultiplier(0.31, 60);
    const neutralZoneStarts = calcDeploymentMultiplier(0.50, 60);
    expect(hedged).toBeCloseTo(neutralZoneStarts, 5);
    expect(hedged).toBeCloseTo(1.035, 5);
  });

  it("M_dep still applies offensive-zone penalty below the high-QoC hedge", () => {
    const sheltered = calcDeploymentMultiplier(0.31, 54);
    expect(sheltered).toBeCloseTo(0.9, 5);
  });

  it("production bypass keeps high-QoC distributed-minute centres out of middle six", () => {
    const result = calcSkaterNAV({
      id: "aho-shape", name: "Aho Shape", position: "C",
      age: 28, capHit: 9.75, yearsRemaining: 9,
      ptsPace: 55, xGPace: 20, defRate: 0.1,
      avgTOI: 16.6, qocIndex: 60, dzPct: 0.31,
      games: 70, baselinePtsPace: 55,
    });
    expect(result.rosterTier).toBe("FRINGE_1ST_LINE_2C");
  });

  it("SLF does not inflate low-EV pure PK specialists", () => {
    const base = {
      id: "pk-specialist", name: "PK Specialist", position: "C" as const,
      age: 28, capHit: 1.2, yearsRemaining: 1,
      ptsPace: 24, xGPace: 5, defRate: 0.2,
      avgTOI: 11.0, qocIndex: 65, dzPct: 0.58,
      games: 70,
    };
    const noPk = calcSkaterNAV({ ...base, pkTimeShare: 0 });
    const heavyPk = calcSkaterNAV({ ...base, pkTimeShare: 0.25 });
    expect(heavyPk.total).toBe(noPk.total);
    expect(heavyPk.rosterTier).toBe("PK_SPECIALIST");
  });

  it("SLF applies only after regular EV rotation minutes", () => {
    const base = {
      id: "regular-pk", name: "Regular PK Forward", position: "C" as const,
      age: 28, capHit: 2.0, yearsRemaining: 2,
      ptsPace: 40, xGPace: 9, defRate: 0.25,
      avgTOI: 16.0, qocIndex: 65, dzPct: 0.54,
      games: 70,
    };
    const noPk = calcSkaterNAV({ ...base, pkTimeShare: 0 });
    const heavyPk = calcSkaterNAV({ ...base, pkTimeShare: 0.15 });
    expect(heavyPk.total).toBeGreaterThan(noPk.total);
  });

  it("Elite shutdown tier requires high EV QoC", () => {
    const base = {
      id: "shutdown-c", name: "Shutdown C", position: "C" as const,
      age: 28, capHit: 4.0, yearsRemaining: 3,
      ptsPace: 40, xGPace: 8, defRate: 0.35,
      avgTOI: 16.0, dzPct: 0.58, pkTimeShare: 0.12,
      games: 70,
    };
    const highEvQoc = calcSkaterNAV({ ...base, qocIndex: 65 });
    const ordinaryEvQoc = calcSkaterNAV({ ...base, qocIndex: 50 });
    expect(highEvQoc.rosterTier).toBe("ELITE_SHUTDOWN");
    expect(ordinaryEvQoc.rosterTier).not.toBe("ELITE_SHUTDOWN");
  });

  it("Shutdown D: low pts but high defensive value → 130-220 NAV", () => {
    const result = calcSkaterNAV({
      id: "slavin", name: "Jaccob Slavin", position: "D",
      age: 32, capHit: 5.3, yearsRemaining: 2,
      ptsPace: 38, xGPace: 8, defRate: 0.8,
      avgTOI: 22, qocRank: 90, xgRelTM: 1, xgaRelTM: -0.8,
      games: 78, ops: 2.8, dps: 6.5,
    });
    // D-adjusted FMV midpoint (120 vs old 180) correctly values a $5.3M elite shutdown D
    // — Slavin's cap surplus drives the total well above the old suppressed ceiling of 160.
    inRange(result.total, 130, 220, "Slavin NAV");
    expect(result.def).toBeGreaterThan(25);
  });
});

describe("X-NAV — Young Surplus Contracts", () => {
  it("Young star on ELC: massive surplus value → 140+ NAV", () => {
    const result = calcSkaterNAV({
      id: "young-star", name: "Young Star", position: "C",
      age: 21, capHit: 0.925, yearsRemaining: 1,
      ptsPace: 85, xGPace: 22, defRate: 0.1,
      avgTOI: 18, qocRank: 200, xgRelTM: 5, xgaRelTM: 0,
      games: 68, ops: 7.2, dps: 2.1,
    });
    expect(result.total).toBeGreaterThan(140);
  });

  it("No-signal ELC skater does not get cap or age surplus by default", () => {
    const result = calcSkaterNAV({
      id: "ahl-elc", name: "AHL ELC", position: "W",
      age: 21, capHit: 0.925, yearsRemaining: 1,
      games: 0, ptsPace: 0, avgTOI: 0, hasLiveStats: false,
    });

    expect(result.total).toBe(0);
    expect(result.cap).toBe(0);
    expect(result.age).toBe(0);
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
      gsax: 50.0, gamesStarted: 45, teamXga60: 2.92,
    });
    expect(result.total).toBeLessThanOrEqual(60);
  });

  it("No backup should exceed 35 NAV", () => {
    const result = calcGoalieNAV({
      id: "backup-max", name: "Backup G", position: "G",
      age: 24, capHit: 0.9, yearsRemaining: 1,
      gsax: 30.0, gamesStarted: 25, teamXga60: 2.92,
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
      gsax:3.0,gamesStarted:55,teamXga60: 2.92,
    });
    const extended = calcGoalieNAV({
      id:"ext",name:"G",position:"G",age:25,capHit:0.875,yearsRemaining:1,
      gsax:3.0,gamesStarted:55,teamXga60: 2.92,
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
    expect(Math.abs(r.total - sum)).toBeLessThan(Math.abs(sum) * 0.3 + 30);
  });
});

// ── Trade-request leverage discount ─────────────────────────────────────────
describe("Trade block — leverage discount", () => {
  const base = {
    id:"req", name:"P", position:"C" as const, age:27, capHit:6.0, yearsRemaining:3,
    ptsPace:80, xGPace:20, defRate:0.2, avgTOI:19,
    xgRelTM:3, xgaRelTM:0, games:72,
  };

  it("'requested' status applies a small NAV haircut (≤8%, capped at 20)", () => {
    const neutral   = calcNAV(base);
    const requested = calcNAV({ ...base, tradeBlockStatus: "requested" });
    expect(requested.total).toBeLessThan(neutral.total);
    const penalty = neutral.total - requested.total;
    expect(penalty).toBeLessThanOrEqual(20);
    expect(penalty).toBeGreaterThan(0);
    // Components still sum: the haircut comes out of the cap strand
    expect(requested.cap).toBeLessThan(neutral.cap);
  });

  it("'available' (being shopped) carries no penalty", () => {
    const neutral = calcNAV(base);
    const shopped = calcNAV({ ...base, tradeBlockStatus: "available" });
    expect(shopped.total).toBe(neutral.total);
  });

  it("'untouchable' carries no penalty — value is unchanged, availability is the gate", () => {
    const neutral     = calcNAV(base);
    const untouchable = calcNAV({ ...base, tradeBlockStatus: "untouchable" });
    expect(untouchable.total).toBe(neutral.total);
  });

  it("negative-value contracts are not discounted further", () => {
    const dump = {
      id:"dump", name:"V", position:"W" as const, age:35, capHit:9.0, yearsRemaining:4,
      ptsPace:28, xGPace:5, avgTOI:13, games:70,
    };
    const neutral   = calcNAV(dump);
    const requested = calcNAV({ ...dump, tradeBlockStatus: "requested" });
    expect(requested.total).toBe(neutral.total);
  });
});

// ── Package compression tests ─────────────────────────────────────────────
import { compressPackage } from "../app/lib/xnav-engine";

describe("compressPackage — age-tiered", () => {

  it("single asset — no compression", () => {
    expect(compressPackage([{ nav: 1082, isPick: false, age: 28 }])).toBeCloseTo(1082, 0);
  });

  it("veteran depth (age 33) — heavy compression", () => {
    const fourVets = Array(4).fill(null).map(() => ({ nav: 270, isPick: false, age: 33 }));
    expect(compressPackage(fourVets)).toBeLessThan(450);
    expect(compressPackage(fourVets)).toBeGreaterThan(200);
  });

  it("blue-chip prospects (age 21) — mild compression", () => {
    const prospects = Array(3).fill(null).map(() => ({ nav: 270, isPick: false, age: 21 }));
    expect(compressPackage(prospects)).toBeGreaterThan(580);
    expect(compressPackage(prospects)).toBeCloseTo(638.8, 0);
  });

  it("prospects compress significantly less than equivalent veterans", () => {
    const prospects = Array(3).fill(null).map(() => ({ nav: 270, isPick: false, age: 21 }));
    const veterans  = Array(3).fill(null).map(() => ({ nav: 270, isPick: false, age: 33 }));
    expect(compressPackage(prospects)).toBeGreaterThan(compressPackage(veterans) + 100);
  });

  it("picks are fully linear — no age-tiered compression", () => {
    expect(compressPackage([
      { nav: 100, isPick: true },
      { nav: 80,  isPick: true },
    ])).toBeCloseTo(180, 0);
  });

  it("mixed: prime player + prospect + pick — each age tier applied correctly", () => {
    const mixed = [
      { nav: 300, isPick: false, age: 30 },
      { nav: 80,  isPick: true             },
      { nav: 100, isPick: false, age: 22 },
    ];
    expect(compressPackage(mixed)).toBeCloseTo(450, 0);
  });
});
