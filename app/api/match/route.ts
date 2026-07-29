import { NextRequest, NextResponse } from "next/server";
import type { Asset, Team } from "@/app/lib/trade-types";
import { teamWindow } from "@/app/lib/team-window";
import { z } from "zod";
import {
  PUBLIC_LIMITS, idString, invalidRequest,
  publicAssetSchema, publicNavMapSchema, publicTeamSchema,
} from "@/app/lib/public-request-bounds";

// ── Trade Partner Finder — "Who wants this package?" ─────────
// A player's NAV is team-contextual. A $7M 35yr albatross for Tampa
// could be mentor/bridge value for Buffalo. Score all 32 teams on fit.
//
// Scoring dimensions:
//   1. NAV FIT:            does this asset improve their roster?
//   2. CAP FIT:            can they absorb the cap hit?
//   3. POSITIONAL NEED:    does this fill a hole?
//   4. CONTENTION WINDOW:  does the player's age/term match the team's timeline?
//   5. CONTEXT BONUS:      veteran on rebuild (mentor), picks for tankers, etc.

interface MatchRequest {
  assets:     Asset[];
  homeTeamId: string;
  allTeams:   Team[];
  allPlayers: Asset[];
  navMap:     Record<string, { total: number; off: number; def: number; age: number; cap: number }>;
}

export interface TeamMatch {
  teamId:        string;
  teamName:      string;
  phase:         string;
  score:         number;
  fitTier:       "LEAD" | "CAP_CLEAR" | "LONG_SHOT" | "BLOCKED";
  navDelta:      number;
  capFit:        "FITS" | "TIGHT" | "OVER";
  fitReasons:    string[];
  warnReasons:   string[];
  returnProfile: string;
}

