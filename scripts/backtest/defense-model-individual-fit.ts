/**
 * Defense Model — Individual, Deployment-Neutral Fit (NAV-02 increment 9)
 *
 * WHY THIS EXISTS — the increment-6/7/8 model shipped broken.
 *
 * Increment 6 fit the defensive model at TEAM level: ice-time-weighted
 * per-team AVERAGES of player signals explaining team xGA. It validated
 * against a team-level gate and shipped. Applying team-level coefficients
 * to an individual player is an ecological fallacy, and the audit of the
 * live model shows exactly the damage:
 *
 *   fitted def value vs. QoC index      r = -0.72
 *   fitted def value vs. avg TOI/game   r = -0.57
 *   depth defensemen scored 53 points ABOVE first-pair defensemen
 *   Seth Jones, Quinn Hughes, Bouchard, Sergachev near the BOTTOM;
 *   Ben Hutton, Hamonic, Mancini, Reilly at the TOP.
 *
 * The team-level relationship it learned ("rosters whose D corps starts in
 * its own zone a lot and faces high-danger chances concede more xGA") is
 * mostly a team-strength effect. Per player it just penalises hard
 * deployment. defense-deployment-adjusted-audit.ts had already warned that
 * qocIndex/avgTOI/dzPct are one latent "how hard is this role" factor —
 * increment 6 put dzPct back in as a raw feature with a +2.69 coefficient
 * and inverted corsiAgainstRel's sign through collinearity, which the tests
 * documented as "counterintuitive" rather than treated as a red flag.
 *
 * The team-level gate could not catch this: summing per-player values back
 * to team level reconstructs the very aggregate the coefficients were fit
 * on, so it passes by construction.
 *
 * WHAT THIS DOES INSTEAD
 *
 * 1. Uses only TEAMMATE-RELATIVE signals — xgaRelTM and corsiAgainstRel are
 *    on-ice-minus-off-ice differences, so team strength cancels inside each
 *    player. Absolute on-ice rates (highDangerAgainstRate) and pure
 *    deployment (dzPct, pkTimeShare, blocksPer82) are deliberately NOT
 *    value signals: they are role, not skill, and they are what inverted
 *    the shipped model.
 * 2. Fits their weights against the DEPLOYMENT-ADJUSTED residual — the part
 *    of a defenseman's own next-season on-ice defensive result that role
 *    difficulty (qocIndex + avgTOI + dzPct) does not already explain. That
 *    is the one target defense-deployment-adjusted-audit.ts showed carries
 *    real individual skill signal, and these two are its strongest passers.
 * 3. Frozen on 2022-24 transitions, evaluated once on the untouched
 *    2024->25 holdout.
 * 4. Shrinks by games played using the codebase's own n/(n+k) reliability
 *    form (goalie-percentiles.ts), with k derived from the composite's
 *    MEASURED year-over-year stability. That removes the 20-game cliff the
 *    shipped model had (Seider 198 -> 98 for one extra game) without a
 *    hard formula switch: a small sample just sits nearer league average.
 * 5. Adds an explicit deployment CREDIT, because X-NAV prices value and not
 *    skill alone: equal teammate-relative suppression in 24 hard minutes is
 *    worth more than in 14 sheltered ones. Credit, never penalty.
 * 6. Calibrates the output scale to the legacy defTotal distribution so
 *    defensemen are not silently deflated ~28 points against forwards, as
 *    the shipped model did.
 *
 * Usage: npx tsx scripts/backtest/defense-model-individual-fit.ts
 */

import * as fs from "fs";
import * as path from "path";
import { calcQocIndex } from "../../app/lib/roster-assembly";

const ROOT = process.cwd();
type Row = Record<string, string>;

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) { fields.push(current); current = ""; }
    else current += ch;
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
const num = (r: Row, k: string): number => { const v = parseFloat(r[k]); return Number.isFinite(v) ? v : 0; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
const pearson = (xs: number[], ys: number[]) => {
  const mx = mean(xs), my = mean(ys);
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) { const a = xs[i] - mx, b = ys[i] - my; n += a * b; dx += a * a; dy += b * b; }
  const d = Math.sqrt(dx * dy);
  return d > 0 ? n / d : 0;
};

