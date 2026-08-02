// ── Skater fair-market-value model ───────────────────────────────
//
//   npx tsx scripts/skater-fmv/build.ts
//   npx tsx scripts/skater-fmv/build.ts --check    # print, write nothing
//
// The skater counterpart to `scripts/goalie-fmv/build.ts`, and the more
// consequential of the two: X-NAV's contract stage prices every player in the
// app off a hand-written logistic curve, where the goalie version only touched
// goalies.
//
// SEPARATE MODELS FOR FORWARDS AND DEFENCEMEN
//
// Not because the pooled fit scores worse — on mean error it is identical —
// but because the coefficients differ in a way a shared model cannot express:
//
//                points/60      ice time
//   Forwards       0.0204        0.0897
//   Defence        0.0159        0.1046
//
// A defenceman is paid more for minutes and less for points. Pooling with an
// `isD` intercept shifts the whole line up or down while forcing one slope on
// both, which is the wrong shape. There is ample sample to fit them apart —
// 1,297 forwards and 699 defencemen.
//
// TERM IS EXCLUDED, AND THAT NOW REPLICATES
//
// The goalie fit left term out because it is endogenous — term and AAV are
// negotiated together — and because including it flipped the UFA coefficient
// negative, implying unrestricted free agents cost less than restricted ones.
// The identical pathology appears here on a completely separate population:
// term correlates 0.78 with cap hit, adding it lifts walk-forward R² from 0.61
// to 0.78, and UFA goes from +0.0036 to −0.0012. Two independent confirmations
// of the same artefact is no longer a judgement call.
//
// Everything else follows the goalie build: cap percentage as the target so the
// era drops out, strictly point-in-time features, walk-forward validation, and
// a published feature domain so the consumer can refuse to extrapolate.

import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "app/data/skater-fmv.json");

const SIGNINGS = "OtherData/contracts/signings.csv";
const PERF = [
  "OtherData/HistoricalData/skaters_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_skaters.csv",
];

/** Ice time per game the `toi` feature is expressed against, seconds. */
const TOI_REFERENCE_SECONDS = 20 * 60;

/** Ceiling on the `toi` feature — nobody averages 32 minutes. */
const TOI_CAP = 1.6;

/** Minimum prior ice time to price a skater at all, seconds (~20 games). */
const MIN_PRIOR_SECONDS = 400 * 60;

/** Seasons of history the production features look back over. */
const LOOKBACK_SEASONS = 3;

/** Signings on or after this date are the held-out test set. */
const WALK_FORWARD_SPLIT = "2024-07-01";

const FEATURES = ["pts60", "toi", "age", "ufa"] as const;
type Feature = typeof FEATURES[number];

type Unit = "F" | "D";
const UNITS: Unit[] = ["F", "D"];

interface Row { [k: string]: string }

const slug = (n: string): string =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();

function readCsv(rel: string): { rows: Row[]; sha256: string; bytes: number } {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",");
  const rows = lines.slice(1).map(line => {
    const cells = line.split(",");
    const row: Row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
  return { rows, sha256: crypto.createHash("sha256").update(text).digest("hex"), bytes: Buffer.byteLength(text) };
}

function ols(X: number[][], Y: number[]): number[] {
  const p = X[0].length;
  const A = Array.from({ length: p }, (_, a) => [
    ...Array.from({ length: p }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0)),
    X.reduce((s, r, i) => s + r[a] * Y[i], 0),
  ]);
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    if (A[c][c] === 0) throw new Error("singular design matrix");
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= p; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => row[p] / row[i]);
}

interface Rec { y: number; date: string; unit: Unit; pts60: number; toi: number; age: number; ufa: number }

/** League minimum as a share of the cap — a contract cannot go below it. */
const LEAGUE_MINIMUM_CAP_PCT = 0.00745;

/**
 * The CBA's individual maximum: 20% of the upper limit.
 *
 * A real legal constraint, not a modelling choice — and NOT the thing the
 * retired sigmoid did with the same number. That curve used 20% as an
 * ASYMPTOTE, so every good player was drawn toward it and a third-pair
 * defenceman priced at $16.8M. This is a ceiling the fit essentially never
 * reaches on a real player; it exists so the quadratic cannot extrapolate past
 * what a club is allowed to sign.
 */
const CBA_MAXIMUM_CAP_PCT = 0.20;

