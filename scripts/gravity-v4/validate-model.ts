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
//   npx tsx scripts/gravity-v4/validate-model.ts                 # OZ (gravity)
//   npx tsx scripts/gravity-v4/validate-model.ts --coef defense  # DZ (suppression)
//
// The DZ well is the `defense` coefficient the SAME OZ ridge already fits (how an
// on-ice opponent lowers the focal attacker's xG), so validating it needs no new
// model — just its own held-out target: the opponent team's on-ice xG, which a
// suppressor keeps LOW. Everything else (split-half reliability, the shot-shuffle
// null) is identical; only the target and the contrast coefficient change.
//
// Input  (gitignored): data/gravity-v4/possessions-<season>.ndjson.gz
// Output (gitignored): data/gravity-v4/{oz,dz}-validation-<season>.json

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { SEASON } from "../../app/lib/season-config";
import { activePlayerById } from "../../app/lib/nhl-active-players";
import { fitOzWell, OZ_RIDGE_LAMBDA } from "./oz-fit";
import { splitByGame, pearson, spearman, teammateXgRate, opponentXgRate, shuffleShots, mulberry32 } from "./validate";
import { rushOnly } from "./transition";
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

// Which well to validate. gravity = OZ (effect on teammates); defense = DZ
// (suppression of opponents). Both are fit jointly by the same OZ ridge, so the
// DZ well needs no new model — only its own held-out target and leaderboard.
const coef = (flag("coef") ?? "gravity") as "gravity" | "defense";
if (coef !== "gravity" && coef !== "defense") {
  console.error(`\n✗ --coef must be "gravity" or "defense" (got "${coef}").\n`); process.exit(1);
}
// --rush validates the NZ TRANSITION well: the same gravity coefficient, but fit
// on the rush-only view of the possessions (transition.ts). Its held-out target
// is teammate RUSH xG, so the whole gate (reliability, null, identity vs finish)
// applies unchanged — only the data is filtered to transition chances.
const rush = args.includes("--rush");
const well = rush ? "NZ" : coef === "defense" ? "DZ" : "OZ";
// The contrast coefficient that should NOT predict this well's outcome — the
// discriminant that the coefficient measures its own thing, not "good player".
const contrast: "gravity" | "finish" = coef === "defense" ? "gravity" : "finish";

const grade = (r: number): string =>
  Math.abs(r) >= 0.5 ? "STRONG" : Math.abs(r) >= 0.3 ? "moderate" : "weak";

