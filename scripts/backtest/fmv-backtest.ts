// ── FMV Backtest ─────────────────────────────────────────────────
//
//   npx tsx scripts/backtest/fmv-backtest.ts
//
// Runs the skater and goalie FMV models against every eligible signing
// from 2018 through 2025, using only prior-season MoneyPuck data that
// was available at signing time. Measures accuracy per signing class,
// overall, and — most importantly — whether the contract-verdict labels
// (bargain / fair / overpay) held up in subsequent seasons.
//
// No future information crosses the fence: a signing in summer 2020
// sees only 2017-18, 2018-19, and 2019-20 MoneyPuck data.

import fs from "fs";
import path from "path";
import skaterArtifact from "../../app/data/skater-fmv.json";
import goalieArtifact from "../../app/data/goalie-fmv.json";

const ROOT = process.cwd();

// ── Historical cap ceilings (the season the contract was signed INTO) ──
const CAP_CEILING: Record<number, number> = {
  2017: 75.0,
  2018: 79.5,
  2019: 81.5,
  2020: 81.5,
  2021: 81.5,
  2022: 82.5,
  2023: 83.5,
  2024: 88.0,
  2025: 95.0,
  2026: 104.0,
};

// ── Data sources ────────────────────────────────────────────────
const SKATER_PERF = [
  "OtherData/HistoricalData/skaters_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_skaters.csv",
];
const GOALIE_PERF = [
  "OtherData/HistoricalData/goalies_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_goalies.csv",
];
const SIGNINGS = "OtherData/contracts/signings.csv";

// ── Constants matching the FMV build ────────────────────────────
const TOI_REFERENCE_SECONDS = 20 * 60;
const TOI_CAP = 1.6;
const MIN_PRIOR_SECONDS = 400 * 60;
const LOOKBACK_SEASONS = 3;
const LEAGUE_MINIMUM_CAP_PCT = 0.00745;
const CBA_MAXIMUM_CAP_PCT = 0.20;
const FULL_SEASON_SECONDS = 3500 * 60;

// ── CSV parsing ─────────────────────────────────────────────────
interface Row { [k: string]: string }

