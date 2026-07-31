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

const design = (d: Rec) => [1, ...FEATURES.map(f => d[f])];
const predict = (b: number[], d: Rec) => design(d).reduce((s, x, i) => s + x * b[i], 0);

function metrics(data: Rec[], b: number[]) {
  const my = data.reduce((s, d) => s + d.y, 0) / data.length;
  const ss = data.reduce((s, d) => s + (d.y - predict(b, d)) ** 2, 0);
  const tt = data.reduce((s, d) => s + (d.y - my) ** 2, 0);
  return {
    n: data.length,
    r2: 1 - ss / tt,
    maeCapPct: data.reduce((s, d) => s + Math.abs(d.y - predict(b, d)), 0) / data.length,
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
    const full = ols(rows.map(design), rows.map(d => d.y));
    const trained = ols(train.map(design), train.map(d => d.y));
    const walk = metrics(test, trained);

    const domainOf = (f: Feature) => {
      const v = rows.map(d => d[f]).sort((a, b) => a - b);
      const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
      return { min: round(v[0]), p5: round(q(0.05)), p50: round(q(0.5)), p95: round(q(0.95)), max: round(v[v.length - 1]) };
    };

    models[unit] = {
      n: rows.length,
      intercept: round(full[0]),
      coefficients: Object.fromEntries(FEATURES.map((f, i) => [f, round(full[i + 1])])),
      featureDomain: Object.fromEntries(FEATURES.map(f => [f, domainOf(f)])),
      validation: {
        walkForward: {
          trainN: train.length,
          testN: walk.n,
          r2: round(walk.r2, 4),
          maeCapPct: round(walk.maeCapPct, 5),
          maeDollarsAt104MCap: round(walk.maeCapPct * 104, 3),
        },
        inSample: { n: rows.length, r2: round(metrics(rows, full).r2, 4) },
      },
    };
    summary.push(`  ${unit}: n=${rows.length}  train ${train.length}/test ${walk.n}  R2 ${walk.r2.toFixed(3)}  MAE $${(walk.maeCapPct * 104).toFixed(2)}M`);
  }

  const dates = data.map(d => d.date).sort();
  const artifact = {
    schemaVersion: "skater-fmv-v1",
    generatedAt: new Date().toISOString(),
    generationCommand: "npx tsx scripts/skater-fmv/build.ts",
    target: {
      variable: "capPct",
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
      form: "ordinary least squares per position group, capPct ~ 1 + pts60 + toi + age + ufa",
      splitByPosition: "Forwards and defencemen are fitted separately. Pooled scores the same on mean error, but a defenceman is paid more for minutes (toi 0.105 vs 0.090) and less for points (pts60 0.016 vs 0.020), and one shared slope cannot say that.",
      features: {
        pts60: "Points per sixty minutes of ice over the last 3 finished seasons.",
        toi: "Latest finished season's minutes per game against a 20-minute reference, capped at 1.6.",
        age: "Age at signing.",
        ufa: "1 when signed as an unrestricted free agent, 0 when restricted.",
      },
      byPosition: models,
    },
    walkForwardSplit: WALK_FORWARD_SPLIT,
    excludedFeatures: {
      term: "Excluded, and the reason replicates the goalie fit exactly. Term correlates 0.78 with cap hit here and lifts walk-forward R² from 0.61 to 0.78 — but it is endogenous, negotiated jointly with AAV, and including it flips the UFA coefficient from +0.0036 to -0.0012, which would mean unrestricted free agents cost less than restricted ones. Two independent populations showing the same artefact is not a judgement call.",
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
