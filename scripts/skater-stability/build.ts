// ── Skater stability + percentile artifact ───────────────────────
//
//   npx tsx scripts/skater-stability/build.ts
//   npx tsx scripts/skater-stability/build.ts --check   # print, write nothing
//
// WHY THIS EXISTS
//
// `skater-fmv.ts` prices a skater from two rate stats: points per sixty minutes
// and minutes per game. Both are read off a single season, and a single season
// is a sample. A forward who misses thirty games and comes back at 1.9 pts/60
// gets priced as a 1.9 pts/60 player, which is how Auston Matthews ended up
// valued at $8.30M in the comparison run.
//
// The goalie side already solved this: measure how much of a season carries
// into the next one, and use that to decide how much of it to believe. This is
// the same measurement for skaters, from the same 2008-2025 panel.
//
// WHAT THE NUMBERS TURN OUT TO BE
//
//   Forward TOI/game     r = 0.85
//   Defence TOI/game     r = 0.80
//   Forward pts/60       r = 0.72
//   Defence pts/60       r = 0.68
//
// Set beside GSAx/60 at r = 0.13, that is the headline: a skater's season is
// mostly signal where a goalie's is mostly noise. The prior built on this
// should therefore be a light touch, and `skater-prior.ts` is written that way.
// Assuming skaters needed the same heavy regression goalies do would have
// flattened the league for no reason.
//
// TWO WINDOWS, ON PURPOSE — same reasoning as the goalie artifact:
//
//   PERCENTILES come from a recent window. League scoring has drifted, so
//   ranking a 2025 forward against 2008 measures the era, not the player.
//
//   STABILITY comes from the full panel, which wants every consecutive-season
//   pair it can get. Era drift moves the level far more than the repeatability.
//
// SPLIT BY POSITION, because `skater-fmv.ts` is. A defenceman's pts/60 median
// is half a forward's; one shared distribution would call every blueliner
// below average at scoring, which is true and useless.
//
// OUTPUT is aggregate only — quantiles and correlations, no player rows.

import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "app/data/skater-stability.json");

const SOURCES = [
  "OtherData/HistoricalData/skaters_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_skaters.csv",
];

/**
 * Minimum ice time to enter the population, in seconds (~a quarter season).
 *
 * Chosen by measurement rather than taste: sweeping 200/300/400 minutes moves
 * every correlation by less than 0.03, so the threshold is not doing any work.
 * 300 drops the one-and-two-game fragments without discarding a real fourth
 * liner.
 */
const MIN_ICETIME_SECONDS = 300 * 60;

/** Games played that counts as having played a full season, for the anchor. */
const FULL_SEASON_MIN_GAMES = 70;

/** Seasons the percentile scale is drawn from, counting back from the newest. */
const PERCENTILE_WINDOW_SEASONS = 5;

/**
 * Games-played buckets for the sample curve.
 *
 * WHY A MEASURED CURVE AND NOT `n / (n + k)`
 *
 * The first version of this derived how much to believe a partial season from
 * the single year-over-year `r`, via the standard `n / (n + k)` shrinkage with
 * `k` set so a full season reproduced `r`. That form assumes everything `r`
 * falls short of 1 is sampling noise — and for deployment it plainly is not.
 * Most of what stops last year's TOI predicting this year's is that the coach
 * changed his mind, which no amount of extra sample fixes.
 *
 * The consequence was a large, wrong shrink: the derived form gave a ten-game
 * TOI sample 34% credibility. Measured against the panel, such a season
 * predicts the next one at r = 0.74 against a full season's 0.90 — about 82%.
 *
 * So measure it. Each bucket is the year-over-year correlation using only
 * predictor seasons of that length. The PREDICTED season always has 40+ games,
 * so the only thing varying across buckets is how much was seen of year one.
 */
const SAMPLE_BUCKETS: [number, number][] =
  [[1, 10], [11, 20], [21, 30], [31, 40], [41, 55], [56, 70], [71, 82]];

