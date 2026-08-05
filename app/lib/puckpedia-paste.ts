// ── puckpedia-paste.ts ───────────────────────────────────────────
//
// Parse a signings list copied straight out of Sportsnet's transactions page
// (their contract data comes from PuckPedia) into contract rows.
//
// WHY A PARSER AND NOT A SCRAPER
//
// CapWages sell an API and started refusing the scraper, so contracts are
// hand-maintained now. Hand-maintained does not have to mean hand-typed: a
// human can select a page, copy it, and paste it here. Nobody's server is
// touched, nobody's terms are strained, and the operator is doing what any
// reader may do with a page they are looking at.
//
// WHAT THE PASTE LOOKS LIKE
//
//     JUL 31, 2026          <- a date header; applies to everything BELOW it
//     SJSSJS                <- team, often doubled by the copy
//     Collin Graf
//     F                     <- position
//     Collin Graf           <- the name again
//     AGE23
//     CAP HIT$4,250,000
//     LENGTH3 yrs
//     TOTAL$12,750,000
//     % OF CAP4.09%
//     TYPERFA
//     CLAUSE
//     Details               <- noise
//
// THE FORMAT CHECKS ITSELF, SO THIS DOES TOO
//
// Three redundancies are free, and each catches a different mis-parse:
//
//   * the name appears twice — a mismatch means the field order slipped;
//   * cap hit × length should equal the total — catches a misread figure;
//   * cap hit ÷ percent-of-cap recovers the CAP CEILING, which both sanity
//     checks the numbers and reveals which season the deal starts in. Celebrini
//     at 16.56% of $18.8M implies a $113.5M ceiling, which is 2027-28, not this
//     season. That is real information and it is worth surfacing rather than
//     rounding away.
//
// Nothing here writes. It returns rows and complaints; the caller decides.

import { SEASON_START_YEAR } from "@/app/lib/contract-expiry";

/** Cap ceilings by the season a deal begins, for reading the percentage back. */
const CEILINGS: { seasonId: string; label: string; ceiling: number }[] = [
  { seasonId: "20242025", label: "2024-25", ceiling: 88.0 },
  { seasonId: "20252026", label: "2025-26", ceiling: 95.5 },
  { seasonId: "20262027", label: "2026-27", ceiling: 104.0 },
  { seasonId: "20272028", label: "2027-28", ceiling: 113.5 },
  { seasonId: "20282029", label: "2028-29", ceiling: 123.0 },
];

export type SigningType = "UFA" | "RFA" | "ELC" | "EXT" | "";

export interface ParsedSigning {
  name: string;
  team: string;
  /** "D" and "G" are unambiguous. A PuckPedia "F" is not, so it is left blank. */
  position: "D" | "G" | "";
  /** What the source called it, kept even when we will not use it. */
  rawPosition: string;
  age: number | null;
  capHit: number;
  years: number;
  total: number | null;
  pctOfCap: number | null;
  type: SigningType;
  clause: string;
  /** Date header this row appeared under, if the paste included one. */
  signDate: string | null;
  /** Season the deal starts, inferred from cap hit ÷ percent of cap. */
  impliedSeason: string | null;
  /** Anything that did not reconcile. A row with warnings still parses. */
  warnings: string[];
}

export interface PasteResult {
  signings: ParsedSigning[];
  /** Lines that belonged to no record, so nothing is silently swallowed. */
  skipped: string[];
  /** True when at least one row failed a self-check. */
  needsReview: boolean;
}

const MONEY = /\$\s*([\d,]+(?:\.\d+)?)/;
const DATE_LINE = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2},\s*\d{4}$/i;
const NOISE = new Set(["details", "clause", "sign", "signed", "re-signed", ""]);

const money = (s: string): number | null => {
  const m = s.match(MONEY);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};

/**
 * `SJSSJS` → `SJS`. The copy doubles the team cell for most rows and not all,
 * so this halves anything that is exactly itself twice.
 */
export function normaliseTeam(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (t.length % 2 === 0) {
    const half = t.slice(0, t.length / 2);
    if (half === t.slice(t.length / 2)) return half;
  }
  return t;
}

const isTeamCode = (s: string) => /^[A-Z]{2,8}$/.test(s.trim()) && normaliseTeam(s).length <= 4;

