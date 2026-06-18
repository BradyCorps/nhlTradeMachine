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
  capCeiling?:     number;
  retainedPct?:   number;
  extensionCapHit?: number;
  extensionYears?:  number;
  ptsPace?:       number;
  xGPace?:        number;
  defRate?:       number;
  avgTOI?:        number;
  qocRank?:       number;        // DEPRECATED — legacy iceTimeRank sum; use qocIndex
  qocIndex?:      number | null; // 0-100 EV deployment difficulty (ice-rank + dZone starts)
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
  teamHdca60?:       number;   // team HD chances against per 60 min (from team_baselines.json)
  // Admin trade-block status (stamped by league routes). "requested" = formal
  // public trade request → small leverage discount. "available" (quietly
  // shopped) carries no penalty — the team controls that narrative.
  tradeBlockStatus?: "requested" | "available" | "blocked" | "untouchable" | null;
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
  rosterTier?: RosterTier;
  isRFA?:      boolean;
  volatility?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export const safe  = (n: number): number => (isNaN(n) || !isFinite(n) ? 0 : n);
export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

function blendNavResults(lowSample: XNAVResult, established: XNAVResult, establishedWeight: number): XNAVResult {
  const w = clamp(establishedWeight, 0, 1);
  const blend = (a: number, b: number) => Math.round(a * (1 - w) + b * w);
  return {
    total: blend(lowSample.total, established.total),
    off: blend(lowSample.off, established.off),
    def: blend(lowSample.def, established.def),
    age: blend(lowSample.age, established.age),
    cap: blend(lowSample.cap, established.cap),
    upside: blend(lowSample.upside, established.upside),
    noivImpact: blend(lowSample.noivImpact ?? 0, established.noivImpact ?? 0),
    fArchetype: established.fArchetype || lowSample.fArchetype,
    rosterTier: established.rosterTier ?? lowSample.rosterTier,
    isRFA: established.isRFA ?? lowSample.isRFA,
    volatility: Math.max(lowSample.volatility ?? 0, established.volatility ?? 0),
  };
}

export type RosterTier =
  | "ELITE_1ST_LINE"
  | "1ST_LINE_HIGH_2C"
  | "ELITE_SHUTDOWN"
  | "PK_SPECIALIST"
  | "FRINGE_1ST_LINE_2C"
  | "MIDDLE_SIX"
  | "BOTTOM_SIX";

export function calcDeploymentMultiplier(evDzPct: number, evQoc: number): number {
  const zDzCalc = evQoc >= 55 && evDzPct < 0.50 ? 0.50 : evDzPct;
  return 1 + (zDzCalc - 0.50) * 0.60 + ((evQoc - 50) / 100) * 0.35;
}

export function calcArchetypeStrainIndex(pointsPace: number, toi: number, evDzPct: number, evQoc: number): number {
  if (pointsPace < 65 || toi < 19.0) return 1.0;
  return 1 + Math.max(0, evDzPct - 0.50) * 1.5 + Math.max(0, evQoc - 60) / 100;
}

export function calcShortHandedLeverageFactor(evToi: number, shToi: number): number {
  if (evToi < 11.5) return 1.0;
  return 1 + Math.max(0, shToi - 1.5) / 15;
}

export function classifyRosterTier(
  toi: number,
  normalizedPts: number,
  evMdep: number,
  evQoc: number,
  evToi: number,
  shToi: number,
): RosterTier {
  switch (true) {
    case normalizedPts >= 80 || (toi >= 19.0 && normalizedPts >= 75):
      return "ELITE_1ST_LINE";
    case normalizedPts >= 68 || (toi >= 18.0 && normalizedPts >= 65):
      return "1ST_LINE_HIGH_2C";
    case normalizedPts >= 55 || (toi >= 17.0 && normalizedPts >= 50):
      return "FRINGE_1ST_LINE_2C";
    case evQoc >= 65 && evMdep >= 1.05 && evToi >= 12.5 && shToi >= 1.5
      && toi >= 13.5 && normalizedPts >= 30:
      return "ELITE_SHUTDOWN";
    case shToi >= 2.0 && evToi < 12.0:
      return "PK_SPECIALIST";
    case normalizedPts >= 35 || toi >= 14.0:
      return "MIDDLE_SIX";
    default:
      return "BOTTOM_SIX";
  }
}

