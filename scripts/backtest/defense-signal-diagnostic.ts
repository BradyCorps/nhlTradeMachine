/**
 * Defense-NAV Signal Diagnostic (NAV-02 Phase 1)
 *
 * NAV-01 increment 3 found ΣD-NAV (calcDefenseNAV summed per team) fails to
 * track team goals-against — wrong-signed in 3 of 4 seasons. That test
 * doesn't say WHY. Three different explanations point at three different
 * fixes:
 *
 *   (a) The formula's inputs carry no real individual defensive signal.
 *       → Phase 2's feature audit needs new inputs, not new weights.
 *   (b) The inputs carry real individual signal, but summing 6-7
 *       defensemen with wildly different roles (shutdown pair vs.
 *       offensive-minded second pair vs. third-pair depth) into one team
 *       number drowns it out.
 *       → the formula might be fine; the AGGREGATION is the problem, which
 *         a team-level backtest can never distinguish from (a).
 *   (c) Team goals-against/game is a blunt, goalie-confounded target — a
 *       good defense in front of a bad goalie still allows more goals.
 *       → the FORMULA and the AGGREGATION might both be fine; the target
 *         needs to be xG-against, not raw goals-against.
 *
 * This script tests (a) directly, at the INDIVIDUAL level, the same way
 * deployment-multiplier-backtest.ts tested normalizedPts: does a
 * defenseman's calcDefenseNAV `def` component (the real `defTotal` that
 * feeds `total`, read off the stages array — not `defDisplay`, which is a
 * different descriptive blend) predict that SAME player's own next-season
 * on-ice defensive result (xG-against-relative, already goalie-stripped)
 * better than simply extrapolating his current result forward?
 *
 * If it does — signal (a) is fine, and NAV-01 increment 3's team-level
 * failure is (b) and/or (c), pointing Phase 2/3 at aggregation and target
 * choice rather than new coefficients. If it doesn't, (a) is real and
 * Phase 2's feature audit is the right next step regardless of (b)/(c).
 *
 * Same walk-forward convention as this session's other backtests: frozen
 * train-fit predictors, untouched 2024→25 holdout transition.
 *
 * Usage: npx tsx scripts/backtest/defense-signal-diagnostic.ts
 */

import * as fs from "fs";
import * as path from "path";
import { calcDefenseNAV, type AssetInput } from "../../app/lib/xnav-engine";

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

// ── Age + contract lookups (same as the other NAV-01 backtests) ───────────
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

interface Contract { capHit: number; term: number; signSeason: number; endSeason: number }
const contractsByPlayer = new Map<string, Contract[]>();
for (const s of signings) {
  const name = slug(s.player || "");
  if (!name) continue;
  const capHit = parseFloat(s.capHit) / 1_000_000;
  const term = parseInt((s.term || "").replace(/yr$/, "")) || 1;
  const sd = s.signDate || "";
  const signYear = sd ? parseInt(sd.slice(0, 4)) : 0;
  const signMonth = sd ? parseInt(sd.slice(5, 7)) : 7;
  if (!signYear || !capHit) continue;
  const signSeason = signMonth >= 7 ? signYear : signYear - 1;
  const endSeason = signSeason + term - 1;
  if (!contractsByPlayer.has(name)) contractsByPlayer.set(name, []);
  contractsByPlayer.get(name)!.push({ capHit, term, signSeason, endSeason });
}

function getContract(name: string, season: number): { capHit: number; yearsRemaining: number } | null {
  const contracts = contractsByPlayer.get(slug(name));
  if (!contracts) return null;
  const active = contracts.filter(c => c.signSeason <= season && c.endSeason >= season);
  if (active.length === 0) return null;
  const c = active.sort((a, b) => b.signSeason - a.signSeason)[0];
  return { capHit: c.capHit, yearsRemaining: c.endSeason - season + 1 };
}

const CAP_CEILING: Record<number, number> = { 2022: 82.5, 2023: 83.5, 2024: 88.0, 2025: 95.0 };

// ── Defenseman season loader — same live-pipeline field derivation as
// team-nav-backtest.ts / position-nav-backtest.ts (mirrors roster-assembly.ts
// exactly: defRate/xgRelTM from "all", dzPct from "5on5") ──────────────────
interface DSeason {
  name: string; team: string; season: number; gp: number;
  ptsPace: number; xgPace: number; avgTOI: number;
  defRate: number; xgRelTM: number; xgaRelTM: number; dzPct: number;
}

