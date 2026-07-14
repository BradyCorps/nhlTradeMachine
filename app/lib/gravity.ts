// ── Gravity Engine ──────────────────────────────────────────────
// Quantifies the "gravitational pull" a player exerts on the game —
// the McDavid/Curry effect where a star warps play around themselves,
// elevating linemates and dragging the puck into the offensive zone.
//
// Rooted in real physics: F = G × m₁ × m₂ / d²
//   m₁ = player's star power (production, talent, explosiveness)
//   m₂ = the play / offensive opportunity (what they pull toward them)
//   d² = zone distance (how far from the OZ the play typically sits)
//   F  = the net gravitational force — signed, continuous, interpretable
//
// Output is a signed decimal (not a 0-100 index):
//   +0.40+  = elite gravity (McDavid, MacKinnon)
//   +0.15–0.40 = meaningful pull (legit first-liners who elevate)
//   0–0.15  = positive but modest
//   negative = black hole (linemates worse with you)
//
// Three components:
//   1. NOIV Lift (base force): how much linemates improve with you
//   2. Zone Pull (1/d²): how much you drag play into the OZ
//   3. Creation Amplifier: the gap between your own production and
//      what you create for others (gravity vs mere talent)

import type { Asset } from "./trade-types";

export interface GravityProfile {
  force:              number;   // the final gravity value — signed decimal
  noivLift:           number;   // Component 1: linemate differential
  zonePull:           number;   // Component 2: OZ pull factor
  creationAmplifier:  number;   // Component 3: creation vs self-production
  playerMass:         number;   // m₁: star power input
  tier:               GravityTier;
  description:        string;   // one-line read of the force
}

export type GravityTier =
  | "SUPERMASSIVE"    // +0.50+: warps the entire game
  | "STAR"            // +0.35–0.50: elite gravitational field
  | "MAIN_SEQUENCE"   // +0.15–0.35: strong, steady pull
  | "DWARF"           // +0.05–0.15: detectable but modest
  | "ASTEROID"        // -0.05–+0.05: negligible field
  | "BLACK_HOLE";     // < -0.05: absorbs energy from linemates

const TIER_DESC: Record<GravityTier, string> = {
  SUPERMASSIVE:  "Warps the game around himself — linemates orbit",
  STAR:          "Elite gravitational field — elevates everyone nearby",
  MAIN_SEQUENCE: "Strong, steady pull — makes his line better",
  DWARF:         "Detectable pull — modest but real",
  ASTEROID:      "Negligible gravitational field",
  BLACK_HOLE:    "Absorbs energy — linemates produce less",
};

function classifyTier(force: number): GravityTier {
  if (force >= 0.50) return "SUPERMASSIVE";
  if (force >= 0.35) return "STAR";
  if (force >= 0.15) return "MAIN_SEQUENCE";
  if (force >= 0.05) return "DWARF";
  if (force >= -0.05) return "ASTEROID";
  return "BLACK_HOLE";
}

// League-average OZ% for context (NHL ~50% by definition in 5v5)
const LEAGUE_AVG_OZ = 0.50;

