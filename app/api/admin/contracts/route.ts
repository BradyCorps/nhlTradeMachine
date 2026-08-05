import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable, teams as teamsTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";
import { requireAdmin } from "@/app/lib/admin-auth";
import { ensurePlayerColumns, ensurePlayerTable, ensureTeamTable } from "@/app/db/ensure-schema";
import { clearTeamCaches } from "@/app/lib/team-cache";

const CONTRACT_OVERRIDES: Record<string, { yearsRemaining?: number; position?: string }> = {
  "Quinton Byfield": { position: "C" },

};

const CW_TEAM_TO_ID: Record<string, string> = {
  anaheim_ducks: "ANA",
  san_diego_gulls: "ANA",
  boston_bruins: "BOS",
  providence_bruins: "BOS",
  buffalo_sabres: "BUF",
  rochester_americans: "BUF",
  calgary_flames: "CGY",
  calgary_wranglers: "CGY",
  carolina_hurricanes: "CAR",
  chicago_wolves: "CAR",
  chicago_blackhawks: "CHI",
  rockford_icehogs: "CHI",
  colorado_avalanche: "COL",
  colorado_eagles: "COL",
  columbus_blue_jackets: "CBJ",
  cleveland_monsters: "CBJ",
  dallas_stars: "DAL",
  texas_stars: "DAL",
  detroit_red_wings: "DET",
  grand_rapids_griffins: "DET",
  edmonton_oilers: "EDM",
  bakersfield_condors: "EDM",
  florida_panthers: "FLA",
  charlotte_checkers: "FLA",
  los_angeles_kings: "LAK",
  ontario_reign: "LAK",
  minnesota_wild: "MIN",
  iowa_wild: "MIN",
  montreal_canadiens: "MTL",
  laval_rocket: "MTL",
  nashville_predators: "NSH",
  milwaukee_admirals: "NSH",
  new_jersey_devils: "NJD",
  utica_comets: "NJD",
  new_york_islanders: "NYI",
  bridgeport_islanders: "NYI",
  new_york_rangers: "NYR",
  hartford_wolf_pack: "NYR",
  ottawa_senators: "OTT",
  belleville_senators: "OTT",
  philadelphia_flyers: "PHI",
  lehigh_valley_phantoms: "PHI",
  pittsburgh_penguins: "PIT",
  wilkes_barre_scranton_penguins: "PIT",
  san_jose_sharks: "SJS",
  san_jose_barracuda: "SJS",
  seattle_kraken: "SEA",
  coachella_valley_firebirds: "SEA",
  st_louis_blues: "STL",
  springfield_thunderbirds: "STL",
  tampa_bay_lightning: "TBL",
  syracuse_crunch: "TBL",
  toronto_maple_leafs: "TOR",
  toronto_marlies: "TOR",
  utah_mammoth: "UTA",
  utah_hockey_club: "UTA",
  tucson_roadrunners: "UTA",
  vancouver_canucks: "VAN",
  abbotsford_canucks: "VAN",
  vegas_golden_knights: "VGK",
  henderson_silver_knights: "VGK",
  washington_capitals: "WSH",
  hershey_bears: "WSH",
  winnipeg_jets: "WPG",
  manitoba_moose: "WPG",
};

const SYNC_CACHE_KEYS = [
  "cache:contracts",
  "cache:contracts:v2",
  "cache:nhl_skater_summary_stats",
];
const VALID_TEAM_IDS = new Set(TEAMS_DB.map(t => t.id));
const MIN_CONTRACT_CAP_HIT = 0.5;
const MAX_CONTRACT_CAP_HIT = 20.8;
const MIN_CONTRACT_YEARS = 0;
const MAX_CONTRACT_YEARS = 12;

// Memoized per-process column back-fill (retirement + prospect columns).
// Kept as a named wrapper so the retirement-column guard stays explicit here.
async function ensureRetirementColumns() {
  await ensurePlayerTable();
  await ensurePlayerColumns();
}

async function ensureCanonicalTeamRows() {
  await ensureTeamTable();
  const existing = await db.select({ id: teamsTable.id }).from(teamsTable).catch(() => [] as { id: string }[]);
  const existingIds = new Set(existing.map(t => t.id));
  for (const team of TEAMS_DB) {
    if (existingIds.has(team.id)) continue;
    await db.insert(teamsTable).values({ id: team.id, name: team.name }).catch(() => {});
  }
}

