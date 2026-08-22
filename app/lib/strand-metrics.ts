// ── strand-metrics.ts ────────────────────────────────────────────
//
// ONE definition per STRAND/percentile metric, consumed by BOTH the STRAND rails
// (the dossier DNA shape) and the percentile card. Before this, the two surfaces
// disagreed: the rails were a fixed min-max index (`norm(val, min, max)`) while
// the card was a cohort percentile — so an elite OPS read 83 on one and 99th on
// the other, and lower-is-better direction was applied inconsistently. Now every
// surface reads the SAME derived result — raw value + cohort + direction →
// percentile — so the numbers always agree, and the cohort is named.
//
// Direction is baked into `extract` (SUPP returns −xgaRelTM so higher = stingier;
// OZ returns the offensive-zone-start share) with `invert` reserved for the one
// case where the displayed raw is naturally lower-is-better (goalie GAA). No
// metric silently substitutes a value: a missing input yields a null percentile
// (rendered as "no data"), never a faked 50th.

import { ordinal } from "./ordinal";

export interface StrandMetricDef {
  key: string;
  label: string;
  /** Read the display-ready value from a player-ish object; null when absent. */
  extract: (p: PlayerLike) => number | null;
  /** True only when a LOW extracted value is good (GAA). Direction is otherwise
   *  carried by `extract`. */
  invert?: boolean;
  /** Faint raw figure under the rail / beside the bar. */
  format: (v: number) => string;
  /** Tooltip when present. `pct` is the cohort percentile (0–100). */
  title: (v: number, pct: number | null) => string;
  /** Tooltip when the input is missing. */
  absent: string;
}

/** The permissive player shape the extractors read — Asset, PlayerData and the
 *  slim compare-peer all satisfy it. */
export type PlayerLike = Record<string, number | null | undefined | string>;

const num = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) ? v : null;

/**
 * Percentile (0–100) of `raw` within a cohort of the same metric, direction-aware.
 * Needs at least `minCohort` real values or returns null — no faked 50th.
 */
export function metricPercentile(
  raw: number | null,
  cohortRaws: (number | null | undefined)[],
  invert = false,
  minCohort = 10,
): number | null {
  if (raw == null || !isFinite(raw)) return null;
  const vals: number[] = [];
  for (const v of cohortRaws) { const n = num(v); if (n != null) vals.push(n); }
  if (vals.length < minCohort) return null;
  const x = invert ? -raw : raw;
  let count = 0;
  for (const v of vals) {
    const d = invert ? -v : v;
    if (d < x) count += 1;
    else if (d === x) count += 0.5;
  }
  return Math.round((count / vals.length) * 100);
}

// ── The registry ────────────────────────────────────────────────
// Keyed so any surface picks its subset and they still agree on the shared keys.

const sign = (v: number) => (v > 0 ? "+" : "");

