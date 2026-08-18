/**
 * Team-Level NAV vs Standings Backtest
 *
 * Tests whether aggregate roster X-NAV correlates with team performance.
 * If the composite works, teams with higher total NAV should win more.
 *
 * Ground truth: goal differential per game (strips shootout/OT luck).
 * NAV: simplified engine replication using MoneyPuck stats + contract data.
 *
 * Usage: npx tsx scripts/backtest/team-nav-backtest.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();

// ── Historical cap ceilings ──────────────────────────────────────
const CAP_CEILING: Record<number, number> = {
  2017: 75.0,
  2018: 79.5,
  2019: 81.5,
  2020: 81.5,
  2021: 81.5,
  2022: 82.5,
  2023: 83.5,
  2024: 88.0,
  2025: 95.0,
  2026: 104.0,
};

// For historical backtest, project cap growth at ~4%/year from that season's ceiling
function capGrowthFactor(yearsOut: number): number {
  return Math.pow(1.04, yearsOut);
}

// ── CSV reader ───────────────────────────────────────────────────
type Row = Record<string, string>;

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function readCsv(rel: string): Row[] {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rawHead = lines[0];
  const head = splitCsvLine(rawHead.replace(/^﻿/, ""));
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row: Row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

function num(v: string | undefined): number { return v ? parseFloat(v) || 0 : 0; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function safe(v: number): number { return isFinite(v) ? v : 0; }
function slug(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

// ── Simplified NAV engine (replicates core xnav-engine.ts logic) ─
interface PlayerNav {
  name: string;
  team: string;
  position: string;
  nav: number;
  off: number;
  def: number;
  age: number;
  cap: number;
}

function calcSimplifiedSkaterNAV(
  ptsPace: number,
  goalsPace: number,
  xgPace: number,
  avgTOI: number,
  games: number,
  xgRelTM: number,
  xgaRelTM: number,
  dzPct: number,
  position: string,
  age: number,
  capHit: number,
  yearsRemaining: number,
  capCeiling: number,
  draftOverall?: number,
): PlayerNav & { raw: { off: number; def: number; age: number; cap: number } } {
  const isD = position === "D";
  const isC = position === "C";

  // ── Offensive value ───────────────────────────────────────
  const ptsScale = isD ? 0.75 : 1.0;
  const pts = ptsPace * ptsScale;
  const ptsVal = pts;

  const noivBonus = clamp(xgRelTM * 3.5, -20, 25);
  const offExp = isD ? 1.1 : 1.6;
  const baseOffCurve = Math.pow(ptsVal / 45, offExp) * 55;
  const offRaw = baseOffCurve + (xgPace * 0.5) + noivBonus;
  let offTotal = safe(offRaw);

  // Lemieux asymptote
  if (offTotal > 250) {
    const L = 200;
    const excess = offTotal - 250;
    offTotal = 250 + L * (1 - Math.exp(-excess / L));
  }

  // ── Defensive value ───────────────────────────────────────
  const toi = avgTOI;
  const toiD = clamp((toi - 15) * 2.5, 0, 30);
  const dzVal = clamp((dzPct - 0.3) * 40, 0, 12);
  const defRaw = (-xgaRelTM) * 20 + toiD + dzVal;
  let defTotal = safe(defRaw);

  if (defTotal > 80) {
    const L = 70;
    const excess = defTotal - 80;
    defTotal = 80 + L * (1 - Math.exp(-excess / L));
  }

  // ── Age curve ─────────────────────────────────────────────
  const peakAge = isD ? 27 : 26;
  const baseAge = age <= peakAge
    ? Math.max(0, (peakAge - age) * 4.5)
    : -Math.pow(age - peakAge, 1.6) * 1.8;
  const yrs = yearsRemaining || 3;
  const rentalFactor = yrs <= 1 ? 0.25 : yrs <= 2 ? 0.60 : 1.0;
  const productionSignal = clamp((pts - 20) / 45, 0, 1);
  const roleSignal = clamp((toi - 11) / 7, 0, 1);
  const pedigreeSignal = draftOverall != null && draftOverall <= 32 ? 0.65 : 0;
  const sampleSignal = clamp(games / 82, 0, 1);
  const youthProjectionSignal = clamp(
    Math.max(productionSignal, roleSignal, pedigreeSignal) * (0.45 + 0.55 * sampleSignal),
    0, 1,
  );
  const ageVal = baseAge < 0 ? baseAge * rentalFactor : baseAge * youthProjectionSignal;
  const ageTotal = safe(ageVal);

  // ── On-ice core ───────────────────────────────────────────
  const trueMarketValue = offTotal + defTotal + ageTotal;
  const isRFA = age + yearsRemaining <= 27;

  // ── Contract surplus (simplified — no FMV model, use cap% proxy) ──
  // Without the full FMV model, use a simple market proxy:
  // FMV ≈ production-based cap share. Elite scorers command 10-14% of cap.
  const fmvProxy = estimateFmvCapPct(ptsPace, toi, age, isD, isRFA);
  const currentFmvAav = capCeiling * fmvProxy;
  const isUnsigned = yearsRemaining <= 0 && capHit <= 0.5;
  const navCapHit = isUnsigned ? currentFmvAav : capHit;
  const contractYears = Math.max(1, yearsRemaining || 1);

  let capSum = 0;
  let tmvDriftFactor = 1;
  const GROWTH_PER_PREPEAK_YEAR = 0.09 * youthProjectionSignal;
  const DECLINE_PER_YEAR = 0.03;

  for (let i = 0; i < contractYears; i++) {
    const projCeiling = capCeiling * capGrowthFactor(i);
    const ageAtYear = age + i;

    if (i > 0) {
      if (ageAtYear <= peakAge) tmvDriftFactor *= 1 + GROWTH_PER_PREPEAK_YEAR;
      else if (ageAtYear >= peakAge + 2) tmvDriftFactor *= 1 - DECLINE_PER_YEAR;
      tmvDriftFactor = clamp(tmvDriftFactor, 0.70, 1.35);
    }

    const fmvCapPctAtYear = estimateFmvCapPct(ptsPace * tmvDriftFactor, toi, ageAtYear, isD, isRFA);
    const fmvDollars = projCeiling * fmvCapPctAtYear;
    const annualSurplus = fmvDollars - navCapHit;
    const timeDiscount = Math.pow(0.92, i);
    const gammaRFA = (ageAtYear <= 27 && annualSurplus > 0) ? 1.25 : 1.0;
    capSum += annualSurplus * 12 * gammaRFA * timeDiscount;
  }

  const baseCapNorm = capSum / contractYears;
  const singleSlotMult = Math.max(1.0, trueMarketValue / 180);
  const baseCapComp = baseCapNorm < 0 ? baseCapNorm : baseCapNorm * singleSlotMult;

  const capEstablishment = clamp(Math.max(games / 40, 0), 0.2, 1.0);
  const positiveCapComp = Math.max(0, baseCapComp) * capEstablishment;
  const negativeCapComp = Math.min(0, baseCapComp);

  // Team control option value
  const controlYears = clamp(Math.min(contractYears, peakAge + 2 - age), 0, 6);
  const teamControlVal = age <= peakAge
    ? youthProjectionSignal * controlYears * 6 * capEstablishment
    : 0;

  const capTotal = safe(negativeCapComp + positiveCapComp + teamControlVal);

  // Positional scarcity
  const isTopPairD = isD && toi > 22;
  const positionalPremium = isC ? 1.15 : isTopPairD ? 1.20 : 1.0;
  const preTotal = safe(trueMarketValue + capTotal);
  const rawTotal = safe(preTotal * positionalPremium);

  // Development discount
  let devDiscount =
    age <= 21 ? 0.68 :
    age <= 22 ? 0.76 :
    age <= 23 ? 0.82 :
    age <= 24 ? 0.88 :
    age <= 25 ? 0.93 :
    1.0;
  if (age <= 25) {
    const gameRelief = clamp((games - 40) / 180, 0, 1);
    const relief = gameRelief;
    devDiscount += (1.0 - devDiscount) * relief;
  }
  if (age <= 25 && pts >= 65) {
    const exemptionFactor = clamp((pts - 65) / 20, 0, 1);
    devDiscount = devDiscount + (1.0 - devDiscount) * exemptionFactor;
  }

  const total = rawTotal * devDiscount;

  return {
    name: "",
    team: "",
    position,
    nav: total,
    off: offTotal,
    def: defTotal,
    age: ageTotal,
    cap: capTotal,
    raw: { off: offTotal, def: defTotal, age: ageTotal, cap: capTotal },
  };
}

// Simple FMV cap% proxy (no fitted model — uses empirical relationship)
function estimateFmvCapPct(ptsPace: number, toi: number, age: number, isD: boolean, isUfa: boolean): number {
  // Based on market observations:
  // - League min ~0.9% of cap
  // - Solid middle-six: 3-5%
  // - Top-line: 7-10%
  // - Superstar: 11-14%
  const prodSignal = isD
    ? clamp((ptsPace * 0.75) / 60, 0, 1)
    : clamp(ptsPace / 90, 0, 1);
  const toiSignal = clamp((toi - 12) / 12, 0, 1);
  const combined = prodSignal * 0.7 + toiSignal * 0.3;

  // Nonlinear mapping: stars get disproportionately more
  const basePct = 0.009 + Math.pow(combined, 1.4) * 0.12;

  // Age adjustment: peak players command more, aging less
  const peakAge = isD ? 27 : 26;
  const ageAdj = age <= peakAge
    ? 1.0 + clamp((peakAge - age) * 0.01, 0, 0.05)
    : 1.0 - clamp((age - peakAge) * 0.015, 0, 0.15);

  // UFA premium
  const ufaMult = isUfa ? 1.10 : 1.0;

  return clamp(basePct * ageAdj * ufaMult, 0.009, 0.145);
}

// Simplified goalie NAV
function calcSimplifiedGoalieNAV(
  gsax: number,
  savePct: number,
  games: number,
  age: number,
  capHit: number,
  yearsRemaining: number,
  capCeiling: number,
): number {
  // Goalie value: GSAx is the dominant signal
  const gsaxVal = gsax * 8;
  const svPctVal = clamp((savePct - 0.900) * 800, -20, 40);
  const workloadVal = clamp((games - 30) * 0.5, 0, 20);

  const onIce = gsaxVal + svPctVal * 0.4 + workloadVal;

  // Goalie age curve: peak at 30
  const peakAge = 30;
  const ageVal = age <= peakAge
    ? Math.max(0, (peakAge - age) * 2.5)
    : -Math.pow(age - peakAge, 1.4) * 2.0;

  // Contract surplus (simplified)
  const fmvPct = clamp(0.015 + Math.pow(clamp(gsax / 20, 0, 1), 1.2) * 0.06, 0.009, 0.085);
  const fmvAav = capCeiling * fmvPct;
  const navCapHit = yearsRemaining <= 0 && capHit <= 0.5 ? fmvAav : capHit;
  const annualSurplus = fmvAav - navCapHit;
  const contractYears = Math.max(1, yearsRemaining || 1);
  let capSum = 0;
  for (let i = 0; i < contractYears; i++) {
    const timeDiscount = Math.pow(0.92, i);
    capSum += annualSurplus * 12 * timeDiscount;
  }
  const capTotal = capSum / contractYears;

  return safe(onIce + ageVal + capTotal);
}

// ── Load data ────────────────────────────────────────────────────
console.log("Team-Level NAV vs Standings Backtest");
console.log("=".repeat(60));

const skaterRows = [
  ...readCsv("OtherData/HistoricalData/skaters_2008_to_2024.csv"),
  ...readCsv("OtherData/2025_26Data/2025_26_skaters.csv"),
];

const goalieRows = [
  ...readCsv("OtherData/HistoricalData/goalies_2008_to_2024.csv"),
  ...readCsv("OtherData/2025_26Data/2025_26_goalies.csv"),
];

const teamRows = [
  ...readCsv("OtherData/HistoricalData/teams_2008_to_2024.csv"),
  ...readCsv("OtherData/2025_26Data/2025_26_teams.csv"),
];

const signings = readCsv("OtherData/contracts/signings.csv");

// Load bios for age data
const biosRows = readCsv("OtherData/2025;26_player_bios.csv");
const biosByName = new Map<string, { dob: string; draftOverall: number | undefined }>();
for (const r of biosRows) {
  const name = r["Player"] || r.Player;
  if (!name) continue;
  biosByName.set(slug(name), {
    dob: r["Date of Birth"] || "",
    draftOverall: r["Overall Draft Position"] ? parseInt(r["Overall Draft Position"]) || undefined : undefined,
  });
}

// Build age lookup from signings (signAge + signDate → birth year approximation)
const ageFromSignings = new Map<string, { signAge: number; signYear: number }>();
for (const s of signings) {
  const name = slug(s.player || "");
  const signAge = parseInt(s.signAge);
  const sd = s.signDate || "";
  const signYear = sd ? parseInt(sd.slice(0, 4)) : 0;
  if (name && signAge && signYear) {
    ageFromSignings.set(name, { signAge, signYear });
  }
}

function getAge(name: string, season: number): number | null {
  const s = slug(name);
  // Try bios first
  const bio = biosByName.get(s);
  if (bio && bio.dob) {
    const birthYear = parseInt(bio.dob.slice(0, 4));
    if (birthYear && birthYear >= 1960 && birthYear <= 2010) {
      return season - birthYear;
    }
  }
  // Try signings
  const sig = ageFromSignings.get(s);
  if (sig) {
    const age = sig.signAge + (season - sig.signYear);
    if (age >= 16 && age <= 50) return age;
  }
  return null;
}

// Build contract lookup: player slug → list of {capHit, term, signSeason, signExpiry, position}
interface Contract {
  capHit: number;
  term: number;
  signSeason: number;
  endSeason: number;
  pos: string;
}
const contractsByPlayer = new Map<string, Contract[]>();
for (const s of signings) {
  const name = slug(s.player || "");
  if (!name) continue;
  const capHitRaw = parseFloat(s.capHit);
  const capHit = capHitRaw / 1_000_000; // raw dollars → millions
  const termStr = (s.term || "").replace(/yr$/, "");
  const term = parseInt(termStr) || 1;
  const sd = s.signDate || "";
  const signYear = sd ? parseInt(sd.slice(0, 4)) : 0;
  const signMonth = sd ? parseInt(sd.slice(5, 7)) : 7;
  if (!signYear || !capHit) continue;
  // Signing season convention: July+ = that year's season, else prior
  const signSeason = signMonth >= 7 ? signYear : signYear - 1;
  const endSeason = signSeason + term - 1;

  if (!contractsByPlayer.has(name)) contractsByPlayer.set(name, []);
  contractsByPlayer.get(name)!.push({
    capHit,
    term,
    signSeason,
    endSeason,
    pos: s.pos || "",
  });
}

function getContract(name: string, season: number): { capHit: number; yearsRemaining: number } | null {
  const contracts = contractsByPlayer.get(slug(name));
  if (!contracts) return null;
  // Find the contract active in this season
  const active = contracts.filter(c => c.signSeason <= season && c.endSeason >= season);
  if (active.length === 0) return null;
  // Take the most recently signed
  const c = active.sort((a, b) => b.signSeason - a.signSeason)[0];
  return {
    capHit: c.capHit,
    yearsRemaining: c.endSeason - season + 1,
  };
}

// ── Build team standings ─────────────────────────────────────────
interface TeamSeason {
  team: string;
  season: number;
  gp: number;
  goalsFor: number;
  goalsAgainst: number;
  gdPerGame: number;
}

const teamStandings = new Map<string, TeamSeason>();
for (const r of teamRows) {
  if (r.situation !== "all") continue;
  const team = r.team;
  const season = parseInt(r.season);
  const gp = num(r.games_played);
  const gf = num(r.goalsFor);
  const ga = num(r.goalsAgainst);
  if (!team || !season || gp < 40) continue;
  const key = `${team}-${season}`;
  teamStandings.set(key, {
    team, season, gp, goalsFor: gf, goalsAgainst: ga,
    gdPerGame: (gf - ga) / gp,
  });
}

// ── Build skater season index ────────────────────────────────────
interface SkaterSeason {
  playerId: string;
  name: string;
  team: string;
  position: string;
  season: number;
  gp: number;
  ptsPace: number;
  goalsPace: number;
  xgPace: number;
  avgTOI: number;
  xgRelTM: number;
  xgaRelTM: number;
  dzPct: number;
  icetime: number;
}

const skaterSeasons: SkaterSeason[] = [];
for (const r of skaterRows) {
  if (r.situation !== "all") continue;
  const gp = num(r.games_played);
  if (gp < 10) continue; // minimum sample
  const season = parseInt(r.season);
  const ice = num(r.icetime);
  const pts = num(r.I_F_points);
  const goals = num(r.I_F_goals);
  const xg = num(r.I_F_xGoals);
  const onXg = num(r.onIce_xGoalsPercentage);
  const offXg = num(r.offIce_xGoalsPercentage);

  const pos = r.position;
  if (pos === "G") continue;

  const oStarts = num(r.I_F_oZoneShiftStarts);
  const dStarts = num(r.I_F_dZoneShiftStarts);
  const nStarts = num(r.I_F_neutralZoneShiftStarts || r.I_F_nZoneShiftStarts);
  const totalStarts = oStarts + dStarts + nStarts;
  const dzPct = totalStarts > 0 ? dStarts / totalStarts : 0.5;

  // On-ice xG relative to off-ice (proxy for xgRelTM)
  const xgRelTM = (onXg || 0) - (offXg || 0);

  // xGA relative: from on-ice against metrics
  const onXga = num(r.OnIce_A_xGoals);
  const offXga = num(r.OffIce_A_xGoals);
  const onIceTime = ice / 3600;
  const xgaRelTM = onIceTime > 0 && offXga > 0
    ? ((onXga / onIceTime) - (offXga / Math.max(1, (gp * 60 * 60 - ice) / 3600))) * (onIceTime / gp)
    : 0;

  skaterSeasons.push({
    playerId: r.playerId,
    name: r.name,
    team: r.team,
    position: pos === "L" || pos === "R" ? "W" : pos === "C" ? "C" : "D",
    season,
    gp,
    ptsPace: (pts / gp) * 82,
    goalsPace: (goals / gp) * 82,
    xgPace: (xg / gp) * 82,
    avgTOI: (ice / 60) / gp,
    xgRelTM,
    xgaRelTM: safe(xgaRelTM),
    dzPct,
    icetime: ice,
  });
}

// ── Build goalie season index ────────────────────────────────────
interface GoalieSeason {
  name: string;
  team: string;
  season: number;
  gp: number;
  gsax: number;
  savePct: number;
  icetime: number;
}

const goalieSeasons: GoalieSeason[] = [];
for (const r of goalieRows) {
  if (r.situation !== "all") continue;
  const gp = num(r.games_played);
  if (gp < 5) continue;
  const xg = num(r.xGoals);
  const goals = num(r.goals);
  const onGoal = num(r.ongoal);

  goalieSeasons.push({
    name: r.name,
    team: r.team,
    season: parseInt(r.season),
    gp,
    gsax: xg - goals,
    savePct: onGoal > 0 ? 1 - (goals / onGoal) : 0.900,
    icetime: num(r.icetime),
  });
}

// ── Main backtest loop ───────────────────────────────────────────
const SEASONS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

interface TeamNavResult {
  team: string;
  season: number;
  rosterNav: number;
  skaterNav: number;
  goalieNav: number;
  skaterCount: number;
  goalieCount: number;
  contractMatchRate: number;
  gdPerGame: number;
}

const allResults: TeamNavResult[] = [];

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return dx2 > 0 && dy2 > 0 ? num / Math.sqrt(dx2 * dy2) : 0;
}

for (const season of SEASONS) {
  const ceiling = CAP_CEILING[season];
  if (!ceiling) continue;

  // Get all teams this season
  const seasonTeams = new Set<string>();
  for (const [key, ts] of teamStandings) {
    if (ts.season === season) seasonTeams.add(ts.team);
  }

  for (const team of seasonTeams) {
    const standings = teamStandings.get(`${team}-${season}`);
    if (!standings) continue;

    // All skaters on this team this season
    const teamSkaters = skaterSeasons.filter(s => s.team === team && s.season === season);
    const teamGoalies = goalieSeasons.filter(g => g.team === team && g.season === season);

    let totalSkaterNav = 0;
    let totalGoalieNav = 0;
    let contractMatches = 0;
    let totalPlayers = 0;

    for (const sk of teamSkaters) {
      const age = getAge(sk.name, season);
      if (age === null) continue;

      const contract = getContract(sk.name, season);
      const capHit = contract ? contract.capHit : ceiling * 0.009; // league min proxy
      const yrsRemaining = contract ? contract.yearsRemaining : 1;
      if (contract) contractMatches++;
      totalPlayers++;

      const bio = biosByName.get(slug(sk.name));
      const draftOverall = bio?.draftOverall;

      const result = calcSimplifiedSkaterNAV(
        sk.ptsPace,
        sk.goalsPace,
        sk.xgPace,
        sk.avgTOI,
        sk.gp,
        sk.xgRelTM,
        sk.xgaRelTM,
        sk.dzPct,
        sk.position,
        age,
        capHit,
        yrsRemaining,
        ceiling,
        draftOverall,
      );

      totalSkaterNav += result.nav;
    }

    for (const gl of teamGoalies) {
      const age = getAge(gl.name, season);
      if (age === null) continue;

      const contract = getContract(gl.name, season);
      const capHit = contract ? contract.capHit : ceiling * 0.009;
      const yrsRemaining = contract ? contract.yearsRemaining : 1;
      if (contract) contractMatches++;
      totalPlayers++;

      totalGoalieNav += calcSimplifiedGoalieNAV(
        gl.gsax,
        gl.savePct,
        gl.gp,
        age,
        capHit,
        yrsRemaining,
        ceiling,
      );
    }

    allResults.push({
      team,
      season,
      rosterNav: totalSkaterNav + totalGoalieNav,
      skaterNav: totalSkaterNav,
      goalieNav: totalGoalieNav,
      skaterCount: teamSkaters.length,
      goalieCount: teamGoalies.length,
      contractMatchRate: totalPlayers > 0 ? contractMatches / totalPlayers : 0,
      gdPerGame: standings.gdPerGame,
    });
  }
}

// ── Analysis ─────────────────────────────────────────────────────
console.log(`\nData: ${allResults.length} team-seasons across ${SEASONS.length} seasons`);
console.log(`Contract match rate: ${(allResults.reduce((s, r) => s + r.contractMatchRate, 0) / allResults.length * 100).toFixed(1)}%`);

const navs = allResults.map(r => r.rosterNav);
const gds = allResults.map(r => r.gdPerGame);
const rAll = pearsonR(navs, gds);
const r2All = rAll * rAll;

console.log(`\n${"─".repeat(60)}`);
console.log("OVERALL CORRELATION: Roster NAV vs Goal Differential/Game");
console.log(`${"─".repeat(60)}`);
console.log(`  r  = ${rAll.toFixed(4)}`);
console.log(`  R² = ${r2All.toFixed(4)}  (${(r2All * 100).toFixed(1)}% of team performance variance explained)`);

// Component correlations
const skNavs = allResults.map(r => r.skaterNav);
const glNavs = allResults.map(r => r.goalieNav);
const rSk = pearsonR(skNavs, gds);
const rGl = pearsonR(glNavs, gds);
console.log(`\nComponent breakdown:`);
console.log(`  Skater NAV vs GD:  r=${rSk.toFixed(4)}  R²=${(rSk * rSk).toFixed(4)}`);
console.log(`  Goalie NAV vs GD:  r=${rGl.toFixed(4)}  R²=${(rGl * rGl).toFixed(4)}`);

// Per-season breakdown
console.log(`\n${"─".repeat(60)}`);
console.log("PER-SEASON BREAKDOWN");
console.log(`${"─".repeat(60)}`);
console.log(`${"Season".padStart(8)}  ${"Teams".padStart(5)}  ${"r".padStart(7)}  ${"R²".padStart(7)}  ${"ContractMatch".padStart(15)}  ${"AvgNav".padStart(8)}`);

for (const season of SEASONS) {
  const seasonResults = allResults.filter(r => r.season === season);
  if (seasonResults.length < 10) continue;
  const sNavs = seasonResults.map(r => r.rosterNav);
  const sGds = seasonResults.map(r => r.gdPerGame);
  const sR = pearsonR(sNavs, sGds);
  const avgMatch = seasonResults.reduce((s, r) => s + r.contractMatchRate, 0) / seasonResults.length;
  const avgNav = sNavs.reduce((a, b) => a + b, 0) / sNavs.length;
  console.log(
    `${String(season).padStart(8)}  ${String(seasonResults.length).padStart(5)}  ${sR.toFixed(4).padStart(7)}  ${(sR * sR).toFixed(4).padStart(7)}  ${(avgMatch * 100).toFixed(1).padStart(14)}%  ${avgNav.toFixed(0).padStart(8)}`
  );
}

// ── Top/bottom analysis ──────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log("QUINTILE ANALYSIS: Average GD/game by NAV quintile");
console.log(`${"─".repeat(60)}`);

const sorted = [...allResults].sort((a, b) => a.rosterNav - b.rosterNav);
const qSize = Math.floor(sorted.length / 5);
for (let q = 0; q < 5; q++) {
  const slice = sorted.slice(q * qSize, (q + 1) * qSize);
  const avgGd = slice.reduce((s, r) => s + r.gdPerGame, 0) / slice.length;
  const avgNav = slice.reduce((s, r) => s + r.rosterNav, 0) / slice.length;
  const label = q === 0 ? "Lowest NAV" : q === 4 ? "Highest NAV" : `Q${q + 1}`;
  console.log(`  ${label.padEnd(12)} avgNAV=${avgNav.toFixed(0).padStart(6)}  avgGD/gm=${avgGd >= 0 ? "+" : ""}${avgGd.toFixed(3)}`);
}

// ── Residual analysis: biggest over/under performers ─────────────
console.log(`\n${"─".repeat(60)}`);
console.log("RESIDUAL ANALYSIS: Biggest over/under performers vs NAV");
console.log(`${"─".repeat(60)}`);

// Linear fit: GD = a * NAV + b
const n = navs.length;
const meanNav = navs.reduce((a, b) => a + b, 0) / n;
const meanGd = gds.reduce((a, b) => a + b, 0) / n;
let covNavGd = 0, varNav = 0;
for (let i = 0; i < n; i++) {
  covNavGd += (navs[i] - meanNav) * (gds[i] - meanGd);
  varNav += (navs[i] - meanNav) * (navs[i] - meanNav);
}
const slope = varNav > 0 ? covNavGd / varNav : 0;
const intercept = meanGd - slope * meanNav;

const residuals = allResults.map((r, i) => ({
  ...r,
  predicted: slope * navs[i] + intercept,
  residual: gds[i] - (slope * navs[i] + intercept),
}));

const sortedResiduals = [...residuals].sort((a, b) => b.residual - a.residual);

console.log("\nMost OVER-performing (actual >> predicted):");
for (const r of sortedResiduals.slice(0, 8)) {
  console.log(`  ${r.team} ${r.season}: GD/gm=${r.gdPerGame >= 0 ? "+" : ""}${r.gdPerGame.toFixed(3)}, predicted=${r.predicted >= 0 ? "+" : ""}${r.predicted.toFixed(3)}, residual=${r.residual >= 0 ? "+" : ""}${r.residual.toFixed(3)}`);
}

console.log("\nMost UNDER-performing (actual << predicted):");
for (const r of sortedResiduals.slice(-8).reverse()) {
  console.log(`  ${r.team} ${r.season}: GD/gm=${r.gdPerGame >= 0 ? "+" : ""}${r.gdPerGame.toFixed(3)}, predicted=${r.predicted >= 0 ? "+" : ""}${r.predicted.toFixed(3)}, residual=${r.residual >= 0 ? "+" : ""}${r.residual.toFixed(3)}`);
}

// ── On-ice only test (no contract surplus) ───────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log("ABLATION: On-ice value only (offense + defense + age, no cap surplus)");
console.log(`${"─".repeat(60)}`);

// Re-run with just on-ice (off + def + age, no contract/cap component)
const onIceNavs: number[] = [];
for (const r of allResults) {
  const seasonSkaters = skaterSeasons.filter(s => s.team === r.team && s.season === r.season);
  const seasonGoalies = goalieSeasons.filter(g => g.team === r.team && g.season === r.season);

  let onIceSum = 0;
  for (const sk of seasonSkaters) {
    const age = getAge(sk.name, r.season);
    if (age === null) continue;
    const bio = biosByName.get(slug(sk.name));
    const result = calcSimplifiedSkaterNAV(
      sk.ptsPace, sk.goalsPace, sk.xgPace, sk.avgTOI, sk.gp,
      sk.xgRelTM, sk.xgaRelTM, sk.dzPct, sk.position, age,
      0, 3, r.season <= 2024 ? CAP_CEILING[r.season]! : 104, bio?.draftOverall,
    );
    onIceSum += result.raw.off + result.raw.def + result.raw.age;
  }
  for (const gl of seasonGoalies) {
    const age = getAge(gl.name, r.season);
    if (age === null) continue;
    onIceSum += gl.gsax * 8 + clamp((gl.savePct - 0.900) * 800, -20, 40) * 0.4;
  }
  onIceNavs.push(onIceSum);
}

const rOnIce = pearsonR(onIceNavs, gds);
console.log(`  On-ice only:      r=${rOnIce.toFixed(4)}  R²=${(rOnIce * rOnIce).toFixed(4)}`);
console.log(`  Full NAV:         r=${rAll.toFixed(4)}  R²=${r2All.toFixed(4)}`);
console.log(`  Contract surplus ${r2All > rOnIce * rOnIce ? "HELPS" : "HURTS"}: ΔR²=${((r2All - rOnIce * rOnIce) * 100).toFixed(2)} pct pts`);

// ── Offensive-only test ──────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log("ABLATION: Offense only vs Defense only vs Full");
console.log(`${"─".repeat(60)}`);

const offNavs: number[] = [];
const defNavs: number[] = [];
for (const r of allResults) {
  const seasonSkaters = skaterSeasons.filter(s => s.team === r.team && s.season === r.season);
  let offSum = 0, defSum = 0;
  for (const sk of seasonSkaters) {
    const age = getAge(sk.name, r.season);
    if (age === null) continue;
    const bio = biosByName.get(slug(sk.name));
    const result = calcSimplifiedSkaterNAV(
      sk.ptsPace, sk.goalsPace, sk.xgPace, sk.avgTOI, sk.gp,
      sk.xgRelTM, sk.xgaRelTM, sk.dzPct, sk.position, age,
      0, 3, r.season <= 2024 ? CAP_CEILING[r.season]! : 104, bio?.draftOverall,
    );
    offSum += result.raw.off;
    defSum += result.raw.def;
  }
  offNavs.push(offSum);
  defNavs.push(defSum);
}

const rOff = pearsonR(offNavs, gds);
const rDef = pearsonR(defNavs, gds);
console.log(`  Offense only:  r=${rOff.toFixed(4)}  R²=${(rOff * rOff).toFixed(4)}`);
console.log(`  Defense only:  r=${rDef.toFixed(4)}  R²=${(rDef * rDef).toFixed(4)}`);
console.log(`  Full NAV:      r=${rAll.toFixed(4)}  R²=${r2All.toFixed(4)}`);

// ── Diagnostic: sample team breakdown ────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log("DIAGNOSTIC: Sample team compositions (2023 season)");
console.log(`${"─".repeat(60)}`);

const sample2023 = allResults.filter(r => r.season === 2023).sort((a, b) => b.gdPerGame - a.gdPerGame);
for (const r of [sample2023[0], sample2023[Math.floor(sample2023.length / 2)], sample2023[sample2023.length - 1]]) {
  console.log(`\n  ${r.team} 2023: GD/gm=${r.gdPerGame >= 0 ? "+" : ""}${r.gdPerGame.toFixed(3)}`);
  console.log(`    Roster NAV: ${r.rosterNav.toFixed(0)}  (skater: ${r.skaterNav.toFixed(0)}, goalie: ${r.goalieNav.toFixed(0)})`);
  console.log(`    Players: ${r.skaterCount} skaters + ${r.goalieCount} goalies, contract match: ${(r.contractMatchRate * 100).toFixed(0)}%`);

  // Show top 5 skaters by NAV on this team
  const teamSkaters2023 = skaterSeasons.filter(s => s.team === r.team && s.season === 2023);
  const playerNavs: { name: string; nav: number; off: number; def: number; ageC: number; capC: number; capHit: number }[] = [];
  for (const sk of teamSkaters2023) {
    const age = getAge(sk.name, 2023);
    if (age === null) continue;
    const contract = getContract(sk.name, 2023);
    const capHit = contract ? contract.capHit : 83.5 * 0.009;
    const yrs = contract ? contract.yearsRemaining : 1;
    const bio = biosByName.get(slug(sk.name));
    const result = calcSimplifiedSkaterNAV(
      sk.ptsPace, sk.goalsPace, sk.xgPace, sk.avgTOI, sk.gp,
      sk.xgRelTM, sk.xgaRelTM, sk.dzPct, sk.position, age,
      capHit, yrs, 83.5, bio?.draftOverall,
    );
    playerNavs.push({ name: sk.name, nav: result.nav, off: result.raw.off, def: result.raw.def, ageC: result.raw.age, capC: result.raw.cap, capHit });
  }
  playerNavs.sort((a, b) => b.nav - a.nav);
  console.log(`    Top 5 by NAV:`);
  for (const p of playerNavs.slice(0, 5)) {
    console.log(`      ${p.name.padEnd(25)} NAV=${p.nav.toFixed(0).padStart(6)}  off=${p.off.toFixed(0).padStart(4)}  def=${p.def.toFixed(0).padStart(4)}  age=${p.ageC.toFixed(0).padStart(4)}  cap=${p.capC.toFixed(0).padStart(6)}  $${(p.capHit).toFixed(2)}M`);
  }
  console.log(`    Bottom 3 by NAV:`);
  for (const p of playerNavs.slice(-3)) {
    console.log(`      ${p.name.padEnd(25)} NAV=${p.nav.toFixed(0).padStart(6)}  off=${p.off.toFixed(0).padStart(4)}  def=${p.def.toFixed(0).padStart(4)}  age=${p.ageC.toFixed(0).padStart(4)}  cap=${p.capC.toFixed(0).padStart(6)}  $${(p.capHit).toFixed(2)}M`);
  }
}

// ── More granular ablation ───────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log("GRANULAR ABLATION");
console.log(`${"─".repeat(60)}`);

// Off + Def (no age, no cap)
const offDefNavs: number[] = [];
const offAgeNavs: number[] = [];
for (const r of allResults) {
  const seasonSkaters = skaterSeasons.filter(s => s.team === r.team && s.season === r.season);
  let offDefSum = 0, offAgeSum = 0;
  for (const sk of seasonSkaters) {
    const age = getAge(sk.name, r.season);
    if (age === null) continue;
    const bio = biosByName.get(slug(sk.name));
    const result = calcSimplifiedSkaterNAV(
      sk.ptsPace, sk.goalsPace, sk.xgPace, sk.avgTOI, sk.gp,
      sk.xgRelTM, sk.xgaRelTM, sk.dzPct, sk.position, age,
      0, 3, CAP_CEILING[r.season] ?? 104, bio?.draftOverall,
    );
    offDefSum += result.raw.off + result.raw.def;
    offAgeSum += result.raw.off + result.raw.age;
  }
  offDefNavs.push(offDefSum);
  offAgeNavs.push(offAgeSum);
}

const rOffDef = pearsonR(offDefNavs, gds);
const rOffAge = pearsonR(offAgeNavs, gds);
console.log(`  Off only:       r=${rOff.toFixed(4)}  R²=${(rOff * rOff).toFixed(4)}`);
console.log(`  Off + Def:      r=${rOffDef.toFixed(4)}  R²=${(rOffDef * rOffDef).toFixed(4)}`);
console.log(`  Off + Age:      r=${rOffAge.toFixed(4)}  R²=${(rOffAge * rOffAge).toFixed(4)}`);
console.log(`  Off + Def + Age:r=${rOnIce.toFixed(4)}  R²=${(rOnIce * rOnIce).toFixed(4)}`);
console.log(`  Full NAV:       r=${rAll.toFixed(4)}  R²=${r2All.toFixed(4)}`);
console.log(`  Goalie alone:   r=${rGl.toFixed(4)}  R²=${(rGl * rGl).toFixed(4)}`);

// ── Summary ──────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log("SUMMARY");
console.log(`${"=".repeat(60)}`);
console.log(`Roster NAV explains ${(r2All * 100).toFixed(1)}% of team goal differential variance.`);
if (r2All >= 0.40) {
  console.log("STRONG: The composite meaningfully predicts team performance.");
} else if (r2All >= 0.25) {
  console.log("MODERATE: The composite has signal but room for improvement.");
} else if (r2All >= 0.10) {
  console.log("WEAK: Some signal, but the composite needs calibration work.");
} else {
  console.log("INSUFFICIENT: The composite does not predict team performance.");
}
