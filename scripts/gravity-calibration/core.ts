import { createHash } from "node:crypto";

export const POPULATION_SCHEMA_VERSION = "gravity-v3-release-a-population-v1" as const;
export const CROSSWALK_SCHEMA_VERSION = "gravity-v3-release-a-crosswalk-v1" as const;
export const MODEL_RELEASE = "gravity-v3-release-a" as const;
export const SEASON_LABEL = "2025-26" as const;
export const NHL_SEASON_ID = 20252026;
export const MONEYPUCK_SEASON = "2025" as const;
export const GRAVITY_CALCULATION_MINIMUM_GAMES = 10;
export const PUBLIC_TIER_MINIMUM_GAMES = 20;

export type GravityPosition = "C" | "W" | "D";
export type SourceJoinStatus = "present" | "legitimately_unavailable" | "unresolved";
export type QualificationStatus =
  | "GRAVITY_INELIGIBLE"
  | "PROVISIONAL_NO_PUBLIC_TIER"
  | "PUBLIC_TIER_ELIGIBLE";

export interface NhlSkaterSummaryRow {
  playerId: number;
  skaterFullName: string;
  teamAbbrevs: string;
  positionCode: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  plusMinus: number;
  timeOnIcePerGame: number;
  seasonId: number;
}

export interface NhlTeamSummaryRow {
  teamId: number;
  teamFullName: string;
  gamesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  seasonId: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

export interface OfficialSkater {
  playerId: number;
  playerName: string;
  position: GravityPosition | null;
  rawPosition: string;
  gamesPlayed: number;
  teamHistory: string[];
  goals: number;
  assists: number;
  plusMinus: number;
  timeOnIcePerGameSeconds: number;
}

export interface SourceJoin {
  status: SourceJoinStatus;
  reasonCode: string | null;
}

export interface GravityCalibrationInputs {
  games: number;
  avgTOI: number | null;
  qocIndex: number | null;
  xgRelTM: number | null;
  baselineXgRel: number | null;
  pairDriverScore: number | null;
  assistsPace: number | null;
  baselineIxg82: number | null;
  goalsPace: number | null;
  ppPtsPace82: number | null;
  edgeOzPct: number | null;
  dzPct: number | null;
  edgeSpeedMaxMph: number | null;
  edgeBurstsOver20: number | null;
  xgaRelTM: number | null;
  dps: number | null;
  pkTimeShare: number | null;
}

export interface GravityInputSource {
  input: keyof GravityCalibrationInputs;
  sourceIds: readonly string[];
  situationScope: string;
  rawEvidence: readonly string[];
  transformation: string;
  productionMissingRule: string;
  releaseAUse: string;
}

export const GRAVITY_INPUT_SOURCE_MATRIX = [
  {
    input: "games",
    sourceIds: ["moneypuck_skater_summary_2025", "nhl_official_skater_universe"],
    situationScope: "MoneyPuck all situations; NHL regular-season total",
    rawEvidence: ["games_played", "gamesPlayed"],
    transformation: "MoneyPuck current-season GP with official NHL GP as the stable-ID fallback.",
    productionMissingRule: "Official GP is required; the universe build rejects a missing or invalid value.",
    releaseAUse: "Calculation eligibility, sample/reliability damping, and EDGE bursts per 82.",
  },
  {
    input: "avgTOI",
    sourceIds: ["moneypuck_skater_summary_2025", "nhl_official_skater_universe"],
    situationScope: "MoneyPuck all situations; NHL regular-season total",
    rawEvidence: ["icetime", "games_played", "timeOnIcePerGame"],
    transformation: "MoneyPuck ice seconds divided by GP and 60; official NHL TOI/GP fallback.",
    productionMissingRule: "Official TOI/GP fallback is used; otherwise the value remains null.",
    releaseAUse: "Descriptive usage only; Release A does not multiply Gravity masses by TOI.",
  },
  {
    input: "qocIndex",
    sourceIds: ["moneypuck_skater_summary_2025"],
    situationScope: "Mixed: all-situations ice-time rank and 5-on-5 zone starts",
    rawEvidence: ["iceTimeRank", "games_played", "I_F_dZoneShiftStarts", "I_F_oZoneShiftStarts"],
    transformation: "Position roster-slot rank (65%) plus defensive-zone start context (35%).",
    productionMissingRule: "A missing component uses the existing neutral prior; both missing yields null.",
    releaseAUse: "Descriptive context only; Release A does not multiply Gravity masses by QoC.",
  },
  {
    input: "xgRelTM",
    sourceIds: ["moneypuck_skater_summary_2025"],
    situationScope: "All situations",
    rawEvidence: ["OnIce_F_xGoals", "OnIce_A_xGoals", "OffIce_F_xGoals", "OffIce_A_xGoals"],
    transformation: "On-ice minus off-ice xG share in percentage points, damped by min(1, GP/30).",
    productionMissingRule: "Null; computeGravity can use baselineXgRel alone or omit lift if both are absent.",
    releaseAUse: "Current on/off component of the offensive-zone lift and signal stability.",
  },
  {
    input: "baselineXgRel",
    sourceIds: [
      "moneypuck_skater_summary_2022",
      "moneypuck_skater_summary_2023",
      "moneypuck_skater_summary_2024",
      "moneypuck_skater_summary_2025",
    ],
    situationScope: "5-on-5 with documented all-situations fallback",
    rawEvidence: ["onIce_xGoalsPercentage", "offIce_xGoalsPercentage", "games_played"],
    transformation: "GP-qualified 2025/2024/2023/2022 weighted blend at 0.50/0.30/0.15/0.05.",
    productionMissingRule: "Null; current xgRelTM remains usable and stability takes the unknown prior.",
    releaseAUse: "Multi-season on/off anchor for offensive lift and signal stability.",
  },
  {
    input: "pairDriverScore",
    sourceIds: ["nstCurrentPairings", "nstPriorPairings"],
    situationScope: "Natural Stat Trick all-situations defensive pair aggregates",
    rawEvidence: ["Player", "Player 2", "Team", "TOI", "xGF%"],
    transformation: "50+ TOI exact-ID-crosswalk pair deltas, then 60% current/40% prior when both exist.",
    productionMissingRule: "Null; no legacy defense-pair adjustment is applied.",
    releaseAUse: "Defenseman-only legacy adjustment to signal stability, not partner isolation.",
  },
  {
    input: "assistsPace",
    sourceIds: ["moneypuck_skater_summary_2025", "nhl_official_skater_universe"],
    situationScope: "All situations",
    rawEvidence: ["I_F_points", "I_F_goals", "games_played", "assists", "gamesPlayed"],
    transformation: "MoneyPuck (points minus goals) per 82; official NHL assists/GP fallback.",
    productionMissingRule: "Null; the fixed offensive-zone term is omitted.",
    releaseAUse: "Displayed offensive-zone mass only; excluded from navResidual.",
  },
  {
    input: "baselineIxg82",
    sourceIds: ["nstCurrentSkaters", "nstPriorSkaters"],
    situationScope: "Natural Stat Trick all-situations skater totals",
    rawEvidence: ["Player", "Position", "Team", "GP", "ixG"],
    transformation: "10+ GP ixG per 82 through the exact crosswalk; 60% current/40% prior blend.",
    productionMissingRule: "Null; computeGravity uses goalsPace as its documented fallback.",
    releaseAUse: "Individual expected-goal component of displayed offensive-zone mass only.",
  },
  {
    input: "goalsPace",
    sourceIds: ["moneypuck_skater_summary_2025", "nhl_official_skater_universe"],
    situationScope: "All situations",
    rawEvidence: ["I_F_goals", "games_played", "goals", "gamesPlayed"],
    transformation: "MoneyPuck goals per 82; official NHL goals/GP fallback.",
    productionMissingRule: "Null; the individual-xG/goals offensive-zone term is omitted.",
    releaseAUse: "Fallback for baselineIxg82 in displayed offensive-zone mass; excluded from navResidual.",
  },
  {
    input: "ppPtsPace82",
    sourceIds: [
      "moneypuck_skater_summary_2022",
      "moneypuck_skater_summary_2023",
      "moneypuck_skater_summary_2024",
      "moneypuck_skater_summary_2025",
    ],
    situationScope: "5-on-4 production",
    rawEvidence: ["I_F_points", "games_played"],
    transformation: "PP points per 82 in each GP-qualified season, using the normalized baseline weights.",
    productionMissingRule: "Null only when no qualifying baseline season exists; an absent 5-on-4 row is zero.",
    releaseAUse: "Displayed offensive-zone mass only; excluded from navResidual.",
  },
  {
    input: "edgeOzPct",
    sourceIds: ["nhl_edge_skater_detail"],
    situationScope: "NHL regular-season EDGE aggregate; no strength-state tag",
    rawEvidence: ["zoneTimeDetails.offensiveZonePctg"],
    transformation: "Retained as the NHL EDGE offensive-zone time share.",
    productionMissingRule: "Null; the neutral-zone displacement term is omitted.",
    releaseAUse: "Transition displacement component of neutral-zone mass and navResidual.",
  },
  {
    input: "dzPct",
    sourceIds: ["moneypuck_skater_summary_2025"],
    situationScope: "5-on-5 zone starts",
    rawEvidence: ["I_F_dZoneShiftStarts", "I_F_oZoneShiftStarts"],
    transformation: "Defensive starts divided by offensive plus defensive starts.",
    productionMissingRule: "Null; computeGravity uses a neutral 0.5 deployment prior.",
    releaseAUse: "Deployment expectation for neutral-zone displacement; also descriptive QoC context.",
  },
  {
    input: "edgeSpeedMaxMph",
    sourceIds: ["nhl_edge_skater_detail"],
    situationScope: "NHL regular-season EDGE aggregate; no strength-state tag",
    rawEvidence: ["skatingSpeed.speedMax.imperial"],
    transformation: "Retained as maximum skating speed in miles per hour.",
    productionMissingRule: "Null; the fixed neutral-zone speed term is omitted.",
    releaseAUse: "Neutral-zone mass and navResidual.",
  },
  {
    input: "edgeBurstsOver20",
    sourceIds: ["nhl_edge_skater_detail"],
    situationScope: "NHL regular-season EDGE aggregate; no strength-state tag",
    rawEvidence: ["skatingSpeed.burstsOver20.value"],
    transformation: "Retained as count; computeGravity converts it to bursts per 82 using games.",
    productionMissingRule: "Null; the fixed neutral-zone burst term is omitted.",
    releaseAUse: "Neutral-zone mass and navResidual.",
  },
  {
    input: "xgaRelTM",
    sourceIds: ["moneypuck_skater_summary_2025"],
    situationScope: "All situations",
    rawEvidence: ["OnIce_A_xGoals", "OffIce_A_xGoals", "icetime", "games_played"],
    transformation: "On-ice minus off-ice xGA rate, damped by min(1, GP/30).",
    productionMissingRule: "Null; the fixed defensive-zone suppression term is omitted.",
    releaseAUse: "Displayed defensive-zone mass only; excluded from navResidual.",
  },
  {
    input: "dps",
    sourceIds: ["nhl_official_skater_universe", "nhl_team_summary"],
    situationScope: "NHL regular-season all-situations summaries",
    rawEvidence: [
      "plusMinus",
      "timeOnIcePerGame",
      "gamesPlayed",
      "goalsFor",
      "goalsAgainst",
      "points",
    ],
    transformation: "Existing team marginal-goals, TOI-share, and position-adjusted DPS derivation.",
    productionMissingRule: "Null and an unresolved source join if the NHL team summary cannot be linked.",
    releaseAUse: "Displayed defensive-zone mass only; excluded from navResidual.",
  },
  {
    input: "pkTimeShare",
    sourceIds: [
      "moneypuck_skater_summary_2022",
      "moneypuck_skater_summary_2023",
      "moneypuck_skater_summary_2024",
      "moneypuck_skater_summary_2025",
    ],
    situationScope: "4-on-5 usage divided by all-situations usage",
    rawEvidence: ["4on5.icetime", "all.icetime", "games_played"],
    transformation: "PK ice share in each GP-qualified season, using the normalized baseline weights.",
    productionMissingRule: "Null only when no qualifying baseline season exists; absent 4-on-5 ice is zero.",
    releaseAUse: "Displayed defensive-zone mass only; excluded from navResidual.",
  },
] as const satisfies readonly GravityInputSource[];

export function hasExplicitGravityInputs(inputs: unknown): boolean {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) return false;
  const values = inputs as Record<string, unknown>;
  return GRAVITY_INPUT_SOURCE_MATRIX.every(({ input }) => (
    Object.prototype.hasOwnProperty.call(values, input)
    && (values[input] === null
      || (typeof values[input] === "number" && Number.isFinite(values[input])))
  ));
}

