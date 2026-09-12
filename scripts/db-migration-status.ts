import { assertJournalIsCompatible, migrationConnection, readJournal } from "./db-migration-ops";

async function main() {
  const { client, target } = migrationConnection();
  try {
    const status = await assertJournalIsCompatible(client, readJournal());
    console.log(JSON.stringify({
      target,
      applied: status.applied.map(migration => migration.tag),
      pending: status.pending.map(migration => migration.tag),
    }));
  } finally {
    client.close();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Migration status failed.");
  process.exitCode = 1;
});
