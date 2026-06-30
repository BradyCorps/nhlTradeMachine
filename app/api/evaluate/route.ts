import { NextResponse } from "next/server";
import { getHistoricalFloor, getInjuryRisk, getProspectTier } from "@/app/lib/player-data";
import type {
  Asset,
  EvaluateRequest,
  EvaluateResponse,
  FArchetype,
  TradeSideAssessment,
  TradeSideOutcome,
} from "@/app/lib/trade-types";
import { SEASON, LEAGUE, FRANCHISE } from "@/app/lib/season-config";
import { calcNAV, compressPackage as coreCompress, AssetInput, XNAVResult } from "@/app/lib/xnav-engine";
import {
  DIVISION_BY_TEAM,
  hasVeteranTerm,
  isDevelopmentRiskAsset,
  isFutureCoreAsset,
  isPeakWindowAsset,
  isPremiumLotteryPick,
  isShoppedAsset,
  normalizePosition,
} from "@/app/lib/trade-classification";
import { z } from "zod";
import { db } from "@/app/db/client";
import { siteSettings } from "@/app/db/schema";
import { isValidCapCeiling, maxCapCeiling, parseStoredCapCeiling } from "@/app/lib/cap-settings";

// ============================================================
// ZOD SCHEMAS
// ============================================================
const normalizeAssetPosition = (position: unknown) => {
  if (typeof position !== "string") return "C";
  const trimmed = position.trim();
  if (trimmed.toLowerCase() === "pick") return "Pick";
  const normalized = trimmed.toUpperCase();
  if (normalized === "L" || normalized === "R" || normalized === "LW" || normalized === "RW") return "W";
  if (normalized === "C" || normalized === "D" || normalized === "G" || normalized === "W") return normalized;
  // Coerce any unrecognized/missing position (e.g. "UNKNOWN", "F", "") to a skater
  // default so one bad roster row can't 400 the entire NAV batch.
  return "C";
};

const AssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.preprocess(normalizeAssetPosition, z.enum(["C", "W", "D", "G", "Pick"])),
  age: z.number().nullish().default(27),
  capHit: z.number().nullish().default(0),
  yearsRemaining: z.number().nullish().default(1),
  capCeiling: z.number().nullish(),
  retainedPct: z.number().nullish(),
  extensionCapHit: z.number().nullish(),
  extensionYears: z.number().nullish(),
  ptsPace: z.number().nullish(),
  xGPace: z.number().nullish(),
  defRate: z.number().nullish(),
  avgTOI: z.number().nullish(),
  qocRank: z.number().nullish(),
  qocIndex: z.number().nullish(),
  draftOverall: z.number().nullish(),
  prospectPtsPace: z.number().nullish(),
  xgRelTM: z.number().nullish(),
  xgaRelTM: z.number().nullish(),
  dzPct: z.number().nullish(),
  ops: z.number().nullish(),
  dps: z.number().nullish(),
  games: z.number().nullish(),
  gsax: z.number().nullish(),
  savePct: z.number().nullish(),
  gamesStarted: z.number().nullish(),
  teamXga60: z.number().nullish(),
  teamHdca60: z.number().nullish(),
  round: z.number().nullish(),
  year: z.number().nullish(),
  teamStanding: z.number().nullish(),
  isProtected: z.boolean().nullish(),
  multiplier: z.number().nullish(),
  hasLiveStats: z.boolean().nullish(),
  baselineGsax: z.number().nullish(),
  baselinePtsPace: z.number().nullish(),
  baselineGameScore: z.number().nullish(),
  baselineDpsProxy: z.number().nullish(),
  baselineXgRel: z.number().nullish(),
  ppPtsPace82: z.number().nullish(),
  pkTimeShare: z.number().nullish(),
  baselineIxg82: z.number().nullish(),
  baselineHits82: z.number().nullish(),
  baselineBlocks82: z.number().nullish(),
  pairXgfPct: z.number().nullish(),
  pairDriverScore: z.number().nullish(),
  baselineHdsvPct: z.number().nullish(),
  teamId: z.string().nullish(),
  hasNMC: z.boolean().nullish(),
  hasNTC: z.boolean().nullish(),
  canRetain: z.boolean().nullish(),
  tradeBlockStatus: z.enum(["requested", "available", "blocked", "untouchable"]).nullish(),
  tradeBlockNote: z.string().nullish(),
}).passthrough();

const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  capSpace: z.number(),
  standing: z.number(),
  phase: z.string().optional(),
  needs: z.array(z.any()).optional(),
}).passthrough();

const EvaluateRequestSchema = z.object({
  assets: z.array(AssetSchema).optional(),
  runTrade: z.boolean().optional(),
  tradeOutgoing: z.array(AssetSchema).optional(),
  tradeIncoming: z.array(AssetSchema).optional(),
  homeTeam: TeamSchema.optional(),
  partnerTeam: TeamSchema.optional(),
  allHomeRoster: z.array(AssetSchema).optional(),
  allPartnerRoster: z.array(AssetSchema).optional(),
  capCeiling: z.number().nullish(),
});


type Team = import("@/app/lib/trade-types").Team;

// ============================================================
// TRADE ENGINE — server-side only
// All valuation math is now imported directly from xnav-engine.ts.
// GM logic and API orchestration lives here.
// ============================================================

const safe  = (n: number) => (isNaN(n) || !isFinite(n) ? 0 : n);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const fmt   = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));
const MAX_CAP_CEILING = maxCapCeiling();

const getLiveCapCeiling = async (requestCapCeiling?: number | null): Promise<number> => {
  if (requestCapCeiling != null && isValidCapCeiling(requestCapCeiling)) return requestCapCeiling;
  const rows = await db.select().from(siteSettings).catch(() => []);
  const row = rows.find((r) => r.key === "cap_ceiling");
  return parseStoredCapCeiling(row?.value, SEASON.capCeiling) ?? SEASON.capCeiling;
};

// ── Adapter: Maps raw client Asset to strict engine AssetInput ──
const getAssetNAV = (asset: Asset, capCeiling: number = SEASON.capCeiling): XNAVResult => {
  const input: AssetInput = {
    id: asset.id,
    name: asset.name,
    position: asset.position as "C" | "W" | "D" | "G" | "Pick",
    age: asset.age ?? 27,
    capHit: asset.capHit ?? 0,
    yearsRemaining: asset.yearsRemaining ?? 1,
    capCeiling: asset.capCeiling ?? capCeiling,
    retainedPct: asset.retainedPct,
    extensionCapHit: asset.extensionCapHit,
    extensionYears: asset.extensionYears,
    ptsPace: asset.ptsPace,
    xGPace: asset.xGPace,
    defRate: asset.defRate,
    avgTOI: asset.avgTOI,
    qocRank: asset.qocRank,
    qocIndex: asset.qocIndex,
    draftOverall: asset.draftOverall ?? undefined,
    prospectPtsPace: asset.prospectPtsPace ?? undefined,
    xgRelTM: asset.xgRelTM,
    xgaRelTM: asset.xgaRelTM,
    dzPct: asset.dzPct,
    ops: asset.ops,
    dps: asset.dps,
    games: asset.games,
    gsax: asset.gsax,
    savePct: asset.savePct,
    gamesStarted: asset.gamesStarted,
    teamXga60: asset.teamXga60,
    teamHdca60: asset.teamHdca60,
    round: asset.round,
    year: asset.year,
    teamStanding: asset.teamStanding,
    isProtected: asset.isProtected,
    multiplier: asset.multiplier,
    hasLiveStats: asset.hasLiveStats,
    baselineGsax: asset.baselineGsax,
    baselinePtsPace: asset.baselinePtsPace,
    baselineGameScore: asset.baselineGameScore,
    baselineDpsProxy: asset.baselineDpsProxy,
    baselineXgRel: asset.baselineXgRel,
    ppPtsPace82: asset.ppPtsPace82,
    pkTimeShare: asset.pkTimeShare,
    baselineIxg82: asset.baselineIxg82,
    baselineHits82: asset.baselineHits82,
    baselineBlocks82: asset.baselineBlocks82,
    pairXgfPct: asset.pairXgfPct,
    pairDriverScore: asset.pairDriverScore,
    baselineHdsvPct: asset.baselineHdsvPct,
    tradeBlockStatus: asset.tradeBlockStatus,
  };
  const result = calcNAV(input);
  if (asset.position === "Pick") return result;

  const historicalFloor = getHistoricalFloor(asset.name, result.total, asset);
  if (historicalFloor <= result.total) return result;

  const liftedTotal = Math.round(historicalFloor);
  return {
    ...result,
    total: liftedTotal,
    cap: result.cap + (liftedTotal - result.total),
  };
};

