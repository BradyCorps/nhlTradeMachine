import { goalsAgainstAverage, resolveWorkload } from "@/app/lib/goalie-units";
import { SEASON, LEAGUE } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";
import { db } from "@/app/db/client";
import { players as playersTable, tradeBlock as tradeBlockTable } from "@/app/db/schema";
import { ensurePlayerColumns, ensurePlayerTable } from "@/app/db/ensure-schema";
import { seedPlayersTable } from "@/app/lib/league-seed";
import { resolveRosterTier } from "@/app/lib/xnav-engine";
import { calcDevelopmentProfile } from "@/app/lib/development-profile";
import {
  canonicalNameSlug,
  dedupePlayersByAuthority,
  dedupeSameTeamNicknames,
  removePlayerFromOtherRosters,
  safeNhlRosterPlayer,
} from "@/app/lib/player-identity";
import { latestEdgeSignalMap } from "@/app/lib/nhl-feed-capture";
import { latestGoalieBoardsMap, latestGoalieEdgeDetailMap } from "@/app/lib/goalie-edge";
import { FA_KNOWN_FACTS, seedFreeAgentStatus } from "@/app/lib/free-agent-seed";
import { listPublishedTrades, type TradeRecord } from "@/app/lib/trades";
import {
  buildDevelopmentInputFromNhlTimeline,
  buildDevelopmentInputFromPlayerPayload,
  fetchCachedNhlSkaterTimelineRowsForPlayers,
} from "@/app/lib/development-sources";
import { fetchProspectEnrichmentMap } from "@/app/lib/prospect-enrichment";
import { applyTeamCapDeltas, type CapDeltaAsset, type CapDeltaMoves, type TeamCapDeltaMap } from "@/app/lib/cap-delta";
import { baselineForNhlPlayerId, type PlayerBaselineMap } from "@/app/lib/player-baselines";
import { secondaryPositionFor } from "@/app/data/secondary-positions";
import { teamWindow } from "@/app/lib/team-window";
import { resolveRecordedExtension, type RecordedExtension } from "@/app/lib/extensions";
import { deriveAge, resolvePlayerAge } from "@/app/lib/player-age";
import { SEASON_START_YEAR } from "@/app/lib/contract-expiry";

const CONTRACTS_CACHE_TTL = 23 * 60 * 60; // 23 hours
const CONTRACTS_CACHE_KEY = "cache:contracts:v2";
const MONEYPUCK_CACHE_TTL =  4 * 60 * 60; // 4 hours
const MP_STALE_TTL        =  7 * 24 * 60 * 60; // 7 days — last-good fallback
const PS_CACHE_TTL        = 12 * 60 * 60; // 12 hours
const PS_STALE_TTL        =  7 * 24 * 60 * 60; // 7 days — last-good fallback
const POINT_SHARES_CACHE_KEY = "cache:pointshares:v2";
// Long-lived last-good copy. When the NHL stats API times out or 5xxs, we
// serve this instead of empty so OPS/DPS never silently blank on the page.
const POINT_SHARES_STALE_KEY = "cache:pointshares:stale:v2";

// Roster-identity overrides: the NHL API occasionally mis-tags a player's
// position. This is an *identity* patch (which slot a player fills), orthogonal
// to the contract pipeline — contract facts (cap/years/expiry) live in the DB
// players table, the single source of truth. Keep this list tiny.
const ROSTER_IDENTITY_OVERRIDES: Record<string, { position?: string }> = {
  "Quinton Byfield": { position: "C" },           // NHL API sometimes tags as "LW"
};

// ── Contract-status derivation (pure) ─────────────────────────────────────────
// Turns the DB's stored contract facts into the read-time free-agency signals.
// A pending free agent is a UFA/RFA whose deal expires in (or before) the
// projected season's start year. We key off expiryYear, not yearsRemaining,
// because yearsRemaining is floored to >=1 across the pipeline and can't tell a
// 2026 FA from a 2027 one. Draftees and ELCs are never pending FAs.
export function deriveContractStatus(opts: {
  expiryStatus?: string | null;
  expiryYear?: number | null;
  yearsRemaining?: number | null;
  draftOverall?: number | null;
  isELC?: boolean;
  offseasonYear?: number;
  /** Admin-recorded extension. A signed extension is not a trip to the market. */
  extensionCapHit?: number | null;
  extensionYears?: number | null;
}): {
  contractStatus: "UFA" | "RFA" | "SIGNED";
  expiresThisOffseason: boolean;
  normExpiry: "UFA" | "RFA" | null;
  extension: RecordedExtension;
} {
  const offseasonYear = opts.offseasonYear ?? Number(SEASON.label.slice(0, 4));
  const raw = typeof opts.expiryStatus === "string" ? opts.expiryStatus : null;
  const normExpiry: "UFA" | "RFA" | null = raw
    ? (/rfa/i.test(raw) ? "RFA" : /ufa/i.test(raw) ? "UFA" : null)
    : null;
  const rawExpiryYear = typeof opts.expiryYear === "number" ? opts.expiryYear : null;
  const prelim = opts.isELC ? 1 : (opts.yearsRemaining ?? 1);
  // draftOverall suppresses FA detection only for young ELC-age players (≤23).
  // Veterans with draftOverall from prospect enrichment should still expire.
  const isDraftSuppressed = opts.draftOverall != null && opts.isELC;
  const currentDealExpires =
    normExpiry != null && !isDraftSuppressed &&
    (rawExpiryYear != null ? rawExpiryYear <= offseasonYear : prelim <= 1);

  // A recorded extension is a signed contract, so it settles the question the
  // expiry flags were being used to answer. Whether it has STARTED depends on
  // the deal it follows: if that one has run out, the extension is the current
  // contract; if not, it is money owed in a later season and the current deal
  // stands. Either way the player is signed and does not reach the market —
  // which is the bug this fixes. `expiryStatus` is left untouched as the record
  // of what he would have been.
  const extension = resolveRecordedExtension({
    extensionCapHit: opts.extensionCapHit,
    extensionYears: opts.extensionYears,
    currentDealExpired: currentDealExpires,
  });

  const expiresThisOffseason = currentDealExpires && extension.state === "NONE";
  const contractStatus: "UFA" | "RFA" | "SIGNED" =
    expiresThisOffseason && normExpiry ? normExpiry : "SIGNED";
  return { contractStatus, expiresThisOffseason, normExpiry, extension };
}

const NHL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nhl.com",
  "Referer": "https://www.nhl.com/",
};

const fetchWithTimeout = (url: string, ms = 8000, extraHeaders: Record<string, string> = {}): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {
    signal: ctrl.signal,
    cache: "no-store",
    headers: { ...extraHeaders },
  }).finally(() => clearTimeout(t));
};

const parseCSVRow = (row: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of row) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
};

const slugify = canonicalNameSlug;

const normalisePos = (code: string) =>
  code === "L" || code === "R" ? "W" : code;

const hasDiacritics = (name: string): boolean =>
  name.normalize("NFD") !== name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const VALID_TEAM_IDS = new Set(TEAMS_DB.map(t => t.id));

const isValidTeamId = (teamId: string | null | undefined): teamId is string =>
  Boolean(teamId && VALID_TEAM_IDS.has(teamId));

const developmentTeamContext = (phase: string | undefined, standing: number | undefined): "STRONG" | "AVERAGE" | "WEAK" => {
  if (phase === "Contender" || phase === "Bubble" || (standing != null && standing <= 10)) return "STRONG";
  if (phase === "Rebuilding" || phase === "Tanking" || (standing != null && standing >= 25)) return "WEAK";
  return "AVERAGE";
};

// League-average age used only when a live NHL birthdate is malformed —
// vanishingly rare, and a fixed non-alarming fallback beats a null here since
// this path always has a real birthdate string to parse.
const calcAge = (birthDate: string): number => deriveAge(birthDate) ?? 27;

const developmentLinemateContext = (
  position: string,
  avgTOI: number,
  qocIndex: number | null,
): "STRONG" | "AVERAGE" | "WEAK" => {
  if (qocIndex != null && qocIndex >= 68) return "STRONG";
  if (position === "D" && avgTOI >= 21) return "STRONG";
  if (position !== "D" && avgTOI >= 17) return "STRONG";
  if (qocIndex != null && qocIndex <= 32) return "WEAK";
  if (position === "D" && avgTOI > 0 && avgTOI < 14) return "WEAK";
  if (position !== "D" && avgTOI > 0 && avgTOI < 10) return "WEAK";
  return "AVERAGE";
};

const developmentInternationalScore = (prospectPtsPace: number | null | undefined): number | undefined =>
  prospectPtsPace != null && prospectPtsPace > 0
    ? Math.max(20, Math.min(100, prospectPtsPace * 1.4))
    : undefined;

const assetSnapshotName = (snapshot: Record<string, unknown>): string =>
  typeof snapshot.name === "string" ? snapshot.name : "";

const movedPlayerKeys = (asset: TradeRecord["sides"][number]["assetsGiven"][number]): string[] => {
  const keys = [
    asset.ref.id ? `id:${asset.ref.id}` : "",
    asset.ref.nameSlug ? `slug:${asset.ref.nameSlug}` : "",
  ];
  const snapshotSlug = canonicalNameSlug(assetSnapshotName(asset.inputSnapshot));
  if (snapshotSlug) keys.push(`slug:${snapshotSlug}`);
  return keys.filter(Boolean);
};

