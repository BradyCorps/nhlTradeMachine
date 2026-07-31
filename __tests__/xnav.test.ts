// ── X-NAV Engine Test Suite ──────────────────────────────────────────────────
// Run with: npx vitest run
// Watch mode: npx vitest
//
//
// Ranges are intentionally wide (~±20%) to allow for tuning
// without constant test updates. They're floor/ceiling guards,
// not precision assertions.

import { describe, it, expect } from "vitest";
import { calcNAV, calcDeploymentMultiplier, calcGoalieNAV, calcPickNAV, calcProspectNAV, calcSkaterNAV, currentSeasonWeight, classifyForwardArchetype, classifyRosterTier } from "../app/lib/xnav-engine";
import { getHistoricalFloor } from "../app/lib/player-data";
import { stageDrift } from "../app/lib/nav-breakdown";

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

  it("Oettinger: decent starter on defensive team → modest positive NAV", () => {
    const result = calcGoalieNAV({
      id: "oettinger", name: "Jake Oettinger", position: "G",
      age: 26, capHit: 5.75, yearsRemaining: 4,
      gsax: 5.1, gamesStarted: 50, teamXga60: 2.82,
    });
    // Starter floor is rate-gated now; a defensive-team starter with only decent
    // rate output stays modest instead of floating on volume alone.
    inRange(result.total, 0, 65, "Oettinger NAV");
  });
});

