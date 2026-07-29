// ── Hot Off the Press — dated signings feed (PA8) ────────────────
// Orders freshly-signed extensions by when the ink actually dried. A
// signing date sorts newest-first; undated bundle extensions fall back to
// AAV so the strip is never empty before every deal carries a date.

export interface FreshInkPlayer {
  hasExtension?: boolean;
  extensionCapHit?: number | null;
  extensionYears?: number | null;
  extensionSignedAt?: string | null; // ISO YYYY-MM-DD
  /** The live deal, for a signing that has since taken effect. */
  capHit?: number | null;
  yearsRemaining?: number | null;
}

// A signing does not stop being news the day it begins. An extension is future
// money only until the contract it followed runs out; after that it IS the
// contract, and the roster carries it as capHit/yearsRemaining with the
// extension fields cleared so the valuation engine does not read the live AAV
// as a raise still to come. The feed reports the deal either way, so it reads
// whichever pair currently holds it.
export function signedAav(p: FreshInkPlayer): number {
  const ext = p.extensionCapHit ?? 0;
  return ext > 0 ? ext : (p.capHit ?? 0);
}

export function signedTerm(p: FreshInkPlayer): number | null {
  const ext = p.extensionCapHit ?? 0;
  const term = ext > 0 ? p.extensionYears : p.yearsRemaining;
  return term != null && term > 0 ? term : null;
}

export function orderFreshInk<T extends FreshInkPlayer>(players: T[], limit = 5): T[] {
  return players
    // A signing date is itself the claim that a deal was signed, and it is the
    // only marker left once the extension has begun.
    .filter(p => (p.hasExtension || p.extensionSignedAt) && signedAav(p) > 0)
    .slice() // don't mutate caller's array
    .sort((a, b) => {
      const da = a.extensionSignedAt;
      const db = b.extensionSignedAt;
      if (da && db && da !== db) return db.localeCompare(da); // newer date first
      if (da && !db) return -1;   // dated signings lead undated ones
      if (!da && db) return 1;
      return signedAav(b) - signedAav(a); // AAV fallback
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