export function applyPublishedTradeOverlay<T extends {
  id?: unknown;
  name?: unknown;
  teamId?: string;
  position?: string;
  retainedPct?: number;
  tradeBlockStatus?: string | null;
  tradeBlockNote?: string | null;
}>(
  players: T[],
  publishedTrades: TradeRecord[],
): T[] {
  if (publishedTrades.length === 0) return players;

  const destinations = new Map<string, { teamId: string; retainedPct: number }>();

  for (const trade of publishedTrades) {
    if (!trade.published || !trade.rosterMutating || trade.sides.length !== 2) continue;
    const [sideA, sideB] = trade.sides;
    const pairs = [
      { from: sideA, toTeamId: sideB.teamId },
      { from: sideB, toTeamId: sideA.teamId },
    ];

    for (const pair of pairs) {
      for (const asset of pair.from.assetsGiven) {
        if (asset.kind !== "player") continue;
        for (const key of movedPlayerKeys(asset)) {
          destinations.set(key, {
            teamId: pair.toTeamId,
            retainedPct: asset.retainedPct ?? 0,
          });
        }
      }
    }
  }

  if (destinations.size === 0) return players;

  return players.map((player) => {
    const idKey = player.id == null ? "" : `id:${String(player.id)}`;
    const nameSlug = typeof player.name === "string" ? canonicalNameSlug(player.name) : "";
    const move = (idKey ? destinations.get(idKey) : undefined)
      ?? (nameSlug ? destinations.get(`slug:${nameSlug}`) : undefined);

    if (!move || player.teamId === move.teamId) return player;

    return {
      ...player,
      teamId: move.teamId,
      retainedPct: player.position === "Pick" ? player.retainedPct : move.retainedPct,
      tradeBlockStatus: null,
      tradeBlockNote: null,
    };
  });
}

const playerMatchesTradeAsset = (
  player: { id?: unknown; name?: unknown },
  asset: TradeRecord["sides"][number]["assetsGiven"][number],
): boolean => {
  const keys = new Set(movedPlayerKeys(asset));
  const idKey = player.id == null ? "" : `id:${String(player.id)}`;
  const nameSlug = typeof player.name === "string" ? canonicalNameSlug(player.name) : "";
  return Boolean((idKey && keys.has(idKey)) || (nameSlug && keys.has(`slug:${nameSlug}`)));
};

const isAlreadyReconciled = (
  basePlayers: Array<{ id?: unknown; name?: unknown; teamId?: string }> | undefined,
  asset: TradeRecord["sides"][number]["assetsGiven"][number],
  destinationTeamId: string,
): boolean =>
  Boolean(basePlayers?.some((player) =>
    player.teamId === destinationTeamId && playerMatchesTradeAsset(player, asset)
  ));

const assetSnapshotCapHit = (snapshot: Record<string, unknown>): number => {
  const capHit = snapshot.capHit;
  return typeof capHit === "number" && Number.isFinite(capHit) ? capHit : 0;
};

const addCapMove = (
  moves: Record<string, CapDeltaMoves>,
  teamId: string,
  side: "incoming" | "outgoing",
  asset: CapDeltaAsset,
) => {
  const current = moves[teamId] ?? {};
  moves[teamId] = {
    ...current,
    [side]: [...(current[side] ?? []), asset],
  };
};

export function buildPublishedTradeCapMoves(
  publishedTrades: TradeRecord[],
  basePlayers?: Array<{ id?: unknown; name?: unknown; teamId?: string }>,
): Record<string, CapDeltaMoves> {
  const moves: Record<string, CapDeltaMoves> = {};

  for (const trade of publishedTrades) {
    if (!trade.published || !trade.rosterMutating || trade.sides.length !== 2) continue;
    const [sideA, sideB] = trade.sides;
    const pairs = [
      { from: sideA, to: sideB },
      { from: sideB, to: sideA },
    ];

    for (const pair of pairs) {
      for (const asset of pair.from.assetsGiven) {
        if (asset.kind !== "player") continue;
        if (isAlreadyReconciled(basePlayers, asset, pair.to.teamId)) continue;
        const capAsset = {
          capHit: assetSnapshotCapHit(asset.inputSnapshot),
          retainedPct: asset.retainedPct ?? 0,
        };
        addCapMove(moves, pair.from.teamId, "outgoing", capAsset);
        addCapMove(moves, pair.to.teamId, "incoming", capAsset);
      }
    }
  }

  return moves;
}


// ── EV QoC Index (0-100): quantified even-strength deployment difficulty ──
// Replaces the old "qocRank", which was MoneyPuck's raw iceTimeRank SUM — a
// number that scaled with games played and measured nothing. Components:
//   65% — average per-game ice-time rank (coach trust; F scaled 1-12, D 1-6)
//   35% — defensive-zone start share (shutdown deployment)
// PK deployment is intentionally excluded; X-NAV applies SH leverage separately.
// Higher = tougher 5v5 minutes. ~75+ shutdown/top-pair usage, ~40 middle six, <20 sheltered.
export function calcQocIndex(
  position: string,
  iceRankAvg: number | null | undefined,
  dzPct: number | null | undefined,
): number | null {
  if (position === "G") return null;
  if (iceRankAvg == null && dzPct == null) return null;
  const slots = position === "D" ? 6 : 12;
  const rankScore = iceRankAvg != null
    ? Math.max(0, Math.min(1, (slots + 1 - iceRankAvg) / slots))
    : 0.4; // unknown deployment → assume mid-roster
  const dzScore = Math.max(0, Math.min(1, ((dzPct ?? 0.5) - 0.35) / 0.30));
  return Math.round(100 * (0.65 * rankScore + 0.35 * dzScore));
}

function removeRetiredPlayersFromRosters(rosterMap: Map<string, any[]>, retiredPlayers: { id?: unknown; name?: unknown }[]): void {
  const retiredIds = new Set(retiredPlayers.map(p => p.id == null ? "" : String(p.id)).filter(Boolean));
  const retiredSlugs = new Set(retiredPlayers.map(p => typeof p.name === "string" ? canonicalNameSlug(p.name) : "").filter(Boolean));
  for (const [teamId, list] of rosterMap.entries()) {
    rosterMap.set(teamId, list.filter(p => {
      const id = p?.id == null ? "" : String(p.id);
      const slug = typeof p?.name === "string" ? canonicalNameSlug(p.name) : "";
      return !(id && retiredIds.has(id)) && !(slug && retiredSlugs.has(slug));
    }));
  }
}

function loadBundledFallback(): Record<string, any> {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/contracts.bundled.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e: any) {
    console.error("[Bundled] FAILED:", e.message);
  }
  return {};
}

function loadBaselines(): PlayerBaselineMap {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/moneypuck_baselines.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) { console.error("[roster-assembly] Failed to load moneypuck_baselines.json:", err instanceof Error ? err.message : err); return {}; }
}

function loadTeamBaselines(): Record<string, any> {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/team_baselines.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) { console.error("[roster-assembly] Failed to load team_baselines.json:", err instanceof Error ? err.message : err); return {}; }
}

// Last-resort fallback used only when the DB read itself throws: build the
// contract map from the bundled snapshot. Carries no expiry facts (bundled has
// none), so the off-season FA list will be empty until the DB is reachable again.
function loadContractsFromBundled(): Record<string, any> {
  const bundled = loadBundledFallback();
  const merged: Record<string, any> = {};
  for (const [name, raw] of Object.entries(bundled)) {
    if (name.includes("__")) continue;
    const bc = raw as any;
    if (!bc || typeof bc.capHit !== "number") continue;
    merged[name] = {
      capHit:         bc.capHit,
      yearsRemaining: bc.yearsRemaining ?? 1,
      hasNMC:         bc.hasNMC ?? false,
      hasNTC:         bc.hasNTC ?? false,
      canRetain:      bc.hasNMC ? false : (bc.canRetain ?? true),
      expiryStatus:   bc.expiryStatus ?? null,
      expiryYear:     bc.expiryYear ?? null,
      position:       bc.position ?? null,
    };
  }
  return merged;
}

// ── Contracts: the players table is the single source of truth ────────────────
// Reads contract + free-agency facts straight from the DB — no live scrape, no
// bundled merge, no read-time FA seed. Ingestion (sync / Load Baseline) is the
// only writer; this is a pure read + join key builder. An empty table (fresh
// boot or post-reset) auto-loads the canonical baseline so reads are never empty.
async function loadContractsFromDB(): Promise<Record<string, any>> {
  if (redis) {
    const cached = await redis.get<Record<string, any>>(CONTRACTS_CACHE_KEY);
    if (cached && Object.keys(cached).length > 50) return cached;
  }

  let rows: any[];
  try {
    await ensurePlayerTable();
    await ensurePlayerColumns();
    rows = await db.select().from(playersTable);
    if (rows.length === 0) {
      await seedPlayersTable().catch((e) => console.warn("[Contracts] auto-seed failed:", e?.message));
      rows = await db.select().from(playersTable).catch(() => []);
    }
  } catch (e: any) {
    console.warn("[Contracts] DB read failed, falling back to bundled.json:", e?.message);
    return loadContractsFromBundled();
  }

  const merged: Record<string, any> = {};
  for (const row of rows) {
    if (row.retired || row.excludeFromRoster) continue;
    // "Unknown" → null so the name-collision heuristic (which keys off a known
    // contract position) never fires on a seed row of unknown position.
    const position = row.position && row.position !== "Unknown" ? row.position : null;
    const rec = {
      capHit:         row.capHit,
      yearsRemaining: row.yearsRemaining ?? 1,
      hasNMC:         row.hasNmc ?? false,
      hasNTC:         row.hasNtc ?? false,
      canRetain:      row.hasNmc ? false : true,
      expiryStatus:   row.expiryStatus ?? null,
      expiryYear:     row.expiryYear ?? null,
      extensionCapHit: row.extensionCapHit ?? undefined,
      extensionYears:  row.extensionYears ?? undefined,
      extensionSignedAt: row.extensionSignedAt ?? null,
      position,
    };
    const name = row.name;
    if (!name) continue;
    const normalName = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
    merged[name] = rec;
    if (!(normalName in merged)) merged[normalName] = rec;
    // Disambiguation aliases the build loop tries first for same-named players.
    const pos = (position ?? "").toUpperCase();
    if (pos) merged[`${name}__${pos}`] = rec;
    if (row.teamId) merged[`${name}__${String(row.teamId).toLowerCase()}`] = rec;
  }

  if (redis && Object.keys(merged).length > 50) {
    await redis.setex(CONTRACTS_CACHE_KEY, CONTRACTS_CACHE_TTL, merged);
  }
  return merged;
}

