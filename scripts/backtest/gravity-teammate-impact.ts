/**
 * Gravity v3 — Teammate-Impact (WOWY) Validation
 *
 * THE DECISIVE EXPERIMENT
 *
 * Physical gravity is a mass's effect on *other* bodies. The stability
 * backtest showed v3 force is a stable trait but a poor predictor that
 * correlates 0.66 with the player's own on-ice result — so the open question
 * is whether force measures a real effect on TEAMMATES, or just re-states the
 * player's own production. This tests that directly.
 *
 * THE TARGET: teammate xG uplift, focal-excluded.
 *   withRate    = (OnIce_F_xG − I_F_xG) / onIce TOI     — xG the rest of the
 *                 unit generates while he is on the ice, HIS OWN SHOTS REMOVED.
 *   withoutRate = OffIce_F_xG / offIce TOI              — the team without him.
 *   uplift      = (withRate − withoutRate) × 3600       — per-60 WOWY delta.
 * 5v5 only. Off-ice TOI is derived from team ice time (Σ skater 5v5 TOI ÷ 5).
 *
 * THE CIRCULARITY CONTROL. Force's OZ term includes an on-off xG lift that
 * shares the on/off split with `uplift`, so a raw force→uplift correlation is
 * partly mechanical. `forceNoLift` recomputes force with that lift term removed
 * (built only from individual production, PP, suppression, PK — the player's
 * OWN skill). If forceNoLift STILL predicts teammate uplift, that is clean
 * evidence a player's individual quality lifts his linemates. If only full
 * force does, the relationship was the shared on-off math, not gravity.
 *
 * Reads the MoneyPuck season panel exactly like gravity-stability-backtest.
 *   npx tsx scripts/backtest/gravity-teammate-impact.ts <file|dir> [...]
 * A single season runs cross-sectional only; a multi-season panel adds the
 * predictive (N → N+1) test, which is the one that matters.
 */

import * as fs from "fs";
import * as path from "path";
import { computeGravity } from "../../app/lib/gravity";
import type { Asset } from "../../app/lib/trade-types";

const ROOT = process.cwd();
const MIN_GP = 20;
const DEFAULT_PANEL = "OtherData/HistoricalData/skaters_2008_to_2024.csv";
const SMOKE_FALLBACK = "OtherData/2025_26Data/2025_26_skaters.csv";

// ── CSV (same reader as the stability backtest) ──────────────────
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else { q = !q; } }
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}
interface Table { index: Map<string, number>; rows: string[][]; }
function readCsv(abs: string): Table {
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0].replace(/^﻿/, ""));
  return { index: new Map(header.map((h, i) => [h, i])), rows: lines.slice(1).map(splitCsvLine) };
}
const numOf = (v: string | undefined): number => { const n = v ? parseFloat(v) : NaN; return Number.isFinite(n) ? n : 0; };

interface SeasonRow {
  playerId: string; name: string; position: string; team: string; season: number; games: number;
  sit: Map<string, (c: string) => number>;
}
function pivot(t: Table): SeasonRow[] {
  const col = (r: string[], n: string) => numOf(r[t.index.get(n) ?? -1]);
  const str = (r: string[], n: string) => r[t.index.get(n) ?? -1] ?? "";
  const byKey = new Map<string, { meta: string[]; sits: Map<string, string[]> }>();
  for (const r of t.rows) {
    const pid = str(r, "playerId"), season = str(r, "season");
    if (!pid || !season) continue;
    const key = `${pid}:${season}`;
    let e = byKey.get(key);
    if (!e) { e = { meta: r, sits: new Map() }; byKey.set(key, e); }
    e.sits.set(str(r, "situation"), r);
  }
  const out: SeasonRow[] = [];
  for (const { meta, sits } of byKey.values()) {
    const all = sits.get("all") ?? meta;
    const sit = new Map<string, (c: string) => number>();
    for (const [code, r] of sits) sit.set(code, (c: string) => col(r, c));
    out.push({
      playerId: str(meta, "playerId"), name: str(meta, "name"),
      position: str(meta, "position").toUpperCase(), team: str(meta, "team").toUpperCase(),
      season: numOf(str(meta, "season")), games: col(all, "games_played"), sit,
    });
  }
  return out;
}

const sharePct = (f: number, a: number): number | null => (f + a > 0 ? (100 * f) / (f + a) : null);