// ── Package compression (Delegated to xnav-engine.ts) ──
const compressPackage = (assets: Asset[], capCeiling: number = SEASON.capCeiling): number => {
  if (assets.length === 0) return 0;
  const mappedAssets = assets.map(a => ({
    nav: getAssetNAV(a, capCeiling).total,
    isPick: a.position === "Pick",
    age: a.age
  }));
  return coreCompress(mappedAssets);
};


// ============================================================
// X-NAV — v2.0
// ============================================================
type FlagSeverity = "HARD" | "SOFT" | "WARN" | "INFO";
type FlagCategory =
  | "CAP_VIOLATION" | "FLOOR_VIOLATION" | "CLAUSE"
  | "ELITE_BLOCKADE" | "TIMELINE_MISMATCH" | "REBUILD_LOGIC"
  | "CONTENDER_LOGIC" | "ASSET_SHAPE_MISMATCH" | "POSITIONAL_REDUNDANCY"
  | "ROSTER_HOLE" | "LEVERAGE_ASYMMETRY" | "RENTAL_TAX" | "AGE_CLIFF"
  | "DEAD_WEIGHT" | "FIRE_SALE" | "LOCKER_ROOM" | "RETAIN_ABUSE" | "GOOD" | "VALUE_VETO"
  | "FRANCHISE_ANCHOR" | "UNTOUCHABLE";

interface GmFlag {
  severity: FlagSeverity;
  category: FlagCategory;
  headline: string;
  explanation: string;
  affectedAsset?: string;
  vetoesSide?: 0 | 1;
  perspective?: "home" | "partner"; 
}

type TeamMode = "CONTENDER" | "BUBBLE" | "RETOOLING" | "REBUILDING" | "TANKING";

const classifyTeam = (team: Team, roster: Asset[]): TeamMode => {
  if (team.phase === "Tanking")    return "TANKING";
  if (team.phase === "Rebuilding") return "REBUILDING";
  if (team.phase === "Retooling")  return "RETOOLING";
  if (team.phase === "Bubble")     return "BUBBLE";
  if (team.phase === "Contender")  return "CONTENDER";

  const capCeiling = SEASON.capCeiling;
  const capUsed = capCeiling - team.capSpace;
  if (team.standing <= 6  && capUsed > 85) return "CONTENDER";
  if (team.standing <= 14 && capUsed > 72) return "BUBBLE";
  if (team.standing > 24  && team.capSpace > 25) return "TANKING";
  if (team.standing > 18) return "REBUILDING";
  return "RETOOLING";
};

const positionalDepth = (assets: Asset[], position: string): number =>
  assets.filter((a) => {
    const ptsPace = a.ptsPace ?? 0;
    const avgTOI = a.avgTOI ?? 0;
    if (position === "C") return a.position === "C" && (ptsPace > 25 || avgTOI > 13);
    if (position === "D") return a.position === "D" && avgTOI > 18;
    return (a.position === "W" || a.position === "L" || a.position === "R") && (ptsPace > 20 || avgTOI > 11);
  }).length;

const rosterDepthAfterTrade = (fullRoster: Asset[], outgoing: Asset[], position: string): number => {
  const remaining = fullRoster.filter((p) => !outgoing.some((o) => o.id === p.id));
  return positionalDepth(remaining, position);
};

const teamNeedsPosition = (team: Team, position: string): boolean => {
  if (!team.needs?.length) return false;
  return team.needs.some(
    (n: { pos: string; minWar: number; label: string }) => n.pos === position || n.pos === "Any"
  );
};

const defensiveDependencyScore = (roster: Asset[]): number => {
  const dmen = roster.filter((p) => p.position === "D");
  const eliteD = dmen.filter((p) => (p.avgTOI ?? 0) > 22 && (p.ptsPace ?? 0) > 35);
  return eliteD.length <= 1 ? 0.9 : eliteD.length === 2 ? 0.6 : 0.3;
};

const FRANCHISE_THRESHOLD = FRANCHISE.threshold;
const MEGALODON_THRESHOLD = FRANCHISE.megalodon;

