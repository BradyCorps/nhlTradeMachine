// ── Public request bounds (CXH9) ─────────────────────────────────
//
// `/api/simulate` was hardened in audit #4; `/api/match`, `/api/evaluate` and
// `/api/claude` were not. Between them they cast arbitrary JSON straight to a
// request type, accepted unbounded arrays and strings, and let a nested
// structure of any depth reach an LLM prompt.
//
// None of these endpoints authenticate. Anyone can POST to them, so "the
// client only ever sends thirty players" is an assumption about a program that
// is not the one making the request.
//
// The shared pieces live here so three routes cannot each pick a different
// ceiling for the same field. Following the precedent set by
// `sim-request-schema.ts`: permissive on FIELDS (`.passthrough()`, because the
// valuation engine reads ~30 optional inputs) and strict on STRUCTURE.

import { z } from "zod";

export const PUBLIC_LIMITS = {
  /** Ids are slugs and NHL ids; 200 is already generous. */
  MAX_ID: 200,
  MAX_NAME: 200,
  /** A trade package. Real ones are under ten. */
  MAX_PACKAGE: 40,
  /** A league's worth of clubs, with room for expansion. */
  MAX_TEAMS: 64,
  /** Every player in the league, plus prospects and picks. */
  MAX_PLAYERS: 3000,
  /** One club's roster, with prospects and picks attached. */
  MAX_ROSTER: 300,
  /** Entries in a caller-supplied NAV lookup. */
  MAX_NAV_ENTRIES: 4000,
  /** Prompt-bound free text (verdict messages, flag headlines). */
  MAX_TEXT: 2000,
  /** Items in any prompt-bound list. */
  MAX_LIST: 200,
} as const;

export const idString = z.string().min(1).max(PUBLIC_LIMITS.MAX_ID);
export const nameString = z.string().max(PUBLIC_LIMITS.MAX_NAME);

/** A finite number. Rejects NaN and ±Infinity, which JSON.parse happily makes. */
export const finiteNumber = z.number().finite();

/**
 * An asset as these endpoints receive it.
 *
 * Passthrough on purpose: the engine reads paces, EDGE, gravity and baselines
 * that no route enumerates. What is pinned is the structure a route indexes
 * on — an id it can look up, and numbers that are actually numbers.
 */
export const publicAssetSchema = z.object({
  id: idString,
  name: nameString.optional(),
  position: z.string().max(20).optional(),
  age: finiteNumber.optional(),
  capHit: finiteNumber.optional(),
  retainedPct: finiteNumber.optional(),
  yearsRemaining: finiteNumber.optional(),
}).passthrough();

export const publicTeamSchema = z.object({
  id: idString,
  name: nameString.optional(),
  capSpace: finiteNumber.optional(),
  standing: finiteNumber.optional(),
}).passthrough();

/**
 * A caller-supplied NAV lookup.
 *
 * Bounded because it is a record, and an unbounded record is the easiest way
 * to hand a route a hundred thousand keys to iterate.
 */
export const publicNavMapSchema = z
  .record(z.object({
    total: finiteNumber,
    off: finiteNumber.optional(),
    def: finiteNumber.optional(),
    age: finiteNumber.optional(),
    cap: finiteNumber.optional(),
    upside: finiteNumber.optional(),
  }).passthrough())
  .refine(
    map => Object.keys(map).length <= PUBLIC_LIMITS.MAX_NAV_ENTRIES,
    { message: `navMap exceeds ${PUBLIC_LIMITS.MAX_NAV_ENTRIES} entries` },
  );

/** The 400 every one of these routes returns, shaped the same way. */
export function invalidRequest(label: string, error: z.ZodError) {
  return {
    error: `Invalid ${label} request`,
    details: error.format(),
  };
}
