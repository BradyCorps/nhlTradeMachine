// ── Gravity v4 — stage 1 producer: `build-stints` ────────────────
//
// The coverage spike answers "is the reconstruction trustworthy?" and writes
// only metrics. This writes the DATASET: one row per constant-lineup stint,
// carrying the lineups, strength, score, zone start and on-ice shot events that
// `build-possession-states` and the OZ/NZ/DZ fits condition on.
//
//   npx tsx scripts/gravity-v4/build-stints.ts --games 50
//   npx tsx scripts/gravity-v4/build-stints.ts --games 1312            # full slate
//   npx tsx scripts/gravity-v4/build-stints.ts --games 50 --offline    # from cache
//
// Flags: --games N · --season 20252026 · --offline · --gap MS · --even5v5
//
// Output (both gitignored — this is player-level derived data):
//   data/gravity-v4/stints-<season>.ndjson.gz
//   data/gravity-v4/stints-<season>.manifest.json
//
// The manifest carries a schema version, the settings, per-source coverage and
// the sha256 of the UNCOMPRESSED NDJSON, so a rerun on the same inputs is
// verifiably identical without depending on gzip framing.

import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
import {
  parseShifts, buildStints, buildCoverageReport, buildStintRows,
  type RawShiftRow, type CoverageReport, type EmitReport,
} from "./core";
import {
  makeFetcher, collectGameIds, rosterFromPbp, eventsFromPbp, shiftsUrl, pbpUrl,
} from "./nhl-source";

const SCHEMA_VERSION = 1;

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "gravity-v4");

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name: string) => args.includes(`--${name}`);

const GAME_COUNT = Number(flag("games", "50"));
const SEASON = flag("season", "20252026")!;
const OFFLINE = has("offline");
const EVEN_5V5_ONLY = has("even5v5");

const fetchCached = makeFetcher({ offline: OFFLINE, apiWebGapMs: Number(flag("gap", "450")) });

/** Gzip stream with backpressure honoured, hashing the uncompressed bytes. */
function openSink(file: string) {
  const gzip = zlib.createGzip({ level: 9 });
  const out = fs.createWriteStream(file);
  const hash = crypto.createHash("sha256");
  gzip.pipe(out);
  let bytes = 0;

  return {
    async write(line: string) {
      hash.update(line);
      bytes += Buffer.byteLength(line);
      if (!gzip.write(line)) await new Promise(r => gzip.once("drain", r));
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        out.on("finish", () => resolve());
        out.on("error", reject);
        gzip.on("error", reject);
        gzip.end();
      });
      return { sha256: hash.digest("hex"), uncompressedBytes: bytes };
    },
  };
}

