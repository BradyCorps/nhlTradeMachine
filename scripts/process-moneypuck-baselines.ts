import fs from 'fs';
import path from 'path';

// ── Multi-Season Baseline Builder (MoneyPuck + Natural Stat Trick) ───────────
// Reads all four season folders in MoneyPuckData/ plus the NST exports in
// OtherData/ and produces app/data/moneypuck_baselines.json — the multi-year
// anchor consumed by the X-NAV engine's baseline blending.
//
// MoneyPuck fields (per-season exponential weighting 0.50/0.30/0.15/0.05):
//   baselinePtsPace      — weighted pts/82 across seasons (situation: all)
//   baselineGameScore    — weighted gameScore/82
//   baselineDpsProxy     — weighted defensive proxy (5on5 on-ice xG% based)
//   baselineGsax         — weighted season GSAX (goalies)
//   baselineXgRel        — weighted 5on5 on-ice minus off-ice xG% (relative impact)
//   ppPtsPace82          — weighted powerplay (5on4) pts/82 — specialist signal
//   pkTimeShare          — weighted PK (4on5) icetime share of total — two-way signal
//   totalSeasonsWeighted — sum of season weights actually accumulated
//
// NST enrichment fields (two time buckets — OtherData's prior file is
// pre-aggregated over 2022-25, so only a 60% current / 40% prior blend
// is possible, not per-season weighting):
//   baselineIxg82        — individual expected goals per 82 GP
//   baselineHits82       — hits per 82 GP (physicality signal)
//   baselineBlocks82     — shots blocked per 82 GP
//   baselineEsXgfPct     — even-strength on-ice xGF% (0-100)
//   pairXgfPct           — D only: TOI-weighted xGF% across all pairings
//   pairDriverScore      — D only: TOI-weighted xGF% delta vs. what each
//                          partner does with everyone else (driver vs passenger)
//   baselineHdsvPct      — goalies: high-danger save % (skill > team-defense noise)
//   baselineGsaaPerGame  — goalies: goals saved above average per game

// Weights for exponential decay: most recent season weighted highest
const SEASON_WEIGHTS: Record<string, number> = {
  "2025": 0.50, // 2025_26
  "2024": 0.30, // 2024_25
  "2023": 0.15, // 2023_24
  "2022": 0.05  // 2022_23
};

const MIN_GAMES_SKATER = 10;
const MIN_GAMES_GOALIE = 8;

interface SkaterSeason {
  gamesPlayed: number;
  points: number;
  gameScore: number;
  xgRel: number;        // 5on5 onIce_xGoalsPercentage - offIce_xGoalsPercentage
  dpsProxy: number;
  ppPoints: number;     // 5on4 individual points
  pkIceShare: number;   // 4on5 icetime / all icetime
}

interface GoalieSeason {
  gamesPlayed: number;
  gsax: number;         // xGoals - goals (situation: all)
}

interface PlayerAggregate {
  name: string;
  position: string;
  isGoalie: boolean;
  skaterSeasons: Record<string, SkaterSeason>;
  goalieSeasons: Record<string, GoalieSeason>;
}

const db: Record<string, PlayerAggregate> = {};

function getSeasonKey(folderName: string): string {
  if (folderName.startsWith("2025")) return "2025";
  if (folderName.startsWith("2024")) return "2024";
  if (folderName.startsWith("2023")) return "2023";
  if (folderName.startsWith("2022")) return "2022";
  return "";
}

