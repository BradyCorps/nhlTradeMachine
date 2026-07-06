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
  
  // Same-name pairs (the two Elias Petterssons) only exist in the source as
  // position-suffixed keys ("Name__C" / "Name__D"). Skipping every "__" key
  // collapsed them into a single row — the second player's contract vanished
  // and both roster entries joined against whichever row survived. Collect
  // the position variants first so each gets its own salted row.
  const POS_SUFFIX = /^(C|W|D|G|LW|RW|F)$/i;
  const posVariants = new Map<string, { pos: string; data: any }[]>();
  for (const [key, data] of Object.entries(contracts) as [string, any][]) {
    const idx = key.indexOf("__");
    if (idx < 0) continue;
    const suffix = key.slice(idx + 2);
    if (!POS_SUFFIX.test(suffix)) continue;
    const base = key.slice(0, idx);
    const list = posVariants.get(base) ?? [];
    if (!list.some(v => v.pos === suffix.toUpperCase())) {
      list.push({ pos: suffix.toUpperCase(), data });
      posVariants.set(base, list);
    }
  }

  const insertRow = async (id: string, name: string, position: string, data: any) => {
    await db.insert(players).values({
      id,
      name,
      position,
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
  };

  for (const [key, data] of Object.entries(contracts) as [string, any][]) {
    if (key.includes("__")) continue;

    const slug = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const variants = posVariants.get(key) ?? [];
    if (variants.length >= 2) {
      // True same-name pair: one salted row per position, no base row.
      for (const v of variants) {
        await insertRow(`${slug}-${v.pos.toLowerCase()}`, key, v.pos, v.data);
      }
      continue;
    }
    await insertRow(slug, key, variants[0]?.pos ?? "Unknown", data);
  }
  
  console.log(`✅ ${playerCount} Players seeded.`);
  console.log("🎉 Seeding complete!");
  process.exit(0);
}

main().catch(console.error);
