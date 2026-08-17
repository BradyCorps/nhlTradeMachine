// ── Breakout Model Backtest ──────────────────────────────────────
//
//   npx tsx scripts/backtest/breakout-backtest.ts
//
// For each season pair (N → N+1) from 2008–2024, computes breakout
// signals from season N and runs them through the breakout model, then
// checks whether the player actually broke out or regressed in season
// N+1. Measures calibration, lift over base rate, and discrimination.
//
// Signals available historically: age, position, ptsPace, avgTOI,
// xGPace, goalsPace, priorGames, changedScenery.
// Signals NOT available: EDGE burst data (tracking began ~2021-22),
// hdFinishingDelta (EDGE), prospectPtsPace (NHLe), draftOverall
// (only in 2025-26 bios file, so coverage is partial).

import fs from "fs";
import path from "path";
import { computeBreakout, type BreakoutSignals } from "../../app/lib/breakout-model";

const ROOT = process.cwd();

// ── Thresholds ─────────────────────────────────────────────────
const MIN_GP = 20;
const MIN_ICE_SECONDS = 300 * 60; // 300 minutes
const BREAKOUT_PTS_FLOOR = 12;    // minimum absolute increase
const BREAKOUT_PCT = 0.20;        // or 20% relative increase
const REGRESSION_PTS_FLOOR = 12;
const REGRESSION_PCT = 0.20;

// ── CSV parsing ────────────────────────────────────────────────
interface Row { [k: string]: string }