interface NHLSkaterRow {
  playerId:         number;
  skaterFullName:   string;
  teamAbbrevs:      string;
  positionCode:     string;
  gamesPlayed:      number;
  goals:            number;
  assists:          number;
  plusMinus:        number;
  timeOnIcePerGame: number;
}

interface NHLTeamRow {
  teamId:       number;
  teamFullName: string;
  gamesPlayed:  number;
  goalsFor:     number;
  goalsAgainst: number;
  points:       number;
}

async function fetchPointShares(): Promise<Map<string, { ops: number; dps: number }>> {
  if (redis) {
    const cached = await redis.get<Record<string, { ops: number; dps: number }>>(POINT_SHARES_CACHE_KEY);
    if (cached) return new Map(Object.entries(cached));
  }

  const psMap = new Map<string, { ops: number; dps: number }>();

  try {
    const [skatersRes, teamsRes] = await Promise.allSettled([
      fetchWithTimeout(
        `https://api.nhle.com/stats/rest/en/skater/summary?cayenneExp=seasonId%3D${SEASON.nhleSeasonId}%20and%20gameTypeId%3D2&limit=-1`,
        10000
      ),
      fetchWithTimeout(
        `https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId%3D${SEASON.nhleSeasonId}%20and%20gameTypeId%3D2&limit=32`,
        8000
      ),
    ]);

    if (skatersRes.status !== "fulfilled" || !skatersRes.value.ok) throw new Error("skater summary unavailable");
    if (teamsRes.status  !== "fulfilled" || !teamsRes.value.ok)   throw new Error("team summary unavailable");

    const skaterData: { data: NHLSkaterRow[] } = await skatersRes.value.json();
    const teamData:   { data: NHLTeamRow[]   } = await teamsRes.value.json();
    const skaters = skaterData.data ?? [];
    const teams   = teamData.data   ?? [];

    if (skaters.length < 100 || teams.length < 28) throw new Error("point-shares source returned too few rows");

    const leagueGoals  = teams.reduce((s, t) => s + t.goalsFor, 0);
    const leaguePoints = teams.reduce((s, t) => s + t.points, 0);
    const totalTeamGames = teams.reduce((s, t) => s + t.gamesPlayed, 0);
    const leagueGPG      = leagueGoals / totalTeamGames;
    const marginalGoalsPerPoint = leagueGoals / leaguePoints;

    const TEAM_ABBREV_MAP: Record<string, string> = {
      "ANA":"Anaheim Ducks","ARI":"Utah Mammoth","UTA":"Utah Mammoth",
      "BOS":"Boston Bruins","BUF":"Buffalo Sabres","CGY":"Calgary Flames",
      "CAR":"Carolina Hurricanes","CHI":"Chicago Blackhawks","COL":"Colorado Avalanche",
      "CBJ":"Columbus Blue Jackets","DAL":"Dallas Stars","DET":"Detroit Red Wings",
      "EDM":"Edmonton Oilers","FLA":"Florida Panthers","LAK":"Los Angeles Kings",
      "MIN":"Minnesota Wild","MTL":"Montreal Canadiens","NSH":"Nashville Predators",
      "NJD":"New Jersey Devils","NYI":"New York Islanders","NYR":"New York Rangers",
      "OTT":"Ottawa Senators","PHI":"Philadelphia Flyers","PIT":"Pittsburgh Penguins",
      "SJS":"San Jose Sharks","SEA":"Seattle Kraken","STL":"St. Louis Blues",
      "TBL":"Tampa Bay Lightning","TOR":"Toronto Maple Leafs","VAN":"Vancouver Canucks",
      "VGK":"Vegas Golden Knights","WSH":"Washington Capitals","WPG":"Winnipeg Jets",
    };

    const normalise = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const teamByName = new Map<string, NHLTeamRow>();
    for (const t of teams) teamByName.set(normalise(t.teamFullName), t);
    const teamByAbbrev = new Map<string, NHLTeamRow>();
    for (const [abbrev, fullName] of Object.entries(TEAM_ABBREV_MAP)) {
      const t = teamByName.get(normalise(fullName));
      if (t) teamByAbbrev.set(abbrev, t);
    }

    const toMin = (sec: number) => sec / 60;
    const MIN_TOI_PER_GAME = 5 * 60;

    const teamAggregates = new Map<string, {
      fwdTOI: number; defTOI: number; totalSktTOI: number;
      fwdPM: number;  defPM: number;
      fwdGP: number;  defGP: number;
    }>();

    for (const s of skaters) {
      if (s.timeOnIcePerGame < MIN_TOI_PER_GAME) continue;
      const abbrev   = s.teamAbbrevs.split(",")[0].trim();
      const totalTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed;
      const isD      = s.positionCode === "D";
      const agg      = teamAggregates.get(abbrev) ?? {
        fwdTOI: 0, defTOI: 0, totalSktTOI: 0,
        fwdPM: 0,  defPM: 0,
        fwdGP: 0,  defGP: 0,
      };
      if (isD) { agg.defTOI += totalTOI; agg.defPM += s.plusMinus; agg.defGP += s.gamesPlayed; }
      else     { agg.fwdTOI += totalTOI; agg.fwdPM += s.plusMinus; agg.fwdGP += s.gamesPlayed; }
      agg.totalSktTOI += totalTOI;
      teamAggregates.set(abbrev, agg);
    }

    let fwdTOItotal = 0;
    let defTOItotal = 0;
    for (const s of skaters) {
      const totTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed;
      if (s.positionCode === "D") defTOItotal += totTOI;
      else                        fwdTOItotal += totTOI;
    }

    const fwdGCtotal   = leagueGoals * 0.75 * 1.85 * 0.5;
    const defGCtotal   = leagueGoals * 0.25 * 1.85 * 0.5;
    const fwdGCperTOI  = fwdTOItotal > 0 ? fwdGCtotal / fwdTOItotal : 0;
    const defGCperTOI  = defTOItotal > 0 ? defGCtotal / defTOItotal : 0;

    for (const s of skaters) {
      const abbrev = s.teamAbbrevs.split(",")[0].trim();
      const team   = teamByAbbrev.get(abbrev);
      const agg    = teamAggregates.get(abbrev);
      if (!team || !agg) continue;

      const isD    = s.positionCode === "D";
      const posAdj = isD ? 10/7 : 5/7;
      const totTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed;

      const teamFactor = team.goalsFor / (team.goalsFor + team.goalsAgainst);
      const gc = (s.goals + 0.5 * s.assists) * teamFactor;

      const gcPerTOI   = isD ? defGCperTOI : fwdGCperTOI;
      const marginalGF = gc - (7/12) * totTOI * gcPerTOI;
      const ops        = Math.max(-3, marginalGF / marginalGoalsPerPoint);

      const teamMGA        = (1 + 7/12) * team.gamesPlayed * leagueGPG - team.goalsAgainst;
      const teamSktTOI     = agg.totalSktTOI;
      const toiProportion  = teamSktTOI > 0 ? totTOI / teamSktTOI : 0;
      const posTOI         = isD ? agg.defTOI : agg.fwdTOI;
      const posPM          = isD ? agg.defPM  : agg.fwdPM;
      const pmAdj          = (1/7) * posAdj * (s.plusMinus - totTOI * (posTOI > 0 ? posPM / posTOI : 0));
      const marginalGA     = toiProportion * (5/7) * posAdj * teamMGA + pmAdj;
      const dps            = Math.max(-3, marginalGA / marginalGoalsPerPoint);

      const name = s.skaterFullName.trim();
      const ps   = { ops: Math.round(ops * 10) / 10, dps: Math.round(dps * 10) / 10 };
      psMap.set(name,               ps);
      psMap.set(`id:${s.playerId}`, ps);
      psMap.set(slugify(name),      ps);
    }

    console.log(`[PS] Computed Point Shares for ${psMap.size / 3} players`);
    if (redis) {
      const obj = Object.fromEntries(psMap);
      await redis.setex(POINT_SHARES_CACHE_KEY, PS_CACHE_TTL, obj);
      // Refresh the long-lived last-good copy on every success.
      await redis.setex(POINT_SHARES_STALE_KEY, PS_STALE_TTL, obj).catch(() => {});
    }
  } catch (e: any) {
    console.warn("[PS] fetchPointShares failed:", e.message);
  }

  // The fresh fetch produced nothing (timeout / 5xx / thin data). Serve the
  // last-good copy so OPS/DPS survive a flaky NHL stats API instead of
  // blanking out across the whole players page.
  if (psMap.size === 0 && redis) {
    const stale = await redis.get<Record<string, { ops: number; dps: number }>>(POINT_SHARES_STALE_KEY).catch(() => null);
    if (stale && Object.keys(stale).length > 0) {
      console.warn("[PS] serving stale point-shares (fresh fetch failed)");
      return new Map(Object.entries(stale));
    }
  }

  return psMap;
}

async function fetchNhlSkaterStatsFallback(): Promise<Map<string, any>> {
  const cacheKey = "cache:nhl_skater_summary_stats";
  if (redis) {
    const cached = await redis.get<Record<string, any>>(cacheKey);
    if (cached) return new Map(Object.entries(cached));
  }

  const statsMap = new Map<string, any>();
  try {
    const res = await fetchWithTimeout(
      `https://api.nhle.com/stats/rest/en/skater/summary?cayenneExp=seasonId%3D${SEASON.nhleSeasonId}%20and%20gameTypeId%3D2&limit=-1`,
      10000
    );
    if (!res.ok) return statsMap;

    const skaterData: { data: NHLSkaterRow[] } = await res.json();
    for (const s of skaterData.data ?? []) {
      if (!s.skaterFullName || s.gamesPlayed <= 0) continue;
      const position = normalisePos(s.positionCode);
      const games = Math.max(1, s.gamesPlayed);
      const entry = {
        ptsPace: ((s.goals + s.assists) / games) * 82,
        xGPace: 0,
        defRate: 0.08,
        avgTOI: s.timeOnIcePerGame / 60,
        games,
        hasLiveStats: true,
        goalsPace: (s.goals / games) * 82,
        assistsPace: (s.assists / games) * 82,
        plusMinus: s.plusMinus,
      };
      const slug = slugify(s.skaterFullName);
      statsMap.set(`id:${s.playerId}`, entry);
      statsMap.set(slug, entry);
      statsMap.set(`${slug}__${position}`, entry);
    }

    if (redis && statsMap.size > 100) {
      await redis.setex(cacheKey, PS_CACHE_TTL, Object.fromEntries(statsMap));
    }
  } catch (e: any) {
    console.warn("[NHL skater fallback] failed:", e.message);
  }
  return statsMap;
}

