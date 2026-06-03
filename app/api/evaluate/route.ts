import { NextResponse } from "next/server";
import {
  AWARD_BONUS, PLAYER_PEDIGREE, PROSPECT_TIERS,
  SHUTDOWN_D_PEDIGREE, INJURY_RISK, getHistoricalFloor,
} from "@/app/lib/player-data";
import type {
  Asset, EvaluateRequest, EvaluateResponse, FArchetype
} from "@/app/lib/trade-types";
import { SEASON, LEAGUE, FRANCHISE, ageDecayRate, ageSlotPenalty } from "@/app/lib/season-config";

// ── Core interfaces — self-contained so engine has no client deps ──
// Asset, Team, XNAVResult imported from trade-types.ts — no local duplicates.
// All fields including teamXga60, extensionCapHit, extensionYears are defined there.

type Team = import("@/app/lib/trade-types").Team;

interface XNAVResult {
  total: number;
  off: number;
  def: number;
  age: number;
  cap: number;
  upside: number;
  noivImpact?: number;
  fArchetype?: FArchetype;
}

// ============================================================
// TRADE ENGINE — server-side only
// This file is never shipped to the browser.
// All valuation math, pedigree data, and GM logic lives here.
// ============================================================

const safe  = (n: number) => (isNaN(n) || !isFinite(n) ? 0 : n);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const fmt   = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));

const getGoalieHistoricalFloor = (name: string, currentNAV: number): number => {
  const pedigree = PLAYER_PEDIGREE[name];
  if (!pedigree) return currentNAV;

  const awardBonus = (pedigree.awards ?? []).reduce((sum, award) => {
    return sum + (AWARD_BONUS[award] ?? 0) * 0.40; // increased from 0.35
  }, 0);

  const allStarBonus = (pedigree.allStarYears ?? 0) * 3.0; // increased from 2.5

  // Goalie floor: based on career GSAx — sustained excellence over seasons
  // Elite goalies (3+ major awards) get a higher floor percentage
  const awardCount = (pedigree.awards ?? []).length;
  const floorPct   = Math.min(0.85, 0.55 + awardCount * 0.06); // increased from 0.75/0.05
  const peakFloor  = (pedigree.peakGsax ?? 0) * floorPct * 2.2; // increased multiplier from 1.8

  return Math.max(currentNAV, peakFloor + awardBonus + allStarBonus);
};