function readCsv(rel: string): Row[] {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",");
  return lines.slice(1).map(line => {
    const cells = line.split(",");
    const row: Row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

const slug = (n: string): string =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();

// ── Load skater performance data ────────────────────────────────
type SeasonStats = { ice: number; gp: number; pts: number };
const skaterPerf = new Map<string, Map<number, SeasonStats>>();
for (const rel of SKATER_PERF) {
  for (const r of readCsv(rel)) {
    if (r.situation !== "all") continue;
    const ice = Number(r.icetime), gp = Number(r.games_played), pts = Number(r.I_F_points);
    if (!(ice > 0) || !isFinite(gp) || !isFinite(pts)) continue;
    const key = slug(r.name);
    const m = skaterPerf.get(key) ?? new Map();
    m.set(Number(r.season), { ice, gp, pts });
    skaterPerf.set(key, m);
  }
}

// ── Load goalie performance data ────────────────────────────────
type GoalieSeasonStats = { ice: number; gp: number; xGoals: number; goals: number; ongoal: number };
const goaliePerf = new Map<string, Map<number, GoalieSeasonStats>>();
for (const rel of GOALIE_PERF) {
  for (const r of readCsv(rel)) {
    if (r.situation !== "all") continue;
    const ice = Number(r.icetime), gp = Number(r.games_played);
    const xGoals = Number(r.xGoals), goals = Number(r.goals), ongoal = Number(r.ongoal);
    if (!(ice > 0) || !isFinite(gp)) continue;
    const key = slug(r.name);
    const m = goaliePerf.get(key) ?? new Map();
    m.set(Number(r.season), { ice, gp, xGoals, goals, ongoal });
    goaliePerf.set(key, m);
  }
}

// ── Load signings ───────────────────────────────────────────────
const signings = readCsv(SIGNINGS);

// ── Skater FMV model (replicated from skater-fmv.ts) ────────────
type SkaterUnit = "F" | "D";
const SKATER_MODEL = skaterArtifact.model.byPosition as Record<SkaterUnit, {
  n: number; intercept: number;
  coefficients: Record<string, number>;
  knots: { pts60: number[]; toi: number[] };
  featureDomain: Record<string, { min: number; max: number }>;
  validation: { walkForward: { maeCapPct: number } };
}>;

const hinge = (x: number, knot: number) => Math.max(0, x - knot);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function skaterFmvCapPct(pts60: number, minutesPerGame: number, age: number, isUfa: boolean, unit: SkaterUnit): number {
  const m = SKATER_MODEL[unit];
  const d = m.featureDomain;
  const p = clamp(pts60, d.pts60.min, d.pts60.max);
  const toi = clamp(Math.min(TOI_CAP, Math.max(0, minutesPerGame) / 20), d.toi.min, d.toi.max);
  const a = clamp(age, d.age.min, d.age.max);
  const c = m.coefficients;
  const k = m.knots;
  const raw = m.intercept
    + c.pts60 * p + c.pts60Hinge1 * hinge(p, k.pts60[0]) + c.pts60Hinge2 * hinge(p, k.pts60[1])
    + c.toi * toi + c.toiHinge1 * hinge(toi, k.toi[0]) + c.toiHinge2 * hinge(toi, k.toi[1])
    + c.age * a + c.ufa * (isUfa ? 1 : 0);
  return Math.min(CBA_MAXIMUM_CAP_PCT, Math.max(LEAGUE_MINIMUM_CAP_PCT, raw));
}

// ── Goalie FMV model (replicated from goalie-fmv.ts) ────────────
const G_MODEL = goalieArtifact.model;
const G_DOMAIN = G_MODEL.featureDomain;

function goalieFmvCapPct(gsax: number, iceTimeSeconds: number, age: number, isUfa: boolean): number {
  const workload = clamp(Math.max(0, iceTimeSeconds) / FULL_SEASON_SECONDS, 0, G_DOMAIN.workload.max);
  const raw = G_MODEL.intercept
    + G_MODEL.coefficients.gsax * clamp(gsax, G_DOMAIN.gsax.min, G_DOMAIN.gsax.max)
    + G_MODEL.coefficients.workload * workload
    + G_MODEL.coefficients.age * clamp(age, G_DOMAIN.age.min, G_DOMAIN.age.max)
    + G_MODEL.coefficients.ufa * (isUfa ? 1 : 0);
  return Math.max(LEAGUE_MINIMUM_CAP_PCT, raw);
}

// GSAx regression — the goalie model uses regressed GSAx/60, not raw
const GOALIE_GSAX_R = 0.134;
function regressedGsax60(seasons: GoalieSeasonStats[]): number | null {
  let totalIce = 0, totalGsax = 0;
  for (const s of seasons) {
    const gsax = s.xGoals - s.goals;
    totalIce += s.ice;
    totalGsax += gsax;
  }
  if (totalIce < MIN_PRIOR_SECONDS) return null;
  const raw60 = (totalGsax / totalIce) * 3600;
  const fullSeasons = totalIce / FULL_SEASON_SECONDS;
  const reliability = fullSeasons / (fullSeasons + (1 - GOALIE_GSAX_R) / GOALIE_GSAX_R);
  return raw60 * reliability;
}

// ── Contract verdict ────────────────────────────────────────────
type VerdictKind = "bargain" | "fair" | "overpay";
function verdict(predictedCapPct: number, actualCapPct: number, position: string): { kind: VerdictKind; surplus: number; margin: number } {
  const unit = position.toUpperCase() === "D" ? "D" : position.toUpperCase() === "G" ? "G" : "F";
  let marginCapPct: number;
  if (unit === "G") {
    marginCapPct = goalieArtifact.validation.walkForward.maeCapPct;
  } else {
    marginCapPct = SKATER_MODEL[unit].validation.walkForward.maeCapPct;
  }
  const surplus = predictedCapPct - actualCapPct;
  if (Math.abs(surplus) <= marginCapPct) return { kind: "fair", surplus, margin: marginCapPct };
  return surplus > 0
    ? { kind: "bargain", surplus, margin: marginCapPct }
    : { kind: "overpay", surplus, margin: marginCapPct };
}

// ── Run backtest ────────────────────────────────────────────────

interface BacktestRow {
  player: string;
  position: string;
  signYear: number;
  signDate: string;
  age: number;
  isUfa: boolean;
  actualCapPct: number;
  predictedCapPct: number;
  actualAav: number;
  predictedAav: number;
  error: number;
  absError: number;
  verdictKind: VerdictKind;
  surplus: number;
  // For verdict validation: did the player produce in subsequent seasons?
  subsequentPts60: number | null;
  subsequentToi: number | null;
  subsequentGsax60: number | null;
  priorPts60: number | null;
  priorToi: number | null;
}

const results: BacktestRow[] = [];

// ── Process skater signings ─────────────────────────────────────
const skaterEligible = signings.filter(r =>
  r.pos && r.pos.trim().toUpperCase() !== "G" &&
  r.structure?.trim() === "1-Way" &&
  r.level?.trim() === "STD" &&
  r.capPct && Number(r.capPct) > 0 &&
  r.signDate && r.signAge);

let skaterNoHist = 0, skaterThin = 0;

for (const s of skaterEligible) {
  const signYear = Number(s.signDate.slice(0, 4));
  const signMonth = Number(s.signDate.slice(5, 7));
  const priorSeason = signMonth >= 7 ? signYear - 1 : signYear - 2;

  // Skip signings where we can't determine the cap ceiling
  if (!CAP_CEILING[signYear]) continue;

  const hist = skaterPerf.get(slug(s.player));
  if (!hist) { skaterNoHist++; continue; }

  const seasons = [...hist.keys()].filter(y => y <= priorSeason).sort((a, b) => a - b).slice(-LOOKBACK_SEASONS);
  const totalIce = seasons.reduce((sum, y) => sum + hist.get(y)!.ice, 0);
  if (totalIce < MIN_PRIOR_SECONDS) { skaterThin++; continue; }

  const totalPts = seasons.reduce((sum, y) => sum + hist.get(y)!.pts, 0);
  const last = hist.get(seasons[seasons.length - 1])!;
  const pts60 = (totalPts * 3600) / totalIce;
  const minutesPerGame = (last.ice / 60) / Math.max(1, last.gp);
  const age = Number(s.signAge);
  const isUfa = s.signStatus?.trim() === "UFA";
  const unit: SkaterUnit = s.pos.trim().toUpperCase() === "D" ? "D" : "F";

  const predictedCapPct = skaterFmvCapPct(pts60, minutesPerGame, age, isUfa, unit);
  const actualCapPct = Number(s.capPct);
  const capCeiling = CAP_CEILING[signYear];

  const v = verdict(predictedCapPct, actualCapPct, s.pos);

  // Subsequent-season production for verdict validation
  // Look at the 2 seasons AFTER the signing
  const postSeasons = [...hist.keys()]
    .filter(y => y > priorSeason && y <= priorSeason + 2)
    .sort((a, b) => a - b);
  let subsequentPts60: number | null = null;
  let subsequentToi: number | null = null;
  if (postSeasons.length > 0) {
    const postIce = postSeasons.reduce((sum, y) => sum + hist.get(y)!.ice, 0);
    const postPts = postSeasons.reduce((sum, y) => sum + hist.get(y)!.pts, 0);
    if (postIce > 0) {
      subsequentPts60 = (postPts * 3600) / postIce;
      const postLast = hist.get(postSeasons[postSeasons.length - 1])!;
      subsequentToi = (postLast.ice / 60) / Math.max(1, postLast.gp);
    }
  }

  results.push({
    player: s.player,
    position: s.pos,
    signYear,
    signDate: s.signDate,
    age,
    isUfa,
    actualCapPct,
    predictedCapPct,
    actualAav: actualCapPct * capCeiling,
    predictedAav: predictedCapPct * capCeiling,
    error: (predictedCapPct - actualCapPct) * capCeiling,
    absError: Math.abs(predictedCapPct - actualCapPct) * capCeiling,
    verdictKind: v.kind,
    surplus: v.surplus * capCeiling,
    subsequentPts60,
    subsequentToi,
    subsequentGsax60: null,
    priorPts60: pts60,
    priorToi: minutesPerGame,
  });
}

// ── Process goalie signings ─────────────────────────────────────
const goalieEligible = signings.filter(r =>
  r.pos?.trim().toUpperCase() === "G" &&
  r.structure?.trim() === "1-Way" &&
  r.level?.trim() === "STD" &&
  r.capPct && Number(r.capPct) > 0 &&
  r.signDate && r.signAge);

let goalieNoHist = 0, goalieThin = 0;

for (const s of goalieEligible) {
  const signYear = Number(s.signDate.slice(0, 4));
  const signMonth = Number(s.signDate.slice(5, 7));
  const priorSeason = signMonth >= 7 ? signYear - 1 : signYear - 2;

  if (!CAP_CEILING[signYear]) continue;

  const hist = goaliePerf.get(slug(s.player));
  if (!hist) { goalieNoHist++; continue; }

  const seasons = [...hist.keys()].filter(y => y <= priorSeason).sort((a, b) => a - b).slice(-LOOKBACK_SEASONS);
  const seasonData = seasons.map(y => hist.get(y)!);
  const gsax60 = regressedGsax60(seasonData);
  if (gsax60 === null) { goalieThin++; continue; }

  const last = seasonData[seasonData.length - 1];
  const age = Number(s.signAge);
  const isUfa = s.signStatus?.trim() === "UFA";

  const predictedCapPct = goalieFmvCapPct(gsax60, last.ice, age, isUfa);
  const actualCapPct = Number(s.capPct);
  const capCeiling = CAP_CEILING[signYear];

  const v = verdict(predictedCapPct, actualCapPct, "G");

  // Subsequent goalie performance
  const postSeasons = [...hist.keys()]
    .filter(y => y > priorSeason && y <= priorSeason + 2)
    .sort((a, b) => a - b);
  let subsequentGsax60: number | null = null;
  if (postSeasons.length > 0) {
    const postData = postSeasons.map(y => hist.get(y)!);
    subsequentGsax60 = regressedGsax60(postData);
  }

  results.push({
    player: s.player,
    position: "G",
    signYear,
    signDate: s.signDate,
    age,
    isUfa,
    actualCapPct,
    predictedCapPct,
    actualAav: actualCapPct * capCeiling,
    predictedAav: predictedCapPct * capCeiling,
    error: (predictedCapPct - actualCapPct) * capCeiling,
    absError: Math.abs(predictedCapPct - actualCapPct) * capCeiling,
    verdictKind: v.kind,
    surplus: v.surplus * capCeiling,
    subsequentPts60: null,
    subsequentToi: null,
    subsequentGsax60,
    priorPts60: null,
    priorToi: null,
  });
}

// ── Analysis ────────────────────────────────────────────────────

function analyzeGroup(label: string, rows: BacktestRow[]) {
  if (rows.length === 0) return;
  const mae = rows.reduce((s, r) => s + r.absError, 0) / rows.length;
  const meanActual = rows.reduce((s, r) => s + r.actualAav, 0) / rows.length;
  const meanPred = rows.reduce((s, r) => s + r.predictedAav, 0) / rows.length;
  const ssRes = rows.reduce((s, r) => s + (r.predictedCapPct - r.actualCapPct) ** 2, 0);
  const meanCapPct = rows.reduce((s, r) => s + r.actualCapPct, 0) / rows.length;
  const ssTot = rows.reduce((s, r) => s + (r.actualCapPct - meanCapPct) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;

  // Median absolute error (more robust than mean)
  const sortedErrors = rows.map(r => r.absError).sort((a, b) => a - b);
  const medAE = sortedErrors[Math.floor(sortedErrors.length / 2)];

  console.log(`\n  ${label}`);
  console.log(`  ${"─".repeat(label.length)}`);
  console.log(`  n = ${rows.length}   MAE = $${mae.toFixed(2)}M   MedAE = $${medAE.toFixed(2)}M   R² = ${r2.toFixed(3)}`);
  console.log(`  Mean actual: $${meanActual.toFixed(2)}M   Mean predicted: $${meanPred.toFixed(2)}M`);

  // Within-band accuracy
  const within500k = rows.filter(r => r.absError <= 0.5).length;
  const within1M = rows.filter(r => r.absError <= 1.0).length;
  const within2M = rows.filter(r => r.absError <= 2.0).length;
  console.log(`  Within $0.5M: ${within500k} (${(within500k / rows.length * 100).toFixed(0)}%)   $1M: ${within1M} (${(within1M / rows.length * 100).toFixed(0)}%)   $2M: ${within2M} (${(within2M / rows.length * 100).toFixed(0)}%)`);
}

function analyzeVerdicts(rows: BacktestRow[]) {
  const bargains = rows.filter(r => r.verdictKind === "bargain");
  const overpays = rows.filter(r => r.verdictKind === "overpay");
  const fairs = rows.filter(r => r.verdictKind === "fair");

  console.log(`\n  Verdict distribution: ${bargains.length} bargains, ${fairs.length} fair, ${overpays.length} overpays`);

  // The right test: re-price the contract using SUBSEQUENT production.
  // If FMV(subsequent_stats) > capHit, the contract was still a bargain on hindsight.
  // If FMV(subsequent_stats) < capHit, the contract was still an overpay on hindsight.
  const skaterBargains = bargains.filter(r => r.position !== "G" && r.subsequentPts60 !== null && r.subsequentToi !== null);
  const skaterOverpays = overpays.filter(r => r.position !== "G" && r.subsequentPts60 !== null && r.subsequentToi !== null);
  const skaterFairs = fairs.filter(r => r.position !== "G" && r.subsequentPts60 !== null && r.subsequentToi !== null);

  const repriceVerdict = (r: BacktestRow): VerdictKind | null => {
    if (r.subsequentPts60 == null || r.subsequentToi == null) return null;
    const unit: SkaterUnit = r.position.toUpperCase() === "D" ? "D" : "F";
    const repricedCapPct = skaterFmvCapPct(r.subsequentPts60, r.subsequentToi, r.age + 1, r.isUfa, unit);
    const v = verdict(repricedCapPct, r.actualCapPct, r.position);
    return v.kind;
  };

  if (skaterBargains.length > 0) {
    const stillBargain = skaterBargains.filter(r => repriceVerdict(r) === "bargain").length;
    const stillGood = skaterBargains.filter(r => repriceVerdict(r) !== "overpay").length;
    console.log(`\n  BARGAIN contracts repriced on subsequent 2-season production:`);
    console.log(`    Still a bargain:     ${stillBargain}/${skaterBargains.length} (${(stillBargain / skaterBargains.length * 100).toFixed(0)}%)`);
    console.log(`    Not an overpay:      ${stillGood}/${skaterBargains.length} (${(stillGood / skaterBargains.length * 100).toFixed(0)}%)`);
  }

  if (skaterOverpays.length > 0) {
    const stillOverpay = skaterOverpays.filter(r => repriceVerdict(r) === "overpay").length;
    const stillBad = skaterOverpays.filter(r => repriceVerdict(r) !== "bargain").length;
    console.log(`\n  OVERPAY contracts repriced on subsequent 2-season production:`);
    console.log(`    Still an overpay:    ${stillOverpay}/${skaterOverpays.length} (${(stillOverpay / skaterOverpays.length * 100).toFixed(0)}%)`);
    console.log(`    Not a bargain:       ${stillBad}/${skaterOverpays.length} (${(stillBad / skaterOverpays.length * 100).toFixed(0)}%)`);
  }

  if (skaterFairs.length > 0) {
    const stillFair = skaterFairs.filter(r => repriceVerdict(r) === "fair").length;
    console.log(`\n  FAIR contracts repriced on subsequent 2-season production:`);
    console.log(`    Still fair:          ${stillFair}/${skaterFairs.length} (${(stillFair / skaterFairs.length * 100).toFixed(0)}%)`);
  }

  // Cohort production trajectories
  if (skaterBargains.length >= 10) {
    const bargainSubsequentPts60 = skaterBargains.reduce((s, r) => s + r.subsequentPts60!, 0) / skaterBargains.length;
    const bargainPriorPts60 = skaterBargains.reduce((s, r) => s + r.priorPts60!, 0) / skaterBargains.length;
    console.log(`\n  Production trajectories:`);
    console.log(`    Bargain cohort: prior pts/60 = ${bargainPriorPts60.toFixed(2)} → subsequent pts/60 = ${bargainSubsequentPts60.toFixed(2)} (${((bargainSubsequentPts60 / bargainPriorPts60 - 1) * 100).toFixed(1)}%)`);
  }
  if (skaterOverpays.length >= 10) {
    const overpaySubsequentPts60 = skaterOverpays.reduce((s, r) => s + r.subsequentPts60!, 0) / skaterOverpays.length;
    const overpayPriorPts60 = skaterOverpays.reduce((s, r) => s + r.priorPts60!, 0) / skaterOverpays.length;
    console.log(`    Overpay cohort: prior pts/60 = ${overpayPriorPts60.toFixed(2)} → subsequent pts/60 = ${overpaySubsequentPts60.toFixed(2)} (${((overpaySubsequentPts60 / overpayPriorPts60 - 1) * 100).toFixed(1)}%)`);
  }
  if (skaterFairs.length >= 10) {
    const fairSubsequentPts60 = skaterFairs.reduce((s, r) => s + r.subsequentPts60!, 0) / skaterFairs.length;
    const fairPriorPts60 = skaterFairs.reduce((s, r) => s + r.priorPts60!, 0) / skaterFairs.length;
    console.log(`    Fair cohort:    prior pts/60 = ${fairPriorPts60.toFixed(2)} → subsequent pts/60 = ${fairSubsequentPts60.toFixed(2)} (${((fairSubsequentPts60 / fairPriorPts60 - 1) * 100).toFixed(1)}%)`);
  }
}

// ── Print report ────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════════");
console.log("  FMV BACKTEST REPORT");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`\n  Total signings evaluated: ${results.length}`);
console.log(`  Skaters: ${results.filter(r => r.position !== "G").length} (${skaterNoHist} no MoneyPuck match, ${skaterThin} too little ice time)`);
console.log(`  Goalies: ${results.filter(r => r.position === "G").length} (${goalieNoHist} no match, ${goalieThin} thin ice)`);

// Overall
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  OVERALL ACCURACY");
console.log("═══════════════════════════════════════════════════════════════");
analyzeGroup("All positions", results);
analyzeGroup("Skaters (F+D)", results.filter(r => r.position !== "G"));
analyzeGroup("Forwards", results.filter(r => r.position !== "G" && r.position !== "D"));
analyzeGroup("Defence", results.filter(r => r.position === "D"));
analyzeGroup("Goalies", results.filter(r => r.position === "G"));

// Per signing class
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  ACCURACY BY SIGNING CLASS (YEAR)");
console.log("═══════════════════════════════════════════════════════════════");
const years = [...new Set(results.map(r => r.signYear))].sort();
for (const year of years) {
  const yearRows = results.filter(r => r.signYear === year);
  analyzeGroup(`Summer ${year} (cap $${CAP_CEILING[year]}M)`, yearRows);
}

// Verdict analysis
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  CONTRACT VERDICT VALIDATION");
console.log("═══════════════════════════════════════════════════════════════");
console.log("\n  Do 'bargain' and 'overpay' labels hold up in subsequent seasons?");
console.log("  (Using 2-season post-signing production window)");

analyzeVerdicts(results.filter(r => r.position !== "G"));

// Per-year verdict analysis — repriced on subsequent production
console.log("\n  Verdict persistence by signing class (repriced on subsequent stats):");
for (const year of years) {
  const yearRows = results.filter(r => r.signYear === year && r.position !== "G" && r.subsequentPts60 !== null && r.subsequentToi !== null);
  if (yearRows.length < 20) continue;

  const bargains = yearRows.filter(r => r.verdictKind === "bargain");
  const overpays = yearRows.filter(r => r.verdictKind === "overpay");

  const repriceLocal = (r: BacktestRow): VerdictKind | null => {
    if (r.subsequentPts60 == null || r.subsequentToi == null) return null;
    const unit: SkaterUnit = r.position.toUpperCase() === "D" ? "D" : "F";
    const repricedCapPct = skaterFmvCapPct(r.subsequentPts60, r.subsequentToi, r.age + 1, r.isUfa, unit);
    return verdict(repricedCapPct, r.actualCapPct, r.position).kind;
  };

  if (bargains.length >= 5 && overpays.length >= 5) {
    const bargainStill = bargains.filter(r => repriceLocal(r) === "bargain").length;
    const overpayStill = overpays.filter(r => repriceLocal(r) === "overpay").length;
    console.log(`    ${year}: bargains persisted ${(bargainStill / bargains.length * 100).toFixed(0)}% (${bargainStill}/${bargains.length})  overpays persisted ${(overpayStill / overpays.length * 100).toFixed(0)}% (${overpayStill}/${overpays.length})`);
  }
}

// ── Notable misses and hits ─────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  BIGGEST MISSES (top 15 by absolute error)");
console.log("═══════════════════════════════════════════════════════════════");
const sorted = [...results].sort((a, b) => b.absError - a.absError);
for (const r of sorted.slice(0, 15)) {
  const dir = r.error > 0 ? "over" : "under";
  console.log(`  ${r.player.padEnd(24)} ${r.signDate}  actual $${r.actualAav.toFixed(1)}M  predicted $${r.predictedAav.toFixed(1)}M  ${dir} by $${r.absError.toFixed(1)}M`);
}

// ── Error distribution ──────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  ERROR DISTRIBUTION");
console.log("═══════════════════════════════════════════════════════════════");
const buckets = [0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, Infinity];
for (let i = 0; i < buckets.length - 1; i++) {
  const lo = buckets[i], hi = buckets[i + 1];
  const count = results.filter(r => r.absError >= lo && r.absError < hi).length;
  const pct = (count / results.length * 100).toFixed(1);
  const bar = "█".repeat(Math.round(count / results.length * 60));
  const label = hi === Infinity ? `$${lo.toFixed(1)}M+` : `$${lo.toFixed(1)}–${hi.toFixed(1)}M`;
  console.log(`  ${label.padEnd(14)} ${String(count).padStart(4)}  ${pct.padStart(5)}%  ${bar}`);
}

// ── Cap % correlation by year (the regime-free metric) ──────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  CAP% PREDICTION (regime-free, the model's native unit)");
console.log("═══════════════════════════════════════════════════════════════");
for (const year of years) {
  const yr = results.filter(r => r.signYear === year);
  const maeCapPct = yr.reduce((s, r) => s + Math.abs(r.predictedCapPct - r.actualCapPct), 0) / yr.length;
  const meanCapPct = yr.reduce((s, r) => s + r.actualCapPct, 0) / yr.length;
  const ssRes = yr.reduce((s, r) => s + (r.predictedCapPct - r.actualCapPct) ** 2, 0);
  const ssTot = yr.reduce((s, r) => s + (r.actualCapPct - meanCapPct) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  console.log(`  ${year}: n=${String(yr.length).padStart(3)}  MAE=${(maeCapPct * 100).toFixed(2)}pts  R²=${r2.toFixed(3)}  (at $${CAP_CEILING[year]}M → MAE $${(maeCapPct * CAP_CEILING[year]).toFixed(2)}M)`);
}

// ── Save detailed results ───────────────────────────────────────
const outPath = path.join(ROOT, "scripts/backtest/fmv-backtest-results.json");
fs.writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalSignings: results.length,
  skaterNoMatch: skaterNoHist,
  skaterThinIce: skaterThin,
  goalieNoMatch: goalieNoHist,
  goalieThinIce: goalieThin,
  capCeilings: CAP_CEILING,
  results: results.map(r => ({
    player: r.player,
    position: r.position,
    signYear: r.signYear,
    signDate: r.signDate,
    age: r.age,
    isUfa: r.isUfa,
    actualCapPct: Number(r.actualCapPct.toFixed(5)),
    predictedCapPct: Number(r.predictedCapPct.toFixed(5)),
    actualAav: Number(r.actualAav.toFixed(3)),
    predictedAav: Number(r.predictedAav.toFixed(3)),
    errorM: Number(r.error.toFixed(3)),
    absErrorM: Number(r.absError.toFixed(3)),
    verdict: r.verdictKind,
    subsequentPts60: r.subsequentPts60 ? Number(r.subsequentPts60.toFixed(3)) : null,
  })),
}, null, 2));
console.log(`\n  Detailed results saved to ${outPath}`);
console.log("═══════════════════════════════════════════════════════════════\n");
