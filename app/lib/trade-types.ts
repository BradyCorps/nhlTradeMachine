// ============================================================
// SHARED TYPES — used by both the API route and the UI
// Keep this file free of business logic — types only.
// ============================================================

import type { DevelopmentProfile } from "@/app/lib/development-profile";

export interface Asset {
  id: string;
  teamId: string;
  name: string;
  position: string;
  secondaryPosition?: string | null;
  age: number;
  games: number;
  ptsPace: number;
  xGPace?: number;
  defRate: number;
  avgTOI: number;
  capHit: number;
  lastCapHit?: number;         // real expiring/last cap hit — never zeroed for pending FAs (capHit goes to 0 for FA pricing)
  yearsRemaining: number;
  capCeiling?: number;
  hasNMC: boolean;
  hasNTC: boolean;
  canRetain: boolean;
  retainedPct: number;
  multiplier: number;
  headshot?: string;
  hasLiveStats?: boolean;
  qocRank?: number;            // DEPRECATED — legacy iceTimeRank sum; use qocIndex
  qocIndex?: number | null;    // 0-100 EV deployment difficulty (higher = tougher 5v5 minutes)
  rosterTier?: RosterTier;
  draftYear?: number | null;
  draftOverall?: number | null;    // overall draft slot — triggers pedigree NAV
  prospectPtsPace?: number | null; // NHLe-translated junior scoring pace
  developmentProfile?: DevelopmentProfile | null; // diagnostic future-value layer; not blended into X-NAV
  xgRelTM?: number | null;
  hdFinishingDelta?: number | null; // EDGE high-danger finishing vs league — luck signal from nhl_snapshots
  edgeOzPct?: number | null;         // EDGE offensive-zone time share from latest snapshot
  edgeOzPercentile?: number | null;  // EDGE offensive-zone percentile from latest snapshot
  edgeSpeedMaxMph?: number | null;   // EDGE top skating speed from latest snapshot
  edgeBurstsOver20?: number | null;  // EDGE 20+ mph bursts from latest snapshot
  xgaRelTM?: number | null;
  dzPct?: number | null;
  goalsPace?: number;
  assistsPace?: number;
  plusMinus?: number | null;
  round?: number;
  year?: number;
  teamStanding?: number;
  isProtected?: boolean;
  gsax?: number;
  savePct?: number;
  gamesStarted?: number;
  shotsPerGame?: number;
  /** NHL EDGE goalie leaderboard appearances (PA3) — board name + rank. */
  goalieEdgeBoards?: { board: string; rank: number }[] | null;
  careerGsax?: number;
  awards?: string[];
  peakNAV?: number;
  // Point Shares (computed dynamically from NHL Stats API)
  ops?: number | null;  // Offensive Point Shares — current season
  dps?: number | null;  // Defensive Point Shares — current season

  teamXga60?: number;
  teamHdca60?: number;
  baselineGsax?: number;
  hasExtension?: boolean;
  extensionCapHit?: number;   // future AAV once extension kicks in
  extensionYears?: number;    // length of the extension
  extensionSignedAt?: string | null; // ISO date the extension was signed (PA8 dated feed)
  
  // MoneyPuck 3-Year Baselines
  baselinePtsPace?: number;
  baselineGameScore?: number;
  baselineDpsProxy?: number;

  // Multi-season situational baselines (MoneyPuck per-season + NST 2022-26)
  baselineXgRel?: number;
  ppPtsPace82?: number;
  pkTimeShare?: number;
  baselineIxg82?: number;
  baselineHits82?: number;
  baselineBlocks82?: number;
  pairXgfPct?: number;
  pairDriverScore?: number;
  baselineHdsvPct?: number;

  // Trade block (admin-managed, stamped by league routes from the tradeBlock table)
  tradeBlockStatus?: "requested" | "available" | "blocked" | "untouchable" | null;
  tradeBlockNote?: string | null;

