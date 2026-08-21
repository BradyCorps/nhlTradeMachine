// ── Gravity v4 — stage: bootstrap-estimates (error bars on the well) ──
//
// Validation proved the OZ well is real and moderately reliable (split-half
// r≈0.35 → ~0.52 full-season). Moderate reliability means a single-season gravity
// value is a point in a cloud, and a leaderboard that hides the cloud oversells
// its top. This stage draws the cloud: a BLOCK bootstrap over whole games (the
// correlation unit) refits the well on each resample, and the spread of a
// player's gravity across replicates is his standard error, the 2.5/97.5
// percentiles his interval.
//
// Two questions it answers that the point estimate cannot:
//   • RESOLVED — how many of the qualified players have an interval clear of
//     zero (a sign we can trust), versus how many are indistinguishable from a
//     league-average influence on their linemates.
//   • SEPARABLE — is the top of the board actually ordered, or do the leaders'
//     intervals overlap so much that #1 vs #5 is a coin flip (the honest read on
//     the Ekholm-next-to-MacKinnon collinearity the fit flagged).
//
//   npx tsx scripts/gravity-v4/bootstrap-estimates.ts                # OZ, 40 reps
//   npx tsx scripts/gravity-v4/bootstrap-estimates.ts --boot 100     # tighter
//   npx tsx scripts/gravity-v4/bootstrap-estimates.ts --coef defense # DZ suppression
//
// Each replicate is a full refit (~12s), so 40 ≈ 8 min, 100 ≈ 20 min — an offline
// codespace run. Input (gitignored): possessions-<season>.ndjson.gz. Output
// (gitignored, player-level): oz-bootstrap-<season>.json.

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { SEASON } from "../../app/lib/season-config";
import { activePlayerById } from "../../app/lib/nhl-active-players";
import { fitOzWell, OZ_RIDGE_LAMBDA } from "./oz-fit";
import { mulberry32 } from "./validate";
import { resampleWithReplacement, summarize, resolvedFromZero, intervalsOverlap, populationSd, type Summary } from "./bootstrap";
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
const nBoot = Number(flag("boot") ?? 40);
const MIN_TOI_MIN = 300;

// Which well to error-bar. gravity = OZ (best = most positive); defense = DZ
// suppression (best = most NEGATIVE, so the board sorts the other way). Both come
// from the same joint fit — bootstrap resamples games and reads the chosen block.
const coef = (flag("coef") ?? "gravity") as "gravity" | "defense";
if (coef !== "gravity" && coef !== "defense") {
  console.error(`\n✗ --coef must be "gravity" or "defense" (got "${coef}").\n`); process.exit(1);
}
const well = coef === "defense" ? "DZ" : "OZ";

// Each fit materializes a ~2.7M-row design (~850 MB). The bootstrap runs one
// after another, so only ONE may be live at a time — these helpers pull out the
// handful of numbers we keep and return, letting the giant design fall out of
// scope and be collected before the next fit allocates its own. (Holding the
// reference fit's design across the loop is what OOM'd the first version: two
// live designs blew past Node's ~2 GB heap.)

interface RefExtract { nPlayers: number; point: Map<number, number>; toiMin: Map<number, number>; }

function referenceFit(all: PossessionObservation[], lambda: number): RefExtract {
  const fit = fitOzWell(all, isForward, { lambda });
  const point = new Map<number, number>();
  const toiMin = new Map<number, number>();
  for (const [id, f] of fit.byPlayer) { point.set(id, f[coef]); toiMin.set(id, f.toiSec / 60); }
  return { nPlayers: fit.design.nPlayers, point, toiMin };
}

function replicateCoef(games: PossessionObservation[][], pick: number[], qualified: number[], lambda: number): Map<number, number> {
  const rObs: PossessionObservation[] = [];
  for (const gi of pick) for (const o of games[gi]) rObs.push(o);
  const fit = fitOzWell(rObs, isForward, { lambda });
  const out = new Map<number, number>();
  for (const id of qualified) { const f = fit.byPlayer.get(id); if (f) out.set(id, f[coef]); }
  return out;   // rObs and the design go out of scope here → collectable before the next replicate
}

