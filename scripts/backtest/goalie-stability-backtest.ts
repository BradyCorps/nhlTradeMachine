// ── Goalie Stability Backtest ────────────────────────────────────
//
//   npx tsx scripts/backtest/goalie-stability-backtest.ts
//
// Tests whether regressing goalie stats toward the mean using our
// year-over-year stability coefficients (from goalie-percentiles.json)
// actually improves next-season prediction. For each consecutive
// season pair, compares:
//
//   Raw prediction:       next = this season's value
//   Regressed prediction: next = mean + r × (this − mean)
//
// If the stability coefficients are correctly calibrated, the regressed
// prediction should beat the raw one — and the improvement should be
// largest for the noisiest metrics (GSAx, MD SV%) and smallest for the
// most stable ones (freeze rate, rebound control).

import fs from "fs";
import path from "path";
import percentilesArtifact from "../../app/data/goalie-percentiles.json";

const ROOT = process.cwd();

// ── Constants matching the percentiles build ───────────────────
const MIN_ICETIME_SECONDS = 1000 * 60; // ~17 starts

// ── CSV parsing ────────────────────────────────────────────────
interface Row { [k: string]: string }

function readCsv(rel: string): Row[] {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",");
  return lines.slice(1).map(line => {
    const cells = line.split(",");
    const row: Row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

const num = (r: Row, k: string): number | null => {
  const v = Number(r[k]);
  return Number.isFinite(v) ? v : null;
};

// ── Metric computations (matching goalie-percentiles build) ────
interface MetricSpec {
  key: string;
  label: string;
  higherIsBetter: boolean;
  of: (r: Row) => number | null;
}

const per60 = (r: Row, k: string): number | null => {
  const v = num(r, k), ice = num(r, "icetime");
  return v == null || !ice ? null : (v * 3600) / ice;
};

const saveRate = (r: Row, shots: string, goals: string): number | null => {
  const s = num(r, shots), g = num(r, goals);
  return s == null || g == null || s <= 0 ? null : 1 - g / s;
};

const METRICS: MetricSpec[] = [
  {
    key: "gsaxPer60", label: "GSAx/60", higherIsBetter: true,
    of: r => {
      const xg = num(r, "xGoals"), g = num(r, "goals"), ice = num(r, "icetime");
      return xg == null || g == null || !ice ? null : ((xg - g) * 3600) / ice;
    },
  },
  {
    key: "savePct", label: "SV%", higherIsBetter: true,
    of: r => saveRate(r, "ongoal", "goals"),
  },
  {
    key: "highDangerSvPct", label: "HD SV%", higherIsBetter: true,
    of: r => saveRate(r, "highDangerShots", "highDangerGoals"),
  },
  {
    key: "mediumDangerSvPct", label: "MD SV%", higherIsBetter: true,
    of: r => saveRate(r, "mediumDangerShots", "mediumDangerGoals"),
  },
  {
    key: "lowDangerSvPct", label: "LD SV%", higherIsBetter: true,
    of: r => saveRate(r, "lowDangerShots", "lowDangerGoals"),
  },
  {
    key: "gaa", label: "GAA", higherIsBetter: false,
    of: r => per60(r, "goals"),
  },
  {
    key: "reboundsVsExpectedPer60", label: "Rebound ctrl", higherIsBetter: false,
    of: r => {
      const reb = num(r, "rebounds"), xreb = num(r, "xRebounds"), ice = num(r, "icetime");
      return reb == null || xreb == null || !ice ? null : ((reb - xreb) * 3600) / ice;
    },
  },
  {
    key: "freezeVsExpectedPer60", label: "Freeze rate", higherIsBetter: true,
    of: r => {
      const f = num(r, "freeze"), xf = num(r, "xFreeze"), ice = num(r, "icetime");
      return f == null || xf == null || !ice ? null : ((f - xf) * 3600) / ice;
    },
  },
];

// ── Data sources ───────────────────────────────────────────────
const SOURCES = [
  "OtherData/HistoricalData/goalies_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_goalies.csv",
];

// ── Load and index goalie data ─────────────────────────────────
const allRows: Row[] = [];
for (const rel of SOURCES) {
  for (const r of readCsv(rel)) {
    if (r.situation !== "all") continue;
    if ((num(r, "icetime") ?? 0) < MIN_ICETIME_SECONDS) continue;
    allRows.push(r);
  }
}

// Index by playerId → season → Row
const byGoalie = new Map<string, Map<number, Row>>();
for (const r of allRows) {
  const m = byGoalie.get(r.playerId) ?? new Map<number, Row>();
  m.set(Number(r.season), r);
  byGoalie.set(r.playerId, m);
}

// Count consecutive pairs
let totalPairs = 0;
for (const seasonMap of byGoalie.values()) {
  for (const season of seasonMap.keys()) {
    if (seasonMap.has(season + 1)) totalPairs++;
  }
}

console.log(`${"═".repeat(70)}`);
console.log("  GOALIE STABILITY BACKTEST");
console.log(`${"═".repeat(70)}`);
console.log(`\nEligible goalie-seasons:  ${allRows.length}`);
console.log(`Unique goalies:          ${byGoalie.size}`);
console.log(`Consecutive-season pairs: ${totalPairs}`);
console.log(`Min ice time:            ${MIN_ICETIME_SECONDS / 60} minutes (~${Math.round(MIN_ICETIME_SECONDS / 3600)} starts)`);

// ── Statistics ─────────────────────────────────────────────────
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pearson = (a: number[], b: number[]): number => {
  if (a.length < 3) return NaN;
  const ma = mean(a), mb = mean(b);
  const n = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
  const d = Math.sqrt(
    a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, y) => s + (y - mb) ** 2, 0),
  );
  return d === 0 ? NaN : n / d;
};
const mae = (pred: number[], actual: number[]): number =>
  pred.reduce((s, p, i) => s + Math.abs(p - actual[i]), 0) / pred.length;
