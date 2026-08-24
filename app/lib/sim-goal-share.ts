import type { PlayerRoleKey } from "@/app/lib/player-roles";

// SIM-P1-6 — coefficients were fit on 2022-23→2024-25 MoneyPuck
// player-season pairs and cleared an untouched 2024-25→2025-26 holdout.
// Re-run `npm run backtest:sim-goal-share` before changing any value here.
const INTERCEPT = 0.297497;
const ANCHOR_WEIGHT = 0.245644;
const DEFENSE_ADJUSTMENT = -0.156085;
const LINE_ADJUSTMENT = 0.022592;
const PP_ADJUSTMENT: Record<1 | 2, number> = { 1: 0.030756, 2: 0.012043 };
const TOI_ADJUSTMENT = { F: -0.043999, D: -0.005483 } as const;

// A role only moves the split when the historical sample could validate it.
// EDGE-only roles have a neutral coefficient until enough seasons exist to
// backtest them; their labels remain display-only in the meantime.
const ROLE_ADJUSTMENT: Partial<Record<PlayerRoleKey, number>> = {
  HIGH_DANGER_DISTRIBUTOR: -0.022933,
  SLOT_HUNTER: 0.019475,
  NET_FRONT_DISRUPTOR: 0.007272,
  VOLUME_SHOOTER: 0.034720,
  FLOOR_RAISER: -0.012690,
};

export interface SimGoalShareSignals {
  position: string;
  /** Existing xG/points goal-share signal, or the missing-sample prior. */
  anchorGoalShare: number;
  role?: PlayerRoleKey | null;
  /** Forward line (1–4) or defense pair (1–3). */
  line?: number | null;
  powerPlayUnit?: 1 | 2 | null;
  /** Prior per-game usage in minutes; zero/missing is treated as unknown. */
  avgTOI?: number | null;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Predict what share of a skater's points should be goals. The model shrinks
 * the noisy xG/points ratio toward the real positional distribution, then lets
 * evidence-backed scoring role and deployment move the goal-vs-assist split.
 */
export function simGoalShare(signals: SimGoalShareSignals): number {
  const isD = signals.position === "D";
  const maxLine = isD ? 3 : 4;
  const line = signals.line != null && Number.isInteger(signals.line)
    ? clamp(signals.line, 1, maxLine)
    : null;
  const lineScore = line == null ? 0 : 1 - ((line - 1) / (maxLine - 1));
  const toiCenter = isD ? 19 : 15;
  const toiScore = signals.avgTOI != null && Number.isFinite(signals.avgTOI) && signals.avgTOI > 0
    ? clamp((signals.avgTOI - toiCenter) / 5, -1.5, 1.5)
    : 0;
  const ppAdjustment = signals.powerPlayUnit
    ? PP_ADJUSTMENT[signals.powerPlayUnit]
    : 0;

  const raw = INTERCEPT
    + ANCHOR_WEIGHT * clamp(signals.anchorGoalShare, 0, 1)
    + (isD ? DEFENSE_ADJUSTMENT : 0)
    + (signals.role ? ROLE_ADJUSTMENT[signals.role] ?? 0 : 0)
    + LINE_ADJUSTMENT * lineScore
    + ppAdjustment
    + TOI_ADJUSTMENT[isD ? "D" : "F"] * toiScore;

  return clamp(raw, isD ? 0.12 : 0.22, isD ? 0.40 : 0.55);
}
