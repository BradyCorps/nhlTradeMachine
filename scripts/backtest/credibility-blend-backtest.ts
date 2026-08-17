// ── Credibility Blend Backtest ─────────────────────────────────
//
//   npx tsx scripts/backtest/credibility-blend-backtest.ts
//
// Tests currentSeasonWeight() — when a player spikes above baseline,
// the credibility score decides how much to believe. For every spike
// in the 2010-2024 MoneyPuck data, this compares three predictions
// for the NEXT season:
//   (a) "believe the spike" — use the spiking season's pts/82
//   (b) "anchor to baseline" — ignore the spike, use baseline
//   (c) "credibility blend" — weight the spike by its credibility
//
// The test is: does the credibility score actually separate real
// breakouts from mirages? If so, (c) beats both (a) and (b).

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const MIN_GP = 20;
const SPIKE_THRESHOLD = 1.05; // pts/82 > baseline * 1.05
const BASELINE_LOOKBACK = 3;

// ── CSV parsing ─────────────────────────────────────────────────
interface Row { [k: string]: string }
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

const slug = (n: string): string =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();

// ── Load birth years (same pattern as other backtests) ──────────
const playerBirthYear = new Map<string, number>();
try {
  const bios = readCsv("OtherData/2025;26_player_bios.csv");
  for (const r of bios) {
    const bd = r["Date of Birth"] ?? r["dateOfBirth"] ?? r.birthDate;
    const name = r["Player"] ?? r["player"] ?? r.playerName ?? r.name ?? "";
    if (bd) {
      const y = new Date(bd).getFullYear();
      if (y > 1970 && y < 2010) playerBirthYear.set(slug(name), y);
    }
  }
} catch { /* ok */ }
try {
  const sigs = readCsv("OtherData/contracts/signings.csv");
  for (const r of sigs) {
    const signAge = Number(r.signAge);
    const signDate = r.signDate;
    if (signAge > 0 && signDate) {
      const signYear = new Date(signDate).getFullYear();
      if (signYear > 2000) {
        const birthYear = signYear - signAge;
        const key = slug(r.playerName ?? r.name ?? "");
        if (key && !playerBirthYear.has(key)) playerBirthYear.set(key, birthYear);
      }
    }
  }
} catch { /* ok */ }

// ── Load draft positions (for pedigree signal) ──────────────────
const draftOverall = new Map<string, number>();
try {
  const bios = readCsv("OtherData/2025;26_player_bios.csv");
  for (const r of bios) {
    const overall = Number(r["Overall Draft Position"] ?? r.draftOverall ?? r.overallPick);
    const name = r["Player"] ?? r["player"] ?? r.playerName ?? r.name ?? "";
    if (overall > 0) draftOverall.set(slug(name), overall);
  }
} catch { /* ok */ }

// ── Load skater performance ─────────────────────────────────────
interface SeasonData {
  playerId: string;
  name: string;
  season: number;
  position: string;
  gp: number;
  ice: number;
  pts: number;
  goals: number;
  xGoals: number;
  hdGoals: number;
  hdxGoals: number;
  hdShots: number;
  team: string;
}

const byPlayer = new Map<string, Map<number, SeasonData>>();

for (const rel of [
  "OtherData/HistoricalData/skaters_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_skaters.csv",
]) {
  try {
    for (const r of readCsv(rel)) {
      if (r.situation !== "all") continue;
      const gp = Number(r.games_played);
      const ice = Number(r.icetime);
      const pts = Number(r.I_F_points);
      const goals = Number(r.I_F_goals);
      const xGoals = Number(r.I_F_xGoals);
      const hdGoals = Number(r.I_F_highDangerGoals);
      const hdxGoals = Number(r.I_F_highDangerxGoals);
      const hdShots = Number(r.I_F_highDangerShots);
      if (!(gp >= MIN_GP) || !(ice > 0) || !isFinite(pts)) continue;
      const pos = String(r.position ?? "").trim();
      if (pos === "G") continue;

      const season = Number(r.season);
      const pid = String(r.playerId);
      if (!byPlayer.has(pid)) byPlayer.set(pid, new Map());
      byPlayer.get(pid)!.set(season, {
        playerId: pid, name: String(r.name), season, position: pos,
        gp, ice, pts, goals, xGoals: isFinite(xGoals) ? xGoals : 0,
        hdGoals: isFinite(hdGoals) ? hdGoals : 0,
        hdxGoals: isFinite(hdxGoals) ? hdxGoals : 0,
        hdShots: isFinite(hdShots) ? hdShots : 0,
        team: String(r.team ?? ""),
      });
    }
  } catch { /* ok */ }
}