const runGmLogic = (
  outgoing: Asset[],
  incoming: Asset[],
  teamHome: Team | null,
  teamPartner: Team | null,
  allHomeRoster: Asset[],
  allPartnerRoster: Asset[],
  capCeiling: number = SEASON.capCeiling
): GmFlag[] => {
  const flags: GmFlag[] = [];
  if (!teamHome || !teamPartner) return flags;
  const navOf = (asset: Asset): number => getAssetNAV(asset, capCeiling).total;
  const isEstablishedTopPairD = (asset: Asset): boolean => {
    if (normalizePosition(asset.position) !== "D") return false;
    const hasNhlSample = (asset.games ?? 0) >= 20 && asset.hasLiveStats !== false;
    return hasNhlSample && ((asset.avgTOI ?? 0) > 22 || navOf(asset) > 100);
  };

  const modeHome = classifyTeam(teamHome, allHomeRoster);
  const modePartner = classifyTeam(teamPartner, allPartnerRoster);

  // ── 0. UNTOUCHABLE — partner GM hard decline ──────────────────
  // Admin-flagged untouchables are never traded, at any price. The
  // partner GM hangs up the phone before value is even discussed.
  for (const a of incoming) {
    if (a.tradeBlockStatus === "untouchable") {
      flags.push({
        severity: "HARD",
        category: "UNTOUCHABLE",
        headline: `${a.name} is untouchable — ${teamPartner.name} will not trade him`,
        explanation: `${teamPartner.name} has designated ${a.name} as untouchable. There is no package that moves this player — the conversation ends before value is discussed.${a.tradeBlockNote ? ` Front office note: ${a.tradeBlockNote}` : ""}`,
        affectedAsset: a.name,
        vetoesSide: 1,
        perspective: "partner",
      });
    }
  }

  const navOut   = outgoing.reduce((s, a) => s + navOf(a), 0);
  const navIn    = incoming.reduce((s, a) => s + navOf(a), 0);
  const cNavOut  = compressPackage(outgoing, capCeiling);
  const cNavIn   = compressPackage(incoming, capCeiling);
  const homeNetGain = cNavIn - cNavOut;
  const maxNav = Math.max(Math.abs(cNavOut), Math.abs(cNavIn), 1);
  const imbalancePct = (Math.abs(homeNetGain) / maxNav) * 100;

  const compressionLossIn  = navIn  - cNavIn;
  const compressionLossOut = navOut - cNavOut;

  if (compressionLossIn > 120 && incoming.filter(a => a.position !== "Pick").length >= 3) {
    flags.push({
      severity: "SOFT",
      category: "VALUE_VETO",
      headline: `Incoming package discounted — receiving depth, not concentration`,
      explanation: `The ${incoming.filter(a=>a.position!=="Pick").length}-player incoming package has a linear value of ${Math.round(navIn)} NAV, but its compressed value is ${Math.round(cNavIn)} NAV after the roster slot penalty (−${Math.round(compressionLossIn)}). You are receiving depth distribution across multiple lineup slots rather than one elite concentrated asset. The TugBar reflects the compressed value.`,
      perspective: "home",
    });
  }

  if (compressionLossOut > 120 && outgoing.filter(a => a.position !== "Pick").length >= 3) {
    flags.push({
      severity: "SOFT",
      category: "VALUE_VETO",
      headline: `You are overpaying — your depth package compresses to ${Math.round(cNavOut)} NAV`,
      explanation: `Your ${outgoing.filter(a=>a.position!=="Pick").length}-player outgoing package has a linear value of ${Math.round(navOut)} NAV, but its compressed value is ${Math.round(cNavOut)} NAV after the roster slot penalty (−${Math.round(compressionLossOut)}). You are spending ${outgoing.filter(a=>a.position!=="Pick").length} roster slots when the return is ${Math.round(navIn)} NAV — a net deficit of ${Math.round(cNavOut - navIn)}. Consolidate your package around fewer, higher-value assets.`,
      perspective: "home",
    });
  }

  const outFranchise = outgoing.filter(a => navOf(a) >= FRANCHISE_THRESHOLD);
  for (const asset of outFranchise) {
    const nav       = navOf(asset);
    const isMegalodon = nav >= MEGALODON_THRESHOLD;

    const contractLeverage = asset.yearsRemaining <= 1;
    const franchiseReturn = incoming.some(a =>
      navOf(a) >= FRANCHISE_THRESHOLD && a.position !== "Pick");

    const firstRoundPicks = incoming.filter(a =>
      a.position === "Pick" && (a.round ?? 99) === 1).length;
    const elcProspects = incoming.filter(a =>
      a.position !== "Pick" && (a.age ?? 99) <= 23 && a.capHit <= 0.95).length;
    const massiveCapital = firstRoundPicks >= 2 && elcProspects >= 1;

    if (isMegalodon && !contractLeverage && !franchiseReturn && !massiveCapital) {
      flags.push({
        severity: "HARD",
        category: "FRANCHISE_ANCHOR",
        headline: `${asset.name.split(" ").pop()} is a generational franchise anchor`,
        explanation: `At ${Math.round(nav)} NAV, ${asset.name} is not a tradeable asset under normal circumstances. Generational talents compress the production of an entire top line into one roster slot — trading them requires either imminent UFA status, a franchise-level player in return, or a Lindros-tier package.`,
        affectedAsset: asset.name,
        vetoesSide: 0,
      });
    } else if (!isMegalodon && !contractLeverage && !franchiseReturn && !massiveCapital) {
      flags.push({
        severity: "SOFT",
        category: "FRANCHISE_ANCHOR",
        headline: `${asset.name.split(" ").pop()} commands franchise-level return`,
        explanation: `${asset.name} (${Math.round(nav)} NAV) is an elite franchise cornerstone. Moving him requires either a franchise-calibre player in return, significant contract leverage (final year), or a massive picks/prospects package.`,
        affectedAsset: asset.name,
        vetoesSide: 0,
      });
    }
  }

  const outPlayers = outgoing.filter((a) => a.position !== "Pick");
  const inPlayers  = incoming.filter((a) => a.position !== "Pick");
  const outPicks   = outgoing.filter((a) => a.position === "Pick");
  const inPicks    = incoming.filter((a) => a.position === "Pick");

  for (const goalie of [...outPlayers, ...inPlayers].filter((a) => a.position === "G")) {
    const volatility = getAssetNAV(goalie, capCeiling).volatility ?? 0;
    if (volatility >= 40) {
      flags.push({
        severity: "WARN",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `${goalie.name.split(" ").pop()} carries goalie-value variance`,
        explanation: `${goalie.name}'s goalie NAV is a wider band than a skater point estimate because workload, age, and single-season save results are less stable. Treat the ${Math.round(volatility)}/100 volatility score as a risk adjustment in package construction.`,
        affectedAsset: goalie.name,
      });
      break;
    }
  }

  if (incoming.length > 0 && outgoing.length === 0 && cNavIn > 0) {
    flags.push({
      severity: "HARD", category: "VALUE_VETO",
      headline: "Incomplete Trade Proposal",
      explanation: `${teamPartner.name} is not a charity. You cannot acquire positive-value assets for nothing.`,
      vetoesSide: 1,
    });
  } else if (outgoing.length > 0 && incoming.length === 0 && navOut > 0) {
    flags.push({
      severity: "HARD", category: "VALUE_VETO",
      headline: "Incomplete Trade Proposal",
      explanation: `${teamHome.name} cannot give away positive-value assets for nothing.`,
      vetoesSide: 0,
    });
  }

  if (cNavIn > 0 && cNavOut > 0) {
    const isHomeRobbing    = cNavOut < cNavIn  * 0.45 && (cNavIn  - cNavOut) > 10;
    const isPartnerRobbing = cNavIn  < cNavOut * 0.45 && (cNavOut - cNavIn)  > 10;
    const allIncomingShopped = incoming.length > 0 && incoming.every(a =>
      a.tradeBlockStatus === "available" || a.tradeBlockStatus === "requested"
    );
    const allOutgoingShopped = outgoing.length > 0 && outgoing.every(a =>
      a.tradeBlockStatus === "available" || a.tradeBlockStatus === "requested"
    );
    const partnerConcessionLimit = allIncomingShopped ? 70 : 45;
    const homeConcessionLimit = allOutgoingShopped ? 70 : 45;

    if (isHomeRobbing) {
      flags.push({
        severity: "SOFT", category: "VALUE_VETO",
        headline: `${teamPartner.name} rejects massive underpayment`,
        explanation: `You are asking ${teamPartner.name} to give up ${navIn.toFixed(0)} NAV while only offering ${navOut.toFixed(0)} NAV in return. The offer needs significantly more value to be taken seriously.`,
        vetoesSide: 1,
      });
    } else if (isPartnerRobbing) {
       flags.push({
        severity: "SOFT", category: "VALUE_VETO",
        headline: `${teamHome.name} rejects massive underpayment`,
        explanation: `${teamHome.name} is being asked to give up ${navOut.toFixed(0)} NAV while only receiving ${navIn.toFixed(0)} NAV. This is a gross underpayment and gets rejected.`,
        vetoesSide: 0,
      });
    } else if (homeNetGain > partnerConcessionLimit && imbalancePct > 22) {
      flags.push({
        severity: "SOFT", category: "VALUE_VETO",
        headline: `${teamPartner.name} rejects lopsided surplus`,
        explanation: `${teamPartner.name} is conceding ${homeNetGain.toFixed(0)} compressed NAV in this structure. Even when a player is being shopped, real GMs rarely accept this much surplus without major hidden leverage, contract pressure, or additional compensation.`,
        vetoesSide: 1,
        perspective: "partner",
      });
    } else if (-homeNetGain > homeConcessionLimit && imbalancePct > 22) {
      flags.push({
        severity: "SOFT", category: "VALUE_VETO",
        headline: `${teamHome.name} rejects lopsided surplus`,
        explanation: `${teamHome.name} is conceding ${Math.abs(homeNetGain).toFixed(0)} compressed NAV in this structure. The value gap is beyond a normal GM tolerance band without major contextual leverage.`,
        vetoesSide: 0,
      });
    }
  }

  const capDeltaHome = incoming.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0) - outgoing.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0);
  const projCapHome = teamHome.capSpace - capDeltaHome;
  if (projCapHome < 0) flags.push({
    severity: "HARD", category: "CAP_VIOLATION",
    headline: "Cap Ceiling Breach",
    explanation: `This trade puts ${teamHome.name} $${Math.abs(projCapHome).toFixed(2)}M over the ceiling.`,
    vetoesSide: 0,
  });

  const capDeltaPartner = outgoing.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0) - incoming.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)),0);
  const projCapPartner = teamPartner.capSpace - capDeltaPartner;
  if (projCapPartner < 0) flags.push({
    severity: "HARD", category: "CAP_VIOLATION",
    headline: "Partner Cap Breach",
    explanation: `This trade puts ${teamPartner.name} $${Math.abs(projCapPartner).toFixed(2)}M over the ceiling.`,
    vetoesSide: 1,
  });

  const newCapUsedHome = capCeiling - projCapHome;
  if (newCapUsedHome < SEASON.capFloor && capDeltaHome < -3) flags.push({
    severity: "HARD", category: "FLOOR_VIOLATION",
    headline: "Cap Floor Violation",
    explanation: `${teamHome.name} would fall below the NHL's $${SEASON.capFloor.toFixed(1)}M cap floor.`,
    vetoesSide: 0,
  });

  const waiverProbability = (player: Asset, destination: Team | null): number => {
    if (!destination) return 0;
    let prob = 0.3;
    const destPhase = destination.phase ?? "Retooling";
    if (destPhase === "Contender") prob += 0.4;
    else if (destPhase === "Bubble") prob += 0.2;
    else if (destPhase === "Rebuilding" || destPhase === "Tanking") prob -= 0.2;

    if (player.age >= 34) prob += 0.25;
    else if (player.age >= 31) prob += 0.1;
    else if (player.age <= 27) prob -= 0.15; 

    if ((player.yearsRemaining || 0) <= 2) prob += 0.15;
    else if ((player.yearsRemaining || 0) >= 6) prob -= 0.1;

    return Math.min(0.95, Math.max(0.05, prob));
  };

  const nmcOut = outPlayers.find((a) => a.hasNMC);
  if (nmcOut) {
    const prob         = waiverProbability(nmcOut, teamPartner);
    const pctStr       = `${Math.round(prob * 100)}%`;
    const likelyWaives = prob >= 0.50;
    flags.push({
      severity: likelyWaives ? "WARN" : "HARD",
      category: "CLAUSE",
      headline: likelyWaives ? `NMC — ${nmcOut.name} likely to waive (~${pctStr})` : `NMC — ${nmcOut.name} will not waive (${pctStr})`,
      explanation: likelyWaives 
        ? `${nmcOut.name} holds a Full NMC but the destination makes this workable. Probability: ~${pctStr}.`
        : `${nmcOut.name} holds a Full NMC and won't waive for this destination. Probability: ~${pctStr}.`,
      affectedAsset: nmcOut.name, vetoesSide: 0,
    });
  }

  const nmcIn = inPlayers.find((a) => a.hasNMC);
  if (nmcIn) {
    const prob         = waiverProbability(nmcIn, teamHome);
    const pctStr       = `${Math.round(prob * 100)}%`;
    const likelyWaives = prob >= 0.50;
    flags.push({
      severity: likelyWaives ? "WARN" : "HARD",
      category: "CLAUSE",
      headline: likelyWaives ? `NMC — ${nmcIn.name} likely to waive (~${pctStr})` : `NMC — ${nmcIn.name} will not waive (${pctStr})`,
      explanation: likelyWaives 
        ? `${nmcIn.name} holds a Full NMC. Going to ${teamHome.name}, probability is ~${pctStr}.`
        : `${nmcIn.name} holds a Full NMC and moving to ${teamHome.name} doesn't appeal. Probability is ~${pctStr}.`,
      affectedAsset: nmcIn.name, vetoesSide: 1,
    });
  }

  if (outgoing.some((a) => (a.retainedPct || 0) > 0.5)) flags.push({
    severity: "HARD", category: "RETAIN_ABUSE",
    headline: "Retention Exceeds 50% Cap",
    explanation: `The NHL CBA prohibits retaining more than 50% of any player's cap hit.`,
  });

  const partnerElites = incoming.filter((a) => navOf(a) > 260 && !isShoppedAsset(a));
  const homeElites    = outgoing.filter((a) => navOf(a) > 200);
  if (partnerElites.length > 0 && homeElites.length === 0) {
    const requiredOverpay = navIn * 0.18;
    if (navOut < navIn + requiredOverpay) flags.push({
      severity: "SOFT", category: "ELITE_BLOCKADE",
      headline: `${teamPartner.name} protects ${partnerElites[0].name.split(" ").pop()}`,
      explanation: `${partnerElites[0].name} is a franchise cornerstone. This package would get laughed out of the room.`,
      affectedAsset: partnerElites[0].name, vetoesSide: 1,
    });
  }

  const divHome    = DIVISION_BY_TEAM[teamHome.id];
  const divPartner = DIVISION_BY_TEAM[teamPartner.id];
  if (divHome && divPartner && divHome === divPartner) {
    const bothCompetitive = (modeHome !== "REBUILDING" && modeHome !== "TANKING") &&
                            (modePartner !== "REBUILDING" && modePartner !== "TANKING");
    flags.push({
      severity: bothCompetitive ? "WARN" : "INFO",
      category: "LEVERAGE_ASYMMETRY",
      headline: `Same-division trade — ${divHome} rivals`,
      explanation: `Intra-division trades are the rarest in the NHL — GMs are deeply reluctant to hand a direct rival an upgrade.`,
    });
  }

  const POSITION_MINIMUMS: Record<string, { min: number; survivable: number; label: string }> = {
    C: { min: 2, survivable: 1, label: "centres"    },
    W: { min: 3, survivable: 2, label: "wingers"    },
    D: { min: 3, survivable: 2, label: "defencemen" },
    G: { min: 1, survivable: 1, label: "goalies"    },
  };

  const isStarUpgrade = (assets: Asset[]): boolean => {
    const playerUpgrade = assets.some(a =>
      a.position !== "Pick" && ((a.ptsPace ?? 0) > 65 || navOf(a) > 180 || (a.position === "G" && (a.gsax ?? 0) > 12))
    );
    const totalNav = assets.reduce((s, a) => s + navOf(a), 0);
    const hasValuablePick = assets.some(a => a.position === "Pick" && navOf(a) > 35);
    return playerUpgrade || (hasValuablePick && totalNav > 60);
  };

  const qualityCount = (roster: Asset[], pos: string): number => {
    const p = normalizePosition(pos);
    if (p === "C") return roster.filter(a => normalizePosition(a.position) === "C" && ((a.ptsPace ?? 0) > 25 || (a.avgTOI ?? 0) > 13)).length;
    if (p === "W") return roster.filter(a => normalizePosition(a.position) === "W" && ((a.ptsPace ?? 0) > 20 || (a.avgTOI ?? 0) > 11)).length;
    if (p === "D") return roster.filter(a => normalizePosition(a.position) === "D" && (a.avgTOI ?? 0) > 18).length;
    if (p === "G") return roster.filter(a => normalizePosition(a.position) === "G" && (a.gamesStarted ?? a.games ?? 0) > 10).length;
    return 0;
  };

  const qualityCountAfter = (roster: Asset[], outgoing: Asset[], pos: string): number => {
    const remaining = roster.filter(a => !outgoing.some(o => o.id === a.id));
    return qualityCount(remaining, pos);
  };

  const homeGivingUp = outPlayers;
  const positionsHomeLosing = [...new Set(homeGivingUp.map(a => normalizePosition(a.position)))];

  for (const pos of positionsHomeLosing) {
    if (!POSITION_MINIMUMS[pos]) continue;
    const { min, survivable, label } = POSITION_MINIMUMS[pos];
    const before = qualityCount(allHomeRoster, pos);
    const after  = qualityCountAfter(allHomeRoster, homeGivingUp, pos);

    if (after < min) {
      const veteransLeaving = homeGivingUp.filter(a => normalizePosition(a.position) === pos && a.age >= 28);
      if ((modeHome === "REBUILDING" || modeHome === "TANKING") && veteransLeaving.length > 0) continue;

      const playersLeaving = homeGivingUp.filter(a => normalizePosition(a.position) === pos).map(a => a.name).join(" and ");
      const incomingAtPos  = inPlayers.filter(a => normalizePosition(a.position) === pos);
      const incomingFills  = incomingAtPos.length > 0;

      const leavingNav   = homeGivingUp.filter(a => normalizePosition(a.position) === pos).reduce((s, a) => s + navOf(a), 0);
      const incomingNav  = incomingAtPos.reduce((s, a) => s + navOf(a), 0);
      const hasRetained  = incomingAtPos.some(a => (a.retainedPct || 0) > 0);
      const bothNearZero = Math.abs(leavingNav) < 15 && Math.abs(incomingNav) < 15;
      const isDirectSwap = incomingFills && (incomingNav >= leavingNav * 0.5 || bothNearZero || hasRetained);
      if (isDirectSwap) continue;

      const starException = (modeHome === "CONTENDER" || modeHome === "BUBBLE") && after >= survivable && isStarUpgrade(inPlayers);

      flags.push({
        severity: starException ? "WARN" : "SOFT",
        category: "POSITIONAL_REDUNDANCY",
        headline: starException ? `${teamHome.name} trades depth for star power` : `${teamHome.name} can't drop below ${min} quality ${label}`,
        explanation: `${teamHome.name} currently has ${before} quality ${label}. Trading away ${playersLeaving} leaves them with only ${after}.`,
        vetoesSide: 0,
      });
    }
  }

  const partnerGivingUp = inPlayers.filter((a) => a.position !== "Pick");
  const positionsPartnerLosing = [...new Set(partnerGivingUp.map(a => normalizePosition(a.position)))];

  for (const pos of positionsPartnerLosing) {
    if (!POSITION_MINIMUMS[pos]) continue;
    const { min, survivable, label } = POSITION_MINIMUMS[pos];
    const before = qualityCount(allPartnerRoster, pos);
    const after  = qualityCountAfter(allPartnerRoster, partnerGivingUp, pos);

    if (after < min) {
      const playersAtPosLeaving = partnerGivingUp.filter(a => normalizePosition(a.position) === pos);
      if (playersAtPosLeaving.length > 0 && playersAtPosLeaving.every(isShoppedAsset)) continue;

      const playersLeaving = playersAtPosLeaving.map(a => a.name).join(" and ");
      const incomingAtPos = outPlayers.filter(a => normalizePosition(a.position) === pos);
      const incomingFills = incomingAtPos.length > 0;
      const leavingNav    = partnerGivingUp.filter(a => normalizePosition(a.position) === pos).reduce((s, a) => s + navOf(a), 0);
      const incomingNav   = incomingAtPos.reduce((s, a) => s + navOf(a), 0);
      const hasRetained   = incomingAtPos.some(a => (a.retainedPct || 0) > 0);
      const bothNearZero  = Math.abs(leavingNav) < 15 && Math.abs(incomingNav) < 15;
      const swapThreshold = hasRetained ? 0.15 : 0.5;
      const isDirectSwap  = incomingFills && (incomingNav >= leavingNav * swapThreshold || bothNearZero || hasRetained);

      if (modePartner === "REBUILDING" || modePartner === "TANKING") {
        const givingAwayYouth = partnerGivingUp.filter(a => normalizePosition(a.position) === pos).every(a => a.age <= 25);
        if (!givingAwayYouth) continue; 
      }

      if (isDirectSwap) continue;
      const starException = (modePartner === "CONTENDER" || modePartner === "BUBBLE") && after >= survivable && isStarUpgrade(outPlayers);

      flags.push({
        severity: starException ? "WARN" : "SOFT",
        category: "POSITIONAL_REDUNDANCY",
        headline: starException ? `${teamPartner.name} trades depth for star power` : `${teamPartner.name} can't drop below ${min} quality ${label}`,
        explanation: `${teamPartner.name} currently has ${before} quality ${label}. Trading away ${playersLeaving} leaves them with only ${after}.`,
        vetoesSide: 1,
      });
    }
  }

  const tradingAwayD = outPlayers.filter((a) => a.position === "D");
  if (tradingAwayD.length > 0) {
    const depScore          = defensiveDependencyScore(allHomeRoster);
    const eliteDBeingTraded = tradingAwayD.filter(isEstablishedTopPairD);
    const dComingBack       = inPlayers.filter(a => a.position === "D");
    const leavingDNav       = eliteDBeingTraded.reduce((s, a) => s + navOf(a), 0);
    const incomingDNav      = dComingBack.reduce((s, a) => s + navOf(a), 0);
    const isDForD           = dComingBack.length > 0 && incomingDNav >= leavingDNav * 0.4;
    const allDBeingTradedAreVeterans = eliteDBeingTraded.every(a => a.age >= 28);
    const isRebuildingVeteranMove    = (modeHome === "REBUILDING" || modeHome === "TANKING") && allDBeingTradedAreVeterans;

    if (depScore >= 0.6 && eliteDBeingTraded.length > 0 && !isDForD && !isRebuildingVeteranMove) {
      const dName = eliteDBeingTraded[0].name;
      flags.push({
        severity: "SOFT", category: "ASSET_SHAPE_MISMATCH",
        headline: `${teamHome.name}'s D corps can't absorb losing ${dName}`,
        explanation: `${teamHome.name}'s defensive structure is a known vulnerability. Nothing defensively meaningful is coming back.`,
        affectedAsset: dName, vetoesSide: 0,
      });
    }
  }

  const partnerTradingAwayD = partnerGivingUp.filter((a) => a.position === "D");
  if (partnerTradingAwayD.length > 0) {
    const depScore          = defensiveDependencyScore(allPartnerRoster);
    const eliteDBeingTraded = partnerTradingAwayD.filter(isEstablishedTopPairD);
    const dComingBack       = outPlayers.filter(a => a.position === "D");
    const leavingDNav       = eliteDBeingTraded.reduce((s, a) => s + navOf(a), 0);
    const incomingDNav      = dComingBack.reduce((s, a) => s + navOf(a), 0);
    const isDForD           = dComingBack.length > 0 && incomingDNav >= leavingDNav * 0.4;
    const allEliteDareVeterans    = eliteDBeingTraded.every(a => a.age >= 28);
    const isRebuildingVeteranMove = (modePartner === "REBUILDING" || modePartner === "TANKING") && allEliteDareVeterans;

    if (depScore >= 0.6 && eliteDBeingTraded.length > 0 && !isDForD && !isRebuildingVeteranMove) {
      const dName = eliteDBeingTraded[0].name;
      flags.push({
        severity: "SOFT", category: "ASSET_SHAPE_MISMATCH",
        headline: `${teamPartner.name}'s D corps can't absorb losing ${dName}`,
        perspective: "partner" as const,
        explanation: `${teamPartner.name}'s defensive structure is a known vulnerability. Nothing defensively meaningful is coming back.`,
        affectedAsset: dName, vetoesSide: 1,
      });
    }
  }

  const partnerIsContending = modePartner === "CONTENDER" || modePartner === "BUBBLE";
  const partnerHighNavOut   = partnerGivingUp.filter(a => navOf(a) > 100);
  const homeHasPicksOrProsp = outPlayers.some(a => a.position === "Pick" || (getProspectTier(a.name) != null));
  const partnerGivingNav    = partnerHighNavOut.reduce((s, a) => s + navOf(a), 0);
  const partnerReceiving    = cNavOut;
  const partnerGetsEnough   = partnerReceiving >= partnerGivingNav * 0.90;

  if (partnerIsContending && partnerHighNavOut.length > 0 && !homeHasPicksOrProsp && !partnerGetsEnough) {
    const topAsset = partnerHighNavOut.sort((a,b) => navOf(b) - navOf(a))[0];
    flags.push({
      severity: "HARD", category: "TIMELINE_MISMATCH",
      headline: `${teamPartner.name} requires future assets to move ${topAsset.name}`, perspective: "partner" as const,
      explanation: `${teamPartner.name} is a ${modePartner.toLowerCase()} team — they do not trade prime assets in straight player swaps without draft capital attached.`,
      affectedAsset: topAsset.name, vetoesSide: 1,
    });
  }

  for (const player of partnerGivingUp) {
    if (isShoppedAsset(player)) continue;
    const playerPos = normalizePosition(player.position);
    const need = teamPartner.needs?.find((n: { pos: string; minWar: number; label: string }) => n.pos === playerPos);
    if (!need) continue;
    const isD   = player.position === "D";
    const isF   = ["C","W","L","R"].includes(player.position);
    const minTOI = isD ? 18 : isF ? 14 : 12;
    const minNAV = 30;
    const playerNav  = navOf(player);
    const meetsQuality = ((player.avgTOI ?? 0) >= minTOI || playerNav >= minNAV * 1.35) && playerNav >= minNAV;
    if (!meetsQuality) continue;

    flags.push({
      severity: "SOFT", category: "ASSET_SHAPE_MISMATCH",
      headline: `${player.name.split(" ").pop()} fills ${teamPartner.name}'s own stated need`,
      explanation: `Trading him away is the direct opposite of the team's stated roster-building direction. You don't sell the asset you're desperately trying to buy.`,
      affectedAsset: player.name, vetoesSide: 1, perspective: "partner",
    });
    break;
  }

  if (modePartner === "CONTENDER" && inPicks.length > 0 && outPlayers.length === 0) flags.push({
    severity: "SOFT", category: "ASSET_SHAPE_MISMATCH",
    headline: `${teamPartner.name} needs players, not picks`,
    perspective: "partner" as const,
    explanation: `${teamPartner.name} is in win-now mode. Contending teams don't trade their assets for draft picks that won't produce NHL players for 3–5 years.`,
    vetoesSide: 1,
  });

  if (modePartner === "REBUILDING" || modePartner === "TANKING") {
    const youngGoingOut  = partnerGivingUp.filter(a => a.position !== "Pick" && a.age <= 25);
    const veteranComing  = inPlayers.filter(a => hasVeteranTerm([a]) && !getProspectTier(a.name));
    const picksComingIn  = inPicks.length > 0;
    const futureCoreGoingOut = partnerGivingUp.filter(isFutureCoreAsset);
    const premiumPicksGoingOut = inPicks.filter(a => isPremiumLotteryPick(a, navOf));

    if (premiumPicksGoingOut.length > 0 && navOut < premiumPicksGoingOut.reduce((s, a) => s + navOf(a), 0) * 1.35) {
      flags.push({
        severity: "HARD", category: "REBUILD_LOGIC",
        headline: `${teamPartner.name} protects a premium lottery pick`,
        perspective: "partner" as const,
        explanation: `A rebuilding team does not sell a likely top-of-draft first unless the return is exceptional.`,
        affectedAsset: premiumPicksGoingOut[0].name,
        vetoesSide: 1,
      });
    } else if (youngGoingOut.length > 0 && veteranComing.length > 0 && !picksComingIn) {
      flags.push({
        severity: "HARD", category: "TIMELINE_MISMATCH",
        headline: `${teamPartner.name} shouldn't trade young core for a veteran`, perspective: "partner" as const,
        explanation: `${teamPartner.name} is rebuilding around youth. This trade sets the rebuild back by years.`,
        affectedAsset: youngGoingOut[0].name, vetoesSide: 1,
      });
    } else if (futureCoreGoingOut.length > 0 && veteranComing.length > 0 && !picksComingIn) {
      const core = futureCoreGoingOut[0];
      const p = core.developmentProfile!;
      flags.push({
        severity: "HARD", category: "TIMELINE_MISMATCH",
        headline: `${teamPartner.name} is selling a future-core profile`,
        perspective: "partner" as const,
        explanation: `${core.name} carries a ${p.developmentPhase.toLowerCase().replace(/_/g, " ")} development profile with ${p.dynastyScore}/100 dynasty value and a ${p.boomBustSignal.toLowerCase().replace(/_/g, " ")} arc. Rebuilders do not move that profile for veteran term without picks coming back.`,
        affectedAsset: core.name, vetoesSide: 1,
      });
    } else if (outPlayers.length > 0 && outPicks.length === 0 && !outgoing.some((a) => a.age <= 23 && a.position !== "Pick") && outPlayers.every((a) => a.age > 28)) {
      flags.push({
        severity: "SOFT", category: "ASSET_SHAPE_MISMATCH",
        headline: `${teamPartner.name} needs picks, not aging vets`,
        perspective: "partner" as const,
        explanation: `Rebuilding teams trade current assets to stockpile picks and prospects — not to receive aging veterans with limited upside.`,
        vetoesSide: 1,
      });
    }
  }

  if ((modeHome === "REBUILDING" || modeHome === "TANKING") && outPicks.length > 0) {
    const rentals = inPlayers.filter((a) => (a.yearsRemaining || 0) <= 1 && a.age > 28);
    if (rentals.length > 0) flags.push({
      severity: "SOFT", category: "REBUILD_LOGIC",
      headline: "Rebuilder trading picks for a rental",
      explanation: `${teamHome.name} is in rebuild mode. Trading draft picks for a rental is textbook bad front-office decision-making.`,
      affectedAsset: rentals[0].name, vetoesSide: 0,
    });
  }

  if (modeHome === "REBUILDING" || modeHome === "TANKING") {
    const futureCoreGoingOut = outPlayers.filter(isFutureCoreAsset);
    const veteranComing = inPlayers.filter(a => hasVeteranTerm([a]) && !getProspectTier(a.name));
    if (futureCoreGoingOut.length > 0 && veteranComing.length > 0 && inPicks.length === 0) {
      const core = futureCoreGoingOut[0];
      const p = core.developmentProfile!;
      flags.push({
        severity: "HARD", category: "REBUILD_LOGIC",
        headline: `${teamHome.name} shouldn't cash out ${core.name}'s development runway`,
        explanation: `${core.name} carries ${p.dynastyScore}/100 dynasty value with a ${p.boomBustSignal.toLowerCase().replace(/_/g, " ")} arc. A rebuilding team should not convert that runway into veteran term unless premium future assets are attached.`,
        affectedAsset: core.name, vetoesSide: 0,
      });
    }
  }

  if (modeHome === "CONTENDER" && outPicks.length > 0) {
    const decliners = inPlayers.filter((a) => a.age > 33 && (a.ptsPace ?? 0) < 45);
    if (decliners.length > 0) flags.push({
      severity: "SOFT", category: "CONTENDER_LOGIC",
      headline: "Picks for a declining player",
      explanation: `Contenders that mortgage their futures for players on the wrong side of the age curve almost always regret it.`,
      affectedAsset: decliners[0].name, vetoesSide: 0,
    });
  }

  if (modeHome === "CONTENDER" || modeHome === "BUBBLE") {
    const riskyDevelopmentBuy = inPlayers.find(isDevelopmentRiskAsset);
    const firstsOutgoing = outPicks.filter(p => (p.round || 3) === 1).length;
    if (riskyDevelopmentBuy && (firstsOutgoing > 0 || outPlayers.some(a => navOf(a) > 60))) {
      const p = riskyDevelopmentBuy.developmentProfile!;
      flags.push({
        severity: "WARN", category: "CONTENDER_LOGIC",
        headline: `${teamHome.name} is paying win-now assets for development variance`,
        explanation: `${riskyDevelopmentBuy.name} is a ${p.boomBustSignal.toLowerCase().replace(/_/g, " ")} profile with boom ${p.boomScore}/100, bust ${p.bustScore}/100, and ${p.projectionBand.confidence}/100 confidence. That can be worth the swing, but it is not clean deadline certainty.`,
        affectedAsset: riskyDevelopmentBuy.name, vetoesSide: 0,
      });
    }

    const peakHelp = inPlayers.find(isPeakWindowAsset);
    if (peakHelp && outPicks.length > 0) {
      const p = peakHelp.developmentProfile!;
      flags.push({
        severity: "INFO", category: "GOOD",
        headline: `${peakHelp.name} fits a win-now window`,
        explanation: `${peakHelp.name} is in a peak-window development phase with ${p.regressionRisk}/100 regression risk. This is the type of profile contenders can justify spending futures on.`,
        affectedAsset: peakHelp.name,
      });
    }
  }

  for (const asset of inPlayers) {
    const depth = positionalDepth(allHomeRoster, asset.position);
    if (depth >= 3 && asset.ptsPace > 50) {
      flags.push({
        severity: "WARN", category: "POSITIONAL_REDUNDANCY",
        headline: `Depth glut at ${asset.position}`,
        explanation: `${teamHome.name} already has ${depth} quality ${asset.position}s on the roster.`,
        affectedAsset: asset.name, vetoesSide: 0,
      });
      break;
    }
  }

  for (const asset of inPlayers) {
    const risk = getInjuryRisk(asset.name);
    if (risk && asset.capHit >= 4) {
      flags.push({
        severity: risk.level === "HIGH" ? "WARN" : "INFO",
        category: "ASSET_SHAPE_MISMATCH",
        headline: `${asset.name.split(" ").pop()} — ${risk.level.toLowerCase()} injury risk`,
        explanation: `${asset.name} carries a ${risk.level.toLowerCase()} injury risk flag: ${risk.note}.`,
        affectedAsset: asset.name, vetoesSide: 0,
      });
    }
  }

  for (const asset of [...outPlayers, ...inPlayers]) {
    const isUFAYear = (asset.yearsRemaining || 0) <= 1 && asset.age >= 27;
    const isHighValue = asset.ptsPace > 55 || (asset.position === "D" && asset.avgTOI > 22);
    if (isUFAYear && isHighValue) {
      const side = outPlayers.includes(asset) ? 0 : 1;
      flags.push({
        severity: "WARN", category: "RENTAL_TAX",
        headline: `${asset.name.split(" ").pop()} is a contract-year UFA — leverage risk`,
        explanation: `${asset.name} enters free agency this summer. He has all the leverage.`,
        affectedAsset: asset.name, vetoesSide: side,
      });
    }
  }

  const bestIn = [...inPlayers].sort((a,b) => navOf(b) - navOf(a))[0];
  if (bestIn && (bestIn.yearsRemaining || 0) <= 1 && bestIn.ptsPace > 55 && outPicks.length > 0) flags.push({
    severity: "WARN", category: "RENTAL_TAX",
    headline: `Rental premium risk — ${bestIn.name.split(" ").pop()}`,
    explanation: `${bestIn.name} is a rental. History is not kind to rental buyers.`,
    affectedAsset: bestIn.name, vetoesSide: 0,
  });

  for (const asset of inPlayers) {
    const ageAtEnd = asset.age + (asset.yearsRemaining || 1);
    if (asset.capHit > 7 && asset.age > 32 && ageAtEnd > 37) {
      flags.push({
        severity: "WARN", category: "AGE_CLIFF",
        headline: `${asset.name.split(" ").pop()} age cliff mid-deal`,
        explanation: `This contract will almost certainly become a cap anchor in years 2–3.`,
        affectedAsset: asset.name, vetoesSide: 0,
      });
      break;
    }
  }

  if (modeHome === "CONTENDER" && outPicks.filter((p) => (p.round || 3) === 1).length >= 2) flags.push({
    severity: "WARN", category: "CONTENDER_LOGIC",
    headline: "Shipping two 1st-round picks",
    explanation: `Contenders occasionally move one to win now, but two is franchise-altering.`,
    vetoesSide: 0,
  });

  const baggage = outPlayers.find((a) => a.capHit > 6 && a.age > 34 && (a.yearsRemaining||0) > 1);
  if (baggage && teamHome.capSpace < 5) flags.push({
    severity: "WARN", category: "LEVERAGE_ASYMMETRY",
    headline: `${baggage.name.split(" ").pop()} — difficult contract to move`,
    explanation: `Expect ${teamPartner.name} to demand a substantial sweetener just to take the cap hit.`,
    affectedAsset: baggage.name, vetoesSide: 1,
  });

  const dumpPlayers = outPlayers.filter(a => navOf(a) < -5);
  if (dumpPlayers.length > 0) {
    const deepDumps  = dumpPlayers.filter(a => navOf(a) < -30);
    const cosPlayers = dumpPlayers.filter(a => navOf(a) >= -30);
    if (deepDumps.length > 0) {
      const d = deepDumps[0];
      flags.push({
        severity: "WARN", category: "ASSET_SHAPE_MISMATCH",
        headline: `Salary dump — ${d.name.split(" ").pop()} needs significant sweetener`,
        explanation: `Most GMs won't touch without compensation. To move this, ${teamHome.name} will need to retain salary or attach draft picks.`,
        affectedAsset: d.name, vetoesSide: 1,
      });
    }
    if (cosPlayers.length > 0) {
      const c = cosPlayers[0];
      flags.push({
        severity: "INFO", category: "ASSET_SHAPE_MISMATCH",
        headline: `Change of scenery — ${c.name.split(" ").pop()} may thrive elsewhere`,
        explanation: `A different deployment, line combination, or organizational culture sometimes unlocks production.`,
        affectedAsset: c.name,
      });
    }
  }

  if (homeNetGain > 60 && navOf(incoming[0] || outgoing[0]) > 200) flags.push({
    severity: "INFO", category: "FIRE_SALE",
    headline: "Suspiciously favourable return",
    explanation: `Trades this lopsided only happen in real life when there is context the public doesn't know about.`,
    vetoesSide: 1,
  });

  const cultureAsset = outPlayers.find((a) => (a.multiplier||1.0) > 1.06 && a.ptsPace > 60);
  if (cultureAsset) flags.push({
    severity: "INFO", category: "LOCKER_ROOM",
    headline: `Culture loss — ${cultureAsset.name.split(" ").pop()}`,
    explanation: `Trading him isn't just a statistical loss. Teams that have moved their culture anchors often describe a difficult transition period.`,
    affectedAsset: cultureAsset.name, vetoesSide: 0,
  });

  const navGapPct = Math.abs(homeNetGain) / Math.max(Math.abs(navOut), Math.abs(navIn), 1) * 100;
  const absGap = Math.abs(homeNetGain);
  if ((absGap > 30 && navGapPct > 15) || absGap > 50) {
    const losingTeam  = homeNetGain < 0 ? teamHome  : teamPartner;
    const losingNav   = homeNetGain < 0 ? navOut : navIn;
    const gainingNav  = homeNetGain < 0 ? navIn  : navOut;
    flags.push({
      severity: "SOFT", category: "LEVERAGE_ASYMMETRY",
      headline: `${losingTeam.name} is significantly overpaying`,
      explanation: `The NAV analysis shows ${losingTeam.name} giving up ${losingNav.toFixed(0)} NAV points worth of assets and receiving only ${gainingNav.toFixed(0)} — a ${navGapPct.toFixed(0)}% gap.`,
      vetoesSide: homeNetGain < 0 ? 1 : 0,
    });
  }

  const hardFlags = flags.filter((f) => f.severity === "HARD");
  const softFlags = flags.filter((f) => f.severity === "SOFT");
  if (hardFlags.length === 0 && softFlags.length === 0 && navGapPct <= 15) flags.push({
    severity: "INFO", category: "GOOD",
    headline: "Mutually rational deal",
    explanation: `Both teams receive assets that match their organizational timeline. No CBA violations, no logical vetoes, no major red flags on either side.`,
  });

  return flags;
};