async function main() {
  console.log(`Gravity v4 build-stints — season ${SEASON}, target ${GAME_COUNT} games` +
    `${OFFLINE ? " (offline)" : ""}${EVEN_5V5_ONLY ? " [5v5 only]" : ""}`);

  const gameIds = await collectGameIds(fetchCached, SEASON, GAME_COUNT);
  console.log(`collected ${gameIds.length} final regular-season game ids\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dataFile = path.join(OUT_DIR, `stints-${SEASON}.ndjson.gz`);
  const sink = openSink(dataFile);

  const coverage: CoverageReport[] = [];
  const emits: EmitReport[] = [];
  const failures: { gameId: number; reason: string }[] = [];
  let rowsWritten = 0, rowsSkipped = 0;

  for (const [i, gameId] of gameIds.entries()) {
    try {
      // Sequential, not concurrent — two simultaneous requests per game is what
      // trips api-web's rate limiter.
      const shiftPayload = await fetchCached(`shifts-${gameId}`, shiftsUrl(gameId));
      const pbp = await fetchCached(`pbp-${gameId}`, pbpUrl(gameId));
      const rawRows: RawShiftRow[] = shiftPayload?.data ?? [];
      const { roster, homeTeamId, awayTeamId } = rosterFromPbp(pbp);
      if (!homeTeamId || !awayTeamId || roster.length === 0) {
        throw new Error("missing roster/team ids in pbp");
      }

      const known = new Set(roster.map(r => r.playerId));
      const { shifts, report } = parseShifts(rawRows, known);
      const stints = buildStints(shifts, roster, homeTeamId);
      const events = eventsFromPbp(pbp);

      coverage.push(buildCoverageReport({ gameId, parse: report, shifts, stints, events }));

      const { rows, report: emit } = buildStintRows({
        season: SEASON, gameId, homeTeamId, awayTeamId, stints, events,
      });
      emits.push(emit);

      for (const row of rows) {
        if (EVEN_5V5_ONLY && !row.isEven5v5) { rowsSkipped++; continue; }
        await sink.write(`${JSON.stringify(row)}\n`);
        rowsWritten++;
      }
    } catch (e) {
      failures.push({ gameId, reason: e instanceof Error ? e.message : String(e) });
    }
    if ((i + 1) % 25 === 0 || i + 1 === gameIds.length) {
      console.log(`  ${i + 1}/${gameIds.length} games · ${rowsWritten} rows`);
    }
  }

  const { sha256, uncompressedBytes } = await sink.close();

  // ── Aggregate ─────────────────────────────────────────────────
  const sumC = (f: (r: CoverageReport) => number) => coverage.reduce((s, r) => s + f(r), 0);
  const sumE = (f: (r: EmitReport) => number) => emits.reduce((s, r) => s + f(r), 0);

  const attempted = gameIds.length;
  const ok = coverage.length;
  const shiftRows = sumC(r => r.parse.shiftRows);
  const unknown = sumC(r => r.parse.unknownPlayerRows);
  const stintTotal = Math.max(1, sumC(r => r.stintCount));
  const rosterJoinPct = shiftRows ? (100 * (shiftRows - unknown)) / shiftRows : null;
  const attrChecked = sumE(r => r.strengthChecked);
  const attrTrailing = sumE(r => r.strengthAgreedTrailing);
  const attrLeading = sumE(r => r.strengthAgreedLeading);
  const pct = (n: number, d: number) => (d ? (100 * n) / d : null);

  console.log("\n── DATASET ────────────────────────────────────────");
  console.log(`games emitted              ${ok}/${attempted}`);
  console.log(`stint rows written         ${rowsWritten}${rowsSkipped ? `  (${rowsSkipped} non-5v5 skipped)` : ""}`);
  console.log(`uncompressed size          ${(uncompressedBytes / 1e6).toFixed(1)} MB`);
  console.log(`on-disk (gzip)             ${(fs.statSync(dataFile).size / 1e6).toFixed(1)} MB`);
  console.log(`shots attributed           ${sumE(r => r.shotsAttributed)}` +
    `  (${sumE(r => r.shotsWithoutShooter)} without a shooter id)`);
  console.log(`events outside any stint   ${sumE(r => r.unattributedEvents)}`);

  console.log("\n── EVENT ATTRIBUTION ──────────────────────────────");
  console.log("An on-ice event belongs to the lineup that played up to that second,");
  console.log("not the one that came over the boards after it. Agreement with the");
  console.log("game's own situationCode, over the same events:");
  console.log(`  trailing (used)          ${pct(attrTrailing, attrChecked)?.toFixed(2) ?? "—"}%  (${attrTrailing}/${attrChecked})`);
  console.log(`  leading  (naive)         ${pct(attrLeading, attrChecked)?.toFixed(2) ?? "—"}%  (${attrLeading}/${attrChecked})`);

  // ── Reconstruction gates (same bar the coverage spike sets) ────
  const tolerant = sumC(r => r.strengthAgreedBoundaryTolerant);
  const checked = sumC(r => r.strengthChecked);
  const gates = [
    ["games emitted ≥95%", ok / Math.max(1, attempted) >= 0.95],
    ["zero tiling gap", sumC(r => r.tilingGapSec) === 0],
    ["impossible skater counts ≤0.1% of stints",
      (100 * sumC(r => r.invalidSkaterCountStints)) / stintTotal <= 0.1],
    ["strength agreement (boundary-tolerant) ≥99.5%",
      checked > 0 && (100 * tolerant) / checked >= 99.5],
    ["roster join ≥99.9%", rosterJoinPct != null && rosterJoinPct >= 99.9],
    ["every emitted row carries a shooter-resolvable shot set",
      sumE(r => r.shotsWithoutShooter) / Math.max(1, sumE(r => r.shotsAttributed)) <= 0.01],
  ] as const;

  console.log("\n── GATES ──────────────────────────────────────────");
  let allPass = true;
  for (const [name, pass] of gates) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) allPass = false;
  }

  if (failures.length) {
    console.log(`\nfailures (${failures.length}):`);
    for (const f of failures.slice(0, 10)) console.log(`  ${f.gameId}: ${f.reason}`);
  }

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    stage: "build-stints",
    generatedAt: new Date().toISOString(),
    season: SEASON,
    settings: { gamesRequested: GAME_COUNT, even5v5Only: EVEN_5V5_ONLY, offline: OFFLINE },
    data: {
      file: path.basename(dataFile),
      format: "ndjson.gz",
      rows: rowsWritten,
      rowsSkipped,
      uncompressedBytes,
      sha256Uncompressed: sha256,
    },
    coverage: {
      gamesAttempted: attempted,
      gamesEmitted: ok,
      shiftRows,
      duplicateRows: sumC(r => r.parse.duplicateRows),
      invalidRows: sumC(r => r.parse.invalidRows),
      unknownPlayerRows: unknown,
      rosterJoinPct,
      stints: sumC(r => r.stintCount),
      tilingGapSec: sumC(r => r.tilingGapSec),
      invalidSkaterCountStints: sumC(r => r.invalidSkaterCountStints),
      strengthAgreementPct: pct(sumC(r => r.strengthAgreed), checked),
      strengthAgreementBoundaryTolerantPct: pct(tolerant, checked),
      shotsAttributed: sumE(r => r.shotsAttributed),
      shotsWithoutShooter: sumE(r => r.shotsWithoutShooter),
      unattributedEvents: sumE(r => r.unattributedEvents),
      attributionAgreementTrailingPct: pct(attrTrailing, attrChecked),
      attributionAgreementLeadingPct: pct(attrLeading, attrChecked),
    },
    gatesPassed: allPass,
    failures,
  };
  const manifestFile = path.join(OUT_DIR, `stints-${SEASON}.manifest.json`);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  console.log(`\ndata     → ${path.relative(ROOT, dataFile)}`);
  console.log(`manifest → ${path.relative(ROOT, manifestFile)}`);
  console.log(`sha256(uncompressed) ${sha256.slice(0, 16)}…`);

  if (!allPass) {
    console.log("\nGATES FAILED — the dataset was written but must not be fitted on.");
    process.exit(1);
  }
  console.log("\nDataset is clean. Next stage: build-possession-states.");
}

main().catch(e => { console.error(e); process.exit(1); });
