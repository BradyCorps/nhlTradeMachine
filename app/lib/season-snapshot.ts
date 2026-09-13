// ── season-snapshot.ts ───────────────────────────────────────────────────
//
// DATA-06 foundation: durable, immutable per-season analytical snapshots.
//
// `valuation-snapshot.ts` (DATA-02) makes a single valuation content-addressed
// and reproducible, but nothing persisted it. Rolling the app from 2025-26 to
// 2026-27 therefore overwrote history in place: every surface recomputes from
// the current roster, so "what did the model say about this player last
// season" was unanswerable, and a label change in season-config could silently
// relabel every number. This module is the minimum that fixes that:
//
//   • a row per (season, asOf, modelVersion, player|team), keyed so that a
//     different season, day or model is always a different row;
//   • INSERT ... ON CONFLICT DO NOTHING only — no update path exists, so a
//     backfill re-run is a no-op and a stored season can never be rewritten;
//   • every row states which season's STATS fed it, how many games of ITS OWN
//     season were observed, and which season's CONTRACT ledger priced it, so
//     a 2026-27 preseason row cannot pass as a 2026-27 result and a 2025-26
//     row valued against today's ledger says so.
//
// What this module refuses to invent: games, statistics, fitted values and
// historical contracts. The 2026-27 opening snapshot is explicitly a
// `preseason-baseline` (0 games observed, 2025-26 stats, 2026-27 ledger). The
// 2025-26 snapshot is `completed-season` on 2025-26 stats; its contract
// context is the CURRENT ledger, because that is the only ledger the app
// holds, and the row says so in `contractSeason`.
//
// See docs/analytics/SEASON_SNAPSHOT_CONTRACT.md.

import { createHash } from "node:crypto";
import { eq, isNull, sql } from "drizzle-orm";
import { playerSeasonSnapshots, seasonSnapshotBatches, teamSeasonSnapshots } from "@/app/db/schema";
import { TEAMS_DB } from "@/app/lib/db";
import { SEASON } from "@/app/lib/season-config";
import { XNAV_MODEL_VERSION } from "@/app/lib/data-context";
import { navLabelForPosition } from "@/app/lib/player-terminology";
import { rosterNavByPosition } from "@/app/lib/team-nav-split";
import { snapshotDate, type ValuationSnapshot } from "@/app/lib/valuation-snapshot";
import type { XNAVResult } from "@/app/lib/xnav-engine";

export type SeasonSnapshotCoverage = "completed-season" | "preseason-baseline" | "in-season";

/** Which of the two seasons the app straddles a snapshot describes. */
export type SnapshotSeasonKind = "completed" | "projected";

export interface SeasonSnapshotContext {
  /** The season the rows describe. */
  season: string;
  /** Calendar day (YYYY-MM-DD). */
  asOf: string;
  coverage: SeasonSnapshotCoverage;
  /** Season whose completed statistics fed the engine. */
  statsSeason: string;
  /** Games of `season` itself present in the inputs. 0 at preseason. */
  seasonGamesObserved: number;
  /** Season of the contract ledger that priced the cap context. */
  contractSeason: string;
  modelVersion: string;
  source: string;
  population: string;
  capCeiling: number;
}

export const SEASON_SNAPSHOT_SOURCE =
  "roster-assembly · NHL rosters · MoneyPuck all-situations · contract ledger";
export const PLAYER_SNAPSHOT_POPULATION =
  "players rostered to one of the 32 canonical NHL franchises at asOf with an engine valuation; draft picks and pseudo-team pools excluded";
export const TEAM_SNAPSHOT_POPULATION =
  "one row for each of the 32 canonical NHL franchises; Σ over that franchise's eligible player rows using team-nav-split.ts (G→g, D→d, else f)";

/** The single canonical franchise registry; snapshot code must not maintain its own list. */
export const CANONICAL_NHL_TEAM_IDS = Object.freeze(TEAMS_DB.map(team => team.id));
const CANONICAL_NHL_TEAM_ID_SET = new Set(CANONICAL_NHL_TEAM_IDS);

