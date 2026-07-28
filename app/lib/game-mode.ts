// ── Armchair GM run length ───────────────────────────────────────
// Chosen once, before the offseason. Kept here rather than inline in the modal
// so the copy and the length are stated in one place — the mode select, the HUD
// and any later summary all describe the same thing.

import { SEASON } from "./season-config";

export type GameMode = "SINGLE" | "CUP_RUN";

export interface GameModeSpec {
  label: string;
  length: string;
  description: string;
  startsAt: string;
  /** Seasons the mode runs for; 1 means it ends after the season is simulated. */
  seasons: number;
}

export const GAME_MODES: Record<GameMode, GameModeSpec> = {
  SINGLE: {
    label: "Single Season",
    length: "1 year",
    startsAt: SEASON.label,
    seasons: 1,
    description:
      "Run one offseason and one season. Trade freely, set your lineup, simulate, and see how the year lands.",
  },
  CUP_RUN: {
    label: "Cup Run Challenge",
    length: "3 years",
    startsAt: SEASON.label,
    seasons: 3,
    description:
      "Three seasons under one mandate. Rosters age, contracts expire, prospects arrive, and your cap decisions compound. Win before the clock runs out.",
  },
};

export const isCupRun = (mode: GameMode | null): boolean => mode === "CUP_RUN";
