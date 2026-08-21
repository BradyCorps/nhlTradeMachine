// ── Gravity v4 — stage: fit-oz-model (the OZ well) ───────────────
//
// Fits the offensive-zone RAPM ridge and reads each player's GRAVITY
// coefficient directly — how much his teammates' own expected goals rise with
// him on the ice, controlling for linemates, opponents, score and zone start
// (spec §3.1, §5.2). This is the rigorous, per-player-controlled version of the
// teammate-impact WOWY that showed a real pulse (forwards r=0.42).
//
//   npx tsx scripts/gravity-v4/fit-oz-model.ts
//   npx tsx scripts/gravity-v4/fit-oz-model.ts --lambda 25000
//
// Input  (gitignored): data/gravity-v4/possessions-<season>.ndjson.gz
// Output (gitignored, player-level): data/gravity-v4/oz-model-<season>.json
//
// SANITY: the gravity leaderboard should be topped by recognised play-drivers.
// λ is the tuning knob — everyone ~0 means lower it; low-minute names spiking
// means raise it.

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { SEASON } from "../../app/lib/season-config";
import { activePlayerById } from "../../app/lib/nhl-active-players";
import { solveRidgeCG } from "./rapm";
import { buildOzDesign } from "./oz-design";
import type { PossessionObservation } from "./possession-states";

// Position from the bundled roster snapshot; unknown ids (rookies) default to
// forward, the majority class. Goalies never reach a 5v5 skater lineup.
const isForward = (id: number): boolean => {
  const pos = activePlayerById(id)?.position;
  return pos !== "D";
};
const posTag = (id: number): string => (activePlayerById(id)?.position === "D" ? "D" : "F");

const OUT_DIR = path.join(process.cwd(), "data", "gravity-v4");
const args = process.argv.slice(2);
const flag = (n: string): string | null => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const season = flag("season") ?? SEASON.nhleSeasonId;
const lambda = Number(flag("lambda") ?? 25000);
const MIN_TOI_MIN = 300;

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

  const design = buildOzDesign(obs, isForward);
  console.log(`  players: ${design.nPlayers} · features: ${design.nFeatures} · rows: ${design.rows.length}`);

  const penalty = new Float64Array(design.nFeatures);
  for (let j = 0; j < design.contextOffset; j++) penalty[j] = lambda;

  const t0 = Date.now();
  const beta = solveRidgeCG(design.rows, design.nFeatures, penalty, { maxIter: 800 });
  console.log(`  solved in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const rows = design.players.map((id, i) => ({
    id, name: name(id),
    gravity: beta[design.gravityOffset + i],   // the OZ well
    finish: beta[design.finishOffset + i],
    defense: beta[design.defenseOffset + i],
    toiMin: design.toiSec[i] / 60,
  }));

  const qualified = rows.filter(r => r.toiMin >= MIN_TOI_MIN);
  const byGravity = [...qualified].sort((a, b) => b.gravity - a.gravity);
  const col = (r: typeof rows[number]) =>
    `${posTag(r.id)} ${r.name.padEnd(22)} gravity ${r.gravity >= 0 ? "+" : ""}${r.gravity.toFixed(3)}  finish ${r.finish >= 0 ? "+" : ""}${r.finish.toFixed(3)}  ${Math.round(r.toiMin)}m`;

  console.log(`\n── TOP 15 OZ WELL (gravity: effect on teammates' xG/60, ≥${MIN_TOI_MIN} min) `.padEnd(64, "─"));
  for (const r of byGravity.slice(0, 15)) console.log(`  ${col(r)}`);
  console.log(`\n── BOTTOM 5 `.padEnd(64, "─"));
  for (const r of byGravity.slice(-5)) console.log(`  ${col(r)}`);

  // Top forwards and defensemen separately — the position mix is the tell that
  // focalFwd de-confounded gravity from position.
  const topF = byGravity.filter(r => posTag(r.id) === "F").slice(0, 8);
  const topD = byGravity.filter(r => posTag(r.id) === "D").slice(0, 8);
  console.log(`\n── TOP 8 FORWARDS by gravity `.padEnd(64, "─"));
  for (const r of topF) console.log(`  ${col(r)}`);
  console.log(`\n── TOP 8 DEFENSEMEN by gravity `.padEnd(64, "─"));
  for (const r of topD) console.log(`  ${col(r)}`);

  const byFinish = [...qualified].sort((a, b) => b.finish - a.finish).slice(0, 5);
  console.log(`\n── TOP 5 FINISH (own shooting, sanity) `.padEnd(64, "─"));
  for (const r of byFinish) console.log(`  ${col(r)}`);

  const g = qualified.map(r => r.gravity);
  const mean = g.reduce((a, v) => a + v, 0) / g.length;
  const sd = Math.sqrt(g.reduce((a, v) => a + (v - mean) ** 2, 0) / g.length);
  console.log(`\n  context: ${design.contextNames.map((n, k) => `${n} ${beta[design.contextOffset + k].toFixed(3)}`).join(" · ")}`);
  console.log(`  gravity spread (qualified): sd ${sd.toFixed(3)} xG/60 · ${qualified.length} qualified of ${design.nPlayers}`);

  fs.writeFileSync(path.join(OUT_DIR, `oz-model-${season}.json`), JSON.stringify({
    schemaVersion: 2, season, lambda,
    context: Object.fromEntries(design.contextNames.map((n, k) => [n, beta[design.contextOffset + k]])),
    players: rows.map(r => ({ id: r.id, name: r.name, ozWellPer60: r.gravity, finishPer60: r.finish, defensePer60: r.defense, toiMin: r.toiMin })),
  }, null, 2));
  console.log(`\n  wrote data/gravity-v4/oz-model-${season}.json`);
  console.log(`  SANITY: top gravity = play-drivers, top finish = snipers. Overlap is fine; a total flip is not.`);
}

main();