// ── Gravity reconstruction (same as the stability backtest) ──────
function toAsset(r: SeasonRow, dropLift: boolean): Asset | null {
  const all = r.sit.get("all"); const es = r.sit.get("5on5");
  if (!all || r.games <= 0) return null;
  const isD = r.position === "D";
  const per82 = (v: number) => (v / r.games) * 82;
  const onXgf = es ? sharePct(es("OnIce_F_xGoals"), es("OnIce_A_xGoals")) : null;
  const offXgf = es ? sharePct(es("OffIce_F_xGoals"), es("OffIce_A_xGoals")) : null;
  const xgRelTM = dropLift ? null : (onXgf != null && offXgf != null ? onXgf - offXgf : null);
  const pp = r.sit.get("5on4"); const pk = r.sit.get("4on5"); const icetimeAll = all("icetime");
  return {
    id: `${r.playerId}-${r.season}`, name: r.name, position: isD ? "D" : "F", games: r.games,
    capHit: 0, yearsRemaining: 0,
    xgRelTM,
    baselineIxg82: per82(all("I_F_xGoals")),
    goalsPace: per82(all("I_F_goals")),
    assistsPace: per82(all("I_F_primaryAssists") + all("I_F_secondaryAssists")),
    ppPtsPace82: pp ? per82(pp("I_F_points")) : undefined,
    dzPct: (() => { const oz = all("I_F_oZoneShiftStarts"), dz = all("I_F_dZoneShiftStarts"); return oz + dz > 0 ? dz / (oz + dz) : undefined; })(),
    pkTimeShare: pk && icetimeAll > 0 ? pk("icetime") / icetimeAll : undefined,
    xgaRelTM: null, edgeOzPct: null, edgeSpeedMaxMph: null, edgeBurstsOver20: null,
  } as unknown as Asset;
}
const onIceXga60 = (r: SeasonRow): number | null => {
  const es = r.sit.get("5on5"); if (!es) return null;
  const toi = es("icetime"); return toi > 0 ? es("OnIce_A_xGoals") / (toi / 3600) : null;
};

// ── Teammate xG uplift, focal-excluded, 5v5 ──────────────────────
function teammateUplift(r: SeasonRow, teamTOI: number): number | null {
  const es = r.sit.get("5on5"); if (!es) return null;
  const onTOI = es("icetime"); const offTOI = teamTOI - onTOI;
  if (onTOI <= 0 || offTOI <= 0) return null;
  const withRate = (es("OnIce_F_xGoals") - es("I_F_xGoals")) / (onTOI / 3600);
  const withoutRate = es("OffIce_F_xGoals") / (offTOI / 3600);
  return withRate - withoutRate;
}

