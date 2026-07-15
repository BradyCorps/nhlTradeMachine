export function navColor(nav: number): string {
  if (nav >= 160) return "var(--ledger-green)";
  if (nav >= 100) return "var(--ledger-navy)";
  if (nav >= 50)  return "var(--ledger-amber)";
  if (nav >= 0)   return "var(--ledger-ink-faint)";
  return "var(--ledger-red)";
}

export function fmtSigned(n: number, d = 1): string {
  const s = n.toFixed(d);
  return n > 0 ? `+${s}` : s;
}

export function formatCapHit(capHit: number, precision = 2): string {
  return `$${capHit.toFixed(precision)}M`;
}

export function seasonTotal(pace: number, games: number): number {
  return Math.round((pace / 82) * games);
}