function assertCanonicalNhlTeamRegistry(): void {
  // Some isolated route tests substitute a deliberately small team fixture.
  // Enforce the real 32-club rule only where a verified batch is created.
  if (CANONICAL_NHL_TEAM_IDS.length !== 32 || CANONICAL_NHL_TEAM_ID_SET.size !== CANONICAL_NHL_TEAM_IDS.length) {
    throw new Error("Canonical NHL team registry must contain exactly 32 unique franchises.");
  }
}

export function isCanonicalNhlTeamId(teamId: string | null | undefined): teamId is string {
  return Boolean(teamId && CANONICAL_NHL_TEAM_ID_SET.has(teamId));
}

/**
 * The context for one of the two seasons the app currently straddles.
 * `completed` is `SEASON.replaySeason` (2025-26): its stats are final.
 * `projected` is `SEASON.label` (2026-27): no games have been observed, so it
 * is a preseason baseline on the completed season's stats — never presented
 * as a 2026-27 result.
 */
export function seasonSnapshotContext(
  kind: SnapshotSeasonKind,
  options: { asOf?: string; capCeiling?: number; modelVersion?: string } = {},
): SeasonSnapshotContext {
  const asOf = options.asOf ?? snapshotDate();
  const shared = {
    asOf,
    statsSeason: SEASON.replaySeason,
    contractSeason: SEASON.label,
    modelVersion: options.modelVersion ?? XNAV_MODEL_VERSION,
    source: SEASON_SNAPSHOT_SOURCE,
    population: PLAYER_SNAPSHOT_POPULATION,
    capCeiling: options.capCeiling ?? SEASON.capCeiling,
  };
  return kind === "completed"
    ? { ...shared, season: SEASON.replaySeason, coverage: "completed-season", seasonGamesObserved: 82 }
    : { ...shared, season: SEASON.label, coverage: "preseason-baseline", seasonGamesObserved: 0 };
}

export interface PlayerSeasonSnapshotRow {
  id: string;
  playerId: string;
  teamId: string | null;
  season: string;
  asOf: string;
  source: string;
  coverage: SeasonSnapshotCoverage;
  statsSeason: string;
  seasonGamesObserved: number;
  contractSeason: string;
  modelVersion: string;
  valuationSnapshotId: string;
  position: string;
  navLabel: string;
  total: number;
  components: string;
  marketValue: number | null;
  surplus: number | null;
  uncertaintyLow: number | null;
  uncertaintyHigh: number | null;
  contract: string;
  population: string;
  /** Null identifies a legacy DATA-06 row without verified batch provenance. */
  batchId: string | null;
  createdAt: number;
}

export interface TeamSeasonSnapshotRow {
  id: string;
  teamId: string;
  season: string;
  asOf: string;
  source: string;
  coverage: SeasonSnapshotCoverage;
  statsSeason: string;
  contractSeason: string;
  modelVersion: string;
  rosterCount: number;
  fNav: number;
  dNav: number;
  gNav: number;
  xnavSigned: number;
  fNavPositive: number;
  dNavPositive: number;
  gNavPositive: number;
  xnavPositive: number;
  capCeiling: number;
  capCommitted: number;
  population: string;
  /** Null identifies a legacy DATA-06 row without verified batch provenance. */
  batchId: string | null;
  createdAt: number;
}

export const playerSeasonSnapshotId = (ctx: SeasonSnapshotContext, playerId: string): string =>
  `${ctx.season}:${ctx.asOf}:${ctx.modelVersion}:${playerId}`;
export const teamSeasonSnapshotId = (ctx: SeasonSnapshotContext, teamId: string): string =>
  `${ctx.season}:${ctx.asOf}:${ctx.modelVersion}:${teamId}`;

/** Legacy DATA-06 rows keep the historical context-scoped identity above. */
export const batchPlayerSeasonSnapshotId = (batchId: string, playerId: string): string =>
  `${batchId}:player:${playerId}`;
export const batchTeamSeasonSnapshotId = (batchId: string, teamId: string): string =>
  `${batchId}:team:${teamId}`;

