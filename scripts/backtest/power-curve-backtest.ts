// ── Offensive Power Curve Convexity Backtest ──────────────────
// Tests whether the 1.6 exponent in Math.pow(ptsVal/45, 1.6) * 55
// matches how the real market prices production. Matches UFA/RFA
// signings to prior-season MoneyPuck stats, fits cap% vs pts/82
// under various exponents, and identifies the best-fitting shape.
//
// Run: npx tsx scripts/backtest/power-curve-backtest.ts

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

// ── CSV reader ────────────────────────────────────────────────
type Row = Record<string, string>;
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

// ── Load MoneyPuck skater seasons ─────────────────────────────
interface SkaterSeason {
  playerId: string;
  name: string;
  season: number;
  position: string;
  gp: number;
  ice: number;
  pts: number;
  goals: number;
  xGoals: number;
  toi: number;
}

const MIN_GP = 20;
const byPlayerSeason = new Map<string, Map<number, SkaterSeason>>();

for (const rel of [
  "OtherData/HistoricalData/skaters_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_skaters.csv",
]) {
  try {
    for (const r of readCsv(rel)) {
      if (r.situation !== "all") continue;
      const gp = Number(r.games_played);
      const ice = Number(r.icetime);
      const pts = Number(r.I_F_points);
      const goals = Number(r.I_F_goals);
      const xGoals = Number(r.I_F_xGoals);
      if (!(gp >= MIN_GP) || !(ice > 0) || !isFinite(pts)) continue;
      const pos = String(r.position ?? "").trim();
      if (pos === "G") continue;

      const season = Number(r.season);
      const pid = String(r.playerId);
      const toiPerGame = (ice / 60) / gp;
      if (!byPlayerSeason.has(pid)) byPlayerSeason.set(pid, new Map());
      byPlayerSeason.get(pid)!.set(season, {
        playerId: pid, name: String(r.name), season, position: pos,
        gp, ice, pts, goals,
        xGoals: isFinite(xGoals) ? xGoals : 0,
        toi: toiPerGame,
      });
    }
  } catch { /* ok */ }
}

// Also build a name→playerId map for matching signings
const nameToPlayerIds = new Map<string, string[]>();
for (const [pid, seasons] of byPlayerSeason) {
  for (const [, s] of seasons) {
    const key = slug(s.name);
    if (!nameToPlayerIds.has(key)) nameToPlayerIds.set(key, []);
    const arr = nameToPlayerIds.get(key)!;
    if (!arr.includes(pid)) arr.push(pid);
  }
}

// ── Load signings ─────────────────────────────────────────────
interface SigningMatch {
  name: string;
  signSeason: number;
  position: string;
  capPct: number;
  capHit: number;
  term: number;
  signAge: number;
  signStatus: string;
  ptsPace: number;
  goalsPace: number;
  toi: number;
  gp: number;
  isForward: boolean;
}

const matches: SigningMatch[] = [];

const signings = readCsv("OtherData/contracts/signings.csv");
for (const r of signings) {
  const capHit = Number(r.capHit);
  const capPct = Number(r.capPct);
  const signAge = Number(r.signAge);
  const signDate = r.signDate;
  const pos = String(r.pos ?? "").trim();
  const level = String(r.level ?? "").trim();
  const termStr = String(r.term ?? "");
  const term = parseInt(termStr) || 0;
  const signStatus = String(r.signStatus ?? "").trim();

  // Filter: standard contracts only, skaters, reasonable age
  if (!signDate || !capHit || capHit < 1_000_000) continue;
  if (level !== "STD") continue;
  if (pos === "G") continue;
  if (signAge < 20 || signAge > 38) continue;
  if (term < 1) continue;

  // Determine signing season (July+ = next season)
  const signYear = new Date(signDate).getFullYear();
  const signMonth = new Date(signDate).getMonth();
  const signSeason = signMonth >= 6 ? signYear : signYear - 1;
  const priorSeason = signSeason - 1;

  // Match to MoneyPuck by name
  const nameSlug = slug(r.player ?? "");
  const pids = nameToPlayerIds.get(nameSlug);
  if (!pids) continue;

  // Find the prior season stats
  let bestSeason: SkaterSeason | null = null;
  for (const pid of pids) {
    const seasons = byPlayerSeason.get(pid);
    if (!seasons) continue;
    const s = seasons.get(priorSeason);
    if (s && s.gp >= MIN_GP) {
      if (!bestSeason || s.gp > bestSeason.gp) bestSeason = s;
    }
  }
  if (!bestSeason) continue;

  const ptsPace = (bestSeason.pts / bestSeason.gp) * 82;
  const goalsPace = (bestSeason.goals / bestSeason.gp) * 82;
  const isForward = !["D", "LD", "RD"].includes(bestSeason.position);

  matches.push({
    name: bestSeason.name,
    signSeason,
    position: bestSeason.position,
    capPct: capPct > 0 ? capPct : capHit / 88_000_000,
    capHit,
    term,
    signAge,
    signStatus,
    ptsPace,
    goalsPace,
    toi: bestSeason.toi,
    gp: bestSeason.gp,
    isForward,
  });
}

