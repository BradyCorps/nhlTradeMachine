// ── Gravity Engine v2 ───────────────────────────────────────────
// Quantifies the "gravitational pull" a player exerts on the game —
// the McDavid/Curry effect where a star warps play around themselves,
// elevating linemates and dragging the puck into the offensive zone.
//
// v2 adds five analytical layers that move gravity from a derivative
// stat to a causal, predictive, and actionable metric:
//
//   1. Partner Independence — is the elevation real or borrowed from
//      elite linemates? Measured by multi-season NOIV stability and
//      (for D) pair-driver score across different partners.
//   2. Context Adjustment — corrects raw NOIV for quality of
//      competition, zone-start deployment, and PP inflation so two
//      players with the same NOIV but different contexts compare fairly.
//   3. Mechanism Decomposition — four sub-scores explaining WHERE
//      gravity comes from: space creation, transition control, pace
//      manipulation, and defensive warping.
//   4. Gravity Assist — invisible creation beyond the scoresheet:
//      the fraction of a player's team uplift NOT explained by his own
//      individual shooting. High = creates opportunities without credit.
//   5. Predictive Stability — year-over-year signal confidence.
//      High = the gravity reading should hold into next season.
//
// Output is a signed decimal (not a 0-100 index):
//   +0.40+  = elite gravity (McDavid, MacKinnon)
//   +0.15–0.40 = meaningful pull (legit first-liners who elevate)
//   0–0.15  = positive but modest
//   negative = black hole (linemates worse with you)

import type { Asset } from "./trade-types";

export interface GravityMechanism {
  spaceCreation:     number;  // 0–1: creating high-quality chances for others
  transitionControl: number;  // 0–1: carrying play through the neutral zone
  paceManipulation:  number;  // 0–1: driving shot-attempt frequency
  defensiveWarping:  number;  // 0–1: forcing opponent overcommitment
}

export interface GravityProfile {
  force:              number;
  noivLift:           number;
  zonePull:           number;
  creationAmplifier:  number;
  playerMass:         number;

  partnerIndependence: number;   // 0.5–1.4: linemate-isolation strength
  contextAdjustment:   number;   // net QoC / zone-start / PP correction multiplier
  gravityAssist:       number;   // 0–1: invisible creation score
  predictiveStability: number;   // 0–1: year-over-year signal confidence
  mechanisms:          GravityMechanism;

  tier:               GravityTier;
  description:        string;
}

export type GravityTier =
  | "SUPERMASSIVE"    // +0.50+: warps the entire game
  | "STAR"            // +0.35–0.50: elite gravitational field
  | "MAIN_SEQUENCE"   // +0.15–0.35: strong, steady pull
  | "SATELLITE"       // +0.05–0.15: detectable but modest
  | "ASTEROID"        // -0.05–+0.05: negligible field
  | "BLACK_HOLE";     // < -0.05: absorbs energy from linemates

const TIER_DESC: Record<GravityTier, string> = {
  SUPERMASSIVE:  "Warps the game around himself — linemates orbit",
  STAR:          "Elite gravitational field — elevates everyone nearby",
  MAIN_SEQUENCE: "Strong, steady pull — makes his line better",
  SATELLITE:     "Detectable pull — modest but real",
  ASTEROID:      "Negligible gravitational field",
  BLACK_HOLE:    "Absorbs energy — linemates produce less",
};

function classifyTier(force: number): GravityTier {
  if (force >= 0.50) return "SUPERMASSIVE";
  if (force >= 0.35) return "STAR";
  if (force >= 0.15) return "MAIN_SEQUENCE";
  if (force >= 0.05) return "SATELLITE";
  if (force >= -0.05) return "ASTEROID";
  return "BLACK_HOLE";
}

const LEAGUE_AVG_OZ = 0.50;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

