// ── verify-strand-evolution-sources.ts ───────────────────────────
//
// Read-only probe: confirms the NHL summary and EDGE feeds still match what the
// Season profile evolution panel assumes (field names, seconds-per-game ice time,
// 0–1 zone-time fraction, shot counts, games alignment, available timestamps).
//
// A live Codespace probe passed on 2026-10-07. Repeat near rollout and inspect
// source semantics separately; a pass alone does not verify every definition:
//
//   npx tsx scripts/verify-strand-evolution-sources.ts                       # 2026-27, Perfetti + a few
//   npx tsx scripts/verify-strand-evolution-sources.ts 20252026 8482149 8478402
//   npx tsx scripts/verify-strand-evolution-sources.ts --dump                # also print one raw EDGE outline
//
// Exit code 1 if any check fails. Writes nothing.

import { EDGE_URL, fetchJsonWithStatus } from "../app/lib/nhl-player-feed";
import { summaryUrl, validateSummary } from "../app/lib/observed-stats.server";
import { checkEvolutionSources } from "../app/lib/strand-source-check";

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const dump = process.argv.includes("--dump");
const season = (/^\d{8}$/.test(args[0] ?? "") ? args.shift()! : "20262027") as "20262027" | "20252026";
const ids = (args.length ? args : ["8482149", "8478402", "8477934", "8479318"]).map(Number);

async function main() {
  const sel = { season, gameType: 2 as const };
  const url = summaryUrl(sel, "skater");
  console.log(`summary: ${url}`);
  const res = await fetchJsonWithStatus(url);
  console.log(`  HTTP ${res.status}`);
  const rows = res.status === 200 ? validateSummary(res.data, sel, "skater") : null;
  if (!rows) { console.error("summary unavailable or failed validation; cannot continue"); process.exit(2); }

  const edgeBodies = new Map<number, unknown>();
  for (const id of ids) {
    const r = await fetchJsonWithStatus(EDGE_URL(id, season, 2));
    console.log(`EDGE ${id}: HTTP ${r.status}`);
    edgeBodies.set(id, r.status === 200 ? r.data : null);
    if (dump && r.data) console.log(JSON.stringify(r.data, null, 2).slice(0, 4000));
  }
  const { checks, ok } = checkEvolutionSources({ summaryRows: rows, edgeBodies, expectedPlayerIds: ids });
  for (const c of checks) console.log(`${c.status.toUpperCase().padEnd(4)} ${c.name} — ${c.detail}`);
  console.log(ok ? "\nAll hard checks passed. This does not establish shot definitions or source freshness; see the rollout document." : "\nAt least one check FAILED; do not rely on the panel until resolved.");
  process.exit(ok ? 0 : 1);
}
void main();
