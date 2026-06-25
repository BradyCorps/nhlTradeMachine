// ============================================================
// FREE AGENCY — the off-season "logic gate"
// Deterministic, heuristic projection of what a pending free agent would sign
// for (AAV x term, UFA/RFA, re-sign odds), plus a league-wide resolver that
// auto-handles the other 31 teams and emits cap moves in the cap-delta shape.
//
// Pure functions only (no I/O) so they are unit-testable and reproducible:
// every random draw is seeded via the same mulberry32/hashString the season
// sim uses, so a given (roster, seed) always yields the same off-season.
// ============================================================

import type { Asset } from "@/app/lib/trade-types";
import type { CapDeltaAsset, CapDeltaMoves } from "@/app/lib/cap-delta";
import { mulberry32, hashString } from "@/app/lib/sim-engine";
import { SEASON } from "@/app/lib/season-config";

export type FaStatus = "UFA" | "RFA";
export type FaTier = "STAR" | "TOP" | "MIDDLE" | "DEPTH" | "FRINGE";

export interface ProjectedContract {
  aav: number;               // projected average annual value ($M)
  term: number;              // projected length (years)
  status: FaStatus;          // UFA or RFA
  resignProbability: number; // 0..1 — odds the player re-signs with his current team
  tier: FaTier;              // market band, for UI grouping
}

// ── Tunable model constants ──────────────────────────────────────────────────
// Co-located with the logic so the model is self-contained and testable.
export const FA = {
  capMin:        0.775,   // NHL CBA league-minimum AAV ($M)
  cbaMaxPct:     0.20,    // CBA hard max = 20% of the cap upper limit ($20.8M at $104M)

  // Forwards: $/point on stable pace, with progressive top-6 and star premiums
  // so elite producers reach the modern market (a ~90-pt UFA lands ~$13-14M).
  fwdPerPt:      0.105,
  fwdTopPace:    55,
  fwdTopBump:    0.07,
  fwdStarPace:   78,
  fwdStarBump:   0.14,

  // Defensemen: workload (TOI over a replacement floor) + scoring.
  dToiFloor:     12,
  dToiPerMin:    0.60,
  dPerPt:        0.085,

  // Goalies: base + GSAX + save% over league average + workload.
  gBase:         3.5,
  gPerGsax:      0.20,
  gSvpAnchor:    0.905,
  gPerSvpPoint:  50,      // per 0.01 of save% over anchor
  gWorkloadDiv:  30,
  gWorkloadMax:  2,
  gBackupStarts: 25,      // below this many starts → a backup, priced down
  gBackupFactor: 0.6,
  gMaxTerm:      6,       // goalies rarely sign beyond six years

  rfaDiscount:   0.82,    // RFA team control suppresses AAV vs open market
} as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const isForward = (pos: string) => pos === "C" || pos === "W" || pos === "L" || pos === "R";

// Stable scoring pace — same 40/60 current/baseline blend the sim uses.
const stablePace = (a: Asset): number => {
  const cur = Number.isFinite(a.ptsPace) ? a.ptsPace : 0;
  const base = Number.isFinite(a.baselinePtsPace) ? a.baselinePtsPace ?? 0 : 0;
  return base > 0 ? cur * 0.4 + base * 0.6 : cur;
};

const faStatusOf = (asset: Asset): FaStatus => {
  if (asset.contractStatus === "RFA") return "RFA";
  if (asset.contractStatus === "UFA") return "UFA";
  // Fallback when expiry status is unknown: younger players are typically RFA.
  return (asset.age ?? 27) <= 25 ? "RFA" : "UFA";
};

const tierOf = (aav: number): FaTier =>
  aav >= 8 ? "STAR" : aav >= 5 ? "TOP" : aav >= 2.5 ? "MIDDLE" : aav >= 1.2 ? "DEPTH" : "FRINGE";

function projectTerm(age: number, status: FaStatus, aav: number, rand: () => number): number {
  let base: number;
  if (age <= 23) base = status === "RFA" ? 3 : 6;
  else if (age <= 26) base = status === "RFA" ? 4 : 6;
  else if (age <= 29) base = 6;
  else if (age <= 32) base = 4;
  else if (age <= 35) base = 2;
  else base = 1;

  if (aav < 1.5) base = Math.min(base, 2);        // depth deals stay short
  else if (aav >= 8) base = Math.min(8, base + 1); // stars push for max term

  const jitter = rand() < 0.3 ? -1 : rand() > 0.85 ? 1 : 0;
  // Own-team re-signings can reach 8; the open market caps at 7 (applied by caller).
  return clamp(base + jitter, 1, 8);
}

