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
  validShiftPayload, validPbpPayload,
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

const fetchCached = makeFetcher({
  offline: OFFLINE,
  apiWebGapMs: Number(flag("gap", "450")),
  apiGapMs: Number(flag("shiftgap", "400")),
});

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
  const perGame: { gameId: number; stints: number; shiftRows: number; unknownRows: number }[] = [];
  let rowsWritten = 0, rowsSkipped = 0, totalEvents = 0;
  const startedAt = Date.now();

  for (const [i, gameId] of gameIds.entries()) {
    try {
      // Sequential, not concurrent — two simultaneous requests per game is what
      // trips api-web's rate limiter. Both payloads are content-validated, so a
      // throttled empty 200 is retried rather than cached as a silent hole.
      const shiftPayload = await fetchCached(`shifts-${gameId}`, shiftsUrl(gameId), validShiftPayload);
      const pbp = await fetchCached(`pbp-${gameId}`, pbpUrl(gameId), validPbpPayload);
      const rawRows: RawShiftRow[] = shiftPayload?.data ?? [];
      const { roster, homeTeamId, awayTeamId } = rosterFromPbp(pbp);

      const known = new Set(roster.map(r => r.playerId));
      const { shifts, report } = parseShifts(rawRows, known);
      const stints = buildStints(shifts, roster, homeTeamId);
      const events = eventsFromPbp(pbp);
      totalEvents += events.length;

      // A game that reconstructs to nothing is a failure, not a quiet zero.
      if (stints.length === 0) {
        throw new Error(`no stints reconstructed from ${report.shiftRows} shift rows ` +
          `(${report.unknownPlayerRows} off-roster)`);
      }

      coverage.push(buildCoverageReport({ gameId, parse: report, shifts, stints, events }));
      perGame.push({
        gameId, stints: stints.length,
        shiftRows: report.shiftRows, unknownRows: report.unknownPlayerRows,
      });

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
      const reason = e instanceof Error ? e.message : String(e);
      failures.push({ gameId, reason });
      // Print immediately. A silent 25-game progress interval is what made a
      // run full of failing games look frozen rather than merely slow.
      console.log(`  ! ${gameId}  ${reason.replace(/ for https?:\/\/\S+/, "")}`);
    }
    if ((i + 1) % 10 === 0 || i + 1 === gameIds.length) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = (i + 1) / Math.max(1, elapsed);
      const etaMin = (gameIds.length - (i + 1)) / Math.max(0.001, rate) / 60;
      console.log(`  ${i + 1}/${gameIds.length} games · ${rowsWritten} rows · ` +
        `${failures.length} failed · ETA ${etaMin.toFixed(0)}m`);
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

  const unattributed = sumE(r => r.unattributedEvents);

  console.log("\n── DATASET ────────────────────────────────────────");
  console.log(`games emitted              ${ok}/${attempted}`);
  console.log(`stint rows written         ${rowsWritten}${rowsSkipped ? `  (${rowsSkipped} non-5v5 skipped)` : ""}`);
  console.log(`rows per emitted game      ${ok ? (rowsWritten / ok).toFixed(0) : "—"}`);
  console.log(`uncompressed size          ${(uncompressedBytes / 1e6).toFixed(1)} MB`);
  console.log(`on-disk (gzip)             ${(fs.statSync(dataFile).size / 1e6).toFixed(1)} MB`);
  console.log(`shots attributed           ${sumE(r => r.shotsAttributed)}` +
    `  (${sumE(r => r.shotsWithoutShooter)} without a shooter id)`);
  console.log(`events outside any stint   ${unattributed}` +
    `  (${pct(unattributed, totalEvents)?.toFixed(2) ?? "—"}% of ${totalEvents})`);

  console.log("\n── EVENT ATTRIBUTION ──────────────────────────────");
  console.log("An on-ice event belongs to the lineup that played up to that second,");
  console.log("not the one that came over the boards after it. Agreement with the");
  console.log("game's own situationCode, over the same events:");
  console.log(`  trailing (used)          ${pct(attrTrailing, attrChecked)?.toFixed(2) ?? "—"}%  (${attrTrailing}/${attrChecked})`);
  console.log(`  leading  (naive)         ${pct(attrLeading, attrChecked)?.toFixed(2) ?? "—"}%  (${attrLeading}/${attrChecked})`);

  // ── Where the roster join is losing rows ───────────────────────
  // Aggregate percentages hide a handful of catastrophic games behind hundreds
  // of clean ones, so name the offenders rather than just failing the gate.
  const offenders = perGame
    .filter(g => g.unknownRows > 0)
    .sort((a, b) => b.unknownRows - a.unknownRows);
  if (offenders.length) {
    const lost = offenders.reduce((s, g) => s + g.unknownRows, 0);
    console.log("\n── ROSTER JOIN MISSES ─────────────────────────────");
    console.log(`${lost} shift rows across ${offenders.length} games did not resolve to a`);
    console.log("player on that game's play-by-play roster. Worst games:");
    for (const g of offenders.slice(0, 10)) {
      console.log(`  ${g.gameId}  ${String(g.unknownRows).padStart(4)} of ${g.shiftRows} rows` +
        `  (${((100 * g.unknownRows) / Math.max(1, g.shiftRows)).toFixed(1)}%)`);
    }
  }

  // ── Reconstruction gates (same bar the coverage spike sets) ────
  const tolerant = sumC(r => r.strengthAgreedBoundaryTolerant);
  const checked = sumC(r => r.strengthChecked);
  const gates = [
    // "Emitted" means the game produced stints. Counting "no exception thrown"
    // instead let ~500 empty games pass a 1312-game run as a clean 100%.
    ["games emitted ≥95%", ok / Math.max(1, attempted) >= 0.95],
    ["zero tiling gap", sumC(r => r.tilingGapSec) === 0],
    ["impossible skater counts ≤0.1% of stints",
      (100 * sumC(r => r.invalidSkaterCountStints)) / stintTotal <= 0.1],
    ["strength agreement (boundary-tolerant) ≥99.5%",
      checked > 0 && (100 * tolerant) / checked >= 99.5],
    ["roster join ≥99.9%", rosterJoinPct != null && rosterJoinPct >= 99.9],
    ["every emitted row carries a shooter-resolvable shot set",
      sumE(r => r.shotsWithoutShooter) / Math.max(1, sumE(r => r.shotsAttributed)) <= 0.01],
    // Independent of the game count: if whole games are missing their stints,
    // their events have nowhere to land and this share climbs immediately.
    ["events landing in a stint ≥97%",
      totalEvents > 0 && (100 * (totalEvents - unattributed)) / totalEvents >= 97],
  ] as const;

  console.log("\n── GATES ──────────────────────────────────────────");
  let allPass = true;
  for (const [name, pass] of gates) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) allPass = false;
  }

  if (failures.length) {
    // Hundreds of identically-caused failures are one problem, not hundreds, so
    // lead with the shape and keep a few ids for reproduction.
    const byReason = new Map<string, number[]>();
    for (const f of failures) {
      const family = f.reason.replace(/\d{6,}/g, "…").replace(/\b\d+\b/g, "N");
      const list = byReason.get(family);
      if (list) list.push(f.gameId); else byReason.set(family, [f.gameId]);
    }
    console.log(`\n── FAILURES (${failures.length} of ${attempted} games) ─────────────`);
    for (const [family, ids] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${String(ids.length).padStart(4)} ×  ${family}`);
      console.log(`         e.g. ${ids.slice(0, 4).join(", ")}`);
    }
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
      totalEvents,
      unattributedEvents: unattributed,
      rosterJoinOffenders: offenders.slice(0, 25),
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