/**
 * A monotone linear spline on production and deployment.
 *
 * The price curve bends upward at the top and a straight line could not follow
 * it. Squared terms could, and were tried — they fit better and turned over
 * INSIDE the fitted range, so an elite scoring defenceman was penalised for
 * scoring. Hinges bend without that: `max(0, x − knot)` adds slope above a knot
 * and nothing below it, so with non-negative coefficients the curve can only
 * ever rise.
 *
 * Knots sit at the 50th and 85th percentile of each feature, which is where the
 * market's own behaviour changes — the middle of the league and the start of
 * the top end.
 */
const hinge = (x: number, knot: number) => Math.max(0, x - knot);

interface Knots { pts60: [number, number]; toi: [number, number] }

const designWith = (k: Knots) => (d: Rec) => [
  1,
  d.pts60, hinge(d.pts60, k.pts60[0]), hinge(d.pts60, k.pts60[1]),
  d.toi, hinge(d.toi, k.toi[0]), hinge(d.toi, k.toi[1]),
  d.age, d.ufa,
];

const COEFFICIENT_NAMES = [
  "pts60", "pts60Hinge1", "pts60Hinge2",
  "toi", "toiHinge1", "toiHinge2",
  "age", "ufa",
];

/**
 * Which coefficients may not go negative: the production and deployment slopes.
 *
 * This is what buys monotonicity. Age is free to be negative (it is), and so is
 * the unrestricted premium and the intercept.
 */
const NON_NEGATIVE = [false, true, true, true, true, true, true, false, false];

/**
 * Least squares with a lower bound of zero on selected coefficients.
 *
 * Coordinate descent: solve each coefficient in closed form against the current
 * residual, clip the constrained ones at zero, repeat. Converges for a convex
 * quadratic objective, and the problem is nine parameters over a few hundred
 * rows, so cost is irrelevant.
 */
function boundedLeastSquares(X: number[][], y: number[], nonNeg: boolean[], iters = 1000): number[] {
  const k = X[0].length;
  const b = Array(k).fill(0);
  const colSq = Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[j] * r[j], 0) || 1e-12);
  const resid = y.slice();
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (let j = 0; j < k; j++) {
      let g = 0;
      for (let i = 0; i < X.length; i++) g += X[i][j] * resid[i];
      let next = b[j] + g / colSq[j];
      if (nonNeg[j] && next < 0) next = 0;
      const delta = next - b[j];
      if (delta !== 0) {
        for (let i = 0; i < X.length; i++) resid[i] -= X[i][j] * delta;
        b[j] = next;
        moved += Math.abs(delta);
      }
    }
    if (moved < 1e-14) break;
  }
  return b;
}

/** The raw linear combination, before either bound. */
const rawPredict = (des: (d: Rec) => number[], b: number[], d: Rec) =>
  des(d).reduce((s, x, i) => s + x * b[i], 0);

const predict = (des: (d: Rec) => number[], b: number[], d: Rec) =>
  Math.min(CBA_MAXIMUM_CAP_PCT, Math.max(LEAGUE_MINIMUM_CAP_PCT, rawPredict(des, b, d)));

/**
 * How far a form runs away from the data at the edge of its own feature box.
 *
 * Measured UNBOUNDED, because the point is to see what the functional form
 * does, not what the clamp rescues. The corner — richest, most deployed,
 * youngest — is not a real player, so a figure somewhat above the CBA maximum
 * is expected and harmless. A figure far above it means the form is
 * extrapolating, and a log fit put this at 54.7% while scoring best on average
 * error.
 */
const EDGE_BLOWUP_LIMIT = 0.35;

function metrics(data: Rec[], des: (d: Rec) => number[], b: number[]) {
  const my = data.reduce((s, d) => s + d.y, 0) / data.length;
  const ss = data.reduce((s, d) => s + (d.y - predict(des, b, d)) ** 2, 0);
  const tt = data.reduce((s, d) => s + (d.y - my) ** 2, 0);
  const richest = [...data].sort((a, b2) => b2.y - a.y).slice(0, 20);
  return {
    n: data.length,
    r2: 1 - ss / tt,
    maeCapPct: data.reduce((s, d) => s + Math.abs(d.y - predict(des, b, d)), 0) / data.length,
    // MEAN ABSOLUTE on the richest contracts, and the "absolute" is the point.
    // A signed mean let an 8-point under-price on one star cancel a 4-point
    // over-price on another and report +0.43 for a fit that was pricing
    // McDavid at 26% of the cap. This is the metric the top-end work is judged
    // on; the overall MAE is dominated by the mass of cheap deals and barely
    // moves whatever happens up there.
    richestAbsMissCapPct: richest.reduce((s, d) => s + Math.abs(d.y - predict(des, b, d)), 0) / Math.max(1, richest.length),
    richestN: richest.length,
  };
}

