/**
 * Deployment-Context Multiplier Backtest (M_dep × ASI × SLF)
 *
 * `calcSkaterDeploymentContext()` in xnav-engine.ts scales a skater's points
 * pace by a composite of three factors before that adjusted figure
 * (`normalizedPts`) drives the offensive-value curve inside `calcSkaterNAV` —
 * live in production right now, for every skater:
 *   - M_dep  — deployment multiplier from zone starts + quality of competition
 *   - ASI    — an "archetype strain" tax on top-line two-way players
 *   - SLF    — a short-handed-leverage bonus
 *   normalizedPts = ptsPace * clamp(M_dep * ASI * SLF, 0.80, 1.25)
 *
 * This has only ever been unit-tested for internal consistency (does the
 * formula compute what the formula says — __tests__/xnav.test.ts's "M_dep
 * neutralizes..." cases) — never validated against a real outcome. That is
 * exactly what CLAUDE.md's model-input rule exists to catch: "a model input
 * must be validated before it moves a number."
 *
 * The principled test for a deployment-context adjustment: a player's real
 * offensive talent should predict his OWN next-season pace better once
 * corrected for how hard his minutes were — a sheltered player's raw pace is
 * inflated by easy matchups and should decay; a hard-matchup player's raw
 * pace understates him and should hold or rise. So: does `normalizedPts` beat
 * raw points pace as an out-of-sample predictor of next-season points pace?
 *
 * Same walk-forward convention as sim-goal-share-backtest.ts and this
 * session's team-nav-backtest.ts: frozen train-fit predictors evaluated on an
 * untouched holdout transition, a named simple baseline, per-component
 * ablations, and a process.exitCode gate.
 *
 * Usage: npx tsx scripts/backtest/deployment-multiplier-backtest.ts
 */

import * as fs from "fs";
import * as path from "path";
import { calcSkaterDeploymentContext, type AssetInput } from "../../app/lib/xnav-engine";
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

const SEASON_FOLDERS: Record<number, string> = {
  2022: "2022_23",
  2023: "2023_24",
  2024: "2024_25",
  2025: "2025_26",
};

function skatersFile(season: number): string {
  const dir = path.join(ROOT, "MoneyPuckData", SEASON_FOLDERS[season]);
  const file = fs.readdirSync(dir).find(f => f.startsWith("skaters"));
  if (!file) throw new Error(`No skaters file in MoneyPuckData/${SEASON_FOLDERS[season]}`);
  return path.join("MoneyPuckData", SEASON_FOLDERS[season], file);
}

interface SkaterSeason {
  playerId: string;
  name: string;
  season: number;
  position: string;
  gp: number;
  ptsPace: number;
  avgTOI: number;
  qocIndex: number | null;
  dzPct: number | null;
  pkTimeShare: number;
}

function loadSkaterSeason(season: number): SkaterSeason[] {
  const rows = readCsv(skatersFile(season));
  const byPlayer = new Map<string, Map<string, Row>>();
  for (const row of rows) {
    if (!row.playerId) continue;
    const situations = byPlayer.get(row.playerId) ?? new Map<string, Row>();
    situations.set(row.situation, row);
    byPlayer.set(row.playerId, situations);
  }

  const out: SkaterSeason[] = [];
  for (const [playerId, situations] of byPlayer) {
    const all = situations.get("all");
    if (!all || all.position === "G") continue;
    const gp = num(all.games_played);
    if (gp < 20) continue;

    const es = situations.get("5on5");
    const dStarts = num(es?.I_F_dZoneShiftStarts);
    const oStarts = num(es?.I_F_oZoneShiftStarts);
    const dzPct = dStarts + oStarts > 0 ? dStarts / (dStarts + oStarts) : null;

    // Same production formula roster-assembly.ts uses live: per-game rank
    // averaged over the season, F scaled against 12 forward slots, D against 6.
    const iceRankAvg = gp >= 5 ? num(all.iceTimeRank) / gp : null;
    const position = all.position === "D" ? "D" : "F";
    const qocIndex = calcQocIndex(position, iceRankAvg, dzPct);

    const allIce = num(all.icetime) || 1;
    const pkIce = num(situations.get("4on5")?.icetime);

    out.push({
      playerId,
      name: all.name,
      season,
      position,
      gp,
      ptsPace: (num(all.I_F_points) / gp) * 82,
      avgTOI: (allIce / 60) / gp,
      qocIndex,
      dzPct,
      pkTimeShare: pkIce / allIce,
    });
  }
  return out;
}

const SEASONS = [2022, 2023, 2024, 2025];
const seasons = SEASONS.flatMap(loadSkaterSeason);
const byPlayerSeason = new Map<string, Map<number, SkaterSeason>>();
for (const row of seasons) {
  const m = byPlayerSeason.get(row.playerId) ?? new Map<number, SkaterSeason>();
  m.set(row.season, row);
  byPlayerSeason.set(row.playerId, m);
}

function assetInputFor(s: SkaterSeason): AssetInput {
  return {
    id: s.playerId, name: s.name, position: s.position === "D" ? "D" : "W",
    age: 27, capHit: 1, yearsRemaining: 1, // unused by calcSkaterDeploymentContext
    ptsPace: s.ptsPace, avgTOI: s.avgTOI, qocIndex: s.qocIndex, dzPct: s.dzPct,
    pkTimeShare: s.pkTimeShare,
  };
}

interface Transition {
  season: number; // the season the target (next-season pace) belongs to
  raw: number;
  full: number;
  mDepOnly: number;
  asiOnly: number;
  slfOnly: number;
  target: number;
  weight: number;
}