export interface PopulationRecord {
  playerId: number;
  playerName: string;
  position: GravityPosition | null;
  gamesPlayed: number;
  teamHistory: string[];
  qualification: {
    status: QualificationStatus;
    gravityCalculationEligible: boolean;
    publicTierEligible: boolean;
    reasonCode: string | null;
  };
  inputs: GravityCalibrationInputs;
  sourceJoins: {
    nhlOfficialUniverse: SourceJoin;
    moneyPuckCurrent: SourceJoin;
    moneyPuckBaseline: SourceJoin;
    nstBaseline: SourceJoin;
    nhlEdge: SourceJoin;
    nhlDerivedDps: SourceJoin;
  };
}

export interface CachedHttpRecord {
  key: string;
  url: string;
  status: number;
  retrievedAt: string;
  headers: {
    contentType: string | null;
    date: string | null;
    etag: string | null;
    lastModified: string | null;
  };
  bodySha256: string;
  bytes: number;
  body: string;
}

export interface SourceAudit {
  id: string;
  kind: "http" | "tracked_file";
  identifier: string;
  retrievedAt: string | null;
  retrievalTimestampStatus: "recorded" | "unavailable";
  rowCount: number;
  bytes: number;
  sha256: string;
  httpStatusCounts: Record<string, number> | null;
  contentTypes: string[];
  etags: string[];
  lastModifiedValues: string[];
  requestCount: number;
}