// ============================================================
// 2026 NHL DRAFT — Post-lottery slot assignments
// Source: NHL.com, May 5 2026 lottery results
// ============================================================
const getXNAV = (asset: Asset): XNAVResult => {
  // ----- DRAFT PICKS -----
  if (asset.position === "Pick") {
    const round    = asset.round    || 1;
    const year     = asset.year     || SEASON.draftYear;
    const standing = asset.teamStanding || 16;

    // Year decay — future picks worth less (uncertainty compounds)
    const yearDecay = Math.pow(0.88, year - SEASON.draftYear);

    // ── Standing → pick value ─────────────────────────────────────
    // Key insight: teams trade picks based on UPSIDE potential, not
    // lottery-adjusted expected value. A last-place team's first is
    // priced as "probably top-3, possibly #1" — not "expected pick 2.8".
    // We use raw standing tiers to reflect real trade market behavior.
    //
    // Non-playoff teams (17-32) — lottery eligible:
    //   Worst 4 teams: near-untradable, franchise-altering upside
    //   Teams 5-8 from bottom: still top-10 likely
    //   Teams 9-16 from bottom: mid-lottery range
    // Playoff teams (1-16): known position, no lottery upside

    let baseValue: number;

    if (round === 1) {
      if (standing >= 30) {
        // Bottom 3 teams — top-3 pick almost certain, #1 realistic
        baseValue = standing === 32 ? 400 : standing === 31 ? 370 : 340;
      } else if (standing >= 27) {
        // Bottom 4-6 — top-5 likely
        baseValue = standing === 29 ? 290 : standing === 28 ? 260 : 235;
      } else if (standing >= 23) {
        // Bottom 7-10 — top-10 range
        baseValue = 190 - (30 - standing) * 8;
      } else if (standing >= 17) {
        // Bottom half of lottery — picks 11-16 range
        baseValue = 130 - (23 - standing) * 7;
      } else {
        // Playoff teams — known position, no lottery upside
        // Standing 1 (best) → ~pick 32, standing 16 → ~pick 17
        const slot = 33 - standing;
        if      (slot <= 17) baseValue = 82;
        else if (slot <= 20) baseValue = 65;
        else if (slot <= 24) baseValue = 52;
        else if (slot <= 27) baseValue = 42;
        else                 baseValue = 32;
      }
    } else if (round === 2) {
      // 2nd round: top of class ~30 NAV, mid ~15, late ~8
      const slot = standing >= 17 ? Math.round((33 - standing) * 0.9) : 33 - standing;
      if      (slot <= 5)  baseValue = 28;
      else if (slot <= 10) baseValue = 20;
      else if (slot <= 16) baseValue = 14;
      else if (slot <= 24) baseValue = 10;
      else                 baseValue = 7;
    } else if (round === 3) {
      baseValue = standing >= 25 ? 5 : 3;
    } else {
      baseValue = 2;
    }

    const pickTotal = Math.max(round === 1 ? 5 : 1, baseValue * yearDecay);

    // Upside fraction higher for top picks — more variance in outcomes
    const upsideFraction = standing >= 27 ? 0.55 : standing >= 20 ? 0.45 : 0.30;

    return {
      total:  Math.round(pickTotal),
      off:    0, def: 0,
      age:    Math.round(pickTotal * upsideFraction),
      cap:    0,
      upside: Math.round(pickTotal * upsideFraction),
    };
  }

  // ----- GOALIES (G-NAV model with historical context) -----
  if (asset.position === "G") {
    const gamesG      = Math.max(1, asset.gamesStarted ?? asset.games ?? 1);
    // Confidence: calibrated to a full 60-game starter season as the reference point
    // More aggressive regression for small samples — 45 games is only 0.87 confidence
    const confidenceG = Math.min(1.0, Math.pow(gamesG / 60, 1.4));

    // Role detection — raised thresholds to properly classify workload
    // 50+ games = clear starter, 38-49 = tandem/shared, <38 = backup
    const isStarter = gamesG >= 50;
    const isBackup  = gamesG < 38;
    const isTandem  = !isStarter && !isBackup;

    const gsaxRaw     = safe(asset.gsax ?? 0);
    const gsaxPerGame = gsaxRaw / gamesG;

    // ── Soft per-game sanity cap ───────────────────────────────────────
    // Hellebuyck's all-time best season was ~0.46 GSAx/game (28.4 GSAx / 62GP)
    // Cap at 0.50/game for starters, slightly lower for tandem/backup
    // This prevents 23.1 GSAx in 45 games (0.51/game) from extrapolating to
    // superhuman levels — that pace simply isn't sustainable over a full season
    const perGameCap = isStarter ? 0.48 : isTandem ? 0.35 : 0.22;
    const gsaxPerGameCapped = gsaxPerGame > 0
      ? Math.min(gsaxPerGame, perGameCap)
      : gsaxPerGame; // no floor cap — bad seasons should still hurt

    // ── Team defense context: xGA/60 instead of standings ─────────────────
    // teamXga60 measures how many expected goals the team allows per 60 min.
    // League average ~2.55. Teams above 2.75 have hostile goalie environments.
    // This is more accurate than standings which reflect scoring/PP success too.
    const LEAGUE_AVG_XGA60 = LEAGUE.avgXga60;
    const teamXga60 = asset.teamXga60 ?? LEAGUE_AVG_XGA60;
    const xgaDelta  = teamXga60 - LEAGUE_AVG_XGA60; // positive = worse than avg
    // Scale correction: each 0.1 above league avg = +0.04 GSAx/game forgiven
    // CGY at 2.85 xGA/60 (+0.30 above avg) → +0.12/game correction
    // SJS at 3.10 xGA/60 (+0.55 above avg) → +0.22/game correction (capped 0.25)
    // This properly reflects that -1.8 GSAx on CGY ≈ above-average performance
    const defCorrection = Math.max(-0.15, Math.min(0.25, xgaDelta * 0.40));

    const gsaxPer60 = (gsaxPerGameCapped + defCorrection) * 60;

    const GSAX_SD = LEAGUE.gsaxSd;

    const pedigree   = PLAYER_PEDIGREE[asset.name];
    const careerMean = pedigree?.careerGsax
      ? Math.min(15, (pedigree.careerGsax / Math.max(1, pedigree.allStarYears ?? 1) / 60) * 15)
      : 0;

    const expGSAx = gsaxPer60 * confidenceG + careerMean * (1 - confidenceG);

    const goalieImpact = expGSAx >= 0
      ? Math.pow(expGSAx / GSAX_SD, 1.5) * 80
      : (expGSAx / GSAX_SD) * 40;

    const workloadBonus = isStarter
      ? Math.min(20, (gamesG / 60) * 15)
      : isTandem
      ? Math.min(10, (gamesG / 60) * 10)
      : Math.min(5,  (gamesG / 60) * 5);

    const peakAgeG    = 30;
    const agePenaltyG = asset.age > peakAgeG
      ? Math.pow(asset.age - peakAgeG, 1.8) * 1.2
      : 0;
    const ageFactorG  = Math.max(0.3, 1.05 - agePenaltyG / 100);

    const termMult       = Math.min(2.5, 1.0 + (asset.yearsRemaining || 1) * 0.15);
    const effectiveCap   = asset.capHit * (1 - (asset.retainedPct || 0));

    // ── Extension-aware cap cost ───────────────────────────────────────
    // If a player has a signed extension, NAV must reflect what the acquiring
    // team is actually committing to — not the cheap current-year deal.
    // Cap space calculation uses current capHit (what Calgary pays this year).
    // NAV evaluation uses the extension AAV (what the acquiring team inherits).
    const extCapHit  = asset.extensionCapHit;
    const extYears   = asset.extensionYears;
    const navCapHit  = extCapHit
      ? extCapHit * (1 - (asset.retainedPct || 0))   // extension AAV for NAV math
      : effectiveCap;                                  // no extension — use current
    const navYears   = extCapHit ? (extYears ?? asset.yearsRemaining) : asset.yearsRemaining;
    const navTermMult = Math.min(2.5, 1.0 + navYears * 0.15);
    const capCostG       = navCapHit * 1.6 * navTermMult;
    const retainedBonusG = (asset.retainedPct || 0) * asset.capHit * 10;

    const rawTotal = safe((goalieImpact + workloadBonus) * ageFactorG - capCostG + retainedBonusG);

    // ── Young goalie floor ────────────────────────────────────────
    // Young cost-controlled goalies have real trade value even with bad stats.
    // Applies to starters AND tandem goalies on bad teams (like Askarov on SJS)
    // Disabled when player has signed an extension (extension cap cost captures reality)
    const isYoungControlled = asset.age <= 26 && effectiveCap <= 3.5 && !extCapHit;
    const youngStarterFloor = isYoungControlled && (isStarter || isTandem)
      ? Math.max(0,
          (27 - asset.age) * 10
          - effectiveCap * 3
          + Math.min(15, (gamesG / 82) * 20)
          + (isTandem ? -8 : 0) // tandem discount vs starter
        )
      : 0;

    const roleCap     = isBackup ? 35 : isTandem ? 60 : 250;
    const cappedTotal = Math.min(Math.max(rawTotal, youngStarterFloor), roleCap);
    const totalG      = getGoalieHistoricalFloor(asset.name, cappedTotal);

    return {
      total:  totalG,
      off:    0,
      def:    safe(goalieImpact * ageFactorG),
      age:    -agePenaltyG,
      cap:    -(capCostG - retainedBonusG),
      upside: youngStarterFloor > 0 ? youngStarterFloor * 0.4 : 0,
      noivImpact: 0,
      fArchetype: "",
    };
  }
  // 1. Bayesian Regularization
  // Position-adjusted baselines — reflect true NHL averages for qualifying skaters.
  // A C at 38pts is above average; a D at 38pts is elite.
  const PTS_BASE: Record<string, { mean: number; sd: number }> = {
    C: { mean: 30.0, sd: 22.0 },  // includes 4th-line centres
    W: { mean: 27.0, sd: 20.0 },  // includes 4th-line wingers
    L: { mean: 27.0, sd: 20.0 },
    R: { mean: 27.0, sd: 20.0 },
    D: { mean: 22.0, sd: 17.0 },  // includes stay-at-home types
  };
  const posBaseline = PTS_BASE[asset.position] ?? { mean: 34.0, sd: 22.0 };
  const SIGMA = { PTS_M: posBaseline.mean, PTS_SD: posBaseline.sd, DEF_M: 0.05, DEF_SD: 0.30 };
  const confidence = Math.min(1.0, Math.pow(Math.max(0, asset.games) / 45, 1.8));

  // ── Luck Filter (PDO regression) ─────────────────────────────
  // Players out-scoring their xG (high shooting luck) get pulled toward
  // sustainable production. Players under-scoring xG get a positive bump.
  // 75% weight on actual pts, 25% on xG-adjusted pts.
  // Only applies when both xGPace and goalsPace are available and reliable.
  const luckRatio = asset.xGPace && asset.goalsPace && asset.goalsPace > 0
    ? Math.min(2.0, Math.max(0.5, asset.xGPace / asset.goalsPace))  // clamp ratio 0.5-2.0
    : 1.0;
  const ptsPaceLuck = asset.xGPace && asset.goalsPace
    ? safe(asset.ptsPace) * 0.75 + safe(asset.ptsPace) * luckRatio * 0.25
    : safe(asset.ptsPace);

  const expPts = ptsPaceLuck * confidence + SIGMA.PTS_M * (1 - confidence);

  // defRate reliability filter:
  // The metric is only meaningful when:
  //   a) Player has high TOI (actually affects team possession)
  //   b) Player faces real competition (qocRank < 350)
  //   c) Sample is large enough (confidence > 0.6)
  // For sheltered players (Nyquist, 4th liners) the metric captures
  // opponent quality not individual defense — we discard it.
  const qocRank = safe(asset.qocRank ?? 450);
  const avgTOI  = safe(asset.avgTOI);

  // defRate reliability filter:
  // When NOIV data is available (xgaRelTM), suppress defRate entirely to
  // prevent double-counting — both measure the same defensive impact.
  // defRate uses raw xGoals totals which can conflict with per-60 xgaRelTM.
  const hasReliableNOIV = asset.xgaRelTM != null && (asset.games ?? 0) >= 20;
  const rawDefRate = hasReliableNOIV ? 0 : safe(asset.defRate);
  const defReliability =
    Math.min(1.0, avgTOI / 20) *
    Math.min(1.0, (400 - qocRank) / 200) *
    confidence;
  const clampedDef = asset.position === "D"
    ? Math.max(-0.25, Math.min(0.5, rawDefRate))
    : Math.max(-0.3,  Math.min(0.4, rawDefRate));
  const adjustedDef = clampedDef * defReliability;

  // ── Display-only defRate for forwards ──────────────────────────
  // hasReliableNOIV suppresses defRate to prevent double-counting in NAV math.
  // But for the DEF display bar only, we can use defRate directly for forwards
  // since xgaRelTM is an unreliable defensive signal for shutdown players.
  // This doesn't affect NAV totals — purely visual.
  const rawDefRateDisplay = safe(asset.defRate);
  const clampedDefDisplay = Math.max(-0.3, Math.min(0.4, rawDefRateDisplay));
  const adjustedDefDisplay = clampedDefDisplay * defReliability;

  const expDef = hasReliableNOIV
    ? SIGMA.DEF_M
    : adjustedDef * confidence + SIGMA.DEF_M * (1 - confidence);

  // 2. Z-scores
  const zPts = clamp((expPts - SIGMA.PTS_M) / SIGMA.PTS_SD, -3.5, 5.5);
  const zDef = clamp((expDef - SIGMA.DEF_M) / SIGMA.DEF_SD, -2.0, 2.5);

  // 3. Positional value weights + D-man archetype classification
  const toiWeight = Math.pow(clamp(safe(asset.avgTOI) / 18, 0.4, 2.0), 1.3);
  const isPillarD = asset.position === "D" && safe(asset.avgTOI) > 22;
  // posAdj: C is the most valuable position per unit of production
  // D-men get a bonus for elite minutes but should never exceed elite C value
  // Pillar D (22+ min) gets 1.6 — less than elite C at 1.45... wait:
  // The old 1.9 for pillar D was causing Bouchard > McDavid.
  // Real market: elite C = ~$12-14M, elite D = ~$9-11M. Ratio ~0.8x.
  const posAdj = isPillarD ? 1.35           // top-pair D: high but under C
    : asset.position === "C"  ? 1.45        // centre: highest value position
    : asset.position === "D"  ? 1.15        // depth D
    : 1.0;                                  // winger

  // D-man archetype — determines how we weight offense vs defense in TMV
  // OFFENSIVE D:  pts > 45                          → Bouchard, Makar, Fox
  // TWO_WAY D:    pts 28-45, toi > 21               → Morrissey, Josi, Ekman-Larsson
  // SHUTDOWN D:   pts < 28, toi > 19, qoc < 200     → Slavin, Giordano, Holl
  // DEPTH D:      toi < 19 or qoc > 300             → 5th/6th defender
  type DArchetype = "OFFENSIVE" | "TWO_WAY" | "SHUTDOWN" | "DEPTH";
  let dArchetype: DArchetype = "DEPTH";
  if (asset.position === "D") {
    const pts   = safe(asset.ptsPace);
    const toi   = safe(asset.avgTOI);
    const qoc   = safe(asset.qocRank ?? 450);

    // If Point Shares are available, use DPS ratio to validate/refine archetype
    // OPS/(OPS+DPS) tells us true offensive contribution proportion
    const ops = asset.ops ?? null;
    const dps = asset.dps ?? null;
    const psRatio = ops !== null && dps !== null && (ops + dps) > 0
      ? ops / (ops + dps)
      : null;  // null = no PS data, fall back to heuristics

    if (pts >= 45 || (psRatio !== null && psRatio > 0.65)) {
      // PS override: if DPS dominates despite high scoring, downgrade from OFFENSIVE
      // Morrissey scores 58pts/82 but OPS/DPS ratio says he's balanced/defensive
      if (psRatio !== null && psRatio < 0.50 && pts < 70) dArchetype = "TWO_WAY";
      else dArchetype = "OFFENSIVE";
    }
    else if (pts >= 28 && toi >= 21)                            dArchetype = "TWO_WAY";
    else if (pts <  28 && toi >= 19 && qoc < 220)               dArchetype = "SHUTDOWN";
    else if (psRatio !== null && psRatio < 0.25 && (dps ?? 0) > 3.0)  dArchetype = "SHUTDOWN";
    else                                                         dArchetype = "DEPTH";
  }

  // 3b. QoC adjustment — shutdown D-men facing elite competition deserve credit.
  // Slavin (qoc=97) vs DeMelo (qoc=235) playing similar TOI is NOT the same job.
  const isHighTOI_D = asset.position === "D" && safe(asset.avgTOI) > 20;
  const qocBonus    = isHighTOI_D
    ? Math.max(0, (350 - qocRank) / 350) * 22 * (safe(asset.avgTOI) / 21)
    : 0;

  // Coach trust floor — elite minutes = real player, regardless of raw metrics
  const coachTrustFloor = asset.position === "D"
    ? Math.max(0, (safe(asset.avgTOI) - 18) * 3.5)
    : 0;

  // Shutdown D bonus — elite defensive specialists get explicit credit.
  // Slavin (qoc=97, toi=21.3) is enormously valuable even without points.
  // The bonus scales with competition difficulty and ice time.
  const shutdownBonus = dArchetype === "SHUTDOWN"
    ? Math.max(0, (220 - qocRank) / 220) * 55 * Math.min(1.0, safe(asset.avgTOI) / 21)
    : 0;

  // 4. Nonlinear impact
  // Exponent 1.6 (reduced from 1.9) — still rewards elite scorers nonlinearly
  // but prevents Bouchard/McDavid type explosion
  const offImpact = Math.sign(zPts) * Math.pow(Math.abs(zPts), 1.6) * 55;
  const defImpact = Math.sign(zDef) * Math.pow(Math.abs(zDef), 1.25) * 33 * toiWeight;

  // 5. Age / depreciation curve
  const isSuperstar = expPts > 80;
  const peakAge = isSuperstar ? 30 : 28;
  const agePenaltyRaw = asset.age > peakAge
    ? Math.pow(asset.age - peakAge, 1.65) * 1.4
    : 0;
  const ageFactor = Math.max(0.25, 1.1 - agePenaltyRaw / 100);

  // 6. True Market Value — archetype-based offense/defense weighting
  // For SHUTDOWN D, defImpact from xG is unreliable (team-polluted + hard matchups)
  // so we zero it out and rely on shutdownBonus + qocBonus instead.
  const defWeight = dArchetype === "OFFENSIVE" ? 0.18
                  : dArchetype === "TWO_WAY"   ? 0.25
                  : dArchetype === "SHUTDOWN"  ? 0.0   // bonuses carry the value
                  : asset.position === "D"     ? 0.20
                  : 0.30;
  const offWeight = dArchetype === "SHUTDOWN" ? 1.0 : 1 - defWeight;
  const rawMarketValue = safe((offImpact * offWeight + defImpact * defWeight) * posAdj * ageFactor);
  const trueMarketValue = Math.max(rawMarketValue + qocBonus + shutdownBonus, coachTrustFloor * ageFactor);

  // 7. Contract surplus — single penalty.
  //    Player value minus cap cost = trade surplus/deficit.
  // Apply retention — acquiring team pays reduced cap, boosting value
  const effectiveCapHit = asset.capHit * (1 - (asset.retainedPct || 0));

  // ── Dynamic Cap Inflation ─────────────────────────────────────
  // Cap grows ~4% annually. An $8M hit in year 5 is cheaper relative
  // to a $125M ceiling than it is today at $104M.
  // Elite contracts (>8% of cap) carry a severity penalty per year.
  // Future years are discounted at 10%/yr (future GM's problem).
  const CURRENT_CAP     = SEASON.capCeiling;
  const CAP_GROWTH_RATE = 1.04;
  const years = Math.max(1, asset.yearsRemaining || 1);
  let rawCapCostSum = 0;
  let discountSum   = 0;
  for (let i = 0; i < years; i++) {
    const projCap      = CURRENT_CAP * Math.pow(CAP_GROWTH_RATE, i);
    const capPct       = effectiveCapHit / projCap;
    const severity     = capPct > 0.08 ? 1.5 : capPct > 0.04 ? 1.25 : 1.0;
    const timeDiscount = Math.pow(0.90, i);
    rawCapCostSum += effectiveCapHit * severity * timeDiscount;
    discountSum   += timeDiscount;
  }
  // Weighted average annual cost × term factor — keeps scale comparable to old formula
  const avgAnnualCost = rawCapCostSum / discountSum;
  const termFactor    = Math.min(2.5, 1.0 + years * 0.15);
  const capCostNet    = avgAnnualCost * termFactor;

  // Overpay penalty — only applies when the player has positive market value
  // but is paid more than that value. A 4th liner on $3M isn't "overpaid"
  // in the same sense as a star on $12M — the penalty should reflect the
  // gap between what they earn and what the market would pay, not fire
  // when tmv is negative (that's already captured in capCostNet).
  const overpayRaw = trueMarketValue > 0 && effectiveCapHit > trueMarketValue / 10
    ? Math.max(0, effectiveCapHit - trueMarketValue / 10) * 2.5
    : trueMarketValue <= 0 && effectiveCapHit > 3.0
    ? (effectiveCapHit - 3.0) * 1.5  // only penalize truly expensive bad contracts
    : 0;
  const youngDiscount = asset.age < 27
    ? Math.max(0.15, (asset.age - 18) / 9)  // 18yo=15%, 22yo=44%, 26yo=89%
    : 1.0;
  const overpayPenalty = overpayRaw * youngDiscount;

  // 8. Age curve component (YNG/AGE bar)
  // ─────────────────────────────────────────────────────────────
  // Bayesian age premium/discount — independent of contract type.
  // Front offices price players relative to their PROJECTED peak,
  // not just current production. A 24-year-old on a bridge deal
  // IS more valuable than his stats alone suggest.
  //
  // Curve (inspired by hockey WAR research and market data):
  //   18-21: High YNG — pre-peak, maximum upside window
  //          weighted by on-ice performance (can't just be a bad
  //          player with youth premium)
  //   22-24: Moderate YNG — ascending but partially proven
  //   25-26: Small positive — still pre-peak, less uncertainty
  //   27-29: ZERO — peak years, pure production value
  //   30-33: Light negative — aging discount begins
  //   34+:   Hard negative — decline accelerating, esp on big $
  //
  // The premium scales with PRODUCTION QUALITY — a 21-year-old
  // with 60pts/82 gets full premium; one with 15pts/82 gets very
  // little. Proven on-ice performance validates the upside bet.
  // ─────────────────────────────────────────────────────────────
  const age = asset.age;
  const productionQuality = Math.min(2.0, safe(asset.ptsPace) / 45); // 1.0 at 45pts/82 pace

  const prospectTier  = PROSPECT_TIERS[asset.name];
  const pedigreeBonus = prospectTier
    ? (prospectTier.tier === 1 ? 30 : prospectTier.tier === 2 ? 15 : 7)
    : 0;

  let ageCurveRaw: number;
  if (age <= 21) {
    // Pre-peak: high upside, weighted by proven production
    // A 19-year-old who scores 50pts/82 is extremely rare and valuable
    const youthMultiplier = Math.pow(22 - age, 1.3); // 19yo > 20yo > 21yo
    ageCurveRaw = youthMultiplier * productionQuality * 18 + pedigreeBonus;
  } else if (age <= 24) {
    // Ascending: still pre-peak, more proven
    const youthMultiplier = Math.pow(25 - age, 1.2);
    ageCurveRaw = youthMultiplier * productionQuality * 12 + pedigreeBonus * 0.5;
  } else if (age <= 26) {
    // Late ascent: small premium, approaching peak
    ageCurveRaw = (27 - age) * productionQuality * 6;
  } else if (age <= 29) {
    // Peak: zero age component — pure production value
    ageCurveRaw = 0;
  } else if (age <= 33) {
    // Early decline: light negative scaling
    const declineYears = age - 29;
    ageCurveRaw = -Math.pow(declineYears, 1.4) * 3.5;
  } else {
    // Hard decline: accelerating, but softened for cap-efficient veterans.
    // At $104M ceiling, $3M is only 2.9% of cap — shouldn't be crushed like
    // a $7M player on the same aging curve.
    const hardDecline = age - 33;
    // Contract penalty only kicks in meaningfully above $4M for older players
    const contractPenalty = Math.max(0, asset.capHit - 4.0) * 1.5;
    ageCurveRaw = -(Math.pow(hardDecline, 1.6) * 4.5 + contractPenalty);
  }

  const optionValue = safe(ageCurveRaw);

  // 9. Intangibles
  const intangibleBoost = trueMarketValue * ((asset.multiplier || 1.0) - 1.0) * 0.5;

  // 10. Retained salary bonus (if partner is retaining, home team benefits)
  const retainedBonus = (asset.retainedPct || 0) * asset.capHit * 12;

  const netSurplus = safe(
    trueMarketValue
    - capCostNet
    - overpayPenalty
    + optionValue
    + intangibleBoost
    + retainedBonus
  );

  // ── 11. NOIV Multiplier — baked into total, not just display ────
  // Archetype-routed: forwards and D-men weight the components differently.
  let preFloorTotal = netSurplus;
  let noivImpact    = 0;
  let fArchetype: FArchetype = "";

  const hasNOIV = asset.xgRelTM != null && asset.xgaRelTM != null
    && asset.dzPct != null && asset.position !== "Pick"
    && asset.position !== "G" && (asset.games ?? 0) >= 20;

  if (hasNOIV) {
    const xgR  = asset.xgRelTM!;
    const xgaR = asset.xgaRelTM!;
    const dz   = asset.dzPct!;
    let sOnIce = 0;

    const isForward = ["C","W","L","R"].includes(asset.position);
    if (isForward) {
      const goals   = safe(asset.goalsPace ?? 0);
      const assists = safe(asset.assistsPace ?? 0);
      const pts     = safe(asset.ptsPace);
      const toi     = safe(asset.avgTOI);

      // Archetype classification — ordered from most to least specific.
      // Uses assists-to-points ratio as the primary creative-style signal.
      const assistRatio = pts > 0 ? assists / pts : 0.5;
      const goalRatio   = pts > 0 ? goals   / pts : 0.5;

      if      (pts >= 95 && (assistRatio >= 0.55 || safe(xgR) > 4))
        // Franchise-level production with elite creative or NOIV dominance
        // McDavid (~68% assists), Draisaitl (~55%), elite impact players
        fArchetype = "FRANCHISE";
      else if (goalRatio > 0.53 && pts >= 25)
        // Goal-first scorers: goals exceed assists by meaningful margin
        // DeBrincat, Ovechkin type — people see goals before playmaking
        fArchetype = "SNIPER";
      else if (assistRatio > 0.60 && pts >= 35)
        // Assist-dominant: creates far more than they score personally
        // Barkov, Aho at their best, elite passers
        fArchetype = "PLAYMAKER";
      else if (safe(asset.defRate) > 0.10 && toi >= 16 && pts >= 25)
        // Positive defensive metrics + adequate offense = true two-way value
        fArchetype = "TWO_WAY";
      else if (toi < 14 && pts < 25)
        // Depth players: limited ice time, replacement-level production
        fArchetype = "GRINDER";
      else
        // Balanced contributor — adequate offense without a defining style
        // Kyle Connor (goal/assist ratio ~50/50) lives here correctly
        fArchetype = "SCORER";

      // xgaR is negative when opponents score more with player on ice (bad)
      // Weight it more heavily — defensive liability should show up clearly
      if      (fArchetype === "SNIPER")    sOnIce = xgR * 2.0 - xgaR * 2.0;
      else if (fArchetype === "PLAYMAKER") sOnIce = xgR * 1.8 - xgaR * 2.5 + (dz - 0.50) * 2.0;
      else if (fArchetype === "TWO_WAY")   sOnIce = xgR * 1.0 - xgaR * 3.5 + (dz - 0.50) * 3.0;
      else if (fArchetype === "GRINDER")   sOnIce = xgR * 0.8 - xgaR * 3.0 + (dz - 0.50) * 2.5;
      else                                 sOnIce = xgR * 1.5 - xgaR * 2.0 + (dz - 0.50) * 2.0;
    } else if (asset.position === "D") {
      if      (dArchetype === "SHUTDOWN")  sOnIce = xgR * 0.5 - xgaR * 3.5 + (dz - 0.50) * 4.0;
      else if (dArchetype === "OFFENSIVE") sOnIce = xgR * 1.5 - xgaR * 1.5;
      else                                 sOnIce = xgR * 1.0 - xgaR * 2.5 + (dz - 0.50) * 2.0;
    }

    // Clamp with denominator of 15 (was 10) — prevents large xgRelTM values
    // from instantly maxing out the multiplier. A 7.9 xG%+ now gives
    // sOnIce/15 = 0.53 → exp(0.4 clamped) = 1.49 still, but combined with
    // the higher xgaR penalty, players with bad defensive metrics get dragged down.
    const noivMult = Math.exp(clamp(sOnIce / 15, -0.4, 0.4));
    preFloorTotal  = netSurplus > 0 ? netSurplus * noivMult : netSurplus / Math.max(0.67, noivMult);
    noivImpact     = preFloorTotal - netSurplus;
  }

  // Apply historical floor — BUT suppress it proportionally when netSurplus
  // is deeply negative (player is a contract liability regardless of peak pedigree).
  const contractOverpayFactor = netSurplus >= 0
    ? 1.0
    : Math.max(0.15, 1.0 + netSurplus / 60);
  const historicalRaw   = getHistoricalFloor(asset.name, preFloorTotal);
  const historicalTotal = preFloorTotal + (historicalRaw - preFloorTotal) * contractOverpayFactor;

  // ── PS-validated shutdown D floor ────────────────────────────
  // If DPS strongly dominates (Slavin: OPS 15, DPS 54), validate the
  // shutdownBonus and qocBonus are calibrated correctly.
  // High DPS players who don't score get pedigree floors here.
  const ops = asset.ops ?? null;
  const dps = asset.dps ?? null;
  const psTotal = ops !== null && dps !== null ? ops + dps : null;
  const psFloor = psTotal !== null && psTotal > 5
    ? Math.max(0, psTotal * 2.8)   // ~2.8 NAV per Point Share is empirically calibrated
    : -Infinity;

  // Apply shutdown D pedigree floor — elite defensive specialists get a minimum
  const shutdownPedigree = SHUTDOWN_D_PEDIGREE[asset.name];
  const shutdownPedigreeFloor = shutdownPedigree ? shutdownPedigree.navFloor : -Infinity;

  // Apply prospect floor — only for players explicitly in PROSPECT_TIERS
  const prospect = PROSPECT_TIERS[asset.name];
  const finalTotal = prospect
    ? Math.max(historicalTotal, shutdownPedigreeFloor, psFloor, prospect.navFloor * Math.max(0.5, 1 - (asset.age - 18) * 0.04))
    : Math.max(historicalTotal, shutdownPedigreeFloor, psFloor);

  // ELC floor — players on entry-level or minimum contracts (≤$950K) can never
  // be negative assets.
  const isELC = asset.capHit <= 0.95 && asset.age <= 25;
  const elcFloor = isELC ? 0 : -Infinity;

  // ── Depth player floor ──────────────────────────────────────
  // Uses EFFECTIVE cap (post-retention) — a $3M player retained 50%
  // is a $1.5M player from the acquirer's view, much easier to absorb.
  const isDepthPlayer = effectiveCapHit < 4.0 && safe(asset.ptsPace) < 30 && asset.position !== "G";
  const depthFloor = isDepthPlayer
    ? Math.max(-15, -8 * (effectiveCapHit / 0.775))
    : -Infinity;
  // They have no negative value — worst case they get reassigned.
  // Floor scales with age: younger = more upside.
  const isUnprovenProspect = asset.age < 25
    && (asset.games ?? 0) < 12
    && asset.position !== "Pick"
    && asset.position !== "G";
  const autoprospectFloor = isUnprovenProspect
    ? Math.max(5, (25 - asset.age) * 2.5)  // age 24=2.5, age 22=7.5, age 20=12.5
    : -Infinity;

  // ── DEF display — position-aware ─────────────────────────────
  // D-men: xgaRelTM is reliable — use directly, scaled by TOI.
  // Forwards: xgaRelTM is misleading for shutdown players (Cirelli faces elites,
  //   so Tampa allows more xGA when he's on ice → raw xgaRelTM is positive).
  //   Use DZ% + defRate as primary signals. If xgaRelTM > 0 AND DZ% > 0.50,
  //   give partial matchup credit — shutdown C with hard deployment earned it.
  // NOTE: qocRank from MoneyPuck is iceTimeRank (volume), not matchup quality.
  //   We cannot use it for QoC credit. DZ% and xgaRelTM are the reliable signals.

  const defTOIReliability = safe(asset.avgTOI) >= 20 ? 1.0
    : safe(asset.avgTOI) >= 17 ? 0.65
    : safe(asset.avgTOI) >= 15 ? 0.35
    : 0.15;

  const isForwardPos = ["C","W","L","R","F"].includes(asset.position);
  // dzPct: null means no zone data from MoneyPuck (column missing or player not tracked)
  // Don't treat null as 0.50 — that gives every forward +3 DEF spuriously.
  // Only apply DZ bonus when we have real data.
  const dzPctVal = (asset.dzPct !== null && asset.dzPct !== undefined)
    ? safe(asset.dzPct)
    : null;
  const hasDZData = dzPctVal !== null;

  // ── Forward DEF display — single signal, no double-dipping ─────────
  // KEY INSIGHT: defRate = offA - onA  AND  xgaRelTM = onA - offA
  // These are the SAME measurement with OPPOSITE signs.
  // Using both = partial cancellation → Cirelli shows -4 DEF (the bug).
  // Single signal: defRate only — xgaRelTM and defRate measure the same thing
  // with opposite signs; using both causes partial cancellation.
  //
  // Positive defRate = team allows LESS xGA when player is on ice = good defender.
  // Scale by TOI reliability: 20+ min=1.0, 17-19=0.65, 15-16=0.35, <15=0.15
  // DZ% bonus only fires when real zone data exists (not the null default).

  const fwdDzBonus = isForwardPos && hasDZData
    ? Math.max(0, (dzPctVal! - 0.45) * 60)
    : 0;

  // Single defensive signal: defRate with TOI reliability weight
  const fwdDefRate = isForwardPos
    ? safe(clampedDefDisplay * 45 * defTOIReliability)
    : 0;

  // Matchup credit: only when BOTH real DZ% data AND positive xgaRelTM
  // High DZ% + positive xgaRelTM = genuinely hard deployment, not bad defense
  const xgaRTM = asset.xgaRelTM as number | null | undefined;
  const fwdMatchupCredit = isForwardPos && hasDZData && dzPctVal! > 0.50
    && xgaRTM !== null && xgaRTM !== undefined && xgaRTM > 0
    ? Math.min(6, xgaRTM * (dzPctVal! - 0.45) * 60)
    : 0;

  const forwardDefDisplay = clamp(
    fwdDzBonus + fwdDefRate + fwdMatchupCredit,
    -20, 35
  );

  const defDisplay = dArchetype === "SHUTDOWN"
    ? safe(shutdownBonus + qocBonus)
    : isForwardPos
    ? forwardDefDisplay
    : hasReliableNOIV && asset.xgaRelTM != null
    ? clamp(safe(-asset.xgaRelTM * toiWeight * 40 * defTOIReliability), -40, 50)
    : clamp(safe(defImpact * posAdj * defTOIReliability), -30, 30);

  // Retention premium for depth players — if sender retains salary,
  // the acquirer gets a better deal than the floor alone shows.
  // A $3M player at 50% = $1.5M effective + $1.5M cap relief for sender.
  const retentionPremium = isDepthPlayer && (asset.retainedPct || 0) > 0
    ? (asset.retainedPct || 0) * asset.capHit * 6
    : 0;

const baseTotal = Math.max(finalTotal, elcFloor, autoprospectFloor, depthFloor);

  // ── OFF Display Metric (Point Share Scale 0-300) ──────────────
  // We calculate this separately from offImpact so trade NAV isn't affected.
  const ptsScale = asset.position === "D" ? 0.75 : 1.0;
  const ptsVal   = safe(asset.ptsPace ?? 0) * ptsScale;
  const noivB    = asset.xgRelTM ? clamp(asset.xgRelTM * 3.5, -20, 25) : 0; 
  
  const offPS = asset.ops != null ? asset.ops * 17 : null;
  
  const offDisplayRaw = offPS !== null
    ? (offPS * confidence) + (ptsVal * 1.6 * (1 - confidence)) + (noivB * 0.25)
    : (ptsVal * 1.6) + (safe(asset.xGPace ?? 0) * 0.5) + noivB;

  let offDisplay = safe(offDisplayRaw);
  
  // The Lemieux Asymptote 
  if (offDisplay > 250) {
    offDisplay = 250 + ((offDisplay - 250) * 0.40); 
  }

  return {
    total:       baseTotal + retentionPremium,
    off:         Math.round(offDisplay),
    def:         defDisplay,
    age:         safe(ageCurveRaw),
    cap:         -(capCostNet + overpayPenalty),
    upside:      prospectTier ? prospectTier.ceiling : Math.max(0, ageCurveRaw),
    noivImpact:  safe(noivImpact),
    fArchetype,
  };
};

