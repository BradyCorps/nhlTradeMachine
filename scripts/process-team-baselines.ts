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
//   season    — season label used (most recent)
//
// NST "all" files have raw totals with TOI in MINUTES — divide by 60 for hours,
// then multiply output by 60 again to get per-60-min rates:
//   rate/60 = stat / (toi_minutes / 60) = stat * 60 / toi_minutes
//
// Utah naming: "Utah Hockey Club" and "Utah Mammoth" are both mapped to "UTA".

const TEAMSTATS_DIR = path.join(process.cwd(), "OtherData", "teamstats");
const OUT_FILE      = path.join(process.cwd(), "app", "data", "team_baselines.json");

// All 32 NHL franchises — full name (lower-case) → 3-letter abbreviation
const NAME_MAP: Record<string, string> = {
  "anaheim ducks":           "ANA",
  "boston bruins":           "BOS",
  "buffalo sabres":          "BUF",
  "calgary flames":          "CGY",
  "carolina hurricanes":     "CAR",
  "chicago blackhawks":      "CHI",
  "colorado avalanche":      "COL",
  "columbus blue jackets":   "CBJ",
  "dallas stars":            "DAL",
  "detroit red wings":       "DET",
  "edmonton oilers":         "EDM",
  "florida panthers":        "FLA",
  "los angeles kings":       "LAK",
  "minnesota wild":          "MIN",
  "montréal canadiens":      "MTL",
  "montreal canadiens":      "MTL",
  "nashville predators":     "NSH",
  "new jersey devils":       "NJD",
  "new york islanders":      "NYI",
  "new york rangers":        "NYR",
  "ottawa senators":         "OTT",
  "philadelphia flyers":     "PHI",
  "pittsburgh penguins":     "PIT",
  "san jose sharks":         "SJS",
  "seattle kraken":          "SEA",
  "st. louis blues":         "STL",
  "st louis blues":          "STL",
  "tampa bay lightning":     "TBL",
  "toronto maple leafs":     "TOR",
  "utah hockey club":        "UTA",
  "utah mammoth":            "UTA",
  "arizona coyotes":         "UTA",
  "vancouver canucks":       "VAN",
  "vegas golden knights":    "VGK",
  "washington capitals":     "WSH",
  "winnipeg jets":           "WPG",
};

// Short abbreviation normalisation (NST sometimes uses non-standard codes)
const ABBR_MAP: Record<string, string> = {
  "T.B": "TBL", "TB": "TBL",
  "N.J": "NJD", "NJ": "NJD",
  "S.J": "SJS", "SJ": "SJS",
  "L.A": "LAK", "LA": "LAK",
  "ARI": "UTA", "PHX": "UTA",
  "MTL": "MTL", "CGY": "CGY",
};

function normalizeTeam(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (NAME_MAP[lower]) return NAME_MAP[lower];
  const upper = raw.trim().toUpperCase();
  return ABBR_MAP[upper] ?? upper;
}