async function clearRosterCaches(): Promise<string[]> {
  const cleared: string[] = [];
  cleared.push(...await clearTeamCaches(redis, db));
  if (!redis) return cleared;
  for (const key of SYNC_CACHE_KEYS) {
    await redis.del(key).then(() => cleared.push(key)).catch(() => {});
  }
  return cleared;
}

const NHLE_FACTORS: Record<string, number> = {
  NHL: 1.00, AHL: 0.47, KHL: 0.77, SHL: 0.59, LIIGA: 0.54,
  NL: 0.46, CZECHIA: 0.49, DEL: 0.44, NCAA: 0.41, USHL: 0.27,
  OHL: 0.30, WHL: 0.28, QMJHL: 0.28, USNTDP: 0.35,
  J20: 0.19, MHL: 0.18, U18: 0.15,
};

function isValidTeamId(teamId: string | null | undefined): teamId is string {
  return Boolean(teamId && VALID_TEAM_IDS.has(teamId));
}

function normaliseExpiryStatus(status: string | null | undefined): "UFA" | "RFA" | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === "UFA") return "UFA";
  if (s === "RFA") return "RFA";
  return null;
}

function normalisePosition(pos: string | null | undefined): string | null {
  if (!pos || pos === "Unknown" || pos === "-" || pos === "—") return null;
  const first = pos.toUpperCase().split(",").map(p => p.trim()).filter(Boolean)[0];
  if (!first || first === "-" || first === "—") return null;
  if (first.includes("G")) return "G";
  if (first.includes("D")) return "D";
  if (first.includes("C")) return "C";
  if (first.includes("W") || first.includes("L") || first.includes("R")) return "W";
  return first;
}

function teamIdFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const direct = slug.trim().toUpperCase();
  if (isValidTeamId(direct)) return direct;
  const key = slug.toLowerCase().replace(/[\s-]+/g, "_");
  return CW_TEAM_TO_ID[key] ?? null;
}

// Shared player-ID function \u2014 single source of truth in player-identity.ts
import { makePlayerId as makeId } from "@/app/lib/player-identity";