function projectResignProbability(status: FaStatus, aav: number, age: number): number {
  if (status === "RFA") return 0.92; // team holds rights — almost always retained
  let p = 0.6;
  if (aav >= 8) p = 0.5;          // stars test the market
  else if (aav >= 5) p = 0.58;
  else if (aav < 2) p = 0.7;      // depth pieces tend to re-sign
  if (age >= 33) p += 0.1;        // veterans lean toward staying
  return clamp(p, 0.2, 0.95);
}

export interface ProjectContext {
  seed?: number;
  capCeiling?: number;
}

// Project the contract a single pending free agent would command.
export function projectFreeAgentContract(asset: Asset, ctx: ProjectContext = {}): ProjectedContract {
  const capCeiling = ctx.capCeiling ?? SEASON.capCeiling;
  const ceiling = Math.floor(capCeiling * FA.cbaMaxPct * 20) / 20; // CBA max, snapped onto the $0.05M grid
  const rand = mulberry32((ctx.seed ?? 1) + hashString(`fa:${asset.id || asset.name}`));

  const pos = asset.position;
  const age = asset.age ?? 27;
  const status = faStatusOf(asset);

  let baseAav: number;
  if (pos === "G") {
    baseAav = FA.gBase
      + (asset.gsax ?? 0) * FA.gPerGsax
      + ((asset.savePct ?? FA.gSvpAnchor) - FA.gSvpAnchor) * 100 * (FA.gPerSvpPoint / 100)
      + Math.min(FA.gWorkloadMax, (asset.gamesStarted ?? 0) / FA.gWorkloadDiv);
  } else if (pos === "D") {
    baseAav = Math.max(0, (asset.avgTOI ?? 0) - FA.dToiFloor) * FA.dToiPerMin
      + stablePace(asset) * FA.dPerPt;
  } else if (isForward(pos)) {
    const pace = stablePace(asset);
    baseAav = pace * FA.fwdPerPt
      + Math.max(0, pace - FA.fwdTopPace) * FA.fwdTopBump
      + Math.max(0, pace - FA.fwdStarPace) * FA.fwdStarBump;
  } else {
    baseAav = FA.capMin;
  }

  // Backup goalies (few starts) are paid well below a starter's base.
  if (pos === "G" && (asset.gamesStarted ?? 0) < FA.gBackupStarts) {
    baseAav *= FA.gBackupFactor;
  }

  // Age: a small premium in the early-prime, a discount as production decays.
  const ageFactor = clamp(1.0 - Math.max(0, age - 30) * 0.05 + (age <= 24 ? 0.03 : 0), 0.65, 1.08);
  const statusFactor = status === "RFA" ? FA.rfaDiscount : 1.0;
  const variance = 0.92 + rand() * 0.16; // seeded market noise (+/- ~8%)

  let aav = baseAav * ageFactor * statusFactor * variance;
  aav = Math.round(aav * 20) / 20;       // snap to the nearest $0.05M
  aav = clamp(aav, FA.capMin, ceiling);  // then hold within the CBA min and star ceiling

  let term = projectTerm(age, status, aav, rand);
  // Scale term to value: depth deals stay short, only top contracts run long.
  term = Math.min(term, aav < 2.5 ? 2 : aav < 5 ? 4 : aav < 8 ? 6 : 8);
  if (pos === "G") term = Math.min(term, FA.gMaxTerm);

  return {
    aav,
    term,
    status,
    resignProbability: projectResignProbability(status, aav, age),
    tier: tierOf(aav),
  };
}

