import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  appliedMigrationHashes,
  assertJournalIsCompatible,
  migrationConnection,
  migrationFolder,
  readJournal,
} from "./db-migration-ops";

async function main() {
  const { client, target } = migrationConnection();
  try {
    const journal = readJournal();
    const before = await assertJournalIsCompatible(client, journal);
    if (before.pending.length > 0) {
      await migrate(drizzle(client), { migrationsFolder: migrationFolder() });
    }

    const applied = await appliedMigrationHashes(client);
    const stillPending = journal.filter(migration => !applied.has(migration.hash));
    if (stillPending.length > 0) {
      throw new Error("Migration completed without recording every journal entry.");
    }
    console.log(JSON.stringify({
      target,
      appliedNow: before.pending.map(migration => migration.tag),
      alreadyApplied: before.applied.map(migration => migration.tag),
    }));
  } finally {
    client.close();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
});