function findScrapedByName(scraped: Record<string, any>, name: string): any | null {
  const direct = scraped[name];
  if (direct) return direct;
  const id = makeId(name);
  for (const [key, value] of Object.entries(scraped)) {
    if (!key.includes("__") && makeId(key) === id) return value;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchNhlRosterTeamMap(): Promise<Map<string, { teamId: string; position: string | null }>> {
  const playerTeams = new Map<string, { teamId: string; position: string | null }>();

  for (const team of TEAMS_DB) {
    await sleep(100);
    try {
      const res = await fetch(`https://api-web.nhle.com/v1/roster/${team.id}/current`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const data = await res.json() as {
        forwards?: any[];
        defensemen?: any[];
        goalies?: any[];
      };
      const rows = [
        ...(data.forwards ?? []),
        ...(data.defensemen ?? []),
        ...(data.goalies ?? []),
      ];

      for (const p of rows) {
        const name = `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""}`.trim();
        if (!name) continue;
        playerTeams.set(makeId(name), {
          teamId: team.id,
          position: normalisePosition(p.positionCode),
        });
      }
    } catch {
      // Best-effort fallback only; CapWages/DB sync can still proceed.
    }
  }

  return playerTeams;
}

// GET /api/admin/contracts — full audit table
// ?scrape=1 adds live CapWages data (slower, enables delta column + SYNC)
export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  await ensureRetirementColumns();

  // Explicit column list — a full select() breaks with "no such column" whenever
  // schema.ts declares a column the live Turso table doesn't have yet.
  let dbError: string | null = null;
  const [dbRows, scraped] = await Promise.all([
    db.select({
      name:           playersTable.name,
      position:       playersTable.position,
      teamId:         playersTable.teamId,
      capHit:         playersTable.capHit,
      yearsRemaining: playersTable.yearsRemaining,
      hasNmc:         playersTable.hasNmc,
      hasNtc:         playersTable.hasNtc,
      retired:        playersTable.retired,
      retiredDate:    playersTable.retiredDate,
      expiryStatus:   playersTable.expiryStatus,
      expiryYear:     playersTable.expiryYear,
      excludeFromRoster: playersTable.excludeFromRoster,
      extensionCapHit: playersTable.extensionCapHit,
      extensionYears:  playersTable.extensionYears,
      source:         playersTable.source,
    }).from(playersTable).catch((e: any) => {
      dbError = e?.message ?? String(e);
      console.error("[Admin Contracts] DB read failed:", dbError);
      return [] as any[];
    }),
    // The live-delta comparison used to scrape CapWages here. Removed — they
    // sell an API and started 403ing the scraper, which is their call. Nothing
    // to diff against, so the GET is now purely the DB view.
    Promise.resolve({} as Record<string, any>),
  ]);

  const dbMap = new Map<string, typeof dbRows[number]>();
  for (const row of dbRows) {
    const existing = dbMap.get(row.name);
    const rowHasMetadata = row.teamId != null || normalisePosition(row.position) != null;
    const existingHasMetadata = existing?.teamId != null || normalisePosition(existing?.position) != null;
    if (!existing || (rowHasMetadata && !existingHasMetadata)) dbMap.set(row.name, row);
  }

  // DB rows only. There is no second source to union in any more, so a name
  // that is not in the DB is not in this view — the roster-gaps panel is what
  // finds players the DB has never heard of.
  const allNames = new Set<string>(dbRows.map(r => r.name));

  const scrapedRaw: Record<string, { capHit: number; yearsRemaining: number; position?: string; teamSlug?: string; age?: number | null }> = {};

  const rows = Array.from(allNames).sort().map(name => {
    const b  = dbMap.get(name);
    const cw = findScrapedByName(scraped, name);
    const ov = CONTRACT_OVERRIDES[name];

    const dbYears    = b?.yearsRemaining ?? null;
    const scrapedYears = cw?.yearsRemaining && cw.yearsRemaining > 0 ? cw.yearsRemaining : null;
    const baseYears  = ov?.yearsRemaining ?? scrapedYears ?? dbYears ?? 1;

    const scrapedCap = cw?.capHit ?? null;
    const baseCap    = scrapedCap ?? b?.capHit ?? null;

    const delta = (dbYears != null && scrapedYears != null)
      ? Math.abs(dbYears - scrapedYears) : null;

    if (cw?.capHit) {
      scrapedRaw[name] = {
        capHit: cw.capHit,
        yearsRemaining: scrapedYears ?? 1,
        position: cw.position,
        teamSlug: cw.teamSlug,
        age: cw.age ?? null,
      };
    }

    return {
      name,
      team:          cw?.teamSlug ?? b?.teamId ?? null,
      position:      ov?.position ?? normalisePosition(cw?.position) ?? normalisePosition(b?.position) ?? null,
      finalYears:    baseYears,
      finalCap:      baseCap,
      bundledYears:  dbYears,
      scrapedYears,
      adminYears:    null,
      adminCap:      null,
      overrideYears: ov?.yearsRemaining ?? null,
      hasNMC:        b?.hasNmc  ?? false,
      hasNTC:        b?.hasNtc  ?? false,
      retired:       b?.retired ?? false,
      retiredDate:   b?.retiredDate ?? null,
      // FA facts now live on the DB row (single source of truth); fall back to a
      // live scrape value only when previewing a sync.
      expiryStatus:  (b as any)?.expiryStatus ?? cw?.expiryStatus ?? null,
      expiryYear:    (b as any)?.expiryYear ?? null,
      excludeFromRoster: (b as any)?.excludeFromRoster ?? false,
      extensionCapHit: b?.extensionCapHit ?? null,
      extensionYears:  b?.extensionYears ?? null,
      // Provenance straight from the DB: seed | sync | editor (or "missing" when
      // the rostered player has no DB contract row at all).
      dbSource:      (b as any)?.source ?? null,
      needsData:     !b || b.position == null || b.position === "Unknown" || b.capHit == null,
      delta,
      source: ov?.yearsRemaining ? "override"
             : scrapedYears      ? "scraper"
             : dbYears           ? "bundled"
             : "default",
    };
  });

  rows.sort((a, b) => (b.delta ?? -1) - (a.delta ?? -1) || a.name.localeCompare(b.name));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    total: rows.length,
    contracts: rows,
    scrapedRaw: {},
    dbError,
  });
}