export interface SnapshotPlayerInput {
  id: string;
  teamId?: string | null;
  position: string;
  capHit?: number | null;
}

/**
 * One immutable row from an engine result that already carries its DATA-02
 * envelope. Throws rather than guessing when the envelope is absent or was
 * struck for a different model version — a season row must never carry a
 * valuation id it cannot be reproduced from.
 */
export function buildPlayerSeasonSnapshotRow(
  player: SnapshotPlayerInput,
  result: XNAVResult,
  ctx: SeasonSnapshotContext,
  now: number = Date.now(),
): PlayerSeasonSnapshotRow {
  const snapshot: ValuationSnapshot | undefined = result.snapshot;
  if (!snapshot) throw new Error(`Player ${player.id} has no valuation snapshot envelope.`);
  if (snapshot.modelVersion !== ctx.modelVersion) {
    throw new Error(`Player ${player.id} valuation is ${snapshot.modelVersion}, context is ${ctx.modelVersion}.`);
  }
  return {
    id: playerSeasonSnapshotId(ctx, player.id),
    playerId: player.id,
    teamId: player.teamId ?? null,
    season: ctx.season,
    asOf: ctx.asOf,
    source: ctx.source,
    coverage: ctx.coverage,
    statsSeason: ctx.statsSeason,
    seasonGamesObserved: ctx.seasonGamesObserved,
    contractSeason: ctx.contractSeason,
    modelVersion: ctx.modelVersion,
    valuationSnapshotId: snapshot.snapshotId,
    position: player.position,
    navLabel: navLabelForPosition(player.position),
    total: snapshot.total,
    components: JSON.stringify(snapshot.components ?? []),
    marketValue: snapshot.marketValue,
    surplus: snapshot.surplus,
    uncertaintyLow: snapshot.uncertainty?.low ?? null,
    uncertaintyHigh: snapshot.uncertainty?.high ?? null,
    contract: JSON.stringify(snapshot.contract),
    population: ctx.population,
    batchId: null,
    createdAt: now,
  };
}

/**
 * Team rows from the player rows of the same context. Uses
 * `rosterNavByPosition` — the same aggregation the Teams page uses — so the
 * stored F/D/G/X-NAV reconcile exactly with what is displayed, and the signed
 * and positive-only totals are stored separately, never under one label.
 */
export function buildTeamSeasonSnapshotRows(
  players: Array<SnapshotPlayerInput & { total: number }>,
  ctx: SeasonSnapshotContext,
  now: number = Date.now(),
): TeamSeasonSnapshotRow[] {
  const byTeam = new Map<string, Array<SnapshotPlayerInput & { total: number }>>();
  for (const p of players) {
    if (!isCanonicalNhlTeamId(p.teamId)) continue;
    const list = byTeam.get(p.teamId) ?? [];
    list.push(p);
    byTeam.set(p.teamId, list);
  }
  return [...byTeam.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([teamId, roster]) => {
    const split = rosterNavByPosition(roster.map(p => ({ position: p.position, nav: p.total })));
    return {
      id: teamSeasonSnapshotId(ctx, teamId),
      teamId,
      season: ctx.season,
      asOf: ctx.asOf,
      source: ctx.source,
      coverage: ctx.coverage,
      statsSeason: ctx.statsSeason,
      contractSeason: ctx.contractSeason,
      modelVersion: ctx.modelVersion,
      rosterCount: roster.length,
      fNav: split.signed.f,
      dNav: split.signed.d,
      gNav: split.signed.g,
      xnavSigned: split.signed.total,
      fNavPositive: split.f,
      dNavPositive: split.d,
      gNavPositive: split.g,
      xnavPositive: split.xnav,
      capCeiling: ctx.capCeiling,
      capCommitted: Math.round(roster.reduce((s, p) => s + (p.capHit ?? 0), 0) * 1000) / 1000,
      population: TEAM_SNAPSHOT_POPULATION,
      batchId: null,
      createdAt: now,
    };
  });
}

/**
 * Build both row families for one season context from an assembled roster
 * and its league NAV map. Players without a valuation (engine skipped them)
 * or that are picks are left out — never valued at zero.
 */
