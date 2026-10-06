// ── strand-source-check.ts ───────────────────────────────────────
//
// Pure checks that the NHL feeds the evolution panel reads still mean what the
// code assumes. Unit-tested on fixtures; run against the real feeds by
// `scripts/verify-strand-evolution-sources.ts` from a machine that can reach the
// NHL. Passing fixtures proves the checker, NOT the feed: until the script has
// been run live, the panel's inputs are unverified.
//
// Assumptions checked (each is something a wrong guess would silently corrupt):
//   summary  playerId, gamesPlayed, points are numbers
//            timeOnIcePerGame is WHOLE SECONDS (typical median 900–1200)
//   EDGE     player.id matches, player.gamesPlayed is a number
//            sogSummary has "all" and "high" with integer `shots`; high ≤ all
//            zoneTimeDetails.offensiveZonePctg is a 0–1 fraction
//   joint    EDGE games equal summary games for the same player and moment —
//            how often they differ is the evidence for how stale an EDGE row can be

import { PLAUSIBLE } from "@/app/lib/strand-evolution";

export type CheckStatus = "pass" | "fail" | "info";
export interface SourceCheck { name: string; status: CheckStatus; detail: string }

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function checkEvolutionSources(input: {
  summaryRows: readonly Record<string, unknown>[];
  /** EDGE bodies keyed by player id (only players the caller fetched). */
  edgeBodies: ReadonlyMap<number, unknown>;
}): { checks: SourceCheck[]; ok: boolean } {
  const checks: SourceCheck[] = [];
  const add = (name: string, status: CheckStatus, detail: string) => checks.push({ name, status, detail });

  // ── summary ────────────────────────────────────────────────────
  const rows = input.summaryRows;
  const withFields = rows.filter(r => num(r.playerId) != null && num(r.gamesPlayed) != null && num(r.points) != null && num(r.timeOnIcePerGame) != null);
  add("summary: required fields", rows.length > 0 && withFields.length === rows.length ? "pass" : "fail",
    `${withFields.length}/${rows.length} rows carry numeric playerId, gamesPlayed, points, timeOnIcePerGame`);
  const played = withFields.filter(r => (r.gamesPlayed as number) > 0);
  const toi = played.map(r => r.timeOnIcePerGame as number);
  const med = median(toi);
  const [lo, hi] = PLAUSIBLE.toiSecondsPerGame;
  add("summary: timeOnIcePerGame is whole seconds", med != null && med >= 300 && med <= 1500 && toi.every(t => t >= lo && t <= hi) ? "pass" : "fail",
    med == null ? "no rows with games" : `median ${Math.round(med)}, min ${Math.min(...toi)}, max ${Math.max(...toi)} (seconds expected: median 300–1500, all within ${lo}–${hi})`);
  const worstPpg = Math.max(0, ...played.map(r => (r.points as number) / (r.gamesPlayed as number)));
  add("summary: points per game plausible", worstPpg <= PLAUSIBLE.pointsPerGame[1] ? "pass" : "fail", `highest ${worstPpg.toFixed(2)} pts/GP`);

  // ── EDGE ───────────────────────────────────────────────────────
  const aligned: boolean[] = [];
  let edgeIdx = 0;
  for (const [id, raw] of input.edgeBodies) {
    edgeIdx++;
    const body = raw as Record<string, any> | null;
    const tag = `EDGE ${id}`;
    if (!body || typeof body !== "object") { add(`${tag}: body`, "fail", "not an object"); continue; }
    add(`${tag}: identity`, body.player?.id === id && num(body.player?.gamesPlayed) != null ? "pass" : "fail",
      `player.id=${JSON.stringify(body.player?.id)}, player.gamesPlayed=${JSON.stringify(body.player?.gamesPlayed)}`);
    const sog: any[] = Array.isArray(body.sogSummary) ? body.sogSummary : [];
    const all = sog.find(s => s?.locationCode === "all"), high = sog.find(s => s?.locationCode === "high");
    const allShots = num(all?.shots), hdShots = num(high?.shots);
    add(`${tag}: sogSummary all/high shots`, allShots != null && hdShots != null && Number.isInteger(allShots) && Number.isInteger(hdShots) && hdShots <= allShots ? "pass" : "fail",
      `locationCodes ${JSON.stringify(sog.map(s => s?.locationCode))}; all=${allShots}, high=${hdShots}`);
    const oz = num(body.zoneTimeDetails?.offensiveZonePctg);
    add(`${tag}: offensiveZonePctg is a 0–1 fraction`, oz != null && oz >= 0 && oz <= 1 ? "pass" : "fail", `value ${JSON.stringify(body.zoneTimeDetails?.offensiveZonePctg)}`);
    const details: any[] = Array.isArray(body.sogDetails) ? body.sogDetails : [];
    const detailSum = details.reduce((t, d) => t + (num(d?.shots) ?? 0), 0);
    add(`${tag}: do sogDetails sum to the "all" shots?`, "info", `${detailSum} across ${details.length} areas vs all=${allShots} (a gap means some shots are outside the listed areas)`);
    const dateKeys = Object.keys(body).filter(k => /date|updated|asof|as_of|season/i.test(k));
    add(`${tag}: any as-of field?`, "info", dateKeys.length ? `top-level keys: ${dateKeys.join(", ")}` : "none at the top level; capture time is the only timestamp available");
    const summaryRow = rows.find(r => num(r.playerId) === id);
    if (summaryRow) {
      const same = num(summaryRow.gamesPlayed) === num(body.player?.gamesPlayed);
      aligned.push(same);
      add(`${tag}: EDGE games equal summary games`, "info", `summary ${summaryRow.gamesPlayed}, EDGE ${body.player?.gamesPlayed} → ${same ? "aligned" : "NOT aligned (the panel will not combine them)"}`);
    } else {
      add(`${tag}: found in summary`, "fail", "player missing from the summary rows");
    }
  }
  if (edgeIdx > 0 && aligned.length > 0) {
    add("joint: alignment rate", "info", `${aligned.filter(Boolean).length}/${aligned.length} sampled players had identical EDGE and summary games`);
  }
  return { checks, ok: checks.every(c => c.status !== "fail") };
}
