// ── Roster table (RL2 redesign) ──────────────────────────────────
//
// The Roster tab's first form was a single flat table with ten columns and a
// two-line badge block under every name. It read as tall and thin: a full
// screen of roster showed about eight players and told you their points, and
// the questions a GM actually opens that tab with — how old is this group, how
// much of it is signed past this year, which unit is thin — needed a different
// screen or a mental tally.
//
// Three changes, all of them here rather than in the markup so they are
// testable:
//
//   GROUPING   Forwards / Defence / Goaltenders, each with a subtotal. Every
//              roster tool a hockey fan already reads does this, and it is the
//              only way "the blue line is expensive and old" is visible at a
//              glance. It also lets goalies stop being rows of zeroes in
//              skater columns.
//   COLUMNS    Age, +/-, term and — for goalies — starts, SV% and GSAX. The
//              old table had the room and simply wasn't using it.
//   SORTING    Click a heading. Nulls sort last in BOTH directions, because a
//              player with no recorded value is not the smallest one, and the
//              order is a total order so it cannot jitter between renders.

import type { Asset } from "@/app/lib/trade-types";
import type { RosterRow } from "@/app/lib/roster-view";
import { displayPosition } from "@/app/lib/display-position";
import { PLAYER_TERMINOLOGY } from "@/app/lib/player-terminology";

export type RosterUnit = "F" | "D" | "G";
export type SortDirection = "asc" | "desc";

const FORWARD_POSITIONS = new Set(["C", "W", "L", "R", "F", "LW", "RW"]);

/** Which of the three tables a player belongs in. */
export function unitOf(position: string | null | undefined): RosterUnit {
  const pos = String(position ?? "").toUpperCase().trim();
  if (pos === "G") return "G";
  if (pos === "D" || pos === "LD" || pos === "RD") return "D";
  if (FORWARD_POSITIONS.has(pos)) return "F";
  // An unrecognised position is a skater rather than a lost row — a roster
  // that silently drops a player is worse than one that files him oddly.
  return "F";
}

export const UNIT_LABEL: Record<RosterUnit, string> = {
  F: "Forwards",
  D: "Defence",
  G: "Goaltenders",
};

/** Fixed display order — forwards, defence, goalies, as every roster reads. */
export const UNIT_ORDER: readonly RosterUnit[] = ["F", "D", "G"];

export interface RosterGroup {
  unit: RosterUnit;
  label: string;
  rows: RosterRow[];
}

/** Split rows into the three units, dropping any unit nobody dresses. */
export function groupRosterRows(rows: RosterRow[]): RosterGroup[] {
  return UNIT_ORDER
    .map(unit => ({
      unit,
      label: UNIT_LABEL[unit],
      rows: rows.filter(r => unitOf(r.asset.position) === unit),
    }))
    .filter(g => g.rows.length > 0);
}

// ── Contract shorthand ───────────────────────────────────────────

/**
 * What is left on the deal, in the space a column has.
 *
 * A pending free agent's remaining years are zero and saying "0y" reads as a
 * data error, so the status it is pending as is the honest answer.
 */
export function termLabel(asset: Asset): string {
  if (asset.pendingExtension) return "EXT";
  if (asset.expiresThisOffseason) return asset.contractStatus ?? "FA";
  const years = Math.max(0, Math.round(asset.yearsRemaining ?? 0));
  return years > 0 ? `${years}y` : "—";
}

/**
 * Sort value for term.
 *
 * A pending free agent has nothing left and sorts to zero; a signed extension
 * sorts on the term it carries, not on the expiring deal underneath it, since
 * that is how long the club actually holds the player.
 */
export function termValue(asset: Asset): number {
  if (asset.pendingExtension) return Math.max(0, Math.round(asset.pendingExtension.term ?? 0));
  if (asset.expiresThisOffseason) return 0;
  return Math.max(0, Math.round(asset.yearsRemaining ?? 0));
}

/** Movement clause, or an empty string. Shown beside the term. */
export function clauseLabel(asset: Asset): string {
  if (asset.hasNMC) return "NMC";
  if (asset.hasNTC) return "NTC";
  return "";
}

/** Cap hit actually carried, after retention. */
export const effectiveCap = (asset: Asset): number =>
  (asset.capHit ?? 0) * (1 - (asset.retainedPct ?? 0));

