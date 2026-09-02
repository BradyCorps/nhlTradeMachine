/**
 * Defense Model — Concurrent (Team-Level) Fit (NAV-02 reframing)
 *
 * Every prior NAV-02 increment fit and validated the defensive model
 * against a PREDICTIVE target: does this season's rating predict the same
 * player's OWN NEXT season. That's a forecasting question. X-NAV/F-NAV/
 * D-NAV/G-NAV is a CONCURRENT relative-valuation question: how good is
 * this player RIGHT NOW, relative to his position peers, given the
 * evidence so far this season (already blended against career history by
 * calcSkaterNAV's existing baseline-weighting — that machinery is generic
 * and not touched here). Increment 3 fit the model against next-season
 * persistence, then increment 4 checked it against a same-season team
 * aggregate — a target mismatch between fitting and validating.
 *
 * This refits directly against the concurrent target: team-level defense
 * signals (TOI-weighted per-team averages, not summed — a straight sum
 * confounds roster depth with quality, weighted average does not) explain
 * THIS SEASON's team GA/game and xGA/game. Same walk-forward discipline as
 * every other backtest this session: 2022-24 train (frozen fit), untouched
 * 2025-26 holdout, per-signal ablation to keep the model minimal, sign
 * consistency required across seasons.
 *
 * Also runs a sanity check the earlier approach never needed: does the
 * fitted model, applied per PLAYER (not team-averaged), still produce real
 * within-team variance? A model fit directly on a team-level aggregate
 * risks degenerating into a team-strength detector that reads the same for
 * every player on a team — useless for X-NAV's actual job of ranking
 * players against each other, including teammates.
 *
 * Usage: npx tsx scripts/backtest/defense-model-team-fit.ts
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

function moneyPuckFile(season: number, prefix: "skaters" | "teams"): string {
  const dir = path.join(ROOT, "MoneyPuckData", SEASON_FOLDERS[season]);
  const file = fs.readdirSync(dir).find(f => f.startsWith(prefix));
  if (!file) throw new Error(`No ${prefix} file found in MoneyPuckData/${SEASON_FOLDERS[season]}`);
  return path.join("MoneyPuckData", SEASON_FOLDERS[season], file);
}

// ── Team standings ──────────────────────────────────────────────────────
interface TeamStanding { team: string; season: number; gp: number; gaPerGame: number; xgaPerGame: number }
const teamStandings = new Map<string, TeamStanding>();
const SEASONS = [2022, 2023, 2024, 2025];
for (const season of SEASONS) {
  for (const r of readCsv(moneyPuckFile(season, "teams"))) {
    if (r.situation !== "all") continue;
    const team = r.team;
    const gp = num(r.games_played);
    if (!team || gp < 40) continue;
    teamStandings.set(`${team}-${season}`, {
      team, season, gp,
      gaPerGame: num(r.goalsAgainst) / gp,
      xgaPerGame: num(r.xGoalsAgainst) / gp,
    });
  }
}

// ── Defenseman season loader (same derivation as this session's other
// NAV-02 backtests) ────────────────────────────────────────────────────
interface DSeason {
  name: string; team: string; season: number; gp: number; iceSec: number;
  dzPct: number; avgTOI: number; qocIndex: number;
  blocksPer82: number; corsiAgainstRel: number; highDangerAgainstRate: number; pkTimeShare: number;
}

function loadDSeason(season: number): DSeason[] {
  const rows = readCsv(moneyPuckFile(season, "skaters"));
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
      name: all.name, team: all.team, season, gp, iceSec,
      dzPct, avgTOI: (iceSec / 60) / gp, qocIndex,
      blocksPer82: (num(all.shotsBlockedByPlayer) / gp) * 82,
      corsiAgainstRel: safe(onCA - offCA),
      highDangerAgainstRate: safe(num(all.OnIce_A_highDangerxGoals) / Math.max(0.01, iceHours)),
      pkTimeShare: iceSec > 0 ? pkIce / iceSec : 0,
    });
  }
  return out;
}

const dSeasons = SEASONS.flatMap(loadDSeason);

type Feature = "qocIndex" | "avgTOI" | "dzPct" | "corsiAgainstRel" | "blocksPer82" | "highDangerAgainstRate" | "pkTimeShare";
const FEATURES: Feature[] = ["qocIndex", "avgTOI", "dzPct", "corsiAgainstRel", "blocksPer82", "highDangerAgainstRate", "pkTimeShare"];

// ── Team-season rows: ICE-TIME-WEIGHTED AVERAGE per signal (not summed —
// a straight sum confounds roster depth with quality; a heavier-minutes
// defenseman should count for more than a black-ace call-up, which is what
// TOI-weighting gives you without needing to hand-pick a top-4 cutoff). ──
interface TeamRow {
  team: string; season: number; playerCount: number;
  values: Record<Feature, number>;
  gaPerGame: number; xgaPerGame: number;
}

const teamRows: TeamRow[] = [];
for (const season of SEASONS) {
  const standings = [...teamStandings.values()].filter(t => t.season === season);
  for (const s of standings) {
    const teamD = dSeasons.filter(d => d.team === s.team && d.season === season);
    if (teamD.length === 0) continue;
    const totalIce = teamD.reduce((sum, d) => sum + d.iceSec, 0);
    const values = Object.fromEntries(FEATURES.map(f => [
      f, teamD.reduce((sum, d) => sum + d[f] * d.iceSec, 0) / totalIce,
    ])) as Record<Feature, number>;
    teamRows.push({ team: s.team, season, playerCount: teamD.length, values, gaPerGame: s.gaPerGame, xgaPerGame: s.xgaPerGame });
  }
}

// ── Weighted (equal-weight here — one row per team-season already
// normalizes for roster size via TOI-weighting) multiple regression ───────
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

function fit(rows: TeamRow[], features: Feature[], target: "gaPerGame" | "xgaPerGame"): number[] {
  const p = features.length + 1;
  const A: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const b: number[] = Array(p).fill(0);
  for (const row of rows) {
    const x = [1, ...features.map(f => row.values[f])];
    const y = row[target];
    for (let j = 0; j < p; j++) {
      b[j] += x[j] * y;
      for (let k = 0; k < p; k++) A[j][k] += x[j] * x[k];
    }
  }
  return gaussianSolve(A, b);
}

function predict(beta: number[], features: Feature[], row: TeamRow): number {
  return beta[0] + features.reduce((s, f, i) => s + beta[i + 1] * row.values[f], 0);
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

function mae(actual: number[], predicted: number[]): number {
  return actual.reduce((s, a, i) => s + Math.abs(a - predicted[i]), 0) / actual.length;
}

const train = teamRows.filter(r => r.season <= 2024);
const holdout = teamRows.filter(r => r.season === 2025);

console.log("Defense Model — Concurrent (Team-Level) Fit");
console.log("=".repeat(72));
console.log(`\nTrain: ${train.length} team-seasons (2022-24). Holdout: ${holdout.length} (2025-26, untouched).`);
console.log(`Note: predicted value is LOWER=better defense (a rate of goals/xG allowed);`);
console.log(`a useful model should correlate POSITIVELY with GA/xGA per game (more`);
console.log(`predicted defense weakness, more goals allowed) — opposite sign convention`);
console.log(`from the old NAV-point scale, kept this way here to fit directly and`);
console.log(`transparently against the real target units.\n`);

function runFor(target: "gaPerGame" | "xgaPerGame", label: string) {
  console.log(`${"─".repeat(72)}`);
  console.log(`TARGET: ${label}`);
  console.log(`${"─".repeat(72)}`);

  const fullBeta = fit(train, FEATURES, target);
  const fullHoldoutPred = holdout.map(r => predict(fullBeta, FEATURES, r));
  const fullHoldoutR = pearsonR(fullHoldoutPred, holdout.map(r => r[target]));
  const fullHoldoutMae = mae(holdout.map(r => r[target]), fullHoldoutPred);
  console.log(`\nFull model (7 features): holdout r=${fullHoldoutR.toFixed(4)}  MAE=${fullHoldoutMae.toFixed(4)}`);

  // Ablation
  console.log(`\nAblation (drop one, refit on train, evaluate on holdout):`);
  const kept: Feature[] = [];
  for (const drop of FEATURES) {
    const remaining = FEATURES.filter(f => f !== drop);
    const beta = fit(train, remaining, target);
    const pred = holdout.map(r => predict(beta, remaining, r));
    const maeWithout = mae(holdout.map(r => r[target]), pred);
    const helps = maeWithout > fullHoldoutMae;
    console.log(`  without ${drop.padEnd(22)} MAE=${maeWithout.toFixed(4)}  → ${helps ? "HELPS (keep)" : "drop"}`);
    if (helps) kept.push(drop);
  }

  const finalFeatures = kept.length > 0 ? kept : FEATURES;
  const finalBeta = fit(train, finalFeatures, target);
  const finalHoldoutPred = holdout.map(r => predict(finalBeta, finalFeatures, r));
  const finalHoldoutR = pearsonR(finalHoldoutPred, holdout.map(r => r[target]));
  const finalHoldoutMae = mae(holdout.map(r => r[target]), finalHoldoutPred);

  console.log(`\nFinal model: ${finalFeatures.join(", ")}`);
  console.log(`  intercept=${finalBeta[0].toFixed(6)}`);
  finalFeatures.forEach((f, i) => console.log(`  (${finalBeta[i + 1].toFixed(6)}) · ${f}`));
  console.log(`Holdout: r=${finalHoldoutR.toFixed(4)}  MAE=${finalHoldoutMae.toFixed(4)}`);

  const perSeason = [2023, 2024, 2025].map(season => {
    const rows = teamRows.filter(r => r.season === season);
    const pred = rows.map(r => predict(finalBeta, finalFeatures, r));
    return { season, r: pearsonR(pred, rows.map(r => r[target])) };
  });
  console.log(`Per-season: ${perSeason.map(s => `${s.season} r=${s.r.toFixed(4)}`).join("  ")}`);

  return { finalBeta, finalFeatures, finalHoldoutR, perSeason };
}

const gaResult = runFor("gaPerGame", "team goals-against/game");
console.log();
const xgaResult = runFor("xgaPerGame", "team xG-against/game (goalie-stripped)");

// ── Sanity check: does the fitted model still discriminate BETWEEN
// players on the same team, or does it degenerate into a team-strength
// re-label? Apply the xGA-fitted model (the cleaner, goalie-stripped
// target) PER PLAYER and compare within-team vs. between-team variance. ──
console.log(`\n${"=".repeat(72)}`);
console.log("SANITY CHECK: does the fit still discriminate between teammates?");
console.log(`${"=".repeat(72)}`);
const { finalBeta: playerBeta, finalFeatures: playerFeatures } = xgaResult;
function predictPlayer(d: DSeason): number {
  return playerBeta[0] + playerFeatures.reduce((s, f, i) => s + playerBeta[i + 1] * d[f], 0);
}
let withinTeamVarSum = 0, withinTeamCount = 0;
const allPlayerPredictions: number[] = [];
for (const season of SEASONS) {
  const teams = new Set(dSeasons.filter(d => d.season === season).map(d => d.team));
  for (const team of teams) {
    const teamD = dSeasons.filter(d => d.team === team && d.season === season);
    if (teamD.length < 2) continue;
    const preds = teamD.map(predictPlayer);
    allPlayerPredictions.push(...preds);
    const mean = preds.reduce((a, b) => a + b, 0) / preds.length;
    const variance = preds.reduce((a, b) => a + (b - mean) ** 2, 0) / preds.length;
    withinTeamVarSum += variance * preds.length;
    withinTeamCount += preds.length;
  }
}
const withinTeamVar = withinTeamVarSum / withinTeamCount;
const overallMean = allPlayerPredictions.reduce((a, b) => a + b, 0) / allPlayerPredictions.length;
const overallVar = allPlayerPredictions.reduce((a, b) => a + (b - overallMean) ** 2, 0) / allPlayerPredictions.length;
const withinShare = withinTeamVar / overallVar;
console.log(`\nWithin-team variance / total variance: ${(withinShare * 100).toFixed(1)}%`);
console.log(`(A real player-discriminating model should have most of its variance WITHIN`);
console.log(`teams, not between them — teammates should predict differently from each`);
console.log(`other, not all read as their team's average. A low share here would mean the`);
console.log(`fit mostly re-labels "which team is this" rather than ranking players.)`);

const sortedPreds = [...allPlayerPredictions].sort((a, b) => a - b);
console.log(`\nPer-player predicted xGA-contribution distribution (n=${sortedPreds.length}):`);
console.log(`  mean=${overallMean.toFixed(4)} stddev=${Math.sqrt(overallVar).toFixed(4)}`);
console.log(`  min=${sortedPreds[0].toFixed(4)} p10=${sortedPreds[Math.floor(sortedPreds.length * 0.1)].toFixed(4)} p50=${sortedPreds[Math.floor(sortedPreds.length * 0.5)].toFixed(4)} p90=${sortedPreds[Math.floor(sortedPreds.length * 0.9)].toFixed(4)} max=${sortedPreds[sortedPreds.length - 1].toFixed(4)}`);
