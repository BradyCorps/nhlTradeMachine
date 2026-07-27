// ── Gravity v4 — endpoint probe ──────────────────────────────────
//
// Answers one question: when a game produces no stints, what did the server
// actually say? Bypasses the cache entirely, so it reports live truth rather
// than whatever an earlier throttled run wrote to disk.
//
//   npx tsx scripts/gravity-v4/probe.ts                  # audit the cache
//   npx tsx scripts/gravity-v4/probe.ts 2025020051       # live-probe game ids
//   npx tsx scripts/gravity-v4/probe.ts --empties 5      # audit, then probe 5 of them
//   npx tsx scripts/gravity-v4/probe.ts --compare 4      # 4 empty vs 4 populated
//
// No pacing games, no retries, no caching — one request per URL so the status
// code and payload shape are unambiguous.

import fs from "fs";
import path from "path";
import { CACHE_DIR, shiftsUrl, pbpUrl } from "./nhl-source";

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const ids = args.filter(a => /^\d{10}$/.test(a)).map(Number);
const probeEmpties = Number(flag("empties", "0"));
const compare = Number(flag("compare", "0"));

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Which cached shift charts are empty — i.e. poisoned by a throttled run. */
function auditCache(): { empty: number[]; populated: number[] } {
  if (!fs.existsSync(CACHE_DIR)) {
    console.log(`no cache at ${CACHE_DIR}`);
    return { empty: [], populated: [] };
  }
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.startsWith("shifts-"));
  const empty: number[] = [], populated: number[] = [];
  let unreadable = 0;
  for (const f of files) {
    const gameId = Number(f.replace("shifts-", "").replace(".json", ""));
    try {
      const p = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), "utf8"));
      if (Array.isArray(p?.data) && p.data.length > 0) populated.push(gameId);
      else empty.push(gameId);
    } catch { unreadable++; }
  }
  empty.sort((a, b) => a - b);
  populated.sort((a, b) => a - b);

  console.log("── CACHE AUDIT ────────────────────────────────────");
  console.log(`shift-chart files          ${files.length}`);
  console.log(`  populated                ${populated.length}`);
  console.log(`  EMPTY                    ${empty.length}`);
  if (unreadable) console.log(`  unreadable               ${unreadable}`);
  if (empty.length) {
    console.log(`  first empty game id      ${empty[0]}`);
    console.log(`  last empty game id       ${empty[empty.length - 1]}`);
    console.log(`  sample                   ${empty.slice(0, 6).join(", ")}`);
  }

  // Are the empties contiguous runs (whole date ranges missing) or scattered
  // (per-game gaps)? The shape of the gap decides what can be done about it.
  if (empty.length && populated.length) {
    const all = [...empty.map(id => [id, 0] as const), ...populated.map(id => [id, 1] as const)]
      .sort((a, b) => a[0] - b[0]);
    const runs: { state: number; from: number; to: number; n: number }[] = [];
    for (const [id, state] of all) {
      const last = runs[runs.length - 1];
      if (last && last.state === state) { last.to = id; last.n++; }
      else runs.push({ state, from: id, to: id, n: 1 });
    }
    const emptyRuns = runs.filter(r => r.state === 0);
    console.log(`\n  alternating runs         ${runs.length} ` +
      `(${emptyRuns.length} empty blocks, median size ` +
      `${emptyRuns.map(r => r.n).sort((a, b) => a - b)[Math.floor(emptyRuns.length / 2)]})`);
    console.log("  largest empty blocks:");
    for (const r of [...emptyRuns].sort((a, b) => b.n - a.n).slice(0, 5)) {
      console.log(`    ${r.from} → ${r.to}   ${r.n} games`);
    }
  }
  return { empty, populated };
}