// ── Credibility score (mirrors currentSeasonWeight) ─────────────
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function computeCredibility(
  spike: SeasonData,
  baseline: number,
  age: number | null,
): { cred: number; weight: number } {
  const LO = 0.20, HI = 0.58;
  const curr = (spike.pts / spike.ice) * (82 * 60);
  if (baseline <= 0 || curr <= baseline * SPIKE_THRESHOLD) return { cred: 0.5, weight: 0.4 };

  let cred = 0.5;

  // HD finishing delta (MoneyPuck proxy for EDGE hdFinishingDelta)
  if (spike.hdShots >= 10) {
    const hdGoalRate = spike.hdGoals / spike.hdShots;
    const hdxGoalRate = spike.hdxGoals / spike.hdShots;
    const delta = hdGoalRate - hdxGoalRate;
    cred += clamp(-delta * 6, -0.35, 0.35);
  }

  // Age
  if (age != null) {
    if (age <= 23) cred += 0.18;
    else if (age >= 29) cred -= 0.18;
  }

  // Draft pedigree
  const nameSlug = slug(spike.name);
  const draft = draftOverall.get(nameSlug);
  if (draft != null && draft <= 15) cred += 0.10;

  // Games played
  cred += (clamp(spike.gp / 70, 0, 1) - 0.6) * 0.25;

  cred = clamp(cred, 0, 1);
  const weight = LO + (HI - LO) * cred;
  return { cred, weight };
}

// ── Build baselines and find spikes ────────────────────────────
interface SpikeCase {
  name: string;
  season: number;
  age: number | null;
  position: string;
  baseline: number;
  spikePace: number;
  nextPace: number;
  cred: number;
  weight: number;
  blendedPace: number;
  hdFinishingHot: boolean;
}

const spikes: SpikeCase[] = [];
const allSeasons = new Set<number>();
for (const [, sm] of byPlayer) for (const s of sm.keys()) allSeasons.add(s);
const sortedSeasons = [...allSeasons].sort((a, b) => a - b);

for (const [pid, seasonMap] of byPlayer) {
  const seasons = [...seasonMap.entries()].sort(([a], [b]) => a - b);

  for (let i = 0; i < seasons.length; i++) {
    const [seasonN, s] = seasons[i];
    // Need at least one prior season for baseline and one next for validation
    const priors: SeasonData[] = [];
    for (let j = i - 1; j >= Math.max(0, i - BASELINE_LOOKBACK); j--) {
      priors.push(seasons[j][1]);
    }
    if (priors.length === 0) continue;

    // Need season N+1
    const nextEntry = seasons.find(([ss]) => ss === seasonN + 1);
    if (!nextEntry) continue;
    const next = nextEntry[1];

    // Compute baseline (weighted average of prior seasons, most recent heaviest)
    const weights = priors.map((_, idx) => 1 / (idx + 1)); // 1.0, 0.5, 0.33
    const totalW = weights.reduce((a, b) => a + b, 0);
    const baseline = weights.reduce((sum, w, idx) => {
      const p = priors[idx];
      return sum + w * ((p.pts / p.ice) * (82 * 60));
    }, 0) / totalW;

    const spikePace = (s.pts / s.ice) * (82 * 60);
    if (spikePace <= baseline * SPIKE_THRESHOLD) continue;

    const nextPace = (next.pts / next.ice) * (82 * 60);
    const nameSlug = slug(s.name);
    const by = playerBirthYear.get(nameSlug);
    const age = by ? seasonN - by : null;

    const { cred, weight } = computeCredibility(s, baseline, age);
    const blendedPace = baseline * (1 - weight) + spikePace * weight;

    const hdFinishingHot = s.hdShots >= 10 &&
      (s.hdGoals / s.hdShots) > (s.hdxGoals / s.hdShots) + 0.02;

    spikes.push({
      name: s.name, season: seasonN, age, position: s.position,
      baseline, spikePace, nextPace, cred, weight, blendedPace, hdFinishingHot,
    });
  }
}

// ── Analysis ────────────────────────────────────────────────────
console.log("═".repeat(70));
console.log("  CREDIBILITY BLEND BACKTEST");
console.log("═".repeat(70));
console.log(`\nSpike seasons found: ${spikes.length}`);
console.log(`  (pts/82 > baseline × ${SPIKE_THRESHOLD}, ≥${MIN_GP} GP, with N+1 season)`);