// ============================================================
// GM LOGIC ENGINE — v7.1
// What separates this from every other trade machine.
//
// Real GMs don't just match cap hits. They ask:
//   1. Does this fit our timeline? (contender vs rebuild)
//   2. Does this fix an actual hole, or create a logjam?
//   3. Are we giving the right SHAPE of assets back?
//   4. Does the partner have a rational reason to say yes?
//   5. Is there a CBA rule that makes this impossible?
//
// Each check produces a GmFlag with a severity:
//   HARD    — structurally illegal (cap, NMC, floor)
//   SOFT    — legally fine, but a real GM declines
//   WARN    — red flag worth noting
//   INFO    — context / positive signal
// ============================================================


type FlagSeverity = "HARD" | "SOFT" | "WARN" | "INFO";
type FlagCategory =
  | "CAP_VIOLATION" | "FLOOR_VIOLATION" | "CLAUSE"
  | "ELITE_BLOCKADE" | "TIMELINE_MISMATCH" | "REBUILD_LOGIC"
  | "CONTENDER_LOGIC" | "ASSET_SHAPE_MISMATCH" | "POSITIONAL_REDUNDANCY"
  | "ROSTER_HOLE" | "LEVERAGE_ASYMMETRY" | "RENTAL_TAX" | "AGE_CLIFF"
  | "DEAD_WEIGHT" | "FIRE_SALE" | "LOCKER_ROOM" | "RETAIN_ABUSE" | "GOOD" | "VALUE_VETO"
  | "FRANCHISE_ANCHOR";

