// ── STRAND Trait Stability Backtest ────────────────────────────
// Tests year-to-year persistence of each STRAND dimension for
// skaters, mirroring the goalie stability backtest. Measures which
// player identity traits (scoring pace, chance creation, suppression,
// usage trust, deployment) are real repeatable signals and which are
// noise that should be regressed.
//
// Run: npx tsx scripts/backtest/strand-stability-backtest.ts

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const MIN_GP = 20;
const MIN_ICE_PER_GAME = 300; // 5 min in seconds — filter out cameo callups

// ── CSV reader ────────────────────────────────────────────────
type Row = Record<string, string>;
function readCsv(rel: string): Row[] {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rawHead = lines[0];
  const head = rawHead.replace(/^﻿/, "").split(",").map(h => h.replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const cells = line.split(",").map(c => c.replace(/^"|"$/g, ""));
    const row: Row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

// ── Load skater seasons ───────────────────────────────────────
interface SkaterSeason {
  playerId: string;
  name: string;
  season: number;
  position: string;
  gp: number;
  ice: number; // total seconds
  // Trait raw values
  ptsPace: number;      // pts/82
  xgPace: number;       // xGoals/82
  avgTOI: number;       // minutes per game
  xgRelTM: number;      // NOIV: on-ice vs off-ice xG%
  xgaRelTM: number;     // SUPP: on-ice vs off-ice xGA rate
  iceTimeRank: number;  // avg per-game ice time rank
  dzPct: number;        // defensive zone start share (5on5)
  ozPct: number;        // offensive zone start share (5on5)
}

// We need both "all" and "5on5" situation rows for each player-season
interface AllSitRow {
  playerId: string;
  name: string;
  season: number;
  position: string;
  gp: number;
  ice: number;
  pts: number;
  xGoals: number;
  onIceFxG: number;
  offIceFxG: number;
  onIceAxG: number;
  offIceAxG: number;
  iceTimeRank: number;
}

interface FiveOnFiveRow {
  playerId: string;
  season: number;
  oZoneStarts: number;
  dZoneStarts: number;
}

const allSitData = new Map<string, Map<number, AllSitRow>>();
const fiveOnFiveData = new Map<string, Map<number, FiveOnFiveRow>>();

for (const rel of [
  "OtherData/HistoricalData/skaters_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_skaters.csv",
]) {
  try {
    for (const r of readCsv(rel)) {
      const situation = String(r.situation ?? "").trim();
      const pid = String(r.playerId);
      const season = Number(r.season);
      const pos = String(r.position ?? "").trim();

      if (situation === "all") {
        const gp = Number(r.games_played);
        const ice = Number(r.icetime);
        if (!(gp >= MIN_GP) || !(ice > 0)) continue;
        if (pos === "G") continue;
        if (ice / gp < MIN_ICE_PER_GAME) continue;

        if (!allSitData.has(pid)) allSitData.set(pid, new Map());
        allSitData.get(pid)!.set(season, {
          playerId: pid,
          name: String(r.name),
          season,
          position: pos,
          gp,
          ice,
          pts: Number(r.I_F_points) || 0,
          xGoals: Number(r.I_F_xGoals) || 0,
          onIceFxG: Number(r.OnIce_F_xGoals) || 0,
          offIceFxG: Number(r.OffIce_F_xGoals) || 0,
          onIceAxG: Number(r.OnIce_A_xGoals) || 0,
          offIceAxG: Number(r.OffIce_A_xGoals) || 0,
          iceTimeRank: Number(r.iceTimeRank) || 0,
        });
      } else if (situation === "5on5") {
        const oZone = Number(r.I_F_oZoneShiftStarts) || 0;
        const dZone = Number(r.I_F_dZoneShiftStarts) || 0;
        if (oZone + dZone < 10) continue;

        if (!fiveOnFiveData.has(pid)) fiveOnFiveData.set(pid, new Map());
        fiveOnFiveData.get(pid)!.set(season, {
          playerId: pid, season,
          oZoneStarts: oZone,
          dZoneStarts: dZone,
        });
      }
    }
  } catch { /* ok */ }
}

// ── Merge into SkaterSeason records ───────────────────────────
const byPlayer = new Map<string, Map<number, SkaterSeason>>();

for (const [pid, seasons] of allSitData) {
  for (const [season, a] of seasons) {
    const ptsPace = (a.pts / a.gp) * 82;
    const xgPace = (a.xGoals / a.gp) * 82;
    const avgTOI = (a.ice / 60) / a.gp;

    // NOIV: on-ice xG% minus off-ice xG%, relative to teammates
    const onTotal = a.onIceFxG + a.onIceAxG;
    const offTotal = a.offIceFxG + a.offIceAxG;
    const onPct = onTotal > 0 ? a.onIceFxG / onTotal : 0.5;
    const offPct = offTotal > 0 ? a.offIceFxG / offTotal : 0.5;
    const xgRelTM = (onPct - offPct) * 100;

    // SUPP: on-ice xGA rate minus off-ice xGA rate
    const iceHours = a.ice / 3600;
    const benchHours = Math.max(0.1, (a.gp * 3600 - a.ice) / 3600);
    const onA = a.onIceAxG / iceHours;
    const offA = a.offIceAxG / benchHours;
    const xgaRelTM = onA - offA;

    const iceTimeRank = a.gp > 0 ? a.iceTimeRank / a.gp : 0;

    // 5on5 zone starts
    const fof = fiveOnFiveData.get(pid)?.get(season);
    const totalStarts = fof ? fof.oZoneStarts + fof.dZoneStarts : 0;
    const dzPct = totalStarts > 0 ? fof!.dZoneStarts / totalStarts : 0.5;
    const ozPct = totalStarts > 0 ? fof!.oZoneStarts / totalStarts : 0.5;

    if (!byPlayer.has(pid)) byPlayer.set(pid, new Map());
    byPlayer.get(pid)!.set(season, {
      playerId: pid,
      name: a.name,
      season,
      position: a.position,
      gp: a.gp,
      ice: a.ice,
      ptsPace,
      xgPace,
      avgTOI,
      xgRelTM,
      xgaRelTM,
      iceTimeRank,
      dzPct,
      ozPct,
    });
  }
}

// ── Build consecutive-season pairs ────────────────────────────
interface SeasonPair {
  name: string;
  position: string;
  season1: number;
  season2: number;
  s1: SkaterSeason;
  s2: SkaterSeason;
}

const pairs: SeasonPair[] = [];
for (const [, seasons] of byPlayer) {
  const sorted = [...seasons.entries()].sort(([a], [b]) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const [y1, s1] = sorted[i];
    const [y2, s2] = sorted[i + 1];
    if (y2 !== y1 + 1) continue;
    pairs.push({ name: s1.name, position: s1.position, season1: y1, season2: y2, s1, s2 });
  }
}

// ── Stats helpers ─────────────────────────────────────────────
function pearsonR(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return dx2 > 0 && dy2 > 0 ? num / Math.sqrt(dx2 * dy2) : 0;
}

function mae(predicted: number[], actual: number[]): number {
  return predicted.reduce((s, p, i) => s + Math.abs(p - actual[i]), 0) / predicted.length;
}

function regressedPrediction(values: number[], r: number): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.map(v => mean + r * (v - mean));
}

// ── Trait definitions ─────────────────────────────────────────
interface TraitDef {
  name: string;
  strandNode: string;
  extract: (s: SkaterSeason) => number;
  unit: string;
  description: string;
}

const TRAITS: TraitDef[] = [
  {
    name: "Scoring Pace",
    strandNode: "OPS/SCR",
    extract: s => s.ptsPace,
    unit: "pts/82",
    description: "Points per 82 games",
  },
  {
    name: "xG Pace",
    strandNode: "xG",
    extract: s => s.xgPace,
    unit: "xG/82",
    description: "Individual expected goals per 82 games",
  },
  {
    name: "Net On-Ice Value",
    strandNode: "NOIV",
    extract: s => s.xgRelTM,
    unit: "xG% rel",
    description: "On-ice minus off-ice xG%, relative to teammates",
  },
  {
    name: "Ice Time",
    strandNode: "TOI",
    extract: s => s.avgTOI,
    unit: "min/gp",
    description: "Average minutes per game (coaching trust)",
  },
  {
    name: "Chance Suppression",
    strandNode: "SUPP",
    extract: s => -s.xgaRelTM, // negated: positive = better suppression
    unit: "-xGA/60 rel",
    description: "Negative of on-ice xGA rate vs off-ice (higher = stingier)",
  },
  {
    name: "Usage Difficulty",
    strandNode: "QoC",
    extract: s => {
      // Simplified QoC: blend of ice time rank and DZ start %
      const slots = ["D", "LD", "RD"].includes(s.position) ? 6 : 12;
      const rankScore = Math.max(0, Math.min(1, (slots + 1 - s.iceTimeRank) / slots));
      const dzScore = Math.max(0, Math.min(1, (s.dzPct - 0.35) / 0.30));
      return 0.65 * rankScore + 0.35 * dzScore;
    },
    unit: "index",
    description: "Deployment difficulty blend (ice time rank + DZ starts)",
  },
  {
    name: "OZ Deployment",
    strandNode: "OZ",
    extract: s => s.ozPct,
    unit: "OZ%",
    description: "Offensive zone shift start share (5on5)",
  },
];

// ═══════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════
console.log(`${"═".repeat(70)}`);
console.log("  STRAND TRAIT STABILITY BACKTEST");
console.log(`${"═".repeat(70)}`);
console.log(`\nConsecutive-season pairs: ${pairs.length}`);
console.log(`  (≥${MIN_GP} GP, ≥${Math.round(MIN_ICE_PER_GAME / 60)} min/gp, with N+1 season, 2008-2025)`);

const fwd = pairs.filter(p => !["D", "LD", "RD"].includes(p.position));
const def = pairs.filter(p => ["D", "LD", "RD"].includes(p.position));
console.log(`  Forward pairs: ${fwd.length}, Defenseman pairs: ${def.length}`);

// ═══════════════════════════════════════════════════════════════
// 1. YEAR-TO-YEAR CORRELATION (r) FOR EACH TRAIT
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  1. YEAR-TO-YEAR STABILITY — Pearson r for each trait");
console.log(`${"═".repeat(70)}`);

interface TraitResult {
  trait: string;
  node: string;
  rAll: number;
  rFwd: number;
  rDef: number;
  maeRaw: number;
  maeRegressed: number;
  improvement: number;
}

const results: TraitResult[] = [];

console.log(`\n  ${"Trait".padEnd(22)} ${"Node".padStart(8)} ${"r (all)".padStart(9)} ${"r (F)".padStart(8)} ${"r (D)".padStart(8)} ${"Raw MAE".padStart(10)} ${"Reg MAE".padStart(10)} ${"Improv".padStart(8)}`);
console.log(`  ${"─".repeat(85)}`);

for (const t of TRAITS) {
  const x = pairs.map(p => t.extract(p.s1));
  const y = pairs.map(p => t.extract(p.s2));
  const rAll = pearsonR(x, y);

  const xF = fwd.map(p => t.extract(p.s1));
  const yF = fwd.map(p => t.extract(p.s2));
  const rFwd = pearsonR(xF, yF);

  const xD = def.map(p => t.extract(p.s1));
  const yD = def.map(p => t.extract(p.s2));
  const rDef = pearsonR(xD, yD);

  // MAE: raw (assume Y1 repeats) vs regressed toward mean
  const maeRaw = mae(x, y);
  const regressed = regressedPrediction(x, rAll);
  const maeReg = mae(regressed, y);
  const improvement = maeRaw > 0 ? ((maeRaw - maeReg) / maeRaw) * 100 : 0;

  results.push({ trait: t.name, node: t.strandNode, rAll, rFwd, rDef, maeRaw, maeRegressed: maeReg, improvement });

  const impStr = (improvement > 0 ? "+" : "") + improvement.toFixed(1) + "%";
  const fmt = (v: number, d: number) => isFinite(v) ? v.toFixed(d) : "n/a";
  console.log(`  ${t.name.padEnd(22)} ${(t.strandNode ?? "?").padStart(8)} ${fmt(rAll, 3).padStart(9)} ${fmt(rFwd, 3).padStart(8)} ${fmt(rDef, 3).padStart(8)} ${fmt(maeRaw, 2).padStart(10)} ${fmt(maeReg, 2).padStart(10)} ${impStr.padStart(8)}`);
}

// ═══════════════════════════════════════════════════════════════
// 2. STABILITY HIERARCHY — ranked most to least stable
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  2. STABILITY HIERARCHY — most persistent to most volatile");
console.log(`${"═".repeat(70)}`);

const ranked = [...results].sort((a, b) => b.rAll - a.rAll);
console.log(`\n  ${"Rank".padStart(4)} ${"Trait".padEnd(22)} ${"r".padStart(6)} ${"Signal quality".padStart(20)}`);
console.log(`  ${"─".repeat(55)}`);

for (let i = 0; i < ranked.length; i++) {
  const t = ranked[i];
  let quality: string;
  if (t.rAll >= 0.70) quality = "STRONG SKILL";
  else if (t.rAll >= 0.50) quality = "SOLID SIGNAL";
  else if (t.rAll >= 0.30) quality = "MODERATE";
  else if (t.rAll >= 0.15) quality = "WEAK";
  else quality = "NOISE";

  console.log(`  ${String(i + 1).padStart(4)} ${t.trait.padEnd(22)} ${t.rAll.toFixed(3).padStart(6)} ${quality.padStart(20)}`);
}

// ═══════════════════════════════════════════════════════════════
// 3. REGRESSION BENEFIT — how much does regressing help?
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  3. REGRESSION BENEFIT — MAE reduction from regressing to mean");
console.log(`${"═".repeat(70)}`);

const regRanked = [...results].sort((a, b) => b.improvement - a.improvement);
console.log(`\n  ${"Trait".padEnd(22)} ${"Raw MAE".padStart(10)} ${"Regressed".padStart(10)} ${"Reduction".padStart(10)} ${"Conclusion".padStart(20)}`);
console.log(`  ${"─".repeat(74)}`);

for (const t of regRanked) {
  let conclusion: string;
  if (t.improvement > 15) conclusion = "REGRESS HEAVILY";
  else if (t.improvement > 8) conclusion = "REGRESS";
  else if (t.improvement > 3) conclusion = "REGRESS LIGHTLY";
  else conclusion = "TRUST THE VALUE";

  console.log(`  ${t.trait.padEnd(22)} ${t.maeRaw.toFixed(2).padStart(10)} ${t.maeRegressed.toFixed(2).padStart(10)} ${("+" + t.improvement.toFixed(1) + "%").padStart(10)} ${conclusion.padStart(20)}`);
}

// ═══════════════════════════════════════════════════════════════
// 4. F vs D COMPARISON — do traits persist differently by position?
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  4. POSITIONAL SPLIT — do traits persist differently for F vs D?");
console.log(`${"═".repeat(70)}`);

console.log(`\n  ${"Trait".padEnd(22)} ${"r (F)".padStart(8)} ${"r (D)".padStart(8)} ${"Delta".padStart(8)} ${"More stable for".padStart(18)}`);
console.log(`  ${"─".repeat(66)}`);

for (const t of results) {
  const delta = t.rFwd - t.rDef;
  const winner = Math.abs(delta) < 0.02 ? "SAME" : delta > 0 ? "FORWARDS" : "DEFENSEMEN";
  console.log(`  ${t.trait.padEnd(22)} ${t.rFwd.toFixed(3).padStart(8)} ${t.rDef.toFixed(3).padStart(8)} ${(delta > 0 ? "+" : "") + delta.toFixed(3).padStart(7)} ${winner.padStart(18)}`);
}

// ═══════════════════════════════════════════════════════════════
// 5. TIER SPLIT — do traits persist more for elite vs depth players?
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  5. TIER SPLIT — trait stability for star vs depth players");
console.log(`${"═".repeat(70)}`);

const starPairs = pairs.filter(p => p.s1.ptsPace >= 50);
const depthPairs = pairs.filter(p => p.s1.ptsPace < 30);

console.log(`\n  Star (≥50 pts/82): ${starPairs.length} pairs, Depth (<30): ${depthPairs.length} pairs`);
console.log(`\n  ${"Trait".padEnd(22)} ${"r (star)".padStart(10)} ${"r (depth)".padStart(10)} ${"Delta".padStart(8)}`);
console.log(`  ${"─".repeat(52)}`);

for (const t of TRAITS) {
  const xS = starPairs.map(p => t.extract(p.s1));
  const yS = starPairs.map(p => t.extract(p.s2));
  const rStar = xS.length > 10 ? pearsonR(xS, yS) : NaN;

  const xD = depthPairs.map(p => t.extract(p.s1));
  const yD = depthPairs.map(p => t.extract(p.s2));
  const rDepth = xD.length > 10 ? pearsonR(xD, yD) : NaN;

  const delta = isFinite(rStar) && isFinite(rDepth) ? rStar - rDepth : NaN;
  console.log(`  ${t.name.padEnd(22)} ${isFinite(rStar) ? rStar.toFixed(3).padStart(10) : "n/a".padStart(10)} ${isFinite(rDepth) ? rDepth.toFixed(3).padStart(10) : "n/a".padStart(10)} ${isFinite(delta) ? ((delta > 0 ? "+" : "") + delta.toFixed(3)).padStart(8) : "n/a".padStart(8)}`);
}

// ═══════════════════════════════════════════════════════════════
// 6. CROSS-TRAIT CORRELATION — are some traits measuring the same thing?
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  6. CROSS-TRAIT CORRELATION — redundancy check");
console.log(`${"═".repeat(70)}`);

console.log(`\n  ${"".padEnd(22)} ${TRAITS.map(t => t.strandNode.padStart(8)).join("")}`);
console.log(`  ${"─".repeat(22 + TRAITS.length * 8)}`);

for (const t1 of TRAITS) {
  const vals1 = pairs.map(p => t1.extract(p.s1));
  const cells = TRAITS.map(t2 => {
    if (t1.name === t2.name) return "   ---";
    const vals2 = pairs.map(p => t2.extract(p.s1));
    const r = pearsonR(vals1, vals2);
    return r.toFixed(2).padStart(8);
  });
  console.log(`  ${t1.strandNode.padEnd(22)} ${cells.join("")}`);
}

// ═══════════════════════════════════════════════════════════════
// 7. COMPARISON WITH GOALIE STABILITY HIERARCHY
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  7. COMPARISON — skater traits vs goalie metrics");
console.log(`${"═".repeat(70)}`);

const goalieMetrics = [
  { name: "Freeze rate", r: 0.72 },
  { name: "Rebound control", r: 0.69 },
  { name: "HD SV%", r: 0.40 },
  { name: "GAA", r: 0.34 },
  { name: "SV%", r: 0.30 },
  { name: "GSAx/60", r: 0.13 },
  { name: "MD SV%", r: 0.06 },
];

const combined = [
  ...ranked.map(t => ({ name: `[SKATER] ${t.trait}`, r: t.rAll })),
  ...goalieMetrics.map(g => ({ name: `[GOALIE] ${g.name}`, r: g.r })),
].sort((a, b) => b.r - a.r);

console.log(`\n  ${"Rank".padStart(4)} ${"Metric".padEnd(32)} ${"r".padStart(6)}`);
console.log(`  ${"─".repeat(44)}`);

for (let i = 0; i < combined.length; i++) {
  const c = combined[i];
  console.log(`  ${String(i + 1).padStart(4)} ${c.name.padEnd(32)} ${c.r.toFixed(3).padStart(6)}`);
}

// ═══════════════════════════════════════════════════════════════
// CONCLUSIONS
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log("  CONCLUSIONS");
console.log(`${"═".repeat(70)}`);

const strong = results.filter(t => t.rAll >= 0.50);
const moderate = results.filter(t => t.rAll >= 0.30 && t.rAll < 0.50);
const weak = results.filter(t => t.rAll < 0.30);

console.log(`\nStrong signal (r ≥ 0.50): ${strong.map(t => `${t.trait} (${t.rAll.toFixed(2)})`).join(", ") || "none"}`);
console.log(`Moderate signal (r 0.30-0.50): ${moderate.map(t => `${t.trait} (${t.rAll.toFixed(2)})`).join(", ") || "none"}`);
console.log(`Weak/noise (r < 0.30): ${weak.map(t => `${t.trait} (${t.rAll.toFixed(2)})`).join(", ") || "none"}`);

console.log(`\nSkater identity profiles are ${strong.length >= 4 ? "substantially" : strong.length >= 2 ? "partially" : "weakly"} persistent year-to-year.`);
if (weak.length > 0) {
  console.log(`The following STRAND dimensions should be regressed toward position means: ${weak.map(t => t.node).join(", ")}.`);
}
