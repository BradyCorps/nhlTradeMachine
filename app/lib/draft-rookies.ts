// ============================================================
// draft-rookies.ts — turn Draft Night selections into roster players
//
// A drafted prospect has no contract, so it never appeared on a roster. By
// default we sign every first-round selection to a standard 3-year entry-level
// deal so the player joins their drafting team as a tradeable asset. draftOverall
// is carried through, so X-NAV prices them on the prospect/pedigree path.
//
// Pure + deterministic (no I/O) so it is unit-testable.
// ============================================================

import type { Asset } from "@/app/lib/trade-types";
import type { DraftResult } from "@/app/lib/draft-2026";
import { SEASON } from "@/app/lib/season-config";

// Standard entry-level deal: 3 years at the ELC cap hit, league-average rookie.
export const ROOKIE_ELC_CAP_HIT = 0.95;
export const ROOKIE_ELC_YEARS = 3;
const ROOKIE_AGE = 18;

// NHL-equivalency factors: translate junior/college scoring to an NHL pace so a
// freshly drafted prospect carries a sensible projection instead of zero.
const NHLE: Record<string, number> = {
  NHL: 1.0, AHL: 0.47, KHL: 0.77, SHL: 0.59, LIIGA: 0.54, NL: 0.46, CZECHIA: 0.49,
  DEL: 0.44, NCAA: 0.41, USHL: 0.27, OHL: 0.30, WHL: 0.28, QMJHL: 0.28, USNTDP: 0.35,
  J20: 0.19, MHL: 0.18, U18: 0.15, HOCKEYALLSVENSKAN: 0.38, "U20 NATIONELL": 0.19,
};

function normalizePos(pos: string): "C" | "W" | "D" | "G" {
  const u = (pos || "").toUpperCase();
  if (u.includes("G")) return "G";
  if (u.includes("D")) return "D";
  if (u.includes("C")) return "C";
  return "W"; // LW / RW / F / W → winger slot
}

function slug(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

export function rookieAssetFromDraft(
  result: DraftResult,
  opts: { capHit?: number; years?: number } = {},
): Asset {
  const p = result.prospect;
  const factor = NHLE[p.league.toUpperCase()] ?? 0.25;
  const prospectPtsPace = p.gp > 0
    ? Math.round((p.pts / p.gp) * factor * 82 * 10) / 10
    : null;
  const capHit = opts.capHit ?? ROOKIE_ELC_CAP_HIT;
  const years = opts.years ?? ROOKIE_ELC_YEARS;

  return {
    id: `draft-${SEASON.draftYear}-${result.overall}-${slug(p.name)}`,
    teamId: result.team,
    name: p.name,
    position: normalizePos(p.pos),
    age: ROOKIE_AGE,
    games: 0,            // no NHL games yet → X-NAV uses the pedigree path
    ptsPace: 0,
    defRate: 0.08,
    avgTOI: 0,
    capHit,
    lastCapHit: capHit,
    yearsRemaining: years,
    hasNMC: false,
    hasNTC: false,
    canRetain: true,
    retainedPct: 0,
    multiplier: 1.0,
    draftYear: SEASON.draftYear,
    draftOverall: result.overall,
    prospectPtsPace,
    contractStatus: "SIGNED",
    expiresThisOffseason: false,
    hasLiveStats: false,
  };
}

// Every first-round selection, signed to the default ELC, ready to drop onto
// db.players. Each lands on its drafting team (result.team).
export function draftedRookieAssets(
  results: DraftResult[],
  opts: { capHit?: number; years?: number } = {},
): Asset[] {
  return results.map((r) => rookieAssetFromDraft(r, opts));
}
