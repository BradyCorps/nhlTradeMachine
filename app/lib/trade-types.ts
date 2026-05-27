// ============================================================
// SHARED TYPES — used by both the API route and the UI
// Keep this file free of business logic — types only.
// ============================================================

export interface Asset {
  id: string;
  teamId: string;
  name: string;
  position: string;
  age: number;
  games: number;
  ptsPace: number;
  xGPace?: number;
  defRate: number;
  avgTOI: number;
  capHit: number;
  yearsRemaining: number;
  hasNMC: boolean;
  hasNTC: boolean;
  canRetain: boolean;
  retainedPct: number;
  multiplier: number;
  headshot?: string;
  hasLiveStats?: boolean;
  qocRank?: number;
  xgRelTM?: number | null;
  xgaRelTM?: number | null;
  dzPct?: number | null;
  goalsPace?: number;
  assistsPace?: number;
  round?: number;
  year?: number;
  teamStanding?: number;
  isProtected?: boolean;
  gsax?: number;
  savePct?: number;
  gamesStarted?: number;
  shotsPerGame?: number;
  careerGsax?: number;
  awards?: string[];
  peakNAV?: number;
  // Point Shares (computed dynamically from NHL Stats API)
  ops?: number | null;  // Offensive Point Shares — current season
  dps?: number | null;  // Defensive Point Shares — current season

  teamXga60?: number;      
  baselineGsax?: number;   
  hasExtension?: boolean;
}

export interface Team {
  id: string;
  name: string;
  capSpace: number;
  standing: number;
  phase?: string;
  needs?: { pos: string; minWar: number; label: string }[];
  prospectPool?: string;
}

export interface XNAVResult {
  total: number;
  off: number;
  def: number;
  age: number;
  cap: number;
  upside: number;
  noivImpact?: number;
  fArchetype?: string;
}

export type FlagSeverity = "HARD" | "SOFT" | "WARN" | "INFO";

export type FlagCategory =
  | "CAP_VIOLATION" | "FLOOR_VIOLATION" | "CLAUSE"
  | "ELITE_BLOCKADE" | "TIMELINE_MISMATCH" | "REBUILD_LOGIC"
  | "CONTENDER_LOGIC" | "ASSET_SHAPE_MISMATCH" | "POSITIONAL_REDUNDANCY"
  | "ROSTER_HOLE" | "LEVERAGE_ASYMMETRY" | "RENTAL_TAX" | "AGE_CLIFF"
  | "DEAD_WEIGHT" | "FIRE_SALE" | "LOCKER_ROOM" | "RETAIN_ABUSE" | "GOOD" | "VALUE_VETO";

export interface GmFlag {
  severity: FlagSeverity;
  category: FlagCategory;
  headline: string;
  explanation: string;
  affectedAsset?: string;
  vetoesSide?: 0 | 1;
}

export type TradeStatus = "IDLE" | "PENDING" | "FAIR" | "WIN" | "LOSS" | "BLOCKED" | "DECLINED";

export interface TradeMetrics {
  navOut: number;
  navIn: number;
  homeNetGain: number;
  ptsGain: number;
  defGain: number;
  capDelta: number;
  variance: number;
  ewaHome: number;
  cwiYears: number;
}

export interface TradeVerdict {
  status: TradeStatus;
  message: string;
  flags: GmFlag[];
  metrics: TradeMetrics;
  claudeAnalysis?: string;
  claudeLoading?: boolean;
}

// Request/response shapes for the evaluate API
export interface EvaluateRequest {
  assets:          Asset[];            // all assets to get NAV for
  tradeOutgoing?:  Asset[];            // home team's outgoing block
  tradeIncoming?:  Asset[];            // partner's outgoing block  
  homeTeam?:       Team | null;
  partnerTeam?:    Team | null;
  allHomeRoster?:  Asset[];
  allPartnerRoster?: Asset[];
  runTrade?:       boolean;            // whether to run full evaluateTrade
}

export interface EvaluateResponse {
  navMap:   Record<string, XNAVResult>; // id → XNAVResult for all requested assets
  verdict?: TradeVerdict;              // only present when runTrade=true
}