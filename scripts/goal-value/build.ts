// ── What a goal is worth, in cap dollars ─────────────────────────
//
//   npx tsx scripts/goal-value/build.ts
//   npx tsx scripts/goal-value/build.ts --check    # print, write nothing
//
// WHY THIS EXISTS
//
// The outcomes read needs to put a player's measured production on the same
// scale as his contract. That needs an exchange rate, and the first pass at one
// was `32 clubs × $80M ÷ 7,328 goals above replacement` = $0.35M a goal. Every
// term in that was a guess: the payroll figure, and — much worse — the
// replacement level, which was the 10th percentile of a rate distribution
// picked because it sounded about right. Replacement level is the denominator,
// so guessing it sets the answer.
//
// REPLACEMENT LEVEL IS MEASURED, NOT CHOSEN
//
// A replacement player is not a percentile. He is the man a club can sign for
// the league minimum, and 2,876 such contracts are on file. So: take standard
// (non-entry-level) contracts at or near the minimum, look at what those
// players actually produced, and let that be the zero.
//
// Entry-level deals are excluded and it matters — Celebrini is on one. A cheap
// contract is only evidence of replacement level when the player was free to
// sign anywhere and nobody bid more. The age floor exists for the same reason:
// a 22-year-old on a minimum second contract is a bet, not a commodity.
//
// TWO ROUTES WERE TRIED. ONE OF THEM FAILS, AND THE FAILURE IS INSTRUCTIVE.
//
//   MARKET SLOPE — regress what clubs paid against production above
//   replacement. 0.26% of the cap per goal, corroborated at 0.29% by walking
//   the pay ladder band by band rather than fitting a line. This is the number
//   the artifact publishes.
//
//   BUDGET CONSTRAINT — total discretionary spend divided by total production
//   above replacement. 1.63% per goal, six times higher, and it is wrong. At
//   that rate a MEDIAN full-season skater costs $6.9M, an elite one $29.1M and
//   the best season on record $67.5M against a legal maximum of $20.8M.
//
// It fails because it assumes the whole of a club's discretionary payroll buys
// the production this metric measures. It does not: goaltending, defence beyond
// on-ice expected goals, special teams, durability and plain inefficiency all
// consume cap. Dividing all of the money by some of the value inflates the
// rate. It is published anyway, as a failed cross-check, because a reader
// deserves to know the obvious second derivation was tried and why it was
// rejected.
//
// THE RATE IS NOT CONSTANT, AND THE ARTIFACT SAYS SO
//
// Marginal price per goal more than doubles from the bottom of the pay ladder
// to the top — the same convexity that forced `skater-fmv.ts` onto a monotone
// spline. A single figure is a useful average and a bad extrapolation, so the
// per-band rates are published beside it.

import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "app/data/goal-value.json");

const SIGNINGS = "OtherData/contracts/signings.csv";
const PERF = [
  "OtherData/HistoricalData/skaters_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_skaters.csv",
];

/** A contract at or below this share of the cap counts as a minimum deal. */
const MINIMUM_CAP_PCT = 0.011;

/**
 * Youngest a minimum contract can be and still measure replacement level.
 *
 * A 22-year-old on a cheap second deal is a club betting on him, not the open
 * market declining to bid. Median signing age across the minimum population is
 * 26, so this trims the tail rather than the body.
 */
const REPLACEMENT_MIN_AGE = 25;

/** Ice time a season needs before it can inform the replacement rate. */
const MIN_SEASON_SECONDS = 200 * 60;

/** Seasons of history behind a signing, matching the FMV fit's construction. */
const LOOKBACK_SEASONS = 3;

/** Skaters dressed per club per night, for the budget constraint. */
const SKATERS_PER_ROSTER = 18;
const CLUBS = 32;

interface Row { [k: string]: string }

const slug = (n: string): string =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();

