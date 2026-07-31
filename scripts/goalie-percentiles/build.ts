// ── Goalie percentile + stability artifact ───────────────────────
//
//   npx tsx scripts/goalie-percentiles/build.ts
//   npx tsx scripts/goalie-percentiles/build.ts --check   # verify, write nothing
//
// WHY THIS EXISTS
//
// Every goalie number the app shows is scaled against a hand-picked range:
// `norm(gsax, -15, 25)`, `norm(savePct, 0.890, 0.935)`, `norm(hdsv, 0.780,
// 0.880)`. Those were guesses, made because there was no goalie population to
// measure against. There is one now — 1,604 goalie-seasons from 2008-24 plus
// the current year, on an identical 36-column schema — so the scale can be the
// real distribution instead.
//
// It also answers a question the engine never asked: how much of a goalie's
// season carries into the next one. That number decides how hard to regress a
// single year, and it is the difference between a point estimate and an honest
// one.
//
// TWO WINDOWS, ON PURPOSE
//
//   PERCENTILES come from a recent window. Goaltending has drifted — league
//   save percentage in 2008 is not the same scale as 2024 — so ranking a
//   current goalie against 2008 would flatter him for reasons that have
//   nothing to do with him.
//
//   STABILITY comes from the full panel. A year-over-year correlation needs as
//   many consecutive-season pairs as it can get, and drift across eras affects
//   the level far more than the repeatability.
//
// OUTPUT is aggregate only — quantile tables and correlations, no player rows —
// so it is small enough to commit and carries nothing identifiable.

import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "app/data/goalie-percentiles.json");

const SOURCES = [
  "OtherData/HistoricalData/goalies_2008_to_2024.csv",
  "OtherData/2025_26Data/2025_26_goalies.csv",
];

/** Minimum ice time to enter the population, in seconds (~17 starts). */
const MIN_ICETIME_SECONDS = 1000 * 60;

/** Seasons the percentile scale is drawn from, counting back from the newest. */
const PERCENTILE_WINDOW_SEASONS = 5;

/** Quantiles emitted, in percent. Every fifth point plus the tails. */
const QUANTILES = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
                   55, 60, 65, 70, 75, 80, 85, 90, 95, 99];

interface Row { [k: string]: string }

const num = (r: Row, k: string): number | null => {
  const v = Number(r[k]);
  return Number.isFinite(v) ? v : null;
};

/** A metric the artifact publishes. */
interface MetricSpec {
  key: string;
  label: string;
  /** True when a HIGHER raw value is the better one. */
  higherIsBetter: boolean;
  unit: string;
  note: string;
  of: (r: Row) => number | null;
}

const per60 = (r: Row, k: string): number | null => {
  const v = num(r, k), ice = num(r, "icetime");
  return v == null || !ice ? null : (v * 3600) / ice;
};

const saveRate = (r: Row, shots: string, goals: string): number | null => {
  const s = num(r, shots), g = num(r, goals);
  return s == null || g == null || s <= 0 ? null : 1 - g / s;
};

const METRICS: MetricSpec[] = [
  {
    key: "gsaxPer60", label: "GSAx/60", higherIsBetter: true, unit: "goals per 60",
    note: "Goals saved above expected. The least repeatable of these — see stability.",
    of: r => {
      const xg = num(r, "xGoals"), g = num(r, "goals"), ice = num(r, "icetime");
      return xg == null || g == null || !ice ? null : ((xg - g) * 3600) / ice;
    },
  },
  {
    key: "savePct", label: "SV%", higherIsBetter: true, unit: "save rate",
    note: "Shots on goal stopped, all situations.",
    of: r => saveRate(r, "ongoal", "goals"),
  },
  {
    key: "highDangerSvPct", label: "HD SV%", higherIsBetter: true, unit: "save rate",
    note: "Save rate on high-danger shots.",
    of: r => saveRate(r, "highDangerShots", "highDangerGoals"),
  },
  {
    key: "mediumDangerSvPct", label: "MD SV%", higherIsBetter: true, unit: "save rate",
    note: "Save rate on medium-danger shots.",
    of: r => saveRate(r, "mediumDangerShots", "mediumDangerGoals"),
  },
  {
    key: "lowDangerSvPct", label: "LD SV%", higherIsBetter: true, unit: "save rate",
    note: "Save rate on low-danger shots — the ones that should not go in.",
    of: r => saveRate(r, "lowDangerShots", "lowDangerGoals"),
  },
  {
    key: "gaa", label: "GAA", higherIsBetter: false, unit: "goals per 60",
    note: "Goals against per sixty minutes. Team-dependent; read beside GSAx.",
    of: r => per60(r, "goals"),
  },
  {
    key: "reboundsVsExpectedPer60", label: "Rebound control", higherIsBetter: false,
    unit: "rebounds per 60 vs expected",
    note: "Rebounds allowed against expectation, negative being better. The most repeatable thing in this table — and partly a property of the team clearing the crease, so it is not purely a goalie skill.",
    of: r => {
      const reb = num(r, "rebounds"), xreb = num(r, "xRebounds"), ice = num(r, "icetime");
      return reb == null || xreb == null || !ice ? null : ((reb - xreb) * 3600) / ice;
    },
  },
  {
    key: "freezeVsExpectedPer60", label: "Freeze rate", higherIsBetter: true,
    unit: "freezes per 60 vs expected",
    note: "Pucks frozen against expectation — killing a sequence rather than extending it.",
    of: r => {
      const f = num(r, "freeze"), xf = num(r, "xFreeze"), ice = num(r, "icetime");
      return f == null || xf == null || !ice ? null : ((f - xf) * 3600) / ice;
    },
  },
];