// ── 1. Overall prediction accuracy ──────────────────────────────
function accuracy(
  predictions: { predicted: number; actual: number }[],
): { mae: number; rmse: number; r2: number } {
  const n = predictions.length;
  const meanActual = predictions.reduce((s, p) => s + p.actual, 0) / n;
  let ae = 0, se = 0, totalSS = 0;
  for (const p of predictions) {
    ae += Math.abs(p.predicted - p.actual);
    se += (p.predicted - p.actual) ** 2;
    totalSS += (p.actual - meanActual) ** 2;
  }
  return { mae: ae / n, rmse: Math.sqrt(se / n), r2: 1 - se / totalSS };
}

console.log(`\n${"═".repeat(70)}`);
console.log("  1. PREDICTION ACCURACY — which method best predicts next-season pace?");
console.log(`${"═".repeat(70)}`);

const believerPreds = spikes.map(s => ({ predicted: s.spikePace, actual: s.nextPace }));
const anchorPreds = spikes.map(s => ({ predicted: s.baseline, actual: s.nextPace }));
const blendPreds = spikes.map(s => ({ predicted: s.blendedPace, actual: s.nextPace }));

const believer = accuracy(believerPreds);
const anchor = accuracy(anchorPreds);
const blend = accuracy(blendPreds);

console.log(`\n  Method                          MAE     RMSE       R²`);
console.log(`  ${"─".repeat(56)}`);
console.log(`  ${"Believe the spike".padEnd(30)} ${believer.mae.toFixed(1).padStart(6)} ${believer.rmse.toFixed(1).padStart(8)} ${believer.r2.toFixed(4).padStart(8)}`);
console.log(`  ${"Anchor to baseline".padEnd(30)} ${anchor.mae.toFixed(1).padStart(6)} ${anchor.rmse.toFixed(1).padStart(8)} ${anchor.r2.toFixed(4).padStart(8)}`);
console.log(`  ${"Credibility blend".padEnd(30)} ${blend.mae.toFixed(1).padStart(6)} ${blend.rmse.toFixed(1).padStart(8)} ${blend.r2.toFixed(4).padStart(8)}`);

// Also try a fixed 40/60 blend (app default when no spike)
const fixed40Preds = spikes.map(s => ({
  predicted: s.baseline * 0.6 + s.spikePace * 0.4,
  actual: s.nextPace,
}));
const fixed40 = accuracy(fixed40Preds);
console.log(`  ${"Fixed 40/60 blend".padEnd(30)} ${fixed40.mae.toFixed(1).padStart(6)} ${fixed40.rmse.toFixed(1).padStart(8)} ${fixed40.r2.toFixed(4).padStart(8)}`);

// ── 2. Credibility quintiles — does the score predict persistence? ──
console.log(`\n${"═".repeat(70)}`);
console.log("  2. CREDIBILITY QUINTILES — do high-cred spikes persist more?");
console.log(`${"═".repeat(70)}`);

const sorted = [...spikes].sort((a, b) => a.cred - b.cred);
const quintileSize = Math.floor(sorted.length / 5);

console.log(`\n  Quintile        N   Avg cred   Avg spike   Avg next   Persistence   Blend MAE`);
console.log(`  ${"─".repeat(76)}`);

for (let q = 0; q < 5; q++) {
  const start = q * quintileSize;
  const end = q === 4 ? sorted.length : start + quintileSize;
  const group = sorted.slice(start, end);
  const n = group.length;
  const avgCred = group.reduce((s, g) => s + g.cred, 0) / n;
  const avgSpike = group.reduce((s, g) => s + g.spikePace, 0) / n;
  const avgNext = group.reduce((s, g) => s + g.nextPace, 0) / n;
  const avgBase = group.reduce((s, g) => s + g.baseline, 0) / n;
  // Persistence: how much of the spike-over-baseline survived?
  const persistence = avgNext > avgBase ? (avgNext - avgBase) / (avgSpike - avgBase) : 0;
  const blendMAE = group.reduce((s, g) => s + Math.abs(g.blendedPace - g.nextPace), 0) / n;
  const label = q === 0 ? "Lowest" : q === 4 ? "Highest" : `Q${q + 1}`;
  console.log(`  ${label.padEnd(12)} ${String(n).padStart(5)} ${avgCred.toFixed(2).padStart(10)} ${avgSpike.toFixed(1).padStart(11)} ${avgNext.toFixed(1).padStart(10)} ${(persistence * 100).toFixed(0).padStart(10)}% ${blendMAE.toFixed(1).padStart(11)}`);
}

