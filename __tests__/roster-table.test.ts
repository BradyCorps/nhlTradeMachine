import { describe, it, expect } from "vitest";
import type { Asset } from "@/app/lib/trade-types";
import type { RosterRow } from "@/app/lib/roster-view";
import {
  GOALIE_COLUMNS,
  SKATER_COLUMNS,
  UNIT_ORDER,
  ariaSortFor,
  clauseLabel,
  columnsFor,
  effectiveCap,
  groupRosterRows,
  nextSort,
  sortRosterRows,
  termLabel,
  termValue,
  unitOf,
  unitTotals,
} from "@/app/lib/roster-table";

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: over.name ? String(over.name).toLowerCase().replace(/\W/g, "") : "p1",
  teamId: "WPG",
  name: "Test Player",
  position: "C",
  age: 27,
  games: 82,
  ptsPace: 60,
  defRate: 0.08,
  avgTOI: 18,
  capHit: 5,
  yearsRemaining: 3,
  hasNMC: false,
  hasNTC: false,
  canRetain: true,
  retainedPct: 0,
  multiplier: 1,
  ...over,
} as Asset);

const row = (over: Partial<Asset> = {}, stats: Partial<RosterRow> = {}): RosterRow => ({
  asset: asset(over),
  games: 82, goals: 20, assists: 30, points: 50, toi: 18, nav: 60, simulated: false,
  ...stats,
});

describe("roster-table — units", () => {
  it("files every position into one of three tables", () => {
    for (const pos of ["C", "W", "L", "R", "F", "LW", "RW"]) expect(unitOf(pos)).toBe("F");
    for (const pos of ["D", "LD", "RD"]) expect(unitOf(pos)).toBe("D");
    expect(unitOf("G")).toBe("G");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(unitOf(" d ")).toBe("D");
    expect(unitOf("g")).toBe("G");
  });

  it("files an unrecognised position rather than losing the player", () => {
    // A dropped row is worse than an oddly-filed one.
    for (const pos of ["", null, undefined, "??", "Pick"]) expect(unitOf(pos)).toBe("F");
  });

  it("groups in a fixed order and omits units nobody dresses", () => {
    const rows = [row({ name: "Sk", position: "C" }), row({ name: "Gk", position: "G" })];
    const groups = groupRosterRows(rows);
    expect(groups.map(g => g.unit)).toEqual(["F", "G"]);
    expect(groups[0].rows).toHaveLength(1);
  });

  it("keeps every player when grouping — none dropped, none duplicated", () => {
    const rows = [
      row({ name: "A", position: "C" }), row({ name: "B", position: "D" }),
      row({ name: "C", position: "G" }), row({ name: "D", position: "RW" }),
      row({ name: "E", position: "??" }),
    ];
    const grouped = groupRosterRows(rows).flatMap(g => g.rows);
    expect(grouped).toHaveLength(rows.length);
    expect(new Set(grouped.map(r => r.asset.name)).size).toBe(rows.length);
  });

  it("returns nothing for an empty roster instead of three empty tables", () => {
    expect(groupRosterRows([])).toEqual([]);
  });

  it("has a column set for every unit", () => {
    for (const unit of UNIT_ORDER) expect(columnsFor(unit).length).toBeGreaterThan(0);
    expect(columnsFor("G")).toBe(GOALIE_COLUMNS);
    expect(columnsFor("F")).toBe(SKATER_COLUMNS);
    expect(columnsFor("D")).toBe(SKATER_COLUMNS);
  });
});