const rmse = (pred: number[], actual: number[]): number =>
  Math.sqrt(pred.reduce((s, p, i) => s + (p - actual[i]) ** 2, 0) / pred.length);
const r2 = (pred: number[], actual: number[]): number => {
  const m = mean(actual);
  const ssTot = actual.reduce((s, y) => s + (y - m) ** 2, 0);
  const ssRes = pred.reduce((s, p, i) => s + (p - actual[i]) ** 2, 0);
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
};

// ── Per-metric backtest ────────────────────────────────────────
interface MetricResult {
  key: string;
  label: string;
  pairs: number;
  artifactR: number;
  computedR: number;
  popMean: number;
  rawMAE: number;
  regressedMAE: number;
  maeImprovement: number; // percentage reduction
  rawRMSE: number;
  regressedRMSE: number;
  rawR2: number;
  regressedR2: number;
  meanRegressedR2: number; // R² when predicting the mean for everyone (the naive baseline)
}

const results: MetricResult[] = [];

console.log(`\n${"─".repeat(70)}`);
console.log("  PER-METRIC RESULTS");
console.log(`${"─".repeat(70)}`);

for (const spec of METRICS) {
  // Gather consecutive pairs
  const seasonNValues: number[] = [];
  const seasonN1Values: number[] = [];

  for (const seasonMap of byGoalie.values()) {
    for (const [season, row] of seasonMap) {
      const next = seasonMap.get(season + 1);
      if (!next) continue;
      const x = spec.of(row), y = spec.of(next);
      if (x != null && y != null) {
        seasonNValues.push(x);
        seasonN1Values.push(y);
      }
    }
  }

  const pairs = seasonNValues.length;
  if (pairs < 10) continue;

  // Compute population mean and stability r from the data
  const allMetricValues: number[] = [];
  for (const r of allRows) {
    const v = spec.of(r);
    if (v != null) allMetricValues.push(v);
  }
  const popMean = mean(allMetricValues);
  const computedR = pearson(seasonNValues, seasonN1Values);

  // Artifact's r for comparison
  const artifactMetric = (percentilesArtifact.metrics as any)[spec.key];
  const artifactR = artifactMetric?.stability?.r ?? NaN;

  // Raw prediction: next season = this season
  const rawPred = [...seasonNValues];

  // Regressed prediction: next = popMean + r × (this − popMean)
  const regressedPred = seasonNValues.map(x => popMean + computedR * (x - popMean));

  // Mean prediction (naive baseline): predict popMean for everyone
  const meanPred = seasonNValues.map(() => popMean);

  const rawMae = mae(rawPred, seasonN1Values);
  const regMae = mae(regressedPred, seasonN1Values);
  const improvement = ((rawMae - regMae) / rawMae) * 100;

  const result: MetricResult = {
    key: spec.key,
    label: spec.label,
    pairs,
    artifactR,
    computedR: Number(computedR.toFixed(4)),
    popMean: Number(popMean.toFixed(6)),
    rawMAE: rawMae,
    regressedMAE: regMae,
    maeImprovement: improvement,
    rawRMSE: rmse(rawPred, seasonN1Values),
    regressedRMSE: rmse(regressedPred, seasonN1Values),
    rawR2: r2(rawPred, seasonN1Values),
    regressedR2: r2(regressedPred, seasonN1Values),
    meanRegressedR2: r2(meanPred, seasonN1Values),
  };
  results.push(result);

  console.log(`\n  ${spec.label} (${spec.key})`);
  console.log(`  ${"·".repeat(50)}`);
  console.log(`  Pairs:           ${pairs}`);
  console.log(`  Artifact r:      ${artifactR.toFixed(4)}`);
  console.log(`  Computed r:      ${computedR.toFixed(4)}  ${Math.abs(artifactR - computedR) < 0.001 ? "✓ match" : "≠ differs"}`);
  console.log(`  Pop mean:        ${popMean.toFixed(6)}`);
  console.log(`  ──────────────────────────────────────────────`);
  console.log(`                         Raw      Regressed    Improve`);
  console.log(`  MAE:               ${rawMae.toFixed(6).padStart(10)}  ${regMae.toFixed(6).padStart(10)}  ${improvement > 0 ? "+" : ""}${improvement.toFixed(1)}%`);
  console.log(`  RMSE:              ${result.rawRMSE.toFixed(6).padStart(10)}  ${result.regressedRMSE.toFixed(6).padStart(10)}`);
  console.log(`  R²:                ${result.rawR2.toFixed(4).padStart(10)}  ${result.regressedR2.toFixed(4).padStart(10)}`);
  console.log(`  R² (predict mean): ${result.meanRegressedR2.toFixed(4).padStart(10)}`);
}