interface GmFlag {
  severity: FlagSeverity;
  category: FlagCategory;
  headline: string;
  explanation: string;
  affectedAsset?: string;
  vetoesSide?: 0 | 1;
  perspective?: "home" | "partner"; // whose problem this is — partner flags shown separately in UI
}

// ── NHL Division map ─────────────────────────────────────────
const DIVISIONS: Record<string, string> = {
  // Atlantic
  BOS: "Atlantic", BUF: "Atlantic", DET: "Atlantic", FLA: "Atlantic",
  MTL: "Atlantic", OTT: "Atlantic", TBL: "Atlantic", TOR: "Atlantic",
  // Metropolitan
  CAR: "Metropolitan", CBJ: "Metropolitan", NJD: "Metropolitan", NYI: "Metropolitan",
  NYR: "Metropolitan", PHI: "Metropolitan", PIT: "Metropolitan", WSH: "Metropolitan",
  // Central
  ARI: "Central", CHI: "Central", COL: "Central", DAL: "Central",
  MIN: "Central", NSH: "Central", STL: "Central", UTA: "Central", WPG: "Central",
  // Pacific
  ANA: "Pacific", CGY: "Pacific", EDM: "Pacific", LAK: "Pacific",
  SEA: "Pacific", SJS: "Pacific", VAN: "Pacific", VGK: "Pacific",
};

// ---- Team archetype classifier ----
type TeamMode = "CONTENDER" | "BUBBLE" | "RETOOLING" | "REBUILDING" | "TANKING";

const classifyTeam = (team: Team, roster: Asset[]): TeamMode => {
  // Trust the live phase field from the API first — it incorporates
  // phase overrides (e.g. WPG=Retooling despite #26 standing)
  if (team.phase === "Tanking")    return "TANKING";
  if (team.phase === "Rebuilding") return "REBUILDING";
  if (team.phase === "Retooling")  return "RETOOLING";
  if (team.phase === "Bubble")     return "BUBBLE";
  if (team.phase === "Contender")  return "CONTENDER";

  // Fallback: derive from standing + cap if phase is missing
  const capCeiling = SEASON.capCeiling;
  const capUsed = capCeiling - team.capSpace;
  if (team.standing <= 6  && capUsed > 85) return "CONTENDER";
  if (team.standing <= 14 && capUsed > 72) return "BUBBLE";
  if (team.standing > 24  && team.capSpace > 25) return "TANKING";
  if (team.standing > 18) return "REBUILDING";
  return "RETOOLING";
};

const positionalDepth = (assets: Asset[], position: string): number =>
  assets.filter((a) => {
    if (position === "C") return a.position === "C" && (a.ptsPace > 25 || a.avgTOI > 13);
    if (position === "D") return a.position === "D" && a.avgTOI > 18;
    return (a.position === "W" || a.position === "L" || a.position === "R") && (a.ptsPace > 20 || a.avgTOI > 11);
  }).length;

// How many quality players does a team have at a position AFTER removing outgoing assets
const rosterDepthAfterTrade = (
  fullRoster: Asset[],
  outgoing: Asset[],
  position: string
): number => {
  const remaining = fullRoster.filter(
    (p) => !outgoing.some((o) => o.id === p.id)
  );
  return positionalDepth(remaining, position);
};

// Is this team already identified as needing a position in db.ts needs array?
const teamNeedsPosition = (team: Team, position: string): boolean => {
  if (!team.needs?.length) return false;
  return team.needs.some(
    (n: { pos: string; minWar: number; label: string }) => n.pos === position || n.pos === "Any"
  );
};

// Score how defensively dependent a team is (goalie + D quality)
// Higher = team relies more on defensive structure, can't afford to gut D corps
const defensiveDependencyScore = (roster: Asset[]): number => {
  const dmen = roster.filter((p) => p.position === "D");
  const eliteD = dmen.filter((p) => p.avgTOI > 22 && p.ptsPace > 35);
  const totalDTOI = dmen.reduce((s, p) => s + p.avgTOI, 0);
  // A team concentrated around 1-2 elite D is more dependent than one with 4 solid D
  return eliteD.length <= 1 ? 0.9 : eliteD.length === 2 ? 0.6 : 0.3;
};



// ── Package compression — all constants from season-config ─────────────────
const FRANCHISE_THRESHOLD = FRANCHISE.threshold;
const MEGALODON_THRESHOLD  = FRANCHISE.megalodon;
// ageDecayRate / ageSlotPenalty — imported from season-config

const compressPackage = (assets: Asset[]): number => {
  if (assets.length === 0) return 0;
  const picks   = assets.filter(a => a.position === "Pick");
  const players = assets.filter(a => a.position !== "Pick");
  const pickValue = picks.reduce((sum, a) => sum + getXNAV(a).total, 0);
  if (players.length === 0) return pickValue;
  const sorted = [...players].sort((a, b) => getXNAV(b).total - getXNAV(a).total);
  let decaySum = 0, penaltySum = 0;
  sorted.forEach((a, i) => {
    const age = a.age ?? 27;
    decaySum += getXNAV(a).total * Math.pow(ageDecayRate(age), i);
    if (i > 0) penaltySum += ageSlotPenalty(age);
  });
  return pickValue + Math.max(0, decaySum - penaltySum);
};