// ═════════════════════════════════════════════════════════════════
// computeGravity — the full gravity engine
// ═════════════════════════════════════════════════════════════════
export function computeGravity(asset: Asset): GravityProfile | null {
  if (asset.position === "G" || asset.position === "Pick") return null;
  if (!asset.games || asset.games < 10) return null;

  const isD = asset.position === "D";
  const ptsPace = asset.ptsPace ?? 0;
  const toi = asset.avgTOI ?? 0;
  const games = asset.games;
  const assistsPace = asset.assistsPace ?? 0;
  const goalsPace = asset.goalsPace ?? 0;
  const ixg82 = asset.baselineIxg82 ?? 0;

  // ─── NOIV Lift ─────────────────────────────────────────────────
  const currentNoiv = asset.xgRelTM ?? 0;
  const baselineNoiv = asset.baselineXgRel != null
    ? asset.baselineXgRel * 100
    : null;
  const blendedNoiv = baselineNoiv !== null
    ? currentNoiv * 0.4 + baselineNoiv * 0.6
    : currentNoiv;
  const rawNoivLift = clamp(blendedNoiv / 15, -1, 1);

  // ─── Context Adjustment ────────────────────────────────────────
  // QoC: elevated NOIV against tougher competition is worth more
  const qocMult = asset.qocIndex != null
    ? 1.0 + clamp((asset.qocIndex - 50) / 250, -0.08, 0.12)
    : 1.0;

  // Zone starts: heavy DZ deployment suppresses raw NOIV
  const zoneStartMult = asset.dzPct != null
    ? 1.0 + clamp((asset.dzPct - 0.50) * 1.2, -0.06, 0.10)
    : 1.0;

  // PP inflation: a large PP-production share inflates on/off splits
  let ppMult = 1.0;
  if (asset.ppPtsPace82 != null && ptsPace > 10) {
    const ppShare = asset.ppPtsPace82 / ptsPace;
    if (ppShare > 0.40) {
      ppMult = 1.0 - clamp((ppShare - 0.40) * 0.20, 0, 0.08);
    }
  }

  const contextAdjustment = r2(qocMult * zoneStartMult * ppMult);
  const noivLift = clamp(rawNoivLift * contextAdjustment, -1, 1);

  // ─── Partner Independence ──────────────────────────────────────
  // Multi-season NOIV stability proxies for "real gravity vs borrowed
  // from elite linemates." If current and baseline agree in sign and
  // magnitude, the signal is partner-independent.
  let partnerIndependence = 1.0;

  if (baselineNoiv !== null && games >= 20) {
    const sameDirection = (currentNoiv >= 0) === (baselineNoiv >= 0);
    const maxMag = Math.max(Math.abs(currentNoiv), Math.abs(baselineNoiv), 1);
    const divergence = Math.abs(currentNoiv - baselineNoiv) / maxMag;

    partnerIndependence = sameDirection
      ? clamp(1.0 + (1 - divergence) * 0.20, 0.90, 1.20)
      : clamp(0.80 - divergence * 0.10, 0.55, 0.90);
  }

  // D-pair driver score: direct with/without measurement
  if (isD && asset.pairDriverScore != null) {
    const driverBoost = clamp(asset.pairDriverScore / 20, -0.12, 0.20);
    partnerIndependence = clamp(partnerIndependence + driverBoost, 0.5, 1.4);
  }

  // Dampen toward 1.0 for small samples
  if (games < 30) {
    partnerIndependence = 1.0 + (partnerIndependence - 1.0) * (games / 30);
  }

  // ─── Zone Pull ─────────────────────────────────────────────────
  const ozPct = asset.edgeOzPct ?? null;
  let zonePull = 0;
  if (ozPct !== null) {
    zonePull = clamp((ozPct - LEAGUE_AVG_OZ) * 5, -0.5, 0.75);
  } else if (asset.dzPct != null) {
    zonePull = clamp((0.50 - asset.dzPct) * 3, -0.3, 0.4);
  }

  // ─── Creation Amplifier ────────────────────────────────────────
  const ops = asset.ops ?? null;
  let creationAmplifier = 1.0;

  if (ops !== null && ptsPace > 0) {
    const opsImpliedLift = ops / 82;
    const noivPerGame = Math.abs(blendedNoiv) / 100;
    if (opsImpliedLift > 0.01) {
      const ratio = (noivPerGame + 0.01) / (opsImpliedLift + 0.01);
      const floor = blendedNoiv > 0 ? 1.0 : 0.5;
      creationAmplifier = clamp(ratio, floor, 2.0);
    }
  }

  if (assistsPace + goalsPace > 0) {
    const assistShare = assistsPace / (assistsPace + goalsPace);
    creationAmplifier *= (0.85 + assistShare * 0.30);
  }

  // ─── Player Mass ───────────────────────────────────────────────
  const toiScale = clamp(toi / 20, 0.3, 1.2);
  const productionScale = clamp(ptsPace / 70, 0.2, 1.5);
  const playerMass = toiScale * productionScale;

  // ═════════════════════════════════════════════════════════════════
  // Mechanism Decomposition — WHERE does the gravity come from?
  // ═════════════════════════════════════════════════════════════════

  // Space Creation: team xG uplift beyond the player's own shooting
  let spaceCreation = 0;
  if (blendedNoiv > 0 && ptsPace > 0) {
    const assistShare = assistsPace / Math.max(1, ptsPace);
    const selfShootRate = ixg82 / 82;
    const teamUplift = blendedNoiv / 100;
    spaceCreation = clamp(
      (teamUplift - selfShootRate * 0.3) * 8 + assistShare * 0.3,
      0, 1,
    );
  }

  // Transition Control: skating + zone dominance
  let transitionControl = 0;
  {
    let score = 0;
    if (asset.edgeSpeedMaxMph != null)
      score += clamp((asset.edgeSpeedMaxMph - 20) / 4, 0, 0.35);
    if (asset.edgeBurstsOver20 != null)
      score += clamp(asset.edgeBurstsOver20 / 80, 0, 0.35);
    if (ozPct !== null)
      score += clamp((ozPct - 0.48) * 4, 0, 0.30);
    transitionControl = clamp(score, 0, 1);
  }

  // Pace Manipulation: shot-generation rate relative to ice time
  let paceManipulation = 0;
  if (toi > 0) {
    const xgPerMin = (asset.xGPace ?? 0) / 82 / toi;
    paceManipulation = clamp(xgPerMin * 180, 0, 1);
  }

  // Defensive Warping: suppressing opponents while maintaining offense
  let defensiveWarping = 0;
  {
    const xgaSup = asset.xgaRelTM ?? 0;
    if (xgaSup < -0.5 && blendedNoiv > 0) {
      defensiveWarping = clamp(
        Math.abs(xgaSup) * 0.3 + (blendedNoiv / 15) * 0.3,
        0, 1,
      );
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // Gravity Assist — invisible creation beyond the scoresheet
  // ═════════════════════════════════════════════════════════════════
  // The fraction of a player's on-ice team uplift that is NOT explained
  // by his own individual shooting. A pure sniper (high ixG, low NOIV
  // surplus) scores ~0. A gravitational playmaker who lifts everyone
  // without needing the puck himself scores ~0.7–1.0.
  let gravityAssist = 0;
  if (blendedNoiv > 0.5) {
    const teamUplift = blendedNoiv / 100;
    const ixgRate = ixg82 / 82;
    if (teamUplift > 0.01) {
      const selfFraction = Math.min(1, ixgRate / (teamUplift * 3));
      const invisible = 1 - selfFraction;
      const assistShare = assistsPace / Math.max(1, assistsPace + goalsPace);
      const assistWeight = assistShare > 0.55 ? 1.15 : assistShare > 0.40 ? 1.0 : 0.85;
      gravityAssist = clamp(invisible * assistWeight, 0, 1);
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // Predictive Stability — year-over-year signal confidence
  // ═════════════════════════════════════════════════════════════════
  let predictiveStability = 0.50;
  if (baselineNoiv !== null) {
    const sameDir = (currentNoiv >= 0) === (baselineNoiv >= 0);
    const maxMag = Math.max(Math.abs(currentNoiv), Math.abs(baselineNoiv), 1);
    const agreement = 1 - Math.abs(currentNoiv - baselineNoiv) / maxMag;
    predictiveStability = sameDir
      ? clamp(0.50 + agreement * 0.45, 0.50, 0.95)
      : clamp(0.30 - (1 - agreement) * 0.15, 0.10, 0.45);

    // Near-zero NOIV = trivially stable — dampen confidence toward 0.50
    // so a flat-zero player doesn't show 100% "signal confidence"
    const signalStrength = Math.max(Math.abs(currentNoiv), Math.abs(baselineNoiv));
    if (signalStrength < 3) {
      const dampFactor = clamp(signalStrength / 3, 0.2, 1);
      predictiveStability = 0.50 + (predictiveStability - 0.50) * dampFactor;
    }
  }
  if (games >= 60) predictiveStability = Math.min(1, predictiveStability + 0.05);
  else if (games < 25) predictiveStability *= 0.75;

  // ═════════════════════════════════════════════════════════════════
  // Force Assembly
  // ═════════════════════════════════════════════════════════════════

  let burstBonus = 0;
  if (asset.edgeBurstsOver20 != null && asset.edgeBurstsOver20 >= 30)
    burstBonus += 0.04;
  if (asset.edgeSpeedMaxMph != null && asset.edgeSpeedMaxMph >= 22.0)
    burstBonus += 0.03;

  let suppressionBonus = 0;
  if (asset.xgaRelTM != null && asset.xgaRelTM < -1) {
    suppressionBonus = clamp(Math.abs(asset.xgaRelTM) * 0.015, 0, 0.08);
  }

  const gaBonus = gravityAssist > 0.5
    ? clamp((gravityAssist - 0.5) * 0.10, 0, 0.05)
    : 0;

  const rawForce =
    noivLift
    * (1 + zonePull)
    * creationAmplifier
    * playerMass
    * partnerIndependence
    + burstBonus
    + suppressionBonus
    + gaBonus;

  const force = r2(rawForce);
  const tier = classifyTier(force);

  return {
    force,
    noivLift:            r2(noivLift),
    zonePull:            r2(zonePull),
    creationAmplifier:   r2(creationAmplifier),
    playerMass:          r2(playerMass),
    partnerIndependence: r2(partnerIndependence),
    contextAdjustment,
    gravityAssist:       r2(gravityAssist),
    predictiveStability: r2(predictiveStability),
    mechanisms: {
      spaceCreation:     r2(spaceCreation),
      transitionControl: r2(transitionControl),
      paceManipulation:  r2(paceManipulation),
      defensiveWarping:  r2(defensiveWarping),
    },
    tier,
    description: TIER_DESC[tier],
  };
}

// Tier color for UI rendering
export function gravityTierColor(tier: GravityTier): string {
  switch (tier) {
    case "SUPERMASSIVE":  return "var(--ledger-green)";
    case "STAR":          return "var(--ledger-green)";
    case "MAIN_SEQUENCE": return "var(--ledger-amber, #d4a017)";
    case "SATELLITE":     return "var(--ledger-ink-faint)";
    case "ASTEROID":      return "var(--ledger-ink-faint)";
    case "BLACK_HOLE":    return "var(--ledger-red)";
  }
}
