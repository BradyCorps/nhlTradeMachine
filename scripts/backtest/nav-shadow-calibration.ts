/** NAV-01 Phase 5 shadow-only market calibration. Never changes public NAV. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { calcContractIndependentPositionalNavRaw } from "../../app/lib/xnav-engine";
import {
  classifyMarketCalibrationUniverse,
  ageBand,
  freezePeriod,
  runMarketCalibrationCohortAudit,
  unitForPosition,
  type Unit,
} from "./nav-calibration-cohort";
import { loadLocalIdentitySources, runHistoricalDataAudit, type Row } from "./nav-historical-data-audit";
import { parseCsv } from "./nav-target-pilot";

type Partition = "train" | "validation" | "holdout";
type MarketUnit = Exclude<Unit, "unknown">;
type Status = "UFA" | "RFA" | "missing";
type ModelKind = "uncontrolled" | "statusControlled" | "blankStatusExcluded" | "ufaOnly";
type Coefficient = { intercept: number; slope: number };

export type ShadowRow = {
  contractRow: number;
  playerId: string;
  unit: MarketUnit;
  signingAge: number;
  ageBand: string;
  status: Status;
  partition: Partition;
  signingYear: number;
  termYears: number | null;
  structure: string;
  team: string;
  role: string;
  pointsPace: number;
  expectedGoalsPace: number;
  defensiveImpact: number;
  deploymentToi: number;
  deploymentRank: number;
  raw: number;
  targetCapSharePp: number;
  actualCapHit: number;
  capCeiling: number;
};

const SPEC_PATH = "docs/analytics/nav01-shadow-calibration-spec.json";
const REPORT_PATH = "docs/analytics/nav01-shadow-calibration-report.json";
const NEUTRAL_YEARS_REMAINING = 3;
const BOOTSTRAP_REPLICATES = 1_000;
const CAP_CEILING_BY_SIGNING_YEAR: Record<number, number> = {
  2023: 83_500_000,
  2024: 88_000_000,
  2025: 95_500_000,
  2026: 104_000_000,
};

export const FROZEN_SHADOW_GATES = {
  minimumRowsByPosition: { F: 50, D: 30, G: 15 },
  minimumUfaRowsByPosition: { F: 25, D: 15, G: 10 },
  targetImprovementPp: 0.10,
  maximumPositionMaeRegressionPp: 0.05,
  maximumAbsoluteSignedBiasPp: 0.25,
  calibrationSlope: { min: 0.70, max: 1.30 },
  bootstrapImprovementLowerBoundPp: 0,
  bootstrapReplicates: BOOTSTRAP_REPLICATES,
} as const;

function number(value: string | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function signingYear(signDate: string) { return Number(signDate.slice(0, 4)); }
function termYears(term: string | undefined) {
  const match = term?.match(/(\d+(?:\.\d+)?)\s*yr/i);
  return match ? number(match[1]) : null;
}
function roleFor(unit: MarketUnit, games: number, iceTimeRank: number) {
  if (unit === "G") return games >= 50 ? "starter" : games >= 35 ? "tandem" : "backup";
  if (unit === "D") return iceTimeRank <= 60 ? "top_pair" : iceTimeRank <= 180 ? "regular" : "depth";
  return iceTimeRank <= 60 ? "top_six" : iceTimeRank <= 240 ? "regular" : "depth";
}
function statusFor(row: Row): Status {
  const status = row.signStatus?.trim();
  return status === "UFA" ? "UFA" : status === "RFA" || status === "UFA Group 6" ? "RFA" : "missing";
}
function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
}
function median(values: number[]) { return percentile(values, 0.5); }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function rounded(value: number | null, digits = 6) { return value == null ? null : Number(value.toFixed(digits)); }

function rank(values: number[]) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = Array(values.length).fill(0);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end++;
    const rank = (start + 1 + end) / 2;
    for (let i = start; i < end; i++) ranks[sorted[i].index] = rank;
    start = end;
  }
  return ranks;
}
function pearson(x: number[], y: number[]) {
  const xMean = average(x), yMean = average(y);
  if (xMean == null || yMean == null) return null;
  const numerator = x.reduce((sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0);
  const xDenominator = Math.sqrt(x.reduce((sum, value) => sum + (value - xMean) ** 2, 0));
  const yDenominator = Math.sqrt(y.reduce((sum, value) => sum + (value - yMean) ** 2, 0));
  return xDenominator && yDenominator ? numerator / (xDenominator * yDenominator) : null;
}
function linear(x: number[], y: number[]): Coefficient {
  const xMean = average(x) ?? 0, yMean = average(y) ?? 0;
  const denominator = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const slope = denominator ? x.reduce((sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0) / denominator : 0;
  return { intercept: yMean - slope * xMean, slope };
}
function prediction(coefficient: Coefficient, raw: number) { return coefficient.intercept + coefficient.slope * raw; }

export function fitPositionAffine(rows: ShadowRow[]) {
  return Object.fromEntries((["F", "D", "G"] as const).map(unit => {
    const subset = rows.filter(row => row.unit === unit);
    return [unit, linear(subset.map(row => row.raw), subset.map(row => row.targetCapSharePp))];
  })) as Record<MarketUnit, Coefficient>;
}

function fitStatusOffsets(rows: ShadowRow[], coefficients: Record<MarketUnit, Coefficient>) {
  return Object.fromEntries((["UFA", "RFA", "missing"] as const).map(status => {
    const residuals = rows.filter(row => row.status === status)
      .map(row => row.targetCapSharePp - prediction(coefficients[row.unit], row.raw));
    return [status, median(residuals) ?? 0];
  })) as Record<Status, number>;
}

type Model = {
  kind: ModelKind;
  coefficients: Record<MarketUnit, Coefficient>;
  statusOffsets: Record<Status, number>;
  trainingRows: number;
  trainingPlayers: number;
};
type MedianBaseline = {
  kind: "medianBaseline";
  cells: Record<string, number>;
  unitFallback: Record<MarketUnit, number>;
  overall: number;
};
type Predictor = Model | MedianBaseline;

export function fitModel(rows: ShadowRow[], kind: ModelKind): Model | null {
  const scoped = kind === "blankStatusExcluded" ? rows.filter(row => row.status !== "missing")
    : kind === "ufaOnly" ? rows.filter(row => row.status === "UFA") : rows;
  if (!scoped.length || (["F", "D", "G"] as const).some(unit => !scoped.some(row => row.unit === unit))) return null;
  const coefficients = fitPositionAffine(scoped);
  return {
    kind, coefficients,
    statusOffsets: kind === "statusControlled" ? fitStatusOffsets(scoped, coefficients) : { UFA: 0, RFA: 0, missing: 0 },
    trainingRows: scoped.length,
    trainingPlayers: new Set(scoped.map(row => row.playerId)).size,
  };
}

function fitMedianBaseline(rows: ShadowRow[]): MedianBaseline {
  const valuesByCell = new Map<string, number[]>();
  const valuesByUnit = new Map<MarketUnit, number[]>();
  for (const row of rows) {
    const key = `${row.unit}|${row.ageBand}|${row.status}`;
    valuesByCell.set(key, [...(valuesByCell.get(key) ?? []), row.targetCapSharePp]);
    valuesByUnit.set(row.unit, [...(valuesByUnit.get(row.unit) ?? []), row.targetCapSharePp]);
  }
  return {
    kind: "medianBaseline",
    cells: Object.fromEntries([...valuesByCell].map(([key, values]) => [key, median(values)!])),
    unitFallback: Object.fromEntries((["F", "D", "G"] as const).map(unit => [unit, median(valuesByUnit.get(unit) ?? []) ?? 0])) as Record<MarketUnit, number>,
    overall: median(rows.map(row => row.targetCapSharePp)) ?? 0,
  };
}

function allows(model: Predictor, row: ShadowRow) {
  if (model.kind === "medianBaseline") return true;
  return !(model.kind === "blankStatusExcluded" && row.status === "missing")
    && !(model.kind === "ufaOnly" && row.status !== "UFA");
}
function predictedCapSharePp(model: Predictor, row: ShadowRow) {
  if (model.kind === "medianBaseline") {
    return model.cells[`${row.unit}|${row.ageBand}|${row.status}`] ?? model.unitFallback[row.unit] ?? model.overall;
  }
  return prediction(model.coefficients[row.unit], row.raw) + model.statusOffsets[row.status];
}

function metric(rows: ShadowRow[], model: Predictor) {
  const scored = rows.filter(row => allows(model, row)).map(row => ({ row, predicted: predictedCapSharePp(model, row) }));
  const errors = scored.map(value => value.predicted - value.row.targetCapSharePp);
  const absolute = errors.map(Math.abs);
  const calibration = linear(scored.map(value => value.predicted), scored.map(value => value.row.targetCapSharePp));
  return {
    rows: scored.length,
    players: new Set(scored.map(value => value.row.playerId)).size,
    maePp: average(absolute),
    medianAbsoluteErrorPp: median(absolute),
    rmsePp: errors.length ? Math.sqrt(average(errors.map(value => value ** 2)) ?? 0) : null,
    calibrationSlope: calibration.slope,
    calibrationInterceptPp: calibration.intercept,
    signedBiasPp: average(errors),
    rankCorrelation: pearson(rank(scored.map(value => value.predicted)), rank(scored.map(value => value.row.targetCapSharePp))),
    meanCalibratedMarketValue: average(scored.map(value => value.predicted / 100 * value.row.capCeiling)),
    meanSurplus: average(scored.map(value => value.predicted / 100 * value.row.capCeiling - value.row.actualCapHit)),
  };
}

function byUnit(rows: ShadowRow[], model: Predictor) {
  return Object.fromEntries((["F", "D", "G"] as const).map(unit => [unit, metric(rows.filter(row => row.unit === unit), model)]));
}

function seeded(seed: number) { let state = seed >>> 0; return () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32); }
function bootstrap(rows: ShadowRow[], model: Model, baseline: Predictor) {
  const players = [...new Set(rows.map(row => row.playerId))];
  const byPlayer = new Map(players.map(player => [player, rows.filter(row => row.playerId === player)]));
  const random = seeded(0x4e415630);
  const values: number[] = [];
  for (let replicate = 0; replicate < BOOTSTRAP_REPLICATES; replicate++) {
    const sample = Array.from({ length: players.length }, () => byPlayer.get(players[Math.floor(random() * players.length)])!).flat();
    const candidateMae = metric(sample, model).maePp, baselineMae = metric(sample, baseline).maePp;
    if (candidateMae != null && baselineMae != null) values.push(baselineMae - candidateMae);
  }
  return { method: "player-clustered bootstrap", replicates: BOOTSTRAP_REPLICATES, seed: "0x4e415630", improvementPp95: [percentile(values, 0.025), percentile(values, 0.975)] };
}

function compare(rows: ShadowRow[], model: Model, baseline: Predictor) {
  const candidate = metric(rows, model), base = metric(rows, baseline);
  const improvementPp = candidate.maePp != null && base.maePp != null ? base.maePp - candidate.maePp : null;
  return {
    candidate,
    baseline: base,
    maeImprovementPp: improvementPp,
    maeImprovementRelativePct: improvementPp != null && base.maePp ? improvementPp / base.maePp * 100 : null,
    byPosition: Object.fromEntries((["F", "D", "G"] as const).map(unit => {
      const c = metric(rows.filter(row => row.unit === unit), model), b = metric(rows.filter(row => row.unit === unit), baseline);
      return [unit, { candidate: c, baseline: b, maeImprovementPp: c.maePp != null && b.maePp != null ? b.maePp - c.maePp : null }];
    })),
    bootstrap: bootstrap(rows, model, baseline),
  };
}

function assetFrom(row: Row, signing: Row, unit: MarketUnit) {
  const games = Math.max(1, number(row.games_played));
  const pace = (field: string) => number(row[field]) / games * 82;
  const position = unit === "G" ? "G" : unit === "D" ? "D" : signing.pos?.trim().toUpperCase() === "C" ? "C" : "W";
  if (unit === "G") return {
    id: row.playerId, name: row.name, position: "G" as const, age: number(signing.signAge), capHit: 0, yearsRemaining: NEUTRAL_YEARS_REMAINING,
    games, gamesStarted: games, gsax: number(row.xGoals) - number(row.goals), iceTimeSeconds: number(row.icetime) * 60,
    teamXga60: 2.8, teamHdca60: 10, hasLiveStats: true,
  };
  return {
    id: row.playerId, name: row.name, position: position as "C" | "W" | "D", age: number(signing.signAge), capHit: 0, yearsRemaining: NEUTRAL_YEARS_REMAINING,
    games, ptsPace: pace("I_F_points"), goalsPace: pace("I_F_goals"),
    assistsPace: pace("I_F_primaryAssists") + pace("I_F_secondaryAssists"), xGPace: pace("I_F_xGoals"),
    defRate: number(row.OnIce_F_xGoals) - number(row.OnIce_A_xGoals), avgTOI: number(row.icetime) / games,
    xgRelTM: number(row.onIce_xGoalsPercentage) - number(row.offIce_xGoalsPercentage),
    xgaRelTM: number(row.OnIce_A_xGoals) - number(row.OffIce_A_xGoals), qocIndex: 50,
    blocksPer82: pace("shotsBlockedByPlayer"), highDangerAgainstRate: number(row.OnIce_A_highDangerxGoals) / Math.max(1, number(row.icetime)) * 60,
    hasLiveStats: true,
  };
}

export function buildShadowRows(partitions: ReadonlySet<Partition> = new Set(["train", "validation", "holdout"])) {
  const identities = runHistoricalDataAudit();
  const signings = parseCsv(readFileSync("OtherData/contracts/signings.csv", "utf8"));
  const allSources = loadLocalIdentitySources(readFileSync);
  const classification = classifyMarketCalibrationUniverse(signings, identities.resolved, allSources
    .filter(source => source.source !== "historicalGoalie").map(source => ({ season: source.season, row: source.row })));
  const lookup = new Map<string, Array<{ season: number; row: Row }>>();
  for (const source of allSources) {
    if (source.row.situation !== "all" || number(source.row.games_played) <= 0 || number(source.row.icetime) <= 0) continue;
    const kind = source.source === "moneyPuckSkater" ? "skater" : "goalie";
    const key = `${source.row.playerId}:${kind}`;
    lookup.set(key, [...(lookup.get(key) ?? []), { season: source.season, row: source.row }]);
  }
  const rows: ShadowRow[] = [];
  for (const record of classification.market) {
    const unit = unitForPosition(record.signing.pos);
    if (unit === "unknown") continue;
    const source = unit === "G" ? "goalie" : "skater";
    const playerSeason = [...(lookup.get(`${record.playerId}:${source}`) ?? [])]
      .filter(candidate => candidate.season <= record.priorSeason)
      .sort((a, b) => b.season - a.season)[0]?.row;
    const partition = freezePeriod(record.signing.signDate);
    const capCeiling = CAP_CEILING_BY_SIGNING_YEAR[signingYear(record.signing.signDate)];
    if (!playerSeason || partition === "outside" || !partitions.has(partition) || !capCeiling) continue;
    const raw = calcContractIndependentPositionalNavRaw(assetFrom(playerSeason, record.signing, unit)).raw;
    const games = Math.max(1, number(playerSeason.games_played));
    const toi = number(playerSeason.icetime) / games;
    const pace = (field: string) => number(playerSeason[field]) / games * 82;
    rows.push({
      contractRow: record.contractRow, playerId: record.playerId, unit, signingAge: number(record.signing.signAge), ageBand: ageBand(record.signing.signAge), status: statusFor(record.signing), partition,
      signingYear: signingYear(record.signing.signDate), termYears: termYears(record.signing.term),
      structure: record.signing.structure?.trim() || "missing", team: record.signing.team?.trim().toUpperCase() || "missing",
      role: roleFor(unit, games, number(playerSeason.iceTimeRank, Infinity)), pointsPace: unit === "G" ? 0 : pace("I_F_points"), expectedGoalsPace: unit === "G" ? 0 : pace("I_F_xGoals"),
      defensiveImpact: unit === "G" ? number(playerSeason.xGoals) - number(playerSeason.goals) : number(playerSeason.OnIce_A_xGoals) - number(playerSeason.OffIce_A_xGoals),
      deploymentToi: toi, deploymentRank: number(playerSeason.iceTimeRank, 999),
      raw, targetCapSharePp: number(record.signing.capPct) * 100, actualCapHit: number(record.signing.capHit), capCeiling,
    });
  }
  return rows;
}

function selection(rows: ShadowRow[]) {
  const train = rows.filter(row => row.partition === "train");
  const validation = rows.filter(row => row.partition === "validation");
  const baseline = fitMedianBaseline(train);
  const candidates = (["uncontrolled", "statusControlled"] as const).map(kind => fitModel(train, kind)!).map(model => ({ model, result: compare(validation, model, baseline) }));
  candidates.sort((a, b) => (a.result.candidate.maePp ?? Infinity) - (b.result.candidate.maePp ?? Infinity));
  return { train, validation, baseline, selected: candidates[0], candidates };
}

function passStatus(result: ReturnType<typeof compare>) {
  const improvement = result.maeImprovementPp ?? -Infinity;
  const lower = result.bootstrap.improvementPp95[0] ?? -Infinity;
  const units = Object.values(result.byPosition);
  const allUnitsPass = units.every(value => (value.maeImprovementPp ?? -Infinity) >= -FROZEN_SHADOW_GATES.maximumPositionMaeRegressionPp
    && Math.abs(value.candidate.signedBiasPp ?? Infinity) <= FROZEN_SHADOW_GATES.maximumAbsoluteSignedBiasPp
    && (value.candidate.calibrationSlope ?? 0) >= FROZEN_SHADOW_GATES.calibrationSlope.min
    && (value.candidate.calibrationSlope ?? Infinity) <= FROZEN_SHADOW_GATES.calibrationSlope.max);
  const overallPass = improvement >= FROZEN_SHADOW_GATES.targetImprovementPp && lower > FROZEN_SHADOW_GATES.bootstrapImprovementLowerBoundPp
    && Math.abs(result.candidate.signedBiasPp ?? Infinity) <= FROZEN_SHADOW_GATES.maximumAbsoluteSignedBiasPp
    && (result.candidate.calibrationSlope ?? 0) >= FROZEN_SHADOW_GATES.calibrationSlope.min
    && (result.candidate.calibrationSlope ?? Infinity) <= FROZEN_SHADOW_GATES.calibrationSlope.max;
  return overallPass && allUnitsPass ? "PASS" : overallPass ? "PARTIAL" : "FAIL";
}

function checksum(value: unknown) {
  const canonical = JSON.stringify(value);
  return createHash("sha256").update(canonical).digest("hex");
}

function sensitivity(rows: ShadowRow[], partition: Partition) {
  const train = rows.filter(row => row.partition === "train"), evaluation = rows.filter(row => row.partition === partition);
  return (["uncontrolled", "statusControlled", "blankStatusExcluded", "ufaOnly"] as const).map(kind => {
    const model = fitModel(train, kind);
    const enough = kind !== "ufaOnly" || (["F", "D", "G"] as const).every(unit => train.filter(row => row.unit === unit && row.status === "UFA").length >= FROZEN_SHADOW_GATES.minimumUfaRowsByPosition[unit]
      && evaluation.filter(row => row.unit === unit && row.status === "UFA").length >= FROZEN_SHADOW_GATES.minimumUfaRowsByPosition[unit]);
    return { kind, eligible: enough && model != null, metrics: enough && model ? { overall: metric(evaluation, model), byPosition: byUnit(evaluation, model) } : null };
  });
}

export function writeFrozenSpec() {
  // Holdout labels are deliberately not loaded into rows before this spec is frozen.
  const rows = buildShadowRows(new Set<Partition>(["train", "validation"])), selected = selection(rows);
  const specBody = {
    schemaVersion: 1,
    purpose: "NAV-01 Phase 5 market-only shadow calibration; no public values changed",
    cohort: {
      rows: 1_554, partitions: { train: 390, validation: 513, holdout: 651 }, fittedRows: rows.length,
      featureRowExclusions: [{ contractRow: 626, reason: "contract position is G but canonical NHL ID 8476473 has only pre-signing skater data; excluded rather than misclassifying a skater as a goalie" }],
      neutralYearsRemaining: NEUTRAL_YEARS_REMAINING,
    },
    target: "signed cap share in percentage points; dollar conversion = calibratedCapSharePp / 100 * signing-date cap ceiling; surplus = calibratedMarketValue - actualCapHit after calibration",
    raw: "calcContractIndependentPositionalNavRaw: goalie impact; skater off + def + age + gravity; zero cap, neutral 3-year horizon, and no target-contract fields",
    selectedModel: selected.selected.model,
    validation: { baseline: "training-only position x age-band x status median", selected: selected.selected.result, candidateKinds: selected.candidates.map(candidate => candidate.model.kind), status: passStatus(selected.selected.result) },
    gates: FROZEN_SHADOW_GATES,
    fallback: ["ELC policy-constrained: use labelled fallback with wider uncertainty; excluded from training", "No pre-signing NHL sample: use labelled fallback with wider uncertainty; excluded from training"],
  };
  const spec = { ...specBody, checksum: checksum(specBody) };
  writeFileSync(SPEC_PATH, `${JSON.stringify(spec, null, 2)}\n`);
  return spec;
}

export function runFrozenHoldout() {
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
  const { checksum: expected, ...specBody } = spec;
  if (checksum(specBody) !== expected) throw new Error("Frozen specification checksum does not match");
  const rows = buildShadowRows(), holdout = rows.filter(row => row.partition === "holdout");
  const selectedModel = spec.selectedModel as Model;
  const baseline = fitMedianBaseline(rows.filter(row => row.partition === "train"));
  const result = compare(holdout, selectedModel, baseline);
  const report = {
    schemaVersion: 1, frozenSpecChecksum: expected, holdoutRun: "single post-freeze evaluation", decision: passStatus(result),
    result, sensitivity: sensitivity(rows, "holdout"),
    publicModel: "retained; shadow artifacts only; no feature flag or consumer surface changed",
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/backtest/nav-shadow-calibration.ts")) {
  try {
    if (process.argv.includes("--freeze")) console.log(JSON.stringify(writeFrozenSpec(), null, 2));
    else if (process.argv.includes("--holdout")) console.log(JSON.stringify(runFrozenHoldout(), null, 2));
    else console.log(JSON.stringify({ cohort: runMarketCalibrationCohortAudit().universe, message: "Use --freeze before --holdout." }, null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