// ── Columns ──────────────────────────────────────────────────────

export interface RosterColumn {
  key: string;
  label: string;
  align: "left" | "right";
  /** Longer name for the heading's tooltip, where the label is an abbreviation. */
  title?: string;
  /** Sort value. `null` means "no value recorded" and always sorts last. */
  value: (row: RosterRow) => number | string | null;
  /** Cell text. The component styles it; it never re-derives it. */
  format: (row: RosterRow) => string;
  /** Direction applied the first time a reader picks this column. */
  initial: SortDirection;
}

const nameColumn: RosterColumn = {
  key: "name",
  label: "Player",
  align: "left",
  value: r => r.asset.name,
  format: r => r.asset.name,
  initial: "asc",
};

const posColumn: RosterColumn = {
  key: "pos",
  label: PLAYER_TERMINOLOGY.position,
  align: "left",
  value: r => displayPosition(r.asset.position, r.asset.secondaryPosition),
  format: r => displayPosition(r.asset.position, r.asset.secondaryPosition),
  initial: "asc",
};

const ageColumn: RosterColumn = {
  key: "age",
  label: "Age",
  align: "right",
  value: r => r.asset.age ?? null,
  format: r => (r.asset.age ? String(Math.round(r.asset.age)) : "—"),
  initial: "asc",
};

const gamesColumn: RosterColumn = {
  key: "gp",
  label: "GP",
  align: "right",
  title: "Games played",
  value: r => r.games,
  format: r => String(r.games),
  initial: "desc",
};

const navColumn: RosterColumn = {
  key: "nav",
  label: "F-NAV",
  align: "right",
  title: "Forward Net Asset Value",
  value: r => r.nav,
  format: r => (r.nav == null ? "—" : String(r.nav)),
  initial: "desc",
};

const defenseNavColumn: RosterColumn = {
  ...navColumn,
  label: "D-NAV",
  title: "Defense Net Asset Value",
};

const goalieNavColumn: RosterColumn = {
  ...navColumn,
  label: "G-NAV",
  title: "Goalie Net Asset Value",
};

const capColumn: RosterColumn = {
  key: "cap",
  label: PLAYER_TERMINOLOGY.contract,
  align: "right",
  title: "Cap hit carried, after retention",
  value: r => effectiveCap(r.asset),
  format: r => `$${effectiveCap(r.asset).toFixed(1)}M`,
  initial: "desc",
};

const termColumn: RosterColumn = {
  key: "term",
  label: PLAYER_TERMINOLOGY.yearsLeft,
  align: "right",
  title: "Years left on the deal, or the status it expires as",
  value: r => termValue(r.asset),
  format: r => termLabel(r.asset),
  initial: "desc",
};

const buildSkaterColumns = (nav: RosterColumn): readonly RosterColumn[] => [
  nameColumn,
  posColumn,
  ageColumn,
  gamesColumn,
  { key: "g", label: "G", align: "right", title: "Goals", value: r => r.goals, format: r => String(r.goals), initial: "desc" },
  { key: "a", label: "A", align: "right", title: "Assists", value: r => r.assists, format: r => String(r.assists), initial: "desc" },
  { key: "pts", label: "Pts", align: "right", title: "Points", value: r => r.points, format: r => String(r.points), initial: "desc" },
  {
    key: "plusMinus", label: "+/-", align: "right", title: "Plus/minus",
    value: r => r.asset.plusMinus ?? null,
    format: r => (r.asset.plusMinus == null ? "—" : (r.asset.plusMinus > 0 ? `+${r.asset.plusMinus}` : String(r.asset.plusMinus))),
    initial: "desc",
  },
  {
    key: "toi", label: "TOI", align: "right", title: "Average time on ice per game",
    value: r => r.toi,
    format: r => r.toi.toFixed(1),
    initial: "desc",
  },
  nav,
  capColumn,
  termColumn,
];

/** Forwards read F-NAV; kept as `SKATER_COLUMNS` since it was the original
 *  shared name — `columnsFor` is what actually picks per-unit now. */
export const SKATER_COLUMNS: readonly RosterColumn[] = buildSkaterColumns(navColumn);
export const DEFENSE_COLUMNS: readonly RosterColumn[] = buildSkaterColumns(defenseNavColumn);