// POST /api/admin/contracts
// body: { name, yearsRemaining?, capHit?, hasNMC?, hasNTC?, draftOverall?, prospectPtsPace?, clear? }
// Upserts to Turso DB — persists across Vercel deployments
export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  await ensureRetirementColumns();

  const body = await req.json();
  const action = typeof body.action === "string" ? body.action : null;
  if (action === "reset-source") {
    const clearCurated = body.clearCurated !== false;
    const targetName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
    const updates: Record<string, any> = { source: "sync" };
    if (clearCurated) {
      updates.expiryStatus = null;
      updates.expiryYear = null;
      updates.excludeFromRoster = false;
    }

    if (targetName) {
      const id = makeId(targetName);
      const existing = await db.select({ id: playersTable.id }).from(playersTable).where(eq(playersTable.id, id));
      if (existing.length === 0) {
        return NextResponse.json({ error: "player not found" }, { status: 404 });
      }
      await db.update(playersTable).set(updates).where(eq(playersTable.id, id));
      const clearedCacheKeys = await clearRosterCaches();
      return NextResponse.json({ ok: true, updated: 1, scope: "player", clearedCacheKeys });
    }

    const editorRows = await db.select({ id: playersTable.id }).from(playersTable).where(eq(playersTable.source, "editor"));
    if (editorRows.length > 0) {
      await db.update(playersTable).set(updates).where(eq(playersTable.source, "editor"));
    }
    const clearedCacheKeys = await clearRosterCaches();
    return NextResponse.json({ ok: true, updated: editorRows.length, scope: "all", clearedCacheKeys });
  }

  const { name, yearsRemaining, capHit, hasNMC, hasNTC, retired, clear } = body as {
    name:            string;
    yearsRemaining?: number;
    capHit?:         number;
    hasNMC?:         boolean;
    hasNTC?:         boolean;
    retired?:        boolean;
    clear?:          boolean;
  };
  // Free-agency facts are first-class editor fields now (no separate overrides
  // table at read time). `expiryStatus: null` is an explicit "force SIGNED".
  const hasExpiryStatus = "expiryStatus" in body;
  const expiryStatus = hasExpiryStatus ? normaliseExpiryStatus(body.expiryStatus) : undefined;
  const expiryYear = Number.isFinite(Number(body.expiryYear)) ? Number(body.expiryYear) : (hasExpiryStatus ? null : undefined);
  const excludeFromRoster = typeof body.excludeFromRoster === "boolean" ? body.excludeFromRoster : undefined;
  const teamId = typeof body.teamId === "string" ? teamIdFromSlug(body.teamId) : null;
  const position = normalisePosition(body.position);
  const age = Number.isFinite(Number(body.age)) ? Number(body.age) : null;
  const draftYear = Number.isFinite(Number(body.draftYear)) ? Number(body.draftYear) : null;
  const draftRound = Number.isFinite(Number(body.draftRound)) ? Number(body.draftRound) : null;
  const draftOverall = Number.isFinite(Number(body.draftOverall)) ? Number(body.draftOverall) : null;
  const extensionCapHit = Number.isFinite(Number(body.extensionCapHit)) && Number(body.extensionCapHit) > 0 ? Number(body.extensionCapHit) : null;
  const extensionYears = Number.isFinite(Number(body.extensionYears)) && Number(body.extensionYears) > 0 ? Math.round(Number(body.extensionYears)) : null;
  const clearExtension = body.extensionCapHit === null || body.extensionCapHit === 0 || body.clearExtension === true;
  // PA8 — stamp the signing date so the Hot Off the Press feed can order by
  // true recency. Accepts an explicit YYYY-MM-DD (back-dating a real signing)
  // or defaults to today when an extension is set without one.
  const validDate = (v: unknown): string | null =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const extensionSignedAt = extensionCapHit != null
    ? (validDate(body.extensionSignedAt) ?? new Date().toISOString().slice(0, 10))
    : null;
  const explicitProspectPtsPace = Number.isFinite(Number(body.prospectPtsPace)) ? Number(body.prospectPtsPace) : null;
  const league = typeof body.league === "string" ? body.league.toUpperCase() : null;
  const points = Number.isFinite(Number(body.points)) ? Number(body.points) : null;
  const games = Number.isFinite(Number(body.games)) ? Number(body.games) : null;
  const calculatedProspectPtsPace = league && points != null && games != null && games > 0 && NHLE_FACTORS[league] != null
    ? Math.round((points / games) * NHLE_FACTORS[league] * 82 * 10) / 10
    : null;
  const prospectPtsPace = explicitProspectPtsPace ?? calculatedProspectPtsPace;

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (
    capHit != null &&
    (!Number.isFinite(capHit) || capHit < MIN_CONTRACT_CAP_HIT || capHit > MAX_CONTRACT_CAP_HIT)
  ) {
    return NextResponse.json({ error: `capHit must be between ${MIN_CONTRACT_CAP_HIT} and ${MAX_CONTRACT_CAP_HIT}` }, { status: 400 });
  }
  if (
    yearsRemaining != null &&
    (!Number.isInteger(yearsRemaining) || yearsRemaining < MIN_CONTRACT_YEARS || yearsRemaining > MAX_CONTRACT_YEARS)
  ) {
    return NextResponse.json({ error: `yearsRemaining must be an integer between ${MIN_CONTRACT_YEARS} and ${MAX_CONTRACT_YEARS}` }, { status: 400 });
  }

  const id = makeId(name);

  if (clear) {
    await db.delete(playersTable).where(eq(playersTable.id, id));
    await clearRosterCaches();
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (
    yearsRemaining == null && capHit == null && hasNMC == null && hasNTC == null &&
    retired == null && expiryStatus === undefined && expiryYear === undefined &&
    excludeFromRoster === undefined && extensionCapHit == null && !clearExtension &&
    !teamId && !position && age == null && draftYear == null && draftRound == null &&
    draftOverall == null && prospectPtsPace == null
  ) {
    return NextResponse.json({ error: "provide at least one field to update" }, { status: 400 });
  }

  const existing = await db.select().from(playersTable).where(eq(playersTable.id, id));

  if (existing.length > 0) {
    const updates: Record<string, any> = { source: "editor" };
    if (yearsRemaining != null) updates.yearsRemaining = yearsRemaining;
    if (capHit         != null) updates.capHit         = capHit;
    if (hasNMC         != null) updates.hasNmc         = hasNMC;
    if (hasNTC         != null) updates.hasNtc         = hasNTC;
    if (retired        != null) {
      updates.retired = retired;
      updates.retiredDate = retired ? new Date().toISOString().slice(0, 10) : null;
    }
    if (teamId)                  updates.teamId         = teamId;
    if (position)                updates.position       = position;
    if (age           != null)   updates.age            = age;
    if (draftYear     != null)   updates.draftYear      = draftYear;
    if (draftRound    != null)   updates.draftRound     = draftRound;
    if (draftOverall  != null)   updates.draftOverall   = draftOverall;
    if (prospectPtsPace != null) updates.prospectPtsPace = prospectPtsPace;
    if (extensionCapHit != null) {
      updates.extensionCapHit = extensionCapHit;
      updates.extensionYears = extensionYears ?? 1;
      updates.extensionSignedAt = extensionSignedAt;
    } else if (clearExtension) {
      updates.extensionCapHit = null;
      updates.extensionYears = null;
      updates.extensionSignedAt = null;
    }
    if (expiryStatus !== undefined) updates.expiryStatus = expiryStatus;
    if (expiryYear   !== undefined) updates.expiryYear   = expiryYear;
    if (excludeFromRoster !== undefined) updates.excludeFromRoster = excludeFromRoster;
    await db.update(playersTable).set(updates).where(eq(playersTable.id, id));
    await clearRosterCaches();
    return NextResponse.json({ ok: true, destination: "db-update", name });
  } else {
    if (!position) {
      return NextResponse.json({ error: "position is required when adding a new DB player" }, { status: 400 });
    }
    await db.insert(playersTable).values({
      id,
      name,
      position,
      teamId:         teamId ?? undefined,
      age:            age ?? undefined,
      capHit:         capHit         ?? 0.925,
      yearsRemaining: yearsRemaining ?? 1,
      hasNmc:         hasNMC         ?? false,
      hasNtc:         hasNTC         ?? false,
      retired:        retired        ?? false,
      retiredDate:    retired        ? new Date().toISOString().slice(0, 10) : undefined,
      draftYear:      draftYear      ?? undefined,
      draftRound:     draftRound     ?? undefined,
      draftOverall:   draftOverall   ?? undefined,
      prospectPtsPace: prospectPtsPace ?? undefined,
      expiryStatus:   expiryStatus ?? undefined,
      expiryYear:     expiryYear ?? undefined,
      excludeFromRoster: excludeFromRoster ?? undefined,
      extensionCapHit: extensionCapHit ?? undefined,
      extensionYears:  extensionYears ?? undefined,
      extensionSignedAt: extensionSignedAt ?? undefined,
      source:         "editor",
    });
    await clearRosterCaches();
    return NextResponse.json({ ok: true, destination: "db-insert", name });
  }
}

