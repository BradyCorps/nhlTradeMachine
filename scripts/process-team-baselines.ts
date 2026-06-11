import fs from "fs";
import path from "path";

// ── Team Baselines Builder ────────────────────────────────────────────────────
// Reads NST-format team stats CSVs from OtherData/teamstats/ (4 seasons:
// 2022-23, 2023-24, 2024-25, 2025-26) and produces app/data/team_baselines.json.
//
// Output per team (keyed by NHL 3-letter abbreviation, upper-case):
//   hdca60    — HD chances against per 60 min (goalie difficulty; higher = harder job)
//   xga60     — xGoals against per 60 min (team defensive quality context)
//   xgf60     — xGoals for per 60 min (team offensive support for goalie)
//   gp        — games played
//   season    — season label
//
// Multi-season: exports the MOST RECENT season's data per team; prior seasons
// are included in the raw output for manual inspection.
//
// Utah naming: "Utah Hockey Club" and "Utah Mammoth" are both mapped to "UTA".

const TEAMSTATS_DIR = path.join(process.cwd(), "OtherData", "teamstats");
const OUT_FILE      = path.join(process.cwd(), "app", "data", "team_baselines.json");

// NST uses inconsistent abbreviations; normalize to the standard 3-letter set
const ABBR_MAP: Record<string, string> = {
  "T.B":   "TBL",
  "TB":    "TBL",
  "N.J":   "NJD",
  "NJ":    "NJD",
  "S.J":   "SJS",
  "SJ":    "SJS",
  "L.A":   "LAK",
  "LA":    "LAK",
  "ARI":   "UTA",  // Arizona → Utah
  "PHX":   "UTA",
  "UTA":   "UTA",
  "VGK":   "VGK",
  "SEA":   "SEA",
  "WPG":   "WPG",
};

// Full name → abbreviation (for NST files that export city/team names)
const NAME_MAP: Record<string, string> = {
  "utah hockey club": "UTA",
  "utah mammoth":     "UTA",
  "arizona coyotes":  "UTA",
  "tampa bay lightning": "TBL",
  "new jersey devils":   "NJD",
  "san jose sharks":     "SJS",
  "los angeles kings":   "LAK",
  "vegas golden knights": "VGK",
  "seattle kraken":      "SEA",
  "winnipeg jets":       "WPG",
};

function normalizeTeam(raw: string): string {
  const lower = raw.trim().toLowerCase();
  const byName = NAME_MAP[lower];
  if (byName) return byName;
  const upper = raw.trim().toUpperCase();
  return ABBR_MAP[upper] ?? upper;
}

function parseCSV(text: string): string[][] {
  return text.trim().split(/\r?\n/).map(line => {
    // Handle quoted fields
    const cols: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; continue; }
      if (line[i] === "," && !inQ) { cols.push(cur); cur = ""; continue; }
      cur += line[i];
    }
    cols.push(cur);
    return cols;
  });
}

function h(hdr: string[], name: string): number {
  // case-insensitive match; strip BOM
  return hdr.findIndex(c => c.replace(/^﻿/, "").trim().toLowerCase() === name.toLowerCase());
}

// Try several common column name variants for the same concept
function findCol(hdr: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const i = h(hdr, c);
    if (i >= 0) return i;
  }
  return -1;
}

interface TeamRow {
  season: string;
  gp:     number;
  toi:    number;   // hours
  hdca:   number;
  xga:    number;
  xgf:    number;
}

const allSeasons: Record<string, TeamRow[]> = {};