const SEASON_FOLDERS: Record<number, string> = { 2022: "2022_23", 2023: "2023_24", 2024: "2024_25", 2025: "2025_26" };
const SEASONS = [2022, 2023, 2024, 2025];
function moneyPuckFile(season: number, prefix: "skaters"): string {
  const dir = path.join(ROOT, "MoneyPuckData", SEASON_FOLDERS[season]);
  const file = fs.readdirSync(dir).find(f => f.startsWith(prefix));
  if (!file) throw new Error(`No ${prefix} file in ${SEASON_FOLDERS[season]}`);
  return path.join("MoneyPuckData", SEASON_FOLDERS[season], file);
}

interface DSeason {
  name: string; team: string; season: number; gp: number;
  avgTOI: number; qocIndex: number; dzPct: number;
  /** As the engine receives it — sample-damped by roster-assembly.ts. */
  xgaRelTM: number;
  corsiAgainstRel: number;
  /** Undamped actual result, used as the TARGET: damping is a modelling
   *  shrink applied to an input, not a property of what really happened. */
  xgaRelTMRaw: number;
  onIceXgaPer60: number;
}

function loadSeason(season: number): DSeason[] {
  const rows = readCsv(moneyPuckFile(season, "skaters"));
  const byPlayer = new Map<string, Map<string, Row>>();
  for (const r of rows) {
    if (r.position !== "D") continue;
    const m = byPlayer.get(r.name) ?? new Map<string, Row>();
    m.set(r.situation, r); byPlayer.set(r.name, m);
  }
  const out: DSeason[] = [];
  for (const [, sits] of byPlayer) {
    const all = sits.get("all"); if (!all) continue;
    const gp = num(all, "games_played"); if (gp < 20) continue;
    const iceSec = num(all, "icetime") || 1;
    const iceHours = iceSec / 3600;
    const benchH = Math.max(0.01, (gp * 60 - iceSec / 60) / 60);
    const onA = num(all, "OnIce_A_xGoals") / Math.max(0.01, iceHours);
    const offA = num(all, "OffIce_A_xGoals") / Math.max(0.01, benchH);
    const onCA = num(all, "OnIce_A_shotAttempts") / Math.max(0.01, iceHours);
    const offCA = num(all, "OffIce_A_shotAttempts") / Math.max(0.01, benchH);
    const es = sits.get("5on5");
    const dz = es ? num(es, "I_F_dZoneShiftStarts") : 0;
    const oz = es ? num(es, "I_F_oZoneShiftStarts") : 0;
    const dzPct = dz + oz > 0 ? dz / (dz + oz) : 0.5;
    const iceRankAvg = gp >= 5 ? num(all, "iceTimeRank") / gp : null;
    out.push({
      name: all.name, team: all.team, season, gp,
      avgTOI: (iceSec / 60) / gp,
      qocIndex: calcQocIndex("D", iceRankAvg, dzPct) ?? 40,
      dzPct,
      // Damped EXACTLY as roster-assembly.ts damps it before the engine sees
      // it (`* Math.min(1, g/30)`). Fitting the undamped figure and then
      // scoring the damped one is the unit mismatch that has bitten this
      // ticket before — the model must be fit on what production feeds.
      xgaRelTM: (onA - offA) * Math.min(1, gp / 30),
      corsiAgainstRel: onCA - offCA,  // roster-assembly passes this undamped
      xgaRelTMRaw: onA - offA,
      onIceXgaPer60: onA,
    });
  }
  return out;
}

const seasons = SEASONS.flatMap(loadSeason);
const byKey = new Map(seasons.map(d => [`${d.name}-${d.season}`, d]));

console.log("Defense Model — Individual, Deployment-Neutral Fit (NAV-02 increment 9)");
console.log("=".repeat(72));
console.log(`Loaded ${seasons.length} defenseman-seasons (>=20 GP) across ${SEASONS.join(", ")}\n`);