export function buildSeasonSnapshotRows(
  players: Array<SnapshotPlayerInput & { name?: string }>,
  navMap: Record<string, XNAVResult>,
  ctx: SeasonSnapshotContext,
  now: number = Date.now(),
): { players: PlayerSeasonSnapshotRow[]; teams: TeamSeasonSnapshotRow[]; skipped: string[]; excluded: string[] } {
  const rows: PlayerSeasonSnapshotRow[] = [];
  const skipped: string[] = [];
  const excluded: string[] = [];
  const valued: Array<SnapshotPlayerInput & { total: number }> = [];
  for (const p of players) {
    if (p.position === "Pick") continue;
    // Free agents and any other pseudo-team affiliations remain available to
    // their owning product flows, but are outside this completed NHL-roster
    // snapshot contract and must not form a player or team batch member.
    if (!isCanonicalNhlTeamId(p.teamId)) { excluded.push(p.id); continue; }
    const result = navMap[p.id];
    if (!result?.snapshot) { skipped.push(p.id); continue; }
    const row = buildPlayerSeasonSnapshotRow(p, result, ctx, now);
    rows.push(row);
    valued.push({ ...p, total: row.total });
  }
  return { players: rows, teams: buildTeamSeasonSnapshotRows(valued, ctx, now), skipped, excluded };
}

// ── Persistence ───────────────────────────────────────────────────────────

type SnapshotDb = {
  insert: (...args: any[]) => any;
  run: (query: any) => Promise<unknown>;
  select: (...args: any[]) => any;
};

export interface WriteSeasonSnapshotsResult {
  players: { inserted: number; skipped: number };
  teams: { inserted: number; skipped: number };
}

const CHUNK = 200;

async function insertIgnore<T extends { id: string }>(db: SnapshotDb, table: any, rows: T[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const returned = await db.insert(table).values(chunk).onConflictDoNothing().returning({ id: table.id });
    inserted += returned.length;
  }
  return inserted;
}

/**
 * Idempotent: rows whose id already exists are left exactly as they were.
 * There is deliberately no update or upsert here. Returns inserted/skipped
 * counts so a backfill run is legible afterwards.
 */
export async function writeSeasonSnapshots(
  db: SnapshotDb,
  rows: { players: PlayerSeasonSnapshotRow[]; teams: TeamSeasonSnapshotRow[] },
): Promise<WriteSeasonSnapshotsResult> {
  const playersInserted = await insertIgnore(db, playerSeasonSnapshots, rows.players);
  const teamsInserted = await insertIgnore(db, teamSeasonSnapshots, rows.teams);
  return {
    players: { inserted: playersInserted, skipped: rows.players.length - playersInserted },
    teams: { inserted: teamsInserted, skipped: rows.teams.length - teamsInserted },
  };
}

/** Per-season row counts — what history the database actually holds. */
export async function seasonSnapshotInventory(db: SnapshotDb, options: { unbatchedOnly?: boolean } = {}): Promise<Array<{
  season: string; asOf: string; modelVersion: string; players: number; teams: number;
}>> {
  const playerQuery = db
    .select({
      season: playerSeasonSnapshots.season,
      asOf: playerSeasonSnapshots.asOf,
      modelVersion: playerSeasonSnapshots.modelVersion,
      n: sql<number>`count(*)`,
    })
    .from(playerSeasonSnapshots);
  const teamQuery = db
    .select({
      season: teamSeasonSnapshots.season,
      asOf: teamSeasonSnapshots.asOf,
      modelVersion: teamSeasonSnapshots.modelVersion,
      n: sql<number>`count(*)`,
    })
    .from(teamSeasonSnapshots);
  const players = await (options.unbatchedOnly ? playerQuery.where(isNull(playerSeasonSnapshots.batchId)) : playerQuery)
    .groupBy(playerSeasonSnapshots.season, playerSeasonSnapshots.asOf, playerSeasonSnapshots.modelVersion);
  const teams = await (options.unbatchedOnly ? teamQuery.where(isNull(teamSeasonSnapshots.batchId)) : teamQuery)
    .groupBy(teamSeasonSnapshots.season, teamSeasonSnapshots.asOf, teamSeasonSnapshots.modelVersion);
  const key = (r: { season: string; asOf: string; modelVersion: string }) => `${r.season}|${r.asOf}|${r.modelVersion}`;
  const out = new Map<string, { season: string; asOf: string; modelVersion: string; players: number; teams: number }>();
  for (const r of players as any[]) out.set(key(r), { season: r.season, asOf: r.asOf, modelVersion: r.modelVersion, players: Number(r.n), teams: 0 });
  for (const r of teams as any[]) {
    const cur = out.get(key(r)) ?? { season: r.season, asOf: r.asOf, modelVersion: r.modelVersion, players: 0, teams: 0 };
    cur.teams = Number(r.n);
    out.set(key(r), cur);
  }
  return [...out.values()].sort((a, b) => a.season.localeCompare(b.season) || a.asOf.localeCompare(b.asOf));
}

