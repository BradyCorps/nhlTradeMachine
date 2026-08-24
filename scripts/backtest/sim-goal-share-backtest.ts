import fs from "fs";
import path from "path";
import { derivePlayerRoles, type PlayerRoleKey } from "../../app/lib/player-roles";
import { simGoalShare } from "../../app/lib/sim-goal-share";

// SIM-P1-6 model gate
//
// The production coefficients were fit on the first two year-over-year pairs
// (2022-23→2023-24 and 2023-24→2024-25). This script evaluates those frozen
// coefficients on the untouched 2024-25→2025-26 pair. A sample's role, xG
// anchor, even-strength line, PP unit, and TOI all come from season N; the
// target is that same player's real goals / (goals + assists) in season N+1.
// Lines are inferred from team 5-on-5 TOI (12F/6D), and PP1/PP2 from 5-on-4
// TOI (4F/1D per unit), matching the simulator's lineup shapes.

type Row = Record<string, string>;

interface SeasonRow {
  playerId: string;
  season: number;
  team: string;
  position: string;
  gp: number;
  points: number;
  goals: number;
  xGoals: number;
  avgTOI: number;
  evenStrengthTOI: number;
  powerPlayTOI: number;
  role: PlayerRoleKey | null;
  line: number | null;
  powerPlayUnit: 1 | 2 | null;
}

