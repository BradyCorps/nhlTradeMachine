import fs from "fs";
import path from "path";

const AWARDS_DIR = path.resolve(__dirname, "../OtherData/awards");
const OUT_FILE = path.resolve(__dirname, "../app/data/player-awards.json");

const FILE_TO_AWARD: Record<string, string> = {
  "hart_winners.csv":           "Hart",
  "vezina_winners.csv":         "Vezina",
  "norris_winners.csv":         "Norris",
  "selke_winners.csv":          "Selke",
  "tedlindsay_winners.csv":     "Ted Lindsay",
  "connsmyth_winners.csv":      "Conn Smythe",
  "artross_winners.csv":        "Art Ross",
  "mouricerichard_winners.csv": "Rocket Richard",
  "calder_winners.csv":         "Calder",
  "byng_winners.csv":           "Lady Byng",
};

function findPlayerColumn(headerLine: string): number {
  const cols = headerLine.split(",");
  return cols.findIndex(c => c.trim().toLowerCase() === "player");
}

const awards: Record<string, string[]> = {};

for (const [filename, awardName] of Object.entries(FILE_TO_AWARD)) {
  const filePath = path.join(AWARDS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`Missing: ${filePath}`);
    continue;
  }

  const raw = fs.readFileSync(filePath, "utf-8").replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);

  let playerCol = -1;
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const idx = findPlayerColumn(lines[i]);
    if (idx >= 0) {
      playerCol = idx;
      headerIdx = i;
      break;
    }
  }

  if (playerCol < 0) {
    console.warn(`No 'Player' column in ${filename}`);
    continue;
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const playerName = cols[playerCol]?.trim();
    if (!playerName || playerName === "Player") continue;

    if (!awards[playerName]) awards[playerName] = [];
    awards[playerName].push(awardName);
  }
}

const sorted = Object.fromEntries(
  Object.entries(awards).sort(([a], [b]) => a.localeCompare(b))
);

fs.writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + "\n");
console.log(`Wrote ${Object.keys(sorted).length} players to ${OUT_FILE}`);
