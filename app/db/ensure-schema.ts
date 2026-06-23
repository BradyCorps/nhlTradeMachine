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
];

const TRADE_COLUMN_STATEMENTS = [
  "ALTER TABLE trades ADD COLUMN roster_mutating INTEGER NOT NULL DEFAULT 1",
];

const playerColumnsEnsured = new WeakMap<object, Promise<void>>();
const tradeColumnsEnsured = new WeakMap<object, Promise<void>>();

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

// Back-fill the trades.roster_mutating column. Runs at most once per instance.
export function ensureTradeColumns(database: Database = defaultDb): Promise<void> {
  return memoize(tradeColumnsEnsured, database, TRADE_COLUMN_STATEMENTS);
}
