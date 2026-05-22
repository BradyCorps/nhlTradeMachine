"use client";

import React, { useState, useEffect, useCallback } from "react";
import ContractSyncer from "@/app/components/ContractSyncer";
import TradeProposalEngine from "@/app/components/TradeProposal";
import PlayerComparison from "@/app/components/PlayerComparison";
import CapProjection from "@/app/components/CapProjection";

// ── Core data interfaces — must be declared before any functions ──
interface Asset {
  id: string;
  teamId: string;
  name: string;
  position: string;
  age: number;
  games: number;
  ptsPace: number;
  xGPace?: number;
  defRate: number;
  avgTOI: number;
  capHit: number;
  yearsRemaining: number;
  hasNMC: boolean;
  hasNTC: boolean;
  canRetain: boolean;
  retainedPct: number;
  multiplier: number;
  headshot?: string;
  hasLiveStats?: boolean;
  qocRank?: number;
  xgRelTM?: number | null;
  xgaRelTM?: number | null;
  dzPct?: number | null;
  goalsPace?: number;
  assistsPace?: number;
  round?: number;
  year?: number;
  teamStanding?: number;
  isProtected?: boolean;
  gsax?: number;
  savePct?: number;
  gamesStarted?: number;
  shotsPerGame?: number;
  careerGsax?: number;
  awards?: string[];
  peakNAV?: number;
}

interface Team {
  id: string;
  name: string;
  capSpace: number;
  standing: number;
  phase?: string;
  needs?: { pos: string; minWar: number; label: string }[];
  prospectPool?: string;
}

interface XNAVResult {
  total: number;
  off: number;
  def: number;
  age: number;
  cap: number;
  upside: number;
  noivImpact?: number;  // How much NOIV adjusted the final total
  fArchetype?: string;  // Forward archetype for display
}

// ============================================================
// PLAYER PEDIGREE — historical context for established players
// Used to prevent a down year from cratering a proven player's value.
// A real GM evaluating Hellebuyck looks at 5 years, not 1.
//
// Fields:
//   peakGsax    — best single-season GSAx (goalies)
//   careerGsax  — career total GSAx (goalies)
//   awards      — hardware won (Hart, Vezina, Norris, Calder, etc.)
//   peakPtsPace — best single-season pts/82 (skaters)
//   allStarYears — number of All-Star selections
// ============================================================
const PLAYER_PEDIGREE: Record<string, {
  peakGsax?:    number;
  careerGsax?:  number;
  peakPtsPace?: number;
  awards?:      string[];
  allStarYears?: number;
}> = {
  // ── ELITE GOALIES ──────────────────────────────────────────
  "Connor Hellebuyck":  { peakGsax: 28.4, careerGsax: 108, awards: ["Hart","Vezina","Vezina","Vezina"],  allStarYears: 5 },
  "Igor Shesterkin":    { peakGsax: 25.1, careerGsax: 72,  awards: ["Vezina","Vezina"],                 allStarYears: 4 },
  "Andrei Vasilevskiy": { peakGsax: 22.8, careerGsax: 95,  awards: ["Vezina","Conn Smythe"],            allStarYears: 3 },
  "Juuse Saros":        { peakGsax: 20.1, careerGsax: 55,  awards: ["Vezina"],                          allStarYears: 2 },
  "Jeremy Swayman":     { peakGsax: 18.6, careerGsax: 38,  awards: [],                                  allStarYears: 1 },
  "Jake Oettinger":     { peakGsax: 16.2, careerGsax: 42,  awards: [],                                  allStarYears: 1 },
  "Filip Gustavsson":   { peakGsax: 20.4, careerGsax: 38,  awards: ["Vezina"],                          allStarYears: 1 },
  "Sergei Bobrovsky":   { peakGsax: 24.3, careerGsax: 85,  awards: ["Vezina","Vezina"],                 allStarYears: 3 },
  "Jordan Binnington":  { peakGsax: 14.2, careerGsax: 32,  awards: ["Conn Smythe"],                     allStarYears: 1 },
  "Pyotr Kochetkov":    { peakGsax: 14.8, careerGsax: 22,  awards: [],                                  allStarYears: 0 },
  "Tristan Jarry":      { peakGsax: 10.2, careerGsax: 18,  awards: [],                                  allStarYears: 0 },
  "Jacob Markstrom":    { peakGsax: 16.8, careerGsax: 44,  awards: [],                                  allStarYears: 2 },
  "Ilya Sorokin":       { peakGsax: 18.9, careerGsax: 48,  awards: ["Vezina"],                          allStarYears: 2 },
  "Joseph Woll":        { peakGsax: 12.4, careerGsax: 18,  awards: [],                                  allStarYears: 0 },
  "Stuart Skinner":     { peakGsax: 8.1,  careerGsax: 14,  awards: [],                                  allStarYears: 0 },
  "Dustin Wolf":        { peakGsax: 11.2, careerGsax: 16,  awards: [],                                  allStarYears: 0 },
  "Ukko-Pekka Luukkonen": { peakGsax: 14.6, careerGsax: 24, awards: [],                                 allStarYears: 1 },

  // ── ELITE SKATERS ──────────────────────────────────────────
  "Connor McDavid":     { peakPtsPace: 153, awards: ["Hart","Hart","Hart","Ted Lindsay","Ted Lindsay","Ted Lindsay","Calder"], allStarYears: 8 },
  "Leon Draisaitl":     { peakPtsPace: 128, awards: ["Hart","Ted Lindsay","Art Ross"],                   allStarYears: 5 },
  "Nathan MacKinnon":   { peakPtsPace: 140, awards: ["Hart","Hart","Ted Lindsay","Ted Lindsay","Norris"], allStarYears: 7 },
  "Nikita Kucherov":    { peakPtsPace: 144, awards: ["Hart","Ted Lindsay","Art Ross","Conn Smythe"],      allStarYears: 5 },
  "Cale Makar":         { peakPtsPace: 93,  awards: ["Calder","Norris","Norris","Conn Smythe"],           allStarYears: 4 },
  "David Pastrnak":     { peakPtsPace: 122, awards: ["Rocket Richard","Rocket Richard"],                  allStarYears: 4 },
  "Roman Josi":         { peakPtsPace: 96,  awards: ["Norris"],                                           allStarYears: 3 },
  "Adam Fox":           { peakPtsPace: 102, awards: ["Norris","Norris"],                                  allStarYears: 3 },
  "Sidney Crosby":      { peakPtsPace: 120, awards: ["Hart","Hart","Hart","Conn Smythe","Conn Smythe"],   allStarYears: 9 },
  "Alexander Ovechkin": { peakPtsPace: 115, awards: ["Hart","Hart","Hart","Ted Lindsay","Art Ross","Rocket Richard","Rocket Richard","Rocket Richard","Rocket Richard","Rocket Richard"], allStarYears: 13 },
  "Evgeni Malkin":      { peakPtsPace: 118, awards: ["Hart","Conn Smythe","Art Ross"],                    allStarYears: 6 },
  "Victor Hedman":      { peakPtsPace: 82,  awards: ["Norris","Norris","Conn Smythe"],                    allStarYears: 4 },
  "Quinn Hughes":       { peakPtsPace: 102, awards: ["Norris"],                                           allStarYears: 3 },
  "Rasmus Dahlin":      { peakPtsPace: 102, awards: [],                                                   allStarYears: 2 },
  "Elias Pettersson":   { peakPtsPace: 102, awards: ["Calder"],                                           allStarYears: 2 },
  "Josh Morrissey":     { peakPtsPace: 76,  awards: [],                                                   allStarYears: 1 },
  "Kyle Connor":        { peakPtsPace: 92,  awards: [],                                                   allStarYears: 1 },
  "Mark Scheifele":     { peakPtsPace: 88,  awards: [],                                                   allStarYears: 1 },
  "Mikko Rantanen":     { peakPtsPace: 110, awards: ["Conn Smythe"],                                      allStarYears: 3 },
  "Matthew Tkachuk":    { peakPtsPace: 109, awards: [],                                                   allStarYears: 2 },
  "Brady Tkachuk":      { peakPtsPace: 80,  awards: [],                                                   allStarYears: 1 },
  "Auston Matthews":    { peakPtsPace: 124, awards: ["Hart","Calder","Rocket Richard","Rocket Richard","Rocket Richard"], allStarYears: 5 },
  "Mitch Marner":       { peakPtsPace: 101, awards: [],                                                   allStarYears: 3 },
  "William Nylander":   { peakPtsPace: 97,  awards: [],                                                   allStarYears: 1 },
  "Nico Hischier":      { peakPtsPace: 80,  awards: ["Calder"],                                           allStarYears: 1 },
  "Jack Hughes":        { peakPtsPace: 98,  awards: [],                                                   allStarYears: 2 },
  "Aleksander Barkov":  { peakPtsPace: 96,  awards: ["Selke","Selke"],                                    allStarYears: 3 },
  "Jonathan Huberdeau": { peakPtsPace: 115, awards: [],                                                   allStarYears: 2 },
  "Jakob Chychrun":     { peakPtsPace: 75,  awards: [],                                                   allStarYears: 0 },
  "Jaccob Slavin":      { peakPtsPace: 42,  awards: [],                                                   allStarYears: 0 },
};

// ── Award hardware multipliers ────────────────────────────────
const AWARD_BONUS: Record<string, number> = {
  "Hart":         18,
  "Vezina":       14,
  "Norris":       12,
  "Ted Lindsay":  10,
  "Conn Smythe":  10,
  "Art Ross":     8,
  "Rocket Richard": 6,
  "Calder":       6,
};

// ── Prospect Tier System ──────────────────────────────────────
// Players with low ptsPace (due to youth/limited NHL games) get
// a prospect NAV floor based on their draft pedigree and ceiling.
// Tier 1: Franchise prospects (top-5 picks, elite projection)
// Tier 2: Top prospects (top-15 picks, high-end NHL upside)
// Tier 3: Good prospects (mid-1st or proven AHL producers)
// Tier 4: Fringe prospects (later rounds, high-end AHL)
const PROSPECT_TIERS: Record<string, {
  tier: 1 | 2 | 3 | 4;
  navFloor: number;    // Minimum NAV regardless of current stats
  ceiling: number;     // Upside component for variance
  note: string;
}> = {
  // Tier 1 — Franchise
  "Connor Bedard":      { tier: 1, navFloor: 180, ceiling: 50, note: "2023 #1 overall" },
  "Macklin Celebrini":  { tier: 1, navFloor: 160, ceiling: 50, note: "2024 #1 overall" },
  "Gavin McKenna":      { tier: 1, navFloor: 200, ceiling: 60, note: "2026 #1 overall — generational" },
  "Matthew Schaefer":   { tier: 1, navFloor: 140, ceiling: 45, note: "2025 #1 overall" },
  // Tier 2 — High-end
  "Beckett Sennecke":   { tier: 2, navFloor: 90,  ceiling: 35, note: "2024 #3 overall, 60pt rookie" },
  "Cayden Lindstrom":   { tier: 2, navFloor: 80,  ceiling: 30, note: "2023 #4 overall" },
  "Will Smith":         { tier: 2, navFloor: 85,  ceiling: 30, note: "2023 #4 overall" },
  "Matvei Michkov":     { tier: 2, navFloor: 95,  ceiling: 40, note: "Elite skill, PHI building around" },
  "Logan Cooley":       { tier: 2, navFloor: 80,  ceiling: 30, note: "2022 #3 overall" },
  "David Reinbacher":   { tier: 2, navFloor: 70,  ceiling: 25, note: "2023 #5 overall, D" },
  "Zach Benson":        { tier: 2, navFloor: 75,  ceiling: 25, note: "2023 #13 overall" },
  "Brayden Yager":      { tier: 2, navFloor: 70,  ceiling: 25, note: "2023 #14 overall" },
  "Dalibor Dvoracek":   { tier: 2, navFloor: 65,  ceiling: 25, note: "2024 top prospect" },
  "Rasmus Asplund":     { tier: 2, navFloor: 65,  ceiling: 20, note: "Top prospect" },
  // Tier 3 — Good prospects
  "Colby Barlow":       { tier: 3, navFloor: 45,  ceiling: 20, note: "2023 mid-1st" },
  "Noel Gunler":        { tier: 3, navFloor: 40,  ceiling: 18, note: "High-end skill" },
  "Tanner Molendyk":    { tier: 3, navFloor: 38,  ceiling: 15, note: "D prospect" },
  "Denton Mateychuk":   { tier: 3, navFloor: 40,  ceiling: 18, note: "D prospect, CBJ" },
  "Rutger McGroarty":   { tier: 3, navFloor: 42,  ceiling: 18, note: "2022 14th overall" },
};

// ── Shutdown D Pedigree — known elite defensive specialists ───
// These players have proven track records as top-pairing shutdown D-men.
// Their value doesn't show up in points or xG metrics reliably.
const SHUTDOWN_D_PEDIGREE: Record<string, { navFloor: number; note: string }> = {
  "Jaccob Slavin":     { navFloor: 55,  note: "Perennial Selke candidate, elite shutdown D" },
  "Ryan Suter":        { navFloor: 30,  note: "Veteran shutdown D, declining but proven" },
  "Rasmus Ristolainen":{ navFloor: 25,  note: "Defensive specialist, PHI" },
  "Luke Schenn":       { navFloor: 20,  note: "Veteran shutdown D" },
  "Joel Edmundson":    { navFloor: 22,  note: "Shutdown D, physical" },
  "Brendan Dillon":    { navFloor: 18,  note: "Veteran shutdown D" },
  "Colin Miller":      { navFloor: 18,  note: "Defensive D" },
  "Damon Severson":    { navFloor: 30,  note: "Two-way D, shutdown capable" },
  "Jake Walman":       { navFloor: 25,  note: "Defensive D, DET" },
  "Travis Hamonic":    { navFloor: 18,  note: "Veteran shutdown D" },
};
// Players with known fragility or chronic issues get a risk flag.
// This isn't a disqualifier — just context for the acquiring GM.
const INJURY_RISK: Record<string, {
  level: "HIGH" | "MODERATE";
  note: string;
}> = {
  "Nathan MacKinnon":    { level: "MODERATE", note: "History of upper-body injuries" },
  "Elias Pettersson":    { level: "MODERATE", note: "Wrist/shoulder concerns" },
  "Blake Wheeler":       { level: "HIGH",     note: "Chronic knee issues, age 38" },
  "Jakub Voracek":       { level: "HIGH",     note: "Retired due to concussion" },
  "Evander Kane":        { level: "HIGH",     note: "Wrist surgery, repeated absences" },
  "Cam Fowler":          { level: "MODERATE", note: "Knee surgery history" },
  "Ryan Ellis":          { level: "HIGH",     note: "Chronic hip/pelvis — barely played since 2022" },
  "Marc-Andre Fleury":   { level: "MODERATE", note: "Age-related durability" },
  "Jonathan Toews":      { level: "HIGH",     note: "Chronic Immune condition" },
  "Jack Eichel":         { level: "MODERATE", note: "Disk fusion surgery history" },
  "Carey Price":         { level: "HIGH",     note: "Knee, substance — effectively retired" },
  "Nazem Kadri":         { level: "MODERATE", note: "Thumb surgery, suspension history" },
  "Erik Karlsson":       { level: "HIGH",     note: "Two Achilles surgeries, wrist issues" },
  "Thomas Chabot":       { level: "MODERATE", note: "History of concussions" },
  "Brady Tkachuk":       { level: "MODERATE", note: "Wrist injury history" },
  "Tristan Jarry":       { level: "HIGH",     note: "Foot injury, has missed significant time" },
};

// How much weight to put on historical peak vs current season.
// Elite proven players shrink toward peak, not league mean.
// ── Math helpers — must be before getXNAV ────────────────────
const safe  = (n: number) => (isNaN(n) || !isFinite(n) ? 0 : n);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const fmt   = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));

const getHistoricalFloor = (name: string, currentNAV: number): number => {
  const pedigree = PLAYER_PEDIGREE[name];
  if (!pedigree) return currentNAV;

  // Award bonus — accumulated hardware adds a permanent credibility premium
  const awardBonus = (pedigree.awards ?? []).reduce((sum, award) => {
    return sum + (AWARD_BONUS[award] ?? 0) * 0.4; // 40% residual value per award
  }, 0);

  // All-Star bonus — consistent selection signals sustained excellence
  const allStarBonus = (pedigree.allStarYears ?? 0) * 3;

  // Historical floor — proven players can't drop below 60% of their peak NAV
  // The more awards, the higher the floor (max 80% of peak for Hart winners)
  const awardCount  = (pedigree.awards ?? []).length;
  const floorPct    = Math.min(0.80, 0.55 + awardCount * 0.04);

  // For skaters: floor based on peak pts pace
  if (pedigree.peakPtsPace) {
    const historicalFloorNAV = (pedigree.peakPtsPace / 82) * 25 * floorPct;
    return Math.max(currentNAV, historicalFloorNAV + awardBonus + allStarBonus);
  }

  return currentNAV + awardBonus + allStarBonus;
};

const getGoalieHistoricalFloor = (name: string, currentNAV: number): number => {
  const pedigree = PLAYER_PEDIGREE[name];
  if (!pedigree) return currentNAV;

  const awardBonus = (pedigree.awards ?? []).reduce((sum, award) => {
    return sum + (AWARD_BONUS[award] ?? 0) * 0.35;
  }, 0);

  const allStarBonus = (pedigree.allStarYears ?? 0) * 2.5;

  // Goalie floor: based on career GSAx (sustained excellence over multiple seasons)
  const awardCount = (pedigree.awards ?? []).length;
  const floorPct   = Math.min(0.75, 0.50 + awardCount * 0.05);
  const peakFloor  = (pedigree.peakGsax ?? 0) * floorPct * 1.8;

  return Math.max(currentNAV, peakFloor + awardBonus + allStarBonus);
};

