// ── Gravity v4 — stage: export-profiles (the fitted artifact) ────
//
// Turns the validated OZ + DZ fits into the `gravity-v4-profile-set/1` envelope
// the app's loader/validator/display already expect (app/lib/gravity-v4). This
// is the payoff of the whole v4 build — a real fitted artifact where there has
// only ever been a `null`.
//
// HONESTY, enforced by the schema (validate-profile.ts), not by us:
//   • net xG is the UNWEIGHTED sum of the three zones — with NZ absent, net = OZ + DZ.
//   • DZ is POSITIVE for prevention, so the raw (negative) `defense` coefficient
//     is flipped: dz.xg = −defense.
//   • the NZ transition well has NO data (zone entry/exit events the stint rows
//     don't carry), so every profile marks NZ `missing` with zero sample minutes.
//     That forces the schema's `insufficient` path → NO public tier. A player does
//     not get a full territorial rating while a third of the model is absent. This
//     is the CLAUDE.md "validated before it moves a number" rule, made structural.
//
// So each profile is a FITTED-but-UNTIERED diagnostic: the two measured wells with
// their bootstrap intervals, NZ shown as not-yet-available, no tier, no X-NAV.
//
//   npx tsx scripts/gravity-v4/export-profiles.ts
//
// Input  (gitignored): oz-model-<season>.json (point estimates + toi),
//        oz-bootstrap / dz-bootstrap-<season>.json (intervals, optional).
// Output (gitignored): gravity-v4-artifact-<season>.json — validated against the
//        SHIPPED validator here, so a bad artifact never leaves this script.
//
// NOT wired live: this does not touch app/lib/gravity-v4/runtime-artifact.ts or
// the release flag. Publishing the artifact is the PL-13/PL-14 gate — a product
// decision, left to the human.

import fs from "fs";
import path from "path";
import { SEASON } from "../../app/lib/season-config";
import { activePlayerById } from "../../app/lib/nhl-active-players";
import {
  validateGravityProfileV4,
  validateGravityV4ArtifactEnvelope,
} from "../../app/lib/gravity-v4/validate-profile";
import type {
  GravityProfileV4,
  GravityReliabilityBand,
  GravityV4ArtifactEnvelope,
} from "../../app/lib/gravity-v4/types";
import { buildGravityProfileV4, percentileOf } from "./profile-builder";
import { quantile } from "./bootstrap";

// xG/82 is a rate projected onto a STANDARD full-season 5v5 workload — a
// display convenience only. It scales every zone by the same constant, so the
// tanh field shape and all percentiles are invariant to its exact value.
const STANDARD_5V5_MIN_82 = 1000;
const MIN_TOI_MIN = 300;

const OUT_DIR = path.join(process.cwd(), "data", "gravity-v4");
const args = process.argv.slice(2);
const flag = (n: string): string | null => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const seasonId = flag("season") ?? SEASON.nhleSeasonId;         // "20252026"
const seasonDisplay = `${seasonId.slice(0, 4)}-${seasonId.slice(6)}`;   // "2025-26"

/** L/R wings collapse to "W"; only C/W/D are eligible (goalies/unknown skipped). */
function eligiblePosition(id: number): "C" | "W" | "D" | null {
  const pos = activePlayerById(id)?.position;
  if (pos === "C") return "C";
  if (pos === "L" || pos === "R" || pos === "W") return "W";
  if (pos === "D") return "D";
  return null;
}

interface ModelRow { id: number; name: string; ozWellPer60: number; defensePer60: number; toiMin: number }
interface BootRow { id: number; lo: number; hi: number; resolved: boolean }

function readJson<T>(file: string): T | null {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) as T : null;
}

