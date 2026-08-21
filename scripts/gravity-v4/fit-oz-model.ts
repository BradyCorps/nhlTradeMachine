// ── Gravity v4 — stage: fit-oz-model (the OZ well) ───────────────
//
// Fits the offensive-zone RAPM ridge over the valued possession observations
// and decomposes each player's offensive impact into the DIRECT part (his own
// xG rate) and the INDIRECT part — his effect on teammates' offense, which IS
// the OZ gravity well (spec §3.1, §5.2). It is the rigorous version of the
// teammate-impact WOWY that already showed a real pulse (forwards r=0.42).
//
//   npx tsx scripts/gravity-v4/fit-oz-model.ts
//   npx tsx scripts/gravity-v4/fit-oz-model.ts --lambda 25000     # ridge strength
//
// Input  (gitignored): data/gravity-v4/possessions-<season>.ndjson.gz
// Output (gitignored, player-level): data/gravity-v4/oz-model-<season>.json
//
// λ is the tuning knob — too high flattens everyone to zero, too low lets
// low-minute players spike. The sanity signal is the leaderboard: the OZ well
// should be topped by recognised play-drivers, not fourth-liners.

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { SEASON } from "../../app/lib/season-config";
import { activePlayerById } from "../../app/lib/nhl-active-players";
import { solveRidgeCG } from "./rapm";
import { buildOzDesign, computeDirectRates } from "./oz-design";
import type { PossessionObservation } from "./possession-states";

const OUT_DIR = path.join(process.cwd(), "data", "gravity-v4");
const args = process.argv.slice(2);
const flag = (n: string): string | null => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const season = flag("season") ?? SEASON.nhleSeasonId;
const lambda = Number(flag("lambda") ?? 25000);
const MIN_TOI_MIN = 300;   // display threshold (spec §6.5 medium reliability)

const name = (id: number) => activePlayerById(id)?.name ?? `#${id}`;

function main() {
  const file = path.join(OUT_DIR, `possessions-${season}.ndjson.gz`);
  if (!fs.existsSync(file)) {
    console.error(`\n✗ Missing ${path.relative(process.cwd(), file)}. Run build-possession-states first.\n`);
    process.exit(1);
  }
  console.log(`\nGravity v4 — fit-oz-model · season ${season} · λ=${lambda}`);

  const obs = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")
    .split("\n").filter(Boolean).map(l => JSON.parse(l) as PossessionObservation);
  console.log(`  observations: ${obs.length}`);

  const design = buildOzDesign(obs);
  console.log(`  players: ${design.nPlayers} · features: ${design.nFeatures} · rows: ${design.rows.length}`);

  // Penalize player off/def coefficients; leave the context block free.
  const penalty = new Float64Array(design.nFeatures);
  for (let j = 0; j < design.contextOffset; j++) penalty[j] = lambda;

  const t0 = Date.now();
  const beta = solveRidgeCG(design.rows, design.nFeatures, penalty, { maxIter: 800 });
  console.log(`  solved in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const { directRate, toiSec } = computeDirectRates(obs, design.players);
  // Center the direct rate by TOI-weighted mean so offense (relative to average)
  // and the direct part are on the same footing before subtracting.
  let wSum = 0, dSum = 0;
  for (let i = 0; i < design.nPlayers; i++) { wSum += toiSec[i]; dSum += directRate[i] * toiSec[i]; }
  const meanDirect = wSum > 0 ? dSum / wSum : 0;

  const rows = design.players.map((id, i) => {
    const off = beta[design.offOffset + i];
    const def = beta[design.defOffset + i];
    const direct = directRate[i];
    const ozWell = off - (direct - meanDirect);   // indirect = total offense − own shooting
    return { id, name: name(id), off, def, direct, ozWell, toiMin: toiSec[i] / 60 };
  });

  const qualified = rows.filter(r => r.toiMin >= MIN_TOI_MIN);
  const byOz = [...qualified].sort((a, b) => b.ozWell - a.ozWell);
  const col = (r: typeof rows[number]) =>
    `${r.name.padEnd(22)} OZ ${r.ozWell >= 0 ? "+" : ""}${r.ozWell.toFixed(3)}  off ${r.off >= 0 ? "+" : ""}${r.off.toFixed(3)}  direct ${r.direct.toFixed(3)}  ${Math.round(r.toiMin)}m`;

  console.log(`\n── TOP 15 OZ WELL (indirect teammate offense, xG/60, ≥${MIN_TOI_MIN} min) `.padEnd(64, "─"));
  for (const r of byOz.slice(0, 15)) console.log(`  ${col(r)}`);
  console.log(`\n── BOTTOM 5 `.padEnd(64, "─"));
  for (const r of byOz.slice(-5)) console.log(`  ${col(r)}`);

  const ozVals = qualified.map(r => r.ozWell);
  const sd = Math.sqrt(ozVals.reduce((a, v) => a + v * v, 0) / ozVals.length - (ozVals.reduce((a, v) => a + v, 0) / ozVals.length) ** 2);
  console.log(`\n  context: ${design.contextNames.map((n, k) => `${n} ${beta[design.contextOffset + k].toFixed(3)}`).join(" · ")}`);
  console.log(`  OZ well spread (qualified): sd ${sd.toFixed(3)} xG/60 · ${qualified.length} qualified of ${design.nPlayers}`);

  fs.writeFileSync(path.join(OUT_DIR, `oz-model-${season}.json`), JSON.stringify({
    schemaVersion: 1, season, lambda, meanDirect,
    context: Object.fromEntries(design.contextNames.map((n, k) => [n, beta[design.contextOffset + k]])),
    players: rows.map(r => ({ id: r.id, name: r.name, offPer60: r.off, defPer60: r.def, directPer60: r.direct, ozWellPer60: r.ozWell, toiMin: r.toiMin })),
  }, null, 2));
  console.log(`\n  wrote data/gravity-v4/oz-model-${season}.json`);
  console.log(`  SANITY: are the top names recognised play-drivers? If everyone is ~0, lower λ; if fourth-liners spike, raise λ.`);
}

main();