// ============================================================
// 2026 NHL DRAFT — Post-lottery slot assignments
// Source: NHL.com, May 5 2026 lottery results
// ============================================================
const DRAFT_2026_SLOT_BY_TEAM_PICK: Record<string, number[]> = {
  TOR: [1],       // Won lottery (28th place)
  SJS: [2],       // Won lottery (22nd place)
  VAN: [3],       // 32nd place
  CHI: [4],       // Won lottery (31st place)
  NYR: [5],       // 29th place
  CGY: [6],       // 30th place
  SEA: [7],       // 27th place
  WPG: [8],       // 26th place
  FLA: [9],       // 25th place
  NSH: [10],      // 24th place
  STL: [11, 15],  // Two picks: own + acquired from NYI and DET
  UTA: [13],      // Utah Mammoth
  NJD: [14],      // 21st place
  EDM: [16],      // Last non-playoff team
  VGK: [17],      // Eliminated in playoffs
  WSH: [18],
  PHI: [19],      // STL also has a pick here via trade
  PIT: [20],
  OTT: [32],      // Locked as penalty
};
const getXNAV = (asset: Asset): XNAVResult => {
  // ----- DRAFT PICKS -----
  if (asset.position === "Pick") {
    const round    = asset.round    || 1;
    const year     = asset.year     || 2026;
    const standing = asset.teamStanding || 16;
    const yearDecay = Math.pow(0.88, year - 2026);

    // For 2026 first-round picks: use actual post-lottery slot if known
    let pickSlot: number;
    if (year === 2026 && round === 1) {
      const teamSlots = DRAFT_2026_SLOT_BY_TEAM_PICK[asset.teamId ?? ""];
      if (teamSlots && teamSlots.length > 0) {
        pickSlot = Math.min(...teamSlots);
      } else {
        // Playoff team or unknown — estimate from standing
        pickSlot = Math.max(17, Math.round(((33 - standing) / 32) * 16) + 17);
      }
    } else {
      // Future picks: standing-based with lottery discount
      // A last-place team's pick gets a ~25% lottery probability boost
      // but isn't worth as much as guaranteed slot 1
      const rawSlot = Math.round(((33 - standing) / 32) * 31) + 1;
      const lotteryDiscount = year === 2027 && round === 1 && standing > 24 ? 0.85 : 1.0;
      pickSlot = Math.max(1, Math.round(rawSlot * lotteryDiscount));
    }

    const roundDiscount = round === 1 ? 1.0 : round === 2 ? 0.38 : 0.15;

    // Pick value curve: #1 overall is worth ~$45M NAV equivalent
    // drops sharply — #10 is worth about half of #1
    const baseValue = 45.0 * Math.pow(0.83, pickSlot - 1) * roundDiscount * yearDecay;

    // Special bonus for top-3 picks in a strong class
    // 2026 has Gavin McKenna (generational talent) — #1 is worth a premium
    const topPickBonus = year === 2026 && pickSlot <= 3 ? (4 - pickSlot) * 8 : 0;

    return {
      total:  Math.max(1, baseValue + topPickBonus),
      off:    0, def: 0,
      age:    (baseValue + topPickBonus) * 0.4,
      cap:    0,
      upside: (baseValue + topPickBonus) * 0.4,
    };
  }

  // ----- GOALIES (G-NAV model with historical context) -----
  if (asset.position === "G") {
    const gamesG      = Math.max(1, asset.gamesStarted ?? asset.games ?? 1);
    const confidenceG = Math.min(1.0, Math.pow(gamesG / 45, 1.2));

    // Role detection — anything under 40 games is not a true starter
    // 30 games = backup/tandem regardless of per-game stats
    const isStarter = gamesG >= 40;
    const isBackup  = gamesG < 33;
    const isTandem  = !isStarter && !isBackup;

    const gsaxRaw     = safe(asset.gsax ?? 0);
    // Hard cap on per-game rate — hot streaks in limited starts don't extrapolate
    const gsaxPerGame       = gsaxRaw / gamesG;
    const gsaxPerGameCapped = isBackup
      ? Math.min(gsaxPerGame, 0.18)   // backup: very conservative cap
      : isTandem
      ? Math.min(gsaxPerGame, 0.28)   // tandem: moderate cap
      : Math.min(gsaxPerGame, 0.42);  // starter: generous cap
    const gsaxPer60   = gsaxPerGameCapped * 60;

    const GSAX_SD = 8.0;

    const pedigree   = PLAYER_PEDIGREE[asset.name];
    const careerMean = pedigree?.careerGsax
      ? Math.min(15, (pedigree.careerGsax / Math.max(1, pedigree.allStarYears ?? 1) / 60) * 15)
      : 0;

    const expGSAx = gsaxPer60 * confidenceG + careerMean * (1 - confidenceG);

    const goalieImpact = expGSAx >= 0
      ? Math.pow(expGSAx / GSAX_SD, 1.5) * 80
      : (expGSAx / GSAX_SD) * 40;

    // Backups get reduced workload bonus — they're not carrying 60 games
    const workloadBonus = isStarter
      ? Math.min(20, (gamesG / 60) * 15)
      : isTandem
      ? Math.min(10, (gamesG / 60) * 10)
      : Math.min(5,  (gamesG / 60) * 5);

    const peakAgeG    = 30;
    const agePenaltyG = asset.age > peakAgeG
      ? Math.pow(asset.age - peakAgeG, 1.8) * 1.2
      : 0;
    const ageFactorG  = Math.max(0.3, 1.05 - agePenaltyG / 100);

    const termMult       = Math.min(2.5, 1.0 + (asset.yearsRemaining || 1) * 0.15);
    const effectiveCap   = asset.capHit * (1 - (asset.retainedPct || 0));
    const capCostG       = effectiveCap * 1.6 * termMult;
    const retainedBonusG = (asset.retainedPct || 0) * asset.capHit * 10;

    const rawTotal = safe((goalieImpact + workloadBonus) * ageFactorG - capCostG + retainedBonusG);

    // Hard NAV caps by role — hot streaks in limited games can't push past these
    // Even elite starters are capped to keep goalie values in a sane range
    const roleCap     = isBackup ? 35 : isTandem ? 60 : 250;
    const cappedTotal = Math.min(rawTotal, roleCap);
    const totalG      = getGoalieHistoricalFloor(asset.name, cappedTotal);

    return {
      total:  totalG,
      off:    0,
      def:    safe(goalieImpact * ageFactorG),
      age:    -agePenaltyG,
      cap:    -(capCostG - retainedBonusG),
      upside: 0,
      noivImpact: 0,
      fArchetype: "",
    };
  }
  // 1. Bayesian Regularization
  // Position-adjusted baselines — reflect true NHL averages for qualifying skaters.
  // A C at 38pts is above average; a D at 38pts is elite.
  const PTS_BASE: Record<string, { mean: number; sd: number }> = {
    C: { mean: 30.0, sd: 22.0 },  // includes 4th-line centres
    W: { mean: 27.0, sd: 20.0 },  // includes 4th-line wingers
    L: { mean: 27.0, sd: 20.0 },
    R: { mean: 27.0, sd: 20.0 },
    D: { mean: 22.0, sd: 17.0 },  // includes stay-at-home types
  };
  const posBaseline = PTS_BASE[asset.position] ?? { mean: 34.0, sd: 22.0 };
  const SIGMA = { PTS_M: posBaseline.mean, PTS_SD: posBaseline.sd, DEF_M: 0.05, DEF_SD: 0.30 };
  const confidence = Math.min(1.0, Math.pow(Math.max(0, asset.games) / 45, 1.8));
  const expPts = safe(asset.ptsPace) * confidence + SIGMA.PTS_M * (1 - confidence);

  // defRate reliability filter:
  // The metric is only meaningful when:
  //   a) Player has high TOI (actually affects team possession)
  //   b) Player faces real competition (qocRank < 350)
  //   c) Sample is large enough (confidence > 0.6)
  // For sheltered players (Nyquist, 4th liners) the metric captures
  // opponent quality not individual defense — we discard it.
  const qocRank    = safe(asset.qocRank ?? 450);
  const avgTOI     = safe(asset.avgTOI);
  const rawDefRate = safe(asset.defRate);
  const defReliability =
    Math.min(1.0, avgTOI / 20) *        // low TOI = unreliable
    Math.min(1.0, (400 - qocRank) / 200) * // sheltered = unreliable
    confidence;                           // small sample = unreliable
  // Apply: clamp extreme values AND scale by reliability
  // This means Nyquist (toi=12.7, qoc=429) gets near-zero weight
  // while Morrissey (toi=24.7, qoc=106) gets full weight
  const clampedDef = asset.position === "D"
    ? Math.max(-0.25, Math.min(0.5, rawDefRate))
    : Math.max(-0.3,  Math.min(0.4, rawDefRate));
  const adjustedDef = clampedDef * defReliability;
  const expDef = adjustedDef * confidence + SIGMA.DEF_M * (1 - confidence);

  // 2. Z-scores
  const zPts = clamp((expPts - SIGMA.PTS_M) / SIGMA.PTS_SD, -3.5, 5.5);
  const zDef = clamp((expDef - SIGMA.DEF_M) / SIGMA.DEF_SD, -2.0, 2.5);

  // 3. Positional value weights + D-man archetype classification
  const toiWeight = Math.pow(clamp(safe(asset.avgTOI) / 18, 0.4, 2.0), 1.3);
  const isPillarD = asset.position === "D" && safe(asset.avgTOI) > 22;
  // posAdj: C is the most valuable position per unit of production
  // D-men get a bonus for elite minutes but should never exceed elite C value
  // Pillar D (22+ min) gets 1.6 — less than elite C at 1.45... wait:
  // The old 1.9 for pillar D was causing Bouchard > McDavid.
  // Real market: elite C = ~$12-14M, elite D = ~$9-11M. Ratio ~0.8x.
  const posAdj = isPillarD ? 1.35           // top-pair D: high but under C
    : asset.position === "C"  ? 1.45        // centre: highest value position
    : asset.position === "D"  ? 1.15        // depth D
    : 1.0;                                  // winger

  // D-man archetype — determines how we weight offense vs defense in TMV
  // OFFENSIVE D:  pts > 45                          → Bouchard, Makar, Fox
  // TWO_WAY D:    pts 28-45, toi > 21               → Morrissey, Josi, Ekman-Larsson
  // SHUTDOWN D:   pts < 28, toi > 19, qoc < 200     → Slavin, Giordano, Holl
  // DEPTH D:      toi < 19 or qoc > 300             → 5th/6th defender
  type DArchetype = "OFFENSIVE" | "TWO_WAY" | "SHUTDOWN" | "DEPTH";
  let dArchetype: DArchetype = "DEPTH";
  if (asset.position === "D") {
    const pts   = safe(asset.ptsPace);
    const toi   = safe(asset.avgTOI);
    const qoc   = safe(asset.qocRank ?? 450);
    if      (pts >= 45)                           dArchetype = "OFFENSIVE";
    else if (pts >= 28 && toi >= 21)              dArchetype = "TWO_WAY";
    else if (pts <  28 && toi >= 19 && qoc < 220) dArchetype = "SHUTDOWN";
    else                                           dArchetype = "DEPTH";
  }

  // 3b. QoC adjustment — shutdown D-men facing elite competition deserve credit.
  // Slavin (qoc=97) vs DeMelo (qoc=235) playing similar TOI is NOT the same job.
  const isHighTOI_D = asset.position === "D" && safe(asset.avgTOI) > 20;
  const qocBonus    = isHighTOI_D
    ? Math.max(0, (350 - qocRank) / 350) * 22 * (safe(asset.avgTOI) / 21)
    : 0;

  // Coach trust floor — elite minutes = real player, regardless of raw metrics
  const coachTrustFloor = asset.position === "D"
    ? Math.max(0, (safe(asset.avgTOI) - 18) * 3.5)
    : 0;

  // Shutdown D bonus — elite defensive specialists get explicit credit.
  // Slavin (qoc=97, toi=21.3) is enormously valuable even without points.
  // The bonus scales with competition difficulty and ice time.
  const shutdownBonus = dArchetype === "SHUTDOWN"
    ? Math.max(0, (220 - qocRank) / 220) * 55 * Math.min(1.0, safe(asset.avgTOI) / 21)
    : 0;

  // 4. Nonlinear impact
  // Exponent 1.6 (reduced from 1.9) — still rewards elite scorers nonlinearly
  // but prevents Bouchard/McDavid type explosion
  const offImpact = Math.sign(zPts) * Math.pow(Math.abs(zPts), 1.6) * 55;
  const defImpact = Math.sign(zDef) * Math.pow(Math.abs(zDef), 1.25) * 33 * toiWeight;

  // 5. Age / depreciation curve
  const isSuperstar = expPts > 80;
  const peakAge = isSuperstar ? 30 : 28;
  const agePenaltyRaw = asset.age > peakAge
    ? Math.pow(asset.age - peakAge, 1.65) * 1.4
    : 0;
  const ageFactor = Math.max(0.25, 1.1 - agePenaltyRaw / 100);

  // 6. True Market Value — archetype-based offense/defense weighting
  // For SHUTDOWN D, defImpact from xG is unreliable (team-polluted + hard matchups)
  // so we zero it out and rely on shutdownBonus + qocBonus instead.
  const defWeight = dArchetype === "OFFENSIVE" ? 0.18
                  : dArchetype === "TWO_WAY"   ? 0.25
                  : dArchetype === "SHUTDOWN"  ? 0.0   // bonuses carry the value
                  : asset.position === "D"     ? 0.20
                  : 0.30;
  const offWeight = dArchetype === "SHUTDOWN" ? 1.0 : 1 - defWeight;
  const rawMarketValue = safe((offImpact * offWeight + defImpact * defWeight) * posAdj * ageFactor);
  const trueMarketValue = Math.max(rawMarketValue + qocBonus + shutdownBonus, coachTrustFloor * ageFactor);

  // 7. Contract surplus (FIX: single penalty, not double)
  //    A player is worth their performance value minus what they're paid.
  //    We represent cap cost as a direct surplus subtractor.
  const perfPerMillion = Math.max(0, trueMarketValue / Math.max(1, asset.capHit));
  const capEfficiencyRatio = perfPerMillion;
  const termMultiplier  = Math.min(2.5, 1.0 + (asset.yearsRemaining || 1) * 0.15);
  // Apply retention — acquiring team pays reduced cap, boosting value
  const effectiveCapHit = asset.capHit * (1 - (asset.retainedPct || 0));
  const capCostNet      = effectiveCapHit * 1.5 * termMultiplier;

  // Overpay penalty — softened for young ascending players.
  // A 24-year-old on a bridge deal isn't "overpaid" relative to today's
  // production — the market prices in growth. Full penalty only at 27+.
  const overpayRaw = effectiveCapHit > trueMarketValue / 10
    ? Math.max(0, effectiveCapHit - trueMarketValue / 10) * 3.0
    : 0;
  const youngDiscount = asset.age < 27
    ? Math.max(0.15, (asset.age - 18) / 9)  // 18yo=15%, 22yo=44%, 26yo=89%
    : 1.0;
  const overpayPenalty = overpayRaw * youngDiscount;

  // 8. Age curve component (YNG/AGE bar)
  // ─────────────────────────────────────────────────────────────
  // Bayesian age premium/discount — independent of contract type.
  // Front offices price players relative to their PROJECTED peak,
  // not just current production. A 24-year-old on a bridge deal
  // IS more valuable than his stats alone suggest.
  //
  // Curve (inspired by hockey WAR research and market data):
  //   18-21: High YNG — pre-peak, maximum upside window
  //          weighted by on-ice performance (can't just be a bad
  //          player with youth premium)
  //   22-24: Moderate YNG — ascending but partially proven
  //   25-26: Small positive — still pre-peak, less uncertainty
  //   27-29: ZERO — peak years, pure production value
  //   30-33: Light negative — aging discount begins
  //   34+:   Hard negative — decline accelerating, esp on big $
  //
  // The premium scales with PRODUCTION QUALITY — a 21-year-old
  // with 60pts/82 gets full premium; one with 15pts/82 gets very
  // little. Proven on-ice performance validates the upside bet.
  // ─────────────────────────────────────────────────────────────
  const age = asset.age;
  const productionQuality = Math.min(2.0, safe(asset.ptsPace) / 45); // 1.0 at 45pts/82 pace

  const prospectTier  = PROSPECT_TIERS[asset.name];
  const pedigreeBonus = prospectTier
    ? (prospectTier.tier === 1 ? 30 : prospectTier.tier === 2 ? 15 : 7)
    : 0;

  let ageCurveRaw: number;
  if (age <= 21) {
    // Pre-peak: high upside, weighted by proven production
    // A 19-year-old who scores 50pts/82 is extremely rare and valuable
    const youthMultiplier = Math.pow(22 - age, 1.3); // 19yo > 20yo > 21yo
    ageCurveRaw = youthMultiplier * productionQuality * 18 + pedigreeBonus;
  } else if (age <= 24) {
    // Ascending: still pre-peak, more proven
    const youthMultiplier = Math.pow(25 - age, 1.2);
    ageCurveRaw = youthMultiplier * productionQuality * 12 + pedigreeBonus * 0.5;
  } else if (age <= 26) {
    // Late ascent: small premium, approaching peak
    ageCurveRaw = (27 - age) * productionQuality * 6;
  } else if (age <= 29) {
    // Peak: zero age component — pure production value
    ageCurveRaw = 0;
  } else if (age <= 33) {
    // Early decline: light negative scaling
    const declineYears = age - 29;
    ageCurveRaw = -Math.pow(declineYears, 1.4) * 4;
  } else {
    // Hard decline: accelerating, especially brutal on big contracts
    const hardDecline = age - 33;
    const contractPenalty = Math.max(0, asset.capHit - 4) * 2; // extra penalty for albatross deals
    ageCurveRaw = -(Math.pow(hardDecline, 1.8) * 6 + contractPenalty);
  }

  const optionValue = safe(ageCurveRaw);

  // 9. Intangibles
  const intangibleBoost = trueMarketValue * ((asset.multiplier || 1.0) - 1.0) * 0.5;

  // 10. Retained salary bonus (if partner is retaining, home team benefits)
  const retainedBonus = (asset.retainedPct || 0) * asset.capHit * 12;

  const netSurplus = safe(
    trueMarketValue
    - capCostNet
    - overpayPenalty
    + optionValue
    + intangibleBoost
    + retainedBonus
  );

  // ── 11. NOIV Multiplier — baked into total, not just display ────
  // Archetype-routed: forwards and D-men weight the components differently.
  let preFloorTotal = netSurplus;
  let noivImpact    = 0;
  let fArchetype    = "";

  const hasNOIV = asset.xgRelTM != null && asset.xgaRelTM != null
    && asset.dzPct != null && asset.position !== "Pick"
    && asset.position !== "G" && (asset.games ?? 0) >= 20;

  if (hasNOIV) {
    // xgRelTM is already in percentage points (e.g. 1.2 = 1.2% better than teammates)
    // DO NOT divide by 100 — that was suffocating the xG signal
    const xgR  = asset.xgRelTM!;
    const xgaR = asset.xgaRelTM!;
    const dz   = asset.dzPct!;
    let sOnIce = 0;

    const isForward = ["C","W","L","R"].includes(asset.position);
    if (isForward) {
      const goals   = safe(asset.goalsPace ?? 0);
      const assists = safe(asset.assistsPace ?? 0);
      const pts     = safe(asset.ptsPace);
      const toi     = safe(asset.avgTOI);

      if      (goals > assists * 1.1 && pts >= 25)                    fArchetype = "SNIPER";
      else if (assists > goals * 1.8  && pts >= 30)                   fArchetype = "PLAYMAKER";
      else if (safe(asset.defRate) > 0.10 && toi >= 16 && pts >= 25)  fArchetype = "TWO_WAY";
      else if (toi < 14 && pts < 25)                                  fArchetype = "GRINDER";
      else                                                             fArchetype = "SCORER";

      // Multipliers rebalanced: xgR is now ~1-3 range, dz is ~0-1 range
      // dz multipliers reduced to 1-2 to avoid suffocating the xG signal
      if      (fArchetype === "SNIPER")     sOnIce = xgR * 2.5  - xgaR * 0.5;
      else if (fArchetype === "PLAYMAKER")  sOnIce = xgR * 2.2  - xgaR * 0.8  + (dz - 0.50) * 2.0;
      else if (fArchetype === "TWO_WAY")    sOnIce = xgR * 1.0  - xgaR * 2.5  + (dz - 0.50) * 3.0;
      else if (fArchetype === "GRINDER")    sOnIce = xgR * 0.8  - xgaR * 2.0  + (dz - 0.50) * 2.5;
      else                                  sOnIce = xgR * 1.8  - xgaR * 1.2  + (dz - 0.50) * 2.0;
    } else if (asset.position === "D") {
      if      (dArchetype === "SHUTDOWN")  sOnIce = xgR * 0.5  - xgaR * 3.0  + (dz - 0.50) * 4.0;
      else if (dArchetype === "OFFENSIVE") sOnIce = xgR * 1.8  - xgaR * 1.0;
      else                                 sOnIce = xgR * 1.2  - xgaR * 1.8  + (dz - 0.50) * 2.0;
    }

    const noivMult = Math.exp(clamp(sOnIce / 10, -0.4, 0.4)); // max ~1.5x boost or 0.67x drag
    preFloorTotal  = netSurplus > 0 ? netSurplus * noivMult : netSurplus / Math.max(0.67, noivMult);
    noivImpact     = preFloorTotal - netSurplus;
  }

  // Apply historical floor — proven superstars can't be valued below their track record.
  const historicalTotal = getHistoricalFloor(asset.name, preFloorTotal);

  // Apply shutdown D pedigree floor — elite defensive specialists get a minimum
  const shutdownPedigree = SHUTDOWN_D_PEDIGREE[asset.name];
  const shutdownPedigreeFloor = shutdownPedigree ? shutdownPedigree.navFloor : -Infinity;

  // Apply prospect floor — only for players explicitly in PROSPECT_TIERS
  const prospect = PROSPECT_TIERS[asset.name];
  const finalTotal = prospect
    ? Math.max(historicalTotal, shutdownPedigreeFloor, prospect.navFloor * Math.max(0.5, 1 - (asset.age - 18) * 0.04))
    : shutdownPedigreeFloor > -Infinity
      ? Math.max(historicalTotal, shutdownPedigreeFloor)
      : historicalTotal;

  // ELC floor — players on entry-level or minimum contracts (≤$950K) can never
  // be negative assets.
  const isELC = asset.capHit <= 0.95 && asset.age <= 25;
  const elcFloor = isELC ? 0 : -Infinity;

  // Auto-prospect floor — any player under 25 with under 12 NHL games
  // who earned a roster spot is a prospect by definition.
  // They have no negative value — worst case they get reassigned.
  // Floor scales with age: younger = more upside.
  const isUnprovenProspect = asset.age < 25
    && (asset.games ?? 0) < 12
    && asset.position !== "Pick"
    && asset.position !== "G";
  const autoprospectFloor = isUnprovenProspect
    ? Math.max(5, (25 - asset.age) * 2.5)  // age 24=2.5, age 22=7.5, age 20=12.5
    : -Infinity;

  // For display purposes, the DEF bar should show meaningful value.
  // SHUTDOWN D: show shutdownBonus + qocBonus (their actual contribution)
  // OFFENSIVE D: cap at ±30 — their defRate is polluted by hard matchups
  //              and they're not primarily valued for defense anyway
  // Everyone else: show raw defImpact * posAdj
  const defDisplay = dArchetype === "SHUTDOWN"
    ? safe(shutdownBonus + qocBonus)
    : dArchetype === "OFFENSIVE" && asset.position === "D"
    ? clamp(safe(defImpact * posAdj), -30, 30)
    : safe(defImpact * posAdj);

  return {
    total:       Math.max(finalTotal, elcFloor, autoprospectFloor),
    off:         safe(offImpact * posAdj),
    def:         defDisplay,
    age:         safe(ageCurveRaw),
    cap:         -(capCostNet + overpayPenalty),
    upside:      prospectTier ? prospectTier.ceiling : Math.max(0, ageCurveRaw),
    noivImpact:  safe(noivImpact),
    fArchetype,
  };
};