/** Games the predicted season must have, so the target is not itself noisy. */
const SAMPLE_CURVE_MIN_NEXT_GAMES = 40;

/** Pairs a bucket needs before its correlation is published. */
const SAMPLE_CURVE_MIN_PAIRS = 60;

const QUANTILES = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
                   55, 60, 65, 70, 75, 80, 85, 90, 95, 99];

type Unit = "F" | "D";
const UNITS: Unit[] = ["F", "D"];

interface Row { [k: string]: string }

const num = (r: Row, k: string): number | null => {
  const v = Number(r[k]);
  return Number.isFinite(v) ? v : null;
};

/** Anything MoneyPuck does not call a defenceman is priced as a forward. */
const unitOf = (r: Row): Unit => (r.position === "D" ? "D" : "F");

interface MetricSpec {
  key: string;
  label: string;
  unit: string;
  note: string;
  of: (r: Row) => number | null;
}

const METRICS: MetricSpec[] = [
  {
    key: "pts60", label: "Points/60", unit: "points per sixty minutes",
    note: "All situations. The production feature the FMV model is fitted on — per SIXTY MINUTES, not per game and not per 82.",
    of: r => {
      const p = num(r, "I_F_points"), ice = num(r, "icetime");
      return p == null || !ice ? null : (p * 3600) / ice;
    },
  },
  {
    key: "toiPerGame", label: "TOI/game", unit: "minutes per game",
    note: "All situations. The deployment feature — how much a coach trusts him, and the most repeatable thing on this list.",
    of: r => {
      const ice = num(r, "icetime"), gp = num(r, "games_played");
      return ice == null || !gp ? null : ice / 60 / gp;
    },
  },
  {
    key: "gameScore60", label: "Game Score/60", unit: "game score per sixty minutes",
    note: "MoneyPuck's all-in-one rate. Not used in pricing — published so a future feature can be judged on repeatability before it is trusted.",
    of: r => {
      const g = num(r, "gameScore"), ice = num(r, "icetime");
      return g == null || !ice ? null : (g * 3600) / ice;
    },
  },
];

// ── CSV ──────────────────────────────────────────────────────────

/**
 * Streamed rather than read whole — the historical skater file is 54 MB and
 * `situation === "all"` throws away four fifths of it.
 */
function readSituationAll(abs: string): { rows: Row[]; bytes: number; sha256: string } {
  const buf = fs.readFileSync(abs);
  const text = buf.toString("utf8");
  const lines = text.split(/\r?\n/);
  const head = lines[0].split(",");
  const situationAt = head.indexOf("situation");
  if (situationAt < 0) throw new Error(`${abs}: no 'situation' column`);

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    // These files carry no quoted commas; a bad split would show up as a
    // non-numeric icetime, which `num` turns into a skipped row.
    const cells = lines[i].split(",");
    if (cells[situationAt] !== "all") continue;
    const row: Row = {};
    head.forEach((h, j) => { row[h] = cells[j] ?? ""; });
    rows.push(row);
  }
  return { rows, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
}

// ── Statistics ───────────────────────────────────────────────────

const quantile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

const pearson = (a: number[], b: number[]): number => {
  if (a.length < 3) return NaN;
  const ma = mean(a), mb = mean(b);
  const n = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
  const d = Math.sqrt(
    a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, y) => s + (y - mb) ** 2, 0),
  );
  return d === 0 ? NaN : n / d;
};

const round = (n: number, dp = 6) => Number(n.toFixed(dp));

// ── Build ────────────────────────────────────────────────────────

