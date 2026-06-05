import { config } from "dotenv";
config({ path: ".env" });

// Dynamically import db inside main() so dotenv runs BEFORE the client is created
import { teams, players } from "./schema";
import { TEAMS_DB } from "../lib/db";
import fs from "fs";
import path from "path";

async function main() {
  const { db } = await import("./client");
  console.log("🌱 Starting database seed...");

  // 1. Seed Teams
  console.log("Seeding teams...");
  for (const team of TEAMS_DB) {
    await db.insert(teams).values({
      id: team.id,
      name: team.name,
      // We will leave phaseOverride and standingOverride null for now
    }).onConflictDoNothing();
  }
  console.log("✅ Teams seeded.");

  // 2. Seed Players from contracts.bundled.json
  console.log("Seeding players from contracts.bundled.json...");
  
  const contractsPath = path.join(process.cwd(), "app", "data", "contracts.bundled.json");
  if (!fs.existsSync(contractsPath)) {
    console.error("❌ Could not find contracts.bundled.json!");
    process.exit(1);
  }

  const rawData = fs.readFileSync(contractsPath, "utf-8");
  const contracts = JSON.parse(rawData);

  let playerCount = 0;
  
  // contracts.json has keys like "Connor McDavid" or "Connor McDavid__C" or "Connor McDavid__edm"
  // We need to parse them out. The base name is the first part.
  // Actually, we should just read the base keys without suffixes if possible, OR
  // maybe it's safer to just insert everyone. Let's do a simple parsing approach:
  
  for (const [key, data] of Object.entries(contracts) as [string, any][]) {
    // Skip keys with __ to avoid duplicates, or maybe we need them? 
    // In your codebase, the scraper creates __team and __position suffixes.
    // Let's just grab the base players for now to avoid duplicate inserts.
    if (key.includes("__")) continue;

    // Generate a simple unique ID
    const playerId = key.toLowerCase().replace(/[^a-z0-9]/g, "");

    await db.insert(players).values({
      id: playerId,
      name: key,
      position: "Unknown", // We'll update this from live scrape later or set a default
      teamId: null, // Will be linked when scraped live or set manually
      age: 0,
      capHit: data.capHit ?? 0,
      yearsRemaining: data.yearsRemaining ?? 1,
      hasNmc: data.hasNMC ?? false,
      hasNtc: data.hasNTC ?? false,
      isLtir: false,
      isRetained: false,
      retainedSalary: 0,
    }).onConflictDoNothing();

    playerCount++;
  }
  
  console.log(`✅ ${playerCount} Players seeded.`);
  console.log("🎉 Seeding complete!");
  process.exit(0);
}

main().catch(console.error);