// ============================================================
// GM LOGIC ENGINE — v7.1
// What separates this from every other trade machine.
//
// Real GMs don't just match cap hits. They ask:
//   1. Does this fit our timeline? (contender vs rebuild)
//   2. Does this fix an actual hole, or create a logjam?
//   3. Are we giving the right SHAPE of assets back?
//   4. Does the partner have a rational reason to say yes?
//   5. Is there a CBA rule that makes this impossible?
//
// Each check produces a GmFlag with a severity:
//   HARD    — structurally illegal (cap, NMC, floor)
//   SOFT    — legally fine, but a real GM declines
//   WARN    — red flag worth noting
//   INFO    — context / positive signal
// ============================================================

type FlagSeverity = "HARD" | "SOFT" | "WARN" | "INFO";
type FlagCategory =
  | "CAP_VIOLATION" | "FLOOR_VIOLATION" | "CLAUSE"
  | "ELITE_BLOCKADE" | "TIMELINE_MISMATCH" | "REBUILD_LOGIC"
  | "CONTENDER_LOGIC" | "ASSET_SHAPE_MISMATCH" | "POSITIONAL_REDUNDANCY"
  | "ROSTER_HOLE" | "LEVERAGE_ASYMMETRY" | "RENTAL_TAX" | "AGE_CLIFF"
  | "DEAD_WEIGHT" | "FIRE_SALE" | "LOCKER_ROOM" | "RETAIN_ABUSE" | "GOOD";

interface GmFlag {
  severity: FlagSeverity;
  category: FlagCategory;
  headline: string;
  explanation: string;
  affectedAsset?: string;
  vetoesSide?: 0 | 1;
}

// ── NHL Division map ─────────────────────────────────────────
const DIVISIONS: Record<string, string> = {
  // Atlantic
  BOS: "Atlantic", BUF: "Atlantic", DET: "Atlantic", FLA: "Atlantic",
  MTL: "Atlantic", OTT: "Atlantic", TBL: "Atlantic", TOR: "Atlantic",
  // Metropolitan
  CAR: "Metropolitan", CBJ: "Metropolitan", NJD: "Metropolitan", NYI: "Metropolitan",
  NYR: "Metropolitan", PHI: "Metropolitan", PIT: "Metropolitan", WSH: "Metropolitan",
  // Central
  ARI: "Central", CHI: "Central", COL: "Central", DAL: "Central",
  MIN: "Central", NSH: "Central", STL: "Central", UTA: "Central", WPG: "Central",
  // Pacific
  ANA: "Pacific", CGY: "Pacific", EDM: "Pacific", LAK: "Pacific",
  SEA: "Pacific", SJS: "Pacific", VAN: "Pacific", VGK: "Pacific",
};

// ---- Team archetype classifier ----
type TeamMode = "CONTENDER" | "BUBBLE" | "RETOOLING" | "REBUILDING" | "TANKING";

const classifyTeam = (team: Team, roster: Asset[]): TeamMode => {
  // Trust the live phase field from the API first — it incorporates
  // phase overrides (e.g. WPG=Retooling despite #26 standing)
  if (team.phase === "Tanking")    return "TANKING";
  if (team.phase === "Rebuilding") return "REBUILDING";
  if (team.phase === "Retooling")  return "RETOOLING";
  if (team.phase === "Bubble")     return "BUBBLE";
  if (team.phase === "Contender")  return "CONTENDER";

  // Fallback: derive from standing + cap if phase is missing
  const capCeiling = 104;
  const capUsed = capCeiling - team.capSpace;
  if (team.standing <= 6  && capUsed > 85) return "CONTENDER";
  if (team.standing <= 14 && capUsed > 72) return "BUBBLE";
  if (team.standing > 24  && team.capSpace > 25) return "TANKING";
  if (team.standing > 18) return "REBUILDING";
  return "RETOOLING";
};

const positionalDepth = (assets: Asset[], position: string): number =>
  assets.filter((a) => {
    if (position === "C") return a.position === "C" && (a.ptsPace > 25 || a.avgTOI > 13);
    if (position === "D") return a.position === "D" && a.avgTOI > 18;
    return (a.position === "W" || a.position === "L" || a.position === "R") && (a.ptsPace > 20 || a.avgTOI > 11);
  }).length;

// How many quality players does a team have at a position AFTER removing outgoing assets
const rosterDepthAfterTrade = (
  fullRoster: Asset[],
  outgoing: Asset[],
  position: string
): number => {
  const remaining = fullRoster.filter(
    (p) => !outgoing.some((o) => o.id === p.id)
  );
  return positionalDepth(remaining, position);
};

// Is this team already identified as needing a position in db.ts needs array?
const teamNeedsPosition = (team: Team, position: string): boolean => {
  if (!team.needs?.length) return false;
  return team.needs.some(
    (n) => n.pos === position || n.pos === "Any"
  );
};

// Score how defensively dependent a team is (goalie + D quality)
// Higher = team relies more on defensive structure, can't afford to gut D corps
const defensiveDependencyScore = (roster: Asset[]): number => {
  const dmen = roster.filter((p) => p.position === "D");
  const eliteD = dmen.filter((p) => p.avgTOI > 22 && p.ptsPace > 35);
  const totalDTOI = dmen.reduce((s, p) => s + p.avgTOI, 0);
  // A team concentrated around 1-2 elite D is more dependent than one with 4 solid D
  return eliteD.length <= 1 ? 0.9 : eliteD.length === 2 ? 0.6 : 0.3;
};