// ── CSV ──────────────────────────────────────────────────────────

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",");
  return lines.slice(1).map(line => {
    // These files carry no quoted commas; assert rather than assume.
    const cells = line.split(",");
    const row: Row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
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
  const num = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
  const den = Math.sqrt(
    a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, y) => s + (y - mb) ** 2, 0),
  );
  return den === 0 ? NaN : num / den;
};

const round = (n: number, dp = 6) => Number(n.toFixed(dp));

// ── Build ────────────────────────────────────────────────────────

function main() {
  const check = process.argv.includes("--check");

  const rows: Row[] = [];
  const sources = SOURCES.map(rel => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) throw new Error(`missing source: ${rel}`);
    const text = fs.readFileSync(abs, "utf8");
    const parsed = parseCsv(text).filter(r => r.situation === "all");
    rows.push(...parsed);
    return {
      path: rel,
      bytes: Buffer.byteLength(text),
      sha256: crypto.createHash("sha256").update(text).digest("hex"),
      rowsAtSituationAll: parsed.length,
    };
  });

  const eligible = rows.filter(r => (num(r, "icetime") ?? 0) >= MIN_ICETIME_SECONDS);
  const seasons = [...new Set(eligible.map(r => Number(r.season)))].sort((a, b) => a - b);
  if (seasons.length === 0) throw new Error("no eligible goalie-seasons");

  const newest = seasons[seasons.length - 1];
  const windowStart = newest - (PERCENTILE_WINDOW_SEASONS - 1);
  const windowRows = eligible.filter(r => Number(r.season) >= windowStart);

  // Stability: consecutive-season pairs for the same goalie, full panel.
  const byGoalie = new Map<string, Map<number, Row>>();
  for (const r of eligible) {
    const m = byGoalie.get(r.playerId) ?? new Map<number, Row>();
    m.set(Number(r.season), r);
    byGoalie.set(r.playerId, m);
  }

  const metrics: Record<string, unknown> = {};
  for (const spec of METRICS) {
    const values = windowRows.map(spec.of).filter((v): v is number => v != null).sort((a, b) => a - b);

    const a: number[] = [], b: number[] = [];
    for (const seasonMap of byGoalie.values()) {
      for (const [season, row] of seasonMap) {
        const next = seasonMap.get(season + 1);
        if (!next) continue;
        const x = spec.of(row), y = spec.of(next);
        if (x != null && y != null) { a.push(x); b.push(y); }
      }
    }

    metrics[spec.key] = {
      label: spec.label,
      unit: spec.unit,
      higherIsBetter: spec.higherIsBetter,
      note: spec.note,
      n: values.length,
      mean: round(mean(values)),
      sd: round(sd(values)),
      quantiles: Object.fromEntries(QUANTILES.map(p => [p, round(quantile(values, p))])),
      stability: { pairs: a.length, r: round(pearson(a, b), 4) },
    };
  }

  const artifact = {
    schemaVersion: "goalie-percentiles-v1",
    generatedAt: new Date().toISOString(),
    generationCommand: "npx tsx scripts/goalie-percentiles/build.ts",
    eligibility: {
      situation: "all",
      minIcetimeSeconds: MIN_ICETIME_SECONDS,
      minIcetimeMinutes: MIN_ICETIME_SECONDS / 60,
    },
    percentileWindow: {
      seasons: `${windowStart}-${newest}`,
      count: PERCENTILE_WINDOW_SEASONS,
      goalieSeasons: windowRows.length,
      why: "Goaltending drifts. Ranking a current goalie against 2008 would flatter him for reasons unrelated to him.",
    },
    stabilityPanel: {
      seasons: `${seasons[0]}-${newest}`,
      goalieSeasons: eligible.length,
      goalies: byGoalie.size,
      why: "A year-over-year correlation wants every consecutive pair available; era drift moves the level far more than the repeatability.",
    },
    sources,
    metrics,
  };

  const json = JSON.stringify(artifact, null, 2) + "\n";

  if (check) {
    console.log(json);
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log(`wrote ${path.relative(ROOT, OUT)}  ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB`);
  console.log(`  percentile window ${windowStart}-${newest}: ${windowRows.length} goalie-seasons`);
  console.log(`  stability panel   ${seasons[0]}-${newest}: ${eligible.length} goalie-seasons, ${byGoalie.size} goalies`);
  for (const spec of METRICS) {
    const m = metrics[spec.key] as any;
    console.log(`  ${spec.label.padEnd(16)} n=${String(m.n).padStart(4)}  r=${String(m.stability.r).padStart(6)}`);
  }
}

main();