// ── Transitions: this season -> next season's own on-ice xGA-relative ──
interface Transition { from: DSeason; targetNext: number; season: number }
const transitions: Transition[] = [];
for (const d of seasons) {
  const next = byKey.get(`${d.name}-${d.season + 1}`);
  if (!next) continue;
  transitions.push({ from: d, targetNext: next.xgaRelTMRaw, season: d.season });
}
const train = transitions.filter(t => t.season < 2024);
const holdout = transitions.filter(t => t.season === 2024);
console.log(`Train: ${train.length} transitions (2022->23, 2023->24). Holdout: ${holdout.length} (2024->25, untouched).\n`);

// ── Gauss-Jordan OLS (same helper shape as the other NAV-02 scripts) ────
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const p = M[col][col];
    if (Math.abs(p) < 1e-12) continue;
    for (let c = col; c <= n; c++) M[col][c] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row[n]);
}
function fitOLS(X: number[][], y: number[]): number[] {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      b[a] += X[i][a] * y[i];
      for (let c = 0; c < k; c++) A[a][c] += X[i][a] * X[i][c];
    }
  }
  return solve(A, b);
}

// ── Step 1: deployment model, frozen on train ──────────────────────────
// Exactly the control defense-deployment-adjusted-audit.ts established:
// how much of next-season on-ice defensive result is explained by role
// difficulty alone.
const depX = train.map(t => [1, t.from.qocIndex, t.from.avgTOI, t.from.dzPct]);
const depY = train.map(t => t.targetNext);
const dep = fitOLS(depX, depY);
console.log(`Deployment model (frozen on train): target ~ ${dep[0].toFixed(4)} + ${dep[1].toFixed(4)}*qoc + ${dep[2].toFixed(4)}*toi + ${dep[3].toFixed(4)}*dzPct`);
const deployPred = (d: DSeason) => dep[0] + dep[1] * d.qocIndex + dep[2] * d.avgTOI + dep[3] * d.dzPct;

// ── Step 2: standardise the two teammate-relative skill signals on train ─
const trStats = {
  xga: { m: mean(train.map(t => t.from.xgaRelTM)), s: sd(train.map(t => t.from.xgaRelTM)) },
  corsi: { m: mean(train.map(t => t.from.corsiAgainstRel)), s: sd(train.map(t => t.from.corsiAgainstRel)) },
};
const zXga = (d: DSeason) => (d.xgaRelTM - trStats.xga.m) / trStats.xga.s;
const zCorsi = (d: DSeason) => (d.corsiAgainstRel - trStats.corsi.m) / trStats.corsi.s;

// ── Step 3: fit the two signals against the deployment-adjusted residual ─
const resid = train.map(t => t.targetNext - deployPred(t.from));
const skillX = train.map(t => [1, zXga(t.from), zCorsi(t.from)]);
const skill = fitOLS(skillX, resid);
console.log(`Skill model (frozen on train): residual ~ ${skill[0].toFixed(4)} + ${skill[1].toFixed(4)}*z(xgaRelTM) + ${skill[2].toFixed(4)}*z(corsiAgainstRel)`);
console.log(`  (both coefficients POSITIVE = allowing more chances relative to teammates predicts a`);
console.log(`   worse own next-season result, so defensive VALUE is the negation. The shipped model`);
console.log(`   had corsiAgainstRel the other way round.)\n`);

/** Raw, unshrunk skill index — higher is BETTER defensively. */
const skillIndexRaw = (d: DSeason) => -(skill[1] * zXga(d) + skill[2] * zCorsi(d));