if (!fs.existsSync(TEAMSTATS_DIR)) {
  console.error(`❌  OtherData/teamstats/ not found at ${TEAMSTATS_DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(TEAMSTATS_DIR)
  .filter(f => f.endsWith(".csv"))
  .sort();

console.log(`Found ${files.length} team stats CSV(s): ${files.join(", ")}`);

for (const file of files) {
  const season = file.replace(".csv", "").replace(/[^0-9;]/g, "") || file;
  const fullPath = path.join(TEAMSTATS_DIR, file);
  const rows = parseCSV(fs.readFileSync(fullPath, "utf8"));
  if (rows.length < 2) { console.warn(`  ⚠ ${file}: too few rows, skipping`); continue; }

  const hdr = rows[0];
  const teamI = findCol(hdr, "Team", "team");
  const gpI   = findCol(hdr, "GP", "gp", "games played", "games");
  const toiI  = findCol(hdr, "TOI", "toi", "time on ice");
  // HD chances/shots/attempts against — try multiple NST naming conventions
  const hdcaI = findCol(hdr, "HDCA", "HD CA", "High Danger Chances Against",
                                "HD Shots Against", "HDSCA");
  const xgaI  = findCol(hdr, "xGA", "xg against", "expected goals against", "xGolas Against");
  const xgfI  = findCol(hdr, "xGF", "xg for", "expected goals for");

  if (teamI < 0) { console.warn(`  ⚠ ${file}: no Team column found, skipping`); continue; }
  const missing: string[] = [];
  if (hdcaI < 0) missing.push("HDCA");
  if (xgaI  < 0) missing.push("xGA");
  if (xgfI  < 0) missing.push("xGF");
  if (missing.length) {
    console.warn(`  ⚠ ${file}: missing columns ${missing.join(", ")} — available: ${hdr.slice(0,20).join("|")}`);
  }

  let count = 0;
  for (const row of rows.slice(1)) {
    if (!row[teamI]?.trim()) continue;
    const team = normalizeTeam(row[teamI]);
    const gp   = parseFloat(row[gpI]   ?? "0") || 0;
    const toi  = parseFloat(row[toiI]  ?? "0") || 0;   // in hours (NST standard)
    const hdca = parseFloat(row[hdcaI < 0 ? 0 : hdcaI] ?? "0") || 0;
    const xga  = parseFloat(row[xgaI  < 0 ? 0 : xgaI] ?? "0") || 0;
    const xgf  = parseFloat(row[xgfI  < 0 ? 0 : xgfI] ?? "0") || 0;
    if (toi <= 0 || gp < 5) continue;

    if (!allSeasons[team]) allSeasons[team] = [];
    allSeasons[team].push({ season, gp, toi, hdca, xga, xgf });
    count++;
  }
  console.log(`  ${file}: ${count} teams parsed`);
}

// Build output — most recent season per team, but also log all
const output: Record<string, any> = {};
for (const [team, seasons] of Object.entries(allSeasons)) {
  // sort descending by season label (e.g. "2025;26" > "2024;25")
  const sorted = [...seasons].sort((a, b) => b.season.localeCompare(a.season));
  const recent = sorted[0];
  const hdca60  = recent.toi > 0 ? recent.hdca / recent.toi : null;   // per 60 min
  const xga60   = recent.toi > 0 ? recent.xga  / recent.toi : null;
  const xgf60   = recent.toi > 0 ? recent.xgf  / recent.toi : null;

  output[team] = {
    season:  recent.season,
    gp:      recent.gp,
    hdca60:  hdca60   != null ? Math.round(hdca60   * 100) / 100 : null,
    xga60:   xga60    != null ? Math.round(xga60    * 100) / 100 : null,
    xgf60:   xgf60    != null ? Math.round(xgf60    * 100) / 100 : null,
    allSeasons: sorted.map(s => ({
      season: s.season, gp: s.gp,
      hdca60: s.toi > 0 ? Math.round(s.hdca / s.toi * 100) / 100 : null,
      xga60:  s.toi > 0 ? Math.round(s.xga  / s.toi * 100) / 100 : null,
      xgf60:  s.toi > 0 ? Math.round(s.xgf  / s.toi * 100) / 100 : null,
    })),
  };
}

// Print a summary
const sorted = Object.entries(output)
  .filter(([, v]) => v.hdca60 != null)
  .sort(([, a], [, b]) => (b.hdca60 ?? 0) - (a.hdca60 ?? 0));
console.log("\n── HD chances against per 60 min (most recent season, descending) ──");
for (const [team, v] of sorted) {
  console.log(`  ${team.padEnd(4)} ${(v.hdca60 ?? "n/a").toString().padStart(6)}  xGA/60=${(v.xga60 ?? "n/a").toString().padStart(5)}  xGF/60=${(v.xgf60 ?? "n/a").toString().padStart(5)}`);
}

const hdcaVals = sorted.map(([, v]) => v.hdca60 as number).filter(Boolean);
if (hdcaVals.length) {
  const mean = hdcaVals.reduce((a, b) => a + b, 0) / hdcaVals.length;
  const min  = Math.min(...hdcaVals);
  const max  = Math.max(...hdcaVals);
  console.log(`\nLeague avg HDCA/60: ${mean.toFixed(2)} (range ${min.toFixed(2)}–${max.toFixed(2)})`);
  console.log(`⚡ Update avgHdca60 in season-config.ts if this differs significantly from 13.1`);
}

const dir = path.dirname(OUT_FILE);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
console.log(`\n✅  Wrote ${Object.keys(output).length} teams → ${OUT_FILE}`);
