// ── Gravity v4 — stage: validate-model (does the OZ well measure?) ──
//
// The OZ well is fitted and position-fair, but a leaderboard that looks right is
// not evidence. This stage runs the gate every other model in this project had
// to pass before it moved a number (CLAUDE.md), specialised to a within-season
// RAPM coefficient. Three verdicts:
//
//   1. RELIABILITY — split the season into two independent halves by game, refit
//      the well on each, and correlate a player's gravity_A with his gravity_B.
//      This is "is it a stable trait or one-sample noise", per position.
//
//   2. NULL CONTROL — refit half B with the on-ice-unit → production link
//      destroyed (shots reattached to random stints). If the ridge still emitted
//      a split-half r on structure-free data, the real r would be an artifact;
//      it must collapse to ~0.
//
//   3. TEAMMATE SIGNAL — does half-A gravity predict half-B raw on-ice teammate
//      xG/60 (focal-excluded)? Gravity claims to move teammate offence, so it
//      should; a player's own FINISH should not. The gap is the discriminant
//      between "measures effect on others" and "restates own production".
//
//   npx tsx scripts/gravity-v4/validate-model.ts
//   npx tsx scripts/gravity-v4/validate-model.ts --lambda 50000 --minToi 150
//
// Input  (gitignored): data/gravity-v4/possessions-<season>.ndjson.gz
// Output (gitignored): data/gravity-v4/oz-validation-<season>.json (aggregate r's)

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { SEASON } from "../../app/lib/season-config";
import { activePlayerById } from "../../app/lib/nhl-active-players";
import { fitOzWell, OZ_RIDGE_LAMBDA } from "./oz-fit";
import { splitByGame, pearson, spearman, teammateXgRate, shuffleShots, mulberry32 } from "./validate";
import type { PossessionObservation } from "./possession-states";

const isForward = (id: number): boolean => activePlayerById(id)?.position !== "D";
const posTag = (id: number): "F" | "D" => (activePlayerById(id)?.position === "D" ? "D" : "F");

const OUT_DIR = path.join(process.cwd(), "data", "gravity-v4");
const args = process.argv.slice(2);
const flag = (n: string): string | null => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const season = flag("season") ?? SEASON.nhleSeasonId;
const lambda = Number(flag("lambda") ?? OZ_RIDGE_LAMBDA);
const MIN_TOI_MIN = Number(flag("minToi") ?? 150);   // per half, so ~half the fit-oz threshold

const grade = (r: number): string =>
  Math.abs(r) >= 0.5 ? "STRONG" : Math.abs(r) >= 0.3 ? "moderate" : "weak";

