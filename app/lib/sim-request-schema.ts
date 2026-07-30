// ── SIM request validation (audit #4) ────────────────────────────
// The /api/simulate endpoint used to cast req.json() straight to its request
// type — no shape, no bounds, no finite-number or unique-id checks. That let a
// malformed or oversized body reach the engine (crashes) and made the endpoint
// a soft DoS target. This schema validates structure and bounds and rejects
// with 400 before any work runs.
//
// It is deliberately permissive on FIELDS: player/team objects `.passthrough()`
// so the ~30 engine inputs the sim reads (paces, EDGE, gravity, baselines …)
// survive untouched. It is strict on STRUCTURE: required string ids, array
// length caps, a finite seed, unique team/player ids, and team-id references
// that actually resolve. (Enforcing the exact canonical 32-team league belongs
// with the future server-side-league refactor, not client-payload validation.)

import { z } from "zod";

export const SIM_LIMITS = {
  MAX_TEAMS: 64,
  MIN_TEAMS: 2,
  MAX_PLAYERS: 3000,
  MAX_TRADES: 200,
  MAX_TRADE_SIDE: 30,
} as const;

const idString = z.string().min(1).max(200);

const simPlayerSchema = z.object({
  id: idString,
  position: z.string().min(1).max(20),
  capHit: z.number().finite().optional(),
  retainedPct: z.number().finite().optional(),
}).passthrough();

const simTeamSchema = z.object({
  id: idString,
  name: z.string().max(200).optional(),
}).passthrough();

const tradeSchema = z.object({
  homeTeamId: z.string().max(200),
  partnerTeamId: z.string().max(200),
  outgoing: z.array(simPlayerSchema).max(SIM_LIMITS.MAX_TRADE_SIDE),
  incoming: z.array(simPlayerSchema).max(SIM_LIMITS.MAX_TRADE_SIDE),
}).passthrough();

export const simRequestSchema = z.object({
  homeTeamId: idString,
  partnerTeamId: z.string().max(200), // may be "" for a solo-team season
  teams: z.array(simTeamSchema).min(SIM_LIMITS.MIN_TEAMS).max(SIM_LIMITS.MAX_TEAMS),
  players: z.array(simPlayerSchema).max(SIM_LIMITS.MAX_PLAYERS),
  trades: z.array(tradeSchema).max(SIM_LIMITS.MAX_TRADES),
  // CX7c — which season of a Cup Run this is. Absent for ordinary
  // single-season play, which is Year 1.
  cupRunYear: z.number().int().min(1).max(10).optional(),
  lineup: z.object({
    startingGoalies: z.record(z.string().nullable().optional()).optional(),
    orders: z.record(z.any()).optional(),
  }).passthrough().optional(),
  seed: z.number().finite().optional(),
  lineupContext: z.boolean().optional(),
}).passthrough().superRefine((body, ctx) => {
  const teamIds = new Set<string>();
  for (const t of body.teams) {
    if (teamIds.has(t.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate team id: ${t.id}`, path: ["teams"] });
    }
    teamIds.add(t.id);
  }

  const playerIds = new Set<string>();
  for (const p of body.players) {
    if (playerIds.has(p.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate player id: ${p.id}`, path: ["players"] });
    }
    playerIds.add(p.id);
  }

  if (!teamIds.has(body.homeTeamId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "homeTeamId does not match any team", path: ["homeTeamId"] });
  }
  if (body.partnerTeamId && !teamIds.has(body.partnerTeamId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "partnerTeamId does not match any team", path: ["partnerTeamId"] });
  }
  for (const [i, trade] of body.trades.entries()) {
    if (!teamIds.has(trade.homeTeamId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "trade.homeTeamId does not match any team", path: ["trades", i, "homeTeamId"] });
    }
    if (!teamIds.has(trade.partnerTeamId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "trade.partnerTeamId does not match any team", path: ["trades", i, "partnerTeamId"] });
    }
  }
});

export type SimRequestParsed = z.infer<typeof simRequestSchema>;
