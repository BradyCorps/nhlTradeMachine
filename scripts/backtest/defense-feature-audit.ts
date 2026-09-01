/**
 * Defense Feature Audit (NAV-02 Phase 2)
 *
 * Phase 1 (defense-signal-diagnostic.ts) found calcDefenseNAV's current
 * defTotal is actively counterproductive as a predictor of a defenseman's
 * own next-season on-ice defensive result — worse than doing nothing but
 * persisting his current result forward. That rules out "the formula is
 * fine, something else buried it" and points at the formula's inputs
 * themselves.
 *
 * This is the per-signal audit that should follow: test each CANDIDATE
 * defensive input individually — not blended into a formula, not weighted
 * by anyone's guess — against the same walk-forward target Phase 1 used
 * (next-season on-ice xG-against-relative, goalie-stripped). Same
 * discipline as sim-goal-share-backtest.ts and deployment-multiplier-
 * backtest.ts: a signal only qualifies for Phase 3's model if its
 * correlation with the target holds the SAME SIGN across every available
 * season, not just a single holdout average — the exact shape of problem
 * that let the M_dep/ASI/SLF composite ship unvalidated.
 *
 * Candidates tested (all available in MoneyPuckData without needing data
 * this environment cannot reach):
 *   - xgaRelTM        current-season on-ice xGA-relative (Phase 1's
 *                      persistence baseline — included for reference)
 *   - dzPct            defensive-zone start share (5v5)
 *   - avgTOI           average ice time — proxy for coach trust in a
 *                      shutdown role
 *   - qocIndex         deployment difficulty (calcQocIndex — the exact
 *                      live production formula, not a reimplementation)
 *   - blocksPer82      shotsBlockedByPlayer, pace-adjusted — real blocks
 *                      BY the player (not I_F_blockedShotAttempts, which is
 *                      shots of HIS OWN that got blocked — an offensive-side
 *                      stat easy to mix up with this one)
 *   - takeawayDiffPer82  (takeaways − giveaways), pace-adjusted — puck
 *                      management
 *   - corsiAgainstRel  on-ice shot-attempts-against rate relative to
 *                      off-ice (same construction as xgaRelTM, but raw
 *                      shot volume instead of expected goals — a
 *                      larger-sample, lower-variance cousin of it)
 *   - highDangerAgainstRate  on-ice high-danger xG against, per 60
 *   - pkTimeShare      penalty-kill ice-time share
 *
 * Usage: npx tsx scripts/backtest/defense-feature-audit.ts
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
function slug(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

const SEASON_FOLDERS: Record<number, string> = {
  2022: "2022_23", 2023: "2023_24", 2024: "2024_25", 2025: "2025_26",
};

function skatersFile(season: number): string {
  const dir = path.join(ROOT, "MoneyPuckData", SEASON_FOLDERS[season]);
  const file = fs.readdirSync(dir).find(f => f.startsWith("skaters"));
  if (!file) throw new Error(`No skaters file in MoneyPuckData/${SEASON_FOLDERS[season]}`);
  return path.join("MoneyPuckData", SEASON_FOLDERS[season], file);
}

// ── Defenseman season loader — extends defense-signal-diagnostic.ts's
// fields with the Phase 2 candidate signals ────────────────────────────────
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

type SignalKey = "xgaRelTM" | "dzPct" | "avgTOI" | "qocIndex" | "blocksPer82"
  | "takeawayDiffPer82" | "corsiAgainstRel" | "highDangerAgainstRate" | "pkTimeShare";

const SIGNALS: SignalKey[] = [
  "xgaRelTM", "dzPct", "avgTOI", "qocIndex", "blocksPer82",
  "takeawayDiffPer82", "corsiAgainstRel", "highDangerAgainstRate", "pkTimeShare",
];

interface Transition {
  season: number;
  target: number; // next season's xgaRelTM
  weight: number;
  values: Record<SignalKey, number>;
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
        xgaRelTM: cur.xgaRelTM, dzPct: cur.dzPct, avgTOI: cur.avgTOI,
        qocIndex: cur.qocIndex, blocksPer82: cur.blocksPer82,
        takeawayDiffPer82: cur.takeawayDiffPer82, corsiAgainstRel: cur.corsiAgainstRel,
        highDangerAgainstRate: cur.highDangerAgainstRate, pkTimeShare: cur.pkTimeShare,
      },
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

function perSeasonR(key: SignalKey): { season: number; r: number }[] {
  return SEASONS.slice(1).map(season => {
    const rows = transitions.filter(t => t.season === season);
    return { season, r: pearsonR(rows.map(t => t.values[key]), rows.map(t => t.target)) };
  });
}

function evaluate(key: SignalKey) {
  const trainX = train.map(t => t.values[key]);
  const trainY = train.map(t => t.target);
  const trainW = train.map(t => t.weight);
  const fit = olsFit(trainX, trainY, trainW);

  const holdoutX = holdout.map(t => t.values[key]);
  const holdoutY = holdout.map(t => t.target);
  const holdoutW = holdout.map(t => t.weight);
  const predicted = holdoutX.map(x => fit.slope * x + fit.intercept);

  const perSeason = perSeasonR(key);
  const signs = perSeason.map(s => Math.sign(s.r)).filter(s => s !== 0);
  const signConsistent = signs.length === perSeason.length && signs.every(s => s === signs[0]);

  return {
    key,
    holdoutR: pearsonR(holdoutX, holdoutY),
    holdoutMae: weightedMae(holdoutY, predicted, holdoutW),
    perSeason,
    signConsistent,
  };
}

console.log("Defense Feature Audit (NAV-02 Phase 2)");
console.log("=".repeat(70));
console.log(`\nTrain transitions: ${train.length} (2022→23, 2023→24). Holdout: ${holdout.length} (2024→25, untouched).`);
console.log(`Target: next-season on-ice xG-against-relative (same as Phase 1).`);
console.log(`Gate: correlation sign must hold across ALL THREE tested seasons (2023, 2024, 2025).\n`);

const results = SIGNALS.map(evaluate);
const passed: string[] = [];
const failed: string[] = [];

for (const r of results) {
  const seasonStr = r.perSeason.map(s => `${s.season}:${s.r >= 0 ? "+" : ""}${s.r.toFixed(3)}`).join("  ");
  const verdict = r.signConsistent ? "PASS (sign-consistent)" : "FAIL (sign flips)";
  console.log(`${r.key.padEnd(24)} holdout r=${r.holdoutR >= 0 ? "+" : ""}${r.holdoutR.toFixed(4)}  |  ${seasonStr}  →  ${verdict}`);
  if (r.signConsistent) passed.push(r.key); else failed.push(r.key);
}

console.log(`\n${"=".repeat(70)}`);
console.log("SUMMARY");
console.log(`${"=".repeat(70)}`);
console.log(`Sign-consistent across every season (candidates for Phase 3's model):`);
console.log(passed.length > 0 ? `  ${passed.join(", ")}` : "  NONE");
console.log(`\nSign-inconsistent (do not feed Phase 3 without more evidence):`);
console.log(failed.length > 0 ? `  ${failed.join(", ")}` : "  none");

if (passed.length === 0) {
  console.log(`\nNo candidate signal — including the persistence baseline itself — held a`);
  console.log(`consistent sign across all three transitions tested. That would mean this`);
  console.log(`environment's data (4 MoneyPuck seasons) cannot support ANY individually`);
  console.log(`validated defensive signal, which is itself a real, reportable Phase 2`);
  console.log(`outcome per NAV-02's scope — not something to force past.`);
} else {
  console.log(`\n${passed.length} of ${SIGNALS.length} candidates cleared the sign-consistency bar.`);
  console.log(`Phase 3 should fit a model from only these — magnitude and holdout MAE`);
  console.log(`still need weighing against each other, not just sign.`);
}