export const STRAND_METRIC: Record<string, StrandMetricDef> = {
  pts:   { key: "pts",   label: "PTS/82", extract: p => num(p.ptsPace),  format: v => v.toFixed(1),
           title: (v, pct) => `Scoring pace ${v.toFixed(1)} pts/82 · ${pctText(pct)}`, absent: "Scoring pace unavailable" },
  ops:   { key: "ops",   label: "OPS",    extract: p => num(p.ops),      format: v => v.toFixed(1),
           title: (v, pct) => `Offensive Point Shares ${v.toFixed(1)} · ${pctText(pct)}`, absent: "Offensive Point Shares unavailable" },
  dps:   { key: "dps",   label: "DPS",    extract: p => num(p.dps),      format: v => v.toFixed(1),
           title: (v, pct) => `Defensive Point Shares ${v.toFixed(1)} · ${pctText(pct)}`, absent: "Defensive Point Shares unavailable" },
  xg:    { key: "xg",    label: "xG",     extract: p => num(p.xGPace),   format: v => `${v.toFixed(0)} xG/82`,
           title: (v, pct) => `Expected goals ${v.toFixed(1)}/82 · ${pctText(pct)}`, absent: "Expected goals unavailable" },
  xgrel: { key: "xgrel", label: "NOIV",   extract: p => num(p.xgRelTM),  format: v => `${sign(v)}${v.toFixed(1)}%`,
           title: (v, pct) => `On-ice xG% vs teammates ${sign(v)}${v.toFixed(1)} · ${pctText(pct)}`, absent: "On-ice xG relative to teammates unavailable" },
  toi:   { key: "toi",   label: "TOI",    extract: p => num(p.avgTOI),   format: v => `${v.toFixed(1)} min`,
           title: (v, pct) => `Ice time ${v.toFixed(1)} min/gm · ${pctText(pct)}`, absent: "Ice time unavailable" },
  supp:  { key: "supp",  label: "SUPP",   extract: p => { const x = num(p.xgaRelTM); return x == null ? null : -x; }, format: v => `${sign(v)}${v.toFixed(2)} xGA`,
           title: (v, pct) => `Chance suppression vs teammates ${sign(v)}${v.toFixed(2)} (higher = stingier) · ${pctText(pct)}`, absent: "Chance suppression relative to teammates unavailable" },
  qoc:   { key: "qoc",   label: "QoC",    extract: p => num(p.qocIndex), format: v => v.toFixed(0),
           title: (v, pct) => `Quality of competition ${Math.round(v)}/100 · ${pctText(pct)}`, absent: "Quality of competition unavailable" },
  oz:    { key: "oz",    label: "OZ%",    extract: p => { const d = num(p.dzPct); return d == null ? null : (1 - d) * 100; }, format: v => `${v.toFixed(0)}% OZ`,
           title: (v, pct) => `Offensive-zone starts ${v.toFixed(0)}% · ${pctText(pct)}`, absent: "Zone deployment unavailable" },
  // Goalies (3×3).
  gsax:  { key: "gsax",  label: "GSAX",   extract: p => num(p.gsax),     format: v => `${sign(v)}${v.toFixed(1)}`,
           title: (v, pct) => `Goals saved above expected ${sign(v)}${v.toFixed(1)} · ${pctText(pct)}`, absent: "Goals saved above expected unavailable" },
  svpct: { key: "svpct", label: "SV%",    extract: p => num(p.savePct),  format: v => (v * 100).toFixed(1),
           title: (v, pct) => `Save % ${(v * 100).toFixed(1)} · ${pctText(pct)}`, absent: "Save percentage unavailable" },
  hdsv:  { key: "hdsv",  label: "HDSV",   extract: p => num(p.baselineHdsvPct), format: v => (v * 100).toFixed(1),
           title: (v, pct) => `High-danger save % ${(v * 100).toFixed(1)} · ${pctText(pct)}`, absent: "High-danger save % unavailable (no EDGE sample)" },
  wrkld: { key: "wrkld", label: "WRKLD",  extract: p => num(p.gamesStarted) ?? num(p.gamesPlayed) ?? num(p.games), format: v => `${v.toFixed(0)} GP`,
           title: (v, pct) => `Workload ${v.toFixed(0)} appearances · ${pctText(pct)}`, absent: "Workload unavailable" },
  busy:  { key: "busy",  label: "BUSY",   extract: p => num(p.shotsPerGame), format: v => `${v.toFixed(1)}/gm`,
           title: (v, pct) => `Shots faced ${v.toFixed(1)}/game · ${pctText(pct)}`, absent: "Shot volume unavailable" },
  gaa:   { key: "gaa",   label: "GAA",    extract: p => num(p.gaa), invert: true, format: v => v.toFixed(2),
           title: (v, pct) => `Goals-against average ${v.toFixed(2)} (lower = better) · ${pctText(pct)}`, absent: "Goals-against average unavailable" },
};

const pctText = (pct: number | null): string => (pct == null ? "no cohort" : `${ordinal(pct)} pct`);

/** The rails each surface draws, in order. Off rail then def/support rail. */
export const SKATER_RAILS = { off: ["ops", "xg", "xgrel", "toi"], def: ["dps", "supp", "qoc", "oz"] } as const;
export const GOALIE_RAILS = { off: ["gsax", "svpct", "hdsv"], def: ["wrkld", "busy", "gaa"] } as const;

// Shaped to be directly assignable to StrandDisplay's StrandTrait (label, val,
// title, raw, unavailable, display) so the existing renderer needs no adapter —
// `display` carries the percentile number it prints.
export interface StrandRail {
  label: string;
  /** 0–1 (percentile/100) for the shape; 0.5 mid-rail when unavailable. */
  val: number;
  /** The cohort percentile 0–100, or null when there was no data. */
  percentile: number | null;
  /** The percentile shown by the renderer (undefined when unavailable). */
  display?: number;
  title: string;
  raw?: string;
  unavailable: boolean;
  cohortN: number;
}

/** Build one rail from the registry key: the player's percentile within the cohort. */
export function buildRail(key: string, player: PlayerLike, cohort: PlayerLike[]): StrandRail {
  const def = STRAND_METRIC[key];
  const raw = def.extract(player);
  const cohortRaws = cohort.map(def.extract);
  const n = cohortRaws.filter(v => v != null).length;
  const pct = metricPercentile(raw, cohortRaws, def.invert);
  if (raw == null || pct == null) {
    return { label: def.label, val: 0.5, percentile: null, title: def.absent, unavailable: true, cohortN: n };
  }
  return {
    label: def.label,
    val: pct / 100,
    percentile: pct,
    display: pct,
    title: def.title(raw, pct),
    raw: def.format(raw),
    unavailable: false,
    cohortN: n,
  };
}

/** The full percentile-based STRAND for a player against a cohort — the single
 *  build both the dossier rails and the card read. */
export function buildStrandPercentiles(
  player: PlayerLike,
  cohort: PlayerLike[],
  isGoalie: boolean,
): { off: StrandRail[]; def: StrandRail[] } {
  const rails = isGoalie ? GOALIE_RAILS : SKATER_RAILS;
  return {
    off: rails.off.map(k => buildRail(k, player, cohort)),
    def: rails.def.map(k => buildRail(k, player, cohort)),
  };
}