// Clamp to a range
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeGravity(asset: Asset): GravityProfile | null {
  if (asset.position === "G" || asset.position === "Pick") return null;
  if (!asset.games || asset.games < 10) return null;

  // ── Component 1: NOIV Lift (the base gravitational force) ──────
  // xgRelTM is the player's on-ice xG% minus off-ice xG%, in pct pts.
  // Range: roughly -12 to +12. An elite line-driver sits at +5 to +10.
  // We blend with baseline for stability (same blend ratio as X-NAV).
  const currentNoiv = asset.xgRelTM ?? 0;
  const baselineNoiv = asset.baselineXgRel != null ? asset.baselineXgRel * 100 : null;
  const blendedNoiv = baselineNoiv !== null
    ? currentNoiv * 0.4 + baselineNoiv * 0.6
    : currentNoiv;

  // Normalize to a -1 to +1 scale. Divisor=15 so that only a truly
  // transcendent NOIV (blended ≥15) maxes out — prevents the top of
  // the league from all reading +1.00 and losing differentiation.
  const noivLift = clamp(blendedNoiv / 15, -1, 1);

  // ── Component 2: Zone Pull (the 1/d² term) ────────────────────
  // How much the player drags play into the OZ relative to league avg.
  // edgeOzPct is the player's OZ time share (0-1). A gravity player
  // pushes this well above 0.50.
  const ozPct = asset.edgeOzPct ?? null;
  let zonePull = 0;
  if (ozPct !== null) {
    // Delta from league average, scaled so +10% OZ = +0.5 zone pull
    zonePull = clamp((ozPct - LEAGUE_AVG_OZ) * 5, -0.5, 0.75);
  } else {
    // No EDGE data: use defensive zone start share as a proxy.
    // Low dzPct = starts in the OZ more = player is trusted offensively.
    const dzPct = asset.dzPct ?? null;
    if (dzPct !== null) {
      zonePull = clamp((0.50 - dzPct) * 3, -0.3, 0.4);
    }
  }

  // ── Component 3: Creation Amplifier ────────────────────────────
  // Gravity vs mere talent: does the player lift others or just produce?
  // Measured by the gap between NOIV (team uplift) and individual
  // production (OPS). A player with high OPS but low NOIV is a scorer.
  // A player with high NOIV relative to OPS is a creator — gravity.
  const ops = asset.ops ?? null;
  const ptsPace = asset.ptsPace ?? 0;
  let creationAmplifier = 1.0;

  if (ops !== null && ptsPace > 0) {
    // OPS measures individual offensive production (point shares).
    // NOIV measures how the TEAM improves with you on ice.
    // If NOIV >> OPS-implied-lift, you're creating through gravity.
    const opsImpliedLift = ops / 82; // normalize to per-game
    const noivPerGame = Math.abs(blendedNoiv) / 100;
    if (opsImpliedLift > 0.01) {
      const ratio = (noivPerGame + 0.01) / (opsImpliedLift + 0.01);
      // When NOIV is positive, creation only amplifies (floor at 1.0).
      // A player who produces AND lifts linemates (McDavid) shouldn't be
      // penalized for high individual production — the amplifier rewards
      // disproportionate creators without punishing complete players.
      // When NOIV is negative, allow the full range so black holes
      // (high production but linemates worse) are correctly exposed.
      const floor = blendedNoiv > 0 ? 1.0 : 0.5;
      creationAmplifier = clamp(ratio, floor, 2.0);
    }
  }

  // Assist share as a secondary amplifier — playmakers who set up
  // others are more gravitational than pure finishers
  const assistsPace = asset.assistsPace ?? 0;
  const goalsPace = asset.goalsPace ?? 0;
  if (assistsPace + goalsPace > 0) {
    const assistShare = assistsPace / (assistsPace + goalsPace);
    // Assist-heavy players get a small creation boost
    creationAmplifier *= (0.85 + assistShare * 0.30);
  }

  // ── Player Mass (m₁) — star power scaling ─────────────────────
  // The raw components above can give a big number to a 4th-liner with
  // fluky splits. Scale by the player's actual star power so gravity
  // requires BOTH the talent to generate the field AND the impact data.
  const toi = asset.avgTOI ?? 0;
  const toiScale = clamp(toi / 20, 0.3, 1.2); // 20 min = baseline

  const productionScale = clamp(ptsPace / 70, 0.2, 1.5); // 70 pts/82 = baseline

  // Explosiveness bonus — burst/speed creates transition opportunities
  let burstBonus = 0;
  if (asset.edgeBurstsOver20 != null && asset.edgeBurstsOver20 >= 30) {
    burstBonus += 0.04;
  }
  if (asset.edgeSpeedMaxMph != null && asset.edgeSpeedMaxMph >= 22.0) {
    burstBonus += 0.03;
  }

  const playerMass = toiScale * productionScale;

  // ── Assemble: F = noivLift × (1 + zonePull) × creationAmplifier × mass
  const rawForce = noivLift * (1 + zonePull) * creationAmplifier * playerMass + burstBonus;

  // Defensive suppression bonus — a gravity player who also suppresses
  // chances against (negative xgaRelTM = fewer chances with you on ice)
  const xgaSuppression = asset.xgaRelTM ?? null;
  let suppressionBonus = 0;
  if (xgaSuppression !== null && xgaSuppression < -1) {
    suppressionBonus = clamp(Math.abs(xgaSuppression) * 0.015, 0, 0.08);
  }

  const force = Math.round((rawForce + suppressionBonus) * 100) / 100;
  const tier = classifyTier(force);

  return {
    force,
    noivLift: Math.round(noivLift * 100) / 100,
    zonePull: Math.round(zonePull * 100) / 100,
    creationAmplifier: Math.round(creationAmplifier * 100) / 100,
    playerMass: Math.round(playerMass * 100) / 100,
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
    case "DWARF":         return "var(--ledger-ink-faint)";
    case "ASTEROID":      return "var(--ledger-ink-faint)";
    case "BLACK_HOLE":    return "var(--ledger-red)";
  }
}
