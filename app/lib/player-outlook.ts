// ── Player Outlook (PA12) ────────────────────────────────────────
// Redefines the analytics Outlook. The old tab was a fantasy dynasty /
// boom-bust wall that read as noise on an established star (McDavid showing
// "Dynasty 72 · Boom 39 · Draft Sig 0"). This answers one honest question
// for BOTH a 20-year-old and a 30-year-old: where is this player trending,
// and what does next season look like?
//
// It derives that from accumulated data — the multi-season scoring
// trajectory the profile already carries — and leans on NHL EDGE as the
// leading indicator: skating and burst decline (or hold) in the tracking
// data before the scoresheet moves, and finishing luck says which way the
// box score should bend next. Pure and testable; the presentation layer
// (PlayerOutlook.tsx) just renders the result. The DevelopmentProfile
// engine is untouched — this is a reading of it, not a rewrite.

import type { DevelopmentProfile } from "./development-profile";

export type OutlookTone = "good" | "neutral" | "warn" | "bad";
export type TrajectoryDirection = "RISING" | "STEADY" | "COOLING" | "UNKNOWN";

export interface OutlookEdgeInput {
  age?: number | null;
  games?: number | null;
  position?: string | null;
  edgeSpeedMaxMph?: number | null;
  edgeBurstsOver20?: number | null;
  hdFinishingDelta?: number | null;
  edgeOzPct?: number | null;
  // Defenseman-relevant signals — a D's value is transition, power play,
  // suppression and blocks, not finishing.
  ppPtsPace82?: number | null;
  assistsPace?: number | null;
  baselineBlocks82?: number | null;
  xgaRelTM?: number | null;   // on-ice chance suppression (lower is better)
  avgTOI?: number | null;
}

export interface OutlookSeason {
  season: string;
  pace: number;
}

export interface OutlookEdgeRead {
  label: string;
  value: string;
  read: string;
  tone: OutlookTone;
}

export interface PlayerOutlook {
  headline: string;
  tone: OutlookTone;
  summary: string;
  confidence: number;
  trajectory: {
    direction: TrajectoryDirection;
    seasons: OutlookSeason[];
    careerPeak?: number;
  };
  projection: { floor: number; median: number; ceiling: number };
  edgeReads: OutlookEdgeRead[];
}

// Parse the profile's "2023-24: 142 pts/82" trajectory labels into numbers.
export function parseTrajectory(labels: string[] | undefined): OutlookSeason[] {
  if (!labels) return [];
  const out: OutlookSeason[] = [];
  for (const label of labels) {
    const m = /^(.*?):\s*(-?\d+(?:\.\d+)?)/.exec(label);
    if (!m) continue;
    const pace = Number(m[2]);
    if (!Number.isFinite(pace)) continue;
    out.push({ season: m[1].trim(), pace });
  }
  return out;
}

// Direction of the scoring trend. Compares the most recent season to the
// baseline of the earlier ones, with a threshold PROPORTIONAL to that
// baseline — a 90-point scorer naturally swings ±8, so one down year off a
// strong run (Hughes 92 · 92 · 84) is noise, not "cooling," while a 52 → 69
// climb is a real rise. Absolute floor of 10 keeps low-scorers sane.
export function trajectoryDirection(seasons: OutlookSeason[]): TrajectoryDirection {
  if (seasons.length < 2) return "UNKNOWN";
  const recent = seasons[seasons.length - 1].pace;
  const prior = seasons.slice(0, -1);
  const baseline = prior.reduce((s, x) => s + x.pace, 0) / prior.length;
  const threshold = Math.max(10, baseline * 0.13);
  if (recent >= baseline + threshold) return "RISING";
  if (recent <= baseline - threshold) return "COOLING";
  return "STEADY";
}

// Bursts are reported as a season total; normalize to a per-82 rate.
function bursts82(edge: OutlookEdgeInput): number | null {
  if (edge.edgeBurstsOver20 == null) return null;
  const gp = edge.games ?? 0;
  if (gp <= 0) return edge.edgeBurstsOver20;
  return Math.round((edge.edgeBurstsOver20 / gp) * 82);
}

// EDGE leading indicators — each present signal becomes a plain read of what
// it says about next season. Absent signals are skipped, never faked.
// Position-aware: a defenseman's value is transition, power play, chance
// suppression and blocks — not finishing luck — so D gets its own reads.
export function edgeReads(edge: OutlookEdgeInput, isVet: boolean): OutlookEdgeRead[] {
  return edge.position === "D" ? defenseEdgeReads(edge) : forwardEdgeReads(edge, isVet);
}

