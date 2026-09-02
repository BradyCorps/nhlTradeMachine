/**
 * Position-Split NAV Backtest (NAV-01 Required Phase 4)
 *
 * team-nav-backtest.ts (NAV-01 increment 1) validated Roster X-NAV as a
 * whole against overall goal differential. That is a blunt test: X-NAV
 * bundles offense, defense, age and contract-surplus into one number, and a
 * roster's defensemen mostly do not drive its goals-for the way its
 * forwards do (or vice versa for goals-against).
 *
 * This backtest is the position-appropriate version, made possible by
 * NAV-01 Phase 3's calcForwardNAV/calcDefenseNAV — real, independently
 * callable entry points (not a hand-copied reimplementation) — so it
 * satisfies one of NAV-01's own activation gates along the way: "production
 * and backtest implementations use the same calculation path."
 *
 *   ΣF-NAV (forwards only, calcForwardNAV) vs team goals-for/game — the
 *     outcome forwards actually drive.
 *   ΣD-NAV (defensemen only, calcDefenseNAV) vs team goals-against/game —
 *     the outcome defensemen actually drive (lower GA is better, so a
 *     useful D-NAV should correlate NEGATIVELY with GA/game).
 *
 * NAV-02 increment 4 also evaluated, standalone, what ΣD-NAV would look
 * like using a model fit against a defenseman's OWN NEXT-season individual
 * persistence (scripts/backtest/defense-model-fit.ts) — that model
 * validated well individually but did NOT clear this script's team-level
 * bar, even isolated from offense/age/cap and even against goalie-stripped
 * xGA. Increment 6 (this version) replaced it with a model fit DIRECTLY
 * against CONCURRENT team defense (scripts/backtest/defense-model-team-
 * fit.ts) — matching what X-NAV/D-NAV actually is, a same-season relative
 * valuation, not a forecast. That model DOES clear the bar (see GATE 2
 * below) — real, positive evidence, not yet acted on: it is still NOT
 * wired into calcDefenseNAV; dNav below still reflects exactly what ships.
 * dNavFittedEvaluation is a parallel, self-contained computation
 * (duplicating the frozen coefficients, not importing from xnav-engine.ts,
 * which was never changed) so this finding stays reproducible without
 * implying any part of it is live.
 *
 * Same walk-forward convention as team-nav-backtest.ts and
 * deployment-multiplier-backtest.ts: 2022-24 train (frozen linear baseline
 * fit), untouched 2025-26 holdout, process.exitCode gate.
 *
 * Usage: npx tsx scripts/backtest/position-nav-backtest.ts
 */

import * as fs from "fs";
import * as path from "path";
import { calcForwardNAV, calcDefenseNAV, type AssetInput } from "../../app/lib/xnav-engine";
import { calcQocIndex } from "../../app/lib/roster-assembly";

const ROOT = process.cwd();

const CAP_CEILING: Record<number, number> = {
  2022: 82.5,
  2023: 83.5,
  2024: 88.0,
  2025: 95.0,
};

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
  2022: "2022_23",
  2023: "2023_24",
  2024: "2024_25",
  2025: "2025_26",
};

function moneyPuckFile(season: number, prefix: "skaters" | "teams"): string {
  const dir = path.join(ROOT, "MoneyPuckData", SEASON_FOLDERS[season]);
  const file = fs.readdirSync(dir).find(f => f.startsWith(prefix));
  if (!file) throw new Error(`No ${prefix} file found in MoneyPuckData/${SEASON_FOLDERS[season]}`);
  return path.join("MoneyPuckData", SEASON_FOLDERS[season], file);
}