/** Strip a run-on label like `CAP HIT$850,000` or `AGE23`. */
const after = (line: string, label: string): string =>
  line.slice(label.length).trim();

/**
 * Which season's ceiling the percentage implies.
 *
 * Returns null when nothing is within a point of it, which is itself a useful
 * complaint — it means the cap hit and the percentage disagree.
 */
export function seasonFromPct(capHit: number, pctOfCap: number): string | null {
  if (!(pctOfCap > 0)) return null;
  const implied = capHit / 1_000_000 / (pctOfCap / 100);
  let best: { label: string; gap: number } | null = null;
  for (const c of CEILINGS) {
    const gap = Math.abs(c.ceiling - implied);
    if (!best || gap < best.gap) best = { label: c.label, gap };
  }
  return best && best.gap <= 1.5 ? best.label : null;
}

export function parsePuckPediaPaste(text: string): PasteResult {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const signings: ParsedSigning[] = [];
  const skipped: string[] = [];

  let currentDate: string | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (NOISE.has(line.toLowerCase())) { i++; continue; }
    if (DATE_LINE.test(line)) { currentDate = line.toUpperCase(); i++; continue; }

    // A record starts at a team code followed by a name.
    if (!isTeamCode(line) || i + 1 >= lines.length) {
      if (line) skipped.push(line);
      i++;
      continue;
    }

    const team = normaliseTeam(line);
    const name = lines[i + 1];
    if (!name || isTeamCode(name)) { skipped.push(line); i++; continue; }

    // Consume until the next team code or date header — that is this record.
    let j = i + 2;
    const body: string[] = [];
    while (j < lines.length && !DATE_LINE.test(lines[j]) &&
           !(isTeamCode(lines[j]) && j + 1 < lines.length && lines[j + 1] && !isTeamCode(lines[j + 1]))) {
      body.push(lines[j]);
      j++;
    }

    const warnings: string[] = [];
    let rawPosition = "", age: number | null = null, capHit: number | null = null;
    let years: number | null = null, total: number | null = null;
    let pctOfCap: number | null = null, type: SigningType = "", clause = "";
    let repeatedName: string | null = null;

    for (const b of body) {
      const upper = b.toUpperCase();
      if (/^[A-Z]$/.test(b) && !rawPosition) { rawPosition = b; continue; }
      if (upper.startsWith("AGE")) { const n = Number(after(b, "AGE")); if (isFinite(n)) age = n; continue; }
      if (upper.startsWith("CAP HIT")) { capHit = money(b); continue; }
      if (upper.startsWith("LENGTH")) { const n = parseInt(after(b, "LENGTH"), 10); if (isFinite(n)) years = n; continue; }
      if (upper.startsWith("TOTAL")) { total = money(b); continue; }
      if (upper.startsWith("% OF CAP")) { const n = parseFloat(after(b, "% OF CAP")); if (isFinite(n)) pctOfCap = n; continue; }
      if (upper.startsWith("TYPE")) { type = (after(b, "TYPE").toUpperCase() as SigningType) || ""; continue; }
      if (upper.startsWith("CLAUSE")) { clause = after(b, "CLAUSE"); continue; }
      if (b === name) { repeatedName = b; continue; }
      if (b && !NOISE.has(b.toLowerCase())) skipped.push(b);
    }

    if (capHit == null) { skipped.push(`${team} ${name} — no cap hit found`); i = j; continue; }
    if (years == null || years <= 0) { years = 1; warnings.push("no term found; assumed 1 year"); }

    // ── The three self-checks ────────────────────────────────────
    if (repeatedName === null) {
      warnings.push("the name did not appear twice — the field order may have slipped");
    }
    if (total != null && capHit * years > 0) {
      const expected = capHit * years;
      if (Math.abs(expected - total) / total > 0.02) {
        warnings.push(`cap hit × ${years} is $${(expected / 1e6).toFixed(2)}M but the total says $${(total / 1e6).toFixed(2)}M`);
      }
    }
    const impliedSeason = pctOfCap != null ? seasonFromPct(capHit, pctOfCap) : null;
    if (pctOfCap != null && impliedSeason === null) {
      warnings.push("the cap hit and the percentage of cap do not agree with any season's ceiling");
    }

    signings.push({
      name,
      team,
      // A PuckPedia "F" cannot be told from a C or a W, and guessing would
      // overwrite a position the roster already knows correctly.
      position: rawPosition === "D" || rawPosition === "G" ? rawPosition : "",
      rawPosition,
      age,
      capHit,
      years,
      total,
      pctOfCap,
      type,
      clause,
      signDate: currentDate,
      impliedSeason,
      warnings,
    });

    i = j;
  }

  return {
    signings,
    skipped: skipped.filter(Boolean),
    needsReview: signings.some(s => s.warnings.length > 0),
  };
}