export function calcSkaterDeploymentContext(asset: AssetInput): {
  evMdep: number;
  asi: number;
  slf: number;
  normalizedPts: number;
  evQoc: number;
  evToi: number;
  shToi: number;
} {
  const pts = safe(asset.ptsPace ?? 0);
  const toi = safe(asset.avgTOI ?? 18);
  const evQoc = asset.qocIndex != null
    ? clamp(safe(asset.qocIndex), 0, 100)
    : clamp((400 - safe(asset.qocRank ?? 300)) / 400, 0, 1) * 100;
  const evDzPct = safe(asset.dzPct ?? 0.5);
  const shToi = clamp(toi * safe(asset.pkTimeShare ?? 0), 0, toi);
  const evToi = Math.max(0, toi - shToi);
  const baselinePtsPace = asset.baselinePtsPace;
  const blendedPts = baselinePtsPace !== undefined && baselinePtsPace > 0
    ? (pts * 0.4 + baselinePtsPace * 0.6)
    : pts;

  const evMdep = calcDeploymentMultiplier(evDzPct, evQoc);
  const asi = calcArchetypeStrainIndex(blendedPts, toi, evDzPct, evQoc);
  const slf = calcShortHandedLeverageFactor(evToi, shToi);
  const normalizedPts = blendedPts * clamp(evMdep * asi * slf, 0.80, 1.25);

  return { evMdep, asi, slf, normalizedPts, evQoc, evToi, shToi };
}

export function resolveRosterTier(asset: AssetInput): RosterTier | undefined {
  if (asset.position === "G" || asset.position === "Pick") return undefined;
  const toi = safe(asset.avgTOI ?? 18);
  const { normalizedPts, evMdep, evQoc, evToi, shToi } = calcSkaterDeploymentContext(asset);
  return classifyRosterTier(toi, normalizedPts, evMdep, evQoc, evToi, shToi);
}

