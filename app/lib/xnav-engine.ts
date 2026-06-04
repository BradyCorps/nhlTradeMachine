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

import { LEAGUE, FRANCHISE, ageDecayRate, ageSlotPenalty } from "@/app/lib/season-config";

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
  qocRank?:       number;
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

  const goalieImpact = expGSAx >= 0
    ? Math.pow(expGSAx / LEAGUE.gsaxSd, 1.5) * 80
    : (expGSAx / LEAGUE.gsaxSd) * 40;

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

  // RFA Cliff: cost-controlled goalie years carry a premium
  const isRFA       = asset.age + navYears <= 27;
  const navTermMult = isRFA
    ? Math.min(2.5, 1.4 + navYears * 0.15)
    : Math.min(2.5, 1.0 + navYears * 0.12);

  const capCostG       = navCapHit * 1.6 * navTermMult;
  const retentionSev   = Math.pow((asset.retainedPct || 0) * 100, 1.25);
  const retainedBonus  = retentionSev * asset.capHit * 0.06;
  const rawTotal       = safe((goalieImpact + workloadBonus) * ageFactor - capCostG + retainedBonus);

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
    cap:    -(capCostG - retainedBonus),
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
  const qoc    = safe(asset.qocRank ?? 300);
  const xgRel  = safe(asset.xgRelTM ?? 0);
  const xgaRel = safe(asset.xgaRelTM ?? 0);
  const dzPct  = safe(asset.dzPct   ?? 0.5);
  const ops    = asset.ops != null ? safe(asset.ops) : null;
  const dps    = asset.dps != null ? safe(asset.dps) : null;
  const age    = asset.age;
  const isD    = asset.position === "D";
  const games  = asset.games ?? 60;

  const effectiveCap = asset.capHit * (1 - (asset.retainedPct || 0));
  const confidence   = clamp(games / 65, 0.3, 1.0);

  // ── Offensive value ───────────────────────────────────────────
  const ptsScale  = isD ? 0.75 : 1.0;
  const ptsVal    = pts * ptsScale;
  const noivBonus = clamp(xgRel * 3.5, -20, 25);
  const offPS     = ops !== null ? ops * 17 : null;

  // Power-law curve: elite players separate more than linear pts * 1.6
  const offRaw = offPS !== null
    ? (offPS * confidence) + Math.pow(ptsVal / 45, 1.6) * 55 * (1 - confidence) + (noivBonus * 0.25)
    : Math.pow(ptsVal / 45, 1.6) * 55 + (xg * 0.5) + noivBonus;

  let offTotal = safe(offRaw);
  // Soft ceiling at 450 — historic Gretzky-level seasons still separate
  if (offTotal > 450) {
    const excess = offTotal - 450;
    offTotal = 450 + (150 * (1 - Math.exp(-excess / 150)));
  }

  // ── Defensive value ───────────────────────────────────────────
  const toiD   = clamp((toi - 15) * 2.5, 0, 30);
  const qocVal = clamp((400 - qoc) / 400 * 20, 0, 20);
  const dzVal  = clamp((dzPct - 0.3) * 40, 0, 12);

  // dps * 15 (not * 120 — the old * 15 * 8 compounding bug is removed)
  const defRaw = dps !== null
    ? dps * 15 * confidence + (def * 20 + qocVal + toiD) * (1 - confidence)
    : def * 20 + qocVal + toiD + dzVal - xgaRel * 4;
  const defTotal = safe(defRaw);

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

  // ── Time-Discounted Cap Surplus Model ─────────────────────────
  // Treats the contract as a multi-year liability that deflates as the cap grows.
  // Non-linear superstar curve: elite production commands an exponential cap share,
  // so Draisaitl at $14M on 7yr isn't crushed the same as a depth player.
  const BASE_CAP_CEILING = 104.0;
  const CAP_GROWTH_RATE  = 1.04;
  const contractYears    = Math.max(1, asset.yearsRemaining || 1);

  // Star premium: franchise talent commands exponential market value above $1M/20NAV
  const baseExpectedCap = trueMarketValue / 20;
  const starPremium     = trueMarketValue > 150
    ? Math.pow((trueMarketValue - 150) / 45, 1.6)
    : 0;
  const marketValueDollars = Math.max(0.9, baseExpectedCap + starPremium);

  let netSurplusValuePoints = 0;
  for (let i = 0; i < contractYears; i++) {
    const projectedCapCeiling = BASE_CAP_CEILING * Math.pow(CAP_GROWTH_RATE, i);
    // Cap footprint shrinks relative to a growing ceiling
    const adjustedCapFootprint = effectiveCap * (BASE_CAP_CEILING / projectedCapCeiling);
    const annualSurplusDollars = marketValueDollars - adjustedCapFootprint;
    const annualSurplusPoints  = annualSurplusDollars * 20;
    const timeDiscount         = Math.pow(0.92, i); // 8% annual financial discounting
    if (annualSurplusPoints >= 0) {
      // Bargain: surplus years are premium assets; RFA years get structural bonus
      const ageAtYear        = asset.age + i;
      const structuralPremium = ageAtYear <= 27 ? 1.25 : 1.10;
      netSurplusValuePoints  += annualSurplusPoints * structuralPremium * timeDiscount;
    } else {
      // Overpaid: deficit years are unmitigated drag anchors
      netSurplusValuePoints += annualSurplusPoints * 1.35 * timeDiscount;
    }
  }

  // Normalise by duration; elite production in one slot earns efficiency bonus
  const rosterSlotEfficiencyBonus = Math.max(1.0, trueMarketValue / 180);
  const baselineCapComponent      = (netSurplusValuePoints / contractYears) * rosterSlotEfficiencyBonus;

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
  const developmentDiscount =
    age <= 21 ? 0.68 :
    age <= 22 ? 0.76 :
    age <= 23 ? 0.82 :
    age <= 24 ? 0.88 :
    age <= 25 ? 0.93 :
    1.0;

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
  // regardless of contract situation. Any GM would take Draisaitl at $14M — the
  // surplus model shouldn't be able to drag him below this floor due to data gaps
  // or partial-season stats.
  //
  // Qualification criteria:
  //   Forwards: age ≥ 27 AND (ptsPace ≥ 80  OR  ops ≥ 5.0 when data is available)
  //             — 80+ pts at age 27+ is unambiguously franchise-tier production
  //   D-men:    age ≥ 27 AND ptsPace ≥ 65 AND avgTOI > 22
  //             — top-pair anchor who has proven it over multiple seasons
  //
  // The floor (300 / 250) embodies the "blockbuster required" principle:
  // acquiring a franchise cornerstone demands a premium roster player +
  // elite prospect + 1st-round pick. No ELC-heavy package should match them alone.
  //
  // Floor uses -Infinity for non-qualifying players so negative NAV contracts
  // (e.g. Huberdeau) are NOT accidentally floored at zero.
  const qualifiesEliteForward  = !isD && age >= 27
    && (pts >= 80 || (ops !== null && ops >= 5.0));
  const qualifiesEliteDefender =  isD && age >= 27 && pts >= 65 && toi > 22;
  const franchiseFloor = qualifiesEliteForward ? 300
    : qualifiesEliteDefender                   ? 250
    : -Infinity;

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

// ── Entry point ───────────────────────────────────────────────────────────────
export function calcNAV(asset: AssetInput): XNAVResult {
  if (asset.position === "Pick") return calcPickNAV(asset);
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