/** The calendar year a signing's money starts flowing. */
export function startYearOf(s: Pick<ParsedSigning, "impliedSeason">, seasonStartYear: number): number {
  const implied = s.impliedSeason ? parseInt(s.impliedSeason.slice(0, 4), 10) : NaN;
  return Number.isFinite(implied) ? implied : seasonStartYear;
}

/** A deal whose money has not started yet is an extension, not a contract. */
export function isFutureDated(s: Pick<ParsedSigning, "impliedSeason">, seasonStartYear: number): boolean {
  return startYearOf(s, seasonStartYear) > seasonStartYear;
}

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** "JUL 31, 2026" → "2026-07-31", so a signing keeps its real date. */
export function isoSignDate(header: string | null): string | undefined {
  if (!header) return undefined;
  const m = header.trim().toUpperCase().match(/^([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  const month = m && MONTHS[m[1]];
  return m && month ? `${m[3]}-${month}-${m[2].padStart(2, "0")}` : undefined;
}

export interface IngestRow {
  capHit?: number;
  yearsRemaining?: number;
  /** The year the player reaches the market — the anchor the term derives from. */
  expiryYear?: number;
  position?: string;
  teamSlug?: string;
  age?: number | null;
  /** Set instead of capHit/yearsRemaining when the money starts in a later season. */
  extensionCapHit?: number;
  extensionYears?: number;
  extensionSignedAt?: string;
  extensionStartsIn?: string;
}

/**
 * The shape `PUT /api/admin/contracts` ingests.
 *
 * `resolvedNames` maps a pasted name to the spelling the system already holds
 * ("Egor Chinakhov" → "Yegor Chinakhov"). The ingest keys on the name, so
 * sending the paste's spelling for a player who is already in the DB does not
 * fail — it inserts a second copy of him with a real cap hit. Resolving the
 * key here is what stops that, and `name-match.ts` is what fills the map.
 *
 * TWO THINGS THIS DOES BESIDES COPYING FIELDS
 *
 * It sends `expiryYear`. A term is only true of the season it was captured in
 * and the row does not record which one; the year the player reaches the
 * market does not drift, so it is what a rollover can be derived from later.
 *
 * And it refuses to write a future-dated deal as a current contract.
 * Celebrini's 16.56% of $18.8M implies the 2027-28 ceiling — the money starts
 * after his entry-level deal. Writing it as his cap hit would put $18.8M on
 * San Jose's books a season early and overwrite the contract he is actually
 * playing under. It goes in as an extension instead, which is the field that
 * already means "signed, owed later".
 */
export function toIngestPayload(
  signings: ParsedSigning[],
  resolvedNames?: Record<string, string> | Map<string, string>,
  seasonStartYear: number = SEASON_START_YEAR,
): Record<string, IngestRow> {
  const resolve = (name: string): string => {
    if (!resolvedNames) return name;
    const hit = resolvedNames instanceof Map ? resolvedNames.get(name) : resolvedNames[name];
    return hit && hit.trim() ? hit : name;
  };
  const out: Record<string, IngestRow> = {};
  for (const s of signings) {
    // The DB carries millions, the paste carries dollars.
    const capHit = Math.round((s.capHit / 1_000_000) * 1000) / 1000;
    const shared = {
      ...(s.position ? { position: s.position } : {}),
      teamSlug: s.team,
      age: s.age,
    };
    out[resolve(s.name)] = isFutureDated(s, seasonStartYear)
      ? {
          ...shared,
          extensionCapHit: capHit,
          extensionYears: s.years,
          extensionStartsIn: s.impliedSeason ?? undefined,
          ...(isoSignDate(s.signDate) ? { extensionSignedAt: isoSignDate(s.signDate) } : {}),
        }
      : {
          ...shared,
          capHit,
          yearsRemaining: s.years,
          expiryYear: seasonStartYear + s.years,
        };
  }
  return out;
}
