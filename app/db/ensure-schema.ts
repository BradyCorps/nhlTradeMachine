import { sql } from "drizzle-orm";
import { db as defaultDb } from "./client";

type Database = typeof defaultDb;

// ── Runtime column back-fills ────────────────────────────────────────────────
// These ALTER TABLE statements add columns that post-date the original table
// creation. Each is idempotent: a failure means the column already exists.
//
// They previously ran on nearly every request — including hot read paths like
// roster assembly and every trade query — which added a round-trip of latency
// and opened a concurrency race. They are now memoized per database instance so
// the back-fills run at most once per process (and once per injected test DB).
//
// This remains a safety net only because the committed drizzle/ migrations are
// not yet a complete baseline (there is no 0000 schema snapshot or _journal).
// Once a full migration baseline is generated and applied to Turso at deploy
// time, these helpers — and the callers' ensure* calls — can be removed.

const PLAYER_COLUMN_STATEMENTS = [
  "ALTER TABLE players ADD COLUMN retired INTEGER DEFAULT 0",
  "ALTER TABLE players ADD COLUMN retired_date TEXT",
  "ALTER TABLE players ADD COLUMN draft_overall INTEGER",
  "ALTER TABLE players ADD COLUMN prospect_pts_pace REAL",
  // Single-source-of-truth contract/FA facts + provenance (orthogonal backend).
  "ALTER TABLE players ADD COLUMN expiry_status TEXT",
  "ALTER TABLE players ADD COLUMN expiry_year INTEGER",
  "ALTER TABLE players ADD COLUMN exclude_from_roster INTEGER DEFAULT 0",
  "ALTER TABLE players ADD COLUMN source TEXT DEFAULT 'seed'",
  "ALTER TABLE players ADD COLUMN extension_signed_at TEXT",
];

const PLAYER_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    secondary_position TEXT,
    team_id TEXT,
    age INTEGER,
    cap_hit REAL NOT NULL,
    years_remaining INTEGER NOT NULL,
    has_nmc INTEGER DEFAULT 0,
    has_ntc INTEGER DEFAULT 0,
    is_ltir INTEGER DEFAULT 0,
    is_retained INTEGER DEFAULT 0,
    retained_salary REAL DEFAULT 0,
    draft_year INTEGER,
    draft_round INTEGER,
    draft_overall INTEGER,
    prospect_pts_pace REAL,
    injury_status TEXT,
    extension_cap_hit REAL,
    extension_years INTEGER,
    extension_signed_at TEXT,
    retired INTEGER DEFAULT 0,
    retired_date TEXT,
    expiry_status TEXT,
    expiry_year INTEGER,
    exclude_from_roster INTEGER DEFAULT 0,
    source TEXT DEFAULT 'seed'
  )`,
];

const TEAM_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phase_override TEXT,
    standing_override INTEGER
  )`,
];

// New tables — use CREATE IF NOT EXISTS so they run cleanly from any starting state.
const NEW_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS draft_pick_overrides (
    id TEXT PRIMARY KEY,
    current_owner_id TEXT NOT NULL,
    original_owner_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    year INTEGER NOT NULL,
    is_protected INTEGER DEFAULT 0,
    conditions TEXT,
    updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS fa_overrides (
    id TEXT PRIMARY KEY,
    player_id TEXT,
    player_name TEXT NOT NULL,
    team_slug TEXT,
    force_status TEXT NOT NULL,
    season TEXT NOT NULL,
    notes TEXT,
    updated_at INTEGER
  )`,
  "ALTER TABLE fa_overrides ADD COLUMN player_id TEXT",
];

const TRADE_COLUMN_STATEMENTS = [
  "ALTER TABLE trades ADD COLUMN roster_mutating INTEGER NOT NULL DEFAULT 1",
];

const playerColumnsEnsured = new WeakMap<object, Promise<void>>();
const playerTableEnsured   = new WeakMap<object, Promise<void>>();
const teamTableEnsured     = new WeakMap<object, Promise<void>>();
const tradeColumnsEnsured = new WeakMap<object, Promise<void>>();
const newTablesEnsured    = new WeakMap<object, Promise<void>>();

async function runStatements(database: Database, statements: string[]): Promise<void> {
  for (const statement of statements) {
    try {
      await database.run(sql.raw(statement));
    } catch {
      // Column already exists (or the table is provisioned elsewhere) — ignore.
    }
  }
}

function memoize(
  cache: WeakMap<object, Promise<void>>,
  database: Database,
  statements: string[],
): Promise<void> {
  const existing = cache.get(database);
  if (existing) return existing;
  const pending = runStatements(database, statements).catch((error) => {
    cache.delete(database); // allow a retry if the batch ever fails outright
    throw error;
  });
  cache.set(database, pending);
  return pending;
}

// Back-fill the player columns added after the original table (retirement flags
// and prospect pedigree). Runs at most once per database instance.
export function ensurePlayerColumns(database: Database = defaultDb): Promise<void> {
  return memoize(playerColumnsEnsured, database, PLAYER_COLUMN_STATEMENTS);
}

// Create the base players table when running from an empty local DB. The repo has
// additive migrations but no complete 0000 baseline, so admin recovery flows need
// this before they can sync CapWages rows into a reset database.
export function ensurePlayerTable(database: Database = defaultDb): Promise<void> {
  return memoize(playerTableEnsured, database, PLAYER_TABLE_STATEMENTS);
}

// Create the base teams table for reset/local recovery paths before player rows
// with team_id foreign keys are inserted.
export function ensureTeamTable(database: Database = defaultDb): Promise<void> {
  return memoize(teamTableEnsured, database, TEAM_TABLE_STATEMENTS);
}

// Back-fill the trades.roster_mutating column. Runs at most once per instance.
export function ensureTradeColumns(database: Database = defaultDb): Promise<void> {
  return memoize(tradeColumnsEnsured, database, TRADE_COLUMN_STATEMENTS);
}

const NHL_SNAPSHOT_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS nhl_snapshots (
    id TEXT PRIMARY KEY,
    player_id INTEGER NOT NULL,
    name TEXT,
    season INTEGER NOT NULL,
    source TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    games_played INTEGER,
    goals INTEGER,
    assists INTEGER,
    points INTEGER,
    shooting_pctg REAL,
    oz_pct REAL,
    hd_shots INTEGER,
    hd_shooting_pct REAL,
    hd_finishing_delta REAL,
    payload TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_nhl_snapshots_player ON nhl_snapshots (player_id, season, source)",
];
const nhlSnapshotTableEnsured = new WeakMap<object, Promise<void>>();

// Create the historical NHL snapshot table (perpetual first-party feed).
export function ensureNhlSnapshotTable(database: Database = defaultDb): Promise<void> {
  return memoize(nhlSnapshotTableEnsured, database, NHL_SNAPSHOT_TABLE_STATEMENTS);
}

const TRADE_BLOCK_COLUMN_STATEMENTS = [
  "ALTER TABLE trade_block ADD COLUMN position TEXT",
];
const tradeBlockColumnsEnsured = new WeakMap<object, Promise<void>>();

// Back-fill trade_block.position (same-name player disambiguation).
export function ensureTradeBlockColumns(database: Database = defaultDb): Promise<void> {
  return memoize(tradeBlockColumnsEnsured, database, TRADE_BLOCK_COLUMN_STATEMENTS);
}

// Create the draft_pick_overrides and fa_overrides tables if they don't exist.
export function ensureNewTables(database: Database = defaultDb): Promise<void> {
  return memoize(newTablesEnsured, database, NEW_TABLE_STATEMENTS);
}