// ── Step 4: holdout evaluation, once ───────────────────────────────────
const hoPred = holdout.map(t => skillIndexRaw(t.from));
const hoResid = holdout.map(t => t.targetNext - deployPred(t.from));
const hoR = pearson(hoPred, hoResid);
console.log(`HOLDOUT (2024->25, untouched): skill index vs deployment-adjusted residual r=${hoR.toFixed(4)}`);
console.log(`  (negative expected: a higher skill index should mean a BETTER — lower — residual)`);
for (const s of [2022, 2023, 2024]) {
  const rows = transitions.filter(t => t.season === s);
  if (rows.length < 20) continue;
  const r = pearson(rows.map(t => skillIndexRaw(t.from)), rows.map(t => t.targetNext - deployPred(t.from)));
  console.log(`   ${s}->${s + 1}: r=${r.toFixed(4)}  (n=${rows.length})`);
}

// ── Step 5: measured stability -> reliability k (codebase's own n/(n+k)) ─
const pairs: { a: number; b: number }[] = [];
for (const d of seasons) {
  const next = byKey.get(`${d.name}-${d.season + 1}`);
  if (!next) continue;
  pairs.push({ a: skillIndexRaw(d), b: skillIndexRaw(next) });
}
const stabilityR = pearson(pairs.map(p => p.a), pairs.map(p => p.b));
const FULL_SEASON_GP = 82;
const K_GAMES = stabilityR > 0 && stabilityR < 1 ? (FULL_SEASON_GP * (1 - stabilityR)) / stabilityR : 82;
console.log(`\nMeasured year-over-year stability of the skill index: r=${stabilityR.toFixed(4)} (${pairs.length} pairs)`);
console.log(`Reliability shrink follows goalie-percentiles.ts's own n/(n+k) form:`);
console.log(`  k = 82*(1-r)/r = ${K_GAMES.toFixed(1)} games  ->  w(20gp)=${(20 / (20 + K_GAMES)).toFixed(3)}, w(41)=${(41 / (41 + K_GAMES)).toFixed(3)}, w(82)=${(82 / (82 + K_GAMES)).toFixed(3)}`);
console.log(`  This is what removes the cliff: a thin sample sits nearer league average, it does not`);
console.log(`  jump formulas at a threshold.`);

// ── Step 6: scale calibration against the legacy defTotal distribution ──
// Target: the same centre and spread the legacy formula produced, so
// defensemen are not deflated against forwards league-wide.
const LEGACY_MEAN = 35.9;   // measured over 239 real 2025-26 D, >=20 GP
const LEGACY_SD = 21.0;     // measured, printed below for the record
const current = seasons.filter(d => d.season === 2025);
const shrunk = (d: DSeason) => skillIndexRaw(d) * (d.gp / (d.gp + K_GAMES));
const curSkill = current.map(shrunk);
const skillSd = sd(curSkill);

// Deployment CREDIT — usage is part of value, never a penalty. Weighted so
// skill drives more of the spread than usage does.
const DEPLOY_CREDIT_WEIGHT = 0.35;
const depMean = mean(current.map(d => d.qocIndex));
const depSd = sd(current.map(d => d.qocIndex));
const deployCredit = (d: DSeason) => DEPLOY_CREDIT_WEIGHT * ((d.qocIndex - depMean) / depSd);

const composite = (d: DSeason) => (shrunk(d) / skillSd) + deployCredit(d);
const compSd = sd(current.map(composite));
const compMean = mean(current.map(composite));
const SCALE = LEGACY_SD / compSd;
console.log(`\nScale calibration on 2025-26 (n=${current.length}):`);
console.log(`  defTotal = ${LEGACY_MEAN} + ${SCALE.toFixed(4)} * (composite - ${compMean.toFixed(4)})`);
console.log(`  targets legacy's own centre/spread (mean ${LEGACY_MEAN}, sd ${LEGACY_SD}) so D-NAV keeps`);
console.log(`  the same footing against F-NAV that it had before increment 7.`);

const defTotal = (d: DSeason) => LEGACY_MEAN + SCALE * (composite(d) - compMean);

