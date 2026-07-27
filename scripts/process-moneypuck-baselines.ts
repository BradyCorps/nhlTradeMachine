import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sourceManifestJson from './moneypuck-baseline-sources.json';

// ── Multi-Season Baseline Builder (MoneyPuck + Natural Stat Trick) ───────────
// Reads the exact MoneyPuck and NST files declared in the source manifest and
// produces app/data/moneypuck_baselines.json — the multi-year anchor consumed
// by the X-NAV engine's baseline blending.
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
//
// The scoped source manifest includes NST skater totals and pairings only.
// Existing on-ice and goalie enrichments are carried forward by NHL player ID;
// this builder does not inspect any undeclared OtherData files.

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
  playerId: number;
  name: string;
  position: string;
  isGoalie: boolean;
  aliases: Set<string>;
  positions: Set<string>;
  teams: Set<string>;
  skaterSeasons: Record<string, SkaterSeason>;
  goalieSeasons: Record<string, GoalieSeason>;
}

const db: Record<string, PlayerAggregate> = {};

interface ManifestSource {
  path: string;
  sha256: string;
}

interface BaselineSourceManifest {
  schemaVersion: 'moneypuck-baseline-source-manifest-v1';
  moneyPuckSeasons: Array<{
    seasonKey: string;
    seasonLabel: string;
    skaters: ManifestSource;
    goalies: ManifestSource;
  }>;
  naturalStatTrickBuckets: {
    current: {
      skaters: ManifestSource;
      pairings: ManifestSource;
    };
    prior: {
      skaters: ManifestSource;
      pairings: ManifestSource;
    };
  };
  runtimeArtifact: {
    path: string;
    preserveFields: string[];
  };
}

const ROOT = process.cwd();
const SOURCE_MANIFEST = sourceManifestJson as BaselineSourceManifest;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PRESERVED_RUNTIME_FIELDS = [
  'baselineEsXgfPct',
  'baselineHdsvPct',
  'baselineGsaaPerGame',
] as const;

function resolveRepositoryPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Manifest path must be repository-relative: ${relativePath}`);
  }
  const absolutePath = path.resolve(ROOT, relativePath);
  if (!absolutePath.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error(`Manifest path escapes the repository: ${relativePath}`);
  }
  return absolutePath;
}

function sourceFiles(): ManifestSource[] {
  return [
    ...SOURCE_MANIFEST.moneyPuckSeasons.flatMap((season) => [
      season.skaters,
      season.goalies,
    ]),
    SOURCE_MANIFEST.naturalStatTrickBuckets.current.skaters,
    SOURCE_MANIFEST.naturalStatTrickBuckets.current.pairings,
    SOURCE_MANIFEST.naturalStatTrickBuckets.prior.skaters,
    SOURCE_MANIFEST.naturalStatTrickBuckets.prior.pairings,
  ];
}

function validateSourceManifest(): void {
  if (SOURCE_MANIFEST.schemaVersion !== 'moneypuck-baseline-source-manifest-v1') {
    throw new Error(`Unsupported baseline source manifest: ${SOURCE_MANIFEST.schemaVersion}`);
  }
  const seasonKeys = SOURCE_MANIFEST.moneyPuckSeasons
    .map((season) => season.seasonKey)
    .sort();
  const expectedSeasonKeys = Object.keys(SEASON_WEIGHTS).sort();
  if (
    seasonKeys.length !== expectedSeasonKeys.length
    || seasonKeys.some((season, index) => season !== expectedSeasonKeys[index])
  ) {
    throw new Error(`Baseline source manifest seasons must be ${expectedSeasonKeys.join(', ')}`);
  }

  const sources = sourceFiles();
  const paths = sources.map((source) => source.path);
  if (sources.length !== 12 || new Set(paths).size !== sources.length) {
    throw new Error('Baseline source manifest must contain 12 unique raw files');
  }
  for (const source of sources) {
    resolveRepositoryPath(source.path);
    if (!SHA256_PATTERN.test(source.sha256)) {
      throw new Error(`Invalid SHA-256 in baseline source manifest: ${source.path}`);
    }
  }

  const preserveFields = [...SOURCE_MANIFEST.runtimeArtifact.preserveFields].sort();
  const expectedPreserveFields = [...PRESERVED_RUNTIME_FIELDS].sort();
  if (
    preserveFields.length !== expectedPreserveFields.length
    || preserveFields.some((field, index) => field !== expectedPreserveFields[index])
  ) {
    throw new Error('Baseline source manifest has an unexpected preserved-field scope');
  }
  const outputPath = resolveRepositoryPath(SOURCE_MANIFEST.runtimeArtifact.path);
  if (paths.some((sourcePath) => resolveRepositoryPath(sourcePath) === outputPath)) {
    throw new Error('Runtime baseline artifact cannot also be a raw source');
  }
}

function readManifestSource(source: ManifestSource): string {
  const filePath = resolveRepositoryPath(source.path);
  const body = fs.readFileSync(filePath);
  const actualSha256 = createHash('sha256').update(body).digest('hex');
  if (actualSha256 !== source.sha256) {
    throw new Error(
      `Baseline source fingerprint mismatch for ${source.path}: expected ${source.sha256}, received ${actualSha256}`,
    );
  }
  return body.toString('utf8');
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

const legacyNameKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');
const exactNameKey = (name: string) =>
  name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

function normalizePosition(value: string | null | undefined): string | null {
  const position = (value ?? '').trim().toUpperCase();
  if (position === 'D' || position === 'C' || position === 'G') return position;
  if (['L', 'R', 'W', 'LW', 'RW', 'F'].includes(position)) return 'W';
  return null;
}

const TEAM_ALIASES: Record<string, string> = {
  'L.A': 'LAK',
  'N.J': 'NJD',
  'S.J': 'SJS',
  'T.B': 'TBL',
  ARI: 'UTA',
  MON: 'MTL',
};

function sourceTeams(value: string | null | undefined): string[] {
  return [...new Set((value ?? '')
    .split(',')
    .map((team) => team.trim().toUpperCase())
    .map((team) => TEAM_ALIASES[team] ?? team)
    .filter(Boolean))];
}

// ── Natural Stat Trick enrichment (OtherData/) ───────────────────────────────
// Two time buckets: "2025;26" current season and "2022;23;24;25" prior span
// (pre-aggregated by NST — per-season weighting is impossible for the prior file).
const NST_CURRENT_WEIGHT = 0.6;
const NST_PRIOR_WEIGHT   = 0.4;

interface NstSkater  { gp: number; ixg82: number; hits82: number; blocks82: number; }
interface NstPairing { player: string; partner: string; toi: number; xgfPct: number; }

interface NstBucket {
  skaters:  Record<string, NstSkater>;
  pairings: NstPairing[];
}

interface NstIdentityDiagnostics {
  unmatchedSkaters: number;
  unmatchedPairings: number;
}

function requiredColumn(headers: string[], column: string, sourcePath: string): number {
  const index = headers.indexOf(column);
  if (index < 0) throw new Error(`${sourcePath} is missing required column ${column}`);
  return index;
}

function readNstCsv(source: ManifestSource): { headers: string[]; rows: string[][] } {
  const raw = readManifestSource(source).replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length === 0) throw new Error(`NST source is empty: ${source.path}`);
  return {
    headers: parseCSVLine(lines[0]),
    rows: lines.slice(1).map(parseCSVLine),
  };
}

function playerIdsByLegacyName(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const [playerId, player] of Object.entries(db)) {
    for (const alias of player.aliases) {
      const key = legacyNameKey(alias);
      const ids = index.get(key) ?? [];
      if (!ids.includes(playerId)) ids.push(playerId);
      index.set(key, ids);
    }
  }
  return index;
}

function nstIdentityKey(
  byName: Map<string, string[]>,
  name: string,
  position: string | null,
  teams: string[],
): { key: string; matchedPlayerId: boolean } {
  const sourceNameKey = legacyNameKey(name);
  let candidates = [...(byName.get(sourceNameKey) ?? [])];
  if (candidates.length <= 1) {
    return { key: `name:${sourceNameKey}`, matchedPlayerId: candidates.length === 1 };
  }
  const normalizedPosition = normalizePosition(position);
  if (normalizedPosition) {
    candidates = candidates.filter((playerId) =>
      db[playerId].positions.has(normalizedPosition));
  }
  if (candidates.length > 1 && teams.length > 0) {
    const teamMatches = candidates.filter((playerId) =>
      teams.some((team) => db[playerId].teams.has(team)));
    if (teamMatches.length > 0) candidates = teamMatches;
  }
  return candidates.length === 1
    ? { key: `id:${candidates[0]}`, matchedPlayerId: true }
    : { key: `name:${sourceNameKey}`, matchedPlayerId: false };
}

function nstLookupKeyForPlayer(playerId: string, byName: Map<string, string[]>): string {
  const sourceNameKey = legacyNameKey(db[playerId].name);
  return (byName.get(sourceNameKey)?.length ?? 0) > 1
    ? `id:${playerId}`
    : `name:${sourceNameKey}`;
}

function loadNstBucket(
  sources: { skaters: ManifestSource; pairings: ManifestSource },
  diagnostics: NstIdentityDiagnostics,
): NstBucket {
  const bucket: NstBucket = { skaters: {}, pairings: [] };
  const byName = playerIdsByLegacyName();

  // Skater totals (all situations) — ixG, hits, blocks.
  const skaterCsv = readNstCsv(sources.skaters);
  const iName = requiredColumn(skaterCsv.headers, 'Player', sources.skaters.path);
  const iTeam = requiredColumn(skaterCsv.headers, 'Team', sources.skaters.path);
  const iPosition = requiredColumn(skaterCsv.headers, 'Position', sources.skaters.path);
  const iGP = requiredColumn(skaterCsv.headers, 'GP', sources.skaters.path);
  const iIxg = requiredColumn(skaterCsv.headers, 'ixG', sources.skaters.path);
  const iHits = requiredColumn(skaterCsv.headers, 'Hits', sources.skaters.path);
  const iBlocks = requiredColumn(skaterCsv.headers, 'Shots Blocked', sources.skaters.path);
  for (const row of skaterCsv.rows) {
    const gp = num(row[iGP]);
    if (gp < MIN_GAMES_SKATER) continue;
    const identity = nstIdentityKey(
      byName,
      row[iName],
      row[iPosition],
      sourceTeams(row[iTeam]),
    );
    if (!identity.matchedPlayerId) {
      diagnostics.unmatchedSkaters++;
    }
    const pace = 82 / gp;
    bucket.skaters[identity.key] = {
      gp,
      ixg82:    num(row[iIxg]) * pace,
      hits82:   num(row[iHits]) * pace,
      blocks82: num(row[iBlocks]) * pace,
    };
  }

  // Defensive pairings (all situations) — driver/passenger analysis.
  const pairingCsv = readNstCsv(sources.pairings);
  const iP1 = requiredColumn(pairingCsv.headers, 'Player', sources.pairings.path);
  const iP2 = requiredColumn(pairingCsv.headers, 'Player 2', sources.pairings.path);
  const iPairTeam = requiredColumn(pairingCsv.headers, 'Team', sources.pairings.path);
  const iToi = requiredColumn(pairingCsv.headers, 'TOI', sources.pairings.path);
  const iXgf = requiredColumn(pairingCsv.headers, 'xGF%', sources.pairings.path);
  for (const row of pairingCsv.rows) {
    const toi = num(row[iToi]);
    const xgf = numOrNull(row[iXgf]);
    if (toi < 50 || xgf === null) continue;
    const teams = sourceTeams(row[iPairTeam]);
    const player = nstIdentityKey(byName, row[iP1], 'D', teams);
    const partner = nstIdentityKey(byName, row[iP2], 'D', teams);
    if (!player.matchedPlayerId || !partner.matchedPlayerId) {
      diagnostics.unmatchedPairings++;
    }
    if (player.key === partner.key) continue;
    bucket.pairings.push({
      player: player.key,
      partner: partner.key,
      toi,
      xgfPct: xgf,
    });
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

function requiredNhlPlayerId(value: string | undefined, sourcePath: string): string {
  const raw = (value ?? '').trim();
  const playerId = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(playerId) || playerId <= 0) {
    throw new Error(`Invalid NHL player ID in ${sourcePath}: ${value ?? ''}`);
  }
  return String(playerId);
}

function registerPlayer(
  playerId: string,
  name: string,
  position: string,
  team: string,
  isGoalie: boolean,
): PlayerAggregate {
  const cleanName = name.trim();
  if (!cleanName) throw new Error(`Missing MoneyPuck player name for NHL player ID ${playerId}`);
  const normalizedPosition = normalizePosition(position);
  const existing = db[playerId];
  if (existing && existing.isGoalie !== isGoalie) {
    throw new Error(`NHL player ID ${playerId} appears as both skater and goalie`);
  }
  const player = existing ?? {
    playerId: Number(playerId),
    name: cleanName,
    position,
    isGoalie,
    aliases: new Set<string>(),
    positions: new Set<string>(),
    teams: new Set<string>(),
    skaterSeasons: {},
    goalieSeasons: {},
  };
  player.aliases.add(exactNameKey(cleanName));
  if (normalizedPosition) player.positions.add(normalizedPosition);
  for (const teamId of sourceTeams(team)) {
    if (/^[A-Z]{2,3}$/.test(teamId)) player.teams.add(teamId);
  }
  db[playerId] = player;
  return player;
}

type PreservedRuntimeValues = Partial<Record<
  typeof PRESERVED_RUNTIME_FIELDS[number],
  number
>>;

function preservedRuntimeValues(): {
  byPlayerId: Map<string, PreservedRuntimeValues>;
  ambiguousLegacyKeys: number;
} {
  const artifactPath = resolveRepositoryPath(SOURCE_MANIFEST.runtimeArtifact.path);
  const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Runtime baseline artifact must be an object');
  }

  const idsByLegacyName = new Map<string, Set<string>>();
  for (const [playerId, player] of Object.entries(db)) {
    for (const alias of player.aliases) {
      const key = legacyNameKey(alias);
      const ids = idsByLegacyName.get(key) ?? new Set<string>();
      ids.add(playerId);
      idsByLegacyName.set(key, ids);
    }
  }

  const byPlayerId = new Map<string, PreservedRuntimeValues>();
  let ambiguousLegacyKeys = 0;
  for (const [artifactKey, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const preserved = Object.fromEntries(PRESERVED_RUNTIME_FIELDS.flatMap((field) => {
      const fieldValue = record[field];
      return typeof fieldValue === 'number' && Number.isFinite(fieldValue)
        ? [[field, fieldValue]]
        : [];
    })) as PreservedRuntimeValues;
    if (Object.keys(preserved).length === 0) continue;

    const directKey = /^\d+$/.test(artifactKey) && db[artifactKey]
      ? artifactKey
      : null;
    const embeddedId = typeof record.playerId === 'number'
      && Number.isSafeInteger(record.playerId)
      && record.playerId > 0
      && db[String(record.playerId)]
      ? String(record.playerId)
      : null;
    const legacyKeys = new Set([legacyNameKey(artifactKey)]);
    if (typeof record.name === 'string') legacyKeys.add(legacyNameKey(record.name));
    const candidates = new Set<string>();
    for (const key of legacyKeys) {
      for (const playerId of idsByLegacyName.get(key) ?? []) candidates.add(playerId);
    }
    const playerId = directKey ?? embeddedId
      ?? (candidates.size === 1 ? [...candidates][0] : null);
    if (!playerId) {
      if (candidates.size > 1) {
        ambiguousLegacyKeys++;
        continue;
      }
      throw new Error(`Unable to preserve runtime enrichment for baseline key ${artifactKey}`);
    }
    byPlayerId.set(playerId, {
      ...(byPlayerId.get(playerId) ?? {}),
      ...preserved,
    });
  }
  return { byPlayerId, ambiguousLegacyKeys };
}

async function processMoneypuckData() {
  validateSourceManifest();
  for (const playerId of Object.keys(db)) delete db[playerId];

  for (const season of [...SOURCE_MANIFEST.moneyPuckSeasons]
    .sort((a, b) => a.seasonKey.localeCompare(b.seasonKey))) {
    const { seasonKey, seasonLabel } = season;
    console.log(`Processing season: ${seasonLabel} (weight ${SEASON_WEIGHTS[seasonKey]})...`);

    // ── Skaters ──────────────────────────────────────────────────
    const skaterData = readManifestSource(season.skaters).split('\n');
    const skaterHeaders = parseCSVLine(skaterData[0]);

    const skaterColumn = (name: string) =>
      requiredColumn(skaterHeaders, name, season.skaters.path);
    const idxId = skaterColumn('playerId');
    const idxName = skaterColumn('name');
    const idxTeam = skaterColumn('team');
    const idxPos = skaterColumn('position');
    const idxSit = skaterColumn('situation');
    const idxGP = skaterColumn('games_played');
    const idxIce = skaterColumn('icetime');
    const idxPts = skaterColumn('I_F_points');
    const idxGameScore = skaterColumn('gameScore');
    const idxOnXgPct = skaterColumn('onIce_xGoalsPercentage');
    const idxOffXgPct = skaterColumn('offIce_xGoalsPercentage');

    // Pass 1: collect per-situation rows keyed by NHL player ID.
    const rows: Record<string, Record<string, string[]>> = {};
    for (let index = 1; index < skaterData.length; index++) {
      if (!skaterData[index].trim()) continue;
      const row = parseCSVLine(skaterData[index]);
      const playerId = requiredNhlPlayerId(row[idxId], season.skaters.path);
      const situation = row[idxSit];
      if (!rows[playerId]) rows[playerId] = {};
      if (rows[playerId][situation]) {
        throw new Error(
          `Duplicate MoneyPuck situation ${situation} for NHL player ID ${playerId} in ${season.skaters.path}`,
        );
      }
      rows[playerId][situation] = row;
    }

    for (const [playerId, situations] of Object.entries(rows)) {
      const all = situations.all;
      if (!all) continue;

      const games = num(all[idxGP]);
      if (games < MIN_GAMES_SKATER) continue;

      const player = registerPlayer(
        playerId,
        all[idxName],
        all[idxPos],
        all[idxTeam],
        false,
      );

      const es = situations['5on5'];
      const pp = situations['5on4'];
      const pk = situations['4on5'];

      // 5on5 is the purest defensive/impact signal; fall back to 'all' if missing.
      const onXg  = es ? num(es[idxOnXgPct])  : num(all[idxOnXgPct]);
      const offXg = es ? num(es[idxOffXgPct]) : num(all[idxOffXgPct]);
      const xgRel = onXg - offXg;

      // DPS proxy — same scale as before (xgPct * 5 * games/82) so the engine's
      // baselineDpsProxy blend weights stay valid, now sourced from 5on5.
      const dpsProxy = (onXg * 5) * (games / 82);

      const totalIce = num(all[idxIce]);
      const pkIce = pk ? num(pk[idxIce]) : 0;

      player.skaterSeasons[seasonKey] = {
        gamesPlayed: games,
        points: num(all[idxPts]),
        gameScore: num(all[idxGameScore]),
        xgRel,
        dpsProxy,
        ppPoints: pp ? num(pp[idxPts]) : 0,
        pkIceShare: totalIce > 0 ? pkIce / totalIce : 0,
      };
    }
    console.log(`  skaters: ${Object.keys(rows).length} players in ${path.basename(season.skaters.path)}`);

    // ── Goalies ──────────────────────────────────────────────────
    const goalieData = readManifestSource(season.goalies).split('\n');
    const goalieHeaders = parseCSVLine(goalieData[0]);
    const goalieColumn = (name: string) =>
      requiredColumn(goalieHeaders, name, season.goalies.path);
    const goalieId = goalieColumn('playerId');
    const goalieName = goalieColumn('name');
    const goalieTeam = goalieColumn('team');
    const goaliePosition = goalieColumn('position');
    const goalieSituation = goalieColumn('situation');
    const goalieGames = goalieColumn('games_played');
    const goalieGoals = goalieColumn('goals');
    const goalieExpectedGoals = goalieColumn('xGoals');

    let goalieCount = 0;
    for (let index = 1; index < goalieData.length; index++) {
      if (!goalieData[index].trim()) continue;
      const row = parseCSVLine(goalieData[index]);
      if (row[goalieSituation] !== 'all') continue;

      const games = num(row[goalieGames]);
      if (games < MIN_GAMES_GOALIE) continue;

      const playerId = requiredNhlPlayerId(row[goalieId], season.goalies.path);
      const player = registerPlayer(
        playerId,
        row[goalieName],
        row[goaliePosition],
        row[goalieTeam],
        true,
      );
      player.goalieSeasons[seasonKey] = {
        gamesPlayed: games,
        gsax: num(row[goalieExpectedGoals]) - num(row[goalieGoals]),
      };
      goalieCount++;
    }
    console.log(`  goalies: ${goalieCount} qualifying in ${path.basename(season.goalies.path)}`);
  }

  const preserved = preservedRuntimeValues();

  // ── Aggregate with season weights ──────────────────────────────
  const outputBaselines: Record<string, any> = {};

  for (const [playerId, player] of Object.entries(db)
    .sort(([a], [b]) => Number(a) - Number(b))) {
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
    // returnees) are restored to a full-strength baseline.
    outputBaselines[playerId] = {
      playerId: player.playerId,
      name: player.name,
      baselinePtsPace:   round2(aggPtsPace / totalWeight),
      baselineGameScore: round2(aggGameScore / totalWeight),
      baselineDpsProxy:  round2(aggDpsProxy / totalWeight),
      baselineGsax:      round2(aggGsax / totalWeight),
      baselineXgRel:     round3(aggXgRel / totalWeight),
      ppPtsPace82:       round2(aggPpPace / totalWeight),
      pkTimeShare:       round3(aggPkShare / totalWeight),
      totalSeasonsWeighted: round2(totalWeight),
      ...(preserved.byPlayerId.get(playerId) ?? {}),
    };
  }

  // ── NST enrichment (OtherData/) ────────────────────────────────
  console.log(`\nProcessing OtherData (NST)...`);
  const identityDiagnostics: NstIdentityDiagnostics = {
    unmatchedSkaters: 0,
    unmatchedPairings: 0,
  };
  const current = loadNstBucket(
    SOURCE_MANIFEST.naturalStatTrickBuckets.current,
    identityDiagnostics,
  );
  const prior = loadNstBucket(
    SOURCE_MANIFEST.naturalStatTrickBuckets.prior,
    identityDiagnostics,
  );
  console.log(`  current: ${Object.keys(current.skaters).length} skaters, ${current.pairings.length} pairings`);
  console.log(`  prior:   ${Object.keys(prior.skaters).length} skaters, ${prior.pairings.length} pairings`);

  const pairCurrent = computePairingMetrics(current.pairings);
  const pairPrior   = computePairingMetrics(prior.pairings);
  const nstNameIndex = playerIdsByLegacyName();
  let enriched = 0, pairingCount = 0;
  for (const [playerId, entry] of Object.entries(outputBaselines)) {
    const sourceKey = nstLookupKeyForPlayer(playerId, nstNameIndex);
    const sk = blendFields(current.skaters[sourceKey], prior.skaters[sourceKey]);
    const pr = blendFields(pairCurrent[sourceKey], pairPrior[sourceKey]);

    let touched = false;
    if (sk) {
      entry.baselineIxg82    = round2(sk.ixg82);
      entry.baselineHits82   = round2(sk.hits82);
      entry.baselineBlocks82 = round2(sk.blocks82);
      touched = true;
    }
    if (pr) {
      entry.pairXgfPct      = round2(pr.pairXgfPct);
      entry.pairDriverScore = round2(pr.driverScore);
      pairingCount++;
      touched = true;
    }
    if (touched) enriched++;
  }

  const outputIds = Object.keys(outputBaselines);
  if (
    outputIds.length !== Object.keys(db).length
    || outputIds.some((playerId) =>
      !/^\d+$/.test(playerId)
      || outputBaselines[playerId].playerId !== Number(playerId))
  ) {
    throw new Error('Runtime baseline artifact failed NHL player ID integrity checks');
  }

  const outputPath = resolveRepositoryPath(SOURCE_MANIFEST.runtimeArtifact.path);
  fs.writeFileSync(outputPath, `${JSON.stringify(outputBaselines, null, 2)}\n`);

  const goalieCount = Object.values(db).filter(p => p.isGoalie).length;
  const multiSeason = Object.values(outputBaselines).filter((b: any) => b.totalSeasonsWeighted > 0.5).length;
  console.log(`\n✓ Wrote ${Object.keys(outputBaselines).length} baselines to ${outputPath}`);
  console.log(`  ${goalieCount} goalies | ${multiSeason} players with multi-season history (weight > 0.5)`);
  console.log(`  ${enriched} entries enriched with NST data | ${pairingCount} D-men with pairing metrics`);
  console.log(`  ${identityDiagnostics.unmatchedSkaters} unmatched NST skater rows | ${identityDiagnostics.unmatchedPairings} unmatched pairing rows`);
  console.log(`  ${preserved.byPlayerId.size} ID-keyed legacy enrichment records preserved | ${preserved.ambiguousLegacyKeys} ambiguous name keys rejected`);
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

processMoneypuckData().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
