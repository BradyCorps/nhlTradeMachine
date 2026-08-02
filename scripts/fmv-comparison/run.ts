// ── FMV comparison — old curve vs fitted model, on real players ──
//
//   npx tsx scripts/fmv-comparison/run.ts
//   npx tsx scripts/fmv-comparison/run.ts --limit 40      # shorter tables
//   npx tsx scripts/fmv-comparison/run.ts --json out.json # machine-readable too
//   npx tsx scripts/fmv-comparison/run.ts --raw           # skip the multi-year prior
//
// WHY THIS EXISTS
//
// The fitted FMV models were validated against contracts (walk-forward, ±$1.4M),
// but never against the app's own roster. Those are different questions. The
// validation asks "does this predict what clubs paid?"; this asks "what happens
// to the numbers on screen when we swap the curve out?" — which is the one that
// decides whether the change is safe to keep.
//
// The goalie model is already wired into `calcGoalieNAV`. The skater model is
// NOT wired in, so this reports what it WOULD do. Nothing here writes anything.
//
// WHAT TO LOOK FOR IN THE OUTPUT
//
//   1. The biggest movers. A change of a few hundred thousand is noise; a
//      player who moves $4M wants a reason you can say out loud.
//   2. Contracts you know are fair reading as badly under- or over-paid. That
//      is the model disagreeing with the market on a case where the market is
//      not in doubt.
//   3. The out-of-domain count. Those are players whose inputs fall outside the
//      range the model was fitted over, so their price is a clamp rather than a
//      read. A handful is expected; a large share means the app's data does not
//      look like the contracts the model learned from.
//   4. Direction by role. The goalie fit is known to over-price tandems and
//      backups by $2-3M — check whether that shows up here at the size the
//      contract validation suggested.
//
// Run it, eyeball it, and send the output back. The numbers that matter are the
// disagreements, not the averages.

import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import { calcNAV } from "@/app/lib/xnav-engine";
import { SEASON } from "@/app/lib/season-config";
import {
  skaterFmvAav, unitForPosition,
  skaterFmvDomainReport, SKATER_FMV_VALIDATION,
} from "@/app/lib/skater-fmv";
import { skaterSeasonPrior } from "@/app/lib/skater-prior";
import {
  goalieFmvAav, isInDomain as goalieInDomain, FMV_VALIDATION as GOALIE_VALIDATION,
} from "@/app/lib/goalie-fmv";
import { reliability } from "@/app/lib/goalie-percentiles";
import type { Asset } from "@/app/lib/trade-types";

const CAP = SEASON.capCeiling;
const GOALIE_SEASON_MINUTES = 3500;

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
};
const LIMIT = Number(arg("--limit") ?? 25);

const money = (n: number | null | undefined) => n == null ? "    —" : `$${n.toFixed(2)}M`.padStart(8);
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;

interface Row {
  name: string; team: string; pos: string; age: number;
  capHit: number; years: number;
  engineFmv: number | null;      // what the app currently shows
  modelFmv: number | null;       // what the fitted model says
  delta: number | null;
  inDomain: boolean;
  nav: number;
  /** How much of the pooled production estimate survived, 0-1. Skaters only. */
  belief?: number;
  /** True when even the pooled sample is short of a full season. */
  thin?: boolean;
  /** Dollars the domain clamp withheld. Skaters only. */
  clampCostM?: number;
  /** True when that clamp moved the price by more than the model's own error. */
  material?: boolean;
  /** Which features were clamped, if any. */
  clampedOn?: string | null;
}

/**
 * The features the skater model wants, pooled across seasons.
 *
 * The first run of this script fed the model a raw single season and produced
 * Matthews at $8.30M off a 67-game year. `skater-prior.ts` pools that season
 * against the player's multi-season baseline and shrinks a thin sample, which
 * is what the goalie path already did. `--raw` restores the old behaviour so
 * the two can be read side by side.
 */
const RAW = process.argv.includes("--raw");

function skaterFeatures(a: Asset): { pts60: number | null; minutesPerGame: number | null; belief: number; thin: boolean } {
  const unit = unitForPosition(a.position);
  const toiPerGame = a.avgTOI;
  if (RAW) {
    const pts60 = toiPerGame && toiPerGame > 0 && a.ptsPace != null && isFinite(a.ptsPace)
      ? a.ptsPace / ((toiPerGame * 82) / 60)
      : null;
    return { pts60, minutesPerGame: toiPerGame ?? null, belief: 1, thin: false };
  }
  const p = skaterSeasonPrior({
    unit,
    ptsPace: a.ptsPace,
    minutesPerGame: toiPerGame,
    games: a.games,
    baselinePtsPace: a.baselinePtsPace,
    baselineSeasonsWeighted: (a as any).baselineSeasonsWeighted,
  });
  return { pts60: p.pts60, minutesPerGame: p.minutesPerGame, belief: p.belief, thin: p.thin };
}

