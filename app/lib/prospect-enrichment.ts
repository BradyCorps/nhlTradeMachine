import { SEASON } from "@/app/lib/season-config";
import { redis } from "@/app/lib/redis";

export interface ProspectEnrichment {
  draftYear?: number;
  draftOverall?: number;
  prospectPtsPace?: number;
}

export const slugifyProspectName = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-");

export const PROSPECT_ENRICHMENT_CACHE_KEY = `cache:prospect_enrichment:v2:${Math.max(2020, SEASON.draftYear - 7)}:${SEASON.draftYear - 1}`;
const CACHE_TTL = 7 * 24 * 60 * 60;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function cleanCell(value: string): string {
  return decodeHtml(
    value
      .replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function cleanDraftedPlayerName(value: string): string {
  return value
    .replace(/\s*\([A-Z/,\s-]+\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseWikipediaDraftProspects(html: string, draftYear: number): Record<string, ProspectEnrichment> {
  const result: Record<string, ProspectEnrichment> = {};
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(match => cleanCell(match[1]));
    if (cells.length < 2) continue;

    const overall = Number(cells[0]);
    if (!Number.isInteger(overall) || overall <= 0 || overall > 300) continue;

    const name = cleanDraftedPlayerName(cells[1]);
    if (!name || /^\d+$/.test(name)) continue;

    const slug = slugifyProspectName(name);
    if (result[slug]) continue;
    result[slug] = { draftYear, draftOverall: overall };
  }

  return result;
}

async function fetchWikipediaDraftProspects(year: number): Promise<Record<string, ProspectEnrichment>> {
  const res = await fetch(`https://en.wikipedia.org/wiki/${year}_NHL_entry_draft`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return {};
  return parseWikipediaDraftProspects(await res.text(), year);
}

export async function fetchProspectEnrichmentMap(): Promise<Record<string, ProspectEnrichment>> {
  if (redis) {
    const cached = await redis.get<Record<string, ProspectEnrichment>>(PROSPECT_ENRICHMENT_CACHE_KEY);
    if (cached && Object.keys(cached).length > 50) return cached;
  }

  const startYear = Math.max(2020, SEASON.draftYear - 7);
  const endYear = SEASON.draftYear - 1;
  const yearly = await Promise.allSettled(
    Array.from({ length: endYear - startYear + 1 }, (_, i) => fetchWikipediaDraftProspects(startYear + i))
  );

  const merged: Record<string, ProspectEnrichment> = {};
  for (const item of yearly) {
    if (item.status !== "fulfilled") continue;
    for (const [slug, prospect] of Object.entries(item.value)) {
      if (!merged[slug]) merged[slug] = prospect;
    }
  }

  if (redis && Object.keys(merged).length > 50) {
    await redis.setex(PROSPECT_ENRICHMENT_CACHE_KEY, CACHE_TTL, merged);
  }

  return merged;
}