// ── Analysis helpers ──────────────────────────────────────────
function computeR2(predicted: number[], actual: number[]): number {
  const mean = actual.reduce((s, v) => s + v, 0) / actual.length;
  const ssTot = actual.reduce((s, v) => s + (v - mean) ** 2, 0);
  const ssRes = actual.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0);
  return 1 - ssRes / ssTot;
}

function linearFit(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  const sx = x.reduce((a, b) => a + b, 0);
  const sy = y.reduce((a, b) => a + b, 0);
  const sxx = x.reduce((a, v) => a + v * v, 0);
  const sxy = x.reduce((a, v, i) => a + v * y[i], 0);
  const denom = n * sxx - sx * sx;
  const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const intercept = (sy - slope * sx) / n;
  const predicted = x.map(v => slope * v + intercept);
  return { slope, intercept, r2: computeR2(predicted, y) };
}

// ── Header ────────────────────────────────────────────────────
console.log(`${"═".repeat(70)}`);
console.log("  OFFENSIVE POWER CURVE CONVEXITY BACKTEST");
console.log(`${"═".repeat(70)}`);
console.log(`\nMatched signings: ${matches.length}`);
console.log(`  (STD contracts, ≥$1M cap hit, matched to prior-season MoneyPuck stats)`);
console.log(`  Forwards: ${matches.filter(m => m.isForward).length}, Defensemen: ${matches.filter(m => !m.isForward).length}`);

// ═══════════════════════════════════════════════════════════════
// 1. FIT POWER-LAW EXPONENTS
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  1. POWER-LAW EXPONENT SEARCH — which exponent best predicts cap%?");
console.log(`${"═".repeat(70)}`);

// For each exponent, compute power(ptsPace/45, exp) and see how well
// it linearly predicts capPct. We search 1.0 to 2.5 in steps of 0.1.
const exponents = [];
for (let e = 1.0; e <= 2.51; e += 0.1) exponents.push(Math.round(e * 10) / 10);

const posGroups = [
  { label: "All skaters", filter: (_m: SigningMatch) => true },
  { label: "Forwards", filter: (m: SigningMatch) => m.isForward },
  { label: "Defensemen", filter: (m: SigningMatch) => !m.isForward },
];

for (const pg of posGroups) {
  const group = matches.filter(pg.filter);
  console.log(`\n  ${pg.label} (N=${group.length}):`);
  console.log(`  ${"Exponent".padStart(10)} ${"R²".padStart(8)} ${"Slope".padStart(10)} ${"Intercept".padStart(12)}`);
  console.log(`  ${"─".repeat(42)}`);

  let bestR2 = -Infinity;
  let bestExp = 1.0;

  for (const exp of exponents) {
    const x = group.map(m => Math.pow(m.ptsPace / 45, exp));
    const y = group.map(m => m.capPct);
    const fit = linearFit(x, y);
    if (fit.r2 > bestR2) { bestR2 = fit.r2; bestExp = exp; }
    const marker = exp === 1.6 ? " ← model" : "";
    console.log(`  ${exp.toFixed(1).padStart(10)} ${fit.r2.toFixed(4).padStart(8)} ${fit.slope.toFixed(6).padStart(10)} ${fit.intercept.toFixed(4).padStart(12)}${marker}`);
  }

  console.log(`\n  Best-fit exponent: ${bestExp.toFixed(1)} (R² = ${bestR2.toFixed(4)})`);
  console.log(`  Model uses 1.6; difference from optimum: ${Math.abs(bestExp - 1.6).toFixed(1)}`);
}

