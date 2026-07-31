// ── Goalie fair-market-value model ───────────────────────────────
//
//   npx tsx scripts/goalie-fmv/build.ts
//   npx tsx scripts/goalie-fmv/build.ts --check    # print, write nothing
//
// WHY
//
// The engine priced a 50-start starter with positive GSAx at an FMV of $2.71M
// off a hand-written logistic curve. That number drives the whole `cap` stage
// of G-NAV, and nothing in the repo had ever checked it against a price anyone
// actually paid. This fits it to 260 real signings instead.
//
// THE TARGET IS CAP PERCENTAGE, NOT DOLLARS
//
// A $5M deal signed in 2018 was a far larger commitment than a $5M deal signed
// today. The signings sheet carries `Cap %` at signing, which removes the cap
// era from the problem entirely — the model learns "this profile commands 4% of
// a team's cap", and the app multiplies by whatever the ceiling is that year.
//
// POINT IN TIME, STRICTLY
//
// Every feature is built from seasons that had FINISHED when the contract was
// signed. A July 2024 signing sees 2023-24 and earlier, never the season that
// followed it. Getting this wrong is the classic way a contract model scores
// well and predicts nothing.
//
// WHY TERM IS NOT A FEATURE
//
// Term is the single strongest correlate of cap hit in this data (r = 0.83),
// and on its own it out-predicts every performance feature combined. It is also
// endogenous: term and AAV are negotiated together and both reflect what the
// club thinks of the player, so predicting AAV from term is partly predicting
// the answer from the answer. Including it also flipped the UFA coefficient
// NEGATIVE — implying unrestricted free agents are cheaper than restricted
// ones, which is not true and was term absorbing the effect.
//
// So the shipped model is performance only. It is worse on paper (R² 0.55
// against 0.70) and it is the one that means something: what the market pays
// for this profile, independent of how long a deal someone talked into.
//
// OUTPUT is coefficients and validation metrics — no player rows.

import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "app/data/goalie-fmv.json");

const SIGNINGS = "OtherData/contracts/signings.csv";
const PERF = [
  "OtherData/HistoricalData/goalies_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_goalies.csv",
];

/** Ice time in a full modern starter's season, seconds. Shared with goalie-percentiles. */
const FULL_SEASON_SECONDS = 3500 * 60;

/** Year-over-year stability of GSAx/60, from the percentile artifact. */
const GSAX_STABILITY = 0.1342;

/** Minimum prior ice time to price a goalie at all (~10 starts). */
const MIN_PRIOR_SECONDS = 600 * 60;

/** Seasons of history the performance feature looks back over. */
const LOOKBACK_SEASONS = 3;

/** Signings on or after this date are the held-out test set. */
const WALK_FORWARD_SPLIT = "2024-07-01";

const FEATURES = ["gsax", "workload", "age", "ufa"] as const;
type Feature = typeof FEATURES[number];

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

// ── Linear algebra: OLS by Gauss-Jordan ──────────────────────────

