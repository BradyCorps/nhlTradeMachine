import { describe, expect, it } from "vitest";
import {
  blockFitsTeam,
  getMotivation,
  getRisk,
  preScreenProposal,
} from "../app/lib/trade-logic";
import type { Asset, Team } from "../app/lib/trade-types";
import type { DevelopmentProfile } from "../app/lib/development-profile";

const profile = (overrides: Partial<DevelopmentProfile> = {}): DevelopmentProfile => ({
  currentFantasyScore: 50,
  dynastyScore: 50,
  breakoutProbability: 40,
  regressionRisk: 35,
  developmentPhase: "BREAKOUT_CANDIDATE",
  timelineTrend: "FLAT",
  projectionBand: {
    floorPts82: 20,
    medianPts82: 45,
    ceilingPts82: 70,
    confidence: 55,
  },
  volatility: 45,
  boomBustScore: 55,
  boomBustSignal: "STABLE",
  boomScore: 50,
  bustScore: 35,
  nhlExperienceScore: 40,
  pedigreeScore: 50,
  productionScore: 50,
  roleGrowthScore: 45,
  tags: [],
  rationale: [],
  ...overrides,
});

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: "asset",
  teamId: "ANA",
  name: "Test Player",
  position: "C",
  age: 24,
  games: 70,
  ptsPace: 45,
  defRate: 0,
  avgTOI: 16,
  capHit: 1,
  yearsRemaining: 2,
  hasNMC: false,
  hasNTC: false,
  canRetain: false,
  retainedPct: 0,
  multiplier: 1,
  ...overrides,
});

const team = (overrides: Partial<Team> = {}): Team => ({
  id: "ANA",
  name: "Anaheim Ducks",
  capSpace: 12,
  standing: 28,
  phase: "Rebuilding",
  ...overrides,
});

describe("development profile trade proposal logic", () => {
  it("boosts future-core profiles for rebuilding teams", () => {
    const rebuild = team();
    const base = asset({ id: "base", name: "Base Prospect" });
    const futureCore = asset({
      id: "core",
      name: "Future Core",
      developmentProfile: profile({
        dynastyScore: 70,
        breakoutProbability: 62,
        developmentPhase: "BREAKOUT_CANDIDATE",
        boomBustSignal: "BOOM_LEAN",
      }),
    });

    const baseFit = blockFitsTeam(rebuild, [base], [], { base: 30, core: 30 });
    const coreFit = blockFitsTeam(rebuild, [futureCore], [], { base: 30, core: 30 });

    expect(coreFit).toBeGreaterThan(baseFit);
  });

  it("names peak-window players as a win-now motivation", () => {
    const contender = team({ id: "EDM", name: "Edmonton Oilers", phase: "Contender", standing: 3 });
    const pick = asset({ id: "first", name: "2027 1st", position: "Pick", round: 1, year: 2027 });
    const peak = asset({
      id: "peak",
      name: "Peak Window",
      age: 27,
      developmentProfile: profile({
        dynastyScore: 66,
        developmentPhase: "PEAK_WINDOW",
        regressionRisk: 22,
        boomBustSignal: "STABLE",
      }),
    });

    expect(getMotivation(contender, [pick], [peak], false, { first: 40, peak: 75 }))
      .toContain("peak-window player");
  });

  it("flags development variance when premium assets buy a bust-lean profile", () => {
    const first = asset({ id: "first", name: "2027 1st", position: "Pick", round: 1, year: 2027 });
    const swing = asset({
      id: "swing",
      name: "Variance Swing",
      age: 22,
      developmentProfile: profile({
        dynastyScore: 41,
        boomBustSignal: "BUST_LEAN",
        boomScore: 35,
        bustScore: 80,
        projectionBand: {
          floorPts82: 0,
          medianPts82: 19,
          ceilingPts82: 52,
          confidence: 36,
        },
      }),
    });

    expect(getRisk([first], [swing], { first: 42, swing: 48 })?.label).toBe("DEV VARIANCE");
  });

  it("screens out rebuilders selling future-core profiles for veteran term without picks", () => {
    const home = team({ id: "EDM", name: "Edmonton Oilers", phase: "Contender", standing: 3 });
    const partner = team();
    const veteran = asset({
      id: "vet",
      name: "Veteran Contract",
      age: 32,
      yearsRemaining: 3,
      teamId: home.id,
    });
    const futureCore = asset({
      id: "core",
      name: "Future Core",
      teamId: partner.id,
      developmentProfile: profile({
        dynastyScore: 72,
        boomBustSignal: "BOOM_LEAN",
        developmentPhase: "EMERGING",
      }),
    });

    expect(preScreenProposal([veteran], [futureCore], home, partner, { vet: 45, core: 50 }))
      .toBe(false);
  });

  it("screens out partner concessions beyond the verdict-aligned compressed NAV approval band", () => {
    const home = team({ id: "EDM", name: "Edmonton Oilers", phase: "Contender", standing: 3 });
    const partner = team({ id: "NSH", name: "Nashville Predators", phase: "Retooling", standing: 20 });
    const depth = asset({ id: "depth", name: "Depth Player", teamId: home.id });
    const better = asset({ id: "better", name: "Better Player", teamId: partner.id });

    expect(preScreenProposal([depth], [better], home, partner, { depth: 40, better: 95 }))
      .toBe(false);
  });

  it("screens out a partner trading away an unreplaced stated position need", () => {
    const home = team({ id: "EDM", name: "Edmonton Oilers", phase: "Contender", standing: 3 });
    const partner = team({
      id: "NSH",
      name: "Nashville Predators",
      phase: "Retooling",
      standing: 20,
      needs: [{ pos: "W", minWar: 1, label: "Top-nine winger" }],
    });
    const center = asset({ id: "center", name: "Return Center", teamId: home.id, position: "C" });
    const winger = asset({ id: "winger", name: "Needed Winger", teamId: partner.id, position: "R" });

    expect(preScreenProposal([center], [winger], home, partner, { center: 60, winger: 60 }))
      .toBe(false);
  });

  it("allows a larger concession when every partner asset is actively shopped", () => {
    const home = team({ id: "EDM", name: "Edmonton Oilers", phase: "Contender", standing: 3 });
    const partner = team({ id: "NSH", name: "Nashville Predators", phase: "Retooling", standing: 20 });
    const depth = asset({ id: "depth", name: "Depth Player", teamId: home.id });
    const shopped = asset({
      id: "shopped",
      name: "Shopped Player",
      teamId: partner.id,
      tradeBlockStatus: "available",
    });

    expect(preScreenProposal([depth], [shopped], home, partner, { depth: 40, shopped: 75 }))
      .toBe(true);
  });

  it("blocks tanking teams from selling premium lottery firsts without an exceptional return", () => {
    const home = team({ id: "EDM", name: "Edmonton Oilers", phase: "Contender", standing: 3 });
    const partner = team({ id: "VAN", name: "Vancouver Canucks", phase: "Tanking", standing: 32 });
    const strongReturn = asset({ id: "strong", name: "Strong Player", teamId: home.id });
    const likelyFirst = asset({
      id: "van-2027-1",
      name: "2027 1st Round Pick (VAN)",
      teamId: partner.id,
      position: "Pick",
      round: 1,
      year: 2027,
      teamStanding: 32,
    });

    expect(preScreenProposal([strongReturn], [likelyFirst], home, partner, { strong: 420, "van-2027-1": 400 }))
      .toBe(false);
  });
});