// CXH9 — this endpoint is public and unauthenticated. It used to cast
// `req.json()` straight to `MatchRequest`, so a caller could hand it arrays of
// any length, ids of any size, and NaN where a number belonged. The route then
// iterated all of it against every team in the league.
const matchRequestSchema = z.object({
  assets: z.array(publicAssetSchema).min(1).max(PUBLIC_LIMITS.MAX_PACKAGE),
  homeTeamId: idString,
  allTeams: z.array(publicTeamSchema).min(1).max(PUBLIC_LIMITS.MAX_TEAMS),
  allPlayers: z.array(publicAssetSchema).max(PUBLIC_LIMITS.MAX_PLAYERS),
  navMap: publicNavMapSchema,
}).passthrough();

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid match request" }, { status: 400 });
  }

  const parsed = matchRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(invalidRequest("match", parsed.error), { status: 400 });
  }
  const { assets, homeTeamId, allTeams, allPlayers, navMap } =
    parsed.data as unknown as MatchRequest;

  const packageNAV    = assets.reduce((s, a) => s + (navMap[a.id]?.total ?? 0), 0);
  const packageCap    = assets.reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0);
  const packageYears  = assets.filter(a => a.position !== "Pick").length > 0
    ? assets.filter(a => a.position !== "Pick").reduce((s, a, _, arr) => s + (a.yearsRemaining || 0) / arr.length, 0)
    : 0;
  const avgAge        = assets.filter(a => a.position !== "Pick").length > 0
    ? assets.filter(a => a.position !== "Pick").reduce((s, a, _, arr) => s + (a.age || 0) / arr.length, 0)
    : 0;

  const hasGoalie  = assets.some(a => a.position === "G");
  const hasD       = assets.some(a => a.position === "D");
  const hasC       = assets.some(a => a.position === "C");
  const hasPick    = assets.some(a => a.position === "Pick");
  const isNegNAV   = packageNAV < 0;
  const isDump     = packageNAV < -30;

  const matches: TeamMatch[] = allTeams
    .filter(t => t.id !== homeTeamId)
    .map(team => {
      const roster   = allPlayers.filter(p => p.teamId === team.id);
      const phase    = teamWindow(team) || "Unknown";
      const capSpace = team.capSpace ?? 0;
      const standing = team.standing ?? 16;

      let score = 50;
      const fit:  string[] = [];
      const warn: string[] = [];

      // ── 1. NAV FIT ──────────────────────────────────────────
      if (packageNAV > 0) {
        score += Math.min(30, packageNAV / 5);
        if (packageNAV > 50)  fit.push(`Strong asset (+${packageNAV.toFixed(0)} NAV)`);
        if (packageNAV > 150) fit.push("Franchise-altering NAV");
      } else {
        const penalty = phase === "Tanking"    ? -5
                      : phase === "Rebuilding" ? -8
                      : phase === "Retooling"  ? -12
                      : phase === "Bubble"     ? -18
                      : /* Contender */          -25;
        score += penalty;
        if (isDump && phase === "Contender")
          warn.push("Dead cap risk for a contending team");
        if (isDump && (phase === "Rebuilding" || phase === "Retooling"))
          fit.push("Bridge veteran — locker room value in rebuild");
      }

      // ── 2. CAP FIT ──────────────────────────────────────────
      let capFit: TeamMatch["capFit"] = "FITS";
      const retentionCanSolveCap = isNegNAV && packageCap * 0.5 <= capSpace;
      if (packageCap > capSpace && retentionCanSolveCap) {
        capFit = "TIGHT"; score -= 10;
        warn.push(`Needs retention — $${(packageCap - capSpace).toFixed(1)}M over at full freight`);
      } else if (packageCap > capSpace) {
        capFit = "OVER"; score -= 25;
        warn.push(`Over cap by $${(packageCap - capSpace).toFixed(1)}M`);
      } else if (packageCap > capSpace * 0.75) {
        capFit = "TIGHT"; score -= 8;
        warn.push("Leaves limited cap flexibility");
      } else {
        score += 5;
        if (capSpace > 12) fit.push(`$${capSpace.toFixed(1)}M space — comfortable`);
      }

      // ── 3. POSITIONAL NEED ──────────────────────────────────
      const topGoalieNAV = roster.filter(p => p.position === "G")
        .reduce((mx, g) => Math.max(mx, navMap[g.id]?.total ?? 0), 0);
      const topDNAV = roster.filter(p => p.position === "D")
        .reduce((mx, d) => Math.max(mx, navMap[d.id]?.total ?? 0), 0);

      if (hasGoalie) {
        if (topGoalieNAV < 60)  { score += 15; fit.push("Starter-level goalie need"); }
        if (topGoalieNAV >= 100){ score -= 10; warn.push("Already have an elite starter"); }
      }
      if (hasD && topDNAV < 80 && (phase === "Contender" || phase === "Bubble")) {
        score += 12; fit.push("Top-4 D upgrade for a competing team");
      }
      if (hasC && roster.filter(p => p.position === "C").length < 3) {
        score += 10; fit.push("Center depth need");
      }
      if (hasPick) {
        if (phase === "Rebuilding" || phase === "Tanking") { score += 14; fit.push("Picks are gold in a rebuild"); }
        if (phase === "Contender")                          { score -= 5;  warn.push("Contenders rarely trade for future picks"); }
      }

      // ── 4. CONTENTION WINDOW ALIGNMENT ──────────────────────
      const isVet      = avgAge > 32;
      const isYoung    = avgAge < 25;
      const isLongTerm = packageYears > 4;

      if (isVet && (phase === "Contender" || phase === "Bubble")) {
        score += 8; fit.push("Veteran fits compete-now window");
      }
      if (isVet && (phase === "Tanking" || phase === "Rebuilding")) {
        score -= 10; warn.push("Veteran age mismatches rebuild timeline");
        fit.push("Possible mentor/bridge role");
      }
      if (isYoung && (phase === "Rebuilding" || phase === "Retooling")) {
        score += 12; fit.push("Young asset aligns with rebuild timeline");
      }
      if (isLongTerm && phase === "Contender") {
        score += 6; fit.push("Term covers contention window");
      }
      if (isLongTerm && (phase === "Tanking" || phase === "Rebuilding")) {
        score -= 8; warn.push("Long term may outlast rebuild window");
      }

      // ── 5. CONTEXT BONUS — the "hidden gem" angle ───────────
      // Negative NAV to a team with space = cap game play (LTIR, buyout leverage)
      if (isNegNAV && capSpace >= packageCap) {
        score += isDump ? 10 : 12;
        fit.push(isDump ? "Enough space to absorb and manage out" : "Cap room to buy low");
      } else if (isNegNAV && retentionCanSolveCap) {
        score += 6;
        fit.push("Works with salary retained");
      }
      if (standing >= 25 && packageNAV > 0) {
        score += 8; fit.push("Immediate roster upgrade for a bottom team");
      }
      if (standing <= 8 && packageNAV > 80) {
        score += 10; fit.push("Elite piece completes contender's window");
      }

      // ── 5b. ADMIN TRADE BLOCK SIGNAL ────────────────────────
      // Teams actively shopping players (admin-flagged) are more willing partners.
      // Untouchables are removed from the give-up pool entirely — a partner whose
      // value is locked behind untouchables can't actually complete the deal.
      const shopped = roster.filter(p =>
        p.tradeBlockStatus === "available" || p.tradeBlockStatus === "requested");
      if (shopped.length > 0 && packageNAV > 0) {
        score += Math.min(12, shopped.length * 4);
        // Name the shopped player whose value best matches the package — that's
        // the most realistic return piece this partner can actually offer.
        const bestFit = [...shopped].sort((a, b) =>
          Math.abs((navMap[a.id]?.total ?? 0) - packageNAV)
          - Math.abs((navMap[b.id]?.total ?? 0) - packageNAV))[0];
        const bestFitNav = navMap[bestFit.id]?.total ?? 0;
        const valueMatches = Math.abs(bestFitNav - packageNAV) <= Math.max(30, packageNAV * 0.45);
        if (valueMatches) {
          score += 6;
          fit.push(`${bestFit.name} is ${bestFit.tradeBlockStatus === "requested" ? "requesting a trade" : "on the block"} — fits as the return`);
        } else {
          fit.push(`Actively shopping ${shopped.length === 1 ? shopped[0].name : `${shopped.length} players`}`);
        }
      }

      // ── 6. YOUNG CORE UNTRADEABLE CHECK ─────────────────────
      // If the partner's only matching-value players are their young core
      // (age ≤ 24, ptsPace > 55), this proposal will fail the GM audit.
      // Penalise heavily so it drops below the threshold and doesn't surface.
      if (packageNAV > 0) {
        const tradeablePool = roster.filter(p => p.tradeBlockStatus !== "untouchable");
        if (tradeablePool.length < roster.length) {
          const lockedNAV   = roster.reduce((s, p) => s + (p.tradeBlockStatus === "untouchable" ? (navMap[p.id]?.total ?? 0) : 0), 0);
          const tradeableNAV = tradeablePool.reduce((s, p) => s + (navMap[p.id]?.total ?? 0), 0);
          if (lockedNAV > tradeableNAV) {
            score -= 25;
            warn.push("Best return pieces are flagged untouchable");
          }
        }
        const partnerTopPlayers = tradeablePool
          .filter(p => p.position !== "Pick" && p.position !== "G")
          .sort((a, b) => (navMap[b.id]?.total ?? 0) - (navMap[a.id]?.total ?? 0))
          .slice(0, 5);
        const youngCoreOnly = partnerTopPlayers.length > 0 &&
          partnerTopPlayers.every(p => (p.age ?? 30) <= 24 && (p.ptsPace ?? 0) > 55);
        if (youngCoreOnly) {
          score -= 40;
          warn.push("Would require trading untouchable young core");
        }
        // Also penalise if the #1 return asset is their franchise cornerstone (young + elite)
        const topReturn = partnerTopPlayers[0];
        if (topReturn && (topReturn.age ?? 30) <= 24 && (topReturn.ptsPace ?? 0) > 70
            && (navMap[topReturn.id]?.total ?? 0) > 80) {
          score -= 20;
          warn.push(`${topReturn.name} is untouchable young core`);
        }
      }

      const returnProfile =
        packageNAV > 150 ? "Top prospect + first-round pick" :
        packageNAV > 80  ? "Roster player + first-round pick" :
        packageNAV > 30  ? "Roster player + mid-round pick" :
        packageNAV > 0   ? "Depth piece or late pick" :
        isDump           ? "Cap relief + sweetener required" :
        packageCap > capSpace ? "Salary retained + conditional pick" :
                           "Minimal return or future considerations";

      const finalScore = Math.max(0, Math.min(100, Math.round(score)));
      const fitTier: TeamMatch["fitTier"] =
        capFit === "OVER"             ? "BLOCKED" :
        finalScore >= 60              ? "LEAD" :
        capFit === "FITS"             ? "CAP_CLEAR" :
        finalScore >= 35              ? "LONG_SHOT" :
                                        "BLOCKED";

      return {
        teamId:    team.id,
        teamName:  team.name,
        phase,
        score:     finalScore,
        fitTier,
        navDelta:  packageNAV,
        capFit,
        fitReasons:  fit.slice(0, 3),
        warnReasons: warn.slice(0, 2),
        returnProfile,
      };
    })
    .filter(m => m !== null)
    .sort((a, b) => b!.score - a!.score) as TeamMatch[];

  return NextResponse.json({ matches, packageNAV, packageCap, avgAge });
}
