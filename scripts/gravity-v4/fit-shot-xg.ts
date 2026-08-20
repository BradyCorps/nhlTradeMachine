// ── Gravity v4 — fit the shot xG model from the stint dataset ─────
//
// Reads the constant-lineup stint dataset (`build-stints` output), pulls every
// unblocked 5v5 shot, fits the location logistic in `shot-xg-model.ts`, reports
// held-out calibration + AUC, and writes the coefficients that every later zone
// fit uses to value a chance in expected goals.
//
//   npx tsx scripts/gravity-v4/fit-shot-xg.ts
//   npx tsx scripts/gravity-v4/fit-shot-xg.ts --file data/gravity-v4/stints-20252026.ndjson.gz
//   npx tsx scripts/gravity-v4/fit-shot-xg.ts --all-situations   # fit on every strength, not just 5v5
//
// Output (committed — coefficients only, no player-level data):
//   data/gravity-v4/shot-xg-<season>.json
//
// Needs the gitignored stint dataset, so run it in a codespace after
// build-stints; api-web.nhle.com is not required (this reads the local file).

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { SEASON } from "../../app/lib/season-config";
import {
  shotFeatures, featureVector, fitLogistic, predictXg, auc, calibration,
  type ShotInput,
} from "./shot-xg-model";

const SCHEMA_VERSION = 1;
const OUT_DIR = path.join(process.cwd(), "data", "gravity-v4");

const args = process.argv.slice(2);
const flag = (n: string): string | null => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const season = flag("season") ?? SEASON.nhleSeasonId;
const allSituations = args.includes("--all-situations");
const file = flag("file") ?? path.join(OUT_DIR, `stints-${season}.ndjson.gz`);

interface StintShot { teamId: number; shooterId: number | null; kind: ShotInput["kind"]; sec: number; xCoord: number | null; yCoord: number | null; }
interface StintRow { gameId: number; isEven5v5: boolean; shots: StintShot[]; }

function readStints(abs: string): StintRow[] {
  if (!fs.existsSync(abs)) {
    console.error(`\n✗ No stint dataset at ${path.relative(process.cwd(), abs)}.`);
    console.error(`  Run  npx tsx scripts/gravity-v4/build-stints.ts  first (in a codespace).\n`);
    process.exit(1);
  }
  const text = zlib.gunzipSync(fs.readFileSync(abs)).toString("utf8");
  return text.split("\n").filter(Boolean).map(l => JSON.parse(l) as StintRow);
}

interface Sample { gameId: number; x: number[]; y: number }

function collect(rows: StintRow[]): Sample[] {
  const out: Sample[] = [];
  for (const row of rows) {
    if (!allSituations && !row.isEven5v5) continue;
    for (const s of row.shots) {
      const f = shotFeatures(s);
      if (!f) continue;               // blocked / no coordinates
      out.push({ gameId: row.gameId, x: featureVector(f), y: s.kind === "goal" ? 1 : 0 });
    }
  }
  return out;
}

function main() {
  console.log(`\nGravity v4 — shot xG fit · season ${season} · ${allSituations ? "all situations" : "5v5 only"}`);
  const samples = collect(readStints(file));
  if (samples.length < 500) { console.error(`\n✗ Only ${samples.length} usable shots — too few to fit.\n`); process.exit(1); }

  // Hold out whole games (not shots) so the test set shares no game context.
  const games = [...new Set(samples.map(s => s.gameId))].sort();
  const testGames = new Set(games.filter((_, i) => i % 5 === 0));   // ~20%
  const train = samples.filter(s => !testGames.has(s.gameId));
  const test = samples.filter(s => testGames.has(s.gameId));

  const model = fitLogistic(train.map(s => s.x), train.map(s => s.y));

  const scoreOf = (s: Sample) => {
    // predictXg wants a ShotInput; reuse the model's raw path via a synthetic
    // shot is unnecessary — the features are already computed, so score directly.
    let z = model.bias;
    for (let j = 0; j < s.x.length; j++) z += model.weights[j] * ((s.x[j] - model.mean[j]) / model.sd[j]);
    return 1 / (1 + Math.exp(-z));
  };
  const testScores = test.map(scoreOf), testLabels = test.map(s => s.y);
  const baseRate = samples.reduce((a, s) => a + s.y, 0) / samples.length;
  const testAuc = auc(testScores, testLabels);

  console.log(`  shots: ${samples.length} (${train.length} train / ${test.length} test) · base goal rate ${(baseRate * 100).toFixed(2)}%`);
  console.log(`  held-out AUC: ${testAuc.toFixed(4)}`);
  console.log(`\n  calibration (held-out) — predicted vs observed goal rate by decile:`);
  console.log(`    ${"pred".padStart(7)} ${"obs".padStart(7)}  n`);
  for (const b of calibration(testScores, testLabels)) {
    console.log(`    ${(b.predicted * 100).toFixed(2).padStart(6)}% ${(b.observed * 100).toFixed(2).padStart(6)}%  ${b.n}`);
  }

  // Sanity: a slot shot and a point shot, in xG.
  const slot = predictXg(model, { xCoord: 85, yCoord: 2, kind: "shot-on-goal" });
  const point = predictXg(model, { xCoord: 40, yCoord: 18, kind: "shot-on-goal" });
  console.log(`\n  sanity: slot ≈ ${(slot! * 100).toFixed(1)}% xG · point ≈ ${(point! * 100).toFixed(1)}% xG`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `shot-xg-${season}.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    season,
    fittedAt: new Date().toISOString(),
    scope: allSituations ? "all-situations" : "5v5",
    shots: samples.length,
    baseRate,
    heldOutAuc: testAuc,
    model,
  }, null, 2));
  console.log(`\n  wrote ${path.relative(process.cwd(), outFile)}`);

  if (testAuc < 0.6) console.error(`\n  ⚠ Held-out AUC ${testAuc.toFixed(3)} is weak for a location xG model — inspect coordinates/orientation.`);
}

main();
