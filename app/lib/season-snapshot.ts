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

import { sql } from "drizzle-orm";
import { playerSeasonSnapshots, teamSeasonSnapshots } from "@/app/db/schema";
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
  "players on the 32 assembled NHL rosters at asOf with an engine valuation; draft picks excluded";
export const TEAM_SNAPSHOT_POPULATION =
  "Σ over that team's player rows; positional buckets per team-nav-split.ts (G→g, D→d, else f)";

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
  createdAt: number;
}

export const playerSeasonSnapshotId = (ctx: SeasonSnapshotContext, playerId: string): string =>
  `${ctx.season}:${ctx.asOf}:${ctx.modelVersion}:${playerId}`;
export const teamSeasonSnapshotId = (ctx: SeasonSnapshotContext, teamId: string): string =>
  `${ctx.season}:${ctx.asOf}:${ctx.modelVersion}:${teamId}`;

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
    if (!p.teamId) continue;
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
): { players: PlayerSeasonSnapshotRow[]; teams: TeamSeasonSnapshotRow[]; skipped: string[] } {
  const rows: PlayerSeasonSnapshotRow[] = [];
  const skipped: string[] = [];
  const valued: Array<SnapshotPlayerInput & { total: number }> = [];
  for (const p of players) {
    if (p.position === "Pick") continue;
    const result = navMap[p.id];
    if (!result?.snapshot) { skipped.push(p.id); continue; }
    const row = buildPlayerSeasonSnapshotRow(p, result, ctx, now);
    rows.push(row);
    valued.push({ ...p, total: row.total });
  }
  return { players: rows, teams: buildTeamSeasonSnapshotRows(valued, ctx, now), skipped };
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
export async function seasonSnapshotInventory(db: SnapshotDb): Promise<Array<{
  season: string; asOf: string; modelVersion: string; players: number; teams: number;
}>> {
  const players = await db
    .select({
      season: playerSeasonSnapshots.season,
      asOf: playerSeasonSnapshots.asOf,
      modelVersion: playerSeasonSnapshots.modelVersion,
      n: sql<number>`count(*)`,
    })
    .from(playerSeasonSnapshots)
    .groupBy(playerSeasonSnapshots.season, playerSeasonSnapshots.asOf, playerSeasonSnapshots.modelVersion);
  const teams = await db
    .select({
      season: teamSeasonSnapshots.season,
      asOf: teamSeasonSnapshots.asOf,
      modelVersion: teamSeasonSnapshots.modelVersion,
      n: sql<number>`count(*)`,
    })
    .from(teamSeasonSnapshots)
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
