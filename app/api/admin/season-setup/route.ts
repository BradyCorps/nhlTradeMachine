import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { siteSettings } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/app/lib/admin-auth";
import { SEASON } from "@/app/lib/season-config";
import { redis } from "@/app/lib/redis";
import { clearTeamCaches } from "@/app/lib/team-cache";
import { seedPlayersTable } from "@/app/lib/league-seed";

export const dynamic = "force-dynamic";

const SEASON_KEYS = [
  "season_label",
  "season_replay",
  "season_api_id",
  "season_nhle_id",
  "season_mp",
  "season_cap_ceiling",
  "season_cap_floor",
  "season_draft_year",
  "season_first_tradable_pick_year",
  "season_cup_champion_id",
  "season_cup_champion_name",
  "season_conn_smythe_name",
  "season_conn_smythe_team_id",
  "season_conn_smythe_team_name",
  "fa_class",
  "rollover_checklist",
] as const;

async function upsert(key: string, val: string | null) {
  if (val === null || val === "") {
    await db.delete(siteSettings).where(eq(siteSettings.key, key));
  } else {
    const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
    if (existing.length > 0) {
      await db.update(siteSettings).set({ value: val }).where(eq(siteSettings.key, key));
    } else {
      await db.insert(siteSettings).values({ key, value: val });
    }
  }
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const rows = await db.select().from(siteSettings).catch(() => []);
  const m = new Map(rows.map(r => [r.key, r.value]));

  let faClass: { ufa: string[]; rfa: string[] } = { ufa: [], rfa: [] };
  try {
    const raw = m.get("fa_class");
    if (raw) faClass = JSON.parse(raw);
  } catch { /* use default */ }

  let checklist: Record<string, boolean> = {};
  try {
    const raw = m.get("rollover_checklist");
    if (raw) checklist = JSON.parse(raw);
  } catch { /* use default */ }

  return NextResponse.json({
    current: {
      label: SEASON.label,
      replaySeason: SEASON.replaySeason,
      apiSeasonId: SEASON.apiSeasonId,
      nhleSeasonId: SEASON.nhleSeasonId,
      mpSeason: SEASON.mpSeason,
      capCeiling: SEASON.capCeiling,
      capFloor: SEASON.capFloor,
      draftYear: SEASON.draftYear,
      firstTradablePickYear: SEASON.firstTradablePickYear,
      latestCompleted: SEASON.latestCompleted,
    },
    overrides: {
      label: m.get("season_label") ?? null,
      replaySeason: m.get("season_replay") ?? null,
      apiSeasonId: m.get("season_api_id") ?? null,
      nhleSeasonId: m.get("season_nhle_id") ?? null,
      mpSeason: m.get("season_mp") ?? null,
      capCeiling: m.get("season_cap_ceiling") ?? null,
      capFloor: m.get("season_cap_floor") ?? null,
      draftYear: m.get("season_draft_year") ?? null,
      firstTradablePickYear: m.get("season_first_tradable_pick_year") ?? null,
      cupChampionId: m.get("season_cup_champion_id") ?? null,
      cupChampionName: m.get("season_cup_champion_name") ?? null,
      connSmytheName: m.get("season_conn_smythe_name") ?? null,
      connSmytheTeamId: m.get("season_conn_smythe_team_id") ?? null,
      connSmytheTeamName: m.get("season_conn_smythe_team_name") ?? null,
    },
    faClass,
    checklist,
  });
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json() as {
    action?: "save_config" | "save_fa_class" | "save_checklist" | "apply_rollover" | "load_seed" | "clear_caches";
    config?: Record<string, string | null>;
    faClass?: { ufa: string[]; rfa: string[] };
    checklist?: Record<string, boolean>;
  };

  if (body.action === "save_config" && body.config) {
    const keyMap: Record<string, string> = {
      label: "season_label",
      replaySeason: "season_replay",
      apiSeasonId: "season_api_id",
      nhleSeasonId: "season_nhle_id",
      mpSeason: "season_mp",
      capCeiling: "season_cap_ceiling",
      capFloor: "season_cap_floor",
      draftYear: "season_draft_year",
      firstTradablePickYear: "season_first_tradable_pick_year",
      cupChampionId: "season_cup_champion_id",
      cupChampionName: "season_cup_champion_name",
      connSmytheName: "season_conn_smythe_name",
      connSmytheTeamId: "season_conn_smythe_team_id",
      connSmytheTeamName: "season_conn_smythe_team_name",
    };
    for (const [field, val] of Object.entries(body.config)) {
      const dbKey = keyMap[field];
      if (dbKey) await upsert(dbKey, val ?? null);
    }
    return NextResponse.json({ ok: true, saved: "config" });
  }

  if (body.action === "save_fa_class" && body.faClass) {
    await upsert("fa_class", JSON.stringify(body.faClass));
    return NextResponse.json({ ok: true, saved: "fa_class", ufa: body.faClass.ufa.length, rfa: body.faClass.rfa.length });
  }

  if (body.action === "save_checklist" && body.checklist) {
    await upsert("rollover_checklist", JSON.stringify(body.checklist));
    return NextResponse.json({ ok: true, saved: "checklist" });
  }

  if (body.action === "load_seed") {
    try {
      const result = await seedPlayersTable();
      const cleared: string[] = [];
      cleared.push(...await clearTeamCaches(redis));
      if (redis) {
        for (const key of ["cache:contracts", "cache:contracts:v2"]) {
          await redis.del(key).then(() => cleared.push(key)).catch(() => {});
        }
      }
      return NextResponse.json({ ok: true, ...result, clearedCacheKeys: cleared });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "Seed failed" }, { status: 500 });
    }
  }

  if (body.action === "clear_caches") {
    const cleared: string[] = [];
    if (redis) {
      cleared.push(...await clearTeamCaches(redis));
      for (const key of [
        "cache:contracts", "cache:contracts:v2",
        "cache:pointshares", "cache:pointshares:v2",
        "cache:mp_skaters", "cache:mp_goalies",
        "cache:nhl_skater_summary_stats", "cache:nhl_goalie_summary_stats",
      ]) {
        await redis.del(key).then(() => cleared.push(key)).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true, cleared });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
