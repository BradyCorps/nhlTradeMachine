export type DevelopmentLeague = "NHL" | "AHL" | "CHL" | "NCAA" | "SHL" | "Liiga" | "KHL" | "INTL";

export type DevelopmentPhase =
  | "EMERGING"
  | "BREAKOUT_CANDIDATE"
  | "PEAK_WINDOW"
  | "REGRESSION_RISK"
  | "DECLINING"
  | "UNKNOWN";

export type TimelineTrend = "RISING" | "FLAT" | "FALLING" | "VOLATILE";
export type BoomBustSignal = "BOOM_LEAN" | "BUST_LEAN" | "HIGH_VARIANCE" | "STABLE";

export interface PlayerSeasonSnapshot {
  season: string;
  age: number;
  league: DevelopmentLeague;
  teamId?: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
  ptsPerGame: number;
  nhlePtsPace?: number;
  avgTOI?: number;
  role?: string;
  draftOverall?: number;
  draftYear?: number;
}

export interface ProjectionBand {
  floorPts82: number;
  medianPts82: number;
  ceilingPts82: number;
  confidence: number;
}

export interface FantasyProfile {
  currentFantasyScore: number;
  dynastyScore: number;
  breakoutProbability: number;
  regressionRisk: number;
  developmentPhase: DevelopmentPhase;
  timelineTrend: TimelineTrend;
  projectionBand: ProjectionBand;
}

export interface DevelopmentProfile extends FantasyProfile {
  volatility: number;
  boomBustScore: number;
  boomBustSignal: BoomBustSignal;
  boomScore: number;
  bustScore: number;
  nhlExperienceScore: number;
  pedigreeScore: number;
  productionScore: number;
  roleGrowthScore: number;
  tags: string[];
  rationale: string[];
}

export interface DevelopmentProfileInput {
  id: string;
  name: string;
  position: "C" | "W" | "D" | "G";
  age: number;
  nhlGames: number;
  ptsPace: number;
  avgTOI?: number;
  draftOverall?: number;
  draftYear?: number;
  internationalScore?: number;
  teamContext?: "STRONG" | "AVERAGE" | "WEAK";
  linemateContext?: "STRONG" | "AVERAGE" | "WEAK";
  snapshots?: PlayerSeasonSnapshot[];
}

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));

function productionScale(position: DevelopmentProfileInput["position"]): number {
  if (position === "D") return 55;
  if (position === "G") return 0;
  return 75;
}

function scorePedigree(draftOverall: number | undefined, internationalScore = 0): number {
  let draftScore = 20;
  if (draftOverall != null) {
    if (draftOverall === 1) draftScore = 100;
    else if (draftOverall <= 2) draftScore = 94;
    else if (draftOverall <= 5) draftScore = 86;
    else if (draftOverall <= 10) draftScore = 76;
    else if (draftOverall <= 20) draftScore = 62;
    else if (draftOverall <= 32) draftScore = 52;
    else if (draftOverall <= 64) draftScore = 38;
    else draftScore = 25;
  }
  return clamp(Math.max(draftScore, internationalScore * 0.9));
}

function scoreExperience(nhlGames: number): number {
  return clamp((nhlGames / 320) * 100);
}

function scoreProduction(input: DevelopmentProfileInput): number {
  if (input.position === "G") return 50;
  return clamp((input.ptsPace / productionScale(input.position)) * 100);
}

function latestNhle(snapshots: PlayerSeasonSnapshot[]): number | null {
  const values = snapshots
    .filter(s => s.games >= 5)
    .map(s => s.nhlePtsPace ?? (s.league === "NHL" ? s.ptsPerGame * 82 : undefined))
    .filter((n): n is number => Number.isFinite(n));
  return values.length ? values[values.length - 1] : null;
}

function trendFromSnapshots(snapshots: PlayerSeasonSnapshot[]): { trend: TimelineTrend; volatility: number; growth: number } {
  const values = snapshots
    .filter(s => s.games >= 5)
    .map(s => s.nhlePtsPace ?? (s.league === "NHL" ? s.ptsPerGame * 82 : undefined))
    .filter((n): n is number => Number.isFinite(n));

  if (values.length < 2) return { trend: "FLAT", volatility: 45, growth: 0 };

  const deltas = values.slice(1).map((v, i) => v - values[i]);
  const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const signChanges = deltas.slice(1).filter((d, i) => Math.sign(d) !== Math.sign(deltas[i])).length;
  const meanAbsDelta = deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length;
  const volatility = clamp(meanAbsDelta * 3 + signChanges * 18);

  if (volatility >= 55 && signChanges > 0) return { trend: "VOLATILE", volatility, growth: avgDelta };
  if (avgDelta > 5) return { trend: "RISING", volatility, growth: avgDelta };
  if (avgDelta < -5) return { trend: "FALLING", volatility, growth: avgDelta };
  return { trend: "FLAT", volatility, growth: avgDelta };
}

