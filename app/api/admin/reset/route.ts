import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import {
  draftPickOverrides,
  faOverrides,
  players,
  siteSettings,
  teams,
  tradeBlock,
  trades,
} from "@/app/db/schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import { redis } from "@/app/lib/redis";
import { TEAMS_DB } from "@/app/lib/db";
import { ensureNewTables, ensurePlayerColumns, ensureTeamTable, ensureTradeColumns } from "@/app/db/ensure-schema";
import {
  DEVELOPMENT_NHL_SUMMARY_CACHE_KEY,
  DEVELOPMENT_TIMELINE_CACHE_KEY,
} from "@/app/lib/development-sources";
import { PROSPECT_ENRICHMENT_CACHE_KEY } from "@/app/lib/prospect-enrichment";

export const dynamic = "force-dynamic";

const CONFIRMATION = "RESET ADMIN DATA";

const RESET_CACHE_KEYS = [
  "cache:league:teams:v1",
  "cache:trade:teams:v1",
  "cache:contracts",
  "cache:contracts:v2",
  "cache:pointshares",
  "cache:pointshares:v2",
  "cache:mp_skaters",
  "cache:mp_goalies",
  "cache:nhl_skater_summary_stats",
  "cache:nhl_goalie_summary_stats",
  "cache:prospect_enrichment:v1",
  PROSPECT_ENRICHMENT_CACHE_KEY,
  DEVELOPMENT_NHL_SUMMARY_CACHE_KEY,
  DEVELOPMENT_TIMELINE_CACHE_KEY,
];

async function countRows(table: any): Promise<number> {
  try {
    const rows = await db.select().from(table);
    return rows.length;
  } catch {
    return 0;
  }
}

async function resetTable(table: any): Promise<number> {
  const count = await countRows(table);
  try {
    await db.delete(table);
    return count;
  } catch {
    return 0;
  }
}

async function resetTeamOverrides(): Promise<number> {
  await ensureTeamTable().catch(() => {});
  const count = await countRows(teams);
  await db.update(teams).set({
    phaseOverride: null,
    standingOverride: null,
  }).catch(() => {});

  const existing = await db.select({ id: teams.id }).from(teams).catch(() => [] as { id: string }[]);
  const existingIds = new Set(existing.map(team => team.id));

  for (const team of TEAMS_DB) {
    if (existingIds.has(team.id)) continue;
    await db.insert(teams).values({
      id: team.id,
      name: team.name,
      phaseOverride: null,
      standingOverride: null,
    }).catch(() => {});
  }

  return count;
}

async function clearLiveCaches(): Promise<string[]> {
  const cleared: string[] = [];
  if (!redis) return cleared;
  for (const key of RESET_CACHE_KEYS) {
    await redis.del(key).then(() => cleared.push(key)).catch(() => {});
  }
  return cleared;
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({})) as {
    confirmation?: string;
    includeTrades?: boolean;
  };

  if (body.confirmation !== CONFIRMATION) {
    return NextResponse.json({ error: `Type ${CONFIRMATION} to confirm reset` }, { status: 400 });
  }

  await Promise.all([
    ensurePlayerColumns().catch(() => {}),
    ensureTradeColumns().catch(() => {}),
    ensureNewTables().catch(() => {}),
  ]);

  const deleted: Record<string, number> = {
    players:            await resetTable(players),
    teamOverrides:      await resetTeamOverrides(),
    tradeBlock:         await resetTable(tradeBlock),
    draftPickOverrides: await resetTable(draftPickOverrides),
    faOverrides:        await resetTable(faOverrides),
    siteSettings:       await resetTable(siteSettings),
  };

  if (body.includeTrades) {
    deleted.trades = await resetTable(trades);
  }

  const clearedCacheKeys = await clearLiveCaches();

  return NextResponse.json({
    ok: true,
    deleted,
    clearedCacheKeys,
    message: body.includeTrades
      ? "Admin data and saved trades reset; live data will repopulate from scrapes."
      : "Admin override data reset; live data will repopulate from scrapes.",
  });
}
