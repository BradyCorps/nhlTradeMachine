// ── Breakout / regression model ───────────────────────────────
// One data-driven model shared by the single-season sim (/api/simulate) and
// the multi-year Cup Run rollover (season-rollover). Replaces the old
// finishing-delta coin flip with a weighted read of the signals that actually
// drive a breakout, so young players pop for reasons you can point at — tied to
// their real-life counterpart — not because the RNG smiled:
//
//   • Opportunity — you cannot break out from the press box. Real top-six/
//     top-four minutes lift the odds; buried usage suppresses them.
//   • Pedigree — a high draft slot or a strong NHLe prospect pace makes a
//     young player a live breakout candidate.
//   • Finishing luck — cold high-danger finishing vs league (NHL EDGE) is
//     bounce-back fuel; running hot is regression fuel. (xG-vs-goals is the
//     coarser fallback when no EDGE snapshot exists.)
//   • Burst — hockey is a burst game: explosive skating (EDGE 20+ mph bursts /
//     top speed) fattens a young player's upside tail. Only applied where the
//     EDGE sample exists; never invented for players without it.
//
// Everything is a bounded, additive nudge on an age/role base — burst and
// pedigree modify, they are not headline scalars. Deterministic and pure.

export type BreakoutDriver =
  | "AGE" | "OPPORTUNITY" | "PEDIGREE" | "FINISHING_LUCK" | "BURST" | "NONE";

export interface BreakoutSignals {
  age: number;
  position?: string;
  ptsPace?: number | null;
  stablePace?: number | null;        // engine anchor pace; falls back to ptsPace
  priorGames?: number | null;
  avgTOI?: number | null;            // opportunity
  xGPace?: number | null;
  goalsPace?: number | null;
  hdFinishingDelta?: number | null;  // NHL EDGE finishing vs league (preferred luck)
  prospectPtsPace?: number | null;   // NHLe pedigree
  draftOverall?: number | null;      // draft-slot pedigree
  edgeBurstsOver20?: number | null;  // NHL EDGE explosiveness
  edgeSpeedMaxMph?: number | null;
  changedScenery?: boolean;
}

export interface BreakoutResult {
  breakout: number;
  regression: number;
  driver: BreakoutDriver;   // dominant reason (for events / recap legibility)
  hasEdgeSignal: boolean;   // was any EDGE burst input present?
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const posType = (position?: string): "F" | "D" | "G" =>
  position === "G" ? "G" : position === "D" ? "D" : "F";

export function computeBreakout(s: BreakoutSignals): BreakoutResult {
  const pos = posType(s.position);
  // Goalies don't run through the scoring breakout model.
  if (pos === "G") return { breakout: 0, regression: 0, driver: "NONE", hasEdgeSignal: false };

  const pace = s.stablePace ?? s.ptsPace ?? 0;
  const priorGames = s.priorGames ?? null;
  const toi = s.avgTOI ?? null;

  // ── Age / role base ──────────────────────────────────────────
  const isProspect = s.age <= 22 &&
    (priorGames == null || priorGames < 45 || (s.prospectPtsPace ?? 0) > pace);
  const isYoungReg = !isProspect && s.age <= 24 &&
    (priorGames == null || priorGames >= 20);

  let breakout =
    isProspect ? 0.18 :
    isYoungReg ? 0.14 :
    s.age <= 26 && pace < 55 ? 0.08 :
    s.age >= 30 ? 0.04 :
    0.06;
  let regression =
    s.age >= 32 ? 0.16 :
    isProspect ? 0.10 :
    pace >= 85 ? 0.10 :
    s.age >= 30 ? 0.13 :
    s.age <= 23 ? 0.06 :
    0.09;

  // Aging-well: a productive, heavily-deployed, durable veteran declines
  // slower than a same-age player fading out — so the model doesn't punish a
  // 36-year-old 90-point centre the same as a washed depth vet.
  const agingWell = s.age >= 31 && pace >= 65 &&
    (toi == null || toi >= (pos === "D" ? 21 : 17)) &&
    (priorGames == null || priorGames >= 45);
  if (agingWell) regression = Math.min(regression, 0.08);

  // Track additive breakout contributions so we can name the dominant driver.
  const contrib: Partial<Record<BreakoutDriver, number>> = { AGE: breakout };

  // ── Finishing luck (best source first) ───────────────────────
  if (s.hdFinishingDelta != null) {
    if (s.hdFinishingDelta <= -0.02) { breakout += 0.08; contrib.FINISHING_LUCK = 0.08; }   // cold — bounce-back
    else if (s.hdFinishingDelta >= 0.03) regression += 0.08;                                // hot — cool-off
  } else {
    const xg = s.xGPace ?? 0;
    const goals = s.goalsPace ?? 0;
    if (xg > 5 && goals > 0) {
      if (goals < xg * 0.85) { breakout += 0.06; contrib.FINISHING_LUCK = 0.06; }
      else if (goals > xg * 1.25) regression += 0.08;
    }
  }

  // ── Pedigree — young players with a real draft/NHLe signal ───
  if (s.age <= 24) {
    let ped = 0;
    if (s.draftOverall != null && s.draftOverall > 0) {
      if (s.draftOverall <= 15) ped += 0.05;
      else if (s.draftOverall <= 60) ped += 0.025;
    }
    const nhle = s.prospectPtsPace ?? 0;
    if (nhle >= 55) ped += 0.04;
    else if (nhle >= 40) ped += 0.02;
    if (ped > 0) { breakout += ped; contrib.PEDIGREE = ped; }
  }

  // ── Opportunity — minutes gate ───────────────────────────────
  // Real top-six/top-four ice time lifts a young player's odds; buried usage
  // (4th line / press box) suppresses any breakout regardless of talent.
  if (toi != null) {
    if (s.age <= 25 && toi >= 16) { breakout += 0.05; contrib.OPPORTUNITY = 0.05; }
    else if (toi > 0 && toi < 11) breakout *= 0.55;
  }

  // ── Burst — EDGE explosiveness fattens a young player's upside ─
  const hasEdgeSignal = s.edgeBurstsOver20 != null || s.edgeSpeedMaxMph != null;
  if (hasEdgeSignal && s.age <= 26) {
    const bursts = s.edgeBurstsOver20 ?? 0;
    const topSpeed = s.edgeSpeedMaxMph ?? 0;
    let burst = 0;
    if (bursts >= 40 || topSpeed >= 22.5) burst = 0.04;       // elite explosiveness
    else if (bursts >= 25 || topSpeed >= 21) burst = 0.02;
    if (burst > 0) { breakout += burst; contrib.BURST = burst; }
  }

  // Change of scenery — a better lineup slot doubles the breakout odds. Applied
  // last so the pure ×2 relationship on the base + modifiers holds.
  if (s.changedScenery) breakout *= 2;

  // Dominant non-age driver, for legible breakout events.
  let driver: BreakoutDriver = "AGE";
  let best = 0;
  for (const [k, v] of Object.entries(contrib)) {
    if (k === "AGE") continue;
    if ((v ?? 0) > best) { best = v ?? 0; driver = k as BreakoutDriver; }
  }
  if (best === 0) driver = (isProspect || isYoungReg) ? "AGE" : "NONE";

  return {
    breakout: clamp(breakout, 0, 0.5),
    regression: clamp(regression, 0, 0.5),
    driver,
    hasEdgeSignal,
  };
}