// PUT /api/admin/contracts — ingest contracts into the DB
//
// body: { players: Record<string, { capHit, yearsRemaining }> }
//
// This used to fall back to scraping CapWages when handed an empty body. It no
// longer fetches anything: contracts are maintained by hand now, so the caller
// supplies the data or there is nothing to do. An endpoint that silently went
// and got its own data was also the reason a failed scrape could quietly write
// a half-league of nulls.
export async function PUT(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  await ensureRetirementColumns();
  await ensureCanonicalTeamRows();

  try {
    let body: { players?: Record<string, any> } = {};
    try { body = await req.json(); } catch { /* no body */ }

    const source: Record<string, any> = body.players ?? {};
    if (Object.keys(source).length === 0) {
      return NextResponse.json(
        { error: "No players supplied. Contracts are hand-maintained — post them in the body." },
        { status: 400 },
      );
    }
    // Missing team or position is filled from the NHL rosters below, which is
    // first-party and free. CapWages used to backfill it; it no longer can.
    const needsRosterFallback = Object.entries(source)
      .some(([key, cw]) => !key.includes("__") && !teamIdFromSlug(cw.teamSlug));
    const rosterTeamMap = needsRosterFallback ? await fetchNhlRosterTeamMap() : new Map<string, { teamId: string; position: string | null }>();

    const existing = await db.select({
    id:             playersTable.id,
    name:           playersTable.name,
    position:       playersTable.position,
    teamId:         playersTable.teamId,
    age:            playersTable.age,
    capHit:         playersTable.capHit,
    yearsRemaining: playersTable.yearsRemaining,
    retired:        playersTable.retired,
    source:         playersTable.source,
    expiryStatus:   playersTable.expiryStatus,
  }).from(playersTable);
  const existingById = new Map(existing.map(r => [r.id, r]));
  const existingByName = new Map(existing.map(r => [makeId(r.name), r]));

  let added = 0;
  let updated = 0;
  const newEntries: string[] = [];
  const updatedEntries: string[] = [];
  const metadataMisses: string[] = [];
  const watchNames = new Set(["aatu raty", "brad lambert"]);
  const watch: Record<string, any> = {};

  for (const [key, cw] of Object.entries(source)) {
    if (key.includes("__")) continue;
    const id = makeId(key);
    // Match scraper's CAP_MAX (CBA max = 20% of $104M ceiling); old 16 silently
    // dropped Kaprizov-tier contracts from bulk imports
    if (!cw.capHit || cw.capHit < 0.5 || cw.capHit > 20.8) continue;

    const rosterFallback = rosterTeamMap.get(id);
    const current = existingById.get(id) ?? existingByName.get(id);
    const position = normalisePosition(cw.position) ?? rosterFallback?.position ?? "Unknown";
    const currentTeamId = isValidTeamId(current?.teamId) ? current.teamId : null;
    const teamId = teamIdFromSlug(cw.teamSlug) ?? rosterFallback?.teamId ?? currentTeamId ?? null;
    if (!teamId) metadataMisses.push(key);
    const expiryStatus = normaliseExpiryStatus(cw.expiryStatus);
    const expiryYear = Number.isFinite(cw.expiryYear) && cw.expiryYear > 0 ? cw.expiryYear : null;
    const values = {
      position,
      teamId,
      age:            Number.isFinite(cw.age) && cw.age > 0 ? cw.age : null,
      capHit:         cw.capHit,
      yearsRemaining: cw.yearsRemaining > 0 ? cw.yearsRemaining : 1,
      expiryStatus,
      expiryYear,
    };
    if (watchNames.has(key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
      watch[key] = {
        matchedExisting: Boolean(current),
        currentId: current?.id ?? null,
        currentTeamId,
        sourceTeamSlug: cw.teamSlug ?? null,
        rosterFallbackTeamId: rosterFallback?.teamId ?? null,
        resolvedTeamId: teamId,
        sourcePosition: cw.position ?? null,
        resolvedPosition: position,
        sourceAge: cw.age ?? null,
        resolvedAge: values.age ?? current?.age ?? null,
      };
    }
    if (current) {
      if (current.retired) continue;
      const isEditor = current.source === "editor";
      // Editor rows: update contract facts (capHit, years, position, team, age)
      // but never overwrite hand-curated FA fields (expiryStatus, expiryYear,
      // excludeFromRoster) and keep source as "editor".
      const updates: Record<string, any> = {
        capHit: values.capHit,
        yearsRemaining: values.yearsRemaining,
        source: isEditor ? "editor" : "sync",
      };
      if (position !== "Unknown" && (current.position === "Unknown" || current.position !== position)) {
        updates.position = position;
      }
      if (teamId && current.teamId !== teamId) updates.teamId = teamId;
      if (values.age && current.age !== values.age) updates.age = values.age;
      // Only stamp expiry on non-editor rows that don't already carry a curated
      // FA class, so the seed's known UFA/RFA marks survive a live refresh.
      if (!isEditor && expiryStatus && current.expiryStatus == null) {
        updates.expiryStatus = expiryStatus;
        updates.expiryYear = expiryYear;
      }

      await db.update(playersTable).set(updates).where(eq(playersTable.id, current.id));
      updatedEntries.push(key);
      updated++;
      continue;
    }

    await db.insert(playersTable).values({
      id,
      name:           key,
      position:       values.position,
      teamId:         values.teamId,
      age:            values.age,
      capHit:         values.capHit,
      yearsRemaining: values.yearsRemaining,
      hasNmc:         false,
      hasNtc:         false,
      expiryStatus:   values.expiryStatus,
      expiryYear:     values.expiryYear,
      source:         "sync",
    }).onConflictDoNothing();

    newEntries.push(key);
    added++;
  }

  // ── Position backfill ──────────────────────────────────────────────────────
  // The CapWages scrape only covers active NHL contracts, so seed-only depth and
  // prospect rows stay position "Unknown" (the admin "needs data" pile). Fill
  // them from the live NHL rosters, which carry a position for every rostered
  // player. Editor rows are never touched.
  let positionsBackfilled = 0;
  const unknownPosRows = existing.filter(
    r => r.source !== "editor" && (!r.position || r.position === "Unknown")
  );
  if (unknownPosRows.length > 0) {
    const rosterMap = rosterTeamMap.size > 0 ? rosterTeamMap : await fetchNhlRosterTeamMap();
    for (const r of unknownPosRows) {
      const hit = rosterMap.get(r.id) ?? rosterMap.get(makeId(r.name));
      if (!hit?.position) continue;
      const upd: Record<string, any> = { position: hit.position };
      if (hit.teamId && !isValidTeamId(r.teamId)) upd.teamId = hit.teamId;
      await db.update(playersTable).set(upd).where(eq(playersTable.id, r.id)).catch(() => {});
      positionsBackfilled++;
    }
  }

  const total = await db.select({ id: playersTable.id }).from(playersTable);
  const clearedCacheKeys = await clearRosterCaches();

    return NextResponse.json({
      ok: true,
      added,
      updated,
      positionsBackfilled,
      total: total.length,
      newEntries,
      updatedEntries,
      metadataMisses: metadataMisses.slice(0, 25),
      metadataMissCount: metadataMisses.length,
      watch,
      clearedCacheKeys,
    });
  } catch (e: any) {
    console.error("[Admin Contracts] sync failed:", e);
    return NextResponse.json({ error: e?.message ?? "Contract sync failed" }, { status: 500 });
  }
}