async function main() {
  console.log("Assembling the canonical roster — this hits the live feeds and takes a minute.\n");
  const db = await assembleCanonicalRoster();
  const players: Asset[] = (db as any).players ?? [];
  if (players.length === 0) {
    console.error("No players came back. Check the data sources are reachable.");
    process.exit(1);
  }

  // ── Refuse to report on data that is not there ────────────────
  //
  // Without the live feeds `assembleCanonicalRoster` still returns a roster —
  // DB fallback rows with no contract, no position and no stats. The tables
  // below render perfectly well from that and are entirely meaningless, which
  // is worse than an error. Checked here so a bad run announces itself instead
  // of producing a page of zeroes worth acting on.
  const withCap = players.filter(p => (p.capHit ?? 0) > 0).length;
  const withStats = players.filter(p => (p.games ?? 0) > 0).length;
  const withGoalies = players.filter(p => p.position === "G").length;
  const pct = (n: number) => `${((n / players.length) * 100).toFixed(0)}%`;

  console.log(`Roster: ${players.length} players — ${withCap} with a cap hit (${pct(withCap)}), ` +
              `${withStats} with games played (${pct(withStats)}), ${withGoalies} goalies.`);

  const problems: string[] = [];
  if (withCap < players.length * 0.5) problems.push(`only ${pct(withCap)} have a cap hit — the contract source did not load`);
  if (withStats < players.length * 0.5) problems.push(`only ${pct(withStats)} have games played — the stats source did not load`);
  if (withGoalies < 40) problems.push(`only ${withGoalies} goalies — expected ~60-90, so the roster feed is incomplete`);
  if (problems.length > 0) {
    console.error("\nRefusing to report. The roster came back without the data this compares:\n");
    for (const p2 of problems) console.error(`  • ${p2}`);
    console.error("\nThis usually means the live feeds were unreachable. Check network access to");
    console.error("moneypuck.com and api-web.nhle.com, and that the database is configured, then rerun.");
    process.exit(1);
  }

  const skaters: Row[] = [];
  const goalies: Row[] = [];

  for (const p of players) {
    if (p.position === "Pick") continue;
    const nav = calcNAV(p as any);
    const engineFmv = nav.fmvAav ?? null;

    if (p.position === "G") {
      // Mirror what calcGoalieNAV now does, so the comparison is apples to apples.
      const ice = p.iceTimeSeconds && p.iceTimeSeconds > 0
        ? p.iceTimeSeconds
        : Math.max(1, p.gamesStarted ?? p.games ?? 0) * 58 * 60;
      const rawPer60 = ((p.gsax ?? 0) * 3600) / ice;
      const career = (p as any).baselineGsax
        ? ((p as any).baselineGsax * 3600) / (GOALIE_SEASON_MINUTES * 60)
        : null;
      const blended = career != null ? (rawPer60 + career * 2) / 3 : rawPer60;
      const effIce = career != null ? ice * 3 : ice;
      const input = {
        gsax: blended * reliability("gsaxPer60", effIce),
        iceTimeSeconds: ice,
        age: p.age,
        isUfa: p.age + (p.yearsRemaining ?? 0) > 27,
      };
      const modelFmv = goalieFmvAav(input, CAP);
      goalies.push({
        name: p.name, team: p.teamId, pos: "G", age: p.age,
        capHit: p.capHit, years: p.yearsRemaining,
        engineFmv, modelFmv,
        delta: engineFmv != null && modelFmv != null ? modelFmv - engineFmv : null,
        inDomain: goalieInDomain(input),
        nav: nav.total,
      });
      continue;
    }

    const f = skaterFeatures(p);
    const input = {
      pts60: f.pts60,
      minutesPerGame: f.minutesPerGame,
      age: p.age,
      isUfa: p.age + (p.yearsRemaining ?? 0) > 27,
      unit: unitForPosition(p.position),
    };
    const modelFmv = skaterFmvAav(input, CAP);
    const domain = skaterFmvDomainReport(input);
    skaters.push({
      name: p.name, team: p.teamId, pos: p.position, age: p.age,
      capHit: p.capHit, years: p.yearsRemaining,
      engineFmv, modelFmv,
      delta: engineFmv != null && modelFmv != null ? modelFmv - engineFmv : null,
      inDomain: domain.inDomain,
      nav: nav.total,
      belief: f.belief, thin: f.thin,
      clampCostM: domain.withheldCapPct * CAP,
      material: domain.material,
      clampedOn: domain.findings.map(x => x.feature).join("+") || null,
    });
  }

  const report = (label: string, rows: Row[], mae: number) => {
    const priced = rows.filter(r => r.delta != null);
    const deltas = priced.map(r => r.delta!).sort((a, b) => a - b);
    const mean = deltas.reduce((s, d) => s + d, 0) / (deltas.length || 1);
    const median = deltas[Math.floor(deltas.length / 2)] ?? 0;
    const outside = rows.filter(r => !r.inDomain).length;

    console.log(`\n${"═".repeat(78)}`);
    console.log(`${label} — ${rows.length} players, ${priced.length} priced by both`);
    console.log("═".repeat(78));
    console.log(`  model minus engine:  mean ${signed(mean)}M   median ${signed(median)}M`);
    console.log(`  spread:              p10 ${signed(deltas[Math.floor(deltas.length * 0.1)] ?? 0)}M   p90 ${signed(deltas[Math.floor(deltas.length * 0.9)] ?? 0)}M`);
    console.log(`  outside fitted domain: ${outside} of ${rows.length}  ${outside > rows.length * 0.15 ? "← HIGH, the app's data may not look like the contracts" : ""}`);
    // A clamp is only worth reading about when it moved the price. Age 18 is
    // out of domain and costs $0.30M; a mis-scaled input is out of domain and
    // costs ten million. Counting them together taught nothing.
    const material = rows.filter(r => r.material);
    if (rows.some(r => r.material != null)) {
      console.log(`    of those, ${material.length} clamped by more than the model's own error${material.length ? ":" : " — the rest are footnotes"}`);
      for (const r of material.slice(0, 8)) {
        console.log(`      ${r.name.slice(0, 23).padEnd(24)} clamped on ${String(r.clampedOn).padEnd(10)} withheld $${r.clampCostM!.toFixed(2)}M`);
      }
    }
    console.log(`  model's own walk-forward error: ±$${(mae * CAP).toFixed(2)}M`);

    const big = priced.filter(r => Math.abs(r.delta!) > mae * CAP * 2)
      .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!));
    console.log(`\n  Biggest movers — beyond twice the model's own error (${big.length} of ${priced.length}):`);
    console.log(`  ${"player".padEnd(24)}${"tm".padEnd(5)}${"pos".padEnd(5)}${"age".padEnd(5)}${"paid".padStart(8)}${"engine".padStart(9)}${"model".padStart(9)}${"move".padStart(9)}  flags`);
    for (const r of big.slice(0, LIMIT)) {
      const flags = [
        !r.inDomain ? "OUT-OF-DOMAIN" : "",
        r.thin ? `THIN (belief ${r.belief!.toFixed(2)})` : "",
        r.modelFmv != null && r.modelFmv - r.capHit > 3 ? "model says bargain" : "",
        r.modelFmv != null && r.capHit - r.modelFmv > 3 ? "model says overpaid" : "",
      ].filter(Boolean).join(" · ");
      console.log(`  ${r.name.slice(0, 23).padEnd(24)}${r.team.padEnd(5)}${r.pos.padEnd(5)}${String(r.age).padEnd(5)}${money(r.capHit)}${money(r.engineFmv)}${money(r.modelFmv)}${signed(r.delta!).padStart(9)}  ${flags}`);
    }
    if (big.length > LIMIT) console.log(`  … ${big.length - LIMIT} more`);
  };

  report(`SKATERS — model is NOT wired in; this is what it would do${RAW ? " (--raw: no multi-year prior)" : ""}`, skaters,
    (SKATER_FMV_VALIDATION.F.maeCapPct + SKATER_FMV_VALIDATION.D.maeCapPct) / 2);

  if (!RAW) {
    const withPrior = skaters.filter(r => r.belief != null);
    const thin = withPrior.filter(r => r.thin).length;
    const shrunk = withPrior.filter(r => (r.belief ?? 1) < 0.95).length;
    console.log(`\n  Multi-year prior: ${withPrior.length} skaters pooled, ${thin} still short of a full season,`);
    console.log(`  ${shrunk} shrunk toward the population by more than 5%. Rerun with --raw to price off`);
    console.log(`  the single season instead and diff the two.`);
  }
  report("GOALIES — model IS wired in; engine FMV already reflects it", goalies,
    GOALIE_VALIDATION.maeCapPct);

  // Sanity anchor: the highest-paid players should read as roughly fairly paid.
  console.log(`\n${"═".repeat(78)}`);
  console.log("Highest-paid players — a fair contract should price near what it costs");
  console.log("═".repeat(78));
  console.log(`  ${"player".padEnd(24)}${"pos".padEnd(5)}${"paid".padStart(8)}${"model".padStart(9)}${"gap".padStart(9)}`);
  for (const r of [...skaters, ...goalies].sort((a, b) => b.capHit - a.capHit).slice(0, 15)) {
    const gap = r.modelFmv != null ? r.modelFmv - r.capHit : null;
    console.log(`  ${r.name.slice(0, 23).padEnd(24)}${r.pos.padEnd(5)}${money(r.capHit)}${money(r.modelFmv)}${gap == null ? "     —" : signed(gap).padStart(9)}`);
  }

  const jsonPath = arg("--json");
  if (jsonPath) {
    const fs = await import("fs");
    fs.writeFileSync(jsonPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      capCeiling: CAP,
      skaters, goalies,
    }, null, 2));
    console.log(`\nwrote ${jsonPath}`);
  }
  console.log("\nSend the tables back — the disagreements are the point, not the averages.");
}

main().catch(e => { console.error(e); process.exit(1); });
