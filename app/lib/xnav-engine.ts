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

import { SEASON, LEAGUE, FRANCHISE, ageDecayRate, ageSlotPenalty, capGrowthFactor } from "@/app/lib/season-config";
import type { NavStage, NavStageKind } from "@/app/lib/nav-breakdown";
import { goalieFmvCapPct, LEAGUE_MINIMUM_CAP_PCT as GOALIE_LEAGUE_MIN_CAP_PCT } from "@/app/lib/goalie-fmv";
import { reliability } from "@/app/lib/goalie-percentiles";
import {
  skaterFmvCapPct, skaterFmvDomainReport, unitForPosition,
  SKATER_FMV_VALIDATION,
  LEAGUE_MINIMUM_CAP_PCT as SKATER_LEAGUE_MIN_CAP_PCT,
} from "@/app/lib/skater-fmv";
import { skaterSeasonPrior } from "@/app/lib/skater-prior";
import type { FArchetype } from "@/app/lib/trade-types";
import { computeGravity } from "@/app/lib/gravity";

export const DPS_NAV_MULTIPLIER = 15; // dps * 15 = defPS for NAV (not 120 — the *8 bug is removed)

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface AssetInput {
  hdFinishingDelta?: number | null; // NHL EDGE: high-danger finishing vs league (nhl_snapshots)
  edgeSpeedMaxMph?: number | null;
  edgeBurstsOver20?: number | null;
  // NHL EDGE offensive-zone time share — the gravity NZ well's core input.
  // G4: declared here so field-by-field callers (evaluate route) can't
  // silently drop it, which degraded server-side gravity to partial mode.
  edgeOzPct?: number | null;
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
  goalsPace?:     number;        // for archetype: shooter (goal-heavy) vs playmaker (assist-heavy)
  assistsPace?:   number;
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
  /** Multi-season minutes per game — see `skater-prior.ts`. */
  baselineToiPerGame?: number;
  /** Sum of the season weights behind the baselines — see `skater-prior.ts`. */
  baselineSeasonsWeighted?: number;
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
  /** Goalie ice time, seconds — the sample the fitted FMV model regresses against. */
  iceTimeSeconds?:   number | null;
  teamHdca60?:       number;   // team HD chances against per 60 min (from team_baselines.json)
  // Admin trade-block status (stamped by league routes). "requested" = formal
  // public trade request → small leverage discount. "available" (quietly
  // shopped) carries no penalty — the team controls that narrative.
  tradeBlockStatus?: "requested" | "available" | "blocked" | "untouchable" | null;
}

export interface XNAVResult {
  total:       number;
  off:         number;
  /**
   * DESCRIPTIVE defensive rating — NOT the defensive value inside `total`.
   *
   * The total uses `defTotal`; this is `defDisplay`, a separate blend of
   * xGA-relative, DPS and defensive NAV built for the STRAND rails and the
   * role tags. The two differ, sometimes by a lot. Never put this in a value
   * breakdown — use `stages`, which carries the figure the total was actually
   * built from.
   */
  def:         number;
  age:         number;
  cap:         number;
  /**
   * DESCRIPTIVE upside signal, not an additive component. It re-states team
   * control that already sits inside `cap`. It used to add `ageTotal` on top,
   * which the AGE row already carried, so a breakdown printing both counted
   * the same value twice. Not part of `stages`.
   */
  upside:      number;
  grav?:       number;
  fmvAav?:     number;
  /**
   * The band around `fmvAav`, from the fitted model's own walk-forward error.
   *
   * Not a confidence interval — the model cannot produce one. It is what the
   * fit was actually wrong by on contracts it had never seen, which is the
   * honest width to draw around a figure that explains about two thirds of
   * what a skater signs for. Absent for goalies and picks.
   */
  fmvLow?:     number;
  fmvHigh?:    number;
  /**
   * Set when a feature had to be clamped to the fitted range by more than the
   * model's own error, so the price is a bound rather than a read. Null when
   * the clamp was a footnote — see `skaterFmvDomainReport`.
   */
  fmvClamped?: boolean;
  noivImpact?: number;
  fArchetype?: FArchetype;
  rosterTier?: RosterTier;
  isRFA?:      boolean;
  volatility?: number;
  /**
   * The accounting identity: signed rows that sum to `total`.
   *
   * Every multiplicative step the engine applies is recorded as the delta it
   * produced, so the headline is fully explained rather than partly. See
   * `app/lib/nav-breakdown.ts` for why this exists and how the display rounds
   * it without breaking the sum.
   */
  stages?:     NavStage[];
}

/** Build a stage, dropping the ones that did not fire. */
const stage = (key: string, label: string, value: number, kind: NavStageKind = "component"): NavStage =>
  ({ key, label, value: safe(value), kind });

/**
 * Whether this goalie's next deal would be signed with restricted rights.
 *
 * The fitted FMV model separates the two because they price differently — a
 * restricted goalie has no other bidder — and the engine already computes the
 * same idea further down as `isRFA`, but only after the FMV it depends on.
 */
/** Minutes a full starter's season runs to. Matches the FMV fit's anchor. */
const GOALIE_SEASON_MINUTES = 3500;

const isRFAWindow = (asset: AssetInput): boolean =>
  asset.age + Math.max(0, asset.yearsRemaining ?? 0) <= 27;

// ── Helpers ───────────────────────────────────────────────────────────────────
export const safe  = (n: number): number => (isNaN(n) || !isFinite(n) ? 0 : n);
export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

export interface ForwardArchetypeInput {
  ptsPace?: number | null;
  goalsPace?: number | null;
  assistsPace?: number | null;
  xGPace?: number | null;
  offTotal?: number | null;
  defTotal?: number | null;
  avgTOI?: number | null;
  qocIndex?: number | null;
  xgRelTM?: number | null;
  noivImpact?: number | null;
  ops?: number | null;
  dps?: number | null;
  ppPtsPace82?: number | null;
  pkTimeShare?: number | null;
  baselineHits82?: number | null;
  edgeSpeedMaxMph?: number | null;
  edgeBurstsOver20?: number | null;
}