export interface CrosswalkSourceRow {
  sourceKey: string;
  sourceName: string;
  sourcePosition: string | null;
  sourceTeams: string[];
}

export interface CrosswalkEntry extends CrosswalkSourceRow {
  status: "matched" | "out_of_universe" | "unresolved";
  playerId: number | null;
  method:
    | "EXACT_NAME_POSITION_UNIQUE"
    | "EXACT_NAME_POSITION_TEAM"
    | "NOT_IN_SEASON_UNIVERSE"
    | "NO_EXACT_NAME"
    | "POSITION_MISMATCH"
    | "AMBIGUOUS_EXACT_IDENTITY";
}

export interface SourceCrosswalk {
  schemaVersion: typeof CROSSWALK_SCHEMA_VERSION;
  season: typeof SEASON_LABEL;
  normalization: {
    name: "UNICODE_NFC_CASEFOLD_WHITESPACE";
    position: "EXPLICIT_C_W_D_MAP";
    team: "EXPLICIT_ABBREVIATION_MAP";
    fuzzyMatching: false;
  };
  entries: CrosswalkEntry[];
}

export interface MoneyPuckSituationRow {
  values: Record<string, string>;
}

export interface MoneyPuckPlayerSeason {
  playerId: number;
  season: string;
  playerName: string;
  rawPosition: string;
  teams: string[];
  situations: Record<string, MoneyPuckSituationRow>;
}

export interface MoneyPuckCurrentInputs {
  games: number;
  avgTOI: number | null;
  iceTimeRankAverage: number | null;
  xgRelTM: number | null;
  xgaRelTM: number | null;
  dzPct: number | null;
  goalsPace: number | null;
  assistsPace: number | null;
}

export interface MoneyPuckBaselineInputs {
  baselineXgRel: number;
  ppPtsPace82: number;
  pkTimeShare: number;
}

export interface NstSkaterSource {
  sourceKey: string;
  name: string;
  position: string | null;
  teams: string[];
  games: number;
  ixg82: number | null;
}

export interface NstPairingSource {
  sourceKey: string;
  name: string;
  position: "D";
  teams: string[];
  pairXgfPct: number;
  driverScore: number;
}

export interface NstBaselineInputs {
  baselineIxg82: number | null;
  pairDriverScore: number | null;
}

export interface EdgeInputs {
  edgeOzPct: number | null;
  edgeSpeedMaxMph: number | null;
  edgeBurstsOver20: number | null;
  join: SourceJoin;
}

export interface InputCoverage {
  present: number;
  missing: number;
  zero: number;
  coveragePct: number;
}

export interface CoverageSummary {
  count: number;
  minimumPct: number;
  p25Pct: number;
  medianPct: number;
  p75Pct: number;
  maximumPct: number;
  meanPct: number;
  buckets: Record<"0_24" | "25_49" | "50_74" | "75_99" | "100", number>;
}

export const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
};

export const stableStringify = (value: unknown): string =>
  `${JSON.stringify(stableValue(value), null, 2)}\n`;

export function cachedRerunMatches(
  previousPopulation: string | null,
  previousCrosswalk: string | null,
  nextPopulation: string,
  nextCrosswalk: string,
): boolean | null {
  if (previousPopulation === null || previousCrosswalk === null) return null;
  return sha256(previousPopulation) === sha256(nextPopulation)
    && sha256(previousCrosswalk) === sha256(nextCrosswalk);
}

export function parseCsv(raw: string): { headers: string[]; rows: string[][] } {
  const text = raw.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\"") {
      if (quoted && text[index + 1] === "\"") {
        field += "\"";
        index++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }

  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (rows.length === 0) throw new Error("CSV source is empty");
  return { headers: rows[0], rows: rows.slice(1) };
}

export const finiteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "" || value.trim() === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const requiredNumber = (value: unknown, label: string): number => {
  const parsed = finiteNumber(value);
  if (parsed === null) throw new Error(`Missing finite number: ${label}`);
  return parsed;
};

export function normalizePosition(value: string | null | undefined): GravityPosition | null {
  const raw = (value ?? "").trim().toUpperCase();
  if (raw === "D") return "D";
  if (raw === "C") return "C";
  if (["L", "R", "W", "LW", "RW", "F"].includes(raw)) return "W";
  return null;
}

export const normalizeExactName = (value: string): string =>
  value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

const TEAM_ABBREVIATION_MAP: Record<string, string> = {
  "L.A": "LAK",
  "N.J": "NJD",
  "S.J": "SJS",
  "T.B": "TBL",
  ARI: "UTA",
  MON: "MTL",
};

export const normalizeTeam = (value: string): string => {
  const raw = value.trim().toUpperCase();
  return TEAM_ABBREVIATION_MAP[raw] ?? raw;
};

export const splitTeams = (value: string | null | undefined): string[] =>
  [...new Set((value ?? "").split(",").map(normalizeTeam).filter(Boolean))].sort();

export async function collectPaginated<T>(
  fetchPage: (start: number, limit: number) => Promise<PaginatedResponse<T>>,
  pageSize = 100,
): Promise<{ total: number; rows: T[] }> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error("pageSize must be positive");
  const first = await fetchPage(0, pageSize);
  if (!Number.isInteger(first.total) || first.total < 0) throw new Error("Invalid paginated total");
  if (first.data.length > pageSize) throw new Error("Page exceeded requested size");

  const rows = [...first.data];
  for (let start = pageSize; start < first.total; start += pageSize) {
    const page = await fetchPage(start, pageSize);
    if (page.total !== first.total) throw new Error("Paginated total changed during acquisition");
    if (page.data.length > pageSize) throw new Error("Page exceeded requested size");
    rows.push(...page.data);
  }
  if (rows.length !== first.total) {
    throw new Error(`Pagination incomplete: expected ${first.total}, received ${rows.length}`);
  }
  return { total: first.total, rows };
}

