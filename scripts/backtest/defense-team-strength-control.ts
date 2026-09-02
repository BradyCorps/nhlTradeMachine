/**
 * Defense Team-Strength Control (NAV-02 Phase 4, compensating-allocation test)
 *
 * NAV-02 increment 4 found the fitted defense model — decisively validated
 * at the individual level (does a defenseman's own defTotal predict his own
 * future results) — does NOT produce a valid team-level aggregate (does
 * summing it across a roster predict team defensive success). Ruled out
 * offense dilution and goalie-confounded targets as the explanation; both
 * left the correlation wrong-signed.
 *
 * The leading remaining hypothesis: COMPENSATING ALLOCATION. A team may
 * hand its best defensemen the heaviest, toughest workload specifically
 * BECAUSE the team needs it — thin forward depth, a shaky bottom pair, a
 * rebuilding roster leaning on its one or two good D-men. If so, teams
 * whose defensemen project well individually could systematically be worse
 * TEAMS overall, for reasons no player-level model can see: the confound
 * is at the team level, not the player level.
 *
 * This tests it directly: does controlling for overall team strength (prior
 * season's goal differential per game — a real team-quality signal,
 * independent of this season's individual defensive personnel, avoiding
 * the circularity of using this season's own record) correct ΣD-NAV's
 * sign? A weighted multiple regression:
 *
 *   team GA/game ~ β0 + β1·ΣD-NAV(fitted, isolated) + β2·priorSeasonGoalDiff/game
 *
 * If β1 flips from positive (wrong) to negative (correct, more D value →
 * fewer goals against) once team strength is controlled, the hypothesis is
 * supported — and that's a real, usable direction for NAV-02: a model that
 * needs a team-context adjustment to report cleanly, not a model whose
 * player-level math is wrong.
 *
 * 2022 is dropped (no prior season in this dataset to control on), leaving
 * 2023-2025 (~96 team-seasons).
 *
 * Usage: npx tsx scripts/backtest/defense-team-strength-control.ts
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

// ── Team standings, including prior-season goal differential ──────────────
interface TeamSeason { team: string; season: number; gp: number; gfPerGame: number; gaPerGame: number; xgaPerGame: number }
const teamStandings = new Map<string, TeamSeason>();
const SEASONS = [2022, 2023, 2024, 2025];
for (const season of SEASONS) {
  for (const r of readCsv(moneyPuckFile(season, "teams"))) {
    if (r.situation !== "all") continue;
    const team = r.team;
    const gp = num(r.games_played);
    if (!team || gp < 40) continue;
    teamStandings.set(`${team}-${season}`, {
      team, season, gp,
      gfPerGame: num(r.goalsFor) / gp,
      gaPerGame: num(r.goalsAgainst) / gp,
      xgaPerGame: num(r.xGoalsAgainst) / gp,
    });
  }
}

// ── Age + contract lookups (same as this session's other NAV backtests) ───
const biosRows = readCsv("OtherData/2025;26_player_bios.csv");
const biosByName = new Map<string, { dob: string }>();
for (const r of biosRows) {
  const name = r["Player"];
  if (!name) continue;
  biosByName.set(name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, ""), { dob: r["Date of Birth"] || "" });
}
const signings = readCsv("OtherData/contracts/signings.csv");
const ageFromSignings = new Map<string, { signAge: number; signYear: number }>();
function slug(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}
for (const s of signings) {
  const name = slug(s.player || "");
  const signAge = parseInt(s.signAge);
  const sd = s.signDate || "";
  const signYear = sd ? parseInt(sd.slice(0, 4)) : 0;
  if (name && signAge && signYear) ageFromSignings.set(name, { signAge, signYear });
}
function getAge(name: string, season: number): number | null {
  const s = slug(name);
  const bio = biosByName.get(s);
  if (bio && bio.dob) {
    const birthYear = parseInt(bio.dob.slice(0, 4));
    if (birthYear && birthYear >= 1960 && birthYear <= 2010) return season - birthYear;
  }
  const sig = ageFromSignings.get(s);
  if (sig) {
    const age = sig.signAge + (season - sig.signYear);
    if (age >= 16 && age <= 50) return age;
  }
  return null;
}

// ── Defenseman loader (same derivation as defense-model-fit.ts) ───────────
interface DSeason {
  name: string; team: string; season: number; gp: number;
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
      name: all.name, team: all.team, season, gp,
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

// ── Fitted defense model — same frozen coefficients as defense-model-fit.ts
// / position-nav-backtest.ts, duplicated (not imported from xnav-engine.ts,
// which was never changed — this model was not shipped). ─────────────────
const DEFENSE_MODEL_COEFFICIENTS = {
  intercept: -1.0701, qocIndex: 0.00375, avgTOI: 0.04382, dzPct: -0.48441,
  corsiAgainstRel: 0.01881, blocksPer82: -0.00039, highDangerAgainstRate: -0.02635,
  pkTimeShare: 3.75395,
};
const DEFENSE_MODEL_MEAN = -0.0129;
const DEFENSE_MODEL_SCALE = 100;

function fittedDefenseValue(d: DSeason): number {
  const c = DEFENSE_MODEL_COEFFICIENTS;
  const predicted = c.intercept
    + c.qocIndex * d.qocIndex + c.avgTOI * d.avgTOI + c.dzPct * d.dzPct
    + c.corsiAgainstRel * d.corsiAgainstRel + c.blocksPer82 * d.blocksPer82
    + c.highDangerAgainstRate * d.highDangerAgainstRate + c.pkTimeShare * d.pkTimeShare;
  return Math.max(-100, Math.min(120, (DEFENSE_MODEL_MEAN - predicted) * DEFENSE_MODEL_SCALE));
}

// ── Team-season rows: ΣD-NAV(fitted), GA/game, xGA/game, prior-season GD ──
interface TeamRow {
  team: string; season: number;
  dNavFitted: number; gaPerGame: number; xgaPerGame: number;
  priorGoalDiffPerGame: number | null;
}

const teamRows: TeamRow[] = [];
for (const season of SEASONS) {
  const seasonTeams = new Set([...teamStandings.values()].filter(t => t.season === season).map(t => t.team));
  for (const team of seasonTeams) {
    const standings = teamStandings.get(`${team}-${season}`);
    if (!standings) continue;
    const teamD = dSeasons.filter(d => d.team === team && d.season === season)
      .filter(d => getAge(d.name, season) !== null); // same sample-quality gate as other scripts
    if (teamD.length === 0) continue;

    const dNavFitted = teamD.reduce((s, d) => s + fittedDefenseValue(d), 0);
    const prior = teamStandings.get(`${team}-${season - 1}`);
    teamRows.push({
      team, season, dNavFitted,
      gaPerGame: standings.gaPerGame, xgaPerGame: standings.xgaPerGame,
      priorGoalDiffPerGame: prior ? prior.gfPerGame - prior.gaPerGame : null,
    });
  }
}

// ── Small weighted multiple-regression solver (reused pattern from
// defense-model-fit.ts / defense-deployment-adjusted-audit.ts) ────────────
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

function fitOLS(xs: number[][], y: number[]): number[] {
  const p = xs[0].length;
  const A: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const b: number[] = Array(p).fill(0);
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < p; j++) {
      b[j] += xs[i][j] * y[i];
      for (let k = 0; k < p; k++) A[j][k] += xs[i][j] * xs[i][k];
    }
  }
  return gaussianSolve(A, b);
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

// ── Run it ──────────────────────────────────────────────────────────────
const withPrior = teamRows.filter(r => r.priorGoalDiffPerGame !== null);

console.log("Defense Team-Strength Control (NAV-02 compensating-allocation test)");
console.log("=".repeat(72));
console.log(`\n${teamRows.length} team-seasons total; ${withPrior.length} with a prior season available (2022 dropped).`);

function runFor(target: "gaPerGame" | "xgaPerGame", label: string) {
  console.log(`\n${"─".repeat(72)}`);
  console.log(`TARGET: team ${label}`);
  console.log(`${"─".repeat(72)}`);

  // Simple: target ~ b0 + b1*dNavFitted (on the SAME reduced sample, for a
  // fair before/after comparison)
  const xsSimple = withPrior.map(r => [1, r.dNavFitted]);
  const ySimple = withPrior.map(r => r[target]);
  const betaSimple = fitOLS(xsSimple, ySimple);
  const rSimple = pearsonR(withPrior.map(r => r.dNavFitted), ySimple);
  console.log(`\nWithout team-strength control:`);
  console.log(`  ${label} ≈ ${betaSimple[0].toFixed(4)} + (${betaSimple[1].toFixed(6)})·dNavFitted`);
  console.log(`  r=${rSimple.toFixed(4)} (${betaSimple[1] < 0 ? "correct sign — more D value, fewer goals" : "WRONG sign — more D value, MORE goals"})`);

  // Controlled: target ~ b0 + b1*dNavFitted + b2*priorGoalDiffPerGame
  const xsControlled = withPrior.map(r => [1, r.dNavFitted, r.priorGoalDiffPerGame as number]);
  const betaControlled = fitOLS(xsControlled, ySimple);
  console.log(`\nWith prior-season goal-differential control:`);
  console.log(`  ${label} ≈ ${betaControlled[0].toFixed(4)} + (${betaControlled[1].toFixed(6)})·dNavFitted + (${betaControlled[2].toFixed(4)})·priorGD/gm`);
  console.log(`  dNavFitted coefficient ${betaControlled[1] < 0 ? "CORRECTED to negative" : "still positive (WRONG)"} once team strength is controlled`);

  // Per-season sign check on the controlled coefficient's residual
  // relationship — fit once on the pooled sample (coefficients above),
  // then check whether the SIGN of the partial relationship holds by
  // season using partial residuals (target minus the prior-GD term).
  console.log(`\nPer-season partial correlation (dNavFitted vs. target, holding prior GD fixed via its fitted coefficient):`);
  for (const season of [2023, 2024, 2025]) {
    const rows = withPrior.filter(r => r.season === season);
    if (rows.length < 10) continue;
    const partialTarget = rows.map(r => r[target] - betaControlled[2] * (r.priorGoalDiffPerGame as number));
    const r = pearsonR(rows.map(r => r.dNavFitted), partialTarget);
    console.log(`  ${season}: partial r=${r.toFixed(4)}`);
  }

  return { rSimple, beta1Simple: betaSimple[1], beta1Controlled: betaControlled[1] };
}

const gaResult = runFor("gaPerGame", "goals-against/game");
const xgaResult = runFor("xgaPerGame", "xG-against/game (goalie-stripped)");

console.log(`\n${"=".repeat(72)}`);
console.log("CONCLUSION");
console.log(`${"=".repeat(72)}`);
const corrected = gaResult.beta1Controlled < 0 && xgaResult.beta1Controlled < 0;
if (corrected) {
  console.log("The compensating-allocation hypothesis is SUPPORTED: dNavFitted's sign");
  console.log("corrects to negative (correct direction) against both targets once prior-");
  console.log("season team strength is controlled. The player-level model's math was not");
  console.log("the problem — the team-level test needed a team-context adjustment, which");
  console.log("is a real, usable path for NAV-02: report/validate D-NAV relative to team");
  console.log("context, not as a raw team-level sum compared to a raw team outcome.");
} else {
  console.log("The compensating-allocation hypothesis is NOT clearly supported: dNavFitted's");
  console.log("sign does not consistently correct once prior-season team strength is");
  console.log("controlled. This does not rule out some version of the hypothesis (a richer");
  console.log("team-strength control might behave differently), but it means this specific,");
  console.log("concrete test did not resolve NAV-02's team-aggregation gap — an honest");
  console.log("negative result, not a reason to try a fourth reframing until one passes.");
}