async function probeUrl(label: string, url: string): Promise<number | null> {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    let res: Response;
    try { res = await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(timer); }
    const text = await res.text();
    const ms = Date.now() - started;

    let shape = "", rows: number | null = null;
    try {
      const p = JSON.parse(text);
      const parts: string[] = [];
      if (Array.isArray(p?.data)) { parts.push(`data[${p.data.length}]`); rows = p.data.length; }
      if (Array.isArray(p?.plays)) { parts.push(`plays[${p.plays.length}]`); rows ??= p.plays.length; }
      if (Array.isArray(p?.rosterSpots)) parts.push(`rosterSpots[${p.rosterSpots.length}]`);
      if (p?.total != null) parts.push(`total=${p.total}`);
      shape = parts.join(" ") || Object.keys(p ?? {}).slice(0, 5).join(",");
    } catch { shape = "NOT JSON"; }

    const retryAfter = res.headers.get("retry-after");
    console.log(`  ${label.padEnd(6)} HTTP ${res.status}  ${String(text.length).padStart(8)} bytes` +
      `  ${String(ms).padStart(5)}ms  ${shape}` +
      (retryAfter ? `  retry-after=${retryAfter}` : ""));
    if (!res.ok && text.length < 400) console.log(`         body: ${text.trim()}`);
    return rows;
  } catch (e) {
    console.log(`  ${label.padEnd(6)} THREW  ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Probe known-empty and known-populated games side by side.
 *
 * If the populated ones still return rows while the empty ones still return
 * none, the gap is a real per-game absence on the NHL side. If BOTH come back
 * empty, the endpoint is failing globally right now and the populated cache
 * entries were simply captured during a healthy window — a completely different
 * problem with a completely different fix.
 */
async function runCompare(empty: number[], populated: number[], n: number) {
  const pick = (xs: number[]) => {
    const step = Math.max(1, Math.floor(xs.length / n));
    return Array.from({ length: Math.min(n, xs.length) }, (_, i) => xs[i * step]);
  };
  const emptySample = pick(empty), popSample = pick(populated);

  console.log(`\n── COMPARE (cache bypassed) ───────────────────────`);
  const result: Record<string, { withRows: number; total: number }> = {
    "cached-empty": { withRows: 0, total: 0 },
    "cached-populated": { withRows: 0, total: 0 },
  };

  for (const [label, sample] of [["cached-empty", emptySample], ["cached-populated", popSample]] as const) {
    console.log(`\n${label}:`);
    for (const gameId of sample) {
      const rows = await probeUrl(String(gameId), shiftsUrl(gameId));
      result[label].total++;
      if ((rows ?? 0) > 0) result[label].withRows++;
      await wait(600);
    }
  }

  console.log("\n── VERDICT ────────────────────────────────────────");
  for (const [label, r] of Object.entries(result)) {
    console.log(`  ${label.padEnd(18)} ${r.withRows}/${r.total} returned shift rows`);
  }
  const emptyStill = result["cached-empty"].withRows === 0;
  const popStillOk = result["cached-populated"].withRows === result["cached-populated"].total;
  console.log(
    emptyStill && popStillOk
      ? "\n  The gap is REAL and per-game — those games have no shift chart.\n" +
        "  Fit on the games that do; do not keep retrying the ones that don't."
      : !emptyStill
      ? "\n  Previously-empty games now return rows — the gap was TRANSIENT.\n" +
        "  Rerun the backfill; the cache heals itself on this run."
      : "\n  Populated games are now returning empty too — the endpoint is\n" +
        "  failing globally right now. Wait and re-probe before concluding anything.");
}

async function main() {
  const { empty, populated } = auditCache();

  if (compare > 0) {
    if (!empty.length || !populated.length) {
      console.log("\n--compare needs both empty and populated cache entries.");
      return;
    }
    await runCompare(empty, populated, compare);
    return;
  }

  let targets = ids;
  if (targets.length === 0 && probeEmpties > 0) targets = empty.slice(0, probeEmpties);

  if (targets.length === 0) {
    console.log("\nNo game ids given. Pass ids to live-probe them, --empties N to");
    console.log("probe N empty entries, or --compare N to test empty against");
    console.log("populated games side by side:");
    console.log("  npx tsx scripts/gravity-v4/probe.ts --compare 4");
    return;
  }

  console.log(`\n── LIVE PROBE (${targets.length} games, cache bypassed) ────`);
  for (const gameId of targets) {
    console.log(`\ngame ${gameId}`);
    await probeUrl("shifts", shiftsUrl(gameId));
    await wait(600);
    await probeUrl("pbp", pbpUrl(gameId));
    await wait(600);
  }

  console.log("\nRead it like this:");
  console.log("  HTTP 200 + data[0]      → the endpoint is answering empty (throttle or no data)");
  console.log("  HTTP 404                → that game id has no shift chart at all");
  console.log("  HTTP 429 / retry-after  → straightforward rate limiting; raise --shiftgap");
  console.log("  slow + 200 + data[N>0]  → it works now; the cached empties were transient");
}

main().catch(e => { console.error(e); process.exit(1); });