export function buildOfficialUniverse(
  rows: NhlSkaterSummaryRow[],
  declaredTotal: number,
): OfficialSkater[] {
  if (rows.length !== declaredTotal) {
    throw new Error(`Official universe incomplete: expected ${declaredTotal}, received ${rows.length}`);
  }
  const byId = new Map<number, OfficialSkater>();
  for (const row of rows) {
    const playerId = requiredNumber(row.playerId, "NHL playerId");
    if (!Number.isInteger(playerId) || playerId <= 0) throw new Error(`Invalid NHL player ID: ${row.playerId}`);
    if (byId.has(playerId)) throw new Error(`Duplicate NHL player ID: ${playerId}`);
    if (row.seasonId !== NHL_SEASON_ID) throw new Error(`Mixed NHL season for player ${playerId}`);
    const gamesPlayed = requiredNumber(row.gamesPlayed, `games for ${playerId}`);
    if (!Number.isInteger(gamesPlayed) || gamesPlayed < 1) {
      throw new Error(`Official universe contains invalid GP for ${playerId}`);
    }
    byId.set(playerId, {
      playerId,
      playerName: String(row.skaterFullName ?? "").trim(),
      position: normalizePosition(row.positionCode),
      rawPosition: String(row.positionCode ?? ""),
      gamesPlayed,
      teamHistory: splitTeams(row.teamAbbrevs),
      goals: requiredNumber(row.goals, `goals for ${playerId}`),
      assists: requiredNumber(row.assists, `assists for ${playerId}`),
      plusMinus: requiredNumber(row.plusMinus, `plus-minus for ${playerId}`),
      timeOnIcePerGameSeconds: requiredNumber(row.timeOnIcePerGame, `TOI for ${playerId}`),
    });
  }
  return [...byId.values()].sort((a, b) => a.playerId - b.playerId);
}

export function parseMoneyPuckSeason(raw: string, expectedSeason: string): Map<number, MoneyPuckPlayerSeason> {
  const { headers, rows } = parseCsv(raw);
  const index = Object.fromEntries(headers.map((header, idx) => [header, idx]));
  for (const required of ["playerId", "season", "name", "team", "position", "situation"]) {
    if (index[required] === undefined) throw new Error(`MoneyPuck missing column: ${required}`);
  }

  const byId = new Map<number, MoneyPuckPlayerSeason>();
  for (const row of rows) {
    const playerId = requiredNumber(row[index.playerId], "MoneyPuck playerId");
    if (!Number.isInteger(playerId) || playerId <= 0) throw new Error(`Invalid MoneyPuck playerId: ${playerId}`);
    const season = String(row[index.season] ?? "");
    if (season !== expectedSeason) throw new Error(`Mixed MoneyPuck season ${season}; expected ${expectedSeason}`);
    const situation = String(row[index.situation] ?? "");
    const existing = byId.get(playerId) ?? {
      playerId,
      season,
      playerName: String(row[index.name] ?? "").trim(),
      rawPosition: String(row[index.position] ?? ""),
      teams: splitTeams(row[index.team]),
      situations: {},
    };
    if (existing.situations[situation]) {
      throw new Error(`Duplicate MoneyPuck situation ${situation} for ${playerId}`);
    }
    existing.situations[situation] = {
      values: Object.fromEntries(headers.map((header, idx) => [header, row[idx] ?? ""])),
    };
    byId.set(playerId, existing);
  }
  return byId;
}

const rowNumber = (row: MoneyPuckSituationRow, key: string): number | null =>
  finiteNumber(row.values[key]);

export function currentMoneyPuckInputs(
  player: MoneyPuckPlayerSeason,
): MoneyPuckCurrentInputs | null {
  const all = player.situations.all;
  if (!all) return null;
  const games = rowNumber(all, "games_played");
  const iceSeconds = rowNumber(all, "icetime");
  if (games === null || games <= 0 || iceSeconds === null || iceSeconds < 0) return null;

  const onF = rowNumber(all, "OnIce_F_xGoals");
  const onA = rowNumber(all, "OnIce_A_xGoals");
  const offF = rowNumber(all, "OffIce_F_xGoals");
  const offA = rowNumber(all, "OffIce_A_xGoals");
  const onPct = onF !== null && onA !== null && onF + onA > 0 ? onF / (onF + onA) : null;
  const offPct = offF !== null && offA !== null && offF + offA > 0 ? offF / (offF + offA) : null;
  const sampleWeight = Math.min(1, games / 30);

  const iceHours = iceSeconds / 3600;
  const benchHours = Math.max(0.01, (games * 60 - iceSeconds / 60) / 60);
  const onAgainstRate = onA !== null && iceHours > 0 ? onA / iceHours : null;
  const offAgainstRate = offA !== null ? offA / benchHours : null;

  const fiveOnFive = player.situations["5on5"];
  const dzStarts = fiveOnFive ? rowNumber(fiveOnFive, "I_F_dZoneShiftStarts") : null;
  const ozStarts = fiveOnFive ? rowNumber(fiveOnFive, "I_F_oZoneShiftStarts") : null;
  const dzPct = dzStarts !== null && ozStarts !== null && dzStarts + ozStarts > 0
    ? dzStarts / (dzStarts + ozStarts)
    : null;

  const points = rowNumber(all, "I_F_points");
  const goals = rowNumber(all, "I_F_goals");
  const rawIceRank = rowNumber(all, "iceTimeRank");
  return {
    games,
    avgTOI: iceSeconds / games / 60,
    iceTimeRankAverage: rawIceRank !== null && games >= 5 ? rawIceRank / games : null,
    xgRelTM: onPct !== null && offPct !== null ? (onPct - offPct) * 100 * sampleWeight : null,
    xgaRelTM: onAgainstRate !== null && offAgainstRate !== null
      ? (onAgainstRate - offAgainstRate) * sampleWeight
      : null,
    dzPct,
    goalsPace: goals !== null ? (goals / games) * 82 : null,
    assistsPace: points !== null && goals !== null ? ((points - goals) / games) * 82 : null,
  };
}

const MONEYPUCK_BASELINE_WEIGHTS: Record<string, number> = {
  "2025": 0.5,
  "2024": 0.3,
  "2023": 0.15,
  "2022": 0.05,
};