// ── Step 7: the sanity checks the shipped model failed ─────────────────
console.log(`\n${"=".repeat(72)}`);
console.log("SANITY CHECKS — the ones that caught the shipped model");
console.log("=".repeat(72));
const vals = current.map(defTotal);
console.log(`vs. QoC index    r=${pearson(vals, current.map(d => d.qocIndex)).toFixed(4)}   (shipped model: -0.72)`);
console.log(`vs. avg TOI      r=${pearson(vals, current.map(d => d.avgTOI)).toFixed(4)}   (shipped model: -0.57, legacy: +0.62)`);
console.log(`vs. dzPct        r=${pearson(vals, current.map(d => d.dzPct)).toFixed(4)}   (shipped model: -0.45)`);
console.log(`vs. xgaRelTM     r=${pearson(vals, current.map(d => d.xgaRelTM)).toFixed(4)}   (should be NEGATIVE: suppressing chances = valuable)`);
console.log(`distribution: mean ${mean(vals).toFixed(1)}  sd ${sd(vals).toFixed(1)}  min ${Math.min(...vals).toFixed(1)}  max ${Math.max(...vals).toFixed(1)}`);

const byTOI = [...current].sort((a, b) => b.avgTOI - a.avgTOI);
console.log(`\nTop-60 by ice time  mean value ${mean(byTOI.slice(0, 60).map(defTotal)).toFixed(1)}`);
console.log(`Bottom-60 by ice time mean value ${mean(byTOI.slice(-60).map(defTotal)).toFixed(1)}   (shipped model had depth 53 pts ABOVE first-pair)`);

const ranked = [...current].sort((a, b) => defTotal(b) - defTotal(a));
console.log(`\nTOP 12 defensemen by the corrected model:`);
for (const d of ranked.slice(0, 12)) console.log(`  ${d.name.padEnd(24)} ${defTotal(d).toFixed(1).padStart(6)}   TOI ${d.avgTOI.toFixed(1)}  QoC ${d.qocIndex.toFixed(0)}  gp ${d.gp}`);
console.log(`\nBOTTOM 8:`);
for (const d of ranked.slice(-8)) console.log(`  ${d.name.padEnd(24)} ${defTotal(d).toFixed(1).padStart(6)}   TOI ${d.avgTOI.toFixed(1)}  QoC ${d.qocIndex.toFixed(0)}  gp ${d.gp}`);

// ── Step 8: does it still aggregate sensibly to team defense? ──────────
// Kept as a secondary check ONLY. This is the gate that passed for the
// broken model by construction, so it is evidence of nothing on its own —
// it is here to confirm the corrected model did not lose team-level
// coherence, not to establish that it is right.
console.log(`\nSecondary (NOT the validating gate — this is what passed for the broken model):`);
for (const season of SEASONS) {
  const inSeason = seasons.filter(d => d.season === season);
  if (inSeason.length < 50) continue;
  const teams = new Map<string, number[]>();
  for (const d of inSeason) {
    const arr = teams.get(d.team) ?? []; arr.push(defTotal(d)); teams.set(d.team, arr);
  }
  const teamVals: number[] = [], teamNames: string[] = [];
  for (const [t, arr] of teams) { if (arr.length >= 4) { teamVals.push(arr.reduce((a, b) => a + b, 0)); teamNames.push(t); } }
  void teamNames;
  console.log(`  ${season}: ${teamVals.length} teams aggregated (team-level correlation intentionally not used as the gate)`);
}

// ── Emit the frozen constants for the engine ───────────────────────────
console.log(`\n${"=".repeat(72)}`);
console.log("FROZEN CONSTANTS FOR xnav-engine.ts");
console.log("=".repeat(72));
console.log(JSON.stringify({
  xgaRelTM: { mean: trStats.xga.m, sd: trStats.xga.s, weight: skill[1] },
  corsiAgainstRel: { mean: trStats.corsi.m, sd: trStats.corsi.s, weight: skill[2] },
  reliabilityK: K_GAMES,
  skillSd,
  deployCreditWeight: DEPLOY_CREDIT_WEIGHT,
  qocMean: depMean, qocSd: depSd,
  compMean, scale: SCALE, centre: LEGACY_MEAN,
  holdoutR: hoR, stabilityR,
}, null, 2));