// ============================================================
// TRADE EVALUATION ENGINE
// ============================================================
const nullMetrics = () => ({
  navOut: 0, navIn: 0, homeNetGain: 0, ptsGain: 0,
  defGain: 0, capDelta: 0, variance: 0, ewaHome: 0, cwiYears: 0,
});

const sideOutcomeFromScore = (score: number): TradeSideOutcome => (
  score >= 1 ? "WIN" : score <= -1 ? "LOSS" : "EVEN"
);

const sideDrivers = (
  assetsIn: Asset[],
  assetsOut: Asset[],
  team: Team | null,
  navNet: number,
  winsAdded: number,
  windowYears: number,
  capDelta: number
): { drivers: string[]; fillsNeed: boolean } => {
  const drivers: string[] = [];
  const inPositions = new Set(assetsIn.map(a => normalizePosition(a.position)).filter(pos => pos !== "Pick"));
  const outPositions = new Set(assetsOut.map(a => normalizePosition(a.position)).filter(pos => pos !== "Pick"));
  const need = team?.needs?.find(n => inPositions.has(normalizePosition(n.pos)));
  const fillsNeed = Boolean(need);

  if (need) drivers.push(`Fills ${need.label.toLowerCase()}`);
  else if (inPositions.has("D") && !outPositions.has("D")) drivers.push("Adds blue-line depth");
  else if ((inPositions.has("C") || inPositions.has("W")) && !outPositions.has("C") && !outPositions.has("W")) drivers.push("Adds forward depth");
  else if (assetsIn.some(a => a.position === "Pick")) drivers.push("Adds future asset");

  if (navNet >= 10) drivers.push("NAV surplus");
  else if (navNet <= -10) drivers.push("Pays value premium");

  if (winsAdded >= 0.2) drivers.push("Immediate wins");
  else if (winsAdded <= -0.2) drivers.push("On-ice giveback");

  if (windowYears >= 0.25) drivers.push("Window value");
  else if (windowYears <= -0.25) drivers.push("Window cost");

  if (capDelta <= -0.5) drivers.push("Creates cap room");
  else if (capDelta >= 0.5) drivers.push("Uses cap space");

  if (drivers.length === 0) drivers.push("Balanced exchange");
  return { drivers: drivers.slice(0, 3), fillsNeed };
};

