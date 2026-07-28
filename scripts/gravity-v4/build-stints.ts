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
// Flags: --games N · --season 20252026 · --offline · --gap MS · --shiftgap MS ·
//        --even5v5 · --refresh-absent (re-request games previously found absent)
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
  validShiftPayload, validPbpPayload, PayloadAbsentError,
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
  refreshAbsent: has("refresh-absent"),
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
  const perGame: { gameId: number; stints: number; shiftRows: number; unknownRows: number;
    foreignRows: number }[] = [];
  /** Games the NHL simply has no shift chart for — expected, not a failure. */
  const noShiftChart: number[] = [];
  /** teamAbbrev -> { played, covered } across every attempted game. */
  const teamCoverage = new Map<string, { played: number; covered: number }>();
  let rowsWritten = 0, rowsSkipped = 0, totalEvents = 0;
  const startedAt = Date.now();

  const noteTeams = (abbrevs: (string | undefined)[], covered: boolean) => {
    for (const a of abbrevs) {
      if (!a) continue;
      const e = teamCoverage.get(a) ?? { played: 0, covered: 0 };
      e.played++;
      if (covered) e.covered++;
      teamCoverage.set(a, e);
    }
  };

  for (const [i, gameId] of gameIds.entries()) {
    try {
      // Play-by-play FIRST. It is available for every game, so fetching it up
      // front means a game with no shift chart can still be attributed to the
      // two teams that played it — without that, missing games are invisible to
      // the per-team coverage check and bias cannot be measured.
      const pbp = await fetchCached(`pbp-${gameId}`, pbpUrl(gameId), validPbpPayload);
      const teamAbbrevs = [pbp?.homeTeam?.abbrev, pbp?.awayTeam?.abbrev];

      // Sequential, not concurrent — two simultaneous requests per game is what
      // trips api-web's rate limiter.
      let shiftPayload: any;
      try {
        shiftPayload = await fetchCached(`shifts-${gameId}`, shiftsUrl(gameId), validShiftPayload);
      } catch (e) {
        // The endpoint answers 200 with {"data":[],"total":0} for whole blocks
        // of the schedule. That is an absence in the source, not an error here:
        // it is recorded once, negatively cached, and never retried.
        if (e instanceof PayloadAbsentError) {
          noShiftChart.push(gameId);
          noteTeams(teamAbbrevs, false);
          continue;
        }
        throw e;
      }

      const rawRows: RawShiftRow[] = shiftPayload?.data ?? [];
      const { roster, homeTeamId, awayTeamId } = rosterFromPbp(pbp);
      noteTeams(teamAbbrevs, true);

      const known = new Set(roster.map(r => r.playerId));
      const { shifts, report } = parseShifts(rawRows, known, new Set([homeTeamId, awayTeamId]));
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
        foreignRows: report.foreignTeamRows,
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
    if ((i + 1) % 50 === 0 || i + 1 === gameIds.length) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = (i + 1) / Math.max(1, elapsed);
      const etaMin = (gameIds.length - (i + 1)) / Math.max(0.001, rate) / 60;
      console.log(`  ${i + 1}/${gameIds.length} games · ${rowsWritten} rows · ` +
        `${noShiftChart.length} no shift chart · ${failures.length} failed · ` +
        `ETA ${etaMin.toFixed(0)}m`);
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

  // ── Source coverage ───────────────────────────────────────────
  // The NHL has no shift chart for whole blocks of the schedule, so the
  // question is not "did I get every game?" but "is what I got representative?".
  // Whole-calendar-window gaps hit all 32 clubs alike; a gap concentrated on a
  // few teams would bias every player effect fitted from it.
  const teamRows = [...teamCoverage.entries()]
    .map(([abbrev, e]) => ({ abbrev, ...e, pct: (100 * e.covered) / Math.max(1, e.played) }))
    .sort((a, b) => a.pct - b.pct);
  const teamPcts = teamRows.map(t => t.pct).sort((a, b) => a - b);
  const medianTeamPct = teamPcts.length
    ? teamPcts[Math.floor(teamPcts.length / 2)] : 0;
  const minTeam = teamRows[0];
  const maxTeam = teamRows[teamRows.length - 1];
  const minTeamGames = teamRows.length ? Math.min(...teamRows.map(t => t.covered)) : 0;

  if (noShiftChart.length) {
    console.log("\n── SOURCE COVERAGE ────────────────────────────────");
    console.log(`games with no shift chart  ${noShiftChart.length}/${attempted}` +
      `  (${pct(noShiftChart.length, attempted)?.toFixed(1)}%)`);
    console.log(`  → the NHL returns 200 with {"data":[],"total":0} for these.`);
    console.log(`    Not retryable; they are absent at the source.`);
    console.log(`team coverage              median ${medianTeamPct.toFixed(1)}%` +
      `  ·  worst ${minTeam?.abbrev} ${minTeam?.pct.toFixed(1)}% (${minTeam?.covered}/${minTeam?.played})` +
      `  ·  best ${maxTeam?.abbrev} ${maxTeam?.pct.toFixed(1)}%`);
    console.log(`  spread                   ${(maxTeam?.pct - minTeam?.pct).toFixed(1)} points across ${teamRows.length} teams`);
    console.log("  five thinnest teams:");
    for (const t of teamRows.slice(0, 5)) {
      console.log(`    ${t.abbrev.padEnd(4)} ${String(t.covered).padStart(3)}/${String(t.played).padEnd(3)} ${t.pct.toFixed(1)}%`);
    }
  }

  console.log("\n── DATASET ────────────────────────────────────────");
  console.log(`games emitted              ${ok}/${attempted - noShiftChart.length}` +
    ` reconstructable  (${attempted} on the schedule)`);
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
  // ── Shift charts contaminated with another game's rows ────────
  // Filtered out, but reported loudly: this is corruption in the source, and
  // buildStints would otherwise have placed those skaters on the away team.
  const contaminated = perGame.filter(g => g.foreignRows > 0)
    .sort((a, b) => b.foreignRows - a.foreignRows);
  if (contaminated.length) {
    const total = contaminated.reduce((s, g) => s + g.foreignRows, 0);
    console.log("\n── FOREIGN-GAME ROWS (filtered) ───────────────────");
    console.log(`${total} shift rows across ${contaminated.length} games belonged to a team that`);
    console.log("did not play in that game — the NHL's shift chart carried another");
    console.log("game's rows. Dropped before reconstruction.");
    for (const g of contaminated.slice(0, 10)) {
      console.log(`  ${g.gameId}  ${String(g.foreignRows).padStart(4)} foreign dropped, ${g.shiftRows} kept for this game`);
    }
  }

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
  const reconstructable = Math.max(1, attempted - noShiftChart.length);
  const gates = [
    // "Emitted" means the game produced stints, measured against the games that
    // HAVE a shift chart. Counting "no exception thrown" against the full
    // schedule let ~500 sourceless games pass a 1312-game run as a clean 100%.
    ["≥95% of games with a shift chart reconstructed", ok / reconstructable >= 0.95],
    // Coverage is about representativeness, not completeness. A season-long fit
    // does not need every game; it needs enough per team, evenly spread.
    ["every team has ≥30 covered games", minTeamGames >= 30],
    ["no team below 70% of the median team's coverage",
      teamRows.length === 0 || minTeam.pct >= 0.7 * medianTeamPct],
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
      // The sampling frame the fit is actually drawing from. Stage 2 should read
      // this rather than assuming a full season.
      gamesWithoutShiftChart: noShiftChart.length,
      noShiftChartGameIds: noShiftChart,
      coveredGameIds: perGame.map(g => g.gameId),
      teamCoverage: teamRows,
      medianTeamCoveragePct: medianTeamPct,
      shiftRows,
      duplicateRows: sumC(r => r.parse.duplicateRows),
      invalidRows: sumC(r => r.parse.invalidRows),
      unknownPlayerRows: unknown,
      foreignTeamRows: sumC(r => r.parse.foreignTeamRows),
      contaminatedGames: contaminated.map(g => ({ gameId: g.gameId, foreignRows: g.foreignRows })),
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
