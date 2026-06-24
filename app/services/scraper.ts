// ============================================================
// EXTERNAL DATA SCRAPER
// Extracts active player contracts from CapWages HTML payloads
// ============================================================

import { SEASON } from "@/app/lib/season-config";

type CapWagesContract = {
  capHit: number;
  yearsRemaining: number;
  expiryStatus: string;
  expiryYear: number | null;
  position: string;
  teamSlug: string;
  age: number | null;
};

type CapWagesParseResult =
  | { ok: true; name: string; contractData: CapWagesContract; aliases: string[] }
  | { ok: false; name?: string; reason: string };

const CAP_MIN = 0.75;
const CAP_MAX = 20.8;
const AGE_MIN = 17;
const AGE_MAX = 45;
const MAX_CONTRACT_YEARS = 15;

// Convert "Last, First" → "First Last"
const normaliseName = (raw: string): string => {
  const parts = raw.split(",").map((s) => s.trim());
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : raw;
};

function yearsRemainingFromExpiry(expiryYearRaw: unknown, totalLength: number, ageNow: number, ageSigned: number): number {
  const seasonStartYear = Number(SEASON.label.slice(0, 4));
  const expiryYearShort = typeof expiryYearRaw === "number" ? expiryYearRaw : Number(expiryYearRaw);
  if (Number.isFinite(expiryYearShort) && expiryYearShort >= 20 && expiryYearShort <= 60) {
    return Math.max(1, 2000 + expiryYearShort - seasonStartYear);
  }

  const yearsServed = (ageNow && ageSigned) ? Math.max(0, ageNow - ageSigned) : 0;
  return totalLength > 0 ? Math.max(1, totalLength - yearsServed) : 1;
}

function hasRecognizedPosition(position: string): boolean {
  const tokens = position.toUpperCase().split(",").map(p => p.trim()).filter(Boolean);
  return tokens.some(token => ["C", "LW", "RW", "W", "LD", "RD", "D", "G", "L", "R"].includes(token));
}

export function parseCapWagesPlayerRow(row: unknown): CapWagesParseResult {
  if (!Array.isArray(row) || row.length < 30) return { ok: false, reason: "row is not a 30-field CapWages player tuple" };

  const rawName = typeof row[0] === "string" ? row[0].trim() : "";
  if (!rawName) return { ok: false, reason: "missing player name" };
  const name = normaliseName(rawName);

  const rawTeam = typeof row[2] === "string" ? row[2].trim() : "";
  const teamSlug = rawTeam.toLowerCase().replace(/[\s-]+/g, "_");
  if (!teamSlug || !/^[a-z0-9_]+$/.test(teamSlug)) {
    return { ok: false, name, reason: `invalid team slug '${rawTeam}'` };
  }

  const position = typeof row[3] === "string" ? row[3].trim().toUpperCase() : "";
  if (!position || !hasRecognizedPosition(position)) {
    return { ok: false, name, reason: `invalid position '${position || row[3]}'` };
  }

  const ageNow = Number(row[8]);
  if (!Number.isFinite(ageNow) || ageNow < AGE_MIN || ageNow > AGE_MAX) {
    return { ok: false, name, reason: `age=${row[8]} outside [${AGE_MIN},${AGE_MAX}]` };
  }

  const totalLength = Number(row[15]);
  if (!Number.isFinite(totalLength) || totalLength < 0 || totalLength > MAX_CONTRACT_YEARS) {
    return { ok: false, name, reason: `contractLength=${row[15]} outside [0,${MAX_CONTRACT_YEARS}]` };
  }

  const capRaw = Number(row[18]);
  if (!Number.isFinite(capRaw) || capRaw <= 0) {
    return { ok: false, name, reason: `capRaw=${row[18]} invalid` };
  }

  const capHit = Math.round((capRaw / 10) * 1000) / 1000;
  if (capHit < CAP_MIN || capHit > CAP_MAX) {
    return { ok: false, name, reason: `capHit=${capHit} out of range [${CAP_MIN},${CAP_MAX}]` };
  }

  const expiryStatus = typeof row[24] === "string" ? row[24].trim() : "";
  if (!expiryStatus) return { ok: false, name, reason: "missing expiry status" };

  const ageSigned = Number(row[28]) || 0;
  const yearsRemaining = yearsRemainingFromExpiry(row[29], totalLength, ageNow, ageSigned);
  if (!Number.isFinite(yearsRemaining) || yearsRemaining < 1 || yearsRemaining > MAX_CONTRACT_YEARS) {
    return { ok: false, name, reason: `yearsRemaining=${yearsRemaining} outside [1,${MAX_CONTRACT_YEARS}]` };
  }

  // Calendar year the deal expires (e.g. 27 → 2027). yearsRemaining is floored
  // to >=1 across the pipeline, so this is the authoritative free-agency signal:
  // a deal expiring in/at the projected season's start year is a pending FA.
  const expiryYearShort = Number(row[29]);
  const expiryYear = Number.isFinite(expiryYearShort) && expiryYearShort >= 20 && expiryYearShort <= 60
    ? 2000 + expiryYearShort
    : null;

  const contractData = {
    capHit,
    yearsRemaining,
    expiryStatus,
    expiryYear,
    position,
    teamSlug,
    age: ageNow,
  };

  return {
    ok: true,
    name,
    contractData,
    aliases: [`${name}__${position}`, `${name}__${teamSlug}`],
  };
}

export async function scrapeCapWages(): Promise<Record<string, any>> {
  try {
    const res = await fetch("https://capwages.com/players/active", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[CapWages Scraper] Failed to fetch. Status: ${res.status}`);
      return {};
    }

    const html  = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      console.warn("[CapWages Scraper] No __NEXT_DATA__ script found.");
      return {};
    }

    let nextData;
    try {
      nextData = JSON.parse(match[1]);
    } catch (e) {
      console.warn("[CapWages Scraper] Failed to parse JSON from __NEXT_DATA__.");
      return {};
    }

    const players = nextData?.props?.pageProps?.playersArray;
    if (!Array.isArray(players) || players.length < 100) {
      console.warn("[CapWages Scraper] playersArray is missing or malformed.");
      return {};
    }

    const contracts: Record<string, any> = {};
    let scraped = 0;
    let skipped = 0;
    const skipReasons: Record<string, string> = {};

    for (const p of players) {
      const parsed = parseCapWagesPlayerRow(p);
      if (!parsed.ok) {
        if (parsed.name) skipReasons[parsed.name] = parsed.reason;
        skipped++;
        continue;
      }

      contracts[parsed.name] = parsed.contractData;
      for (const alias of parsed.aliases) contracts[alias] = parsed.contractData;
      scraped++;
    }

    console.log(`[CapWages Scraper] Scraped ${scraped} players, skipped ${skipped}.`);
    const watchList = ["Quinton Byfield","Connor McDavid","Nathan MacKinnon","Auston Matthews"];
    for (const name of watchList) {
      if (!contracts[name]) {
        const reason = skipReasons[name] ?? "not found in playersArray";
        console.warn(`[CapWages Scraper] ⚠ ${name} missing from contracts — ${reason}`);
      }
    }
    return contracts;
  } catch (e: any) {
    console.error(`[CapWages Scraper] Fatal error: ${e.message}`);
    return {};
  }
}