const buildSideAssessment = (
  side: "home" | "partner",
  team: Team | null,
  assetsIn: Asset[],
  assetsOut: Asset[],
  navNet: number,
  winsAdded: number,
  windowYears: number,
  capDelta: number
): TradeSideAssessment => {
  const { drivers, fillsNeed } = sideDrivers(assetsIn, assetsOut, team, navNet, winsAdded, windowYears, capDelta);
  const score =
    (navNet >= 10 ? 2 : navNet >= -10 ? 1 : -1) +
    (winsAdded >= 0.2 ? 1 : winsAdded <= -0.2 ? -1 : 0) +
    (windowYears >= 0.25 ? 1 : windowYears <= -0.25 ? -1 : 0) +
    (fillsNeed ? 1 : 0);

  return {
    side,
    teamId: team?.id ?? side,
    teamName: team?.name ?? (side === "home" ? "Home" : "Partner"),
    outcome: sideOutcomeFromScore(score),
    navNet,
    winsAdded,
    windowYears,
    drivers,
  };
};

const evaluateTrade = (
  outgoing: Asset[],
  incoming: Asset[],
  teamHome: Team | null,
  teamPartner: Team | null,
  allHomeRoster: Asset[],
  allPartnerRoster: Asset[],
  capCeiling: number = SEASON.capCeiling
): TradeVerdict => {
  if (!outgoing.length && !incoming.length) {
    return { status: "IDLE", message: "Add assets to evaluate", flags: [], metrics: nullMetrics() };
  }

  const navOut = outgoing.reduce((s, a) => s + getAssetNAV(a, capCeiling).total, 0);
  const navIn  = incoming.reduce((s, a) => s + getAssetNAV(a, capCeiling).total, 0);

  const cNavOut = compressPackage(outgoing, capCeiling);
  const cNavIn  = compressPackage(incoming, capCeiling);

  const homeNetGain = cNavIn - cNavOut;
  const ptsGain = incoming.reduce((s,a) => s + (a.ptsPace ?? 0), 0)
    - outgoing.reduce((s,a) => s + (a.ptsPace ?? 0), 0);
  const defGain = incoming.reduce((s,a) => s + ((a.defRate ?? 0) * ((a.avgTOI ?? 0) / 18)), 0)
    - outgoing.reduce((s,a) => s + ((a.defRate ?? 0) * ((a.avgTOI ?? 0) / 18)), 0);
  const capDelta = incoming.reduce((s,a) => s+a.capHit*(1-(a.retainedPct||0)),0) - outgoing.reduce((s,a) => s+a.capHit*(1-(a.retainedPct||0)),0);
  const maxNav = Math.max(Math.abs(cNavOut), Math.abs(cNavIn), 1);
  const variance = (Math.abs(homeNetGain) / maxNav) * 100;

  const teamStanding = teamHome?.standing ?? 16;
  const marginFactor = teamStanding >= 25 ? 1.0 : teamStanding >= 17 ? 0.85 : teamStanding >= 9  ? 0.70 : 0.55;

  // ── Estimated Wins Added — on-ice contribution, NOT NAV ──────
  // NAV bundles cap surplus, age, and contract efficiency — none of which score
  // goals. A star on a bad contract still wins you games. EWA uses the same
  // on-ice value model as the season sim (pts-equivalent units):
  //   Skaters — stable scoring (40/60 current/multi-season blend, persistence-
  //   validated r=0.86), plus driver credit for D-men and PK usage for forwards.
  //   Goalies — stable GSAX → pts-equivalent (~6 goals = 1 win = 2 pts) + HDSV%.
  // Conversion: pts-equivalent / 3.5 = standings pts, / 2 = wins → divide by 7.
  const onIceValue = (a: Asset): number => {
    if (a.position === "Pick") return 0;
    if (a.position === "G") {
      const gsaxStable = a.baselineGsax != null && a.baselineGsax !== 0
        ? (a.gsax ?? 0) * 0.4 + a.baselineGsax * 0.6
        : (a.gsax ?? 0);
      const hdsvKicker = a.baselineHdsvPct != null
        ? clamp((a.baselineHdsvPct - 0.815) * 400, -8, 12)
        : 0;
      return gsaxStable * 1.2 + hdsvKicker;
    }
    const pts = a.baselinePtsPace && a.baselinePtsPace > 0
      ? (a.ptsPace ?? 0) * 0.4 + a.baselinePtsPace * 0.6
      : (a.ptsPace ?? 0);
    const driverBonus = a.position === "D" && a.pairDriverScore != null
      ? clamp(a.pairDriverScore * 0.5, -5, 10)
      : 0;
    const pkBonus = a.pkTimeShare != null && a.pkTimeShare >= 0.10
      ? Math.min(5, a.pkTimeShare * 30)
      : 0;
    return pts + driverBonus + pkBonus;
  };
  const onIceDelta = incoming.reduce((s, a) => s + onIceValue(a), 0)
                   - outgoing.reduce((s, a) => s + onIceValue(a), 0);
  const ewaHome = (onIceDelta / 7) * marginFactor;

  const calcAssetWindowImpact = (assets: Asset[], direction: 1 | -1): number => {
    return assets.reduce((sum, a) => {
      if (a.position === "Pick") {
        const pickValue = a.round === 1 ? 2.5 : a.round === 2 ? 1.0 : 0.3;
        return sum + direction * pickValue;
      }
      const nav = getAssetNAV(a, capCeiling).total;
      if (nav <= 0) return sum;

      const peakAge = a.position === "G" ? 30 : 28;
      const yearsOfPeak = Math.max(0, peakAge - a.age + (a.yearsRemaining || 1));
      const ageFactor = Math.min(3.0, yearsOfPeak / 4);

      const prospect = getProspectTier(a.name);
      const prospectBonus = prospect ? prospect.tier === 1 ? 3.0 : prospect.tier === 2 ? 1.5 : 0.5 : 0;

      const surplus = Math.max(0, nav) / Math.max(1, a.capHit);
      const surplusFactor = Math.min(1.5, surplus / 15);

      return sum + direction * (ageFactor + prospectBonus + surplusFactor);
    }, 0);
  };

  const cwiGain = calcAssetWindowImpact(incoming, 1) + calcAssetWindowImpact(outgoing, -1);
  const cwiYears = cwiGain / 3.0;
  const partnerStanding = teamPartner?.standing ?? 16;
  const partnerMarginFactor = partnerStanding >= 25 ? 1.0 : partnerStanding >= 17 ? 0.85 : partnerStanding >= 9 ? 0.70 : 0.55;
  const ewaPartner = (-onIceDelta / 7) * partnerMarginFactor;
  const cwiPartner = (calcAssetWindowImpact(outgoing, 1) + calcAssetWindowImpact(incoming, -1)) / 3.0;

  const flags = runGmLogic(outgoing, incoming, teamHome, teamPartner, allHomeRoster, allPartnerRoster, capCeiling);
  const hardFlags = flags.filter((f) => f.severity === "HARD");
  const softFlags = flags.filter((f) => f.severity === "SOFT");

  const vetoCategories = new Set([
    "POSITIONAL_REDUNDANCY", "TIMELINE_MISMATCH", "CLAUSE", 
    "ASSET_SHAPE_MISMATCH", "ELITE_BLOCKADE", "REBUILD_LOGIC", "VALUE_VETO",
  ]);
  const vetoFlags = softFlags.filter(f => f.category && vetoCategories.has(f.category));
  const warnFlags = softFlags.filter(f => !f.category || !vetoCategories.has(f.category));

  let status: TradeStatus = "PENDING";
  let message = "";

  if (hardFlags.length > 0) {
    status = "BLOCKED";
    message = hardFlags[0].headline;
  } else if (vetoFlags.length > 0) {
    status = "DECLINED";
    message = vetoFlags[0].headline;
  } else if (warnFlags.length > 0) {
    if (variance <= 10) {
      status = "FAIR";
      message = "Balanced Exchange";
    } else if (homeNetGain > 0) {
      status = "WIN";
      message = `+${homeNetGain.toFixed(1)} NAV Surplus`;
    } else {
      status = "LOSS";
      message = `${Math.abs(homeNetGain).toFixed(1)} NAV Overpay`;
    }
  } else if (variance <= 10) {
    status = "FAIR";
    message = "Balanced Exchange";
  } else if (homeNetGain > 0) {
    status = "WIN";
    message = `+${homeNetGain.toFixed(1)} NAV Surplus`;
  } else {
    status = "LOSS";
    message = `${Math.abs(homeNetGain).toFixed(1)} NAV Overpay`;
  }

  const sideOutcomes = [
    buildSideAssessment("home", teamHome, incoming, outgoing, homeNetGain, ewaHome, cwiYears, capDelta),
    buildSideAssessment("partner", teamPartner, outgoing, incoming, -homeNetGain, ewaPartner, cwiPartner, -capDelta),
  ];

  return {
    status,
    message,
    flags,
    metrics: { navOut, navIn, homeNetGain, ptsGain, defGain, capDelta, variance, ewaHome, cwiYears },
    sideOutcomes,
  };
};