function loadDSeason(season: number): DSeason[] {
  const rows = readCsv(skatersFile(season));
  const byPlayer = new Map<string, Map<string, Row>>();
  for (const row of rows) {
    if (row.position !== "D") continue;
    const key = row.name;
    const situations = byPlayer.get(key) ?? new Map<string, Row>();
    situations.set(row.situation, row);
    byPlayer.set(key, situations);
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

    const onF = num(all.OnIce_F_xGoals);
    const offF = num(all.OffIce_F_xGoals);
    const onAVal = num(all.OnIce_A_xGoals);
    const offAVal = num(all.OffIce_A_xGoals);
    const onXgPct = onF + onAVal > 0 ? onF / (onF + onAVal) : 0.5;
    const offXgPct = offF + offAVal > 0 ? offF / (offF + offAVal) : 0.5;

    const es = situations.get("5on5");
    const dz = num(es?.I_F_dZoneShiftStarts);
    const oz = num(es?.I_F_oZoneShiftStarts);

    out.push({
      name: all.name, team: all.team, season, gp,
      ptsPace: (num(all.I_F_points) / gp) * 82,
      xgPace: (num(all.I_F_xGoals) / gp) * 82,
      avgTOI: (iceSec / 60) / gp,
      defRate: safe(offA - onA),
      xgRelTM: safe((onXgPct - offXgPct) * 100),
      xgaRelTM: safe(onA - offA),
      dzPct: dz + oz > 0 ? dz / (dz + oz) : 0.5,
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

function assetInputFor(d: DSeason, age: number, capHit: number, yearsRemaining: number, ceiling: number): AssetInput {
  return {
    id: slug(d.name), name: d.name, position: "D",
    age, capHit, yearsRemaining, capCeiling: ceiling,
    ptsPace: d.ptsPace, xGPace: d.xgPace, avgTOI: d.avgTOI,
    defRate: d.defRate, xgRelTM: d.xgRelTM, xgaRelTM: d.xgaRelTM, dzPct: d.dzPct,
    games: d.gp, hasLiveStats: true,
  };
}

/** The real defTotal that feeds `total` — read off the accounting-identity
 *  stages, NOT `.def` (which is `defDisplay`, a different descriptive blend
 *  built for the STRAND rails — see xnav-engine.ts's XNAVResult docs). */
function realDefTotal(input: AssetInput): number {
  const result = calcDefenseNAV(input as AssetInput & { position: "D" });
  return result.stages?.find(s => s.key === "def")?.value ?? 0;
}

interface Transition {
  season: number;
  defTotal: number;
  currentXgaRel: number;
  targetXgaRel: number; // next season's real on-ice result
  weight: number;
}

const transitions: Transition[] = [];
for (const [, byseason] of byPlayerSeason) {
  for (let i = 0; i < SEASONS.length - 1; i++) {
    const season = SEASONS[i];
    const next = SEASONS[i + 1];
    const cur = byseason.get(season);
    const nxt = byseason.get(next);
    if (!cur || !nxt) continue;

    const age = getAge(cur.name, season);
    if (age === null) continue;
    const contract = getContract(cur.name, season);
    const capHit = contract ? contract.capHit : CAP_CEILING[season] * 0.009;
    const yrs = contract ? contract.yearsRemaining : 1;

    const input = assetInputFor(cur, age, capHit, yrs, CAP_CEILING[season]);
    transitions.push({
      season: next,
      defTotal: realDefTotal(input),
      currentXgaRel: cur.xgaRelTM,
      targetXgaRel: nxt.xgaRelTM,
      weight: Math.min(nxt.gp, 82),
    });
  }
}

// ── Fit + evaluate (same OLS/weighted-MAE pattern as this session's other
// backtests) ────────────────────────────────────────────────────────────
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

function evaluate(label: string, key: "defTotal" | "currentXgaRel") {
  const trainX = train.map(t => t[key]);
  const trainY = train.map(t => t.targetXgaRel);
  const trainW = train.map(t => t.weight);
  const fit = olsFit(trainX, trainY, trainW);

  const holdoutX = holdout.map(t => t[key]);
  const holdoutY = holdout.map(t => t.targetXgaRel);
  const holdoutW = holdout.map(t => t.weight);
  const predicted = holdoutX.map(x => fit.slope * x + fit.intercept);

  return { label, r: pearsonR(holdoutX, holdoutY), mae: weightedMae(holdoutY, predicted, holdoutW) };
}

console.log("Defense-NAV Signal Diagnostic (NAV-02 Phase 1)");
console.log("=".repeat(60));
console.log(`\nTrain transitions: ${train.length} (2022→23, 2023→24). Holdout: ${holdout.length} (2024→25, untouched).`);
console.log(`Target: next-season on-ice xG-against-relative (goalie-stripped, per-player).`);

const persistence = evaluate("Persistence baseline (current xgaRelTM → next xgaRelTM)", "currentXgaRel");
const engineDef = evaluate("calcDefenseNAV's real defTotal → next xgaRelTM", "defTotal");

console.log(`\nOut-of-sample prediction of a defenseman's OWN next-season defensive result:`);
console.log(`  ${persistence.label}`);
console.log(`    r=${persistence.r.toFixed(4)}  MAE=${persistence.mae.toFixed(4)}`);
console.log(`  ${engineDef.label}`);
console.log(`    r=${engineDef.r.toFixed(4)}  MAE=${engineDef.mae.toFixed(4)}`);

const relativeLift = (persistence.mae - engineDef.mae) / persistence.mae;
console.log(`\ndefTotal vs raw persistence: ${(relativeLift * 100).toFixed(1)}% MAE ${relativeLift >= 0 ? "better" : "WORSE"}`);

console.log(`\n${"=".repeat(60)}`);
console.log("DIAGNOSIS");
console.log(`${"=".repeat(60)}`);
if (engineDef.r > persistence.r && relativeLift > 0) {
  console.log("calcDefenseNAV's defTotal carries real individual predictive signal —");
  console.log("it beats simply extrapolating a defenseman's own current results forward.");
  console.log("This points AWAY FROM 'the formula's inputs are uninformative' (hypothesis a)");
  console.log("and TOWARD NAV-01 increment 3's team-level failure being aggregation noise");
  console.log("(hypothesis b) and/or the goalie-confounded GA target (hypothesis c).");
  console.log("Phase 2 should focus there before assuming new coefficients are needed.");
} else {
  console.log("calcDefenseNAV's defTotal does NOT beat simply extrapolating a defenseman's");
  console.log("own current results forward — it carries no individual predictive signal");
  console.log("beyond what raw persistence already gives. This supports hypothesis (a):");
  console.log("the formula's inputs themselves need work, not just how they're aggregated");
  console.log("or which team-level target they're checked against. Phase 2's feature audit");
  console.log("is the right next step regardless of (b)/(c).");
}
