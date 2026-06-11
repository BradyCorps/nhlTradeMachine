// ── season-config.ts ──────────────────────────────────────────
// Single source of truth for every season-specific constant.
// Update this file each September when the new season begins.
// All other modules import from here — no magic numbers in logic files.

export const SEASON = {
  label:          "2026-27",
  simulationMode: "2025-26 season-start replay",
  replaySeason:   "2025-26",
  rosterMoveWindow: "2025 offseason/opening-night",
  apiSeasonId:    "20262027",
  capCeiling:     104.0,         // NHL salary cap ceiling ($M) — 2026-27 announced upper limit
  capFloor:       76.9,          // NHL salary cap floor ($M) — 2026-27 announced lower limit
  draftYear:      2027,          // Next tradeable draft class (2026 class is drafted — import via mock draft)
  mpSeason:       "2025",        // MoneyPuck URL path segment — last completed season is the stats baseline
  nhleSeasonId:   "20252026",    // NHL API roster fallback — keep at last completed season until 2026-27 rosters exist
} as const;

export const LEAGUE = {
  // All-situations league xGA/60, audited against 2022-26 MoneyPuck data:
  // 3.04 / 2.95 / 2.90 / 2.91 by season. The old 2.55 was a 5on5-scale number,
  // which (combined with a unit bug in the route's teamXga60 formula) pinned the
  // goalie defCorrection at +0.25 for all 32 teams.
  avgXga60:       2.92,          // League-average xGA/60 (MoneyPuck, all situations)
  avgXgf60:       2.92,          // League-average xGF/60 (symmetric by definition)
  // NOTE: gsaxSd is a tuned scaling knob, not the literal SD. Empirical SD of
  // starter GSAX-per-60-games (2022-26, n=184, ≥30 GP) is ~17.6 with mean +4.3
  // (MoneyPuck xG slightly over-predicts goals). The 8.0 value is calibrated
  // together with the Luongo asymptote and MIDPOINT_G — change all three or none.
  gsaxSd:         8.0,           // GSAX scaling constant (goalie normalisation)
  // NST all-situations HD chances against per 60 min (5v5+PP+PK combined).
  // Audited against 2022-26 NST team stats: range 10.8–16.4, mean ~13.1.
  avgHdca60:      12.0,          // League-average HD chances against per 60 min (NST all-sit, 2025-26)
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