// ── Verified capture batches (Labs provenance boundary) ─────────────────────

export type SeasonSnapshotBatchStatus = "CAPTURING" | "COMPLETE" | "FAILED";

export interface SeasonSnapshotBatch {
  id: string;
  season: string;
  snapshotKind: SnapshotSeasonKind;
  asOf: string;
  coverage: SeasonSnapshotCoverage;
  statsSeason: string;
  contractSeason: string;
  modelVersion: string;
  status: SeasonSnapshotBatchStatus;
  expectedPlayers: number;
  capturedPlayers: number;
  expectedTeams: number;
  capturedTeams: number;
  skippedPlayers: number;
  source: string;
  population: string;
  integrityHash: string;
  createdBy: string;
  createdAction: string;
  createdAt: number;
  completedAt: number | null;
  failureReason: string | null;
}

export interface SeasonSnapshotBatchCaptureResult {
  batch: SeasonSnapshotBatch;
  rows: { players: number; teams: number; skipped: number };
  idempotent: boolean;
}

export class SeasonSnapshotBatchCaptureError extends Error {
  constructor(
    message: string,
    readonly batchId: string,
  ) {
    super(message);
    this.name = "SeasonSnapshotBatchCaptureError";
  }
}

type BatchDb = SnapshotDb & {
  transaction: <T>(callback: (tx: any) => Promise<T>) => Promise<T>;
  update: (...args: any[]) => any;
};

const canonicalJson = (value: unknown): string => JSON.stringify(value);

/**
 * Hash exactly the immutable context and rows intended for one capture. It is
 * not a model artifact hash: it proves that the batch metadata and its player
 * and team membership have not been substituted after capture.
 */
