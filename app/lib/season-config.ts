// ── season-config.ts ──────────────────────────────────────────
// Single source of truth for every season-specific constant.
// Update this file each September when the new season begins.
// All other modules import from here — no magic numbers in logic files.

export const SEASON = {
  label:          "2025-26",
  apiSeasonId:    "20252026",
  capCeiling:     88.0,          // NHL salary cap ceiling ($M)
  capFloor:       65.0,          // NHL salary cap floor ($M)
  draftYear:      2026,          // Current draft class year
  mpSeason:       "2025",        // MoneyPuck URL path segment
  nhleSeasonId:   "20252026",    // NHL API season identifier
} as const;

export const LEAGUE = {
  avgXga60:       2.55,          // League-average xGA/60 (MoneyPuck)
  avgXgf60:       2.55,          // League-average xGF/60
  gsaxSd:         8.0,           // GSAX standard deviation (goalie normalisation)
  peakAge:        27,            // Skater production peak (age curve inflection)
  goaliePeakAge:  30,            // Goalie peak age
} as const;

export const COMPRESSION = {
  // Age-tiered decay rates — prospects compress less than veterans.
  // Each asset at position i in a sorted package contributes: NAVᵢ × δᵢⁱ
  decayProspect:  0.80,          // ≤23 yrs — independent developmental bets
  decayYoung:     0.65,          // 24-27 yrs — semi-independent
  decayPrime:     0.60,          // 28-31 yrs — full roster slot competition
  decayVeteran:   0.55,          // 32+  yrs — max displacement cost

  // Roster slot penalty per extra non-pick player beyond the anchor
  penaltyProspect: 15,
  penaltyYoung:    35,
  penaltyPrime:    50,
  penaltyVeteran:  60,
} as const;

export const FRANCHISE = {
  threshold:  600,               // Elite stars — requires elite return to move
  megalodon:  900,               // Generational talents — functionally untradeable
} as const;

// Helpers derived from the above — avoids recalculating at call sites
export const ageDecayRate   = (age: number): number =>
  age <= 23 ? COMPRESSION.decayProspect
  : age <= 27 ? COMPRESSION.decayYoung
  : age <= 31 ? COMPRESSION.decayPrime
  : COMPRESSION.decayVeteran;

export const ageSlotPenalty = (age: number): number =>
  age <= 23 ? COMPRESSION.penaltyProspect
  : age <= 27 ? COMPRESSION.penaltyYoung
  : age <= 31 ? COMPRESSION.penaltyPrime
  : COMPRESSION.penaltyVeteran;