function roleGrowthScore(snapshots: PlayerSeasonSnapshot[], currentToi = 0): number {
  const tois = snapshots.map(s => s.avgTOI).filter((n): n is number => Number.isFinite(n));
  if (tois.length < 2 && !currentToi) return 40;
  const first = tois[0] ?? currentToi;
  const last = currentToi || tois[tois.length - 1] || first;
  return clamp(45 + (last - first) * 8);
}

function classifyPhase(input: DevelopmentProfileInput, scores: {
  pedigree: number;
  experience: number;
  production: number;
  trend: TimelineTrend;
  regressionRisk: number;
}): DevelopmentPhase {
  if (input.age >= 36 || (input.age >= 34 && scores.trend === "FALLING")) return "DECLINING";
  if (input.age >= 32 && scores.regressionRisk >= 55) return "REGRESSION_RISK";
  if (input.age >= 24 && input.age <= 31 && (scores.production >= 85 || (scores.pedigree >= 90 && scores.production >= 65))) return "PEAK_WINDOW";
  if (input.age >= 24 && input.age <= 31 && scores.experience >= 65 && scores.production >= 55) return "PEAK_WINDOW";
  if (input.age <= 21 && (scores.pedigree >= 75 || scores.production >= 60)) return "EMERGING";
  if (input.age <= 19 && input.nhlGames < 20) return "EMERGING";
  if (input.age <= 25 && (scores.production >= 45 || scores.pedigree >= 50 || scores.trend === "RISING")) return "BREAKOUT_CANDIDATE";
  if (input.age <= 23) return "EMERGING";
  return "UNKNOWN";
}

function buildProjectionBand(input: DevelopmentProfileInput, opts: {
  pedigree: number;
  confidence: number;
  volatility: number;
  latestNhle: number | null;
}): ProjectionBand {
  const baseline = opts.latestNhle ?? input.ptsPace;
  const upside = (opts.pedigree - 50) * 0.18 + Math.max(0, 24 - input.age) * 1.5;
  const riskSpread = 8 + (100 - opts.confidence) * 0.22 + opts.volatility * 0.12;
  const median = clamp((baseline * 0.72) + (input.ptsPace * 0.28) + upside * 0.35, 0, 140);
  const ceiling = clamp(median + riskSpread + Math.max(0, opts.pedigree - 70) * 0.18, 0, 160);
  const floor = clamp(median - riskSpread * 0.8, 0, 140);
  return {
    floorPts82: Math.round(floor),
    medianPts82: Math.round(median),
    ceilingPts82: Math.round(ceiling),
    confidence: Math.round(opts.confidence),
  };
}

function classifyBoomBust(opts: {
  pedigree: number;
  production: number;
  role: number;
  confidence: number;
  volatility: number;
  breakoutProbability: number;
  regressionRisk: number;
  trend: TimelineTrend;
  age: number;
}): { boomBustSignal: BoomBustSignal; boomScore: number; bustScore: number } {
  const boomScore = clamp(
    opts.breakoutProbability * 0.40 +
    opts.pedigree * 0.20 +
    opts.production * 0.18 +
    opts.role * 0.12 +
    (opts.trend === "RISING" ? 12 : opts.trend === "VOLATILE" ? 5 : 0) +
    (opts.age <= 23 ? 6 : 0)
  );
  const bustScore = clamp(
    opts.regressionRisk * 0.34 +
    opts.volatility * 0.22 +
    (100 - opts.confidence) * 0.20 +
    Math.max(0, 45 - opts.production) * 0.24 +
    (opts.trend === "FALLING" ? 14 : opts.trend === "VOLATILE" ? 6 : 0)
  );
  const spread = boomScore - bustScore;
  const highVariance = opts.volatility >= 62 || Math.max(boomScore, bustScore) >= 62;

  if (!highVariance && opts.confidence >= 60) return { boomBustSignal: "STABLE", boomScore: Math.round(boomScore), bustScore: Math.round(bustScore) };
  if (spread >= 12) return { boomBustSignal: "BOOM_LEAN", boomScore: Math.round(boomScore), bustScore: Math.round(bustScore) };
  if (spread <= -12) return { boomBustSignal: "BUST_LEAN", boomScore: Math.round(boomScore), bustScore: Math.round(bustScore) };
  return { boomBustSignal: "HIGH_VARIANCE", boomScore: Math.round(boomScore), bustScore: Math.round(bustScore) };
}