describe("roster-table — contract shorthand", () => {
  it("says how many years are left on a signed deal", () => {
    expect(termLabel(asset({ yearsRemaining: 3 }))).toBe("3y");
    expect(termLabel(asset({ yearsRemaining: 1 }))).toBe("1y");
  });

  it("names the status a pending free agent expires as, never '0y'", () => {
    const ufa = asset({ yearsRemaining: 0, expiresThisOffseason: true, contractStatus: "UFA" });
    expect(termLabel(ufa)).toBe("UFA");
    expect(termLabel(asset({ yearsRemaining: 0, expiresThisOffseason: true }))).toBe("FA");
  });

  it("shows a signed extension as term the club holds, not the expiring deal", () => {
    const extended = asset({
      yearsRemaining: 0, expiresThisOffseason: true, contractStatus: "RFA",
      pendingExtension: { aav: 18.8, term: 5, wouldHaveBeen: "RFA" },
    });
    expect(termLabel(extended)).toBe("EXT");
    expect(termValue(extended)).toBe(5);
    // An extended player must outrank an actual pending FA when sorting by term.
    expect(termValue(extended)).toBeGreaterThan(termValue(asset({ yearsRemaining: 0, expiresThisOffseason: true })));
  });

  it("sorts a pending free agent below every signed deal", () => {
    expect(termValue(asset({ yearsRemaining: 0, expiresThisOffseason: true }))).toBe(0);
    expect(termValue(asset({ yearsRemaining: 1 }))).toBeGreaterThan(0);
  });

  it("reports the movement clause, preferring the stronger one", () => {
    expect(clauseLabel(asset({ hasNMC: true, hasNTC: true }))).toBe("NMC");
    expect(clauseLabel(asset({ hasNTC: true }))).toBe("NTC");
    expect(clauseLabel(asset())).toBe("");
  });

  it("charges only the retained share of a cap hit", () => {
    expect(effectiveCap(asset({ capHit: 8, retainedPct: 0.5 }))).toBe(4);
    expect(effectiveCap(asset({ capHit: 8 }))).toBe(8);
  });
});

describe("roster-table — sorting", () => {
  const rows = [
    row({ name: "Alpha" }, { points: 40, nav: 10 }),
    row({ name: "Bravo" }, { points: 70, nav: 90 }),
    row({ name: "Delta" }, { points: 40, nav: null }),
    row({ name: "Charlie" }, { points: 40, nav: 55 }),
  ];
  const pts = SKATER_COLUMNS.find(c => c.key === "pts")!;
  const nav = SKATER_COLUMNS.find(c => c.key === "nav")!;
  const name = SKATER_COLUMNS.find(c => c.key === "name")!;

  it("starts a scoring column at its best players, not its worst", () => {
    expect(nextSort(null, pts)).toEqual({ key: "pts", direction: "desc" });
    expect(nextSort(null, name)).toEqual({ key: "name", direction: "asc" });
  });

  it("flips only when the same column is picked again", () => {
    const first = nextSort(null, pts);
    expect(nextSort(first, pts).direction).toBe("asc");
    expect(nextSort(first, nav)).toEqual({ key: "nav", direction: "desc" });
  });

  it("orders by the chosen column", () => {
    const out = sortRosterRows(rows, { key: "pts", direction: "desc" }, SKATER_COLUMNS);
    expect(out[0].asset.name).toBe("Bravo");
  });

  it("breaks ties by name so the order cannot jitter between renders", () => {
    const out = sortRosterRows(rows, { key: "pts", direction: "desc" }, SKATER_COLUMNS);
    expect(out.slice(1).map(r => r.asset.name)).toEqual(["Alpha", "Charlie", "Delta"]);
    // Same input in a different order must produce the same output.
    const reversed = sortRosterRows([...rows].reverse(), { key: "pts", direction: "desc" }, SKATER_COLUMNS);
    expect(reversed.map(r => r.asset.name)).toEqual(out.map(r => r.asset.name));
  });

  it("keeps rows with no recorded value at the bottom in BOTH directions", () => {
    const desc = sortRosterRows(rows, { key: "nav", direction: "desc" }, SKATER_COLUMNS);
    const asc = sortRosterRows(rows, { key: "nav", direction: "asc" }, SKATER_COLUMNS);
    expect(desc[desc.length - 1].asset.name).toBe("Delta");
    expect(asc[asc.length - 1].asset.name).toBe("Delta");
  });

  it("reverses the ranked players when the direction flips", () => {
    const desc = sortRosterRows(rows, { key: "nav", direction: "desc" }, SKATER_COLUMNS)
      .filter(r => r.nav != null).map(r => r.asset.name);
    const asc = sortRosterRows(rows, { key: "nav", direction: "asc" }, SKATER_COLUMNS)
      .filter(r => r.nav != null).map(r => r.asset.name);
    expect(asc).toEqual([...desc].reverse());
  });

  it("does not mutate the rows it was given", () => {
    const input = [...rows];
    sortRosterRows(input, { key: "pts", direction: "asc" }, SKATER_COLUMNS);
    expect(input.map(r => r.asset.name)).toEqual(rows.map(r => r.asset.name));
  });

  it("leaves the production order alone when nothing is picked or the key is unknown", () => {
    const names = rows.map(r => r.asset.name);
    expect(sortRosterRows(rows, null, SKATER_COLUMNS).map(r => r.asset.name)).toEqual(names);
    expect(sortRosterRows(rows, { key: "nope", direction: "asc" }, SKATER_COLUMNS).map(r => r.asset.name)).toEqual(names);
  });

  it("announces the order it is drawing", () => {
    expect(ariaSortFor({ key: "pts", direction: "desc" }, pts)).toBe("descending");
    expect(ariaSortFor({ key: "pts", direction: "asc" }, pts)).toBe("ascending");
    expect(ariaSortFor({ key: "pts", direction: "asc" }, nav)).toBe("none");
    expect(ariaSortFor(null, pts)).toBe("none");
  });
});