describe("G-NAV — Young Controlled Goalies", () => {
  it("Wolf (with extension): cheap now but big commitment → low positive NAV", () => {
    const result = calcGoalieNAV({
      id: "wolf", name: "Dustin Wolf", position: "G",
      age: 25, capHit: 0.875, yearsRemaining: 1,
      gsax: -1.8, gamesStarted: 57, teamXga60: 3.22,
      extensionCapHit: 7.5, extensionYears: 7,
    });
    // Negative GSAX + $7.5M extension is below-market at the corrected 95.5 cap ceiling;
    // the moderated starter floor prevents a bad-volume starter from floating too high.
    inRange(result.total, 0, 45, "Wolf (extension) NAV");
    expect(result.volatility).toBeGreaterThanOrEqual(40);
  });

  it("Wolf (no extension): cheap controlled starter → 75-120 NAV", () => {
    const result = calcGoalieNAV({
      id: "wolf-noext", name: "Dustin Wolf", position: "G",
      age: 25, capHit: 0.875, yearsRemaining: 2,
      gsax: -1.8, gamesStarted: 57, teamXga60: 3.22,
    });
    inRange(result.total, 75, 120, "Wolf (no ext) NAV");
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
  it("Wedgewood: veteran tandem goalie — capped at 60 NAV max", () => {
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

  it("Ascending 1B can exceed the old tandem cap when rate and control support it", () => {
    const result = calcGoalieNAV({
      id: "ascending-1b", name: "Ascending 1B", position: "G",
      age: 25, capHit: 1.0, yearsRemaining: 2,
      gsax: 50.0, gamesStarted: 45, teamXga60: 2.92,
    });
    expect(result.total).toBeGreaterThan(60);
    expect(result.total).toBeLessThanOrEqual(95);
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

  it("Barkov historical pedigree prevents stale current inputs from collapsing NAV", () => {
    const staleCurrent = calcNAV({
      id: "barkov-stale", name: "Aleksander Barkov", position: "C",
      age: 30, capHit: 10, yearsRemaining: 3,
      ptsPace: 25, xGPace: 10, defRate: 0.1,
      avgTOI: 16, qocIndex: 50,
      games: 70, hasLiveStats: true,
    });
    const floored = getHistoricalFloor("Aleksander Barkov", staleCurrent.total);

    expect(staleCurrent.total).toBeLessThan(50);
    expect(floored).toBeGreaterThanOrEqual(185);
  });

  it("historical floors decay for injured or declining veterans when current context is supplied", () => {
    const current = 25;
    const peakOnly = getHistoricalFloor("Erik Karlsson", current);
    const decayed = getHistoricalFloor("Erik Karlsson", current, {
      position: "D",
      age: 36,
      games: 38,
      ptsPace: 34,
    });

    expect(peakOnly).toBeGreaterThan(decayed);
    expect(decayed).toBeGreaterThanOrEqual(current);
    expect(decayed).toBeLessThan(peakOnly * 0.65);
  });

  it("older drafted NHLers with missing stats do not use first-overall prospect NAV", () => {
    const result = calcNAV({
      id: "lafreniere-missing-stats", name: "Alexis Lafreniere", position: "W",
      age: 24, capHit: 7.45, yearsRemaining: 7,
      draftOverall: 1, games: 0, hasLiveStats: false,
    });

    expect(result.total).toBeLessThan(100);
    expect(result.upside).toBe(0);
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
    inRange(result.total, 500, 680, "Makar NAV");
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

  it("Parayko-type shutdown top-pair D clears market floor despite modest points", () => {
    const result = calcSkaterNAV({
      id: "parayko-type", name: "Parayko Type", position: "D",
      age: 32, capHit: 6.5, yearsRemaining: 5,
      ptsPace: 28, xGPace: 7, defRate: 0.35,
      avgTOI: 22.8, qocIndex: 76, dzPct: 0.52,
      xgRelTM: 0.5, xgaRelTM: -0.55,
      games: 78, ops: 2.0, dps: 4.8, pairDriverScore: 12,
    });

    expect(result.total).toBeGreaterThanOrEqual(120);
    expect(result.def).toBeGreaterThan(25);
  });

  it("live Parayko-shaped DPS signal clears the shutdown floor", () => {
    const result = calcSkaterNAV({
      id: "colton-parayko-live-shape", name: "Colton Parayko", position: "D",
      age: 32, capHit: 6.5, yearsRemaining: 5,
      ptsPace: 28, xGPace: 7, defRate: 0.08,
      avgTOI: 22.8, qocIndex: 60, dzPct: 0.50,
      xgRelTM: null, xgaRelTM: null,
      games: 78, ops: 1.5, dps: 3.4,
    });

    expect(result.total).toBeGreaterThanOrEqual(120);
    expect(result.def).toBeGreaterThan(45);
  });

  it("real Parayko card profile (blended DPS < 3.3, QoC 76) clears the floor via the QoC gate", () => {
    // Reproduces the live card that read NAV -34: current DPS is 3.4 but a lower
    // multi-season baseline blends it to ~3.04 (under the 3.3 DPS gate), and QoC is
    // 76 (not 78). With xgaRelTM/pairDriverScore absent and defRate low, EVERY other
    // shutdown gate is 0 — only the QoC gate (lowered 78 -> 74) keeps a genuine
    // 22+ TOI top-pair shutdown D from free-falling on cap/age penalties.
    const result = calcSkaterNAV({
      id: "colton-parayko-real", name: "Colton Parayko", position: "D",
      age: 33, capHit: 6.5, yearsRemaining: 4,
      ptsPace: 18, xGPace: 5.5, defRate: 0.05,
      avgTOI: 22.2, qocIndex: 76, dzPct: 0.50,
      xgRelTM: null, xgaRelTM: null,
      games: 77, ops: -0.3, dps: 3.4, baselineDpsProxy: 2.8,
    });

    // Sanity: the baseline really does pull blendedDps under the 3.3 DPS gate,
    // so this case can only pass through the QoC gate.
    expect(3.4 * 0.4 + 2.8 * 0.6).toBeLessThan(3.3);
    expect(result.total).toBeGreaterThanOrEqual(120);
  });

  it("weak top-minute low-point D does not get the shutdown floor", () => {
    const result = calcSkaterNAV({
      id: "weak-top-minutes", name: "Weak Top Minutes D", position: "D",
      age: 30, capHit: 6.5, yearsRemaining: 5,
      ptsPace: 28, xGPace: 7, defRate: 0.05,
      avgTOI: 22.8, qocIndex: 50, dzPct: 0.44,
      xgRelTM: -2, xgaRelTM: 0.15,
      games: 78, ops: 2.0, dps: 1.4, pairDriverScore: -4,
    });

    expect(result.total).toBeLessThan(40);
    expect(result.def).toBeLessThan(10);
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

  it("Low-production youth does not receive full age upside without projection signal", () => {
    const result = calcSkaterNAV({
      id: "low-signal-young", name: "Low Signal Young", position: "W",
      age: 20, capHit: 0.925, yearsRemaining: 2,
      ptsPace: 6, xGPace: 2, defRate: -0.1,
      avgTOI: 8, games: 14, hasLiveStats: true,
      ops: 0.3, dps: 0.2,
    });
    expect(result.age).toBeLessThan(8);
    expect(result.total).toBeLessThan(30);
  });

  it("Replacement-level injury callup does not get league-minimum surplus NAV", () => {
    const result = calcSkaterNAV({
      id: "macewen-shape", name: "Zack MacEwen Shape", position: "W",
      age: 29, capHit: 0.775, yearsRemaining: 1,
      ptsPace: 0, xGPace: 0, defRate: 0,
      avgTOI: 6, games: 3, hasLiveStats: true,
    });

    expect(result.rosterTier).toBe("BOTTOM_SIX");
    expect(result.total).toBeLessThanOrEqual(15);
    expect(result.cap).toBeLessThanOrEqual(15);
  });

  it("Replacement-level callup with weak baseline and one tiny-sample point still does not get surplus NAV", () => {
    const result = calcSkaterNAV({
      id: "zack-macewen", name: "Zack MacEwen", position: "W",
      age: 29, capHit: 0.775, yearsRemaining: 1,
      ptsPace: 82 / 3, xGPace: 0, defRate: 0,
      avgTOI: 6, games: 3, hasLiveStats: true,
      baselinePtsPace: 10.95,
      baselineGameScore: 14.63,
      baselineDpsProxy: 0.8,
      baselineXgRel: -0.03,
      baselineHits82: 194.65,
      baselineBlocks82: 27.59,
    });

    expect(result.rosterTier).toBe("BOTTOM_SIX");
    expect(result.total).toBeLessThanOrEqual(15);
    expect(result.cap).toBeLessThanOrEqual(15);
    expect(result.fArchetype).toBe("SPACE_OPENER");
  });

  it("Young NHL track record relieves development discount versus same-age small sample", () => {
    const base = {
      id: "ordinary-young", name: "Ordinary Young", position: "C" as const,
      age: 23, capHit: 3.5, yearsRemaining: 3,
      ptsPace: 50, xGPace: 14, defRate: 0.05,
      avgTOI: 16, qocRank: 220, xgRelTM: 1, xgaRelTM: 0,
    };
    const established = calcSkaterNAV({ ...base, id: "established", games: 300 });
    const smallSample = calcSkaterNAV({ ...base, id: "small-sample", games: 20 });
    expect(established.total).toBeGreaterThan(smallSample.total);
  });

  it("Small-sample point shares are damped before full-season extrapolation", () => {
    const base = {
      id: "hot-start", name: "Hot Start", position: "W" as const,
      age: 22, capHit: 0.925, yearsRemaining: 2,
      ptsPace: 65, xGPace: 20, defRate: 0.0,
      avgTOI: 17, qocRank: 200, xgRelTM: 2, xgaRelTM: 0,
      ops: 4.5, dps: 1.2,
    };
    const hotStart = calcSkaterNAV({ ...base, games: 20 });
    const fullSeason = calcSkaterNAV({ ...base, games: 82 });
    expect(hotStart.off).toBeLessThan(fullSeason.off + 20);
  });
});

describe("X-NAV — Prospect Transition", () => {
  it("Unsupported prospect pedigree is discounted below the equivalent fresh pick", () => {
    const pick = calcPickNAV({
      id: "fresh-5", name: "Fresh 5th Overall", position: "Pick",
      age: 0, capHit: 0, yearsRemaining: 0,
      round: 1, year: 2026, teamStanding: 28,
    });
    const prospect = calcProspectNAV({
      id: "stalled-5", name: "Stalled 5th Overall", position: "C",
      age: 20, capHit: 0.925, yearsRemaining: 2,
      draftOverall: 5, games: 0, hasLiveStats: false,
    });
    expect(prospect.total).toBeLessThan(pick.total);
  });

  it("Prospect-to-skater valuation blends through 14-60 NHL games", () => {
    const base = {
      id: "transition-prospect", name: "Transition Prospect", position: "W" as const,
      age: 20, capHit: 0.925, yearsRemaining: 2,
      draftOverall: 5,
      ptsPace: 16, xGPace: 5, defRate: -0.05,
      avgTOI: 10, qocRank: 330, games: 0,
      hasLiveStats: false,
    };
    const game13 = calcNAV({ ...base, games: 13 });
    const game14 = calcNAV({ ...base, games: 14 });
    const game60 = calcNAV({ ...base, games: 60 });

    expect(Math.abs(game14.total - game13.total)).toBeLessThan(game13.total * 0.35);
    expect(game60.total).toBeLessThan(game14.total);
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

describe("X-NAV — Low-sample cap surplus dampening", () => {
  it("keeps Heinola-class low-sample depth defenders out of premium NAV territory", () => {
    const result = calcNAV({
      id: "heinola-class", name: "Heinola Class", position: "D",
      age: 25, capHit: 0.8, yearsRemaining: 1,
      ptsPace: 16.4, xGPace: 2, defRate: 0.02,
      avgTOI: 14.18, qocRank: 300, games: 5,
      baselinePtsPace: 8, draftOverall: 20, hasLiveStats: true,
    });

    expect(result.total).toBeGreaterThanOrEqual(15);
    expect(result.total).toBeLessThan(30);
    expect(result.cap).toBeLessThan(15);
  });

  it("does not over-damp established stars who only have a tiny current-season sample", () => {
    const injured = calcNAV({
      id: "injured-star", name: "Injured Star", position: "C",
      age: 29, capHit: 9, yearsRemaining: 4,
      ptsPace: 90, xGPace: 32, defRate: 0.08,
      avgTOI: 20, games: 5, baselinePtsPace: 95,
      ops: 7, dps: 3, hasLiveStats: true,
    });
    const fullSample = calcNAV({
      id: "full-star", name: "Full Star", position: "C",
      age: 29, capHit: 9, yearsRemaining: 4,
      ptsPace: 90, xGPace: 32, defRate: 0.08,
      avgTOI: 20, games: 70, baselinePtsPace: 95,
      ops: 7, dps: 3, hasLiveStats: true,
    });

    expect(Math.abs(injured.cap - fullSample.cap)).toBeLessThanOrEqual(5);
    expect(injured.total).toBeGreaterThan(300);
  });
});

describe("X-NAV — Fair-market AAV output", () => {
  it("returns sane fair-market AAVs without changing NAV math inputs", () => {
    const eliteForward = calcNAV({
      id: "elite-aav", name: "Elite AAV Forward", position: "C",
      age: 28, capHit: 8, yearsRemaining: 3,
      ptsPace: 90, xGPace: 28, defRate: 0.05,
      avgTOI: 19, games: 70, baselinePtsPace: 90,
      ops: 5.5, dps: 2, hasLiveStats: true,
    });
    const depthForward = calcNAV({
      id: "depth-aav", name: "Depth AAV Forward", position: "W",
      age: 28, capHit: 0.9, yearsRemaining: 1,
      ptsPace: 8, xGPace: 3, defRate: -0.08,
      avgTOI: 8, games: 40, baselinePtsPace: 10,
      hasLiveStats: true,
    });
    const starterGoalie = calcNAV({
      id: "starter-aav", name: "Starter AAV Goalie", position: "G",
      age: 29, capHit: 5, yearsRemaining: 3,
      gsax: 12, gamesStarted: 55, teamXga60: 2.9,
    });

    expect(eliteForward.fmvAav).toBeGreaterThanOrEqual(11);
    expect(eliteForward.fmvAav).toBeLessThanOrEqual(14);
    expect(depthForward.fmvAav).toBeGreaterThanOrEqual(1);
    expect(depthForward.fmvAav).toBeLessThanOrEqual(2.5);
    expect(starterGoalie.fmvAav).toBeGreaterThanOrEqual(6);
    expect(starterGoalie.fmvAav).toBeLessThanOrEqual(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SANITY / REGRESSION GUARDS
// ─────────────────────────────────────────────────────────────────────────────
describe("Sanity Guards — Values that should never happen", () => {
  it("Veteran tandem goalie should not exceed 60 NAV", () => {
    const result = calcGoalieNAV({
      id: "tandem-max", name: "Tandem G", position: "G",
      age: 31, capHit: 1.0, yearsRemaining: 2,
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
    // The haircut is its own row, not a deduction from the contract.
    //
    // This assertion used to read `requested.cap < neutral.cap` under the
    // comment "components still sum" — which was false twice over: the
    // components did not sum, and charging a negotiating penalty to the cap
    // strand said the contract got worse because the player asked out.
    expect(requested.cap).toBe(neutral.cap);
    const leverage = requested.stages?.find(st => st.key === "leverage");
    expect(leverage?.value).toBe(-penalty);
    expect(Math.abs(stageDrift(requested.stages!, requested.total))).toBeLessThan(1);
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

  it("adding low-value throw-ins never reduces compressed package value", () => {
    const starOnly = compressPackage([{ nav: 300, isPick: false, age: 28 }]);
    const withVeteranThrowIn = compressPackage([
      { nav: 300, isPick: false, age: 28 },
      { nav: 2, isPick: false, age: 33 },
    ]);
    const withManyThrowIns = compressPackage([
      { nav: 300, isPick: false, age: 28 },
      { nav: 2, isPick: false, age: 33 },
      { nav: 2, isPick: false, age: 33 },
      { nav: 2, isPick: false, age: 33 },
    ]);

    expect(withVeteranThrowIn).toBeGreaterThanOrEqual(starOnly);
    expect(withManyThrowIns).toBeGreaterThanOrEqual(starOnly);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FMV BREAKOUT CREDIBILITY — contract-year spikes vs earned breakouts
// ─────────────────────────────────────────────────────────────────────────────
describe("FMV — breakout credibility on the baseline blend", () => {
  const base = {
    position: "C" as const, capHit: 6, yearsRemaining: 4, avgTOI: 18, xGPace: 20,
    defRate: 0.08, qocIndex: 50, games: 78, hasLiveStats: true, capCeiling: 104,
  };

  it("leaves proven stars alone — current ≈ baseline means the blend barely moves", () => {
    // A player whose big season matches his multi-year baseline is not a spike;
    // the dynamic weight returns the default, so FMV stays elite.
    const star = calcNAV({ ...base, id: "star", name: "Star", ptsPace: 130, baselinePtsPace: 128, age: 28 });
    expect(star.fmvAav ?? 0).toBeGreaterThan(15); // still near the top of the market
  });

  it("anchors an uncorroborated veteran contract-year spike toward the baseline", () => {
    // Same raw spike (42 → 70), but old + hot high-danger finishing = a mirage.
    const vetSpike = calcNAV({ ...base, id: "vet", name: "Vet Spike", ptsPace: 70, baselinePtsPace: 42, age: 31, hdFinishingDelta: 0.05 });
    // A young, pedigreed, cold-finishing breakout with the identical raw line.
    const youngBreak = calcNAV({ ...base, id: "yng", name: "Young Break", ptsPace: 70, baselinePtsPace: 42, age: 22, draftOverall: 3, hdFinishingDelta: -0.03 });
    // The corroborated breakout should be paid more than the mirage.
    expect(youngBreak.fmvAav ?? 0).toBeGreaterThan(vetSpike.fmvAav ?? 0);
  });

  it("currentSeasonWeight: mirage anchors low, corroborated breakout leans current, no-spike is default", () => {
    const noSpike = currentSeasonWeight({ position: "C", age: 28, capHit: 6, yearsRemaining: 4, ptsPace: 42, baselinePtsPace: 42, games: 78 } as any, 0.4);
    expect(noSpike).toBeCloseTo(0.4, 5); // unchanged when there is no spike

    const mirage = currentSeasonWeight({ position: "C", age: 31, capHit: 6, yearsRemaining: 4, ptsPace: 70, baselinePtsPace: 42, games: 78, hdFinishingDelta: 0.05 } as any, 0.4);
    const earned = currentSeasonWeight({ position: "C", age: 22, capHit: 6, yearsRemaining: 4, ptsPace: 70, baselinePtsPace: 42, games: 78, draftOverall: 3, hdFinishingDelta: -0.03 } as any, 0.4);
    expect(mirage).toBeLessThan(0.4);   // trust the baseline, not the spike
    expect(earned).toBeGreaterThan(0.4); // let the real leap count
    expect(earned).toBeLessThanOrEqual(0.58);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NAV CONSISTENCY FIXES — decline gate, goalie baseline, goalie rounding
// ─────────────────────────────────────────────────────────────────────────────
describe("Historical floor — decline gate", () => {
  const hub = {
    age: 33, games: 50, position: "W" as const, ptsPace: 41,
  };
  it("does not resurrect a star producing far below his peak (Huberdeau)", () => {
    // Huberdeau: peak ~115, now 41. His talent value (~27) should not be
    // floored back to prime — the gate collapses the floor near current value.
    const floored = getHistoricalFloor("Jonathan Huberdeau", 27, hub);
    expect(floored).toBeLessThan(45); // was ~80 before the gate
  });
  it("still floors a star having a true dip near his peak", () => {
    // Same pedigree, but producing at ~85% of peak = a dip, not a decline.
    const dip = getHistoricalFloor("Jonathan Huberdeau", 40, { age: 29, games: 78, position: "W" as const, ptsPace: 98 });
    expect(dip).toBeGreaterThan(60);
  });
});

describe("G-NAV — elite goalie down year regresses to career, and total is an integer", () => {
  const hellebuyck = (gsax: number, withBaseline: boolean) => calcGoalieNAV({
    id: "hb", name: "Connor Hellebuyck", position: "G", age: 33, capHit: 8.5, yearsRemaining: 5,
    gsax, savePct: 0.895, gamesStarted: 57, teamXga60: 2.72, teamHdca60: 9.5,
    ...(withBaseline ? { baselineGsax: 21.15, baselineHdsvPct: 0.823 } : {}),
  } as any);

  it("keeps a proven elite's talent up on a down year when the career baseline is present", () => {
    const withBase = hellebuyck(5.5, true);
    const withoutBase = hellebuyck(5.5, false);
    // The career baseline lifts the on-ice (def) read well above the
    // baseline-less version that only sees the down season.
    expect(withBase.def).toBeGreaterThan(withoutBase.def + 15);
  });

  it("returns integer components (no raw float leaking into the card header)", () => {
    const r = hellebuyck(5.5, true);
    expect(Number.isInteger(r.total)).toBe(true);
    expect(Number.isInteger(r.def)).toBe(true);
    expect(Number.isInteger(r.age)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROSTER TIER — defensemen get pairing labels, not forward line labels
// ─────────────────────────────────────────────────────────────────────────────
describe("classifyRosterTier — position-aware", () => {
  it("labels a high-minute scoring D as a top pair, never a '2nd-line center'", () => {
    // 24 min, 45 normalized pts D (Makar/McAvoy shape)
    const elite = classifyRosterTier(24.4, 48, 1.1, 70, 20, 1.5, true);
    expect(["ELITE_1ST_PAIR", "TOP_PAIR"]).toContain(elite);
    expect(elite).not.toContain("LINE");
    expect(elite).not.toContain("2C");
    expect(elite).not.toContain("SIX");
  });
  it("labels a mid-minute D as a pairing, not MIDDLE_SIX", () => {
    const mid = classifyRosterTier(18.5, 22, 1.0, 50, 16, 0.5, true);
    expect(["SECOND_PAIR", "SHUTDOWN_D", "TOP_PAIR"]).toContain(mid);
    expect(mid).not.toBe("MIDDLE_SIX");
  });
  it("still gives forwards forward tiers", () => {
    expect(classifyRosterTier(20, 82, 1.1, 60, 18, 0.5, false)).toBe("ELITE_1ST_LINE");
    expect(classifyRosterTier(13, 20, 1.0, 40, 12, 0.5, false)).toBe("BOTTOM_SIX");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARCHETYPE — modern primary forward roles
// ─────────────────────────────────────────────────────────────────────────────
describe("forward archetype", () => {
  const base = {
    position: "C" as const, age: 27, capHit: 8, yearsRemaining: 4, avgTOI: 20,
    ops: 8, dps: 2, qocIndex: 55, games: 80, hasLiveStats: true, capCeiling: 104,
  };
  it("tags an assist-heavy scorer as a LINE_RAISER, not a finisher (Scheifele 28G/79A)", () => {
    const nav = calcSkaterNAV({ ...base, id: "s", name: "Scheifele", ptsPace: 107, goalsPace: 28, assistsPace: 79, xGPace: 24 });
    expect(nav.fArchetype).toBe("LINE_RAISER");
  });
  it("tags a goal-heavy scorer as a LINE_FINISHER", () => {
    const nav = calcSkaterNAV({ ...base, id: "g", name: "Finisher", ptsPace: 90, goalsPace: 52, assistsPace: 38, xGPace: 40 });
    expect(nav.fArchetype).toBe("LINE_FINISHER");
  });
  it("separates high-gravity stars and speed-burst players from generic impact", () => {
    expect(classifyForwardArchetype({
      ptsPace: 126, assistsPace: 82, goalsPace: 44, offTotal: 180, noivImpact: 16, avgTOI: 22,
    })).toBe("HIGH_GRAVITY");
    expect(classifyForwardArchetype({
      ptsPace: 42, goalsPace: 18, assistsPace: 24, avgTOI: 14, edgeBurstsOver20: 44,
    })).toBe("SPEED_BURST");
  });
});

describe("X-NAV — Gravity Release A boundary", () => {
  const base = {
    id: "gravity-boundary",
    name: "Gravity Boundary",
    position: "C" as const,
    age: 27,
    capHit: 7,
    yearsRemaining: 3,
    ptsPace: 75,
    xGPace: 22,
    defRate: 0.1,
    avgTOI: 19,
    games: 75,
    hasLiveStats: true,
    assistsPace: 45,
    goalsPace: 30,
    baselineIxg82: 18,
    ppPtsPace82: 15,
    xgRelTM: 5,
    baselineXgRel: 0.05,
    xgaRelTM: -0.2,
    dps: 1.5,
    pkTimeShare: 0.04,
    edgeOzPct: 0.49,
    dzPct: 0.48,
    edgeSpeedMaxMph: 22.3,
    edgeBurstsOver20: 55,
  };

  it("direct offensive inputs cannot change GRAV when NZ inputs are fixed", () => {
    const original = calcSkaterNAV(base);
    const directOffenseChanged = calcSkaterNAV({
      ...base,
      assistsPace: 90,
      goalsPace: 60,
      baselineIxg82: 40,
      ppPtsPace82: 40,
    });

    expect(directOffenseChanged.grav).toBe(original.grav);
  });

  it("NZ inputs change GRAV and the temporary handoff remains capped at ±20", () => {
    const original = calcSkaterNAV(base);
    const transitionChanged = calcSkaterNAV({
      ...base,
      edgeOzPct: 0.65,
      edgeSpeedMaxMph: 24.5,
      edgeBurstsOver20: 240,
    });
    const transitionCollapsed = calcSkaterNAV({
      ...base,
      edgeOzPct: 0,
      edgeSpeedMaxMph: 0,
      edgeBurstsOver20: 0,
    });

    expect(transitionChanged.grav).not.toBe(original.grav);
    expect(transitionChanged.grav).toBeLessThanOrEqual(20);
    expect(transitionCollapsed.grav).toBeGreaterThanOrEqual(-20);
  });
});
