// ── Contract expiry runs on the simulated clock, not the wall clock ──
//
// Asset cards computed a deal's final season as
// `new Date().getFullYear() + yearsRemaining`. Two things are wrong with that.
//
// The app does not project the calendar year — it projects `SEASON.label`
// ("2026-27"). Those agree today only by coincidence, and they part company
// every January: on 2 January 2027 the wall clock says 2027 while the app is
// still simulating the 2026-27 season, so every contract on every card gains a
// phantom year overnight.
//
// And in a Cup Run the user is three seasons deep into a simulated future the
// calendar knows nothing about. Year 3 of a run started in 2026-27 is 2028-29;
// the wall clock still reads 2026.
//
// Both are the same mistake: reading real time inside a simulation.

import { SEASON } from "@/app/lib/season-config";

/** First calendar year of `SEASON.label` — 2026 for "2026-27". */
export const SEASON_START_YEAR = parseInt(SEASON.label.slice(0, 4), 10);

/**
 * The calendar year a contract's final season begins in.
 *
 * `cupYear` is the Cup Run year (1-3); omit it outside a run, where year 1 is
 * the only season in play. A contract with one year left expires at the end of
 * the current season, so `yearsRemaining` of 1 returns the current season's
 * start year — not the next one.
 */
export function contractExpiryYear(
  yearsRemaining: number | null | undefined,
  cupYear?: number | null,
): number {
  const years = Math.max(1, Math.round(yearsRemaining ?? 1));
  const runOffset = Math.max(1, Math.round(cupYear ?? 1)) - 1;
  return SEASON_START_YEAR + runOffset + years - 1;
}

/**
 * The same expiry as a season label — "2028-29" rather than 2028. Cards show
 * the year alone; anywhere a season is named should use this so a contract and
 * the Cup Run header can't disagree about what year it is.
 */
export function contractExpirySeasonLabel(
  yearsRemaining: number | null | undefined,
  cupYear?: number | null,
): string {
  const start = contractExpiryYear(yearsRemaining, cupYear);
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