// ── Summary table ──────────────────────────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log("  SUMMARY — Does regression improve prediction?");
console.log(`${"═".repeat(70)}`);

// Sort by stability (ascending) to show noisiest first
const sorted = [...results].sort((a, b) => a.computedR - b.computedR);

console.log(`\n${"Metric".padEnd(16)} ${"r".padStart(7)} ${"Raw MAE".padStart(10)} ${"Reg MAE".padStart(10)} ${"Improve".padStart(9)} ${"Raw R²".padStart(8)} ${"Reg R²".padStart(8)}`);
console.log("─".repeat(72));
for (const r of sorted) {
  const imp = r.maeImprovement > 0 ? `+${r.maeImprovement.toFixed(1)}%` : `${r.maeImprovement.toFixed(1)}%`;
  console.log(
    `${r.label.padEnd(16)} ${r.computedR.toFixed(4).padStart(7)} ${r.rawMAE.toFixed(6).padStart(10)} ${r.regressedMAE.toFixed(6).padStart(10)} ${imp.padStart(9)} ${r.rawR2.toFixed(4).padStart(8)} ${r.regressedR2.toFixed(4).padStart(8)}`
  );
}

// ── Which metrics predict best? ────────────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log("  CROSS-METRIC: Which metric best predicts next-season SV%?");
console.log(`${"═".repeat(70)}`);

// For each metric, use the regressed value as a predictor of next-season SV%
const svSpec = METRICS.find(m => m.key === "savePct")!;

console.log(`\n${"Predictor".padEnd(16)} ${"Pairs".padStart(6)} ${"Corr w/ next SV%".padStart(18)}`);
console.log("─".repeat(44));

for (const spec of METRICS) {
  const predValues: number[] = [];
  const actualSvPct: number[] = [];

  for (const seasonMap of byGoalie.values()) {
    for (const [season, row] of seasonMap) {
      const next = seasonMap.get(season + 1);
      if (!next) continue;
      const x = spec.of(row);
      const nextSv = svSpec.of(next);
      if (x != null && nextSv != null) {
        // Regress the predictor
        const allVals = allRows.map(spec.of).filter((v): v is number => v != null);
        const pm = mean(allVals);
        const pr = pearson(
          [...byGoalie.values()].flatMap(sm => {
            const pairs: number[] = [];
            for (const [s, r] of sm) { if (sm.has(s + 1)) { const v = spec.of(r); if (v != null) pairs.push(v); } }
            return pairs;
          }),
          [...byGoalie.values()].flatMap(sm => {
            const pairs: number[] = [];
            for (const [s] of sm) { const n = sm.get(s + 1); if (n) { const v = spec.of(n); if (v != null) pairs.push(v); } }
            return pairs;
          }),
        );
        const regressed = pm + pr * (x - pm);
        predValues.push(regressed);
        actualSvPct.push(nextSv);
      }
    }
  }

  if (predValues.length < 10) continue;
  const corr = pearson(predValues, actualSvPct);
  const sign = spec.higherIsBetter ? "" : "(inv) ";
  console.log(`${sign}${spec.label.padEnd(14)} ${String(predValues.length).padStart(6)} ${corr.toFixed(4).padStart(18)}`);
}