function ols(X: number[][], Y: number[]): number[] {
  const p = X[0].length;
  const A = Array.from({ length: p }, (_, a) => [
    ...Array.from({ length: p }, (_, b) => X.reduce((s, r, i) => s + r[a] * r[b], 0)),
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

interface Record_ { y: number; date: string; gsax: number; workload: number; age: number; ufa: number }

const design = (d: Record_) => [1, ...FEATURES.map(f => d[f])];
const predict = (b: number[], d: Record_) => design(d).reduce((s, x, i) => s + x * b[i], 0);

function metrics(data: Record_[], b: number[]) {
  const my = data.reduce((s, d) => s + d.y, 0) / data.length;
  const ss = data.reduce((s, d) => s + (d.y - predict(b, d)) ** 2, 0);
  const tt = data.reduce((s, d) => s + (d.y - my) ** 2, 0);
  const mae = data.reduce((s, d) => s + Math.abs(d.y - predict(b, d)), 0) / data.length;
  return { n: data.length, r2: 1 - ss / tt, maeCapPct: mae };
}

const round = (n: number, dp = 6) => Number(n.toFixed(dp));

// ── Build ────────────────────────────────────────────────────────

function main() {
  const sources: unknown[] = [];

  // Goalie performance, keyed by name slug then season.
  const perf = new Map<string, Map<number, { ice: number; gsax60: number }>>();
  for (const rel of PERF) {
    const { rows, sha256, bytes } = readCsv(rel);
    sources.push({ path: rel, sha256, bytes });
    for (const r of rows) {
      if (r.situation !== "all") continue;
      const ice = Number(r.icetime), xg = Number(r.xGoals), g = Number(r.goals);
      if (!(ice > 0) || !isFinite(xg) || !isFinite(g)) continue;
      const key = slug(r.name);
      const m = perf.get(key) ?? new Map();
      m.set(Number(r.season), { ice, gsax60: ((xg - g) * 3600) / ice });
      perf.set(key, m);
    }
  }

  const signings = readCsv(SIGNINGS);
  sources.push({ path: SIGNINGS, sha256: signings.sha256, bytes: signings.bytes });

  // One-way standard deals only. A two-way contract is priced against the AHL
  // and an entry-level deal is capped by the CBA — neither is a market signal.
  const eligible = signings.rows.filter(r =>
    r.pos?.trim().toUpperCase() === "G" &&
    r.structure?.trim() === "1-Way" &&
    r.level?.trim() === "STD" &&
    r.capPct && r.signDate);

  const data: Record_[] = [];
  let noHistory = 0, thinHistory = 0;
  for (const s of eligible) {
    const hist = perf.get(slug(s.player));
    if (!hist) { noHistory++; continue; }

    // A deal signed in July or later follows the season that just ended.
    const year = Number(s.signDate.slice(0, 4));
    const month = Number(s.signDate.slice(5, 7));
    const priorSeason = month >= 7 ? year - 1 : year - 2;

    const seasons = [...hist.keys()].filter(y => y <= priorSeason).sort((a, b) => a - b).slice(-LOOKBACK_SEASONS);
    const ice = seasons.reduce((s2, y) => s2 + hist.get(y)!.ice, 0);
    if (ice < MIN_PRIOR_SECONDS) { thinHistory++; continue; }

    // Ice-weighted GSAx/60 over the window, then regressed by how much of it is
    // signal — the same reliability curve the app uses.
    const raw = seasons.reduce((s2, y) => s2 + hist.get(y)!.gsax60 * hist.get(y)!.ice, 0) / ice;
    const k = (FULL_SEASON_SECONDS * (1 - GSAX_STABILITY)) / GSAX_STABILITY;
    const gsax = raw * (ice / (ice + k));

    const last = hist.get(seasons[seasons.length - 1])!;
    data.push({
      y: Number(s.capPct),
      date: s.signDate,
      gsax,
      workload: Math.min(1, last.ice / FULL_SEASON_SECONDS),
      age: Number(s.signAge),
      ufa: s.signStatus?.trim() === "UFA" ? 1 : 0,
    });
  }

  if (data.length < 50) throw new Error(`too few fittable signings: ${data.length}`);

  const train = data.filter(d => d.date < WALK_FORWARD_SPLIT);
  const test = data.filter(d => d.date >= WALK_FORWARD_SPLIT);
  const full = ols(data.map(design), data.map(d => d.y));
  const trained = ols(train.map(design), train.map(d => d.y));

  const walk = metrics(test, trained);
  const inSample = metrics(data, full);

  // The range each feature was actually fitted over. Published because a
  // linear model asked for a value outside its training range answers
  // confidently and wrongly — feeding a RAW GSAx/60 where a reliability-
  // regressed one belongs is a factor-of-seven error that looks plausible.
  const domainOf = (f: Feature) => {
    const v = data.map(d => d[f]).sort((a, b) => a - b);
    const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    return { min: round(v[0]), p5: round(q(0.05)), p95: round(q(0.95)), max: round(v[v.length - 1]) };
  };
  const featureDomain = Object.fromEntries(FEATURES.map(f => [f, domainOf(f)]));

  const dates = data.map(d => d.date).sort();
  const artifact = {
    schemaVersion: "goalie-fmv-v1",
    generatedAt: new Date().toISOString(),
    generationCommand: "npx tsx scripts/goalie-fmv/build.ts",
    target: {
      variable: "capPct",
      why: "A $5M deal in 2018 was a bigger commitment than $5M today. Fitting the share of the cap removes the era; the app multiplies by the ceiling of the year it is pricing.",
    },
    population: {
      filter: "position G, 1-Way, STD — two-way deals are priced against the AHL and entry-level deals are capped by the CBA",
      eligibleSignings: eligible.length,
      fitted: data.length,
      droppedNoPriorSeason: noHistory,
      droppedThinSample: thinHistory,
      signingDates: `${dates[0]} to ${dates[dates.length - 1]}`,
      minPriorIcetimeSeconds: MIN_PRIOR_SECONDS,
      lookbackSeasons: LOOKBACK_SEASONS,
    },
    model: {
      form: "ordinary least squares, capPct ~ 1 + gsax + workload + age + ufa",
      features: {
        gsax: "Ice-weighted GSAx/60 over the last 3 finished seasons, regressed by its reliability (r = 0.134 at a full season).",
        workload: "Most recent finished season's ice time as a share of a full starter's season, capped at 1.",
        age: "Age at signing.",
        ufa: "1 when signed as an unrestricted free agent, 0 when restricted.",
      },
      intercept: round(full[0]),
      coefficients: Object.fromEntries(FEATURES.map((f, i) => [f, round(full[i + 1])])),
      featureDomain,
      domainNote: "Observed range of each feature across the fitted signings. `gsax` is REGRESSED, not raw — its whole span is about a tenth of a raw GSAx/60, so a caller passing a raw figure lands far outside the fit.",
    },
    validation: {
      walkForward: {
        splitDate: WALK_FORWARD_SPLIT,
        trainN: train.length,
        testN: walk.n,
        r2: round(walk.r2, 4),
        maeCapPct: round(walk.maeCapPct, 5),
        maeDollarsAt104MCap: round(walk.maeCapPct * 104, 3),
        why: "Trained only on contracts signed before the split and scored on ones signed after, so no future information reaches the fit.",
      },
      inSample: { n: inSample.n, r2: round(inSample.r2, 4) },
    },
    excludedFeatures: {
      term: "Strongest single correlate of cap hit (r = 0.83) and out-predicts every performance feature combined on its own — but endogenous. Term and AAV are negotiated together and both reflect what the club thinks of the player, so predicting AAV from term is partly predicting the answer from the answer. Including it also flipped the UFA coefficient negative, implying unrestricted free agents cost less than restricted ones, which is false and was term absorbing the effect. Adding it takes walk-forward R² from 0.55 to 0.70 and is not worth the meaning it costs.",
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
  console.log(`  walk-forward  train ${train.length} / test ${walk.n}`);
  console.log(`    R2  ${walk.r2.toFixed(3)}   MAE ${(walk.maeCapPct * 104).toFixed(2)}M at a $104M cap`);
  console.log(`  coefficients:`, Object.fromEntries(FEATURES.map((f, i) => [f, round(full[i + 1], 5)])));
}

main();