function main() {
  const file = path.join(OUT_DIR, `possessions-${season}.ndjson.gz`);
  if (!fs.existsSync(file)) {
    console.error(`\n✗ Missing ${path.relative(process.cwd(), file)}. Run build-possession-states first.\n`);
    process.exit(1);
  }
  console.log(`\nGravity v4 — validate-model · season ${season} · λ=${lambda} · minTOI ${MIN_TOI_MIN}m/half`);

  const obs = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")
    .split("\n").filter(Boolean).map(l => JSON.parse(l) as PossessionObservation);
  const [foldA, foldB] = splitByGame(obs, 2);
  console.log(`  observations: ${obs.length} → fold A ${foldA.length} / fold B ${foldB.length}`);

  const t0 = Date.now();
  const fitA = fitOzWell(foldA, isForward, { lambda });
  const fitB = fitOzWell(foldB, isForward, { lambda });
  console.log(`  refit both halves in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Qualified = enough ice time in BOTH halves to trust each coefficient.
  const minSec = MIN_TOI_MIN * 60;
  const qualified: number[] = [];
  for (const [id, a] of fitA.byPlayer) {
    const b = fitB.byPlayer.get(id);
    if (b && a.toiSec >= minSec && b.toiSec >= minSec) qualified.push(id);
  }
  const gA = (id: number) => fitA.byPlayer.get(id)!.gravity;
  const gB = (id: number) => fitB.byPlayer.get(id)!.gravity;

  // ── 1. Split-half reliability ───────────────────────────────────
  const report = (ids: number[], label: string) => {
    if (ids.length < 3) { console.log(`  ${label.padEnd(10)} n=${ids.length} (too few)`); return { r: 0, rho: 0, n: ids.length }; }
    const a = ids.map(gA), b = ids.map(gB);
    const r = pearson(a, b), rho = spearman(a, b);
    console.log(`  ${label.padEnd(10)} r=${r.toFixed(3)} (${grade(r)})  ρ=${rho.toFixed(3)}  n=${ids.length}`);
    return { r, rho, n: ids.length };
  };
  console.log(`\n── 1. SPLIT-HALF RELIABILITY (gravity_A vs gravity_B) `.padEnd(64, "─"));
  const relAll = report(qualified, "overall");
  const relF = report(qualified.filter(id => posTag(id) === "F"), "forwards");
  const relD = report(qualified.filter(id => posTag(id) === "D"), "defensemen");

  // ── 2. Null control ─────────────────────────────────────────────
  console.log(`\n── 2. NULL CONTROL (shots reshuffled — should be ~0) `.padEnd(64, "─"));
  const nullFit = fitOzWell(shuffleShots(foldB, mulberry32(0x9e3779b1)), isForward, { lambda });
  const nullR = pearson(qualified.map(gA), qualified.map(id => nullFit.byPlayer.get(id)?.gravity ?? 0));
  const nullPass = Math.abs(nullR) < 0.1;
  console.log(`  gravity_A vs gravity_nullB  r=${nullR.toFixed(3)}  ${nullPass ? "✓ collapses" : "✗ leaks — reliability may be an artifact"}`);

  // ── 3. Teammate signal (held-out) ───────────────────────────────
  console.log(`\n── 3. TEAMMATE SIGNAL (half-A coef → half-B on-ice teammate xG/60) `.padEnd(64, "─"));
  const rateB = teammateXgRate(foldB);
  const withRate = qualified.filter(id => (rateB.get(id)?.sec ?? 0) > 0);
  const per60 = (id: number) => { const t = rateB.get(id)!; return (t.xg / t.sec) * 3600; };
  const teammateSignal = (ids: number[], label: string) => {
    if (ids.length < 3) { console.log(`  ${label.padEnd(10)} n=${ids.length} (too few)`); return { gravityR: 0, finishR: 0, n: ids.length }; }
    const target = ids.map(per60);
    const gravityR = pearson(ids.map(id => fitA.byPlayer.get(id)!.gravity), target);
    const finishR = pearson(ids.map(id => fitA.byPlayer.get(id)!.finish), target);
    const tell = gravityR > finishR ? "✓ gravity > finish" : "✗ finish ≥ gravity";
    console.log(`  ${label.padEnd(10)} gravity→teammate r=${gravityR.toFixed(3)}  finish→teammate r=${finishR.toFixed(3)}  ${tell}  n=${ids.length}`);
    return { gravityR, finishR, n: ids.length };
  };
  const sigAll = teammateSignal(withRate, "overall");
  const sigF = teammateSignal(withRate.filter(id => posTag(id) === "F"), "forwards");
  const sigD = teammateSignal(withRate.filter(id => posTag(id) === "D"), "defensemen");

  // ── Verdict ─────────────────────────────────────────────────────
  console.log(`\n── VERDICT `.padEnd(64, "─"));
  const reliable = relAll.r >= 0.3 && nullPass;
  const measuresTeammates = sigAll.gravityR > sigAll.finishR && sigAll.gravityR > 0;
  console.log(`  reliability: ${grade(relAll.r)} (r=${relAll.r.toFixed(3)}), null ${nullPass ? "clean" : "LEAKS"} → ${reliable ? "a stable, real coefficient" : "NOT yet a trustworthy coefficient"}`);
  console.log(`  identity:    gravity ${measuresTeammates ? "predicts teammate xG where finish does not — it measures effect on others" : "does NOT out-predict finish on teammate xG — identity unproven"}`);

  fs.writeFileSync(path.join(OUT_DIR, `oz-validation-${season}.json`), JSON.stringify({
    schemaVersion: 1, season, lambda, minToiMinPerHalf: MIN_TOI_MIN,
    foldSizes: { a: foldA.length, b: foldB.length },
    reliability: { overall: relAll, forwards: relF, defensemen: relD },
    nullControl: { r: nullR, pass: nullPass },
    teammateSignal: { overall: sigAll, forwards: sigF, defensemen: sigD },
    verdict: { reliable, measuresTeammates },
  }, null, 2));
  console.log(`\n  wrote data/gravity-v4/oz-validation-${season}.json`);
}

main();