export function moneyPuckBaselineInputs(
  seasons: ReadonlyMap<string, MoneyPuckPlayerSeason>,
): MoneyPuckBaselineInputs | null {
  let xgRel = 0;
  let ppPace = 0;
  let pkShare = 0;
  let totalWeight = 0;

  for (const [season, player] of seasons) {
    const weight = MONEYPUCK_BASELINE_WEIGHTS[season] ?? 0;
    const all = player.situations.all;
    if (weight <= 0 || !all) continue;
    const games = rowNumber(all, "games_played");
    if (games === null || games < GRAVITY_CALCULATION_MINIMUM_GAMES) continue;
    const even = player.situations["5on5"] ?? all;
    const onXg = rowNumber(even, "onIce_xGoalsPercentage");
    const offXg = rowNumber(even, "offIce_xGoalsPercentage");
    if (onXg === null || offXg === null) continue;
    const ppPoints = player.situations["5on4"]
      ? rowNumber(player.situations["5on4"], "I_F_points")
      : 0;
    const totalIce = rowNumber(all, "icetime");
    const pkIce = player.situations["4on5"]
      ? rowNumber(player.situations["4on5"], "icetime")
      : 0;
    if (ppPoints === null || totalIce === null || totalIce <= 0 || pkIce === null) continue;

    xgRel += (onXg - offXg) * weight;
    ppPace += (ppPoints * (82 / games)) * weight;
    pkShare += (pkIce / totalIce) * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return null;
  return {
    baselineXgRel: round(xgRel / totalWeight, 3),
    ppPtsPace82: round(ppPace / totalWeight, 2),
    pkTimeShare: round(pkShare / totalWeight, 3),
  };
}

export function calculateQocIndex(
  position: GravityPosition | null,
  iceRankAverage: number | null,
  dzPct: number | null,
): number | null {
  if (!position || (iceRankAverage === null && dzPct === null)) return null;
  const slots = position === "D" ? 6 : 12;
  const rankScore = iceRankAverage !== null
    ? clamp((slots + 1 - iceRankAverage) / slots, 0, 1)
    : 0.4;
  const dzScore = clamp(((dzPct ?? 0.5) - 0.35) / 0.3, 0, 1);
  return Math.round(100 * (0.65 * rankScore + 0.35 * dzScore));
}

export function qualificationFor(
  gamesPlayed: number,
  position: GravityPosition | null,
): PopulationRecord["qualification"] {
  if (!position) {
    return {
      status: "GRAVITY_INELIGIBLE",
      gravityCalculationEligible: false,
      publicTierEligible: false,
      reasonCode: "INVALID_SKATER_POSITION",
    };
  }
  if (gamesPlayed < GRAVITY_CALCULATION_MINIMUM_GAMES) {
    return {
      status: "GRAVITY_INELIGIBLE",
      gravityCalculationEligible: false,
      publicTierEligible: false,
      reasonCode: "BELOW_GRAVITY_CALCULATION_MINIMUM_GAMES",
    };
  }
  if (gamesPlayed < PUBLIC_TIER_MINIMUM_GAMES) {
    return {
      status: "PROVISIONAL_NO_PUBLIC_TIER",
      gravityCalculationEligible: true,
      publicTierEligible: false,
      reasonCode: "BELOW_PUBLIC_TIER_MINIMUM_GAMES",
    };
  }
  return {
    status: "PUBLIC_TIER_ELIGIBLE",
    gravityCalculationEligible: true,
    publicTierEligible: true,
    reasonCode: null,
  };
}

export function buildExactCrosswalk(
  sourceRows: CrosswalkSourceRow[],
  universe: OfficialSkater[],
): SourceCrosswalk {
  const targetsByName = new Map<string, OfficialSkater[]>();
  for (const target of universe) {
    const key = normalizeExactName(target.playerName);
    const list = targetsByName.get(key) ?? [];
    list.push(target);
    targetsByName.set(key, list);
  }

  const seenSourceKeys = new Set<string>();
  const entries = sourceRows.map((source): CrosswalkEntry => {
    if (seenSourceKeys.has(source.sourceKey)) throw new Error(`Duplicate crosswalk source key: ${source.sourceKey}`);
    seenSourceKeys.add(source.sourceKey);
    const nameCandidates = targetsByName.get(normalizeExactName(source.sourceName)) ?? [];
    if (nameCandidates.length === 0) {
      return {
        ...source,
        status: "out_of_universe",
        playerId: null,
        method: "NOT_IN_SEASON_UNIVERSE",
      };
    }

    const sourcePosition = normalizePosition(source.sourcePosition);
    const positionCandidates = sourcePosition
      ? nameCandidates.filter((target) => target.position === sourcePosition)
      : nameCandidates;
    if (positionCandidates.length === 0) {
      return {
        ...source,
        status: "unresolved",
        playerId: null,
        method: "POSITION_MISMATCH",
      };
    }
    if (positionCandidates.length === 1) {
      return {
        ...source,
        status: "matched",
        playerId: positionCandidates[0].playerId,
        method: "EXACT_NAME_POSITION_UNIQUE",
      };
    }

    const sourceTeams = new Set(source.sourceTeams.map(normalizeTeam));
    const teamCandidates = positionCandidates.filter((target) =>
      target.teamHistory.some((team) => sourceTeams.has(normalizeTeam(team))),
    );
    if (teamCandidates.length === 1) {
      return {
        ...source,
        status: "matched",
        playerId: teamCandidates[0].playerId,
        method: "EXACT_NAME_POSITION_TEAM",
      };
    }
    return {
      ...source,
      status: "unresolved",
      playerId: null,
      method: "AMBIGUOUS_EXACT_IDENTITY",
    };
  });

  return {
    schemaVersion: CROSSWALK_SCHEMA_VERSION,
    season: SEASON_LABEL,
    normalization: {
      name: "UNICODE_NFC_CASEFOLD_WHITESPACE",
      position: "EXPLICIT_C_W_D_MAP",
      team: "EXPLICIT_ABBREVIATION_MAP",
      fuzzyMatching: false,
    },
    entries: entries.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
  };
}

interface NstParsedSkater extends NstSkaterSource {
  sourceBucket: "current" | "prior";
}

interface NstPairRow {
  player: string;
  partner: string;
  team: string;
  toi: number;
  xgfPct: number;
}

const tableRows = (raw: string): Array<Record<string, string>> => {
  const { headers, rows } = parseCsv(raw);
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
};

export function parseNstSkaters(
  raw: string,
  bucket: "current" | "prior",
): NstParsedSkater[] {
  return tableRows(raw).map((row, index) => {
    const games = finiteNumber(row.GP) ?? 0;
    const ixg = finiteNumber(row.ixG);
    return {
      sourceKey: `nst:${bucket}:skater:${row[""] || index + 1}`,
      sourceBucket: bucket,
      name: String(row.Player ?? "").trim(),
      position: String(row.Position ?? "").trim() || null,
      teams: splitTeams(row.Team),
      games,
      ixg82: games >= GRAVITY_CALCULATION_MINIMUM_GAMES && ixg !== null
        ? (ixg / games) * 82
        : null,
    };
  });
}

export function parseNstPairings(
  raw: string,
  bucket: "current" | "prior",
): NstPairingSource[] {
  const pairRows: NstPairRow[] = tableRows(raw).flatMap((row) => {
    const toi = finiteNumber(row.TOI);
    const xgfPct = finiteNumber(row["xGF%"]);
    if (toi === null || toi < 50 || xgfPct === null) return [];
    return [{
      player: String(row.Player ?? "").trim(),
      partner: String(row["Player 2"] ?? "").trim(),
      team: String(row.Team ?? ""),
      toi,
      xgfPct,
    }];
  });

  const byPlayer = new Map<string, Array<{ partner: string; toi: number; xgfPct: number; teams: string[] }>>();
  const displayNames = new Map<string, string>();
  for (const row of pairRows) {
    const playerKey = normalizeExactName(row.player);
    const partnerKey = normalizeExactName(row.partner);
    displayNames.set(playerKey, row.player);
    displayNames.set(partnerKey, row.partner);
    const teams = splitTeams(row.team);
    const playerList = byPlayer.get(playerKey) ?? [];
    playerList.push({ partner: partnerKey, toi: row.toi, xgfPct: row.xgfPct, teams });
    byPlayer.set(playerKey, playerList);
    const partnerList = byPlayer.get(partnerKey) ?? [];
    partnerList.push({ partner: playerKey, toi: row.toi, xgfPct: row.xgfPct, teams });
    byPlayer.set(partnerKey, partnerList);
  }

  const averageExcluding = (player: string, excludedPartner: string): number | null => {
    const list = (byPlayer.get(player) ?? []).filter((entry) => entry.partner !== excludedPartner);
    const toi = list.reduce((sum, entry) => sum + entry.toi, 0);
    return toi > 0
      ? list.reduce((sum, entry) => sum + entry.xgfPct * entry.toi, 0) / toi
      : null;
  };

  const output: NstPairingSource[] = [];
  for (const [player, list] of byPlayer) {
    const toi = list.reduce((sum, entry) => sum + entry.toi, 0);
    if (toi <= 0) continue;
    let delta = 0;
    let deltaToi = 0;
    for (const entry of list) {
      const elsewhere = averageExcluding(entry.partner, player);
      if (elsewhere === null) continue;
      delta += (entry.xgfPct - elsewhere) * entry.toi;
      deltaToi += entry.toi;
    }
    output.push({
      sourceKey: `nst:${bucket}:pairing:${player}`,
      name: displayNames.get(player) ?? player,
      position: "D",
      teams: [...new Set(list.flatMap((entry) => entry.teams))].sort(),
      pairXgfPct: list.reduce((sum, entry) => sum + entry.xgfPct * entry.toi, 0) / toi,
      driverScore: deltaToi > 0 ? delta / deltaToi : 0,
    });
  }
  return output.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
}

const blend = (current: number | null | undefined, prior: number | null | undefined): number | null => {
  if (current !== null && current !== undefined && prior !== null && prior !== undefined) {
    return current * 0.6 + prior * 0.4;
  }
  return current ?? prior ?? null;
};

export function nstBaselinesByPlayerId(
  currentSkaters: NstParsedSkater[],
  priorSkaters: NstParsedSkater[],
  currentPairings: NstPairingSource[],
  priorPairings: NstPairingSource[],
  crosswalk: SourceCrosswalk,
): Map<number, NstBaselineInputs> {
  const playerBySource = new Map(
    crosswalk.entries
      .filter((entry): entry is CrosswalkEntry & { playerId: number } =>
        entry.status === "matched" && entry.playerId !== null)
      .map((entry) => [entry.sourceKey, entry.playerId]),
  );
  const mapById = <T extends { sourceKey: string }>(rows: T[]): Map<number, T> => {
    const result = new Map<number, T>();
    for (const row of rows) {
      const playerId = playerBySource.get(row.sourceKey);
      if (playerId === undefined) continue;
      if (result.has(playerId)) throw new Error(`Duplicate NST mapping for player ${playerId}`);
      result.set(playerId, row);
    }
    return result;
  };

  const currentSkaterMap = mapById(currentSkaters);
  const priorSkaterMap = mapById(priorSkaters);
  const currentPairMap = mapById(currentPairings);
  const priorPairMap = mapById(priorPairings);
  const ids = new Set([
    ...currentSkaterMap.keys(),
    ...priorSkaterMap.keys(),
    ...currentPairMap.keys(),
    ...priorPairMap.keys(),
  ]);
  const output = new Map<number, NstBaselineInputs>();
  for (const playerId of ids) {
    output.set(playerId, {
      baselineIxg82: nullableRound(
        blend(currentSkaterMap.get(playerId)?.ixg82, priorSkaterMap.get(playerId)?.ixg82),
        2,
      ),
      pairDriverScore: nullableRound(
        blend(currentPairMap.get(playerId)?.driverScore, priorPairMap.get(playerId)?.driverScore),
        2,
      ),
    });
  }
  return output;
}

const TEAM_FULL_NAME_BY_ABBREVIATION: Record<string, string> = {
  ANA: "Anaheim Ducks",
  BOS: "Boston Bruins",
  BUF: "Buffalo Sabres",
  CGY: "Calgary Flames",
  CAR: "Carolina Hurricanes",
  CHI: "Chicago Blackhawks",
  COL: "Colorado Avalanche",
  CBJ: "Columbus Blue Jackets",
  DAL: "Dallas Stars",
  DET: "Detroit Red Wings",
  EDM: "Edmonton Oilers",
  FLA: "Florida Panthers",
  LAK: "Los Angeles Kings",
  MIN: "Minnesota Wild",
  MTL: "Montreal Canadiens",
  NSH: "Nashville Predators",
  NJD: "New Jersey Devils",
  NYI: "New York Islanders",
  NYR: "New York Rangers",
  OTT: "Ottawa Senators",
  PHI: "Philadelphia Flyers",
  PIT: "Pittsburgh Penguins",
  SEA: "Seattle Kraken",
  SJS: "San Jose Sharks",
  STL: "St. Louis Blues",
  TBL: "Tampa Bay Lightning",
  TOR: "Toronto Maple Leafs",
  UTA: "Utah Mammoth",
  VAN: "Vancouver Canucks",
  VGK: "Vegas Golden Knights",
  WSH: "Washington Capitals",
  WPG: "Winnipeg Jets",
};

const normalizedTeamName = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US");

export function deriveDps(
  skaters: OfficialSkater[],
  teams: NhlTeamSummaryRow[],
): { values: Map<number, number>; unresolved: Map<number, string> } {
  const values = new Map<number, number>();
  const unresolved = new Map<number, string>();
  const teamByName = new Map(teams.map((team) => [normalizedTeamName(team.teamFullName), team]));
  const teamByAbbreviation = new Map<string, NhlTeamSummaryRow>();
  for (const [abbreviation, fullName] of Object.entries(TEAM_FULL_NAME_BY_ABBREVIATION)) {
    const row = teamByName.get(normalizedTeamName(fullName));
    if (row) teamByAbbreviation.set(abbreviation, row);
  }

  const leagueGoals = teams.reduce((sum, team) => sum + team.goalsFor, 0);
  const leaguePoints = teams.reduce((sum, team) => sum + team.points, 0);
  const totalTeamGames = teams.reduce((sum, team) => sum + team.gamesPlayed, 0);
  if (leagueGoals <= 0 || leaguePoints <= 0 || totalTeamGames <= 0) {
    throw new Error("NHL team summary cannot support DPS derivation");
  }
  const leagueGoalsPerGame = leagueGoals / totalTeamGames;
  const marginalGoalsPerPoint = leagueGoals / leaguePoints;

  const aggregates = new Map<string, {
    fwdTOI: number;
    defTOI: number;
    totalSkaterTOI: number;
    fwdPM: number;
    defPM: number;
  }>();
  for (const skater of skaters) {
    if (skater.timeOnIcePerGameSeconds < 5 * 60) continue;
    const team = skater.teamHistory[0];
    if (!team) continue;
    const totalTOI = (skater.timeOnIcePerGameSeconds / 60) * skater.gamesPlayed;
    const aggregate = aggregates.get(team) ?? {
      fwdTOI: 0,
      defTOI: 0,
      totalSkaterTOI: 0,
      fwdPM: 0,
      defPM: 0,
    };
    if (skater.position === "D") {
      aggregate.defTOI += totalTOI;
      aggregate.defPM += skater.plusMinus;
    } else {
      aggregate.fwdTOI += totalTOI;
      aggregate.fwdPM += skater.plusMinus;
    }
    aggregate.totalSkaterTOI += totalTOI;
    aggregates.set(team, aggregate);
  }

  let forwardTOI = 0;
  let defenseTOI = 0;
  for (const skater of skaters) {
    const totalTOI = (skater.timeOnIcePerGameSeconds / 60) * skater.gamesPlayed;
    if (skater.position === "D") defenseTOI += totalTOI;
    else forwardTOI += totalTOI;
  }
  const forwardGcPerToi = forwardTOI > 0 ? (leagueGoals * 0.75 * 1.85 * 0.5) / forwardTOI : 0;
  const defenseGcPerToi = defenseTOI > 0 ? (leagueGoals * 0.25 * 1.85 * 0.5) / defenseTOI : 0;

  for (const skater of skaters) {
    const abbreviation = skater.teamHistory[0];
    const team = abbreviation ? teamByAbbreviation.get(abbreviation) : undefined;
    const aggregate = abbreviation ? aggregates.get(abbreviation) : undefined;
    if (!team || !aggregate) {
      unresolved.set(skater.playerId, "NHL_TEAM_SUMMARY_JOIN_UNRESOLVED");
      continue;
    }
    const isDefense = skater.position === "D";
    const positionAdjustment = isDefense ? 10 / 7 : 5 / 7;
    const totalTOI = (skater.timeOnIcePerGameSeconds / 60) * skater.gamesPlayed;
    const teamMarginalGoalsAgainst =
      (1 + 7 / 12) * team.gamesPlayed * leagueGoalsPerGame - team.goalsAgainst;
    const toiProportion = aggregate.totalSkaterTOI > 0
      ? totalTOI / aggregate.totalSkaterTOI
      : 0;
    const positionTOI = isDefense ? aggregate.defTOI : aggregate.fwdTOI;
    const positionPlusMinus = isDefense ? aggregate.defPM : aggregate.fwdPM;
    const plusMinusAdjustment = (1 / 7) * positionAdjustment * (
      skater.plusMinus - totalTOI * (positionTOI > 0 ? positionPlusMinus / positionTOI : 0)
    );
    const marginalGoalsAgainst =
      toiProportion * (5 / 7) * positionAdjustment * teamMarginalGoalsAgainst
      + plusMinusAdjustment;
    const dps = Math.max(-3, marginalGoalsAgainst / marginalGoalsPerPoint);
    values.set(skater.playerId, round(dps, 1));

    // Keep the matching production OPS setup represented in the calculation,
    // even though Gravity consumes only DPS.
    void (isDefense ? defenseGcPerToi : forwardGcPerToi);
  }
  return { values, unresolved };
}

export function parseEdgeRecord(record: CachedHttpRecord, expectedPlayerId: number): EdgeInputs {
  if ([404, 422].includes(record.status)) {
    return {
      edgeOzPct: null,
      edgeSpeedMaxMph: null,
      edgeBurstsOver20: null,
      join: { status: "legitimately_unavailable", reasonCode: `NHL_EDGE_HTTP_${record.status}` },
    };
  }
  if (record.status !== 200) {
    return {
      edgeOzPct: null,
      edgeSpeedMaxMph: null,
      edgeBurstsOver20: null,
      join: { status: "unresolved", reasonCode: `NHL_EDGE_HTTP_${record.status}` },
    };
  }
  try {
    const raw = JSON.parse(record.body);
    if (Number(raw?.player?.id) !== expectedPlayerId) {
      return {
        edgeOzPct: null,
        edgeSpeedMaxMph: null,
        edgeBurstsOver20: null,
        join: { status: "unresolved", reasonCode: "NHL_EDGE_PLAYER_ID_MISMATCH" },
      };
    }
    const edgeOzPct = finiteNumber(raw?.zoneTimeDetails?.offensiveZonePctg);
    const edgeSpeedMaxMph = finiteNumber(raw?.skatingSpeed?.speedMax?.imperial);
    const edgeBurstsOver20 = finiteNumber(raw?.skatingSpeed?.burstsOver20?.value);
    const anyPresent = [edgeOzPct, edgeSpeedMaxMph, edgeBurstsOver20].some((value) => value !== null);
    return {
      edgeOzPct,
      edgeSpeedMaxMph,
      edgeBurstsOver20,
      join: anyPresent
        ? { status: "present", reasonCode: null }
        : { status: "legitimately_unavailable", reasonCode: "NHL_EDGE_AGGREGATES_ABSENT" },
    };
  } catch {
    return {
      edgeOzPct: null,
      edgeSpeedMaxMph: null,
      edgeBurstsOver20: null,
      join: { status: "unresolved", reasonCode: "NHL_EDGE_INVALID_JSON" },
    };
  }
}

export function inputCoverage(
  records: PopulationRecord[],
  qualifiedOnly: boolean,
): Record<keyof GravityCalibrationInputs, InputCoverage> {
  const selected = qualifiedOnly
    ? records.filter((record) => record.qualification.publicTierEligible)
    : records;
  const keys = Object.keys(selected[0]?.inputs ?? {}) as Array<keyof GravityCalibrationInputs>;
  return Object.fromEntries(keys.map((key) => {
    const values = selected.map((record) => record.inputs[key]);
    const present = values.filter((value) => value !== null).length;
    const zero = values.filter((value) => value === 0).length;
    return [key, {
      present,
      missing: values.length - present,
      zero,
      coveragePct: values.length > 0 ? round((present / values.length) * 100, 2) : 0,
    }];
  })) as Record<keyof GravityCalibrationInputs, InputCoverage>;
}

const gravityEvidenceCoveragePct = (record: PopulationRecord): number => {
  const inputs = record.inputs;
  const present = (value: number | null): boolean => value !== null;
  const weight =
    (present(inputs.xgRelTM) || present(inputs.baselineXgRel) ? 0.4 : 0)
    + (present(inputs.assistsPace) ? 0.25 : 0)
    + (present(inputs.baselineIxg82) || present(inputs.goalsPace) ? 0.2 : 0)
    + (present(inputs.ppPtsPace82) ? 0.15 : 0)
    + (present(inputs.edgeOzPct) ? 0.5 : 0)
    + (present(inputs.edgeSpeedMaxMph) ? 0.25 : 0)
    + (present(inputs.edgeBurstsOver20) ? 0.25 : 0)
    + (present(inputs.xgaRelTM) ? 0.45 : 0)
    + (present(inputs.dps) ? 0.35 : 0)
    + (present(inputs.pkTimeShare) ? 0.2 : 0);
  return round((weight / 3) * 100, 2);
};

const percentileNearest = (sorted: number[], percentile: number): number => {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((percentile / 100) * (sorted.length - 1))))];
};

