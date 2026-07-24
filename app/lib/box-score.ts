// ── Box-score line from per-82 paces (VAL2) ──────────────────────
// The card derived GP / G / A / PTS by rounding each pace independently, so a
// thin sample produced an internally inconsistent line: over 3 GP, goalsPace
// and assistsPace each round to 0 while ptsPace rounds to 1 — "0 G, 0 A, 1 PT".
// Round goals and assists, then define points as their sum, exactly like a real
// box score, so the row is always self-consistent.

export interface BoxScoreLine {
  gp: number;
  g: number;
  a: number;
  pts: number;
}

export function boxScoreFromPace(input: {
  games?: number | null;
  goalsPace?: number | null;
  assistsPace?: number | null;
}): BoxScoreLine {
  const gp = Math.max(0, Math.round(input.games ?? 0));
  const g = Math.round(((input.goalsPace ?? 0) * gp) / 82);
  const a = Math.round(((input.assistsPace ?? 0) * gp) / 82);
  return { gp, g, a, pts: g + a };
}
