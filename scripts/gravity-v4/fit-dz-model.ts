// ── Gravity v4 — stage: fit-dz-model (the DZ well / suppression) ──
//
// The DZ well is defensive gravity: how much a player SUPPRESSES the expected
// goals of the attackers he is on the ice against (spec §3.1, the DZ dome). It is
// NOT a new model — the OZ RAPM ridge already fits a `defense` coefficient for
// every player, jointly with gravity and finish, because each attacker's own xG
// is regressed on his finish + teammates' gravity + the DEFENSE of his five
// opponents (oz-design.ts). This driver just reads that block and ranks it.
//
// SIGN: the response is the attacker's own xG, opponents enter the row with +1,
// so a good suppressor pulls that xG DOWN → his defense coefficient is NEGATIVE.
// The most negative coefficients are the best suppressors; the leaderboard sorts
// ascending. We keep the raw (signed) coefficient everywhere — here, in
// validate-model --coef defense, and in bootstrap-estimates --coef defense — so
// the three tools cross-reference without a sign flip.
//
//   npx tsx scripts/gravity-v4/fit-dz-model.ts
//
// Input  (gitignored): data/gravity-v4/possessions-<season>.ndjson.gz
// Output (gitignored, player-level): data/gravity-v4/dz-model-<season>.json
//
// SANITY: top suppressors should be recognised shutdown defencemen and two-way
// forwards, a MIX of positions. If it is all one position, the defense block
// carries the same kind of position confound gravity did (see the fit-oz-model
// focalFwd story) and needs a defender-position control before it is trusted.

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { SEASON } from "../../app/lib/season-config";
import { activePlayerById } from "../../app/lib/nhl-active-players";
import { fitOzWell, OZ_RIDGE_LAMBDA } from "./oz-fit";
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
  console.log(`\nGravity v4 — fit-dz-model (suppression) · season ${season} · λ=${lambda}`);

  const obs = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")
    .split("\n").filter(Boolean).map(l => JSON.parse(l) as PossessionObservation);
  console.log(`  observations: ${obs.length}`);

  const t0 = Date.now();
  const { design, byPlayer, context } = fitOzWell(obs, isForward, { lambda });
  console.log(`  players: ${design.nPlayers} · features: ${design.nFeatures} · rows: ${design.rows.length}`);
  console.log(`  solved in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const rows = design.players.map((id) => {
    const f = byPlayer.get(id)!;
    return { id, name: name(id), defense: f.defense, gravity: f.gravity, toiMin: f.toiSec / 60 };
  });

  const qualified = rows.filter(r => r.toiMin >= MIN_TOI_MIN);
  const bySupp = [...qualified].sort((a, b) => a.defense - b.defense);   // most negative = best
  const col = (r: typeof rows[number]) =>
    `${posTag(r.id)} ${r.name.padEnd(22)} defense ${sgn(r.defense)}  gravity ${sgn(r.gravity)}  ${Math.round(r.toiMin)}m`;

  console.log(`\n── TOP 15 SUPPRESSORS (defense: opponent xG/60 change, negative = suppresses, ≥${MIN_TOI_MIN} min) `.padEnd(64, "─"));
  for (const r of bySupp.slice(0, 15)) console.log(`  ${col(r)}`);
  console.log(`\n── BOTTOM 5 (leakiest) `.padEnd(64, "─"));
  for (const r of bySupp.slice(-5)) console.log(`  ${col(r)}`);

  // Position split — the tell that the defense block isn't position-confounded.
  const topF = bySupp.filter(r => posTag(r.id) === "F").slice(0, 8);
  const topD = bySupp.filter(r => posTag(r.id) === "D").slice(0, 8);
  console.log(`\n── TOP 8 FORWARDS by suppression `.padEnd(64, "─"));
  for (const r of topF) console.log(`  ${col(r)}`);
  console.log(`\n── TOP 8 DEFENSEMEN by suppression `.padEnd(64, "─"));
  for (const r of topD) console.log(`  ${col(r)}`);

  const d = qualified.map(r => r.defense);
  const mean = d.reduce((a, v) => a + v, 0) / d.length;
  const sd = Math.sqrt(d.reduce((a, v) => a + (v - mean) ** 2, 0) / d.length);
  console.log(`\n  context: ${design.contextNames.map(n => `${n} ${context[n].toFixed(3)}`).join(" · ")}`);
  console.log(`  suppression spread (qualified): sd ${sd.toFixed(3)} xG/60 · ${qualified.length} qualified of ${design.nPlayers}`);

  fs.writeFileSync(path.join(OUT_DIR, `dz-model-${season}.json`), JSON.stringify({
    schemaVersion: 1, season, lambda,
    context,
    players: rows.map(r => ({ id: r.id, name: r.name, defensePer60: r.defense, ozWellPer60: r.gravity, toiMin: r.toiMin })),
  }, null, 2));
  console.log(`\n  wrote data/gravity-v4/dz-model-${season}.json`);
  console.log(`  SANITY: top suppressors should be a MIX of shutdown D and two-way F. All-one-position ⇒ position confound (see fit-oz-model focalFwd).`);
}

main();
