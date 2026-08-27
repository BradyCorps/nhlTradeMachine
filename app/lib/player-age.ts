// ── player-age.ts ────────────────────────────────────────────────────────
//
// Age is a fact about a birthdate AND a date, not a number captured once and
// left alone. Storing a static `age` column and never revisiting it is how
// Kevin Korchinski and Ethan Del Mastro (DATA-01) read as 18-year-olds two
// seasons after the draft they were actually 18 for — every consumer of that
// row inherited a number that stopped being true the day after it was
// written and nothing ever told them.
//
// The fix is not "pick a better constant." It is: derive age from a
// birthdate at read time whenever a birthdate is known, so the number is
// right today and stays right tomorrow without anyone re-running anything.
//
// When no birthdate is known, this does not invent one. It falls back, in
// order, to a previously recorded age (a real fact, just not a
// self-updating one) and then to a bound implied by another real fact — the
// draft year, which pins a floor (draft-eligible players are 18 that
// season) and lets true age float upward with elapsed seasons instead of
// freezing at the draft-day value forever. Only when none of that exists
// does this return null, because a guess with no anchor at all is not a
// fact and should not be presented as one.

/** Calendar age from an ISO birthdate, evaluated as of `asOf` (default now). */
export function deriveAge(birthDate: string | null | undefined, asOf: Date = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (!Number.isFinite(b.getTime())) return null;
  let age = asOf.getFullYear() - b.getFullYear();
  const monthDelta = asOf.getMonth() - b.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getDate() < b.getDate())) age--;
  return age >= 0 ? age : null;
}

/**
 * A floor-anchored estimate for a player with a known draft year but no
 * birthdate: 18 the draft year, one year older per season since. Not exact —
 * draft classes span ages 18-20 at the draft table — but it tracks time
 * passing, which a flat constant never does.
 */
export function estimateAgeFromDraftYear(
  draftYear: number | null | undefined,
  seasonStartYear: number,
): number | null {
  if (draftYear == null || !Number.isFinite(draftYear)) return null;
  return 18 + Math.max(0, seasonStartYear - draftYear);
}

/**
 * The single place a player's displayed age is decided. Birthdate wins when
 * present (it cannot go stale); a previously stored age is used only when no
 * birthdate exists; a draft-year estimate is the last fact-backed fallback.
 * Returns null rather than fabricate a number when nothing anchors one.
 */
export function resolvePlayerAge(opts: {
  birthDate?: string | null;
  storedAge?: number | null;
  draftYear?: number | null;
  seasonStartYear: number;
  asOf?: Date;
}): number | null {
  const fromBirthDate = deriveAge(opts.birthDate, opts.asOf);
  if (fromBirthDate != null) return fromBirthDate;
  if (typeof opts.storedAge === "number" && Number.isFinite(opts.storedAge)) return opts.storedAge;
  return estimateAgeFromDraftYear(opts.draftYear, opts.seasonStartYear);
}
