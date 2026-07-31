// ============================================================
// SHARED TYPES — used by both the API route and the UI
// Keep this file free of business logic — types only.
// ============================================================

import type { DevelopmentProfile } from "@/app/lib/development-profile";
import type { NavStage } from "@/app/lib/nav-breakdown";

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
  /**
   * Best available goalie workload — real starts where a source publishes them,
   * appearances otherwise. `startsKnown` says which. It used to be fed the
   * MoneyPuck games-played count unconditionally, so relief outings counted as
   * starts and moved the role ceiling on G-NAV.
   */
  gamesStarted?: number;
  /** True when `gamesStarted` is genuinely starts rather than appearances. */
  startsKnown?: boolean;
  /** Appearances, including relief. */
  gamesPlayed?: number | null;
  /** Goals against per SIXTY MINUTES. Null when ice time was unavailable. */
  gaa?: number | null;
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
  /**
   * Standings tier — where this club sits in the real NHL table right now,
   * derived server-side from conference/division rank and points percentage.
   * Static with respect to anything the user does. This is what the Team
   * Analytics chip and its filter mean.
   */
  phase?: string;
  /**
   * Competitive window — what this club's CURRENT roster looks like after
   * trades, signings and Cup Run rollover, derived from roster valuations.
   * Only ever set inside Armchair GM.
   *
   * These were one field. Armchair GM overwrote `phase` in local state, so
   * "phase" meant the standings tier on one page and the roster window on
   * another, and no call site could say which it wanted. Read this through
   * `teamWindow()` (app/lib/team-window.ts) rather than reaching for either
   * field directly.
   */
  rosterWindow?: string;
  needs?: { pos: string; minWar: number; label: string }[];
  prospectPool?: string;
}

/**
 * NOTE: this is a structural MIRROR of the interface in `app/lib/xnav-engine.ts`.
 * Two definitions of the same shape exist because components import from here
 * and the engine exports its own; they are compatible only as long as someone
 * keeps them that way. `__tests__/nav-identity.test.ts` pins the field the
 * accounting identity depends on. Worth collapsing into one definition.
 */
export interface XNAVResult {
  total: number;
  off: number;
  /** Descriptive defensive rating — NOT the defensive value inside `total`. See `stages`. */
  def: number;
  age: number;
  cap: number;
  /** Descriptive upside signal, not an additive component. Not part of `stages`. */
  upside: number;
  grav?: number;
  fmvAav?: number;
  noivImpact?: number;
  fArchetype?: FArchetype;
  rosterTier?: RosterTier;
  isRFA?: boolean;
  volatility?: number;
  /** Signed rows that sum to `total`. See `app/lib/nav-breakdown.ts`. */
  stages?: NavStage[];
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
