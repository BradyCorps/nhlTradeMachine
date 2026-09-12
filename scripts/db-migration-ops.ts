import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

const JOURNAL_PATH = path.join(process.cwd(), "drizzle", "meta", "_journal.json");
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

type JournalEntry = {
  idx: number;
  tag: string;
};

type MigrationJournal = {
  entries: JournalEntry[];
};

export type MigrationTarget = "isolated" | "production";

export type JournalMigration = JournalEntry & {
  hash: string;
};

export function migrationFolder() {
  return MIGRATIONS_FOLDER;
}

export function readJournal(): JournalMigration[] {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as MigrationJournal;
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error("Migration journal has no entries.");
  }

  const migrations = journal.entries.map(entry => {
    if (!Number.isInteger(entry.idx) || !entry.tag) {
      throw new Error("Migration journal contains an invalid entry.");
    }
    const contents = readFileSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), "utf8");
    return { ...entry, hash: createHash("sha256").update(contents).digest("hex") };
  });

  const tags = new Set(migrations.map(migration => migration.tag));
  const hashes = new Set(migrations.map(migration => migration.hash));
  if (tags.size !== migrations.length || hashes.size !== migrations.length) {
    throw new Error("Migration journal contains duplicate tags or migration contents.");
  }
  return migrations;
}

export function migrationConnection(): { client: Client; target: MigrationTarget } {
  const target = process.env.MIGRATION_TARGET;
  const url = process.env.MIGRATION_DATABASE_URL;
  const authToken = process.env.MIGRATION_DATABASE_AUTH_TOKEN;

  if (target !== "isolated" && target !== "production") {
    throw new Error("Set MIGRATION_TARGET to isolated or production.");
  }
  if (!url || !authToken) {
    throw new Error("MIGRATION_DATABASE_URL and MIGRATION_DATABASE_AUTH_TOKEN are required.");
  }
  if (target === "production" && process.env.CONFIRM_PRODUCTION_MIGRATION !== "APPLY") {
    throw new Error("Production migrations require CONFIRM_PRODUCTION_MIGRATION=APPLY.");
  }

  return { client: createClient({ url, authToken }), target };
}

export async function appliedMigrationHashes(client: Client): Promise<Set<string>> {
  try {
    const result = await client.execute("SELECT hash FROM __drizzle_migrations ORDER BY created_at ASC");
    return new Set(result.rows.map(row => String(row.hash)));
  } catch (error) {
    if (error instanceof Error && /no such table: __drizzle_migrations/i.test(error.message)) {
      return new Set();
    }
    throw error;
  }
}

export async function assertJournalIsCompatible(client: Client, journal: JournalMigration[]) {
  const applied = await appliedMigrationHashes(client);
  const knownHashes = new Set(journal.map(migration => migration.hash));
  const unknownHashes = [...applied].filter(hash => !knownHashes.has(hash));
  if (unknownHashes.length > 0) {
    throw new Error("Database migration journal contains entries not present in this repository; refusing to migrate.");
  }
  return {
    applied: journal.filter(migration => applied.has(migration.hash)),
    pending: journal.filter(migration => !applied.has(migration.hash)),
  };
}
