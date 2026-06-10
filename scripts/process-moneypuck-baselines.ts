import fs from 'fs';
import path from 'path';

// Weights for exponential decay: most recent season is weighted highest
const SEASON_WEIGHTS: Record<string, number> = {
  "2025": 0.50, // 2025_26
  "2024": 0.30, // 2024_25
  "2023": 0.15, // 2023_24
  "2022": 0.05  // 2022_23
};

interface PlayerSeasonStats {
  gamesPlayed: number;
  points: number;
  gameScore: number;
  onIceXgRel: number;
  dpsProxy: number; 
  goalsAgainst: number;
  xGoalsAgainst: number;
  isGoalie: boolean;
}

interface PlayerAggregate {
  name: string;
  position: string;
  seasons: Record<string, PlayerSeasonStats>;
}

const db: Record<string, PlayerAggregate> = {};

function getSeasonKey(folderName: string): string {
  if (folderName.includes("2025")) return "2025";
  if (folderName.includes("2024")) return "2024";
  if (folderName.includes("2023")) return "2023";
  if (folderName.includes("2022")) return "2022";
  return "";
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function processMoneypuckData() {
  const rootDir = path.join(process.cwd(), 'MoneyPuckData');
  const folders = fs.readdirSync(rootDir).filter(f => f.match(/^\d{4}_\d{2}$/));

  for (const folder of folders) {
    const seasonKey = getSeasonKey(folder);
    if (!seasonKey) continue;

    console.log(`Processing season: ${folder}...`);

    // Process Skaters
    const skatersPath = path.join(rootDir, folder, 'skaters(1).csv');
    if (fs.existsSync(skatersPath)) {
      const data = fs.readFileSync(skatersPath, 'utf8').split('\n');
      const headers = parseCSVLine(data[0]);
      
      const idxId = headers.indexOf('playerId');
      const idxName = headers.indexOf('name');
      const idxPos = headers.indexOf('position');
      const idxSit = headers.indexOf('situation');
      const idxGP = headers.indexOf('games_played');
      const idxPts = headers.indexOf('I_F_points');
      const idxGameScore = headers.indexOf('gameScore');
      const idxXgPct = headers.indexOf('onIce_xGoalsPercentage');
      const idxDZoneGiveaways = headers.indexOf('I_F_dZoneGiveaways');

      for (let i = 1; i < data.length; i++) {
        if (!data[i].trim()) continue;
        const row = parseCSVLine(data[i]);
        const situation = row[idxSit];
        
        // We only want 'all' situations for the macro baseline
        if (situation !== 'all') continue;

        const id = row[idxId];
        const name = row[idxName];
        
        if (!db[id]) {
          db[id] = { name, position: row[idxPos], seasons: {} };
        }

        const games = parseFloat(row[idxGP]) || 0;
        const pts = parseFloat(row[idxPts]) || 0;
        const gs = parseFloat(row[idxGameScore]) || 0;
        const xgPct = parseFloat(row[idxXgPct]) || 0.5;

        // Approximate DPS proxy for defensemen since MP doesn't have native point shares
        // High xG% + high games + low giveaways = good defensive proxy
        const dpsProxy = (xgPct * 5) * (games / 82); 

        db[id].seasons[seasonKey] = {
          gamesPlayed: games,
          points: pts,
          gameScore: gs,
          onIceXgRel: xgPct - 0.5,
          dpsProxy: dpsProxy,
          goalsAgainst: 0,
          xGoalsAgainst: 0,
          isGoalie: false
        };
      }
    }

    // Process Goalies
    const goaliesPath = path.join(rootDir, folder, 'goalies(1).csv');
    if (fs.existsSync(goaliesPath)) {
      const data = fs.readFileSync(goaliesPath, 'utf8').split('\n');
      const headers = parseCSVLine(data[0]);
      
      const idxId = headers.indexOf('playerId');
      const idxName = headers.indexOf('name');
      const idxSit = headers.indexOf('situation');
      const idxGP = headers.indexOf('games_played');
      const idxGoals = headers.indexOf('goals');
      const idxXGoals = headers.indexOf('xGoals');

      for (let i = 1; i < data.length; i++) {
        if (!data[i].trim()) continue;
        const row = parseCSVLine(data[i]);
        const situation = row[idxSit];
        
        if (situation !== 'all') continue;

        const id = row[idxId];
        const name = row[idxName];
        
        if (!db[id]) {
          db[id] = { name, position: "G", seasons: {} };
        }

        db[id].seasons[seasonKey] = {
          gamesPlayed: parseFloat(row[idxGP]) || 0,
          points: 0,
          gameScore: 0,
          onIceXgRel: 0,
          dpsProxy: 0,
          goalsAgainst: parseFloat(row[idxGoals]) || 0,
          xGoalsAgainst: parseFloat(row[idxXGoals]) || 0,
          isGoalie: true
        };
      }
    }
  }

  // Calculate Aggregates
  const outputBaselines: Record<string, any> = {};

  for (const [id, player] of Object.entries(db)) {
    let totalWeight = 0;
    let aggPtsPace = 0;
    let aggGameScore = 0;
    let aggDpsProxy = 0;
    let aggGsax = 0;

    for (const [season, stats] of Object.entries(player.seasons)) {
      if (stats.gamesPlayed < 10) continue; // Ignore tiny samples
      
      const weight = SEASON_WEIGHTS[season] || 0;
      const paceMult = 82 / stats.gamesPlayed;

      if (!stats.isGoalie) {
        aggPtsPace += (stats.points * paceMult) * weight;
        aggGameScore += (stats.gameScore * paceMult) * weight;
        aggDpsProxy += stats.dpsProxy * weight;
      } else {
        const gsax = stats.xGoalsAgainst - stats.goalsAgainst;
        aggGsax += gsax * weight;
      }

      totalWeight += weight;
    }

    if (totalWeight > 0) {
      // Normalize by the total weight actually accumulated 
      // (e.g., if a rookie only played in 2025, their weight is 0.5, so we divide by 0.5 to restore to 100%)
      outputBaselines[player.name.toLowerCase().replace(/[^a-z]/g, '')] = {
        name: player.name,
        baselinePtsPace: aggPtsPace / totalWeight,
        baselineGameScore: aggGameScore / totalWeight,
        baselineDpsProxy: aggDpsProxy / totalWeight,
        baselineGsax: aggGsax / totalWeight,
        totalSeasonsWeighted: totalWeight
      };
    }
  }

  const outputPath = path.join(process.cwd(), 'app', 'data', 'moneypuck_baselines.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputBaselines, null, 2));
  console.log(`Successfully generated ${outputPath} for ${Object.keys(outputBaselines).length} players!`);
}

processMoneypuckData().catch(console.error);