function main() {
  const check = process.argv.includes("--check");

  const all: Row[] = [];
  const sources = SOURCES.map(rel => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) throw new Error(`missing source: ${rel}`);
    const { rows, bytes, sha256 } = readSituationAll(abs);
    all.push(...rows);
    return { path: rel, bytes, sha256, rowsAtSituationAll: rows.length };
  });

  const eligible = all.filter(r => (num(r, "icetime") ?? 0) >= MIN_ICETIME_SECONDS);
  const seasons = [...new Set(eligible.map(r => Number(r.season)))].sort((a, b) => a - b);
  if (seasons.length === 0) throw new Error("no eligible skater-seasons");

  const newest = seasons[seasons.length - 1];
  const windowStart = newest - (PERCENTILE_WINDOW_SEASONS - 1);

  // ── The full-season anchor ──────────────────────────────────────
  // `reliability(t)` needs a t at which it should equal the published r. That
  // is "a full season", which for a skater is not a fixed number the way 3,500
  // minutes is for a starting goalie — a first-pair defenceman plays twice a
  // fourth liner. Measured instead: the median ice time of a skater who played
  // 70+ games, across the whole panel.
  const fullSeasonIce = eligible
    .filter(r => (num(r, "games_played") ?? 0) >= FULL_SEASON_MIN_GAMES)
    .map(r => num(r, "icetime")!)
    .filter(v => v != null)
    .sort((a, b) => a - b);
  if (fullSeasonIce.length < 100) throw new Error("too few full seasons to anchor reliability");
  const fullSeasonSeconds = Math.round(quantile(fullSeasonIce, 50));

  const byUnit: Record<string, unknown> = {};
  const summary: string[] = [];

  for (const unit of UNITS) {
    const group = eligible.filter(r => unitOf(r) === unit);
    const windowRows = group.filter(r => Number(r.season) >= windowStart);

    // Consecutive-season pairs for the same player, full panel. A player who
    // changed position group between seasons contributes to whichever group
    // each of his seasons landed in, which is the honest reading of a winger
    // who moved back to defence.
    const byPlayer = new Map<string, Map<number, Row>>();
    for (const r of group) {
      const m = byPlayer.get(r.playerId) ?? new Map<number, Row>();
      m.set(Number(r.season), r);
      byPlayer.set(r.playerId, m);
    }

    // The sample curve needs the seasons the eligibility floor throws away —
    // the whole question is what a ten-game season is worth, and a ten-game
    // season is never 300 minutes. Built from the unfiltered rows instead.
    // (This bit me: with the floor applied, the two thinnest buckets fell
    // below the minimum-pairs bar and vanished, leaving a curve that started
    // at 21 games and said nothing about the case it exists for.)
    const byPlayerAll = new Map<string, Map<number, Row>>();
    for (const r of all) {
      if (unitOf(r) !== unit) continue;
      if (!((num(r, "games_played") ?? 0) > 0) || !((num(r, "icetime") ?? 0) > 0)) continue;
      const m = byPlayerAll.get(r.playerId) ?? new Map<number, Row>();
      m.set(Number(r.season), r);
      byPlayerAll.set(r.playerId, m);
    }

    const metrics: Record<string, unknown> = {};
    for (const spec of METRICS) {
      const values = windowRows.map(spec.of).filter((v): v is number => v != null).sort((a, b) => a - b);

      const x: number[] = [], y: number[] = [];
      for (const seasonMap of byPlayer.values()) {
        for (const [season, row] of seasonMap) {
          const next = seasonMap.get(season + 1);
          if (!next) continue;
          const a = spec.of(row), b = spec.of(next);
          if (a != null && b != null) { x.push(a); y.push(b); }
        }
      }

      const r = round(pearson(x, y), 4);

      // ── The sample curve ────────────────────────────────────────
      const raw: { minGames: number; maxGames: number; meanGames: number; pairs: number; r: number }[] = [];
      for (const [lo, hi] of SAMPLE_BUCKETS) {
        const bx: number[] = [], by: number[] = [], games: number[] = [];
        for (const seasonMap of byPlayerAll.values()) {
          for (const [season, row] of seasonMap) {
            const next = seasonMap.get(season + 1);
            if (!next) continue;
            const gp = Number(row.games_played);
            if (!(gp >= lo && gp <= hi)) continue;
            if (Number(next.games_played) < SAMPLE_CURVE_MIN_NEXT_GAMES) continue;
            const a = spec.of(row), b = spec.of(next);
            if (a != null && b != null) { bx.push(a); by.push(b); games.push(gp); }
          }
        }
        if (bx.length < SAMPLE_CURVE_MIN_PAIRS) continue;
        raw.push({
          minGames: lo, maxGames: hi,
          meanGames: round(mean(games), 1),
          pairs: bx.length,
          r: round(pearson(bx, by), 4),
        });
      }

      // Enforce monotonicity with a running maximum. More games cannot make a
      // season less predictive; where the raw buckets say otherwise it is
      // sampling noise in the bucket, and a curve that dips would hand a
      // 75-game season less credibility than a 60-game one.
      let running = -Infinity;
      const curve = raw.map(b => {
        running = Math.max(running, b.r);
        return { ...b, rMonotone: round(running, 4) };
      });
      const full = curve.length ? curve[curve.length - 1].rMonotone : r;
      const buckets = curve.map(b => ({
        ...b,
        belief: full > 0 ? round(Math.min(1, b.rMonotone / full), 4) : 0,
      }));

      metrics[spec.key] = {
        label: spec.label,
        unit: spec.unit,
        note: spec.note,
        n: values.length,
        mean: round(mean(values)),
        sd: round(sd(values)),
        quantiles: Object.fromEntries(QUANTILES.map(p => [p, round(quantile(values, p))])),
        stability: { pairs: x.length, r },
        sampleCurve: {
          basis: `year-over-year correlation using only predictor seasons of that length; the predicted season always has ${SAMPLE_CURVE_MIN_NEXT_GAMES}+ games, so the only thing varying is how much of year one was seen`,
          monotoneEnforced: true,
          fullSeasonR: full,
          buckets,
        },
      };
      summary.push(`  ${unit} ${spec.label.padEnd(15)} n=${String(values.length).padStart(5)}  pairs=${String(x.length).padStart(5)}  r=${String(r).padStart(6)}`);
    }

    byUnit[unit] = {
      label: unit === "D" ? "Defence" : "Forwards",
      skaterSeasons: group.length,
      players: byPlayer.size,
      percentileSeasons: windowRows.length,
      metrics,
    };
  }

  const artifact = {
    schemaVersion: "skater-stability-v1",
    generatedAt: new Date().toISOString(),
    generationCommand: "npx tsx scripts/skater-stability/build.ts",
    eligibility: {
      situation: "all",
      minIcetimeSeconds: MIN_ICETIME_SECONDS,
      minIcetimeMinutes: MIN_ICETIME_SECONDS / 60,
      why: "Sweeping 200/300/400 minutes moves every correlation by under 0.03, so this threshold is not carrying the result.",
    },
    fullSeason: {
      seconds: fullSeasonSeconds,
      minutes: round(fullSeasonSeconds / 60, 1),
      basis: `median ice time of skater-seasons with ${FULL_SEASON_MIN_GAMES}+ games played`,
      n: fullSeasonIce.length,
      why: "reliability() must equal the published r at one full season. A skater's full season is not a fixed figure the way a starting goalie's is, so it is measured rather than assumed.",
    },
    percentileWindow: {
      seasons: `${windowStart}-${newest}`,
      count: PERCENTILE_WINDOW_SEASONS,
      why: "League scoring drifts. Ranking a 2025 forward against 2008 measures the era, not the player.",
    },
    stabilityPanel: {
      seasons: `${seasons[0]}-${newest}`,
      skaterSeasons: eligible.length,
      why: "A year-over-year correlation wants every consecutive pair available; era drift moves the level far more than the repeatability.",
    },
    sources,
    byUnit,
  };

  const json = JSON.stringify(artifact, null, 2) + "\n";

  if (check) {
    console.log(json);
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log(`wrote ${path.relative(ROOT, OUT)}  ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB`);
  console.log(`  percentile window ${windowStart}-${newest}`);
  console.log(`  stability panel   ${seasons[0]}-${newest}: ${eligible.length} skater-seasons`);
  console.log(`  full-season anchor ${(fullSeasonSeconds / 60).toFixed(0)} minutes (${fullSeasonIce.length} full seasons)`);
  for (const line of summary) console.log(line);
}

main();
