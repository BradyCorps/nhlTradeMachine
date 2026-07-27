// ── Gravity v4 — endpoint probe ──────────────────────────────────
//
// Answers one question: when a game produces no stints, what did the server
// actually say? Bypasses the cache entirely, so it reports live truth rather
// than whatever an earlier throttled run wrote to disk.
//
//   npx tsx scripts/gravity-v4/probe.ts                  # audit the cache
//   npx tsx scripts/gravity-v4/probe.ts 2025020051       # live-probe game ids
//   npx tsx scripts/gravity-v4/probe.ts --empties 5      # audit, then probe 5 of them
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

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Which cached shift charts are empty — i.e. poisoned by a throttled run. */
function auditCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    console.log(`no cache at ${CACHE_DIR}`);
    return [];
  }
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.startsWith("shifts-"));
  const empty: number[] = [];
  let ok = 0, unreadable = 0;
  for (const f of files) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), "utf8"));
      if (Array.isArray(p?.data) && p.data.length > 0) ok++;
      else empty.push(Number(f.replace("shifts-", "").replace(".json", "")));
    } catch { unreadable++; }
  }
  console.log("── CACHE AUDIT ────────────────────────────────────");
  console.log(`shift-chart files          ${files.length}`);
  console.log(`  populated                ${ok}`);
  console.log(`  EMPTY (poisoned)         ${empty.length}`);
  if (unreadable) console.log(`  unreadable               ${unreadable}`);
  if (empty.length) {
    const sorted = [...empty].sort((a, b) => a - b);
    console.log(`  first empty game id      ${sorted[0]}`);
    console.log(`  last empty game id       ${sorted[sorted.length - 1]}`);
    console.log(`  sample                   ${sorted.slice(0, 6).join(", ")}`);
  }
  return empty.sort((a, b) => a - b);
}

async function probeUrl(label: string, url: string) {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    let res: Response;
    try { res = await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(timer); }
    const text = await res.text();
    const ms = Date.now() - started;

    let shape = "";
    try {
      const p = JSON.parse(text);
      const parts: string[] = [];
      if (Array.isArray(p?.data)) parts.push(`data[${p.data.length}]`);
      if (Array.isArray(p?.plays)) parts.push(`plays[${p.plays.length}]`);
      if (Array.isArray(p?.rosterSpots)) parts.push(`rosterSpots[${p.rosterSpots.length}]`);
      if (p?.total != null) parts.push(`total=${p.total}`);
      shape = parts.join(" ") || Object.keys(p ?? {}).slice(0, 5).join(",");
    } catch { shape = "NOT JSON"; }

    const retryAfter = res.headers.get("retry-after");
    console.log(`  ${label.padEnd(6)} HTTP ${res.status}  ${String(text.length).padStart(8)} bytes` +
      `  ${String(ms).padStart(5)}ms  ${shape}` +
      (retryAfter ? `  retry-after=${retryAfter}` : ""));
    if (!res.ok && text.length < 400) console.log(`         body: ${text.trim()}`);
  } catch (e) {
    console.log(`  ${label.padEnd(6)} THREW  ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  const empty = auditCache();

  let targets = ids;
  if (targets.length === 0 && probeEmpties > 0) targets = empty.slice(0, probeEmpties);

  if (targets.length === 0) {
    console.log("\nNo game ids given. Pass ids to live-probe them, or --empties N");
    console.log("to probe the first N poisoned entries, e.g.:");
    console.log("  npx tsx scripts/gravity-v4/probe.ts --empties 5");
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