// ── Pick NAV ──────────────────────────────────────────────────────────────────
export function calcPickNAV(asset: AssetInput): XNAVResult {
  const round    = asset.round    ?? 1;
  const baseYear = SEASON.draftYear;
  const year     = asset.year     ?? baseYear;
  const standing = asset.teamStanding ?? 16;
  const yearDecay = Math.pow(0.88, Math.max(0, year - baseYear));

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

  // Team HD rate correction: goalies behind high-HD-volume teams face a harder job.
  // hdCaRatio > 1 = team allows more HD shots than league avg → easier-than-actual raw GSAX.
  const teamHdca60    = asset.teamHdca60 ?? LEAGUE.avgHdca60;
  const hdCaRatio     = teamHdca60 / LEAGUE.avgHdca60;
  const hdRateCorr    = clamp((hdCaRatio - 1.0) * 0.18, -0.10, 0.20);
  const teamXga60     = asset.teamXga60 ?? LEAGUE.avgXga60;
  const defCorrection = clamp((teamXga60 - LEAGUE.avgXga60) * 0.40 + hdRateCorr, -0.18, 0.30);
  const gsaxPer60     = (gsaxPerGameCapped + defCorrection) * 60;
  const careerMean    = asset.baselineGsax ?? 0;
  // Single-season GSAX variance is very high for goalies. Cap confidence at 0.80
  // for all starters so the career baseline always carries 20% weight — a proven
  // elite on a down year (Hellebuyck) shouldn't fully lose his track record.
  // Young goalies (≤26) get a tighter cap (0.75) for even stronger regression.
  const confidenceAdj = isStarter
    ? (asset.age <= 26 ? Math.min(confidenceG, 0.75) : Math.min(confidenceG, 0.80))
    : confidenceG;
  const expGSAx       = gsaxPer60 * confidenceAdj + careerMean * (1 - confidenceAdj);

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
  const agePenalty = asset.age > peakAge ? Math.pow(asset.age - peakAge, 1.55) * 0.95 : 0;
  const ageFactor  = Math.max(0.3, 1.05 - agePenalty / 100);

  const effectiveCap = asset.capHit * (1 - (asset.retainedPct || 0));
  const extCapHit    = asset.extensionCapHit;
  const navCapHit    = extCapHit ? extCapHit * (1 - (asset.retainedPct || 0)) : effectiveCap;
  const navYears     = extCapHit ? (asset.extensionYears ?? asset.yearsRemaining) : asset.yearsRemaining;
  const contractYears = Math.max(1, navYears || 1);

  // RFA Cliff: cost-controlled goalie years carry a premium
  const isRFA       = asset.age + navYears <= 27;

  // High-danger save %: most repeatable goalie skill but still team-context sensitive.
  // Teams that allow a higher volume of HD shots depress HDSV% independently of skill
  // (more HD shots = more of the hardest saves, shrinking HDSV% through selection).
  // Shift the league-average anchor down proportionally to the team's HD shot rate.
  const hdsvAnchor = 0.815 + (hdCaRatio - 1.0) * (-0.05);   // e.g. +20% HD rate → anchor 0.805
  const hdsvAdj = asset.baselineHdsvPct != null
    ? clamp((asset.baselineHdsvPct - hdsvAnchor) * 600, -12, 18)
    : 0;

  // ── Logistic S-Curve FMV Cap Percentage (Goalies) ──────────────
  // The max cap for a goalie is historically around 12% of the cap.
  const trueMarketValueG = (goalieImpact + workloadBonus + hdsvAdj) * ageFactor;

  // Starter market floor: even a below-replacement NHL starter commands a real
  // cap number. The sigmoid at low-but-positive TMV undershoots the true market
  // floor (~$3.5-4M for a 50+ game starter). Apply a floor only to the FMV
  // calculation — the GNAV/def component still reflects true on-ice performance.
  // The floor degrades with age (ageFactor) so a 38-year-old bad goalie on an
  // overpaid deal can still produce negative-value outcomes.
  const starterFloorSignal = clamp((expGSAx + 6) / 18, 0, 1.0);
  const starterTmvFloor = isStarter && gamesG >= 50
    ? Math.max(0, 65 * Math.min(ageFactor, 1.0) * starterFloorSignal)
    : isTandem ? 30 : 0;
  const fmvTmv = Math.max(trueMarketValueG, starterTmvFloor);
  
  const LEAGUE_MIN_PCT_G = 0.009; // 0.9%
  const MAX_CAP_PCT_G    = 0.12;  // 12.0%
  const MIDPOINT_G       = 100;   // The ON_ICE_NAV where a goalie deserves ~6% (elite starter)
  const K_FACTOR_G       = 0.025; // Steepness of the S-curve
  
  // fmvTmv applies the starter/tandem market floor so the sigmoid doesn't
  // undershoot the real market. trueMarketValueG is kept for total/def output.
  const fmvCapPctG = LEAGUE_MIN_PCT_G + (MAX_CAP_PCT_G - LEAGUE_MIN_PCT_G) / (1 + Math.exp(-K_FACTOR_G * (fmvTmv - MIDPOINT_G)));

  const BASE_CAP_CEILING = asset.capCeiling ?? SEASON.capCeiling;
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
  
  const rawTotal       = safe(fmvTmv + capTotalG);
  const rateSignal     = gsaxPerGameCapped + defCorrection;
  const isAscendingGoalie = asset.age <= 27 && gamesG >= 34 && rateSignal >= 0.12 && effectiveCap <= 4.0 && !extCapHit;

  const isYoungControlled = asset.age <= 26 && effectiveCap <= 3.5 && !extCapHit;
  const youngFloor = isYoungControlled && (isStarter || isTandem)
    ? Math.max(0, (27 - asset.age) * 10 - effectiveCap * 3
        + Math.min(15, (gamesG / 82) * 20) + (isTandem ? -8 : 0))
    : 0;

  const roleCap     = isBackup ? (isAscendingGoalie ? 50 : 35) : isTandem ? (isAscendingGoalie ? 95 : 60) : 250;
  const cappedTotal = Math.min(Math.max(rawTotal, youngFloor), roleCap);
  const volatility = Math.round(clamp(
    (1 - confidenceAdj) * 60
      + (gamesG < 50 ? 18 : 8)
      + (asset.age <= 26 ? 12 : 0)
      + (Math.abs(expGSAx) < 6 ? 6 : 0),
    8,
    85,
  ));

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
    volatility,
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

  const hasNhlSignal = Boolean(asset.hasLiveStats) || games >= 14;
  const hasProspectSignal =
    (asset.draftOverall != null && asset.age <= 22) ||
    (asset.prospectPtsPace != null && asset.prospectPtsPace > 0) ||
    (asset.baselinePtsPace != null && asset.baselinePtsPace > 0);
  if (!hasNhlSignal && !hasProspectSignal) {
    return {
      total: 0,
      off: 0,
      def: 0,
      age: 0,
      cap: 0,
      upside: 0,
      noivImpact: 0,
      fArchetype: "",
      rosterTier: "BOTTOM_SIX",
      isRFA: asset.age + asset.yearsRemaining <= 27,
    };
  }


  // Pace cumulative point shares toward 82 games, with sample damping so a
  // 20-game hot start does not fully annualize through the OPS/DPS channel.
  const rawPaceMultiplier = clamp(82 / Math.max(games, 20), 1.0, 4.1);
  const paceConfidence = clamp(games / 82, 0.25, 1.0);
  const paceMultiplier = 1 + (rawPaceMultiplier - 1) * paceConfidence * 0.60;
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

  const { evMdep, normalizedPts, evToi, shToi } = calcSkaterDeploymentContext(asset);

  const ptsScale  = isD ? 0.75 : 1.0;
  const ptsVal    = normalizedPts * ptsScale;

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
  const productionSignal = clamp((blendedPts - 20) / 45, 0, 1);
  const roleSignal = clamp((toi - 11) / 7, 0, 1);
  const pedigreeSignal = asset.draftOverall != null && asset.draftOverall <= 32 ? 0.65 : 0;
  const sampleSignal = clamp(games / 82, 0, 1);
  const youthProjectionSignal = clamp(
    Math.max(productionSignal, roleSignal, pedigreeSignal) * (0.45 + 0.55 * sampleSignal),
    0,
    1,
  );
  const ageVal       = baseAge < 0 ? baseAge * rentalFactor : baseAge * youthProjectionSignal;
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
  const MIDPOINT       = isD ? 120 : 155;
  const K_FACTOR       = 0.022; // Steepness of the S-curve
  
  const fmvCapPct = LEAGUE_MIN_PCT + (MAX_CAP_PCT - LEAGUE_MIN_PCT) / (1 + Math.exp(-K_FACTOR * (trueMarketValue - MIDPOINT)));

  // Use extension cap hit and years if available to align with Goalie NAV and fix extension distortions
  const extCapHit        = asset.extensionCapHit;
  const navCapHit        = extCapHit ? extCapHit * (1 - (asset.retainedPct || 0)) : effectiveCap;
  const navYears         = extCapHit ? (asset.extensionYears ?? asset.yearsRemaining) : asset.yearsRemaining;
  const contractYears    = Math.max(1, navYears || 1);

  const BASE_CAP_CEILING = asset.capCeiling ?? SEASON.capCeiling; // Current cap space
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
  const rosterTier = classifyRosterTier(toi, normalizedPts, evMdep, qocIdx, evToi, shToi);
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
  // Graduated by age, then relieved by games/role track record:
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

  if (age <= 25) {
    const gameRelief = clamp((games - 40) / 180, 0, 1);
    const establishedRoleRelief = games >= 160 && (blendedPts >= 35 || toi >= 14)
      ? 0.65
      : 0;
    const relief = Math.max(gameRelief, establishedRoleRelief);
    developmentDiscount += (1.0 - developmentDiscount) * relief;
  }

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

  const uncappedTotal = Math.max(discountedTotal, franchiseFloor);
  const hasMeaningfulBaseline =
    safe(asset.baselinePtsPace ?? 0) >= 25 ||
    safe(asset.baselineGameScore ?? 0) >= 25 ||
    safe(asset.baselineDpsProxy ?? 0) >= 1.5;
  const approximateSamplePoints = games > 0 ? (pts / 82) * games : 0;
  const hasOnlyTinySampleProduction = games < 8 && approximateSamplePoints <= 2 && pts < 45;
  const isReplacementCallup =
    age >= 26 &&
    games < 14 &&
    toi < 9 &&
    (blendedPts < 15 || hasOnlyTinySampleProduction) &&
    !hasMeaningfulBaseline &&
    asset.draftOverall == null;
  const total = isReplacementCallup ? Math.min(uncappedTotal, 4) : uncappedTotal;
  const displayedCap = isReplacementCallup
    ? Math.min(capTotal, Math.max(0, total))
    : capTotal;

  return {
    total:  Math.round(total),
    off:    Math.round(offTotal),
    def:    Math.round(defDisplay),
    age:    Math.round(ageTotal),
    cap:    Math.round(displayedCap),
    upside: Math.round(Math.max(0, ageTotal)),
    noivImpact,
    fArchetype,
    rosterTier,
    isRFA,
  };
}