  // Contract expiry / free agency (resolved from the players table by roster-assembly)
  expiryStatus?: string | null;                       // raw status (e.g. "UFA", "RFA")
  expiryYear?: number | null;                         // calendar year the deal expires (authoritative FA signal)
  contractStatus?: "UFA" | "RFA" | "SIGNED";          // normalized pending status this offseason
  expiresThisOffseason?: boolean;                     // pending free agent (expiryYear <= projected season start)
  // Signed a year early; costs nothing until the current deal runs out, at
  // which point the season rollover activates it (OFF5).
  pendingExtension?: { aav: number; term: number; wouldHaveBeen: "UFA" | "RFA" } | undefined;
  contractMissing?: boolean;                          // no contract row on file — using the league-min placeholder
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
  grav?: number;
  fmvAav?: number;
  noivImpact?: number;
  fArchetype?: FArchetype;
  rosterTier?: RosterTier;
  isRFA?: boolean;
  volatility?: number;
}

// Modern forward role taxonomy — primary identity label, not an EA-style build.
export type FArchetype =
  | "HIGH_GRAVITY"
  | "LINE_RAISER"
  | "LINE_ESTABLISHER"
  | "LINE_FINISHER"
  | "IMPACT_PLAYER"
  | "CLUTCH_PLAYER"
  | "DEFENSIVE"
  | "SPEED_BURST"
  | "SPACE_OPENER"
  | "";

export type RosterTier =
  | "ELITE_1ST_LINE"
  | "1ST_LINE_HIGH_2C"
  | "ELITE_SHUTDOWN"
  | "PK_SPECIALIST"
  | "FRINGE_1ST_LINE_2C"
  | "MIDDLE_SIX"
  | "BOTTOM_SIX"
  | "ELITE_1ST_PAIR"
  | "TOP_PAIR"
  | "SHUTDOWN_D"
  | "SECOND_PAIR"
  | "THIRD_PAIR";

export type FlagSeverity = "HARD" | "SOFT" | "WARN" | "INFO";

export type FlagCategory =
  | "CAP_VIOLATION" | "FLOOR_VIOLATION" | "CLAUSE"
  | "ELITE_BLOCKADE" | "TIMELINE_MISMATCH" | "REBUILD_LOGIC"
  | "CONTENDER_LOGIC" | "ASSET_SHAPE_MISMATCH" | "POSITIONAL_REDUNDANCY"
  | "ROSTER_HOLE" | "LEVERAGE_ASYMMETRY" | "RENTAL_TAX" | "AGE_CLIFF"
  | "DEAD_WEIGHT" | "FIRE_SALE" | "LOCKER_ROOM" | "RETAIN_ABUSE" | "GOOD" | "VALUE_VETO"
  | "FRANCHISE_ANCHOR" | "UNTOUCHABLE";

export interface GmFlag {
  severity: FlagSeverity;
  category: FlagCategory;
  headline: string;
  explanation: string;
  affectedAsset?: string;
  vetoesSide?: 0 | 1;
  perspective?: "home" | "partner"; // whose problem this is; omit = home team
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

export type TradeSideOutcome = "WIN" | "LOSS" | "EVEN";

export interface TradeSideAssessment {
  side: "home" | "partner";
  teamId: string;
  teamName: string;
  outcome: TradeSideOutcome;
  navNet: number;
  winsAdded: number;
  windowYears: number;
  drivers: string[];
}

export interface TradeVerdict {
  status: TradeStatus;
  message: string;
  flags: GmFlag[];
  metrics: TradeMetrics;
  sideOutcomes?: TradeSideAssessment[];
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
  capCeiling?:     number | null;       // live admin cap ceiling override for NAV math
  runTrade?:       boolean;            // whether to run full evaluateTrade
}

export interface EvaluateResponse {
  navMap:   Record<string, XNAVResult>; // id → XNAVResult for all requested assets
  verdict?: TradeVerdict;              // only present when runTrade=true
}