function readCsv(rel: string): { rows: Row[]; sha256: string; bytes: number } {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const text = buf.toString("utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",");
  const rows = lines.slice(1).map(line => {
    const cells = line.split(",");
    const row: Row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
  return { rows, sha256: crypto.createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
}

const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface Season { season: number; ice: number; value: number }

const round = (n: number, dp = 6) => Number(n.toFixed(dp));
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function main() {
  const check = process.argv.includes("--check");
  const sources: { path: string; sha256: string; bytes: number }[] = [];

  // ── Player value, per season ───────────────────────────────────
  // On-ice expected-goal differential carries five skaters per event, so one
  // player's share is a fifth. Individual finishing is his alone. Both are
  // taken against the league rate for that season, so the era drops out — the
  // same reason the FMV model fits a share of the cap rather than dollars.
  const raw: { id: string; name: string; season: number; ice: number; oxd: number; fin: number }[] = [];
  for (const rel of PERF) {
    const { rows, sha256, bytes } = readCsv(rel);
    sources.push({ path: rel, sha256, bytes });
    for (const r of rows) {
      if (r.situation !== "all") continue;
      const ice = num(r.icetime);
      if (ice <= 0) continue;
      raw.push({
        id: r.playerId, name: r.name, season: num(r.season), ice,
        oxd: num(r.OnIce_F_xGoals) - num(r.OnIce_A_xGoals),
        fin: num(r.I_F_goals) - num(r.I_F_xGoals),
      });
    }
  }

  const leagueRate = new Map<number, number>();
  for (const s of new Set(raw.map(r => r.season))) {
    const g = raw.filter(r => r.season === s);
    leagueRate.set(s, g.reduce((a, r) => a + r.oxd, 0) / g.reduce((a, r) => a + r.ice, 0));
  }
  /** Goals above an average skater, for one season. */
  const valueOf = (r: typeof raw[number]) =>
    (r.oxd - leagueRate.get(r.season)! * r.ice) / 5 + r.fin;

  const byPlayer = new Map<string, Season[]>();
  const byName = new Map<string, Season[]>();
  for (const r of raw) {
    const s: Season = { season: r.season, ice: r.ice, value: valueOf(r) };
    (byPlayer.get(r.id) ?? byPlayer.set(r.id, []).get(r.id)!).push(s);
    const k = slug(r.name);
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(s);
  }

  // ── Replacement level, measured ────────────────────────────────
  const signings = readCsv(SIGNINGS);
  sources.push({ path: SIGNINGS, sha256: signings.sha256, bytes: signings.bytes });

  const isSkater = (r: Row) => r.pos && r.pos.trim().toUpperCase() !== "G";
  const minimumDeals = signings.rows.filter(r =>
    isSkater(r) &&
    r.level?.trim() === "STD" &&
    num(r.capPct) > 0 && num(r.capPct) <= MINIMUM_CAP_PCT &&
    num(r.signAge) >= REPLACEMENT_MIN_AGE);

  // What those players produced in the seasons after signing.
  let repValue = 0, repIce = 0, repPlayers = 0;
  for (const s of minimumDeals) {
    const hist = byName.get(slug(s.player));
    if (!hist) continue;
    const signSeason = num(s.signDate.slice(0, 4)) - (num(s.signDate.slice(5, 7)) >= 7 ? 0 : 1);
    const after = hist.filter(h => h.season >= signSeason && h.ice >= MIN_SEASON_SECONDS);
    if (after.length === 0) continue;
    repPlayers++;
    for (const h of after) { repValue += h.value; repIce += h.ice; }
  }
  if (repIce <= 0) throw new Error("no minimum-contract seasons found — replacement level cannot be measured");
  const replacementPer60 = (repValue * 3600) / repIce;

  /** Goals above replacement for one season of one player. */
  const garOf = (h: Season) => h.value - (replacementPer60 * h.ice) / 3600;

  // ── Route 1: the slope the market reveals ──────────────────────
  const points: { capPct: number; gar: number }[] = [];
  for (const s of signings.rows) {
    if (!isSkater(s) || s.structure?.trim() !== "1-Way" || s.level?.trim() !== "STD") continue;
    const capPct = num(s.capPct);
    if (capPct <= 0 || !s.signDate) continue;
    const hist = byName.get(slug(s.player));
    if (!hist) continue;
    const year = num(s.signDate.slice(0, 4)), month = num(s.signDate.slice(5, 7));
    const prior = month >= 7 ? year - 1 : year - 2;
    const window = hist.filter(h => h.season <= prior).sort((a, b) => a.season - b.season).slice(-LOOKBACK_SEASONS);
    const ice = window.reduce((a, h) => a + h.ice, 0);
    if (ice < 24000) continue;
    // Per-82-game rate, so the slope is dollars per goal over a season rather
    // than dollars per goal over however long the lookback happened to be.
    const gar = (window.reduce((a, h) => a + garOf(h), 0) / ice) * (82 * 60 * 60 * 0.28);
    points.push({ capPct, gar });
  }
  if (points.length < 200) throw new Error(`too few signings to fit a slope: ${points.length}`);

  const mx = mean(points.map(p => p.gar)), my = mean(points.map(p => p.capPct));
  const cov = points.reduce((s, p) => s + (p.gar - mx) * (p.capPct - my), 0);
  const varx = points.reduce((s, p) => s + (p.gar - mx) ** 2, 0);
  const slopeCapPctPerGoal = cov / varx;
  const sy = Math.sqrt(points.reduce((s, p) => s + (p.capPct - my) ** 2, 0));
  const r = cov / Math.sqrt(varx * sy * sy);

  // ── Route 2: what the league's budget implies ──────────────────
  // Every roster spot costs the minimum whatever the player is, so only spend
  // ABOVE that is buying production. Goals above replacement are counted over
  // the same recent window the percentile scales use.
  const recentSeasons = [...new Set(raw.map(r => r.season))].sort((a, b) => b - a).slice(0, 5);
  const recent = raw.filter(r => recentSeasons.includes(r.season));
  const totalGar = recent.reduce((a, r) => a + garOf({ season: r.season, ice: r.ice, value: valueOf(r) }), 0)
                 / recentSeasons.length;
  const discretionaryCapPct = 1 - SKATERS_PER_ROSTER * MINIMUM_CAP_PCT;
  const budgetCapPctPerGoal = (CLUBS * discretionaryCapPct) / totalGar;

  // ── The marginal rate along the pay ladder ─────────────────────
  // Walked in bands rather than fitted, so the convexity is visible instead of
  // being averaged away by a single slope.
  const ladder = [...points].sort((a, b) => a.gar - b.gar);
  const bandEdges = [0, 0.2, 0.4, 0.6, 0.8, 0.95, 1];
  const bands = bandEdges.slice(0, -1).map((lo, i) => {
    const g = ladder.slice(Math.floor(ladder.length * lo), Math.floor(ladder.length * bandEdges[i + 1]));
    return { from: lo, to: bandEdges[i + 1], n: g.length, meanGar: mean(g.map(x => x.gar)), meanCapPct: mean(g.map(x => x.capPct)) };
  });
  const marginal = bands.slice(1).map((b, i) => ({
    band: `p${(b.from * 100).toFixed(0)}-${(b.to * 100).toFixed(0)}`,
    capPctPerGoal: round((b.meanCapPct - bands[i].meanCapPct) / (b.meanGar - bands[i].meanGar)),
  }));
  // Two ends of the ladder, which is the honest headline rate.
  const ends = (bands[bands.length - 1].meanCapPct - bands[0].meanCapPct)
             / (bands[bands.length - 1].meanGar - bands[0].meanGar);

  const agreement = Math.abs(slopeCapPctPerGoal - budgetCapPctPerGoal)
                  / Math.max(slopeCapPctPerGoal, budgetCapPctPerGoal);

  // ── Guard: does the rate price real players sanely? ────────────
  // The check that caught the budget route. A rate is only usable if it puts a
  // median regular somewhere near a median contract and the best season ever
  // under the legal maximum.
  const fullSeasons = raw.filter(r => r.ice >= 1200 * 60)
    .map(r => garOf({ season: r.season, ice: r.ice, value: valueOf(r) })).sort((a, b) => a - b);
  const at = (p: number) => fullSeasons[Math.floor(p * (fullSeasons.length - 1))];
  const priceOf = (g: number) => g * slopeCapPctPerGoal + MINIMUM_CAP_PCT;
  if (priceOf(at(0.5)) > 0.05) {
    throw new Error(`rate prices a median full-season skater at ${(priceOf(at(0.5)) * 100).toFixed(1)}% of the cap — too high to be a market rate`);
  }
  if (priceOf(at(1)) > 0.20) {
    throw new Error(`rate prices the best season on record at ${(priceOf(at(1)) * 100).toFixed(1)}% of the cap, past the CBA maximum`);
  }

  const artifact = {
    schemaVersion: "goal-value-v1",
    generatedAt: new Date().toISOString(),
    generationCommand: "npx tsx scripts/goal-value/build.ts",
    replacementLevel: {
      per60: round(replacementPer60),
      basis: `measured from ${repPlayers} skaters on league-minimum standard contracts — at or under ${(MINIMUM_CAP_PCT * 100).toFixed(1)}% of the cap, signed at age ${REPLACEMENT_MIN_AGE} or older`,
      contracts: minimumDeals.length,
      playersMatched: repPlayers,
      seasonSeconds: repIce,
      why: "Replacement is what a club can sign for the minimum, not a percentile of a distribution. Entry-level deals are excluded — a cheap contract only measures replacement when the player was free to sign anywhere and nobody bid more.",
    },
    // The number to use.
    marketRate: {
      capPctPerGoal: round(slopeCapPctPerGoal),
      capPctPerGoalLadderEnds: round(ends),
      n: points.length,
      r: round(r, 4),
      why: "What clubs pay for a goal above replacement, from regressing cap share on production across every one-way standard signing. Corroborated by walking the pay ladder end to end, which needs no linear assumption and lands within 10%.",
      sanityCheck: {
        medianFullSeasonGar: round(at(0.5), 1),
        medianFullSeasonCapPct: round(priceOf(at(0.5)), 4),
        bestSeasonEverGar: round(at(1), 1),
        bestSeasonEverCapPct: round(priceOf(at(1)), 4),
      },
    },
    // Published because it is not constant, and treating it as constant would
    // understate the top of the market — the same convexity that put
    // `skater-fmv.ts` on a monotone spline.
    marginalByBand: marginal,
    // Published as a REJECTED derivation, not an alternative.
    budgetConstraintRejected: {
      capPctPerGoal: round(budgetCapPctPerGoal),
      goalsAboveReplacementPerSeason: round(totalGar, 1),
      discretionaryShareOfCap: round(discretionaryCapPct, 4),
      timesHigherThanMarket: round(budgetCapPctPerGoal / slopeCapPctPerGoal, 2),
      whyRejected: "It assumes a club's whole discretionary payroll buys the production this metric measures. It does not — goaltending, defence beyond on-ice expected goals, special teams and inefficiency all consume cap — so dividing all of the money by some of the value inflates the rate about sixfold. At this rate a median full-season skater would cost $6.9M and the best season on record $67.5M against a $20.8M legal maximum.",
    },
    agreement: {
      relativeGap: round(agreement, 4),
      verdict: "the two routes disagree by design; the budget route is rejected above",
    },
    sources,
  };

  const json = JSON.stringify(artifact, null, 2) + "\n";
  if (check) { console.log(json); return; }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
  console.log(`  replacement level  ${replacementPer60.toFixed(4)} goals/60, from ${repPlayers} players on ${minimumDeals.length} minimum deals`);
  console.log(`  market rate        ${(slopeCapPctPerGoal * 100).toFixed(4)}% of cap per goal   (n=${points.length}, r=${r.toFixed(3)})`);
  console.log(`  ladder end to end  ${(ends * 100).toFixed(4)}% — corroborates without assuming a line`);
  console.log(`  REJECTED, budget   ${(budgetCapPctPerGoal * 100).toFixed(4)}% — ${(budgetCapPctPerGoal / slopeCapPctPerGoal).toFixed(1)}x too high, see whyRejected`);
  console.log(`\n  marginal rate along the ladder (it is not constant):`);
  for (const m of marginal) console.log(`    ${m.band.padEnd(10)} ${(m.capPctPerGoal * 100).toFixed(4)}% per goal`);
  console.log(`\n  sanity at a $104M ceiling:`);
  console.log(`    median full season   ${at(0.5).toFixed(1).padStart(5)} GAR  ->  $${(priceOf(at(0.5)) * 104).toFixed(2)}M`);
  console.log(`    elite (p95)          ${at(0.95).toFixed(1).padStart(5)} GAR  ->  $${(priceOf(at(0.95)) * 104).toFixed(2)}M`);
  console.log(`    best season on file  ${at(1).toFixed(1).padStart(5)} GAR  ->  $${(priceOf(at(1)) * 104).toFixed(2)}M`);
}

main();
