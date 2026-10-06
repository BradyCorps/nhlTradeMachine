// ── dossier-context.ts ───────────────────────────────────────────
//
// Which season each part of the dossier is talking about.
//
// The page straddles two seasons by design: the VALUATION, role and STRAND are
// built from the frozen 2025-26 baseline, while the stat strip and EDGE panel
// show whatever season/competition the reader selected. Those were described by
// one sentence and a "Season reference" block that said "0 GP observed" beside a
// stat strip showing 3 GP — two true statements about different things, written
// as if they were about one.
//
// Everything here is a label. `observedGames` is the SELECTED season's games from
// the NHL summary; `modelGames` is a model assumption (0 at preseason) and is
// never mixed with it.

import { SEASON } from "@/app/lib/season-config";
import { observedLabel, type ObservedSelection } from "@/app/lib/observed-season";

/** "2025-26" → "2025–26" */
export const dashSeason = (s: string): string => s.replace("-", "–");

export const BASELINE_LABEL = `${dashSeason(SEASON.replaySeason)} regular season`;

export type DossierSection = "value" | "role" | "strand" | "scatter";

/** One-line source label for an analytical section. */
export function sectionSource(section: DossierSection, selection: ObservedSelection, observedGames: number | null): string {
  const selected = `${observedLabel(selection)} · ${observedGames == null ? "games not available" : `${observedGames} GP`} so far`;
  switch (section) {
    case "value":
      return `Source: ${BASELINE_LABEL} model inputs · ${dashSeason(SEASON.label)} contract ledger. Not the selected season (${selected}).`;
    case "role":
      return `Source: ${BASELINE_LABEL} measurements. Not the selected season (${selected}).`;
    case "strand":
      return `Source: ${BASELINE_LABEL} (frozen model baseline), ranked within the cohort named below. Not the selected season (${selected}).`;
    case "scatter":
      return `Source: ${BASELINE_LABEL} model components for same-position players with at least 20 GP that season.`;
  }
}

export interface SeasonReferenceRow { label: string; value: string }

export function seasonReferenceRows(input: {
  selection: ObservedSelection;
  observedGames: number | null;
  modelProjectedSeason: string;
  modelGames: number;
  statsSeason: string;
  contractSeason: string;
  modelVersion: string;
  computedOn: string;
}): SeasonReferenceRow[] {
  const { selection, observedGames } = input;
  return [
    { label: "Selected observations", value: `${observedLabel(selection)} · ${observedGames == null ? "not available" : `${observedGames} GP`}` },
    { label: "Model assumption", value: `${input.modelProjectedSeason} projected · ${input.modelGames} GP in model inputs` },
    { label: "Model stats baseline", value: `${input.statsSeason} · completed` },
    { label: "Contracts", value: input.contractSeason },
    { label: "Model", value: input.modelVersion },
    { label: "Valuation computed", value: `${input.computedOn} (when the model was run, not how fresh the data is)` },
  ];
}