function defenseEdgeReads(edge: OutlookEdgeInput): OutlookEdgeRead[] {
  const reads: OutlookEdgeRead[] = [];

  // Power play — the single biggest driver of blue-line fantasy points.
  if (edge.ppPtsPace82 != null) {
    const pp = edge.ppPtsPace82;
    const tone: OutlookTone = pp >= 15 ? "good" : pp >= 6 ? "neutral" : "warn";
    const read = pp >= 15
      ? "Runs a power play — the engine of blue-line fantasy points"
      : pp >= 6
        ? "Secondary power-play role — modest point support"
        : "Little power-play time — even-strength points only, a low ceiling";
    reads.push({ label: "Power Play", value: `${Math.round(pp)} PPP/82`, read, tone });
  }

  // Mobility / transition — for a D, wheels turn into carries and assists.
  const b82 = bursts82(edge);
  if (edge.edgeSpeedMaxMph != null || b82 != null) {
    const s = edge.edgeSpeedMaxMph;
    const mobile = (s != null && s >= 22.5) || (b82 != null && b82 >= 55);
    const tone: OutlookTone = mobile ? "good" : "neutral";
    const value = s != null ? `${s.toFixed(1)} mph` : `${b82}/82`;
    const read = mobile
      ? "Mobile puck-mover — activates in the rush, and that transition is where his assists come from"
      : "Positional over rangy — value leans defensive, not offensive";
    reads.push({ label: "Mobility", value, read, tone });
  }

  // Chance suppression — the defensive value the box score hides.
  if (edge.xgaRelTM != null) {
    const supp = -edge.xgaRelTM; // higher = stingier
    const tone: OutlookTone = supp >= 0.3 ? "good" : supp >= -0.1 ? "neutral" : "warn";
    const read = supp >= 0.3
      ? "Suppresses chances against — real defensive value beyond the points"
      : supp >= -0.1
        ? "Roughly neutral defensively"
        : "Chances tick up with him on the ice — a defensive liability";
    reads.push({ label: "Chance Suppression", value: `${supp >= 0 ? "+" : ""}${supp.toFixed(2)}`, read, tone });
  }

  // Blocks — a real category stat for defensemen.
  if (edge.baselineBlocks82 != null) {
    const blk = edge.baselineBlocks82;
    const tone: OutlookTone = blk >= 140 ? "good" : blk >= 80 ? "neutral" : "warn";
    const read = blk >= 140
      ? "Heavy shot-blocking volume — a category asset in peripheral leagues"
      : blk >= 80
        ? "Moderate shot-blocking"
        : "Low block volume";
    reads.push({ label: "Blocks", value: `${Math.round(blk)}/82`, read, tone });
  }

  // Deployment as context if there's still room.
  if (edge.edgeOzPct != null && reads.length < 4) {
    const oz = edge.edgeOzPct * 100;
    const tone: OutlookTone = oz >= 55 ? "good" : "neutral";
    const read = oz >= 55
      ? "Sheltered for offense — an offensive-role deployment"
      : oz >= 45
        ? "Balanced zone deployment"
        : "Defensive-zone-heavy — a shutdown role (defensively valuable, fantasy-light)";
    reads.push({ label: "OZ Time", value: `${oz.toFixed(0)}%`, read, tone });
  }

  return reads;
}

function forwardEdgeReads(edge: OutlookEdgeInput, isVet: boolean): OutlookEdgeRead[] {
  const reads: OutlookEdgeRead[] = [];

  if (edge.edgeSpeedMaxMph != null) {
    const s = edge.edgeSpeedMaxMph;
    const tone: OutlookTone = s >= 22.8 ? "good" : s >= 21.4 ? "neutral" : "warn";
    const read = s >= 22.8
      ? (isVet ? "Top gear intact — speed usually fades first with age, so keeping it defies the curve" : "Elite top-end speed")
      : s >= 21.4
        ? "Average top-end speed"
        : "Below-average burst speed — the first sign the legs are going";
    reads.push({ label: "Top Speed", value: `${s.toFixed(1)} mph`, read, tone });
  }

  const b82 = bursts82(edge);
  if (b82 != null) {
    const tone: OutlookTone = b82 >= 90 ? "good" : b82 >= 45 ? "neutral" : "warn";
    const read = b82 >= 90
      ? "High burst volume — motor and explosiveness still there"
      : b82 >= 45
        ? "Moderate explosiveness"
        : "Low burst volume — legs may be slowing";
    reads.push({ label: "20+ mph Bursts", value: `${b82}/82`, read, tone });
  }

  if (edge.hdFinishingDelta != null) {
    const hd = edge.hdFinishingDelta;
    const cold = hd <= -0.02;
    const hot = hd >= 0.03;
    const tone: OutlookTone = cold ? "good" : hot ? "warn" : "neutral";
    const read = cold
      ? "Finishing below expected — scoring should bounce back"
      : hot
        ? "Finishing above expected — some cool-off likely"
        : "Finishing near expected — no luck correction pending";
    reads.push({
      label: "Finishing Luck",
      value: `${hd > 0 ? "+" : ""}${(hd * 100).toFixed(1)}%`,
      read,
      tone,
    });
  }

  if (edge.edgeOzPct != null) {
    const oz = edge.edgeOzPct * 100;
    const tone: OutlookTone = oz >= 55 ? "good" : oz >= 45 ? "neutral" : "warn";
    const read = oz >= 55
      ? "Heavy offensive-zone deployment — role points the right way"
      : oz >= 45
        ? "Balanced zone deployment"
        : "Defensive-zone-heavy deployment caps offensive upside";
    reads.push({ label: "OZ Time", value: `${oz.toFixed(0)}%`, read, tone });
  }

  return reads;
}

