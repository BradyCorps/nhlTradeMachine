/** Development coverage only: no GAR, price, or trade-value labels are invented. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { auditManifest, type EvaluationManifest } from "./nav-evaluation-manifest";

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(field); field = "";
      if (c !== ",") {
        if (row.some(cell => cell !== "")) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else field += c;
  }
  if (quoted) throw new Error("Unterminated CSV quote");
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  if (!header) throw new Error("Empty CSV");
  header[0] = header[0].replace(/^\uFEFF/, "");
  if (new Set(header).size !== header.length) throw new Error("Duplicate CSV column");
  return rows.map(cells => {
    if (cells.length !== header.length) throw new Error("CSV column count mismatch");
    return Object.fromEntries(header.map((key, i) => [key, cells[i]]));
  });
}

function numeric(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function summarizeSource(rows: Record<string, string>[], season: number, goalie: boolean) {
  const all = rows.filter(row => row.situation === "all");
  const ids = new Map<string, number>();
  for (const row of all) ids.set(row.playerId, (ids.get(row.playerId) ?? 0) + 1);
  let invalidIdentity = 0, duplicateRows = 0, invalidExposure = 0;
  const validIds: string[] = [];
  const units = { F: 0, D: 0, G: 0 };
  const usable = { individualPoints: 0, individualExpectedGoals: 0, onIceXgDifference: 0, relativeXgaRate: 0, goalieGsax: 0 };
  for (const row of all) {
    if (!/^\d+$/.test(row.playerId) || Number(row.playerId) <= 0 || Number(row.season) !== season || !row.team?.trim()
      || !(goalie ? row.position === "G" : ["C", "L", "R", "W", "LW", "RW", "D"].includes(row.position))) {
      invalidIdentity++; continue;
    }
    // Do not guess how traded-player splits or total rows should be combined.
    if (ids.get(row.playerId)! > 1) { duplicateRows++; continue; }
    const ice = numeric(row.icetime), games = numeric(row.games_played);
    if (ice == null || ice <= 0 || games == null || games <= 0) { invalidExposure++; continue; }
    validIds.push(row.playerId);
    units[goalie ? "G" : row.position === "D" ? "D" : "F"]++;
    const has = (...fields: string[]) => fields.every(key => numeric(row[key]) !== null);
    if (goalie) {
      if (has("xGoals", "goals")) usable.goalieGsax++;
    } else {
      if (has("I_F_points")) usable.individualPoints++;
      if (has("I_F_xGoals")) usable.individualExpectedGoals++;
      if (has("OnIce_F_xGoals", "OnIce_A_xGoals")) usable.onIceXgDifference++;
      if (has("OnIce_A_xGoals", "OffIce_A_xGoals") && (numeric(row.timeOnBench) ?? 0) > 0) usable.relativeXgaRate++;
    }
  }
  return {
    summary: { season, kind: goalie ? "goalies" : "skaters", rows: rows.length, allSituationRows: all.length,
      invalidIdentity, duplicateRows, invalidExposure, eligibleDiagnosticRows: validIds.length, units, usable },
    validIds,
  };
}

export function runPilot(manifest: EvaluationManifest) {
  const integrity = auditManifest(manifest);
  if (integrity.integrity !== "pass") throw new Error(integrity.errors.join("; "));
  const sources = manifest.sources.map(source => summarizeSource(
    parseCsv(readFileSync(source.path, "utf8")), source.season, source.path.includes("goalies"),
  ));
  const transitions = [];
  for (const kind of ["skaters", "goalies"]) {
    const seasons = sources.filter(source => source.summary.kind === kind).sort((a, b) => a.summary.season - b.summary.season);
    for (let i = 1; i < seasons.length; i++) {
      const prior = new Set(seasons[i - 1].validIds);
      transitions.push({ kind, from: seasons[i - 1].summary.season, to: seasons[i].summary.season,
        uniqueIdentityPairs: seasons[i].validIds.filter(id => prior.has(id)).length });
    }
  }
  return {
    sourceIntegrity: "pass",
    sources: sources.map(source => source.summary),
    transitions,
    targetReadiness: {
      individualGar: "blocked: no replacement cohort or independently attributed goal target in these sources",
      marketPrice: "blocked: these sources contain no as-of signed contract ledger",
      compositeExchangeValue: "blocked: these sources contain no independently labelled transaction target",
      untouchedHoldout: "blocked: all source seasons have prior exposure",
    },
    calibrationReady: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/backtest/nav-target-pilot.ts")) {
  try {
    const manifest = JSON.parse(readFileSync("docs/analytics/nav01-evaluation-manifest.json", "utf8")) as EvaluationManifest;
    console.log(JSON.stringify(runPilot(manifest), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
