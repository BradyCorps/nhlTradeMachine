/**
 * Individual NAV Stability Backtest
 *
 * Tests whether a player's X-NAV persists year-to-year the way STRAND
 * traits do, or whether the composite aggregation adds noise.
 *
 * For every consecutive-season pair (≥20 GP both years, 2008–2024),
 * compute NAV and its four components (off, def, age, cap) in both
 * seasons, then measure Pearson r.
 *
 * If NAV is less stable than its most-stable input, aggregation adds
 * noise. If it's at least as stable as a weighted average of its inputs,
 * the blending is working.
 *
 * Usage: npx tsx scripts/backtest/nav-stability-backtest.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();
const MIN_GP = 20;

// ── Historical cap ceilings ──────────────────────────────────────
const CAP_CEILING: Record<number, number> = {
  2017: 75.0, 2018: 79.5, 2019: 81.5, 2020: 81.5,
  2021: 81.5, 2022: 82.5, 2023: 83.5, 2024: 88.0,
  2025: 95.0, 2026: 104.0,
};

function capGrowthFactor(yearsOut: number): number {
  return Math.pow(1.04, yearsOut);
}

// ── CSV reader ───────────────────────────────────────────────────
type Row = Record<string, string>;

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function readCsv(rel: string): Row[] {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = splitCsvLine(lines[0].replace(/^﻿/, ""));
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row: Row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

function num(v: string | undefined): number { return v ? parseFloat(v) || 0 : 0; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function safe(v: number): number { return isFinite(v) ? v : 0; }
function slug(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

// ── Simplified NAV engine (same as team-nav-backtest) ────────────
interface NavComponents {
  total: number;
  off: number;
  def: number;
  age: number;
  cap: number;
  trueMarketValue: number;
}

function estimateFmvCapPct(ptsPace: number, toi: number, age: number, isD: boolean, isUfa: boolean): number {
  const prodSignal = isD
    ? clamp((ptsPace * 0.75) / 60, 0, 1)
    : clamp(ptsPace / 90, 0, 1);
  const toiSignal = clamp((toi - 12) / 12, 0, 1);
  const combined = prodSignal * 0.7 + toiSignal * 0.3;
  const basePct = 0.009 + Math.pow(combined, 1.4) * 0.12;
  const peakAge = isD ? 27 : 26;
  const ageAdj = age <= peakAge
    ? 1.0 + clamp((peakAge - age) * 0.01, 0, 0.05)
    : 1.0 - clamp((age - peakAge) * 0.015, 0, 0.15);
  const ufaMult = isUfa ? 1.10 : 1.0;
  return clamp(basePct * ageAdj * ufaMult, 0.009, 0.145);
}

function calcSkaterNavComponents(
  ptsPace: number, goalsPace: number, xgPace: number,
  avgTOI: number, games: number,
  xgRelTM: number, xgaRelTM: number, dzPct: number,
  position: string, age: number,
  capHit: number, yearsRemaining: number, capCeiling: number,
  draftOverall?: number,
): NavComponents {
  const isD = position === "D";
  const isC = position === "C";

  // Offensive value
  const ptsScale = isD ? 0.75 : 1.0;
  const pts = ptsPace * ptsScale;
  const noivBonus = clamp(xgRelTM * 3.5, -20, 25);
  const offExp = isD ? 1.1 : 1.6;
  const baseOffCurve = Math.pow(pts / 45, offExp) * 55;
  const offRaw = baseOffCurve + (xgPace * 0.5) + noivBonus;
  let offTotal = safe(offRaw);
  if (offTotal > 250) {
    const L = 200;
    const excess = offTotal - 250;
    offTotal = 250 + L * (1 - Math.exp(-excess / L));
  }

  // Defensive value
  const toi = avgTOI;
  const toiD = clamp((toi - 15) * 2.5, 0, 30);
  const dzVal = clamp((dzPct - 0.3) * 40, 0, 12);
  const defRaw = (-xgaRelTM) * 20 + toiD + dzVal;
  let defTotal = safe(defRaw);
  if (defTotal > 80) {
    const L = 70;
    const excess = defTotal - 80;
    defTotal = 80 + L * (1 - Math.exp(-excess / L));
  }

  // Age curve
  const peakAge = isD ? 27 : 26;
  const baseAge = age <= peakAge
    ? Math.max(0, (peakAge - age) * 4.5)
    : -Math.pow(age - peakAge, 1.6) * 1.8;
  const yrs = yearsRemaining || 3;
  const rentalFactor = yrs <= 1 ? 0.25 : yrs <= 2 ? 0.60 : 1.0;
  const productionSignal = clamp((pts - 20) / 45, 0, 1);
  const roleSignal = clamp((toi - 11) / 7, 0, 1);
  const pedigreeSignal = draftOverall != null && draftOverall <= 32 ? 0.65 : 0;
  const sampleSignal = clamp(games / 82, 0, 1);
  const youthProjectionSignal = clamp(
    Math.max(productionSignal, roleSignal, pedigreeSignal) * (0.45 + 0.55 * sampleSignal),
    0, 1,
  );
  const ageVal = baseAge < 0 ? baseAge * rentalFactor : baseAge * youthProjectionSignal;
  const ageTotal = safe(ageVal);

  // On-ice core
  const trueMarketValue = offTotal + defTotal + ageTotal;
  const isRFA = age + yearsRemaining <= 27;

  // Contract surplus
  const fmvProxy = estimateFmvCapPct(ptsPace, toi, age, isD, isRFA);
  const currentFmvAav = capCeiling * fmvProxy;
  const isUnsigned = yearsRemaining <= 0 && capHit <= 0.5;
  const navCapHit = isUnsigned ? currentFmvAav : capHit;
  const contractYears = Math.max(1, yearsRemaining || 1);

  let capSum = 0;
  let tmvDriftFactor = 1;
  const GROWTH_PER_PREPEAK_YEAR = 0.09 * youthProjectionSignal;
  const DECLINE_PER_YEAR = 0.03;

  for (let i = 0; i < contractYears; i++) {
    const projCeiling = capCeiling * capGrowthFactor(i);
    const ageAtYear = age + i;
    if (i > 0) {
      if (ageAtYear <= peakAge) tmvDriftFactor *= 1 + GROWTH_PER_PREPEAK_YEAR;
      else if (ageAtYear >= peakAge + 2) tmvDriftFactor *= 1 - DECLINE_PER_YEAR;
      tmvDriftFactor = clamp(tmvDriftFactor, 0.70, 1.35);
    }
    const fmvCapPctAtYear = estimateFmvCapPct(ptsPace * tmvDriftFactor, toi, ageAtYear, isD, isRFA);
    const fmvDollars = projCeiling * fmvCapPctAtYear;
    const annualSurplus = fmvDollars - navCapHit;
    const timeDiscount = Math.pow(0.92, i);
    const gammaRFA = (ageAtYear <= 27 && annualSurplus > 0) ? 1.25 : 1.0;
    capSum += annualSurplus * 12 * gammaRFA * timeDiscount;
  }

  const baseCapNorm = capSum / contractYears;
  const singleSlotMult = Math.max(1.0, trueMarketValue / 180);
  const baseCapComp = baseCapNorm < 0 ? baseCapNorm : baseCapNorm * singleSlotMult;
  const capEstablishment = clamp(Math.max(games / 40, 0), 0.2, 1.0);
  const positiveCapComp = Math.max(0, baseCapComp) * capEstablishment;
  const negativeCapComp = Math.min(0, baseCapComp);
  const controlYears = clamp(Math.min(contractYears, peakAge + 2 - age), 0, 6);
  const teamControlVal = age <= peakAge
    ? youthProjectionSignal * controlYears * 6 * capEstablishment
    : 0;
  const capTotal = safe(negativeCapComp + positiveCapComp + teamControlVal);

  // Positional scarcity
  const isTopPairD = isD && toi > 22;
  const positionalPremium = isC ? 1.15 : isTopPairD ? 1.20 : 1.0;
  const preTotal = safe(trueMarketValue + capTotal);
  const rawTotal = safe(preTotal * positionalPremium);

  // Development discount
  let devDiscount =
    age <= 21 ? 0.68 : age <= 22 ? 0.76 : age <= 23 ? 0.82 :
    age <= 24 ? 0.88 : age <= 25 ? 0.93 : 1.0;
  if (age <= 25) {
    const gameRelief = clamp((games - 40) / 180, 0, 1);
    devDiscount += (1.0 - devDiscount) * gameRelief;
  }
  if (age <= 25 && pts >= 65) {
    const exemptionFactor = clamp((pts - 65) / 20, 0, 1);
    devDiscount = devDiscount + (1.0 - devDiscount) * exemptionFactor;
  }

  return {
    total: rawTotal * devDiscount,
    off: offTotal,
    def: defTotal,
    age: ageTotal,
    cap: capTotal,
    trueMarketValue,
  };
}

// ── Load data ────────────────────────────────────────────────────
console.log("Individual NAV Stability Backtest");
console.log("=".repeat(60));

const skaterRows = [
  ...readCsv("OtherData/HistoricalData/skaters_2008_to_2024.csv"),
  ...readCsv("OtherData/2025_26Data/2025_26_skaters.csv"),
];

const signings = readCsv("OtherData/contracts/signings.csv");
const biosRows = readCsv("OtherData/2025;26_player_bios.csv");

// Bio lookup
const biosByName = new Map<string, { dob: string; draftOverall: number | undefined }>();
for (const r of biosRows) {
  const name = r["Player"] || r.Player;
  if (!name) continue;
  biosByName.set(slug(name), {
    dob: r["Date of Birth"] || "",
    draftOverall: r["Overall Draft Position"] ? parseInt(r["Overall Draft Position"]) || undefined : undefined,
  });
}

// Signings age lookup
const ageFromSignings = new Map<string, { signAge: number; signYear: number }>();
for (const s of signings) {
  const name = slug(s.player || "");
  const signAge = parseInt(s.signAge);
  const sd = s.signDate || "";
  const signYear = sd ? parseInt(sd.slice(0, 4)) : 0;
  if (name && signAge && signYear) {
    ageFromSignings.set(name, { signAge, signYear });
  }
}

function getAge(name: string, season: number): number | null {
  const s = slug(name);
  const bio = biosByName.get(s);
  if (bio && bio.dob) {
    const birthYear = parseInt(bio.dob.slice(0, 4));
    if (birthYear && birthYear >= 1960 && birthYear <= 2010) {
      return season - birthYear;
    }
  }
  const sig = ageFromSignings.get(s);
  if (sig) {
    const age = sig.signAge + (season - sig.signYear);
    if (age >= 16 && age <= 50) return age;
  }
  return null;
}

// Contract lookup
interface Contract {
  capHit: number; term: number; signSeason: number; endSeason: number; pos: string;
}
const contractsByPlayer = new Map<string, Contract[]>();
for (const s of signings) {
  const name = slug(s.player || "");
  if (!name) continue;
  const capHitRaw = parseFloat(s.capHit);
  const capHit = capHitRaw / 1_000_000;
  const termStr = (s.term || "").replace(/yr$/, "");
  const term = parseInt(termStr) || 1;
  const sd = s.signDate || "";
  const signYear = sd ? parseInt(sd.slice(0, 4)) : 0;
  const signMonth = sd ? parseInt(sd.slice(5, 7)) : 7;
  if (!signYear || !capHit) continue;
  const signSeason = signMonth >= 7 ? signYear : signYear - 1;
  const endSeason = signSeason + term - 1;
  if (!contractsByPlayer.has(name)) contractsByPlayer.set(name, []);
  contractsByPlayer.get(name)!.push({ capHit, term, signSeason, endSeason, pos: s.pos || "" });
}

function getContract(name: string, season: number): { capHit: number; yearsRemaining: number } | null {
  const contracts = contractsByPlayer.get(slug(name));
  if (!contracts) return null;
  const active = contracts.filter(c => c.signSeason <= season && c.endSeason >= season);
  if (active.length === 0) return null;
  const c = active.sort((a, b) => b.signSeason - a.signSeason)[0];
  return { capHit: c.capHit, yearsRemaining: c.endSeason - season + 1 };
}

// ── Build player-season NAV records ──────────────────────────────
interface PlayerSeasonNav {
  playerId: string;
  name: string;
  position: string;
  season: number;
  gp: number;
  ptsPace: number;
  avgTOI: number;
  nav: NavComponents;
}

const byPlayer = new Map<string, Map<number, PlayerSeasonNav>>();

for (const r of skaterRows) {
  if (r.situation !== "all") continue;
  const gp = num(r.games_played);
  if (gp < MIN_GP) continue;
  const season = parseInt(r.season);
  const pos = r.position;
  if (pos === "G") continue;
  const ice = num(r.icetime);

  const pts = num(r.I_F_points);
  const goals = num(r.I_F_goals);
  const xg = num(r.I_F_xGoals);
  const onXg = num(r.onIce_xGoalsPercentage);
  const offXg = num(r.offIce_xGoalsPercentage);
  const xgRelTM = (onXg || 0) - (offXg || 0);

  const onXga = num(r.OnIce_A_xGoals);
  const offXga = num(r.OffIce_A_xGoals);
  const onIceTime = ice / 3600;
  const xgaRelTM = onIceTime > 0 && offXga > 0
    ? ((onXga / onIceTime) - (offXga / Math.max(1, (gp * 60 * 60 - ice) / 3600))) * (onIceTime / gp)
    : 0;

  const oStarts = num(r.I_F_oZoneShiftStarts);
  const dStarts = num(r.I_F_dZoneShiftStarts);
  const nStarts = num(r.I_F_neutralZoneShiftStarts || r.I_F_nZoneShiftStarts);
  const totalStarts = oStarts + dStarts + nStarts;
  const dzPct = totalStarts > 0 ? dStarts / totalStarts : 0.5;

  const position = pos === "L" || pos === "R" ? "W" : pos === "C" ? "C" : "D";
  const ptsPace = (pts / gp) * 82;
  const goalsPace = (goals / gp) * 82;
  const xgPace = (xg / gp) * 82;
  const avgTOI = (ice / 60) / gp;

  const age = getAge(r.name, season);
  if (age === null) continue;

  const ceiling = CAP_CEILING[season];
  if (!ceiling) continue;

  const contract = getContract(r.name, season);
  const capHit = contract ? contract.capHit : ceiling * 0.009;
  const yrsRemaining = contract ? contract.yearsRemaining : 1;
  const bio = biosByName.get(slug(r.name));
  const draftOverall = bio?.draftOverall;

  const nav = calcSkaterNavComponents(
    ptsPace, goalsPace, xgPace, avgTOI, gp,
    xgRelTM, safe(xgaRelTM), dzPct,
    position, age, capHit, yrsRemaining, ceiling, draftOverall,
  );

  const pid = r.playerId;
  if (!byPlayer.has(pid)) byPlayer.set(pid, new Map());
  byPlayer.get(pid)!.set(season, {
    playerId: pid, name: r.name, position, season, gp,
    ptsPace, avgTOI, nav,
  });
}

// ── Build consecutive-season pairs ───────────────────────────────
interface NavPair {
  name: string;
  position: string;
  season1: number;
  season2: number;
  s1: PlayerSeasonNav;
  s2: PlayerSeasonNav;
}

const pairs: NavPair[] = [];
for (const [, seasons] of byPlayer) {
  const sorted = [...seasons.entries()].sort(([a], [b]) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const [y1, s1] = sorted[i];
    const [y2, s2] = sorted[i + 1];
    if (y2 !== y1 + 1) continue;
    pairs.push({ name: s1.name, position: s1.position, season1: y1, season2: y2, s1, s2 });
  }
}

// ── Stats helpers ────────────────────────────────────────────────
function pearsonR(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return dx2 > 0 && dy2 > 0 ? num / Math.sqrt(dx2 * dy2) : 0;
}

function mae(predicted: number[], actual: number[]): number {
  return predicted.reduce((s, p, i) => s + Math.abs(p - actual[i]), 0) / predicted.length;
}

function regressedPred(values: number[], r: number): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.map(v => mean + r * (v - mean));
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ═══════════════════════════════════════════════════════════════
// ANALYSIS
// ═══════════════════════════════════════════════════════════════

const fwdPairs = pairs.filter(p => p.position !== "D");
const defPairs = pairs.filter(p => p.position === "D");

console.log(`\nConsecutive-season pairs: ${pairs.length}`);
console.log(`  Forwards: ${fwdPairs.length}  |  Defensemen: ${defPairs.length}`);
console.log(`  Unique players: ${byPlayer.size}`);
console.log(`  Seasons: 2017–2024 (≥${MIN_GP} GP both years)`);

// ── 1. Component-level stability ─────────────────────────────────
console.log(`\n${"─".repeat(70)}`);
console.log("1. YEAR-TO-YEAR STABILITY: NAV and components (Pearson r)");
console.log(`${"─".repeat(70)}`);

interface ComponentDef {
  label: string;
  extract: (n: NavComponents) => number;
}
const COMPONENTS: ComponentDef[] = [
  { label: "Total NAV",          extract: n => n.total },
  { label: "Offensive Value",    extract: n => n.off },
  { label: "Defensive Value",    extract: n => n.def },
  { label: "Age Curve",          extract: n => n.age },
  { label: "Contract Surplus",   extract: n => n.cap },
  { label: "True Market Value",  extract: n => n.trueMarketValue },
];

console.log(`\n  ${"Component".padEnd(22)} ${"All".padStart(7)} ${"FWD".padStart(7)} ${"DEF".padStart(7)}  ${"Interpretation"}`);
console.log(`  ${"─".repeat(70)}`);

for (const comp of COMPONENTS) {
  const allX = pairs.map(p => comp.extract(p.s1.nav));
  const allY = pairs.map(p => comp.extract(p.s2.nav));
  const rAll = pearsonR(allX, allY);

  const fX = fwdPairs.map(p => comp.extract(p.s1.nav));
  const fY = fwdPairs.map(p => comp.extract(p.s2.nav));
  const rF = pearsonR(fX, fY);

  const dX = defPairs.map(p => comp.extract(p.s1.nav));
  const dY = defPairs.map(p => comp.extract(p.s2.nav));
  const rD = pearsonR(dX, dY);

  const interp = rAll >= 0.80 ? "very stable"
    : rAll >= 0.65 ? "strong signal"
    : rAll >= 0.45 ? "solid signal"
    : rAll >= 0.25 ? "moderate signal"
    : "noisy";
  console.log(`  ${comp.label.padEnd(22)} ${rAll.toFixed(3).padStart(7)} ${rF.toFixed(3).padStart(7)} ${rD.toFixed(3).padStart(7)}  ${interp}`);
}

// ── 2. Compare NAV stability to STRAND trait stability ───────────
console.log(`\n${"─".repeat(70)}`);
console.log("2. NAV STABILITY vs STRAND TRAIT STABILITY (reference)");
console.log(`${"─".repeat(70)}`);

// STRAND trait r values from the STRAND stability backtest
const strandTraitR: Record<string, number> = {
  "Scoring Pace (pts/82)": 0.83,
  "xG Pace (xG/82)": 0.89,
  "Net On-Ice Value (NOIV)": 0.77,
  "Ice Time (TOI)": 0.88,
  "Chance Suppression": 0.55,
  "Usage Difficulty (QoC)": 0.70,
  "OZ Deployment": 0.59,
};

const navR = pearsonR(
  pairs.map(p => p.s1.nav.total),
  pairs.map(p => p.s2.nav.total),
);
const offR = pearsonR(
  pairs.map(p => p.s1.nav.off),
  pairs.map(p => p.s2.nav.off),
);
const defR = pearsonR(
  pairs.map(p => p.s1.nav.def),
  pairs.map(p => p.s2.nav.def),
);

console.log(`\n  STRAND traits (from prior backtest):`);
for (const [trait, r] of Object.entries(strandTraitR)) {
  console.log(`    ${trait.padEnd(30)} r = ${r.toFixed(2)}`);
}
console.log(`\n  NAV components (this backtest):`);
console.log(`    ${"Total NAV".padEnd(30)} r = ${navR.toFixed(2)}`);
console.log(`    ${"Offensive Value".padEnd(30)} r = ${offR.toFixed(2)}`);
console.log(`    ${"Defensive Value".padEnd(30)} r = ${defR.toFixed(2)}`);

const avgStrandR = Object.values(strandTraitR).reduce((a, b) => a + b, 0) / Object.values(strandTraitR).length;
console.log(`\n  Average STRAND trait r:   ${avgStrandR.toFixed(2)}`);
console.log(`  Total NAV r:             ${navR.toFixed(2)}`);
if (navR >= avgStrandR) {
  console.log(`  → NAV is at least as stable as the average STRAND trait`);
} else if (navR >= avgStrandR * 0.85) {
  console.log(`  → NAV is close to the average STRAND trait stability`);
} else {
  console.log(`  → NAV is noisier than the average STRAND trait — aggregation may be adding noise`);
}

// ── 3. Regression benefit ────────────────────────────────────────
console.log(`\n${"─".repeat(70)}`);
console.log("3. REGRESSION BENEFIT: Does regressing toward mean help NAV prediction?");
console.log(`${"─".repeat(70)}`);

for (const comp of COMPONENTS) {
  const x = pairs.map(p => comp.extract(p.s1.nav));
  const y = pairs.map(p => comp.extract(p.s2.nav));
  const r = pearsonR(x, y);
  const rawMae = mae(x, y);
  const regressed = regressedPred(x, r);
  const regMae = mae(regressed, y);
  const improvement = ((rawMae - regMae) / rawMae) * 100;

  console.log(`  ${comp.label.padEnd(22)} raw MAE=${rawMae.toFixed(1).padStart(7)}  regressed MAE=${regMae.toFixed(1).padStart(7)}  improvement=${improvement.toFixed(1).padStart(5)}%`);
}

// ── 4. Stability by player tier ──────────────────────────────────
console.log(`\n${"─".repeat(70)}`);
console.log("4. NAV STABILITY BY PLAYER TIER");
console.log(`${"─".repeat(70)}`);

const tierDefs = [
  { label: "Stars (≥60 pts pace)", filter: (p: NavPair) => p.s1.ptsPace >= 60 },
  { label: "Middle (30-59 pts)",   filter: (p: NavPair) => p.s1.ptsPace >= 30 && p.s1.ptsPace < 60 },
  { label: "Depth (<30 pts)",      filter: (p: NavPair) => p.s1.ptsPace < 30 },
];

console.log(`\n  ${"Tier".padEnd(25)} ${"n".padStart(6)} ${"r(NAV)".padStart(8)} ${"r(off)".padStart(8)} ${"r(def)".padStart(8)} ${"r(cap)".padStart(8)}`);
console.log(`  ${"─".repeat(65)}`);

for (const tier of tierDefs) {
  const filtered = pairs.filter(tier.filter);
  const rNav = pearsonR(filtered.map(p => p.s1.nav.total), filtered.map(p => p.s2.nav.total));
  const rOff = pearsonR(filtered.map(p => p.s1.nav.off), filtered.map(p => p.s2.nav.off));
  const rDef = pearsonR(filtered.map(p => p.s1.nav.def), filtered.map(p => p.s2.nav.def));
  const rCap = pearsonR(filtered.map(p => p.s1.nav.cap), filtered.map(p => p.s2.nav.cap));
  console.log(`  ${tier.label.padEnd(25)} ${String(filtered.length).padStart(6)} ${rNav.toFixed(3).padStart(8)} ${rOff.toFixed(3).padStart(8)} ${rDef.toFixed(3).padStart(8)} ${rCap.toFixed(3).padStart(8)}`);
}

// ── 5. Stability by age group ────────────────────────────────────
console.log(`\n${"─".repeat(70)}`);
console.log("5. NAV STABILITY BY AGE GROUP");
console.log(`${"─".repeat(70)}`);

const ageGroups = [
  { label: "Young (≤23)",    filter: (p: NavPair) => getAge(p.s1.name, p.season1)! <= 23 },
  { label: "Prime (24-28)",  filter: (p: NavPair) => { const a = getAge(p.s1.name, p.season1)!; return a >= 24 && a <= 28; } },
  { label: "Veteran (29-32)", filter: (p: NavPair) => { const a = getAge(p.s1.name, p.season1)!; return a >= 29 && a <= 32; } },
  { label: "Aging (33+)",    filter: (p: NavPair) => getAge(p.s1.name, p.season1)! >= 33 },
];

console.log(`\n  ${"Age Group".padEnd(25)} ${"n".padStart(6)} ${"r(NAV)".padStart(8)} ${"r(off)".padStart(8)} ${"r(age)".padStart(8)} ${"r(cap)".padStart(8)} ${"avg ΔNAV".padStart(10)}`);
console.log(`  ${"─".repeat(75)}`);

for (const ag of ageGroups) {
  const filtered = pairs.filter(ag.filter);
  const rNav = pearsonR(filtered.map(p => p.s1.nav.total), filtered.map(p => p.s2.nav.total));
  const rOff = pearsonR(filtered.map(p => p.s1.nav.off), filtered.map(p => p.s2.nav.off));
  const rAge = pearsonR(filtered.map(p => p.s1.nav.age), filtered.map(p => p.s2.nav.age));
  const rCap = pearsonR(filtered.map(p => p.s1.nav.cap), filtered.map(p => p.s2.nav.cap));
  const avgDelta = filtered.reduce((s, p) => s + (p.s2.nav.total - p.s1.nav.total), 0) / filtered.length;
  console.log(`  ${ag.label.padEnd(25)} ${String(filtered.length).padStart(6)} ${rNav.toFixed(3).padStart(8)} ${rOff.toFixed(3).padStart(8)} ${rAge.toFixed(3).padStart(8)} ${rCap.toFixed(3).padStart(8)} ${(avgDelta >= 0 ? "+" : "") + avgDelta.toFixed(1).padStart(9)}`);
}

// ── 6. Contract change impact ────────────────────────────────────
console.log(`\n${"─".repeat(70)}`);
console.log("6. CONTRACT CHANGE IMPACT: Does a new contract destabilize NAV?");
console.log(`${"─".repeat(70)}`);

const contractChanged: NavPair[] = [];
const contractSame: NavPair[] = [];

for (const p of pairs) {
  const c1 = getContract(p.s1.name, p.season1);
  const c2 = getContract(p.s2.name, p.season2);
  if (!c1 || !c2) continue;
  if (Math.abs(c1.capHit - c2.capHit) > 0.3) {
    contractChanged.push(p);
  } else {
    contractSame.push(p);
  }
}

console.log(`\n  Same contract:    n=${contractSame.length}`);
const rSame = pearsonR(contractSame.map(p => p.s1.nav.total), contractSame.map(p => p.s2.nav.total));
const rSameOff = pearsonR(contractSame.map(p => p.s1.nav.off), contractSame.map(p => p.s2.nav.off));
const rSameCap = pearsonR(contractSame.map(p => p.s1.nav.cap), contractSame.map(p => p.s2.nav.cap));
console.log(`    r(NAV)=${rSame.toFixed(3)}  r(off)=${rSameOff.toFixed(3)}  r(cap)=${rSameCap.toFixed(3)}`);

console.log(`\n  Contract changed: n=${contractChanged.length}`);
const rChanged = pearsonR(contractChanged.map(p => p.s1.nav.total), contractChanged.map(p => p.s2.nav.total));
const rChangedOff = pearsonR(contractChanged.map(p => p.s1.nav.off), contractChanged.map(p => p.s2.nav.off));
const rChangedCap = pearsonR(contractChanged.map(p => p.s1.nav.cap), contractChanged.map(p => p.s2.nav.cap));
console.log(`    r(NAV)=${rChanged.toFixed(3)}  r(off)=${rChangedOff.toFixed(3)}  r(cap)=${rChangedCap.toFixed(3)}`);

const dropDelta = rSame - rChanged;
console.log(`\n  NAV stability drop from contract change: ${dropDelta.toFixed(3)}`);
if (dropDelta > 0.10) {
  console.log(`  → Contract changes meaningfully destabilize NAV (Δr=${dropDelta.toFixed(3)})`);
  console.log(`    This is expected — a new deal legitimately changes trade value.`);
} else {
  console.log(`  → Contract changes have modest impact on NAV stability (Δr=${dropDelta.toFixed(3)})`);
}

// ── 7. On-ice stability vs full NAV stability ────────────────────
console.log(`\n${"─".repeat(70)}`);
console.log("7. ON-ICE VALUE vs FULL NAV: Is the contract layer adding noise?");
console.log(`${"─".repeat(70)}`);

const tmvR = pearsonR(
  pairs.map(p => p.s1.nav.trueMarketValue),
  pairs.map(p => p.s2.nav.trueMarketValue),
);

console.log(`\n  True Market Value (off+def+age) r: ${tmvR.toFixed(3)}`);
console.log(`  Full NAV (TMV + cap + adjustments) r: ${navR.toFixed(3)}`);
if (navR < tmvR - 0.02) {
  console.log(`  → Contract surplus is adding noise to NAV stability (Δr=${(tmvR - navR).toFixed(3)})`);
} else if (navR > tmvR + 0.02) {
  console.log(`  → Contract surplus is stabilizing NAV (Δr=${(navR - tmvR).toFixed(3)})`);
} else {
  console.log(`  → Contract surplus has negligible effect on stability (Δr=${Math.abs(navR - tmvR).toFixed(3)})`);
}

// ── 8. Distribution of year-to-year NAV changes ──────────────────
console.log(`\n${"─".repeat(70)}`);
console.log("8. DISTRIBUTION OF YEAR-TO-YEAR NAV CHANGES");
console.log(`${"─".repeat(70)}`);

const deltas = pairs.map(p => p.s2.nav.total - p.s1.nav.total);
const absDelta = deltas.map(d => Math.abs(d));
const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
const meanAbs = absDelta.reduce((a, b) => a + b, 0) / absDelta.length;
const p25 = percentile(deltas, 25);
const p50 = percentile(deltas, 50);
const p75 = percentile(deltas, 75);
const p5 = percentile(deltas, 5);
const p95 = percentile(deltas, 95);

console.log(`\n  Mean ΔNAV:         ${mean >= 0 ? "+" : ""}${mean.toFixed(1)}`);
console.log(`  Mean |ΔNAV|:       ${meanAbs.toFixed(1)}`);
console.log(`  Median ΔNAV:       ${p50 >= 0 ? "+" : ""}${p50.toFixed(1)}`);
console.log(`  IQR (25th–75th):   ${p25.toFixed(1)} to ${p75 >= 0 ? "+" : ""}${p75.toFixed(1)}`);
console.log(`  90% range (5–95):  ${p5.toFixed(1)} to ${p95 >= 0 ? "+" : ""}${p95.toFixed(1)}`);

// Proportion changing by more than thresholds
for (const threshold of [10, 25, 50, 100]) {
  const count = absDelta.filter(d => d >= threshold).length;
  const pct = (count / absDelta.length) * 100;
  console.log(`  |ΔNAV| ≥ ${String(threshold).padStart(3)}:     ${pct.toFixed(1)}% of players`);
}

// ── 9. Biggest movers: diagnostic ────────────────────────────────
console.log(`\n${"─".repeat(70)}`);
console.log("9. BIGGEST YEAR-TO-YEAR NAV MOVERS (diagnostic)");
console.log(`${"─".repeat(70)}`);

const sortedPairs = [...pairs].sort((a, b) =>
  Math.abs(b.s2.nav.total - b.s1.nav.total) - Math.abs(a.s2.nav.total - a.s1.nav.total)
);

console.log("\n  Top 15 biggest NAV changes:");
console.log(`  ${"Name".padEnd(25)} ${"Seasons".padStart(11)} ${"NAV1".padStart(6)} ${"NAV2".padStart(6)} ${"ΔNAV".padStart(7)} ${"Δoff".padStart(6)} ${"Δdef".padStart(6)} ${"Δage".padStart(6)} ${"Δcap".padStart(6)}`);
console.log(`  ${"─".repeat(85)}`);

for (const p of sortedPairs.slice(0, 15)) {
  const d = p.s2.nav.total - p.s1.nav.total;
  const dOff = p.s2.nav.off - p.s1.nav.off;
  const dDef = p.s2.nav.def - p.s1.nav.def;
  const dAge = p.s2.nav.age - p.s1.nav.age;
  const dCap = p.s2.nav.cap - p.s1.nav.cap;
  console.log(`  ${p.name.padEnd(25)} ${p.season1}→${p.season2} ${p.s1.nav.total.toFixed(0).padStart(6)} ${p.s2.nav.total.toFixed(0).padStart(6)} ${(d >= 0 ? "+" : "") + d.toFixed(0).padStart(6)} ${(dOff >= 0 ? "+" : "") + dOff.toFixed(0).padStart(5)} ${(dDef >= 0 ? "+" : "") + dDef.toFixed(0).padStart(5)} ${(dAge >= 0 ? "+" : "") + dAge.toFixed(0).padStart(5)} ${(dCap >= 0 ? "+" : "") + dCap.toFixed(0).padStart(5)}`);
}

// ── 10. NAV quintile persistence ─────────────────────────────────
console.log(`\n${"─".repeat(70)}`);
console.log("10. NAV QUINTILE PERSISTENCE: Do top-NAV players stay top-NAV?");
console.log(`${"─".repeat(70)}`);

// For each season, rank players into quintiles and see where they land next season
const seasonPairs = new Map<number, NavPair[]>();
for (const p of pairs) {
  if (!seasonPairs.has(p.season1)) seasonPairs.set(p.season1, []);
  seasonPairs.get(p.season1)!.push(p);
}

const transitionMatrix: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
let totalTransitions = 0;

for (const [, sPairs] of seasonPairs) {
  if (sPairs.length < 20) continue;
  // Rank by season1 NAV
  const sorted1 = [...sPairs].sort((a, b) => a.s1.nav.total - b.s1.nav.total);
  const q1Size = Math.floor(sorted1.length / 5);
  const quintile1 = new Map<string, number>();
  for (let q = 0; q < 5; q++) {
    const start = q * q1Size;
    const end = q === 4 ? sorted1.length : (q + 1) * q1Size;
    for (let i = start; i < end; i++) {
      quintile1.set(sorted1[i].s1.playerId, q);
    }
  }

  // Rank by season2 NAV
  const sorted2 = [...sPairs].sort((a, b) => a.s2.nav.total - b.s2.nav.total);
  const q2Size = Math.floor(sorted2.length / 5);
  for (let q = 0; q < 5; q++) {
    const start = q * q2Size;
    const end = q === 4 ? sorted2.length : (q + 1) * q2Size;
    for (let i = start; i < end; i++) {
      const q1 = quintile1.get(sorted2[i].s2.playerId);
      if (q1 !== undefined) {
        transitionMatrix[q1][q]++;
        totalTransitions++;
      }
    }
  }
}

console.log(`\n  Transition matrix (row=Year1 quintile, col=Year2 quintile)`);
console.log(`  ${"".padEnd(8)} ${"Q1(low)".padStart(8)} ${"Q2".padStart(8)} ${"Q3".padStart(8)} ${"Q4".padStart(8)} ${"Q5(high)".padStart(9)}  ${"Stayed±1".padStart(10)}`);
console.log(`  ${"─".repeat(65)}`);

for (let q = 0; q < 5; q++) {
  const rowTotal = transitionMatrix[q].reduce((a, b) => a + b, 0);
  const pcts = transitionMatrix[q].map(c => rowTotal > 0 ? (c / rowTotal * 100) : 0);
  const label = q === 0 ? "Q1(low)" : q === 4 ? "Q5(high)" : `Q${q + 1}`;
  const stayedNear = transitionMatrix[q].filter((_, i) => Math.abs(i - q) <= 1).reduce((a, b) => a + b, 0);
  const nearPct = rowTotal > 0 ? (stayedNear / rowTotal * 100) : 0;
  console.log(`  ${label.padEnd(8)} ${pcts.map(p => (p.toFixed(1) + "%").padStart(8)).join(" ")}  ${(nearPct.toFixed(1) + "%").padStart(10)}`);
}

// ── SUMMARY ──────────────────────────────────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log("SUMMARY");
console.log(`${"═".repeat(70)}`);

console.log(`\n  Consecutive-season pairs: ${pairs.length} (${fwdPairs.length} F + ${defPairs.length} D)`);
console.log(`\n  Component stability (Pearson r):`);
for (const comp of COMPONENTS) {
  const r = pearsonR(
    pairs.map(p => comp.extract(p.s1.nav)),
    pairs.map(p => comp.extract(p.s2.nav)),
  );
  console.log(`    ${comp.label.padEnd(22)} r = ${r.toFixed(3)}`);
}

console.log(`\n  Reference: STRAND trait average r = ${avgStrandR.toFixed(2)}`);
console.log(`             Total NAV r             = ${navR.toFixed(2)}`);

if (navR >= offR * 0.95 && navR >= defR * 0.95) {
  console.log(`\n  VERDICT: NAV aggregation preserves input stability — the composite is not noisier than its components.`);
} else if (navR < Math.min(offR, defR) - 0.05) {
  console.log(`\n  VERDICT: NAV aggregation adds some noise — total NAV is less stable than its strongest component.`);
} else {
  console.log(`\n  VERDICT: NAV stability is between its component stabilities — normal blending behavior.`);
}
