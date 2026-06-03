// ── X-NAV Pure Valuation Engine ─────────────────────────────────────────────
// This module contains only pure math — no Next.js, no HTTP, no side effects.
// Imported by /api/evaluate/route.ts for production and by tests for validation.
// Any change to these functions will be caught by the test suite before deploy.

import { LEAGUE, FRANCHISE, ageDecayRate, ageSlotPenalty } from "@/app/lib/season-config";
// DPS_NAV_MULTIPLIER: dps * 15 (MicroBar display) * 8 (NAV weight) = dps * 120 net.
// Changing one without the other silently drifts the display from the math.
export const DPS_NAV_MULTIPLIER = 120; // net NAV per Point Share of DPS

export interface AssetInput {
  // Identity
  id:             string;
  name:           string;
  position:       "C" | "W" | "D" | "G" | "Pick";
  age:            number;

  // Contract
  capHit:         number;
  yearsRemaining: number;
  retainedPct?:   number;
  extensionCapHit?: number;
  extensionYears?:  number;

  // Skater stats
  ptsPace?:       number;
  xGPace?:        number;
  defRate?:       number;
  avgTOI?:        number;
  qocRank?:       number;
  xgRelTM?:       number | null;
  xgaRelTM?:      number | null;
  dzPct?:         number | null;
  ops?:           number | null;
  dps?:           number | null;
  games?:         number;

  // Goalie stats
  gsax?:          number;
  savePct?:       number;
  gamesStarted?:  number;
  teamXga60?:     number;    // team xGA/60 — goalie context adjustment

  // Pick fields
  round?:         number;
  year?:          number;
  teamStanding?:  number;
  isProtected?:   boolean;

  // Misc
  multiplier?:    number;
  hasLiveStats?:  boolean;
  baselineGsax?:  number;
}

