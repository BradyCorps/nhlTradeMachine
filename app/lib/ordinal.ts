// ── ordinal.ts ───────────────────────────────────────────────────
// English ordinal suffix, done once so "83th"/"61th"/"33th" can't recur.
// 1→"1st", 2→"2nd", 3→"3rd", 11→"11th", 21→"21st", 83→"83rd".

export function ordinalSuffix(n: number): string {
  const t = n % 10, h = n % 100;
  if (t === 1 && h !== 11) return "st";
  if (t === 2 && h !== 12) return "nd";
  if (t === 3 && h !== 13) return "rd";
  return "th";
}

/** The number with its ordinal suffix, e.g. `ordinal(83)` → "83rd". */
export const ordinal = (n: number): string => `${n}${ordinalSuffix(n)}`;

/** `pluralize(1, "shot")` → "1 shot"; `pluralize(3, "shot")` → "3 shots". */
export const pluralize = (n: number, singular: string, plural = `${singular}s`): string =>
  `${n} ${n === 1 ? singular : plural}`;