const runGmLogic = (
  outgoing: Asset[],
  incoming: Asset[],
  teamHome: Team | null,
  teamPartner: Team | null,
  allHomeRoster: Asset[],
  allPartnerRoster: Asset[]
): GmFlag[] => {
  const flags: GmFlag[] = [];
  if (!teamHome || !teamPartner) return flags;

  const modeHome = classifyTeam(teamHome, allHomeRoster);
  const modePartner = classifyTeam(teamPartner, allPartnerRoster);

  // Linear NAV — used for display in flag explanations
  const navOut     = outgoing.reduce((s, a) => s + getXNAV(a).total, 0);
  const navIn      = incoming.reduce((s, a) => s + getXNAV(a).total, 0);
  // Compressed NAV — used for trade balance decisions (models roster slot scarcity)
  const cNavOut    = compressPackage(outgoing);
  const cNavIn     = compressPackage(incoming);
  const homeNetGain = cNavIn - cNavOut;
  const maxNav = Math.max(Math.abs(cNavOut), Math.abs(cNavIn), 1);
  const imbalancePct = (Math.abs(homeNetGain) / maxNav) * 100;

  // Package compression diagnostics — direction-aware messaging
  const compressionLossIn  = navIn  - cNavIn;
  const compressionLossOut = navOut - cNavOut;

  // Incoming compressed: WPG is RECEIVING the depth package — they're getting less than linear
  if (compressionLossIn > 120 && incoming.filter(a => a.position !== "Pick").length >= 3) {
    flags.push({
      severity: "SOFT",
      category: "VALUE_VETO",
      headline: `Incoming package discounted — receiving depth, not concentration`,
      explanation: `The ${incoming.filter(a=>a.position!=="Pick").length}-player incoming package has a linear value of ${Math.round(navIn)} NAV, but its compressed value is ${Math.round(cNavIn)} NAV after the roster slot penalty (−${Math.round(compressionLossIn)}). You are receiving depth distribution across multiple lineup slots rather than one elite concentrated asset. The TugBar reflects the compressed value.`,
      perspective: "home",
    });
  }

  // Outgoing compressed: WPG is SENDING the depth package — WPG is overpaying in asset count
  if (compressionLossOut > 120 && outgoing.filter(a => a.position !== "Pick").length >= 3) {
    flags.push({
      severity: "SOFT",
      category: "VALUE_VETO",
      headline: `You are overpaying — your depth package compresses to ${Math.round(cNavOut)} NAV`,
      explanation: `Your ${outgoing.filter(a=>a.position!=="Pick").length}-player outgoing package has a linear value of ${Math.round(navOut)} NAV, but its compressed value is ${Math.round(cNavOut)} NAV after the roster slot penalty (−${Math.round(compressionLossOut)}). You are spending ${outgoing.filter(a=>a.position!=="Pick").length} roster slots when the return is ${Math.round(navIn)} NAV — a net deficit of ${Math.round(cNavOut - navIn)}. Consolidate your package around fewer, higher-value assets.`,
      perspective: "home",
    });
  }

  // ── PHASE 2: Franchise Anchor Veto ───────────────────────────────────────
  // Franchise-tier players (NAV ≥ 600) are functionally untradeable unless
  // specific real-world catalysts are present.
  const outFranchise = outgoing.filter(a => getXNAV(a).total >= FRANCHISE_THRESHOLD);
  for (const asset of outFranchise) {
    const nav       = getXNAV(asset).total;
    const isMegalodon = nav >= MEGALODON_THRESHOLD;

    // Catalyst 1 — Contract leverage: final year / UFA
    const contractLeverage = asset.yearsRemaining <= 1;

    // Catalyst 2 — Franchise-level return: incoming has an elite player
    const franchiseReturn = incoming.some(a =>
      getXNAV(a).total >= FRANCHISE_THRESHOLD && a.position !== "Pick");

    // Catalyst 3 — Landscape-shifting capital: 2+ 1st-round picks + ELC prospect
    const firstRoundPicks = incoming.filter(a =>
      a.position === "Pick" && (a.round ?? 99) === 1).length;
    const elcProspects = incoming.filter(a =>
      a.position !== "Pick" && (a.age ?? 99) <= 23 && a.capHit <= 0.95).length;
    const massiveCapital = firstRoundPicks >= 2 && elcProspects >= 1;

    if (isMegalodon && !contractLeverage && !franchiseReturn && !massiveCapital) {
      flags.push({
        severity: "HARD",
        category: "FRANCHISE_ANCHOR",
        headline: `${asset.name.split(" ").pop()} is a generational franchise anchor`,
        explanation: `At ${Math.round(nav)} NAV, ${asset.name} is not a tradeable asset under normal circumstances. Generational talents compress the production of an entire top line into one roster slot — trading them requires either imminent UFA status, a franchise-level player in return, or a Lindros-tier package (multiple 1st-round picks + elite ELC prospect). The Gretzky trade is a cautionary tale, not a blueprint.`,
        affectedAsset: asset.name,
        vetoesSide: 0,
      });
    } else if (!isMegalodon && !contractLeverage && !franchiseReturn && !massiveCapital) {
      flags.push({
        severity: "SOFT",
        category: "FRANCHISE_ANCHOR",
        headline: `${asset.name.split(" ").pop()} commands franchise-level return`,
        explanation: `${asset.name} (${Math.round(nav)} NAV) is an elite franchise cornerstone. Moving him requires either a franchise-calibre player in return, significant contract leverage (final year), or a package of at least two 1st-round picks and a high-ceiling ELC prospect. The current package doesn't meet that bar.`,
        affectedAsset: asset.name,
        vetoesSide: 0,
      });
    }
  }
  // imbalancePct already declared above using compressed values

  const outPlayers = outgoing.filter((a) => a.position !== "Pick");
  const inPlayers  = incoming.filter((a) => a.position !== "Pick");
  const outPicks   = outgoing.filter((a) => a.position === "Pick");
  const inPicks    = incoming.filter((a) => a.position === "Pick");

  // ── HARD: The "Something for Nothing" Block ──
  if (incoming.length > 0 && outgoing.length === 0 && cNavIn > 0) {
    flags.push({
      severity: "HARD",
      category: "VALUE_VETO",
      headline: "Incomplete Trade Proposal",
      explanation: `${teamPartner.name} is not a charity. You cannot acquire positive-value assets for nothing. You must send back a player, draft capital, or absorb a negative-value contract to make this a legal structure.`,
      vetoesSide: 1,
    });
  } else if (outgoing.length > 0 && incoming.length === 0 && navOut > 0) {
    flags.push({
      severity: "HARD",
      category: "VALUE_VETO",
      headline: "Incomplete Trade Proposal",
      explanation: `${teamHome.name} cannot give away positive-value assets for nothing. Real NHL trades require a return — even if it is just a late draft pick.`,
      vetoesSide: 0,
    });
  }

  // ── SOFT: Gross Underpayment (The Fleecing Veto) ──
  // Prevents users from acquiring a +25 NAV player for a +10 NAV package
  // Only applies when both sides are exchanging positive value
  // ── SOFT: Gross Underpayment — uses compressed NAV (roster slot aware) ──
  if (cNavIn > 0 && cNavOut > 0) {
    const isHomeRobbing    = cNavOut < cNavIn  * 0.45 && (cNavIn  - cNavOut) > 10;
    const isPartnerRobbing = cNavIn  < cNavOut * 0.45 && (cNavOut - cNavIn)  > 10;

    if (isHomeRobbing) {
      flags.push({
        severity: "SOFT",
        category: "VALUE_VETO",
        headline: `${teamPartner.name} rejects massive underpayment`,
        explanation: `You are asking ${teamPartner.name} to give up ${navIn.toFixed(0)} NAV while only offering ${navOut.toFixed(0)} NAV in return. While GMs occasionally lose trades on paper, a value gap this extreme gets rejected immediately. The offer needs significantly more value to be taken seriously.`,
        vetoesSide: 1,
      });
    } else if (isPartnerRobbing) {
       flags.push({
        severity: "SOFT",
        category: "VALUE_VETO",
        headline: `${teamHome.name} rejects massive underpayment`,
        explanation: `${teamHome.name} is being asked to give up ${navOut.toFixed(0)} NAV while only receiving ${navIn.toFixed(0)} NAV. This is a gross underpayment and gets rejected by the front office.`,
        vetoesSide: 0,
      });
    }
  }

  // ── HARD: Cap ceiling — home ──
  const capDeltaHome = incoming.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0)
                     - outgoing.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0);
  const projCapHome = teamHome.capSpace - capDeltaHome;
  if (projCapHome < 0) flags.push({
    severity: "HARD", category: "CAP_VIOLATION",
    headline: "Cap Ceiling Breach",
    explanation: `This trade puts ${teamHome.name} $${Math.abs(projCapHome).toFixed(2)}M over the $104M NHL cap ceiling. The trade is structurally illegal as currently constructed. To fix it: add more outgoing salary, apply salary retention on incoming contracts, or reduce the total incoming cap hit.`,
    vetoesSide: 0,
  });

  
  // ── HARD: Cap ceiling — partner ──
  const capDeltaPartner = outgoing.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0)
                        - incoming.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0);
  const projCapPartner = teamPartner.capSpace - capDeltaPartner;
  if (projCapPartner < 0) flags.push({
    severity: "HARD", category: "CAP_VIOLATION",
    headline: "Partner Cap Breach",
    explanation: `This trade puts ${teamPartner.name} $${Math.abs(projCapPartner).toFixed(2)}M over the ceiling. The deal cannot be legally submitted until ${teamPartner.name} clears space — via waivers, a compliance buyout, or restructuring another deal.`,
    vetoesSide: 1,
  });

  
  // ── HARD: Cap floor ──
  const newCapUsedHome = SEASON.capCeiling - projCapHome;
  if (newCapUsedHome < 65 && capDeltaHome < -3) flags.push({
    severity: "HARD", category: "FLOOR_VIOLATION",
    headline: "Cap Floor Violation",
    explanation: `${teamHome.name} would fall below the NHL's $65M cap floor. All 32 teams must spend a minimum of $65M on player salaries — going under the floor is illegal under the CBA.`,
    vetoesSide: 0,
  });

  // ── NMC/NTC Waiver Logic ─────────────────────────────────────
  // A player with an NMC isn't automatically a deal-killer.
  // Players waive their clauses when the destination makes sense:
  //   - Contender (wants to win a Cup)
  //   - Age 32+ (window closing, chasing a ring)
  //   - Home market / preferred city
  //   - Contract is being honoured (no retention abuse)
  // Below a certain waiver probability we downgrade to SOFT not HARD.

  const waiverProbability = (player: Asset, destination: Team | null): number => {
    if (!destination) return 0;
    let prob = 0.3; // base probability — players are generally reluctant

    // Contender bonus — biggest factor
    const destPhase = destination.phase ?? "Retooling";
    if (destPhase === "Contender") prob += 0.4;
    else if (destPhase === "Bubble") prob += 0.2;
    else if (destPhase === "Rebuilding" || destPhase === "Tanking") prob -= 0.2;

    // Age factor — veterans chasing rings are more likely to waive
    if (player.age >= 34) prob += 0.25;
    else if (player.age >= 31) prob += 0.1;
    else if (player.age <= 27) prob -= 0.15; // young players protect their leverage

    // Contract length — fewer years left = more willing to waive
    if ((player.yearsRemaining || 0) <= 2) prob += 0.15;
    else if ((player.yearsRemaining || 0) >= 6) prob -= 0.1;

    return Math.min(0.95, Math.max(0.05, prob));
  };

  const nmcOut = outPlayers.find((a) => a.hasNMC);
  if (nmcOut) {
    const prob         = waiverProbability(nmcOut, teamPartner);
    const pctStr       = `${Math.round(prob * 100)}%`;
    // Above 50%: player likely waives — downgrade to WARN, trade can proceed
    // Below 50%: player likely refuses — HARD block, cannot be overridden
    const likelyWaives = prob >= 0.50;
    flags.push({
      severity: likelyWaives ? "WARN" : "HARD",
      category: "CLAUSE",
      headline: likelyWaives
        ? `NMC — ${nmcOut.name} likely to waive (~${pctStr})`
        : `NMC — ${nmcOut.name} will not waive (${pctStr})`,
      explanation: likelyWaives
        ? `${nmcOut.name} holds a Full No-Movement Clause but the destination makes this workable. At age ${nmcOut.age} heading to a ${teamPartner?.phase ?? "unknown"} team, the model puts waiver probability at ~${pctStr}. ${nmcOut.age >= 32 ? "Veterans in the late stages of their career often waive for a legitimate Cup contender." : "The destination is attractive enough that he will likely consent."} Needs a direct conversation with the player but this deal can move forward.`
        : `${nmcOut.name} holds a Full No-Movement Clause and this destination gives him every reason to exercise it. At age ${nmcOut.age} heading to a ${teamPartner?.phase ?? "unknown"} team, the waiver probability is only ~${pctStr}. Under the CBA, ${teamHome.name} cannot trade him without his written consent — and he won't give it. This trade is dead until the destination changes.`,
      affectedAsset: nmcOut.name, vetoesSide: 0,
    });
  }

  const nmcIn = inPlayers.find((a) => a.hasNMC);
  if (nmcIn) {
    const prob         = waiverProbability(nmcIn, teamHome);
    const pctStr       = `${Math.round(prob * 100)}%`;
    const likelyWaives = prob >= 0.50;
    flags.push({
      severity: likelyWaives ? "WARN" : "HARD",
      category: "CLAUSE",
      headline: likelyWaives
        ? `NMC — ${nmcIn.name} likely to waive (~${pctStr})`
        : `NMC — ${nmcIn.name} will not waive (${pctStr})`,
      explanation: likelyWaives
        ? `${nmcIn.name} holds a Full No-Movement Clause requiring his consent to be traded. Going to ${teamHome.name} (${teamHome.phase ?? "unknown"}), the model puts waiver probability at ~${pctStr}. ${nmcIn.age >= 32 ? "At this stage of his career, a move to a winning situation likely appeals." : "The destination is competitive enough that he may agree."} Still requires direct player approval before the deal is official.`
        : `${nmcIn.name} holds a Full No-Movement Clause and moving to ${teamHome.name} (${teamHome.phase ?? "unknown"}) doesn't appeal to him. Waiver probability is only ~${pctStr}. ${teamPartner.name} cannot trade him without his consent — and this destination doesn't obviously get it. This trade cannot proceed as structured.`,
      affectedAsset: nmcIn.name, vetoesSide: 1,
    });
  }

  // ── HARD: Retention over 50% ──
  if (outgoing.some((a) => (a.retainedPct || 0) > 0.5)) flags.push({
    severity: "HARD", category: "RETAIN_ABUSE",
    headline: "Retention Exceeds 50% Cap",
    explanation: `The NHL CBA prohibits retaining more than 50% of any player's cap hit in a trade. Adjust the retention slider to 50% or below.`,
  });

  // ── SOFT: Elite Blockade ──
  const partnerElites = incoming.filter((a) => getXNAV(a).total > 260);
  const homeElites    = outgoing.filter((a) => getXNAV(a).total > 200);
  if (partnerElites.length > 0 && homeElites.length === 0) {
    const requiredOverpay = navIn * 0.18;
    if (navOut < navIn + requiredOverpay) flags.push({
      severity: "SOFT", category: "ELITE_BLOCKADE",
      headline: `${teamPartner.name} protects ${partnerElites[0].name.split(" ").pop()}`,
      explanation: `${partnerElites[0].name} is a franchise cornerstone — a player teams build entire cap structures around. ${teamPartner.name}'s GM only moves him if ${teamHome.name} sends back either (a) a comparable Tier-1 asset, or (b) a package so overwhelming it accelerates their rebuild by 3+ years. The current offer doesn't meet either threshold. Historically, blockbuster deals like this (Gaudreau, Huberdeau, Karlsson) required massive prospect and pick hauls to get across the finish line. This package would get laughed out of the room.`,
      affectedAsset: partnerElites[0].name, vetoesSide: 1,
    });
  }

  // ── WARN: Same-division trade ────────────────────────────────
  // Intra-division trades are rare in the NHL because you're directly
  // strengthening a direct competitor. GMs avoid them unless the value
  // is overwhelming or they're a seller trading to a non-contender.
  const divHome    = DIVISIONS[teamHome.id];
  const divPartner = DIVISIONS[teamPartner.id];
  if (divHome && divPartner && divHome === divPartner) {
    const bothCompetitive = (modeHome !== "REBUILDING" && modeHome !== "TANKING") &&
                            (modePartner !== "REBUILDING" && modePartner !== "TANKING");
    flags.push({
      severity: bothCompetitive ? "WARN" : "INFO",
      category: "LEVERAGE_ASYMMETRY",
      headline: `Same-division trade — ${divHome} rivals`,
      explanation: `${teamHome.name} and ${teamPartner.name} play in the same ${divHome} Division and face each other ${bothCompetitive ? "six" : "four"} times a year. Intra-division trades are the rarest in the NHL — GMs are deeply reluctant to hand a direct rival an upgrade. ${
        bothCompetitive
          ? `Both teams are competitive, which makes this even more unusual. The receiving team gets a player they'll immediately use against their trading partner. This trade would require overwhelming value on one side or an extraordinary circumstance (divorce, buy-out demand, injury emergency) to actually happen.`
          : `One team is rebuilding, which makes this slightly more palatable — a seller trading veterans to a divisional rival for futures is more common than two contenders swapping impact players.`
      }`,
    });
  }
  // A GM will never trade from a position of weakness, even for
  // equal or better value back. The Jets won't trade Scheifele
  // even if they're getting a centre back — they need to maintain
  // minimum viable roster depth at every position before and after.
  //
  // Minimum viable NHL roster (18 skaters + 2 goalies):
  //   C:  2 quality centres (ptsPace > 45) — you simply can't ice
  //       a competitive team without two capable centres
  //   W:  3 quality wingers (ptsPace > 35)
  //   D:  3 quality defencemen (avgTOI > 20) — need 3 pairs
  //   G:  1 quality starter
  //
  // "Quality" threshold matters — a 4th line centre doesn't count
  // as depth protection for a 1C slot.
  //
  // STAR PREMIUM EXCEPTION:
  // Hockey is more team-dependent than basketball — you can't win
  // on one player alone. BUT contenders in a Cup window rationally
  // trade depth for elite talent when:
  //   1. The incoming player is a genuine star (ptsPace > 65 or NAV > 180)
  //   2. The team is CONTENDER or BUBBLE
  //   3. After the trade they're still above a "survivable" floor
  //      (one level below minimum viable — e.g. 2 wingers not 3)
  // In this case the roster hole flag downgrades from SOFT → WARN.
  // ─────────────────────────────────────────────────────────────
  const POSITION_MINIMUMS: Record<string, { min: number; survivable: number; label: string }> = {
    C: { min: 2, survivable: 1, label: "centres"    },
    W: { min: 3, survivable: 2, label: "wingers"    },
    D: { min: 3, survivable: 2, label: "defencemen" },
    G: { min: 1, survivable: 1, label: "goalies"    },
  };

  // Is the incoming package a genuine star upgrade?
  // A star is someone who meaningfully raises the team's ceiling,
  // not just maintains depth. In hockey terms: ~65+ pts pace or
  // elite NAV — the kind of player who changes line combinations
  // and makes everyone around them better.
  const isStarUpgrade = (assets: Asset[]): boolean => {
    const playerUpgrade = assets.some(a =>
      a.position !== "Pick" && (
        a.ptsPace > 65 ||
        getXNAV(a).total > 180 ||
        (a.position === "G" && (a.gsax ?? 0) > 12)
      )
    );
    // A high-value pick package (e.g. top-10 pick + player) also qualifies
    // as a star upgrade in terms of organizational value
    const totalNav = assets.reduce((s, a) => s + getXNAV(a).total, 0);
    const hasValuablePick = assets.some(a => a.position === "Pick" && getXNAV(a).total > 35);
    const pickPackageUpgrade = hasValuablePick && totalNav > 60;
    return playerUpgrade || pickPackageUpgrade;
  };

  const normalisePos = (pos: string) =>
    pos === "L" || pos === "R" ? "W" : pos;

  const qualityCount = (roster: Asset[], pos: string): number => {
    const p = normalisePos(pos);
    // "Quality" = actually deployed at the position with meaningful ice time
    // Thresholds are intentionally low — we want to catch REAL gaps, not penalize
    // teams for trading average players when average players are coming back
    if (p === "C") return roster.filter(a => normalisePos(a.position) === "C" && (a.ptsPace > 25 || a.avgTOI > 13)).length;
    if (p === "W") return roster.filter(a => normalisePos(a.position) === "W" && (a.ptsPace > 20 || a.avgTOI > 11)).length;
    if (p === "D") return roster.filter(a => normalisePos(a.position) === "D" && a.avgTOI > 18).length;
    if (p === "G") return roster.filter(a => normalisePos(a.position) === "G" && (a.gamesStarted ?? a.games) > 10).length;
    return 0;
  };

  const qualityCountAfter = (roster: Asset[], outgoing: Asset[], pos: string): number => {
    const remaining = roster.filter(a => !outgoing.some(o => o.id === a.id));
    return qualityCount(remaining, pos);
  };

  // Check HOME team — what are they giving away?
  const homeGivingUp = outPlayers;
  const positionsHomeLosing = [...new Set(homeGivingUp.map(a => normalisePos(a.position)))];

  for (const pos of positionsHomeLosing) {
    if (!POSITION_MINIMUMS[pos]) continue;
    const { min, survivable, label } = POSITION_MINIMUMS[pos];
    const before = qualityCount(allHomeRoster, pos);
    const after  = qualityCountAfter(allHomeRoster, homeGivingUp, pos);

    if (after < min) {
      // Rebuilding/tanking teams intentionally trade veterans — skip depth flags
      // when the player leaving is 28+ and the team is in a rebuild
      const veteransLeaving = homeGivingUp.filter(a => normalisePos(a.position) === pos && a.age >= 28);
      if ((modeHome === "REBUILDING" || modeHome === "TANKING") && veteransLeaving.length > 0) continue;

      const playersLeaving = homeGivingUp
        .filter(a => normalisePos(a.position) === pos)
        .map(a => a.name).join(" and ");

      // Any player at the same position coming back counts — don't require quality threshold
      // A young D like Lohrei is a legitimate return even if below veteran quality
      const incomingAtPos  = inPlayers.filter(a => normalisePos(a.position) === pos);
      const incomingFills  = incomingAtPos.length > 0;

      const leavingNav   = homeGivingUp
        .filter(a => normalisePos(a.position) === pos)
        .reduce((s, a) => s + getXNAV(a).total, 0);
      const incomingNav  = incomingAtPos.reduce((s, a) => s + getXNAV(a).total, 0);
      const hasRetained  = incomingAtPos.some(a => (a.retainedPct || 0) > 0);
      const bothNearZero = Math.abs(leavingNav) < 15 && Math.abs(incomingNav) < 15;
      const isDirectSwap = incomingFills && (incomingNav >= leavingNav * 0.5 || bothNearZero || hasRetained);
      if (isDirectSwap) continue;

      const starException = (modeHome === "CONTENDER" || modeHome === "BUBBLE")
        && after >= survivable
        && isStarUpgrade(inPlayers);

      flags.push({
        severity: starException ? "WARN" : "SOFT",
        category: "POSITIONAL_REDUNDANCY",
        headline: starException
          ? `${teamHome.name} trades depth for star power — calculated risk`
          : `${teamHome.name} can't drop below ${min} quality ${label}`,
        explanation: starException
          ? `${teamHome.name} drops to ${after} quality ${label} after this trade — below their usual threshold of ${min}, but still survivable at ${after}. This is a calculated contender move: trading proven depth to acquire elite star power.`
          : `${teamHome.name} currently has ${before} quality ${label} on their roster. Trading away ${playersLeaving} leaves them with only ${after} — below the minimum viable threshold of ${min}. ${
              incomingFills
                ? `A ${label.slice(0,-1)} is coming back at a lower quality level — the downgrade needs to be justified by what else is in the package.`
                : `No ${label.slice(0,-1)} is coming back in this deal, creating a roster hole that would need to be addressed separately.`
            } Real GMs run roster construction checks before accepting any deal — this one fails.`,
        vetoesSide: 0,
      });
    }
  }

  // Check PARTNER team — what are they giving away?
  const partnerGivingUp = inPlayers.filter((a) => a.position !== "Pick");
  const positionsPartnerLosing = [...new Set(partnerGivingUp.map(a => normalisePos(a.position)))];

  for (const pos of positionsPartnerLosing) {
    if (!POSITION_MINIMUMS[pos]) continue;
    const { min, survivable, label } = POSITION_MINIMUMS[pos];
    const before = qualityCount(allPartnerRoster, pos);
    const after  = qualityCountAfter(allPartnerRoster, partnerGivingUp, pos);

    if (after < min) {
      const playersLeaving = partnerGivingUp
        .filter(a => normalisePos(a.position) === pos)
        .map(a => a.name).join(" and ");

      // Any player at the same position coming back counts as filling the need
      // Don't require quality threshold — a developing player is still a return
      const incomingAtPos = outPlayers.filter(a => normalisePos(a.position) === pos);
      const incomingFills = incomingAtPos.length > 0;

      const leavingNav    = partnerGivingUp
        .filter(a => normalisePos(a.position) === pos)
        .reduce((s, a) => s + getXNAV(a).total, 0);
      // Use retained NAV for incoming players — a player at 50% retention is
      // a better deal than their raw NAV suggests for the receiving team
      const incomingNav   = incomingAtPos.reduce((s, a) => s + getXNAV(a).total, 0);
      const hasRetained   = incomingAtPos.some(a => (a.retainedPct || 0) > 0);
      const bothNearZero  = Math.abs(leavingNav) < 15 && Math.abs(incomingNav) < 15;
      // Retained players fill positional need regardless of NAV — cap relief is the point
      const swapThreshold = hasRetained ? 0.15 : 0.5;
      const isDirectSwap  = incomingFills && (incomingNav >= leavingNav * swapThreshold || bothNearZero || hasRetained);

      // Rebuilding and Tanking teams explicitly WANT to move veterans.
      // Flagging them for losing a 32-year-old D is backwards — that's the plan.
      // Only fire if they're getting nothing back AND they're not rebuilding.
      if (modePartner === "REBUILDING" || modePartner === "TANKING") {
        // Still flag if they're giving away young assets (age <= 25) — that's bad rebuilding
        const givingAwayYouth = partnerGivingUp
          .filter(a => normalisePos(a.position) === pos)
          .every(a => a.age <= 25);
        if (!givingAwayYouth) continue; // veteran leaving during rebuild = intentional, skip
      }

      // Skip flag entirely for direct position swaps of comparable quality
      if (isDirectSwap) continue;

      const starException = (modePartner === "CONTENDER" || modePartner === "BUBBLE")
        && after >= survivable
        && isStarUpgrade(outPlayers);

      flags.push({
        severity: starException ? "WARN" : "SOFT",
        category: "POSITIONAL_REDUNDANCY",
        headline: starException
          ? `${teamPartner.name} trades depth for star power — calculated risk`
          : `${teamPartner.name} can't drop below ${min} quality ${label}`,
        explanation: starException
          ? `${teamPartner.name} drops to ${after} quality ${label} — below their usual threshold of ${min}, but still survivable. This is the classic contender calculation: sacrifice depth to add a game-changing talent.`
          : `${teamPartner.name} currently has ${before} quality ${label}. Trading away ${playersLeaving} leaves them with only ${after} — below the minimum viable threshold of ${min}. ${
              incomingFills
                ? `A ${label.slice(0,-1)} is coming back, but at a lower quality level — ${teamPartner.name}'s GM would need to confirm this is an acceptable downgrade before proceeding.`
                : `Nothing coming back fills this hole. No GM willingly creates a critical positional gap without a direct replacement already identified.`
            }`,
        vetoesSide: 1,
      });
    }
  }

  // ── SOFT: Defensive Dependency ─────────────────────────────
  const tradingAwayD = outPlayers.filter((a) => a.position === "D");
  if (tradingAwayD.length > 0) {
    const depScore          = defensiveDependencyScore(allHomeRoster);
    const eliteDBeingTraded = tradingAwayD.filter((a) => a.avgTOI > 22 || getXNAV(a).total > 100);

    // ANY D coming back counts — including young/developing D-men like Lohrei
    // The threshold was too high (TOI>20 || NAV>60) and excluded legitimate returns
    const dComingBack      = inPlayers.filter(a => a.position === "D");
    const leavingDNav      = eliteDBeingTraded.reduce((s, a) => s + getXNAV(a).total, 0);
    const incomingDNav     = dComingBack.reduce((s, a) => s + getXNAV(a).total, 0);
    const isDForD          = dComingBack.length > 0 && incomingDNav >= leavingDNav * 0.4;

    // Rebuilding/tanking teams trading veterans is always correct — skip regardless
    const allDBeingTradedAreVeterans = eliteDBeingTraded.every(a => a.age >= 28);
    const isRebuildingVeteranMove    = (modeHome === "REBUILDING" || modeHome === "TANKING") && allDBeingTradedAreVeterans;

    if (depScore >= 0.6 && eliteDBeingTraded.length > 0 && !isDForD && !isRebuildingVeteranMove) {
      const dName           = eliteDBeingTraded[0].name;
      const remainingEliteD = qualityCountAfter(allHomeRoster, eliteDBeingTraded, "D");
      flags.push({
        severity: "SOFT",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `${teamHome.name}'s D corps can't absorb losing ${dName}`,
        explanation: `${teamHome.name}'s defensive structure is a known vulnerability. ${dName} (${eliteDBeingTraded[0].avgTOI.toFixed(1)} min/game) anchors their top pairing — trading him leaves ${remainingEliteD} quality defencemen. Nothing defensively meaningful is coming back. A forward, however talented, does not solve the underlying blue-line problem.`,
        affectedAsset: dName,
        vetoesSide: 0,
      });
    }
  }

  // Check PARTNER team losing a top-pairing D
  const partnerTradingAwayD = partnerGivingUp.filter((a) => a.position === "D");
  if (partnerTradingAwayD.length > 0) {
    const depScore          = defensiveDependencyScore(allPartnerRoster);
    const eliteDBeingTraded = partnerTradingAwayD.filter((a) => a.avgTOI > 22 || getXNAV(a).total > 100);

    // ANY D coming back counts — lower the threshold to catch young/developing D
    const dComingBack      = outPlayers.filter(a => a.position === "D");
    const leavingDNav      = eliteDBeingTraded.reduce((s, a) => s + getXNAV(a).total, 0);
    const incomingDNav     = dComingBack.reduce((s, a) => s + getXNAV(a).total, 0);
    const isDForD          = dComingBack.length > 0 && incomingDNav >= leavingDNav * 0.4;

    const allEliteDareVeterans    = eliteDBeingTraded.every(a => a.age >= 28);
    const isRebuildingVeteranMove = (modePartner === "REBUILDING" || modePartner === "TANKING") && allEliteDareVeterans;

    if (depScore >= 0.6 && eliteDBeingTraded.length > 0 && !isDForD && !isRebuildingVeteranMove) {
      const dName           = eliteDBeingTraded[0].name;
      const remainingEliteD = qualityCountAfter(allPartnerRoster, eliteDBeingTraded, "D");
      flags.push({
        severity: "SOFT",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `${teamPartner.name}'s D corps can't absorb losing ${dName}`,
        perspective: "partner" as const,
        explanation: `${teamPartner.name}'s defensive structure is a known vulnerability. ${dName} (${eliteDBeingTraded[0].avgTOI.toFixed(1)} min/game) anchors their top pairing — trading him leaves ${remainingEliteD} quality defencemen. Nothing defensively meaningful is coming back. This creates a structural vulnerability that a forward can't paper over.`,
        affectedAsset: dName,
        vetoesSide: 1,
      });
    }
  }

  // ── SOFT: Contender selling prime asset without future return ──
  // A Bubble or Contender team trading away a high-NAV player straight-up
  // for another player (no picks, no prospects) is shortening their window.
  // This is only acceptable if the incoming player is BETTER, not just
  // comparable. Washington trading Chychrun for Morrissey is a lateral move
  // at best — they need additional assets to justify it.
  const partnerIsContending = modePartner === "CONTENDER" || modePartner === "BUBBLE";
  const partnerHighNavOut   = partnerGivingUp.filter(a => getXNAV(a).total > 100);
  const homeHasPicksOrProsp = outPlayers.some(a =>
    a.position === "Pick" || (PROSPECT_TIERS[a.name] != null)
  );
  // Check from PARTNER'S perspective — are they getting back comparable value?
  // navOut = what home sends = what partner receives
  // partnerGivingNav = what partner sends away
  const partnerGivingNav   = partnerHighNavOut.reduce((s, a) => s + getXNAV(a).total, 0);
  const partnerReceiving   = navOut; // Morrissey's NAV in this case
  // Partner accepts if they're getting back ≥90% of what they give — otherwise they need a sweetener
  const partnerGetsEnough  = partnerReceiving >= partnerGivingNav * 0.90;

  if (partnerIsContending && partnerHighNavOut.length > 0 && !homeHasPicksOrProsp && !partnerGetsEnough) {
    const topAsset = partnerHighNavOut.sort((a,b) => getXNAV(b).total - getXNAV(a).total)[0];
    flags.push({
      severity: "HARD",
      category: "TIMELINE_MISMATCH",
      headline: `${teamPartner.name} requires future assets to move ${topAsset.name}`, perspective: "partner" as const,
      explanation: `${teamPartner.name} is a ${modePartner.toLowerCase()} team — they do not trade prime assets in straight player swaps. ${topAsset.name} is worth ${getXNAV(topAsset).total.toFixed(0)} NAV and is in the heart of their window. Accepting a comparable player with no picks or prospects attached gains them nothing strategically. Real GMs in ${teamPartner.name}'s position demand a sweetener for any deal of this magnitude — at minimum a mid-round pick to justify the inconvenience of a roster reshuffling. Add draft capital or a prospect to this package and the conversation changes entirely.`,
      affectedAsset: topAsset.name,
      vetoesSide: 1,
    });
  }

  // ── SOFT: Trading from an identified roster need ────────────
  // Only fire if the player actually meets the quality threshold for that need.
  // e.g. WPG needs "Top 4 D" — Heinola with 5 GP and 12min doesn't qualify.
  // e.g. WPG needs "Top 6 Winger" — a 4th-line winger at 9min doesn't qualify.
  for (const player of partnerGivingUp) {
    const need = teamPartner.needs?.find(
      (n: { pos: string; minWar: number; label: string }) => n.pos === player.position || n.pos === "Any"
    );
    if (!need) continue;

    // Position-appropriate TOI thresholds:
    //   Top 4 D:      18+ min (pair 1-2)
    //   Top 6 F/W/C:  14+ min (lines 1-2)
    //   Any:          12+ min (general starter threshold)
    const isD   = player.position === "D";
    const isF   = ["C","W","L","R"].includes(player.position);
    const minTOI = isD ? 18 : isF ? 14 : 12;
    const minNAV = 30;

    const playerNav  = getXNAV(player).total;
    const meetsQuality = player.avgTOI >= minTOI && playerNav >= minNAV;
    if (!meetsQuality) continue;

    flags.push({
      severity: "SOFT",
      category: "ASSET_SHAPE_MISMATCH",
      headline: `${player.name.split(" ").pop()} fills ${teamPartner.name}'s own stated need`,
      explanation: `${teamPartner.name} has internally identified "${need.label}" as a priority acquisition. ${player.name} plays exactly that position and meets the quality threshold (${player.avgTOI.toFixed(1)} min, ${playerNav.toFixed(0)} NAV) — trading him away is the direct opposite of the team's stated roster-building direction. You don't sell the asset you're desperately trying to buy.`,
      affectedAsset: player.name,
      vetoesSide: 1,
      perspective: "partner",
    });
    break;
  }

  // ── SOFT: Contender acquiring picks instead of players ──
  if (modePartner === "CONTENDER" && inPicks.length > 0 && outPlayers.length === 0) flags.push({
    severity: "SOFT", category: "ASSET_SHAPE_MISMATCH",
    headline: `${teamPartner.name} needs players, not picks`,
    perspective: "partner" as const,
        explanation: `${teamPartner.name} is in win-now mode. Contending teams don't trade their assets for draft picks that won't produce NHL players for 3–5 years — that's the opposite of what a team in a Stanley Cup window needs. ${teamPartner.name}'s GM would decline this and call teams that can send impact players.`,
    vetoesSide: 1,
  });

  // ── SOFT/HARD: Rebuilder trading young assets for a veteran ──
  // A rebuilding team giving up young players (age ≤ 25) to receive
  // a veteran (age ≥ 25, years > 3) is directly against rebuild logic.
  // Coronato (23) + Parekh (20) → Vilardi (26, 6yr) is the textbook violation.
  if (modePartner === "REBUILDING" || modePartner === "TANKING") {
    const youngGoingOut   = partnerGivingUp.filter(a => a.position !== "Pick" && a.age <= 25);
    const veteranComing  = inPlayers.filter(a => a.age >= 25 && (a.yearsRemaining ?? 0) >= 3 && !PROSPECT_TIERS[a.name]);
    const picksComingIn  = inPicks.length > 0;

    if (youngGoingOut.length > 0 && veteranComing.length > 0 && !picksComingIn) {
      const youngNames = youngGoingOut.map(a => a.name.split(" ").pop()).join(" and ");
      const vetName    = veteranComing[0].name;
      const vetAge     = veteranComing[0].age;
      const vetYears   = veteranComing[0].yearsRemaining ?? 0;
      flags.push({
        severity: "HARD",
        category: "TIMELINE_MISMATCH",
        headline: `${teamPartner.name} shouldn't trade young core for ${vetName}`, perspective: "partner" as const,
        explanation: `${teamPartner.name} is rebuilding around youth. Giving up ${youngNames} — players in the heart of their development window — to receive ${vetName} (age ${vetAge}, ${vetYears}yr deal) is the wrong direction entirely. ${vetName} will peak and decline on a contract that outlasts the rebuild timeline, while the assets leaving are exactly what a rebuild is built around. No draft capital is coming back to soften the blow. This trade sets ${teamPartner.name}'s rebuild back by years.`,
        affectedAsset: youngGoingOut[0].name,
        vetoesSide: 1,
      });
    } else if (outPlayers.length > 0 && outPicks.length === 0
        && !outgoing.some((a) => a.age <= 23 && a.position !== "Pick")
        && outPlayers.every((a) => a.age > 28)) {
      // Rebuilder only getting old players with no picks or prospects — wrong direction
      flags.push({
        severity: "SOFT", category: "ASSET_SHAPE_MISMATCH",
        headline: `${teamPartner.name} needs picks, not aging vets`,
        perspective: "partner" as const,
        explanation: `${teamPartner.name} is rebuilding. They trade current assets to stockpile picks and prospects — not to receive aging veterans with limited upside. Accepting players over 28 with no draft capital advances their rebuild by exactly zero. Their GM would counter by demanding at least one first-round pick or a young cost-controlled prospect.`,
        vetoesSide: 1,
      });
    }
  }

  // ── SOFT: Rebuilder trading picks for a rental ──
  if ((modeHome === "REBUILDING" || modeHome === "TANKING") && outPicks.length > 0) {
    const rentals = inPlayers.filter((a) => (a.yearsRemaining || 0) <= 1 && a.age > 28);
    if (rentals.length > 0) flags.push({
      severity: "SOFT", category: "REBUILD_LOGIC",
      headline: "Rebuilder trading picks for a rental",
      explanation: `${teamHome.name} is in rebuild mode. Trading draft picks — their most valuable future currency — for ${rentals[0].name} (${rentals[0].yearsRemaining || 0}yr remaining) is textbook bad front-office decision-making. When the contract expires, ${teamHome.name} has nothing to show for it and has set the rebuild back. This is the kind of deal that triggers front-office reviews.`,
      affectedAsset: rentals[0].name, vetoesSide: 0,
    });
  }

  // ── SOFT: Contender giving picks for declining vets ──
  if (modeHome === "CONTENDER" && outPicks.length > 0) {
    const decliners = inPlayers.filter((a) => a.age > 33 && a.ptsPace < 45);
    if (decliners.length > 0) flags.push({
      severity: "SOFT", category: "CONTENDER_LOGIC",
      headline: "Picks for a declining player",
      explanation: `${teamHome.name} is in a Cup window and is trading first-round picks for ${decliners[0].name}, who is ${decliners[0].age} years old and producing at only ${decliners[0].ptsPace.toFixed(0)} pts/82. Contenders that mortgage their futures for players on the wrong side of the age curve almost always regret it. The risk-adjusted return here is deeply negative.`,
      affectedAsset: decliners[0].name, vetoesSide: 0,
    });
  }

  // ── WARN: Positional redundancy ──
  for (const asset of inPlayers) {
    const depth = positionalDepth(allHomeRoster, asset.position);
    if (depth >= 3 && asset.ptsPace > 50) {
      flags.push({
        severity: "WARN", category: "POSITIONAL_REDUNDANCY",
        headline: `Depth glut at ${asset.position}`,
        explanation: `${teamHome.name} already has ${depth} quality ${asset.position}s on the roster. Acquiring ${asset.name} doesn't fill a hole — it creates a healthy scratch situation or forces another trade to rebalance the lineup. Smart GMs prioritize need over overall value.`,
        affectedAsset: asset.name, vetoesSide: 0,
      });
      break;
    }
  }

  // ── WARN: Injury risk flag ────────────────────────────────────
  // Players with known fragility or chronic injury histories carry
  // real risk that the analytics can't capture. A GM acquiring an
  // injury-prone player at a premium is making a bet on availability.
  for (const asset of inPlayers) {
    const risk = INJURY_RISK[asset.name];
    if (risk && asset.capHit >= 4) {
      flags.push({
        severity: risk.level === "HIGH" ? "WARN" : "INFO",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `${asset.name.split(" ").pop()} — ${risk.level.toLowerCase()} injury risk`,
        explanation: `${asset.name} ($${asset.capHit}M, age ${asset.age}) carries a ${risk.level.toLowerCase()} injury risk flag: ${risk.note}. At this cap hit, an extended absence doesn't just hurt on-ice — it locks ${teamHome.name} into dead cap. The analytics assume full availability; the real-world value is lower. Any contract offer or trade package should include injury protection clauses or a discount to reflect this risk.`,
        affectedAsset: asset.name,
        vetoesSide: 0,
      });
    }
  }

  // ── WARN: Contract year leverage flag ──────────────────────
  // A player in their final contract year before UFA has massive
  // leverage. They can demand a trade to a contender, refuse to
  // sign an extension, or walk for nothing. This changes the
  // entire negotiating dynamic — the acquiring team is essentially
  // renting them, and the selling team knows it.
  for (const asset of [...outPlayers, ...inPlayers]) {
    const isUFAYear = (asset.yearsRemaining || 0) <= 1 && asset.age >= 27;
    const isHighValue = asset.ptsPace > 55 || (asset.position === "D" && asset.avgTOI > 22);
    if (isUFAYear && isHighValue) {
      const side = outPlayers.includes(asset) ? 0 : 1;
      const acquiringTeam = side === 0 ? teamPartner : teamHome;
      flags.push({
        severity: "WARN",
        category: "RENTAL_TAX",
        headline: `${asset.name.split(" ").pop()} is a contract-year UFA — leverage risk`,
        explanation: `${asset.name} (${asset.yearsRemaining || 0}yr remaining, age ${asset.age}) enters free agency this summer. ${acquiringTeam.name} is betting they can re-sign him — but he has all the leverage. He can take the qualifying offer, perform well, and walk to the highest bidder. History is full of teams paying a premium to acquire UFAs who signed elsewhere: Claude Giroux to Ottawa, Ryan O'Reilly out of Buffalo, Taylor Hall everywhere. The price should reflect the rental risk unless ${acquiringTeam.name} has reason to believe an extension is agreed in principle.`,
        affectedAsset: asset.name,
        vetoesSide: side,
      });
    }
  }

  // ── WARN: Rental tax ──
  const bestIn = [...inPlayers].sort((a,b) => getXNAV(b).total - getXNAV(a).total)[0];
  if (bestIn && (bestIn.yearsRemaining || 0) <= 1 && bestIn.ptsPace > 55 && outPicks.length > 0) flags.push({
    severity: "WARN", category: "RENTAL_TAX",
    headline: `Rental premium risk — ${bestIn.name.split(" ").pop()}`,
    explanation: `${bestIn.name} is a rental: ${bestIn.yearsRemaining || 0} year(s) remaining, likely a UFA in the summer. History is not kind to rental buyers — Tomas Vanek, Taylor Hall in Arizona, Ryan O'Reilly in Buffalo. You surrender picks now; the player walks in July. The expected value of this deal over a 5-year horizon heavily favours ${teamPartner.name}.`,
    affectedAsset: bestIn.name, vetoesSide: 0,
  });

  // ── WARN: Age cliff mid-contract ──
  for (const asset of inPlayers) {
    const ageAtEnd = asset.age + (asset.yearsRemaining || 1);
    if (asset.capHit > 7 && asset.age > 32 && ageAtEnd > 37) {
      flags.push({
        severity: "WARN", category: "AGE_CLIFF",
        headline: `${asset.name.split(" ").pop()} age cliff mid-deal`,
        explanation: `${asset.name} will be ${ageAtEnd} at contract expiry, locked in at $${asset.capHit.toFixed(1)}M/yr. NHL production falls off sharply around age 35–36. This contract will almost certainly become a cap anchor in years 2–3, limiting ${teamHome.name}'s flexibility to re-sign their own players or make moves.`,
        affectedAsset: asset.name, vetoesSide: 0,
      });
      break;
    }
  }

  // ── WARN: Mortgaging two 1sts ──
  if (modeHome === "CONTENDER" && outPicks.filter((p) => (p.round || 3) === 1).length >= 2) flags.push({
    severity: "WARN", category: "CONTENDER_LOGIC",
    headline: "Shipping two 1st-round picks",
    explanation: `${teamHome.name} is trading two 1st-round picks. Contenders occasionally move one to win now, but two is franchise-altering. Even Pittsburgh and Washington eventually paid the price for over-extending on picks. This trade must result in a championship to justify the long-term cost. If the Cup run fails, ${teamHome.name} faces a prolonged rebuild without the picks to accelerate it.`,
    vetoesSide: 0,
  });

  // ── WARN: Leverage asymmetry (bad contract in a cap-strapped team) ──
  const baggage = outPlayers.find((a) => a.capHit > 6 && a.age > 34 && (a.yearsRemaining||0) > 1);
  if (baggage && teamHome.capSpace < 5) flags.push({
    severity: "WARN", category: "LEVERAGE_ASYMMETRY",
    headline: `${baggage.name.split(" ").pop()} — difficult contract to move`,
    explanation: `${baggage.name} ($${baggage.capHit.toFixed(1)}M × ${baggage.yearsRemaining}yr, age ${baggage.age}) is a contract very few teams want to absorb. With ${teamHome.name} already tight against the ceiling, the teams that could theoretically take on this contract hold significant leverage. Expect ${teamPartner.name} to demand a substantial sweetener just to take the cap hit.`,
    affectedAsset: baggage.name, vetoesSide: 1,
  });

  // ── INFO: Salary dump / change of scenery ─────────────────────
  // When the home team is moving a negative NAV player, this isn't
  // necessarily a bad trade — it's a cap management move. Flag it
  // as a dump and explain the real-world mechanics.
  const dumpPlayers = outPlayers.filter(a => getXNAV(a).total < -5);
  if (dumpPlayers.length > 0) {
    const deepDumps   = dumpPlayers.filter(a => getXNAV(a).total < -30);
    const cosPlayers  = dumpPlayers.filter(a => getXNAV(a).total >= -30);
    if (deepDumps.length > 0) {
      const d = deepDumps[0];
      flags.push({
        severity: "WARN",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `Salary dump — ${d.name.split(" ").pop()} needs significant sweetener`,
        explanation: `${d.name} ($${d.capHit.toFixed(1)}M, NAV ${getXNAV(d).total.toFixed(0)}) is a contract most GMs won't touch without compensation. To move this, ${teamHome.name} will need to retain salary (lowering the effective cap hit), attach draft picks, or both. The worse the contract, the more sweetener required — teams with cap space and roster holes are the only realistic partners.`,
        affectedAsset: d.name,
        vetoesSide: 1,
      });
    }
    if (cosPlayers.length > 0) {
      const c = cosPlayers[0];
      flags.push({
        severity: "INFO",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `Change of scenery — ${c.name.split(" ").pop()} may thrive elsewhere`,
        explanation: `${c.name} (NAV ${getXNAV(c).total.toFixed(0)} on current team) is underperforming relative to contract but fits the profile of a player who could bounce back in the right system. A different deployment, line combination, or organizational culture sometimes unlocks production the analytics don't capture here. A team with the right positional need and cap space may value this player differently than the current situation suggests.`,
        affectedAsset: c.name,
      });
    }
  }
  if (homeNetGain > 60 && getXNAV(incoming[0] || outgoing[0]).total > 200) flags.push({
    severity: "INFO", category: "FIRE_SALE",
    headline: "Suspiciously favourable return",
    explanation: `This return looks unusually good for ${teamHome.name}. In real life, GMs only accept below-market returns under specific pressure: ownership mandating cost cuts, a player who has demanded a trade, or a deteriorating relationship. If none of those factors exist here, ${teamPartner.name} would simply call other teams and get a better offer. Trades this lopsided only happen in real life when there is context the public doesn't know about.`,
    vetoesSide: 1,
  });

  // ── INFO: Locker-room leadership loss ──
  const cultureAsset = outPlayers.find((a) => (a.multiplier||1.0) > 1.06 && a.ptsPace > 60);
  if (cultureAsset) flags.push({
    severity: "INFO", category: "LOCKER_ROOM",
    headline: `Culture loss — ${cultureAsset.name.split(" ").pop()}`,
    explanation: `${cultureAsset.name} carries a positive intangible multiplier — he's a leader, a vocal presence, the kind of player who lifts the room. Trading him isn't just a statistical loss. Teams that have moved their culture anchors (St. Louis trading Pietrangelo, Florida trading Huberdeau) often describe a difficult transition period that doesn't show up in the analytics.`,
    affectedAsset: cultureAsset.name, vetoesSide: 0,
  });

  // ── SOFT: Significant value imbalance ──
  const navGapPct = Math.abs(homeNetGain) / Math.max(Math.abs(navOut), Math.abs(navIn), 1) * 100;
  const absGap = Math.abs(homeNetGain);
  if (absGap > 30 && navGapPct > 25) {
    const losingTeam  = homeNetGain < 0 ? teamHome  : teamPartner;
    const gainingTeam = homeNetGain < 0 ? teamPartner : teamHome;
    const losingNav   = homeNetGain < 0 ? navOut : navIn;
    const gainingNav  = homeNetGain < 0 ? navIn  : navOut;
    flags.push({
      severity: "SOFT",
      category: "LEVERAGE_ASYMMETRY",
      headline: `${losingTeam.name} is significantly overpaying`,
      explanation: `The NAV analysis shows ${losingTeam.name} giving up ${losingNav.toFixed(0)} NAV points worth of assets and receiving only ${gainingNav.toFixed(0)} — a ${navGapPct.toFixed(0)}% gap. ${losingTeam.name}'s GM has no incentive to accept this deal when they could simply wait for a better offer. Lopsided trades only happen under specific pressure: a player demanding a trade, a GM under ownership pressure to cut salary, or a team desperate to fill a critical hole before a deadline. Without that context, ${gainingTeam.name} holds all the leverage here.`,
      vetoesSide: homeNetGain < 0 ? 1 : 0,
    });
  }

  // ── INFO: Clean mutual deal ──
  // Only fires if: no hard/soft flags, NAV is reasonably balanced,
  // AND the value gap isn't large enough to suggest one team is being fleeced
  const hardFlags = flags.filter((f) => f.severity === "HARD");
  const softFlags = flags.filter((f) => f.severity === "SOFT");
  if (hardFlags.length === 0 && softFlags.length === 0 && navGapPct <= 15) flags.push({
    severity: "INFO", category: "GOOD",
    headline: "Mutually rational deal",
    explanation: `Both teams receive assets that match their organizational timeline. ${teamHome.name} (${modeHome}) and ${teamPartner.name} (${modePartner}) are each getting the shape of asset they need. No CBA violations, no logical vetoes, no major red flags on either side. This is the kind of trade that actually gets done at the deadline.`,
  });

  return flags;
};

