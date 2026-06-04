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
  // Each subsequent asset in a sorted package contributes: NAVᵢ × δⁱ
  decayProspect:  0.80,          // ≤23 yrs — independent developmental bets
  decayYoung:     0.65,          // 24-27 yrs — semi-independent
  decayPrime:     0.60,          // 28-31 yrs — full roster slot competition
  decayVeteran:   0.55,          // 32+  yrs — max displacement cost

  // Roster slot penalty per extra non-pick player beyond the anchor.
  // Recalibrated with corrected NAV scale (cap * 6, dps * 15):
  //   Prime NAV range is now 40-180 (was 200-800), so old μ=50 penalised
  //   depth players too harshly — packages of 3+ solid players went negative.
  penaltyProspect: 10,           // was 15
  penaltyYoung:    15,           // was 35
  penaltyPrime:    20,           // was 50
  penaltyVeteran:  35,           // was 60
} as const;

export const FRANCHISE = {
  threshold:  220,               // Elite franchise stars — recalibrated for 2.0 scale (McDavid ~286, Barkov ~245)
  megalodon:  380,               // Generational talent on elite deal — Makar-tier (~442), functionally untradeable
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