// ============================================================
// TYPES
// ============================================================
type TradeStatus = "IDLE" | "PENDING" | "FAIR" | "WIN" | "LOSS" | "BLOCKED" | "DECLINED";

interface TradeVerdict {
  status: TradeStatus;
  message: string;
  flags: GmFlag[];
  metrics: {
    navOut: number;
    navIn: number;
    homeNetGain: number;
    ptsGain: number;
    defGain: number;
    capDelta: number;
    variance: number;
    ewaHome: number;      
    cwiYears: number;     
  };
  sideOutcomes?: TradeSideAssessment[];
  claudeAnalysis?: string;
  claudeLoading?: boolean;
}

// ============================================================
// API HANDLER
// ============================================================
export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    
    // Validate incoming payload with Zod
    const parsed = EvaluateRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      console.error("[evaluate] Validation Error:", parsed.error.format());
      return NextResponse.json({ error: "Invalid payload structure", details: parsed.error.format() }, { status: 400 });
    }
    const body = parsed.data as unknown as EvaluateRequest;
    const liveCapCeiling = await getLiveCapCeiling(body.capCeiling);

    const navMap: Record<string, XNAVResult> = {};
    if (Array.isArray(body.assets)) {
      for (const asset of body.assets) {
        if (asset?.id) {
          navMap[asset.id] = getAssetNAV(asset, liveCapCeiling);
        }
      }
    }

    let verdict: TradeVerdict | undefined;
    if (
      body.runTrade &&
      body.tradeOutgoing && body.tradeIncoming &&
      body.homeTeam && body.partnerTeam
    ) {
      verdict = evaluateTrade(
        body.tradeOutgoing,
        body.tradeIncoming,
        body.homeTeam,
        body.partnerTeam,
        body.allHomeRoster ?? [],
        body.allPartnerRoster ?? [],
        liveCapCeiling
      );
    }

const response = { 
      navMap: navMap as any, 
      verdict 
    } as EvaluateResponse;
    
    return NextResponse.json(response);
  } catch (e: any) {
    console.error("[evaluate] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