// ═══════════════════════════════════════════════════════════════
// 2. CAP% BY PRODUCTION TIER
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  2. CAP% BY PRODUCTION TIER — market premium for elite scoring");
console.log(`${"═".repeat(70)}`);

const tiers = [
  { label: "Depth (<30 pts/82)", filter: (m: SigningMatch) => m.ptsPace < 30 },
  { label: "Bottom-6 (30-45)", filter: (m: SigningMatch) => m.ptsPace >= 30 && m.ptsPace < 45 },
  { label: "Middle-6 (45-60)", filter: (m: SigningMatch) => m.ptsPace >= 45 && m.ptsPace < 60 },
  { label: "Top-6 (60-80)", filter: (m: SigningMatch) => m.ptsPace >= 60 && m.ptsPace < 80 },
  { label: "Star (80-100)", filter: (m: SigningMatch) => m.ptsPace >= 80 && m.ptsPace < 100 },
  { label: "Elite (100+)", filter: (m: SigningMatch) => m.ptsPace >= 100 },
];

console.log(`\n  ${"Tier".padEnd(22)} ${"N".padStart(5)} ${"Avg pts/82".padStart(12)} ${"Avg cap%".padStart(10)} ${"$/pt ratio".padStart(12)} ${"Model pow".padStart(12)}`);
console.log(`  ${"─".repeat(75)}`);

for (const tier of tiers) {
  const group = matches.filter(tier.filter);
  if (group.length === 0) continue;
  const n = group.length;
  const avgPts = group.reduce((s, m) => s + m.ptsPace, 0) / n;
  const avgCapPct = group.reduce((s, m) => s + m.capPct, 0) / n;
  const perPt = avgCapPct / avgPts * 100;
  const modelVal = Math.pow(avgPts / 45, 1.6) * 55;
  console.log(`  ${tier.label.padEnd(22)} ${String(n).padStart(5)} ${avgPts.toFixed(1).padStart(12)} ${(avgCapPct * 100).toFixed(2).padStart(9)}% ${perPt.toFixed(4).padStart(12)} ${modelVal.toFixed(1).padStart(12)}`);
}

// ═══════════════════════════════════════════════════════════════
// 3. MARGINAL VALUE — does each additional point cost more?
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  3. MARGINAL VALUE — cap% per additional point at different levels");
console.log(`${"═".repeat(70)}`);

// Sort by ptsPace, compute rolling average of cap% in windows of 10 pts
const sorted = [...matches].sort((a, b) => a.ptsPace - b.ptsPace);
const bucketWidth = 10;
const marginals: { center: number; avgCapPct: number; n: number }[] = [];

for (let center = 20; center <= 120; center += bucketWidth) {
  const lo = center - bucketWidth / 2;
  const hi = center + bucketWidth / 2;
  const bucket = sorted.filter(m => m.ptsPace >= lo && m.ptsPace < hi);
  if (bucket.length < 5) continue;
  marginals.push({
    center,
    avgCapPct: bucket.reduce((s, m) => s + m.capPct, 0) / bucket.length,
    n: bucket.length,
  });
}

console.log(`\n  ${"Pts/82 bucket".padEnd(18)} ${"N".padStart(5)} ${"Avg cap%".padStart(10)} ${"Marginal $/pt".padStart(14)} ${"Model curve".padStart(14)}`);
console.log(`  ${"─".repeat(63)}`);