const runGmLogic = (
  outgoing: Asset[],
  incoming: Asset[],
  teamHome: Team | null,
  teamPartner: Team | null,
  allHomeRoster: Asset[],
  allPartnerRoster: Asset[]
): GmFlag[] => {
  const flags: GmFlag[] = [];
  if (!teamHome || !teamPartner) return flags;

  const modeHome = classifyTeam(teamHome, allHomeRoster);
  const modePartner = classifyTeam(teamPartner, allPartnerRoster);
  const navOut = outgoing.reduce((s, a) => s + getXNAV(a).total, 0);
  const navIn = incoming.reduce((s, a) => s + getXNAV(a).total, 0);
  const homeNetGain = navIn - navOut;
  const maxNav = Math.max(Math.abs(navOut), Math.abs(navIn), 1);
  const imbalancePct = (Math.abs(homeNetGain) / maxNav) * 100;

  const outPlayers = outgoing.filter((a) => a.position !== "Pick");
  const inPlayers  = incoming.filter((a) => a.position !== "Pick");
  const outPicks   = outgoing.filter((a) => a.position === "Pick");
  const inPicks    = incoming.filter((a) => a.position === "Pick");

  // ── HARD: Cap ceiling — home ──
  const capDeltaHome = incoming.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0)
                     - outgoing.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0);
  const projCapHome = teamHome.capSpace - capDeltaHome;
  if (projCapHome < 0) flags.push({
    severity: "HARD", category: "CAP_VIOLATION",
    headline: "Cap Ceiling Breach",
    explanation: `This trade puts ${teamHome.name} $${Math.abs(projCapHome).toFixed(2)}M over the $88M NHL cap ceiling. The trade is structurally illegal as currently constructed. To fix it: add more outgoing salary, apply salary retention on incoming contracts, or reduce the total incoming cap hit.`,
    vetoesSide: 0,
  });

  // ── HARD: Cap ceiling — partner ──
  const capDeltaPartner = outgoing.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0)
                        - incoming.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0);
  const projCapPartner = teamPartner.capSpace - capDeltaPartner;
  if (projCapPartner < 0) flags.push({
    severity: "HARD", category: "CAP_VIOLATION",
    headline: "Partner Cap Breach",
    explanation: `This trade puts ${teamPartner.name} $${Math.abs(projCapPartner).toFixed(2)}M over the ceiling. The deal cannot be legally submitted until ${teamPartner.name} clears space — via waivers, a compliance buyout, or restructuring another deal.`,
    vetoesSide: 1,
  });

  // ── HARD: Cap floor ──
  const newCapUsedHome = 88 - projCapHome;
  if (newCapUsedHome < 65 && capDeltaHome < -3) flags.push({
    severity: "HARD", category: "FLOOR_VIOLATION",
    headline: "Cap Floor Violation",
    explanation: `${teamHome.name} would fall below the NHL's $65M cap floor. All 32 teams must spend a minimum of $65M on player salaries — going under the floor is illegal under the CBA.`,
    vetoesSide: 0,
  });

  // ── NMC/NTC Waiver Logic ─────────────────────────────────────
  // A player with an NMC isn't automatically a deal-killer.
  // Players waive their clauses when the destination makes sense:
  //   - Contender (wants to win a Cup)
  //   - Age 32+ (window closing, chasing a ring)
  //   - Home market / preferred city
  //   - Contract is being honoured (no retention abuse)
  // Below a certain waiver probability we downgrade to SOFT not HARD.

  const waiverProbability = (player: Asset, destination: Team | null): number => {
    if (!destination) return 0;
    let prob = 0.3; // base probability — players are generally reluctant

    // Contender bonus — biggest factor
    const destPhase = destination.phase ?? "Retooling";
    if (destPhase === "Contender") prob += 0.4;
    else if (destPhase === "Bubble") prob += 0.2;
    else if (destPhase === "Rebuilding" || destPhase === "Tanking") prob -= 0.2;

    // Age factor — veterans chasing rings are more likely to waive
    if (player.age >= 34) prob += 0.25;
    else if (player.age >= 31) prob += 0.1;
    else if (player.age <= 27) prob -= 0.15; // young players protect their leverage

    // Contract length — fewer years left = more willing to waive
    if ((player.yearsRemaining || 0) <= 2) prob += 0.15;
    else if ((player.yearsRemaining || 0) >= 6) prob -= 0.1;

    return Math.min(0.95, Math.max(0.05, prob));
  };

  const nmcOut = outPlayers.find((a) => a.hasNMC);
  if (nmcOut) {
    const prob    = waiverProbability(nmcOut, teamPartner);
    const pctStr  = `${Math.round(prob * 100)}%`;
    const likelyWaives = prob >= 0.60;
    flags.push({
      severity: likelyWaives ? "WARN" : "HARD",
      category: "CLAUSE",
      headline: likelyWaives
        ? `NMC — ${nmcOut.name} (~${pctStr} waiver probability)`
        : `NMC — ${nmcOut.name} unlikely to waive (${pctStr})`,
      explanation: likelyWaives
        ? `${nmcOut.name} holds a Full No-Movement Clause but ${teamHome.name} needs his written consent to proceed. At age ${nmcOut.age} heading to a ${teamPartner?.phase ?? "unknown"} team, the analytics suggest a ~${pctStr} probability he waives. ${nmcOut.age >= 32 ? "Veterans in the late stages of their career often waive for a legitimate Cup contender." : "The destination is attractive but not guaranteed to get his approval."} This isn't a hard block — it's a negotiation that needs to happen before the deal is finalised.`
        : `${nmcOut.name} holds a Full No-Movement Clause and the destination makes this a difficult ask. At age ${nmcOut.age} heading to a ${teamPartner?.phase ?? "unknown"} team, the waiver probability is only ~${pctStr}. Under the CBA, ${teamHome.name} cannot trade him without his written consent — and based on the destination, there is a real risk he exercises his veto. This deal cannot proceed without a direct conversation with the player.`,
      affectedAsset: nmcOut.name, vetoesSide: 0,
    });
  }

  const nmcIn = inPlayers.find((a) => a.hasNMC);
  if (nmcIn) {
    const prob    = waiverProbability(nmcIn, teamHome);
    const pctStr  = `${Math.round(prob * 100)}%`;
    const likelyWaives = prob >= 0.60;
    flags.push({
      severity: likelyWaives ? "WARN" : "HARD",
      category: "CLAUSE",
      headline: likelyWaives
        ? `NMC — ${nmcIn.name} (~${pctStr} waiver probability)`
        : `NMC — ${nmcIn.name} unlikely to waive (${pctStr})`,
      explanation: likelyWaives
        ? `${nmcIn.name} holds a Full No-Movement Clause requiring his consent to be traded. Going to ${teamHome.name} (${teamHome.phase ?? "unknown"}), the model puts waiver probability at ~${pctStr}. ${nmcIn.age >= 32 ? "At this stage of his career, a move to a winning situation likely appeals." : "The destination is competitive enough that he may agree."} Still requires direct player approval before the deal is official.`
        : `${nmcIn.name} holds a Full No-Movement Clause. Moving to ${teamHome.name} (${teamHome.phase ?? "unknown"}), the waiver probability is only ~${pctStr}. ${teamPartner.name} cannot trade him without his consent — and this destination doesn't obviously appeal to him. The deal is effectively blocked until player buy-in is confirmed.`,
      affectedAsset: nmcIn.name, vetoesSide: 1,
    });
  }

  // ── HARD: Retention over 50% ──
  if (outgoing.some((a) => (a.retainedPct || 0) > 0.5)) flags.push({
    severity: "HARD", category: "RETAIN_ABUSE",
    headline: "Retention Exceeds 50% Cap",
    explanation: `The NHL CBA prohibits retaining more than 50% of any player's cap hit in a trade. Adjust the retention slider to 50% or below.`,
  });

  // ── SOFT: Elite Blockade ──
  const partnerElites = incoming.filter((a) => getXNAV(a).total > 260);
  const homeElites    = outgoing.filter((a) => getXNAV(a).total > 200);
  if (partnerElites.length > 0 && homeElites.length === 0) {
    const requiredOverpay = navIn * 0.18;
    if (navOut < navIn + requiredOverpay) flags.push({
      severity: "SOFT", category: "ELITE_BLOCKADE",
      headline: `${teamPartner.name} protects ${partnerElites[0].name.split(" ").pop()}`,
      explanation: `${partnerElites[0].name} is a franchise cornerstone — a player teams build entire cap structures around. ${teamPartner.name}'s GM only moves him if ${teamHome.name} sends back either (a) a comparable Tier-1 asset, or (b) a package so overwhelming it accelerates their rebuild by 3+ years. The current offer doesn't meet either threshold. Historically, blockbuster deals like this (Gaudreau, Huberdeau, Karlsson) required massive prospect and pick hauls to get across the finish line. This package would get laughed out of the room.`,
      affectedAsset: partnerElites[0].name, vetoesSide: 1,
    });
  }

  // ── WARN: Same-division trade ────────────────────────────────
  // Intra-division trades are rare in the NHL because you're directly
  // strengthening a direct competitor. GMs avoid them unless the value
  // is overwhelming or they're a seller trading to a non-contender.
  const divHome    = DIVISIONS[teamHome.id];
  const divPartner = DIVISIONS[teamPartner.id];
  if (divHome && divPartner && divHome === divPartner) {
    const bothCompetitive = (modeHome !== "REBUILDING" && modeHome !== "TANKING") &&
                            (modePartner !== "REBUILDING" && modePartner !== "TANKING");
    flags.push({
      severity: bothCompetitive ? "WARN" : "INFO",
      category: "LEVERAGE_ASYMMETRY",
      headline: `Same-division trade — ${divHome} rivals`,
      explanation: `${teamHome.name} and ${teamPartner.name} play in the same ${divHome} Division and face each other ${bothCompetitive ? "six" : "four"} times a year. Intra-division trades are the rarest in the NHL — GMs are deeply reluctant to hand a direct rival an upgrade. ${
        bothCompetitive
          ? `Both teams are competitive, which makes this even more unusual. The receiving team gets a player they'll immediately use against their trading partner. This trade would require overwhelming value on one side or an extraordinary circumstance (divorce, buy-out demand, injury emergency) to actually happen.`
          : `One team is rebuilding, which makes this slightly more palatable — a seller trading veterans to a divisional rival for futures is more common than two contenders swapping impact players.`
      }`,
    });
  }
  // A GM will never trade from a position of weakness, even for
  // equal or better value back. The Jets won't trade Scheifele
  // even if they're getting a centre back — they need to maintain
  // minimum viable roster depth at every position before and after.
  //
  // Minimum viable NHL roster (18 skaters + 2 goalies):
  //   C:  2 quality centres (ptsPace > 45) — you simply can't ice
  //       a competitive team without two capable centres
  //   W:  3 quality wingers (ptsPace > 35)
  //   D:  3 quality defencemen (avgTOI > 20) — need 3 pairs
  //   G:  1 quality starter
  //
  // "Quality" threshold matters — a 4th line centre doesn't count
  // as depth protection for a 1C slot.
  //
  // STAR PREMIUM EXCEPTION:
  // Hockey is more team-dependent than basketball — you can't win
  // on one player alone. BUT contenders in a Cup window rationally
  // trade depth for elite talent when:
  //   1. The incoming player is a genuine star (ptsPace > 65 or NAV > 180)
  //   2. The team is CONTENDER or BUBBLE
  //   3. After the trade they're still above a "survivable" floor
  //      (one level below minimum viable — e.g. 2 wingers not 3)
  // In this case the roster hole flag downgrades from SOFT → WARN.
  // ─────────────────────────────────────────────────────────────
  const POSITION_MINIMUMS: Record<string, { min: number; survivable: number; label: string }> = {
    C: { min: 2, survivable: 1, label: "centres"    },
    W: { min: 3, survivable: 2, label: "wingers"    },
    D: { min: 3, survivable: 2, label: "defencemen" },
    G: { min: 1, survivable: 1, label: "goalies"    },
  };

  // Is the incoming package a genuine star upgrade?
  // A star is someone who meaningfully raises the team's ceiling,
  // not just maintains depth. In hockey terms: ~65+ pts pace or
  // elite NAV — the kind of player who changes line combinations
  // and makes everyone around them better.
  const isStarUpgrade = (assets: Asset[]): boolean => {
    return assets.some(a =>
      a.position !== "Pick" && (
        a.ptsPace > 65 ||
        getXNAV(a).total > 180 ||
        (a.position === "G" && (a.gsax ?? 0) > 12)
      )
    );
  };

  const normalisePos = (pos: string) =>
    pos === "L" || pos === "R" ? "W" : pos;

  const qualityCount = (roster: Asset[], pos: string): number => {
    const p = normalisePos(pos);
    // "Quality" = actually deployed at the position with meaningful ice time
    // Thresholds are intentionally low — we want to catch REAL gaps, not penalize
    // teams for trading average players when average players are coming back
    if (p === "C") return roster.filter(a => normalisePos(a.position) === "C" && (a.ptsPace > 25 || a.avgTOI > 13)).length;
    if (p === "W") return roster.filter(a => normalisePos(a.position) === "W" && (a.ptsPace > 20 || a.avgTOI > 11)).length;
    if (p === "D") return roster.filter(a => normalisePos(a.position) === "D" && a.avgTOI > 18).length;
    if (p === "G") return roster.filter(a => normalisePos(a.position) === "G" && (a.gamesStarted ?? a.games) > 10).length;
    return 0;
  };

  const qualityCountAfter = (roster: Asset[], outgoing: Asset[], pos: string): number => {
    const remaining = roster.filter(a => !outgoing.some(o => o.id === a.id));
    return qualityCount(remaining, pos);
  };

  // Check HOME team — what are they giving away?
  const homeGivingUp = outPlayers;
  const positionsHomeLosing = [...new Set(homeGivingUp.map(a => normalisePos(a.position)))];

  for (const pos of positionsHomeLosing) {
    if (!POSITION_MINIMUMS[pos]) continue;
    const { min, survivable, label } = POSITION_MINIMUMS[pos];
    const before = qualityCount(allHomeRoster, pos);
    const after  = qualityCountAfter(allHomeRoster, homeGivingUp, pos);

    if (after < min) {
      const playersLeaving = homeGivingUp
        .filter(a => normalisePos(a.position) === pos)
        .map(a => a.name).join(" and ");

      const incomingAtPos = inPlayers.filter(a =>
        normalisePos(a.position) === pos && qualityCount([a], pos) > 0
      );
      const incomingFills = incomingAtPos.length > 0;

      // Skip flag for direct same-position swaps of comparable quality
      // e.g. trading a D-man and getting a D-man back of similar value
      const leavingNav   = homeGivingUp
        .filter(a => normalisePos(a.position) === pos)
        .reduce((s, a) => s + getXNAV(a).total, 0);
      const incomingNav  = incomingAtPos.reduce((s, a) => s + getXNAV(a).total, 0);
      // Direct swap: incoming fills same position at ≥50% value OR both are near-zero
      const bothNearZero = Math.abs(leavingNav) < 15 && Math.abs(incomingNav) < 15;
      const isDirectSwap = incomingFills && (incomingNav >= leavingNav * 0.5 || bothNearZero);
      if (isDirectSwap) continue;

      const starException = (modeHome === "CONTENDER" || modeHome === "BUBBLE")
        && after >= survivable
        && isStarUpgrade(inPlayers);

      flags.push({
        severity: starException ? "WARN" : "SOFT",
        category: "POSITIONAL_REDUNDANCY",
        headline: starException
          ? `${teamHome.name} trades depth for star power — calculated risk`
          : `${teamHome.name} can't drop below ${min} quality ${label}`,
        explanation: starException
          ? `${teamHome.name} drops to ${after} quality ${label} after this trade — below their usual threshold of ${min}, but still survivable at ${after}. This is a calculated contender move: trading proven depth to acquire elite star power.`
          : `${teamHome.name} currently has ${before} quality ${label} on their roster. Trading away ${playersLeaving} leaves them with only ${after} — below the minimum viable threshold of ${min}. ${
              incomingFills
                ? `A ${label.slice(0,-1)} is coming back at a lower quality level — the downgrade needs to be justified by what else is in the package.`
                : `No ${label.slice(0,-1)} is coming back in this deal, creating a roster hole that would need to be addressed separately.`
            } Real GMs run roster construction checks before accepting any deal — this one fails.`,
        vetoesSide: 0,
      });
    }
  }

  // Check PARTNER team — what are they giving away?
  const partnerGivingUp = inPlayers.filter((a) => a.position !== "Pick");
  const positionsPartnerLosing = [...new Set(partnerGivingUp.map(a => normalisePos(a.position)))];

  for (const pos of positionsPartnerLosing) {
    if (!POSITION_MINIMUMS[pos]) continue;
    const { min, survivable, label } = POSITION_MINIMUMS[pos];
    const before = qualityCount(allPartnerRoster, pos);
    const after  = qualityCountAfter(allPartnerRoster, partnerGivingUp, pos);

    if (after < min) {
      const playersLeaving = partnerGivingUp
        .filter(a => normalisePos(a.position) === pos)
        .map(a => a.name).join(" and ");

      const incomingAtPos = outPlayers.filter(a =>
        normalisePos(a.position) === pos && qualityCount([a], pos) > 0
      );
      const incomingFills = incomingAtPos.length > 0;

      // If they're trading a D and getting a D back of similar quality,
      // this is a position swap — don't flag as a roster hole
      const leavingNav    = partnerGivingUp
        .filter(a => normalisePos(a.position) === pos)
        .reduce((s, a) => s + getXNAV(a).total, 0);
      const incomingNav   = incomingAtPos.reduce((s, a) => s + getXNAV(a).total, 0);
      const bothNearZero  = Math.abs(leavingNav) < 15 && Math.abs(incomingNav) < 15;
      const isDirectSwap  = incomingFills && (incomingNav >= leavingNav * 0.5 || bothNearZero);

      // Skip flag entirely for direct position swaps of comparable quality
      if (isDirectSwap) continue;

      const starException = (modePartner === "CONTENDER" || modePartner === "BUBBLE")
        && after >= survivable
        && isStarUpgrade(outPlayers);

      flags.push({
        severity: starException ? "WARN" : "SOFT",
        category: "POSITIONAL_REDUNDANCY",
        headline: starException
          ? `${teamPartner.name} trades depth for star power — calculated risk`
          : `${teamPartner.name} can't drop below ${min} quality ${label}`,
        explanation: starException
          ? `${teamPartner.name} drops to ${after} quality ${label} — below their usual threshold of ${min}, but still survivable. This is the classic contender calculation: sacrifice depth to add a game-changing talent.`
          : `${teamPartner.name} currently has ${before} quality ${label}. Trading away ${playersLeaving} leaves them with only ${after} — below the minimum viable threshold of ${min}. ${
              incomingFills
                ? `A ${label.slice(0,-1)} is coming back, but at a lower quality level — ${teamPartner.name}'s GM would need to confirm this is an acceptable downgrade before proceeding.`
                : `Nothing coming back fills this hole. No GM willingly creates a critical positional gap without a direct replacement already identified.`
            }`,
        vetoesSide: 1,
      });
    }
  }

  // ── SOFT: Defensive Dependency ─────────────────────────────
  const tradingAwayD = outPlayers.filter((a) => a.position === "D");
  if (tradingAwayD.length > 0) {
    const depScore          = defensiveDependencyScore(allHomeRoster);
    const eliteDBeingTraded = tradingAwayD.filter((a) => a.avgTOI > 22 || getXNAV(a).total > 100);
    const dComingBack       = inPlayers.filter(a => a.position === "D" && (a.avgTOI > 20 || getXNAV(a).total > 60));

    // If a comparable D is coming back, this is a D-for-D swap — skip the flag
    const leavingDNav   = eliteDBeingTraded.reduce((s, a) => s + getXNAV(a).total, 0);
    const incomingDNav  = dComingBack.reduce((s, a) => s + getXNAV(a).total, 0);
    const isDForD       = dComingBack.length > 0 && incomingDNav >= leavingDNav * 0.6;

    if (depScore >= 0.6 && eliteDBeingTraded.length > 0 && !isDForD) {
      const dName           = eliteDBeingTraded[0].name;
      const remainingEliteD = qualityCountAfter(allHomeRoster, eliteDBeingTraded, "D");
      flags.push({
        severity: "SOFT",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `${teamHome.name}'s D corps can't absorb losing ${dName}`,
        explanation: `${teamHome.name}'s defensive structure is a known vulnerability. ${dName} (${eliteDBeingTraded[0].avgTOI.toFixed(1)} min/game) anchors their top pairing — trading him leaves ${remainingEliteD} quality defencemen. Nothing defensively meaningful is coming back. A forward, however talented, does not solve the underlying blue-line problem.`,
        affectedAsset: dName,
        vetoesSide: 0,
      });
    }
  }

  // Check PARTNER team losing a top-pairing D
  const partnerTradingAwayD = partnerGivingUp.filter((a) => a.position === "D");
  if (partnerTradingAwayD.length > 0) {
    const depScore          = defensiveDependencyScore(allPartnerRoster);
    const eliteDBeingTraded = partnerTradingAwayD.filter((a) => a.avgTOI > 22 || getXNAV(a).total > 100);
    const dComingBack       = outPlayers.filter(a => a.position === "D" && (a.avgTOI > 20 || getXNAV(a).total > 60));

    // If a comparable D is coming back, this is a D-for-D swap — skip the flag
    const leavingDNav   = eliteDBeingTraded.reduce((s, a) => s + getXNAV(a).total, 0);
    const incomingDNav  = dComingBack.reduce((s, a) => s + getXNAV(a).total, 0);
    const isDForD       = dComingBack.length > 0 && incomingDNav >= leavingDNav * 0.6;

    if (depScore >= 0.6 && eliteDBeingTraded.length > 0 && !isDForD) {
      const dName           = eliteDBeingTraded[0].name;
      const remainingEliteD = qualityCountAfter(allPartnerRoster, eliteDBeingTraded, "D");
      flags.push({
        severity: "SOFT",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `${teamPartner.name}'s D corps can't absorb losing ${dName}`,
        explanation: `${teamPartner.name}'s defensive structure is a known vulnerability. ${dName} (${eliteDBeingTraded[0].avgTOI.toFixed(1)} min/game) anchors their top pairing — trading him leaves ${remainingEliteD} quality defencemen. Nothing defensively meaningful is coming back. This creates a structural vulnerability that a forward can't paper over.`,
        affectedAsset: dName,
        vetoesSide: 1,
      });
    }
  }

  // ── SOFT: Contender selling prime asset without future return ──
  // A Bubble or Contender team trading away a high-NAV player straight-up
  // for another player (no picks, no prospects) is shortening their window.
  // This is only acceptable if the incoming player is BETTER, not just
  // comparable. Washington trading Chychrun for Morrissey is a lateral move
  // at best — they need additional assets to justify it.
  const partnerIsContending = modePartner === "CONTENDER" || modePartner === "BUBBLE";
  const partnerHighNavOut   = partnerGivingUp.filter(a => getXNAV(a).total > 100);
  const homeHasPicksOrProsp = outPlayers.some(a =>
    a.position === "Pick" || (PROSPECT_TIERS[a.name] != null)
  );
  // Check from PARTNER'S perspective — are they getting back comparable value?
  // navOut = what home sends = what partner receives
  // partnerGivingNav = what partner sends away
  const partnerGivingNav   = partnerHighNavOut.reduce((s, a) => s + getXNAV(a).total, 0);
  const partnerReceiving   = navOut; // Morrissey's NAV in this case
  // Partner accepts if they're getting back ≥90% of what they give — otherwise they need a sweetener
  const partnerGetsEnough  = partnerReceiving >= partnerGivingNav * 0.90;

  if (partnerIsContending && partnerHighNavOut.length > 0 && !homeHasPicksOrProsp && !partnerGetsEnough) {
    const topAsset = partnerHighNavOut.sort((a,b) => getXNAV(b).total - getXNAV(a).total)[0];
    flags.push({
      severity: "HARD",
      category: "TIMELINE_MISMATCH",
      headline: `${teamPartner.name} requires future assets to move ${topAsset.name}`,
      explanation: `${teamPartner.name} is a ${modePartner.toLowerCase()} team — they do not trade prime assets in straight player swaps. ${topAsset.name} is worth ${getXNAV(topAsset).total.toFixed(0)} NAV and is in the heart of their window. Accepting a comparable player with no picks or prospects attached gains them nothing strategically. Real GMs in ${teamPartner.name}'s position demand a sweetener for any deal of this magnitude — at minimum a mid-round pick to justify the inconvenience of a roster reshuffling. Add draft capital or a prospect to this package and the conversation changes entirely.`,
      affectedAsset: topAsset.name,
      vetoesSide: 1,
    });
  }

  // ── SOFT: Trading from an identified roster need ────────────
  for (const player of partnerGivingUp) {
    if (teamNeedsPosition(teamPartner, player.position)) {
      const needLabel = teamPartner.needs?.find((n) => n.pos === player.position)?.label ?? player.position;
      flags.push({
        severity: "SOFT",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `${player.name.split(" ").pop()} fills ${teamPartner.name}'s own stated need`,
        explanation: `${teamPartner.name} has internally identified "${needLabel}" as a priority acquisition. ${player.name} plays exactly that position. Trading him away is the direct opposite of the team's stated roster-building direction — you don't sell the asset you're desperately trying to buy.`,
        affectedAsset: player.name,
        vetoesSide: 1,
      });
      break;
    }
  }

  // ── SOFT: Contender acquiring picks instead of players ──
  if (modePartner === "CONTENDER" && inPicks.length > 0 && outPlayers.length === 0) flags.push({
    severity: "SOFT", category: "ASSET_SHAPE_MISMATCH",
    headline: `${teamPartner.name} needs players, not picks`,
    explanation: `${teamPartner.name} is in win-now mode. Contending teams don't trade their assets for draft picks that won't produce NHL players for 3–5 years — that's the opposite of what a team in a Stanley Cup window needs. ${teamPartner.name}'s GM would decline this and call teams that can send impact players.`,
    vetoesSide: 1,
  });

  // ── SOFT: Rebuilder gets no picks back ──
  if ((modePartner === "REBUILDING" || modePartner === "TANKING") && outPlayers.length > 0 && inPicks.length === 0 && inPlayers.every((a) => a.age > 30)) flags.push({
    severity: "SOFT", category: "ASSET_SHAPE_MISMATCH",
    headline: `${teamPartner.name} needs picks, not aging vets`,
    explanation: `${teamPartner.name} is rebuilding. They trade current assets to stockpile picks and prospects — not to receive aging veterans with limited upside. Accepting a package of 30+ year-olds with no draft capital advances their rebuild by exactly zero. Their GM would counter by demanding at least one first-round pick or a young cost-controlled prospect.`,
    vetoesSide: 1,
  });

  // ── SOFT: Rebuilder trading picks for a rental ──
  if ((modeHome === "REBUILDING" || modeHome === "TANKING") && outPicks.length > 0) {
    const rentals = inPlayers.filter((a) => (a.yearsRemaining || 0) <= 1 && a.age > 28);
    if (rentals.length > 0) flags.push({
      severity: "SOFT", category: "REBUILD_LOGIC",
      headline: "Rebuilder trading picks for a rental",
      explanation: `${teamHome.name} is in rebuild mode. Trading draft picks — their most valuable future currency — for ${rentals[0].name} (${rentals[0].yearsRemaining || 0}yr remaining) is textbook bad front-office decision-making. When the contract expires, ${teamHome.name} has nothing to show for it and has set the rebuild back. This is the kind of deal that triggers front-office reviews.`,
      affectedAsset: rentals[0].name, vetoesSide: 0,
    });
  }

  // ── SOFT: Contender giving picks for declining vets ──
  if (modeHome === "CONTENDER" && outPicks.length > 0) {
    const decliners = inPlayers.filter((a) => a.age > 33 && a.ptsPace < 45);
    if (decliners.length > 0) flags.push({
      severity: "SOFT", category: "CONTENDER_LOGIC",
      headline: "Picks for a declining player",
      explanation: `${teamHome.name} is in a Cup window and is trading first-round picks for ${decliners[0].name}, who is ${decliners[0].age} years old and producing at only ${decliners[0].ptsPace.toFixed(0)} pts/82. Contenders that mortgage their futures for players on the wrong side of the age curve almost always regret it. The risk-adjusted return here is deeply negative.`,
      affectedAsset: decliners[0].name, vetoesSide: 0,
    });
  }

  // ── WARN: Positional redundancy ──
  for (const asset of inPlayers) {
    const depth = positionalDepth(allHomeRoster, asset.position);
    if (depth >= 3 && asset.ptsPace > 50) {
      flags.push({
        severity: "WARN", category: "POSITIONAL_REDUNDANCY",
        headline: `Depth glut at ${asset.position}`,
        explanation: `${teamHome.name} already has ${depth} quality ${asset.position}s on the roster. Acquiring ${asset.name} doesn't fill a hole — it creates a healthy scratch situation or forces another trade to rebalance the lineup. Smart GMs prioritize need over overall value.`,
        affectedAsset: asset.name, vetoesSide: 0,
      });
      break;
    }
  }

  // ── WARN: Injury risk flag ────────────────────────────────────
  // Players with known fragility or chronic injury histories carry
  // real risk that the analytics can't capture. A GM acquiring an
  // injury-prone player at a premium is making a bet on availability.
  for (const asset of inPlayers) {
    const risk = INJURY_RISK[asset.name];
    if (risk && asset.capHit >= 4) {
      flags.push({
        severity: risk.level === "HIGH" ? "WARN" : "INFO",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `${asset.name.split(" ").pop()} — ${risk.level.toLowerCase()} injury risk`,
        explanation: `${asset.name} ($${asset.capHit}M, age ${asset.age}) carries a ${risk.level.toLowerCase()} injury risk flag: ${risk.note}. At this cap hit, an extended absence doesn't just hurt on-ice — it locks ${teamHome.name} into dead cap. The analytics assume full availability; the real-world value is lower. Any contract offer or trade package should include injury protection clauses or a discount to reflect this risk.`,
        affectedAsset: asset.name,
        vetoesSide: 0,
      });
    }
  }

  // ── WARN: Contract year leverage flag ──────────────────────
  // A player in their final contract year before UFA has massive
  // leverage. They can demand a trade to a contender, refuse to
  // sign an extension, or walk for nothing. This changes the
  // entire negotiating dynamic — the acquiring team is essentially
  // renting them, and the selling team knows it.
  for (const asset of [...outPlayers, ...inPlayers]) {
    const isUFAYear = (asset.yearsRemaining || 0) <= 1 && asset.age >= 27;
    const isHighValue = asset.ptsPace > 55 || (asset.position === "D" && asset.avgTOI > 22);
    if (isUFAYear && isHighValue) {
      const side = outPlayers.includes(asset) ? 0 : 1;
      const acquiringTeam = side === 0 ? teamPartner : teamHome;
      flags.push({
        severity: "WARN",
        category: "RENTAL_TAX",
        headline: `${asset.name.split(" ").pop()} is a contract-year UFA — leverage risk`,
        explanation: `${asset.name} (${asset.yearsRemaining || 0}yr remaining, age ${asset.age}) enters free agency this summer. ${acquiringTeam.name} is betting they can re-sign him — but he has all the leverage. He can take the qualifying offer, perform well, and walk to the highest bidder. History is full of teams paying a premium to acquire UFAs who signed elsewhere: Claude Giroux to Ottawa, Ryan O'Reilly out of Buffalo, Taylor Hall everywhere. The price should reflect the rental risk unless ${acquiringTeam.name} has reason to believe an extension is agreed in principle.`,
        affectedAsset: asset.name,
        vetoesSide: side,
      });
    }
  }

  // ── WARN: Rental tax ──
  const bestIn = [...inPlayers].sort((a,b) => getXNAV(b).total - getXNAV(a).total)[0];
  if (bestIn && (bestIn.yearsRemaining || 0) <= 1 && bestIn.ptsPace > 55 && outPicks.length > 0) flags.push({
    severity: "WARN", category: "RENTAL_TAX",
    headline: `Rental premium risk — ${bestIn.name.split(" ").pop()}`,
    explanation: `${bestIn.name} is a rental: ${bestIn.yearsRemaining || 0} year(s) remaining, likely a UFA in the summer. History is not kind to rental buyers — Tomas Vanek, Taylor Hall in Arizona, Ryan O'Reilly in Buffalo. You surrender picks now; the player walks in July. The expected value of this deal over a 5-year horizon heavily favours ${teamPartner.name}.`,
    affectedAsset: bestIn.name, vetoesSide: 0,
  });

  // ── WARN: Age cliff mid-contract ──
  for (const asset of inPlayers) {
    const ageAtEnd = asset.age + (asset.yearsRemaining || 1);
    if (asset.capHit > 7 && asset.age > 32 && ageAtEnd > 37) {
      flags.push({
        severity: "WARN", category: "AGE_CLIFF",
        headline: `${asset.name.split(" ").pop()} age cliff mid-deal`,
        explanation: `${asset.name} will be ${ageAtEnd} at contract expiry, locked in at $${asset.capHit.toFixed(1)}M/yr. NHL production falls off sharply around age 35–36. This contract will almost certainly become a cap anchor in years 2–3, limiting ${teamHome.name}'s flexibility to re-sign their own players or make moves.`,
        affectedAsset: asset.name, vetoesSide: 0,
      });
      break;
    }
  }

  // ── WARN: Mortgaging two 1sts ──
  if (modeHome === "CONTENDER" && outPicks.filter((p) => (p.round || 3) === 1).length >= 2) flags.push({
    severity: "WARN", category: "CONTENDER_LOGIC",
    headline: "Shipping two 1st-round picks",
    explanation: `${teamHome.name} is trading two 1st-round picks. Contenders occasionally move one to win now, but two is franchise-altering. Even Pittsburgh and Washington eventually paid the price for over-extending on picks. This trade must result in a championship to justify the long-term cost. If the Cup run fails, ${teamHome.name} faces a prolonged rebuild without the picks to accelerate it.`,
    vetoesSide: 0,
  });

  // ── WARN: Leverage asymmetry (bad contract in a cap-strapped team) ──
  const baggage = outPlayers.find((a) => a.capHit > 6 && a.age > 34 && (a.yearsRemaining||0) > 1);
  if (baggage && teamHome.capSpace < 5) flags.push({
    severity: "WARN", category: "LEVERAGE_ASYMMETRY",
    headline: `${baggage.name.split(" ").pop()} — difficult contract to move`,
    explanation: `${baggage.name} ($${baggage.capHit.toFixed(1)}M × ${baggage.yearsRemaining}yr, age ${baggage.age}) is a contract very few teams want to absorb. With ${teamHome.name} already tight against the ceiling, the teams that could theoretically take on this contract hold significant leverage. Expect ${teamPartner.name} to demand a substantial sweetener just to take the cap hit.`,
    affectedAsset: baggage.name, vetoesSide: 1,
  });

  // ── INFO: Fire-sale windfall ──
  if (homeNetGain > 60 && getXNAV(incoming[0] || outgoing[0]).total > 200) flags.push({
    severity: "INFO", category: "FIRE_SALE",
    headline: "Suspiciously favourable return",
    explanation: `This return looks unusually good for ${teamHome.name}. In real life, GMs only accept below-market returns under specific pressure: ownership mandating cost cuts, a player who has demanded a trade, or a deteriorating relationship. If none of those factors exist here, ${teamPartner.name} would simply call other teams and get a better offer. Trades this lopsided only happen in real life when there is context the public doesn't know about.`,
    vetoesSide: 1,
  });

  // ── INFO: Locker-room leadership loss ──
  const cultureAsset = outPlayers.find((a) => (a.multiplier||1.0) > 1.06 && a.ptsPace > 60);
  if (cultureAsset) flags.push({
    severity: "INFO", category: "LOCKER_ROOM",
    headline: `Culture loss — ${cultureAsset.name.split(" ").pop()}`,
    explanation: `${cultureAsset.name} carries a positive intangible multiplier — he's a leader, a vocal presence, the kind of player who lifts the room. Trading him isn't just a statistical loss. Teams that have moved their culture anchors (St. Louis trading Pietrangelo, Florida trading Huberdeau) often describe a difficult transition period that doesn't show up in the analytics.`,
    affectedAsset: cultureAsset.name, vetoesSide: 0,
  });

  // ── SOFT: Significant value imbalance ──
  const navGapPct = Math.abs(homeNetGain) / Math.max(Math.abs(navOut), Math.abs(navIn), 1) * 100;
  const absGap = Math.abs(homeNetGain);
  if (absGap > 30 && navGapPct > 25) {
    const losingTeam  = homeNetGain < 0 ? teamHome  : teamPartner;
    const gainingTeam = homeNetGain < 0 ? teamPartner : teamHome;
    const losingNav   = homeNetGain < 0 ? navOut : navIn;
    const gainingNav  = homeNetGain < 0 ? navIn  : navOut;
    flags.push({
      severity: "SOFT",
      category: "ASSET_SHAPE_MISMATCH",
      headline: `${losingTeam.name} is significantly overpaying`,
      explanation: `The NAV analysis shows ${losingTeam.name} giving up ${losingNav.toFixed(0)} NAV points worth of assets and receiving only ${gainingNav.toFixed(0)} — a ${navGapPct.toFixed(0)}% gap. ${gainingTeam.name}'s GM has no incentive to accept this deal when they could simply wait for a better offer. Lopsided trades only happen under specific pressure: a player demanding a trade, a GM under ownership pressure to cut salary, or a team desperate to fill a critical hole before a deadline. Without that context, ${gainingTeam.name} holds all the leverage here.`,
      vetoesSide: homeNetGain < 0 ? 1 : 0,
    });
  }

  // ── INFO: Clean mutual deal ──
  // Only fires if: no hard/soft flags, NAV is reasonably balanced,
  // AND the value gap isn't large enough to suggest one team is being fleeced
  const hardFlags = flags.filter((f) => f.severity === "HARD");
  const softFlags = flags.filter((f) => f.severity === "SOFT");
  if (hardFlags.length === 0 && softFlags.length === 0 && navGapPct <= 15) flags.push({
    severity: "INFO", category: "GOOD",
    headline: "Mutually rational deal",
    explanation: `Both teams receive assets that match their organizational timeline. ${teamHome.name} (${modeHome}) and ${teamPartner.name} (${modePartner}) are each getting the shape of asset they need. No CBA violations, no logical vetoes, no major red flags on either side. This is the kind of trade that actually gets done at the deadline.`,
  });

  return flags;
};

