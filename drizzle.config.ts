import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Explicitly load the .env file so the CLI knows about Turso
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