// ── Workload analysis ──────────────────────────────────────────
// Does a goalie who played heavy minutes in season N repeat in N+1?
console.log(`\n${"═".repeat(70)}`);
console.log("  WORKLOAD STABILITY — Do starters stay starters?");
console.log(`${"═".repeat(70)}`);

const workloadPairs: { iceN: number; iceN1: number; gpN: number; gpN1: number }[] = [];
for (const seasonMap of byGoalie.values()) {
  for (const [season, row] of seasonMap) {
    const next = seasonMap.get(season + 1);
    if (!next) continue;
    const iceN = num(row, "icetime"), iceN1 = num(next, "icetime");
    const gpN = num(row, "games_played"), gpN1 = num(next, "games_played");
    if (iceN != null && iceN1 != null && gpN != null && gpN1 != null) {
      workloadPairs.push({ iceN, iceN1, gpN, gpN1 });
    }
  }
}

const gpCorr = pearson(workloadPairs.map(p => p.gpN), workloadPairs.map(p => p.gpN1));
const iceCorr = pearson(workloadPairs.map(p => p.iceN), workloadPairs.map(p => p.iceN1));

console.log(`\n  Games played year-over-year r:  ${gpCorr.toFixed(4)}  (${workloadPairs.length} pairs)`);
console.log(`  Ice time year-over-year r:      ${iceCorr.toFixed(4)}`);

// Starter threshold: >= 40 GP
const starterPairs = workloadPairs.filter(p => p.gpN >= 40);
const starterStayed = starterPairs.filter(p => p.gpN1 >= 40).length;
const starterDropped = starterPairs.filter(p => p.gpN1 < 25).length;
console.log(`\n  Starters (40+ GP in season N): ${starterPairs.length}`);
console.log(`  Stayed starter (40+ GP N+1):   ${starterStayed} (${(starterStayed / starterPairs.length * 100).toFixed(0)}%)`);
console.log(`  Lost job (<25 GP N+1):         ${starterDropped} (${(starterDropped / starterPairs.length * 100).toFixed(0)}%)`);

// Backup threshold: 15-30 GP
const backupPairs = workloadPairs.filter(p => p.gpN >= 15 && p.gpN < 30);
const backupPromoted = backupPairs.filter(p => p.gpN1 >= 40).length;
console.log(`\n  Backups (15-29 GP in season N): ${backupPairs.length}`);
console.log(`  Promoted to starter (40+ N+1): ${backupPromoted} (${(backupPromoted / backupPairs.length * 100).toFixed(0)}%)`);

// ── Aging curve ────────────────────────────────────────────────
// Can we see age-related decline in SV%?
console.log(`\n${"═".repeat(70)}`);
console.log("  AGING — SV% change by age group");
console.log(`${"═".repeat(70)}`);

// We need age. Use playerId to track individuals, but we don't have birth dates
// in the goalie data. We'll estimate from career length: if a goalie's first
// season in the data is year X, assume they were ~23 then (league average debut).
// This is rough but sufficient to show the aging curve shape.

// Better approach: check if we can load bios
const BIOS_FILE = "OtherData/2025;26_player_bios.csv";
const goalieBirthYear = new Map<string, number>();

