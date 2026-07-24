import fs from "node:fs";
import path from "node:path";
import {
  GRAVITY_CALCULATION_MINIMUM_GAMES,
  GRAVITY_INPUT_SOURCE_MATRIX,
  MODEL_RELEASE,
  MONEYPUCK_SEASON,
  NHL_SEASON_ID,
  POPULATION_SCHEMA_VERSION,
  PUBLIC_TIER_MINIMUM_GAMES,
  SEASON_LABEL,
  auditHttpSource,
  auditTrackedSource,
  buildExactCrosswalk,
  buildOfficialUniverse,
  cachedRerunMatches,
  calculateQocIndex,
  collectPaginated,
  coverageSummary,
  currentMoneyPuckInputs,
  deriveDps,
  hasExplicitGravityInputs,
  inputCoverage,
  moneyPuckBaselineInputs,
  nstBaselinesByPlayerId,
  parseCsv,
  parseEdgeRecord,
  parseMoneyPuckSeason,
  parseNstPairings,
  parseNstSkaters,
  qualificationFor,
  sha256,
  sourceJoinCoverage,
  stableStringify,
  validatePopulation,
  type CachedHttpRecord,
  type CrosswalkSourceRow,
  type MoneyPuckPlayerSeason,
  type NhlSkaterSummaryRow,
  type NhlTeamSummaryRow,
  type PopulationRecord,
  type SourceAudit,
  type SourceJoin,
} from "./core";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "data", "gravity-calibration", SEASON_LABEL);
const POPULATION_PATH = path.join(OUTPUT_DIR, "population.json");
const CROSSWALK_PATH = path.join(OUTPUT_DIR, "source-crosswalk.json");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const REPORT_PATH = path.join(ROOT, "docs", "analytics", "GRAVITY_V3_RELEASE_A_POPULATION.md");
const DEFAULT_CACHE_DIR = path.join(ROOT, ".gravity-calibration-cache", SEASON_LABEL);
const GENERATION_COMMAND = "npx tsx scripts/gravity-calibration/build-population.ts";
const OFFLINE_COMMAND = `${GENERATION_COMMAND} --offline`;

const args = new Set(process.argv.slice(2));
const offline = args.has("--offline");
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const concurrency = concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 8;
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
  throw new Error("--concurrency must be an integer from 1 through 16");
}

interface CachedHttpMetadata {
  key: string;
  url: string;
  status: number;
  retrievedAt: string;
  headers: CachedHttpRecord["headers"];
  bodySha256: string;
  bytes: number;
}

const cachePathFor = (cacheDir: string, key: string): { body: string; metadata: string } => {
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return {
    body: path.join(cacheDir, `${safe}.body`),
    metadata: path.join(cacheDir, `${safe}.metadata.json`),
  };
};