export function classifyForwardArchetype(input: ForwardArchetypeInput): FArchetype {
  const pts = safe(input.ptsPace ?? 0);
  const goals = safe(input.goalsPace ?? 0);
  const assists = safe(input.assistsPace ?? Math.max(0, pts - goals));
  const gaTotal = goals + assists;
  const goalShare = gaTotal > 0 ? goals / gaTotal : null;
  const assistShare = gaTotal > 0 ? assists / gaTotal : null;
  const xg = safe(input.xGPace ?? 0);
  const off = safe(input.offTotal ?? pts * 1.15);
  const dps = input.dps ?? null;
  const def = safe(input.defTotal ?? (dps !== null ? dps * 12 : 0));
  const toi = safe(input.avgTOI ?? 0);
  const qoc = safe(input.qocIndex ?? 50);
  const noiv = safe(input.noivImpact ?? (input.xgRelTM != null ? input.xgRelTM * 3.5 : 0));
  const psRatio = input.ops != null && input.dps != null && (input.ops + input.dps) > 1
    ? input.ops / (input.ops + input.dps)
    : null;
  const ppPace = input.ppPtsPace82 ?? null;
  const pkShare = input.pkTimeShare ?? null;
  const hits82 = input.baselineHits82 ?? null;
  const explosive = (input.edgeBurstsOver20 != null && input.edgeBurstsOver20 >= 40)
    || (input.edgeSpeedMaxMph != null && input.edgeSpeedMaxMph >= 22.5);

  if (pts >= 110 && (off >= 145 || noiv >= 12 || assists >= 70)) return "HIGH_GRAVITY";
  if (pts >= 95 && assistShare !== null && assistShare >= 0.58) return "LINE_RAISER";
  if (pts >= 80 && noiv >= 8 && (assistShare === null || assistShare >= 0.48)) return "LINE_RAISER";
  if (goalShare !== null && goalShare >= 0.52 && pts >= 35) return "LINE_FINISHER";
  if ((xg >= 32 || (ppPace != null && ppPace >= 22)) && pts >= 55) return "LINE_FINISHER";
  if ((def >= 30 && toi >= 15) || (pkShare != null && pkShare >= 0.12 && pts >= 30) || (psRatio !== null && psRatio < 0.35)) {
    return "DEFENSIVE";
  }
  if (explosive) return "SPEED_BURST";
  if (hits82 != null && hits82 >= 140) return "SPACE_OPENER";
  if (toi >= 16 && pts >= 40 && (qoc >= 55 || def >= 18)) return "LINE_ESTABLISHER";
  if (pts >= 55 || off >= 70) return "IMPACT_PLAYER";
  if (toi >= 13 || pts >= 25) return "LINE_ESTABLISHER";
  return hits82 != null && hits82 >= 90 ? "SPACE_OPENER" : "";
}

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
    fmvAav: lowSample.fmvAav != null && established.fmvAav != null
      ? lowSample.fmvAav * (1 - w) + established.fmvAav * w
      : established.fmvAav ?? lowSample.fmvAav,
    noivImpact: blend(lowSample.noivImpact ?? 0, established.noivImpact ?? 0),
    fArchetype: established.fArchetype || lowSample.fArchetype,
    rosterTier: established.rosterTier ?? lowSample.rosterTier,
    isRFA: established.isRFA ?? lowSample.isRFA,
    volatility: Math.max(lowSample.volatility ?? 0, established.volatility ?? 0),
    stages: blendStages(lowSample, established, w),
  };
}

/**
 * Blend two waterfalls into one that still explains the blended total.
 *
 * The union of both sides, not just the established one. A prospect crossing
 * into an NHL sample is a blend of two DIFFERENT decompositions — a single
 * "prospect value" row on one side, the full skater waterfall on the other —
 * so a row that exists only on the fading side still carries its share of the
 * blended total. Walking `established` alone silently dropped it, and the
 * headline came out hundreds of points larger than its parts.
 *
 * Fading rows lead, which is also how the transition reads: what is left of
 * the draft-pedigree valuation, then the NHL evidence replacing it. Values
 * stay unrounded; the display reconciler turns them into integers that add up.
 */
function blendStages(lowSample: XNAVResult, established: XNAVResult, w: number): NavStage[] | undefined {
  const low = lowSample.stages, high = established.stages;
  if (!low || !high) return high ?? low;
  const highByKey = new Map(high.map(st => [st.key, st]));
  const lowByKey  = new Map(low.map(st => [st.key, st]));
  const fading = low.filter(st => !highByKey.has(st.key));
  return [
    ...fading.map(st => ({ ...st, value: st.value * (1 - w) })),
    ...high.map(st => ({
      ...st,
      value: (lowByKey.get(st.key)?.value ?? 0) * (1 - w) + st.value * w,
    })),
  ];
}