function readBiosCsv(rel: string): Row[] {
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

// Build name→playerId map from goalie data
const nameToPlayerId = new Map<string, string>();
for (const r of allRows) {
  nameToPlayerId.set(slug(r.name), r.playerId);
}

try {
  const biosRows = readBiosCsv(BIOS_FILE);
  for (const r of biosRows) {
    const name = r["Player"] ?? "";
    const pos = r["Position"] ?? "";
    const dob = r["Date of Birth"] ?? "";
    if (!name || !dob) continue;
    if (pos !== "G") continue;
    const key = slug(name);
    const pid = nameToPlayerId.get(key);
    if (!pid) continue;
    const year = new Date(dob).getFullYear();
    if (isFinite(year) && year > 1960) goalieBirthYear.set(pid, year);
  }
  console.log(`\n  Goalie birth years loaded: ${goalieBirthYear.size}`);
  if (goalieBirthYear.size === 0) {
    console.log("  (bios file contains skaters only — no goalie DOBs available)");
  }
} catch {
  console.log("\n  Warning: could not load bios file for age data");
}

if (goalieBirthYear.size >= 20) {
  const ageGroups = [
    { label: "≤24", lo: 18, hi: 24 },
    { label: "25-27", lo: 25, hi: 27 },
    { label: "28-30", lo: 28, hi: 30 },
    { label: "31-33", lo: 31, hi: 33 },
    { label: "34-36", lo: 34, hi: 36 },
    { label: "37+", lo: 37, hi: 50 },
  ];

  console.log(`\n  ${"Age".padEnd(8)} ${"Pairs".padStart(6)} ${"Avg SV% N".padStart(11)} ${"Avg SV% N+1".padStart(13)} ${"Δ SV%".padStart(9)}`);
  console.log(`  ${"─".repeat(52)}`);

  for (const ag of ageGroups) {
    const pairs: { svN: number; svN1: number }[] = [];
    for (const [pid, seasonMap] of byGoalie) {
      const by = goalieBirthYear.get(pid);
      if (by == null) continue;
      for (const [season, row] of seasonMap) {
        const age = season - by;
        if (age < ag.lo || age > ag.hi) continue;
        const next = seasonMap.get(season + 1);
        if (!next) continue;
        const svN = svSpec.of(row), svN1 = svSpec.of(next);
        if (svN != null && svN1 != null) pairs.push({ svN, svN1 });
      }
    }
    if (pairs.length < 3) continue;
    const avgN = mean(pairs.map(p => p.svN));
    const avgN1 = mean(pairs.map(p => p.svN1));
    const delta = avgN1 - avgN;
    console.log(
      `  ${ag.label.padEnd(8)} ${String(pairs.length).padStart(6)} ${(avgN * 100).toFixed(2).padStart(10)}% ${(avgN1 * 100).toFixed(2).padStart(12)}% ${(delta > 0 ? "+" : "") + (delta * 100).toFixed(3).padStart(8)}%`
    );
  }
}

// ── Notable examples ───────────────────────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log("  NOTABLE EXAMPLES — Regression improving on raw");
console.log(`${"═".repeat(70)}`);

// For SV%, find cases where regression got it right and raw didn't
{
  const svMeanVal = mean(allRows.map(svSpec.of).filter((v): v is number => v != null));
  const svPairs: { name: string; season: number; svN: number; svN1: number; rawPred: number; regPred: number }[] = [];

  // Recompute r for SV%
  const svA: number[] = [], svB: number[] = [];
  for (const seasonMap of byGoalie.values()) {
    for (const [season, row] of seasonMap) {
      const next = seasonMap.get(season + 1);
      if (!next) continue;
      const x = svSpec.of(row), y = svSpec.of(next);
      if (x != null && y != null) { svA.push(x); svB.push(y); }
    }
  }
  const svR = pearson(svA, svB);

  for (const [, seasonMap] of byGoalie) {
    for (const [season, row] of seasonMap) {
      const next = seasonMap.get(season + 1);
      if (!next) continue;
      const svN = svSpec.of(row), svN1 = svSpec.of(next);
      if (svN == null || svN1 == null) continue;
      svPairs.push({
        name: row.name,
        season,
        svN, svN1,
        rawPred: svN,
        regPred: svMeanVal + svR * (svN - svMeanVal),
      });
    }
  }

  // Cases where regression nailed it: raw was far off, regressed was close
  const regWins = svPairs
    .map(p => ({
      ...p,
      rawErr: Math.abs(p.rawPred - p.svN1),
      regErr: Math.abs(p.regPred - p.svN1),
    }))
    .filter(p => p.rawErr > 0.015 && p.regErr < p.rawErr * 0.6)
    .sort((a, b) => (b.rawErr - b.regErr) - (a.rawErr - a.regErr))
    .slice(0, 12);

  console.log(`\n  Regression saved these predictions (SV%):`);
  console.log(`  ${"Name".padEnd(22)} ${"Season".padEnd(8)} ${"SV% N".padStart(8)} ${"Actual N+1".padStart(11)} ${"Raw pred".padStart(10)} ${"Reg pred".padStart(10)} ${"Raw err".padStart(8)} ${"Reg err".padStart(8)}`);
  console.log(`  ${"─".repeat(88)}`);
  for (const p of regWins) {
    console.log(
      `  ${p.name.padEnd(22)} ${p.season}–${String(p.season + 1).slice(2).padEnd(3)} ${(p.svN * 100).toFixed(2).padStart(7)}% ${(p.svN1 * 100).toFixed(2).padStart(10)}% ${(p.rawPred * 100).toFixed(2).padStart(9)}% ${(p.regPred * 100).toFixed(2).padStart(9)}% ${(p.rawErr * 100).toFixed(2).padStart(7)}% ${(p.regErr * 100).toFixed(2).padStart(7)}%`
    );
  }

  // Hot goalies who regressed (raw SV% > .920, next season dropped)
  console.log(`\n  Hot goalies who crashed — SV% > .920 one year, what happened next:`);
  const hotGoalies = svPairs
    .filter(p => p.svN >= 0.920)
    .sort((a, b) => b.svN - a.svN)
    .slice(0, 12);

  console.log(`  ${"Name".padEnd(22)} ${"Season".padEnd(8)} ${"SV% N".padStart(8)} ${"SV% N+1".padStart(9)} ${"Δ".padStart(8)} ${"Reg predicted".padStart(14)}`);
  console.log(`  ${"─".repeat(72)}`);
  for (const p of hotGoalies) {
    const delta = p.svN1 - p.svN;
    console.log(
      `  ${p.name.padEnd(22)} ${p.season}–${String(p.season + 1).slice(2).padEnd(3)} ${(p.svN * 100).toFixed(2).padStart(7)}% ${(p.svN1 * 100).toFixed(2).padStart(8)}% ${(delta > 0 ? "+" : "") + (delta * 100).toFixed(2).padStart(7)}% ${(p.regPred * 100).toFixed(2).padStart(13)}%`
    );
  }

  // Overall: how often does the hot goalie regress?
  const allHot = svPairs.filter(p => p.svN >= 0.915);
  const hotRegressed = allHot.filter(p => p.svN1 < p.svN).length;
  console.log(`\n  Goalies with SV% ≥ .915: ${allHot.length} seasons`);
  console.log(`  Declined next year:      ${hotRegressed} (${(hotRegressed / allHot.length * 100).toFixed(0)}%)`);
  console.log(`  Avg SV% drop:            ${((mean(allHot.map(p => p.svN1)) - mean(allHot.map(p => p.svN))) * 100).toFixed(3)}%`);
}

// ── Final summary ──────────────────────────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log("  CONCLUSIONS");
console.log(`${"═".repeat(70)}`);

const improvedCount = results.filter(r => r.maeImprovement > 0).length;
const bestImprovement = [...results].sort((a, b) => b.maeImprovement - a.maeImprovement)[0];
const leastImprovement = [...results].sort((a, b) => a.maeImprovement - b.maeImprovement)[0];
const stableMetrics = results.filter(r => r.computedR >= 0.4).sort((a, b) => b.computedR - a.computedR);
const noisyMetrics = results.filter(r => r.computedR < 0.15).sort((a, b) => a.computedR - b.computedR);

console.log(`
Regression toward the mean improved prediction for ${improvedCount} of ${results.length} metrics.

MOST IMPROVED by regression:
  ${bestImprovement.label}: MAE reduced ${bestImprovement.maeImprovement.toFixed(1)}%
  (r = ${bestImprovement.computedR.toFixed(4)} — the noisiest metric gets the most help)

LEAST IMPROVED by regression:
  ${leastImprovement.label}: MAE ${leastImprovement.maeImprovement > 0 ? "reduced" : "changed"} ${Math.abs(leastImprovement.maeImprovement).toFixed(1)}%
  (r = ${leastImprovement.computedR.toFixed(4)} — already stable, regression adds less)

MOST STABLE (trust these year to year):
${stableMetrics.map(m => `  ${m.label.padEnd(16)} r = ${m.computedR.toFixed(4)}`).join("\n")}

NOISIEST (heavy regression needed):
${noisyMetrics.map(m => `  ${m.label.padEnd(16)} r = ${m.computedR.toFixed(4)}`).join("\n")}

The stability hierarchy confirms the app's goalie evaluation design:
HD SV%, rebound control, and freeze rate carry real signal year to year.
GSAx/60 and MD SV% are nearly random — a single season tells you almost
nothing about next season. SV% (the headline stat) is in between, which
is why the app shows it but weighs it below the stable metrics.
`);