async function fetchNhlGoalieStatsFallback(): Promise<Map<string, any>> {
  const cacheKey = "cache:nhl_goalie_summary_stats";
  if (redis) {
    const cached = await redis.get<Record<string, any>>(cacheKey);
    if (cached) return new Map(Object.entries(cached));
  }

  const statsMap = new Map<string, any>();
  try {
    const res = await fetchWithTimeout(
      `https://api.nhle.com/stats/rest/en/goalie/summary?cayenneExp=seasonId%3D${SEASON.nhleSeasonId}%20and%20gameTypeId%3D2&limit=-1`,
      10000
    );
    if (!res.ok) return statsMap;

    const goalieData: { data: any[] } = await res.json();
    for (const g of goalieData.data ?? []) {
      const name = String(g.goalieFullName ?? g.fullName ?? g.name ?? "").trim();
      const games = Number(g.gamesPlayed ?? g.games ?? 0);
      if (!name || games <= 0) continue;
      const shotsAgainst = Number(g.shotsAgainst ?? g.shotsAgainstCount ?? 0);
      const goalsAgainst = Number(g.goalsAgainst ?? 0);
      const savePctRaw = Number(g.savePct ?? g.savePercentage ?? 0);
      const savePct = savePctRaw > 1 ? savePctRaw / 100 : savePctRaw > 0
        ? savePctRaw
        : shotsAgainst > 0 ? (shotsAgainst - goalsAgainst) / shotsAgainst : 0.900;
      // Real starts only. This used to end `?? games`, which turned every
      // goalie whose starts the feed omitted into one whose appearances were
      // silently relabelled as starts. Absent means absent; `resolveWorkload`
      // decides what to fall back to, and records that it did.
      const rawStarts = Number(g.gamesStarted ?? g.starts ?? NaN);
      const nhlToi = Number(g.timeOnIce ?? g.toi ?? NaN);
      const entry = {
        gsax: 0,
        savePct: Math.round(savePct * 10000) / 10000,
        shotsPerGame: shotsAgainst > 0 ? shotsAgainst / games : 0,
        gamesPlayed: games,
        gamesStarted: isFinite(rawStarts) && rawStarts > 0 ? rawStarts : null,
        // The feed publishes GAA directly; fall back to computing it from ice
        // time. Either way it is per sixty minutes.
        iceTime: isFinite(nhlToi) && nhlToi > 0 ? nhlToi : null,
        gaa: Number.isFinite(Number(g.goalsAgainstAverage))
          ? Number(g.goalsAgainstAverage)
          : goalsAgainstAverage(goalsAgainst, isFinite(nhlToi) ? nhlToi : null),
        xGoalsAllowed: 0,
        hasLiveStats: true,
      };
      const slug = slugify(name);
      statsMap.set(`id:${g.playerId ?? g.goalieId ?? ""}`, entry);
      statsMap.set(slug, entry);
    }

    if (redis && statsMap.size > 50) {
      await redis.setex(cacheKey, PS_CACHE_TTL, Object.fromEntries(statsMap));
    }
  } catch (e: any) {
    console.warn("[NHL goalie fallback] failed:", e.message);
  }
  return statsMap;
}

