// ── expiry-ledger.ts ─────────────────────────────────────────────
//
// DATA-03: "Expiry counts name the league year; the 2027 UFA/RFA canary
// recognizes Ian Cole's one-year Chicago contract rather than showing an
// unexplained zero."
//
// THE BUG THIS EXISTS TO CLOSE
//
// `deriveContractStatus` (roster-assembly.ts) answers one question — is this
// player a pending free agent THIS offseason — by collapsing every contract
// that has not yet expired to `contractStatus: "SIGNED"`. That is the right
// read-time answer for "can I sign him right now," but it is the wrong shape
// for cap planning: a signed 2026-27 deal with a known 2027 expiry class is
// real information ("this club has a UFA decision coming"), and nothing
// upstream of this file kept it. Grouping by `contractStatus` alone makes
// every future offseason's free-agent class invisible until the year it
// actually happens — an "unexplained zero" for every year but the current
// one.
//
// This groups by the raw `expiryStatus`/`expiryYear` facts instead, which
// are known the moment a contract is entered, not only once it expires.

export interface ExpiringPlayerFacts {
  id: string;
  name: string;
  teamId?: string | null;
  /** Raw free-agency class — "UFA" | "RFA" | null. Not `contractStatus`. */
  expiryStatus?: string | null;
  /** Calendar year the current deal ends. Null means no known expiry. */
  expiryYear?: number | null;
}

export interface ExpiryYearCount {
  year: number;
  ufa: number;
  rfa: number;
  total: number;
  players: { id: string; name: string; teamId: string | null; status: "UFA" | "RFA" }[];
}

const normStatus = (raw: string | null | undefined): "UFA" | "RFA" | null => {
  if (!raw) return null;
  if (/ufa/i.test(raw)) return "UFA";
  if (/rfa/i.test(raw)) return "RFA";
  return null;
};

/**
 * Every player with a known free-agency class, grouped by the calendar year
 * their rights actually reach the market — whichever offseason that is, not
 * only the current one. A team's whole future expiry picture, not just this
 * year's.
 */
export function expiryCountsByYear(players: ExpiringPlayerFacts[]): Map<number, ExpiryYearCount> {
  const buckets = new Map<number, ExpiryYearCount>();

  for (const p of players) {
    const status = normStatus(p.expiryStatus);
    const year = typeof p.expiryYear === "number" && Number.isFinite(p.expiryYear) ? p.expiryYear : null;
    if (!status || year == null) continue;

    let bucket = buckets.get(year);
    if (!bucket) {
      bucket = { year, ufa: 0, rfa: 0, total: 0, players: [] };
      buckets.set(year, bucket);
    }
    if (status === "UFA") bucket.ufa++;
    else bucket.rfa++;
    bucket.total++;
    bucket.players.push({ id: p.id, name: p.name, teamId: p.teamId ?? null, status });
  }

  return new Map([...buckets.entries()].sort((a, b) => a[0] - b[0]));
}

/** The same rollup narrowed to one club — a team's expiry-by-year picture. */
export function teamExpiryCountsByYear(
  players: ExpiringPlayerFacts[],
  teamId: string,
): Map<number, ExpiryYearCount> {
  return expiryCountsByYear(players.filter((p) => p.teamId === teamId));
}