export function coverageSummary(records: PopulationRecord[]): CoverageSummary {
  const values = records
    .filter((record) => record.qualification.publicTierEligible)
    .map(gravityEvidenceCoveragePct)
    .sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  const buckets: CoverageSummary["buckets"] = {
    "0_24": 0,
    "25_49": 0,
    "50_74": 0,
    "75_99": 0,
    "100": 0,
  };
  for (const value of values) {
    if (value === 100) buckets["100"]++;
    else if (value >= 75) buckets["75_99"]++;
    else if (value >= 50) buckets["50_74"]++;
    else if (value >= 25) buckets["25_49"]++;
    else buckets["0_24"]++;
  }
  return {
    count: values.length,
    minimumPct: values[0] ?? 0,
    p25Pct: percentileNearest(values, 25),
    medianPct: percentileNearest(values, 50),
    p75Pct: percentileNearest(values, 75),
    maximumPct: values.length > 0 ? values[values.length - 1] : 0,
    meanPct: values.length > 0 ? round(sum / values.length, 2) : 0,
    buckets,
  };
}

export function sourceJoinCoverage(
  records: PopulationRecord[],
): Record<keyof PopulationRecord["sourceJoins"], Record<SourceJoinStatus, number>> {
  const keys = Object.keys(records[0]?.sourceJoins ?? {}) as Array<keyof PopulationRecord["sourceJoins"]>;
  return Object.fromEntries(keys.map((key) => {
    const counts: Record<SourceJoinStatus, number> = {
      present: 0,
      legitimately_unavailable: 0,
      unresolved: 0,
    };
    for (const record of records) counts[record.sourceJoins[key].status]++;
    return [key, counts];
  })) as Record<keyof PopulationRecord["sourceJoins"], Record<SourceJoinStatus, number>>;
}

