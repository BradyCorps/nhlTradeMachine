import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load env so the CLI knows about Turso. Prefer .env.local (Next.js convention);
// fall back to .env. dotenv does not override already-set vars, so the first hit wins.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dialect: "turso", // Use the turso dialect!
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
