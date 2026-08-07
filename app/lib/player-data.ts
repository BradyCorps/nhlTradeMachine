// app/lib/player-data.ts
// ── Single source of truth for all player pedigree data ────────────────────
// The canonical X-NAV engine imports the historical-floor policy from here;
// public routes and components must not apply a second local floor.
// Merged from earlier route/UI copies — 87 canonical PLAYER_PEDIGREE entries.
//
// UPDATE SCHEDULE:
//   PLAYER_PEDIGREE:    add new stars as they emerge
//   PROSPECT_TIERS:     refresh each September (draft + development)
//   SHUTDOWN_D_PEDIGREE: update after each major roster movement window
//   INJURY_RISK:        update when players return/retire

import type { Asset, XNAVResult, FArchetype } from "@/app/lib/trade-types";
import csvAwards from "@/app/data/player-awards.json";

export const canonicalStaticPlayerName = (name: string): string =>
  name.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ");

function normalizedLookup<T>(map: Record<string, T>, name: string): T | undefined {
  const direct = map[name];
  if (direct) return direct;
  const key = canonicalStaticPlayerName(name);
  return Object.entries(map).find(([candidate]) => canonicalStaticPlayerName(candidate) === key)?.[1];
}

const _csvAwardsMap = csvAwards as Record<string, string[]>;
export function getPlayerAwards(name: string): string[] {
  return normalizedLookup(_csvAwardsMap, name) ?? [];
}

// ── Award bonus weights ───────────────────────────────────────
export const AWARD_BONUS: Record<string, number> = {
  "Hart":         18,
  "Vezina":       14,
  "Norris":       12,
  "Selke":        12,
  "Ted Lindsay":  10,
  "Conn Smythe":  10,
  "Art Ross":     8,
  "Rocket Richard": 6,
  "Calder":       6,
  "Lady Byng":    4,
};

// ── Prospect Tier System ──────────────────────────────────────
// Players with low ptsPace (due to youth/limited NHL games) get
// a prospect NAV floor based on their draft pedigree and ceiling.
// Tier 1: Franchise prospects (top-5 picks, elite projection)
// Tier 2: Top prospects (top-15 picks, high-end NHL upside)
// Tier 3: Good prospects (mid-1st or proven AHL producers)
// Tier 4: Fringe prospects (later rounds, high-end AHL)

