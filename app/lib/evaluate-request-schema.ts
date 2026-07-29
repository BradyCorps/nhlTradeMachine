// ── /api/evaluate request contract ───────────────────────────────
//
// Lifted out of the route so the contract can be tested directly, following
// the precedent `sim-request-schema.ts` set. A route file cannot export
// anything but its handlers, and a schema nobody can import is a schema nobody
// can prove — which is how `assets` shipped with a trade-package ceiling on a
// field that carries a whole league.

import { z } from "zod";
import { PUBLIC_LIMITS, idString, nameString } from "@/app/lib/public-request-bounds";

export const normalizeAssetPosition = (position: unknown) => {
  if (typeof position !== "string") return "C";
  const trimmed = position.trim();
  if (trimmed.toLowerCase() === "pick") return "Pick";
  const normalized = trimmed.toUpperCase();
  if (normalized === "L" || normalized === "R" || normalized === "LW" || normalized === "RW") return "W";
  if (normalized === "C" || normalized === "D" || normalized === "G" || normalized === "W") return normalized;
  // Coerce any unrecognized/missing position (e.g. "UNKNOWN", "F", "") to a skater
  // default so one bad roster row can't 400 the entire NAV batch.
  return "C";
};

// CXH9 — bounds. Ids and names were unbounded strings and every numeric field
// accepted NaN and ±Infinity, both of which `JSON.parse` produces happily and
// which then propagate silently through the valuation engine as poisoned
// arithmetic. `.finite()` rejects them at the door.
export const AssetSchema = z.object({
  id: idString,
  name: nameString,
  position: z.preprocess(normalizeAssetPosition, z.enum(["C", "W", "D", "G", "Pick"])),
  age: z.number().finite().nullish().default(27),
  capHit: z.number().finite().nullish().default(0),
  yearsRemaining: z.number().finite().nullish().default(1),
  capCeiling: z.number().finite().nullish(),
  retainedPct: z.number().finite().nullish(),
  extensionCapHit: z.number().finite().nullish(),
  extensionYears: z.number().finite().nullish(),
  ptsPace: z.number().finite().nullish(),
  goalsPace: z.number().finite().nullish(),
  assistsPace: z.number().finite().nullish(),
  xGPace: z.number().finite().nullish(),
  defRate: z.number().finite().nullish(),
  avgTOI: z.number().finite().nullish(),
  qocRank: z.number().finite().nullish(),
  qocIndex: z.number().finite().nullish(),
  draftOverall: z.number().finite().nullish(),
  prospectPtsPace: z.number().finite().nullish(),
  xgRelTM: z.number().finite().nullish(),
  hdFinishingDelta: z.number().finite().nullish(),
  edgeSpeedMaxMph: z.number().finite().nullish(),
  edgeBurstsOver20: z.number().finite().nullish(),
  xgaRelTM: z.number().finite().nullish(),
  dzPct: z.number().finite().nullish(),
  ops: z.number().finite().nullish(),
  dps: z.number().finite().nullish(),
  games: z.number().finite().nullish(),
  gsax: z.number().finite().nullish(),
  savePct: z.number().finite().nullish(),
  gamesStarted: z.number().finite().nullish(),
  teamXga60: z.number().finite().nullish(),
  teamHdca60: z.number().finite().nullish(),
  round: z.number().finite().nullish(),
  year: z.number().finite().nullish(),
  teamStanding: z.number().finite().nullish(),
  isProtected: z.boolean().nullish(),
  multiplier: z.number().finite().nullish(),
  hasLiveStats: z.boolean().nullish(),
  baselineGsax: z.number().finite().nullish(),
  baselinePtsPace: z.number().finite().nullish(),
  baselineGameScore: z.number().finite().nullish(),
  baselineDpsProxy: z.number().finite().nullish(),
  baselineXgRel: z.number().finite().nullish(),
  ppPtsPace82: z.number().finite().nullish(),
  pkTimeShare: z.number().finite().nullish(),
  baselineIxg82: z.number().finite().nullish(),
  baselineHits82: z.number().finite().nullish(),
  baselineBlocks82: z.number().finite().nullish(),
  pairXgfPct: z.number().finite().nullish(),
  pairDriverScore: z.number().finite().nullish(),
  baselineHdsvPct: z.number().finite().nullish(),
  teamId: z.string().nullish(),
  hasNMC: z.boolean().nullish(),
  hasNTC: z.boolean().nullish(),
  canRetain: z.boolean().nullish(),
  tradeBlockStatus: z.enum(["requested", "available", "blocked", "untouchable"]).nullish(),
  tradeBlockNote: z.string().nullish(),
}).passthrough();

export const TeamSchema = z.object({
  id: idString,
  name: nameString,
  capSpace: z.number().finite(),
  standing: z.number().finite(),
  phase: z.string().max(64).optional(),
  needs: z.array(z.any()).max(PUBLIC_LIMITS.MAX_LIST).optional(),
}).passthrough();

export const EvaluateRequestSchema = z.object({
  // `assets` is the NAV BATCH, not the trade package — `fetchNavMap` posts a
  // whole league here to price every player at once (Armchair GM boot, the
  // admin trade tool). CXH9 capped it at MAX_PACKAGE, which is the ceiling for
  // the package fields below, and that 400'd a normal 3 MB Armchair GM load.
  // The package is `tradeOutgoing`/`tradeIncoming`; those keep MAX_PACKAGE.
  assets: z.array(AssetSchema).max(PUBLIC_LIMITS.MAX_PLAYERS).optional(),
  runTrade: z.boolean().optional(),
  tradeOutgoing: z.array(AssetSchema).max(PUBLIC_LIMITS.MAX_PACKAGE).optional(),
  tradeIncoming: z.array(AssetSchema).max(PUBLIC_LIMITS.MAX_PACKAGE).optional(),
  homeTeam: TeamSchema.optional(),
  partnerTeam: TeamSchema.optional(),
  allHomeRoster: z.array(AssetSchema).max(PUBLIC_LIMITS.MAX_ROSTER).optional(),
  allPartnerRoster: z.array(AssetSchema).max(PUBLIC_LIMITS.MAX_ROSTER).optional(),
  capCeiling: z.number().finite().nullish(),
});