interface Rec {
  playerId: string; position: "F" | "D"; season: number; games: number;
  force: number; forceNoLift: number; uplift: number | null;
}
function recordsFor(rows: SeasonRow[]): Rec[] {
  // Team 5v5 ice time: five skaters on the ice each second, so the sum of
  // skater 5v5 TOI over a team-season is 5× the team's 5v5 time.
  const teamTOI = new Map<string, number>();
  for (const r of rows) {
    const es = r.sit.get("5on5"); if (!es) continue;
    const key = `${r.team}:${r.season}`;
    teamTOI.set(key, (teamTOI.get(key) ?? 0) + es("icetime"));
  }

  const staged = rows.flatMap(r => {
    const asset = toAsset(r, false); const assetNoLift = toAsset(r, true);
    return asset && assetNoLift ? [{ r, asset, assetNoLift, xga60: onIceXga60(r) }] : [];
  });
  // DZ proxy centered within (position, season), same as the stability backtest.
  const groups = new Map<string, typeof staged>();
  for (const s of staged) {
    if (s.xga60 == null) continue;
    const k = `${s.asset.position}:${s.r.season}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }
  for (const g of groups.values()) {
    const mean = g.reduce((a, s) => a + (s.xga60 as number), 0) / g.length;
    for (const s of g) { (s.asset as Asset).xgaRelTM = (s.xga60 as number) - mean; (s.assetNoLift as Asset).xgaRelTM = (s.xga60 as number) - mean; }
  }

  return staged.flatMap(({ r, asset, assetNoLift }) => {
    const g = computeGravity(asset); const gNoLift = computeGravity(assetNoLift);
    if (!g || !gNoLift) return [];
    return [{
      playerId: r.playerId, position: asset.position as "F" | "D", season: r.season, games: r.games,
      force: g.force, forceNoLift: gNoLift.force,
      uplift: teammateUplift(r, teamTOI.get(`${r.team}:${r.season}`) ?? 0),
    }];
  });
}

// ── Stats ────────────────────────────────────────────────────────
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length; if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
const fmt = (v: number) => (Number.isFinite(v) ? (v >= 0 ? " " : "") + v.toFixed(3) : "  —  ");

function resolveInputs(args: string[]): string[] {
  const raw = args.length ? args : [fs.existsSync(path.join(ROOT, DEFAULT_PANEL)) ? DEFAULT_PANEL : SMOKE_FALLBACK];
  const files: string[] = [];
  for (const a of raw) {
    const abs = path.isAbsolute(a) ? a : path.join(ROOT, a);
    if (!fs.existsSync(abs)) { console.error(`\n✗ No file or directory at ${a}\n`); process.exit(1); }
    if (fs.statSync(abs).isDirectory()) files.push(...fs.readdirSync(abs).filter(f => f.toLowerCase().endsWith(".csv")).map(f => path.join(abs, f)));
    else files.push(abs);
  }
  return files;
}

function main() {
  const files = resolveInputs(process.argv.slice(2));
  console.log(`\nGravity v3 — Teammate-Impact (WOWY) Validation`);
  console.log(`  source: ${files.length === 1 ? path.relative(ROOT, files[0]) : `${files.length} files`}`);

  const rows = files.flatMap(f => { const t = readCsv(f); return t.index.has("I_F_xGoals") ? pivot(t) : []; });
  const recs = recordsFor(rows);
  const bySeason = new Map<number, Rec[]>();
  for (const r of recs) { const l = bySeason.get(r.season) ?? []; l.push(r); bySeason.set(r.season, l); }
  const seasons = [...bySeason.keys()].sort((a, b) => a - b);

  const withUplift = recs.filter(r => r.uplift != null && r.games >= MIN_GP);
  console.log(`  ${seasons.length ? `${seasons[0]}–${seasons[seasons.length - 1]}` : "none"} · `
    + `${recs.length} player-seasons · ${withUplift.length} with a valid teammate-uplift (≥${MIN_GP} GP)\n`);

  const xsec = (label: string, rs: Rec[]) => {
    const ok = rs.filter(r => r.uplift != null);
    if (ok.length < 3) { console.log(`  ${label.padEnd(10)} n=${ok.length} — too few`); return; }
    const up = ok.map(r => r.uplift as number);
    console.log(`  ${label.padEnd(10)} n=${String(ok.length).padStart(5)}  `
      + `force~uplift r=${fmt(pearson(ok.map(r => r.force), up))}  `
      + `forceNoLift~uplift r=${fmt(pearson(ok.map(r => r.forceNoLift), up))}`);
  };

  console.log(`── CROSS-SECTIONAL (same season) `.padEnd(64, "─"));
  xsec("ALL", withUplift);
  xsec("Forwards", withUplift.filter(r => r.position === "F"));
  xsec("Defense", withUplift.filter(r => r.position === "D"));

  // Predictive: force_N → uplift_{N+1}, with uplift's own persistence for context.
  if (seasons.length >= 2) {
    type Pair = { pos: "F" | "D"; forceN: number; forceNoLiftN: number; upliftN: number; upliftN1: number };
    const pairs: Pair[] = [];
    for (let i = 0; i + 1 < seasons.length; i++) {
      if (seasons[i + 1] - seasons[i] !== 1) continue;
      const b = new Map(bySeason.get(seasons[i + 1])!.map(r => [r.playerId, r]));
      for (const a of bySeason.get(seasons[i])!) {
        const n1 = b.get(a.playerId);
        if (!n1 || a.games < MIN_GP || n1.games < MIN_GP) continue;
        if (a.uplift == null || n1.uplift == null) continue;
        pairs.push({ pos: a.position, forceN: a.force, forceNoLiftN: a.forceNoLift, upliftN: a.uplift, upliftN1: n1.uplift });
      }
    }
    const pred = (label: string, ps: Pair[]) => {
      if (ps.length < 3) { console.log(`  ${label.padEnd(10)} n=${ps.length} — too few`); return; }
      console.log(`  ${label.padEnd(10)} n=${String(ps.length).padStart(5)}  `
        + `force_N~uplift_N+1 r=${fmt(pearson(ps.map(p => p.forceN), ps.map(p => p.upliftN1)))}  `
        + `forceNoLift_N~uplift_N+1 r=${fmt(pearson(ps.map(p => p.forceNoLiftN), ps.map(p => p.upliftN1)))}  `
        + `[uplift persist r=${fmt(pearson(ps.map(p => p.upliftN), ps.map(p => p.upliftN1)))}]`);
    };
    console.log(`\n── PREDICTIVE (season N → N+1) `.padEnd(64, "─"));
    pred("ALL", pairs);
    pred("Forwards", pairs.filter(p => p.pos === "F"));
    pred("Defense", pairs.filter(p => p.pos === "D"));
  } else {
    console.log(`\n  Single season — cross-sectional only; run a multi-season panel for the predictive test.`);
  }

  console.log(`\n── HOW TO READ `.padEnd(64, "─"));
  console.log(`  uplift is the WOWY effect on TEAMMATES' 5v5 xG/60, with the focal player's own`);
  console.log(`  shots removed — a real effect-on-others, not his own production.`);
  console.log(`  • force~uplift alone is partly mechanical: force's on-off lift term shares the`);
  console.log(`    on/off split with uplift.`);
  console.log(`  • forceNoLift~uplift is the clean signal — force rebuilt from the player's OWN`);
  console.log(`    production/suppression only. If THIS is positive and holds N→N+1, gravity is`);
  console.log(`    measuring a real teammate effect. If it collapses to ~0, v3 is not — the case`);
  console.log(`    for the v4 focal-excluded rebuild.`);
  console.log(`  • uplift persist shows whether teammate uplift is itself stable enough to predict.\n`);
}

main();