export function auditHttpSource(
  id: string,
  identifier: string,
  records: CachedHttpRecord[],
  rowCount: number,
): SourceAudit {
  const sorted = [...records].sort((a, b) => a.key.localeCompare(b.key));
  const statuses: Record<string, number> = {};
  for (const record of sorted) statuses[String(record.status)] = (statuses[String(record.status)] ?? 0) + 1;
  const retrieved = sorted.map((record) => record.retrievedAt).sort();
  const combinedFingerprint = sha256(stableStringify(sorted.map((record) => ({
    key: record.key,
    url: record.url,
    status: record.status,
    bodySha256: record.bodySha256,
    bytes: record.bytes,
    etag: record.headers.etag,
    lastModified: record.headers.lastModified,
  }))));
  return {
    id,
    kind: "http",
    identifier,
    retrievedAt: retrieved.length > 0 ? retrieved[retrieved.length - 1] : null,
    retrievalTimestampStatus: "recorded",
    rowCount,
    bytes: sorted.reduce((sum, record) => sum + record.bytes, 0),
    sha256: combinedFingerprint,
    httpStatusCounts: statuses,
    contentTypes: [...new Set(sorted.map((record) => record.headers.contentType).filter((value): value is string => value !== null))].sort(),
    etags: [...new Set(sorted.map((record) => record.headers.etag).filter((value): value is string => value !== null))].sort(),
    lastModifiedValues: [...new Set(sorted.map((record) => record.headers.lastModified).filter((value): value is string => value !== null))].sort(),
    requestCount: sorted.length,
  };
}

