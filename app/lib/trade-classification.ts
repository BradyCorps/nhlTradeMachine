import type { Asset, Team } from "@/app/lib/trade-types";

export const DIVISION_BY_TEAM: Record<string, string> = {
  BOS: "Atlantic", BUF: "Atlantic", DET: "Atlantic", FLA: "Atlantic",
  MTL: "Atlantic", OTT: "Atlantic", TBL: "Atlantic", TOR: "Atlantic",
  CAR: "Metropolitan", CBJ: "Metropolitan", NJD: "Metropolitan", NYI: "Metropolitan",
  NYR: "Metropolitan", PHI: "Metropolitan", PIT: "Metropolitan", WSH: "Metropolitan",
  CHI: "Central", COL: "Central", DAL: "Central",
  MIN: "Central", NSH: "Central", STL: "Central", UTA: "Central", WPG: "Central",
  ANA: "Pacific", CGY: "Pacific", EDM: "Pacific", LAK: "Pacific",
  SEA: "Pacific", SJS: "Pacific", VAN: "Pacific", VGK: "Pacific",
};

export const normalizePosition = (position: string): string =>
  position === "L" || position === "R" ? "W" : position;

export const areSameDivision = (teamA: Team, teamB: Team): boolean => {
  const divA = DIVISION_BY_TEAM[teamA.id];
  const divB = DIVISION_BY_TEAM[teamB.id];
  return divA != null && divA === divB;
};

export const isFutureCoreAsset = (asset: Asset): boolean => {
  const p = asset.developmentProfile;
  if (!p || asset.position === "Pick" || asset.position === "G" || asset.age > 25) return false;
  return p.dynastyScore >= 62
    || p.boomBustSignal === "BOOM_LEAN"
    || p.developmentPhase === "EMERGING"
    || (p.developmentPhase === "BREAKOUT_CANDIDATE" && p.breakoutProbability >= 55);
};

export const isDevelopmentRiskAsset = (asset: Asset): boolean => {
  const p = asset.developmentProfile;
  if (!p || asset.position === "Pick" || asset.position === "G" || asset.age > 25) return false;
  return p.boomBustSignal === "BUST_LEAN"
    || (p.boomBustSignal === "HIGH_VARIANCE" && p.bustScore >= p.boomScore && p.projectionBand.confidence < 50);
};

export const isPeakWindowAsset = (asset: Asset): boolean => {
  const p = asset.developmentProfile;
  if (!p || asset.position === "Pick" || asset.position === "G") return false;
  return p.developmentPhase === "PEAK_WINDOW" && p.regressionRisk < 45;
};

export const hasVeteranTerm = (assets: Asset[]): boolean =>
  assets.some(a =>
    a.position !== "Pick"
    && ((a.age >= 25 && (a.yearsRemaining ?? 0) >= 3)
      || (a.age >= 27 && (a.yearsRemaining ?? 0) >= 2))
  );

export const isShoppedAsset = (asset: Asset): boolean =>
  asset.tradeBlockStatus === "available" || asset.tradeBlockStatus === "requested";

export const isPremiumLotteryPick = (
  asset: Asset,
  navOf: (asset: Asset) => number,
): boolean =>
  asset.position === "Pick"
  && (asset.round ?? 99) === 1
  && (asset.teamStanding == null || asset.teamStanding >= 30 || navOf(asset) >= 300);
