// ── Gravity v4 — stage: build-possession-states ──────────────────
//
// Reads the stint dataset (`build-stints`) and the fitted shot xG model
// (`fit-shot-xg`), prices every 5v5 chance in expected goals, and emits one
// valued possession observation per stint — the regression substrate the
// OZ/DZ zone fits consume.
//
//   npx tsx scripts/gravity-v4/build-possession-states.ts
//   npx tsx scripts/gravity-v4/build-possession-states.ts --season 20252026
//
// Inputs  (gitignored, produced in a codespace):
//   data/gravity-v4/stints-<season>.ndjson.gz
//   data/gravity-v4/shot-xg-<season>.json
// Output (gitignored — player-level derived data):
//   data/gravity-v4/possessions-<season>.ndjson.gz
//   data/gravity-v4/possessions-<season>.manifest.json

import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
import { SEASON } from "../../app/lib/season-config";
import type { StintRow } from "./core";
import type { XgModel } from "./shot-xg-model";
import { valueStint, type PossessionObservation } from "./possession-states";

const SCHEMA_VERSION = 1;
const OUT_DIR = path.join(process.cwd(), "data", "gravity-v4");

const args = process.argv.slice(2);
const flag = (n: string): string | null => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const season = flag("season") ?? SEASON.nhleSeasonId;

function requireFile(abs: string, how: string): void {
  if (!fs.existsSync(abs)) {
    console.error(`\n✗ Missing ${path.relative(process.cwd(), abs)}.\n  ${how}\n`);
    process.exit(1);
  }
}

function main() {
  const stintFile = path.join(OUT_DIR, `stints-${season}.ndjson.gz`);
  const xgFile = path.join(OUT_DIR, `shot-xg-${season}.json`);
  requireFile(stintFile, "Run  npx tsx scripts/gravity-v4/build-stints.ts  first.");
  requireFile(xgFile, "Run  npx tsx scripts/gravity-v4/fit-shot-xg.ts  first.");

  console.log(`\nGravity v4 — build-possession-states · season ${season}`);
  const xg = JSON.parse(fs.readFileSync(xgFile, "utf8")) as { model: XgModel; heldOutAuc?: number };
  console.log(`  xG model: held-out AUC ${xg.heldOutAuc?.toFixed(4) ?? "?"}`);

  const rows = zlib.gunzipSync(fs.readFileSync(stintFile)).toString("utf8").split("\n").filter(Boolean);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `possessions-${season}.ndjson.gz`);
  const gzip = zlib.createGzip();
  const sink = fs.createWriteStream(outFile);
  gzip.pipe(sink);
  const hash = crypto.createHash("sha256");

  let observations = 0, fivev5 = 0, shotsValued = 0;
  let totHomeXg = 0, totAwayXg = 0, totDurationSec = 0;

  for (const line of rows) {
    const row = JSON.parse(line) as StintRow;
    if (!row.isEven5v5) continue;                // 5v5 initial scope (spec §6.4)
    fivev5++;
    const obs: PossessionObservation = valueStint(row, xg.model);
    observations++;
    shotsValued += obs.shots.length;
    totHomeXg += obs.homeXg;
    totAwayXg += obs.awayXg;
    totDurationSec += obs.durationSec;
    const out = `${JSON.stringify(obs)}\n`;
    hash.update(out);
    gzip.write(out);
  }
  gzip.end();

  const minutes = totDurationSec / 60;
  const xgPer60 = minutes > 0 ? ((totHomeXg + totAwayXg) / minutes) * 60 : 0;
  const meanXgPerShot = shotsValued > 0 ? (totHomeXg + totAwayXg) / shotsValued : 0;

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    season,
    builtAt: new Date().toISOString(),
    scope: "5v5",
    xgModelAuc: xg.heldOutAuc ?? null,
    observations,
    fivev5Stints: fivev5,
    shotsValued,
    totalHomeXg: Number(totHomeXg.toFixed(2)),
    totalAwayXg: Number(totAwayXg.toFixed(2)),
    fivev5Minutes: Number(minutes.toFixed(1)),
    xgPer60: Number(xgPer60.toFixed(3)),
    meanXgPerShot: Number(meanXgPerShot.toFixed(4)),
    sha256: "",
  };

  sink.on("finish", () => {
    manifest.sha256 = hash.digest("hex");
    fs.writeFileSync(path.join(OUT_DIR, `possessions-${season}.manifest.json`), JSON.stringify(manifest, null, 2));

    console.log(`  5v5 stints: ${fivev5} · observations: ${observations} · shots valued: ${shotsValued}`);
    console.log(`  total xG: home ${totHomeXg.toFixed(1)} / away ${totAwayXg.toFixed(1)} · ${minutes.toFixed(0)} 5v5 min`);
    console.log(`  xG/60 (both teams): ${xgPer60.toFixed(3)}  ·  mean xG/shot: ${meanXgPerShot.toFixed(4)}`);
    console.log(`\n  wrote ${path.relative(process.cwd(), outFile)}`);
    console.log(`  sha256(uncompressed) ${manifest.sha256.slice(0, 16)}…`);

    // Sanity: league 5v5 xGF/60 sits near ~2.5 per team (≈5.0 both). A wildly
    // different number means the xG scale or the shot filter is off.
    const perTeam = xgPer60 / 2;
    if (perTeam < 1.5 || perTeam > 4) {
      console.error(`\n  ⚠ ${perTeam.toFixed(2)} xGF/60 per team is outside the ~2.0–3.0 sanity band — check the xG model or shot filter.`);
    } else {
      console.log(`\n  sanity: ${perTeam.toFixed(2)} xGF/60 per team — in the expected ~2.0–3.0 range. Next: fit-oz-model.`);
    }
  });
}

main();