// ── Player pedigree — peak stats + career awards ─────────────
export const PLAYER_PEDIGREE: Record<string, {
  peakGsax?:    number;
  careerGsax?:  number;
  peakPtsPace?: number;
  peakDps?:     number;   // peak Defensive Point Shares season
  peakOps?:     number;   // peak Offensive Point Shares season
  awards?:      string[];
  allStarYears?: number;
}> = {
  // ── ELITE GOALIES ──────────────────────────────────────────
  "Connor Hellebuyck":  { peakGsax: 28.4, careerGsax: 108,  allStarYears: 5 },
  "Igor Shesterkin":    { peakGsax: 25.1, careerGsax: 72,                 allStarYears: 4 },
  "Andrei Vasilevskiy": { peakGsax: 22.8, careerGsax: 95,            allStarYears: 3 },
  "Juuse Saros":        { peakGsax: 20.1, careerGsax: 55,                          allStarYears: 2 },
  "Jeremy Swayman":     { peakGsax: 18.6, careerGsax: 38,                                  allStarYears: 1 },
  "Jake Oettinger":     { peakGsax: 16.2, careerGsax: 42,                                  allStarYears: 1 },
  "Filip Gustavsson":   { peakGsax: 20.4, careerGsax: 38,                          allStarYears: 1 },
  "Sergei Bobrovsky":   { peakGsax: 24.3, careerGsax: 85,                 allStarYears: 3 },
  "Jordan Binnington":  { peakGsax: 14.2, careerGsax: 32,                     allStarYears: 1 },
  "Pyotr Kochetkov":    { peakGsax: 14.8, careerGsax: 22,                                  allStarYears: 0 },
  "Tristan Jarry":      { peakGsax: 10.2, careerGsax: 18,                                  allStarYears: 0 },
  "Jacob Markstrom":    { peakGsax: 16.8, careerGsax: 44,                                  allStarYears: 2 },
  "Ilya Sorokin":       { peakGsax: 18.9, careerGsax: 48,                          allStarYears: 2 },
  "Joseph Woll":        { peakGsax: 12.4, careerGsax: 18,                                  allStarYears: 0 },
  "Stuart Skinner":     { peakGsax: 8.1,  careerGsax: 14,                                  allStarYears: 0 },
  "Dustin Wolf":        { peakGsax: 11.2, careerGsax: 16,                                  allStarYears: 0 },
  "Ukko-Pekka Luukkonen": { peakGsax: 14.6, careerGsax: 24,                                 allStarYears: 1 },

  // ── ELITE SKATERS ──────────────────────────────────────────
  "Connor McDavid":     { peakPtsPace: 153, allStarYears: 8 },
  "Leon Draisaitl":     { peakPtsPace: 128,                   allStarYears: 5 },
  "Nathan MacKinnon":   { peakPtsPace: 140, allStarYears: 7 },
  "Nikita Kucherov":    { peakPtsPace: 144,      allStarYears: 5 },
  "Cale Makar":         { peakPtsPace: 93,           allStarYears: 4 },
  "David Pastrnak":     { peakPtsPace: 122,                  allStarYears: 4 },
  "Roman Josi":         { peakPtsPace: 96,                                           allStarYears: 3 },
  "Adam Fox":           { peakPtsPace: 102,                                  allStarYears: 3 },
  "Sidney Crosby":      { peakPtsPace: 120,   allStarYears: 9 },
  "Alexander Ovechkin": { peakPtsPace: 115, allStarYears: 13 },
  "Evgeni Malkin":      { peakPtsPace: 118,                    allStarYears: 6 },
  "Victor Hedman":      { peakPtsPace: 82,                    allStarYears: 4 },
  "Quinn Hughes":       { peakPtsPace: 102,                                           allStarYears: 3 },
  "Rasmus Dahlin":      { peakPtsPace: 102,                                                   allStarYears: 2 },
  "Elias Pettersson":   { peakPtsPace: 102,                                           allStarYears: 2 },
  "Josh Morrissey":     { peakPtsPace: 76,                                                   allStarYears: 1 },
  "Kyle Connor":        { peakPtsPace: 92,                                                   allStarYears: 1 },
  "Mark Scheifele":     { peakPtsPace: 88,                                                   allStarYears: 1 },
  "Mikko Rantanen":     { peakPtsPace: 110,                                      allStarYears: 3 },
  "Matthew Tkachuk":    { peakPtsPace: 109,                                                   allStarYears: 2 },
  "Brady Tkachuk":      { peakPtsPace: 80,                                                   allStarYears: 1 },
  "Auston Matthews":    { peakPtsPace: 124, allStarYears: 5 },
  "Mitch Marner":       { peakPtsPace: 101,                                                   allStarYears: 3 },
  "William Nylander":   { peakPtsPace: 97,                                                   allStarYears: 1 },
  "Nico Hischier":      { peakPtsPace: 80,                                           allStarYears: 1 },
  "Jack Hughes":        { peakPtsPace: 98,                                                   allStarYears: 2 },
  "Aleksander Barkov":  { peakPtsPace: 96,                                    allStarYears: 3 },
  "Jonathan Huberdeau": { peakPtsPace: 115,                                                   allStarYears: 2 },
  "Jakob Chychrun":     { peakPtsPace: 75,                                                   allStarYears: 0 },
  // ── SKATERS — DEFENSIVE D PEDIGREE ───────────────────────────
  // Slavin 2019-20: 43 pts / 68 GP (52 pts/82 pace), OPS 2.2, DPS 5.7
  // Awards: All-Star Game, All-NHL 5th, Norris-5th, Lady Byng-4th
  // E+/-: +16.9 (exceptional defensive impact)
  // NOTE: 2025-26 Slavin only played 38 GP (injury) — current NAV reflects that,
  //   but historical floor honours his peak
  "Jaccob Slavin":      { peakPtsPace: 52, peakDps: 5.7, peakOps: 2.2,  allStarYears: 1 },
  // Seider 2025-26: played all 82 games — current benchmark for elite defensive D
  "Moritz Seider":      { peakPtsPace: 68, peakDps: 5.2, peakOps: 4.1,  allStarYears: 1 },
  // ── Additional skaters ──
  "Frederik Andersen":  { peakGsax: 18.2, careerGsax: 48, allStarYears: 1 },
  "Linus Ullmark":      { peakGsax: 22.5, careerGsax: 44, allStarYears: 2 },
  "Thatcher Demko":     { peakGsax: 18.9, careerGsax: 41, allStarYears: 1 },
  "Samuel Montembeault":{ peakGsax: 14.2, careerGsax: 28, allStarYears: 0 },
  "Jake Guentzel":      { peakPtsPace: 84, allStarYears: 1 },
  "Jason Robertson":    { peakPtsPace: 102, allStarYears: 2 },
  "Brock Boeser":       { peakPtsPace: 82, allStarYears: 1 },
  "Jesper Bratt":       { peakPtsPace: 92, allStarYears: 1 },
  "Tage Thompson":      { peakPtsPace: 103, allStarYears: 2 },
  "J.T. Miller":        { peakPtsPace: 99, allStarYears: 1 },
  "Sebastian Aho":      { peakPtsPace: 94, allStarYears: 2 },
  "Andrei Svechnikov":  { peakPtsPace: 80, allStarYears: 1 },
  "Travis Konecny":     { peakPtsPace: 88, allStarYears: 1 },
  "Kirill Marchenko":   { peakPtsPace: 76, allStarYears: 0 },
  "Mika Zibanejad":     { peakPtsPace: 92, allStarYears: 2 },
  "Vincent Trocheck":   { peakPtsPace: 78, allStarYears: 1 },
  "Trevor Zegras":      { peakPtsPace: 74, allStarYears: 1 },
  "Tim Stützle":        { peakPtsPace: 88, allStarYears: 1 },
  "Dylan Cozens":       { peakPtsPace: 80, allStarYears: 1 },
  "Roope Hintz":        { peakPtsPace: 88, allStarYears: 1 },
  "Ryan Nugent-Hopkins":{ peakPtsPace: 84, allStarYears: 1 },
  "Jack Eichel":        { peakPtsPace: 95, allStarYears: 2 },
  "Artemi Panarin":     { peakPtsPace: 108, allStarYears: 4 },
  "Steven Stamkos":     { peakPtsPace: 98, allStarYears: 4 },
  "Evan Bouchard":      { peakPtsPace: 82, allStarYears: 1 },
  "Devon Toews":        { peakPtsPace: 62, allStarYears: 1 },
  "Dougie Hamilton":    { peakPtsPace: 72, allStarYears: 2 },
  "Drew Doughty":       { peakPtsPace: 68, allStarYears: 5 },
  "Erik Karlsson":      { peakPtsPace: 100, allStarYears: 6 },
  "Brent Burns":        { peakPtsPace: 76, allStarYears: 4 },
  "Thomas Chabot":      { peakPtsPace: 72, allStarYears: 1 },
  "Miro Heiskanen":     { peakPtsPace: 68, allStarYears: 2 },
  "Zach Werenski":      { peakPtsPace: 72, allStarYears: 1 },
  "Owen Power":         { peakPtsPace: 62, allStarYears: 1 },
  "Noah Dobson":        { peakPtsPace: 72, allStarYears: 1 },
  "Mikhail Sergachev":  { peakPtsPace: 66, allStarYears: 1 },
  "Samuel Girard":      { peakPtsPace: 48, allStarYears: 0 },
  "Darnell Nurse":      { peakPtsPace: 52, allStarYears: 0 },
};

