// ── Gravity v4 — regularized adjusted plus-minus solver (pure) ───
//
// The zone fits are ridge regressions over a very sparse, very tall design:
// ~2,000 player coefficients, ~550k weighted observations, ~10 non-zeros a row.
// Forming X'X (2000² dense) is wasteful and inverting it is worse, so we solve
// the ridge normal equations
//
//     (XᵀW X + diag(λ)) β = XᵀW y
//
// by matrix-free conjugate gradient: the only thing CG needs is the product
// A·v, and A·v = Xᵀ(W (X v)) + λ∘v, which is two sparse passes over the rows.
// A is symmetric positive-definite once any λ > 0, so CG converges.
//
// Per-feature penalties (not one global λ) let the caller leave context/nuisance
// columns unpenalized while shrinking the player coefficients.
//
// Pure and dependency-free — unit-tested by recovering known coefficients.

export interface SparseObs {
  /** Feature indices with a non-zero value in this row. */
  idx: number[];
  /** The value at each index (parallel to `idx`). */
  val: number[];
  /** Response. */
  y: number;
  /** Observation weight (e.g. stint seconds). */
  w: number;
}

export interface RidgeOptions {
  maxIter?: number;
  /** Stop when the residual L2 norm falls below this. */
  tol?: number;
}

const dot = (a: Float64Array, b: Float64Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/**
 * Solve the weighted ridge normal equations by conjugate gradient.
 *
 * @param penalty per-feature λ (length nFeatures); 0 leaves a feature unpenalized.
 * @returns the fitted coefficient vector.
 */
export function solveRidgeCG(
  obs: SparseObs[],
  nFeatures: number,
  penalty: Float64Array,
  opts: RidgeOptions = {},
): Float64Array {
  const maxIter = opts.maxIter ?? 1000;
  const tol = opts.tol ?? 1e-8;

  // b = XᵀW y
  const b = new Float64Array(nFeatures);
  for (const o of obs) {
    const wy = o.w * o.y;
    for (let k = 0; k < o.idx.length; k++) b[o.idx[k]] += o.val[k] * wy;
  }

  // A·v = Xᵀ(W (X v)) + λ∘v
  const applyA = (v: Float64Array, out: Float64Array): void => {
    out.fill(0);
    for (const o of obs) {
      let d = 0;
      for (let k = 0; k < o.idx.length; k++) d += o.val[k] * v[o.idx[k]];
      const wd = o.w * d;
      for (let k = 0; k < o.idx.length; k++) out[o.idx[k]] += o.val[k] * wd;
    }
    for (let j = 0; j < nFeatures; j++) out[j] += penalty[j] * v[j];
  };

  const x = new Float64Array(nFeatures);
  const r = b.slice();                 // r = b − A·0 = b
  const p = r.slice();
  const Ap = new Float64Array(nFeatures);
  let rs = dot(r, r);
  const bNorm = Math.sqrt(dot(b, b)) || 1;

  for (let it = 0; it < maxIter; it++) {
    applyA(p, Ap);
    const alpha = rs / (dot(p, Ap) || 1e-30);
    for (let j = 0; j < nFeatures; j++) { x[j] += alpha * p[j]; r[j] -= alpha * Ap[j]; }
    const rsNew = dot(r, r);
    if (Math.sqrt(rsNew) / bNorm < tol) break;
    const beta = rsNew / rs;
    for (let j = 0; j < nFeatures; j++) p[j] = r[j] + beta * p[j];
    rs = rsNew;
  }
  return x;
}
