import { z } from "zod";

// ── NHL API Standings Schema ──────────────────────────────
export const NhlTeamSchema = z.object({
  teamId: z.number(),
  teamFullName: z.string(),
  points: z.number().catch(0),
  gamesPlayed: z.number().catch(1),
  goalsFor: z.number().catch(150),
  goalsAgainst: z.number().catch(150),
  pointPct: z.number().nullable().catch(0.5),
  regulationWins: z.number().catch(0),
});

export const NhlStandingsResponseSchema = z.object({
  data: z.array(NhlTeamSchema).catch([]),
});

// ── CapWages Scraped Player Schema ────────────────────────
export const ScrapedPlayerSchema = z.object({
  name: z.string().min(1),
  capHit: z.number().min(0.70).max(20.0), // Enforces strict NHL cap limits
  yearsRemaining: z.number().min(0).max(8),
  expiryStatus: z.string(),
  position: z.string(),
  teamSlug: z.string(),
});