// ── Award hardware multipliers ────────────────────────────────

// ── Historical floor calculator ───────────────────────────────
export const getPlayerPedigree = (name: string) => {
  const pedigree = normalizedLookup(PLAYER_PEDIGREE, name);
  const csvAwardList = getPlayerAwards(name);
  if (pedigree) {
    return { ...pedigree, awards: csvAwardList.length > 0 ? csvAwardList : pedigree.awards };
  }
  if (csvAwardList.length > 0) {
    return { awards: csvAwardList };
  }
  return undefined;
};
export const getProspectTier = (name: string) => normalizedLookup(PROSPECT_TIERS, name);
export const getShutdownDPedigree = (name: string) => normalizedLookup(SHUTDOWN_D_PEDIGREE, name);
export const getInjuryRisk = (name: string) => normalizedLookup(INJURY_RISK, name);

// An established star can miss most of a season to injury and return the same
// player. When a pedigreed player is still in his prime window but shows a
// low-games sample, the depressed counting stats are INJURY, not age decline —
// so the pedigree floor must not be collapsed by them (the recurring "injured
// Barkov reads as a depth forward" bug — VAL4). Age still decays the floor; the
// missed games and the pace they suppressed do not. A player well past his peak
// age with the same low sample is genuinely declining and is left untouched.
function isInjuryShortenedPrime(asset?: Pick<Asset, "age" | "games" | "position">): boolean {
  if (!asset) return false;
  const age = Number.isFinite(asset.age) ? (asset.age as number) : 27;
  const games = Number.isFinite(asset.games) ? (asset.games ?? 82) : 82;
  const peakAge = asset.position === "G" ? 31 : asset.position === "D" ? 29 : 28;
  return games < 55 && age <= peakAge + 2;
}

