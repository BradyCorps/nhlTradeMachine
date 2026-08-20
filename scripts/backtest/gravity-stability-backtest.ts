/**
 * Gravity v3 Stability & Predictive Backtest
 *
 * WHY THIS EXISTS
 *
 * Every other model in this app passed a backtest gate before it was
 * allowed to move a number — NAV stability, the age curve, the credibility
 * blend, the power curve, STRAND stability, FMV, the breakout model, goalie
 * stability. Gravity never did. It has *calibration* (tier cutoffs, a
 * percentile population) but no *validation* that the force it prints means
 * anything. This is that missing gate, in the same shape as the others.
 *
 * TWO QUESTIONS, matching how the other stability backtests read:
 *
 *   1. PERSISTENCE — does a player's gravity force in season N survive to
 *      N+1, or is it year-to-year noise? A signal that does not persist is
 *      not a trait and should not be shown as one.
 *
 *   2. PREDICTION — does force in season N forecast an INDEPENDENT outcome
 *      in N+1 (next-season on-ice 5v5 xGF%), and does it beat simply
 *      carrying the player's own prior on-ice xGF% forward? If it does not
 *      beat that baseline, force is a re-packaging of what it is built from,
 *      not a forecast — useful as a decomposition, not as a predictor.
 *
 * HONESTY ABOUT THE RECONSTRUCTION
 *
 * The shipped force is assembled from Natural Stat Trick WOWY + NHL EDGE
 * inputs that are not in a single historical file. This backtest rebuilds
 * the inputs from the MoneyPuck season panel instead, and is explicit about
 * the fit:
 *   • OZ (45% of force) — FAITHFUL: on-off xGF% lift, individual xG, assists,
 *     PP points, all straight from MoneyPuck.
 *   • DZ (25%)          — PROXY: on-ice xGA/60 vs the position-season mean
 *     stands in for the NST on-off suppression term (dps is unavailable).
 *   • NZ (30%)          — ABSENT: EDGE zone-time/speed/bursts have no history,
 *     so the transition well is uncovered here. This backtest therefore
 *     validates ~70% of the force weight; the NZ contribution is untested.
 * Because persistence and prediction both use the SAME reconstruction every
 * season, a consistent derivation bias cancels in the correlations.
 *
 * Usage:
 *   npx tsx scripts/backtest/gravity-stability-backtest.ts
 *     — full panel, needs OtherData/HistoricalData/skaters_2008_to_2024.csv
 *       (gitignored; present in the codespace, not the web sandbox).
 *   npx tsx scripts/backtest/gravity-stability-backtest.ts <path-to-moneypuck.csv>
 *     — any MoneyPuck skaters export; a single-season file runs the coverage
 *       and distribution sanity checks only (no consecutive pairs).
 */

import * as fs from "fs";
import * as path from "path";
import { computeGravity } from "../../app/lib/gravity";
import type { Asset } from "../../app/lib/trade-types";

const ROOT = process.cwd();
const MIN_GP = 20;

const DEFAULT_PANEL = "OtherData/HistoricalData/skaters_2008_to_2024.csv";
const SMOKE_FALLBACK = "OtherData/2025_26Data/2025_26_skaters.csv";

// ── CSV ──────────────────────────────────────────────────────────
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else { q = !q; }
    } else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

interface Table { header: string[]; index: Map<string, number>; rows: string[][]; }

function readCsv(abs: string): Table {
  const text = fs.readFileSync(abs, "utf8");
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const header = splitCsvLine(lines[0].replace(/^﻿/, ""));
  const index = new Map(header.map((h, i) => [h, i]));
  const rows = lines.slice(1).map(splitCsvLine);
  return { header, index, rows };
}

