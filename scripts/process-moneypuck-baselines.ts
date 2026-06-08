import fs from 'fs';
import path from 'path';

// Each season folder has differently-numbered files (oldest = highest number)
const SEASONS = [
  { folder: '2022_23', skatersFile: 'skaters(3).csv', goaliesFile: 'goalies(3).csv', weight: 0.10 },
  { folder: '2023_24', skatersFile: 'skaters(2).csv', goaliesFile: 'goalies(2).csv', weight: 0.20 },
  { folder: '2024_25', skatersFile: 'skaters(1).csv', goaliesFile: 'goalies(1).csv', weight: 0.50 },
  { folder: '2025_26', skatersFile: 'skaters.csv',    goaliesFile: 'goalies.csv',    weight: 0.20 },
];

// Minimum games to include a season in the baseline.
// 2025-26 uses a higher threshold — many stars were injured (Barkov, etc.),
// and including their 0-game season would tank their baseline.
const MIN_GAMES_SKATER = 25;
const MIN_GAMES_GOALIE = 15;
const MIN_GAMES_2025_26 = 35; // stricter for current season

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += char; }
  }
  result.push(current);
  return result;
}

function makeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

// Skater accumulator: weighted sums keyed by player name key
const skaterAcc = new Map<string, {
  name: string;
  weightedPts:  number;
  weightedGS:   number;
  weightedDps:  number;
  totalWeight:  number;
}>();

// Goalie accumulator
const goalieAcc = new Map<string, {
  name: string;
  weightedGsax: number;
  totalWeight:  number;
}>();

const rootDir = path.join(process.cwd(), 'MoneyPuckData');

// ── Process skaters ──────────────────────────────────────────
for (const season of SEASONS) {
  const filePath = path.join(rootDir, season.folder, season.skatersFile);
  if (!fs.existsSync(filePath)) {
    console.warn(`  Skipping ${filePath} (not found)`);
    continue;
  }

  const lines   = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const header  = parseCSVLine(lines[0]);
  const idx     = (col: string) => header.indexOf(col);

  const I_name  = idx('name');
  const I_sit   = idx('situation');
  const I_gp    = idx('games_played');
  const I_ice   = idx('icetime');          // total seconds on ice
  const I_gs    = idx('gameScore');
  const I_pts   = idx('I_F_points');

  if ([I_name, I_sit, I_gp, I_pts].some(i => i < 0)) {
    console.warn(`  Missing required columns in ${filePath}`);
    continue;
  }

  const minGames = season.folder === '2025_26' ? MIN_GAMES_2025_26 : MIN_GAMES_SKATER;
  let processed = 0;

  for (const line of lines.slice(1)) {
    const row = parseCSVLine(line);
    if (row[I_sit] !== 'all') continue;

    const name = row[I_name]?.trim();
    if (!name) continue;

    const gp = parseFloat(row[I_gp]) || 0;
    if (gp < minGames) continue;

    const pts  = parseFloat(row[I_pts])  || 0;
    const gs   = I_gs >= 0 ? (parseFloat(row[I_gs]) || 0) : 0;

    const ptsPace = (pts / gp) * 82;
    const gsPace  = (gs  / gp) * 82;

    // dpsProxy: game score incorporates defensive play and avoids matchup-skew
    // from raw on/off xGA. GS/82 / 30 maps to the ~0-5 DPS range:
    // elite two-way (GS 90/82) → 3.0, solid (60) → 2.0, depth (30) → 1.0
    const dpsProxy = Math.max(0, gsPace / 30);

    const key = makeKey(name);
    const existing = skaterAcc.get(key) ?? { name, weightedPts: 0, weightedGS: 0, weightedDps: 0, totalWeight: 0 };
    existing.weightedPts  += ptsPace  * season.weight;
    existing.weightedGS   += gsPace   * season.weight;
    existing.weightedDps  += dpsProxy * season.weight;
    existing.totalWeight  += season.weight;
    skaterAcc.set(key, existing);
    processed++;
  }

  console.log(`  ${season.folder} skaters: ${processed} rows`);
}

// ── Process goalies ──────────────────────────────────────────
for (const season of SEASONS) {
  const filePath = path.join(rootDir, season.folder, season.goaliesFile);
  if (!fs.existsSync(filePath)) continue;

  const lines  = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const header = parseCSVLine(lines[0]);
  const idx    = (col: string) => header.indexOf(col);

  const I_name  = idx('name');
  const I_sit   = idx('situation');
  const I_gp    = idx('games_played');
  const I_xg    = idx('xGoals');
  const I_goals = idx('goals');

  if ([I_name, I_sit, I_gp, I_xg, I_goals].some(i => i < 0)) continue;

  const minGames = season.folder === '2025_26' ? MIN_GAMES_2025_26 : MIN_GAMES_GOALIE;
  let processed = 0;

  for (const line of lines.slice(1)) {
    const row  = parseCSVLine(line);
    if (row[I_sit] !== 'all') continue;

    const name = row[I_name]?.trim();
    if (!name) continue;

    const gp     = parseFloat(row[I_gp])    || 0;
    if (gp < minGames) continue;

    const xGoals = parseFloat(row[I_xg])    || 0;
    const goals  = parseFloat(row[I_goals]) || 0;

    // Normalise GSAX to a 60-game season so different workloads are comparable
    const gsaxPer60 = ((xGoals - goals) / gp) * 60;

    const key = makeKey(name);
    const existing = goalieAcc.get(key) ?? { name, weightedGsax: 0, totalWeight: 0 };
    existing.weightedGsax += gsaxPer60 * season.weight;
    existing.totalWeight  += season.weight;
    goalieAcc.set(key, existing);
    processed++;
  }

  console.log(`  ${season.folder} goalies: ${processed} rows`);
}

// ── Build output ─────────────────────────────────────────────
const output: Record<string, any> = {};

for (const [key, s] of skaterAcc) {
  if (s.totalWeight < 0.1) continue;
  const w = s.totalWeight;
  output[key] = {
    name:                 s.name,
    baselinePtsPace:      Math.round((s.weightedPts / w) * 10) / 10,
    baselineGameScore:    Math.round((s.weightedGS  / w) * 10) / 10,
    baselineDpsProxy:     Math.round((s.weightedDps / w) * 100) / 100,
    baselineGsax:         0,
    totalSeasonsWeighted: Math.round(w * 100) / 100,
  };
}

for (const [key, g] of goalieAcc) {
  if (g.totalWeight < 0.1) continue;
  const w    = g.totalWeight;
  const gsax = Math.round((g.weightedGsax / w) * 10) / 10;
  output[key] = {
    ...(output[key] ?? { name: g.name, baselinePtsPace: 0, baselineGameScore: 0, baselineDpsProxy: 0 }),
    baselineGsax:         gsax,
    totalSeasonsWeighted: Math.round(w * 100) / 100,
  };
}

const outPath = path.join(process.cwd(), 'app', 'data', 'moneypuck_baselines.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`\nWrote ${Object.keys(output).length} player baselines → ${outPath}`);

// Spot-checks
const checks = [
  'aleksanderbarkov', 'nathanmackinnon', 'connormcdavid',
  'adamfox', 'connerhellebuyck', 'romanjosi',
];
console.log('\nSpot checks:');
for (const k of checks) {
  const p = output[k];
  if (p) console.log(`  ${p.name}: ptsPace=${p.baselinePtsPace}, gsax=${p.baselineGsax}, dps=${p.baselineDpsProxy}, weight=${p.totalSeasonsWeighted}`);
  else   console.log(`  ${k}: NOT FOUND`);
}