// ── 3. Hot finishing vs cold finishing ──────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log("  3. HOT vs COLD FINISHING — does finishing luck predict spike durability?");
console.log(`${"═".repeat(70)}`);

const hotSpikes = spikes.filter(s => s.hdFinishingHot);
const coldSpikes = spikes.filter(s => !s.hdFinishingHot);

const hotPersistence = hotSpikes.length > 0
  ? hotSpikes.reduce((s, g) => {
      const base = g.baseline;
      return s + (g.nextPace > base ? (g.nextPace - base) / (g.spikePace - base) : 0);
    }, 0) / hotSpikes.length
  : 0;
const coldPersistence = coldSpikes.length > 0
  ? coldSpikes.reduce((s, g) => {
      const base = g.baseline;
      return s + (g.nextPace > base ? (g.nextPace - base) / (g.spikePace - base) : 0);
    }, 0) / coldSpikes.length
  : 0;

console.log(`\n  Hot finishing (spike + elevated HD goal rate):  N=${hotSpikes.length}`);
console.log(`    Avg spike persistence: ${(hotPersistence * 100).toFixed(0)}%`);
console.log(`    Avg spike: ${(hotSpikes.reduce((s, g) => s + g.spikePace, 0) / hotSpikes.length).toFixed(1)} → next: ${(hotSpikes.reduce((s, g) => s + g.nextPace, 0) / hotSpikes.length).toFixed(1)}`);

console.log(`\n  Cold/neutral finishing (spike NOT from hot finishing):`);
console.log(`    N=${coldSpikes.length}`);
console.log(`    Avg spike persistence: ${(coldPersistence * 100).toFixed(0)}%`);
console.log(`    Avg spike: ${(coldSpikes.reduce((s, g) => s + g.spikePace, 0) / coldSpikes.length).toFixed(1)} → next: ${(coldSpikes.reduce((s, g) => s + g.nextPace, 0) / coldSpikes.length).toFixed(1)}`);

// ── 4. Age split — young breakouts vs late-career flukes ────────
console.log(`\n${"═".repeat(70)}`);
console.log("  4. AGE SPLIT — young breakouts vs late-career spikes");
console.log(`${"═".repeat(70)}`);

const ageGroups = [
  { label: "≤23 (developing)", filter: (s: SpikeCase) => s.age != null && s.age <= 23 },
  { label: "24-28 (prime)", filter: (s: SpikeCase) => s.age != null && s.age >= 24 && s.age <= 28 },
  { label: "≥29 (declining)", filter: (s: SpikeCase) => s.age != null && s.age >= 29 },
  { label: "Age unknown", filter: (s: SpikeCase) => s.age == null },
];

console.log(`\n  ${"Age group".padEnd(22)} ${"N".padStart(5)} ${"Avg spike".padStart(11)} ${"Avg next".padStart(10)} ${"Persist %".padStart(11)} ${"Blend wins?".padStart(12)}`);
console.log(`  ${"─".repeat(72)}`);

for (const ag of ageGroups) {
  const group = spikes.filter(ag.filter);
  if (group.length < 10) continue;
  const n = group.length;
  const avgSpike = group.reduce((s, g) => s + g.spikePace, 0) / n;
  const avgNext = group.reduce((s, g) => s + g.nextPace, 0) / n;
  const avgBase = group.reduce((s, g) => s + g.baseline, 0) / n;
  const persistence = avgNext > avgBase ? (avgNext - avgBase) / (avgSpike - avgBase) : 0;
  const blendAcc = accuracy(group.map(g => ({ predicted: g.blendedPace, actual: g.nextPace })));
  const spikeAcc = accuracy(group.map(g => ({ predicted: g.spikePace, actual: g.nextPace })));
  const baseAcc = accuracy(group.map(g => ({ predicted: g.baseline, actual: g.nextPace })));
  const bestLabel = blendAcc.mae < spikeAcc.mae && blendAcc.mae < baseAcc.mae
    ? "YES" : blendAcc.mae < spikeAcc.mae ? "vs spike" : "no";
  console.log(`  ${ag.label.padEnd(22)} ${String(n).padStart(5)} ${avgSpike.toFixed(1).padStart(11)} ${avgNext.toFixed(1).padStart(10)} ${(persistence * 100).toFixed(0).padStart(10)}% ${bestLabel.padStart(12)}`);
}

// ── 5. Spike magnitude — small bumps vs huge jumps ──────────────
console.log(`\n${"═".repeat(70)}`);
console.log("  5. SPIKE MAGNITUDE — do larger spikes regress more?");
console.log(`${"═".repeat(70)}`);