// ============================================================
// TRADE EVALUATION ENGINE — v7.1
// ============================================================
const nullMetrics = () => ({
  navOut: 0, navIn: 0, homeNetGain: 0, ptsGain: 0,
  defGain: 0, capDelta: 0, variance: 0, ewaHome: 0, cwiYears: 0,
});

const evaluateTrade = (
  outgoing: Asset[],
  incoming: Asset[],
  teamHome: Team | null,
  teamPartner: Team | null,
  allHomeRoster: Asset[],
  allPartnerRoster: Asset[]
): TradeVerdict => {
  if (!outgoing.length && !incoming.length) {
    return { status: "IDLE", message: "Add assets to evaluate", flags: [], metrics: nullMetrics() };
  }

  const navOut = outgoing.reduce((s, a) => s + getXNAV(a).total, 0);
  const navIn  = incoming.reduce((s, a) => s + getXNAV(a).total, 0);

  // ── Package compression (roster slot scarcity model) ─────────
  // Replaces the old consolidation tax. True Package Value formula:
  // Σ(NAVᵢ × δⁱ⁻¹) − (n−1) × μ  where δ=0.60, μ=50 NAV/slot
  // Single-asset packages are unaffected; depth bundles are penalised.
  const cNavOut = compressPackage(outgoing);
  const cNavIn  = compressPackage(incoming);

  const homeNetGain = cNavIn - cNavOut;
  const ptsGain = incoming.reduce((s,a) => s+a.ptsPace,0) - outgoing.reduce((s,a) => s+a.ptsPace,0);
  const defGain = incoming.reduce((s,a) => s+a.defRate*(a.avgTOI/18),0) - outgoing.reduce((s,a) => s+a.defRate*(a.avgTOI/18),0);
  const capDelta = incoming.reduce((s,a) => s+a.capHit*(1-(a.retainedPct||0)),0) - outgoing.reduce((s,a) => s+a.capHit*(1-(a.retainedPct||0)),0);
  const maxNav = Math.max(Math.abs(cNavOut), Math.abs(cNavIn), 1);
  const variance = (Math.abs(homeNetGain) / maxNav) * 100;

  // ── Estimated Wins Added (EWA) ────────────────────────────────
  // Converts NAV delta into estimated standing wins for the home team.
  // Research basis: ~7 NAV ≈ 1 win above replacement at league average.
  // Marginal wins are harder to add the closer you are to a playoff spot:
  //   - Bottom-tier teams (standing 25-32): linear, 1 win per 7 NAV
  //   - Middle-tier (13-24): slightly compressed, harder to move needle
  //   - Playoff fringe (9-16): most compressed — marginal wins cost more
  //   - Already in playoffs (1-8): diminishing returns on wins
  const teamStanding = teamHome?.standing ?? 16;
  const marginFactor =
    teamStanding >= 25 ? 1.0 :   // rebuilders: full win value
    teamStanding >= 17 ? 0.85 :  // retooling: slight compression
    teamStanding >= 9  ? 0.70 :  // bubble: hard to move needle
                         0.55;   // contenders: already near ceiling
  const ewaPerNav = 1 / 7;
  const ewaHome = homeNetGain * ewaPerNav * marginFactor;

  // ── Contention Window Index (CWI) ────────────────────────────
  // Estimates how this trade affects the team's championship window.
  // Positive = window opens sooner or extends longer
  // Negative = window shortens or delays
  //
  // Factors:
  //   1. Asset age — young assets extend window, old assets don't
  //   2. Prospect value — PROSPECT_TIERS players add future floor
  //   3. Contract term — long surplus contracts extend window
  //   4. Phase alignment — acquiring assets that match team phase
  const calcAssetWindowImpact = (assets: Asset[], direction: 1 | -1): number => {
    return assets.reduce((sum, a) => {
      if (a.position === "Pick") {
        // Draft picks add future ceiling, especially high picks
        const pickValue = a.round === 1 ? 2.5 : a.round === 2 ? 1.0 : 0.3;
        return sum + direction * pickValue;
      }
      const nav = getXNAV(a).total;
      if (nav <= 0) return sum; // negative assets don't extend window

      // Age factor: peak value years before decline
      const peakAge = a.position === "G" ? 30 : 28;
      const yearsOfPeak = Math.max(0, peakAge - a.age + (a.yearsRemaining || 1));
      const ageFactor = Math.min(3.0, yearsOfPeak / 4);

      // Prospect bonus — high-tier prospects add option value
      const prospect = PROSPECT_TIERS[a.name];
      const prospectBonus = prospect
        ? prospect.tier === 1 ? 3.0
        : prospect.tier === 2 ? 1.5
        : 0.5
        : 0;

      // Contract surplus factor — cheap good players extend window more
      const surplus = Math.max(0, nav) / Math.max(1, a.capHit);
      const surplusFactor = Math.min(1.5, surplus / 15);

      return sum + direction * (ageFactor + prospectBonus + surplusFactor);
    }, 0);
  };

  const cwiGain = calcAssetWindowImpact(incoming, 1) + calcAssetWindowImpact(outgoing, -1);

  // Normalise CWI to a readable "years" scale
  // +3.0 CWI ≈ window extends/opens ~1 year sooner
  const cwiYears = cwiGain / 3.0;

  const flags = runGmLogic(outgoing, incoming, teamHome, teamPartner, allHomeRoster, allPartnerRoster);
  const hardFlags = flags.filter((f) => f.severity === "HARD");
  const softFlags = flags.filter((f) => f.severity === "SOFT");
  // Only these categories represent true GM logic vetoes that block a deal.
  // Value imbalance (LEVERAGE_ASYMMETRY), cultural fit (LOCKER_ROOM), age cliff
  // warnings, and rental tax are concerns — not hard nos. Real GMs override them.
  const vetoCategories = new Set([
    "POSITIONAL_REDUNDANCY",  // team can't absorb positional loss
    "TIMELINE_MISMATCH",      // rebuilder getting old vet / contender getting prospect
    "CLAUSE",                 // player NMC — hard block when waiver prob < 50%
    "ASSET_SHAPE_MISMATCH",   // team needs picks not vets, or D corps gutted
    "ELITE_BLOCKADE",         // trading away the only franchise player
    "REBUILD_LOGIC",          // rebuild-specific logic violations
    "VALUE_VETO",
  ]);
  const vetoFlags = softFlags.filter(f => f.category && vetoCategories.has(f.category));
  const warnFlags = softFlags.filter(f => !f.category || !vetoCategories.has(f.category));

  let status: TradeStatus = "PENDING";
  let message = "";

  if (hardFlags.length > 0) {
    status = "BLOCKED";
    message = hardFlags[0].headline;
  } else if (vetoFlags.length > 0) {
    status = "DECLINED";
    message = vetoFlags[0].headline;
  } else if (warnFlags.length > 0) {
    // Has concerns but no hard vetoes — show as WIN/LOSS/FAIR with flags visible
    if (variance <= 10) {
      status = "FAIR";
      message = "Balanced Exchange";
    } else if (homeNetGain > 0) {
      status = "WIN";
      message = `+${homeNetGain.toFixed(1)} NAV Surplus`;
    } else {
      status = "LOSS";
      message = `${Math.abs(homeNetGain).toFixed(1)} NAV Overpay`;
    }
  } else if (variance <= 10) {
    status = "FAIR";
    message = "Balanced Exchange";
  } else if (homeNetGain > 0) {
    status = "WIN";
    message = `+${homeNetGain.toFixed(1)} NAV Surplus`;
  } else {
    status = "LOSS";
    message = `${Math.abs(homeNetGain).toFixed(1)} NAV Overpay`;
  }

  return { status, message, flags, metrics: { navOut, navIn, homeNetGain, ptsGain, defGain, capDelta, variance, ewaHome, cwiYears } };
};

