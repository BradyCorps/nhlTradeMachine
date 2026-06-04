// ============================================================
// EXTERNAL DATA SCRAPER
// Extracts active player contracts from CapWages HTML payloads
// ============================================================

// Convert "Last, First" → "First Last"
const normaliseName = (raw: string): string => {
  const parts = raw.split(",").map((s) => s.trim());
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : raw;
};

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
      if (!Array.isArray(p) || p.length < 30) { skipped++; continue; }

      const rawName      = p[0]  as string;
      const capRaw       = p[18] as number;
      const expiryStatus = p[24] as string;
      const teamSlug     = (p[2] as string ?? "").toLowerCase().replace(/\s+/g, "_");
      const position     = (p[3] as string ?? "").toUpperCase();
      const ageNow       = p[8]  as number;
      const totalLength  = p[15] as number;

      if (!rawName || !capRaw || capRaw <= 0) {
        if (rawName) skipReasons[normaliseName(rawName)] = `capRaw=${capRaw} (p[18] null/zero)`;
        skipped++;
        continue;
      }

      const name   = normaliseName(rawName);
      const capHit = Math.round((capRaw / 10) * 1000) / 1000;

      // ── Sanity check ──────────────────────────────────────────
      const CAP_MIN = 0.70;
      const CAP_MAX = 18.0;
      if (capHit < CAP_MIN || capHit > CAP_MAX) {
        skipReasons[name] = `capHit=${capHit} out of range [${CAP_MIN},${CAP_MAX}]`;
        skipped++;
        continue;
      }

      const ageSigned      = Math.max((p[28] as number) || 0, (p[29] as number) || 0);
      const yearsServed    = (ageNow && ageSigned) ? Math.max(0, ageNow - ageSigned) : 0;
      const yearsRemaining = totalLength > 0 ? Math.max(1, totalLength - yearsServed) : 1;

      const contractData = {
        capHit,
        yearsRemaining: Math.max(0, yearsRemaining),
        expiryStatus,
        position,
        teamSlug,
      };

      contracts[name] = contractData;
      if (position) contracts[`${name}__${position}`] = contractData;
      if (teamSlug) contracts[`${name}__${teamSlug}`]  = contractData;
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