export function auditTrackedSource(
  id: string,
  path: string,
  body: string,
  rowCount: number,
): SourceAudit {
  return {
    id,
    kind: "tracked_file",
    identifier: path,
    retrievedAt: null,
    retrievalTimestampStatus: "unavailable",
    rowCount,
    bytes: Buffer.byteLength(body),
    sha256: sha256(body),
    httpStatusCounts: null,
    contentTypes: ["text/csv"],
    etags: [],
    lastModifiedValues: [],
    requestCount: 0,
  };
}

export function validatePopulation(records: PopulationRecord[], officialTotal: number): string[] {
  const failures: string[] = [];
  if (records.length !== officialTotal) failures.push("OFFICIAL_UNIVERSE_NOT_100_PERCENT_REPRESENTED");
  const ids = records.map((record) => record.playerId);
  if (new Set(ids).size !== ids.length) failures.push("DUPLICATE_NHL_PLAYER_IDS");
  if (!ids.every((id, index) => index === 0 || ids[index - 1] < id)) failures.push("NON_DETERMINISTIC_PLAYER_ID_ORDER");
  for (const record of records) {
    if (record.gamesPlayed >= PUBLIC_TIER_MINIMUM_GAMES) {
      if (!Number.isInteger(record.playerId) || record.playerId <= 0) failures.push("QUALIFIED_PLAYER_MISSING_STABLE_ID");
      if (!record.position) failures.push("QUALIFIED_PLAYER_MISSING_POSITION");
      if (!Number.isInteger(record.gamesPlayed)) failures.push("QUALIFIED_PLAYER_INVALID_GAMES");
    }
    if (!record.qualification.reasonCode && !record.qualification.publicTierEligible) {
      failures.push("UNACCOUNTED_EXCLUSION");
    }
    if (!hasExplicitGravityInputs(record.inputs)) failures.push("INVALID_OR_IMPLICIT_INPUT");
    if (Object.values(record.sourceJoins).some((join) =>
      !["present", "legitimately_unavailable", "unresolved"].includes(join.status))) {
      failures.push("UNCLASSIFIED_SOURCE_JOIN");
    }
  }
  return [...new Set(failures)].sort();
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const nullableRound = (value: number | null, digits: number): number | null =>
  value === null ? null : round(value, digits);

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));
