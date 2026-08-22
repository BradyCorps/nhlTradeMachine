// ── Gravity v4 — stage: fit-nz-model (the NZ transition well) ────
//
// The NZ well is TRANSITION gravity: a player's effect on his teammates' RUSH xG
// (chances off the rush), as distinct from sustained offensive-zone possession
// (the OZ well). It reuses the OZ RAPM machinery — the only change is the input:
// fit on the rush-only view of the possessions (transition.ts). Because rush and
// sustained shots partition all offense, NZ (rush) + re-cut OZ (sustained) sum
// back to the total, so nothing is double-counted (spec §3.1, the NZ dome).
//
//   npx tsx scripts/gravity-v4/fit-nz-model.ts
//
// Input  (gitignored): data/gravity-v4/possessions-<season>.ndjson.gz REBUILT with
//        rush tags (re-run build-possession-states after this change).
// Output (gitignored, player-level): data/gravity-v4/nz-model-<season>.json
//
// SANITY / TWO TELLS:
//   • rush xG share should land ~0.20–0.35 (public tracking's rush fraction).
//   • NZ gravity must be DISTINCT from sustained OZ gravity — if they correlate
//     near 1.0, the "transition" well is just restating OZ and adds nothing.

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { SEASON } from "../../app/lib/season-config";
import { activePlayerById } from "../../app/lib/nhl-active-players";
import { fitOzWell, OZ_RIDGE_LAMBDA } from "./oz-fit";
import { rushOnly, sustainedOnly, rushXgShare } from "./transition";
import { pearson } from "./validate";
import type { PossessionObservation } from "./possession-states";

const isForward = (id: number): boolean => activePlayerById(id)?.position !== "D";
const posTag = (id: number): "F" | "D" => (activePlayerById(id)?.position === "D" ? "D" : "F");
const name = (id: number) => activePlayerById(id)?.name ?? `#${id}`;

const OUT_DIR = path.join(process.cwd(), "data", "gravity-v4");
const args = process.argv.slice(2);
const flag = (n: string): string | null => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const season = flag("season") ?? SEASON.nhleSeasonId;
const lambda = Number(flag("lambda") ?? OZ_RIDGE_LAMBDA);
const MIN_TOI_MIN = 300;

const sgn = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;

function main() {
  const file = path.join(OUT_DIR, `possessions-${season}.ndjson.gz`);
  if (!fs.existsSync(file)) {
    console.error(`\n✗ Missing ${path.relative(process.cwd(), file)}. Run build-possession-states first.\n`);
    process.exit(1);
  }
  const obs = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")
    .split("\n").filter(Boolean).map(l => JSON.parse(l) as PossessionObservation);

  const share = rushXgShare(obs);
  console.log(`\nGravity v4 — fit-nz-model (transition) · season ${season} · λ=${lambda}`);
  console.log(`  observations: ${obs.length} · rush xG share: ${(share * 100).toFixed(1)}%`);
  if (share === 0) {
    console.error(`\n✗ No rush shots found. The possessions file predates the rush tag —\n  rebuild it: build-stints then build-possession-states.\n`);
    process.exit(1);
  }

  const t0 = Date.now();
  const nz = fitOzWell(rushOnly(obs), isForward, { lambda });        // transition well
  const ozSust = fitOzWell(sustainedOnly(obs), isForward, { lambda }); // sustained, for distinctness
  console.log(`  fit rush + sustained in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const rows = nz.design.players.map((id) => ({
    id, name: name(id),
    nz: nz.byPlayer.get(id)!.gravity,
    ozSust: ozSust.byPlayer.get(id)?.gravity ?? 0,
    toiMin: nz.byPlayer.get(id)!.toiSec / 60,
  }));
  const qualified = rows.filter(r => r.toiMin >= MIN_TOI_MIN);
  const byNz = [...qualified].sort((a, b) => b.nz - a.nz);
  const col = (r: typeof rows[number]) =>
    `${posTag(r.id)} ${r.name.padEnd(22)} transition ${sgn(r.nz)}  (sustained ${sgn(r.ozSust)})  ${Math.round(r.toiMin)}m`;

  console.log(`\n── TOP 15 TRANSITION (NZ well: teammates' rush xG/60, ≥${MIN_TOI_MIN} min) `.padEnd(64, "─"));
  for (const r of byNz.slice(0, 15)) console.log(`  ${col(r)}`);
  console.log(`\n── BOTTOM 5 `.padEnd(64, "─"));
  for (const r of byNz.slice(-5)) console.log(`  ${col(r)}`);

  const topF = byNz.filter(r => posTag(r.id) === "F").slice(0, 8);
  const topD = byNz.filter(r => posTag(r.id) === "D").slice(0, 8);
  console.log(`\n── TOP 8 FORWARDS by transition `.padEnd(64, "─"));
  for (const r of topF) console.log(`  ${col(r)}`);
  console.log(`\n── TOP 8 DEFENSEMEN by transition `.padEnd(64, "─"));
  for (const r of topD) console.log(`  ${col(r)}`);

  // Distinctness: NZ transition vs sustained OZ. Near 1.0 ⇒ NZ is redundant.
  const distinct = pearson(qualified.map(r => r.nz), qualified.map(r => r.ozSust));
  const g = qualified.map(r => r.nz);
  const mean = g.reduce((a, v) => a + v, 0) / g.length;
  const sd = Math.sqrt(g.reduce((a, v) => a + (v - mean) ** 2, 0) / g.length);
  console.log(`\n  distinctness: corr(transition, sustained) = ${distinct.toFixed(3)} (want well below 1.0 — a separate skill)`);
  console.log(`  transition spread (qualified): sd ${sd.toFixed(3)} xG/60 · ${qualified.length} qualified of ${nz.design.nPlayers}`);

  fs.writeFileSync(path.join(OUT_DIR, `nz-model-${season}.json`), JSON.stringify({
    schemaVersion: 1, season, lambda, rushXgShare: share,
    distinctnessVsSustained: distinct,
    players: rows.map(r => ({ id: r.id, name: r.name, nzWellPer60: r.nz, sustainedOzPer60: r.ozSust, toiMin: r.toiMin })),
  }, null, 2));
  console.log(`\n  wrote data/gravity-v4/nz-model-${season}.json`);
  console.log(`  SANITY: top transition = rush drivers (fast, puck-moving F and D); distinctness < ~0.8 means it's a real second axis.`);
}

main();