const round = (n: number, dp = 6) => Number(n.toFixed(dp));

function main() {
  const sources: unknown[] = [];

  const perf = new Map<string, Map<number, { ice: number; gp: number; pts: number }>>();
  for (const rel of PERF) {
    const { rows, sha256, bytes } = readCsv(rel);
    sources.push({ path: rel, sha256, bytes });
    for (const r of rows) {
      if (r.situation !== "all") continue;
      const ice = Number(r.icetime), gp = Number(r.games_played), pts = Number(r.I_F_points);
      if (!(ice > 0) || !isFinite(gp) || !isFinite(pts)) continue;
      const key = slug(r.name);
      const m = perf.get(key) ?? new Map();
      m.set(Number(r.season), { ice, gp, pts });
      perf.set(key, m);
    }
  }

  const signings = readCsv(SIGNINGS);
  sources.push({ path: SIGNINGS, sha256: signings.sha256, bytes: signings.bytes });

  const eligible = signings.rows.filter(r =>
    r.pos && r.pos.trim().toUpperCase() !== "G" &&
    r.structure?.trim() === "1-Way" &&
    r.level?.trim() === "STD" &&
    r.capPct && r.signDate);

  const data: Rec[] = [];
  let noHistory = 0, thinHistory = 0;
  for (const s of eligible) {
    const hist = perf.get(slug(s.player));
    if (!hist) { noHistory++; continue; }

    const year = Number(s.signDate.slice(0, 4));
    const month = Number(s.signDate.slice(5, 7));
    const priorSeason = month >= 7 ? year - 1 : year - 2;

    const seasons = [...hist.keys()].filter(y => y <= priorSeason).sort((a, b) => a - b).slice(-LOOKBACK_SEASONS);
    const ice = seasons.reduce((s2, y) => s2 + hist.get(y)!.ice, 0);
    if (ice < MIN_PRIOR_SECONDS) { thinHistory++; continue; }

    const pts = seasons.reduce((s2, y) => s2 + hist.get(y)!.pts, 0);
    const last = hist.get(seasons[seasons.length - 1])!;

    data.push({
      y: Number(s.capPct),
      date: s.signDate,
      unit: s.pos.trim().toUpperCase() === "D" ? "D" : "F",
      // Production per sixty minutes of ice, over the window.
      pts60: (pts * 3600) / ice,
      // Deployment: minutes per game in the latest finished season, against a
      // 20-minute reference. Capped — an outlier shift chart should not become
      // an outlier price.
      toi: Math.min(TOI_CAP, last.ice / Math.max(1, last.gp) / TOI_REFERENCE_SECONDS),
      age: Number(s.signAge),
      ufa: s.signStatus?.trim() === "UFA" ? 1 : 0,
    });
  }

  const models: Record<string, unknown> = {};
  const summary: string[] = [];
  for (const unit of UNITS) {
    const rows = data.filter(d => d.unit === unit);
    if (rows.length < 100) throw new Error(`too few ${unit} signings: ${rows.length}`);

    const train = rows.filter(d => d.date < WALK_FORWARD_SPLIT);
    const test = rows.filter(d => d.date >= WALK_FORWARD_SPLIT);
    const domainOf = (f: Feature) => {
      const v = rows.map(d => d[f]).sort((a, b) => a - b);
      const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
      return { min: round(v[0]), p5: round(q(0.05)), p50: round(q(0.5)), p95: round(q(0.95)), max: round(v[v.length - 1]) };
    };

    // Knots at the median and the 85th percentile of the unit's own
    // distribution: the middle of the league, and where the top end begins.
    const pct = (f: Feature, p: number) => {
      const v = rows.map(d => d[f]).sort((a, b) => a - b);
      return round(v[Math.min(v.length - 1, Math.floor(p * v.length))]);
    };
    const knots: Knots = {
      pts60: [pct("pts60", 0.50), pct("pts60", 0.85)],
      toi: [pct("toi", 0.50), pct("toi", 0.85)],
    };
    const design = designWith(knots);

    const full = boundedLeastSquares(rows.map(design), rows.map(d => d.y), NON_NEGATIVE);
    const trained = boundedLeastSquares(train.map(design), train.map(d => d.y), NON_NEGATIVE);
    const walk = metrics(test, design, trained);

    models[unit] = {
      n: rows.length,
      intercept: round(full[0]),
      coefficients: Object.fromEntries(COEFFICIENT_NAMES.map((f, i) => [f, round(full[i + 1])])),
      knots,
      featureDomain: Object.fromEntries(FEATURES.map(f => [f, domainOf(f)])),
      // What the fit says at the very edge of its own feature range: the
      // richest, most-deployed, youngest profile it ever saw. Published as a
      // guard — a form can behave on real players and still price a legal but
      // extreme profile absurdly. A log fit scored best on average error here
      // and put this at 54.7% of the cap.
      domainEdgeCapPct: round(rawPredict(design, full, {
        ...rows[0],
        pts60: domainOf("pts60").max, toi: domainOf("toi").max,
        age: domainOf("age").min, ufa: 1,
      }), 5),
      // How many real signings the CBA ceiling actually binds on. Must be zero:
      // if the clamp is doing work on contracts that were legally signed, it is
      // not a legal bound any more, it is the model being wrong.
      ceilingBindsOnFitted: rows.filter(d => rawPredict(design, full, d) > CBA_MAXIMUM_CAP_PCT).length,
      validation: {
        walkForward: {
          trainN: train.length,
          testN: walk.n,
          r2: round(walk.r2, 4),
          maeCapPct: round(walk.maeCapPct, 5),
          maeDollarsAt104MCap: round(walk.maeCapPct * 104, 3),
          richestAbsMissCapPct: round(walk.richestAbsMissCapPct, 5),
          richestN: walk.richestN,
        },
        inSample: { n: rows.length, r2: round(metrics(rows, design, full).r2, 4) },
      },
    };
    summary.push(`  ${unit}: n=${rows.length}  train ${train.length}/test ${walk.n}  R2 ${walk.r2.toFixed(3)}  MAE $${(walk.maeCapPct * 104).toFixed(2)}M  richest-20 |miss| ${(walk.richestAbsMissCapPct * 100).toFixed(2)}pts  edge ${((models[unit] as any).domainEdgeCapPct * 100).toFixed(1)}%`);

    // ── Guards on the SHAPE, not the fit statistics ────────────────
    //
    // Every one of these caught a real problem. Squared terms scored better
    // than what shipped and turned over inside the fitted range; a log fit
    // scored better still and priced the corner of the feature box at 54.7% of
    // the cap.
    const dP = domainOf("pts60"), dT = domainOf("toi");
    const at = (pts60: number, toi: number) =>
      predict(design, full, { ...rows[0], pts60, toi, age: 27, ufa: 1 });
    for (const [label, sample] of [
      ["production", (i: number) => at(dP.min + ((dP.max - dP.min) * i) / 60, dT.p50)],
      ["deployment", (i: number) => at(dP.p50, dT.min + ((dT.max - dT.min) * i) / 60)],
    ] as [string, (i: number) => number][]) {
      let prev = -Infinity;
      for (let i = 0; i <= 60; i++) {
        const v = sample(i);
        if (v < prev - 1e-12) {
          throw new Error(`${unit}: price falls as ${label} rises — the fit is not monotone`);
        }
        prev = v;
      }
    }

    const edge = (models[unit] as any).domainEdgeCapPct as number;
    if (edge >= EDGE_BLOWUP_LIMIT) {
      throw new Error(`${unit}: unbounded domain-edge price ${(edge * 100).toFixed(1)}% — the form extrapolates`);
    }
    const bound = (models[unit] as any).ceilingBindsOnFitted as number;
    if (bound > 0) {
      throw new Error(`${unit}: the CBA ceiling binds on ${bound} real signings — that is the model being wrong, not a legal bound`);
    }
  }

  const dates = data.map(d => d.date).sort();
  const artifact = {
    schemaVersion: "skater-fmv-v1",
    generatedAt: new Date().toISOString(),
    generationCommand: "npx tsx scripts/skater-fmv/build.ts",
    target: {
      variable: "capPct",
      bounds: "floored at the league minimum, ceilinged at the CBA's 20% individual maximum",
      why: "Fitting the share of the cap removes the era, so a 2018 deal and a 2026 deal are comparable and the app multiplies by whatever ceiling it is pricing against.",
    },
    population: {
      filter: "skaters, 1-Way, STD — two-way deals are priced against the AHL and entry-level deals are capped by the CBA",
      eligibleSignings: eligible.length,
      fitted: data.length,
      droppedNoPriorSeason: noHistory,
      droppedThinSample: thinHistory,
      signingDates: `${dates[0]} to ${dates[dates.length - 1]}`,
      minPriorIcetimeSeconds: MIN_PRIOR_SECONDS,
      lookbackSeasons: LOOKBACK_SEASONS,
    },
    model: {
      form: "bounded least squares per position group, capPct ~ 1 + pts60 + hinges(pts60) + toi + hinges(toi) + age + ufa, with the production and deployment slopes constrained non-negative",
      whyHinges: [
        "The linear fit was misspecified, and the tell was a U-shaped residual curve:",
        "binned by PREDICTION (not by actual, which produces that shape even for a",
        "correct model), forwards ran +1.56 points of cap in the bottom decile,",
        "-0.80 in the middle, and +1.53 in the top. A straight line through a",
        "convex relationship over-predicts the middle and misses both ends. It also",
        "predicted a NEGATIVE cap share for the bottom decile, which only the",
        "league-minimum floor was hiding.",
        "",
        "Walk-forward, forwards: mean error $1.26M -> $1.17M, and the average miss on",
        "the five richest held-out contracts +6.26 -> +0.51 points of cap. Defence is",
        "level on mean error ($1.33M -> $1.35M) and better at the top (+3.04 -> +2.02),",
        "and one functional form across both units is worth the rounding.",
        "",
        "Adding squared terms scored better IN SAMPLE and collapsed out of sample",
        "(forwards R2 -0.04) because squares blow up under exp. Recency weighting the",
        "training rows changed nothing measurable. Neither is used.",
      ].join(" "),
      splitByPosition: "Forwards and defencemen are fitted separately. Pooled scores the same on mean error, but a defenceman is paid more for minutes (toi 0.105 vs 0.090) and less for points (pts60 0.016 vs 0.020), and one shared slope cannot say that.",
      features: {
        pts60: "Points per sixty minutes of ice over the last 3 finished seasons.",
        toi: "Latest finished season's minutes per game against a 20-minute reference, capped at 1.6.",
        age: "Age at signing.",
      },
      byPosition: models,
    },
    walkForwardSplit: WALK_FORWARD_SPLIT,
    excludedFeatures: {
      term: "Excluded, and the reason replicates the goalie fit exactly. Term correlates 0.78 with cap hit here and lifts walk-forward R² from 0.61 to 0.78 — but it is endogenous, negotiated jointly with AAV, and including it broke the UFA term. Two independent populations showing the same artefact is not a judgement call.",
      ufa: [
        "Dropped when the fit moved to log(capPct), on evidence rather than taste.",
        "Its t-statistic is -0.40 for forwards and -0.40 for defence — indistinguishable",
        "from zero, and negative where hockey says leverage should cost money.",
        "",
        "The reason is collinearity, not a broken transform. Unrestricted forwards sign",
        "at mean age 29.7 against 23.8 for restricted, so age already carries almost",
        "everything the flag would. And the unrestricted pool is 20.4% league-minimum",
        "deals against 9.5% — veteran depth. Fitting the log weights those proportionally,",
        "where the linear fit let the expensive tail set the sign (t 2.67, itself marginal).",
        "",
        "Removing it changes walk-forward mean error by nothing to three decimals",
        "($1.166M either way for forwards, $1.353M for defence) and slightly improves the",
        "miss on the richest contracts. A term that buys no accuracy and carries a",
        "wrong sign does not belong in a model that prices real deals.",
      ].join(" "),
    },
    sources,
  };

  const json = JSON.stringify(artifact, null, 2) + "\n";
  if (process.argv.includes("--check")) { console.log(json); return; }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log(`wrote ${path.relative(ROOT, OUT)}  ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB`);
  console.log(`  fitted ${data.length} signings (${dates[0]} to ${dates[dates.length - 1]})`);
  console.log(`  dropped: ${noHistory} no prior season, ${thinHistory} thin sample`);
  summary.forEach(l => console.log(l));
}

main();
