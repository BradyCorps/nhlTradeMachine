import { NextRequest, NextResponse } from "next/server";
import type { Asset, Team } from "@/app/lib/trade-types";

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
  navDelta:      number;
  capFit:        "FITS" | "TIGHT" | "OVER";
  fitReasons:    string[];
  warnReasons:   string[];
  returnProfile: string;
}

export async function POST(req: NextRequest) {
  const { assets, homeTeamId, allTeams, allPlayers, navMap } = await req.json() as MatchRequest;

  if (!assets?.length || !allTeams?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

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
      const phase    = team.phase ?? "Unknown";
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
      if (packageCap > capSpace) {
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
      if (isDump && capSpace > packageCap * 1.5) {
        score += 6; fit.push("Enough space to absorb and manage out");
      }
      if (standing >= 25 && packageNAV > 0) {
        score += 8; fit.push("Immediate roster upgrade for a bottom team");
      }
      if (standing <= 8 && packageNAV > 80) {
        score += 10; fit.push("Elite piece completes contender's window");
      }

      const returnProfile =
        packageNAV > 150 ? "Top prospect + first-round pick" :
        packageNAV > 80  ? "Roster player + first-round pick" :
        packageNAV > 30  ? "Roster player + mid-round pick" :
        packageNAV > 0   ? "Depth piece or late pick" :
        isDump           ? "Cap relief + conditional pick" :
                           "Salary retained — minimal return";

      return {
        teamId:    team.id,
        teamName:  team.name,
        phase,
        score:     Math.max(0, Math.min(100, Math.round(score))),
        navDelta:  packageNAV,
        capFit,
        fitReasons:  fit.slice(0, 3),
        warnReasons: warn.slice(0, 2),
        returnProfile,
      };
    })
    .filter(m => m !== null && m.score >= 12)   // minimum threshold — below 12 the trade would almost certainly fail
    .sort((a, b) => b!.score - a!.score)
    .slice(0, 8) as TeamMatch[];

  return NextResponse.json({ matches, packageNAV, packageCap, avgAge });
}