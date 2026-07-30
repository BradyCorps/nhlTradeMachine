// ── Which season a simulation is of (CX7c) ───────────────────────
//
// A Cup Run simulates three consecutive seasons, but every response stamped
// itself with the four static `SEASON` constants. So Year 3 of a run came back
// labelled the same season as Year 1, and the recap prompt then instructed
// Claude to write "an end-of-season recap of the PROJECTED 2026-27 season"
// over results from 2028-29 — while the same prompt's Cup Run preamble listed
// the prior years under their correct labels. The model was handed two
// incompatible accounts of when it was and asked to write one story.
//
// Four things move with the year, and they are all derivable from it:
//
//   season            the season being played
//   simulationMode    how that season is described
//   replaySeason      the completed season the stats baseline comes from —
//                     for Year 2 that is Year 1 of the run, not 2025-26
//   rosterMoveWindow  which offseason executed trades belong to
//
// Year 1 reproduces the `SEASON` constants exactly, which is asserted rather
// than assumed, so ordinary single-season play is untouched.

import { SEASON } from "./season-config";
import { seasonLabelForYear } from "./cup-run";

export interface SimSeasonIdentity {
  /** 1-based; 1 is the configured season and the default outside a run. */
  year: number;
  season: string;
  simulationMode: string;
  replaySeason: string;
  rosterMoveWindow: string;
}

/** The calendar year a season label starts in: "2027-28" → 2027. */
export function startYearOf(seasonLabel: string): number {
  return parseInt(seasonLabel.slice(0, 4), 10);
}

export function simSeasonIdentity(year: number = 1): SimSeasonIdentity {
  const safeYear = Number.isFinite(year) && year >= 1 ? Math.floor(year) : 1;
  const season = seasonLabelForYear(safeYear);
  return {
    year: safeYear,
    season,
    simulationMode: `${season} season projection`,
    // The season immediately before this one. Year 1 falls back to the
    // configured baseline, which is real data rather than a simulated year.
    replaySeason: safeYear === 1 ? SEASON.replaySeason : seasonLabelForYear(safeYear - 1),
    rosterMoveWindow: `${startYearOf(season)} offseason/opening-night`,
  };
}