export interface XNAVResult {
  total:       number;
  off:         number;
  def:         number;
  age:         number;
  cap:         number;
  upside:      number;
  noivImpact?: number;
  fArchetype?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export const safe  = (n: number): number => (isNaN(n) || !isFinite(n) ? 0 : n);
export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

// ── Pick NAV ─────────────────────────────────────────────────────────────────
export function calcPickNAV(asset: AssetInput): XNAVResult {
  const round    = asset.round ?? 1;
  const year     = asset.year  ?? 2026;
  const standing = asset.teamStanding ?? 16;
  const yearDecay = Math.pow(0.88, year - 2026);

  let baseValue: number;

  if (round === 1) {
    if      (standing >= 30) baseValue = standing === 32 ? 400 : standing === 31 ? 370 : 340;
    else if (standing >= 27) baseValue = standing === 29 ? 290 : standing === 28 ? 260 : 235;
    else if (standing >= 23) baseValue = 190 - (30 - standing) * 8;
    else if (standing >= 17) baseValue = 130 - (23 - standing) * 7;
    else {
      const slot = 33 - standing;
      baseValue = slot <= 17 ? 82 : slot <= 20 ? 65 : slot <= 24 ? 52 : slot <= 27 ? 42 : 32;
    }
  } else if (round === 2) {
    const slot = standing >= 17 ? Math.round((33 - standing) * 0.9) : 33 - standing;
    baseValue = slot <= 5 ? 28 : slot <= 10 ? 20 : slot <= 16 ? 14 : slot <= 24 ? 10 : 7;
  } else if (round === 3) {
    baseValue = standing >= 25 ? 5 : 3;
  } else {
    baseValue = 2;
  }

  const pickTotal = Math.max(round === 1 ? 5 : 1, baseValue * yearDecay);
  const upsideFraction = standing >= 27 ? 0.55 : standing >= 20 ? 0.45 : 0.30;

  return {
    total:  Math.round(pickTotal),
    off: 0, def: 0, age: 0, cap: 0,
    upside: Math.round(pickTotal * upsideFraction),
  };
}

// ── Goalie NAV (G-NAV) ────────────────────────────────────────────────────────
export function calcGoalieNAV(asset: AssetInput): XNAVResult {
  const gamesG      = Math.max(1, asset.gamesStarted ?? asset.games ?? 1);
  const confidenceG = Math.min(1.0, Math.pow(gamesG / 60, 1.4));

  const isStarter = gamesG >= 50;
  const isBackup  = gamesG < 38;
  const isTandem  = !isStarter && !isBackup;

  const gsaxRaw     = safe(asset.gsax ?? 0);
  const gsaxPerGame = gsaxRaw / gamesG;

  // Soft per-game ceiling — Hellebuyck's best season was 0.46/game
  const perGameCap = isStarter ? 0.48 : isTandem ? 0.35 : 0.22;
  const gsaxPerGameCapped = gsaxPerGame > 0
    ? Math.min(gsaxPerGame, perGameCap)
    : gsaxPerGame;

  // Team defense context — xGA/60 vs league average (2.55)
  // LEAGUE.avgXga60 — imported from season-config as LEAGUE.avgXga60
  const teamXga60 = asset.teamXga60 ?? LEAGUE.avgXga60;
  const defCorrection = clamp((teamXga60 - LEAGUE.avgXga60) * 0.40, -0.15, 0.25);
  const gsaxPer60 = (gsaxPerGameCapped + defCorrection) * 60;

  // LEAGUE.gsaxSd — imported from season-config as LEAGUE.gsaxSd
  // Bayesian regression — blend current season with career mean
  const careerMean = asset.baselineGsax ?? 0;
  const expGSAx = gsaxPer60 * confidenceG + careerMean * (1 - confidenceG);

  const goalieImpact = expGSAx >= 0
    ? Math.pow(expGSAx / LEAGUE.gsaxSd, 1.5) * 80
    : (expGSAx / LEAGUE.gsaxSd) * 40;

  const workloadBonus = isStarter
    ? Math.min(20, (gamesG / 60) * 15)
    : isTandem
    ? Math.min(10, (gamesG / 60) * 10)
    : Math.min(5,  (gamesG / 60) * 5);

  const peakAge    = 30;
  const agePenalty = asset.age > peakAge
    ? Math.pow(asset.age - peakAge, 1.8) * 1.2
    : 0;
  const ageFactor  = Math.max(0.3, 1.05 - agePenalty / 100);

  const effectiveCap   = asset.capHit * (1 - (asset.retainedPct || 0));
  const extCapHit      = asset.extensionCapHit;
  const extYears       = asset.extensionYears;
  const navCapHit      = extCapHit ? extCapHit * (1 - (asset.retainedPct || 0)) : effectiveCap;
  const navYears       = extCapHit ? (extYears ?? asset.yearsRemaining) : asset.yearsRemaining;
  const navTermMult    = Math.min(2.5, 1.0 + navYears * 0.15);
  const capCostG       = navCapHit * 1.6 * navTermMult;
  const retainedBonus  = (asset.retainedPct || 0) * asset.capHit * 10;

  const rawTotal = safe((goalieImpact + workloadBonus) * ageFactor - capCostG + retainedBonus);

  // Young goalie floor — applies to starters AND tandem goalies without extensions
  const isYoungControlled = asset.age <= 26 && effectiveCap <= 3.5 && !extCapHit;
  const youngFloor = isYoungControlled && (isStarter || isTandem)
    ? Math.max(0,
        (27 - asset.age) * 10
        - effectiveCap * 3
        + Math.min(15, (gamesG / 82) * 20)
        + (isTandem ? -8 : 0)
      )
    : 0;

  const roleCap     = isBackup ? 35 : isTandem ? 60 : 250;
  const cappedTotal = Math.min(Math.max(rawTotal, youngFloor), roleCap);

  return {
    total:  cappedTotal,
    off:    0,
    def:    safe(goalieImpact * ageFactor),
    age:    -agePenalty,
    cap:    -(capCostG - retainedBonus),
    upside: youngFloor > 0 ? youngFloor * 0.4 : 0,
    noivImpact: 0,
    fArchetype: "",
  };
}

// ── Skater NAV (X-NAV) ────────────────────────────────────────────────────────
export function calcSkaterNAV(asset: AssetInput): XNAVResult {
  const pts      = safe(asset.ptsPace ?? 0);
  const xg       = safe(asset.xGPace  ?? 0);
  const def      = safe(asset.defRate ?? 0);
  const toi      = safe(asset.avgTOI  ?? 18);
  const qoc      = safe(asset.qocRank ?? 300);
  const xgRel    = safe(asset.xgRelTM ?? 0);
  const xgaRel   = safe(asset.xgaRelTM ?? 0);
  const dzPct    = safe(asset.dzPct   ?? 0.5);
  const ops      = asset.ops != null ? safe(asset.ops) : null;
  const dps      = asset.dps != null ? safe(asset.dps) : null;
  const age      = asset.age;
  const isD      = asset.position === "D";
  const games    = asset.games ?? 60;

  const effectiveCap = asset.capHit * (1 - (asset.retainedPct || 0));
  const confidence   = clamp(games / 65, 0.3, 1.0);

// ── Offensive value ───────────────────────────────────────────
  const ptsScale = isD ? 0.75 : 1.0;
  const ptsVal   = pts * ptsScale;

  const noivBonus = clamp(xgRel * 3.5, -20, 25); 

  const offPS  = ops !== null ? ops * 17 : null;
  
  // If we have pure historical Point Shares, let that be the primary driver.
  // We fade out the NOIV bonus when OPS is present to prevent modern inflation.
const offRaw = offPS !== null
    ? (offPS * confidence) + (ptsVal * 1.6 * (1 - confidence)) + (noivBonus * 0.25)
    : (ptsVal * 1.6) + (xg * 0.5) + noivBonus;

  let offTotal = safe(offRaw);

  // ── THE LEMIEUX ASYMPTOTE ─────────────────────────────────────
  // Modern stats (xG, NOIV) inflate current stars past historical benchmarks.
  // As a player surpasses 250 OFF, the gravity of historical greatness kicks in.
  // It becomes exponentially harder to gain points, ensuring nobody touches 
  // Lemieux's 300 ceiling unless they literally score 200 real-world points.
  if (offTotal > 250) {
    const excess = offTotal - 250;
    // Compress all excess value to 40% strength
    offTotal = 250 + (excess * 0.40); 
  }

  // ── Defensive value ───────────────────────────────────────────
  // FIX: dps * 15 directly (was defPS * 8 = dps * 15 * 8 = dps * 120).
  // The old * 15 display scaler was compounded with a * 8 NAV weight,
  // inflating defTotal 8x — Makar showed DEF=720, Ekholm DEF=360.
  // dps * 15 gives ~70-100 for elite D, ~30-50 for solid D — correct range.
  const defPS  = dps !== null ? dps * 15 : null;  // kept for any display usage
  const toiD   = clamp((toi - 15) * 2.5, 0, 30);
  const qocVal = clamp((400 - qoc) / 400 * 20, 0, 20);
  const dzVal  = clamp((dzPct - 0.3) * 40, 0, 12);

  const defRaw   = dps !== null
    ? dps * 15 * confidence + (def * 20 + qocVal + toiD) * (1 - confidence)
    : def * 20 + qocVal + toiD + dzVal - xgaRel * 4;
  const defTotal = safe(defRaw);

  const xgaRelDisp = asset.xgaRelTM;
  const toiWeightD = Math.pow(clamp(toi / 18, 0.4, 2.0), 1.3);

  const defReliabilityWeight = toi >= 20 ? 1.0
    : toi >= 17 ? 0.65
    : toi >= 15 ? 0.35
    : 0.15;

  const isForwardPos = ["C","W","L","R","F"].includes(asset.position ?? "");

  // dzPct: null = no zone data. Don't default to 0.5 (gives everyone +3 spuriously).
  const dzRaw    = asset.dzPct;
  const hasDZData = dzRaw !== null && dzRaw !== undefined;
  const dzPctVal  = hasDZData ? safe(dzRaw!) : null;

  // ── Forward DEF display ───────────────────────────────────────
  // Mirrors evaluate/route.ts logic exactly so tests match production.
  //
  // defRate for display: bypasses NOIV suppression (display-only — doesn't affect NAV).
  // adjustedDef = 0 when hasNOIV=true, so we use rawDef for forwards directly.
  const rawDefForDisplay  = safe(asset.defRate ?? 0);
  const clampedDefDisplay = Math.max(-0.3, Math.min(0.4, rawDefForDisplay));

  const fwdDzBonus = isForwardPos && hasDZData
    ? Math.max(0, (dzPctVal! - 0.45) * 60)
    : 0;

  const fwdDefRate = isForwardPos
    ? safe(clampedDefDisplay * 45 * defReliabilityWeight)
    : 0;

  const xgaRD = asset.xgaRelTM;
  const fwdMatchupCredit = isForwardPos && hasDZData && dzPctVal! > 0.50
    && xgaRD !== null && xgaRD !== undefined && xgaRD > 0
    ? Math.min(6, xgaRD * (dzPctVal! - 0.45) * 60)
    : 0;

  // fwdNoDataFallback REMOVED — it used xgaRelTM which = -defRate (double-dipping).
  // Single signal: defRate only. Clean, no cancellation.

  const forwardDef = clamp(
    fwdDzBonus + fwdDefRate + fwdMatchupCredit,
    -20, 35
  );

  const defDisplay = isForwardPos
    ? forwardDef
    : (xgaRelDisp !== null && xgaRelDisp !== undefined) && (asset.games ?? 0) >= 20
    ? clamp(safe(-xgaRelDisp * toiWeightD * 40 * defReliabilityWeight), -40, 50)
    : defTotal * defReliabilityWeight;

  // ── Age curve ─────────────────────────────────────────────────
  const peakAge  = isD ? 27 : 26;
  const ageVal   = age <= peakAge
    ? Math.max(0, (peakAge - age) * 4.5)           // youth upside
    : -Math.pow(age - peakAge, 1.6) * 1.8;          // decline penalty
  const ageTotal = safe(ageVal);

  // ── Contract cost ─────────────────────────────────────────────
  const termMult  = Math.min(2.5, 1.0 + asset.yearsRemaining * 0.12);
  // FIX: * 6 (was * 10) — cap * 10 was calibrated when DEF was 8x inflated.
  // With corrected DEF, * 10 made elite players on big contracts go negative.
  // * 6 restores balance: elite players on fair contracts show positive NAV.
  const capCost   = effectiveCap * 6 * termMult;
  const retained  = (asset.retainedPct || 0) * asset.capHit * 12;
  const capTotal  = safe(-(capCost - retained));

  // ── NOIV impact for display ───────────────────────────────────
  const noivImpact = Math.round(noivBonus);

  // ── Forward archetype ─────────────────────────────────────────
  let fArchetype = "";
  if (!isD) {
    const psRatio = ops !== null && dps !== null && (ops + dps) > 1
      ? ops / (ops + dps) : null;
    if (psRatio !== null) {
      fArchetype = psRatio > 0.70 ? "SNIPER"
        : psRatio > 0.58 ? "SCORER"
        : psRatio < 0.35 ? "GRINDER"
        : defTotal > 35 && offTotal > 60 ? "TWO_WAY"
        : offTotal > 70 ? "PLAYMAKER" : "SCORER";
    } else {
      fArchetype = pts > 80 ? "SNIPER"
        : def > 0.5 && toi > 20 ? "TWO_WAY"
        : pts > 50 ? "PLAYMAKER" : "SCORER";
    }
  }

  // ── Multiplier (extension, intangible) ────────────────────────
  const mult = asset.multiplier ?? 1.0;

  const total = safe((offTotal + defTotal + ageTotal + capTotal) * mult);

  return {
    total:  Math.round(total),
    off:    Math.round(offTotal),
    def:    Math.round(defDisplay),
    age:    Math.round(ageTotal),
    cap:    Math.round(capTotal),
    upside: Math.round(Math.max(0, ageTotal)),
    noivImpact,
    fArchetype,
  };
}

// ── Main dispatch ─────────────────────────────────────────────────────────────
export function calcNAV(asset: AssetInput): XNAVResult {
  if (asset.position === "Pick") return calcPickNAV(asset);
  if (asset.position === "G")    return calcGoalieNAV(asset);
  return calcSkaterNAV(asset);
}

// ── Package compression ───────────────────────────────────────────────────────
// True Package Value = Σ(NAVᵢ × δⁱ⁻¹) − (n−1) × μ
//
// δ (decay):       Each subsequent asset is worth less — roster slots are finite.
//                  2nd asset = 60%, 3rd = 36%, 4th = 21.6%, ...
// μ (slotPenalty): Structural cost of burning a roster slot on depth vs elite talent.
//                  50 NAV per extra slot — reflects displacement of existing baseline utility.
//
// Why: A single 1,000-NAV superstar is not replaceable by four 250-NAV assets.
// A team receiving four depth pieces must use four roster slots, four cap chunks,
// and four lineup spots — degrading the remaining roster's production density.
// This models the scarcity economics of elite concentration vs depth distribution.
//
// Picks skip the slot penalty (they don't consume a current-year active roster slot)
// but still decay (marginal value of each additional pick diminishes).
// Age-tiered compression helpers — prospects compress much less than veterans.
// Each tier reflects different roster-slot economics:
//   Prospects (≤23): independent developmental bets, not yet occupying prime slots
//   Young NHL (24-27): semi-independent, beginning to compete for prime slots
//   Prime (28-31): full roster slot competition, standard compression
//   Veterans (32+): steepest — maximum displacement cost, limited upside
// ageDecayRate / ageSlotPenalty — imported from season-config

export function compressPackage(
  assets: Array<{ nav: number; isPick?: boolean; age?: number }>,
): number {
  if (assets.length === 0) return 0;
  // Picks: no compression — future options, independent value, no slot costs
  // Players: compressed with age-tiered decay rate and slot penalty per asset
  const picks   = assets.filter(a => a.isPick);
  const players = assets.filter(a => !a.isPick);
  const pickValue = picks.reduce((sum, a) => sum + a.nav, 0);
  if (players.length === 0) return pickValue;
  const sorted = [...players].sort((a, b) => b.nav - a.nav);
  let decaySum = 0;
  let penaltySum = 0;
  sorted.forEach((a, i) => {
    const age = a.age ?? 27; // default to prime age when unknown
    decaySum += a.nav * Math.pow(ageDecayRate(age), i);
    if (i > 0) penaltySum += ageSlotPenalty(age);
  });
  return pickValue + Math.max(0, decaySum - penaltySum);
}

// Tier classification for franchise veto logic
// FRANCHISE.threshold — imported from season-config as FRANCHISE.threshold
// FRANCHISE.megalodon — imported from season-config as FRANCHISE.megalodon