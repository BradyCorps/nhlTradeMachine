// ── X-NAV Pure Valuation Engine ─────────────────────────────────────────────
// This module contains only pure math — no Next.js, no HTTP, no side effects.
// Imported by /api/evaluate/route.ts for production and by tests for validation.
// Any change to these functions will be caught by the test suite before deploy.

export interface AssetInput {
  // Identity
  id:             string;
  name:           string;
  position:       string;
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
  const LEAGUE_AVG_XGA60 = 2.55;
  const teamXga60 = asset.teamXga60 ?? LEAGUE_AVG_XGA60;
  const defCorrection = clamp((teamXga60 - LEAGUE_AVG_XGA60) * 0.40, -0.15, 0.25);
  const gsaxPer60 = (gsaxPerGameCapped + defCorrection) * 60;

  const GSAX_SD = 8.0;
  // Bayesian regression — blend current season with career mean
  const careerMean = asset.baselineGsax ?? 0;
  const expGSAx = gsaxPer60 * confidenceG + careerMean * (1 - confidenceG);

  const goalieImpact = expGSAx >= 0
    ? Math.pow(expGSAx / GSAX_SD, 1.5) * 80
    : (expGSAx / GSAX_SD) * 40;

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
  // Normalize by position — D-men scored against lower scale
  const ptsScale = isD ? 0.75 : 1.0;
  const ptsVal   = pts * ptsScale;

  // Point Shares based offensive value when available
  const offPS    = ops !== null ? ops * 12 : null;
  const offRaw   = offPS !== null
    ? offPS * confidence + (ptsVal * 1.8) * (1 - confidence)
    : ptsVal * 1.8 + xg * 0.8;

  // NOIV — teammate impact
  const noivBonus = xgRel * 3.5;
  const offTotal  = safe(offRaw + noivBonus);

  // ── Defensive value ───────────────────────────────────────────
  const defPS  = dps !== null ? dps * 12 : null;
  const toiD   = clamp((toi - 15) * 2.5, 0, 30); // TOI above 15 min signals heavy usage
  const qocVal = clamp((400 - qoc) / 400 * 20, 0, 20);
  const dzVal  = clamp((dzPct - 0.3) * 40, 0, 12);

  const defRaw   = defPS !== null
    ? defPS * 10 * confidence + (def * 20 + qocVal + toiD) * (1 - confidence)
    : def * 20 + qocVal + toiD + dzVal - xgaRel * 4;
  const defTotal = safe(defRaw);

  // ── DEF display ───────────────────────────────────────────────
  // When NOIV data is present (xgaRelTM), derive the DEF bar from it directly.
  // Negative xgaRelTM = suppresses goals against = positive DEF value.
  // Morrissey (-0.38, 24.7 TOI) → ~+23 DEF; Karlsson (+0.30) → ~-15 DEF
  const xgaRelDisp  = asset.xgaRelTM;
  const toiWeightD  = Math.pow(clamp(toi / 18, 0.4, 2.0), 1.3);

  // ── DEF display ───────────────────────────────────────────────
  // Two paths:
  // 1. xgaRelTM present (MoneyPuck NOIV data) — use it directly.
  //    This is the most reliable signal. Scaled by TOI weight.
  // 2. No xgaRelTM (depth/low-minute players) — use defTotal BUT
  //    apply a reliability dampener based on TOI. Players under 15 min
  //    don't have enough on-ice exposure for defRate to be meaningful.
  //    Nyquist at 12 min/game should not show same DEF as Parayko at 22.
  const defReliabilityWeight = toi >= 20 ? 1.0
    : toi >= 17 ? 0.65
    : toi >= 15 ? 0.35
    : 0.15;

  const isForwardPos = ["C","W","L","R","F"].includes(asset.position ?? "");
  const fwdQocCredit = isForwardPos ? Math.max(0, (300 - qoc) / 300) * 15 : 0;
  const fwdDzBonus   = isForwardPos ? Math.max(0, (safe(asset.dzPct ?? 0.5) - 0.45) * 30) : 0;
  const forwardDef   = clamp(fwdQocCredit + fwdDzBonus + safe(def * 15 * defReliabilityWeight), -20, 35);

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
  const capCost   = effectiveCap * 10 * termMult;
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