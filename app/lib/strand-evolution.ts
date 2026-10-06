// ── strand-evolution.ts ──────────────────────────────────────────
//
// How a player's MEASURED profile changes through a season, independent of NAV.
// Pure and deterministic: identical inputs give identical profiles. Nothing here
// reads, writes or feeds a valuation.
//
// WHAT THE FEATURE REFUSES TO DO (each is a tested rule)
//
//   • It does not pretend the STRAND inputs exist this season when they do not.
//     OPS, xG, NOIV, DPS, SUPP, QoC and OZ starts come from MoneyPuck's 2025
//     season summary and from season-specific point-share formulas; the app has
//     no 2026-27 ingest of them. They are listed as unavailable, not carried over.
//   • It does not compare cumulative totals. Every trait is a RATE with its
//     exposure (games, shots) printed beside it.
//   • It does not blend history with the current season, and it does not average
//     traits into an overall "improvement" score.
//   • It does not let a change in the comparison population pass as a change in
//     the player: both profiles of one comparison are ranked against ONE pinned
//     cohort, and percentile differences are only produced when that holds.
//   • It does not name a checkpoint after a target it did not observe: a first
//     capture at 12 GP is a 12-GP checkpoint.

import { metricPercentile } from "@/app/lib/strand-metrics";

export const EVOLUTION_DEFINITION_VERSION = "strand-evo-v1";

// ── Traits ───────────────────────────────────────────────────────

export type TraitKey = "pts_gp" | "sog_gp" | "hd_sog_gp" | "toi_gp" | "oz_time";
export const TRAIT_KEYS: readonly TraitKey[] = ["pts_gp", "sog_gp", "hd_sog_gp", "toi_gp", "oz_time"];

export interface TraitDef {
  key: TraitKey;
  label: string;
  /** Which rail the node sits on. "production" = what he does with the puck;
   *  "usage" = how he is used. Neither is a quality claim. */
  rail: "production" | "usage";
  unit: string;
  digits: number;
  source: "NHL stats summary" | "NHL EDGE";
  definition: string;
  /** How a change is spoken. */
  phrase: string;
  /** The existing STRAND trait this stands in for, or why it does not. */
  strandCounterpart: string;
}

export const TRAITS: Record<TraitKey, TraitDef> = {
  pts_gp: {
    key: "pts_gp", label: "PTS/GP", rail: "production", unit: "pts/GP", digits: 2, source: "NHL stats summary",
    definition: "Points per game played, selected season and competition.",
    phrase: "scoring rate (points per game)",
    strandCounterpart: "None. STRAND's OPS is a season-specific point-share formula; points per game is a different, simpler measure.",
  },
  sog_gp: {
    key: "sog_gp", label: "SOG/GP", rail: "production", unit: "shots/GP", digits: 2, source: "NHL EDGE",
    definition: "Shots on goal from all locations per game, from the NHL EDGE shot-location summary.",
    phrase: "shots-on-goal rate",
    strandCounterpart: "None. STRAND's xG is MoneyPuck expected goals; shots on goal carry no shot quality.",
  },
  hd_sog_gp: {
    key: "hd_sog_gp", label: "HD SOG/GP", rail: "production", unit: "shots/GP", digits: 2, source: "NHL EDGE",
    definition: "High-danger shots on goal per game, from the NHL EDGE shot-location summary.",
    phrase: "high-danger shot rate",
    strandCounterpart: "None.",
  },
  toi_gp: {
    key: "toi_gp", label: "TOI/GP", rail: "usage", unit: "min/GP", digits: 1, source: "NHL stats summary",
    definition: "Average ice time per game, all situations.",
    phrase: "ice time per game",
    strandCounterpart: "TOI. Same definition (all-situations minutes per game); baseline STRAND reads it from MoneyPuck, this reads the NHL summary.",
  },
  oz_time: {
    key: "oz_time", label: "OZ TIME", rail: "usage", unit: "% of time", digits: 1, source: "NHL EDGE",
    definition: "Share of on-ice time spent in the offensive zone, from NHL EDGE zone-time details.",
    phrase: "offensive-zone time share",
    strandCounterpart: "None. STRAND's OZ Starts is the share of 5v5 shifts that START in the offensive zone (MoneyPuck); time spent there is a different measurement.",
  },
};