function main() {
  const file = path.join(OUT_DIR, `possessions-${season}.ndjson.gz`);
  if (!fs.existsSync(file)) {
    console.error(`\n✗ Missing ${path.relative(process.cwd(), file)}. Run build-possession-states first.\n`);
    process.exit(1);
  }
  console.log(`\nGravity v4 — validate-model · ${well} well (${coef}${rush ? ", rush" : ""}) · season ${season} · λ=${lambda} · minTOI ${MIN_TOI_MIN}m/half`);

  const raw = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")
    .split("\n").filter(Boolean).map(l => JSON.parse(l) as PossessionObservation);
  const obs = rush ? rushOnly(raw) : raw;   // NZ validates on the transition view
  if (rush && obs.every(o => o.shots.length === 0)) {
    console.error(`\n✗ No rush shots — rebuild the possessions file with the rush tag.\n`); process.exit(1);
  }
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
  const cA = (id: number) => fitA.byPlayer.get(id)![coef];
  const cB = (id: number) => fitB.byPlayer.get(id)![coef];

  // ── 1. Split-half reliability ───────────────────────────────────
  const report = (ids: number[], label: string) => {
    if (ids.length < 3) { console.log(`  ${label.padEnd(10)} n=${ids.length} (too few)`); return { r: 0, rho: 0, n: ids.length }; }
    const a = ids.map(cA), b = ids.map(cB);
    const r = pearson(a, b), rho = spearman(a, b);
    console.log(`  ${label.padEnd(10)} r=${r.toFixed(3)} (${grade(r)})  ρ=${rho.toFixed(3)}  n=${ids.length}`);
    return { r, rho, n: ids.length };
  };
  console.log(`\n── 1. SPLIT-HALF RELIABILITY (${coef}_A vs ${coef}_B) `.padEnd(64, "─"));
  const relAll = report(qualified, "overall");
  const relF = report(qualified.filter(id => posTag(id) === "F"), "forwards");
  const relD = report(qualified.filter(id => posTag(id) === "D"), "defensemen");

  // ── 2. Null control ─────────────────────────────────────────────
  console.log(`\n── 2. NULL CONTROL (shots reshuffled — should be ~0) `.padEnd(64, "─"));
  const nullFit = fitOzWell(shuffleShots(foldB, mulberry32(0x9e3779b1)), isForward, { lambda });
  const nullR = pearson(qualified.map(cA), qualified.map(id => nullFit.byPlayer.get(id)?.[coef] ?? 0));
  const nullPass = Math.abs(nullR) < 0.1;
  console.log(`  ${coef}_A vs ${coef}_nullB  r=${nullR.toFixed(3)}  ${nullPass ? "✓ collapses" : "✗ leaks — reliability may be an artifact"}`);

  // ── 3. Identity, held-out: does the coefficient predict the outcome it
  //        CLAIMS to move, better than the opposite-side coefficient does? For
  //        gravity that's teammate xG (vs own finish); for defense it's opponent
  //        xG suppression (vs own gravity). A good suppressor has a NEGATIVE
  //        defense coef and a LOW opponent rate → positive correlation. ────────
  const outcome = coef === "defense" ? "opponent xG/60 (suppression)" : "teammate xG/60";
  const rateB = coef === "defense" ? opponentXgRate(foldB) : teammateXgRate(foldB);
  console.log(`\n── 3. IDENTITY (half-A ${coef} → half-B ${outcome}) `.padEnd(64, "─"));
  const withRate = qualified.filter(id => (rateB.get(id)?.sec ?? 0) > 0);
  const per60 = (id: number) => { const t = rateB.get(id)!; return (t.xg / t.sec) * 3600; };
  const identity = (ids: number[], label: string) => {
    if (ids.length < 3) { console.log(`  ${label.padEnd(10)} n=${ids.length} (too few)`); return { primaryR: 0, contrastR: 0, n: ids.length }; }
    const target = ids.map(per60);
    const primaryR = pearson(ids.map(id => fitA.byPlayer.get(id)![coef]), target);
    const contrastR = pearson(ids.map(id => fitA.byPlayer.get(id)![contrast]), target);
    const tell = primaryR > contrastR && primaryR > 0 ? `✓ ${coef} > ${contrast}` : `✗ ${contrast} ≥ ${coef}`;
    console.log(`  ${label.padEnd(10)} ${coef}→outcome r=${primaryR.toFixed(3)}  ${contrast}→outcome r=${contrastR.toFixed(3)}  ${tell}  n=${ids.length}`);
    return { primaryR, contrastR, n: ids.length };
  };
  const sigAll = identity(withRate, "overall");
  const sigF = identity(withRate.filter(id => posTag(id) === "F"), "forwards");
  const sigD = identity(withRate.filter(id => posTag(id) === "D"), "defensemen");

  // ── Verdict ─────────────────────────────────────────────────────
  console.log(`\n── VERDICT `.padEnd(64, "─"));
  const reliable = relAll.r >= 0.3 && nullPass;
  const measuresOutcome = sigAll.primaryR > sigAll.contrastR && sigAll.primaryR > 0;
  const claim = coef === "defense"
    ? { yes: `defense predicts opponent xG where offense does not — it measures suppression`, no: `does NOT out-predict offense on opponent xG — identity unproven` }
    : { yes: `gravity predicts teammate xG where finish does not — it measures effect on others`, no: `does NOT out-predict finish on teammate xG — identity unproven` };
  console.log(`  reliability: ${grade(relAll.r)} (r=${relAll.r.toFixed(3)}), null ${nullPass ? "clean" : "LEAKS"} → ${reliable ? "a stable, real coefficient" : "NOT yet a trustworthy coefficient"}`);
  console.log(`  identity:    ${measuresOutcome ? claim.yes : claim.no}`);

  const outFile = `${rush ? "nz" : coef === "defense" ? "dz" : "oz"}-validation-${season}.json`;
  fs.writeFileSync(path.join(OUT_DIR, outFile), JSON.stringify({
    schemaVersion: 2, season, coef, rush, lambda, minToiMinPerHalf: MIN_TOI_MIN,
    foldSizes: { a: foldA.length, b: foldB.length },
    reliability: { overall: relAll, forwards: relF, defensemen: relD },
    nullControl: { r: nullR, pass: nullPass },
    identity: { coef, contrast, overall: sigAll, forwards: sigF, defensemen: sigD },
    verdict: { reliable, measuresOutcome },
  }, null, 2));
  console.log(`\n  wrote data/gravity-v4/${outFile}`);
}

main();
