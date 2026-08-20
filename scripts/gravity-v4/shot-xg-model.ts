// ── Gravity v4 — shot expected-goals model (the common currency) ─
//
// Every v4 zone fit values events in expected goals (spec §3.3), but the
// reconstructed stint shots carry only coordinates and a kind — no xG. This
// module is the currency: a small, calibrated logistic that turns a shot's
// location into P(goal). It is fit from the season's own unblocked shots
// (`fit-shot-xg.ts`), so v4 depends on no external xG feed.
//
// ORIENTATION-FREE BY CONSTRUCTION. The NHL rink frame flips ends each period
// and by home/away, and getting that wrong is the classic xG bug. We sidestep
// it: distance and angle are measured to the NEARER goal line (|x| → 89 ft),
// which is the net the shot is actually toward for the overwhelming majority of
// attempts. A shot flung from the far side is rare and low-value either way, so
// the assumption costs almost nothing and removes a whole class of error.
//
// Pure and dependency-free so it unit-tests without the dataset or a network.

/** NHL goal line is 89 ft from centre; the net is on it at y = 0. */
const GOAL_LINE_X = 89;

export interface ShotInput {
  xCoord: number | null;
  yCoord: number | null;
  kind: "goal" | "shot-on-goal" | "missed-shot" | "blocked-shot";
}

export interface ShotFeatures {
  /** Straight-line feet from the shot to the nearer net. */
  distance: number;
  /** Radians off the goal's centre line (0 = dead ahead), in [0, π/2]. */
  angle: number;
}

/** Location features for one shot, or null when the coordinates are unusable.
 *  Blocked shots are excluded: the NHL frame records them at the BLOCKER, not
 *  the shooter, so their coordinates do not describe the scoring chance. */
export function shotFeatures(shot: ShotInput): ShotFeatures | null {
  if (shot.kind === "blocked-shot") return null;
  if (shot.xCoord == null || shot.yCoord == null) return null;
  const dx = GOAL_LINE_X - Math.abs(shot.xCoord);   // 0 at the goal line
  const dy = shot.yCoord;
  const distance = Math.sqrt(dx * dx + dy * dy);
  // atan2(|y|, dx): 0 straight on; grows toward π/2 along the goal line. Shots
  // from behind the net (dx < 0) fold to the same shallow-angle regime.
  const angle = Math.atan2(Math.abs(dy), Math.max(0, dx));
  return { distance, angle };
}

// ── Logistic regression (standardized features, L2, gradient descent) ──

export interface XgModel {
  /** Feature means/sds used to standardize at fit time — applied on predict. */
  mean: number[];
  sd: number[];
  /** Weights for the standardized features, then the bias as the last entry. */
  weights: number[];
  bias: number;
  featureNames: string[];
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** [distance, angle, distance², distance·angle] — enough curvature for a
 *  location model without inviting overfit; the calibration report is the check. */
export function featureVector(f: ShotFeatures): number[] {
  return [f.distance, f.angle, f.distance * f.distance, f.distance * f.angle];
}
const FEATURE_NAMES = ["distance", "angle", "distance^2", "distance*angle"];

export interface FitOptions {
  iterations?: number;
  learningRate?: number;
  /** L2 penalty on the standardized weights (not the bias). */
  l2?: number;
}

export function fitLogistic(rows: number[][], labels: number[], opts: FitOptions = {}): XgModel {
  const iterations = opts.iterations ?? 3000;
  const lr = opts.learningRate ?? 0.3;
  const l2 = opts.l2 ?? 1e-3;
  const n = rows.length;
  const p = rows[0]?.length ?? 0;
  if (n === 0 || p === 0) throw new Error("fitLogistic: empty design matrix");

  // Standardize each column (conditioning; stored for predict).
  const mean = new Array(p).fill(0), sd = new Array(p).fill(0);
  for (const r of rows) for (let j = 0; j < p; j++) mean[j] += r[j] / n;
  for (const r of rows) for (let j = 0; j < p; j++) sd[j] += (r[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = rows.map(r => r.map((v, j) => (v - mean[j]) / sd[j]));

  const w = new Array(p).fill(0);
  let b = Math.log((labels.reduce((a, y) => a + y, 0) + 0.5) / (n - labels.reduce((a, y) => a + y, 0) + 0.5)); // log-odds prior
  for (let it = 0; it < iterations; it++) {
    const gw = new Array(p).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < p; j++) z += w[j] * Z[i][j];
      const err = sigmoid(z) - labels[i];
      gb += err; for (let j = 0; j < p; j++) gw[j] += err * Z[i][j];
    }
    b -= lr * gb / n;
    for (let j = 0; j < p; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
  }
  return { mean, sd, weights: w, bias: b, featureNames: FEATURE_NAMES };
}

/** P(goal) for one shot, or null when the shot has no usable location. */
export function predictXg(model: XgModel, shot: ShotInput): number | null {
  const f = shotFeatures(shot);
  if (!f) return null;
  const x = featureVector(f);
  let z = model.bias;
  for (let j = 0; j < x.length; j++) z += model.weights[j] * ((x[j] - model.mean[j]) / model.sd[j]);
  return sigmoid(z);
}

// ── Diagnostics ──────────────────────────────────────────────────

/** Area under the ROC curve via the Mann–Whitney U statistic. 0.5 = coin flip. */
export function auc(scores: number[], labels: number[]): number {
  const pos: number[] = [], neg: number[] = [];
  for (let i = 0; i < scores.length; i++) (labels[i] ? pos : neg).push(scores[i]);
  if (pos.length === 0 || neg.length === 0) return NaN;
  // Rank-sum: average ranks handle ties.
  const all = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  let rankSumPos = 0;
  for (let i = 0; i < all.length;) {
    let j = i; while (j + 1 < all.length && all[j + 1].s === all[i].s) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (all[k].y) rankSumPos += avgRank;
    i = j + 1;
  }
  return (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

export interface CalibrationBin { predicted: number; observed: number; n: number }

/** Deciles of predicted xG vs observed goal rate — the honesty check. A
 *  calibrated model has predicted ≈ observed in every bin. */
export function calibration(scores: number[], labels: number[], bins = 10): CalibrationBin[] {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]);
  const out: CalibrationBin[] = [];
  const size = Math.ceil(idx.length / bins);
  for (let b = 0; b < bins; b++) {
    const slice = idx.slice(b * size, (b + 1) * size);
    if (slice.length === 0) continue;
    out.push({
      predicted: slice.reduce((a, i) => a + scores[i], 0) / slice.length,
      observed: slice.reduce((a, i) => a + labels[i], 0) / slice.length,
      n: slice.length,
    });
  }
  return out;
}