export async function assembleCanonicalRoster(options: {
  teams?: any[];
  includeTeamContext?: boolean;
  capMovesByTeam?: TeamCapDeltaMap;
} = {}) {
  let publishedTrades: TradeRecord[] = [];
  try {
    publishedTrades = await listPublishedTrades();
  } catch (e: any) {
    console.warn("[Trades overlay] published trade overlay skipped:", e.message);
  }

  const rosterTeams = applyTeamCapDeltas(options.teams ?? TEAMS_DB, options.capMovesByTeam);
  const [CONTRACTS, PS_MAP, NHL_SKATER_STATS, NHL_GOALIE_STATS, PROSPECT_ENRICHMENT] = await Promise.all([
    loadContractsFromDB(),
    fetchPointShares(),
    fetchNhlSkaterStatsFallback(),
    fetchNhlGoalieStatsFallback(),
    fetchProspectEnrichmentMap(),
  ]);
  const BASELINES      = loadBaselines();
  const TEAM_BASELINES = loadTeamBaselines();

  // ── MoneyPuck analytics ─────────────────────────────────────
  const analyticsMap = new Map<string, any>();
  const goalieMap    = new Map<string, any>();
  const teamXgaMap   = new Map<string, { xGoals: number; ice: number }>();
  let skaterCsv: string | null = null;
  let goalieCsv: string | null = null;

  if (redis) {
    skaterCsv = await redis.get<string>("cache:mp_skaters");
    goalieCsv = await redis.get<string>("cache:mp_goalies");
    if (!skaterCsv) skaterCsv = await redis.get<string>("cache:mp_skaters:stale").catch(() => null);
    if (!goalieCsv) goalieCsv = await redis.get<string>("cache:mp_goalies:stale").catch(() => null);
  }

  const skaterCsvFresh = !!skaterCsv;
  const goalieCsvFresh = !!goalieCsv;

  try {
    const [mpRes, gpRes] = await Promise.allSettled([
      skaterCsvFresh
        ? Promise.resolve({ ok: true, text: async () => skaterCsv! })
        : fetchWithTimeout(
            `https://moneypuck.com/moneypuck/playerData/seasonSummary/${SEASON.mpSeason}/regular/skaters.csv`,
            8000,
            { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          ),
      goalieCsvFresh
        ? Promise.resolve({ ok: true, text: async () => goalieCsv! })
        : fetchWithTimeout(
            `https://moneypuck.com/moneypuck/playerData/seasonSummary/${SEASON.mpSeason}/regular/goalies.csv`,
            8000,
            { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          ),
    ]);

    if (mpRes.status === "fulfilled" && mpRes.value.ok) {
      const csv  = await mpRes.value.text();
      if (!skaterCsvFresh && redis) {
        await redis.setex("cache:mp_skaters", MONEYPUCK_CACHE_TTL, csv);
        await redis.setex("cache:mp_skaters:stale", MP_STALE_TTL, csv).catch(() => {});
      }
      const rows = csv.split("\n").filter(Boolean);
      const hdr  = parseCSVRow(rows[0]);
      const h    = (k: string) => hdr.indexOf(k);
      const [nI, sI, pI, xgI, gI, iceI, onAI, offAI, rkI, onFI, offFI, dzI, ozI, goalsI, posI] = [
        h("name"), h("situation"), h("I_F_points"), h("I_F_xGoals"),
        h("games_played"), h("icetime"),
        h("OnIce_A_xGoals"), h("OffIce_A_xGoals"),
        h("iceTimeRank"),
        h("OnIce_F_xGoals"), h("OffIce_F_xGoals"),
        h("I_F_dZoneShiftStarts"), h("I_F_oZoneShiftStarts"),
        h("I_F_goals"),
        h("position"),
      ];
      const zoneMap = new Map<string, number>();

      rows.slice(1).forEach((row) => {
        const c = parseCSVRow(row);
        if (c.length <= nI) return;
        if (c[sI]?.trim() !== "5on5") return;
        if (dzI < 0 || ozI < 0) return;
        const name = c[nI].trim();
        const dz5  = parseFloat(c[dzI]) || 0;
        const oz5  = parseFloat(c[ozI]) || 0;
        if (dz5 + oz5 > 0) {
          const pos5 = posI >= 0 ? (c[posI]?.trim().toUpperCase() ?? "") : "";
          if (pos5) zoneMap.set(`${slugify(name)}__${pos5}`, dz5 / (dz5 + oz5));
          zoneMap.set(slugify(name), dz5 / (dz5 + oz5));
        }
      });

      rows.slice(1).forEach((row) => {
        const c = parseCSVRow(row);
        if (c.length <= nI || c[sI]?.trim() !== "all") return;
        const name     = c[nI].trim();
        const g        = Math.max(1, parseFloat(c[gI]) || 1);
        const iceSec   = parseFloat(c[iceI]) || 1;
        const iceHours = iceSec / 3600;
        const benchH   = Math.max(0.01, (g * 60 - iceSec / 60) / 60);
        const onA  = (parseFloat(c[onAI])  || 0) / Math.max(0.01, iceHours);
        const offA = (parseFloat(c[offAI]) || 0) / Math.max(0.01, benchH);

        const onF      = parseFloat(c[onFI])  || 0;
        const offFVal  = parseFloat(c[offFI]) || 0;
        const onAVal   = parseFloat(c[onAI])  || 0;
        const offAVal  = parseFloat(c[offAI]) || 0;
        const onXgPct  = onF + onAVal > 0 ? onF / (onF + onAVal) : 0.5;
        const offXgPct = offFVal + offAVal > 0 ? offFVal / (offFVal + offAVal) : 0.5;
        const xgRelTM  = (onXgPct - offXgPct) * 100;
        const xgaRelTM = onA - offA;

        const pos = posI >= 0 ? (c[posI]?.trim().toUpperCase() ?? "") : "";
        const posForZone = pos ? `${slugify(name)}__${pos}` : slugify(name);
        const dzPct = zoneMap.get(posForZone) ?? zoneMap.get(slugify(name)) ?? null;

        const mapKey     = pos ? `${slugify(name)}__${pos}` : slugify(name);
        const rawPtsPace = (parseFloat(c[pI]) / g) * 82;
        const posDefault = pos.startsWith("D") ? 26 : pos === "C" ? 52 : 44;
        const sampleWeight = Math.min(1.0, g / 25);
        const ptsPace    = rawPtsPace * sampleWeight + posDefault * (1 - sampleWeight);
        const rawXgPace  = (parseFloat(c[xgI]) / g) * 82;
        const xGPace     = rawXgPace * sampleWeight + (pos.startsWith("D") ? 6 : 10) * (1 - sampleWeight);

        // MoneyPuck's iceTimeRank column is the SUM of per-game ranks over the
        // season (rank 1 = team's most-used F/D that night; F and D ranked
        // separately). Dividing by games gives the average per-game rank —
        // a real deployment number: ~1-3 = top line/pair, ~10-12 = 4th line.
        // The old code used the raw sum, which scaled with GP and meant nothing.
        const iceRankAvg = g >= 5 ? (parseFloat(c[rkI]) || 0) / g : null;

        const entry = {
          ptsPace, xGPace,
          defRate:  offA - onA,
          avgTOI:   iceSec / g / 60,
          xgRelTM:  xgRelTM  * Math.min(1.0, g / 30),
          xgaRelTM: xgaRelTM * Math.min(1.0, g / 30),
          iceRankAvg,
          games: g, hasLiveStats: true, dzPct,
          goalsPace:   goalsI >= 0 ? (parseFloat(c[goalsI])   / g) * 82 : undefined,
          assistsPace: goalsI >= 0 ? ((parseFloat(c[pI]) - parseFloat(c[goalsI])) / g) * 82 : undefined,
        };
        analyticsMap.set(mapKey, entry);
        if (pos) analyticsMap.set(slugify(name), entry);
      });
    }

    if (gpRes.status === "fulfilled" && gpRes.value.ok) {
      const csv  = await gpRes.value.text();
      if (!goalieCsvFresh && redis) {
        await redis.setex("cache:mp_goalies", MONEYPUCK_CACHE_TTL, csv);
        await redis.setex("cache:mp_goalies:stale", MP_STALE_TTL, csv).catch(() => {});
      }
      const rows = csv.split("\n").filter(Boolean);
      const hdr  = parseCSVRow(rows[0]);
      const h    = (k: string) => hdr.indexOf(k);
      const [nI, sI, gI, xgI, goalsI, ongoalI, teamI, iceI] = [
        h("name"), h("situation"), h("games_played"),
        h("xGoals"), h("goals"), h("ongoal"), h("team"), h("icetime"),
      ];
      if (nI >= 0 && xgI >= 0) {
        const goalieRows = new Map<string, any>();
        rows.slice(1).forEach((row) => {
          const c   = parseCSVRow(row);
          if (c.length <= nI) return;
          if ((c[sI] ?? "").trim().toLowerCase() !== "all") return;
          const name   = c[nI].trim();
          const g      = Math.max(1, parseFloat(c[gI]) || 1);
          const xGoals = parseFloat(c[xgI])    || 0;
          const goals  = parseFloat(c[goalsI]) || 0;
          const ongoal = parseFloat(c[ongoalI])|| 0;
          const ice    = iceI >= 0 ? (parseFloat(c[iceI]) || 0) : 0;
          const gsax   = xGoals - goals;
          const savePct = ongoal > 0 ? (ongoal - goals) / ongoal : 0.900;

          // Accumulate team xGA over real goalie icetime (seconds) so xGA/60 has
          // correct units — the old games-based denominator inflated every team
          // to 9-13 "xGA/60" and pinned the defCorrection clamp league-wide.
          const teamAbbr = (c[teamI] ?? "").trim().toUpperCase();
          if (teamAbbr) {
            const prev = teamXgaMap.get(teamAbbr) ?? { xGoals: 0, ice: 0 };
            teamXgaMap.set(teamAbbr, {
              xGoals: prev.xGoals + xGoals,
              ice:    prev.ice + ice,
            });
          }

          goalieRows.set(name, {
            gsax,
            savePct:      Math.round(savePct * 10000) / 10000,
            shotsPerGame: ongoal / g,
            // `games_played` is APPEARANCES. It used to be written straight
            // into `gamesStarted`, so relief outings inflated the workload that
            // gates the starter/tandem/backup role ceiling on G-NAV. MoneyPuck
            // publishes no starts column, so this source leaves that unset and
            // the NHL feed's real figure survives the merge.
            gamesPlayed:  g,
            // `ice` was parsed for the team xGA denominator and then thrown
            // away. It is the denominator a real GAA needs.
            gaa:          goalsAgainstAverage(goals, ice),
            iceTime:      ice,
            xGoalsAllowed: xGoals,
            hasLiveStats: true,
          });
        });

        goalieRows.forEach((stats, name) => {
          goalieMap.set(slugify(name), stats);
        });
      }
    }
  } catch (err) {
    console.error("[roster-assembly] MoneyPuck CSV fetch/parse failed — analytics will use fallback stats:", err instanceof Error ? err.message : err);
  }

  // ── Build roster from live NHL API only ─────────────────────
  // Static player rosters were removed because they drift quickly and conflict
  // with the DB/live-data source of truth. If the NHL API is unavailable, this
  // route returns DB-injected draftees plus picks from /api/league instead of
  // manufacturing stale active rosters.
  const rosterMap = new Map<string, any[]>();

  try {
    const results = await Promise.allSettled(
      rosterTeams.map((t) =>
        fetchWithTimeout(`https://api-web.nhle.com/v1/roster/${t.id}/current`, 5000, NHL_HEADERS)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() =>
            fetchWithTimeout(`https://api-web.nhle.com/v1/roster/${t.id}/${SEASON.nhleSeasonId}`, 5000, NHL_HEADERS)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
      )
    );

    results.forEach((result, idx) => {
      const teamId = rosterTeams[idx].id;
      const data   = result.status === "fulfilled" ? result.value : null;
      if (!data) return;

      const skaters = [...(data.forwards || []), ...(data.defensemen || []), ...(data.goalies || [])];
      if (skaters.length < 5) return;

      rosterMap.set(teamId, skaters.flatMap((raw: any) => {
        const p = safeNhlRosterPlayer(raw);
        return p ? [{
          id:       p.id,
          name:     p.name,
          position: normalisePos(p.position),
          age:      calcAge(p.birthDate),
          headshot: p.headshot,
        }] : [];
      }));
    });
  } catch (_) {
    console.warn("[NHL roster] live roster fetch failed; no static player fallback is used.");
  }

  // ── Inject DB roster rows ────────────────────────────────────
  // Admin DB rows cover mock-draft prospects and roster players missing from
  // the live NHL roster feed. Deduplicate by id and normalized name so DB rows
  // augment the live roster instead of creating duplicates.
  const dbTeamBySlug = new Map<string, string>();
  try {
    await ensurePlayerColumns();
    const dbPlayers = await db.select({
      id:              playersTable.id,
      name:            playersTable.name,
      position:        playersTable.position,
      teamId:          playersTable.teamId,
      age:             playersTable.age,
      birthDate:       playersTable.birthDate,
      draftYear:       playersTable.draftYear,
      draftOverall:    playersTable.draftOverall,
      prospectPtsPace: playersTable.prospectPtsPace,
      retired:         playersTable.retired,
      excludeFromRoster: playersTable.excludeFromRoster,
      expiryStatus:    playersTable.expiryStatus,
      expiryYear:      playersTable.expiryYear,
      capHit:          playersTable.capHit,
    }).from(playersTable);

    // retired = left the league; excludeFromRoster = editor pulled them off the
    // roster (the orthogonal replacement for the old fa_override "EXCLUDE").
    const removedFromRoster = dbPlayers.filter(d => d.retired || d.excludeFromRoster);
    removeRetiredPlayersFromRosters(rosterMap, removedFromRoster);
    for (const d of dbPlayers) {
      if (d.retired || d.excludeFromRoster) continue;
      if (!isValidTeamId(d.teamId)) continue;
      const dbSlug = canonicalNameSlug(d.name);
      dbTeamBySlug.set(dbSlug, d.teamId);
      removePlayerFromOtherRosters(rosterMap, d.teamId, d);
      const list = rosterMap.get(d.teamId) ?? [];
      const existing = list.find((x: any) => String(x.id) === String(d.id) || slugify(x.name) === dbSlug);
      if (existing) {
        existing.draftYear = existing.draftYear ?? d.draftYear;
        existing.draftOverall = existing.draftOverall ?? d.draftOverall;
        existing.prospectPtsPace = existing.prospectPtsPace ?? d.prospectPtsPace;
      } else {
        list.push({
          id:              d.id,
          name:            d.name,
          position:        normalisePos(d.position),
          age:             resolvePlayerAge({
                             birthDate: d.birthDate, storedAge: d.age, draftYear: d.draftYear,
                             seasonStartYear: SEASON_START_YEAR,
                           }) ?? 18,
          headshot:        null,
          draftYear:       d.draftYear,
          draftOverall:    d.draftOverall,
          prospectPtsPace: d.prospectPtsPace,
          injectedFromDb:   true,
        });
      }
      rosterMap.set(d.teamId, list);
    }

    // ── Pending FA injection ──────────────────────────────────────
    // DB players with expiryStatus (UFA/RFA) that are not yet on any roster.
    // Many bulk-FA entries have no teamId; resolve their team from the NHL API
    // roster map so they flow through the player build and appear in the
    // off-season market.
    const slugToTeam = new Map<string, string>();
    for (const [teamId, list] of rosterMap.entries()) {
      for (const p of list) slugToTeam.set(canonicalNameSlug(p.name), teamId);
    }
    for (const d of dbPlayers) {
      if (d.retired || d.excludeFromRoster) continue;
      if (!d.expiryStatus) continue;
      const dbSlug = canonicalNameSlug(d.name);
      if (slugToTeam.has(dbSlug)) continue;
      const resolvedTeam = isValidTeamId(d.teamId) ? d.teamId
        : dbTeamBySlug.get(dbSlug) ?? null;
      if (!resolvedTeam) continue;
      const list = rosterMap.get(resolvedTeam) ?? [];
      list.push({
        id:              d.id,
        name:            d.name,
        position:        normalisePos(d.position),
        age:             resolvePlayerAge({
                           birthDate: d.birthDate, storedAge: d.age, draftYear: d.draftYear,
                           seasonStartYear: SEASON_START_YEAR,
                         }) ?? 25,
        headshot:        null,
        draftYear:       d.draftYear,
        draftOverall:    d.draftOverall,
        prospectPtsPace: d.prospectPtsPace,
        injectedFromDb:   true,
      });
      rosterMap.set(resolvedTeam, list);
      dbTeamBySlug.set(dbSlug, resolvedTeam);
    }
  } catch (e: any) {
    console.warn("[DB roster] injection skipped:", e.message);
  }

  // ── Trade block statuses (admin-managed, keyed by name) ──────
  // ── EDGE signals (latest nhl_snapshots per player) ────────────
  const edgeSignals = await latestEdgeSignalMap(Number(SEASON.nhleSeasonId)).catch(() => new Map());
  const goalieBoards = await latestGoalieBoardsMap(SEASON.nhleSeasonId).catch(() => new Map());
  const goalieEdgeDetail = await latestGoalieEdgeDetailMap(SEASON.nhleSeasonId).catch(() => new Map());

  // Position-suffixed keys win so same-name players (two Elias
  // Petterssons) never share a block status; plain-name keys remain for
  // legacy rows without a stored position.
  let blockMap = new Map<string, { status: string; note: string | null }>();
  try {
    const blockRows = await db.select().from(tradeBlockTable);
    blockMap = new Map();
    for (const r of blockRows) {
      const rec = { status: r.status, note: r.note ?? null };
      const pos = (r as { position?: string | null }).position?.toUpperCase() ?? null;
      if (pos) blockMap.set(`${r.name}__${pos}`, rec);
      else if (!blockMap.has(r.name)) blockMap.set(r.name, rec);
    }
  } catch (e: any) {
    console.warn("[TradeBlock] read skipped:", e.message);
  }

  // Free-agency status is now a fact on the players table (expiryStatus /
  // expiryYear / excludeFromRoster), resolved at read time straight from the DB
  // row — there is no separate read-time FA-override pass anymore.

  const activePlayerIds = [...new Set(
    [...rosterMap.values()]
      .flat()
      .filter((p: any) => p?.id != null)
      .map((p: any) => String(p.id))
  )];
  const developmentTimelineMap = await fetchCachedNhlSkaterTimelineRowsForPlayers({
    playerIds: activePlayerIds,
    seasonCount: 5,
    timeoutMs: 10000,
  }).catch((e: any) => {
    console.warn("[Development timeline] bulk fetch skipped:", e.message);
    return new Map();
  });

  // ── Build player objects ────────────────────────────────────
  let players: any[] = [];
  const _dbg = { ufaMatch: 0, ufaExpires: 0, ufaFiltered: 0, noMatch: 0, noTeam: 0, samples: [] as string[] };

  rosterMap.forEach((skaters, teamId) => {
    const developmentTeam = rosterTeams.find((t: any) => t.id === teamId);
    if (!developmentTeam) return;

    skaters.forEach((p: any) => {
      const slug    = slugify(p.name);
      const prospectOverride = PROSPECT_ENRICHMENT[slug];
      const draftYear = p.draftYear ?? prospectOverride?.draftYear;
      const draftOverall = p.draftOverall ?? prospectOverride?.draftOverall;
      const prospectPtsPace = p.prospectPtsPace ?? prospectOverride?.prospectPtsPace;
      const posSlug = `${slug}__${(p.position ?? "").toUpperCase()}`;
      const isDraftee = draftOverall != null;
      const isUnprovenDraftee = isDraftee && p.age <= 22;
      let stats = analyticsMap.get(posSlug) ?? analyticsMap.get(slug);
      // MoneyPuck sometimes drops accented characters entirely
      // (Slafkovský -> slafkovsk). Only use this loose match when the roster
      // name actually contains a diacritic; surname-only matching assigns NHL
      // stats to unrelated minor-league players with common names.
      if (!stats && !isUnprovenDraftee && hasDiacritics(p.name) && slug.length > 4) {
        const truncSlug = slug.slice(0, -1);
        stats = analyticsMap.get(`${truncSlug}__${(p.position ?? "").toUpperCase()}`)
             ?? analyticsMap.get(truncSlug);
      }
      if (!stats && !isUnprovenDraftee) {
        stats = NHL_SKATER_STATS.get(`id:${p.id}`) ?? NHL_SKATER_STATS.get(posSlug) ?? NHL_SKATER_STATS.get(slug);
      }

      if (stats && stats.plusMinus == null) {
        const nhlEntry = NHL_SKATER_STATS.get(`id:${p.id}`) ?? NHL_SKATER_STATS.get(posSlug) ?? NHL_SKATER_STATS.get(slug);
        if (nhlEntry?.plusMinus != null) stats = { ...stats, plusMinus: nhlEntry.plusMinus };
      }

      const normalName  = p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const posKey      = `${p.name}__${p.position}`;
      const teamKey     = `${p.name}__${teamId.toLowerCase()}`;
      const normPosKey  = `${normalName}__${p.position}`;
      const normTeamKey = `${normalName}__${teamId.toLowerCase()}`;
      const contractMatch =
        CONTRACTS[posKey]     ? { row: CONTRACTS[posKey],     source: "position" } :
        CONTRACTS[teamKey]    ? { row: CONTRACTS[teamKey],    source: "team" } :
        CONTRACTS[normPosKey]  ? { row: CONTRACTS[normPosKey],  source: "position" } :
        CONTRACTS[normTeamKey] ? { row: CONTRACTS[normTeamKey], source: "team" } :
        CONTRACTS[p.name]     ? { row: CONTRACTS[p.name],     source: "name" } :
        CONTRACTS[normalName] ? { row: CONTRACTS[normalName], source: "name" } :
        null;
      const fin = contractMatch?.row ?? null;

      const isLikelyELC = !fin && p.age <= 23;
      const elcCapHit   = p.age <= 22 ? 0.8775 : 0.925;

      const normContractPos = (pos: string | undefined): string => {
        if (!pos) return "";
        const u = pos.toUpperCase();
        if (u.includes("G")) return "G";
        if (u.includes("D")) return "D";
        if (u.includes("C")) return "C";
        if (u.includes("W") || u.includes("L") || u.includes("R")) return "W";
        return u.charAt(0);
      };

      const override: any    = undefined;
      const identityOverride = ROSTER_IDENTITY_OVERRIDES[p.name] ?? ROSTER_IDENTITY_OVERRIDES[normalName];
      const finalPosition    = identityOverride?.position ?? p.position;

      const isGoalie   = finalPosition === "G";
      const defaultTOI = isGoalie ? 0 : finalPosition === "D" ? 18.5 : 13.5;
      const defaultPts = isGoalie ? 0 : finalPosition === "D" ? 22 : finalPosition === "C" ? 32 : 28;

      const nhlG = NHL_GOALIE_STATS.get(`id:${p.id}`) ?? NHL_GOALIE_STATS.get(slugify(p.name));
      const mpG  = goalieMap.get(slugify(p.name));
      // MoneyPuck wins on the fields it measures better, but it no longer
      // carries `gamesStarted` at all, so the NHL feed's real starts survive
      // instead of being overwritten with appearances. `gaa` prefers whichever
      // source produced one.
      const goalieStats = isGoalie
        ? (mpG || nhlG
            ? {
                ...(nhlG ?? {}),
                ...(mpG ?? {}),
                gsax: mpG?.gsax ?? nhlG?.gsax ?? 0,
                gamesStarted: nhlG?.gamesStarted ?? mpG?.gamesStarted ?? null,
                gamesPlayed: mpG?.gamesPlayed ?? nhlG?.gamesPlayed ?? null,
                gaa: mpG?.gaa ?? nhlG?.gaa ?? null,
                iceTime: mpG?.iceTime ?? nhlG?.iceTime ?? null,
              }
            : null)
        : null;

      const goalieWorkload = resolveWorkload({
        gamesStarted: goalieStats?.gamesStarted,
        gamesPlayed: goalieStats?.gamesPlayed,
      });

      const hasProspectSignal = draftOverall != null || (prospectPtsPace != null && prospectPtsPace > 0);
      const hasFaStatus = fin?.expiryStatus != null;
      if (p.injectedFromDb && !stats && !goalieStats && !hasProspectSignal && !hasFaStatus && p.age >= 24) {
        if (/ufa/i.test(String(CONTRACTS[p.name]?.expiryStatus ?? ""))) {
          _dbg.ufaFiltered++;
          if (_dbg.samples.length < 5) _dbg.samples.push(`FILTERED ${p.name} (fin:${!!fin},injDb:${p.injectedFromDb})`);
        }
        return;
      }

      const rawExpiryStatus = typeof fin?.expiryStatus === "string" ? fin.expiryStatus : null;
      const rawExpiryYear = typeof fin?.expiryYear === "number" ? fin.expiryYear : null;
      const preliminaryYears = isLikelyELC ? 1 : (fin?.yearsRemaining ?? 1);
      const { contractStatus, expiresThisOffseason, normExpiry, extension } = deriveContractStatus({
        expiryStatus: rawExpiryStatus,
        expiryYear: rawExpiryYear,
        yearsRemaining: preliminaryYears,
        draftOverall,
        isELC: isLikelyELC,
        extensionCapHit: fin?.extensionCapHit,
        extensionYears: fin?.extensionYears,
      });
      if (/ufa/i.test(String(rawExpiryStatus))) {
        _dbg.ufaMatch++;
        if (expiresThisOffseason) _dbg.ufaExpires++;
        else if (_dbg.samples.length < 5) _dbg.samples.push(`NOEXPIRE ${p.name} yr:${rawExpiryYear} yrs:${preliminaryYears} draft:${draftOverall} elc:${isLikelyELC}`);
      }
      if (!fin && CONTRACTS[p.name]?.expiryStatus) {
        _dbg.noMatch++;
        if (_dbg.samples.length < 5) _dbg.samples.push(`NOMATCH roster:${p.name} pos:${p.position} team:${teamId}`);
      }
      // No contract row resolved and not a young ELC/prospect → the 0.925 default
      // below is a placeholder, not a real deal. Surfaced for the admin's
      // "needs data" view; does not change pricing.
      const contractMissing = !fin && !isLikelyELC && draftOverall == null;

      // An ACTIVE extension is the contract now — the deal it followed has run
      // out, so its AAV and term are the live ones. Carlsson's ELC expiring in
      // 2026 with an extension on record is not a $0 cap hit and 0 years left;
      // he is signed at the extension's number.
      const extensionActive = extension.state === "ACTIVE";
      const rawCapHit     = extensionActive ? extension.aav
                          : expiresThisOffseason ? 0
                          : (isLikelyELC ? elcCapHit : (fin?.capHit ?? 0.925));
      // lastCapHit mirrors rawCapHit but is NEVER zeroed for pending FAs. It is the
      // real expiring/last contract value, used for the off-season "was $X" display
      // and — critically — as the cap CREDIT when a pending FA re-signs or walks.
      // (capHit goes to 0 so FA trade-pricing treats them as a 0-year rental.)
      const lastCapHitRaw = isLikelyELC ? elcCapHit : (fin?.capHit ?? 0.925);
      const contractPos = normContractPos(fin?.position);
      const rosterPos = normContractPos(finalPosition);
      const nameCollision = p.age <= 23
        && rawCapHit > 3.0
        && contractMatch?.source === "name"
        && contractPos !== ""
        && rosterPos !== ""
        && contractPos !== rosterPos;

      const finalCapHit  = override?.capHit ?? (nameCollision ? elcCapHit : rawCapHit);
      const finalYears   = override?.yearsRemaining
        ?? (extensionActive ? extension.term
          : expiresThisOffseason ? 0
          : (nameCollision ? 1 : preliminaryYears));
      const finalNMC     = override?.hasNMC  ?? (nameCollision ? false : (fin?.hasNMC  ?? false));
      const finalNTC     = override?.hasNTC  ?? (nameCollision ? false : (fin?.hasNTC  ?? false));
      const finalRetain  = override?.canRetain ?? (nameCollision ? true : (fin?.canRetain ?? true));
      const intangibleMult  = override?.intangibleMultiplier ?? (fin?.intangibleMultiplier ?? 1.0);

      // ── Contract expiry surfacing (off-season / free agency) ──────────────
      // expiryStatus + expiryYear come from the CapWages scrape via loadContracts().
      // A pending free agent = a UFA/RFA whose deal expires in (or before) the
      // projected season's start year. We key off expiryYear, NOT yearsRemaining:
      // yearsRemaining is floored to >=1 across the pipeline (scraper, sync,
      // loadContracts), so it can't tell a 2026 FA from a 2027 one. Fall back to
      // the final-year heuristic only when no expiry year is known. Draftees/ELCs
      // are never pending FAs.
      // True xGA/60 over goalie icetime; require ≥10 games of ice (36,000s) for signal
      const teamXgaRaw = teamXgaMap.get(teamId);
      const teamXga60  = teamXgaRaw && teamXgaRaw.ice > 36000
        ? Math.round((teamXgaRaw.xGoals / (teamXgaRaw.ice / 3600)) * 100) / 100
        : LEAGUE.avgXga60;

      const currentYearGsax = goalieStats?.gsax ?? 0;
      const baselines = baselineForNhlPlayerId(BASELINES, p.id);
      const qocIndex = calcQocIndex(finalPosition, stats?.iceRankAvg, stats?.dzPct);
      const hasSkaterStats = Boolean(stats);
      const games = draftOverall != null
        ? (stats?.games ?? 0)
        // A goalie's game count is his APPEARANCES. It used to read
        // `goalieStats?.gamesStarted`, which was the same number wearing the
        // wrong name; now that starts are a separate, possibly-absent field,
        // this has to name what it wants.
        : (stats?.games ?? goalieStats?.gamesPlayed ?? goalieStats?.gamesStarted ?? 0);
      const ptsPace = stats?.ptsPace ?? (hasSkaterStats ? defaultPts : 0);
      const avgTOI = stats?.avgTOI ?? (hasSkaterStats ? defaultTOI : 0);
      const teamContext = options.includeTeamContext ? developmentTeamContext(teamWindow(developmentTeam), developmentTeam?.standing) : undefined;
      const internationalScore = developmentInternationalScore(prospectPtsPace);
      const linemateContext = developmentLinemateContext(finalPosition, avgTOI, qocIndex);
      const timelineMatches = developmentTimelineMap.get(String(p.id)) ?? [];
      const developmentInput = timelineMatches.length > 0
        ? buildDevelopmentInputFromNhlTimeline(timelineMatches, {
            age: p.age,
            draftYear: draftYear ?? undefined,
            draftOverall: draftOverall ?? undefined,
            internationalScore,
            teamContext,
            linemateContext,
          })
        : buildDevelopmentInputFromPlayerPayload({
            id: p.id,
            name: p.name,
            position: finalPosition,
            age: p.age,
            games,
            ptsPace,
            avgTOI,
            draftYear: draftYear ?? null,
            draftOverall: draftOverall ?? null,
            prospectPtsPace: prospectPtsPace ?? null,
            internationalScore: internationalScore ?? null,
            teamContext,
            linemateContext,
          });
      const developmentProfile = developmentInput ? calcDevelopmentProfile(developmentInput) : null;
      const edgeSignal = edgeSignals.get(String(p.id));

      players.push({
        id:             p.id,
        teamId,
        name:           p.name,
        position:       finalPosition,
        // Diacritic-safe: a raw map lookup missed "Teuvo Teräväinen" (ST3).
        secondaryPosition: secondaryPositionFor(p.name),
        age:            p.age,
        headshot:       p.headshot ?? null,
        // Draftees default to 0 games so the pedigree NAV path (games < 14) triggers
        games,
        ptsPace,
        xGPace:         stats?.xGPace   ?? 0,
        defRate:        stats?.defRate  ?? 0.08,
        avgTOI,
        qocIndex,
        rosterTier:     resolveRosterTier({
          id: p.id,
          name: p.name,
          position: finalPosition as "C" | "W" | "D" | "G" | "Pick",
          age: p.age,
          capHit: finalCapHit,
          yearsRemaining: finalYears,
          ptsPace,
          avgTOI,
          qocIndex,
          dzPct: stats?.dzPct ?? null,
          pkTimeShare: baselines.pkTimeShare,
          baselinePtsPace: baselines.baselinePtsPace,
        }),
        hasLiveStats:   stats?.hasLiveStats ?? goalieStats?.hasLiveStats ?? false,
        gsax:           goalieStats?.gsax         ?? 0,
        savePct:        goalieStats?.savePct       ?? 0.900,
        // Workload, resolved once so every consumer gets the same figure AND
        // knows whether it is genuinely starts. `gamesStarted` keeps carrying
        // the best available number, so nothing downstream breaks; what is new
        // is that `startsKnown` says when that number is only appearances.
        gamesStarted:   goalieWorkload.games,
        startsKnown:    goalieWorkload.startsKnown,
        gamesPlayed:    goalieStats?.gamesPlayed ?? null,
        gaa:            goalieStats?.gaa ?? null,
        iceTimeSeconds: goalieStats?.iceTime ?? null,
        shotsPerGame:   goalieStats?.shotsPerGame  ?? 0,
        goalieEdgeBoards: finalPosition === "G" ? (goalieBoards.get(String(p.id)) ?? null) : null,
        // Per-location EDGE shot data. Display-only for now: it is shown on
        // the goalie dossier but deliberately not fed into calcGoalieNAV,
        // because nothing has yet backtested whether it improves the
        // valuation, and an unvalidated input is how a model gets worse
        // while looking richer.
        goalieEdgeDetail: finalPosition === "G" ? (goalieEdgeDetail.get(String(p.id)) ?? null) : null,
        teamXga60,
        teamHdca60:     TEAM_BASELINES[teamId]?.hdca60 ?? null,
        baselineGsax:      baselines.baselineGsax      ?? currentYearGsax,
        baselinePtsPace:   baselines.baselinePtsPace,
        baselineToiPerGame: baselines.baselineToiPerGame,
        baselineSeasonsWeighted: baselines.totalSeasonsWeighted,
        baselineGameScore: baselines.baselineGameScore,
        baselineDpsProxy:  baselines.baselineDpsProxy,
        baselineXgRel:     baselines.baselineXgRel,
        ppPtsPace82:       baselines.ppPtsPace82,
        pkTimeShare:       baselines.pkTimeShare,
        baselineIxg82:     baselines.baselineIxg82,
        baselineHits82:    baselines.baselineHits82,
        baselineBlocks82:  baselines.baselineBlocks82,
        pairXgfPct:        baselines.pairXgfPct,
        pairDriverScore:   baselines.pairDriverScore,
        baselineHdsvPct:   baselines.baselineHdsvPct,
        capHit:         finalCapHit,
        lastCapHit:     nameCollision ? elcCapHit : lastCapHitRaw,
        yearsRemaining: finalYears,
        // Only a PENDING extension is future money. Once it is ACTIVE it has
        // been folded into capHit/yearsRemaining above, and leaving these set
        // would have the valuation engine read the live AAV as a step-up still
        // to come and the card badge a current contract as an extension.
        hasExtension: extension.state === "PENDING",
        extensionCapHit: extension.state === "PENDING" ? extension.aav : undefined,
        extensionYears:  extension.state === "PENDING" ? extension.term : undefined,
        extensionSignedAt: fin?.extensionSignedAt ?? null,
        // The same record the in-session offseason flow writes, so a signed
        // extension reaches the cap horizon, blocks a second extension, and
        // matures into a contract at rollover — instead of being a number only
        // the valuation engine could see.
        pendingExtension: extension.state === "PENDING"
          ? { aav: extension.aav, term: extension.term, wouldHaveBeen: normExpiry ?? "UFA" }
          : undefined,
        hasNMC:    finalNMC,
        hasNTC:    finalNTC,
        canRetain: finalRetain,
        draftYear:        draftYear       ?? null,
        draftOverall:     draftOverall    ?? null,
        prospectPtsPace:  prospectPtsPace ?? null,
        developmentProfile,
        hdFinishingDelta: edgeSignal?.hdFinishingDelta ?? null,
        edgeOzPct: edgeSignal?.ozPct ?? null,
        edgeOzPercentile: edgeSignal?.ozPercentile ?? null,
        edgeSpeedMaxMph: edgeSignal?.speedMaxMph ?? null,
        edgeBurstsOver20: edgeSignal?.burstsOver20 ?? null,
        tradeBlockStatus: (blockMap.get(`${p.name}__${p.position}`) ?? blockMap.get(p.name))?.status ?? null,
        tradeBlockNote:   (blockMap.get(`${p.name}__${p.position}`) ?? blockMap.get(p.name))?.note   ?? null,
        expiryStatus:     rawExpiryStatus,
        expiryYear:       rawExpiryYear,
        contractStatus,
        expiresThisOffseason,
        contractMissing,
        retainedPct: 0,
        multiplier:  intangibleMult,
        ops:  PS_MAP.get(p.name)?.ops ?? PS_MAP.get(`id:${p.id}`)?.ops ?? PS_MAP.get(slugify(p.name))?.ops ?? null,
        dps:  PS_MAP.get(p.name)?.dps ?? PS_MAP.get(`id:${p.id}`)?.dps ?? PS_MAP.get(slugify(p.name))?.dps ?? null,
        xgRelTM:     stats?.xgRelTM   ?? null,
        xgaRelTM:    stats?.xgaRelTM  ?? null,
        dzPct:       stats?.dzPct     ?? null,
        goalsPace:   stats?.goalsPace,
        assistsPace: stats?.assistsPace,
        plusMinus:   stats?.plusMinus ?? null,
      });
    });
  });

  players = dedupePlayersByAuthority(players, dbTeamBySlug);
  // Collapse formal/common first-name duplicates on the same team
  // (e.g. "Matthew Savoie" + "Matt Savoie" on EDM), which carry different
  // NHL ids and so survive the id-keyed dedup above.
  players = dedupeSameTeamNicknames(players);

  // ── Free-agent pool: teamless FA entries ───────────────────────────────────
  // Bulk-FA-created DB rows often have no teamId. They weren't placed on any
  // roster above, so they never went through the build loop. Inject them as
  // minimal expiring players so resolveLeagueOffseason puts them in the market.
  try {
    const dbPlayers2 = await db.select({
      id: playersTable.id, name: playersTable.name, position: playersTable.position,
      age: playersTable.age, expiryStatus: playersTable.expiryStatus,
      expiryYear: playersTable.expiryYear, capHit: playersTable.capHit,
      retired: playersTable.retired, excludeFromRoster: playersTable.excludeFromRoster,
      teamId: playersTable.teamId, extensionCapHit: playersTable.extensionCapHit,
    }).from(playersTable);
    const existingSlugs = new Set(players.map((p: any) => slugify(p.name)));
    let poolCount = 0;
    for (const d of dbPlayers2) {
      if (d.retired || d.excludeFromRoster) continue;
      // The DB row's own expiryStatus wins, but fall back to the curated
      // 2026 UFA/RFA class so the marquee free agents (Mantha, Kane,
      // Tarasenko, Nyquist, Klingberg…) inject into the market even when
      // their bare seed row never had an expiry flag written.
      const effectiveExpiry = d.expiryStatus ?? seedFreeAgentStatus(d.name);
      if (!effectiveExpiry) continue;
      // A recorded extension means he signed. The expiry flag on the row is the
      // status he would have carried into a market he is not going to reach, so
      // injecting him here would put a man under contract into free agency.
      if (d.extensionCapHit != null && d.extensionCapHit > 0) continue;
      const dSlug = slugify(d.name);
      if (existingSlugs.has(dSlug)) continue;
      const fin = CONTRACTS[d.name] ?? null;
      const known = FA_KNOWN_FACTS[d.name];
      const lastCap = fin?.capHit || known?.lastCapHit || d.capHit || 0;
      const slug = slugify(d.name);
      const stats = analyticsMap.get(slug) ?? NHL_SKATER_STATS.get(slug) ?? null;
      const nhlG = NHL_GOALIE_STATS.get(slug);
      // Seed rows carry position "Unknown" (truthy — the old || "C" never
      // fired), which cratered FA pricing to league-min for real veterans.
      // Infer: goalie stats → G; heavy minutes with modest scoring → D;
      // any skater stats → W; else C.
      const rawPos = normalisePos(d.position);
      const pos = ["C", "W", "D", "G"].includes(rawPos)
        ? rawPos
        : nhlG
          ? "G"
          : stats && (stats.avgTOI ?? 0) >= 19 && (stats.ptsPace ?? 0) < 35
            ? "D"
            : stats
              ? "W"
              : "C";
      const isGoalie = pos === "G";
      const ptsPace = stats?.ptsPace ?? 0;
      const avgTOI = stats?.avgTOI ?? 0;
      const normExpiry: "UFA" | "RFA" | null = /rfa/i.test(effectiveExpiry) ? "RFA" : /ufa/i.test(effectiveExpiry) ? "UFA" : null;
      if (!normExpiry) continue;
      const faTeamId = d.teamId || "FA_POOL";
      players.push({
        id: d.id, teamId: faTeamId, name: d.name, position: pos,
        age: known?.age ?? (d.age && d.age > 16 ? d.age : 27), headshot: null, games: stats?.games ?? 0,
        ptsPace, xGPace: stats?.xGPace ?? 0, defRate: stats?.defRate ?? 0.08,
        avgTOI, qocIndex: null, rosterTier: undefined,
        hasLiveStats: stats?.hasLiveStats ?? false,
        gsax: nhlG?.gsax ?? 0, savePct: nhlG?.savePct ?? 0.900,
        gamesStarted: nhlG?.gamesStarted ?? 0, shotsPerGame: 0,
        teamXga60: LEAGUE.avgXga60, teamHdca60: null,
        baselineGsax: 0, baselinePtsPace: undefined,
        baselineToiPerGame: undefined,
        baselineSeasonsWeighted: undefined,
        baselineGameScore: undefined, baselineDpsProxy: undefined,
        baselineXgRel: undefined, ppPtsPace82: undefined,
        pkTimeShare: undefined, baselineIxg82: undefined,
        baselineHits82: undefined, baselineBlocks82: undefined,
        pairXgfPct: undefined, pairDriverScore: undefined,
        baselineHdsvPct: undefined,
        capHit: 0, lastCapHit: lastCap, yearsRemaining: 0,
        hasExtension: false, hasNMC: false, hasNTC: false, canRetain: true,
        draftYear: null, draftOverall: null, prospectPtsPace: null,
        developmentProfile: null,
        tradeBlockStatus: null, tradeBlockNote: null,
        expiryStatus: normExpiry, expiryYear: d.expiryYear ?? null,
        contractStatus: normExpiry, expiresThisOffseason: true,
        contractMissing: true, retainedPct: 0, multiplier: 1.0,
        ops: null, dps: null, xgRelTM: null, xgaRelTM: null,
        dzPct: null, goalsPace: stats?.goalsPace, assistsPace: stats?.assistsPace,
        plusMinus: stats?.plusMinus ?? null,
      });
      existingSlugs.add(dSlug);
      poolCount++;
    }
    _dbg.noTeam = poolCount;
  } catch (e: any) {
    console.warn("[FA pool] injection skipped:", e.message);
  }

  const publishedTradeCapMoves = buildPublishedTradeCapMoves(publishedTrades, players);
  const finalTeams = applyTeamCapDeltas(rosterTeams, publishedTradeCapMoves);
  players = applyPublishedTradeOverlay(players, publishedTrades);

  return {
    teams: finalTeams,
    players,
    publishedTradeCapMoves,
    rosterMap,
    liveStats: analyticsMap.size > 0,
    generatedAt: new Date().toISOString(),
    debug: {
      playerCount: players.length,
      analyticsCount: analyticsMap.size,
      contractsLoaded: Object.keys(CONTRACTS).length,
      expiringCount: players.filter((p: any) => p.expiresThisOffseason).length,
      ufaCount: players.filter((p: any) => p.contractStatus === "UFA").length,
      rfaCount: players.filter((p: any) => p.contractStatus === "RFA").length,
      contractsWithExpiry: Object.entries(CONTRACTS)
        .filter(([, c]: [string, any]) => c.expiryStatus)
        .length,
      sampleExpiring: players
        .filter((p: any) => p.expiresThisOffseason)
        .slice(0, 5)
        .map((p: any) => `${p.name} (${p.contractStatus}, team:${p.teamId})`),
      sampleContractFAs: Object.entries(CONTRACTS)
        .filter(([k, c]: [string, any]) => !k.includes("__") && c.expiryStatus)
        .slice(0, 5)
        .map(([k, c]: [string, any]) => `${k}: ${c.expiryStatus} ${c.expiryYear}`),
      ufaContractKeys: Object.entries(CONTRACTS)
        .filter(([k, c]: [string, any]) => !k.includes("__") && /ufa/i.test(String(c.expiryStatus)))
        .length,
      ufaPipeline: _dbg,
    },
  };
}