function parseCSV(text: string): string[][] {
  return text.trim().split(/\r?\n/).map(line => {
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

function col(hdr: string[], ...names: string[]): number {
  for (const n of names) {
    const i = hdr.findIndex(c => c.replace(/^﻿/, "").trim().toLowerCase() === n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

interface TeamRow { season: string; gp: number; toi: number; hdca: number; xga: number; xgf: number; }

const allSeasons: Record<string, TeamRow[]> = {};

if (!fs.existsSync(TEAMSTATS_DIR)) {
  console.error(`❌  OtherData/teamstats/ not found — expected at ${TEAMSTATS_DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(TEAMSTATS_DIR).filter(f => f.endsWith(".csv")).sort();
console.log(`Found ${files.length} team stats CSV(s): ${files.join(", ")}`);

for (const file of files) {
  const season = file.replace(".csv", "");
  const rows   = parseCSV(fs.readFileSync(path.join(TEAMSTATS_DIR, file), "utf8"));
  if (rows.length < 2) { console.warn(`  ⚠ ${file}: too few rows`); continue; }

  const hdr = rows[0];
  const teamI = col(hdr, "Team", "team");
  const gpI   = col(hdr, "GP", "games played", "games");
  const toiI  = col(hdr, "TOI", "toi", "time on ice", "TOI/GP");
  const hdcaI = col(hdr, "HDCA", "HD CA", "High Danger Chances Against", "HD Shots Against", "HDSCA");
  const xgaI  = col(hdr, "xGA", "xg against", "expected goals against");
  const xgfI  = col(hdr, "xGF", "xg for",    "expected goals for");

  if (teamI < 0) { console.warn(`  ⚠ ${file}: no Team column, skipping`); continue; }

  const missing = [hdcaI < 0 && "HDCA", xgaI < 0 && "xGA", xgfI < 0 && "xGF"].filter(Boolean);
  if (missing.length) {
    // Rates files have /60 columns but not totals — skip gracefully
    console.warn(`  ⚠ ${file}: missing ${missing.join(", ")} — available: ${hdr.slice(0, 20).join("|")}`);
    console.warn(`     (rates files provide CF/60 etc. but not HDCA/xGA totals — use the _all files)`);
    continue;
  }

  let count = 0;
  for (const row of rows.slice(1)) {
    if (!row[teamI]?.trim()) continue;
    const team = normalizeTeam(row[teamI]);
    const gp   = parseFloat(row[gpI]   ?? "0") || 0;
    // NST "all" files export TOI in minutes — store as-is and convert when computing rates
    const toi  = parseFloat(row[toiI]  ?? "0") || 0;
    const hdca = hdcaI >= 0 ? (parseFloat(row[hdcaI] ?? "0") || 0) : 0;
    const xga  = xgaI  >= 0 ? (parseFloat(row[xgaI]  ?? "0") || 0) : 0;
    const xgf  = xgfI  >= 0 ? (parseFloat(row[xgfI]  ?? "0") || 0) : 0;
    if (toi <= 0 || gp < 5) continue;

    if (!allSeasons[team]) allSeasons[team] = [];
    allSeasons[team].push({ season, gp, toi, hdca, xga, xgf });
    count++;
  }
  console.log(`  ${file}: ${count} teams parsed`);
}

// Compute per-60 rates. NST TOI is in minutes so:
//   stat/60 = stat / (toi_min / 60) = stat * 60 / toi_min
function rate60(stat: number, toiMin: number): number | null {
  return toiMin > 0 ? Math.round(stat * 60 / toiMin * 100) / 100 : null;
}

const output: Record<string, any> = {};
for (const [team, seasons] of Object.entries(allSeasons)) {
  const sorted = [...seasons].sort((a, b) => b.season.localeCompare(a.season));
  const r = sorted[0];
  output[team] = {
    season:  r.season,
    gp:      r.gp,
    hdca60:  rate60(r.hdca, r.toi),
    xga60:   rate60(r.xga,  r.toi),
    xgf60:   rate60(r.xgf,  r.toi),
    allSeasons: sorted.map(s => ({
      season: s.season, gp: s.gp,
      hdca60: rate60(s.hdca, s.toi),
      xga60:  rate60(s.xga,  s.toi),
      xgf60:  rate60(s.xgf,  s.toi),
    })),
  };
}

// Summary sorted by HDCA/60 descending
const sorted = Object.entries(output)
  .filter(([, v]) => v.hdca60 != null)
  .sort(([, a], [, b]) => (b.hdca60 ?? 0) - (a.hdca60 ?? 0));

console.log("\n── HD chances against per 60 min (most recent season, descending) ──");
for (const [team, v] of sorted) {
  console.log(`  ${team.padEnd(4)} ${String(v.hdca60 ?? "n/a").padStart(6)}  xGA/60=${String(v.xga60 ?? "n/a").padStart(5)}  xGF/60=${String(v.xgf60 ?? "n/a").padStart(5)}`);
}

const vals = sorted.map(([, v]) => v.hdca60 as number).filter(Boolean);
if (vals.length) {
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  console.log(`\nLeague avg HDCA/60: ${mean.toFixed(2)} (range ${Math.min(...vals).toFixed(2)}–${Math.max(...vals).toFixed(2)})`);
  console.log(`Current avgHdca60 in season-config.ts: 12.0`);
  if (Math.abs(mean - 12.0) > 0.5) console.log(`⚡ Consider updating avgHdca60 to ${mean.toFixed(1)}`);
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
console.log(`\n✅  Wrote ${Object.keys(output).length} teams → ${OUT_FILE}`);