// ── Prospect NAV (pedigree-based) ─────────────────────────────────────────────
// A drafted prospect with no meaningful NHL sample is valued from the pick that
// selected him, discounted for burned development time unless NHLe production
// supports holding or exceeding the original slot value.
export function calcProspectNAV(asset: AssetInput): XNAVResult {
  const overall = asset.draftOverall ?? 224;
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

  const yearsSinceDraft = clamp(asset.age - 18, 0, 5);
  const hasNhleSignal = asset.prospectPtsPace != null && asset.prospectPtsPace > 0;
  const developmentTimeDiscount = 1 - yearsSinceDraft * 0.06;
  const certainty = hasNhleSignal
    ? clamp(0.90 + (asset.prospectPtsPace ?? 0) / 140, 0.90, 1.08)
    : clamp(developmentTimeDiscount, 0.68, 0.95);
  // NHLe modulation: 70 translated points ≈ elite junior production
  const nhle = asset.prospectPtsPace != null
    ? clamp(0.85 + 0.30 * (asset.prospectPtsPace / 70), 0.85, 1.15)
    : 1.0;
  // Goalie prospects are the least projectable asset in hockey
  const goalieDiscount = asset.position === "G" ? 0.80 : 1.0;

  const nhlePace = asset.prospectPtsPace ?? 0;
  const productionFloor = nhlePace > 0
    ? Math.pow(clamp((nhlePace - 15) / 45, 0, 1), 1.2) * 35
    : 0;

  const total = Math.round(Math.max(pick.total * certainty * nhle, productionFloor) * goalieDiscount);
  return {
    total,
    off: 0, def: 0, age: 0, cap: 0,
    upside: Math.round(total * 0.70),
  };
}