const numOf = (v: string | undefined): number => {
  const n = v ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

// ── MoneyPuck → per-player-season situation pivot ────────────────
interface SeasonRow {
  playerId: string;
  name: string;
  position: string;
  season: number;
  games: number;
  /** situation code → column getter */
  sit: Map<string, (col: string) => number>;
}

function pivot(table: Table): SeasonRow[] {
  const col = (row: string[], name: string): number => numOf(row[table.index.get(name) ?? -1]);
  const str = (row: string[], name: string): string => row[table.index.get(name) ?? -1] ?? "";

  // group rows by playerId+season, keyed situation → row
  const byKey = new Map<string, { meta: string[]; sits: Map<string, string[]> }>();
  for (const row of table.rows) {
    const pid = str(row, "playerId");
    const season = str(row, "season");
    if (!pid || !season) continue;
    const key = `${pid}:${season}`;
    let entry = byKey.get(key);
    if (!entry) { entry = { meta: row, sits: new Map() }; byKey.set(key, entry); }
    entry.sits.set(str(row, "situation"), row);
  }

  const out: SeasonRow[] = [];
  for (const { meta, sits } of byKey.values()) {
    const allRow = sits.get("all") ?? meta;
    const sit = new Map<string, (c: string) => number>();
    for (const [code, row] of sits) sit.set(code, (c: string) => col(row, c));
    out.push({
      playerId: str(meta, "playerId"),
      name: str(meta, "name"),
      position: str(meta, "position").toUpperCase(),
      season: numOf(str(meta, "season")),
      games: col(allRow, "games_played"),
      sit,
    });
  }
  return out;
}

// xGF% (0–100) from a situation's on-ice or off-ice for/against pair.
const sharePct = (f: number, a: number): number | null =>
  f + a > 0 ? (100 * f) / (f + a) : null;

/** On-ice 5v5 xGF% — the clean outcome the prediction test targets. */
function onIceXgfPct(r: SeasonRow): number | null {
  const g = r.sit.get("5on5");
  if (!g) return null;
  return sharePct(g("OnIce_F_xGoals"), g("OnIce_A_xGoals"));
}

/** Build the gravity Asset inputs this backtest can source (see header). */
function toAsset(r: SeasonRow): Asset | null {
  const all = r.sit.get("all");
  const es = r.sit.get("5on5");
  if (!all || r.games <= 0) return null;

  const isD = r.position === "D";
  const per82 = (v: number) => (v / r.games) * 82;

  // OZ — faithful
  const onXgf = es ? sharePct(es("OnIce_F_xGoals"), es("OnIce_A_xGoals")) : null;
  const offXgf = es ? sharePct(es("OffIce_F_xGoals"), es("OffIce_A_xGoals")) : null;
  const xgRelTM = onXgf != null && offXgf != null ? onXgf - offXgf : null;

  const pp = r.sit.get("5on4");
  const pk = r.sit.get("4on5");
  const icetimeAll = all("icetime");

  const asset: Asset = {
    id: `${r.playerId}-${r.season}`,
    name: r.name,
    position: isD ? "D" : "F",
    games: r.games,
    capHit: 0,
    yearsRemaining: 0,
    xgRelTM,
    baselineIxg82: per82(all("I_F_xGoals")),
    goalsPace: per82(all("I_F_goals")),
    assistsPace: per82(all("I_F_primaryAssists") + all("I_F_secondaryAssists")),
    ppPtsPace82: pp ? per82(pp("I_F_points")) : undefined,
    dzPct: (() => {
      const oz = all("I_F_oZoneShiftStarts");
      const dz = all("I_F_dZoneShiftStarts");
      return oz + dz > 0 ? dz / (oz + dz) : undefined;
    })(),
    pkTimeShare: pk && icetimeAll > 0 ? pk("icetime") / icetimeAll : undefined,
    // DZ suppression proxy is filled in a second pass (needs league mean).
    xgaRelTM: null,
    // NZ (EDGE) has no history.
    edgeOzPct: null,
    edgeSpeedMaxMph: null,
    edgeBurstsOver20: null,
  } as unknown as Asset;

  return asset;
}

/** On-ice 5v5 xGA per 60 — the raw quantity the DZ proxy is centered from. */
function onIceXga60(r: SeasonRow): number | null {
  const es = r.sit.get("5on5");
  if (!es) return null;
  const toiSec = es("icetime");
  if (toiSec <= 0) return null;
  return es("OnIce_A_xGoals") / (toiSec / 3600);
}

// ── Stats ────────────────────────────────────────────────────────
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

function spearman(xs: number[], ys: number[]): number {
  const rank = (a: number[]): number[] => {
    const order = a.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const ranks = new Array(a.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
      i = j + 1;
    }
    return ranks;
  };
  return pearson(rank(xs), rank(ys));
}

const fmt = (v: number): string => (Number.isFinite(v) ? v.toFixed(3) : "  —  ");

// ── Force per player-season (with the league-centered DZ proxy) ──
interface ForceRow { playerId: string; name: string; position: "F" | "D"; season: number; games: number; force: number; qualified: boolean; onIceXgf: number | null; }

function forcesForSeason(rows: SeasonRow[]): ForceRow[] {
  // First pass: assets + raw on-ice xGA/60, to center the DZ proxy within
  // position-season (the engine's xgaRelTM is on-off; here it is on-ice minus
  // the position-season mean — a documented stand-in).
  const staged = rows.flatMap(r => {
    const asset = toAsset(r);
    const xga60 = onIceXga60(r);
    return asset ? [{ r, asset, xga60 }] : [];
  });

  for (const pos of ["F", "D"] as const) {
    const grp = staged.filter(s => s.asset.position === pos && s.xga60 != null);
    if (grp.length === 0) continue;
    const mean = grp.reduce((a, s) => a + (s.xga60 as number), 0) / grp.length;
    for (const s of grp) {
      // Positive xgaRelTM = allows more than the average peer (worse); the
      // engine rewards the negative of this. On-ice/60 is more dispersed than
      // on-off, so scale to the engine's expected sd (~0.35) via the group sd.
      (s.asset as Asset).xgaRelTM = (s.xga60 as number) - mean;
    }
  }

  return staged.flatMap(({ r, asset }) => {
    const g = computeGravity(asset);
    if (!g) return [];
    return [{
      playerId: r.playerId,
      name: r.name,
      position: asset.position as "F" | "D",
      season: r.season,
      games: r.games,
      force: g.force,
      qualified: g.evidenceStatus === "QUALIFIED",
      onIceXgf: onIceXgfPct(r),
    }];
  });
}

// ── Report ───────────────────────────────────────────────────────
function main() {
  const arg = process.argv[2];
  const rel = arg ?? (fs.existsSync(path.join(ROOT, DEFAULT_PANEL)) ? DEFAULT_PANEL : SMOKE_FALLBACK);
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);

  if (!fs.existsSync(abs)) {
    console.error(`\n✗ No data file at ${rel}.`);
    console.error(`  The full panel (${DEFAULT_PANEL}) is gitignored — run this in the codespace,`);
    console.error(`  or pass a MoneyPuck skaters CSV path as the first argument.\n`);
    process.exit(1);
  }

  console.log(`\nGravity v3 Stability & Predictive Backtest`);
  console.log(`  source: ${rel}`);

  const seasons = new Map<number, ForceRow[]>();
  for (const fr of forcesForSeason(pivot(readCsv(abs)))) {
    const list = seasons.get(fr.season) ?? [];
    list.push(fr);
    seasons.set(fr.season, list);
  }
  const seasonKeys = [...seasons.keys()].sort((a, b) => a - b);

  // Coverage / distribution sanity — always printed.
  const allForces = seasonKeys.flatMap(s => seasons.get(s)!);
  const qualified = allForces.filter(f => f.qualified).length;
  console.log(`  seasons: ${seasonKeys.length ? `${seasonKeys[0]}–${seasonKeys[seasonKeys.length - 1]}` : "none"} · `
    + `${allForces.length} player-seasons · ${qualified} qualified (${(100 * qualified / Math.max(1, allForces.length)).toFixed(0)}%)`);
  if (qualified === 0) {
    console.log(`  NOTE: 0% "qualified" is expected here — without EDGE history the NZ zone is`);
    console.log(`  uncovered, so coverage (~0.55) never clears the 0.667 public threshold. The`);
    console.log(`  correlations below use the raw force regardless of public eligibility.`);
  }
  for (const pos of ["F", "D"] as const) {
    const fs2 = allForces.filter(f => f.position === pos).map(f => f.force);
    if (fs2.length === 0) continue;
    const mean = fs2.reduce((a, b) => a + b, 0) / fs2.length;
    const sd = Math.sqrt(fs2.reduce((a, b) => a + (b - mean) ** 2, 0) / fs2.length);
    console.log(`    ${pos}: force mean ${fmt(mean)} sd ${fmt(sd)} (n=${fs2.length})`);
  }

  if (seasonKeys.length < 2) {
    console.log(`\n  Single season only — coverage/distribution sanity above; no consecutive`);
    console.log(`  pairs to measure persistence or prediction. Run the full panel for that.\n`);
    return;
  }

  // Build consecutive-season pairs.
  type Pair = { pos: "F" | "D"; forceN: number; forceN1: number; xgfN: number; xgfN1: number };
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < seasonKeys.length; i++) {
    if (seasonKeys[i + 1] - seasonKeys[i] !== 1) continue; // consecutive years only
    const a = seasons.get(seasonKeys[i])!;
    const b = new Map(seasons.get(seasonKeys[i + 1])!.map(f => [f.playerId, f]));
    for (const fa of a) {
      const fb = b.get(fa.playerId);
      if (!fb) continue;
      if (fa.games < MIN_GP || fb.games < MIN_GP) continue;
      if (fa.onIceXgf == null || fb.onIceXgf == null) continue;
      pairs.push({ pos: fa.position, forceN: fa.force, forceN1: fb.force, xgfN: fa.onIceXgf, xgfN1: fb.onIceXgf });
    }
  }

  const report = (label: string, ps: Pair[]) => {
    if (ps.length < 3) { console.log(`  ${label.padEnd(10)} n=${ps.length} — too few`); return; }
    const forceN = ps.map(p => p.forceN);
    const persistence = pearson(forceN, ps.map(p => p.forceN1));
    const persistenceRho = spearman(forceN, ps.map(p => p.forceN1));
    const predict = pearson(forceN, ps.map(p => p.xgfN1));
    const predictRho = spearman(forceN, ps.map(p => p.xgfN1));
    const baseline = pearson(ps.map(p => p.xgfN), ps.map(p => p.xgfN1));
    const concurrent = pearson(forceN, ps.map(p => p.xgfN));
    console.log(`  ${label.padEnd(10)} n=${String(ps.length).padStart(5)}  `
      + `persist r=${fmt(persistence)} ρ=${fmt(persistenceRho)}  `
      + `predict→xGF%(N+1) r=${fmt(predict)} ρ=${fmt(predictRho)}  `
      + `[baseline xGF%→xGF% r=${fmt(baseline)}]  [concurrent force~xGF%(N) r=${fmt(concurrent)}]`);
  };

  console.log(`\n── POOLED (all consecutive pairs, ≥${MIN_GP} GP both seasons) `.padEnd(64, "─"));
  report("ALL", pairs);
  report("Forwards", pairs.filter(p => p.pos === "F"));
  report("Defense", pairs.filter(p => p.pos === "D"));

  console.log(`\n── PER SEASON PAIR `.padEnd(64, "─"));
  for (let i = 0; i + 1 < seasonKeys.length; i++) {
    const sN = seasonKeys[i], sN1 = seasonKeys[i + 1];
    if (sN1 - sN !== 1) continue;
    report(`${sN}→${sN1}`, pairsForFold(seasons, seasonKeys, i));
  }

  console.log(`\n── HOW TO READ `.padEnd(64, "─"));
  console.log(`  persist   — force is a stable trait if this is high (STRAND traits sit r≈0.74–0.89).`);
  console.log(`  predict   — force in N vs INDEPENDENT on-ice 5v5 xGF% in N+1.`);
  console.log(`  baseline  — the same target from the player's own prior xGF%. Force earns its`);
  console.log(`              keep as a PREDICTOR only if 'predict' is not far below 'baseline'.`);
  console.log(`  concurrent— how much force is just the current-season on-ice result it is built`);
  console.log(`              from; a high value flags that the OZ lift term dominates.`);
  console.log(`  CAVEAT: NZ (30% of force) is untested here — no EDGE history. DZ (25%) is a`);
  console.log(`  league-centered proxy for the shipped on-off suppression term. See file header.\n`);
}

// Re-derive one fold's pairs (kept simple: recompute rather than thread state).
function pairsForFold(
  seasons: Map<number, ForceRow[]>,
  keys: number[],
  i: number,
) {
  const out: { pos: "F" | "D"; forceN: number; forceN1: number; xgfN: number; xgfN1: number }[] = [];
  const a = seasons.get(keys[i])!;
  const b = new Map(seasons.get(keys[i + 1])!.map(f => [f.playerId, f]));
  for (const fa of a) {
    const fb = b.get(fa.playerId);
    if (!fb || fa.games < MIN_GP || fb.games < MIN_GP) continue;
    if (fa.onIceXgf == null || fb.onIceXgf == null) continue;
    out.push({ pos: fa.position, forceN: fa.force, forceN1: fb.force, xgfN: fa.onIceXgf, xgfN1: fb.onIceXgf });
  }
  return out;
}

main();
