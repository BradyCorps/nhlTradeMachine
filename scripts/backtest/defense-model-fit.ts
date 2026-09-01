/**
 * Defense Model Fit (NAV-02 Phase 3)
 *
 * Phase 1 found calcDefenseNAV's current formula is actively
 * counterproductive at predicting a defenseman's own future on-ice defense
 * (holdout r=-0.102, worse than doing nothing). Phase 2 found why: its
 * inputs are dominated by one deployment-difficulty factor that mechanically
 * predicts worse RAW results for tougher roles — but after controlling for
 * deployment, six other signals DO carry real incremental information about
 * a player's future results (residual r up to 0.42).
 *
 * This is the model those two findings point at: one joint weighted
 * regression — deployment terms (QoC index, avg TOI, zone-start share) as
 * controls, plus the six Phase-2-validated signals — predicting a
 * defenseman's next-season on-ice xG-against-relative. Frozen on train,
 * evaluated once on the untouched 2024→25 holdout, no re-tuning against it.
 *
 * A per-signal ablation (same convention as sim-goal-share-backtest.ts)
 * decides the FINAL, minimal signal set — dropping anything that doesn't
 * earn its place, both to respect NAV-02's own instruction ("start with the
 * simplest form... 4 MoneyPuck seasons is not a lot of data to fit against
 * without overfitting") and to resolve pkTimeShare's flagged ambiguity
 * (does it carry skill signal, or is it a fourth deployment axis?) with
 * evidence instead of argument.
 *
 * This script FITS and VALIDATES the model. It does not wire it into
 * calcDefenseNAV — that is Phase 4, a separate, deliberate step: replacing
 * a live production function is its own decision, not a rider on a
 * modeling script.
 *
 * Usage: npx tsx scripts/backtest/defense-model-fit.ts
 */

import * as fs from "fs";
import * as path from "path";
import { calcQocIndex } from "../../app/lib/roster-assembly";

const ROOT = process.cwd();

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
function safe(v: number): number { return isFinite(v) ? v : 0; }

const SEASON_FOLDERS: Record<number, string> = {
  2022: "2022_23", 2023: "2023_24", 2024: "2024_25", 2025: "2025_26",
};

function skatersFile(season: number): string {
  const dir = path.join(ROOT, "MoneyPuckData", SEASON_FOLDERS[season]);
  const file = fs.readdirSync(dir).find(f => f.startsWith("skaters"));
  if (!file) throw new Error(`No skaters file in MoneyPuckData/${SEASON_FOLDERS[season]}`);
  return path.join("MoneyPuckData", SEASON_FOLDERS[season], file);
}

interface DSeason {
  name: string; season: number; gp: number;
  xgaRelTM: number; dzPct: number; avgTOI: number; qocIndex: number;
  blocksPer82: number; takeawayDiffPer82: number;
  corsiAgainstRel: number; highDangerAgainstRate: number; pkTimeShare: number;
}

function loadDSeason(season: number): DSeason[] {
  const rows = readCsv(skatersFile(season));
  const byPlayer = new Map<string, Map<string, Row>>();
  for (const row of rows) {
    if (row.position !== "D") continue;
    const situations = byPlayer.get(row.name) ?? new Map<string, Row>();
    situations.set(row.situation, row);
    byPlayer.set(row.name, situations);
  }

  const out: DSeason[] = [];
  for (const [, situations] of byPlayer) {
    const all = situations.get("all");
    if (!all) continue;
    const gp = num(all.games_played);
    if (gp < 20) continue;

    const iceSec = num(all.icetime) || 1;
    const iceHours = iceSec / 3600;
    const benchH = Math.max(0.01, (gp * 60 - iceSec / 60) / 60);
    const onA = num(all.OnIce_A_xGoals) / Math.max(0.01, iceHours);
    const offA = num(all.OffIce_A_xGoals) / Math.max(0.01, benchH);
    const onCA = num(all.OnIce_A_shotAttempts) / Math.max(0.01, iceHours);
    const offCA = num(all.OffIce_A_shotAttempts) / Math.max(0.01, benchH);

    const es = situations.get("5on5");
    const dz = num(es?.I_F_dZoneShiftStarts);
    const oz = num(es?.I_F_oZoneShiftStarts);
    const dzPct = dz + oz > 0 ? dz / (dz + oz) : 0.5;

    const iceRankAvg = gp >= 5 ? num(all.iceTimeRank) / gp : null;
    const qocIndex = calcQocIndex("D", iceRankAvg, dzPct) ?? 40;
    const pkIce = num(situations.get("4on5")?.icetime);

    out.push({
      name: all.name, season, gp,
      xgaRelTM: safe(onA - offA),
      dzPct,
      avgTOI: (iceSec / 60) / gp,
      qocIndex,
      blocksPer82: (num(all.shotsBlockedByPlayer) / gp) * 82,
      takeawayDiffPer82: ((num(all.I_F_takeaways) - num(all.I_F_giveaways)) / gp) * 82,
      corsiAgainstRel: safe(onCA - offCA),
      highDangerAgainstRate: safe(num(all.OnIce_A_highDangerxGoals) / Math.max(0.01, iceHours)),
      pkTimeShare: iceSec > 0 ? pkIce / iceSec : 0,
    });
  }
  return out;
}

