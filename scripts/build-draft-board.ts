// ============================================================
// build-draft-board.ts — generate app/data/draft-2026.json (first-round order)
//
// The first-round pick ORDER (who picks where, with trades baked in) is sourced
// from the official NHL draft-picks endpoint, which carries the full ownership
// chain in `teamPickHistory` (e.g. "FLA-OTT-SJS" → originally FLA, now SJS).
// This removes the hand-maintenance of DRAFT_2026_ORDER each off-season and
// whenever a pick is traded.
//
// The PROSPECT board (DRAFT_2026_PROSPECTS) is intentionally NOT generated here:
// the NHL rankings endpoint splits prospects into four separately-ranked
// categories (no unified board) and carries no GP/G/A/PTS, so it would degrade
// the curated, stats-bearing board. This script can still print a names-only
// cross-check against the live rankings to flag board drift.
//
// Sources (in priority order, so it runs in any environment):
//   1. live  https://api-web.nhle.com/v1/draft/picks/{YEAR}/all   (when reachable)
//   2. committed sample  app/data/sources/draft-picks-{YEAR}.json (datacenter-safe)
//
// Run each off-season (from a machine with NHL API access to refresh the order):
//   npx tsx scripts/build-draft-board.ts
// ============================================================

import fs from "fs";
import path from "path";
import { SEASON } from "../app/lib/season-config";

const DRAFT_YEAR = SEASON.draftYear;
const PICKS_URL = `https://api-web.nhle.com/v1/draft/picks/${DRAFT_YEAR}/all`;
const RANKINGS_URL = (cat: number) => `https://api-web.nhle.com/v1/draft/rankings/${DRAFT_YEAR}/${cat}`;

interface NhlPick {
  round: number;
  pickInRound: number;
  overallPick: number;
  teamAbbrev: string;
  teamPickHistory?: string; // ownership chain, "ORIG-…-CURRENT"
}

interface OrderSlot {
  overall: number;
  team: string;          // current owner (who makes the pick)
  originalTeam: string;  // first club in the ownership chain — the "via" credit
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[build-draft-board] ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    console.warn(`[build-draft-board] ${url} unreachable: ${e?.message}`);
    return null;
  }
}

function loadSamplePicks(): { picks: NhlPick[]; state?: string } | null {
  const file = path.join(process.cwd(), `app/data/sources/draft-picks-${DRAFT_YEAR}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e: any) {
    console.warn(`[build-draft-board] no committed sample at ${file}: ${e?.message}`);
    return null;
  }
}

function originalOwner(pick: NhlPick): string {
  const chain = (pick.teamPickHistory || pick.teamAbbrev || "").split("-").filter(Boolean);
  return chain[0] || pick.teamAbbrev;
}

async function main() {
  // 1. Pick order — live first, committed sample as fallback.
  const live = await fetchJson(PICKS_URL);
  const source: string = live ? "live" : "sample";
  const payload: { picks?: NhlPick[]; state?: string } = live ?? loadSamplePicks() ?? {};
  const allPicks = Array.isArray(payload.picks) ? payload.picks : [];
  if (allPicks.length === 0) {
    console.error("[build-draft-board] no picks from live or sample — aborting (nothing written).");
    process.exit(1);
  }

  const order: OrderSlot[] = allPicks
    .filter((p) => p.round === 1)
    .sort((a, b) => a.overallPick - b.overallPick)
    .map((p) => ({ overall: p.overallPick, team: p.teamAbbrev, originalTeam: originalOwner(p) }));

  if (order.length !== 32) {
    console.warn(`[build-draft-board] expected 32 first-round picks, got ${order.length}.`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    draftYear: DRAFT_YEAR,
    source,
    pickState: payload.state ?? null,
    count: order.length,
    order,
  };
  const outPath = path.join(process.cwd(), "app/data/draft-2026.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf-8");

  const traded = order.filter((s) => s.team !== s.originalTeam).length;
  console.log(
    `[build-draft-board] wrote ${order.length} first-round slots → ${outPath}\n` +
    `  source: ${source}${out.pickState ? ` (state ${out.pickState})` : ""}\n` +
    `  traded slots (team ≠ original): ${traded}`,
  );

  // 2. Prospect cross-check (live only, report-only — never written).
  // Flags the official top names so a human can keep the curated board honest.
  const ranks = await Promise.all([1, 2].map((c) => fetchJson(RANKINGS_URL(c))));
  const topNames: string[] = [];
  for (const r of ranks) {
    for (const p of (r?.rankings ?? []).slice(0, 16)) {
      if (p?.finalRank != null) topNames.push(`${p.firstName} ${p.lastName} (${p.positionCode}, #${p.finalRank})`);
    }
  }
  if (topNames.length > 0) {
    console.log(
      `\n[build-draft-board] official top prospects (cross-check only — board NOT modified):\n  ` +
      topNames.join("\n  "),
    );
  }
}

main();
