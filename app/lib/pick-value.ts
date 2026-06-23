// ── Pick value is driven by team contention status, not a noisy season ──────
// A draft pick's worth tracks where its owner is *expected* to finish, which is
// captured by the team's phase (Contender → late pick, Tanking → lottery pick).
// Raw single-season standing is too noisy: a contender that had a down year due
// to injuries would otherwise have its future picks valued like a tanking team's
// lottery picks. Phase is admin-overridable, so the front-office judgment of
// where a team really sits drives pick value; live standing is a minor nudge.

// Expected finish per phase. 1 = best record (latest pick), 32 = worst (top pick).
const PHASE_EXPECTED_FINISH: Record<string, number> = {
  Contender:  6,
  Bubble:     12,
  Retooling:  18,
  Rebuilding: 25,
  Tanking:    30,
};

// Phase weight dominates; standing is a small within-band nudge so two
// same-phase teams don't get identical pick value.
const PHASE_WEIGHT = 0.7;

// Returns the effective standing (1-32) used to value a pick owned by a team in
// the given phase. Falls back to live standing when the phase is unknown.
export function pickEffectiveStanding(
  phase: string | null | undefined,
  standing: number | null | undefined,
): number {
  const liveStanding = Number.isFinite(standing as number)
    ? Math.min(32, Math.max(1, Math.round(standing as number)))
    : 16;

  const phaseFinish = phase ? PHASE_EXPECTED_FINISH[phase] : undefined;
  if (phaseFinish == null) return liveStanding; // unknown phase → trust standing

  const blended = phaseFinish * PHASE_WEIGHT + liveStanding * (1 - PHASE_WEIGHT);
  return Math.min(32, Math.max(1, Math.round(blended)));
}
