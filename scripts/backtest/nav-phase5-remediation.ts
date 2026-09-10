/** Development-only diagnosis after NAV-01 Phase 5's spent holdout. */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildShadowRows, type ShadowRow } from "./nav-shadow-calibration";

type Unit = "F" | "D" | "G";
type Fit = { name: string; predict: (row: ShadowRow) => number; features: string[] };
type Metric = { rows: number; players: number; maePp: number; signedBiasPp: number; slope: number; rankCorrelation: number; playerClusteredBootstrap?: { replicates: number; maePp95: [number, number]; signedBiasPp95: [number, number] } };

const REPORT_PATH = "docs/analytics/nav01-phase5-remediation.json";
const DEVELOPMENT_PERIODS = ["train", "validation", "holdout"] as const;
const units: Unit[] = ["F", "D", "G"];

function mean(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function pearson(x: number[], y: number[]) {
  if (!x.length || x.length !== y.length) return 0;
  const xMean = mean(x), yMean = mean(y);
  const numerator = x.reduce((sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0);
  const denominator = Math.sqrt(x.reduce((sum, value) => sum + (value - xMean) ** 2, 0) * y.reduce((sum, value) => sum + (value - yMean) ** 2, 0));
  return denominator ? numerator / denominator : 0;
}
function ranks(values: number[]) {
  const ranked = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const output = Array(values.length).fill(0);
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length && ranked[end].value === ranked[start].value) end++;
    for (let index = start; index < end; index++) output[ranked[index].index] = (start + 1 + end) / 2;
    start = end;
  }
  return output;
}
function affine(x: number[], y: number[]) {
  const xMean = mean(x), yMean = mean(y);
  const denominator = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const slope = denominator ? x.reduce((sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0) / denominator : 0;
  return { intercept: yMean - slope * xMean, slope };
}
function solve(matrix: number[][], target: number[]) {
  const augmented = matrix.map((row, index) => [...row, target[index]]);
  for (let column = 0; column < augmented.length; column++) {
    let pivot = column;
    for (let row = column + 1; row < augmented.length; row++) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const value = augmented[column][column];
    if (Math.abs(value) < 1e-9) throw new Error("Singular remediation design matrix");
    for (let index = column; index <= augmented.length; index++) augmented[column][index] /= value;
    for (let row = 0; row < augmented.length; row++) if (row !== column) {
      const factor = augmented[row][column];
      for (let index = column; index <= augmented.length; index++) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map(row => row.at(-1)!);
}
function multivariate(rows: ShadowRow[], name: string, featureNames: string[], values: (row: ShadowRow) => number[]): Fit {
  const rawValues = rows.map(values);
  const averages = featureNames.map((_, column) => mean(rawValues.map(row => row[column])));
  const spreads = featureNames.map((_, column) => Math.sqrt(mean(rawValues.map(row => (row[column] - averages[column]) ** 2))) || 1);
  const design = rawValues.map(row => [1, ...row.map((value, column) => (value - averages[column]) / spreads[column])]);
  const normal = design[0].map((_, left) => design[0].map((_, right) => design.reduce((sum, row) => sum + row[left] * row[right], 0)));
  const target = design[0].map((_, left) => design.reduce((sum, row, index) => sum + row[left] * rows[index].targetCapSharePp, 0));
  const coefficients = solve(normal, target);
  return { name, features: featureNames, predict: row => coefficients[0] + values(row).reduce((sum, value, column) => sum + coefficients[column + 1] * (value - averages[column]) / spreads[column], 0) };
}
function rawAffine(rows: ShadowRow[], unit: Unit): Fit {
  const subset = rows.filter(row => row.unit === unit);
  const fit = affine(subset.map(row => row.raw), subset.map(row => row.targetCapSharePp));
  return { name: `${unit}-raw-affine`, features: ["positionalNavRaw"], predict: row => fit.intercept + fit.slope * row.raw };
}
function centeredStatusAffine(rows: ShadowRow[], unit: Unit): Fit {
  const base = rawAffine(rows, unit), subset = rows.filter(row => row.unit === unit);
  const byStatus = new Map<string, number[]>();
  for (const row of subset) byStatus.set(row.status, [...(byStatus.get(row.status) ?? []), row.targetCapSharePp - base.predict(row)]);
  const offsets = Object.fromEntries([...byStatus].map(([status, residuals]) => [status, mean(residuals)])) as Record<string, number>;
  const weightedMean = mean(subset.map(row => offsets[row.status]));
  return { name: `${unit}-raw-affine-status-mean`, features: ["positionalNavRaw", "signingStatus"], predict: row => base.predict(row) + offsets[row.status] - weightedMean };
}
function shiftedIntercept(base: Fit, unit: Unit, shift: number): Fit {
  return { name: `${unit}-raw-affine-rolling-intercept`, features: ["positionalNavRaw", "prior-fold intercept"], predict: row => base.predict(row) + shift };
}
function dMarketBridge(rows: ShadowRow[]): Fit {
  return multivariate(rows.filter(row => row.unit === "D"), "D-market-bridge-v1", ["positionalNavRaw", "pointsPace", "defensiveImpact", "deploymentRank", "signingAge"], row => [row.raw, row.pointsPace, row.defensiveImpact, row.deploymentRank, row.signingAge]);
}
function metric(rows: ShadowRow[], fit: Fit): Metric {
  const predicted = rows.map(fit.predict), target = rows.map(row => row.targetCapSharePp), errors = predicted.map((value, index) => value - target[index]);
  const calibration = affine(predicted, target);
  return { rows: rows.length, players: new Set(rows.map(row => row.playerId)).size, maePp: mean(errors.map(Math.abs)), signedBiasPp: mean(errors), slope: calibration.slope, rankCorrelation: pearson(ranks(predicted), ranks(target)) };
}
function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * quantile)];
}
function playerClusteredMetric(rows: ShadowRow[], fit: Fit): Metric {
  const point = metric(rows, fit);
  const groups = [...new Set(rows.map(row => row.playerId))].map(playerId => rows.filter(row => row.playerId === playerId));
  let state = 0x504835; const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
  const maes: number[] = [], biases: number[] = [];
  for (let replicate = 0; replicate < 1_000; replicate++) {
    const sample = Array.from({ length: groups.length }, () => groups[Math.floor(random() * groups.length)]).flat();
    const result = metric(sample, fit); maes.push(result.maePp); biases.push(result.signedBiasPp);
  }
  return { ...point, playerClusteredBootstrap: { replicates: 1_000, maePp95: [percentile(maes, 0.025), percentile(maes, 0.975)], signedBiasPp95: [percentile(biases, 0.025), percentile(biases, 0.975)] } };
}
function stratify(rows: ShadowRow[], fit: Fit, name: string, value: (row: ShadowRow) => string) {
  const buckets = new Map<string, ShadowRow[]>();
  for (const row of rows) buckets.set(value(row), [...(buckets.get(value(row)) ?? []), row]);
  return Object.fromEntries([...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, metric(values, fit)]));
}
function candidateFits(training: ShadowRow[], unit: Unit) {
  if (unit === "D") return [rawAffine(training, unit), dMarketBridge(training)];
  return [rawAffine(training, unit), centeredStatusAffine(training, unit)];
}
function rolling(rows: ShadowRow[], unit: Unit) {
  const folds = [
    { name: "2023-24 to 2024-25", training: ["train"], evaluation: "validation" },
    { name: "2023-25 to spent 2025-26", training: ["train", "validation"], evaluation: "holdout" },
  ] as const;
  return folds.map((fold, index) => {
    const training = rows.filter(row => row.unit === unit && (fold.training as readonly ShadowRow["partition"][]).includes(row.partition));
    const evaluation = rows.filter(row => row.unit === unit && row.partition === fold.evaluation);
    const fits = candidateFits(training, unit);
    if (unit !== "D" && index > 0) {
      const priorFit = rawAffine(rows.filter(row => row.unit === unit && row.partition === "train"), unit);
      const priorEvaluation = rows.filter(row => row.unit === unit && row.partition === "validation");
      const priorResidual = mean(priorEvaluation.map(row => priorFit.predict(row) - row.targetCapSharePp));
      fits.push(shiftedIntercept(rawAffine(training, unit), unit, -priorResidual));
    }
    return { ...fold, results: fits.map(fit => ({ name: fit.name, features: fit.features, metric: playerClusteredMetric(evaluation, fit) })) };
  });
}
function stable(results: ReturnType<typeof rolling>, model: string) {
  const matches = results.map(fold => fold.results.find(result => result.name === model));
  if (matches.some(value => value == null)) return false;
  const metrics = matches.map(value => value!.metric);
  return metrics.every(value => value.rankCorrelation > 0 && value.slope >= 0.7 && value.slope <= 1.3 && Math.abs(value.signedBiasPp) <= 0.25);
}
function failureCause(unit: Unit, rollingResults: ReturnType<typeof rolling>) {
  const raw = rollingResults.map(fold => fold.results.find(result => result.name === `${unit}-raw-affine`)!.metric);
  if (unit === "D") {
    const bridge = rollingResults.map(fold => fold.results.find(result => result.name === "D-market-bridge-v1")!.metric);
    const rawDirection = raw.map(value => value.rankCorrelation);
    const bridgeDirection = bridge.map(value => value.rankCorrelation);
    return {
      rawDirection, bridgeDirection,
      finding: bridgeDirection.every(value => value > 0) && bridge.some((value, index) => value.maePp < raw[index].maePp)
        ? "The narrow D raw signal is insufficient for total market price; the broader pre-signing bridge adds usable market information."
        : "The underlying D raw signal has no stable positive market relationship; a broader bridge did not establish a stable replacement.",
    };
  }
  const conditional = rollingResults.map(fold => fold.results.find(result => result.name === `${unit}-raw-affine-status-mean`)!.metric);
  return {
    rawBias: raw.map(value => value.signedBiasPp), conditionalBias: conditional.map(value => value.signedBiasPp),
    finding: conditional.every(value => Math.abs(value.signedBiasPp) <= Math.abs(raw[conditional.indexOf(value)].signedBiasPp))
      ? "The error is primarily conditional on signing status; a centered status correction reduces rolling bias."
      : "The error is primarily an intercept/calibration problem; status conditioning does not reduce rolling bias consistently.",
  };
}
function checksum(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function runPhase5Remediation() {
  const rows = buildShadowRows();
  const spentHoldoutRows = rows.filter(row => row.partition === "holdout");
  const output = {
    schemaVersion: 1,
    certification: { spentHoldout: { rows: spentHoldoutRows.length, status: "development_only_spent", rule: "Never use these rows for future certification or model selection after this remediation report." } },
    coverage: Object.fromEntries(DEVELOPMENT_PERIODS.map(period => [period, rows.filter(row => row.partition === period).length])),
    diagnostics: Object.fromEntries(units.map(unit => {
      const all = rows.filter(row => row.unit === unit);
      const fit = rawAffine(rows.filter(row => row.partition !== "holdout"), unit);
      return [unit, {
        model: fit.name,
        spentDevelopmentMetric: metric(all, fit),
        residuals: {
          signingYear: stratify(all, fit, "signingYear", row => String(row.signingYear)), ageBand: stratify(all, fit, "ageBand", row => row.ageBand),
          status: stratify(all, fit, "status", row => row.status), term: stratify(all, fit, "term", row => row.termYears == null ? "missing" : String(row.termYears)),
          structure: stratify(all, fit, "structure", row => row.structure), team: stratify(all, fit, "team", row => row.team), role: stratify(all, fit, "role", row => row.role),
        },
      }];
    })),
    rolling: Object.fromEntries(units.map(unit => {
      const results = rolling(rows, unit);
      const candidates = [...new Set(results.flatMap(fold => fold.results.map(result => result.name)))];
      return [unit, { results, causes: failureCause(unit, results), readyForFrozenHoldout: candidates.some(model => stable(results, model)), candidateReadiness: Object.fromEntries(candidates.map(model => [model, stable(results, model)])) }];
    })),
    nextCertificationMinimum: { contracts: 120, players: 90, byPosition: { F: 50, D: 30, G: 15 }, note: "New, never-developed rows only; the existing 651 spent holdout is excluded." },
    historicalData: { localPre2022MoneyPuckSkaters: "absent", required: "ID-bearing skater-season rows with position, all-situations exposure and pre-signing market-bridge inputs for 2017-18 through 2021-22", forwardTimeConfirmation: "Retain the 2026-27 signing cohort as the strongest forward-time confirmation before unrestricted activation." },
  };
  const report = { ...output, checksum: checksum(output) };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/backtest/nav-phase5-remediation.ts")) {
  try { console.log(JSON.stringify(runPhase5Remediation(), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
