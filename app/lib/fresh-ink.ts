// ── Hot Off the Press — dated signings feed (PA8) ────────────────
// Orders freshly-signed extensions by when the ink actually dried. A
// signing date sorts newest-first; undated bundle extensions fall back to
// AAV so the strip is never empty before every deal carries a date.

export interface FreshInkPlayer {
  hasExtension?: boolean;
  extensionCapHit?: number | null;
  extensionSignedAt?: string | null; // ISO YYYY-MM-DD
}

export function orderFreshInk<T extends FreshInkPlayer>(players: T[], limit = 5): T[] {
  return players
    .filter(p => p.hasExtension && (p.extensionCapHit ?? 0) > 0)
    .slice() // don't mutate caller's array
    .sort((a, b) => {
      const da = a.extensionSignedAt;
      const db = b.extensionSignedAt;
      if (da && db && da !== db) return db.localeCompare(da); // newer date first
      if (da && !db) return -1;   // dated signings lead undated ones
      if (!da && db) return 1;
      return (b.extensionCapHit ?? 0) - (a.extensionCapHit ?? 0); // AAV fallback
    })
    .slice(0, limit);
}

// A compact recency label for a signing date ("Today", "3d ago", "Jul 18").
// Relative for the last week, absolute after that.
export function signedRecency(iso: string, now: number = Date.now()): string {
  const signed = new Date(`${iso}T00:00:00`);
  if (isNaN(signed.getTime())) return "";
  const days = Math.floor((now - signed.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return signed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
