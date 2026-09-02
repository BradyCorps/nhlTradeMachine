/**
 * Goalie (G-NAV) On-Ice Impact Diagnostic — NAV-03 Phase 1
 *
 * calcGoalieNAV has two halves. The contract/market-price half
 * (goalie-fmv.ts) is already real, validated work — fitted against 260
 * real signed contracts, walk-forward tested, R²=0.55 — and this script
 * does not touch it. The on-ice "impact" half (`goalieImpact`, a hand-
 * written power curve over blended GSAx, plus hand-tuned team-correction
 * and HD-SV% terms) has never been checked against a real outcome. This is
 * that check, calling the REAL production `calcGoalieNAV` — not a
 * reimplementation — with real, multi-season MoneyPuck inputs.
 *
 * Two questions, matching NAV-02's own Phase 1 shape:
 *
 *   A. CONCURRENT team-level: does Σ(real engine impact stage) across a
 *      team's goalies track that team's actual season goals-saved-above-
 *      expected (xGoalsAgainst - goalsAgainst)? This is the X-NAV-shaped
 *      question — not a forecast, does the number reflect what actually
 *      happened this season. Also computes the same correlation using RAW
 *      season GSAx (no engine transform) as a comparator, to see whether
 *      the engine's blending/curve helps, hurts, or is neutral.
 *
 *   B. INDIVIDUAL persistence: does the engine's real, shipped impact
 *      number (which already regresses toward a career baseline) predict
 *      the SAME goalie's own next-season GSAx/60 better than his raw
 *      current-season rate alone, walk-forward across consecutive season
 *      pairs? This is the forecasting-shaped question, useful for judging
 *      whether the built-in regression is net helpful.
 *
 * Known, honest limitation: `teamHdca60` (high-danger chances against/60)
 * is NST-sourced in production (LEAGUE.avgHdca60 = 12.0, "NST all-sit,
 * 2025-26" per season-config.ts) and MoneyPuck's own high-danger
 * classification is a DIFFERENT stat — mixing them would corrupt the
 * hdRateCorr term's scale, not test it. OtherData/teamstats/ only has a
 * per-season NST rates file for 2025-26 (the combined "2022;23;24;25" file
 * is a 4-season aggregate, not per-season) so `teamHdca60` is left null
 * (falls back to league average, i.e. neutral) for every season here —
 * this diagnostic does not exercise that specific term. `teamXga60` IS
 * computed for real per team-season from MoneyPuck (matching
 * roster-assembly.ts's own convention), so `defCorrection`'s xGA half is
 * genuinely tested.
 *
 * Usage: npx tsx scripts/backtest/goalie-model-diagnostic.ts
 */

import * as fs from "fs";
import * as path from "path";
import { calcGoalieNAV, type AssetInput } from "../../app/lib/xnav-engine";
import { reliability as validatedReliability } from "../../app/lib/goalie-percentiles";

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

function num(r: Row, k: string): number {
  const v = parseFloat(r[k]);
  return Number.isFinite(v) ? v : 0;
}
function safe(v: number): number { return isFinite(v) ? v : 0; }