const transitions: Transition[] = [];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

for (const [, byseason] of byPlayerSeason) {
  for (let i = 0; i < SEASONS.length - 1; i++) {
    const season = SEASONS[i];
    const next = SEASONS[i + 1];
    const cur = byseason.get(season);
    const nxt = byseason.get(next);
    if (!cur || !nxt) continue;

    const ctx = calcSkaterDeploymentContext(assetInputFor(cur));
    const mDepOnly = cur.ptsPace * clamp(ctx.evMdep, 0.80, 1.25);
    const asiOnly = cur.ptsPace * clamp(ctx.asi, 0.80, 1.25);
    const slfOnly = cur.ptsPace * clamp(ctx.slf, 0.80, 1.25);

    transitions.push({
      season: next,
      raw: cur.ptsPace,
      full: ctx.normalizedPts,
      mDepOnly, asiOnly, slfOnly,
      target: nxt.ptsPace,
      weight: Math.min(nxt.ptsPace * nxt.gp / 82, 82),
    });
  }
}

// ── Fit + evaluate ─────────────────────────────────────────────────
function olsFit(xs: number[], ys: number[], ws: number[]): { slope: number; intercept: number } {
  const totalW = ws.reduce((a, b) => a + b, 0);
  const mx = xs.reduce((a, x, i) => a + x * ws[i], 0) / totalW;
  const my = ys.reduce((a, y, i) => a + y * ws[i], 0) / totalW;
  let cov = 0, varX = 0;
  for (let i = 0; i < xs.length; i++) {
    cov += ws[i] * (xs[i] - mx) * (ys[i] - my);
    varX += ws[i] * (xs[i] - mx) ** 2;
  }
  const slope = varX > 0 ? cov / varX : 0;
  return { slope, intercept: my - slope * mx };
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

const train = transitions.filter(t => t.season <= 2024);
const holdout = transitions.filter(t => t.season === 2025);

function evaluate(label: string, key: "raw" | "full" | "mDepOnly" | "asiOnly" | "slfOnly") {
  const trainX = train.map(t => t[key]);
  const trainY = train.map(t => t.target);
  const trainW = train.map(t => t.weight);
  const fit = olsFit(trainX, trainY, trainW);

  const holdoutX = holdout.map(t => t[key]);
  const holdoutY = holdout.map(t => t.target);
  const holdoutW = holdout.map(t => t.weight);
  const predicted = holdoutX.map(x => fit.slope * x + fit.intercept);

  return {
    label,
    r: pearsonR(holdoutX, holdoutY),
    mae: weightedMae(holdoutY, predicted, holdoutW),
    meanPredicted: predicted.reduce((a, b, i) => a + b * holdoutW[i], 0) / holdoutW.reduce((a, b) => a + b, 0),
    meanActual: holdoutY.reduce((a, y, i) => a + y * holdoutW[i], 0) / holdoutW.reduce((a, b) => a + b, 0),
  };
}

console.log("Deployment-Context Multiplier Backtest (M_dep × ASI × SLF)");
console.log("=".repeat(60));
console.log(`\nTrain transitions: ${train.length} (2022→23, 2023→24). Holdout: ${holdout.length} (2024→25, untouched).`);

const raw = evaluate("raw points pace (baseline, no adjustment)", "raw");
const full = evaluate("normalizedPts (production: M_dep × ASI × SLF)", "full");
const mDepOnly = evaluate("M_dep only", "mDepOnly");
const asiOnly = evaluate("ASI only", "asiOnly");
const slfOnly = evaluate("SLF only", "slfOnly");

console.log(`\nPredicting next-season points pace, out-of-sample (frozen train fit):`);
for (const r of [raw, full, mDepOnly, asiOnly, slfOnly]) {
  console.log(`  ${r.label.padEnd(46)} r=${r.r.toFixed(4)}  MAE=${r.mae.toFixed(2)}`);
}
const relativeLift = (raw.mae - full.mae) / raw.mae;
console.log(`\nFull composite vs raw baseline: ${(relativeLift * 100).toFixed(1)}% MAE ${relativeLift >= 0 ? "improvement" : "WORSE"}`);
console.log(`Holdout mean next-season pace: actual ${full.meanActual.toFixed(1)}, full-predictor ${full.meanPredicted.toFixed(1)}, raw-predictor ${raw.meanPredicted.toFixed(1)}`);

// ── Gate ─────────────────────────────────────────────────────────
const failures: string[] = [];
if (train.length < 400) failures.push(`insufficient train sample (${train.length} < 400)`);
if (holdout.length < 150) failures.push(`insufficient holdout sample (${holdout.length} < 150)`);
if (relativeLift < 0.03) {
  failures.push(`normalizedPts does not clear a 3% MAE-lift over raw points pace on holdout (${(relativeLift * 100).toFixed(1)}%)`);
}
if (full.r <= raw.r) {
  failures.push(`normalizedPts correlates no better than raw points pace with next-season pace (full r=${full.r.toFixed(4)}, raw r=${raw.r.toFixed(4)})`);
}

console.log(`\n${"=".repeat(60)}`);
if (failures.length > 0) {
  console.error(`FAIL: ${failures.join("; ")}`);
  console.error(`\nThis multiplier is live in production (calcSkaterNAV, resolveRosterTier)`);
  console.error(`and was previously validated only by unit tests confirming the formula`);
  console.error(`computes what it says, not that it predicts anything real.`);
  process.exitCode = 1;
} else {
  console.log("PASS: normalizedPts beats raw points pace as a next-season predictor on an untouched holdout.");
}