/** STRAND traits with no genuine current-season source in this app. */
export const UNAVAILABLE_STRAND_TRAITS: readonly { label: string; reason: string }[] = [
  { label: "OPS", reason: "Season-specific point-share formula over final team and league totals; computed for 2025-26 only." },
  { label: "DPS", reason: "Same point-share formula; its defensive half depends on team goals against and +/-." },
  { label: "xG", reason: "MoneyPuck expected goals. The app ingests MoneyPuck's 2025 season file only." },
  { label: "NOIV", reason: "MoneyPuck on/off expected-goal share. 2025 file only." },
  { label: "SUPP", reason: "MoneyPuck on/off expected goals against. 2025 file only." },
  { label: "QoC", reason: "Derived from MoneyPuck ice-time rank and zone starts. 2025 file only." },
  { label: "OZ Starts", reason: "MoneyPuck 5v5 shift starts. 2025 file only (NHL EDGE zone time is a different measurement)." },
];

// ── Inputs and trait values ──────────────────────────────────────

/** Raw supported inputs at one moment. `null` is "not reported", never zero. */
export interface CheckpointInputs {
  gp: number | null;
  points: number | null;
  toiSecondsPerGame: number | null;
  edgeGp: number | null;
  edgeShotsAll: number | null;
  edgeHdShots: number | null;
  /** Fraction 0-1. */
  edgeOzPct: number | null;
}

export const EMPTY_INPUTS: CheckpointInputs = {
  gp: null, points: null, toiSecondsPerGame: null, edgeGp: null, edgeShotsAll: null, edgeHdShots: null, edgeOzPct: null,
};

