// ── Splitting an 82-game season between two goaltenders ──────────
//
// The sim projected a starter and stopped there, so every season recap showed
// one goalie and an implied 34 unaccounted starts. A backup who plays a third
// of the year is not a rounding error — he is the difference between a club
// surviving a starter's cold February and not, and the roster already carries
// him.
//
// The starter's own start count is drawn by the sim; this only decides what is
// left and who absorbs it, so adding the backup cannot perturb any starter
// projection that a given seed already produced.

/** Games in a regular season. */
export const SEASON_GAMES = 82;

/**
 * Nobody starts all 82. The modern workhorse tops out around 64-67, so the
 * ceiling leaves the backup a real workload rather than inventing an iron man.
 */
export const MAX_STARTER_STARTS = 68;

/**
 * A starter starts more than his backup — that is what the word means. Without
 * this floor a low draw handed the "backup" 68 games and inverted the tandem,
 * which a test caught.
 */
export const MIN_STARTER_STARTS = 42;

/** Derived, not an independent cap: the two must always sum to the season. */
export const MIN_BACKUP_STARTS = SEASON_GAMES - MAX_STARTER_STARTS;

export interface GoalieWorkload {
  starterStarts: number;
  backupStarts: number;
}

/**
 * How an 82-game season divides between the starter and his backup.
 *
 * `hasBackup: false` (a roster carrying a single goaltender) gives every start
 * to the starter — the alternative is inventing a name the roster does not
 * have. That is the one case where a goalie can exceed `MAX_STARTER_STARTS`,
 * and it is a signal the roster is short, not a projection.
 */
export function splitGoalieStarts(
  projectedStarterStarts: number,
  hasBackup = true,
): GoalieWorkload {
  if (!hasBackup) {
    return { starterStarts: SEASON_GAMES, backupStarts: 0 };
  }

  const drawn = Math.round(
    Number.isFinite(projectedStarterStarts) ? projectedStarterStarts : MIN_STARTER_STARTS,
  );
  const starterStarts = Math.min(MAX_STARTER_STARTS, Math.max(MIN_STARTER_STARTS, drawn));

  return { starterStarts, backupStarts: SEASON_GAMES - starterStarts };
}
