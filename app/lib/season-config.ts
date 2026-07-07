// ── season-config.ts ──────────────────────────────────────────
// Single source of truth for every season-specific constant.
// Update this file each September when the new season begins.
// All other modules import from here — no magic numbers in logic files.

export const SEASON = {
  label:          "2026-27",
  simulationMode: "2026-27 season projection",
  replaySeason:   "2025-26",   // stats baseline = last completed season; the PROJECTED season is `label`
  rosterMoveWindow: "2026 offseason/opening-night",
  apiSeasonId:    "20262027",
  capCeiling:     104.0,         // NHL salary cap ceiling ($M) — 2026-27 announced upper limit
  capFloor:       76.9,          // NHL salary cap floor ($M) — 2026-27 announced lower limit
  draftYear:      2026,          // 2026 draft is NOT yet played — picks remain tradeable; run Draft Night to project it
  mpSeason:       "2025",        // MoneyPuck URL path segment — last completed season is the stats baseline
  nhleSeasonId:   "20252026",    // NHL API roster fallback — keep at last completed season until 2026-27 rosters exist
  latestCompleted: {
    season: "2025-26",
    stanleyCupChampion: { teamId: "CAR", teamName: "Carolina Hurricanes" },
    connSmythe: { name: "Jordan Staal", teamId: "CAR", teamName: "Carolina Hurricanes" },
  },
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

// ── Cup Run cap escalation ────────────────────────────────────
// The real NHL cap rises sharply over the next three seasons (PuckPedia).
// A Cup Run rolls the league forward one season per year, so the ceiling
// (and floor) must step up too — otherwise teams whose salaries grew are
// measured against a stale $104M and show as illegally over the cap.
//   Year 1 = 2026-27, Year 2 = 2027-28, Year 3 = 2028-29.
export const CAP_BY_CUP_YEAR: Record<number, { ceiling: number; floor: number }> = {
  1: { ceiling: 104.0, floor: 76.9 },
  2: { ceiling: 113.5, floor: 83.9 },
  3: { ceiling: 123.0, floor: 83.9 },
};

/** Cap ceiling/floor for a Cup Run year (holds the last known values past year 3). */
export const capForCupYear = (year: number): { ceiling: number; floor: number } =>
  CAP_BY_CUP_YEAR[year] ?? CAP_BY_CUP_YEAR[3];

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
