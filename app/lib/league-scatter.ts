// ── league-scatter.ts ────────────────────────────────────────────
//
// The data rules behind the dossier's league-context scatter, kept apart from
// the chart so they can be tested without a browser. Presentation only: every
// value plotted here is computed by the server page (calculateAssetNAV stage
// values) and passed in; nothing here calls or changes a valuation.
//
// WHAT MUST NOT MOVE
//   • The cohort is the page's eligible same-position players (≥20 GP) plus the
//     dossier player. Searching, selecting or clearing never adds, removes or
//     reorders cohort members.
//   • The median reference lines are computed from the WHOLE cohort exactly as
//     the previous chart computed them (upper median of `all`, index
//     floor(n/2)), so highlighting players cannot shift them.
//   • Axes are NAV contributions (the OFF and DEF stage values of the player's
//     X-NAV breakdown, in NAV points). They are not percentiles and not overall
//     player ratings; the labels say so.

import { matchesPlayerSearch } from "@/app/lib/player-search";

export interface ScatterPeer {
  id: string;
  name: string;
  teamId: string;
  /** Offensive contribution to NAV, NAV points. */
  off: number;
  /** Defensive contribution to NAV, NAV points. */
  def: number;
  /** Headline NAV. */
  nav: number;
  age: number;
}

/** Most comparison players that can be selected at once. */
export const MAX_COMPARISONS = 3;

/** Fewest plotted players for a league cloud to mean anything. */
export const MIN_PLOTTED = 5;

/** Unchanged from the previous chart: the upper median of the full cohort. */
export function upperMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function leagueMedians(all: readonly ScatterPeer[]): { off: number; def: number } {
  return { off: upperMedian(all.map(p => p.off)), def: upperMedian(all.map(p => p.def)) };
}

/** Axis padding, unchanged from the previous chart (8% of the span, with a floor of fallback). */
export function axisDomain(values: readonly number[], fallbackPad: number): [number, number] {
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || fallbackPad;
  return [lo - pad, hi + pad];
}

export type Quadrant = "both-above" | "off-only" | "def-only" | "both-below";

/** Neutral wording: position relative to the cohort medians, nothing more. */
export const QUADRANT_LABEL: Record<Quadrant, string> = {
  "both-above": "Above median on both",
  "off-only": "Above median on offence only",
  "def-only": "Above median on defence only",
  "both-below": "Below median on both",
};

export function quadrantOf(p: Pick<ScatterPeer, "off" | "def">, med: { off: number; def: number }): Quadrant {
  return p.off >= med.off
    ? (p.def >= med.def ? "both-above" : "off-only")
    : (p.def >= med.def ? "def-only" : "both-below");
}

export type ToggleResult =
  | { next: string[]; change: "added" | "removed" }
  | { next: string[]; change: "rejected"; reason: "full" | "current" | "unknown" };

/**
 * Add or remove a comparison player. Never mutates the cohort; refuses the
 * dossier player (always shown), unknown ids, and a fourth selection.
 */
export function toggleComparison(
  selected: readonly string[], id: string, currentId: string, cohortIds: ReadonlySet<string>,
): ToggleResult {
  if (id === currentId) return { next: [...selected], change: "rejected", reason: "current" };
  if (!cohortIds.has(id)) return { next: [...selected], change: "rejected", reason: "unknown" };
  if (selected.includes(id)) return { next: selected.filter(s => s !== id), change: "removed" };
  if (selected.length >= MAX_COMPARISONS) return { next: [...selected], change: "rejected", reason: "full" };
  return { next: [...selected, id], change: "added" };
}

/** Ids of cohort members whose name or club matches the search text. Pure highlight set. */
export function matchingIds(all: readonly ScatterPeer[], query: string): Set<string> {
  if (!query.trim()) return new Set();
  return new Set(all.filter(p => matchesPlayerSearch({ name: p.name, teamId: p.teamId }, query)).map(p => p.id));
}

export const signedDelta = (value: number): string => `${value > 0 ? "+" : ""}${Math.round(value)}`;
export const signedNav = (value: number): string => `${value > 0 ? "+" : ""}${value}`;

export interface ComparisonTableRow {
  id: string;
  name: string;
  teamId: string;
  isCurrent: boolean;
  off: number;
  def: number;
  nav: number;
  /** Differences from the dossier player; null on the dossier player's own row. */
  vs: { off: number; def: number; nav: number } | null;
}

/** The dossier player first, then the selected players in the order chosen. */
export function comparisonRows(current: ScatterPeer, selected: readonly ScatterPeer[]): ComparisonTableRow[] {
  const row = (p: ScatterPeer, isCurrent: boolean): ComparisonTableRow => ({
    id: p.id, name: p.name, teamId: p.teamId, isCurrent, off: p.off, def: p.def, nav: p.nav,
    vs: isCurrent ? null : { off: p.off - current.off, def: p.def - current.def, nav: p.nav - current.nav },
  });
  return [row(current, true), ...selected.map(p => row(p, false))];
}

/**
 * Chart labels for the dossier player and the selected players: last name, or
 * first initial + last name when two of them share a last name, so two points
 * are never both labelled just "Smith".
 */
export function chartLabels(players: readonly Pick<ScatterPeer, "id" | "name">[]): Map<string, string> {
  const last = (n: string) => n.trim().split(/\s+/).slice(-1)[0] ?? n;
  const counts = new Map<string, number>();
  for (const p of players) counts.set(last(p.name).toLowerCase(), (counts.get(last(p.name).toLowerCase()) ?? 0) + 1);
  return new Map(players.map(p => {
    const l = last(p.name);
    const first = p.name.trim().split(/\s+/)[0] ?? "";
    return [p.id, (counts.get(l.toLowerCase()) ?? 0) > 1 && first && first !== l ? `${first[0]}.\u00a0${l}` : l];
  }));
}

/** Marker style per selected slot: colour AND shape differ, so colour is never the only cue. */
export const SELECTED_STYLE = [
  { color: "var(--ledger-ice, #1a4b5b)", glyph: "●", shape: "circle" },
  { color: "var(--ledger-green, #2a7a3f)", glyph: "◆", shape: "diamond" },
  { color: "var(--ledger-amber, #8a6a1e)", glyph: "■", shape: "square" },
] as const;