const spikeMagnitudes = [
  { label: "Small (5-15%)", lo: 1.05, hi: 1.15 },
  { label: "Medium (15-30%)", lo: 1.15, hi: 1.30 },
  { label: "Large (30-50%)", lo: 1.30, hi: 1.50 },
  { label: "Huge (50%+)", lo: 1.50, hi: Infinity },
];

console.log(`\n  ${"Magnitude".padEnd(22)} ${"N".padStart(5)} ${"Avg spike".padStart(11)} ${"Avg next".padStart(10)} ${"Persist %".padStart(11)} ${"Regress %".padStart(11)}`);
console.log(`  ${"─".repeat(72)}`);

for (const mg of spikeMagnitudes) {
  const group = spikes.filter(s => {
    const ratio = s.spikePace / s.baseline;
    return ratio >= mg.lo && ratio < mg.hi;
  });
  if (group.length < 5) continue;
  const n = group.length;
  const avgSpike = group.reduce((s, g) => s + g.spikePace, 0) / n;
  const avgNext = group.reduce((s, g) => s + g.nextPace, 0) / n;
  const avgBase = group.reduce((s, g) => s + g.baseline, 0) / n;
  const persistence = avgNext > avgBase ? (avgNext - avgBase) / (avgSpike - avgBase) : 0;
  const avgRegress = (avgSpike - avgNext) / (avgSpike - avgBase);
  console.log(`  ${mg.label.padEnd(22)} ${String(n).padStart(5)} ${avgSpike.toFixed(1).padStart(11)} ${avgNext.toFixed(1).padStart(10)} ${(persistence * 100).toFixed(0).padStart(11)}% ${(avgRegress * 100).toFixed(0).padStart(10)}%`);
}

// ── 6. Notable cases ────────────────────────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log("  6. NOTABLE CASES — biggest spikes, credibility vs reality");
console.log(`${"═".repeat(70)}`);

const biggestSpikes = [...spikes]
  .sort((a, b) => (b.spikePace - b.baseline) - (a.spikePace - a.baseline))
  .slice(0, 20);

console.log(`\n  ${"Name".padEnd(24)} ${"Season".padStart(7)} ${"Age".padStart(4)} ${"Base".padStart(6)} ${"Spike".padStart(6)} ${"Next".padStart(6)} ${"Cred".padStart(5)} ${"Wt".padStart(5)} ${"Verdict".padStart(10)}`);
console.log(`  ${"─".repeat(78)}`);

for (const s of biggestSpikes) {
  const spikeRatio = s.spikePace / s.baseline;
  const persisted = s.nextPace >= s.baseline + (s.spikePace - s.baseline) * 0.5;
  const verdict = persisted ? "HELD" : "REGRESSED";
  const ageStr = s.age != null ? String(s.age) : "?";
  console.log(`  ${s.name.slice(0, 23).padEnd(24)} ${String(s.season).padStart(7)} ${ageStr.padStart(4)} ${s.baseline.toFixed(0).padStart(6)} ${s.spikePace.toFixed(0).padStart(6)} ${s.nextPace.toFixed(0).padStart(6)} ${s.cred.toFixed(2).padStart(5)} ${s.weight.toFixed(2).padStart(5)} ${verdict.padStart(10)}`);
}

// ── Conclusions ─────────────────────────────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log("  CONCLUSIONS");
console.log(`${"═".repeat(70)}`);

const blendWins = blend.mae < believer.mae && blend.mae < anchor.mae;
const blendBeatsSpike = blend.mae < believer.mae;
const blendBeatsAnchor = blend.mae < anchor.mae;
console.log(`\nThe credibility blend ${blendWins ? "BEATS" : "does NOT beat"} both alternatives.`);
console.log(`  vs "believe the spike": blend MAE ${blend.mae.toFixed(1)} vs ${believer.mae.toFixed(1)} (${blendBeatsSpike ? "better" : "worse"})`);
console.log(`  vs "anchor to baseline": blend MAE ${blend.mae.toFixed(1)} vs ${anchor.mae.toFixed(1)} (${blendBeatsAnchor ? "better" : "worse"})`);
console.log(`\nThe credibility score ranges from ${spikes.reduce((m, s) => Math.min(m, s.cred), 1).toFixed(2)} to ${spikes.reduce((m, s) => Math.max(m, s.cred), 0).toFixed(2)}.`);
console.log(`Model weight range: 0.20 (low cred) to 0.58 (high cred).`);
