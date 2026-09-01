/**
 * Defense Feature Audit — Deployment-Adjusted (NAV-02 Phase 2, continued)
 *
 * defense-feature-audit.ts found 8 of 9 candidate signals "pass" a naive
 * sign-consistency test against next-season on-ice xGA-relative — but a
 * follow-up collinearity check showed why that's not the win it looks like:
 * qocIndex correlates 0.80 with avgTOI, 0.65 with blocksPer82, 0.57 with
 * dzPct. They are not 8 independent signals; they are mostly one latent
 * "how much and how hard does this guy play" factor. A player who gets
 * thrown at tough matchups for heavy minutes will show worse RAW on-ice
 * numbers next season too — not because he's a worse defender, but because
 * his role is mechanically harder. That's deployment persistence, not
 * evidence any of these signals measures individual defensive skill.
 *
 * This script controls for it: fit a "deployment model" — next-season
 * xGA-relative predicted from ONLY qocIndex + avgTOI + dzPct (a weighted
 * multiple regression, frozen on train, evaluated on holdout) — then ask
 * whether any OTHER candidate signal explains the REMAINING variance (the
 * residual) once role difficulty is accounted for. A signal that survives
 * this is the closest thing to genuine incremental defensive-skill evidence
 * this environment's data can produce, short of a real WOWY/RAPM regression
 * across teammates and opponents (which needs far more line-combination
 * data than 4 MoneyPuck seasons provide — NAV-02's own acknowledged limit).
 *
 * Usage: npx tsx scripts/backtest/defense-deployment-adjusted-audit.ts
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

type OtherSignal = "xgaRelTM" | "blocksPer82" | "takeawayDiffPer82" | "corsiAgainstRel" | "highDangerAgainstRate" | "pkTimeShare";
const OTHER_SIGNALS: OtherSignal[] = ["xgaRelTM", "blocksPer82", "takeawayDiffPer82", "corsiAgainstRel", "highDangerAgainstRate", "pkTimeShare"];

interface Transition {
  season: number;
  target: number;
  weight: number;
  qocIndex: number; avgTOI: number; dzPct: number;
  other: Record<OtherSignal, number>;
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
      qocIndex: cur.qocIndex, avgTOI: cur.avgTOI, dzPct: cur.dzPct,
      other: {
        xgaRelTM: cur.xgaRelTM, blocksPer82: cur.blocksPer82,
        takeawayDiffPer82: cur.takeawayDiffPer82, corsiAgainstRel: cur.corsiAgainstRel,
        highDangerAgainstRate: cur.highDangerAgainstRate, pkTimeShare: cur.pkTimeShare,
      },
    });
  }
}

// ── Small weighted multiple-regression solver (Gauss-Jordan w/ partial
// pivoting) — 4 columns (intercept + 3 deployment predictors) is small
// enough this doesn't need a library. ──────────────────────────────────
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

function fitWeightedMultiple(rows: Transition[]): number[] {
  const p = 4; // intercept, qocIndex, avgTOI, dzPct
  const A: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const b: number[] = Array(p).fill(0);
  for (const t of rows) {
    const x = [1, t.qocIndex, t.avgTOI, t.dzPct];
    const w = t.weight;
    for (let j = 0; j < p; j++) {
      b[j] += w * x[j] * t.target;
      for (let k = 0; k < p; k++) A[j][k] += w * x[j] * x[k];
    }
  }
  return gaussianSolve(A, b);
}

function predictDeployment(beta: number[], t: Transition): number {
  return beta[0] + beta[1] * t.qocIndex + beta[2] * t.avgTOI + beta[3] * t.dzPct;
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

const train = transitions.filter(t => t.season <= 2024);
const holdout = transitions.filter(t => t.season === 2025);

console.log("Defense Feature Audit — Deployment-Adjusted (NAV-02 Phase 2 continued)");
console.log("=".repeat(72));
console.log(`\nTrain: ${train.length} transitions. Holdout: ${holdout.length} (2024→25, untouched).`);

// ── Step 1: how much does deployment alone explain? ───────────────────
const beta = fitWeightedMultiple(train);
console.log(`\nDeployment model (frozen on train): target ≈ ${beta[0].toFixed(3)} + ${beta[1].toFixed(4)}·qocIndex + ${beta[2].toFixed(4)}·avgTOI + ${beta[3].toFixed(4)}·dzPct`);

const holdoutPredicted = holdout.map(t => predictDeployment(beta, t));
const holdoutActual = holdout.map(t => t.target);
const deploymentR = pearsonR(holdoutPredicted, holdoutActual);
console.log(`Deployment model alone vs actual next-season result, holdout: r=${deploymentR.toFixed(4)}  R²=${(deploymentR ** 2).toFixed(4)}`);
console.log(`(For comparison: the raw persistence baseline alone scored r=0.472, R²=0.223 in Phase 1 —`);
console.log(` deployment-alone explaining a similar or larger share confirms the confound.)`);

// ── Step 2: residualize, then test each OTHER signal against what's left ──
const residualBySeason = new Map<Transition, number>();
for (const t of [...train, ...holdout]) {
  residualBySeason.set(t, t.target - predictDeployment(beta, t));
}

function perSeasonResidualR(key: OtherSignal): { season: number; r: number }[] {
  return SEASONS.slice(1).map(season => {
    const rows = transitions.filter(t => t.season === season);
    const xs = rows.map(t => t.other[key]);
    const ys = rows.map(t => residualBySeason.get(t)!);
    return { season, r: pearsonR(xs, ys) };
  });
}

console.log(`\nDoes each OTHER signal predict what deployment does NOT explain (the residual)?`);
console.log(`Gate: sign must hold across all three transitions, same as the naive audit.\n`);

const passed: string[] = [];
const failed: string[] = [];
for (const key of OTHER_SIGNALS) {
  const perSeason = perSeasonResidualR(key);
  const signs = perSeason.map(s => Math.sign(s.r)).filter(s => s !== 0);
  const signConsistent = signs.length === perSeason.length && signs.every(s => s === signs[0]);
  const seasonStr = perSeason.map(s => `${s.season}:${s.r >= 0 ? "+" : ""}${s.r.toFixed(3)}`).join("  ");
  const verdict = signConsistent ? "PASS (sign-consistent vs residual)" : "FAIL (sign flips vs residual)";
  console.log(`${key.padEnd(24)} ${seasonStr}  →  ${verdict}`);
  if (signConsistent) passed.push(key); else failed.push(key);
}

console.log(`\n${"=".repeat(72)}`);
console.log("CONCLUSION");
console.log(`${"=".repeat(72)}`);
if (passed.length === 0) {
  console.log("No signal — including the persistence baseline itself — predicts the part of");
  console.log("next-season defensive results that deployment (QoC/TOI/zone starts) doesn't");
  console.log("already explain. Combined with the deployment model itself explaining a real");
  console.log("share of the raw target (r=" + deploymentR.toFixed(3) + "), this is a decisive Phase 2 conclusion:");
  console.log("what these 4 MoneyPuck seasons measure about a defenseman's on-ice results is");
  console.log("overwhelmingly a function of role difficulty, not individual defensive skill");
  console.log("this app can currently isolate. A real skill signal would need teammate/opponent");
  console.log("line-combination data for a proper WOWY/RAPM adjustment — data this environment");
  console.log("does not have (NAV-02's own acknowledged limit). Recommendation: do NOT fit a new");
  console.log("calcDefenseNAV model from these signals — it would just re-encode role difficulty");
  console.log("as if it were skill, the same failure mode Phase 1 found in the CURRENT formula.");
} else {
  console.log(`${passed.length} signal(s) predict the deployment-adjusted residual with a consistent`);
  console.log(`sign: ${passed.join(", ")}.`);
  console.log("These are real candidates for a Phase 3 model — they carry information beyond");
  console.log("'how hard is this player's role,' which is the actual bar for defensive skill.");
}