describe("roster-table — every column is renderable and sortable", () => {
  const sample = row({ position: "G", savePct: 0.915, gsax: 8.2, gamesStarted: 55, plusMinus: -4 });
  const blank = row({
    position: "G", age: 0, plusMinus: null, savePct: undefined, gsax: undefined,
    gamesStarted: undefined, yearsRemaining: 0,
  }, { nav: null });

  for (const [label, columns] of [["skater", SKATER_COLUMNS], ["goalie", GOALIE_COLUMNS]] as const) {
    it(`${label} columns format a full row and an empty one without throwing`, () => {
      for (const col of columns) {
        expect(typeof col.format(sample), col.key).toBe("string");
        expect(col.format(blank), col.key).not.toBe("");
        expect(col.format(blank), col.key).not.toContain("NaN");
        expect(col.format(blank), col.key).not.toContain("undefined");
      }
    });

    it(`${label} column keys are unique`, () => {
      const keys = columns.map(c => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it(`${label} columns all sort`, () => {
      for (const col of columns) {
        expect(() => sortRosterRows([sample, blank], { key: col.key, direction: "desc" }, columns)).not.toThrow();
      }
    });
  }

  it("drops the leading zero on save percentage, as a box score does", () => {
    const svPct = GOALIE_COLUMNS.find(c => c.key === "svPct")!;
    expect(svPct.format(sample)).toBe(".915");
  });

  it("signs plus/minus explicitly", () => {
    const pm = SKATER_COLUMNS.find(c => c.key === "plusMinus")!;
    expect(pm.format(row({ plusMinus: 12 }))).toBe("+12");
    expect(pm.format(row({ plusMinus: -12 }))).toBe("-12");
    expect(pm.format(row({ plusMinus: 0 }))).toBe("0");
  });
});

describe("roster-table — unit subtotals", () => {
  const rows = [
    row({ name: "A", capHit: 8, age: 30 }, { goals: 20, assists: 30, points: 50 }),
    row({ name: "B", capHit: 4, retainedPct: 0.5, age: 24 }, { goals: 10, assists: 10, points: 20 }),
  ];

  it("adds up the group", () => {
    const t = unitTotals(rows);
    expect(t.players).toBe(2);
    expect(t.points).toBe(70);
    expect(t.goals).toBe(30);
    expect(t.assists).toBe(40);
    expect(t.capHit).toBe(10);   // 8 + (4 × 0.5)
    expect(t.avgAge).toBe(27);
  });

  it("reports no average age rather than zero when nobody has one", () => {
    expect(unitTotals([row({ age: 0 })]).avgAge).toBeNull();
    expect(unitTotals([]).avgAge).toBeNull();
  });

  it("totals an empty group to zero", () => {
    expect(unitTotals([])).toMatchObject({ players: 0, points: 0, capHit: 0 });
  });
});
