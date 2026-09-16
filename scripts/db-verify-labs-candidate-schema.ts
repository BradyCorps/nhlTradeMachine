import { assertJournalIsCompatible, migrationConnection, readJournal } from "./db-migration-ops";
import { verifyLabsCandidateSchema } from "./labs-candidate-schema-verifier";

async function main() {
  const { client, target } = migrationConnection();
  try {
    const status = await assertJournalIsCompatible(client, readJournal());
    if (status.pending.length > 0) throw new Error(`Migration journal is still pending: ${status.pending.map(migration => migration.tag).join(", ")}`);
    console.log(JSON.stringify({ target, applied: status.applied.map(migration => migration.tag), ...await verifyLabsCandidateSchema(client) }));
  } finally {
    client.close();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Labs candidate schema verification failed.");
  process.exitCode = 1;
});