// ============================================================
// TYPES
// ============================================================
type TradeStatus = "IDLE" | "PENDING" | "FAIR" | "WIN" | "LOSS" | "BLOCKED" | "DECLINED";

interface TradeVerdict {
  status: TradeStatus;
  message: string;
  flags: GmFlag[];
  metrics: {
    navOut: number;
    navIn: number;
    homeNetGain: number;
    ptsGain: number;
    defGain: number;
    capDelta: number;
    variance: number;
    ewaHome: number;      // Estimated Wins Added for home team
    cwiYears: number;     // Contention Window shift in years
  };
  claudeAnalysis?: string;
  claudeLoading?: boolean;
}

// ============================================================
// UTILS
// ============================================================


// ── Math helpers ─────────────────────────────────────────────
// (these are also defined in page.tsx for the UI — duplicated intentionally
// so the engine is fully self-contained server-side)

// ============================================================
// API HANDLER
// ============================================================
export async function POST(req: Request) {
  try {
    const body: EvaluateRequest = await req.json();

    // 1. Compute NAV for all requested assets
    const navMap: Record<string, XNAVResult> = {};
    if (Array.isArray(body.assets)) {
      for (const asset of body.assets) {
        if (asset?.id) {
          navMap[asset.id] = getXNAV(asset);
        }
      }
    }

    // 2. Run full trade evaluation if requested
    let verdict: TradeVerdict | undefined;
    if (
      body.runTrade &&
      body.tradeOutgoing && body.tradeIncoming &&
      body.homeTeam && body.partnerTeam
    ) {
      verdict = evaluateTrade(
        body.tradeOutgoing,
        body.tradeIncoming,
        body.homeTeam,
        body.partnerTeam,
        body.allHomeRoster ?? [],
        body.allPartnerRoster ?? []
      );
    }

    const response: EvaluateResponse = { navMap, verdict };
    return NextResponse.json(response);
  } catch (e: any) {
    console.error("[evaluate] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}