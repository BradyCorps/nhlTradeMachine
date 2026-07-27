// ── Gravity v4 — coverage spike ──────────────────────────────────
//
// Pulls shift charts + play-by-play for N games, reconstructs constant-lineup
// stints, and reports whether the reconstruction is trustworthy enough to build
// the fitted model on. Run this BEFORE any league-wide backfill.
//
//   npx tsx scripts/gravity-v4/coverage-spike.ts --games 50
//   npx tsx scripts/gravity-v4/coverage-spike.ts --games 50 --offline
//   npx tsx scripts/gravity-v4/coverage-spike.ts --team ANA --lines path/to/ANA_FW.csv
//
// Responses are cached to .gravity-v4-cache/ so reruns are deterministic and
// offline. Raw responses and derived player-level output are NOT committed.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  parseShifts, buildStints, buildCoverageReport, forwardCombinationToi,
  parseLineLabel, validationNameKey, formatSeconds, parseClock,
  type RawShiftRow, type RosterSpot, type CoverageReport, type PositionCode,
} from "./core";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, ".gravity-v4-cache");
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
const TEAM = flag("team");
const LINES_CSV = flag("lines");

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchCached(key: string, url: string): Promise<any> {
  const safe = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const body = path.join(CACHE_DIR, `${safe}.json`);
  if (fs.existsSync(body)) return JSON.parse(fs.readFileSync(body, "utf8"));
  if (OFFLINE) throw new Error(`offline cache miss: ${key}`);

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20_000);
      let res: Response;
      try { res = await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(timer); }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await wait(400 * 2 ** attempt); continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      fs.writeFileSync(body, text);
      await wait(120); // be polite to the NHL API
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await wait(400 * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const scheduleUrl = (date: string) => `https://api-web.nhle.com/v1/schedule/${date}`;
const shiftsUrl = (gameId: number) =>
  `https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=${gameId}`;
const pbpUrl = (gameId: number) =>
  `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`;

/** Walk the schedule forward from the season opener until N final games are collected. */
async function collectGameIds(count: number): Promise<number[]> {
  const startYear = Number(SEASON.slice(0, 4));
  const ids: number[] = [];
  const cursor = new Date(Date.UTC(startYear, 9, 1)); // Oct 1
  for (let day = 0; day < 200 && ids.length < count; day++) {
    const date = cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    let payload: any;
    try { payload = await fetchCached(`schedule-${date}`, scheduleUrl(date)); } catch { continue; }
    for (const week of payload?.gameWeek ?? []) {
      for (const g of week?.games ?? []) {
        if (g?.gameType === 2 && (g.gameState === "OFF" || g.gameState === "FINAL")) {
          if (!ids.includes(g.id)) ids.push(g.id);
          if (ids.length >= count) break;
        }
      }
      if (ids.length >= count) break;
    }
  }
  return ids.slice(0, count);
}

function rosterFromPbp(pbp: any): { roster: RosterSpot[]; homeTeamId: number; awayTeamId: number } {
  const roster: RosterSpot[] = (pbp?.rosterSpots ?? []).map((s: any) => ({
    playerId: s.playerId,
    teamId: s.teamId,
    positionCode: s.positionCode as PositionCode,
    fullName: `${s.firstName?.default ?? ""} ${s.lastName?.default ?? ""}`.trim(),
  }));
  return { roster, homeTeamId: pbp?.homeTeam?.id, awayTeamId: pbp?.awayTeam?.id };
}

function eventsFromPbp(pbp: any) {
  return (pbp?.plays ?? []).map((p: any) => ({
    period: p?.periodDescriptor?.number,
    sec: parseClock(p?.timeInPeriod) ?? -1,
    situationCode: p?.situationCode ?? null,
    typeDescKey: p?.typeDescKey,
    xCoord: p?.details?.xCoord ?? null,
    yCoord: p?.details?.yCoord ?? null,
    zoneCode: p?.details?.zoneCode ?? null,
  })).filter((e: any) => e.period != null && e.sec >= 0);
}

async function main() {
  console.log(`Gravity v4 coverage spike — season ${SEASON}, target ${GAME_COUNT} games${OFFLINE ? " (offline)" : ""}`);

  const gameIds = await collectGameIds(GAME_COUNT);
  console.log(`collected ${gameIds.length} final regular-season game ids\n`);

  const reports: CoverageReport[] = [];
  const failures: { gameId: number; reason: string }[] = [];
  // team -> combo key -> seconds  (for optional line validation)
  const comboAll = new Map<string, Map<string, { names: string[]; seconds: number }>>();
  const combo5v5 = new Map<string, Map<string, { names: string[]; seconds: number }>>();

  for (const gameId of gameIds) {
    try {
      const [shiftPayload, pbp] = await Promise.all([
        fetchCached(`shifts-${gameId}`, shiftsUrl(gameId)),
        fetchCached(`pbp-${gameId}`, pbpUrl(gameId)),
      ]);
      const rawRows: RawShiftRow[] = shiftPayload?.data ?? [];
      const { roster, homeTeamId, awayTeamId } = rosterFromPbp(pbp);
      if (!homeTeamId || roster.length === 0) throw new Error("missing roster/home team in pbp");

      const known = new Set(roster.map(r => r.playerId));
      const { shifts, report } = parseShifts(rawRows, known);
      const stints = buildStints(shifts, roster, homeTeamId);
      const events = eventsFromPbp(pbp);
      reports.push(buildCoverageReport({ gameId, parse: report, shifts, stints, events }));

      // Roll up forward combinations for both clubs (used by --lines validation)
      const abbrevOf: Record<number, string> = {
        [homeTeamId]: pbp?.homeTeam?.abbrev, [awayTeamId]: pbp?.awayTeam?.abbrev,
      };
      for (const teamId of [homeTeamId, awayTeamId]) {
        const abbrev = abbrevOf[teamId];
        if (!abbrev) continue;
        for (const [target, opts] of [[comboAll, {}], [combo5v5, { even5v5Only: true }]] as const) {
          const bucket = target.get(abbrev) ?? new Map();
          for (const c of forwardCombinationToi(stints, roster, teamId, homeTeamId, opts).values()) {
            const key = c.names.map(validationNameKey).sort().join(" | ");
            const prev = bucket.get(key);
            if (prev) prev.seconds += c.seconds;
            else bucket.set(key, { names: c.names, seconds: c.seconds });
          }
          target.set(abbrev, bucket);
        }
      }
    } catch (e) {
      failures.push({ gameId, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── Aggregate coverage ────────────────────────────────────────
  const sum = (f: (r: CoverageReport) => number) => reports.reduce((s, r) => s + f(r), 0);
  const attempted = gameIds.length;
  const ok = reports.length;
  const totalStint = sum(r => r.totalStintSec);
  const even = sum(r => r.even5v5Sec);
  const checked = sum(r => r.strengthChecked);
  const agreed = sum(r => r.strengthAgreed);
  const shiftRows = sum(r => r.parse.shiftRows);
  const unknown = sum(r => r.parse.unknownPlayerRows);

  console.log("── COVERAGE ───────────────────────────────────────");
  console.log(`games attempted            ${attempted}`);
  console.log(`games reconstructed        ${ok}  (${((100 * ok) / Math.max(1, attempted)).toFixed(1)}%)`);
  console.log(`shift rows kept            ${shiftRows}`);
  console.log(`  duplicates dropped       ${sum(r => r.parse.duplicateRows)}`);
  console.log(`  invalid clock/zero-len   ${sum(r => r.parse.invalidRows)}`);
  console.log(`  non-shift event rows     ${sum(r => r.parse.nonShiftRows)}`);
  console.log(`roster join rate           ${shiftRows ? (100 * (shiftRows - unknown) / shiftRows).toFixed(2) : "—"}%`);
  console.log(`stints built               ${sum(r => r.stintCount)}`);
  console.log(`stint tiling gap           ${sum(r => r.tilingGapSec)}s  (want 0)`);
  console.log(`impossible skater counts   ${sum(r => r.invalidSkaterCountStints)} stints  (want 0)`);
  console.log(`5v5 share of stint time    ${totalStint ? ((100 * even) / totalStint).toFixed(1) : "—"}%`);
  console.log(`strength agreement vs PBP  ${checked ? ((100 * agreed) / checked).toFixed(2) : "—"}%  (${agreed}/${checked})`);
  if (failures.length) {
    console.log(`\nfailures (${failures.length}):`);
    for (const f of failures.slice(0, 10)) console.log(`  ${f.gameId}: ${f.reason}`);
  }

  // ── Optional: validate derived line TOI against an external file ──
  if (LINES_CSV && TEAM) {
    console.log(`\n── LINE VALIDATION vs ${path.basename(LINES_CSV)} (${TEAM}) ──`);
    const rows = fs.readFileSync(LINES_CSV, "utf8").trim().split("\n").slice(1);
    const expected = rows.map(line => {
      const cells = line.split('","').map(c => c.replace(/^"|"$/g, ""));
      return { players: parseLineLabel(cells[3] ?? ""), toi: cells[1] ?? "" };
    }).filter(r => r.players.length > 0);

    for (const [label, table] of [["all strengths", comboAll], ["5v5 only", combo5v5]] as const) {
      const derived = table.get(TEAM);
      if (!derived) { console.log(`  ${label}: no derived data for ${TEAM}`); continue; }
      let matched = 0, compared = 0, absDiff = 0;
      for (const exp of expected.slice(0, 25)) {
        const key = exp.players.join(" | ");
        const got = derived.get(key);
        if (!got) continue;
        const expSec = (parseClock(exp.toi.replace(/^(\d+):/, (_, m) => `${m}:`)) ?? 0);
        matched++; compared++;
        absDiff += Math.abs(got.seconds - expSec);
      }
      console.log(`  ${label}: matched ${matched}/${Math.min(25, expected.length)} of the top combos` +
        (compared ? `, mean |Δ| ${formatSeconds(absDiff / compared)} per combo` : ""));
    }
    console.log("  (partial-season spikes will under-count; compare shapes, then rerun on the full slate)");
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    generatedAt: new Date().toISOString(),
    season: SEASON,
    gamesAttempted: attempted,
    gamesReconstructed: ok,
    aggregate: {
      shiftRows, duplicateRows: sum(r => r.parse.duplicateRows),
      invalidRows: sum(r => r.parse.invalidRows),
      rosterJoinPct: shiftRows ? (100 * (shiftRows - unknown)) / shiftRows : null,
      stints: sum(r => r.stintCount), tilingGapSec: sum(r => r.tilingGapSec),
      invalidSkaterCountStints: sum(r => r.invalidSkaterCountStints),
      even5v5Pct: totalStint ? (100 * even) / totalStint : null,
      strengthAgreementPct: checked ? (100 * agreed) / checked : null,
    },
    perGame: reports,
    failures,
  };
  const file = path.join(OUT_DIR, `coverage-spike-${SEASON}.json`);
  const body = JSON.stringify(out, null, 2);
  fs.writeFileSync(file, body);
  console.log(`\nreport → ${path.relative(ROOT, file)}  sha256 ${sha256(body).slice(0, 16)}…`);

  // Gate: refuse to bless the pipeline unless reconstruction is clean.
  const gates = [
    ["games reconstructed ≥95%", ok / Math.max(1, attempted) >= 0.95],
    ["zero tiling gap", sum(r => r.tilingGapSec) === 0],
    ["zero impossible skater counts", sum(r => r.invalidSkaterCountStints) === 0],
    ["strength agreement ≥99%", checked > 0 && (100 * agreed) / checked >= 99],
    ["roster join ≥99.9%", shiftRows > 0 && (100 * (shiftRows - unknown)) / shiftRows >= 99.9],
  ] as const;
  console.log("\n── GATES ──────────────────────────────────────────");
  let allPass = true;
  for (const [name, pass] of gates) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) allPass = false;
  }
  console.log(allPass
    ? "\nReconstruction is trustworthy — safe to proceed to the league-wide backfill."
    : "\nDo NOT backfill yet. Fix the failing gate(s) first.");
}

main().catch(e => { console.error(e); process.exit(1); });