export function seasonSnapshotBatchIntegrityHash(
  ctx: SeasonSnapshotContext,
  snapshotKind: SnapshotSeasonKind,
  rows: { players: PlayerSeasonSnapshotRow[]; teams: TeamSeasonSnapshotRow[]; skipped: string[]; excluded: string[] },
): string {
  const payload = {
    context: {
      season: ctx.season,
      snapshotKind,
      asOf: ctx.asOf,
      coverage: ctx.coverage,
      statsSeason: ctx.statsSeason,
      contractSeason: ctx.contractSeason,
      modelVersion: ctx.modelVersion,
      source: ctx.source,
      population: ctx.population,
    },
    players: [...rows.players]
      .sort((a, b) => a.playerId.localeCompare(b.playerId))
      .map(({ playerId, teamId, valuationSnapshotId, total, components, contract }) => ({ playerId, teamId, valuationSnapshotId, total, components, contract })),
    teams: [...rows.teams]
      .sort((a, b) => a.teamId.localeCompare(b.teamId))
      .map(({ teamId, rosterCount, fNav, dNav, gNav, xnavSigned, xnavPositive }) => ({ teamId, rosterCount, fNav, dNav, gNav, xnavSigned, xnavPositive })),
    skipped: [...rows.skipped].sort(),
    excluded: [...rows.excluded].sort(),
  };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export const seasonSnapshotBatchId = (ctx: SeasonSnapshotContext, integrityHash: string): string =>
  `snapshot:${ctx.season}:${ctx.asOf}:${ctx.modelVersion}:${integrityHash.slice(0, 16)}`;

export function assertSeasonSnapshotBatchRows(
  ctx: SeasonSnapshotContext,
  rows: { players: PlayerSeasonSnapshotRow[]; teams: TeamSeasonSnapshotRow[]; skipped: string[]; excluded: string[] },
): void {
  assertCanonicalNhlTeamRegistry();
  const unique = (values: string[], kind: string) => {
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${kind} in season snapshot batch.`);
  };
  if (!ctx.season || !ctx.asOf || !ctx.coverage || !ctx.statsSeason || !ctx.contractSeason || !ctx.modelVersion || !ctx.source || !ctx.population) {
    throw new Error("Season snapshot batch requires complete provenance metadata.");
  }
  unique(rows.players.map(row => row.playerId), "player ID");
  unique(rows.teams.map(row => row.teamId), "team ID");
  unique(rows.players.map(row => row.id), "player row ID");
  unique(rows.teams.map(row => row.id), "team row ID");
  if (rows.players.some(row => !isCanonicalNhlTeamId(row.teamId))) {
    throw new Error("Player rows contain a non-canonical NHL team membership.");
  }
  if (rows.teams.some(row => !isCanonicalNhlTeamId(row.teamId))) {
    throw new Error("Team rows contain a non-canonical NHL team membership.");
  }
  const teamIds = new Set(rows.teams.map(row => row.teamId));
  if (teamIds.size !== CANONICAL_NHL_TEAM_IDS.length || CANONICAL_NHL_TEAM_IDS.some(teamId => !teamIds.has(teamId))) {
    throw new Error("Snapshot batch is missing canonical NHL team membership.");
  }
  if (rows.players.some(row => row.season !== ctx.season || row.asOf !== ctx.asOf || row.coverage !== ctx.coverage || row.modelVersion !== ctx.modelVersion)) {
    throw new Error("Player rows do not share the batch season context.");
  }
  if (rows.teams.some(row => row.season !== ctx.season || row.asOf !== ctx.asOf || row.coverage !== ctx.coverage || row.modelVersion !== ctx.modelVersion)) {
    throw new Error("Team rows do not share the batch season context.");
  }
}

const asBatch = (row: any): SeasonSnapshotBatch => ({
  ...row,
  snapshotKind: row.snapshotKind as SnapshotSeasonKind,
  coverage: row.coverage as SeasonSnapshotCoverage,
  status: row.status as SeasonSnapshotBatchStatus,
  completedAt: row.completedAt ?? null,
  failureReason: row.failureReason ?? null,
});

async function recordBatchFailure(
  db: BatchDb,
  batch: SeasonSnapshotBatch,
  reason: string,
): Promise<void> {
  const existing = await db.select().from(seasonSnapshotBatches).where(eq(seasonSnapshotBatches.id, batch.id));
  if (existing[0]?.status === "COMPLETE") return;
  if (existing[0]) {
    await db.update(seasonSnapshotBatches)
      .set({ status: "FAILED", failureReason: reason, capturedPlayers: 0, capturedTeams: 0, completedAt: null })
      .where(eq(seasonSnapshotBatches.id, batch.id));
    return;
  }
  await db.insert(seasonSnapshotBatches).values({ ...batch, status: "FAILED", failureReason: reason, capturedPlayers: 0, capturedTeams: 0, completedAt: null });
}

/**
 * Atomically capture one coherent player/team dataset. A COMPLETE batch is
 * immutable and an identical re-run returns that batch without rewriting rows.
 * Rows that existed before batches retain null batchId and therefore cannot be
 * silently adopted as Labs provenance.
 */
export async function captureSeasonSnapshotBatch(
  db: BatchDb,
  options: {
    snapshotKind: SnapshotSeasonKind;
    context: SeasonSnapshotContext;
    players: Array<SnapshotPlayerInput & { name?: string }>;
    navMap: Record<string, XNAVResult>;
    createdBy: string;
    createdAction: string;
    now?: number;
  },
): Promise<SeasonSnapshotBatchCaptureResult> {
  if (typeof db.transaction !== "function") throw new Error("Season snapshot batches require transactional database support.");
  assertCanonicalNhlTeamRegistry();
  const now = options.now ?? Date.now();
  const rows = buildSeasonSnapshotRows(options.players, options.navMap, options.context, now);
  const integrityHash = seasonSnapshotBatchIntegrityHash(options.context, options.snapshotKind, rows);
  const batch: SeasonSnapshotBatch = {
    id: seasonSnapshotBatchId(options.context, integrityHash),
    season: options.context.season,
    snapshotKind: options.snapshotKind,
    asOf: options.context.asOf,
    coverage: options.context.coverage,
    statsSeason: options.context.statsSeason,
    contractSeason: options.context.contractSeason,
    modelVersion: options.context.modelVersion,
    status: "CAPTURING",
    expectedPlayers: rows.players.length,
    capturedPlayers: 0,
    // Team completeness is anchored to the authoritative franchise registry,
    // never to whatever affiliations happened to appear in an input payload.
    expectedTeams: CANONICAL_NHL_TEAM_IDS.length,
    capturedTeams: 0,
    skippedPlayers: rows.skipped.length,
    source: options.context.source,
    population: options.context.population,
    integrityHash,
    createdBy: options.createdBy,
    createdAction: options.createdAction,
    createdAt: now,
    completedAt: null,
    failureReason: null,
  };

  try {
    assertSeasonSnapshotBatchRows(options.context, rows);
    return await db.transaction(async (tx) => {
      const existingRows = await tx.select().from(seasonSnapshotBatches).where(eq(seasonSnapshotBatches.id, batch.id));
      const existing = existingRows[0] ? asBatch(existingRows[0]) : null;
      if (existing?.status === "COMPLETE") {
        if (existing.integrityHash !== integrityHash) throw new Error("Completed snapshot batch integrity mismatch.");
        return { batch: existing, rows: { players: existing.capturedPlayers, teams: existing.capturedTeams, skipped: existing.skippedPlayers }, idempotent: true };
      }
      if (existing?.status === "CAPTURING") throw new Error("Season snapshot batch is already capturing.");
      if (existing) {
        await tx.update(seasonSnapshotBatches).set({ ...batch, status: "CAPTURING", failureReason: null }).where(eq(seasonSnapshotBatches.id, batch.id));
      } else {
        await tx.insert(seasonSnapshotBatches).values(batch);
      }

      const membership = {
        players: rows.players.map(row => ({ ...row, id: batchPlayerSeasonSnapshotId(batch.id, row.playerId), batchId: batch.id })),
        teams: rows.teams.map(row => ({ ...row, id: batchTeamSeasonSnapshotId(batch.id, row.teamId), batchId: batch.id })),
      };
      const written = await writeSeasonSnapshots(tx, membership);
      if (written.players.inserted !== batch.expectedPlayers || written.teams.inserted !== batch.expectedTeams) {
        throw new Error(`Incomplete snapshot batch: expected ${batch.expectedPlayers}/${batch.expectedTeams}, inserted ${written.players.inserted}/${written.teams.inserted}.`);
      }

      const capturedPlayers = await tx.select().from(playerSeasonSnapshots).where(eq(playerSeasonSnapshots.batchId, batch.id));
      const capturedTeams = await tx.select().from(teamSeasonSnapshots).where(eq(teamSeasonSnapshots.batchId, batch.id));
      if (capturedPlayers.length !== batch.expectedPlayers || capturedTeams.length !== batch.expectedTeams) {
        throw new Error("Snapshot batch membership count does not match its expected population.");
      }
      if (
        capturedPlayers.some((row: any) => row.season !== batch.season || row.batchId !== batch.id || row.id !== batchPlayerSeasonSnapshotId(batch.id, row.playerId))
        || capturedTeams.some((row: any) => row.season !== batch.season || row.batchId !== batch.id || row.id !== batchTeamSeasonSnapshotId(batch.id, row.teamId))
      ) {
        throw new Error("Snapshot batch contains rows outside its declared season or batch-scoped membership.");
      }

      const complete: SeasonSnapshotBatch = { ...batch, status: "COMPLETE", capturedPlayers: capturedPlayers.length, capturedTeams: capturedTeams.length, completedAt: now };
      await tx.update(seasonSnapshotBatches)
        .set({ status: complete.status, capturedPlayers: complete.capturedPlayers, capturedTeams: complete.capturedTeams, completedAt: complete.completedAt, failureReason: null })
        .where(eq(seasonSnapshotBatches.id, batch.id));
      return { batch: complete, rows: { players: rows.players.length, teams: rows.teams.length, skipped: rows.skipped.length }, idempotent: false };
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown snapshot batch capture failure.";
    await recordBatchFailure(db, batch, reason);
    throw new SeasonSnapshotBatchCaptureError(reason, batch.id);
  }
}

/** Only COMPLETE batches are eligible as Analytics Labs dataset provenance. */
export async function requireCompleteSeasonSnapshotBatch(db: SnapshotDb, batchId: string): Promise<SeasonSnapshotBatch> {
  const rows = await db.select().from(seasonSnapshotBatches).where(eq(seasonSnapshotBatches.id, batchId));
  const batch = rows[0] ? asBatch(rows[0]) : null;
  if (!batch || batch.status !== "COMPLETE") throw new Error(`Season snapshot batch ${batchId} is not COMPLETE.`);
  if (batch.capturedPlayers !== batch.expectedPlayers || batch.capturedTeams !== batch.expectedTeams) {
    throw new Error(`Season snapshot batch ${batchId} is incomplete.`);
  }
  return batch;
}

/** Minimal operator inventory; legacy rows are intentionally reported separately. */
export async function seasonSnapshotBatchInventory(db: SnapshotDb): Promise<SeasonSnapshotBatch[]> {
  const rows = await db.select().from(seasonSnapshotBatches);
  const batches: SeasonSnapshotBatch[] = rows.map(asBatch);
  return batches.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

// ── Public season reference (API contract) ───────────────────────────────

export interface SeasonReference {
  /** The season being projected / operated in. */
  projectedSeason: string;
  /** The completed season whose statistics are the engine's baseline. */
  statsSeason: string;
  /** Games of the projected season present in the inputs. */
  projectedSeasonGamesObserved: number;
  /** Season of the contract ledger. */
  contractSeason: string;
  modelVersion: string;
  /** Calendar day valuations are struck for — the day component of every DATA-02 id. */
  valuationAsOf: string;
  /** How a per-player valuation id is formed; the id itself is on each valuation. */
  valuationSnapshotIdScheme: "content-addressed: {playerId}-{asOf}-{sha256(inputs|asOf|model)[0:16]}";
  /** How a persisted season row is keyed. */
  seasonSnapshotIdScheme: "{season}:{asOf}:{modelVersion}:{playerId|teamId}";
  coverage: SeasonSnapshotCoverage;
}

/**
 * The season identity every league payload carries. Never substitutes one
 * season for another: `projectedSeason` and `statsSeason` are named
 * separately and `projectedSeasonGamesObserved` says how much of the
 * projected season is real.
 */
export function buildSeasonReference(options: { asOf?: string; modelVersion?: string } = {}): SeasonReference {
  const projected = seasonSnapshotContext("projected", options);
  return {
    projectedSeason: projected.season,
    statsSeason: projected.statsSeason,
    projectedSeasonGamesObserved: projected.seasonGamesObserved,
    contractSeason: projected.contractSeason,
    modelVersion: projected.modelVersion,
    valuationAsOf: projected.asOf,
    valuationSnapshotIdScheme: "content-addressed: {playerId}-{asOf}-{sha256(inputs|asOf|model)[0:16]}",
    seasonSnapshotIdScheme: "{season}:{asOf}:{modelVersion}:{playerId|teamId}",
    coverage: projected.coverage,
  };
}