// ============================================================
// TRADE EVALUATION ENGINE — v7.1
// ============================================================
const evaluateTrade = (
  outgoing: Asset[],
  incoming: Asset[],
  teamHome: Team | null,
  teamPartner: Team | null,
  allHomeRoster: Asset[],
  allPartnerRoster: Asset[]
): TradeVerdict => {
  if (!outgoing.length && !incoming.length) {
    return { status: "IDLE", message: "Add assets to evaluate", flags: [], metrics: nullMetrics() };
  }

  const navOut = outgoing.reduce((s, a) => s + getXNAV(a).total, 0);
  const navIn  = incoming.reduce((s, a) => s + getXNAV(a).total, 0);
  const homeNetGain = navIn - navOut;
  const ptsGain = incoming.reduce((s,a) => s+a.ptsPace,0) - outgoing.reduce((s,a) => s+a.ptsPace,0);
  const defGain = incoming.reduce((s,a) => s+a.defRate*(a.avgTOI/18),0) - outgoing.reduce((s,a) => s+a.defRate*(a.avgTOI/18),0);
  const capDelta = incoming.reduce((s,a) => s+a.capHit*(1-(a.retainedPct||0)),0) - outgoing.reduce((s,a) => s+a.capHit*(1-(a.retainedPct||0)),0);
  const maxNav = Math.max(Math.abs(navOut), Math.abs(navIn), 1);
  const variance = (Math.abs(homeNetGain) / maxNav) * 100;

  // ── Estimated Wins Added (EWA) ────────────────────────────────
  // Converts NAV delta into estimated standing wins for the home team.
  // Research basis: ~7 NAV ≈ 1 win above replacement at league average.
  // Marginal wins are harder to add the closer you are to a playoff spot:
  //   - Bottom-tier teams (standing 25-32): linear, 1 win per 7 NAV
  //   - Middle-tier (13-24): slightly compressed, harder to move needle
  //   - Playoff fringe (9-16): most compressed — marginal wins cost more
  //   - Already in playoffs (1-8): diminishing returns on wins
  const teamStanding = teamHome?.standing ?? 16;
  const marginFactor =
    teamStanding >= 25 ? 1.0 :   // rebuilders: full win value
    teamStanding >= 17 ? 0.85 :  // retooling: slight compression
    teamStanding >= 9  ? 0.70 :  // bubble: hard to move needle
                         0.55;   // contenders: already near ceiling
  const ewaPerNav = 1 / 7;
  const ewaHome = homeNetGain * ewaPerNav * marginFactor;

  // ── Contention Window Index (CWI) ────────────────────────────
  // Estimates how this trade affects the team's championship window.
  // Positive = window opens sooner or extends longer
  // Negative = window shortens or delays
  //
  // Factors:
  //   1. Asset age — young assets extend window, old assets don't
  //   2. Prospect value — PROSPECT_TIERS players add future floor
  //   3. Contract term — long surplus contracts extend window
  //   4. Phase alignment — acquiring assets that match team phase
  const calcAssetWindowImpact = (assets: Asset[], direction: 1 | -1): number => {
    return assets.reduce((sum, a) => {
      if (a.position === "Pick") {
        // Draft picks add future ceiling, especially high picks
        const pickValue = a.round === 1 ? 2.5 : a.round === 2 ? 1.0 : 0.3;
        return sum + direction * pickValue;
      }
      const nav = getXNAV(a).total;
      if (nav <= 0) return sum; // negative assets don't extend window

      // Age factor: peak value years before decline
      const peakAge = a.position === "G" ? 30 : 28;
      const yearsOfPeak = Math.max(0, peakAge - a.age + (a.yearsRemaining || 1));
      const ageFactor = Math.min(3.0, yearsOfPeak / 4);

      // Prospect bonus — high-tier prospects add option value
      const prospect = PROSPECT_TIERS[a.name];
      const prospectBonus = prospect
        ? prospect.tier === 1 ? 3.0
        : prospect.tier === 2 ? 1.5
        : 0.5
        : 0;

      // Contract surplus factor — cheap good players extend window more
      const surplus = Math.max(0, nav) / Math.max(1, a.capHit);
      const surplusFactor = Math.min(1.5, surplus / 15);

      return sum + direction * (ageFactor + prospectBonus + surplusFactor);
    }, 0);
  };

  const cwiGain = calcAssetWindowImpact(incoming, 1) + calcAssetWindowImpact(outgoing, -1);

  // Normalise CWI to a readable "years" scale
  // +3.0 CWI ≈ window extends/opens ~1 year sooner
  const cwiYears = cwiGain / 3.0;

  const flags = runGmLogic(outgoing, incoming, teamHome, teamPartner, allHomeRoster, allPartnerRoster);
  const hardFlags = flags.filter((f) => f.severity === "HARD");
  const softFlags = flags.filter((f) => f.severity === "SOFT");

  let status: TradeStatus = "PENDING";
  let message = "";

  if (hardFlags.length > 0) {
    status = "BLOCKED";
    message = hardFlags[0].headline;
  } else if (softFlags.length > 0) {
    status = "DECLINED";
    message = softFlags[0].headline;
  } else if (variance <= 10) {
    status = "FAIR";
    message = "Balanced Exchange";
  } else if (homeNetGain > 0) {
    status = "WIN";
    message = `+${homeNetGain.toFixed(1)} NAV Surplus`;
  } else {
    status = "LOSS";
    message = `${Math.abs(homeNetGain).toFixed(1)} NAV Overpay`;
  }

  return { status, message, flags, metrics: { navOut, navIn, homeNetGain, ptsGain, defGain, capDelta, variance, ewaHome, cwiYears } };
};

// ============================================================
// TYPES
// ============================================================
type TradeStatus = "IDLE" | "PENDING" | "FAIR" | "WIN" | "LOSS" | "BLOCKED" | "DECLINED";

interface TradeVerdict {
  status: TradeStatus;
  message: string;
  flags: GmFlag[];
  metrics: {
    navOut: number;
    navIn: number;
    homeNetGain: number;
    ptsGain: number;
    defGain: number;
    capDelta: number;
    variance: number;
    ewaHome: number;      // Estimated Wins Added for home team
    cwiYears: number;     // Contention Window shift in years
  };
  claudeAnalysis?: string;
  claudeLoading?: boolean;
}

// ============================================================
// UTILS
// ============================================================
const nullMetrics = () => ({
  navOut: 0, navIn: 0, homeNetGain: 0, ptsGain: 0,
  defGain: 0, capDelta: 0, variance: 0, ewaHome: 0, cwiYears: 0,
});

const SEVERITY_STYLES: Record<FlagSeverity, { dot: string; bg: string; border: string; text: string; label: string }> = {
  HARD:  { dot: "bg-red-500",    bg: "bg-red-950/20",    border: "border-red-700/40",    text: "text-red-300",    label: "bg-red-900/50 text-red-300 border-red-800/60" },
  SOFT:  { dot: "bg-orange-500", bg: "bg-orange-950/20", border: "border-orange-700/40", text: "text-orange-300", label: "bg-orange-900/50 text-orange-300 border-orange-800/60" },
  WARN:  { dot: "bg-amber-400",  bg: "bg-amber-950/15",  border: "border-amber-700/30",  text: "text-amber-300",  label: "bg-amber-900/40 text-amber-300 border-amber-800/50" },
  INFO:  { dot: "bg-sky-400",    bg: "bg-sky-950/15",    border: "border-sky-800/30",    text: "text-sky-300",    label: "bg-sky-900/40 text-sky-300 border-sky-800/50" },
};