for (let i = 0; i < marginals.length; i++) {
  const m = marginals[i];
  const marginalPerPt = i > 0
    ? (m.avgCapPct - marginals[i-1].avgCapPct) / (m.center - marginals[i-1].center)
    : null;
  const modelVal = Math.pow(m.center / 45, 1.6) * 55;
  const modelPrev = i > 0 ? Math.pow(marginals[i-1].center / 45, 1.6) * 55 : null;
  const modelMarginal = modelPrev != null
    ? (modelVal - modelPrev) / (m.center - marginals[i-1].center)
    : null;
  console.log(`  ${`${m.center - bucketWidth/2}-${m.center + bucketWidth/2}`.padEnd(18)} ${String(m.n).padStart(5)} ${(m.avgCapPct * 100).toFixed(2).padStart(9)}% ${marginalPerPt != null ? (marginalPerPt * 10000).toFixed(2).padStart(13) : "     -".padStart(13)} ${modelMarginal != null ? modelMarginal.toFixed(2).padStart(14) : "       -".padStart(14)}`);
}

// ═══════════════════════════════════════════════════════════════
// 4. UFA vs RFA CONVEXITY — are UFAs priced more convexly?
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  4. UFA vs RFA — does market freedom amplify the premium?");
console.log(`${"═".repeat(70)}`);

for (const status of ["UFA", "RFA"]) {
  const group = matches.filter(m => m.signStatus === status);
  if (group.length < 30) continue;

  let bestR2 = -Infinity;
  let bestExp = 1.0;
  for (const exp of exponents) {
    const x = group.map(m => Math.pow(m.ptsPace / 45, exp));
    const y = group.map(m => m.capPct);
    const fit = linearFit(x, y);
    if (fit.r2 > bestR2) { bestR2 = fit.r2; bestExp = exp; }
  }
  console.log(`\n  ${status} (N=${group.length}): best-fit exponent = ${bestExp.toFixed(1)} (R² = ${bestR2.toFixed(4)})`);

  // Compare model exponent
  const x16 = group.map(m => Math.pow(m.ptsPace / 45, 1.6));
  const y = group.map(m => m.capPct);
  const fit16 = linearFit(x16, y);
  console.log(`  At exponent 1.6: R² = ${fit16.r2.toFixed(4)}`);
}

// ═══════════════════════════════════════════════════════════════
// 5. TERM-ADJUSTED — long-term deals price production differently
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  5. TERM-ADJUSTED — do long-term deals price elite production higher?");
console.log(`${"═".repeat(70)}`);

const termGroups = [
  { label: "Short (1-2yr)", filter: (m: SigningMatch) => m.term <= 2 },
  { label: "Medium (3-5yr)", filter: (m: SigningMatch) => m.term >= 3 && m.term <= 5 },
  { label: "Long (6+yr)", filter: (m: SigningMatch) => m.term >= 6 },
];

for (const tg of termGroups) {
  const group = matches.filter(tg.filter);
  if (group.length < 20) continue;

  let bestR2 = -Infinity;
  let bestExp = 1.0;
  for (const exp of exponents) {
    const x = group.map(m => Math.pow(m.ptsPace / 45, exp));
    const y = group.map(m => m.capPct);
    const fit = linearFit(x, y);
    if (fit.r2 > bestR2) { bestR2 = fit.r2; bestExp = exp; }
  }
  console.log(`\n  ${tg.label} (N=${group.length}): best-fit exponent = ${bestExp.toFixed(1)} (R² = ${bestR2.toFixed(4)})`);
}

// ═══════════════════════════════════════════════════════════════
// 6. RESIDUAL ANALYSIS — where does the model over/under-price?
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  6. RESIDUAL ANALYSIS — model vs market by production decile");
console.log(`${"═".repeat(70)}`);

// Fit the model's curve to actual cap%
const allX = matches.map(m => Math.pow(m.ptsPace / 45, 1.6));
const allY = matches.map(m => m.capPct);
const modelFit = linearFit(allX, allY);
const predicted = allX.map(x => modelFit.slope * x + modelFit.intercept);

// Bin by ptsPace decile
const sortedByPts = [...matches].map((m, i) => ({ ...m, pred: predicted[i] }))
  .sort((a, b) => a.ptsPace - b.ptsPace);