const readCachedRecord = (
  bodyPath: string,
  metadataPath: string,
): CachedHttpRecord | null => {
  if (!fs.existsSync(bodyPath) || !fs.existsSync(metadataPath)) return null;
  const body = fs.readFileSync(bodyPath, "utf8");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as CachedHttpMetadata;
  const bodySha256 = sha256(body);
  if (metadata.bodySha256 !== bodySha256 || metadata.bytes !== Buffer.byteLength(body)) {
    throw new Error(`Raw cache integrity failure: ${metadata.key}`);
  }
  return { ...metadata, body };
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function requestWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      headers: {
        "Accept": "application/json,text/csv,text/plain,*/*",
        "User-Agent": "HockeyLedger-GravityCalibration/3-release-a",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCached(
  cacheDir: string,
  key: string,
  url: string,
): Promise<CachedHttpRecord> {
  const paths = cachePathFor(cacheDir, key);
  const cached = readCachedRecord(paths.body, paths.metadata);
  if (cached) {
    if (cached.url !== url) throw new Error(`Cache URL mismatch for ${key}`);
    return cached;
  }
  if (offline) throw new Error(`Offline cache miss: ${key}`);

  fs.mkdirSync(cacheDir, { recursive: true });
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await requestWithTimeout(url, 20_000);
      const body = await response.text();
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await wait(250 * (2 ** attempt));
        continue;
      }
      const metadata: CachedHttpMetadata = {
        key,
        url,
        status: response.status,
        retrievedAt: new Date().toISOString(),
        headers: {
          contentType: response.headers.get("content-type"),
          date: response.headers.get("date"),
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
        },
        bodySha256: sha256(body),
        bytes: Buffer.byteLength(body),
      };
      const bodyTemp = `${paths.body}.tmp-${process.pid}`;
      const metadataTemp = `${paths.metadata}.tmp-${process.pid}`;
      fs.writeFileSync(bodyTemp, body, "utf8");
      fs.writeFileSync(metadataTemp, stableStringify(metadata), "utf8");
      fs.renameSync(bodyTemp, paths.body);
      fs.renameSync(metadataTemp, paths.metadata);
      return { ...metadata, body };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(250 * (2 ** attempt));
    }
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Source request failed after retries: ${url}${detail}`);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      output[index] = await mapper(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

const NHL_SKATER_ENDPOINT = "https://api.nhle.com/stats/rest/en/skater/summary";
const NHL_TEAM_ENDPOINT = "https://api.nhle.com/stats/rest/en/team/summary";
const NHL_EDGE_TEMPLATE =
  `https://api-web.nhle.com/v1/edge/skater-detail/{playerId}/${NHL_SEASON_ID}/2`;
const MONEYPUCK_TEMPLATE =
  "https://moneypuck.com/moneypuck/playerData/seasonSummary/{season}/regular/skaters.csv";

const nhlUrl = (
  endpoint: string,
  start: number,
  limit: number,
  sortProperty: string,
): string => {
  const url = new URL(endpoint);
  url.searchParams.set("isAggregate", "false");
  url.searchParams.set("isGame", "false");
  url.searchParams.set("start", String(start));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set(
    "sort",
    JSON.stringify([{ property: sortProperty, direction: "ASC" }]),
  );
  url.searchParams.set("cayenneExp", `seasonId=${NHL_SEASON_ID} and gameTypeId=2`);
  return url.toString();
};

async function acquireNhlPages<T>(
  cacheDir: string,
  sourceKey: string,
  endpoint: string,
  sortProperty: string,
): Promise<{ total: number; rows: T[]; records: CachedHttpRecord[] }> {
  const records: CachedHttpRecord[] = [];
  const result = await collectPaginated<T>(async (start, limit) => {
    const record = await fetchCached(
      path.join(cacheDir, sourceKey),
      `${sourceKey}-${start}`,
      nhlUrl(endpoint, start, limit, sortProperty),
    );
    records.push(record);
    if (record.status !== 200) throw new Error(`${sourceKey} returned HTTP ${record.status}`);
    const parsed = JSON.parse(record.body) as { data?: T[]; total?: number };
    if (!Array.isArray(parsed.data) || !Number.isInteger(parsed.total)) {
      throw new Error(`${sourceKey} response schema mismatch`);
    }
    return { data: parsed.data, total: parsed.total! };
  });
  return { ...result, records };
}

async function acquireMoneyPuck(
  cacheDir: string,
  season: string,
): Promise<{ players: Map<number, MoneyPuckPlayerSeason>; record: CachedHttpRecord }> {
  const url = MONEYPUCK_TEMPLATE.replace("{season}", season);
  const record = await fetchCached(
    path.join(cacheDir, "moneypuck"),
    `moneypuck-${season}-skaters`,
    url,
  );
  if (record.status !== 200) throw new Error(`MoneyPuck ${season} returned HTTP ${record.status}`);
  return { players: parseMoneyPuckSeason(record.body, season), record };
}

const sourceJoin = (
  status: SourceJoin["status"],
  reasonCode: string | null,
): SourceJoin => ({ status, reasonCode });

const countCsvRows = (body: string): number => parseCsv(body).rows.length;

function sourceCrosswalkRows(
  currentSkaters: ReturnType<typeof parseNstSkaters>,
  priorSkaters: ReturnType<typeof parseNstSkaters>,
  currentPairings: ReturnType<typeof parseNstPairings>,
  priorPairings: ReturnType<typeof parseNstPairings>,
): CrosswalkSourceRow[] {
  return [...currentSkaters, ...priorSkaters, ...currentPairings, ...priorPairings].map((row) => ({
    sourceKey: row.sourceKey,
    sourceName: row.name,
    sourcePosition: row.position,
    sourceTeams: row.teams,
  }));
}

const countBy = <T>(values: T[], key: (value: T) => string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const group = key(value);
    counts[group] = (counts[group] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
};

const markdownTable = (
  headers: string[],
  rows: Array<Array<string | number>>,
): string => [
  `| ${headers.join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.join(" | ")} |`),
].join("\n");

function buildReport(manifest: any): string {
  const inputRows = Object.entries(manifest.inputCoverage.qualified)
    .map(([field, value]: [string, any]) => [
      field,
      value.present,
      value.missing,
      value.zero,
      `${value.coveragePct}%`,
    ]);
  const joinRows = Object.entries(manifest.sourceJoinCoverage)
    .map(([source, value]: [string, any]) => [
      source,
      value.present,
      value.legitimately_unavailable,
      value.unresolved,
    ]);
  const sourceRows = manifest.sources.map((source: SourceAudit) => [
    source.id,
    source.kind,
    source.rowCount,
    source.requestCount,
    source.sha256,
  ]);
  const sourceMatrixRows = manifest.inputSourceMatrix.map((entry: any) => [
    entry.input,
    entry.sourceIds.join(", "),
    entry.situationScope,
    entry.releaseAUse,
    entry.productionMissingRule,
  ]);
  const unresolvedIdentityRows = manifest.identity.unresolvedCrosswalkEntries.map(
    (entry: any) => [
      entry.sourceKey,
      entry.sourceName,
      entry.sourcePosition ?? "—",
      entry.sourceTeams.join(", ") || "—",
      entry.method,
    ],
  );
  const gates = Object.entries(manifest.completenessGates)
    .map(([gate, value]) => `- ${value === true ? "PASS" : value === false ? "FAIL" : "PENDING"} — \`${gate}\``)
    .join("\n");

  return `# Gravity v3 Release A frozen population

Generated from the frozen raw cache at \`${manifest.generatedAt}\`. This report
documents aggregate inputs only. It does not calculate tier cutoffs or activate
Gravity v4.

## Population

- Season: \`${manifest.season}\`
- Official NHL skater universe: **${manifest.population.officialUniverse}**
- Gravity calculation eligible (10+ GP): **${manifest.population.gravityCalculationEligible}**
- Provisional, no public tier (10–19 GP): **${manifest.population.provisionalNoPublicTier}**
- Public-tier calibration population (20+ GP): **${manifest.population.publicTierEligible}**
- Qualified forwards: **${manifest.population.qualifiedForwards}**
- Qualified defensemen: **${manifest.population.qualifiedDefensemen}**
- Duplicate NHL IDs: **${manifest.population.duplicatePlayerIds}**

Eligibility is deliberately split: fewer than 10 GP is Gravity-ineligible,
10–19 GP permits a provisional calculation but no league percentile/public
tier, and 20+ GP enters the calibration population.

## Source coverage

${markdownTable(
    ["Source join", "Present", "Legitimately unavailable", "Unresolved"],
    joinRows,
  )}

${markdownTable(
    ["Input", "Present", "Missing", "Zero-valued", "Coverage (20+ GP)"],
    inputRows,
  )}

Missing values are serialized as \`null\`. A numeric zero is retained as
observed zero-valued evidence and is counted separately above. Optional-source
absence never removes a player from the official universe.

## Input source matrix

${markdownTable(
    ["Input", "Source snapshot(s)", "Situation", "Release A use", "Missing-data rule"],
    sourceMatrixRows,
  )}

The machine-readable manifest also records each raw field and normalization.
\`avgTOI\` and \`qocIndex\` are retained as provenance and usage context; neither
multiplies a per-rate Gravity mass after the Release A correction.

## Source snapshots

${markdownTable(
    ["Source", "Kind", "Rows", "Requests", "SHA-256"],
    sourceRows,
  )}

MoneyPuck data is credited to MoneyPuck.com. The tracked \`OtherData/\` files
provide the Natural Stat Trick current/prior aggregate baseline inputs. Those
files do not carry NHL IDs, so the builder emits a versioned exact-match
crosswalk. It uses Unicode NFC, case folding, whitespace normalization, explicit
position mapping, and explicit team-abbreviation mapping only. No fuzzy,
nickname, accent-removal, or player-name fallback joins are allowed.

## Coverage distribution

\`\`\`json
${JSON.stringify(manifest.coverageDistribution, null, 2)}
\`\`\`

## Exclusions and identity

\`\`\`json
${JSON.stringify({
    exclusionReasons: manifest.exclusionReasons,
    unresolvedCrosswalkRows: manifest.identity.unresolvedCrosswalkRows,
    outOfUniverseCrosswalkRows: manifest.identity.outOfUniverseCrosswalkRows,
    unresolvedQualifiedSourceJoins: manifest.identity.unresolvedQualifiedSourceJoins,
  }, null, 2)}
\`\`\`

The following source rows remain intentionally unresolved and are not used in
normalized inputs. Each has an exact-name candidate in the 2025-26 universe but
fails the explicit position match; the builder does not override that conflict.

${markdownTable(
    ["Source row", "Source name", "Source position", "Source team(s)", "Classification"],
    unresolvedIdentityRows,
  )}

## Completeness gates

${gates}

## Reproduction

\`\`\`bash
${GENERATION_COMMAND}
${OFFLINE_COMMAND}
\`\`\`

The second command performs no network requests and must reproduce the same
normalized population and SHA-256 fingerprint from the frozen raw cache.

## Storage and redistribution

The player-level normalized population and identity crosswalk are intentionally
gitignored. MoneyPuck explicitly permits its listed downloads for
non-commercial use with attribution, while NHL.com terms do not clearly permit
republishing an NHL-derived player database. Commit the builder, aggregate
manifest, and this report only. Store the two restricted artifacts and the raw
cache in private, versioned object storage keyed by their SHA-256 fingerprints;
deployment or CI should verify the committed manifest before calibration.

- Population SHA-256: \`${manifest.artifacts.populationSha256}\`
- Crosswalk SHA-256: \`${manifest.artifacts.crosswalkSha256}\`
- Source fingerprint: \`${manifest.artifacts.sourceFingerprint}\`
- Manifest payload SHA-256: \`${manifest.manifestPayloadSha256}\`
`;
}

async function main(): Promise<void> {
  const previousPopulation = fs.existsSync(POPULATION_PATH)
    ? fs.readFileSync(POPULATION_PATH, "utf8")
    : null;
  const previousCrosswalk = fs.existsSync(CROSSWALK_PATH)
    ? fs.readFileSync(CROSSWALK_PATH, "utf8")
    : null;

  const cacheDir = DEFAULT_CACHE_DIR;
  const nhlSkaters = await acquireNhlPages<NhlSkaterSummaryRow>(
    cacheDir,
    "nhl-skater-summary",
    NHL_SKATER_ENDPOINT,
    "playerId",
  );
  const nhlTeams = await acquireNhlPages<NhlTeamSummaryRow>(
    cacheDir,
    "nhl-team-summary",
    NHL_TEAM_ENDPOINT,
    "teamId",
  );
  const universe = buildOfficialUniverse(nhlSkaters.rows, nhlSkaters.total);

  const moneyPuckSeasons = await Promise.all(
    ["2022", "2023", "2024", MONEYPUCK_SEASON].map((season) =>
      acquireMoneyPuck(cacheDir, season)),
  );
  const moneyPuckBySeason = new Map(
    ["2022", "2023", "2024", MONEYPUCK_SEASON]
      .map((season, index) => [season, moneyPuckSeasons[index].players] as const),
  );
  const currentMoneyPuck = moneyPuckBySeason.get(MONEYPUCK_SEASON)!;

  const otherDataFiles = {
    nstCurrentSkaters: path.join(ROOT, "OtherData", "2025;26_skater_totals_all.csv"),
    nstPriorSkaters: path.join(ROOT, "OtherData", "2022;23;24;25_skater_totals_all.csv"),
    nstCurrentPairings: path.join(ROOT, "OtherData", "2025;26_defensive_pairings_all.csv"),
    nstPriorPairings: path.join(ROOT, "OtherData", "2022;23;24;25_defensive_pairings_all.csv"),
  };
  const otherDataBodies = Object.fromEntries(
    Object.entries(otherDataFiles).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
  ) as Record<keyof typeof otherDataFiles, string>;
  const currentNstSkaters = parseNstSkaters(otherDataBodies.nstCurrentSkaters, "current");
  const priorNstSkaters = parseNstSkaters(otherDataBodies.nstPriorSkaters, "prior");
  const currentNstPairings = parseNstPairings(otherDataBodies.nstCurrentPairings, "current");
  const priorNstPairings = parseNstPairings(otherDataBodies.nstPriorPairings, "prior");
  const crosswalk = buildExactCrosswalk(
    sourceCrosswalkRows(
      currentNstSkaters,
      priorNstSkaters,
      currentNstPairings,
      priorNstPairings,
    ),
    universe,
  );
  const nstBaselines = nstBaselinesByPlayerId(
    currentNstSkaters,
    priorNstSkaters,
    currentNstPairings,
    priorNstPairings,
    crosswalk,
  );

  const dps = deriveDps(universe, nhlTeams.rows);
  const edgeRecords = await mapWithConcurrency(universe, concurrency, async (player, index) => {
    if (index > 0 && index % 100 === 0) {
      console.log(`[gravity-calibration] EDGE ${index}/${universe.length}`);
    }
    const url = NHL_EDGE_TEMPLATE.replace("{playerId}", String(player.playerId));
    return fetchCached(
      path.join(cacheDir, "nhl-edge"),
      `nhl-edge-${player.playerId}`,
      url,
    );
  });
  const edgeById = new Map(
    universe.map((player, index) => [
      player.playerId,
      parseEdgeRecord(edgeRecords[index], player.playerId),
    ]),
  );

  const records: PopulationRecord[] = universe.map((player) => {
    const currentMp = currentMoneyPuck.get(player.playerId);
    const currentInputs = currentMp ? currentMoneyPuckInputs(currentMp) : null;
    const baselineSeasons = new Map<string, MoneyPuckPlayerSeason>();
    for (const [season, seasonPlayers] of moneyPuckBySeason) {
      const row = seasonPlayers.get(player.playerId);
      if (row) baselineSeasons.set(season, row);
    }
    const moneyPuckBaseline = moneyPuckBaselineInputs(baselineSeasons);
    const nstBaseline = nstBaselines.get(player.playerId) ?? null;
    const edge = edgeById.get(player.playerId)!;
    const dpsValue = dps.values.get(player.playerId) ?? null;
    const calculationGames = currentInputs?.games ?? player.gamesPlayed;

    return {
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      gamesPlayed: player.gamesPlayed,
      teamHistory: player.teamHistory,
      qualification: qualificationFor(player.gamesPlayed, player.position),
      inputs: {
        games: calculationGames,
        avgTOI: currentInputs?.avgTOI ?? player.timeOnIcePerGameSeconds / 60,
        qocIndex: calculateQocIndex(
          player.position,
          currentInputs?.iceTimeRankAverage ?? null,
          currentInputs?.dzPct ?? null,
        ),
        xgRelTM: currentInputs?.xgRelTM ?? null,
        baselineXgRel: moneyPuckBaseline?.baselineXgRel ?? null,
        pairDriverScore: nstBaseline?.pairDriverScore ?? null,
        assistsPace: currentInputs?.assistsPace
          ?? (player.assists / player.gamesPlayed) * 82,
        baselineIxg82: nstBaseline?.baselineIxg82 ?? null,
        goalsPace: currentInputs?.goalsPace
          ?? (player.goals / player.gamesPlayed) * 82,
        ppPtsPace82: moneyPuckBaseline?.ppPtsPace82 ?? null,
        edgeOzPct: edge.edgeOzPct,
        dzPct: currentInputs?.dzPct ?? null,
        edgeSpeedMaxMph: edge.edgeSpeedMaxMph,
        edgeBurstsOver20: edge.edgeBurstsOver20,
        xgaRelTM: currentInputs?.xgaRelTM ?? null,
        dps: dpsValue,
        pkTimeShare: moneyPuckBaseline?.pkTimeShare ?? null,
      },
      sourceJoins: {
        nhlOfficialUniverse: sourceJoin("present", null),
        moneyPuckCurrent: currentInputs
          ? sourceJoin("present", null)
          : sourceJoin("unresolved", currentMp ? "MONEYPUCK_CURRENT_INPUTS_INVALID" : "MONEYPUCK_CURRENT_ID_ABSENT"),
        moneyPuckBaseline: moneyPuckBaseline
          ? sourceJoin("present", null)
          : sourceJoin("legitimately_unavailable", "NO_10_GP_MONEYPUCK_BASELINE_SEASON"),
        nstBaseline: nstBaseline && (
          nstBaseline.baselineIxg82 !== null || nstBaseline.pairDriverScore !== null
        )
          ? sourceJoin("present", null)
          : sourceJoin("legitimately_unavailable", "NO_EXACT_QUALIFYING_NST_BASELINE"),
        nhlEdge: edge.join,
        nhlDerivedDps: dpsValue !== null
          ? sourceJoin("present", null)
          : sourceJoin("unresolved", dps.unresolved.get(player.playerId) ?? "DPS_DERIVATION_MISSING"),
      },
    };
  }).sort((a, b) => a.playerId - b.playerId);

  const sourceAudits: SourceAudit[] = [
    auditHttpSource(
      "nhl_official_skater_universe",
      `${NHL_SKATER_ENDPOINT} (seasonId=${NHL_SEASON_ID}, gameTypeId=2)`,
      nhlSkaters.records,
      nhlSkaters.rows.length,
    ),
    auditHttpSource(
      "nhl_team_summary",
      `${NHL_TEAM_ENDPOINT} (seasonId=${NHL_SEASON_ID}, gameTypeId=2)`,
      nhlTeams.records,
      nhlTeams.rows.length,
    ),
    ...["2022", "2023", "2024", MONEYPUCK_SEASON].map((season, index) =>
      auditHttpSource(
        `moneypuck_skater_summary_${season}`,
        MONEYPUCK_TEMPLATE.replace("{season}", season),
        [moneyPuckSeasons[index].record],
        moneyPuckSeasons[index].players.size,
      )),
    auditHttpSource(
      "nhl_edge_skater_detail",
      NHL_EDGE_TEMPLATE,
      edgeRecords,
      edgeRecords.filter((record) => record.status === 200).length,
    ),
    ...Object.entries(otherDataFiles).map(([key, file]) =>
      auditTrackedSource(
        key,
        path.relative(ROOT, file),
        otherDataBodies[key as keyof typeof otherDataBodies],
        countCsvRows(otherDataBodies[key as keyof typeof otherDataBodies]),
      )),
  ].sort((a, b) => a.id.localeCompare(b.id));

  const sourceFingerprint = sha256(stableStringify(
    sourceAudits.map((source) => ({
      id: source.id,
      identifier: source.identifier,
      rowCount: source.rowCount,
      sha256: source.sha256,
    })),
  ));
  const retrievalTimes = sourceAudits
    .map((source) => source.retrievedAt)
    .filter((value): value is string => value !== null)
    .sort();
  const retrievedAt = retrievalTimes.length > 0
    ? retrievalTimes[retrievalTimes.length - 1]
    : undefined;
  if (!retrievedAt) throw new Error("No recorded retrieval timestamp");

  const population = {
    schemaVersion: POPULATION_SCHEMA_VERSION,
    modelRelease: MODEL_RELEASE,
    season: SEASON_LABEL,
    nhlSeasonId: NHL_SEASON_ID,
    generatedAt: retrievedAt,
    sourceFingerprint,
    eligibility: {
      gravityCalculationMinimumGames: GRAVITY_CALCULATION_MINIMUM_GAMES,
      publicTierMinimumGames: PUBLIC_TIER_MINIMUM_GAMES,
    },
    records,
  };
  const populationJson = stableStringify(population);
  const crosswalkJson = stableStringify(crosswalk);
  const populationSha256 = sha256(populationJson);
  const crosswalkSha256 = sha256(crosswalkJson);
  const cachedRerunReproducible = cachedRerunMatches(
    previousPopulation,
    previousCrosswalk,
    populationJson,
    crosswalkJson,
  );

  const structuralFailures = validatePopulation(records, nhlSkaters.total);
  const qualified = records.filter((record) => record.qualification.publicTierEligible);
  const unresolvedQualifiedSourceJoins = qualified.reduce(
    (sum, record) => sum + Object.values(record.sourceJoins)
      .filter((join) => join.status === "unresolved").length,
    0,
  );
  const duplicatePlayerIds = records.length - new Set(records.map((record) => record.playerId)).size;
  const exclusionReasons = countBy(
    records.filter((record) => !record.qualification.publicTierEligible),
    (record) => record.qualification.reasonCode ?? "UNACCOUNTED",
  );
  const crosswalkCounts = countBy(crosswalk.entries, (entry) => entry.status);
  const inputKeys = Object.keys(records[0]?.inputs ?? {}).sort();
  const sourceMatrixInputKeys = GRAVITY_INPUT_SOURCE_MATRIX
    .map((entry) => entry.input)
    .sort();
  const knownSourceIds = new Set(sourceAudits.map((source) => source.id));
  const manifestBase = {
    schemaVersion: "gravity-v3-release-a-population-manifest-v1",
    modelRelease: MODEL_RELEASE,
    season: SEASON_LABEL,
    nhlSeasonId: NHL_SEASON_ID,
    generatedAt: retrievedAt,
    generationCommand: GENERATION_COMMAND,
    offlineVerificationCommand: OFFLINE_COMMAND,
    eligibility: {
      gravityCalculationMinimumGames: GRAVITY_CALCULATION_MINIMUM_GAMES,
      publicTierMinimumGames: PUBLIC_TIER_MINIMUM_GAMES,
    },
    population: {
      officialUniverse: records.length,
      gravityCalculationEligible: records.filter((record) =>
        record.qualification.gravityCalculationEligible).length,
      provisionalNoPublicTier: records.filter((record) =>
        record.qualification.status === "PROVISIONAL_NO_PUBLIC_TIER").length,
      publicTierEligible: qualified.length,
      gravityIneligible: records.filter((record) =>
        record.qualification.status === "GRAVITY_INELIGIBLE").length,
      qualifiedForwards: qualified.filter((record) => record.position !== "D").length,
      qualifiedDefensemen: qualified.filter((record) => record.position === "D").length,
      duplicatePlayerIds,
    },
    exclusionReasons,
    inputCoverage: {
      officialUniverse: inputCoverage(records, false),
      qualified: inputCoverage(records, true),
    },
    inputSourceMatrix: GRAVITY_INPUT_SOURCE_MATRIX,
    sourceJoinCoverage: sourceJoinCoverage(records),
    coverageDistribution: coverageSummary(records),
    identity: {
      crosswalkSchemaVersion: crosswalk.schemaVersion,
      matchedCrosswalkRows: crosswalkCounts.matched ?? 0,
      unresolvedCrosswalkRows: crosswalkCounts.unresolved ?? 0,
      outOfUniverseCrosswalkRows: crosswalkCounts.out_of_universe ?? 0,
      unresolvedQualifiedSourceJoins,
      fuzzyMatching: false,
      unresolvedCrosswalkEntries: crosswalk.entries
        .filter((entry) => entry.status === "unresolved")
        .map((entry) => ({
          sourceKey: entry.sourceKey,
          sourceName: entry.sourceName,
          sourcePosition: entry.sourcePosition,
          sourceTeams: entry.sourceTeams,
          method: entry.method,
        })),
    },
    sources: sourceAudits,
    artifacts: {
      populationPath: path.relative(ROOT, POPULATION_PATH),
      populationSha256,
      populationBytes: Buffer.byteLength(populationJson),
      populationTracked: false,
      crosswalkPath: path.relative(ROOT, CROSSWALK_PATH),
      crosswalkSha256,
      crosswalkBytes: Buffer.byteLength(crosswalkJson),
      crosswalkTracked: false,
      sourceFingerprint,
      durableStoragePlan:
        "Private versioned object storage keyed by SHA-256; verify against this manifest before calibration.",
    },
    completenessGates: {
      officialUniverseRepresented100Pct: records.length === nhlSkaters.total,
      qualifiedIdentityPositionGamesComplete: qualified.every((record) =>
        Number.isInteger(record.playerId)
        && record.playerId > 0
        && record.position !== null
        && Number.isInteger(record.gamesPlayed)),
      duplicateNhlIdsZero: duplicatePlayerIds === 0,
      everySourceJoinClassified: records.every((record) =>
        Object.values(record.sourceJoins).every((join) =>
          ["present", "legitimately_unavailable", "unresolved"].includes(join.status))),
      noOptionalSourceDropsPlayers: records.length === nhlSkaters.total,
      allExclusionsMachineReadable: records.every((record) =>
        record.qualification.publicTierEligible || record.qualification.reasonCode !== null),
      deterministicPlayerIdOrdering: records.every((record, index) =>
        index === 0 || records[index - 1].playerId < record.playerId),
      everyComputeGravityInputExplicit: records.every((record) =>
        hasExplicitGravityInputs(record.inputs)),
      inputSourceMatrixCoversEveryInput:
        new Set(sourceMatrixInputKeys).size === sourceMatrixInputKeys.length
        && sourceMatrixInputKeys.join("\0") === inputKeys.join("\0"),
      inputSourceMatrixReferencesKnownSources: GRAVITY_INPUT_SOURCE_MATRIX.every(
        (entry) => entry.sourceIds.every((sourceId) => knownSourceIds.has(sourceId)),
      ),
      normalizedSnapshotFingerprintMatches: sha256(populationJson) === populationSha256,
      cachedRerunReproducible,
      structuralValidationPassed: structuralFailures.length === 0,
    },
    structuralFailures,
  };
  const manifestPayloadSha256 = sha256(stableStringify(manifestBase));
  const manifest = { ...manifestBase, manifestPayloadSha256 };
  const manifestJson = stableStringify(manifest);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(POPULATION_PATH, populationJson, "utf8");
  fs.writeFileSync(CROSSWALK_PATH, crosswalkJson, "utf8");
  fs.writeFileSync(MANIFEST_PATH, manifestJson, "utf8");
  fs.writeFileSync(REPORT_PATH, buildReport(manifest), "utf8");

  const persistedPopulationSha256 = sha256(fs.readFileSync(POPULATION_PATH));
  if (persistedPopulationSha256 !== populationSha256) {
    throw new Error("Persisted population fingerprint mismatch");
  }
  if (structuralFailures.length > 0) {
    throw new Error(`Population structural gates failed: ${structuralFailures.join(", ")}`);
  }

  console.log(JSON.stringify({
    mode: offline ? "offline-cache-only" : "cache-or-network",
    officialUniverse: records.length,
    gravityCalculationEligible: manifest.population.gravityCalculationEligible,
    publicTierEligible: manifest.population.publicTierEligible,
    qualifiedForwards: manifest.population.qualifiedForwards,
    qualifiedDefensemen: manifest.population.qualifiedDefensemen,
    unresolvedQualifiedSourceJoins,
    populationSha256,
    crosswalkSha256,
    manifestPayloadSha256,
    cachedRerunReproducible,
    populationPath: path.relative(ROOT, POPULATION_PATH),
    manifestPath: path.relative(ROOT, MANIFEST_PATH),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