export type RosterTier =
  // Forwards
  | "ELITE_1ST_LINE"
  | "1ST_LINE_HIGH_2C"
  | "ELITE_SHUTDOWN"
  | "PK_SPECIALIST"
  | "FRINGE_1ST_LINE_2C"
  | "MIDDLE_SIX"
  | "BOTTOM_SIX"
  // Defensemen — pairing-based, so a D never reads as a "2nd-line center"
  | "ELITE_1ST_PAIR"
  | "TOP_PAIR"
  | "SHUTDOWN_D"
  | "SECOND_PAIR"
  | "THIRD_PAIR";

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
  isD = false,
): RosterTier {
  // Defensemen are ranked by pairing (ice time + usage + scoring), never by
  // forward line labels — a D scoring 49 pts on 24 minutes is a top-pair anchor,
  // not a "2nd-line center".
  if (isD) {
    switch (true) {
      case toi >= 23.5 && normalizedPts >= 45:
        return "ELITE_1ST_PAIR";
      case toi >= 21.0 && (normalizedPts >= 32 || (evQoc >= 60 && shToi >= 2.0)):
        return "TOP_PAIR";
      case evQoc >= 62 && shToi >= 2.2 && toi >= 18.0:
        return "SHUTDOWN_D";
      case toi >= 17.0:
        return "SECOND_PAIR";
      default:
        return "THIRD_PAIR";
    }
  }

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

// ── Breakout credibility → dynamic baseline blend ────────────────
// The engine anchors a player's offensive value to a multi-year baseline so a
// single hot season doesn't set the price. But a flat blend punishes a real
// young breakout exactly as hard as a fluky veteran contract-year spike. This
// decides how much of a season that spikes ABOVE the baseline to believe:
//   • Corroborated (young, pedigreed, full sample, NOT riding hot HD finishing)
//     → higher current weight, so a genuine leap counts toward value.
//   • Uncorroborated (older, thin sample, finishing-luck driven) → anchor to
//     the established baseline, so a contract year doesn't inflate FMV.
// Proven stars sit at current ≈ baseline, so the blend barely moves them —
// McDavid still earns the max; the mirage winger does not.
export function currentSeasonWeight(asset: AssetInput, defaultWeight: number): number {
  const base = asset.baselinePtsPace;
  const curr = safe(asset.ptsPace ?? 0);
  // No spike (or no baseline to compare against) → leave the blend as-is.
  if (base == null || base <= 0 || curr <= base * 1.05) return defaultWeight;

  const games = safe(asset.games ?? 40);
  let cred = 0.5; // neutral prior
  // Hot high-danger finishing is the clearest "is it luck" tell — a point spike
  // built on unsustainable finishing shouldn't set the market. Cold/neutral
  // finishing means the underlying play supports the jump.
  if (asset.hdFinishingDelta != null) cred += clamp(-asset.hdFinishingDelta * 6, -0.35, 0.35);
  // Young players genuinely level up; sudden late-career spikes rarely stick.
  if (asset.age <= 23) cred += 0.18; else if (asset.age >= 29) cred -= 0.18;
  // Draft pedigree lends a breakout precedent.
  if (asset.draftOverall != null && asset.draftOverall <= 15) cred += 0.10;
  // A full season of evidence vs a half-year mirage.
  cred += (clamp(games / 70, 0, 1) - 0.6) * 0.25;
  cred = clamp(cred, 0, 1);

  // Mirage → anchor to baseline (weight 0.20); fully corroborated → let the
  // breakout mostly count (weight 0.58). Never exceeds a believed real leap.
  const LO = 0.20, HI = 0.58;
  return LO + (HI - LO) * cred;
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
  // Dynamic current-season weight: uncorroborated spikes stay near the baseline
  // (default 0.40 current), corroborated breakouts earn up to 0.58.
  const cw = currentSeasonWeight(asset, 0.4);
  const blendedPts = baselinePtsPace !== undefined && baselinePtsPace > 0
    ? (pts * cw + baselinePtsPace * (1 - cw))
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
  return classifyRosterTier(toi, normalizedPts, evMdep, evQoc, evToi, shToi, asset.position === "D");
}

// ── Pick NAV ──────────────────────────────────────────────────────────────────
/**
 * What protection costs the club acquiring the pick, by how likely it is to
 * bite. A lottery first is mostly the lottery; protecting it removes most of
 * the value. A late first rarely lands in the protected range at all.
 */
export const PROTECTION_DISCOUNT = {
  lottery: 0.55,
  midFirst: 0.72,
  lateFirst: 0.88,
  laterRound: 0.85,
} as const;

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

  // CX8 — protection is a real term, so it has to move a number.
  //
  // A protected pick is one the sender keeps if it lands in the protected
  // range, rolling the obligation to a later year. To the receiver that is
  // strictly worse than the same pick unprotected: he loses exactly the
  // outcomes he most wanted. The discount is steepest where protection is
  // most likely to bite — a bottom-five club's first is largely a lottery
  // ticket, and protecting it removes most of what he was buying — and mild
  // for a contender's late first, which will rarely land in the range.
  //
  // Before this the toggle changed nothing anywhere: not the valuation, not
  // the shared URL, not execution. It read as a term of the deal and was
  // decoration.
  const protectionDiscount = asset.isProtected
    ? (round === 1
        ? (standing >= 27 ? PROTECTION_DISCOUNT.lottery : standing >= 20 ? PROTECTION_DISCOUNT.midFirst : PROTECTION_DISCOUNT.lateFirst)
        : PROTECTION_DISCOUNT.laterRound)
    : 1;

  const pickTotal = Math.max(round === 1 ? 5 : 1, baseValue * yearDecay * protectionDiscount);
  const upsideFraction = standing >= 27 ? 0.55 : standing >= 20 ? 0.45 : 0.30;
  return {
    total:  Math.round(pickTotal),
    off: 0, def: 0, age: 0, cap: 0,
    upside: Math.round(pickTotal * upsideFraction),
    // A pick's value is one number by construction; there is nothing to split.
    stages: [stage("pick", "Draft-pick value", pickTotal)],
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
  // Single-season GSAX variance is enormous — a goalie's one-year GSAx is a
  // weak predictor of the next. When a proven career baseline exists, cap
  // starter confidence at 0.68 (≈32% career weight) so an elite on a down
  // year (Hellebuyck: 5.5 GSAx over a 21+ career mean) regresses toward his
  // track record instead of cratering to replacement level. Without a
  // baseline there's nothing to regress to, so trust the season more (0.85).
  // Young goalies (≤26) regress hardest — least established.
  const hasGoalieBaseline = (asset.baselineGsax ?? 0) !== 0;
  const starterCap = !hasGoalieBaseline
    ? (asset.age <= 26 ? 0.75 : 0.80)   // no career baseline to lean on → unchanged
    : (asset.age <= 26 ? 0.62 : 0.68);  // real career baseline → regress a down year harder
  const confidenceAdj = isStarter
    ? Math.min(confidenceG, starterCap)
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
  // navCapHit and navYears are set below after currentFmvAavG is computed,
  // so unsigned goalies project onto their market AAV instead of $0.
  let navCapHit: number;
  let navYears: number;
  let contractYears: number;

  // RFA Cliff: cost-controlled goalie years carry a premium — set after navYears below.
  let isRFA: boolean;

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
  
  // ── Fair market value, from contracts people actually signed ────
  //
  // This was a hand-written logistic — midpoint 100, steepness 0.025, ceiling
  // 12% — whose output nobody had ever compared with a real price. It put a
  // 50-start starter with positive GSAx at $2.71M, roughly half the market, and
  // that error flowed straight into the contract stage of every goalie
  // valuation.
  //
  // `goalieFmvCapPct` is fitted to 260 one-way standard contracts and
  // walk-forward validated at ±$1.44M. It wants the RELIABILITY-REGRESSED
  // GSAx/60, which is a much harder shrink than the engine's own
  // `confidenceAdj` blend — a full season of GSAx carries about 13% of itself
  // forward — so the regression is applied here rather than reusing `expGSAx`.
  // Passing the engine's lighter-regressed figure would land outside the
  // fitted domain and price every goalie as though he were an outlier.
  const goalieIce = asset.iceTimeSeconds != null && asset.iceTimeSeconds > 0
    ? asset.iceTimeSeconds
    // No recorded ice time: infer it from workload, since a start is about 58
    // minutes. Cruder than the real figure and better than dropping the term.
    : gamesG * 58 * 60;
  // NOTE the unit trap: the engine's `gsaxPer60` above is per sixty GAMES —
  // `(gsax / games) * 60` — so for a full-season starter it is roughly the
  // season total, around 18 for an elite year. The fitted model wants goals per
  // sixty MINUTES, which is about 0.3 for the same goalie: a factor of ~58.
  // Feeding the engine's figure in clamped every positive goalie to the domain
  // ceiling and priced a -1.8 GSAx season above an +18.5 one.
  //
  // Raw rather than team-corrected, because the fit was built on raw MoneyPuck
  // GSAx. The engine's `defCorrection` still shapes the on-ice impact below;
  // it just has no business inside a market price that never saw it.
  const rawGsaxPer60Min = goalieIce > 0 ? (gsaxRaw * 3600) / goalieIce : 0;

  // The fit's feature is a THREE-season ice-weighted average, which carries
  // reliability ~0.32. Handing it a single season (0.134) shrinks more than
  // twice as hard and compresses every goalie toward the league mean — the
  // ordering stays right and the spread collapses.
  //
  // `baselineGsax` is the engine's career mean, on the same per-60-GAMES scale
  // as `asset.gsax`, so it converts the same way. Where it exists, treat the
  // sample as three seasons deep and weight the career mean two-thirds, which
  // is the window the model was fitted against. Where it does not, one season
  // is genuinely all we have and the harder shrink is the honest answer.
  const careerPer60Min = asset.baselineGsax != null && asset.baselineGsax !== 0
    ? (asset.baselineGsax * 3600) / (GOALIE_SEASON_MINUTES * 60)
    : null;
  const blendedGsax = careerPer60Min != null
    ? (rawGsaxPer60Min + careerPer60Min * 2) / 3
    : rawGsaxPer60Min;
  const effectiveIce = careerPer60Min != null ? goalieIce * 3 : goalieIce;
  const regressedGsax = blendedGsax * reliability("gsaxPer60", effectiveIce);
  const fittedCapPct = goalieFmvCapPct({
    gsax: regressedGsax,
    iceTimeSeconds: goalieIce,
    age: asset.age,
    // An unsigned goalie is priced as what he would command; a signed one is
    // priced against the market he last entered. RFA years cost less.
    isUfa: !isRFAWindow(asset),
  });

  // Replacement level when the model cannot price him at all — a goalie with no
  // age or no rate has no market read, and inventing a mid-range one would be
  // the same mistake the sigmoid made.
  const fmvCapPctG = fittedCapPct ?? GOALIE_LEAGUE_MIN_CAP_PCT;

  const BASE_CAP_CEILING = asset.capCeiling ?? SEASON.capCeiling;
  const currentFmvAavG = BASE_CAP_CEILING * fmvCapPctG;

  const isUnsignedG = !extCapHit && asset.yearsRemaining <= 0 && asset.capHit <= 0.5;
  navCapHit    = extCapHit ? extCapHit * (1 - (asset.retainedPct || 0))
               : isUnsignedG ? currentFmvAavG
               : effectiveCap;
  navYears     = extCapHit ? (asset.extensionYears ?? asset.yearsRemaining)
               : isUnsignedG ? 1
               : asset.yearsRemaining;
  contractYears = Math.max(1, navYears || 1);
  isRFA         = asset.age + navYears <= 27;

  let capSumG = 0;
  for (let i = 0; i < contractYears; i++) {
    const projectedCapCeiling = BASE_CAP_CEILING * capGrowthFactor(i);
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
  // The young-controlled floor only applies when it actually fires.
  //
  // This read `Math.max(rawTotal, youngFloor)` unconditionally, and `youngFloor`
  // is 0 for anyone who is not young and cheap — so the expression was a hard
  // floor at zero for EVERY goalie. A 27-year-old on $8.25M x 8 came out
  // impact +32, cap -49 → -17, clamped to 0. So did a genuine albatross at -73,
  // and so did a goalie with no data at all: three completely different
  // situations, one indistinguishable number, and a bad goalie contract that
  // cost nothing to trade away.
  //
  // Skater NAV has always been allowed to go negative for exactly this reason.
  const flooredG    = youngFloor > 0 ? Math.max(rawTotal, youngFloor) : rawTotal;
  const cappedTotal = Math.min(flooredG, roleCap);

  // The role ceiling is the single most consequential thing the goalie model
  // does — two starters above 250 come out tied — so the breakdown states it
  // as a line item rather than leaving it implicit in the headline.
  const goalieStages: NavStage[] = [
    stage("impact", "Projected stopping value", fmvTmv),
    stage("cap",    "Contract surplus",         capTotalG),
    stage("youngFloor",  "Cost-controlled floor", flooredG - rawTotal,     "adjustment"),
    stage("roleCeiling", "Role ceiling",          cappedTotal - flooredG,  "adjustment"),
  ];
  const volatility = Math.round(clamp(
    (1 - confidenceAdj) * 60
      + (gamesG < 50 ? 18 : 8)
      + (asset.age <= 26 ? 12 : 0)
      + (Math.abs(expGSAx) < 6 ? 6 : 0),
    8,
    85,
  ));

  return {
    total:  Math.round(cappedTotal),
    off:    0,
    def:    Math.round(safe(goalieImpact * ageFactor)),
    age:    Math.round(-agePenalty),
    cap:    Math.round(capTotalG),
    stages: goalieStages,
    upside: youngFloor > 0 ? youngFloor * 0.4 : 0,
    fmvAav: currentFmvAavG,
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
      // Not "no breakdown" — an explicit, empty one. There is no NHL sample and
      // no draft pedigree here, so a zero is a statement about evidence rather
      // than a valuation, and the panel should have nothing to draw.
      stages: [],
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
  // When games < 30 (injury), lean harder on the baseline to avoid
  // small-sample inflation/deflation.
  const baselinePtsPace = asset.baselinePtsPace;
  const baselineWeight = games < 30 ? 0.80 : 0.60;
  const currentWeight  = 1 - baselineWeight;
  const blendedPts = baselinePtsPace !== undefined && baselinePtsPace > 0
    ? (pts * currentWeight + baselinePtsPace * baselineWeight)
    : pts;

  const { evMdep, normalizedPts, evToi, shToi } = calcSkaterDeploymentContext(asset);

  const ptsScale  = isD ? 0.75 : 1.0;
  const ptsVal    = normalizedPts * ptsScale;

  const baselineDpsProxy = asset.baselineDpsProxy;
  const blendedDps = baselineDpsProxy !== undefined && baselineDpsProxy > 0
    ? (dps !== null ? dps * currentWeight + baselineDpsProxy * baselineWeight : baselineDpsProxy)
    : dps;
  // baselineXgRel is a fraction (e.g. 0.05 = +5 pct pts); xgRel is already in pct pts.
  // Blending damps single-season PDO luck the same way blendedPts damps scoring spikes.
  const baselineXgRelPts = asset.baselineXgRel != null ? asset.baselineXgRel * 100 : null;
  const blendedXgRel = baselineXgRelPts !== null
    ? (asset.xgRelTM != null ? xgRel * 0.4 + baselineXgRelPts * 0.6 : baselineXgRelPts)
    : xgRel;
  const noivBonus = clamp(blendedXgRel * 3.5, -20, 25);
  // EDGE luck regression: finishing above league on high-danger chances is
  // unsustainable (discount), finishing under it hides real value (credit).
  // Bounded small — this refines the offensive read, never drives it.
  const edgeLuckAdj = asset.hdFinishingDelta != null
    ? clamp(-asset.hdFinishingDelta * 150, -8, 10)
    : 0;
  const offPS     = ops !== null ? ops * 17 : null;

  // Power-law curve: elite players separate more than linear pts * 1.6
  // Use the power curve as the primary engine to properly value generational talent.
  // We use offPS (Point Shares) to slightly modulate it, but we never let a linear 
  // Point Shares stat overwrite the exponential power curve!
  const baseOffCurve = Math.pow(ptsVal / 45, 1.6) * 55;
  const offRaw = (offPS !== null
    ? baseOffCurve + (offPS - (ptsVal / 45) * 55) * 0.4 + (noivBonus * 0.25)
    : baseOffCurve + (xg * 0.5) + noivBonus) + edgeLuckAdj;

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
  const shutdownDSignal = Math.max(
    blendedDps !== null ? clamp((blendedDps - 3.3) * 5, 0, 12) : 0,
    clamp((-xgaRel - 0.35) * 18, 0, 10),
    asset.pairDriverScore != null ? clamp((asset.pairDriverScore - 7) * 1.4, 0, 8) : 0,
    clamp((def - 0.25) * 20, 0, 7),
    qocIdx >= 74 ? 5 : 0,
  );
  const isShutdownTopPairD = isD && toi >= 22 && games >= 40 && shutdownDSignal > 0;
  const shutdownDAdj = isShutdownTopPairD
    ? clamp((toi - 22) * 3 + shutdownDSignal, 4, 28)
    : 0;
  const toiDefFloor = isD && toi >= 20 && games >= 30
    ? clamp((toi - 20) * 1.8, 0, 12)
    : 0;
  const defRaw = defRawBase + driverAdj + shutdownDAdj + toiDefFloor;

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
  const xgaDispRaw = (xgaRelDisp !== null && xgaRelDisp !== undefined) && (asset.games ?? 0) >= 20
    ? safe(-xgaRelDisp * toiWeightD * 40 * defReliabilityWeight)
    : null;
  const dpsDispRaw = blendedDps !== null
    ? safe((blendedDps - 2.5) * 12 * defReliabilityWeight)
    : null;
  const defTotalDisp = defTotal * defReliabilityWeight;
  const xgaConf = clamp((games - 20) / 50, 0.15, 1.0);
  const dDefDisplay = xgaDispRaw !== null && dpsDispRaw !== null
    ? xgaDispRaw * (0.45 * xgaConf) + dpsDispRaw * (0.35 + 0.45 * (1 - xgaConf) * 0.55) + defTotalDisp * (0.20 + 0.45 * (1 - xgaConf) * 0.45)
    : xgaDispRaw !== null
    ? xgaDispRaw * (0.6 * xgaConf) + defTotalDisp * (1 - 0.6 * xgaConf)
    : defTotalDisp;
  const defDisplay = isForwardPos ? forwardDef : clamp(dDefDisplay, -40, 50);

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

  // ── Gravity v3 transition handoff ─────────────────────────────
  // Release A limits navResidual to the bounded NZ transition mass.
  // Direct offensive production and defensive suppression stay in their
  // existing X-NAV components. Gravity v4 is intentionally not imported
  // here and cannot affect X-NAV before its separate validation gates pass.
  let gravTotal = 0;
  const gravProfile = computeGravity(asset as any);
  if (gravProfile && games >= 20) {
    gravTotal = clamp(gravProfile.navResidual * 45, -20, 20);
  }

  // ── On-Ice Core ───────────────────────────────────────────────
  const trueMarketValue = offTotal + defTotal + ageTotal + gravTotal;
  const isRFA = asset.age + asset.yearsRemaining <= 27;

  // ── Fair market value, from the fitted contract model ─────────
  //
  // WHAT THIS REPLACES
  //
  // A logistic curve mapping on-ice NAV onto a cap share between 0.9% and
  // 20.0%. The 20% was the CBA's legal maximum, used as the top of the curve —
  // but no player has ever signed for it, and the record is McDavid at $12.5M.
  // At a $104M ceiling the asymptote sat at $20.8M, so every good skater was
  // pushed against it: Robertson $19.66M, Suzuki $20.14M, McDavid $20.66M, and
  // a third-pair defenceman at $16.83M.
  //
  // The inflation was not the worst of it. A logistic goes flat in its tail,
  // and the whole top of the league lived there — resolution fell from $0.109M
  // of FMV per point of on-ice NAV at the midpoint to $0.024M at the values
  // stars actually reached. McDavid's on-ice figure ran 98 points clear of
  // Robertson's and bought him $1.00M. That is why the ordering at the top of
  // the value scale kept coming out wrong: the contract stage had stopped
  // discriminating, and noise in the other components decided it.
  //
  // WHAT REPLACES IT
  //
  // `skater-fmv.ts` — separate forward and defence fits over 1,996 one-way
  // contracts signed 2017-2026, walk-forward validated at R² 0.64 / 0.55 and a
  // mean error of $1.41M. Inputs come through `skater-prior.ts` so a shortened
  // or anomalous season is pooled against the player's own history rather than
  // taken at face value, and a thin sample is shrunk toward the population.
  //
  // The model tops out near $15.0M for a forward at the edge of the fitted
  // range and $12.0M for a defenceman, which is the right neighbourhood for a
  // market whose record is $12.5M.
  const fmvUnit = unitForPosition(asset.position);
  const fmvPrior = skaterSeasonPrior({
    unit: fmvUnit,
    ptsPace: asset.ptsPace,
    minutesPerGame: asset.avgTOI,
    games: asset.games,
    baselinePtsPace: asset.baselinePtsPace,
    baselineToiPerGame: asset.baselineToiPerGame,
    baselineSeasonsWeighted: asset.baselineSeasonsWeighted,
  });
  /** The fitted model's view of a profile, at a given production rate and age. */
  const fmvAt = (pts60: number | null, atAge: number) => skaterFmvCapPct({
    pts60,
    minutesPerGame: fmvPrior.minutesPerGame,
    age: atAge,
    // Priced against the market he would actually enter. RFA years cost less,
    // and the same convention is used on the goalie side.
    isUfa: !isRFA,
    unit: fmvUnit,
  });

  const fittedCapPct = fmvAt(fmvPrior.pts60, age);
  // Replacement level when the model cannot price him at all — no production
  // rate or no age means no market read, and inventing a mid-range one is the
  // mistake the sigmoid made. The goalie path falls back the same way.
  const fmvCapPct = fittedCapPct ?? SKATER_LEAGUE_MIN_CAP_PCT;

  const BASE_CAP_CEILING = asset.capCeiling ?? SEASON.capCeiling;
  const currentFmvAav = BASE_CAP_CEILING * fmvCapPct;

  // Use extension cap hit and years if available to align with Goalie NAV and fix extension distortions.
  // When a player is unsigned (yearsRemaining === 0, capHit ≈ 0), project them
  // onto their FMV AAV — an unsigned RFA/UFA will command market value, so the
  // cap surplus should be ~0 rather than an infinite free lunch.
  const extCapHit        = asset.extensionCapHit;
  const isUnsigned       = !extCapHit && asset.yearsRemaining <= 0 && asset.capHit <= 0.5;
  const navCapHit        = extCapHit ? extCapHit * (1 - (asset.retainedPct || 0))
                         : isUnsigned ? currentFmvAav
                         : effectiveCap;
  const navYears         = extCapHit ? (asset.extensionYears ?? asset.yearsRemaining)
                         : isUnsigned ? 1
                         : asset.yearsRemaining;
  const contractYears    = Math.max(1, navYears || 1);

  // Loop through contract term to calculate the multi-year compound surplus sum.
  //
  // Growth-adjusted FMV: the player's market value is NOT flat across the
  // deal. A 23-year-old scoring 41 points is not a 41-point player in years
  // 2-6 of his contract — those are his prime seasons on the same audited
  // age curve the ageVal component uses (F grow to 26, D to 27, decline
  // from 28). Holding FMV at today's number made long team-control deals
  // for pre-peak players read as years of overpayment, and made aging
  // 8-year deals look no worse than rentals. Growth is gated by the same
  // youthProjectionSignal (production/role/pedigree × sample) so fringe
  // youth don't get star projections, and cumulative drift is clamped.
  const GROWTH_PER_PREPEAK_YEAR = 0.09 * youthProjectionSignal;
  const DECLINE_PER_YEAR = 0.03;
  let capSum = 0;
  let tmvDriftFactor = 1;
  for (let i = 0; i < contractYears; i++) {
    // The announced ceilings, not a flat escalator. 104.0 → 113.5 → 123.0 is
    // 9.1% then 8.4%; the 4% this used to compound left every future year of
    // every contract priced against a cap several points too low, worst on the
    // long deals where the figure carries most weight. Scaled off the asset's
    // own base so a user-set ceiling in Armchair GM still governs.
    const projectedCapCeiling = BASE_CAP_CEILING * capGrowthFactor(i);
    const ageAtYear = asset.age + i;

    if (i > 0) {
      if (ageAtYear <= peakAge) tmvDriftFactor *= 1 + GROWTH_PER_PREPEAK_YEAR;
      else if (ageAtYear >= peakAge + 2) tmvDriftFactor *= 1 - DECLINE_PER_YEAR;
      tmvDriftFactor = clamp(tmvDriftFactor, 0.70, 1.35);
    }
    // Re-price the profile as it will look in that season rather than holding
    // today's figure: the drift factor above is the engine's view of how
    // production moves, so it scales the production feature, and the model's
    // own age term carries the rest. Deployment is held flat — the engine has
    // no view on how a coach's usage will change, and inventing one here would
    // be a third growth model layered on the two that already exist.
    const fmvCapPctAtYear = fittedCapPct == null
      ? fmvCapPct
      : fmvAt((fmvPrior.pts60 ?? 0) * tmvDriftFactor, ageAtYear) ?? fmvCapPct;

    // Convert FMV% into raw dollars based on the projected cap ceiling for that year
    const fmvDollars = projectedCapCeiling * fmvCapPctAtYear;
    const annualSurplus = fmvDollars - navCapHit;

    // 8% annual financial discount: future cap space/penalties matter less today
    const timeDiscount = Math.pow(0.92, i);

    // gamma_RFA rewards organizations holding cost-controlled positive surplus.
    // Only apply the 1.25x premium when surplus is positive — amplifying a penalty
    // on young players who are slightly above-market double-counts the damage.
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
  const capEstablishment = clamp(
    Math.max(
      games / 40,
      safe(asset.baselinePtsPace ?? 0) / (isD ? 30 : 45),
    ),
    0.2,
    1.0,
  );
  const positiveCapComponent = Math.max(0, baselineCapComponent) * capEstablishment;
  const negativeCapComponent = Math.min(0, baselineCapComponent);

  // ── Team-Control Option Value ─────────────────────────────────
  // A multi-year deal on a pre-peak player is an option, not just a cash
  // flow: the downside is capped at a known cap hit while any breakout is
  // captured at no extra cost. Point-estimate surplus misses that
  // asymmetry completely — it's why 8 years of a 23-year-old was valuing
  // barely above 1 year of him. Scaled by the youth signal (so fringe
  // youth earn little), by the years of control that overlap the growth
  // window, and by cap establishment. Bounded ≈ 36 NAV for a max-signal
  // 20-year-old locked through his prime.
  const controlYears = clamp(Math.min(contractYears, peakAge + 2 - age), 0, 6);
  const teamControlValue = age <= peakAge
    ? youthProjectionSignal * controlYears * 6 * capEstablishment
    : 0;

  const capTotal      = safe(negativeCapComponent + positiveCapComponent + retainedBonus + teamControlValue);

  // ── Modern forward role taxonomy ──────────────────────────────
  const noivImpact = Math.round(noivBonus);
  const rosterTier = classifyRosterTier(toi, normalizedPts, evMdep, qocIdx, evToi, shToi, isD);
  let fArchetype: FArchetype = "";
  if (!isD) {
    fArchetype = classifyForwardArchetype({
      ptsPace: blendedPts,
      goalsPace: asset.goalsPace,
      assistsPace: asset.assistsPace,
      xGPace: asset.xGPace,
      offTotal,
      defTotal,
      avgTOI: toi,
      qocIndex: qocIdx,
      xgRelTM: blendedXgRel,
      noivImpact,
      ops,
      dps,
      ppPtsPace82: asset.ppPtsPace82,
      pkTimeShare: asset.pkTimeShare,
      baselineHits82: asset.baselineHits82,
      edgeSpeedMaxMph: asset.edgeSpeedMaxMph,
      edgeBurstsOver20: asset.edgeBurstsOver20,
    });
  }

  // ── Positional Scarcity Premium ───────────────────────────────
  const isTopPairD       = isD && toi > 22;
  const positionalPremium = asset.position === "C" ? 1.15 : isTopPairD ? 1.20 : 1.0;
  const mult             = asset.multiplier ?? 1.0;
  // Recorded in two steps so the breakdown can name them separately: a
  // user-set multiplier and the model's own scarcity view are different claims.
  const preMultiplier    = safe(trueMarketValue + capTotal);
  const multiplied       = safe(preMultiplier * mult);
  const rawTotal         = safe(multiplied * positionalPremium);

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
  // A franchise cornerstone is a PROVEN player — the floor must never fire on
  // a thin sample. A rolled-forward AHLer can carry an elite per-82 pace off a
  // 1-game line (displays as "1 GP · 1 PT"); without this gate that pace tripped
  // the floor and produced absurd +140 NAVs for depth players. Require a real
  // NHL season of games before any cornerstone floor applies.
  const provenFranchiseSample = (asset.games ?? 0) >= 40;
  const qualifiesEliteForward  = provenFranchiseSample && !isD && (pts >= 80 || (ops !== null && ops >= 5.0));
  const qualifiesEliteDefender =  provenFranchiseSample && isD && (pts >= 65 || (ops !== null && ops >= 4.0)) && toi > 22;

  // The floor was three FLAT tiers, so every qualifying star collapsed onto the
  // same number (a wall of identical "180"s in the box score). Give it a
  // production slope above the qualification bar so a 115-point player floors
  // higher than an 80-point one — distinct players, distinct floors. It stays a
  // pure floor (only ever raised above the base, never below), so it can't drag
  // anyone down.
  let franchiseFloor = -Infinity;
  if (qualifiesEliteForward) {
    const base = age <= 24 ? 260 : age <= 26 ? 220 : 180;
    const prodOver = Math.max(pts - 80, (ops ?? 0) * 15 - 80);
    franchiseFloor = base + clamp(prodOver, 0, 45) * 1.4;
  } else if (qualifiesEliteDefender) {
    const base = age <= 24 ? 240 : age <= 26 ? 200 : 160;
    const prodOver = Math.max(pts - 65, (ops ?? 0) * 15 - 65);
    franchiseFloor = base + clamp(prodOver, 0, 40) * 1.4;
  } else if (isShutdownTopPairD) {
    franchiseFloor = 130 + clamp((toi - 22) * 5 + shutdownDSignal, 0, 20);
  }

  const flooredTotal = Math.max(discountedTotal, franchiseFloor);

  // Thin-sample credibility. A player with a handful of NHL games cannot be
  // trusted at an elite valuation off an annualized pace — this is the recurring
  // "26yo AHLer worth +140" phantom, where a rolled roster carries a big per-82
  // pace on a 1-game line. Three exemptions keep this from touching real players:
  //   • draft pedigree — a genuine drafted prospect (slot + young, or an NHLe
  //     prospect pace), so real rookies are untouched;
  //   • established production — meaningful accumulated Point Shares (ops+dps),
  //     which an injured star carries from prior seasons but a 1-game phantom
  //     never has (this is the key tell — a phantom's Point Shares are ~0);
  //   • a real current sample (15+ games).
  // Otherwise the value regresses TOWARD a replacement anchor (not zero) in
  // proportion to the sample, so genuine low-value depth stays roughly put while
  // an inflated phantom collapses.
  const psTotal = (asset.ops ?? 0) + (asset.dps ?? 0);
  const hasDraftPedigree =
    (asset.draftOverall != null && asset.age <= 23) ||
    (asset.prospectPtsPace != null && asset.prospectPtsPace > 0);
  const hasEstablishedProduction = psTotal >= 2.0;
  const REPLACEMENT_NAV = 20;
  const sampleCredibility = hasDraftPedigree || hasEstablishedProduction || games >= 15
    ? 1
    : clamp(games / 15, 0.2, 1);
  const total = flooredTotal > REPLACEMENT_NAV
    ? REPLACEMENT_NAV + (flooredTotal - REPLACEMENT_NAV) * sampleCredibility
    : flooredTotal;

  // ── The accounting identity ───────────────────────────────────
  // Each row is the delta its step applied, so the sum is `total` by
  // construction rather than by luck. Note DEF carries `defTotal` — the
  // figure the total was built from — not the `defDisplay` rating returned
  // below for the STRAND rails.
  const stages: NavStage[] = [
    stage("off",  "On-ice offence",      offTotal),
    stage("def",  "On-ice defence",      defTotal),
    stage("age",  "Age curve",           ageTotal),
    stage("grav", "Gravity",             gravTotal),
    stage("cap",  "Contract surplus",    capTotal),
    stage("multiplier", "Asset multiplier",     multiplied - preMultiplier,     "adjustment"),
    stage("positional", "Positional scarcity",  rawTotal - multiplied,          "adjustment"),
    stage("development", "Development risk",    discountedTotal - rawTotal,     "adjustment"),
    stage("franchiseFloor", "Franchise floor",  flooredTotal - discountedTotal, "adjustment"),
    stage("credibility", "Sample credibility",  total - flooredTotal,           "adjustment"),
  ];

  return {
    total:  Math.round(total),
    off:    Math.round(offTotal),
    def:    Math.round(defDisplay),
    age:    Math.round(ageTotal),
    cap:    Math.round(capTotal),
    upside: Math.round(teamControlValue),
    grav:   Math.round(gravTotal),
    stages,
    fmvAav: currentFmvAav,
    fmvLow: Math.max(
      SKATER_LEAGUE_MIN_CAP_PCT * BASE_CAP_CEILING,
      currentFmvAav - SKATER_FMV_VALIDATION[fmvUnit].maeCapPct * BASE_CAP_CEILING,
    ),
    fmvHigh: currentFmvAav + SKATER_FMV_VALIDATION[fmvUnit].maeCapPct * BASE_CAP_CEILING,
    fmvClamped: fittedCapPct != null && skaterFmvDomainReport({
      pts60: fmvPrior.pts60,
      minutesPerGame: fmvPrior.minutesPerGame,
      age,
      isUfa: !isRFA,
      unit: fmvUnit,
    }).material,
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

  // An unproven prospect — however high he was drafted — is NOT a franchise
  // cornerstone yet: he carries more downside than a proven star (he can still
  // bust). So he can't be worth MORE than his own draft slot (certainty ≤ 1.0),
  // and he's capped below the franchise tier. This stops a 19-yo with 2 NHL
  // points reading as a 300-NAV asset (worth more than most established stars).
  const PROSPECT_CEILING = 240;
  const rawTotal = Math.max(pick.total * Math.min(certainty, 1.0) * nhle, productionFloor) * goalieDiscount;
  const total = Math.round(Math.min(rawTotal, PROSPECT_CEILING));
  return {
    total,
    off: 0, def: 0, age: 0, cap: 0,
    upside: Math.round(total * 0.70),
    stages: [stage("prospect", "Prospect value", total)],
  };
}

// ── Trade-request leverage discount ───────────────────────────────────────────
// A formal, public trade request strips the team of negotiating leverage — the
// whole league knows they have to move him, so offers come in light. Small
// haircut on positive value (8%, capped at 20 NAV). Negative-value contracts
// are unaffected: there is no leverage left to lose.
//
// This used to subtract the penalty from the `cap` component, under a comment
// claiming it did so "so the off/def/age/cap sum invariant holds" — an
// invariant the engine did not have, and a claim that quietly misattributed a
// negotiating haircut to the player's contract. It is its own row now.
export function applyTradeRequestDiscount(result: XNAVResult, asset: AssetInput): XNAVResult {
  if (asset.tradeBlockStatus !== "requested" || result.total <= 0) return result;
  const penalty = Math.round(Math.min(20, result.total * 0.08));
  if (penalty <= 0) return result;
  return {
    ...result,
    total: result.total - penalty,
    stages: [
      ...(result.stages ?? []),
      stage("leverage", "Trade-request leverage", -penalty, "adjustment"),
    ],
  };
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
