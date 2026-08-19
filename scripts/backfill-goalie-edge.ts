// ── backfill-goalie-edge.ts ─────────────────────────────────────
//
// WHY THIS EXISTS
//
// `/edge/goalie-detail` is captured by the nightly cron on the same
// 8-day team rotation as the skater snapshots, so a fresh database has
// no goalie rows for a week and a bit — and `GoalieEdgePanel` renders
// nothing at all for a goalie it has no row for. That is a silent
// failure on the player page: it looks like a design choice, not like
// missing data. This runs the whole league at once instead.
//
//   npx tsx scripts/backfill-goalie-edge.ts                  # all 144 snapshot goalies
//   npx tsx scripts/backfill-goalie-edge.ts --discover       # + live-roster goalies (rookies)
//   npx tsx scripts/backfill-goalie-edge.ts --teams NYI,EDM  # scope to clubs
//   npx tsx scripts/backfill-goalie-edge.ts --ids 8478009,8480313
//   npx tsx scripts/backfill-goalie-edge.ts --limit 20 --concurrency 3
//   npx tsx scripts/backfill-goalie-edge.ts --dry-run        # resolve ids, fetch nothing
//
// This WRITES to the database in `DATABASE_URL` (defaults to the dev
// `file:local.db`); point it at Turso the same way the app does:
//
//   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npx tsx scripts/backfill-goalie-edge.ts
//
// The NHL API is unreachable from the Claude Code web sandbox, so this
// has to be run somewhere with egress. Exit code is non-zero when the
// run reached no goalie at all, so CI or a shell loop can tell the
// difference between "nothing to do" and "the feed is gone".

import { SEASON } from "../app/lib/season-config";
import { captureGoalieEdgeDetail, discoverGoalieIds, resolveGoalieIds, goalieEdgeCoverage } from "../app/lib/goalie-edge";
import { activePlayerById } from "../app/lib/nhl-active-players";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  const inline = args.find(a => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : null;
};
const list = (name: string): string[] | undefined => {
  const raw = flag(name);
  return raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : undefined;
};
const num = (name: string): number | undefined => {
  const raw = flag(name);
  return raw != null && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
};

const dryRun = args.includes("--dry-run");
const discover = args.includes("--discover");
const teams = list("teams");
const ids = list("ids");
const limit = num("limit");
const concurrency = num("concurrency") ?? 5;

const label = (id: string) => `${id} ${activePlayerById(id)?.name ?? "(not in snapshot)"}`;

async function main() {
  const season = SEASON.nhleSeasonId;
  console.log(`\nGoalie EDGE backfill — season ${season}`);

  const before = await goalieEdgeCoverage(season);
  console.log(`  before: ${before.goaliesCaptured}/${before.goaliesKnown} goalies captured, `
    + `${before.rows} rows, last ${before.lastCapturedAt ?? "never"}`);

  const discovered = discover ? await discoverGoalieIds(teams) : [];
  if (discover) {
    const fresh = discovered.filter(id => activePlayerById(id) == null);
    console.log(`  discovered ${discovered.length} goalies on live rosters `
      + `(${fresh.length} not in the bundled snapshot${fresh.length ? `: ${fresh.join(", ")}` : ""})`);
  }

  const plan = resolveGoalieIds({ playerIds: ids, teams, limit }, discovered);
  console.log(`  plan: ${plan.ids.length} of ${plan.eligible} eligible ids, ${concurrency} in flight\n`);

  if (dryRun) {
    for (const id of plan.ids) console.log(`  · ${label(id)}`);
    console.log(`\n  --dry-run: nothing fetched, nothing written.`);
    return;
  }

  const result = await captureGoalieEdgeDetail(season, {
    playerIds: ids,
    teams,
    discover,
    limit,
    concurrency,
  });

  console.log(`  requested ${result.requested}/${result.eligible} · stored ${result.stored} · `
    + `skipped ${result.skipped} (already captured ${result.day}) · parsed ${result.parsed} · `
    + `${(result.elapsedMs / 1000).toFixed(1)}s`);

  // A payload that stored but would not parse is the dangerous case: the
  // row exists, so coverage looks healthy, and the dossier panel still
  // renders nothing. Name those loudly.
  if (result.unparsed.length > 0) {
    console.log(`\n  ⚠ stored but unparseable (${result.unparsed.length}) — the feed shape may have moved:`);
    for (const id of result.unparsed) console.log(`      ${label(id)}`);
    console.log(`      Run: npx tsx scripts/verify-goalie-edge.ts ${result.unparsed[0]} ${season}`);
  }

  if (result.failures.length > 0) {
    console.log(`\n  ✗ failures (${result.failures.length}):`);
    for (const f of result.failures) console.log(`      ${f.reason.padEnd(11)} ${label(f.playerId)}${f.detail ? ` — ${f.detail}` : ""}`);
  }

  const after = await goalieEdgeCoverage(season);
  console.log(`\n  after: ${after.goaliesCaptured}/${after.goaliesKnown} goalies captured, ${after.rows} rows`);

  if (result.requested > 0 && result.stored === 0 && result.skipped === 0) {
    console.error(`\n  Nothing was captured. Every request failed — check egress to api-web.nhle.com.`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