function historicalFloorMultiplier(asset?: Pick<Asset, "age" | "games" | "ptsPace" | "position">): number {
  if (!asset) return 1;
  const age = Number.isFinite(asset.age) ? asset.age : 27;
  const games = Number.isFinite(asset.games) ? asset.games ?? 82 : 82;
  const ptsPace = Number.isFinite(asset.ptsPace) ? asset.ptsPace ?? 0 : 0;
  const peakAge = asset.position === "G" ? 31 : asset.position === "D" ? 29 : 28;
  const ageDecay = age <= peakAge ? 1 : Math.max(0.30, 1 - (age - peakAge) * 0.09);
  // Injury in the prime window: only age decays the floor — not the missed
  // games or the pace they suppressed.
  if (isInjuryShortenedPrime(asset)) return Math.max(0.25, ageDecay);
  const availability = games >= 65 ? 1 : games >= 40 ? 0.85 : games >= 20 ? 0.65 : 0.45;
  const currentProduction = asset.position === "G" ? 1 : ptsPace >= 65 ? 1 : ptsPace >= 40 ? 0.85 : 0.65;
  return Math.max(0.25, ageDecay * availability * currentProduction);
}

// ── Historical floor calculator ───────────────────────────────
export const getHistoricalFloor = (
  name: string,
  currentNAV: number,
  asset?: Pick<Asset, "age" | "games" | "ptsPace" | "position">,
): number => {
  const pedigree = getPlayerPedigree(name);
  if (!pedigree) return currentNAV;

  const awardBonus = (pedigree.awards ?? []).reduce((sum, award) => {
    return sum + (AWARD_BONUS[award] ?? 0) * 0.8;
  }, 0);
  const allStarBonus = (pedigree.allStarYears ?? 0) * 3;
  const awardCount   = (pedigree.awards ?? []).length;
  const floorPct     = Math.min(0.80, 0.55 + awardCount * 0.04);
  const decay = historicalFloorMultiplier(asset);

  // ── Decline gate ────────────────────────────────────────────
  // The pedigree floor exists to keep a star's DOWN YEAR from tanking his
  // value — not to resurrect a player in a genuine multi-year decline. A
  // 33-year-old producing at a third of his peak (Huberdeau: 41 vs a 115
  // peak) is not "a star having a dip," and floating him back to prime value
  // — then, worse, letting that lift cancel a toxic contract — is wrong.
  // Scale the floor by how close current production is to peak: near peak
  // (a true dip) keeps the full floor; far below it collapses toward the
  // player's real current value.
  const curPts = Number.isFinite(asset?.ptsPace) ? (asset?.ptsPace ?? 0) : 0;
  // A prime-age injury year is not decline — its low pace must not gate the
  // floor down (VAL4). Only a full-season fade off peak collapses it.
  const declineGate = (!isInjuryShortenedPrime(asset) && pedigree.peakPtsPace && curPts > 0 && asset?.position !== "G")
    ? Math.max(0.15, Math.min(1, (curPts / pedigree.peakPtsPace - 0.30) / 0.50))
    : 1;
  const decayedBonus = (awardBonus + allStarBonus) * Math.max(0.4, decay) * declineGate;

  // For shutdown D-men: anchor floor to peak DPS (more reliable than pts pace)
  // Slavin peak DPS 5.7 → floor = 5.7 * 15 * 0.65 = 55.6 + awards/allstar
  if (pedigree.peakDps) {
    const dpsFloor = pedigree.peakDps * 15 * Math.min(0.80, 0.55 + awardCount * 0.05);
    const ptsFloor = pedigree.peakPtsPace
      ? (pedigree.peakPtsPace / 82) * 25 * floorPct
      : 0;
    return Math.max(currentNAV, Math.max(dpsFloor, ptsFloor) * decay + decayedBonus);
  }

  // Standard skater floor: based on peak pts pace
  if (pedigree.peakPtsPace) {
    const isEstablishedElite = pedigree.peakPtsPace >= 88 || awardCount >= 2 || (pedigree.allStarYears ?? 0) >= 3;
    const historicalFloorNAV = isEstablishedElite
      ? pedigree.peakPtsPace * 1.65
      : (pedigree.peakPtsPace / 82) * 25 * floorPct;
    return Math.max(currentNAV, historicalFloorNAV * decay * declineGate + decayedBonus);
  }

  return currentNAV + decayedBonus;
};

