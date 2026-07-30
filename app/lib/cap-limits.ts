// ── Payroll range compliance (CXH6) ──────────────────────────────
//
// The audit checked the two ends of the payroll range in three different ways,
// and only the ceiling was done properly.
//
//   • The CEILING was checked for both clubs. The FLOOR was checked for the
//     home team only — so a partner taking on nothing and shipping out salary
//     could be dropped under the floor and the audit said nothing. The rule is
//     the league's, not the user's; it applies to whoever the trade moves.
//
//   • The ceiling used the LIVE, admin-overridable value; the floor was the
//     hard-coded `SEASON.capFloor`. There is a `cap_floor` override in the
//     admin settings and the trade audit silently ignored it, so raising the
//     ceiling for a what-if scenario left the floor behind and the two ends of
//     the range described different leagues.
//
//   • The floor only fired when the club shed more than $3M (`capDelta < -3`).
//     A club sitting just above the floor that sheds $2M is below the floor,
//     and was cleared. The threshold was standing in for a real question —
//     "did this trade cause it?" — which is asked directly here instead.
//
// All of it collapses to: compute each club's payroll after the trade, and
// compare it to both ends of the same range.

export interface CapLimits {
  ceiling: number;
  floor: number;
}

export interface SidePayroll {
  teamName: string;
  /** Which club this is, for the flag's `vetoesSide`. */
  side: 0 | 1;
  /** Cap space before the trade. */
  capSpaceBefore: number;
  /** Change in cap USED — positive means taking salary on. */
  capDelta: number;
}

export interface CapBreach {
  kind: "CEILING" | "FLOOR";
  side: 0 | 1;
  teamName: string;
  /** Dollars past the limit, always positive. */
  amount: number;
  /** Payroll before and after, for an explanation that can be checked. */
  usedBefore: number;
  usedAfter: number;
  /** False when the club was already outside the range before this trade. */
  causedByTrade: boolean;
}

/** Payroll used before the trade. `capSpace` is defined against the ceiling. */
export function capUsedBefore(capSpaceBefore: number, ceiling: number): number {
  return ceiling - capSpaceBefore;
}

/**
 * Every way this trade puts a club outside the payroll range.
 *
 * A club can only breach one end, so at most one breach per side — but both
 * sides are examined, with the same limits and the same rule.
 */
export function findCapBreaches(sides: SidePayroll[], limits: CapLimits): CapBreach[] {
  const breaches: CapBreach[] = [];

  for (const s of sides) {
    const usedBefore = capUsedBefore(s.capSpaceBefore, limits.ceiling);
    const usedAfter = usedBefore + s.capDelta;

    if (usedAfter > limits.ceiling) {
      breaches.push({
        kind: "CEILING", side: s.side, teamName: s.teamName,
        amount: usedAfter - limits.ceiling,
        usedBefore, usedAfter,
        causedByTrade: usedBefore <= limits.ceiling,
      });
      continue;
    }

    // Only a trade that REDUCES payroll can push a club under the floor.
    // Without this, a club already below the floor — LTIR, a thin roster, a
    // data gap — would be flagged on every trade it made, including the ones
    // adding salary to climb back out.
    if (usedAfter < limits.floor && s.capDelta < 0) {
      breaches.push({
        kind: "FLOOR", side: s.side, teamName: s.teamName,
        amount: limits.floor - usedAfter,
        usedBefore, usedAfter,
        causedByTrade: usedBefore >= limits.floor,
      });
    }
  }

  return breaches;
}

/** The sentence shown to the user, phrased to what actually happened. */
export function describeBreach(breach: CapBreach): string {
  const money = `$${breach.amount.toFixed(2)}M`;
  if (breach.kind === "CEILING") {
    return breach.causedByTrade
      ? `This trade puts ${breach.teamName} ${money} over the ceiling.`
      : `${breach.teamName} is already over the ceiling and this trade adds ${money} more.`;
  }
  return breach.causedByTrade
    ? `This trade drops ${breach.teamName} ${money} below the cap floor.`
    : `${breach.teamName} is already under the cap floor and this trade takes ${money} more off the payroll.`;
}
