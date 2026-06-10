// ── X-NAV Pure Valuation Engine 2.0 ─────────────────────────────────────────
// Single source of truth for all asset valuation math.
// No Next.js, no HTTP, no side effects — pure functions only.
//
// Key 2.0 features:
//   • Time-Discounted Cap Surplus Model (cap grows 4%/yr; far-future years cost less)
//   • Non-Linear Superstar Cap Curve (elite production commands exponential cap share)
//   • RFA Cliff for goalies (cost-controlled years premium)
//   • Positional Scarcity Premium (C +15%, top-pair D +20%)
//   • Exponential Retention Tax
//   • Rental discount on age penalty (1yr = 75% reduction, 2yr = 40%)

import { SEASON, LEAGUE, FRANCHISE, ageDecayRate, ageSlotPenalty } from "@/app/lib/season-config";

export const DPS_NAV_MULTIPLIER = 15; // dps * 15 = defPS for NAV (not 120 — the *8 bug is removed)

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface AssetInput {
  id:             string;
  name:           string;
  position:       "C" | "W" | "D" | "G" | "Pick";
  age:            number;
  capHit:         number;
  yearsRemaining: number;
  retainedPct?:   number;
  extensionCapHit?: number;
  extensionYears?:  number;
  ptsPace?:       number;
  xGPace?:        number;
  defRate?:       number;
  avgTOI?:        number;
  qocRank?:       number;        // DEPRECATED — legacy iceTimeRank sum; use qocIndex
  qocIndex?:      number | null; // 0-100 deployment difficulty (ice-rank + PK share + dZone starts)
  draftOverall?:    number;      // overall draft slot — triggers pedigree NAV for unproven prospects
  prospectPtsPace?: number;      // NHLe-translated junior scoring pace
  xgRelTM?:       number | null;
  xgaRelTM?:      number | null;
  dzPct?:         number | null;
  ops?:           number | null;
  dps?:           number | null;
  games?:         number;
  gsax?:          number;
  savePct?:       number;
  gamesStarted?:  number;
  teamXga60?:     number;
  round?:         number;
  year?:          number;
  teamStanding?:  number;
  isProtected?:   boolean;
  multiplier?:    number;
  hasLiveStats?:  boolean;
  baselineGsax?:  number;
  baselinePtsPace?: number;
  baselineGameScore?: number;
  baselineDpsProxy?: number;
  baselineXgRel?:    number;
  ppPtsPace82?:      number;
  pkTimeShare?:      number;
  baselineIxg82?:    number;
  baselineHits82?:   number;
  baselineBlocks82?: number;
  pairXgfPct?:       number;
  pairDriverScore?:  number;
  baselineHdsvPct?:  number;
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
  isRFA?:      boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export const safe  = (n: number): number => (isNaN(n) || !isFinite(n) ? 0 : n);
export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

// ── Pick NAV ──────────────────────────────────────────────────────────────────
export function calcPickNAV(asset: AssetInput): XNAVResult {
  const round    = asset.round    ?? 1;
  const year     = asset.year     ?? 2026;
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

// ── Goalie NAV ────────────────────────────────────────────────────────────────
export function calcGoalieNAV(asset: AssetInput): XNAVResult {
  const gamesG      = Math.max(1, asset.gamesStarted ?? asset.games ?? 1);
  const confidenceG = Math.min(1.0, Math.pow(gamesG / 60, 1.4));
  const isStarter   = gamesG >= 50;
  const isBackup    = gamesG < 38;
  const isTandem    = !isStarter && !isBackup;

  const gsaxRaw          = safe(asset.gsax ?? 0);
  const gsaxPerGame      = gsaxRaw / gamesG;
  const perGameCap       = isStarter ? 0.48 : isTandem ? 0.35 : 0.22;
  const gsaxPerGameCapped = gsaxPerGame > 0 ? Math.min(gsaxPerGame, perGameCap) : gsaxPerGame;

  const teamXga60     = asset.teamXga60 ?? LEAGUE.avgXga60;
  const defCorrection = clamp((teamXga60 - LEAGUE.avgXga60) * 0.40, -0.15, 0.25);
  const gsaxPer60     = (gsaxPerGameCapped + defCorrection) * 60;
  const careerMean    = asset.baselineGsax ?? 0;
  const expGSAx       = gsaxPer60 * confidenceG + careerMean * (1 - confidenceG);

  let goalieImpact = expGSAx >= 0
    ? Math.pow(expGSAx / LEAGUE.gsaxSd, 1.5) * 80
    : (expGSAx / LEAGUE.gsaxSd) * 40;

  // ── Roberto Luongo Goalie Asymptote ─────────────────────────────
  // Absolute max on-ice impact is 300.
  if (goalieImpact > 150) {
    const L = 150;
    const excess = goalieImpact - 150;
    goalieImpact = 150 + L * (1 - Math.exp(-excess / L));
  }

  const workloadBonus = isStarter ? Math.min(20, (gamesG / 60) * 15)
    : isTandem ? Math.min(10, (gamesG / 60) * 10)
    : Math.min(5, (gamesG / 60) * 5);

  const peakAge    = 30;
  const agePenalty = asset.age > peakAge ? Math.pow(asset.age - peakAge, 1.8) * 1.2 : 0;
  const ageFactor  = Math.max(0.3, 1.05 - agePenalty / 100);

  const effectiveCap = asset.capHit * (1 - (asset.retainedPct || 0));
  const extCapHit    = asset.extensionCapHit;
  const navCapHit    = extCapHit ? extCapHit * (1 - (asset.retainedPct || 0)) : effectiveCap;
  const navYears     = extCapHit ? (asset.extensionYears ?? asset.yearsRemaining) : asset.yearsRemaining;
  const contractYears = Math.max(1, navYears || 1);

  // RFA Cliff: cost-controlled goalie years carry a premium
  const isRFA       = asset.age + navYears <= 27;

  // High-danger save % adjustment: HDSV% is the most repeatable goalie skill
  // signal, far less polluted by team defense than raw GSAX.
  // Anchored at league-average ~.815. Capped so it refines rather than competes with GSAX.
  const hdsvAdj = asset.baselineHdsvPct != null
    ? clamp((asset.baselineHdsvPct - 0.815) * 600, -12, 18)
    : 0;

  // ── Logistic S-Curve FMV Cap Percentage (Goalies) ──────────────
  // The max cap for a goalie is historically around 12% of the cap.
  const trueMarketValueG = (goalieImpact + workloadBonus + hdsvAdj) * ageFactor;
  
  const LEAGUE_MIN_PCT_G = 0.009; // 0.9%
  const MAX_CAP_PCT_G    = 0.12;  // 12.0%
  const MIDPOINT_G       = 100;   // The ON_ICE_NAV where a goalie deserves ~6% (elite starter)
  const K_FACTOR_G       = 0.025; // Steepness of the S-curve
  
  const fmvCapPctG = LEAGUE_MIN_PCT_G + (MAX_CAP_PCT_G - LEAGUE_MIN_PCT_G) / (1 + Math.exp(-K_FACTOR_G * (trueMarketValueG - MIDPOINT_G)));

  const BASE_CAP_CEILING = SEASON.capCeiling;
  const CAP_GROWTH_RATE  = 1.04;

  let capSumG = 0;
  for (let i = 0; i < contractYears; i++) {
    const projectedCapCeiling = BASE_CAP_CEILING * Math.pow(CAP_GROWTH_RATE, i);
    const fmvDollars = projectedCapCeiling * fmvCapPctG;
    const annualSurplus = fmvDollars - navCapHit;
    const timeDiscount = Math.pow(0.92, i);
    
    const ageAtYear = asset.age + i;
    const gammaRFA = ageAtYear <= 27 ? 1.25 : 1.0;
    
    capSumG += annualSurplus * 12 * gammaRFA * timeDiscount;
  }
  
  const baselineCapComponentNormalizedG = capSumG / contractYears;
  const singleSlotMultiplierG = Math.max(1.0, trueMarketValueG / 100);
  const multiplierToApplyG = baselineCapComponentNormalizedG < 0 ? 1.0 : singleSlotMultiplierG;
  const baselineCapComponentG = baselineCapComponentNormalizedG * multiplierToApplyG;

  const retentionSev   = Math.pow((asset.retainedPct || 0) * 100, 1.25);
  const retainedBonus  = retentionSev * asset.capHit * 0.06;
  const capTotalG      = safe(baselineCapComponentG + retainedBonus);
  
  const rawTotal       = safe(trueMarketValueG + capTotalG);

  const isYoungControlled = asset.age <= 26 && effectiveCap <= 3.5 && !extCapHit;
  const youngFloor = isYoungControlled && (isStarter || isTandem)
    ? Math.max(0, (27 - asset.age) * 10 - effectiveCap * 3
        + Math.min(15, (gamesG / 82) * 20) + (isTandem ? -8 : 0))
    : 0;

  const roleCap     = isBackup ? 35 : isTandem ? 60 : 250;
  const cappedTotal = Math.min(Math.max(rawTotal, youngFloor), roleCap);

  return {
    total:  cappedTotal,
    off:    0,
    def:    safe(goalieImpact * ageFactor),
    age:    -agePenalty,
    cap:    Math.round(capTotalG),
    upside: youngFloor > 0 ? youngFloor * 0.4 : 0,
    noivImpact: 0,
    fArchetype: "",
    isRFA,
  };
}

// ── Skater NAV ────────────────────────────────────────────────────────────────
export function calcSkaterNAV(asset: AssetInput): XNAVResult {
  const pts    = safe(asset.ptsPace ?? 0);
  const xg     = safe(asset.xGPace  ?? 0);
  const def    = safe(asset.defRate ?? 0);
  const toi    = safe(asset.avgTOI  ?? 18);
  // QoC Index 0-100 (higher = tougher deployment). Legacy qocRank (an
  // iceTimeRank sum) is roughly mapped only when the index is absent.
  const qocIdx = asset.qocIndex != null
    ? clamp(safe(asset.qocIndex), 0, 100)
    : clamp((400 - safe(asset.qocRank ?? 300)) / 400, 0, 1) * 100;
  const xgRel  = safe(asset.xgRelTM ?? 0);
  const xgaRel = safe(asset.xgaRelTM ?? 0);
  const dzPct  = safe(asset.dzPct   ?? 0.5);
  const age    = asset.age;
  const isD    = asset.position === "D";
  const games  = asset.games ?? 60;


  // Pace cumulative point shares to 82 games to prevent injury collapse
  // We use a floor of 20 games to avoid absurd small-sample size multipliers
  const paceMultiplier = clamp(82 / Math.max(games, 20), 1.0, 4.1);
  const ops    = asset.ops != null ? safe(asset.ops) * paceMultiplier : null;
  const dps    = asset.dps != null ? safe(asset.dps) * paceMultiplier : null;

  const effectiveCap = asset.capHit * (1 - (asset.retainedPct || 0));
  const confidence   = clamp(games / 65, 0.3, 1.0);

  // ── Baseline Blending ─────────────────────────────────────────
  // MoneyPuck 3-year weighted baselines anchor valuations, especially
  // early in the season or during anomalous/injury-shortened years.
  const baselinePtsPace = asset.baselinePtsPace;
  const blendedPts = baselinePtsPace !== undefined && baselinePtsPace > 0
    ? (pts * 0.4 + baselinePtsPace * 0.6)
    : pts;

  const ptsScale  = isD ? 0.75 : 1.0;
  const ptsVal    = blendedPts * ptsScale;

  const baselineDpsProxy = asset.baselineDpsProxy;
  const blendedDps = baselineDpsProxy !== undefined && baselineDpsProxy > 0
    ? (dps !== null ? dps * 0.4 + baselineDpsProxy * 0.6 : baselineDpsProxy)
    : dps;
  // baselineXgRel is a fraction (e.g. 0.05 = +5 pct pts); xgRel is already in pct pts.
  // Blending damps single-season PDO luck the same way blendedPts damps scoring spikes.
  const baselineXgRelPts = asset.baselineXgRel != null ? asset.baselineXgRel * 100 : null;
  const blendedXgRel = baselineXgRelPts !== null
    ? (asset.xgRelTM != null ? xgRel * 0.4 + baselineXgRelPts * 0.6 : baselineXgRelPts)
    : xgRel;
  const noivBonus = clamp(blendedXgRel * 3.5, -20, 25);
  const offPS     = ops !== null ? ops * 17 : null;

  // Power-law curve: elite players separate more than linear pts * 1.6
  // Use the power curve as the primary engine to properly value generational talent.
  // We use offPS (Point Shares) to slightly modulate it, but we never let a linear 
  // Point Shares stat overwrite the exponential power curve!
  const baseOffCurve = Math.pow(ptsVal / 45, 1.6) * 55;
  const offRaw = offPS !== null
    ? baseOffCurve + (offPS - (ptsVal / 45) * 55) * 0.4 + (noivBonus * 0.25)
    : baseOffCurve + (xg * 0.5) + noivBonus;

  let offTotal = safe(offRaw);
  // ── Lemieux Offensive Asymptote ─────────────────────────────
  // V(P) = L * (1 - e^(-kP)) applied to the high-end to prevent 
  // generational separation from exploding off the UI charts.
  // Absolute Max = 450.
  if (offTotal > 250) {
    const L = 200; // Remaining headroom to absolute max of 450
    const excess = offTotal - 250;
    offTotal = 250 + L * (1 - Math.exp(-excess / L));
  }

  // ── Defensive value ───────────────────────────────────────────
  const toiD   = clamp((toi - 15) * 2.5, 0, 30);
  const qocVal = (qocIdx / 100) * 20;   // 0-20 NAV contribution, linear in deployment difficulty
  const dzVal  = clamp((dzPct - 0.3) * 40, 0, 12);

  // dps * 15 (not * 120 — the old * 15 * 8 compounding bug is removed)
  const defRawBase = blendedDps !== null
    ? blendedDps * 15 * confidence + (def * 20 + qocVal + toiD) * (1 - confidence)
    : def * 20 + qocVal + toiD + dzVal - xgaRel * 4;

  // Pairing driver score (D only): how much better do partners perform with this
  // player vs. without them? Fox-tier drivers sit ~+20, passengers go negative.
  // Cap tightly so it refines the dps signal, never replaces it.
  const driverAdj = isD && asset.pairDriverScore != null
    ? clamp(asset.pairDriverScore * 0.8, -8, 12)
    : 0;
  const defRaw = defRawBase + driverAdj;

  let defTotal = safe(defRaw);
  // ── Larry Robinson Defensive Asymptote ──────────────────────────
  // Max 150 UI ceiling.
  if (defTotal > 80) {
    const L = 70; // Remaining headroom to 150
    const excess = defTotal - 80;
    defTotal = 80 + L * (1 - Math.exp(-excess / L));
  }

  // DEF display (position-aware, not used in total)
  const xgaRelDisp = asset.xgaRelTM;
  const toiWeightD = Math.pow(clamp(toi / 18, 0.4, 2.0), 1.3);
  const defReliabilityWeight = toi >= 20 ? 1.0 : toi >= 17 ? 0.65 : toi >= 15 ? 0.35 : 0.15;
  const isForwardPos = ["C", "W", "L", "R", "F"].includes(asset.position ?? "");
  const dzRaw    = asset.dzPct;
  const hasDZData = dzRaw !== null && dzRaw !== undefined;
  const dzPctVal  = hasDZData ? safe(dzRaw!) : null;

  const rawDefForDisplay  = safe(asset.defRate ?? 0);
  const clampedDefDisplay = Math.max(-0.3, Math.min(0.4, rawDefForDisplay));
  const fwdDzBonus = isForwardPos && hasDZData
    ? Math.max(0, (dzPctVal! - 0.45) * 60) : 0;
  const fwdDefRate = isForwardPos
    ? safe(clampedDefDisplay * 45 * defReliabilityWeight) : 0;
  const xgaRD = asset.xgaRelTM;
  const fwdMatchupCredit = isForwardPos && hasDZData && dzPctVal! > 0.50
    && xgaRD !== null && xgaRD !== undefined && xgaRD > 0
    ? Math.min(6, xgaRD * (dzPctVal! - 0.45) * 60) : 0;

  const forwardDef = clamp(fwdDzBonus + fwdDefRate + fwdMatchupCredit, -20, 35);
  const defDisplay = isForwardPos ? forwardDef
    : (xgaRelDisp !== null && xgaRelDisp !== undefined) && (asset.games ?? 0) >= 20
    ? clamp(safe(-xgaRelDisp * toiWeightD * 40 * defReliabilityWeight), -40, 50)
    : defTotal * defReliabilityWeight;

  // ── Age curve ─────────────────────────────────────────────────
  // Audited against 2022-26 YoY pts/82 cohorts (940-player bios join, ≥40 GP):
  // forwards grow through 23, plateau 24-27, decline from 28 (≈ -2.5/yr,
  // steepening to -6+/yr by 34); D-men grow through 27, decline from 28-29.
  // Both peaks and the 1.6 convexity match observed decay; survivorship bias
  // (decliners drop below 40 GP) means true aging is slightly steeper, so the
  // penalty erring aggressive is correct.
  const peakAge = isD ? 27 : 26;
  const baseAge = age <= peakAge
    ? Math.max(0, (peakAge - age) * 4.5)
    : -Math.pow(age - peakAge, 1.6) * 1.8;
  // Rental discount: 1yr contract = 75% age penalty reduction; 2yr = 40%
  const yrs          = asset.yearsRemaining || 3;
  const rentalFactor = yrs <= 1 ? 0.25 : yrs <= 2 ? 0.60 : 1.0;
  const ageVal       = baseAge < 0 ? baseAge * rentalFactor : baseAge;
  const ageTotal     = safe(ageVal);

  // ── On-Ice Core ───────────────────────────────────────────────
  const trueMarketValue = offTotal + defTotal + ageTotal;
  const isRFA = asset.age + asset.yearsRemaining <= 27;

  // ── Logistic S-Curve FMV Cap Percentage ───────────────────────
  // The absolute maximum a player can legally earn under the NHL CBA is 20% of the cap.
  // We use a logistic function to map ON_ICE_NAV to an FMV Cap Percentage between
  // League Minimum (0.9%) and the Maximum (20%).
  
  const LEAGUE_MIN_PCT = 0.009; // 0.9%
  const MAX_CAP_PCT    = 0.20;  // 20.0%
  // Defensemen's 25% scoring penalty and the DEF asymptote mean elite D-men top out at
  // 115–135 on-ice NAV, well below the forward-calibrated 180 midpoint. Using 180 for
  // both positions makes $8–9M contracts look "overpriced" for top-pair D — which is
  // wrong. D midpoint of 120: a defensive specialist at ~95 on-ice breaks even at ~$8.4M,
  // and an elite offensive D at ~125 on-ice earns meaningful positive surplus.
  const MIDPOINT       = isD ? 120 : 180;
  const K_FACTOR       = 0.022; // Steepness of the S-curve
  
  const fmvCapPct = LEAGUE_MIN_PCT + (MAX_CAP_PCT - LEAGUE_MIN_PCT) / (1 + Math.exp(-K_FACTOR * (trueMarketValue - MIDPOINT)));

  // Use extension cap hit and years if available to align with Goalie NAV and fix extension distortions
  const extCapHit        = asset.extensionCapHit;
  const navCapHit        = extCapHit ? extCapHit * (1 - (asset.retainedPct || 0)) : effectiveCap;
  const navYears         = extCapHit ? (asset.extensionYears ?? asset.yearsRemaining) : asset.yearsRemaining;
  const contractYears    = Math.max(1, navYears || 1);

  const BASE_CAP_CEILING = SEASON.capCeiling; // Current cap space
  const CAP_GROWTH_RATE  = 1.04;  // 4% annual growth

  // Loop through contract term to calculate the multi-year compound surplus sum:
  let capSum = 0;
  for (let i = 0; i < contractYears; i++) {
    const projectedCapCeiling = BASE_CAP_CEILING * Math.pow(CAP_GROWTH_RATE, i);
    
    // Convert FMV% into raw dollars based on the projected cap ceiling for that year
    const fmvDollars = projectedCapCeiling * fmvCapPct;
    const annualSurplus = fmvDollars - navCapHit;
    
    // 8% annual financial discount: future cap space/penalties matter less today
    const timeDiscount = Math.pow(0.92, i);
    
    // gamma_RFA rewards organizations holding cost-controlled positive surplus.
    // Only apply the 1.25x premium when surplus is positive — amplifying a penalty
    // on young players who are slightly above-market double-counts the damage.
    const ageAtYear = asset.age + i;
    const gammaRFA = (ageAtYear <= 27 && annualSurplus > 0) ? 1.25 : 1.0;
    
    // Multiply by 12 to convert raw dollars to NAV points ($1M surplus = 12 NAV)
    capSum += annualSurplus * 12 * gammaRFA * timeDiscount;
  }

  // Normalize by contract years to maintain NAV scaling compatibility
  const baselineCapComponentNormalized = capSum / contractYears;

  // Single-slot concentration multiplier protection:
  // Positive surplus from elite talents carries compounding value
  const singleSlotMultiplier = Math.max(1.0, trueMarketValue / 180);
  const multiplierToApply = baselineCapComponentNormalized < 0 ? 1.0 : singleSlotMultiplier;
  const baselineCapComponent = baselineCapComponentNormalized * multiplierToApply;

  // Retention tax (exponential — absorbing dead cap still commands a premium)
  const retentionSev  = Math.pow((asset.retainedPct || 0) * 100, 1.25);
  const retainedBonus = retentionSev * asset.capHit * 0.08;
  const capTotal      = safe(baselineCapComponent + retainedBonus);

  // ── Forward archetype ─────────────────────────────────────────
  const noivImpact = Math.round(noivBonus);
  let fArchetype = "";
  if (!isD) {
    const psRatio = ops !== null && dps !== null && (ops + dps) > 1
      ? ops / (ops + dps) : null;
    if (psRatio !== null) {
      fArchetype = psRatio > 0.70 ? "SNIPER"
        : psRatio > 0.58 ? "SCORER"
        : psRatio < 0.35 ? "GRINDER"
        : defTotal > 35 && offTotal > 60 ? "TWO_WAY"
        : offTotal > 70 ? "PLAYMAKER"
        : "SCORER";
    } else {
      fArchetype = pts > 80 ? "SNIPER"
        : def > 0.5 && toi > 20 ? "TWO_WAY"
        : pts > 50 ? "PLAYMAKER"
        : "SCORER";
    }

    // Situational refinement from NST/MoneyPuck baselines — overrides inference
    // when real usage data is available and clear-cut.
    const hits82  = asset.baselineHits82;
    const pkShare = asset.pkTimeShare;
    const ppPace  = asset.ppPtsPace82;
    if (hits82 != null && hits82 >= 140 && blendedPts < 40) {
      fArchetype = "GRINDER";
    } else if (pkShare != null && pkShare >= 0.12 && blendedPts >= 35 && fArchetype !== "SNIPER") {
      fArchetype = "TWO_WAY";
    } else if (ppPace != null && ppPace >= 22 && blendedPts >= 55 && fArchetype === "SCORER") {
      fArchetype = "SNIPER";
    }
  }

  // ── Positional Scarcity Premium ───────────────────────────────
  const isTopPairD       = isD && toi > 22;
  const positionalPremium = asset.position === "C" ? 1.15 : isTopPairD ? 1.20 : 1.0;
  const mult             = asset.multiplier ?? 1.0;
  const rawTotal         = safe((trueMarketValue + capTotal) * mult * positionalPremium);

  // ── Development Risk Discount ─────────────────────────────────
  // Young players on ELCs have significant bust probability that the cap surplus
  // model ignores. A 21-year-old D-man might become Makar — or might plateau as a
  // solid #2. This discount prices that uncertainty into their trade value.
  //
  // Graduated by age (players 26+ are considered fully established):
  //   ≤21: ×0.68  — ELC, limited NHL track record, high variance
  //   22:  ×0.76  — first full contract year, still developing
  //   23:  ×0.82  — showing signs but not proven elite
  //   24:  ×0.88  — near prime, most upside captured
  //   25:  ×0.93  — essentially proven, minor residual risk
  //   26+: ×1.00  — fully established, no discount
  //
  // Note: only applies to skaters; goalies and picks have their own models.
  let developmentDiscount =
    age <= 21 ? 0.68 :
    age <= 22 ? 0.76 :
    age <= 23 ? 0.82 :
    age <= 24 ? 0.88 :
    age <= 25 ? 0.93 :
    1.0;

  // Generational Exemption:
  // If a young player is already producing at a top-tier pace, they are proven.
  // We linearly reduce their discount back toward 1.0 based on production.
  if (age <= 25 && (pts >= 65 || (ops !== null && ops >= 4.5))) {
     const metric = Math.max(pts, ops !== null ? ops * 15 : 0);
     const exemptionFactor = clamp((metric - 65) / 20, 0, 1);
     developmentDiscount = developmentDiscount + (1.0 - developmentDiscount) * exemptionFactor;
  }

  const discountedTotal = rawTotal * developmentDiscount;

  // ── Franchise Cornerstone Floor ───────────────────────────────
  // A proven franchise player can never be worth less than their floor in a trade,
  // regardless of contract situation. Any GM would take Draisaitl at $14M — the
  // surplus model shouldn't be able to drag him below this floor.
  //
  // Qualification:
  //   Forwards: age ≥ 27 AND ptsPace ≥ 90 (proven multi-year elite scorer)
  //   D-men:    age ≥ 27 AND ptsPace ≥ 65 AND avgTOI > 22 (proven top-pair anchor)
  //
  // The floor reflects the "blockbuster required" principle: acquiring a franchise
  // cornerstone demands a premium roster player + elite prospect + 1st-round pick.
  // No package of depth players and ELC wildcards should be able to match them.
  // ── Franchise Cornerstone Floor ───────────────────────────────
  // A proven franchise player can never be worth less than their floor in a trade,
  // regardless of contract situation. The surplus model shouldn't be able to 
  // drag them below this floor due to data gaps or partial-season stats.
  //
  // Qualification criteria:
  //   Forwards: ptsPace ≥ 80 OR ops ≥ 5.0
  //   D-men:    ptsPace ≥ 65 AND avgTOI > 22 OR ops ≥ 4.0
  //
  // The floor embodies the "blockbuster required" principle. Elite young players
  // (under 26) have significantly higher floors due to prime years and team control.
  // No ELC-heavy package should match them alone.
  //
  // Floor uses -Infinity for non-qualifying players so negative NAV contracts
  // are NOT accidentally floored at zero.
  const qualifiesEliteForward  = !isD && (pts >= 80 || (ops !== null && ops >= 5.0));
  const qualifiesEliteDefender =  isD && (pts >= 65 || (ops !== null && ops >= 4.0)) && toi > 22;

  let franchiseFloor = -Infinity;
  if (qualifiesEliteForward) {
    franchiseFloor = age <= 24 ? 260 : age <= 26 ? 220 : 180;
  } else if (qualifiesEliteDefender) {
    franchiseFloor = age <= 24 ? 240 : age <= 26 ? 200 : 160;
  }

  const total = Math.max(discountedTotal, franchiseFloor);

  return {
    total:  Math.round(total),
    off:    Math.round(offTotal),
    def:    Math.round(defDisplay),
    age:    Math.round(ageTotal),
    cap:    Math.round(capTotal),
    upside: Math.round(Math.max(0, ageTotal)),
    noivImpact,
    fArchetype,
    isRFA,
  };
}

// ── Prospect NAV (pedigree-based) ─────────────────────────────────────────────
// A drafted prospect with no meaningful NHL sample is valued as the pick that
// selected him, with the lottery uncertainty resolved (+10%). Optional NHLe
// stats (junior production translated to NHL pace at import time) modulate
// the pedigree value ±15%. Once the player logs 14+ NHL games, the normal
// stats-driven path takes over.
export function calcProspectNAV(asset: AssetInput): XNAVResult {
  const overall = asset.draftOverall ?? 32;
  const round   = Math.max(1, Math.ceil(overall / 32));
  const slotInRound = overall - (round - 1) * 32;

  // Reuse the calibrated pick-slot curve: slot 1 ≙ worst standing (32)
  const pick = calcPickNAV({
    ...asset,
    position:     "Pick",
    round,
    year:         SEASON.draftYear, // no future-year decay — the player exists now
    teamStanding: clamp(33 - slotInRound, 1, 32),
  });

  const certainty = 1.10; // lottery risk resolved — he IS the #N pick
  // NHLe modulation: 70 translated points ≈ elite junior production
  const nhle = asset.prospectPtsPace != null
    ? clamp(0.85 + 0.30 * (asset.prospectPtsPace / 70), 0.85, 1.15)
    : 1.0;
  // Goalie prospects are the least projectable asset in hockey
  const goalieDiscount = asset.position === "G" ? 0.80 : 1.0;

  const total = Math.round(pick.total * certainty * nhle * goalieDiscount);
  return {
    total,
    off: 0, def: 0, age: 0, cap: 0,
    upside: Math.round(total * 0.70),
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function calcNAV(asset: AssetInput): XNAVResult {
  if (asset.position === "Pick") return calcPickNAV(asset);
  // Drafted prospect without an NHL sample — pedigree valuation
  // (14-game threshold matches the rookie small-sample logic elsewhere)
  if (asset.draftOverall != null && (asset.games ?? 0) < 14 && !asset.hasLiveStats) {
    return calcProspectNAV(asset);
  }
  if (asset.position === "G")    return calcGoalieNAV(asset);
  return calcSkaterNAV(asset);
}

// ── Package compression ───────────────────────────────────────────────────────
export function compressPackage(
  assets: Array<{ nav: number; isPick?: boolean; age?: number }>,
): number {
  if (assets.length === 0) return 0;
  const picks   = assets.filter(a => a.isPick);
  const players = assets.filter(a => !a.isPick);
  const pickValue = picks.reduce((sum, a) => sum + a.nav, 0);
  if (players.length === 0) return pickValue;
  const sorted = [...players].sort((a, b) => b.nav - a.nav);
  let decaySum = 0, penaltySum = 0;
  sorted.forEach((a, i) => {
    const age = a.age ?? 27;
    decaySum  += a.nav * Math.pow(ageDecayRate(age), i);
    if (i > 0) penaltySum += ageSlotPenalty(age);
  });
  return pickValue + Math.max(0, decaySum - penaltySum);
}