// Find a file in the folder matching prefix (handles skaters.csv, skaters(1).csv, etc.)
function findCsv(dir: string, prefix: string): string | null {
  const files = fs.readdirSync(dir);
  const match = files.find(f => f.startsWith(prefix) && f.endsWith(".csv"));
  return match ? path.join(dir, match) : null;
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

function num(v: string | undefined): number {
  const n = parseFloat(v ?? "");
  return isNaN(n) ? 0 : n;
}

// NST uses "-" for missing values; distinguish from a legitimate 0
function numOrNull(v: string | undefined): number | null {
  if (v === undefined || v === "" || v === "-") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

// ── Natural Stat Trick enrichment (OtherData/) ───────────────────────────────
// Two time buckets: "2025;26" current season and "2022;23;24;25" prior span
// (pre-aggregated by NST — per-season weighting is impossible for the prior file).
const NST_CURRENT_WEIGHT = 0.6;
const NST_PRIOR_WEIGHT   = 0.4;

interface NstSkater  { gp: number; ixg82: number; hits82: number; blocks82: number; }
interface NstGoalie  { gp: number; hdsvPct: number | null; gsaaPerGame: number; }
interface NstOnIce   { toi: number; esXgfPct: number | null; }
interface NstPairing { player: string; partner: string; toi: number; xgfPct: number; }

interface NstBucket {
  skaters:  Record<string, NstSkater>;
  goalies:  Record<string, NstGoalie>;
  onIce:    Record<string, NstOnIce>;
  pairings: NstPairing[];
}

function readNstCsv(filePath: string): { headers: string[]; rows: string[][] } {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter(l => l.trim());
  return {
    headers: parseCSVLine(lines[0]),
    rows: lines.slice(1).map(parseCSVLine),
  };
}

function loadNstBucket(dir: string, prefix: string): NstBucket {
  const bucket: NstBucket = { skaters: {}, goalies: {}, onIce: {}, pairings: [] };
  const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.csv'));

  const find = (...frags: string[]) =>
    files.find(f => frags.every(frag => f.includes(frag)));

  // Skater totals (all situations) — ixG, hits, blocks
  const skaterFile = find('skater', 'totals_all');
  if (skaterFile) {
    const { headers, rows } = readNstCsv(path.join(dir, skaterFile));
    const iName = headers.indexOf('Player');
    const iGP = headers.indexOf('GP');
    const iIxg = headers.indexOf('ixG');
    const iHits = headers.indexOf('Hits');
    const iBlocks = headers.indexOf('Shots Blocked');
    for (const r of rows) {
      const gp = num(r[iGP]);
      if (gp < 10) continue;
      const pace = 82 / gp;
      bucket.skaters[nameKey(r[iName])] = {
        gp,
        ixg82:    num(r[iIxg]) * pace,
        hits82:   num(r[iHits]) * pace,
        blocks82: num(r[iBlocks]) * pace,
      };
    }
  }

  // Goalie totals — HDSV% and GSAA (NST header is 'goalie' in one file, 'goalies' in the other)
  const goalieFile = find('goalie', 'totals_all');
  if (goalieFile) {
    const { headers, rows } = readNstCsv(path.join(dir, goalieFile));
    const iName = headers.indexOf('Player');
    const iGP = headers.indexOf('GP');
    const iHdsv = headers.indexOf('HDSV%');
    const iGsaa = headers.indexOf('GSAA');
    for (const r of rows) {
      const gp = num(r[iGP]);
      if (gp < 8) continue;
      bucket.goalies[nameKey(r[iName])] = {
        gp,
        hdsvPct:     numOrNull(r[iHdsv]),
        gsaaPerGame: num(r[iGsaa]) / gp,
      };
    }
  }

  // Even-strength on-ice metrics — xGF%
  const onIceFile = find('onicemetrics');
  if (onIceFile) {
    const { headers, rows } = readNstCsv(path.join(dir, onIceFile));
    const iName = headers.indexOf('Player');
    const iGP = headers.indexOf('GP');
    const iToi = headers.indexOf('TOI');
    const iXgf = headers.indexOf('xGF%');
    for (const r of rows) {
      if (num(r[iGP]) < 10) continue;
      bucket.onIce[nameKey(r[iName])] = {
        toi: num(r[iToi]),
        esXgfPct: numOrNull(r[iXgf]),
      };
    }
  }

  // Defensive pairings (all situations) — driver/passenger analysis
  const pairFile = find('defensive_pairings_all');
  if (pairFile) {
    const { headers, rows } = readNstCsv(path.join(dir, pairFile));
    const iP1 = headers.indexOf('Player');
    const iP2 = headers.indexOf('Player 2');
    const iToi = headers.indexOf('TOI');
    const iXgf = headers.indexOf('xGF%');
    for (const r of rows) {
      const toi = num(r[iToi]);
      const xgf = numOrNull(r[iXgf]);
      if (toi < 50 || xgf === null) continue; // ignore tiny-sample pairings
      bucket.pairings.push({
        player: nameKey(r[iP1]),
        partner: nameKey(r[iP2]),
        toi,
        xgfPct: xgf,
      });
    }
  }

  return bucket;
}

// For each D-man: TOI-weighted pairing xGF%, and a driver score = how much
// better each partner performs with this player vs. with everyone else.
function computePairingMetrics(pairings: NstPairing[]): Record<string, { pairXgfPct: number; driverScore: number }> {
  // Index pairings by player (each row credits both players)
  const byPlayer: Record<string, Array<{ partner: string; toi: number; xgfPct: number }>> = {};
  for (const p of pairings) {
    (byPlayer[p.player] ??= []).push({ partner: p.partner, toi: p.toi, xgfPct: p.xgfPct });
    (byPlayer[p.partner] ??= []).push({ partner: p.player, toi: p.toi, xgfPct: p.xgfPct });
  }

  // Partner's TOI-weighted xGF% excluding pairings with a given teammate
  const avgExcluding = (player: string, exclude: string): number | null => {
    const list = (byPlayer[player] ?? []).filter(e => e.partner !== exclude);
    const toiSum = list.reduce((s, e) => s + e.toi, 0);
    if (toiSum <= 0) return null;
    return list.reduce((s, e) => s + e.xgfPct * e.toi, 0) / toiSum;
  };

  const out: Record<string, { pairXgfPct: number; driverScore: number }> = {};
  for (const [player, list] of Object.entries(byPlayer)) {
    const toiSum = list.reduce((s, e) => s + e.toi, 0);
    if (toiSum <= 0) continue;
    const pairXgfPct = list.reduce((s, e) => s + e.xgfPct * e.toi, 0) / toiSum;

    let deltaSum = 0, deltaToi = 0;
    for (const e of list) {
      const partnerElsewhere = avgExcluding(e.partner, player);
      if (partnerElsewhere === null) continue; // partner has no other pairings — no signal
      deltaSum += (e.xgfPct - partnerElsewhere) * e.toi;
      deltaToi += e.toi;
    }
    out[player] = {
      pairXgfPct,
      driverScore: deltaToi > 0 ? deltaSum / deltaToi : 0,
    };
  }
  return out;
}

// Blend current/prior bucket values: 60/40 when both exist, 100% otherwise
function blend(current: number | null | undefined, prior: number | null | undefined): number | null {
  const c = current ?? null;
  const p = prior ?? null;
  if (c !== null && p !== null) return c * NST_CURRENT_WEIGHT + p * NST_PRIOR_WEIGHT;
  return c ?? p;
}

async function processMoneypuckData() {
  const rootDir = path.join(process.cwd(), 'MoneyPuckData');
  const folders = fs.readdirSync(rootDir).filter(f => f.match(/^\d{4}_\d{2}$/)).sort();

  for (const folder of folders) {
    const seasonKey = getSeasonKey(folder);
    if (!seasonKey) continue;

    const seasonDir = path.join(rootDir, folder);
    console.log(`Processing season: ${folder} (weight ${SEASON_WEIGHTS[seasonKey]})...`);

    // ── Skaters ──────────────────────────────────────────────────
    const skatersPath = findCsv(seasonDir, 'skaters');
    if (skatersPath) {
      const data = fs.readFileSync(skatersPath, 'utf8').split('\n');
      const headers = parseCSVLine(data[0]);

      const idx = (name: string) => headers.indexOf(name);
      const idxId = idx('playerId');
      const idxName = idx('name');
      const idxPos = idx('position');
      const idxSit = idx('situation');
      const idxGP = idx('games_played');
      const idxIce = idx('icetime');
      const idxPts = idx('I_F_points');
      const idxGameScore = idx('gameScore');
      const idxOnXgPct = idx('onIce_xGoalsPercentage');
      const idxOffXgPct = idx('offIce_xGoalsPercentage');

      // Pass 1: collect per-situation rows keyed by playerId
      const rows: Record<string, Record<string, string[]>> = {};
      for (let i = 1; i < data.length; i++) {
        if (!data[i].trim()) continue;
        const row = parseCSVLine(data[i]);
        const id = row[idxId];
        const sit = row[idxSit];
        if (!rows[id]) rows[id] = {};
        rows[id][sit] = row;
      }

      for (const [id, sits] of Object.entries(rows)) {
        const all = sits['all'];
        if (!all) continue;

        const games = num(all[idxGP]);
        if (games < MIN_GAMES_SKATER) continue;

        const name = all[idxName];
        if (!db[id]) {
          db[id] = { name, position: all[idxPos], isGoalie: false, skaterSeasons: {}, goalieSeasons: {} };
        }

        const es = sits['5on5'];
        const pp = sits['5on4'];
        const pk = sits['4on5'];

        // 5on5 is the purest defensive/impact signal; fall back to 'all' if missing
        const onXg  = es ? num(es[idxOnXgPct])  : num(all[idxOnXgPct]);
        const offXg = es ? num(es[idxOffXgPct]) : num(all[idxOffXgPct]);
        const xgRel = onXg - offXg;

        // DPS proxy — same scale as before (xgPct * 5 * games/82) so the engine's
        // baselineDpsProxy blend weights stay valid, now sourced from 5on5
        const dpsProxy = (onXg * 5) * (games / 82);

        const totalIce = num(all[idxIce]);
        const pkIce = pk ? num(pk[idxIce]) : 0;

        db[id].skaterSeasons[seasonKey] = {
          gamesPlayed: games,
          points: num(all[idxPts]),
          gameScore: num(all[idxGameScore]),
          xgRel,
          dpsProxy,
          ppPoints: pp ? num(pp[idxPts]) : 0,
          pkIceShare: totalIce > 0 ? pkIce / totalIce : 0,
        };
      }
      console.log(`  skaters: ${Object.keys(rows).length} players in ${path.basename(skatersPath)}`);
    } else {
      console.warn(`  ⚠ no skaters CSV found in ${folder}`);
    }

    // ── Goalies ──────────────────────────────────────────────────
    const goaliesPath = findCsv(seasonDir, 'goalies');
    if (goaliesPath) {
      const data = fs.readFileSync(goaliesPath, 'utf8').split('\n');
      const headers = parseCSVLine(data[0]);

      const idxId = headers.indexOf('playerId');
      const idxName = headers.indexOf('name');
      const idxSit = headers.indexOf('situation');
      const idxGP = headers.indexOf('games_played');
      const idxGoals = headers.indexOf('goals');
      const idxXGoals = headers.indexOf('xGoals');

      let count = 0;
      for (let i = 1; i < data.length; i++) {
        if (!data[i].trim()) continue;
        const row = parseCSVLine(data[i]);
        if (row[idxSit] !== 'all') continue;

        const games = num(row[idxGP]);
        if (games < MIN_GAMES_GOALIE) continue;

        const id = row[idxId];
        const name = row[idxName];
        if (!db[id]) {
          db[id] = { name, position: "G", isGoalie: true, skaterSeasons: {}, goalieSeasons: {} };
        }
        db[id].isGoalie = true;

        // GSAX = expected goals against minus actual goals against
        db[id].goalieSeasons[seasonKey] = {
          gamesPlayed: games,
          gsax: num(row[idxXGoals]) - num(row[idxGoals]),
        };
        count++;
      }
      console.log(`  goalies: ${count} qualifying in ${path.basename(goaliesPath)}`);
    } else {
      console.warn(`  ⚠ no goalies CSV found in ${folder}`);
    }
  }

  // ── Aggregate with season weights ──────────────────────────────
  const outputBaselines: Record<string, any> = {};

  for (const player of Object.values(db)) {
    let totalWeight = 0;
    let aggPtsPace = 0, aggGameScore = 0, aggDpsProxy = 0;
    let aggXgRel = 0, aggPpPace = 0, aggPkShare = 0;
    let aggGsax = 0;

    if (player.isGoalie) {
      for (const [season, s] of Object.entries(player.goalieSeasons)) {
        const weight = SEASON_WEIGHTS[season] || 0;
        aggGsax += s.gsax * weight;
        totalWeight += weight;
      }
    } else {
      for (const [season, s] of Object.entries(player.skaterSeasons)) {
        const weight = SEASON_WEIGHTS[season] || 0;
        const paceMult = 82 / s.gamesPlayed;
        aggPtsPace   += (s.points * paceMult) * weight;
        aggGameScore += (s.gameScore * paceMult) * weight;
        aggDpsProxy  += s.dpsProxy * weight;
        aggXgRel     += s.xgRel * weight;
        aggPpPace    += (s.ppPoints * paceMult) * weight;
        aggPkShare   += s.pkIceShare * weight;
        totalWeight  += weight;
      }
    }

    if (totalWeight <= 0) continue;

    // Normalize by accumulated weight so partial-history players (rookies,
    // returnees) are restored to a full-strength baseline
    const key = player.name.toLowerCase().replace(/[^a-z]/g, '');
    outputBaselines[key] = {
      name: player.name,
      baselinePtsPace:   round2(aggPtsPace / totalWeight),
      baselineGameScore: round2(aggGameScore / totalWeight),
      baselineDpsProxy:  round2(aggDpsProxy / totalWeight),
      baselineGsax:      round2(aggGsax / totalWeight),
      baselineXgRel:     round3(aggXgRel / totalWeight),
      ppPtsPace82:       round2(aggPpPace / totalWeight),
      pkTimeShare:       round3(aggPkShare / totalWeight),
      totalSeasonsWeighted: round2(totalWeight),
    };
  }

  // ── NST enrichment (OtherData/) ────────────────────────────────
  const nstDir = path.join(process.cwd(), 'OtherData');
  let enriched = 0, pairingCount = 0;
  if (fs.existsSync(nstDir)) {
    console.log(`\nProcessing OtherData (NST)...`);
    const current = loadNstBucket(nstDir, '2025;26');
    const prior   = loadNstBucket(nstDir, '2022;23;24;25');
    console.log(`  current: ${Object.keys(current.skaters).length} skaters, ${Object.keys(current.goalies).length} goalies, ${current.pairings.length} pairings`);
    console.log(`  prior:   ${Object.keys(prior.skaters).length} skaters, ${Object.keys(prior.goalies).length} goalies, ${prior.pairings.length} pairings`);

    const pairCurrent = computePairingMetrics(current.pairings);
    const pairPrior   = computePairingMetrics(prior.pairings);

    for (const [key, entry] of Object.entries(outputBaselines)) {
      const sk = blendFields(current.skaters[key], prior.skaters[key]);
      const gl = blendFields(current.goalies[key], prior.goalies[key]);
      const oi = blendFields(current.onIce[key],   prior.onIce[key]);
      const pr = blendFields(pairCurrent[key],     pairPrior[key]);

      let touched = false;
      if (sk) {
        entry.baselineIxg82    = round2(sk.ixg82);
        entry.baselineHits82   = round2(sk.hits82);
        entry.baselineBlocks82 = round2(sk.blocks82);
        touched = true;
      }
      if (oi && oi.esXgfPct != null) {
        entry.baselineEsXgfPct = round2(oi.esXgfPct);
        touched = true;
      }
      if (pr) {
        entry.pairXgfPct      = round2(pr.pairXgfPct);
        entry.pairDriverScore = round2(pr.driverScore);
        pairingCount++;
        touched = true;
      }
      if (gl) {
        if (gl.hdsvPct != null) entry.baselineHdsvPct = round3(gl.hdsvPct);
        entry.baselineGsaaPerGame = round3(gl.gsaaPerGame);
        touched = true;
      }
      if (touched) enriched++;
    }
  } else {
    console.warn(`\n⚠ OtherData/ not found — skipping NST enrichment`);
  }

  const outputPath = path.join(process.cwd(), 'app', 'data', 'moneypuck_baselines.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputBaselines, null, 2));

  const goalieCount = Object.values(db).filter(p => p.isGoalie).length;
  const multiSeason = Object.values(outputBaselines).filter((b: any) => b.totalSeasonsWeighted > 0.5).length;
  console.log(`\n✓ Wrote ${Object.keys(outputBaselines).length} baselines to ${outputPath}`);
  console.log(`  ${goalieCount} goalies | ${multiSeason} players with multi-season history (weight > 0.5)`);
  console.log(`  ${enriched} entries enriched with NST data | ${pairingCount} D-men with pairing metrics`);
}

// Field-wise 60/40 blend of two bucket records (numeric fields only)
function blendFields<T extends Record<string, any>>(cur: T | undefined, pri: T | undefined): Record<string, any> | null {
  if (!cur && !pri) return null;
  const keys = new Set([...Object.keys(cur ?? {}), ...Object.keys(pri ?? {})]);
  const out: Record<string, any> = {};
  for (const k of keys) {
    out[k] = blend(cur?.[k], pri?.[k]);
  }
  return out;
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round3(n: number) { return Math.round(n * 1000) / 1000; }

processMoneypuckData().catch(console.error);