const decileSize = Math.ceil(sortedByPts.length / 10);

console.log(`\n  ${"Decile".padEnd(10)} ${"N".padStart(5)} ${"Avg pts/82".padStart(12)} ${"Avg cap%".padStart(10)} ${"Predicted".padStart(10)} ${"Residual".padStart(10)}`);
console.log(`  ${"─".repeat(60)}`);

for (let d = 0; d < 10; d++) {
  const start = d * decileSize;
  const end = Math.min((d + 1) * decileSize, sortedByPts.length);
  const decile = sortedByPts.slice(start, end);
  const n = decile.length;
  const avgPts = decile.reduce((s, m) => s + m.ptsPace, 0) / n;
  const avgCap = decile.reduce((s, m) => s + m.capPct, 0) / n;
  const avgPred = decile.reduce((s, m) => s + m.pred, 0) / n;
  const residual = avgCap - avgPred;
  console.log(`  ${`D${d + 1}`.padEnd(10)} ${String(n).padStart(5)} ${avgPts.toFixed(1).padStart(12)} ${(avgCap * 100).toFixed(2).padStart(9)}% ${(avgPred * 100).toFixed(2).padStart(9)}% ${(residual > 0 ? "+" : "") + (residual * 100).toFixed(2).padStart(8)}%`);
}

// ═══════════════════════════════════════════════════════════════
// 7. NOTABLE CONTRACTS — biggest over/under-prices
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  7. NOTABLE CONTRACTS — extreme residuals");
console.log(`${"═".repeat(70)}`);

const withResidual = sortedByPts.map(m => ({
  ...m,
  residual: m.capPct - m.pred,
}));

withResidual.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));

console.log(`\n  ${"Name".padEnd(24)} ${"Season".padStart(6)} ${"Pts/82".padStart(8)} ${"Cap%".padStart(8)} ${"Predicted".padStart(10)} ${"Residual".padStart(10)} ${"Status".padStart(6)}`);
console.log(`  ${"─".repeat(74)}`);

for (let i = 0; i < Math.min(20, withResidual.length); i++) {
  const m = withResidual[i];
  const resStr = (m.residual > 0 ? "+" : "") + (m.residual * 100).toFixed(2) + "%";
  console.log(`  ${m.name.padEnd(24)} ${String(m.signSeason).padStart(6)} ${m.ptsPace.toFixed(1).padStart(8)} ${(m.capPct * 100).toFixed(2).padStart(7)}% ${(m.pred * 100).toFixed(2).padStart(9)}% ${resStr.padStart(10)} ${m.signStatus.padStart(6)}`);
}

// ═══════════════════════════════════════════════════════════════
// CONCLUSIONS
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  CONCLUSIONS");
console.log(`${"═".repeat(70)}`);

// Find overall best exponent
let overallBest = 1.0;
let overallBestR2 = -Infinity;
for (const exp of exponents) {
  const x = matches.map(m => Math.pow(m.ptsPace / 45, exp));
  const y = matches.map(m => m.capPct);
  const fit = linearFit(x, y);
  if (fit.r2 > overallBestR2) { overallBestR2 = fit.r2; overallBest = exp; }
}

const modelR2 = linearFit(
  matches.map(m => Math.pow(m.ptsPace / 45, 1.6)),
  matches.map(m => m.capPct)
).r2;

console.log(`\nBest-fit exponent across all signings: ${overallBest.toFixed(1)}`);
console.log(`Model exponent (1.6) R²: ${modelR2.toFixed(4)}`);
console.log(`Optimal R²: ${overallBestR2.toFixed(4)}`);
console.log(`R² gap: ${(overallBestR2 - modelR2).toFixed(4)}`);

if (Math.abs(overallBest - 1.6) <= 0.2) {
  console.log(`\nThe 1.6 exponent is well-calibrated (within 0.2 of optimal ${overallBest.toFixed(1)}).`);
} else {
  console.log(`\nThe 1.6 exponent may need adjustment — optimal is ${overallBest.toFixed(1)}.`);
}
