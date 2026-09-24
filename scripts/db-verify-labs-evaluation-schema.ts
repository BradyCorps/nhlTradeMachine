import { migrationConnection } from "./db-migration-ops";
import { verifyLabsEvaluationSchema } from "./labs-evaluation-schema-verifier";

async function main() {
  const { client, target } = migrationConnection();
  try {
    console.log(JSON.stringify({ target, ...await verifyLabsEvaluationSchema(client) }));
  } finally {
    client.close();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Labs evaluation schema verification failed.");
  process.exitCode = 1;
});