function main() {
  const file = path.join(OUT_DIR, `possessions-${season}.ndjson.gz`);
  if (!fs.existsSync(file)) {
    console.error(`\n✗ Missing ${path.relative(process.cwd(), file)}. Run build-possession-states first.\n`);
    process.exit(1);
  }
  console.log(`\nGravity v4 — bootstrap-estimates · ${well} well (${coef}) · season ${season} · λ=${lambda} · ${nBoot} replicates`);

  const obs = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")
    .split("\n").filter(Boolean).map(l => JSON.parse(l) as PossessionObservation);

  // Group stints by game — the resampling block.
  const byGame = new Map<number, PossessionObservation[]>();
  for (const o of obs) { const g = byGame.get(o.gameId); if (g) g.push(o); else byGame.set(o.gameId, [o]); }
  const games = [...byGame.values()];
  console.log(`  observations: ${obs.length} · games: ${games.length}`);

  // Reference fit — keep only the point estimates and ice time; the design it
  // built is dropped here so it is not competing for heap during the loop.
  const { nPlayers, point, toiMin } = referenceFit(obs, lambda);
  const qualified = [...point.keys()].filter(id => (toiMin.get(id) ?? 0) >= MIN_TOI_MIN);
  console.log(`  qualified (≥${MIN_TOI_MIN} min): ${qualified.length} of ${nPlayers}`);

  // Bootstrap: resample games with replacement, refit, collect gravity per player.
  const samples = new Map<number, number[]>();
  for (const id of qualified) samples.set(id, []);
  const rng = mulberry32(0xC0FFEE);
  const t0 = Date.now();
  for (let b = 0; b < nBoot; b++) {
    const g = replicateCoef(games, resampleWithReplacement(games.length, rng), qualified, lambda);
    for (const id of qualified) { const v = g.get(id); if (v !== undefined) samples.get(id)!.push(v); }
    process.stdout.write(`\r  replicate ${b + 1}/${nBoot} (${((Date.now() - t0) / 1000).toFixed(0)}s)   `);
  }
  console.log();

  const est = qualified.map(id => {
    const s = summarize(samples.get(id)!);
    return { id, name: name(id), pos: posTag(id), point: point.get(id)!, ...s, resolved: resolvedFromZero(s) };
  });
  // For defense, the best suppressor is the MOST NEGATIVE coefficient, so the
  // board sorts ascending; gravity sorts descending (biggest lift first).
  const byPoint = [...est].sort((a, b) => coef === "defense" ? a.point - b.point : b.point - a.point);

  // ── Top of the board with intervals ─────────────────────────────
  const boardLabel = coef === "defense" ? "TOP 15 SUPPRESSORS (most negative defense)" : "TOP 15 OZ WELL";
  console.log(`\n── ${boardLabel} — point [95% CI]  (± = bootstrap SE) `.padEnd(64, "─"));
  for (const e of byPoint.slice(0, 15)) {
    const mark = e.resolved ? "●" : "○";   // ● resolved from zero, ○ not
    console.log(`  ${mark} ${e.pos} ${e.name.padEnd(22)} ${fmt(e.point)}  [${fmt(e.lo)}, ${fmt(e.hi)}]  ±${e.se.toFixed(3)}`);
  }

  // ── Resolved fraction ───────────────────────────────────────────
  const resolved = est.filter(e => e.resolved);
  const frac = (a: number, b: number) => `${a}/${b} (${((a / b) * 100).toFixed(0)}%)`;
  const posCount = (arr: typeof est, p: "F" | "D") => arr.filter(e => e.pos === p).length;
  console.log(`\n── RESOLVED FROM ZERO (95% interval excludes 0) `.padEnd(64, "─"));
  console.log(`  overall    ${frac(resolved.length, est.length)}`);
  console.log(`  forwards   ${frac(posCount(resolved, "F"), posCount(est, "F"))}`);
  console.log(`  defensemen ${frac(posCount(resolved, "D"), posCount(est, "D"))}`);

  // ── Separability of the leaders ─────────────────────────────────
  console.log(`\n── SEPARABILITY (does the top of the board actually order?) `.padEnd(64, "─"));
  const top = byPoint[0];
  for (const k of [1, 4, 9]) {
    if (k >= byPoint.length) continue;
    const other = byPoint[k];
    const ov = intervalsOverlap(top, other);
    console.log(`  #1 ${top.name} vs #${k + 1} ${other.name}: intervals ${ov ? "OVERLAP — not separable" : "disjoint — #1 clearly ahead"}`);
  }
  const medianSe = [...est].map(e => e.se).sort((a, b) => a - b)[Math.floor(est.length / 2)];
  const pointSd = populationSd(est.map(e => e.point));
  console.log(`  median SE across qualified: ±${medianSe.toFixed(3)} xG/60  (point spread sd ${pointSd.toFixed(3)})`);

  const outFile = `${coef === "defense" ? "dz" : "oz"}-bootstrap-${season}.json`;
  fs.writeFileSync(path.join(OUT_DIR, outFile), JSON.stringify({
    schemaVersion: 2, season, coef, lambda, nBoot, minToiMin: MIN_TOI_MIN,
    resolved: { overall: [resolved.length, est.length], forwards: [posCount(resolved, "F"), posCount(est, "F")], defensemen: [posCount(resolved, "D"), posCount(est, "D")] },
    players: est.map(e => ({ id: e.id, name: e.name, pos: e.pos, point: e.point, mean: e.mean, se: e.se, lo: e.lo, hi: e.hi, resolved: e.resolved })),
  }, null, 2));
  console.log(`\n  wrote data/gravity-v4/${outFile}`);
  console.log(`  READ: ● = sign trustworthy; ○ = influence indistinguishable from league average. Overlapping leader intervals are the collinearity being honest, not a bug.`);
}

const fmt = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;

main();