const STATUS_CONFIG: Record<TradeStatus, { border: string; headerText: string; icon: string; bg: string }> = {
  IDLE:     { border: "border-ink-faint", headerText: "text-ink-ghost", icon: "—", bg: "bg-paper-inset" },
  PENDING:  { border: "border-ink-faint", headerText: "text-ink-mid",   icon: "…", bg: "bg-paper-inset" },
  FAIR:     { border: "border-blue-ink",  headerText: "text-blue-ink",  icon: "⚖", bg: "bg-paper-card" },
  WIN:      { border: "border-green-ink", headerText: "text-green-ink", icon: "↑", bg: "bg-paper-card" },
  LOSS:     { border: "border-amber-ink", headerText: "text-amber-ink", icon: "↓", bg: "bg-paper-card" },
  BLOCKED:  { border: "border-red-ink",   headerText: "text-red-ink",   icon: "✕", bg: "bg-paper-dark" },
  DECLINED: { border: "border-red-ink",   headerText: "text-red-ink",   icon: "✗", bg: "bg-paper-dark" },
};
// ============================================================
// MAIN COMPONENT
// ============================================================
export default function TradeMachine() {
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [db, setDb] = useState<{ teams: Team[]; players: Asset[] }>({ teams: [], players: [] });
  const [originalDb, setOriginalDb] = useState<{ teams: Team[]; players: Asset[] } | null>(null);
  // ^^^ always initialized with empty arrays so .filter() never throws before fetch completes
  const [teams, setTeams] = useState<[Team | null, Team | null]>([null, null]);
  const [blocks, setBlocks] = useState<[Asset[], Asset[]]>([[], []]);
  const [verdict, setVerdict] = useState<TradeVerdict | null>(null);
  const [evaluated, setEvaluated] = useState(false);
  const [expandedFlag,   setExpandedFlag]   = useState<number | null>(null);
  const [tradeRequest,   setTradeRequest]   = useState<Asset[] | null>(null);

  // ── Persistent trade simulation state ────────────────────────
  const [executedTrades, setExecutedTrades] = useState<{
    id: string;
    homeTeamName: string;
    partnerTeamName: string;
    outgoing: Asset[];
    incoming: Asset[];
    timestamp: number;
  }[]>([]);
  const [simResult, setSimResult]   = useState<string | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [showSimPanel, setShowSimPanel] = useState(false);
  const [showMemo, setShowMemo] = useState(false);

  useEffect(() => {
    fetch("/api/league")
      .then((r) => r.json())
      .then((data) => {
        if (!data.teams || !data.players) {
          setError(`API returned invalid data: ${JSON.stringify(data)}`);
          setBooting(false);
          return;
        }
        setDb(data);
        setOriginalDb(data);
        // Default to two teams we know have good data
        const edm = data.teams.find((t: Team) => t.id === "EDM") ?? data.teams[0] ?? null;
        const wpg = data.teams.find((t: Team) => t.id === "WPG") ?? data.teams[1] ?? null;
        setTeams([edm, wpg]);
        setBooting(false);
      })
      .catch((e) => {
        setError(`Network error: ${e.message}`);
        setBooting(false);
      });
  }, []);

  const allHomeRoster    = db.players.filter((p) => p.teamId === teams[0]?.id);
  const allPartnerRoster = db.players.filter((p) => p.teamId === teams[1]?.id);

  // ── Execute Trade — moves players between teams in db state ──
  const executeTrade = useCallback(() => {
    if (!teams[0] || !teams[1] || (!blocks[0].length && !blocks[1].length)) return;

    const outIds = new Set(blocks[0].map(a => a.id));
    const inIds  = new Set(blocks[1].map(a => a.id));

    // Move players in db
    setDb(prev => ({
      ...prev,
      players: prev.players.map(p => {
        if (outIds.has(p.id)) return { ...p, teamId: teams[1]!.id };
        if (inIds.has(p.id))  return { ...p, teamId: teams[0]!.id };
        return p;
      }),
    }));

    // Record the trade
    setExecutedTrades(prev => [...prev, {
      id:              `trade-${Date.now()}`,
      homeTeamName:    teams[0]!.name,
      partnerTeamName: teams[1]!.name,
      outgoing:        blocks[0],
      incoming:        blocks[1],
      timestamp:       Date.now(),
    }]);

    // Clear the blocks and verdict
    setBlocks([[], []]);
    setVerdict(null);
    setEvaluated(false);
    setSimResult(null);
    setShowSimPanel(true);
  }, [teams, blocks]);

  // ── Reset to original rosters ─────────────────────────────────
  const resetTrades = useCallback(() => {
    if (originalDb) {
      setDb(originalDb);
      setExecutedTrades([]);
      setSimResult(null);
      setShowSimPanel(false);
      setBlocks([[], []]);
      setVerdict(null);
    }
  }, [originalDb]);

  // ── Sim a Year — Claude Haiku projects one season forward ─────
  const simYear = useCallback(async () => {
    if (!teams[0] || executedTrades.length === 0) return;
    setSimLoading(true);
    setSimResult(null);

    // Build context from all executed trades
    const tradesSummary = executedTrades.map(t => {
      const outNames = t.outgoing.map(a => a.position === "Pick"
        ? `${a.year} ${a.round}rd pick`
        : `${a.name} (${a.position}, $${a.capHit}M)`).join(", ");
      const inNames  = t.incoming.map(a => a.position === "Pick"
        ? `${a.year} ${a.round}rd pick`
        : `${a.name} (${a.position}, $${a.capHit}M)`).join(", ");
      return `${t.homeTeamName} sent ${outNames} → received ${inNames} from ${t.partnerTeamName}`;
    }).join("\n");

    // Build post-trade rosters for both teams
    const homeRoster = db.players
      .filter(p => p.teamId === teams[0]!.id && p.position !== "Pick")
      .sort((a, b) => b.ptsPace - a.ptsPace)
      .slice(0, 12)
      .map(p => `${p.name} (${p.position}, ${p.ptsPace.toFixed(0)}pts/82, age ${p.age})`);

    const partnerTeam = teams[1];
    const partnerRoster = partnerTeam ? db.players
      .filter(p => p.teamId === partnerTeam.id && p.position !== "Pick")
      .sort((a, b) => b.ptsPace - a.ptsPace)
      .slice(0, 12)
      .map(p => `${p.name} (${p.position}, ${p.ptsPace.toFixed(0)}pts/82, age ${p.age})`) : [];

    const isRebuilding = ["Rebuilding","Tanking","Retooling"].includes(teams[0]!.phase ?? "");

    const prompt = `You are an NHL beat reporter writing a season-in-review column one year after a trade.

CRITICAL: Only reference players from the rosters listed below. Do not invent players.

TRADES EXECUTED:
${tradesSummary}

${teams[0]!.name} POST-TRADE ROSTER (top 12):
${homeRoster.join("\n")}
Phase: ${teams[0]!.phase} · Pre-trade standing: #${teams[0]!.standing}/32

${partnerTeam ? `${partnerTeam.name} POST-TRADE ROSTER (top 12):
${partnerRoster.join("\n")}
Phase: ${partnerTeam.phase} · Pre-trade standing: #${partnerTeam.standing}/32` : ""}

Write exactly 5 sections. Each section is 2-3 sentences maximum — be punchy, not verbose.

**THE TRADE, ONE YEAR LATER**
Key traded players' stat lines. Did it work as advertised?

**${teams[0]!.name.toUpperCase()}'S SEASON**
${isRebuilding
  ? `Rebuild focus: where did they finish? What draft pick did they land? One sentence on what that means for their timeline.`
  : `Standings finish and playoff result. One key moment.`}

**AROUND THE LEAGUE**
3 punchy bullets of notable things that happened this NHL season — a surprise Cup run, a star injury, a prospect breakout on another team, a trade that backfired. Make it feel like a real season.

**THE DRAFT LOTTERY**
${isRebuilding
  ? `${teams[0]!.name} is rebuilding — this matters. What pick did they get in the lottery? Who are the top 3 prospects in the class? What are the scouts saying about the player they're projected to select?`
  : `One sentence: who won the lottery, what team needed it most.`}

**VERDICT**
One sentence per team — right call or wrong call?

Today is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}. Use specific numbers. Never cut off mid-sentence.`;

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 900,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      setSimResult(data.content?.[0]?.text ?? "Simulation unavailable.");
    } catch {
      setSimResult("Simulation unavailable — please try again.");
    }
    setSimLoading(false);
  }, [teams, db, executedTrades]);

  useEffect(() => {
    if (evaluated) runEval();
  }, [blocks, teams]);

  // ── Claude GM Analysis ────────────────────────────────────────
  const generateClaudeAnalysis = useCallback(async () => {
    if (!verdict || !teams[0] || !teams[1]) return;

    setVerdict(v => v ? { ...v, claudeLoading: true, claudeAnalysis: undefined } : v);

    const outgoing = blocks[0];
    const incoming = blocks[1];

    const describeAssets = (assets: Asset[]) =>
      assets.map(a =>
        a.position === "Pick"
          ? `${a.year} ${a.round === 1 ? "1st" : a.round === 2 ? "2nd" : `${a.round}th`} round pick`
          : `${a.name} (${a.position}, age ${a.age}, $${a.capHit}M x ${a.yearsRemaining}yr, ${a.ptsPace.toFixed(0)} pts/82)`
      ).join(", ");

    const flagSummary = verdict.flags
      .filter(f => f.severity === "HARD" || f.severity === "SOFT")
      .map(f => `• [${f.severity}] ${f.headline}`)
      .join("\n");

    const prompt = `You are a senior NHL front office analyst writing an internal trade evaluation memo.

TRADE DETAILS:
${teams[0].name} (${teams[0].phase}, #${teams[0].standing}/32, $${teams[0].capSpace}M cap space) sends:
  ${describeAssets(outgoing)}

${teams[1].name} (${teams[1].phase}, #${teams[1].standing}/32, $${teams[1].capSpace}M cap space) sends:
  ${describeAssets(incoming)}

ANALYTICS:
- NAV balance: ${teams[0].name} nets ${verdict.metrics.homeNetGain > 0 ? "+" : ""}${verdict.metrics.homeNetGain.toFixed(0)} NAV points
- Estimated Wins Added: ${verdict.metrics.ewaHome > 0 ? "+" : ""}${verdict.metrics.ewaHome.toFixed(1)} wins in the standings
- Contention Window Shift: ${verdict.metrics.cwiYears > 0 ? "opens/extends by" : verdict.metrics.cwiYears < 0 ? "shortens by" : "neutral,"} ${Math.abs(verdict.metrics.cwiYears).toFixed(1)} years
- Production delta: ${verdict.metrics.ptsGain > 0 ? "+" : ""}${verdict.metrics.ptsGain.toFixed(1)} pts/82
- Cap impact: ${verdict.metrics.capDelta > 0 ? "+" : ""}${verdict.metrics.capDelta.toFixed(1)}M
- Value imbalance: ${verdict.metrics.variance.toFixed(0)}%
- Verdict: ${verdict.status}

GM LOGIC FLAGS:
${flagSummary || "None — trade passes all logic checks"}

Write a concise 3-paragraph front office memo. Each paragraph maximum 4 sentences. Cover:
1. What each team's motivation is and whether it aligns with their organizational direction
2. Whether the analytics support the trade — address BOTH teams' perspectives and what additional assets would make it fair
3. Your recommendation — be direct, one clear verdict

IMPORTANT: Today is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}. Use current knowledge — do not reference future events as pending if they have already occurred. Complete every sentence. Never cut off mid-paragraph.`;

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 700,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[Claude memo] API error:", data);
        setVerdict(v => v ? { ...v, claudeAnalysis: "Analysis unavailable — please try again.", claudeLoading: false } : v);
        return;
      }
      const text = data.content?.[0]?.text ?? "Analysis unavailable.";
      setVerdict(v => v ? { ...v, claudeAnalysis: text, claudeLoading: false } : v);
    } catch (e: any) {
      console.error("[Claude memo] fetch error:", e);
      setVerdict(v => v ? { ...v, claudeAnalysis: `Error: ${e.message}`, claudeLoading: false } : v);
    }
  }, [verdict, teams, blocks]);

  const runEval = useCallback(() => {
    const v = evaluateTrade(blocks[0], blocks[1], teams[0], teams[1], allHomeRoster, allPartnerRoster);
    setVerdict(v);
    setEvaluated(true);
  }, [blocks, teams, allHomeRoster, allPartnerRoster]);

  const navA = blocks[0].reduce((s, a) => s + getXNAV(a).total, 0);
  const navB = blocks[1].reduce((s, a) => s + getXNAV(a).total, 0);
  const homeNetGain = navB - navA;

  const capA = calcCapSpace(0, teams, blocks);
  const capB = calcCapSpace(1, teams, blocks);

  if (booting) return <LoadingScreen />;
  if (error) return <ErrorScreen msg={error} />;

  const sc = verdict ? STATUS_CONFIG[verdict.status] : STATUS_CONFIG.IDLE;

  return (
    <main className="min-h-screen antialiased select-none overflow-x-hidden bg-paper text-ink font-serif">
      <ContractSyncer />

      {/* Trade Proposal Engine Modal */}
      {tradeRequest && tradeRequest.length > 0 && (
        <TradeProposalEngine
          outgoingBlock={tradeRequest}
          homeTeam={teams[0]}
          allTeams={db.teams}
          allPlayers={db.players}
          navMap={Object.fromEntries(db.players.map(p => [p.id, getXNAV(p).total]))}
          onClose={() => setTradeRequest(null)}
          onLoadTrade={(partner, outgoing, incoming) => {
            const partnerTeam = db.teams.find(t => t.id === partner.id) ?? null;
            setTeams([teams[0], partnerTeam]);
            setBlocks([outgoing, incoming]);
            setTradeRequest(null);
            setEvaluated(false);
            setVerdict(null);
          }}
        />
      )}
      {/* ── Front Office Memo Modal ───────────────────────────── */}
      {showMemo && verdict?.claudeAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(28,20,10,0.75)', backdropFilter: 'blur(3px)' }}
          onClick={() => setShowMemo(false)}>
          <div className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{ background: '#f0e6cc', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', borderRadius: '2px' }}
            onClick={e => e.stopPropagation()}>

            {/* Memo letterhead */}
            <div className="px-8 pt-8 pb-4" style={{ borderBottom: '2px solid #1c140a' }}>
              <div className="text-center mb-4">
                <div className="text-[9px] uppercase tracking-[0.5em] mb-1" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                  Quant Front Office — Internal Memorandum
                </div>
                <div className="font-black text-2xl" style={{ fontFamily: "'Libre Baskerville', serif", color: '#1c140a' }}>
                  Trade Evaluation Report
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[10px]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                {[
                  ["TO",      "GM & Hockey Operations Leadership"],
                  ["FROM",    "Senior Front Office Analyst — Claude"],
                  ["DATE",    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
                  ["RE",      `${teams[0]?.name ?? 'Home'} ↔ ${teams[1]?.name ?? 'Partner'} Trade`],
                  ["VERDICT", verdict.status],
                  ["NAV",     `${verdict.metrics.homeNetGain > 0 ? '+' : ''}${verdict.metrics.homeNetGain.toFixed(0)} for ${teams[0]?.name ?? 'Home'}`],
                ].map(([label, val]) => (
                  <div key={label} className="flex gap-3">
                    <span className="font-black w-16 shrink-0" style={{ color: '#6b5030' }}>{label}:</span>
                    <span style={{ color: (label === "VERDICT" && (verdict.status === "WIN" || verdict.status === "FAIR")) ? '#1a5c2e'
                      : (label === "VERDICT" && (verdict.status === "BLOCKED" || verdict.status === "DECLINED")) ? '#b83020'
                      : '#1c140a' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Memo body */}
            <div className="px-8 py-6 relative">
              {/* Faint ruled lines like a memo pad */}
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, rgba(184,160,112,0.2) 28px)',
                backgroundSize: '100% 28px',
                top: '24px'
              }} />
              <p className="relative text-[12px] leading-[1.85]" style={{
                color: '#1c140a',
                fontFamily: "'Libre Baskerville', serif",
                whiteSpace: 'pre-wrap',
              }}>
                {verdict.claudeAnalysis}
              </p>
            </div>

            {/* Verdict stamp + disclaimer */}
            <div className="px-8 pb-6 flex items-end justify-between" style={{ borderTop: '1px solid #b8a070', paddingTop: '16px' }}>
              <div className="text-[9px]" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace", lineHeight: 1.6 }}>
                CONFIDENTIAL — Internal Use Only<br />
                Valuations are analytical estimates only.
              </div>
              <div style={{ transform: 'rotate(-4deg)', transformOrigin: 'center' }}>
                <div className="px-4 py-1.5 text-center font-black text-base uppercase tracking-widest" style={{
                  border: `3px solid ${['WIN','FAIR'].includes(verdict.status) ? '#1a5c2e' : '#b83020'}`,
                  color: ['WIN','FAIR'].includes(verdict.status) ? '#1a5c2e' : '#b83020',
                  fontFamily: "'Courier Prime', monospace",
                  opacity: 0.85,
                }}>
                  {verdict.status}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-8 py-3 flex justify-between items-center" style={{ borderTop: '1px solid #b8a070' }}>
              <button onClick={() => { setShowMemo(false); generateClaudeAnalysis(); }}
                className="text-[9px] font-black uppercase tracking-wider transition-opacity hover:opacity-60"
                style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                ↺ Regenerate
              </button>
              <button onClick={() => setShowMemo(false)}
                className="text-[9px] font-black uppercase tracking-wider px-4 py-1.5"
                style={{ background: '#1c140a', color: '#f0e6cc', fontFamily: "'Courier Prime', monospace", borderRadius: '2px' }}>
                Close ✕
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 pointer-events-none bg-newsprint" />

      <div className="relative w-full max-w-[1700px] mx-auto px-4 lg:px-6 py-6 lg:py-8 flex flex-col gap-5 overflow-x-hidden">

        <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end pb-5 border-b" style={{ borderColor: '#b8a070' }}>
          <div className="w-full">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: '#b83020' }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#b83020' }} />
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.4em]" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>Live Data Feed Active</span>
            </div>

            {/* Masthead */}
            <div style={{ borderTop: '4px double #1c140a', borderBottom: '4px double #1c140a', padding: '8px 0 6px', marginBottom: '4px' }}>
              <div className="text-center">
                <div className="text-[8px] uppercase tracking-[0.4em] mb-1" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                  Est. 2025 &nbsp;—&nbsp; Vol. VII &nbsp;—&nbsp; Trade Edition
                </div>
                <h1 className="font-black leading-none" style={{ color: '#1c140a', fontFamily: "'Libre Baskerville', Georgia, serif",
                  fontSize: 'clamp(1.8rem, 5vw, 3rem)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}>
                  The Hockey Ledger
                </h1>
                <div className="text-[8px] uppercase tracking-[0.3em] mt-1.5 hidden sm:block" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                  X-NAV Analytics &nbsp;·&nbsp; xG Suppression &nbsp;·&nbsp; GM Logic Engine &nbsp;·&nbsp; Live Statistics
                </div>
              </div>
            </div>
          </div>
          <div className="text-right mt-2 lg:mt-0 lg:ml-6 shrink-0">
            <div className="text-[9px] uppercase tracking-[0.35em] font-black mb-1" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>Home Net Gain</div>
            <div className={`text-3xl lg:text-4xl font-black font-mono tabular-nums transition-colors duration-500 ${Math.abs(homeNetGain) < 5 ? "text-sky-400" : homeNetGain > 0 ? "text-emerald-400" : "text-rose-500"}`}>
              {fmt(homeNetGain, 1)}
              <span className="text-sm ml-1.5 font-bold" style={{ color: '#9a7d58' }}>NAV</span>
            </div>
          </div>
        </header>

        <TugBar homeNetGain={homeNetGain} navA={navA} navB={navB} />

        {/* ── Main Trade Grid ── */}
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_260px_1fr] xl:grid-cols-[1fr_280px_1fr] gap-4 lg:gap-5 items-start">

          {/* Home panel */}
          <TradePanel idx={0} team={teams[0]} nav={navA} capSpace={capA} db={db} blocks={blocks}
            setTeams={setTeams} setBlocks={setBlocks} label="Your Franchise" accent="HOME"
            onRequestTrade={(a) => setTradeRequest([a])}
            onRequestBlockTrade={(block) => setTradeRequest(block)} />

          {/* Middle controls — on mobile sits between panels */}
          <div className="flex flex-col gap-3 lg:pt-8 order-last lg:order-none">
            {teams[0] && teams[1] && (
              <div className="grid grid-cols-2 gap-2">
                <ModeBadge team={teams[0]} roster={allHomeRoster} label="Home Mode" />
                <ModeBadge team={teams[1]} roster={allPartnerRoster} label="Partner Mode" />
              </div>
            )}

            <button onClick={runEval} disabled={!blocks[0].length && !blocks[1].length}
              className="w-full py-4 font-black uppercase tracking-widest text-[11px] transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed active:scale-[0.97] btn-stamp"
              onMouseEnter={e => (e.currentTarget.style.background = '#d43820')}
              onMouseLeave={e => (e.currentTarget.style.background = '#b83020')}>
              ✦ Run GM Audit ✦
            </button>

            {verdict && (verdict.status === "FAIR" || verdict.status === "WIN") && (
              <button onClick={executeTrade}
                className="w-full py-3 font-black uppercase tracking-widest text-[11px] transition-all duration-200 active:scale-[0.97] btn-green-ink">
                ✓ Execute Trade — File It
              </button>
            )}

            {executedTrades.length > 0 && (
              <button onClick={resetTrades}
                className="w-full py-2 font-black uppercase tracking-widest text-[10px] transition-all btn-ghost">
                ↺ Void All Trades
              </button>
            )}

            {(blocks[0].length > 0 || blocks[1].length > 0) && (
              <div className="grid grid-cols-2 gap-1.5">
                <MiniStat label="Out" val={blocks[0].length.toString()} />
                <MiniStat label="In" val={blocks[1].length.toString()} />
                <MiniStat label="Variance" val={verdict ? `${verdict.metrics.variance.toFixed(0)}%` : "—"} />
                <MiniStat label="Cap Δ" val={verdict ? `${verdict.metrics.capDelta > 0 ? "+" : ""}${verdict.metrics.capDelta.toFixed(1)}M` : "—"} />
              </div>
            )}

            {verdict && verdict.status !== "IDLE" && (
              <VerdictPanel verdict={verdict} sc={sc} expandedFlag={expandedFlag} setExpandedFlag={setExpandedFlag} onRequestClaudeAnalysis={generateClaudeAnalysis} onOpenMemo={() => setShowMemo(true)} />
            )}
          </div>

          <TradePanel idx={1} team={teams[1]} nav={navB} capSpace={capB} db={db} blocks={blocks}
            setTeams={setTeams} setBlocks={setBlocks} label="Trade Partner" accent="PARTNER"
            onRequestTrade={(a) => setTradeRequest([a])} />
        </div>

        {/* ── Executed Trades Log + Sim Panel ── */}
        {(executedTrades.length > 0 || showSimPanel) && (
          <div className="mt-6 bg-zinc-900/30 border border-zinc-800/40 rounded-2xl overflow-hidden">
            <div className="px-6 py-3 border-b border-zinc-800/40 flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600">
                Simulated Universe — {executedTrades.length} Trade{executedTrades.length !== 1 ? "s" : ""} Executed
              </span>
              <div className="flex items-center gap-2">
                <button onClick={simYear} disabled={simLoading || executedTrades.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-purple-950 border border-purple-800 text-purple-400 hover:bg-purple-900 disabled:opacity-40 transition-all">
                  {simLoading
                    ? <><div className="w-2.5 h-2.5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin"/>Simulating...</>
                    : <>⚡ Sim a Year</>}
                </button>
              </div>
            </div>

            {/* Trade log */}
            <div className="px-5 py-3 space-y-2">
              {executedTrades.map((t) => (
                <div key={t.id} className="flex items-start gap-3 text-[10px]">
                  <span className="text-emerald-500 font-black shrink-0">✓</span>
                  <div>
                    <span className="font-black text-zinc-300">{t.homeTeamName}</span>
                    <span className="text-zinc-600 mx-1.5">sent</span>
                    <span className="text-rose-400">{t.outgoing.map(a => a.name).join(", ")}</span>
                    <span className="text-zinc-600 mx-1.5">→ received</span>
                    <span className="text-cyan-400">{t.incoming.map(a => a.name).join(", ")}</span>
                    <span className="text-zinc-600 mx-1.5">from</span>
                    <span className="font-black text-zinc-300">{t.partnerTeamName}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Sim result */}
            {simResult && (
              <div className="border-t border-zinc-800/40 px-5 py-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="text-purple-500 text-[10px]">⚡</span>
                  <span className="text-[8px] font-black uppercase tracking-widest text-purple-600">
                    Claude · One Year Later
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap">{simResult}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Player Comparison + Cap Projection ── */}
        {(blocks[0].length > 0 || blocks[1].length > 0) && (
          <>
            <PlayerComparison
              outgoing={blocks[0]}
              incoming={blocks[1]}
              navMap={Object.fromEntries(
                [...blocks[0], ...blocks[1]].map(p => [p.id, getXNAV(p)])
              )}
            />
            <CapProjection
              homeTeam={teams[0]}
              partnerTeam={teams[1]}
              homeRoster={allHomeRoster}
              partnerRoster={allPartnerRoster}
              outgoing={blocks[0]}
              incoming={blocks[1]}
            />
          </>
        )}

        {(blocks[0].length > 0 || blocks[1].length > 0) && <BreakdownTable blocks={blocks} />}
        {/* ── Footer — Glossary & Methodology ── */}
        <footer className="mt-12 pt-8" style={{ borderTop: '2px solid #1c140a' }}>
          <div className="text-center mb-6">
            <div className="text-[9px] uppercase tracking-[0.5em] mb-1" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              Methodology & Glossary
            </div>
            <h2 className="text-xl font-black" style={{ fontFamily: "'Libre Baskerville', serif", color: '#1c140a' }}>
              How The Hockey Ledger Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
            {/* Valuation */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: '#1c140a', borderBottom: '1px solid #b8a070', fontFamily: "'Libre Baskerville', serif" }}>
                Player Valuation
              </div>
              <div className="space-y-3 text-[11px]" style={{ color: '#4a3820', lineHeight: 1.7 }}>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>NAV (Net Asset Value)</span>
                  <p className="mt-0.5">A player's overall trade value on a scale from roughly -100 to +1000. Combines offensive production, defensive contribution, contract cost, and age. Think of it as "how much is this player actually worth versus what they cost?" A positive NAV means the player is providing more value than their salary — a negative NAV means they're a contract liability.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>NOIV (Net On-Ice Value)</span>
                  <p className="mt-0.5">A contextual adjustment to NAV based on how much a player elevates their teammates. Uses three metrics: how much the team controls expected goals when the player is on ice vs off, how well they suppress the opposition relative to their linemates, and how often they start shifts in the defensive zone. A player with NOIV higher than NAV is a hidden gem — their raw stats undersell their actual impact.</p>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: '#1c140a', borderBottom: '1px solid #b8a070', fontFamily: "'Libre Baskerville', serif" }}>
                The Numbers Explained
              </div>
              <div className="space-y-3 text-[11px]" style={{ color: '#4a3820', lineHeight: 1.7 }}>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>OFF</span>
                  <p className="mt-0.5">Offensive impact — derived from points per 82 games and expected goals generated. Uses Bayesian regularization to account for sample size, so a player with 20 games gets pulled toward the league average until we have enough data to trust their numbers.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>DEF</span>
                  <p className="mt-0.5">Defensive value — for shutdown defencemen, this shows their competition-adjusted bonus (how hard their matchups are). For everyone else, it reflects on-ice vs off-ice expected goals against. Filtered by reliability — sheltered players on easy minutes get a near-zero DEF rating because the metric isn't meaningful for them.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>YNG / AGE</span>
                  <p className="mt-0.5">Youth option value or age penalty. Young players on cheap contracts get a premium because teams control their rights at below-market rates. Veterans past their peak get penalized as their production is expected to decline. Shows as YNG when positive (upside), AGE when negative (decline risk).</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>CAP</span>
                  <p className="mt-0.5">Contract cost penalty. A player paid more than their on-ice production justifies creates negative cap value — the team is spending money they could use elsewhere. Long bad contracts are penalized more than short ones because they're harder to escape.</p>
                </div>
              </div>
            </div>

            {/* Archetypes & GM Logic */}
            <div>
              <div className="font-black text-sm mb-3 pb-1" style={{ color: '#1c140a', borderBottom: '1px solid #b8a070', fontFamily: "'Libre Baskerville', serif" }}>
                Archetypes & GM Logic
              </div>
              <div className="space-y-3 text-[11px]" style={{ color: '#4a3820', lineHeight: 1.7 }}>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>D-Man Archetypes</span>
                  <p className="mt-0.5"><strong>Offensive D</strong> — 45+ pts/82, valued primarily for scoring and powerplay (Makar, Bouchard). <strong>Two-Way D</strong> — 28-45 pts/82 with heavy minutes, balanced value (Morrissey, Josi). <strong>Shutdown D</strong> — under 28 pts/82 but faces elite competition (QoC rank below 220), valued for defensive role not scoring (Slavin). <strong>Depth D</strong> — sheltered deployment, standard evaluation.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>EWA (Estimated Wins Added)</span>
                  <p className="mt-0.5">Translates NAV into actual standings wins. Roughly 7 NAV points equals one win above replacement, adjusted for where the team sits — wins are harder to add for teams already near the top of the standings.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>CWI (Contention Window Index)</span>
                  <p className="mt-0.5">Estimates how a trade affects a team's championship window. Positive numbers mean the window opens sooner or extends longer. Young players on cheap deals and high draft picks push CWI up. Aging veterans on long contracts push it down.</p>
                </div>
                <div>
                  <span className="font-black" style={{ fontFamily: "'Courier Prime', monospace" }}>GM Flags</span>
                  <p className="mt-0.5">The audit engine checks 15+ real-world factors a GM would consider: cap compliance, positional depth thresholds, NMC/NTC clause probability, timeline mismatch between team phases, defensive dependency, same-division conflicts, and value imbalance. HARD flags block the trade; SOFT flags warn but allow it.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center pt-4" style={{ borderTop: '1px solid #b8a070' }}>
            <p className="text-[9px] uppercase tracking-[0.4em]" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              Data: NHL API · MoneyPuck · CapWages &nbsp;·&nbsp; Models: X-NAV 7.2 · G-NAV · NOIV &nbsp;·&nbsp; AI: Claude Sonnet & Haiku
            </p>
            <p className="text-[8px] mt-1" style={{ color: '#b8a070', fontFamily: "'Courier Prime', monospace" }}>
              All valuations are analytical estimates, not financial advice. Player values fluctuate with injury, performance, and market conditions.
            </p>
          </div>
        </footer>

      </div>
    </main>
  );
}

// ============================================================
// TRADE PANEL
// ============================================================
function TradePanel({
  idx, team, nav, capSpace, db, blocks, setTeams, setBlocks, label, accent, onRequestTrade, onRequestBlockTrade
}: {
  idx: 0 | 1;
  team: Team | null;
  nav: number;
  capSpace: number;
  db: { teams: Team[]; players: Asset[] };
  blocks: [Asset[], Asset[]];
  setTeams: React.Dispatch<React.SetStateAction<[Team | null, Team | null]>>;
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
  label: string;
  accent: string;
  onRequestTrade?: (a: Asset) => void;
  onRequestBlockTrade?: (block: Asset[]) => void;
}) {
  const isLeft = idx === 0;

  return (
    <div className="relative border rounded-2xl p-4 lg:p-6 flex flex-col min-h-[400px] lg:min-h-[740px]" style={{
      background: '#ede4cc',
      borderColor: isLeft ? '#9a7d58' : '#b8a070',
    }}>
      {/* Badge */}
      <div className={`absolute -top-3 left-6 px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em] border`} style={{
        background: '#e8dab8',
        borderColor: '#b8a070',
        color: '#6b5030',
        borderRadius: '2px'
      }}>
        {accent}
      </div>

      {/* Section dateline */}
      <div className="mb-4 pb-3">
        <div className="text-[8px] font-black uppercase tracking-[0.5em] mb-1">
          {label}
        </div>
        <div className="flex justify-between items-end">
          <select
            className="bg-transparent outline-none cursor-pointer font-black leading-tight"
            style={{ fontSize: '1.35rem', color: '#1c140a', fontFamily: "'Libre Baskerville', Georgia, serif", maxWidth: '100%' }}
            value={team?.id ?? ""}
            onChange={(e) => {
              const found = db.teams.find((t) => t.id === e.target.value) ?? null;
              setTeams((prev) => { const n = [...prev] as [Team | null, Team | null]; n[idx] = found; return n; });
              setBlocks((prev) => { const n = [...prev] as [Asset[], Asset[]]; n[idx] = []; return n; });
            }}
          >
            {db.teams.map((t) => (
              <option key={t.id} value={t.id} style={{ background: '#e8dab8', color: '#1c140a' }}>
                {t.name}
              </option>
            ))}
          </select>

          <div className="text-right shrink-0 ml-3">
            <div className="font-black leading-none" style={{ fontSize: '1.4rem', color: '#1c140a', fontFamily: "'Courier Prime', monospace", fontStyle: 'italic' }}>
              {nav.toFixed(1)}
            </div>
            <div className="text-[8px] font-black uppercase tracking-widest">NAV</div>
            <div className="text-[9px] font-black px-1.5 py-0.5 mt-0.5" style={{
              fontFamily: "'Courier Prime', monospace",
              color: capSpace < 0 ? '#b83020' : '#1a5c2e',
              background: capSpace < 0 ? 'rgba(184,48,32,0.08)' : 'rgba(26,92,46,0.08)',
              border: `1px solid ${capSpace < 0 ? 'rgba(184,48,32,0.25)' : 'rgba(26,92,46,0.25)'}`,
            }}>
              {capSpace >= 0 ? `+${capSpace.toFixed(1)}M` : `${capSpace.toFixed(1)}M`}
            </div>
          </div>
        </div>
      </div>

      {/* Asset list */}
      <div className="flex-grow overflow-y-auto space-y-2 mb-4 pr-1">
        {blocks[idx].length === 0 && (
          <div className="flex items-center justify-center h-32 border-2 border-dashed" >
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">No assets on the block</span>
          </div>
        )}
        {blocks[idx].map((a) => (
          <AssetCard
            key={a.id}
            asset={a}
            idx={idx}
            blocks={blocks}
            setBlocks={setBlocks}
            onRequestTrade={onRequestTrade}
          />
        ))}
      </div>

      {/* Find Trade Partners button — only on outgoing (home) side with assets */}
      {idx === 0 && blocks[0].length > 0 && onRequestBlockTrade && (
        <button
          onClick={() => onRequestBlockTrade(blocks[0])}
          className="w-full py-2.5 font-black text-[10px] uppercase tracking-widest transition-all mb-2 flex items-center justify-center gap-2 btn-ink"
        >
          ⚡ Find Trade Partners for This Package
        </button>
      )}

      {/* Asset selector */}
      <AssetDropdown idx={idx} team={team} db={db} blocks={blocks} setBlocks={setBlocks} />
    </div>
  );
}

// ============================================================
// ASSET CARD — with retention slider and contract details
// ============================================================
function AssetCard({
  asset, idx, blocks, setBlocks, onRequestTrade
}: {
  asset: Asset;
  idx: 0 | 1;
  blocks: [Asset[], Asset[]];
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
  onRequestTrade?: (a: Asset) => void;
}) {
  const xnav = getXNAV(asset);
  const isPick = asset.position === "Pick";

  const updateAsset = (partial: Partial<Asset>) => {
    setBlocks((prev) => {
      const n = [...prev] as [Asset[], Asset[]];
      n[idx] = n[idx].map((a) => a.id === asset.id ? { ...a, ...partial } : a);
      return n;
    });
  };

  const removeAsset = () => {
    setBlocks((prev) => {
      const n = [...prev] as [Asset[], Asset[]];
      n[idx] = n[idx].filter((a) => a.id !== asset.id);
      return n;
    });
  };

  const navColor = xnav.total > 80 ? "text-emerald-400" : xnav.total > 20 ? "text-sky-400" : xnav.total > -20 ? "text-zinc-400" : "text-rose-400";

  return (
    <div className="p-3 transition-all">
      <div className="flex justify-between items-start mb-2.5">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {asset.headshot && (
            <img src={asset.headshot} alt={asset.name}
              className="w-8 h-8 object-cover shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <div className="min-w-0">
            <div className="font-black leading-tight truncate flex items-center gap-1.5"
              style={{ fontSize: '13px', color: '#1c140a' }}>
              {asset.name}
              {asset.hasNMC && <span className="text-[7px] px-1 font-black shrink-0" style={{ color: '#b83020', border: '1px solid #b83020',  }}>NMC</span>}
              {asset.hasNTC && !asset.hasNMC && <span className="text-[7px] px-1 font-black shrink-0" style={{ color: '#8a5c00', border: '1px solid #8a5c00',  }}>NTC</span>}
              {!asset.hasLiveStats && !isPick && <span className="text-[7px] px-1 font-black shrink-0" style={{ color: '#9a7d58', border: '1px solid #b8a070',  }}>EST</span>}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              {isPick
                ? `${asset.year} · ${asset.round === 1 ? "1st" : asset.round === 2 ? "2nd" : "3rd"} Round`
                : (() => {
                    const expiryYear = new Date().getFullYear() + (asset.yearsRemaining ?? 1);
                    return `${asset.position} · Age ${asset.age} · $${asset.capHit.toFixed(2)}M × ${asset.yearsRemaining}yr · Exp. ${expiryYear}`;
                  })()}
            </div>
            {/* Awards badges */}
            {PLAYER_PEDIGREE[asset.name]?.awards && PLAYER_PEDIGREE[asset.name].awards!.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {Array.from(new Set(PLAYER_PEDIGREE[asset.name].awards)).map((award) => {
                  const count = PLAYER_PEDIGREE[asset.name].awards!.filter(a => a === award).length;
                  return (
                    <span key={award} className="text-[7px] px-1 py-0.5 font-black" style={{ color: '#8a5c00', border: '1px solid rgba(138,92,0,0.4)',  }}>
                      {count > 1 ? `${count}× ` : ""}{award}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Prospect tier badge */}
            {PROSPECT_TIERS[asset.name] && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[7px] px-1 py-0.5 font-black" style={{
                  color: PROSPECT_TIERS[asset.name].tier === 1 ? '#1a2e5c' : PROSPECT_TIERS[asset.name].tier === 2 ? '#1a5c2e' : '#6b5030',
                  border: `1px solid ${PROSPECT_TIERS[asset.name].tier === 1 ? 'rgba(26,46,92,0.4)' : PROSPECT_TIERS[asset.name].tier === 2 ? 'rgba(26,92,46,0.4)' : 'rgba(107,80,48,0.4)'}`,
                  
                }}>
                  {PROSPECT_TIERS[asset.name].tier === 1 ? "★ FRANCHISE" : PROSPECT_TIERS[asset.name].tier === 2 ? "◆ TOP PROSPECT" : "◇ PROSPECT"}
                </span>
              </div>
            )}
            {/* Injury risk badge */}
            {INJURY_RISK[asset.name] && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[7px] px-1 py-0.5 font-black" style={{
                  color: '#b83020',
                  border: '1px solid rgba(184,48,32,0.4)',
                  fontFamily: "'Courier Prime', monospace"
                }} title={INJURY_RISK[asset.name].note}>
                  ⚕ {INJURY_RISK[asset.name].level} RISK
                </span>
              </div>
            )}
            {/* D-man archetype badge */}
            {asset.position === "D" && !isPick && (() => {
              const pts = asset.ptsPace ?? 0;
              const toi = asset.avgTOI ?? 0;
              const qoc = asset.qocRank ?? 450;
              let arch = "DEPTH D";
              let color = '#6b5030';
              let title = "5th/6th defender — limited deployment";
              if (pts >= 45) {
                arch = "OFFENSIVE D"; color = '#1a2e5c';
                title = "Offensive defenceman — primary value from scoring and powerplay";
              } else if (pts >= 28 && toi >= 21) {
                arch = "TWO-WAY D"; color = '#1a5c2e';
                title = "Two-way defenceman — contributes offensively and defensively";
              } else if (pts < 28 && toi >= 19 && qoc < 220) {
                arch = "SHUTDOWN D"; color = '#8a5c00';
                title = `Shutdown defenceman — faces elite competition (QoC rank: ${qoc}), valued for defensive role not scoring`;
              }
              return (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[7px] px-1 py-0.5 font-black" style={{
                    color, border: `1px solid ${color}40`,
                    fontFamily: "'Courier Prime', monospace"
                  }} title={title}>
                    {arch}
                  </span>
                </div>
              );
            })()}
            {/* Forward archetype badge */}
            {["C","W","L","R"].includes(asset.position) && !isPick && xnav.fArchetype && (() => {
              const archMap: Record<string, { color: string; title: string }> = {
                SNIPER:     { color: '#1a2e5c', title: "Sniper — primary value from goal generation" },
                PLAYMAKER:  { color: '#1a5c2e', title: "Playmaker — primary value from assist generation and play-driving" },
                TWO_WAY:    { color: '#8a5c00', title: "Two-Way Forward — balanced offense with strong defensive suppression" },
                GRINDER:    { color: '#b83020', title: "Grinder — defensive deployment, physical play, limited offensive upside" },
                SCORER:     { color: '#1a2e5c', title: "Scoring Forward — balanced offensive production" },
              };
              const cfg = archMap[xnav.fArchetype];
              if (!cfg) return null;
              return (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[7px] px-1 py-0.5 font-black" style={{
                    color: cfg.color,
                    border: `1px solid ${cfg.color}40`,
                    fontFamily: "'Courier Prime', monospace",
                  }} title={cfg.title}>
                    {xnav.fArchetype.replace("_", " ")}
                  </span>
                </div>
              );
            })()}

            {/* Surplus contract stamp */}
            {!isPick && (() => {
              const effectiveCap = asset.capHit * (1 - (asset.retainedPct || 0));
              const isSurplus = xnav.total > effectiveCap * 18 && xnav.total > 50;
              if (!isSurplus) return null;
              return (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[7px] px-1 py-0.5 font-black" style={{
                    color: '#1a5c2e',
                    border: '1px solid rgba(26,92,46,0.5)',
                    fontFamily: "'Courier Prime', monospace",
                  }} title="Surplus contract — this player's on-ice value significantly exceeds their cap hit.">
                    ★ SURPLUS CONTRACT
                  </span>
                </div>
              );
            })()}
            {/* Shutdown D pedigree badge */}
            {SHUTDOWN_D_PEDIGREE[asset.name] && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[7px] px-1 py-0.5 font-black" style={{
                  color: '#8a5c00',
                  border: '1px solid rgba(138,92,0,0.5)',
                  fontFamily: "'Courier Prime', monospace"
                }} title={SHUTDOWN_D_PEDIGREE[asset.name].note}>
                  ★ ELITE SHUTDOWN
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className={`text-xl font-black font-mono italic ${navColor}`}>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-black" style={{
            fontSize: '1.1rem',
            fontStyle: 'italic',
            color: xnav.total > 80 ? '#1a5c2e' : xnav.total > 20 ? '#1a2e5c' : xnav.total > -20 ? '#6b5030' : '#b83020',
            fontFamily: "'Courier Prime', monospace",
          }}>
            {fmt(xnav.total, 0)}
          </span>
          {xnav.noivImpact !== undefined && Math.abs(xnav.noivImpact) >= 2 && (
            <span className="text-[8px] font-black" style={{
              color: xnav.noivImpact > 0 ? '#1a5c2e' : '#b83020',
              fontFamily: "'Courier Prime', monospace",
              letterSpacing: '0.05em',
            }} title={`NOIV Impact: ${xnav.noivImpact > 0 ? '+' : ''}${xnav.noivImpact.toFixed(0)}. ${xnav.noivImpact > 0 ? 'Elevates teammates beyond raw stats.' : 'On-ice context reduces value vs raw stats.'}`}>
              {xnav.noivImpact > 0 ? '↑' : '↓'} {Math.abs(xnav.noivImpact).toFixed(0)} NOIV
            </span>
          )}
        </div>
          </div>
          {!isPick && (
            <button onClick={() => onRequestTrade?.(asset)} title="Generate trade proposals"
              className="font-bold leading-none transition-colors text-ink-faint text-[11px]">
              ⚡
            </button>
          )}
          <button onClick={removeAsset} className="font-bold leading-none transition-colors text-ink-faint text-[13px]">
            ✕
          </button>
        </div>
      </div>

      {/* GOALIE stat panel */}
      {asset.position === "G" && !isPick && (
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          {[
            { label: 'GSAx', val: (asset.gsax??0).toFixed(1), good: (asset.gsax??0) >= 0 },
            { label: 'SV%',  val: ((asset.savePct??0.9)*100).toFixed(1), good: (asset.savePct??0) >= 0.910 },
            { label: 'GP',   val: String(asset.gamesStarted ?? 0), good: true },
          ].map(s => (
            <div key={s.label} className="p-2 text-center">
              <div className="text-[7px] font-black uppercase tracking-tight mb-0.5">{s.label}</div>
              <div className="text-[11px] font-black" style={{ color: s.good ? '#1a5c2e' : '#b83020' }}>{s.val}</div>
            </div>
          ))}
          {/* Role badge */}
          <div className="col-span-3 px-2 py-1 flex justify-between items-center">
            {(() => {
              const gp = asset.gamesStarted ?? asset.games ?? 0;
              const isBackup  = gp < 33;
              const isStarter = gp >= 40;
              return (
                <span className="text-[7px] px-1 py-0.5 font-black" style={{
                  color: isStarter ? '#1a2e5c' : isBackup ? '#9a6b00' : '#6b5030',
                  border: `1px solid ${isStarter ? 'rgba(26,46,92,0.4)' : isBackup ? 'rgba(154,107,0,0.4)' : 'rgba(107,80,48,0.4)'}`,
                  fontFamily: "'Courier Prime', monospace",
                }} title={isBackup ? "Backup goalie — NAV capped at 55. Per-game rates on <25 starts are unreliable predictors of full-season value." : isStarter ? "Starter — played 35+ games, full valuation applied" : "Tandem — shared starter role"}>
                  {isBackup ? "BACKUP" : isStarter ? "STARTER" : "TANDEM"}
                </span>
              );
            })()}
            {PLAYER_PEDIGREE[asset.name]?.careerGsax && (
              <span className="text-[9px] font-black" style={{ color: '#1a2e5c', fontFamily: "'Courier Prime', monospace" }}>
                +{PLAYER_PEDIGREE[asset.name].careerGsax} career · Peak {PLAYER_PEDIGREE[asset.name].peakGsax}
              </span>
            )}
          </div>
        </div>
      )}

      {/* SKATER NAV breakdown bars */}
      {!isPick && asset.position !== "G" && (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>NAV Breakdown</span>
            <span
              className="text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center cursor-help shrink-0"
              style={{ color: '#9a7d58', border: '1px solid #c8b890' }}
              title="OFF: Offensive production value (pts/82 pace, xG). DEF: Defensive suppression (xG against, TOI quality). YNG: Option value from proven youth on cheap deal. CAP: Contract cost penalty — overpaid contracts drag total NAV."
            >i</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
            <MicroBar label="OFF" val={xnav.off} max={300} color="cyan"
              tooltip="Offensive impact — scoring production (pts/82, xG rate)" />
            <MicroBar label="DEF" val={xnav.def} max={150} color="emerald"
              tooltip="Defensive value — xG suppression weighted by ice time quality" />
            <MicroBar label={xnav.age > 0 ? "YNG" : "AGE"} val={xnav.age} max={80}
              color={xnav.age > 0 ? "violet" : "amber"}
              tooltip={xnav.age > 0
                ? "Youth premium — proven production on a cheap contract creates surplus value"
                : "Age penalty — decline curve discount for veterans past peak age"} />
            <MicroBar label="CAP" val={xnav.cap} max={100} color="rose" invert
              tooltip="Contract cost — overpaid contracts drag total NAV. Negative = cap hit exceeds on-ice value" />
          </div>
          {/* Peak pts for established skaters with pedigree */}
          {PLAYER_PEDIGREE[asset.name]?.peakPtsPace && (
            <div className="mt-1.5 px-1 py-1 flex justify-between items-center" style={{ borderTop: '1px solid #c8b890' }}>
              <span className="text-[7px] font-black uppercase tracking-tight" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>Career Peak</span>
              <span className="text-[9px] font-black" style={{ color: '#1a2e5c', fontFamily: "'Courier Prime', monospace" }}>
                {PLAYER_PEDIGREE[asset.name].peakPtsPace} pts/82
              </span>
            </div>
          )}
        </div>
      )}

      {/* Goalie G-NAV + CAP bars */}
      {!isPick && asset.position === "G" && (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span>G-NAV Breakdown</span>
            <span
              className="text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center cursor-help shrink-0 badge-rule"
              title="G-NAV: Goals Saved Above Expected (GSAx) — how many goals this goalie prevented vs an average starter. CAP: Contract cost penalty."
            >i</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <MicroBar label="G-NAV" val={xnav.def} max={150} color="emerald"
              tooltip="Goalie NAV — based on GSAx (goals saved above expected) from MoneyPuck" />
            <MicroBar label="CAP" val={xnav.cap} max={100} color="rose" invert
              tooltip="Contract cost — overpaid contracts drag total NAV" />
          </div>
        </div>
      )}

      {/* ── Player stat line (skaters only) ───────────────────── */}
      {!isPick && asset.position !== "G" && asset.hasLiveStats && (
        <div className="mt-2 pt-2" style={{ borderTop: '1px solid #c8b890' }}>
          {/* Box score row */}
          <div className="grid grid-cols-4 gap-1 mb-1.5">
            {[
              { label: 'GP',    val: asset.games.toString() },
              { label: 'G',     val: (asset.goalsPace  ? (asset.goalsPace  * asset.games / 82).toFixed(0) : '—') },
              { label: 'A',     val: (asset.assistsPace ? (asset.assistsPace * asset.games / 82).toFixed(0) : '—') },
              { label: 'PTS',   val: (asset.ptsPace ? (asset.ptsPace * asset.games / 82).toFixed(0) : '—') },
            ].map(s => (
              <div key={s.label} className="text-center p-1" style={{ background: '#dfd0a8', border: '1px solid #b8a070' }}>
                <div className="text-[7px] font-black uppercase tracking-tight" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>{s.label}</div>
                <div className="text-[11px] font-black" style={{ color: '#1c140a', fontFamily: "'Courier Prime', monospace" }}>{s.val}</div>
              </div>
            ))}
          </div>
          {/* Advanced row */}
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: 'TOI',   val: asset.avgTOI?.toFixed(1) ?? '—',   tooltip: 'Average time on ice per game (minutes)' },
              { label: 'xG/82', val: asset.xGPace?.toFixed(1)  ?? '—',  tooltip: 'Expected goals generated per 82 games' },
              { label: 'xG%+', val: asset.xgRelTM != null ? `${asset.xgRelTM > 0 ? '+' : ''}${asset.xgRelTM.toFixed(1)}` : '—', tooltip: 'xG% relative to teammates — positive means team controls more shots when this player is on ice vs off' },
              { label: 'QoC',   val: asset.qocRank?.toString() ?? '—',  tooltip: 'Quality of competition rank — lower = harder opponents faced' },
            ].map(s => (
              <div key={s.label} className="text-center p-1" title={s.tooltip} style={{ background: '#e8dab8', border: '1px solid #b8a070' }}>
                <div className="text-[7px] font-black uppercase tracking-tight" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>{s.label}</div>
                <div className="text-[10px] font-black" style={{ color: '#1a2e5c', fontFamily: "'Courier Prime', monospace" }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retention slider (only for eligible players) */}
      {asset.canRetain && !isPick && (
        <div className="mt-2 border-t border-zinc-800/50 pt-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[9px] text-zinc-600 font-black uppercase tracking-wider">Salary Retention</span>
            <span className="text-[9px] font-mono text-zinc-400 font-black">
              {(asset.retainedPct * 100).toFixed(0)}% (${(asset.capHit * asset.retainedPct).toFixed(2)}M)
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            step="5"
            value={(asset.retainedPct * 100).toFixed(0)}
            onChange={(e) => updateAsset({ retainedPct: parseFloat(e.target.value) / 100 })}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
          
          />
          <div className="flex justify-between text-[8px] text-zinc-700 font-black mt-0.5">
            <span>0%</span><span>25%</span><span>50% MAX</span>
          </div>
        </div>
      )}

      {/* Pick protection toggle */}
      {isPick && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-zinc-600 font-black uppercase tracking-wider">Protected</span>
          <button
            onClick={() => updateAsset({ isProtected: !asset.isProtected })}
            className={`text-[9px] font-black px-2 py-0.5 rounded border transition-colors ${
              asset.isProtected
                ? "bg-amber-900/30 border-amber-800/50 text-amber-400"
                : "bg-zinc-800 border-zinc-700 text-zinc-500"
            }`}
          >
            {asset.isProtected ? "Protected ↓" : "Unprotected"}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ASSET DROPDOWN
// ============================================================
function AssetDropdown({
  idx, team, db, blocks, setBlocks
}: {
  idx: 0 | 1;
  team: Team | null;
  db: { teams: Team[]; players: Asset[] };
  blocks: [Asset[], Asset[]];
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
}) {
  const label = idx === 0 ? "+ ADD OUTGOING ASSET" : "+ REQUEST INCOMING ASSET";

  const eligible = db.players
    .filter((p) => p.teamId === team?.id && !blocks[idx].some((a: Asset) => a.id === p.id))
    .sort((a, b) => {
      try {
        return getXNAV(b).total - getXNAV(a).total;
      } catch {
        return 0;
      }
    });

  const skaters = eligible.filter((p) => p.position !== "Pick");
  const picks = eligible.filter((p) => p.position === "Pick");

  return (
    <select
      className="w-full border p-3.5 rounded-xl font-black uppercase tracking-widest text-[9px] outline-none appearance-none cursor-pointer transition-colors"
      style={{ background: '#e8dab8', borderColor: '#b8a070', color: '#6b5030' }}
      onChange={(e) => {
        const asset = db.players.find((p) => p.id === e.target.value);
        if (asset) {
          setBlocks((prev) => {
            const n = [...prev] as [Asset[], Asset[]];
            n[idx] = [...n[idx], { ...asset, retainedPct: 0 }];
            return n;
          });
        }
        e.target.value = "";
      }}
      defaultValue=""
    >
      <option value="" disabled>{label}</option>
      {skaters.length > 0 && (
        <optgroup label="── SKATERS ──">
          {skaters.map((p) => (
            <option key={p.id} value={p.id} className="bg-zinc-900 text-sm">
              {p.name} [{p.position}] ${p.capHit.toFixed(1)}M — NAV {getXNAV(p).total.toFixed(0)}
            </option>
          ))}
        </optgroup>
      )}
      {picks.length > 0 && (
        <optgroup label="── DRAFT PICKS ──">
          {picks.map((p) => (
            <option key={p.id} value={p.id} className="bg-zinc-900 text-sm">
              {p.name} — NAV {getXNAV(p).total.toFixed(0)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// ============================================================
// TUG-OF-WAR BAR
// ============================================================
function TugBar({ homeNetGain, navA, navB }: { homeNetGain: number; navA: number; navB: number }) {
  const total = Math.max(navA + navB, 1);
  const leftPct = clamp((navA / total) * 100, 5, 95);

  return (
    <div className="w-full h-9 border rounded-2xl relative overflow-hidden flex items-center shadow-inner">
      <div className="absolute inset-0 flex">
        <div className="h-full bg-rose-500/8 transition-all duration-700 ease-out" style={{ width: `${leftPct}%` }} />
        <div className="h-full bg-emerald-500/8 transition-all duration-700 ease-out flex-1" />
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 h-full w-px bg-zinc-700/50" />
      <div className="z-10 w-full flex justify-between px-5 font-black text-[9px] uppercase tracking-[0.3em] text-zinc-700">
        <span className={homeNetGain < -5 ? "text-rose-500" : ""}>Outgoing Value</span>
        <span className="bg-zinc-950 text-zinc-300 px-3 py-1 rounded-lg border border-zinc-800 font-mono text-[10px] tracking-tight">
          {navA.toFixed(0)} ←→ {navB.toFixed(0)} NAV
        </span>
        <span className={homeNetGain > 5 ? "text-emerald-400" : ""}>Incoming Value</span>
      </div>
    </div>
  );
}

// ============================================================
// TEAM MODE BADGE
// ============================================================
function ModeBadge({ team, roster, label }: { team: Team; roster: Asset[]; label: string }) {
  const mode = classifyTeam(team, roster);
  const config: Record<TeamMode, { color: string; bg: string }> = {
    CONTENDER:  { color: "text-emerald-300", bg: "bg-emerald-950/40 border-emerald-800/50" },
    BUBBLE:     { color: "text-sky-300",     bg: "bg-sky-950/40 border-sky-800/50" },
    RETOOLING:  { color: "text-amber-300",   bg: "bg-amber-950/40 border-amber-800/50" },
    REBUILDING: { color: "text-orange-300",  bg: "bg-orange-950/40 border-orange-800/50" },
    TANKING:    { color: "text-rose-300",    bg: "bg-rose-950/40 border-rose-800/50" },
  };
  const c = config[mode];
  return (
    <div className={`border rounded-lg px-2 py-1.5 text-center ${c.bg}`}>
      <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5">{label}</div>
      <div className={`text-[10px] font-black uppercase tracking-tight ${c.color}`}>{mode}</div>
    </div>
  );
}

// ============================================================
// VERDICT PANEL — expandable GM flags
// ============================================================
function VerdictPanel({ verdict, sc, expandedFlag, setExpandedFlag, onRequestClaudeAnalysis, onOpenMemo }: {
  verdict: TradeVerdict;
  sc: typeof STATUS_CONFIG[TradeStatus];
  expandedFlag: number | null;
  setExpandedFlag: (i: number | null) => void;
  onRequestClaudeAnalysis: () => void;
  onOpenMemo: () => void;
}) {
  const flags = verdict.flags;
  const hardCount = flags.filter((f) => f.severity === "HARD").length;
  const softCount = flags.filter((f) => f.severity === "SOFT").length;
  const warnCount = flags.filter((f) => f.severity === "WARN").length;

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-500 ${sc.bg} ${sc.border}`}>
      {/* Status header */}
      <div className="px-5 py-4 border-b border-zinc-800/30">
        <div className="flex items-center justify-between mb-1">
          <div className={`text-2xl font-black italic uppercase leading-none tracking-tight ${sc.headerText}`}>
            {verdict.status}
          </div>
          <div className={`text-lg font-black font-mono ${sc.headerText}`}>{sc.icon}</div>
        </div>
        <div className="text-[10px] text-zinc-500 font-bold">{verdict.message}</div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {hardCount > 0 && <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-red-900/50 text-red-300 border border-red-800/50">{hardCount} HARD BLOCK{hardCount > 1 ? "S" : ""}</span>}
          {softCount > 0 && <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-orange-900/50 text-orange-300 border border-orange-800/50">{softCount} GM VETO{softCount > 1 ? "S" : ""}</span>}
          {warnCount > 0 && <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-800/40">{warnCount} WARNING{warnCount > 1 ? "S" : ""}</span>}
        </div>
      </div>

      {/* Metrics */}
      <div className="px-5 py-3 border-b border-zinc-800/30 font-mono space-y-1">
        <DeltaRow label="Production Δ"   val={verdict.metrics.ptsGain}   unit=" pts/82" />
        <DeltaRow label="Suppression Δ"  val={verdict.metrics.defGain}   unit=" rel" />
        <DeltaRow label="Cap Impact"      val={verdict.metrics.capDelta}  unit="M" invert />
        <DeltaRow label="Imbalance"       val={-verdict.metrics.variance} unit="%" />
        <div className="border-t border-zinc-800/30 pt-1 mt-1">
          <DeltaRow label="Est. Wins Added"     val={verdict.metrics.ewaHome}   unit="W" />
          <DeltaRow label="Window Shift"        val={verdict.metrics.cwiYears}  unit="yr"
            tooltip={verdict.metrics.cwiYears > 0
              ? `Contention window opens ~${Math.abs(verdict.metrics.cwiYears).toFixed(1)}yr sooner`
              : verdict.metrics.cwiYears < 0
              ? `Contention window shortens by ~${Math.abs(verdict.metrics.cwiYears).toFixed(1)}yr`
              : "Neutral impact on window"} />
        </div>
      </div>

      {/* GM Flags — expandable */}
      <div className="px-4 py-3 space-y-1.5 border-b border-zinc-800/30">
        <div className="text-[8px] font-black text-zinc-700 uppercase tracking-widest mb-2">
          GM Intelligence Flags — click to expand
        </div>
        {flags.length === 0 && <div className="text-[10px] text-zinc-700 italic">No flags raised.</div>}
        {flags.map((flag, i) => {
          const fs = SEVERITY_STYLES[flag.severity];
          const isOpen = expandedFlag === i;
          return (
            <div key={i}
              className={`rounded-lg border overflow-hidden cursor-pointer transition-all duration-200 ${fs.bg} ${fs.border} hover:opacity-90`}
              onClick={() => setExpandedFlag(isOpen ? null : i)}>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${fs.dot}`} />
                <span className={`text-[9px] font-black uppercase tracking-tight flex-1 leading-tight ${fs.text}`}>
                  {flag.headline}
                </span>
                {flag.affectedAsset && (
                  <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border shrink-0 ${fs.label}`}>
                    {flag.affectedAsset.split(" ").pop()}
                  </span>
                )}
                <span className={`text-[9px] font-black shrink-0 ml-1 ${fs.text}`}>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && (
                <div className={`px-3 pb-3 pt-0.5 border-t ${fs.border}`}>
                  <p className={`text-[10px] leading-relaxed font-medium ${fs.text}`}>{flag.explanation}</p>
                  {flag.vetoesSide !== undefined && (
                    <div className={`mt-2 text-[8px] font-black uppercase tracking-wide border-t pt-1.5 ${fs.border} ${fs.text} opacity-70`}>
                      Vetoes: {flag.vetoesSide === 0 ? "Home team GM declines" : "Partner GM declines"}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Claude GM Analysis — triggers modal ───────────────── */}
      <div className="px-4 py-3">
        {!verdict.claudeAnalysis && !verdict.claudeLoading && (
          <button
            onClick={onRequestClaudeAnalysis}
            className="w-full py-2.5 font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            style={{ background: 'transparent', border: '1px solid #b8a070', color: '#6b5030', fontFamily: "'Courier Prime', monospace", borderRadius: '2px' }}
          >
            <span style={{ color: '#b83020' }}>✦</span> Generate Front Office Memo
          </button>
        )}

        {verdict.claudeLoading && (
          <div className="flex items-center gap-2.5 py-3 px-1">
            <div className="w-3 h-3 rounded-full border-t-transparent animate-spin shrink-0" style={{ borderColor: '#b83020', borderTopColor: 'transparent', borderWidth: '2px' }} />
            <span className="text-[10px] font-bold" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>Claude is reviewing the trade...</span>
          </div>
        )}

        {verdict.claudeAnalysis && !verdict.claudeLoading && (
          <button
            onClick={onOpenMemo}
            className="w-full py-2.5 font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            style={{ background: '#1a5c2e', border: '1px solid #0f3d1e', color: '#fff', fontFamily: "'Courier Prime', monospace", borderRadius: '2px' }}
          >
            ✦ Read Front Office Memo
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// BREAKDOWN TABLE
// ============================================================
function BreakdownTable({ blocks }: { blocks: [Asset[], Asset[]] }) {
  const allAssets = [
    ...blocks[0].map((a) => ({ ...a, side: "OUT" as const })),
    ...blocks[1].map((a) => ({ ...a, side: "IN" as const })),
  ];

  return (
    <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-2xl overflow-hidden">
      <div className="px-6 py-3 border-b border-zinc-800/40 flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600">Full NAV Breakdown</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="border-b border-zinc-800/30">
              {["Side", "Player", "Pos", "Age", "Pts/82", "xG/82", "DefRate", "Avg TOI", "Cap", "Term", "X-NAV", "Off", "Def", "Age/YNG", "Cap Cost"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-wider text-zinc-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allAssets.map((a) => {
              const xnav = getXNAV(a);
              const isOut = a.side === "OUT";
              return (
                <tr key={a.id} className={`border-b border-zinc-900 hover:bg-zinc-800/20 transition-colors ${isOut ? "bg-rose-950/5" : "bg-emerald-950/5"}`}>
                  <td className="px-3 py-2">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isOut ? "bg-rose-900/30 text-rose-400" : "bg-emerald-900/30 text-emerald-400"}`}>
                      {a.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-sans font-black text-white text-[11px] whitespace-nowrap">{a.name}</td>
                  <td className="px-3 py-2 text-zinc-500">{a.position}</td>
                  <td className="px-3 py-2 text-zinc-400">{a.age}</td>
                  <td className="px-3 py-2 text-cyan-400">{a.position === "Pick" ? "—" : a.position === "G" ? `${(a.savePct ?? 0).toFixed(3)}` : a.ptsPace.toFixed(1)}</td>
                  <td className="px-3 py-2 text-violet-400">{a.position === "Pick" ? "—" : a.position === "G" ? `${(a.gsax ?? 0).toFixed(1)} GSAx` : (a.xGPace ?? 0).toFixed(1)}</td>
                  <td className={`px-3 py-2 ${a.defRate > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {a.position === "Pick" ? "—" : fmt(a.defRate, 2)}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{a.position === "Pick" ? "—" : a.avgTOI.toFixed(1)}</td>
                  <td className="px-3 py-2 text-amber-400">{a.position === "Pick" ? "—" : `$${a.capHit.toFixed(2)}M`}</td>
                  <td className="px-3 py-2 text-zinc-500">{a.position === "Pick" ? "—" : `${a.yearsRemaining}yr`}</td>
                  <td className={`px-3 py-2 font-black text-[12px] ${xnav.total > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {fmt(xnav.total, 1)}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{xnav.off.toFixed(0)}</td>
                  <td className="px-3 py-2 text-zinc-500">{xnav.def.toFixed(0)}</td>
                  <td className={`px-3 py-2 ${xnav.age > 0 ? "text-violet-400" : "text-amber-500"}`}>
                    {fmt(xnav.age, 0)}
                  </td>
                  <td className="px-3 py-2 text-rose-500">{xnav.cap.toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// MICRO COMPONENTS
// ============================================================
function MicroBar({ label, val, max, color, invert = false, tooltip }: {
  label: string; val: number; max: number; color: string; invert?: boolean; tooltip?: string;
}) {
  const norm = clamp(Math.abs(val) / max, 0, 1);
  const colorMap: Record<string, string> = {
    cyan:    "#1a3a6b",
    emerald: "#1a6b3a",
    violet:  "#5b4a9b",
    amber:   "#9a6b00",
    rose:    "#c0392b",
  };
  // Bar color: negative values always red, positive use their assigned color
  // CAP (invert) is always rose colored — it's always a cost
  const barColor = val < 0 ? "#c0392b" : colorMap[color];
  const numColor = invert
    ? (val < -40 ? '#c0392b' : val < -20 ? '#9a6b00' : '#1a5c2e')
    : (val < 0 ? '#c0392b' : '#1a5c2e');

  return (
    <div className="rounded p-2 text-center" title={tooltip}>
      <div className="text-[9px] font-black uppercase tracking-wider mb-1.5">{label}</div>
      <div className="h-1.5 rounded-full mb-1.5 overflow-hidden" style={{ background: '#c8b078' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${norm * 100}%`, background: barColor, opacity: 0.85 }} />
      </div>
      <div className="text-[11px] font-black tabular-nums" style={{
        color: numColor,
        fontFamily: "'Courier Prime', monospace"
      }}>
        {val > 0 ? "+" : ""}{val.toFixed(0)}
      </div>
    </div>
  );
}

function DeltaRow({ label, val, unit, invert = false, tooltip }: {
  label: string; val: number; unit: string; invert?: boolean; tooltip?: string;
}) {
  const isGood    = invert ? val <= 0 : val >= 0;
  const isNeutral = Math.abs(val) < 0.5;
  return (
    <div className="flex justify-between items-center" title={tooltip}>
      <span className="text-zinc-700 text-[9px] uppercase tracking-tight font-black">{label}</span>
      <span className={`font-black text-[10px] ${isNeutral ? "text-zinc-600" : isGood ? "text-emerald-400" : "text-rose-400"}`}>
        {val > 0 ? "+" : ""}{val.toFixed(1)}{unit}
      </span>
    </div>
  );
}

function MiniStat({ label, val }: { label: string; val: string }) {
  return (
    <div className="p-2 text-center">
      <div className="text-[8px] font-black uppercase tracking-widest mb-0.5">{label}</div>
      <div className="text-[13px] font-black" style={{ color: '#1c140a',  }}>{val}</div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-12 h-12 border-2 border-zinc-800 rounded-full" />
        <div className="w-12 h-12 border-2 border-t-cyan-500 rounded-full animate-spin absolute inset-0" />
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-600 animate-pulse">
        Syncing NHL Data Core
      </div>
      <div className="text-[9px] text-zinc-800 font-black uppercase tracking-widest">
        MoneyPuck · NHL API · X-NAV 7.0
      </div>
    </div>
  );
}

function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="text-rose-500 font-black text-lg">Data Pipeline Error</div>
      <div className="text-zinc-600 text-sm font-mono">{msg}</div>
      <div className="text-zinc-700 text-xs">Check that /api/league is deployed and reachable.</div>
    </div>
  );
}

// ============================================================
// CAP SPACE CALCULATOR — includes retained salary
// ============================================================
function calcCapSpace(idx: 0 | 1, teams: [Team | null, Team | null], blocks: [Asset[], Asset[]]): number {
  const team = teams[idx];
  if (!team) return 0;

  // Assets leaving reduce current roster cap
  const outCap = blocks[idx].reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0);
  // Assets arriving consume cap (net of any retention from partner)
  const inCap = blocks[1 - idx].reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0);

  return team.capSpace + outCap - inCap;
}