// ── RFA offer-sheet compensation (CBA Article 10.3) ─────────────────────────
// When a team signs another team's RFA to an offer sheet, the original team has
// 7 days to match. If they don't, they receive draft pick compensation:
//
// AAV ($)                        Compensation
// ≤ $1,544,424                   None
// $1,544,424 – $2,340,037        3rd round
// $2,340,037 – $4,680,076        2nd round
// $4,680,076 – $7,020,113        1st + 3rd
// $7,020,113 – $9,360,153        1st + 2nd + 3rd
// $9,360,153 – $11,700,192       2× 1st + 2nd + 3rd
// > $11,700,192                  4× 1st rounds
export function getOfferSheetCompensation(aavMillions: number): string[] {
  const aav = aavMillions * 1_000_000;
  if (aav <= 1_544_424)  return [];
  if (aav <= 2_340_037)  return ["3rd"];
  if (aav <= 4_680_076)  return ["2nd"];
  if (aav <= 7_020_113)  return ["1st", "3rd"];
  if (aav <= 9_360_153)  return ["1st", "2nd", "3rd"];
  if (aav <= 11_700_192) return ["1st", "1st", "2nd", "3rd"];
  return ["1st", "1st", "1st", "1st"];
}

// ── League-wide resolution ───────────────────────────────────────────────────

export interface OffseasonPending {
  player: Asset;
  contract: ProjectedContract;
}

export interface LeagueOffseasonResult {
  expiringCount: number;
  userPending: OffseasonPending[];   // the user's team — returned for manual handling, NOT auto-applied
  resignings: Array<{ playerId: string; teamId: string; contract: ProjectedContract }>;
  walkAways: Array<{ playerId: string; fromTeamId: string; contract: ProjectedContract }>;
  market: OffseasonPending[];        // players who hit the open market (signable)
  teamCapMoves: Record<string, CapDeltaMoves>; // ready for applyTeamCapDeltas()
}

export interface ResolveContext {
  seed?: number;
  userTeamId?: string | null;
  capCeiling?: number;
}

const MARKET_TERM_CAP = 7; // open-market deals cap a year below own-team max

// Resolve every team's pending free agents. The user's team is set aside for
// manual one-click handling; the other teams are auto-resolved (RFAs re-sign;
// UFAs re-sign or walk by seeded odds). Emits per-team cap moves that
// applyTeamCapDeltas() can apply directly.
export function resolveLeagueOffseason(players: Asset[], ctx: ResolveContext = {}): LeagueOffseasonResult {
  const seed = ctx.seed ?? 1;
  const expiring = players.filter((p) => p.expiresThisOffseason && p.position !== "Pick");

  const userPending: OffseasonPending[] = [];
  const resignings: LeagueOffseasonResult["resignings"] = [];
  const walkAways: LeagueOffseasonResult["walkAways"] = [];
  const market: OffseasonPending[] = [];
  const teamCapMoves: Record<string, CapDeltaMoves> = {};

  const addMove = (teamId: string, side: "incoming" | "outgoing", asset: CapDeltaAsset) => {
    const moves = teamCapMoves[teamId] ?? {};
    moves[side] = [...(moves[side] ?? []), asset];
    teamCapMoves[teamId] = moves;
  };

  for (const player of expiring) {
    const contract = projectFreeAgentContract(player, { seed, capCeiling: ctx.capCeiling });
    // The expiring deal's REAL cap hit (player.capHit is zeroed to 0 for pending
    // FAs). This is the cap credit when the deal comes off the books — without it
    // a re-signing team is charged the new AAV with no offset and spirals
    // tens of millions over the cap.
    const expiringCapHit = player.lastCapHit ?? player.capHit;

    if (ctx.userTeamId && player.teamId === ctx.userTeamId) {
      userPending.push({ player, contract });
      continue; // user decides manually
    }

    const rand = mulberry32(seed + hashString(`resolve:${player.id}`));
    const resign = contract.status === "RFA" || rand() < contract.resignProbability;

    if (resign) {
      // Old AAV comes off, the new AAV goes on (net raise reduces cap space).
      addMove(player.teamId, "outgoing", { capHit: expiringCapHit });
      addMove(player.teamId, "incoming", { capHit: contract.aav });
      resignings.push({ playerId: player.id, teamId: player.teamId, contract });
    } else {
      // Walks: the old AAV is freed; he enters the open market.
      addMove(player.teamId, "outgoing", { capHit: expiringCapHit });
      const marketContract = { ...contract, term: Math.min(contract.term, MARKET_TERM_CAP) };
      walkAways.push({ playerId: player.id, fromTeamId: player.teamId, contract: marketContract });
      market.push({ player, contract: marketContract });
    }
  }

  return { expiringCount: expiring.length, userPending, resignings, walkAways, market, teamCapMoves };
}
