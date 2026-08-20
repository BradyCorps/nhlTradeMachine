// ── backfill-skater-edge.ts ─────────────────────────────────────
//
// WHY THIS EXISTS
//
// The nightly cron captures skater landing + EDGE snapshots four teams a
// night on an 8-day rotation, so a fresh database has no skater EDGE rows
// for over a week. EDGE zone-time / top-speed / burst-rate are exactly the
// inputs the gravity model's NZ (transition) well reads, so gravity stays
// uncovered — most skaters render INSUFFICIENT — until they land. This
// captures the whole league at once instead. Same tool as the goalie
// backfill, one endpoint over.
//
//   npx tsx scripts/backfill-skater-edge.ts                  # all snapshot skaters
//   npx tsx scripts/backfill-skater-edge.ts --discover       # + live-roster call-ups
//   npx tsx scripts/backfill-skater-edge.ts --teams EDM,TOR  # scope to clubs
//   npx tsx scripts/backfill-skater-edge.ts --ids 8478402,8477934
//   npx tsx scripts/backfill-skater-edge.ts --limit 50 --concurrency 4
//   npx tsx scripts/backfill-skater-edge.ts --dry-run        # resolve ids, fetch nothing
//
// This WRITES to the database in DATABASE_URL (defaults to the dev
// file:local.db). Target Turso the way the app does:
//
//   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npx tsx scripts/backfill-skater-edge.ts
//
// api-web.nhle.com is blocked from the Claude Code web sandbox, so run this
// somewhere with egress. Unlike the goalie run this walks its own batches to
// completion (a script has no serverless clock), so one invocation covers the
// whole league.

import { SEASON } from "../app/lib/season-config";
import { backfillSkaterEdge, discoverSkaterIds, resolveSkaterIds, skaterEdgeCoverage } from "../app/lib/nhl-feed-capture";
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
const concurrency = num("concurrency") ?? 6;
const batch = num("limit") ?? 60;

const label = (id: string) => `${id} ${activePlayerById(id)?.name ?? "(not in snapshot)"}`;

function reportTargetDatabase(): void {
  const url = process.env.DATABASE_URL || "file:local.db";
  const masked = url
    .replace(/\/\/[^@]*@/, "//***@")
    .replace(/([?&](?:authToken|auth_token|token)=)[^&]*/gi, "$1***");
  console.log(`  database: ${masked}`);
  if (!process.env.DATABASE_URL) {
    console.log(`  ⚠ DATABASE_URL is not set — this writes to the dev file:local.db, NOT`);
    console.log(`    production. Export DATABASE_URL / DATABASE_AUTH_TOKEN to target Turso, or`);
    console.log(`    run the backfill from the admin panel (BACKFILL SKATER EDGE), server-side.`);
  }
}

async function main() {
  const season = SEASON.nhleSeasonId;
  console.log(`\nSkater EDGE backfill — season ${season}`);
  reportTargetDatabase();

  const line = (c: Awaited<ReturnType<typeof skaterEdgeCoverage>>) =>
    `${c.skatersCaptured} captured · ${c.skatersWithoutEdgeData} no edge data · `
    + `${c.skatersUnaccounted} unaccounted of ${c.skatersKnown} known · ${c.edgeRows} edge rows`;

  const before = await skaterEdgeCoverage(season);
  console.log(`  before: ${line(before)}, last ${before.lastCapturedAt ?? "never"}`);

  const discovered = discover ? await discoverSkaterIds(teams) : [];
  if (discover) {
    const fresh = discovered.filter(id => activePlayerById(id) == null);
    console.log(`  discovered ${discovered.length} skaters on live rosters (${fresh.length} not in the bundled snapshot)`);
  }

  const plan = resolveSkaterIds({ playerIds: ids, teams }, discovered);
  console.log(`  plan: ${plan.eligible} eligible ids · ${batch}/batch · ${concurrency} in flight\n`);

  if (dryRun) {
    for (const id of plan.ids.slice(0, 20)) console.log(`  · ${label(id)}`);
    if (plan.ids.length > 20) console.log(`  … and ${plan.ids.length - 20} more`);
    console.log(`\n  --dry-run: nothing fetched, nothing written.`);
    return;
  }

  // Walk the whole list in batches — a script has no 60s ceiling, but batching
  // keeps memory flat and lets progress print as it goes.
  let offset = 0;
  let landingStored = 0, edgeStored = 0, edgeSkipped = 0, noEdgeData = 0;
  const failures: { playerId: string; name: string | null; reason: string; status?: number }[] = [];
  for (;;) {
    const r = await backfillSkaterEdge(season, { playerIds: ids, teams, discover, offset, limit: batch, concurrency });
    landingStored += r.landingStored;
    edgeStored += r.edgeStored;
    edgeSkipped += r.edgeSkipped;
    noEdgeData += r.noEdgeData.length;
    failures.push(...r.failures);
    const done = r.nextOffset ?? r.eligible;
    console.log(`  …${done}/${r.eligible} · +${r.edgeStored} edge · +${r.landingStored} landing · `
      + `${r.edgeSkipped} skipped · ${r.noEdgeData.length} no-edge · ${(r.elapsedMs / 1000).toFixed(1)}s`);
    if (r.nextOffset == null) break;
    offset = r.nextOffset;
  }

  console.log(`\n  totals: ${edgeStored} edge stored · ${landingStored} landing stored · `
    + `${edgeSkipped} already captured today · ${noEdgeData} no edge data (404)`);

  if (failures.length > 0) {
    console.log(`\n  ✗ failures (${failures.length}):`);
    for (const f of failures.slice(0, 30)) {
      console.log(`      ${f.reason.padEnd(11)} ${label(f.playerId)}${f.status ? ` — HTTP ${f.status}` : ""}`);
    }
    if (failures.length > 30) console.log(`      …${failures.length - 30} more`);
  }

  const after = await skaterEdgeCoverage(season);
  console.log(`\n  after: ${line(after)}`);
  if (after.skatersUnaccounted > 0) {
    console.log(`  ${after.skatersUnaccounted} still unaccounted — re-run to pick them up.`);
  }

  if (edgeStored === 0 && edgeSkipped === 0 && noEdgeData === 0) {
    console.error(`\n  Nothing captured and nothing 404'd — check egress to api-web.nhle.com.`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