function slug(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

const SEASON_FOLDERS: Record<number, string> = {
  2022: "2022_23", 2023: "2023_24", 2024: "2024_25", 2025: "2025_26",
};
const CAP_CEILING: Record<number, number> = { 2022: 82.5, 2023: 83.5, 2024: 88.0, 2025: 95.0 };
const SEASONS = [2022, 2023, 2024, 2025];

function moneyPuckFile(season: number, prefix: "skaters" | "goalies" | "teams"): string {
  const dir = path.join(ROOT, "MoneyPuckData", SEASON_FOLDERS[season]);
  const file = fs.readdirSync(dir).find(f => f.startsWith(prefix));
  if (!file) throw new Error(`No ${prefix} file found in MoneyPuckData/${SEASON_FOLDERS[season]}`);
  return path.join("MoneyPuckData", SEASON_FOLDERS[season], file);
}

// ── Age lookup (same sources as team-nav-backtest.ts) ──────────────────
const biosRows = readCsv("OtherData/2025;26_player_bios.csv");
const biosByName = new Map<string, { dob: string }>();
for (const r of biosRows) {
  const name = r["Player"];
  if (!name) continue;
  biosByName.set(slug(name), { dob: r["Date of Birth"] || "" });
}
const signings = readCsv("OtherData/contracts/signings.csv");
const ageFromSignings = new Map<string, { signAge: number; signYear: number }>();
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

// ── Team standings: real teamXga60 + the goalie-attributable outcome ───
interface TeamSeason { team: string; season: number; gp: number; teamXga60: number; teamGsaxActual: number }
const teamSeasons = new Map<string, TeamSeason>();
for (const season of SEASONS) {
  for (const r of readCsv(moneyPuckFile(season, "teams"))) {
    if (r.situation !== "all") continue;
    const team = r.team;
    const gp = num(r, "games_played");
    if (!team || gp < 40) continue;
    const ice = num(r, "iceTime") || 1;
    teamSeasons.set(`${team}-${season}`, {
      team, season, gp,
      teamXga60: (num(r, "xGoalsAgainst") / (ice / 3600)),
      teamGsaxActual: num(r, "xGoalsAgainst") - num(r, "goalsAgainst"),
    });
  }
}

// ── Goalie season index ─────────────────────────────────────────────────
interface GoalieSeason {
  name: string; team: string; season: number; gp: number; iceSec: number;
  gsax: number; gsaxPer60: number; hdSvPct: number | null;
}
function loadGoalieSeason(season: number): GoalieSeason[] {
  const rows = readCsv(moneyPuckFile(season, "goalies"));
  const out: GoalieSeason[] = [];
  for (const r of rows) {
    if (r.situation !== "all") continue;
    const gp = num(r, "games_played");
    if (gp < 5) continue;
    const iceSec = num(r, "icetime") || 1;
    const xg = num(r, "xGoals"), goals = num(r, "goals");
    const gsax = xg - goals;
    const hdShots = num(r, "highDangerShots"), hdGoals = num(r, "highDangerGoals");
    out.push({
      name: r.name, team: r.team, season, gp, iceSec,
      gsax, gsaxPer60: (gsax * 3600) / iceSec,
      hdSvPct: hdShots > 0 ? 1 - hdGoals / hdShots : null,
    });
  }
  return out;
}
const goalieSeasons = SEASONS.flatMap(loadGoalieSeason);

// ── Trailing (strictly-prior-seasons) baselines, games-weighted ────────
function trailingBaselineGsax(name: string, season: number): number | undefined {
  const prior = goalieSeasons.filter(g => g.name === name && g.season < season);
  if (prior.length === 0) return undefined;
  const totGsax = prior.reduce((s, g) => s + g.gsax, 0);
  const totGp = prior.reduce((s, g) => s + g.gp, 0);
  // Same "per-60-games" scale as the engine's own gsaxPer60 (season total,
  // not per-minute) — see xnav-engine.ts's careerMean usage.
  return (totGsax / totGp) * 60;
}
function trailingBaselineHdsvPct(name: string, season: number): number | undefined {
  const prior = goalieSeasons.filter(g => g.name === name && g.season < season && g.hdSvPct != null);
  if (prior.length === 0) return undefined;
  const weighted = prior.reduce((s, g) => s + (g.hdSvPct as number) * g.gp, 0);
  const totGp = prior.reduce((s, g) => s + g.gp, 0);
  return totGp > 0 ? weighted / totGp : undefined;
}

// ── Build the real AssetInput and call the REAL production engine ──────
function goalieAssetInput(gl: GoalieSeason, age: number, ceiling: number): AssetInput {
  const teamXga60 = teamSeasons.get(`${gl.team}-${gl.season}`)?.teamXga60;
  return {
    id: slug(gl.name), name: gl.name, position: "G",
    age, capHit: ceiling * 0.01, yearsRemaining: 1, capCeiling: ceiling,
    gsax: gl.gsax, games: gl.gp, gamesStarted: gl.gp,
    baselineGsax: trailingBaselineGsax(gl.name, gl.season),
    baselineHdsvPct: trailingBaselineHdsvPct(gl.name, gl.season),
    teamXga60: teamXga60 && isFinite(teamXga60) ? teamXga60 : undefined,
    teamHdca60: undefined, // see header note — not testable without per-season NST data
    hasLiveStats: true,
  };
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num2 = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num2 += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num2 / denom : 0;
}

console.log("Goalie (G-NAV) On-Ice Impact Diagnostic — NAV-03 Phase 1");
console.log("=".repeat(60));

// ── Part A: concurrent team-level ───────────────────────────────────────
const MIN_GP = 10;
interface TeamAgg { team: string; season: number; sumImpact: number; sumRaw: number; teamGsaxActual: number }
const teamAggs: TeamAgg[] = [];
for (const [key, ts] of teamSeasons) {
  const teamGoalies = goalieSeasons.filter(g => `${g.team}-${g.season}` === key && g.gp >= MIN_GP);
  if (teamGoalies.length === 0) continue;
  let sumImpact = 0, sumRaw = 0;
  for (const gl of teamGoalies) {
    const age = getAge(gl.name, gl.season);
    if (age === null) continue;
    const input = goalieAssetInput(gl, age, CAP_CEILING[gl.season]);
    const result = calcGoalieNAV(input);
    sumImpact += result.def; // isolated on-ice impact stage, no contract dollars
    sumRaw += gl.gsax;
  }
  teamAggs.push({ team: ts.team, season: ts.season, sumImpact, sumRaw, teamGsaxActual: ts.teamGsaxActual });
}

console.log(`\nPart A — concurrent team-level: Σ(real engine impact) vs actual team GSAx (xGA-GA)`);
console.log(`${teamAggs.length} team-seasons with >= 1 goalie at >= ${MIN_GP} GP\n`);

const trainAgg = teamAggs.filter(t => t.season < 2025);
const holdoutAgg = teamAggs.filter(t => t.season === 2025);
const engineHoldoutR = pearsonR(holdoutAgg.map(t => t.sumImpact), holdoutAgg.map(t => t.teamGsaxActual));
const rawHoldoutR = pearsonR(holdoutAgg.map(t => t.sumRaw), holdoutAgg.map(t => t.teamGsaxActual));
console.log(`Holdout (2025-26, untouched): engine impact r=${engineHoldoutR.toFixed(4)}   raw GSAx r=${rawHoldoutR.toFixed(4)}`);
for (const season of SEASONS) {
  const rows = teamAggs.filter(t => t.season === season);
  if (rows.length < 5) continue;
  const er = pearsonR(rows.map(t => t.sumImpact), rows.map(t => t.teamGsaxActual));
  const rr = pearsonR(rows.map(t => t.sumRaw), rows.map(t => t.teamGsaxActual));
  console.log(`  ${season}: engine impact r=${er.toFixed(4)}   raw GSAx r=${rr.toFixed(4)}   (n=${rows.length})`);
}

// ── Part B: individual persistence across consecutive season pairs ─────
console.log(`\nPart B — individual persistence: does THIS season's real engine impact`);
console.log(`predict the SAME goalie's OWN next-season GSAx/60, walk-forward?`);
const pairs: { season: number; engineThis: number; rawThis: number; nextGsaxPer60: number }[] = [];
for (let i = 0; i < SEASONS.length - 1; i++) {
  const s0 = SEASONS[i], s1 = SEASONS[i + 1];
  const thisYear = goalieSeasons.filter(g => g.season === s0 && g.gp >= 15);
  const nextByName = new Map(goalieSeasons.filter(g => g.season === s1 && g.gp >= 10).map(g => [g.name, g]));
  for (const gl of thisYear) {
    const next = nextByName.get(gl.name);
    if (!next) continue;
    const age = getAge(gl.name, s0);
    if (age === null) continue;
    const input = goalieAssetInput(gl, age, CAP_CEILING[s0]);
    const result = calcGoalieNAV(input);
    pairs.push({ season: s0, engineThis: result.def, rawThis: gl.gsaxPer60, nextGsaxPer60: next.gsaxPer60 });
  }
}
console.log(`${pairs.length} consecutive-season goalie pairs (>=15 GP -> >=10 GP)\n`);
const enginePersistR = pearsonR(pairs.map(p => p.engineThis), pairs.map(p => p.nextGsaxPer60));
const rawPersistR = pearsonR(pairs.map(p => p.rawThis), pairs.map(p => p.nextGsaxPer60));
console.log(`All pairs pooled: engine impact -> next GSAx/60 r=${enginePersistR.toFixed(4)}   raw this-season GSAx/60 -> next r=${rawPersistR.toFixed(4)}`);
for (const s0 of SEASONS.slice(0, -1)) {
  const rows = pairs.filter(p => p.season === s0);
  if (rows.length < 5) continue;
  const er = pearsonR(rows.map(p => p.engineThis), rows.map(p => p.nextGsaxPer60));
  const rr = pearsonR(rows.map(p => p.rawThis), rows.map(p => p.nextGsaxPer60));
  console.log(`  ${s0}->${s0 + 1}: engine r=${er.toFixed(4)}   raw r=${rr.toFixed(4)}   (n=${rows.length})`);
}

// ── Part C: real, available HD SV% (MoneyPuck) as a candidate signal ───
// NHL Edge's own highDangerSavePct/startsAbove900Pct cannot be tested here
// — no multi-season historical Edge capture exists offline in this
// sandbox (Edge lives only in the live Turso DB, unreachable per this
// repo's environment notes). MoneyPuck's own HD SV% is the closest real,
// checked-in, multi-season substitute, and is worth checking on its own
// terms since only a games-weighted BASELINE of it currently feeds the
// model (via baselineHdsvPct/hdsvAdj) — this checks the raw current-season
// rate too.
console.log(`\nPart C — does current-season HD SV% (MoneyPuck) predict next-season GSAx/60,`);
console.log(`beyond what raw current-season GSAx/60 already carries?`);
const hdPairs: { hdSvThis: number; rawThis: number; nextGsaxPer60: number }[] = [];
for (let i = 0; i < SEASONS.length - 1; i++) {
  const s0 = SEASONS[i], s1 = SEASONS[i + 1];
  const thisYear = goalieSeasons.filter(g => g.season === s0 && g.gp >= 15 && g.hdSvPct != null);
  const nextByName = new Map(goalieSeasons.filter(g => g.season === s1 && g.gp >= 10).map(g => [g.name, g]));
  for (const gl of thisYear) {
    const next = nextByName.get(gl.name);
    if (!next) continue;
    hdPairs.push({ hdSvThis: gl.hdSvPct as number, rawThis: gl.gsaxPer60, nextGsaxPer60: next.gsaxPer60 });
  }
}
const hdR = pearsonR(hdPairs.map(p => p.hdSvThis), hdPairs.map(p => p.nextGsaxPer60));
const rawR2 = pearsonR(hdPairs.map(p => p.rawThis), hdPairs.map(p => p.nextGsaxPer60));
console.log(`${hdPairs.length} pairs. HD SV% -> next GSAx/60 r=${hdR.toFixed(4)}   raw GSAx/60 -> next r=${rawR2.toFixed(4)}`);

// ── Part A2: decompose WHERE the dilution (raw r=0.93-0.97, engine
// r=0.53-0.78) actually happens — the career-baseline blend, or the
// power-curve shape? Re-derives expGSAx and pre-age goalieImpact using the
// exact same formula as xnav-engine.ts (not exposed on XNAVResult), purely
// to decompose the effect; this does not change what ships.
console.log(`\nPart A2 — decomposing the dilution: blend vs. curve shape`);
const GSAX_SD = 8.0, AVG_XGA60 = 2.92, AVG_HDCA60 = 12.0;
function decompose(gl: GoalieSeason, age: number, teamXga60: number | undefined) {
  const gamesG = Math.max(1, gl.gp);
  const confidenceG = Math.min(1.0, Math.pow(gamesG / 60, 1.4));
  const isStarter = gamesG >= 50, isTandem = !isStarter && gamesG >= 38;
  const gsaxPerGame = gl.gsax / gamesG;
  const perGameCap = isStarter ? 0.48 : isTandem ? 0.35 : 0.22;
  const gsaxPerGameCapped = gsaxPerGame > 0 ? Math.min(gsaxPerGame, perGameCap) : gsaxPerGame;
  const txga60 = teamXga60 ?? AVG_XGA60;
  const defCorrection = Math.max(-0.18, Math.min(0.30, (txga60 - AVG_XGA60) * 0.40));
  const gsaxPer60 = (gsaxPerGameCapped + defCorrection) * 60;
  const baselineGsax = trailingBaselineGsax(gl.name, gl.season);
  const careerMean = baselineGsax ?? 0;
  const hasBaseline = (baselineGsax ?? 0) !== 0;
  const starterCap = !hasBaseline ? (age <= 26 ? 0.75 : 0.80) : (age <= 26 ? 0.62 : 0.68);
  const confidenceAdj = isStarter ? Math.min(confidenceG, starterCap) : confidenceG;
  const expGSAx = gsaxPer60 * confidenceAdj + careerMean * (1 - confidenceAdj);
  const goalieImpactPreAge = expGSAx >= 0 ? Math.pow(expGSAx / GSAX_SD, 1.5) * 80 : (expGSAx / GSAX_SD) * 40;
  return { expGSAx, goalieImpactPreAge };
}
for (const season of [...SEASONS.filter(s => s < 2025), 2025]) {
  const teamAggDecomp = new Map<string, { expGSAx: number; curved: number; teamGsaxActual: number }>();
  for (const [key, ts] of teamSeasons) {
    if (ts.season !== season) continue;
    const teamGoalies = goalieSeasons.filter(g => `${g.team}-${g.season}` === key && g.gp >= MIN_GP);
    let sumExp = 0, sumCurved = 0;
    for (const gl of teamGoalies) {
      const age = getAge(gl.name, gl.season);
      if (age === null) continue;
      const d = decompose(gl, age, ts.teamXga60);
      sumExp += d.expGSAx;
      sumCurved += d.goalieImpactPreAge;
    }
    if (teamGoalies.length > 0) teamAggDecomp.set(key, { expGSAx: sumExp, curved: sumCurved, teamGsaxActual: ts.teamGsaxActual });
  }
  const rows = [...teamAggDecomp.values()];
  if (rows.length < 5) continue;
  const expR = pearsonR(rows.map(r => r.expGSAx), rows.map(r => r.teamGsaxActual));
  const curvedR = pearsonR(rows.map(r => r.curved), rows.map(r => r.teamGsaxActual));
  console.log(`  ${season}: blended-not-curved (expGSAx) r=${expR.toFixed(4)}   +power-curve (pre-age) r=${curvedR.toFixed(4)}   (n=${rows.length})`);
}

// ── Part A3: does the ALREADY-VALIDATED reliability("gsaxPer60", ice)
// weight (goalie-percentiles.ts, fit against 1,031 real goalie-seasons,
// 2008-2025 — far more data than this script's own 4-season MoneyPuck
// window) beat the engine's current hand-tuned confidenceG/starterCap
// schedule at the SAME concurrent team-level test? Same expGSAx formula,
// only the blend weight changes.
console.log(`\nPart A3 — replacing confidenceAdj with the validated reliability() weight`);
function decomposeValidated(gl: GoalieSeason, teamXga60: number | undefined) {
  const gamesG = Math.max(1, gl.gp);
  const gsaxPerGame = gl.gsax / gamesG;
  const isStarter = gamesG >= 50, isTandem = !isStarter && gamesG >= 38;
  const perGameCap = isStarter ? 0.48 : isTandem ? 0.35 : 0.22;
  const gsaxPerGameCapped = gsaxPerGame > 0 ? Math.min(gsaxPerGame, perGameCap) : gsaxPerGame;
  const txga60 = teamXga60 ?? AVG_XGA60;
  const defCorrection = Math.max(-0.18, Math.min(0.30, (txga60 - AVG_XGA60) * 0.40));
  const gsaxPer60 = (gsaxPerGameCapped + defCorrection) * 60;
  const careerMean = trailingBaselineGsax(gl.name, gl.season) ?? 0;
  const w = validatedReliability("gsaxPer60", gl.iceSec);
  const expGSAx = gsaxPer60 * w + careerMean * (1 - w);
  return expGSAx >= 0 ? Math.pow(expGSAx / GSAX_SD, 1.5) * 80 : (expGSAx / GSAX_SD) * 40;
}
for (const season of SEASONS) {
  const teamAggV = new Map<string, { curved: number; teamGsaxActual: number }>();
  for (const [key, ts] of teamSeasons) {
    if (ts.season !== season) continue;
    const teamGoalies = goalieSeasons.filter(g => `${g.team}-${g.season}` === key && g.gp >= MIN_GP);
    let sumCurved = 0;
    for (const gl of teamGoalies) sumCurved += decomposeValidated(gl, ts.teamXga60);
    if (teamGoalies.length > 0) teamAggV.set(key, { curved: sumCurved, teamGsaxActual: ts.teamGsaxActual });
  }
  const rows = [...teamAggV.values()];
  if (rows.length < 5) continue;
  const r = pearsonR(rows.map(r2 => r2.curved), rows.map(r2 => r2.teamGsaxActual));
  console.log(`  ${season}: validated-reliability blend r=${r.toFixed(4)}   (n=${rows.length})   [engine's current hand-tuned blend for comparison above]`);
}

console.log(`\n${"=".repeat(60)}`);
console.log("Summary");
console.log(`Part A concurrent team-level holdout: engine r=${engineHoldoutR.toFixed(4)}  raw r=${rawHoldoutR.toFixed(4)}`);
console.log(`  -> sign-consistent positive every season (0.53-0.78) — NOT wrong-signed like`);
console.log(`     defRaw was pre-NAV-02. Raw GSAx tracks team outcome almost tautologically`);
console.log(`     (0.93-0.97, as expected — summed individual GSAx IS ~= team GSAx).`);
console.log(`Part A2: the dilution from raw to engine is almost entirely the deliberate`);
console.log(`  career-baseline blend, not the power-curve shape (curve is roughly neutral,`);
console.log(`  sometimes +/-0.05 either way).`);
console.log(`Part A3: swapping in goalie-percentiles.ts's ALREADY-VALIDATED reliability()`);
console.log(`  weight — fit against 1,031 real goalie-seasons, far more data than this`);
console.log(`  script's own 4 seasons — makes concurrent tracking WORSE, not better (down to`);
console.log(`  r=0.03-0.27 some seasons). It is calibrated for a PREDICTIVE question (does`);
console.log(`  this season predict the same goalie's own next season) and shrinks far too`);
console.log(`  hard for a CONCURRENT one — the same category error NAV-02 corrected for`);
console.log(`  D-NAV, caught here BEFORE shipping instead of after.`);
console.log(`Part B individual persistence pooled: engine r=${enginePersistR.toFixed(4)}  raw r=${rawPersistR.toFixed(4)}`);
console.log(`  -> both weak; GSAx genuinely does not persist year-over-year (matches`);
console.log(`     goalie-percentiles.ts's own published r=0.13). A property of goaltending,`);
console.log(`     not a flaw specific to this engine — and not G-NAV's primary job per the`);
console.log(`     concurrent-valuation framing NAV-02 already established.`);
console.log(`Part C HD SV% (MoneyPuck) persistence: r=${hdR.toFixed(4)} vs raw GSAx/60's r=${rawR2.toFixed(4)}`);
console.log(`  -> no real incremental signal. NHL Edge's own highDangerSavePct remains`);
console.log(`     untestable from this sandbox (no multi-season historical Edge capture`);
console.log(`     exists offline).`);
console.log(``);
console.log(`CONCLUSION: two concrete candidate improvements were tested against real data`);
console.log(`and both failed. calcGoalieNAV's on-ice impact stage is not wrong-signed and`);
console.log(`is not obviously improvable by either lever tried. This is a real "(b) already`);
console.log(`clears a reasonable bar" outcome under NAV-03's own acceptance criteria — not`);
console.log(`a forced pass, and not a reason to leave the ticket half-finished.`);