export const GOALIE_COLUMNS: readonly RosterColumn[] = [
  nameColumn,
  // No position column: inside the goaltenders table it reads "G" every row.
  ageColumn,
  gamesColumn,
  {
    key: "gs", label: "GS", align: "right", title: "Games started",
    value: r => r.asset.gamesStarted ?? null,
    format: r => (r.asset.gamesStarted == null ? "—" : String(Math.round(r.asset.gamesStarted))),
    initial: "desc",
  },
  {
    key: "svPct", label: "SV%", align: "right", title: "Save percentage",
    value: r => r.asset.savePct ?? null,
    // Dropping the leading zero is the convention every box score uses.
    format: r => (r.asset.savePct == null ? "—" : r.asset.savePct.toFixed(3).replace(/^0/, "")),
    initial: "desc",
  },
  {
    key: "gsax", label: "GSAx", align: "right", title: "Goals saved above expected",
    value: r => r.asset.gsax ?? null,
    format: r => (r.asset.gsax == null ? "—" : r.asset.gsax.toFixed(1)),
    initial: "desc",
  },
  goalieNavColumn,
  capColumn,
  termColumn,
];

/** The column set a unit is read in. */
export const columnsFor = (unit: RosterUnit): readonly RosterColumn[] =>
  unit === "G" ? GOALIE_COLUMNS : unit === "D" ? DEFENSE_COLUMNS : SKATER_COLUMNS;

// ── Sorting ──────────────────────────────────────────────────────

export interface RosterSort {
  key: string;
  direction: SortDirection;
}

/**
 * What clicking a heading does.
 *
 * Picking a new column starts at that column's natural direction — points
 * descending, names ascending — rather than always ascending, which would make
 * the first click on every scoring column show the worst players.
 */
export function nextSort(current: RosterSort | null, column: RosterColumn): RosterSort {
  if (current?.key === column.key) {
    return { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key: column.key, direction: column.initial };
}

function compareValues(a: number | string | null, b: number | string | null, dir: SortDirection): number {
  // A missing value is not a small one. It sits at the bottom either way, so
  // reversing the sort never promotes a row of dashes to the top.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const cmp = typeof a === "string" || typeof b === "string"
    ? String(a).localeCompare(String(b))
    : a - b;
  return dir === "asc" ? cmp : -cmp;
}

/**
 * Sort rows by a column, with a total order underneath.
 *
 * Name then id break every remaining tie, so two players level on points
 * cannot swap places between renders — the same complaint that made
 * `buildRosterRows` deterministic in the first place.
 *
 * An unknown key returns the rows in their incoming order, which is the
 * production order `buildRosterRows` already established.
 */
export function sortRosterRows(
  rows: RosterRow[],
  sort: RosterSort | null,
  columns: readonly RosterColumn[],
): RosterRow[] {
  if (!sort) return [...rows];
  const column = columns.find(c => c.key === sort.key);
  if (!column) return [...rows];

  return [...rows].sort((x, y) =>
    compareValues(column.value(x), column.value(y), sort.direction)
    || x.asset.name.localeCompare(y.asset.name)
    || String(x.asset.id).localeCompare(String(y.asset.id)));
}

/** ARIA sort state for a heading, so the order is announced and not just drawn. */
export const ariaSortFor = (sort: RosterSort | null, column: RosterColumn): "ascending" | "descending" | "none" =>
  sort?.key !== column.key ? "none" : sort.direction === "asc" ? "ascending" : "descending";

// ── Subtotals ────────────────────────────────────────────────────

export interface UnitTotals {
  players: number;
  goals: number;
  assists: number;
  points: number;
  capHit: number;
  /** Plain mean over players with a known age; null when nobody has one. */
  avgAge: number | null;
}

export function unitTotals(rows: RosterRow[]): UnitTotals {
  const capHit = rows.reduce((sum, r) => sum + effectiveCap(r.asset), 0);
  const aged = rows.filter(r => (r.asset.age ?? 0) > 0);
  return {
    players: rows.length,
    goals: rows.reduce((s, r) => s + r.goals, 0),
    assists: rows.reduce((s, r) => s + r.assists, 0),
    points: rows.reduce((s, r) => s + r.points, 0),
    capHit,
    avgAge: aged.length === 0
      ? null
      : Math.round((aged.reduce((s, r) => s + (r.asset.age ?? 0), 0) / aged.length) * 10) / 10,
  };
}