export function calcDevelopmentProfile(input: DevelopmentProfileInput): DevelopmentProfile {
  const snapshots = input.snapshots ?? [];
  const pedigree = scorePedigree(input.draftOverall, input.internationalScore);
  const experience = scoreExperience(input.nhlGames);
  const production = scoreProduction(input);
  const trend = trendFromSnapshots(snapshots);
  const role = roleGrowthScore(snapshots, input.avgTOI);
  const latest = latestNhle(snapshots);
  const contextPenalty = (input.teamContext === "WEAK" ? 8 : 0) + (input.linemateContext === "WEAK" ? 10 : 0);
  const sampleRisk = clamp(65 - experience * 0.65);
  const ageDeclineRisk = input.age >= 36 ? 75 : input.age >= 33 ? 58 : input.age >= 30 ? 30 : 10;
  const volatility = clamp(trend.volatility + (input.nhlGames < 100 ? 18 : 0) + (input.age <= 23 && production < 45 ? 12 : 0));
  const regressionRisk = clamp(ageDeclineRisk + sampleRisk * 0.35 + (trend.trend === "FALLING" ? 22 : 0) + (input.age >= 32 && trend.trend === "RISING" ? 12 : 0));
  const breakoutProbability = clamp(
    pedigree * 0.24 +
    production * 0.24 +
    role * 0.18 +
    (trend.trend === "RISING" ? 18 : trend.trend === "VOLATILE" ? 8 : 4) +
    (input.age <= 25 ? 12 : input.age >= 32 ? -16 : 0) -
    contextPenalty
  );
  const confidence = clamp(30 + experience * 0.38 + snapshots.length * 7 + (input.internationalScore ? 8 : 0) - volatility * 0.15);
  const lowExperienceBoomBustBonus = input.age <= 23 && input.nhlGames < 80 ? 16 : 0;
  const boomBustScore = clamp(volatility * 0.55 + pedigree * 0.25 + (100 - confidence) * 0.25 + lowExperienceBoomBustBonus);
  const boomBust = classifyBoomBust({
    pedigree,
    production,
    role,
    confidence,
    volatility,
    breakoutProbability,
    regressionRisk,
    trend: trend.trend,
    age: input.age,
  });
  const developmentPhase = classifyPhase(input, { pedigree, experience, production, trend: trend.trend, regressionRisk });
  const projectionBand = buildProjectionBand(input, { pedigree, confidence, volatility, latestNhle: latest });
  const currentFantasyScore = Math.round(clamp(production * 0.7 + experience * 0.2 + role * 0.1 - regressionRisk * 0.08));
  const dynastyScore = Math.round(clamp(
    production * 0.28 +
    pedigree * 0.28 +
    breakoutProbability * 0.22 +
    (100 - regressionRisk) * 0.12 +
    (input.age <= 23 ? 12 : input.age <= 26 ? 6 : input.age >= 33 ? -18 : 0)
  ));

  const tags: string[] = [];
  if (boomBustScore >= 65) tags.push("BOOM_BUST");
  if (breakoutProbability >= 65) tags.push("BREAKOUT");
  if (pedigree >= 90) tags.push("ELITE_PEDIGREE");
  if (confidence < 45) tags.push("LOW_CONFIDENCE");
  if (regressionRisk >= 60) tags.push("REGRESSION_RISK");
  if (input.teamContext === "WEAK" || input.linemateContext === "WEAK") tags.push("CONTEXT_DRAG");

  const rationale = [
    `${input.nhlGames} NHL games drives experience score ${Math.round(experience)}`,
    `production score ${Math.round(production)} from ${Math.round(input.ptsPace)} pts/82 pace`,
    `timeline trend ${trend.trend.toLowerCase()} with volatility ${Math.round(volatility)}`,
  ];
  if (input.draftOverall != null) rationale.push(`draft pedigree ${input.draftOverall} overall`);
  if (input.teamContext === "WEAK" || input.linemateContext === "WEAK") rationale.push("weak context lowers near-term breakout certainty");

  return {
    currentFantasyScore,
    dynastyScore,
    breakoutProbability: Math.round(breakoutProbability),
    regressionRisk: Math.round(regressionRisk),
    developmentPhase,
    timelineTrend: trend.trend,
    projectionBand,
    volatility: Math.round(volatility),
    boomBustScore: Math.round(boomBustScore),
    boomBustSignal: boomBust.boomBustSignal,
    boomScore: boomBust.boomScore,
    bustScore: boomBust.bustScore,
    nhlExperienceScore: Math.round(experience),
    pedigreeScore: Math.round(pedigree),
    productionScore: Math.round(production),
    roleGrowthScore: Math.round(role),
    tags,
    rationale,
  };
}
