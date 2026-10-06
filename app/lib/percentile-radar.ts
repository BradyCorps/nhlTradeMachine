// ── percentile-radar.ts ──────────────────────────────────────────
//
// The data model behind the card's percentile radar prototype. Presentation
// only: it consumes the percentile rows the card already computes (cohort,
// direction and tie handling are unchanged) and decides how they are laid out.
//
// RULES (each is tested)
//   • Fixed 0–100 scale. A labelled 50th-percentile reference ring.
//   • Fixed axis order per position group, so two radars are always comparable.
//   • A missing percentile is `null` and stays null. It is never drawn at zero or
//     at the 50 ring. (Recharts plots a null at the centre, so the component
//     must filter by this model, not trust the chart.)
//   • No polygon area, no combined score, no overall classification. The shape
//     is not a rating.
//   • Only production and on-ice-impact metrics sit on the radar. Time on ice,
//     competition and offensive-zone starts describe how a player is USED, not
//     how well he plays, so they are listed beside it and never drawn on it.

import { ordinal } from "@/app/lib/ordinal";

export type CardGroup = "F" | "D" | "G";
export type RadarGroup = "production" | "impact" | "usage";

export interface CardPercentileRow {
  key: string;
  label: string;
  value: number | null;
  pct: number | null;
  formatted: string;
  median: string;
}

export interface RadarMetricMeta {
  key: string;
  group: RadarGroup;
  /** Plain-language unit for the table. */
  unit: string;
  /** One line on what the number is. */
  what: string;
}

export const RADAR_METRICS: Record<string, RadarMetricMeta> = {
  pts:     { key: "pts",     group: "production", unit: "points per 82 GP",         what: "Scoring pace, goals plus assists." },
  goals:   { key: "goals",   group: "production", unit: "goals per 82 GP",          what: "Goal-scoring pace." },
  assists: { key: "assists", group: "production", unit: "assists per 82 GP",        what: "Assist pace." },
  xg:      { key: "xg",      group: "production", unit: "expected goals per 82 GP", what: "Expected goals from his own shots (shot quality × volume)." },
  ops:     { key: "ops",     group: "production", unit: "offensive point shares",   what: "Offence measured in standings points." },
  xgrel:   { key: "xgrel",   group: "impact",     unit: "on-ice xG% vs teammates",  what: "Team expected-goal share with him on ice minus without him." },
  supp:    { key: "supp",    group: "impact",     unit: "xGA/60 vs teammates",      what: "Chances against with him on ice relative to teammates; higher means fewer against." },
  dps:     { key: "dps",     group: "impact",     unit: "defensive point shares",   what: "Defence measured in standings points." },
  toi:     { key: "toi",     group: "usage",      unit: "minutes per game",         what: "Ice time. Describes role and deployment, not ability." },
  qoc:     { key: "qoc",     group: "usage",      unit: "index 0–100",              what: "Quality-of-competition proxy. Describes deployment, not ability." },
  oz:      { key: "oz",      group: "usage",      unit: "% of shifts starting in the offensive zone", what: "Zone starts. Describes deployment, not ability." },
};

/** Fixed axis order. Production first, then impact; never reordered. */
export const RADAR_AXES: Record<"F" | "D", readonly string[]> = {
  F: ["pts", "goals", "assists", "xg", "ops", "xgrel", "supp", "dps"],
  D: ["pts", "ops", "xgrel", "supp", "dps"],
};
export const USAGE_KEYS: Record<"F" | "D", readonly string[]> = {
  F: ["toi"],
  D: ["toi", "qoc", "oz"],
};

export const RADAR_DOMAIN: readonly [number, number] = [0, 100];
export const RADAR_REFERENCE = 50;
export const RADAR_TICKS: readonly number[] = [0, 25, 50, 75, 100];

export interface RadarCell {
  pct: number | null;
  formatted: string;
  median: string;
}
export interface RadarMetric extends RadarMetricMeta {
  label: string;
  player: RadarCell;
  /** Undefined when no comparison player is selected. */
  compare?: RadarCell;
}
export interface RadarModel {
  axes: RadarMetric[];
  usage: RadarMetric[];
  /** True only when every axis has a real percentile for the player. */
  playerComplete: boolean;
  /** Undefined without a comparison; otherwise whether every axis is present. */
  compareComplete?: boolean;
}

const cell = (r: CardPercentileRow | undefined): RadarCell => ({
  pct: r && r.pct != null && Number.isFinite(r.pct) ? Math.min(100, Math.max(0, r.pct)) : null,
  formatted: r ? r.formatted : "—",
  median: r ? r.median : "—",
});

/** Null for goalies (three metrics are not a radar) or when the rows lack the group's axes entirely. */
export function buildRadarModel(
  group: CardGroup, rows: readonly CardPercentileRow[], compareRows?: readonly CardPercentileRow[] | null,
): RadarModel | null {
  if (group === "G") return null;
  const byKey = (list: readonly CardPercentileRow[]) => new Map(list.map(r => [r.key, r]));
  const mine = byKey(rows), theirs = compareRows ? byKey(compareRows) : null;
  const make = (key: string): RadarMetric => {
    const meta = RADAR_METRICS[key];
    const row = mine.get(key);
    return {
      ...meta, label: row?.label ?? key.toUpperCase(), player: cell(row),
      ...(theirs ? { compare: cell(theirs.get(key)) } : {}),
    };
  };
  const axes = RADAR_AXES[group].map(make);
  const usage = USAGE_KEYS[group].map(make);
  return {
    axes, usage,
    playerComplete: axes.every(a => a.player.pct != null),
    ...(theirs ? { compareComplete: axes.every(a => a.compare?.pct != null) } : {}),
  };
}

export type SeriesKey = "player" | "compare";

/** Whether the filled polygon may be drawn. Never over a gap: a polygon through a missing axis invents a value. */
export const canDrawPolygon = (model: RadarModel, series: SeriesKey): boolean =>
  series === "player" ? model.playerComplete : model.compareComplete === true;

/** Rows for the Recharts data prop. Null stays null; the component must skip it. */
export function radarChartData(model: RadarModel): Array<{ axis: string; key: string; player: number | null; compare: number | null; ref: number }> {
  return model.axes.map(a => ({
    axis: a.label, key: a.key, player: a.player.pct, compare: a.compare?.pct ?? null, ref: RADAR_REFERENCE,
  }));
}

/** Spoken/printed detail for one axis. Never claims a verdict. */
export function axisDetail(m: RadarMetric, playerName: string, compareName?: string): string {
  const mine = m.player.pct == null
    ? `${playerName}: unavailable (no value in the data for this metric)`
    : `${playerName}: ${ordinal(m.player.pct)} percentile, value ${m.player.formatted} ${m.unit}`;
  const theirs = m.compare === undefined || !compareName ? ""
    : m.compare.pct == null
      ? `; ${compareName}: unavailable`
      : `; ${compareName}: ${ordinal(m.compare.pct)} percentile, value ${m.compare.formatted}`;
  return `${m.label}. ${mine}${theirs}; group median ${m.player.median}. ${m.what}`;
}