function readCsv(rel: string): Row[] {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rawHead = lines[0];
  const head = rawHead.replace(/^﻿/, "").split(",").map(h => h.replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const cells = line.split(",").map(c => c.replace(/^"|"$/g, ""));
    const row: Row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

const slug = (n: string): string =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();

// ── Data sources ───────────────────────────────────────────────
const SKATER_FILES = [
  "OtherData/HistoricalData/skaters_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_skaters.csv",
];
const BIOS_FILE = "OtherData/2025;26_player_bios.csv";
const SIGNINGS_FILE = "OtherData/contracts/signings.csv";

// ── Load skater performance data ───────────────────────────────
interface SkaterSeason {
  name: string;
  playerId: string;
  season: number;
  team: string;
  position: string;
  gp: number;
  ice: number;       // seconds
  pts: number;
  goals: number;
  xGoals: number;
  highDangerGoals: number;
  highDangerxGoals: number;
}

const allSeasons: SkaterSeason[] = [];
for (const rel of SKATER_FILES) {
  for (const r of readCsv(rel)) {
    if (r.situation !== "all") continue;
    const ice = Number(r.icetime);
    const gp = Number(r.games_played);
    const pts = Number(r.I_F_points);
    const goals = Number(r.I_F_goals);
    const xGoals = Number(r.I_F_xGoals);
    const hdGoals = Number(r.I_F_highDangerGoals);
    const hdxGoals = Number(r.I_F_highDangerxGoals);
    if (!(ice > 0) || !isFinite(gp) || !isFinite(pts)) continue;
    allSeasons.push({
      name: r.name,
      playerId: r.playerId,
      season: Number(r.season),
      team: r.team,
      position: r.position,
      gp, ice, pts, goals, xGoals,
      highDangerGoals: isFinite(hdGoals) ? hdGoals : 0,
      highDangerxGoals: isFinite(hdxGoals) ? hdxGoals : 0,
    });
  }
}

// Index by slug+season for lookups
type SeasonKey = string; // `${slug}|${season}`
const seasonIndex = new Map<SeasonKey, SkaterSeason>();
const playerSeasons = new Map<string, number[]>(); // slug → sorted seasons
for (const s of allSeasons) {
  const key = `${slug(s.name)}|${s.season}`;
  const existing = seasonIndex.get(key);
  if (!existing || s.ice > existing.ice) {
    seasonIndex.set(key, s);
  }
  const seasons = playerSeasons.get(slug(s.name)) ?? [];
  if (!seasons.includes(s.season)) seasons.push(s.season);
  playerSeasons.set(slug(s.name), seasons);
}
for (const [, seasons] of playerSeasons) seasons.sort((a, b) => a - b);

console.log(`Loaded ${allSeasons.length} skater-season rows (situation=all)`);

// ── Load birth years ───────────────────────────────────────────
// Priority: bios file (exact birth date), then signings (signAge + signDate)
const birthYear = new Map<string, number>(); // slug → birth year
const draftOverall = new Map<string, number>(); // slug → overall draft pick

// 1. Bios file
try {
  const biosRows = readCsv(BIOS_FILE);
  for (const r of biosRows) {
    const name = r["Player"] ?? r["player"];
    const dob = r["Date of Birth"] ?? r["dateOfBirth"];
    const overall = r["Overall Draft Position"] ?? r["overallDraftPosition"];
    if (!name || !dob) continue;
    const key = slug(name);
    const year = new Date(dob).getFullYear();
    if (isFinite(year) && year > 1960 && year < 2010) {
      birthYear.set(key, year);
    }
    const ov = Number(overall);
    if (isFinite(ov) && ov > 0) {
      draftOverall.set(key, ov);
    }
  }
  console.log(`Bios: ${birthYear.size} birth years, ${draftOverall.size} draft positions`);
} catch {
  console.log("Warning: could not load bios file");
}

// 2. Signings file — back-calculate birth year from signAge + signDate
try {
  const sigRows = readCsv(SIGNINGS_FILE);
  for (const r of sigRows) {
    const key = slug(r.player);
    if (birthYear.has(key)) continue; // bios is authoritative
    const signAge = Number(r.signAge);
    const signDate = r.signDate;
    if (!isFinite(signAge) || !signDate) continue;
    const signYear = new Date(signDate).getFullYear();
    if (isFinite(signYear) && signYear >= 2000) {
      birthYear.set(key, signYear - signAge);
    }
  }
  console.log(`After signings supplement: ${birthYear.size} total birth years`);
} catch {
  console.log("Warning: could not load signings file");
}

// ── Compute age at season start ────────────────────────────────
// MoneyPuck season year N = the N/N+1 season, starting ~Oct of year N
function ageAtSeason(playerSlug: string, season: number): number | null {
  const by = birthYear.get(playerSlug);
  if (by == null) return null;
  return season - by; // approximate: season starts in October of year `season`
}

// ── Pace computations ──────────────────────────────────────────
function ptsPace82(s: SkaterSeason): number {
  return s.gp > 0 ? (s.pts / s.gp) * 82 : 0;
}
function goalsPace82(s: SkaterSeason): number {
  return s.gp > 0 ? (s.goals / s.gp) * 82 : 0;
}
function xGPace82(s: SkaterSeason): number {
  return s.gp > 0 ? (s.xGoals / s.gp) * 82 : 0;
}
function avgTOI(s: SkaterSeason): number {
  return s.gp > 0 ? s.ice / s.gp / 60 : 0; // minutes per game
}

// ── Define breakout / regression ───────────────────────────────
function isBreakout(paceN: number, paceN1: number): boolean {
  const threshold = Math.max(BREAKOUT_PTS_FLOOR, paceN * BREAKOUT_PCT);
  return paceN1 >= paceN + threshold;
}
function isRegression(paceN: number, paceN1: number): boolean {
  const threshold = Math.max(REGRESSION_PTS_FLOOR, paceN * REGRESSION_PCT);
  return paceN1 <= paceN - threshold;
}

// ── Run the backtest ───────────────────────────────────────────
interface BacktestRow {
  name: string;
  seasonN: number;
  age: number;
  position: string;
  paceN: number;
  paceN1: number;
  breakoutProb: number;
  regressionProb: number;
  actualBreakout: boolean;
  actualRegression: boolean;
  changedScenery: boolean;
  driver: string;
  hasEdge: boolean;
}

const results: BacktestRow[] = [];
let skippedNoAge = 0;
let skippedNoNextSeason = 0;

// Test seasons: predict from season N, check season N+1
// Use 2008–2023 (N+1 goes up to 2024)
const TEST_SEASONS = Array.from({ length: 16 }, (_, i) => 2008 + i); // 2008-2023

for (const seasonN of TEST_SEASONS) {
  const seasonN1 = seasonN + 1;

  // Find all qualifying skaters in season N
  for (const [key, s] of seasonIndex) {
    if (!key.endsWith(`|${seasonN}`)) continue;
    if (s.gp < MIN_GP || s.ice < MIN_ICE_SECONDS) continue;
    if (s.position === "G") continue;

    const playerSlug = slug(s.name);

    // Need age
    const age = ageAtSeason(playerSlug, seasonN);
    if (age == null || age < 18 || age > 45) { skippedNoAge++; continue; }

    // Need next season data
    const next = seasonIndex.get(`${playerSlug}|${seasonN1}`);
    if (!next || next.gp < MIN_GP || next.ice < MIN_ICE_SECONDS) {
      skippedNoNextSeason++;
      continue;
    }

    const paceN = ptsPace82(s);
    const paceN1 = ptsPace82(next);

    // Changed scenery: different team
    const changedScenery = s.team !== next.team;

    // Compute breakout signals
    const xgPace = xGPace82(s);
    const glPace = goalsPace82(s);

    const signals: BreakoutSignals = {
      age,
      position: s.position,
      ptsPace: paceN,
      stablePace: paceN, // no multi-year baseline in raw data
      priorGames: s.gp,
      avgTOI: avgTOI(s),
      xGPace: xgPace > 0 ? xgPace : null,
      goalsPace: glPace > 0 ? glPace : null,
      hdFinishingDelta: null, // EDGE not available historically
      prospectPtsPace: null,  // NHLe not available
      draftOverall: draftOverall.get(playerSlug) ?? null,
      edgeBurstsOver20: null, // EDGE not available
      edgeSpeedMaxMph: null,
      changedScenery,
    };

    const result = computeBreakout(signals);

    results.push({
      name: s.name,
      seasonN,
      age,
      position: s.position,
      paceN,
      paceN1,
      breakoutProb: result.breakout,
      regressionProb: result.regression,
      actualBreakout: isBreakout(paceN, paceN1),
      actualRegression: isRegression(paceN, paceN1),
      changedScenery,
      driver: result.driver,
      hasEdge: result.hasEdgeSignal,
    });
  }
}

console.log(`\n${"═".repeat(70)}`);
console.log("  BREAKOUT MODEL BACKTEST");
console.log(`${"═".repeat(70)}`);
console.log(`\nPlayer-seasons evaluated:  ${results.length}`);
console.log(`Skipped (no age):         ${skippedNoAge}`);
console.log(`Skipped (no next season): ${skippedNoNextSeason}`);
console.log(`Seasons covered:          ${TEST_SEASONS[0]}–${TEST_SEASONS[TEST_SEASONS.length - 1]}`);
console.log(`Breakout threshold:       +${BREAKOUT_PTS_FLOOR} pts or +${BREAKOUT_PCT * 100}% (whichever is larger)`);
console.log(`Regression threshold:     -${REGRESSION_PTS_FLOOR} pts or -${REGRESSION_PCT * 100}% (whichever is larger)`);

// ── Base rates ─────────────────────────────────────────────────
const totalBreakouts = results.filter(r => r.actualBreakout).length;
const totalRegressions = results.filter(r => r.actualRegression).length;
const breakoutBaseRate = totalBreakouts / results.length;
const regressionBaseRate = totalRegressions / results.length;

console.log(`\n── Base rates ──`);
console.log(`Actual breakouts:    ${totalBreakouts} / ${results.length} = ${(breakoutBaseRate * 100).toFixed(1)}%`);
console.log(`Actual regressions:  ${totalRegressions} / ${results.length} = ${(regressionBaseRate * 100).toFixed(1)}%`);
console.log(`Status quo:          ${results.length - totalBreakouts - totalRegressions} / ${results.length} = ${((1 - breakoutBaseRate - regressionBaseRate) * 100).toFixed(1)}%`);

// ── Calibration: breakout probability bins ─────────────────────
console.log(`\n── Breakout calibration (predicted prob → actual breakout rate) ──`);
const breakoutBins = [
  { label: "0–5%",   lo: 0,    hi: 0.05 },
  { label: "5–10%",  lo: 0.05, hi: 0.10 },
  { label: "10–15%", lo: 0.10, hi: 0.15 },
  { label: "15–20%", lo: 0.15, hi: 0.20 },
  { label: "20–25%", lo: 0.20, hi: 0.25 },
  { label: "25–30%", lo: 0.25, hi: 0.30 },
  { label: "30%+",   lo: 0.30, hi: 1.01 },
];

console.log(`${"Bin".padEnd(10)} ${"N".padStart(6)} ${"Broke out".padStart(10)} ${"Rate".padStart(8)} ${"vs base".padStart(8)}`);
console.log("─".repeat(48));
for (const bin of breakoutBins) {
  const inBin = results.filter(r => r.breakoutProb >= bin.lo && r.breakoutProb < bin.hi);
  const hit = inBin.filter(r => r.actualBreakout).length;
  const rate = inBin.length > 0 ? hit / inBin.length : 0;
  const lift = breakoutBaseRate > 0 ? rate / breakoutBaseRate : 0;
  console.log(
    `${bin.label.padEnd(10)} ${String(inBin.length).padStart(6)} ${String(hit).padStart(10)} ${(rate * 100).toFixed(1).padStart(7)}% ${lift.toFixed(2).padStart(7)}x`
  );
}

// ── Calibration: regression probability bins ───────────────────
console.log(`\n── Regression calibration (predicted prob → actual regression rate) ──`);
const regressionBins = [
  { label: "0–5%",   lo: 0,    hi: 0.05 },
  { label: "5–10%",  lo: 0.05, hi: 0.10 },
  { label: "10–15%", lo: 0.10, hi: 0.15 },
  { label: "15–20%", lo: 0.15, hi: 0.20 },
  { label: "20%+",   lo: 0.20, hi: 1.01 },
];

console.log(`${"Bin".padEnd(10)} ${"N".padStart(6)} ${"Regressed".padStart(10)} ${"Rate".padStart(8)} ${"vs base".padStart(8)}`);
console.log("─".repeat(48));
for (const bin of regressionBins) {
  const inBin = results.filter(r => r.regressionProb >= bin.lo && r.regressionProb < bin.hi);
  const hit = inBin.filter(r => r.actualRegression).length;
  const rate = inBin.length > 0 ? hit / inBin.length : 0;
  const lift = regressionBaseRate > 0 ? rate / regressionBaseRate : 0;
  console.log(
    `${bin.label.padEnd(10)} ${String(inBin.length).padStart(6)} ${String(hit).padStart(10)} ${(rate * 100).toFixed(1).padStart(7)}% ${lift.toFixed(2).padStart(7)}x`
  );
}

// ── Discrimination: AUC (breakout) ─────────────────────────────
// Simple trapezoidal AUC over predicted probability ranking
function computeAUC(scored: { prob: number; actual: boolean }[]): number {
  const sorted = [...scored].sort((a, b) => b.prob - a.prob);
  const P = sorted.filter(s => s.actual).length;
  const N = sorted.length - P;
  if (P === 0 || N === 0) return 0.5;
  let tp = 0, fp = 0;
  let prevTPR = 0, prevFPR = 0;
  let auc = 0;
  for (const s of sorted) {
    if (s.actual) tp++; else fp++;
    const tpr = tp / P;
    const fpr = fp / N;
    auc += (fpr - prevFPR) * (tpr + prevTPR) / 2;
    prevTPR = tpr;
    prevFPR = fpr;
  }
  return auc;
}

const breakoutAUC = computeAUC(results.map(r => ({ prob: r.breakoutProb, actual: r.actualBreakout })));
const regressionAUC = computeAUC(results.map(r => ({ prob: r.regressionProb, actual: r.actualRegression })));

console.log(`\n── Discrimination (AUC) ──`);
console.log(`Breakout AUC:    ${breakoutAUC.toFixed(4)}  (0.50 = coin flip, 1.00 = perfect)`);
console.log(`Regression AUC:  ${regressionAUC.toFixed(4)}`);

// ── Top-quintile lift ──────────────────────────────────────────
// Among the top 20% of predicted breakout probabilities, how much more
// often did breakouts actually occur vs the overall base rate?
const sortedByBreakout = [...results].sort((a, b) => b.breakoutProb - a.breakoutProb);
const topQuintile = sortedByBreakout.slice(0, Math.ceil(results.length * 0.2));
const topQuintileHits = topQuintile.filter(r => r.actualBreakout).length;
const topQuintileRate = topQuintileHits / topQuintile.length;
const topLift = breakoutBaseRate > 0 ? topQuintileRate / breakoutBaseRate : 0;

console.log(`\n── Top-quintile lift (breakout) ──`);
console.log(`Top 20% predicted: ${topQuintile.length} players, ${topQuintileHits} broke out (${(topQuintileRate * 100).toFixed(1)}%)`);
console.log(`Lift vs base rate: ${topLift.toFixed(2)}x`);

const sortedByRegression = [...results].sort((a, b) => b.regressionProb - a.regressionProb);
const topRegQuintile = sortedByRegression.slice(0, Math.ceil(results.length * 0.2));
const topRegHits = topRegQuintile.filter(r => r.actualRegression).length;
const topRegRate = topRegHits / topRegQuintile.length;
const topRegLift = regressionBaseRate > 0 ? topRegRate / regressionBaseRate : 0;

console.log(`\n── Top-quintile lift (regression) ──`);
console.log(`Top 20% predicted: ${topRegQuintile.length} players, ${topRegHits} regressed (${(topRegRate * 100).toFixed(1)}%)`);
console.log(`Lift vs base rate: ${topRegLift.toFixed(2)}x`);

// ── By age group ───────────────────────────────────────────────
console.log(`\n── Breakout rate by age group ──`);
const ageGroups = [
  { label: "≤22 (prospect)", filter: (r: BacktestRow) => r.age <= 22 },
  { label: "23-24 (young)",  filter: (r: BacktestRow) => r.age >= 23 && r.age <= 24 },
  { label: "25-26",          filter: (r: BacktestRow) => r.age >= 25 && r.age <= 26 },
  { label: "27-29 (prime)",  filter: (r: BacktestRow) => r.age >= 27 && r.age <= 29 },
  { label: "30+ (veteran)",  filter: (r: BacktestRow) => r.age >= 30 },
];

console.log(`${"Age group".padEnd(20)} ${"N".padStart(6)} ${"BO rate".padStart(8)} ${"Pred avg".padStart(9)} ${"Reg rate".padStart(9)} ${"Pred avg".padStart(9)}`);
console.log("─".repeat(65));
for (const ag of ageGroups) {
  const group = results.filter(ag.filter);
  const boRate = group.filter(r => r.actualBreakout).length / group.length;
  const boPred = group.reduce((s, r) => s + r.breakoutProb, 0) / group.length;
  const regRate = group.filter(r => r.actualRegression).length / group.length;
  const regPred = group.reduce((s, r) => s + r.regressionProb, 0) / group.length;
  console.log(
    `${ag.label.padEnd(20)} ${String(group.length).padStart(6)} ${(boRate * 100).toFixed(1).padStart(7)}% ${(boPred * 100).toFixed(1).padStart(8)}% ${(regRate * 100).toFixed(1).padStart(8)}% ${(regPred * 100).toFixed(1).padStart(8)}%`
  );
}

// ── By position ────────────────────────────────────────────────
console.log(`\n── Breakout rate by position ──`);
const posGroups = [
  { label: "Forwards (C/LW/RW)", filter: (r: BacktestRow) => r.position !== "D" },
  { label: "Defence (D)",        filter: (r: BacktestRow) => r.position === "D" },
];

console.log(`${"Position".padEnd(22)} ${"N".padStart(6)} ${"BO rate".padStart(8)} ${"Pred avg".padStart(9)} ${"Reg rate".padStart(9)} ${"Pred avg".padStart(9)}`);
console.log("─".repeat(67));
for (const pg of posGroups) {
  const group = results.filter(pg.filter);
  const boRate = group.filter(r => r.actualBreakout).length / group.length;
  const boPred = group.reduce((s, r) => s + r.breakoutProb, 0) / group.length;
  const regRate = group.filter(r => r.actualRegression).length / group.length;
  const regPred = group.reduce((s, r) => s + r.regressionProb, 0) / group.length;
  console.log(
    `${pg.label.padEnd(22)} ${String(group.length).padStart(6)} ${(boRate * 100).toFixed(1).padStart(7)}% ${(boPred * 100).toFixed(1).padStart(8)}% ${(regRate * 100).toFixed(1).padStart(8)}% ${(regPred * 100).toFixed(1).padStart(8)}%`
  );
}

// ── Driver breakdown ───────────────────────────────────────────
console.log(`\n── Breakout driver breakdown ──`);
const drivers = ["AGE", "FINISHING_LUCK", "PEDIGREE", "OPPORTUNITY", "BURST", "NONE"] as const;
console.log(`${"Driver".padEnd(18)} ${"N".padStart(6)} ${"BO rate".padStart(8)} ${"Avg prob".padStart(9)}`);
console.log("─".repeat(44));
for (const d of drivers) {
  const group = results.filter(r => r.driver === d);
  if (group.length === 0) continue;
  const boRate = group.filter(r => r.actualBreakout).length / group.length;
  const avgProb = group.reduce((s, r) => s + r.breakoutProb, 0) / group.length;
  console.log(
    `${d.padEnd(18)} ${String(group.length).padStart(6)} ${(boRate * 100).toFixed(1).padStart(7)}% ${(avgProb * 100).toFixed(1).padStart(8)}%`
  );
}

// ── Precision at key thresholds ────────────────────────────────
console.log(`\n── Precision at breakout probability thresholds ──`);
const thresholds = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40];
console.log(`${"Threshold".padEnd(12)} ${"Flagged".padStart(8)} ${"Hit".padStart(6)} ${"Precision".padStart(10)} ${"Recall".padStart(8)} ${"Lift".padStart(6)}`);
console.log("─".repeat(54));
for (const t of thresholds) {
  const flagged = results.filter(r => r.breakoutProb >= t);
  const hits = flagged.filter(r => r.actualBreakout).length;
  const precision = flagged.length > 0 ? hits / flagged.length : 0;
  const recall = totalBreakouts > 0 ? hits / totalBreakouts : 0;
  const lift = breakoutBaseRate > 0 ? precision / breakoutBaseRate : 0;
  console.log(
    `≥${(t * 100).toFixed(0).padStart(3)}%      ${String(flagged.length).padStart(8)} ${String(hits).padStart(6)} ${(precision * 100).toFixed(1).padStart(9)}% ${(recall * 100).toFixed(1).padStart(7)}% ${lift.toFixed(2).padStart(5)}x`
  );
}

// ── Season-by-season trend ─────────────────────────────────────
console.log(`\n── Season-by-season breakout prediction ──`);
console.log(`${"Season".padEnd(10)} ${"N".padStart(5)} ${"BO base".padStart(8)} ${"Top-Q lift".padStart(11)} ${"AUC".padStart(7)}`);
console.log("─".repeat(44));
for (const sn of TEST_SEASONS) {
  const seasonResults = results.filter(r => r.seasonN === sn);
  if (seasonResults.length < 20) continue;
  const base = seasonResults.filter(r => r.actualBreakout).length / seasonResults.length;
  const sorted = [...seasonResults].sort((a, b) => b.breakoutProb - a.breakoutProb);
  const topQ = sorted.slice(0, Math.ceil(sorted.length * 0.2));
  const topQRate = topQ.filter(r => r.actualBreakout).length / topQ.length;
  const lift = base > 0 ? topQRate / base : 0;
  const auc = computeAUC(seasonResults.map(r => ({ prob: r.breakoutProb, actual: r.actualBreakout })));
  console.log(
    `${sn}–${String(sn + 1).slice(2).padEnd(4)} ${String(seasonResults.length).padStart(5)} ${(base * 100).toFixed(1).padStart(7)}% ${lift.toFixed(2).padStart(10)}x ${auc.toFixed(3).padStart(6)}`
  );
}

// ── Notable examples ───────────────────────────────────────────
console.log(`\n── Biggest breakout hits (high prob → actual breakout) ──`);
const breakoutHits = results
  .filter(r => r.actualBreakout && r.breakoutProb >= 0.15)
  .sort((a, b) => (b.paceN1 - b.paceN) - (a.paceN1 - a.paceN))
  .slice(0, 15);

console.log(`${"Name".padEnd(24)} ${"Season".padEnd(8)} ${"Age".padStart(4)} ${"Pred".padStart(6)} ${"PaceN".padStart(7)} ${"PaceN+1".padStart(8)} ${"Δ".padStart(6)} ${"Driver".padEnd(16)}`);
console.log("─".repeat(82));
for (const r of breakoutHits) {
  console.log(
    `${r.name.padEnd(24)} ${r.seasonN}–${String(r.seasonN + 1).slice(2).padEnd(3)} ${String(r.age).padStart(4)} ${(r.breakoutProb * 100).toFixed(0).padStart(5)}% ${r.paceN.toFixed(1).padStart(7)} ${r.paceN1.toFixed(1).padStart(8)} ${(r.paceN1 - r.paceN > 0 ? "+" : "") + (r.paceN1 - r.paceN).toFixed(1).padStart(5)} ${r.driver.padEnd(16)}`
  );
}

console.log(`\n── Biggest breakout misses (high prob → no breakout) ──`);
const breakoutMisses = results
  .filter(r => !r.actualBreakout && r.breakoutProb >= 0.25)
  .sort((a, b) => b.breakoutProb - a.breakoutProb)
  .slice(0, 10);

console.log(`${"Name".padEnd(24)} ${"Season".padEnd(8)} ${"Age".padStart(4)} ${"Pred".padStart(6)} ${"PaceN".padStart(7)} ${"PaceN+1".padStart(8)} ${"Δ".padStart(6)}`);
console.log("─".repeat(68));
for (const r of breakoutMisses) {
  console.log(
    `${r.name.padEnd(24)} ${r.seasonN}–${String(r.seasonN + 1).slice(2).padEnd(3)} ${String(r.age).padStart(4)} ${(r.breakoutProb * 100).toFixed(0).padStart(5)}% ${r.paceN.toFixed(1).padStart(7)} ${r.paceN1.toFixed(1).padStart(8)} ${(r.paceN1 - r.paceN > 0 ? "+" : "") + (r.paceN1 - r.paceN).toFixed(1).padStart(5)}`
  );
}

// ── Regression notable examples ────────────────────────────────
console.log(`\n── Biggest regression hits (high prob → actual regression) ──`);
const regressionHits = results
  .filter(r => r.actualRegression && r.regressionProb >= 0.12)
  .sort((a, b) => (a.paceN1 - a.paceN) - (b.paceN1 - b.paceN))
  .slice(0, 15);

console.log(`${"Name".padEnd(24)} ${"Season".padEnd(8)} ${"Age".padStart(4)} ${"Pred".padStart(6)} ${"PaceN".padStart(7)} ${"PaceN+1".padStart(8)} ${"Δ".padStart(6)}`);
console.log("─".repeat(68));
for (const r of regressionHits) {
  console.log(
    `${r.name.padEnd(24)} ${r.seasonN}–${String(r.seasonN + 1).slice(2).padEnd(3)} ${String(r.age).padStart(4)} ${(r.regressionProb * 100).toFixed(0).padStart(5)}% ${r.paceN.toFixed(1).padStart(7)} ${r.paceN1.toFixed(1).padStart(8)} ${(r.paceN1 - r.paceN > 0 ? "+" : "") + (r.paceN1 - r.paceN).toFixed(1).padStart(5)}`
  );
}

// ── Summary ────────────────────────────────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log("  SUMMARY");
console.log(`${"═".repeat(70)}`);
console.log(`
The breakout model was backtested across ${results.length} player-seasons
(${TEST_SEASONS[0]}–${TEST_SEASONS[TEST_SEASONS.length - 1]}), predicting from season N and checking season N+1.

Key findings:
  Breakout AUC:           ${breakoutAUC.toFixed(4)}
  Regression AUC:         ${regressionAUC.toFixed(4)}
  Top-quintile BO lift:   ${topLift.toFixed(2)}x vs ${(breakoutBaseRate * 100).toFixed(1)}% base rate
  Top-quintile REG lift:  ${topRegLift.toFixed(2)}x vs ${(regressionBaseRate * 100).toFixed(1)}% base rate

Note: This backtest runs WITHOUT EDGE data (bursts, speed, HD finishing
delta), prospect NHLe pace, or complete draft position data — all of which
the live model uses when available. The backtest therefore measures the
floor of the model's discrimination, not the ceiling.
`);