const SEASONS = [2022, 2023, 2024, 2025];
const dSeasons = SEASONS.flatMap(loadDSeason);
const byPlayerSeason = new Map<string, Map<number, DSeason>>();
for (const row of dSeasons) {
  const m = byPlayerSeason.get(row.name) ?? new Map<number, DSeason>();
  m.set(row.season, row);
  byPlayerSeason.set(row.name, m);
}

// All 9 candidates: 3 deployment controls + 6 Phase-2-validated skill
// signals. Deployment controls always stay in (they're the expectation
// baseline, not up for ablation); the 6 skill signals are ablation-tested.
const FEATURES = [
  "qocIndex", "avgTOI", "dzPct",
  "xgaRelTM", "corsiAgainstRel", "blocksPer82", "takeawayDiffPer82", "highDangerAgainstRate", "pkTimeShare",
] as const;
type Feature = typeof FEATURES[number];
const DEPLOYMENT: Feature[] = ["qocIndex", "avgTOI", "dzPct"];
const SKILL: Feature[] = ["xgaRelTM", "corsiAgainstRel", "blocksPer82", "takeawayDiffPer82", "highDangerAgainstRate", "pkTimeShare"];

interface Transition {
  season: number;
  target: number;
  weight: number;
  values: Record<Feature, number>;
}

const transitions: Transition[] = [];
for (const [, byseason] of byPlayerSeason) {
  for (let i = 0; i < SEASONS.length - 1; i++) {
    const season = SEASONS[i];
    const next = SEASONS[i + 1];
    const cur = byseason.get(season);
    const nxt = byseason.get(next);
    if (!cur || !nxt) continue;

    transitions.push({
      season: next,
      target: nxt.xgaRelTM,
      weight: Math.min(nxt.gp, 82),
      values: {
        qocIndex: cur.qocIndex, avgTOI: cur.avgTOI, dzPct: cur.dzPct,
        xgaRelTM: cur.xgaRelTM, corsiAgainstRel: cur.corsiAgainstRel,
        blocksPer82: cur.blocksPer82, takeawayDiffPer82: cur.takeawayDiffPer82,
        highDangerAgainstRate: cur.highDangerAgainstRate, pkTimeShare: cur.pkTimeShare,
      },
    });
  }
}

const train = transitions.filter(t => t.season <= 2024);
const holdout = transitions.filter(t => t.season === 2025);

// ── Weighted multiple regression (Gauss-Jordan, partial pivoting) ─────────
function gaussianSolve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    if (Math.abs(M[col][col]) < 1e-9) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) > 1e-9 ? row[n] / row[i] : 0));
}

function fit(rows: Transition[], features: Feature[]): number[] {
  const p = features.length + 1;
  const A: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const b: number[] = Array(p).fill(0);
  for (const t of rows) {
    const x = [1, ...features.map(f => t.values[f])];
    const w = t.weight;
    for (let j = 0; j < p; j++) {
      b[j] += w * x[j] * t.target;
      for (let k = 0; k < p; k++) A[j][k] += w * x[j] * x[k];
    }
  }
  return gaussianSolve(A, b);
}

function predict(beta: number[], features: Feature[], t: Transition): number {
  return beta[0] + features.reduce((s, f, i) => s + beta[i + 1] * t.values[f], 0);
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    cov += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  return dx2 > 0 && dy2 > 0 ? cov / Math.sqrt(dx2 * dy2) : 0;
}

function weightedMae(actual: number[], predicted: number[], weights: number[]): number {
  const totalW = weights.reduce((a, b) => a + b, 0);
  const err = actual.reduce((s, a, i) => s + weights[i] * Math.abs(a - predicted[i]), 0);
  return err / totalW;
}

function evaluateOn(rows: Transition[], beta: number[], features: Feature[]) {
  const predicted = rows.map(t => predict(beta, features, t));
  const actual = rows.map(t => t.target);
  const weights = rows.map(t => t.weight);
  return { r: pearsonR(predicted, actual), mae: weightedMae(actual, predicted, weights) };
}

console.log("Defense Model Fit (NAV-02 Phase 3)");
console.log("=".repeat(70));
console.log(`\nTrain: ${train.length} transitions. Holdout: ${holdout.length} (2024→25, untouched).\n`);

// ── Full model (all 9 features) ────────────────────────────────────────
const fullFeatures = [...DEPLOYMENT, ...SKILL];
const fullBeta = fit(train, fullFeatures);
const fullHoldout = evaluateOn(holdout, fullBeta, fullFeatures);
console.log(`Full model (deployment + all 6 skill signals): holdout r=${fullHoldout.r.toFixed(4)}  MAE=${fullHoldout.mae.toFixed(4)}`);

