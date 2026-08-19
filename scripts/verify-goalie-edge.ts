// ── verify-goalie-edge.ts ────────────────────────────────────────
//
// WHY THIS EXISTS
//
// `parseGoalieEdge` was written without a live response to read: the NHL
// API is unreachable from the environment the pipeline was built in, so
// the field spellings are inferred from the rendered goalie page and from
// the location taxonomy the goalie board URLs already use. The parser is
// alias-driven and fails to null rather than guessing, which makes a
// wrong guess *safe* — but it still leaves the data unread.
//
// Run this anywhere the NHL API is reachable. It prints the real payload
// shape beside what the parser managed to extract, so the aliases in
// `nhl-player-feed.ts` can be tightened to the observed truth.
//
//   npx tsx scripts/verify-goalie-edge.ts                 # Sorokin, current season
//   npx tsx scripts/verify-goalie-edge.ts 8480313         # another goalie
//   npx tsx scripts/verify-goalie-edge.ts 8478009 20242025
//   npx tsx scripts/verify-goalie-edge.ts --dump          # full raw JSON
//
// Nothing here writes to the database — it is a read-only probe.

import { GOALIE_EDGE_URL, parseGoalieEdge } from "../app/lib/nhl-player-feed";

const NHL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Origin": "https://www.nhl.com",
  "Referer": "https://www.nhl.com/",
};

const args = process.argv.slice(2);
const dump = args.includes("--dump");
const positional = args.filter(a => !a.startsWith("--"));
const playerId = positional[0] ?? "8478009";          // Ilya Sorokin
const season = positional[1] ?? "20252026";

/** Print the key structure of a payload without drowning in leaf values. */
function outline(node: unknown, prefix = "", depth = 0): void {
  if (depth > 3 || node == null) return;
  if (Array.isArray(node)) {
    console.log(`${prefix}  [${node.length}]`);
    if (node.length > 0) outline(node[0], `${prefix}[0]`, depth + 1);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v != null && typeof v === "object") {
        console.log(`  ${path}${Array.isArray(v) ? ` [${(v as unknown[]).length}]` : ""}`);
        outline(v, path, depth + 1);
      } else {
        console.log(`  ${path} = ${JSON.stringify(v)}`);
      }
    }
  }
}

async function main() {
  const url = GOALIE_EDGE_URL(playerId, season);
  console.log(`\nGET ${url}\n`);

  const res = await fetch(url, { headers: NHL_HEADERS, cache: "no-store" });
  if (!res.ok) {
    console.error(`✗ HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const raw = await res.json();

  if (dump) {
    console.log(JSON.stringify(raw, null, 2));
    return;
  }

  console.log("── RAW PAYLOAD SHAPE ".padEnd(64, "─"));
  outline(raw);

  console.log(`\n── LOCATION ENTRIES `.padEnd(64, "─"));
  // Show every array carrying a locationCode, with its full first entry —
  // this is the block the parser's aliases have to match.
  const seen: string[] = [];
  (function walk(node: unknown, path = "", depth = 0) {
    if (depth > 5 || node == null) return;
    if (Array.isArray(node)) {
      if (node.some((e: any) => e && typeof e === "object" && "locationCode" in e)) {
        seen.push(path);
        console.log(`\n  ${path || "(root)"} — ${node.length} entries`);
        console.log(`  codes: ${node.map((e: any) => e.locationCode).join(", ")}`);
        console.log(`  first entry:\n${JSON.stringify(node[0], null, 4).split("\n").map(l => "    " + l).join("\n")}`);
        return;
      }
      node.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k, depth + 1);
      }
    }
  })(raw);
  if (seen.length === 0) console.log("  none found — the parser will return zero zones");

  console.log(`\n── WHAT parseGoalieEdge EXTRACTED `.padEnd(64, "─"));
  const facts = parseGoalieEdge(raw, Number(season));
  if (!facts) {
    console.log("  null — no player id resolved. Fix that alias first.");
    process.exit(1);
  }
  const { zones, ...line } = facts;
  for (const [k, v] of Object.entries(line)) {
    const flag = v == null ? "  ✗" : "  ✓";
    console.log(`${flag} ${k.padEnd(24)} ${v ?? "(null)"}`);
  }
  console.log("\n  zones:");
  if (zones.length === 0) {
    console.log("    ✗ none parsed");
  } else {
    for (const z of zones) {
      console.log(`    ${z.zone.padEnd(5)} sv%=${z.savePct ?? "—"} lg=${z.savePctLeagueAvg ?? "—"} `
        + `pct=${z.percentile ?? "—"} sa=${z.shotsAgainst ?? "—"} sv=${z.saves ?? "—"} ga=${z.goalsAgainst ?? "—"}`);
    }
  }

  const nulls = Object.entries(line).filter(([, v]) => v == null).map(([k]) => k);
  console.log(`\n── VERDICT `.padEnd(64, "─"));
  console.log(`  zones parsed : ${zones.length}/4`);
  console.log(`  null fields  : ${nulls.length === 0 ? "none" : nulls.join(", ")}`);
  if (nulls.length > 0 || zones.length < 4) {
    console.log(`\n  Any ✗ above means an alias in parseGoalieEdge does not match the`);
    console.log(`  real key. Read the LOCATION ENTRIES block for the true spelling and`);
    console.log(`  add it to ZONE_ALIASES / the pick() lists in nhl-player-feed.ts.`);
  } else {
    console.log(`\n  Everything resolved — the inferred aliases match the live feed.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