// ── Prospect tiers — NAV floor by development stage ──────────
export const PROSPECT_TIERS: Record<string, {
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

// ── Shutdown D pedigree — NAV floors for elite defensive D-men ─
export const SHUTDOWN_D_PEDIGREE: Record<string, { navFloor: number; note: string }> = {
  // Floors calibrated to reflect true trade market — elite shutdown D commands real return
  // Slavin: 38 GP in 2025-26 (injury) → reduced current floor, but historical floor via PLAYER_PEDIGREE
  "Jaccob Slavin":     { navFloor: 55,  note: "Elite shutdown D — 38 GP this season, peak 2019-20" },
  // Seider: 82 GP in 2025-26 — current benchmark for elite defensive D-man
  "Moritz Seider":     { navFloor: 75,  note: "Elite two-way D, played all 82 GP in 2025-26" },
  "Gustav Forsling":   { navFloor: 70,  note: "Elite two-way D, CAR" },
  "Chris Tanev":       { navFloor: 55,  note: "Elite shutdown D, Cup winner" },
  "Ryan Suter":        { navFloor: 30,  note: "Veteran shutdown D, declining but proven" },
  "Rasmus Ristolainen":{ navFloor: 25,  note: "Defensive specialist" },
  "Luke Schenn":       { navFloor: 20,  note: "Veteran shutdown D" },
  "Joel Edmundson":    { navFloor: 22,  note: "Shutdown D, physical" },
  "Brendan Dillon":    { navFloor: 18,  note: "Veteran shutdown D" },
  "Damon Severson":    { navFloor: 30,  note: "Two-way D, shutdown capable" },
  "Jake Walman":       { navFloor: 28,  note: "Defensive D" },
};
// Players with known fragility or chronic issues get a risk flag.
// This isn't a disqualifier — just context for the acquiring GM.

// ── Injury risk registry ──────────────────────────────────────
export const INJURY_RISK: Record<string, { level: "HIGH"|"MODERATE"; note: string }> = {
  // High risk — repeated significant injuries or chronic conditions
  "Erik Karlsson":       { level: "HIGH",     note: "Two Achilles surgeries, wrist issues" },
  "Evander Kane":        { level: "HIGH",     note: "Wrist surgery, repeated absences" },
  "Tristan Jarry":       { level: "HIGH",     note: "Foot injury, significant missed time" },
  "Ryan Johansen":       { level: "HIGH",     note: "Hernia and leg surgery history" },
  "Ondrej Palat":        { level: "HIGH",     note: "Repeated lower-body issues" },
  "Zach Hyman":          { level: "HIGH",     note: "Multiple knee surgeries" },
  "Jonathan Drouin":     { level: "HIGH",     note: "Mental health leave, wrist surgery" },
  "Max Domi":            { level: "HIGH",     note: "Type 1 diabetes, injury history" },
  // Moderate risk — documented history but generally available
  "Nathan MacKinnon":    { level: "MODERATE", note: "History of upper-body injuries" },
  "Elias Pettersson":    { level: "MODERATE", note: "Wrist/shoulder concerns" },
  "Jack Eichel":         { level: "MODERATE", note: "Disk fusion surgery history" },
  "Thomas Chabot":       { level: "MODERATE", note: "History of concussions" },
  "Nazem Kadri":         { level: "MODERATE", note: "Suspension history, thumb injury" },
  "Brock Boeser":        { level: "MODERATE", note: "Hip surgery, recurring absences" },
  "Jakob Chychrun":      { level: "MODERATE", note: "Multiple lower-body surgeries" },
  "Samuel Girard":       { level: "MODERATE", note: "Spinal fracture history" },
  "Dougie Hamilton":     { level: "MODERATE", note: "Leg fracture, ankle issues" },
  "Victor Hedman":       { level: "MODERATE", note: "Recurring lower-body issues" },
  "Rickard Rakell":      { level: "MODERATE", note: "Concussion history" },
  "Anthony Mantha":      { level: "MODERATE", note: "Shoulder surgery, extended absences" },
  "Andrei Svechnikov":   { level: "MODERATE", note: "ACL tear history" },
  "Timo Meier":          { level: "MODERATE", note: "Lower-body injury history" },
  "Bryan Rust":          { level: "MODERATE", note: "Recurring lower-body issues" },
  "Tom Wilson":          { level: "MODERATE", note: "Knee ligament surgery history" },
  "Ondrej Kase":         { level: "HIGH",     note: "Severe concussion history, limited games" },
  "Nick Foligno":        { level: "MODERATE", note: "Recurring lower-body issues" },
  "Ryan Reaves":         { level: "MODERATE", note: "Concussion history" },
  "Cam Fowler":          { level: "MODERATE", note: "Knee surgery history" },
  "Jonathan Toews":      { level: "HIGH",     note: "Chronic Immune condition" },
  "Brady Tkachuk":       { level: "MODERATE", note: "Wrist injury history" },
};