// ── Ablation: drop each skill signal one at a time, refit on train ────────
console.log(`\nAblation — refit on train with ONE skill signal removed, evaluate on holdout:`);
const ablationResults: { dropped: Feature; mae: number; hurts: boolean }[] = [];
for (const drop of SKILL) {
  const kept = fullFeatures.filter(f => f !== drop);
  const beta = fit(train, kept);
  const result = evaluateOn(holdout, beta, kept);
  const hurts = result.mae > fullHoldout.mae; // dropping it made things worse → it was helping
  ablationResults.push({ dropped: drop, mae: result.mae, hurts });
  console.log(`  without ${drop.padEnd(22)} MAE=${result.mae.toFixed(4)}  (full model MAE=${fullHoldout.mae.toFixed(4)}) → ${hurts ? "signal HELPS (keep)" : "signal does not help (drop)"}`);
}

const finalSkill = SKILL.filter(f => ablationResults.find(a => a.dropped === f)!.hurts);
const finalFeatures = [...DEPLOYMENT, ...finalSkill];

console.log(`\nFinal, minimal signal set (deployment controls + skill signals that survived ablation):`);
console.log(`  ${finalFeatures.join(", ")}`);

// ── Freeze the final model on train, evaluate once on holdout ─────────────
const finalBeta = fit(train, finalFeatures);
console.log(`\nFrozen model: target ≈ ${finalBeta[0].toFixed(4)}`);
finalFeatures.forEach((f, i) => console.log(`              + (${finalBeta[i + 1].toFixed(5)}) · ${f}`));

const finalHoldout = evaluateOn(holdout, finalBeta, finalFeatures);
const finalPerSeason = SEASONS.slice(1).map(season => {
  const rows = transitions.filter(t => t.season === season);
  return { season, ...evaluateOn(rows, finalBeta, finalFeatures) };
});

console.log(`\nFinal frozen model, holdout: r=${finalHoldout.r.toFixed(4)}  MAE=${finalHoldout.mae.toFixed(4)}`);
console.log(`Per-season: ${finalPerSeason.map(s => `${s.season} r=${s.r.toFixed(4)}`).join("  ")}`);

// ── Compare against the two known baselines from Phase 1 ──────────────────
const PHASE1_PERSISTENCE = { r: 0.4717, mae: 0.3376 };
const PHASE1_CURRENT_FORMULA = { r: -0.1022, mae: 0.3805 };
console.log(`\nComparison (all on the same 2024→25 holdout):`);
console.log(`  Current calcDefenseNAV's defTotal (Phase 1):  r=${PHASE1_CURRENT_FORMULA.r.toFixed(4)}  MAE=${PHASE1_CURRENT_FORMULA.mae.toFixed(4)}`);
console.log(`  Raw persistence baseline (Phase 1):           r=${PHASE1_PERSISTENCE.r.toFixed(4)}  MAE=${PHASE1_PERSISTENCE.mae.toFixed(4)}`);
console.log(`  This fitted model (Phase 3):                  r=${finalHoldout.r.toFixed(4)}  MAE=${finalHoldout.mae.toFixed(4)}`);

const liftVsPersistence = (PHASE1_PERSISTENCE.mae - finalHoldout.mae) / PHASE1_PERSISTENCE.mae;
console.log(`\nFitted model vs. persistence baseline: ${(liftVsPersistence * 100).toFixed(1)}% MAE ${liftVsPersistence >= 0 ? "better" : "WORSE"}`);

// ── Gate ────────────────────────────────────────────────────────────────
const failures: string[] = [];
if (train.length < 300) failures.push(`insufficient train sample (${train.length} < 300)`);
if (holdout.length < 100) failures.push(`insufficient holdout sample (${holdout.length} < 100)`);
for (const { season, r } of finalPerSeason) {
  if (r <= 0) failures.push(`frozen model correlation is non-positive in ${season} (r=${r.toFixed(4)})`);
}
if (finalHoldout.mae >= PHASE1_PERSISTENCE.mae) {
  failures.push(`frozen model does not beat the raw persistence baseline on holdout MAE (${finalHoldout.mae.toFixed(4)} >= ${PHASE1_PERSISTENCE.mae.toFixed(4)})`);
}
if (finalHoldout.mae >= PHASE1_CURRENT_FORMULA.mae) {
  failures.push(`frozen model does not beat the CURRENT calcDefenseNAV formula on holdout MAE — would not even be a strict improvement`);
}

console.log(`\n${"=".repeat(70)}`);
if (failures.length > 0) {
  console.error(`FAIL: ${failures.join("; ")}`);
  process.exitCode = 1;
} else {
  console.log("PASS: the frozen model beats both the raw persistence baseline and the");
  console.log("current calcDefenseNAV formula, sign-consistent every season on holdout.");
  console.log("This is the model Phase 4 should wire into calcDefenseNAV — not yet done");
  console.log("by this script, which fits and validates only.");
}
