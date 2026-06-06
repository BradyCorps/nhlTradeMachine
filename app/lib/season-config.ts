// ── season-config.ts ──────────────────────────────────────────
// Single source of truth for every season-specific constant.
// Update this file each September when the new season begins.
// All other modules import from here — no magic numbers in logic files.

export const SEASON = {
  label:          "2025-26",
  apiSeasonId:    "20252026",
  capCeiling:     95.5,          // NHL salary cap ceiling ($M)
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
  decayProspect:  0.80,
  decayYoung:     0.65,
  decayPrime:     0.60,
  decayVeteran:   0.55,
  penaltyProspect: 10,
  penaltyYoung:    15,
  penaltyPrime:    20,
  penaltyVeteran:  35,
} as const;

export const FRANCHISE = {
  threshold:  160,
  megalodon:  380,
} as const;

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