export interface TraitValue {
  /** The rate, or null when it cannot honestly be stated. A real 0 is 0. */
  value: number | null;
  /** The exposure behind the rate, in words. */
  exposure: string;
  /** Why value is null. */
  missing: string | null;
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function traitValues(i: CheckpointInputs): Record<TraitKey, TraitValue> {
  const gpOk = fin(i.gp) && i.gp > 0;
  const noGp = "no games played";
  const edgeAligned = gpOk && fin(i.edgeGp) && i.edgeGp === i.gp;
  const edgeWhy = !fin(i.edgeGp) ? "no EDGE sample"
    : !gpOk ? noGp
    : `EDGE sample is ${i.edgeGp} GP but the NHL summary says ${i.gp} GP; not combined`;
  const none = (missing: string): TraitValue => ({ value: null, exposure: "—", missing });

  return {
    pts_gp: gpOk && fin(i.points) && i.points >= 0
      ? { value: i.points / i.gp!, exposure: `${i.points} pts in ${i.gp} GP`, missing: null }
      : none(!gpOk ? noGp : "points not reported"),
    toi_gp: gpOk && fin(i.toiSecondsPerGame) && i.toiSecondsPerGame >= 0
      ? { value: i.toiSecondsPerGame / 60, exposure: `${i.gp} GP · about ${Math.round(i.toiSecondsPerGame * i.gp! / 60)} min`, missing: null }
      : none(!gpOk ? noGp : "ice time not reported"),
    sog_gp: edgeAligned && fin(i.edgeShotsAll) && i.edgeShotsAll >= 0
      ? { value: i.edgeShotsAll / i.gp!, exposure: `${i.edgeShotsAll} shots in ${i.gp} GP`, missing: null }
      : none(edgeAligned ? "shot count not reported" : edgeWhy),
    hd_sog_gp: edgeAligned && fin(i.edgeHdShots) && i.edgeHdShots >= 0
      ? { value: i.edgeHdShots / i.gp!, exposure: `${i.edgeHdShots} high-danger shots in ${i.gp} GP`, missing: null }
      : none(edgeAligned ? "high-danger shot count not reported" : edgeWhy),
    oz_time: edgeAligned && fin(i.edgeOzPct) && i.edgeOzPct >= 0 && i.edgeOzPct <= 1
      ? { value: i.edgeOzPct * 100, exposure: `${i.gp} GP`, missing: null }
      : none(edgeAligned ? "zone time not reported" : edgeWhy),
  };
}

export function formatTrait(key: TraitKey, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const d = TRAITS[key];
  return `${v.toFixed(d.digits)}${key === "oz_time" ? "%" : ""}`;
}

// ── Milestones ───────────────────────────────────────────────────

export const MILESTONE_TARGETS = [10, 20, 40, 60] as const;
export type Milestone = "10" | "20" | "40" | "60" | "END";
/** A capture counts toward a target only if it lands within this many games of
 *  it. Past that, the target stays unavailable rather than be mislabelled. */
export const MILESTONE_MAX_OVERSHOOT = 5;

export interface MilestonePlan { milestone: Milestone | null; reason: string }

export function planMilestone(input: {
  gp: number; gameType: number; seasonComplete?: boolean; captured: ReadonlySet<string>;
}): MilestonePlan {
  if (input.gameType !== 2) return { milestone: null, reason: "checkpoints are defined for the regular season only" };
  if (!Number.isInteger(input.gp) || input.gp <= 0) return { milestone: null, reason: "no games played" };
  if (input.seasonComplete) {
    return input.captured.has("END")
      ? { milestone: null, reason: "season-end checkpoint already captured" }
      : { milestone: "END", reason: "season complete" };
  }
  for (const t of MILESTONE_TARGETS) {
    if (input.gp >= t && input.gp <= t + MILESTONE_MAX_OVERSHOOT) {
      return input.captured.has(String(t))
        ? { milestone: null, reason: `${t}-GP checkpoint already captured` }
        : { milestone: String(t) as Milestone, reason: `first capture within ${MILESTONE_MAX_OVERSHOOT} GP of the ${t}-GP target` };
    }
  }
  return { milestone: null, reason: "games played is not inside any milestone window" };
}

/** Checkpoint label. Always the actual games; names the target only when they differ. */
export function checkpointLabel(milestone: string, observedGp: number): string {
  if (milestone === "END") return `Season end · ${observedGp} GP`;
  return Number(milestone) === observedGp
    ? `${observedGp} GP`
    : `${observedGp} GP (first capture after the ${milestone}-GP target)`;
}

// ── Reference cohorts ────────────────────────────────────────────

export interface ReferenceCohort {
  id: string;
  season: string;
  gameType: number;
  posGroup: "F" | "D";
  definitionVersion: string;
  minGp: number;
  n: number;
  /** Ascending, non-missing values per trait. */
  values: Record<TraitKey, number[]>;
  capturedAt: number;
  source: string;
}

/** Percentile of a value in a cohort (mid-rank ties; null under 10 values). */
export const cohortPercentile = (cohort: ReferenceCohort | null, key: TraitKey, value: number | null): number | null =>
  cohort && value != null ? metricPercentile(value, cohort.values[key]) : null;

export function cohortMedian(cohort: ReferenceCohort | null, key: TraitKey): number | null {
  const v = cohort?.values[key];
  if (!v || v.length < 10) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export const cohortLabel = (c: ReferenceCohort): string =>
  `${c.posGroup === "F" ? "forwards" : "defensemen"} with ≥${c.minGp} GP in ${c.season.slice(0, 4)}–${c.season.slice(6)} (${c.gameType === 2 ? "regular season" : "playoffs"}), n=${c.n}, version ${c.id.slice(0, 8)}`;

// ── Profiles and comparison ──────────────────────────────────────

export type ProfileKind = "checkpoint" | "latest" | "baseline";

export interface Profile {
  kind: ProfileKind;
  label: string;
  season: string;
  gameType: number;
  gp: number | null;
  capturedAt: number | null;
  sourceAsOf: string | null;
  status: "observed" | "reconstructed" | "live";
  definitionVersion: string;
  traits: Record<TraitKey, TraitValue>;
}

export function buildProfile(args: {
  kind: ProfileKind; label: string; season: string; gameType: number; inputs: CheckpointInputs;
  capturedAt?: number | null; sourceAsOf?: string | null; status?: Profile["status"];
}): Profile {
  return {
    kind: args.kind, label: args.label, season: args.season, gameType: args.gameType,
    gp: fin(args.inputs.gp) ? args.inputs.gp : null,
    capturedAt: args.capturedAt ?? null, sourceAsOf: args.sourceAsOf ?? null,
    status: args.status ?? "live", definitionVersion: EVOLUTION_DEFINITION_VERSION,
    traits: traitValues(args.inputs),
  };
}

export interface ComparisonCell { value: number | null; exposure: string; missing: string | null; pct: number | null }
export interface ComparisonRow {
  key: TraitKey; label: string; unit: string; rail: TraitDef["rail"]; source: TraitDef["source"];
  earlier: ComparisonCell; later: ComparisonCell;
  delta: number | null;
  /** Only set when both percentiles come from the SAME cohort. */
  pctDelta: number | null;
  /** The reference cohort's own median for this trait, for population context. */
  cohortMedian: number | null;
  summary: string | null;
}

/** Neutral sentence for one trait, or null when either side is missing. */
export function describeChange(key: TraitKey, earlier: number | null, later: number | null, earlierName: string): string | null {
  if (earlier == null || later == null) return null;
  const d = TRAITS[key];
  const a = earlier.toFixed(d.digits), b = later.toFixed(d.digits);
  const arrow = `${formatTrait(key, earlier)} → ${formatTrait(key, later)}`;
  if (Number(a) === Number(b)) return `Same ${d.phrase} as ${earlierName} (${arrow}).`;
  return `${later > earlier ? "Higher" : "Lower"} ${d.phrase} than ${earlierName} (${arrow}).`;
}

/** The standing caveat on any early-season comparison. */
export function sampleCaveat(gpA: number | null, gpB: number | null): string | null {
  const small = [gpA, gpB].filter((g): g is number => g != null && g < 20);
  if (small.length === 0) return null;
  return `Based on ${gpA ?? "?"} and ${gpB ?? "?"} games. Rates over a few games move a lot, and a difference here does not show a lasting change in ability.`;
}

/**
 * Compare two profiles. `earlierCohort` and `laterCohort` are the cohorts each
 * is ranked against. A pinned checkpoint comparison passes the SAME cohort for
 * both; only then is a percentile difference produced, because only then can it
 * be attributed to the player rather than to a different field.
 */
export function compareProfiles(
  earlier: Profile, later: Profile,
  earlierCohort: ReferenceCohort | null, laterCohort: ReferenceCohort | null,
): { rows: ComparisonRow[]; sameCohort: boolean } {
  const sameCohort = earlierCohort != null && laterCohort != null && earlierCohort.id === laterCohort.id;
  const name = earlier.kind === "baseline" ? `the ${earlier.label}` : `the ${earlier.label} checkpoint`;
  const rows = TRAIT_KEYS.map((key): ComparisonRow => {
    const a = earlier.traits[key], b = later.traits[key];
    const pa = cohortPercentile(earlierCohort, key, a.value), pb = cohortPercentile(laterCohort, key, b.value);
    return {
      key, label: TRAITS[key].label, unit: TRAITS[key].unit, rail: TRAITS[key].rail, source: TRAITS[key].source,
      earlier: { ...a, pct: pa }, later: { ...b, pct: pb },
      delta: a.value != null && b.value != null ? b.value - a.value : null,
      pctDelta: sameCohort && pa != null && pb != null ? pb - pa : null,
      cohortMedian: sameCohort ? cohortMedian(laterCohort, key) : null,
      summary: describeChange(key, a.value, b.value, name),
    };
  });
  return { rows, sameCohort };
}

// ── The page payload ─────────────────────────────────────────────
// Everything the client needs, precomputed and serialisable, so the browser only
// chooses which option to show and never recomputes a ranking.

export interface StoredCheckpoint {
  milestone: Milestone;
  revision: number;
  status: "observed" | "reconstructed";
  observedGp: number;
  capturedAt: number;
  sourceAsOf: string | null;
  inputs: CheckpointInputs;
  cohort: ReferenceCohort | null;
  provenance: Record<string, unknown>;
}

export interface EvolutionOption {
  id: string;
  kind: "checkpoint" | "baseline";
  label: string;
  earlier: Profile;
  rows: ComparisonRow[];
  sameCohort: boolean;
  /** How both profiles were ranked, named. */
  cohortNote: string;
  caveat: string | null;
  revisionNote: string | null;
  provenanceNote: string;
}

export interface EvolutionView {
  /** False for playoffs: milestones are regular-season only. */
  supported: boolean;
  unsupportedReason: string | null;
  seasonLabel: string;
  latest: Profile | null;
  /** Rank of the latest profile against its own live cohort, for the baseline view. */
  latestCohortNote: string;
  options: EvolutionOption[];
  /** Targets with no stored observation, so a missing milestone is visible. */
  missingMilestones: string[];
  unavailableTraits: readonly { label: string; reason: string }[];
  /** True when the checkpoint store could not be read (e.g. migration not applied). */
  storeUnavailable: boolean;
}

const seasonDash = (s: string) => `${s.slice(0, 4)}–${s.slice(6)}`;

export function buildEvolutionView(args: {
  season: string; gameType: number;
  latestInputs: CheckpointInputs | null; latestCapturedAt: number | null;
  /** Live same-season cohort for the latest profile when no pinned cohort applies. */
  latestCohort: ReferenceCohort | null;
  baselineSeason: string | null; baselineInputs: CheckpointInputs | null; baselineCohort: ReferenceCohort | null;
  checkpoints: readonly StoredCheckpoint[]; storeUnavailable: boolean;
}): EvolutionView {
  const base = {
    seasonLabel: `${seasonDash(args.season)} ${args.gameType === 2 ? "regular season" : "playoffs"}`,
    unavailableTraits: UNAVAILABLE_STRAND_TRAITS,
    storeUnavailable: args.storeUnavailable,
  };
  if (args.gameType !== 2) {
    return { ...base, supported: false, unsupportedReason: "Checkpoints and baseline comparisons are regular-season only; playoff samples are not equivalent to a regular-season baseline.",
      latest: null, latestCohortNote: "", options: [], missingMilestones: [] };
  }
  const latest = args.latestInputs
    ? buildProfile({ kind: "latest", label: "Latest", season: args.season, gameType: 2, inputs: args.latestInputs, capturedAt: args.latestCapturedAt })
    : null;

  // Latest revision per milestone only; earlier revisions stay in the store.
  const byMilestone = new Map<string, StoredCheckpoint>();
  for (const c of args.checkpoints) {
    const prev = byMilestone.get(c.milestone);
    if (!prev || c.revision > prev.revision) byMilestone.set(c.milestone, c);
  }
  const order: Milestone[] = ["10", "20", "40", "60", "END"];
  const options: EvolutionOption[] = [];
  if (latest) {
    for (const m of order) {
      const c = byMilestone.get(m);
      if (!c) continue;
      const earlier = buildProfile({
        kind: "checkpoint", label: checkpointLabel(m, c.observedGp), season: args.season, gameType: 2, inputs: c.inputs,
        capturedAt: c.capturedAt, sourceAsOf: c.sourceAsOf, status: c.status,
      });
      const { rows, sameCohort } = compareProfiles(earlier, latest, c.cohort, c.cohort);
      options.push({
        id: `cp-${m}`, kind: "checkpoint", label: earlier.label, earlier, rows, sameCohort,
        cohortNote: c.cohort
          ? `Both profiles are ranked against one pinned reference cohort: ${cohortLabel(c.cohort)}. Percentile changes therefore reflect the player, not a changing field.`
          : "No reference cohort was stored with this checkpoint, so percentiles are unavailable; raw rates are shown.",
        caveat: sampleCaveat(earlier.gp, latest.gp),
        revisionNote: c.revision > 0 ? `Source correction: revision ${c.revision}. The original capture is retained.` : null,
        provenanceNote: `${c.status === "observed" ? "Observed at capture" : "Reconstructed from dated source inputs"} · captured ${new Date(c.capturedAt).toISOString().slice(0, 10)} · NHL feeds supply no as-of timestamp · definition ${EVOLUTION_DEFINITION_VERSION}`,
      });
    }
  }
  if (latest && args.baselineSeason && args.baselineInputs) {
    const earlier = buildProfile({
      kind: "baseline", label: `${seasonDash(args.baselineSeason)} full season`, season: args.baselineSeason, gameType: 2, inputs: args.baselineInputs,
    });
    const { rows, sameCohort } = compareProfiles(earlier, latest, args.baselineCohort, args.latestCohort);
    options.push({
      id: "baseline", kind: "baseline", label: earlier.label, earlier, rows, sameCohort,
      cohortNote: `Historical rankings, each against its own season: ${args.baselineCohort ? cohortLabel(args.baselineCohort) : "baseline cohort unavailable"}; latest: ${args.latestCohort ? cohortLabel(args.latestCohort) : "no cohort yet"}. Different fields, so percentile changes are not computed; compare the raw rates.`,
      caveat: sampleCaveat(earlier.gp, latest.gp),
      revisionNote: null,
      provenanceNote: "Final regular-season rates from the NHL feeds, read live; not a stored checkpoint.",
    });
  }
  return {
    ...base, supported: true, unsupportedReason: null, latest,
    latestCohortNote: args.latestCohort ? cohortLabel(args.latestCohort) : "no cohort with enough players yet",
    options,
    missingMilestones: MILESTONE_TARGETS.map(String).filter(t => !byMilestone.has(t)),
  };
}