// The one-call headline. Built off the development phase, refined by the
// scoring trend, age, and prime years left — honest for a prospect and a
// veteran alike (no fantasy dynasty framing).
function headlineFor(
  profile: DevelopmentProfile,
  age: number | null,
  direction: TrajectoryDirection,
): { headline: string; tone: OutlookTone; summary: string } {
  const phase = profile.developmentPhase;
  const trend = profile.timelineTrend;
  const peakLeft = profile.peakYearsLeft ?? null;
  const cooling = direction === "COOLING" || trend === "FALLING";
  const rising = direction === "RISING" || trend === "RISING";

  if (trend === "VOLATILE") {
    return { headline: "UNSETTLED", tone: "warn", summary: "High season-to-season variance on a thin sample — the projection is a wide guess, not a read." };
  }

  switch (phase) {
    case "EMERGING":
      return rising
        ? { headline: "ASCENDING", tone: "good", summary: "Young and trending up — production and role are both still climbing." }
        : { headline: "DEVELOPING", tone: "neutral", summary: "Early-career player still filling in — the arc isn't set yet." };
    case "BREAKOUT_CANDIDATE":
      return { headline: "ON THE RISE", tone: "good", summary: "Breakout-shaped: the underlying signals are running ahead of the point totals." };
    case "PEAK_WINDOW":
      if (cooling) return { headline: "AT PEAK — COOLING", tone: "neutral", summary: "Still prime-aged, but the scoring trend has flattened off its high." };
      return { headline: "IN HIS PRIME", tone: "good", summary: peakLeft != null ? `Prime production, roughly ${peakLeft} peak-level year${peakLeft === 1 ? "" : "s"} left in the projection.` : "Peak-window production with the arrow holding level." };
    case "REGRESSION_RISK":
      if (rising) return { headline: "RISING — BUT REGRESSION-FLAGGED", tone: "warn", summary: "Points are climbing, but the model prices a pullback — a boom-or-bust hold, not a safe one." };
      return { headline: "REGRESSION RISK", tone: "warn", summary: "The projection sits below the recent scoring line — some pullback is priced in." };
    case "DECLINING":
      // Age says decline, but the recent points are still climbing — don't
      // print a flat "declining" over a rising line (the Carlson case).
      // Surface the tension as risk, not a contradiction.
      if (rising) {
        return { headline: "DEFYING THE CURVE — HIGH RISK", tone: "warn", summary: (age != null ? `At ${age}, ` : "") + "the points are still rising, but age says bet on the fall coming, not more — a high-variance, short-runway hold." };
      }
      if (peakLeft != null && peakLeft >= 2 && !cooling) {
        return { headline: "PROVEN — HOLDING FORM", tone: "neutral", summary: "Past the age peak but the production line hasn't cracked yet." };
      }
      return { headline: "PAST PEAK — DECLINING", tone: "bad", summary: (age != null ? `At ${age}, ` : "") + "age and trend both point down — bank on less, not more." };
    default:
      return { headline: "LIMITED DATA", tone: "neutral", summary: "Not enough NHL sample to call a direction with confidence." };
  }
}

export function deriveOutlook(profile: DevelopmentProfile, edge: OutlookEdgeInput): PlayerOutlook {
  const seasons = parseTrajectory(profile.scoringTrajectory);
  const direction = trajectoryDirection(seasons);
  const age = edge.age ?? null;
  const isVet = (profile.peakYearsLeft != null) || (age != null && age >= 27);
  const { headline, tone, summary } = headlineFor(profile, age, direction);

  return {
    headline,
    tone,
    summary,
    // Never claim 100% — no projection is certain. Cap the displayed
    // confidence just below it.
    confidence: Math.min(99, profile.confidenceScore ?? profile.projectionBand.confidence),
    trajectory: {
      direction,
      seasons,
      careerPeak: profile.careerPeakPts82,
    },
    projection: {
      floor: profile.projectionBand.floorPts82,
      median: profile.projectionBand.medianPts82,
      ceiling: profile.projectionBand.ceilingPts82,
    },
    edgeReads: edgeReads(edge, isVet),
  };
}