// ── Age + contract lookups (same as team-nav-backtest.ts) ─────────────────
const biosRows = readCsv("OtherData/2025;26_player_bios.csv");
const biosByName = new Map<string, { dob: string; draftOverall: number | undefined }>();
for (const r of biosRows) {
  const name = r["Player"];
  if (!name) continue;
  biosByName.set(slug(name), {
    dob: r["Date of Birth"] || "",
    draftOverall: r["Overall Draft Position"] ? parseInt(r["Overall Draft Position"]) || undefined : undefined,
  });
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
  const capHitRaw = parseFloat(s.capHit);
  const capHit = capHitRaw / 1_000_000;
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

// ── Team goals for/against ─────────────────────────────────────────────────
// xgaPerGame is a diagnostic target alongside gaPerGame — raw goals-against
// is goalie-confounded (a strong defense in front of a bad goalie still
// allows more goals than a mediocre defense in front of an elite one),
// which NAV-02's own scope flagged as a candidate explanation worth ruling
// out before concluding the defensive model itself is the problem.
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

// ── Skater loader (mirrors roster-assembly.ts's own defRate/xgRelTM/dzPct
// derivation — see team-nav-backtest.ts for the same pattern) ─────────────
interface SkaterSeason {
  name: string; team: string; season: number; position: string; gp: number;
  ptsPace: number; goalsPace: number; assistsPace: number; xgPace: number; avgTOI: number;
  defRate: number; xgRelTM: number; xgaRelTM: number; dzPct: number;
  // NAV-02 fitted defensive model inputs (defensemen only downstream, but
  // computed for every skater here to keep this loader position-agnostic).
  qocIndex: number | null; corsiAgainstRel: number; blocksPer82: number;
  highDangerAgainstRate: number; pkTimeShare: number;
}

function loadSkaterSeason(season: number): SkaterSeason[] {
  const rows = readCsv(moneyPuckFile(season, "skaters"));
  const byPlayer = new Map<string, Map<string, Row>>();
  for (const row of rows) {
    const key = `${row.name}__${row.position}`;
    const situations = byPlayer.get(key) ?? new Map<string, Row>();
    situations.set(row.situation, row);
    byPlayer.set(key, situations);
  }

  const out: SkaterSeason[] = [];
  for (const [, situations] of byPlayer) {
    const all = situations.get("all");
    if (!all || all.position === "G") continue;
    const gp = num(all.games_played);
    if (gp < 10) continue;

    const iceSec = num(all.icetime) || 1;
    const iceHours = iceSec / 3600;
    const benchH = Math.max(0.01, (gp * 60 - iceSec / 60) / 60);
    const onA = num(all.OnIce_A_xGoals) / Math.max(0.01, iceHours);
    const offA = num(all.OffIce_A_xGoals) / Math.max(0.01, benchH);
    const onCA = num(all.OnIce_A_shotAttempts) / Math.max(0.01, iceHours);
    const offCA = num(all.OffIce_A_shotAttempts) / Math.max(0.01, benchH);

    const onF = num(all.OnIce_F_xGoals);
    const offF = num(all.OffIce_F_xGoals);
    const onAVal = num(all.OnIce_A_xGoals);
    const offAVal = num(all.OffIce_A_xGoals);
    const onXgPct = onF + onAVal > 0 ? onF / (onF + onAVal) : 0.5;
    const offXgPct = offF + offAVal > 0 ? offF / (offF + offAVal) : 0.5;

    const es = situations.get("5on5");
    const dz = num(es?.I_F_dZoneShiftStarts);
    const oz = num(es?.I_F_oZoneShiftStarts);
    const dzPct = dz + oz > 0 ? dz / (dz + oz) : 0.5;

    const iceRankAvg = gp >= 5 ? num(all.iceTimeRank) / gp : null;
    const position = all.position === "L" || all.position === "R" ? "W" : all.position === "C" ? "C" : "D";
    const qocIndex = calcQocIndex(position === "D" ? "D" : "F", iceRankAvg, dzPct);
    const pkIce = num(situations.get("4on5")?.icetime);

    const pts = num(all.I_F_points);
    const goals = num(all.I_F_goals);

    out.push({
      name: all.name,
      team: all.team,
      season,
      position,
      gp,
      ptsPace: (pts / gp) * 82,
      goalsPace: (goals / gp) * 82,
      assistsPace: ((pts - goals) / gp) * 82,
      xgPace: (num(all.I_F_xGoals) / gp) * 82,
      qocIndex,
      corsiAgainstRel: safe(onCA - offCA),
      blocksPer82: (num(all.shotsBlockedByPlayer) / gp) * 82,
      highDangerAgainstRate: safe(num(all.OnIce_A_highDangerxGoals) / Math.max(0.01, iceHours)),
      pkTimeShare: iceSec > 0 ? pkIce / iceSec : 0,
      avgTOI: (iceSec / 60) / gp,
      defRate: safe(offA - onA),
      xgRelTM: safe((onXgPct - offXgPct) * 100),
      xgaRelTM: safe(onA - offA),
      dzPct,
    });
  }
  return out;
}

const skaterSeasons = SEASONS.flatMap(loadSkaterSeason);

// Unchanged from NAV-01 increment 3: calcDefenseNAV is pure delegation to
// the legacy formula (NAV-02's fitted model was evaluated but NOT wired
// into production — see the standalone evaluation below), so this
// continues to exercise exactly what actually ships, same as before.
function assetInputFor(sk: SkaterSeason, age: number, capHit: number, yearsRemaining: number, ceiling: number, draftOverall?: number): AssetInput {
  return {
    id: slug(sk.name), name: sk.name,
    position: sk.position === "D" ? "D" : (sk.position === "C" ? "C" : "W"),
    age, capHit, yearsRemaining, capCeiling: ceiling,
    ptsPace: sk.ptsPace, goalsPace: sk.goalsPace, assistsPace: sk.assistsPace,
    xGPace: sk.xgPace, avgTOI: sk.avgTOI, defRate: sk.defRate,
    xgRelTM: sk.xgRelTM, xgaRelTM: sk.xgaRelTM, dzPct: sk.dzPct,
    games: sk.gp, hasLiveStats: true, draftOverall,
  };
}

// ── NAV-02 Phase 4 evaluation, v2 (NOT wired into production) ─────────────
// scripts/backtest/defense-model-team-fit.ts's frozen coefficients,
// duplicated here rather than imported from xnav-engine.ts. Unlike the
// original defense-model-fit.ts (fit against a player's OWN NEXT-season
// persistence — a forecasting target, which held up individually but never
// aggregated to a team-level signal), this model is fit DIRECTLY against
// CONCURRENT team xG-against/game — matching what X-NAV/D-NAV actually is:
// a same-season relative valuation, not a forecast. Holdout r=0.82 against
// team xGA/game (goalie-stripped), sign-consistent every season, and still
// discriminates within a team (77% of variance is within-team, not
// between-team — it isn't just relabeling "which team is this").
const DEFENSE_MODEL_COEFFICIENTS = {
  intercept: 0.063573, dzPct: 2.693710, corsiAgainstRel: -0.028817,
  blocksPer82: -0.000454, highDangerAgainstRate: 1.491240,
};
const DEFENSE_MODEL_MEAN = 3.0623;
const DEFENSE_MODEL_SCALE = 75;

function fittedDefenseValue(sk: SkaterSeason): number {
  const c = DEFENSE_MODEL_COEFFICIENTS;
  const predicted = c.intercept
    + c.dzPct * sk.dzPct + c.corsiAgainstRel * sk.corsiAgainstRel
    + c.blocksPer82 * sk.blocksPer82 + c.highDangerAgainstRate * sk.highDangerAgainstRate;
  return Math.max(-100, Math.min(120, (DEFENSE_MODEL_MEAN - predicted) * DEFENSE_MODEL_SCALE));
}

interface TeamPositionNav {
  team: string; season: number;
  fNav: number; dNav: number;
  // Standalone NAV-02 Phase 4 evaluation (see fittedDefenseValue above) —
  // NOT part of what calcDefenseNAV actually returns. Isolated (not summed
  // into a .total with offense/age/cap) so it's an apples-to-apples test
  // against a purely defensive outcome, unlike dNav above.
  dNavFittedEvaluation: number;
  gfPerGame: number; gaPerGame: number; xgaPerGame: number;
  fMatchRate: number; dMatchRate: number;
}

const results: TeamPositionNav[] = [];
for (const season of SEASONS) {
  const ceiling = CAP_CEILING[season];
  const seasonTeams = new Set([...teamStandings.values()].filter(t => t.season === season).map(t => t.team));

  for (const team of seasonTeams) {
    const standings = teamStandings.get(`${team}-${season}`);
    if (!standings) continue;

    const teamSkaters = skaterSeasons.filter(s => s.team === team && s.season === season);
    let fNav = 0, dNav = 0, dNavFittedEvaluation = 0;
    let fMatched = 0, fTotal = 0, dMatched = 0, dTotal = 0;

    for (const sk of teamSkaters) {
      const age = getAge(sk.name, season);
      if (age === null) continue;
      const contract = getContract(sk.name, season);
      const capHit = contract ? contract.capHit : ceiling * 0.009;
      const yrs = contract ? contract.yearsRemaining : 1;
      const bio = biosByName.get(slug(sk.name));
      const input = assetInputFor(sk, age, capHit, yrs, ceiling, bio?.draftOverall);

      if (sk.position === "D") {
        dTotal++;
        if (contract) dMatched++;
        dNav += calcDefenseNAV(input as AssetInput & { position: "D" }).total;
        dNavFittedEvaluation += fittedDefenseValue(sk);
      } else {
        fTotal++;
        if (contract) fMatched++;
        fNav += calcForwardNAV(input as AssetInput & { position: "C" | "W" }).total;
      }
    }

    results.push({
      team, season, fNav, dNav, dNavFittedEvaluation,
      gfPerGame: standings.gfPerGame, gaPerGame: standings.gaPerGame, xgaPerGame: standings.xgaPerGame,
      fMatchRate: fTotal > 0 ? fMatched / fTotal : 0,
      dMatchRate: dTotal > 0 ? dMatched / dTotal : 0,
    });
  }
}

// ── Stats helpers ──────────────────────────────────────────────────
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

const train = results.filter(r => r.season <= 2024);
const holdout = results.filter(r => r.season === 2025);

const fAvgMatch = results.reduce((s, r) => s + r.fMatchRate, 0) / results.length;
const dAvgMatch = results.reduce((s, r) => s + r.dMatchRate, 0) / results.length;

const fHoldoutR = pearsonR(holdout.map(r => r.fNav), holdout.map(r => r.gfPerGame));
const dHoldoutR = pearsonR(holdout.map(r => r.dNav), holdout.map(r => r.gaPerGame));
const fittedHoldoutR = pearsonR(holdout.map(r => r.dNavFittedEvaluation), holdout.map(r => r.gaPerGame));
const fittedVsXgaHoldoutR = pearsonR(holdout.map(r => r.dNavFittedEvaluation), holdout.map(r => r.xgaPerGame));

console.log("Position-Split NAV Backtest (NAV-01 Phase 4)");
console.log("=".repeat(60));
console.log(`\nTrain: ${train.length} team-seasons (2022-24). Holdout: ${holdout.length} (2025-26, untouched).`);
console.log(`Contract match rate — forwards: ${(fAvgMatch * 100).toFixed(1)}%, defensemen: ${(dAvgMatch * 100).toFixed(1)}%`);

console.log(`\nHoldout correlation (position-appropriate outcome) — what SHIPS:`);
console.log(`  ΣF-NAV vs team goals-for/game:      r=${fHoldoutR.toFixed(4)}  R²=${(fHoldoutR ** 2).toFixed(4)}`);
console.log(`  ΣD-NAV vs team goals-against/game:  r=${dHoldoutR.toFixed(4)}  R²=${(dHoldoutR ** 2).toFixed(4)}  (negative is good — more D value should mean fewer goals against)`);
console.log(`\nNAV-02 Phase 4 EVALUATION (standalone, NOT wired into calcDefenseNAV — see note below):`);
console.log(`  Fitted model, isolated, vs team goals-against/game: r=${fittedHoldoutR.toFixed(4)}  R²=${(fittedHoldoutR ** 2).toFixed(4)}`);
console.log(`  Fitted model, isolated, vs team xGA/game (goalie-stripped): r=${fittedVsXgaHoldoutR.toFixed(4)}`);

console.log(`\nPer-season breakdown:`);
const perSeason: { season: number; fr: number; dr: number; dDefOnlyR: number }[] = [];
for (const season of SEASONS) {
  const seasonResults = results.filter(r => r.season === season);
  if (seasonResults.length < 10) continue;
  const fr = pearsonR(seasonResults.map(r => r.fNav), seasonResults.map(r => r.gfPerGame));
  const dr = pearsonR(seasonResults.map(r => r.dNav), seasonResults.map(r => r.gaPerGame));
  const dDefOnlyR = pearsonR(seasonResults.map(r => r.dNavFittedEvaluation), seasonResults.map(r => r.gaPerGame));
  perSeason.push({ season, fr, dr, dDefOnlyR });
  console.log(`  ${season}: F-NAV (ships) vs GF/gm r=${fr.toFixed(4)}  |  D-NAV (ships) vs GA/gm r=${dr.toFixed(4)}  |  fitted-model evaluation vs GA/gm r=${dDefOnlyR.toFixed(4)}`);
}

console.log(`\nNOTE: ΣD-NAV (dNav, what ships) sums calcDefenseNAV's .total — offense +`);
console.log(`defense + age + cap surplus for every defenseman, per NAV-01's own "signed`);
console.log(`defence total" definition. The fitted-model evaluation column is a DIFFERENT,`);
console.log(`standalone computation (isolated, not summed with offense/age/cap) using`);
console.log(`defense-model-team-fit.ts's model — fit DIRECTLY against concurrent team`);
console.log(`defense, not next-season individual persistence (the earlier, shipped-`);
console.log(`formula's failure mode). It clears this script's team-level bar (see GATE 2`);
console.log(`below) — real evidence, not yet acted on: it is still NOT wired into`);
console.log(`calcDefenseNAV — see NAV-02's backlog entry for the full decision.`);

// ── Gates ────────────────────────────────────────────────────────
// A single holdout correlation is not enough to call a signal validated —
// NAV-01 increment 1 learned that the hard way (a barely-passing headline
// number hid three-of-four seasons pointing the wrong way). Sign
// consistency across every season is the real bar, matching the on-ice-only
// check team-nav-backtest.ts already applies.
const failures: string[] = [];
if (train.length < 80) failures.push(`insufficient train sample (${train.length} < 80)`);
if (holdout.length < 25) failures.push(`insufficient holdout sample (${holdout.length} < 25)`);
if (fAvgMatch < 0.5) failures.push(`forward contract match rate too low (${(fAvgMatch * 100).toFixed(1)}%)`);
if (dAvgMatch < 0.5) failures.push(`defenseman contract match rate too low (${(dAvgMatch * 100).toFixed(1)}%)`);
if (fHoldoutR <= 0.10) failures.push(`ΣF-NAV does not meaningfully track team goals-for on holdout (r=${fHoldoutR.toFixed(4)})`);
if (dHoldoutR >= -0.10) failures.push(`ΣD-NAV does not meaningfully track team goals-against suppression on holdout (r=${dHoldoutR.toFixed(4)}, expected clearly negative)`);
for (const { season, fr } of perSeason) {
  if (fr <= 0) failures.push(`ΣF-NAV vs goals-for is non-positive in ${season} (r=${fr.toFixed(4)})`);
}
for (const { season, dr } of perSeason) {
  if (dr >= 0) failures.push(`ΣD-NAV vs goals-against is the WRONG sign in ${season} (r=${dr.toFixed(4)} — more D-NAV associated with MORE goals allowed, not fewer)`);
}

console.log(`\n${"=".repeat(60)}`);
console.log("GATE 1 — what ships (calcDefenseNAV's legacy formula):");
if (failures.length > 0) {
  console.error(`FAIL: ${failures.join("; ")}`);
  if (failures.some(f => f.includes("WRONG sign"))) {
    console.error(`\nΣF-NAV is validated: positive and holding up every season. ΣD-NAV is NOT: it`);
    console.error(`points the wrong way in most seasons, meaning the engine's defensive-value`);
    console.error(`component does not reliably aggregate into a team-level defensive signal —`);
    console.error(`this is a real gap for a future increment's actual D-model fitting work to`);
    console.error(`close, not something to paper over with a single passing holdout number.`);
  }
  process.exitCode = 1;
} else {
  console.log("PASS: ΣF-NAV tracks team offense and ΣD-NAV tracks defensive suppression, sign-consistent every season.");
}

// ── GATE 2 — the standalone NAV-02 evaluation (dNavFittedEvaluation), fit
// DIRECTLY against concurrent team defense (defense-model-team-fit.ts)
// rather than next-season individual persistence (defense-model-fit.ts).
// This is diagnostic, not a production gate — calcDefenseNAV was NOT
// changed by this evaluation — but it is checked with the same rigor so a
// real pass here is trustworthy evidence for a future Phase 4 attempt.
console.log(`\nGATE 2 — NAV-02 standalone evaluation (concurrently-fit model, NOT shipped):`);
const evalFailures: string[] = [];
if (fittedHoldoutR >= -0.10) evalFailures.push(`fitted-model evaluation does not meaningfully track team goals-against on holdout (r=${fittedHoldoutR.toFixed(4)})`);
for (const { season, dDefOnlyR } of perSeason) {
  if (dDefOnlyR >= 0) evalFailures.push(`fitted-model evaluation is the WRONG sign in ${season} (r=${dDefOnlyR.toFixed(4)})`);
}
if (evalFailures.length > 0) {
  console.error(`FAIL: ${evalFailures.join("; ")}`);
} else {
  console.log(`PASS: sign-consistent and negative every season (holdout r=${fittedHoldoutR.toFixed(4)}) — a real`);
  console.log(`candidate for a future Phase 4 wiring attempt, unlike every prior evaluation this session.`);
}