const ROOT = path.resolve(__dirname, "../..");
const FILES = [
  "MoneyPuckData/2022_23/skaters(3).csv",
  "MoneyPuckData/2023_24/skaters(2).csv",
  "MoneyPuckData/2024_25/skaters(1).csv",
  "MoneyPuckData/2025_26/skaters.csv",
];

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function readCsv(relativePath: string): Row[] {
  const lines = fs.readFileSync(path.join(ROOT, relativePath), "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = parseCsvLine(lines[0].replace(/^\uFEFF/, ""));
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

const finite = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function loadSeason(relativePath: string): SeasonRow[] {
  const rows = readCsv(relativePath);
  const byPlayer = new Map<string, Map<string, Row>>();
  for (const row of rows) {
    const playerId = row.playerId;
    if (!playerId) continue;
    const situations = byPlayer.get(playerId) ?? new Map<string, Row>();
    situations.set(row.situation, row);
    byPlayer.set(playerId, situations);
  }

  const seasonRows: SeasonRow[] = [];
  for (const [playerId, situations] of byPlayer) {
    const all = situations.get("all");
    if (!all || all.position === "G") continue;
    const gp = finite(all.games_played);
    const goals = finite(all.I_F_goals);
    const assists = finite(all.I_F_primaryAssists) + finite(all.I_F_secondaryAssists);
    const points = goals + assists;
    if (gp < 20 || points < 10) continue;

    const evenStrength = situations.get("5on5");
    const powerPlay = situations.get("5on4");
    const penaltyKill = situations.get("4on5");
    const ice = finite(all.icetime);
    const shifts = finite(all.I_F_shifts);
    const dzStarts = finite(all.I_F_dZoneShiftStarts);
    const xgRel = (finite(all.onIce_xGoalsPercentage) - finite(all.offIce_xGoalsPercentage)) * 100;
    const pace = (value: number) => (value / gp) * 82;
    const role = derivePlayerRoles({
      position: all.position,
      games: gp,
      ptsPace: pace(points),
      goalsPace: pace(goals),
      assistsPace: pace(assists),
      baselineIxg82: pace(finite(all.I_F_xGoals)),
      ppPtsPace82: pace(finite(powerPlay?.I_F_points)),
      pkTimeShare: ice > 0 ? finite(penaltyKill?.icetime) / ice : null,
      xgRelTM: Number.isFinite(xgRel) ? xgRel : null,
      baselineHits82: pace(finite(all.I_F_hits)),
      baselineBlocks82: pace(finite(all.shotsBlockedByPlayer)),
      dzPct: shifts > 0 ? dzStarts / shifts : null,
      avgTOI: ice / gp / 60,
    })?.primary.key ?? null;

    seasonRows.push({
      playerId,
      season: finite(all.season),
      team: all.team,
      position: all.position,
      gp,
      points,
      goals,
      xGoals: finite(all.I_F_xGoals),
      avgTOI: ice / gp / 60,
      evenStrengthTOI: finite(evenStrength?.icetime) / gp / 60,
      powerPlayTOI: finite(powerPlay?.icetime) / gp / 60,
      role,
      line: null,
      powerPlayUnit: null,
    });
  }

  const byTeam = new Map<string, SeasonRow[]>();
  for (const row of seasonRows) {
    const roster = byTeam.get(row.team) ?? [];
    roster.push(row);
    byTeam.set(row.team, roster);
  }
  for (const roster of byTeam.values()) {
    for (const position of ["F", "D"] as const) {
      const group = roster
        .filter((row) => position === "D" ? row.position === "D" : row.position !== "D")
        .sort((a, b) => b.evenStrengthTOI - a.evenStrengthTOI);
      const activeLimit = position === "D" ? 6 : 12;
      const unitSize = position === "D" ? 2 : 3;
      group.slice(0, activeLimit).forEach((row, index) => {
        row.line = Math.floor(index / unitSize) + 1;
      });

      const ppSlots = position === "D" ? 2 : 8;
      const ppUnitSize = position === "D" ? 1 : 4;
      group
        .filter((row) => row.powerPlayTOI > 0)
        .sort((a, b) => b.powerPlayTOI - a.powerPlayTOI)
        .slice(0, ppSlots)
        .forEach((row, index) => {
          row.powerPlayUnit = (Math.floor(index / ppUnitSize) + 1) as 1 | 2;
        });
    }
  }
  return seasonRows;
}

const seasons = FILES.flatMap(loadSeason);
const bySeason = new Map<number, Map<string, SeasonRow>>();
for (const row of seasons) {
  const players = bySeason.get(row.season) ?? new Map<string, SeasonRow>();
  players.set(row.playerId, row);
  bySeason.set(row.season, players);
}

interface Sample {
  input: SeasonRow;
  actualGoalShare: number;
  weight: number;
  targetSeason: number;
}

const samples: Sample[] = [];
for (const input of seasons) {
  const next = bySeason.get(input.season + 1)?.get(input.playerId);
  if (!next || next.gp < 20 || next.points < 10) continue;
  samples.push({
    input,
    actualGoalShare: next.goals / next.points,
    weight: Math.min(next.points, 82),
    targetSeason: next.season,
  });
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const baseline = (row: SeasonRow) => row.position === "D"
  ? 0.24
  : clamp(row.xGoals / Math.max(row.points, 1), 0.22, 0.55);

type OmittedSignal = "role" | "line" | "pp" | "toi";

function modelPrediction(sample: Sample, omitted?: OmittedSignal): number {
  const row = sample.input;
  return simGoalShare({
    position: row.position,
    anchorGoalShare: baseline(row),
    role: omitted === "role" ? null : row.role,
    line: omitted === "line" ? null : row.line,
    powerPlayUnit: omitted === "pp" ? null : row.powerPlayUnit,
    avgTOI: omitted === "toi" ? null : row.avgTOI,
  });
}

interface Metrics {
  mae: number;
  meanPrediction: number;
  meanActual: number;
}

function metrics(data: Sample[], prediction: (sample: Sample) => number): Metrics {
  const totals = data.reduce((acc, sample) => {
    const predicted = prediction(sample);
    acc.error += sample.weight * Math.abs(predicted - sample.actualGoalShare);
    acc.prediction += sample.weight * predicted;
    acc.actual += sample.weight * sample.actualGoalShare;
    acc.weight += sample.weight;
    return acc;
  }, { error: 0, prediction: 0, actual: 0, weight: 0 });
  return {
    mae: totals.error / totals.weight,
    meanPrediction: totals.prediction / totals.weight,
    meanActual: totals.actual / totals.weight,
  };
}

const train = samples.filter((sample) => sample.targetSeason <= 2024);
const holdout = samples.filter((sample) => sample.targetSeason === 2025);
const training = metrics(train, modelPrediction);
const rawBaseline = metrics(holdout, (sample) => baseline(sample.input));
const calibrated = metrics(holdout, modelPrediction);
const ablations = Object.fromEntries(
  (["role", "line", "pp", "toi"] as const).map((signal) => [
    signal,
    metrics(holdout, (sample) => modelPrediction(sample, signal)),
  ]),
) as Record<OmittedSignal, Metrics>;
const relativeLift = (rawBaseline.mae - calibrated.mae) / rawBaseline.mae;

console.log("SIM-P1-6 goal-share backtest");
console.log(`training pairs: ${train.length}; frozen-model MAE: ${training.mae.toFixed(5)}`);
console.log(`holdout pairs: ${holdout.length} (2024-25 inputs → 2025-26 results)`);
console.log(`raw xG/points baseline MAE: ${rawBaseline.mae.toFixed(5)}`);
console.log(`calibrated model MAE:       ${calibrated.mae.toFixed(5)} (${(relativeLift * 100).toFixed(1)}% better)`);
console.log(`holdout mean goal share: actual ${calibrated.meanActual.toFixed(4)}, predicted ${calibrated.meanPrediction.toFixed(4)}`);
for (const signal of ["role", "line", "pp", "toi"] as const) {
  console.log(`without ${signal.padEnd(4)}: MAE ${ablations[signal].mae.toFixed(5)}`);
}

const failures: string[] = [];
if (train.length < 900 || holdout.length < 400) failures.push("insufficient train/holdout sample");
if (relativeLift < 0.10) failures.push("holdout MAE lift is below 10%");
if (Math.abs(calibrated.meanPrediction - calibrated.meanActual) > 0.01) {
  failures.push("holdout mean goal share misses actual by more than 1 percentage point");
}
for (const signal of ["role", "line", "pp", "toi"] as const) {
  if (calibrated.mae >= ablations[signal].mae) failures.push(`${signal} does not improve holdout MAE`);
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.join("; ")}`);
  process.exitCode = 1;
} else {
  console.log("PASS: frozen model clears accuracy, calibration, and signal-ablation gates");
}