// ── Trade-request leverage discount ───────────────────────────────────────────
// A formal, public trade request strips the team of negotiating leverage — the
// whole league knows they have to move him, so offers come in light. Small
// haircut on positive value (8%, capped at 20 NAV). Deducted from the cap
// component so the off/def/age/cap sum invariant holds. Negative-value
// contracts are unaffected: there is no leverage left to lose.
export function applyTradeRequestDiscount(result: XNAVResult, asset: AssetInput): XNAVResult {
  if (asset.tradeBlockStatus !== "requested" || result.total <= 0) return result;
  const penalty = Math.round(Math.min(20, result.total * 0.08));
  if (penalty <= 0) return result;
  return { ...result, total: result.total - penalty, cap: result.cap - penalty };
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function calcNAV(asset: AssetInput): XNAVResult {
  if (asset.position === "Pick") return calcPickNAV(asset);
  const games = asset.games ?? 0;
  const hasProspectValuation =
    (asset.draftOverall != null && asset.age <= 22) ||
    (asset.prospectPtsPace != null && asset.prospectPtsPace > 0);
  if (asset.position !== "G" && hasProspectValuation && !asset.hasLiveStats && games < 14) {
    return applyTradeRequestDiscount(calcProspectNAV(asset), asset);
  }
  if (asset.position === "G")    return applyTradeRequestDiscount(calcGoalieNAV(asset), asset);
  if (hasProspectValuation && games >= 14 && games < 60) {
    const transitionWeight = clamp((games - 14) / 46, 0, 1);
    return applyTradeRequestDiscount(blendNavResults(calcProspectNAV(asset), calcSkaterNAV(asset), transitionWeight), asset);
  }
  return applyTradeRequestDiscount(calcSkaterNAV(asset), asset);
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
  let decaySum = 0;
  sorted.forEach((a, i) => {
    const age = a.age ?? 27;
    const marginalValue = i === 0
      ? a.nav
      : (a.nav * Math.pow(ageDecayRate(age), i)) - ageSlotPenalty(age);
    decaySum += Math.max(0, marginalValue);
  });
  return pickValue + Math.max(0, decaySum);
}
