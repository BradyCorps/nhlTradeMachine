// ── retention-ledger.ts ──────────────────────────────────────────
//
// DATA-05: the NHL's real retention rules — a club may retain on at most
// three contracts at once, no single retention can exceed 50% of a
// player's cap hit, and a retained slot stays occupied for the retained
// contract's full remaining term — are CBA facts about a CLUB, not about
// Armchair GM's Cup Run specifically. This module used to live entirely
// inside cup-run.ts, so only the simulation engine ever enforced the
// three-slot limit; Trade Machine's `/api/evaluate` checked the 50% rule
// but had no idea the slot limit existed, so a single proposed trade could
// retain on four different players in one shot with nothing to stop it.
//
// Extracted so both consumers import the same rule instead of one of them
// re-deriving (or, as here, simply omitting) it. `cup-run.ts` re-exports
// everything below so its existing callers are unaffected.

export interface RetentionEntry {
  playerId: string;
  playerName: string;
  pct: number;                      // 0-0.5
  aavRetained: number;              // $M against the cap while active
  yearsRemaining: number;           // slot stays occupied this long
}

export const MAX_RETENTION_SLOTS = 3;                 // per team, CBA
export const MAX_RETAINED_SHARE_OF_CAP = 0.15;        // aggregate soft cap
export const MAX_RETENTION_PCT = 0.5;                 // 50% of AAV

export function retentionCheck(
  ledger: RetentionEntry[],
  proposed: { playerId: string; playerName: string; pct: number; capHit: number; yearsRemaining: number }[],
  capCeiling: number,
): { ok: boolean; reason?: string } {
  const active = ledger.filter((e) => e.yearsRemaining > 0);
  for (const p of proposed) {
    if (p.pct > MAX_RETENTION_PCT + 1e-9) {
      return { ok: false, reason: `Retention on ${p.playerName} exceeds the 50% maximum.` };
    }
  }
  if (active.length + proposed.length > MAX_RETENTION_SLOTS) {
    return {
      ok: false,
      reason: `Retention slots full — ${active.length} of ${MAX_RETENTION_SLOTS} in use, and slots stay occupied for the retained contract's full term.`,
    };
  }
  const activeDollars = active.reduce((s, e) => s + e.aavRetained, 0);
  const proposedDollars = proposed.reduce((s, p) => s + p.capHit * p.pct, 0);
  const limit = capCeiling * MAX_RETAINED_SHARE_OF_CAP;
  if (activeDollars + proposedDollars > limit + 1e-9) {
    return {
      ok: false,
      reason: `Aggregate retained salary would exceed ${Math.round(MAX_RETAINED_SHARE_OF_CAP * 100)}% of the cap ($${limit.toFixed(1)}M).`,
    };
  }
  return { ok: true };
}

export function addRetention(
  ledger: RetentionEntry[],
  proposed: { playerId: string; playerName: string; pct: number; capHit: number; yearsRemaining: number }[],
): RetentionEntry[] {
  return [
    ...ledger,
    ...proposed.map((p) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      pct: p.pct,
      aavRetained: Math.round(p.capHit * p.pct * 100) / 100,
      yearsRemaining: Math.max(1, p.yearsRemaining),
    })),
  ];
}

/** Decrement retained-slot terms at each rollover; expired slots free up. */
export function rollRetentionLedger(ledger: RetentionEntry[]): RetentionEntry[] {
  return ledger
    .map((e) => ({ ...e, yearsRemaining: e.yearsRemaining - 1 }))
    .filter((e) => e.yearsRemaining > 0);
}

/**
 * How many of a club's three retention slots one proposed trade alone would
 * occupy — every outgoing asset this club is retaining salary on, counted
 * without needing any cross-trade session state. This is what a single-trade
 * "four retained contracts" stress test actually checks: Trade Machine has
 * no persistent retention ledger across separate trades the way Armchair
 * GM's Cup Run does, but a trade that retains on four players in one motion
 * violates the three-slot limit regardless of what came before it.
 */
export function retainedSlotsInTrade(assets: { retainedPct?: number | null }[]): number {
  return assets.filter((a) => (a.retainedPct ?? 0) > 0).length;
}