function main() {
  const ozModel = readJson<{ players: ModelRow[] }>(path.join(OUT_DIR, `oz-model-${seasonId}.json`));
  if (!ozModel) {
    console.error(`\n✗ Missing data/gravity-v4/oz-model-${seasonId}.json. Run fit-oz-model first.\n`);
    process.exit(1);
  }
  const ozBoot = readJson<{ players: BootRow[] }>(path.join(OUT_DIR, `oz-bootstrap-${seasonId}.json`));
  const dzBoot = readJson<{ players: BootRow[] }>(path.join(OUT_DIR, `dz-bootstrap-${seasonId}.json`));
  const ozCi = new Map((ozBoot?.players ?? []).map(r => [r.id, r]));
  const dzCi = new Map((dzBoot?.players ?? []).map(r => [r.id, r]));
  console.log(`\nGravity v4 — export-profiles · season ${seasonDisplay} · OZ+DZ (NZ missing)`);
  console.log(`  intervals: OZ bootstrap ${ozBoot ? "present" : "absent"} · DZ bootstrap ${dzBoot ? "present" : "absent"}`);

  // Eligible, qualified population — those we can position-classify and that clear
  // the ice-time bar. Percentiles and visual scales come from this set.
  const pop = ozModel.players
    .filter(r => r.toiMin >= MIN_TOI_MIN)
    .map(r => ({ ...r, position: eligiblePosition(r.id) }))
    .filter((r): r is ModelRow & { position: "C" | "W" | "D" } => r.position !== null);

  const oz82Of = (r: ModelRow) => r.ozWellPer60 * STANDARD_5V5_MIN_82 / 60;
  const dz82Of = (r: ModelRow) => -r.defensePer60 * STANDARD_5V5_MIN_82 / 60;   // prevention positive

  // Visual scales: a robust spread of |zone| and |net| so the tanh field uses its
  // range without saturating. Floored so a positive scale is guaranteed.
  const zoneAbs = pop.flatMap(r => [Math.abs(oz82Of(r)), Math.abs(dz82Of(r))]).sort((a, b) => a - b);
  const netAbs = pop.map(r => Math.abs(oz82Of(r) + dz82Of(r))).sort((a, b) => a - b);
  const scales = {
    zoneXg82: Math.max(0.5, quantile(zoneAbs, 0.9)),
    netXg82: Math.max(0.5, quantile(netAbs, 0.9)),
  };

  // Within-position and league-wide sorted coefficients, for percentiles.
  const ozLeague = pop.map(r => r.ozWellPer60).sort((a, b) => a - b);
  const dzLeague = pop.map(r => -r.defensePer60).sort((a, b) => a - b);
  const ozPos = { C: [] as number[], W: [] as number[], D: [] as number[] };
  const dzPos = { C: [] as number[], W: [] as number[], D: [] as number[] };
  for (const r of pop) { ozPos[r.position].push(r.ozWellPer60); dzPos[r.position].push(-r.defensePer60); }
  for (const k of ["C", "W", "D"] as const) { ozPos[k].sort((a, b) => a - b); dzPos[k].sort((a, b) => a - b); }

  const trainedAt = new Date().toISOString();
  const round1 = (v: number) => Math.round(v * 10) / 10;

  const profiles: GravityProfileV4[] = [];
  const invalid: { id: number; name: string; issues: string[] }[] = [];

  for (const r of pop) {
    const ozCiRow = ozCi.get(r.id);
    const dzCiRow = dzCi.get(r.id);
    const bothResolved = !!ozCiRow?.resolved && !!dzCiRow?.resolved;
    const reliability: GravityReliabilityBand = bothResolved ? "MEDIUM" : "LOW";

    const profile = buildGravityProfileV4({
      playerId: String(r.id),
      playerName: r.name,
      position: r.position,
      season: seasonDisplay,
      gravity60: r.ozWellPer60,
      defense60: r.defensePer60,
      toiMin: r.toiMin,
      gravityInterval60: ozCiRow ? { lo: ozCiRow.lo, hi: ozCiRow.hi } : null,
      defenseInterval60: dzCiRow ? { lo: dzCiRow.lo, hi: dzCiRow.hi } : null,
      ozPositionPct: round1(percentileOf(ozPos[r.position], r.ozWellPer60)),
      ozLeaguePct: round1(percentileOf(ozLeague, r.ozWellPer60)),
      dzPositionPct: round1(percentileOf(dzPos[r.position], -r.defensePer60)),
      dzLeaguePct: round1(percentileOf(dzLeague, -r.defensePer60)),
      reliability,
      scales,
      min82: STANDARD_5V5_MIN_82,
      trainedAt,
      trainingSeasons: [seasonDisplay],
      sourceVersion: `capandcrease/oz-dz@${seasonId}`,
    });

    const check = validateGravityProfileV4(profile, { playerId: String(r.id), season: seasonDisplay });
    if (check.ok) profiles.push(profile);
    else invalid.push({ id: r.id, name: r.name, issues: check.issues.map(i => `${i.path}: ${i.message}`) });
  }

  const envelope: GravityV4ArtifactEnvelope = {
    schemaVersion: "gravity-v4-profile-set/1",
    artifactKind: "fitted",
    generatedAt: new Date().toISOString(),
    profiles,
  };
  const envCheck = validateGravityV4ArtifactEnvelope(envelope);

  console.log(`  eligible + qualified (≥${MIN_TOI_MIN} min, positioned): ${pop.length}`);
  console.log(`  profiles VALID: ${profiles.length}${invalid.length ? ` · INVALID: ${invalid.length}` : ""}`);
  console.log(`  envelope: ${envCheck.ok ? "✓ valid" : "✗ INVALID — " + envCheck.issues.map(i => i.message).join("; ")}`);
  console.log(`  visual scales: zone ${scales.zoneXg82.toFixed(2)} · net ${scales.netXg82.toFixed(2)} xG/82`);
  if (invalid.length) {
    console.log(`\n  first invalid profiles:`);
    for (const bad of invalid.slice(0, 5)) console.log(`   #${bad.id} ${bad.name}: ${bad.issues.join(" | ")}`);
  }

  // A couple of sanity rows: best OZ and best DZ.
  const netOf = (pr: GravityProfileV4) => pr.netXg82;
  const topOz = [...profiles].sort((a, b) => b.zones.oz.xg82 - a.zones.oz.xg82)[0];
  const topDz = [...profiles].sort((a, b) => b.zones.dz.xg82 - a.zones.dz.xg82)[0];
  const show = (pr?: GravityProfileV4) => pr
    ? `${pr.playerName} — OZ ${pr.zones.oz.xg82.toFixed(1)} / DZ ${pr.zones.dz.xg82.toFixed(1)} / net ${netOf(pr).toFixed(1)} xG/82 · tier ${pr.tier ?? "—"} · ${pr.reliability}`
    : "—";
  console.log(`\n  top OZ:  ${show(topOz)}`);
  console.log(`  top DZ:  ${show(topDz)}`);

  // The COMMITTED artifact the app bundles (runtime-artifact.ts imports it). This
  // is the file to git-commit to publish; the display stays dark until the Vercel
  // env flag GRAVITY_V4_ENABLED=true is also set.
  const committed = path.join(process.cwd(), "app", "lib", "gravity-v4", "fitted-artifact.json");
  fs.writeFileSync(committed, JSON.stringify(envelope, null, 2) + "\n");
  console.log(`\n  wrote app/lib/gravity-v4/fitted-artifact.json (${profiles.length} profiles)`);
  console.log(`  Every profile is fitted-but-UNTIERED (NZ excluded ⇒ insufficient ⇒ no tier), diagnostic-only, X-NAV-free.`);
  console.log(`  TO PUBLISH: git add + commit this file, then set GRAVITY_V4_ENABLED=true in Vercel.`);
}

main();
