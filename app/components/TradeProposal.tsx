"use client";

import { useState } from "react";

interface Asset {
  id: string;
  teamId: string;
  name: string;
  position: string;
  age: number;
  ptsPace: number;
  avgTOI: number;
  capHit: number;
  yearsRemaining: number;
  games: number;
  defRate: number;
  canRetain: boolean;
  retainedPct: number;
  multiplier: number;
  hasNMC: boolean;
  hasNTC: boolean;
  round?: number;
  year?: number;
  teamStanding?: number;
  gsax?: number;
  [key: string]: any;
}

interface Team {
  id: string;
  name: string;
  capSpace: number;
  standing: number;
  phase?: string;
  needs?: { pos: string; minWar: number; label: string }[];
}

interface TradeProposal {
  partner:        Team;
  homeSends:      Asset[];
  partnerSends:   Asset[];
  fitScore:       number;
  isDump:         boolean;
  dumpSweetener:  Asset[];
}

const getNav = (a: Asset, navMap: Record<string, number>): number => navMap[a.id] ?? 0;

const isDumpBlock = (block: Asset[], navMap: Record<string, number>): boolean => {
  const players = block.filter(a => a.position !== "Pick");
  if (players.length === 0) return false;
  const totalNav = players.reduce((s, a) => s + getNav(a, navMap), 0);
  const hasNegative = players.some(a => getNav(a, navMap) < -5);
  return hasNegative && totalNav < 15;
};

// Score how willing a team is to absorb a negative contract
const dumpFitScore = (
  team: Team,
  negPlayers: Asset[],
  teamRoster: Asset[],
  navMap: Record<string, number>,
): number => {
  let score = 0;
  const phase = team.phase ?? "Retooling";
  const totalCap = negPlayers.reduce((s, a) => s + a.capHit * (1-(a.retainedPct||0)), 0);

  // Must have cap space
  if (team.capSpace < totalCap) return 0;
  if (team.capSpace >= totalCap + 8) score += 35;
  else if (team.capSpace >= totalCap + 3) score += 20;
  else score += 5;

  // Rebuilding/tanking teams absorb bad contracts for picks regularly
  if (phase === "Rebuilding" || phase === "Tanking") score += 30;
  else if (phase === "Retooling") score += 15;
  else score -= 10; // contenders rarely take on bad contracts

  // Check if they actually need the position
  for (const p of negPlayers) {
    const pos = ["L","R"].includes(p.position) ? "W" : p.position;
    const posCount = teamRoster.filter(r => {
      const rp = ["L","R"].includes(r.position) ? "W" : r.position;
      return rp === pos;
    }).length;
    if (posCount < 3) score += 20; // real positional need
    if (team.needs?.some(n => n.pos === pos)) score += 15;
    // Age factor — younger bad contracts are more palatable
    if (p.age <= 28) score += 10;
    if (p.age > 33) score -= 15;
  }

 return Math.round(Math.max(0, Math.min(100, score)));
};

// Score standard trade fit
const blockFitsTeam = (
  team: Team,
  block: Asset[],
  teamRoster: Asset[],
  navMap: Record<string, number>,
): number => {
  let score = 0;
  const phase = team.phase ?? "Retooling";
  const blockCap = block.filter(a => a.position !== "Pick")
    .reduce((s, a) => s + a.capHit * (1-(a.retainedPct||0)), 0);

  if (team.capSpace >= blockCap) score += 15;
  else if (team.capSpace >= blockCap * 0.5) score += 5;
  else score -= 20;

  for (const player of block) {
    if (player.position === "Pick") {
      if (phase === "Rebuilding" || phase === "Tanking") score += 15;
      else if (phase === "Retooling") score += 8;
      continue;
    }
    const pos = ["L","R"].includes(player.position) ? "W" : player.position;
    if (player.age <= 28 && (phase === "Rebuilding" || phase === "Retooling")) score += 15;
    if (player.age >= 27 && player.age <= 33 && (phase === "Contender" || phase === "Bubble")) score += 15;
    if (player.age > 33 && (phase === "Rebuilding" || phase === "Tanking")) score -= 15;
    const posCount = teamRoster.filter(p => {
      const pp = ["L","R"].includes(p.position) ? "W" : p.position;
      return pp === pos;
    }).length;
    if (posCount < 3) score += 20;
    else if (posCount < 5) score += 8;
    if (team.needs?.some(n => n.pos === pos)) score += 15;
    if (player.hasNMC) score -= 8;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
};

// Build picks sweetener HOME adds to make dump palatable
// Calibrated to be realistic — teams won't give away 2 firsts for a bad contract
const buildDumpSweetener = (
  negNav:    number,  // absolute value of how negative
  homePicks: Asset[],
  navMap:    Record<string, number>,
): Asset[] => {
  const sortedPicks = [...homePicks]
    .filter(p => (p.year ?? 9999) <= 2028)
    .sort((a, b) => getNav(b, navMap) - getNav(a, navMap));

  // Realistic sweetener calibration:
  // NAV -5 to -15: 1 late pick or 2nd round
  // NAV -15 to -25: 1 mid pick
  // NAV -25 to -35: 1 good pick
  // NAV -35+: 1 first + 1 second MAX — no rational GM gives 2 firsts for cap relief
  const pkg: Asset[] = [];
  let total = 0;
  const maxPicks = negNav > 35 ? 2 : 1;  // hard cap at 2 picks regardless

  for (const pk of sortedPicks) {
    // Don't use top-tier picks (NAV > 50) as sweetener — that's overpaying
    if (getNav(pk, navMap) > 50) continue;
    pkg.push(pk);
    total += getNav(pk, navMap);
    if (pkg.length >= maxPicks) break;
    if (total >= negNav * 0.8) break;  // stop once sweetener covers ~80% of deficit
  }
  return pkg;
};

// Build return package for standard trades (partner sends back value)
// ── Multi-package return builder ─────────────────────────────
// Generates multiple valid return packages for a given target NAV,
// tiered by outgoing NAV size. Returns packages ranked by quality score.
// isDump path is handled separately — this is for standard trades only.
const buildReturnPackages = (
  targetNAV:  number,
  roster:     Asset[],
  picks:      Asset[],
  navMap:     Record<string, number>,
): Asset[][] => {
  const n = (a: Asset) => getNav(a, navMap);
  const packages: { pkg: Asset[]; score: number }[] = [];

  const tradeable = roster
    .filter(p => !p.hasNMC && p.position !== "Pick" && n(p) > -15)
    .sort((a, b) => n(b) - n(a));
  const sortedPicks = [...picks]
    .filter(p => (p.year ?? 9999) <= 2028)
    .sort((a, b) => n(b) - n(a));

  const fwds = tradeable.filter(p => ["W","C","L","R"].includes(p.position));
  const dmen = tradeable.filter(p => p.position === "D");

  // NAV window — tighter for smaller packages, looser for multi-player
  const window1 = 0.28; // ±28% for single player
  const window2 = 0.32; // ±32% for 2-player
  const window3 = 0.36; // ±36% for 3-player
  const fits = (v: number, w: number) =>
    v >= targetNAV * (1 - w) && v <= targetNAV * (1 + w);

  // Score a package — prefer fewer players, prefer positional variety,
  // prefer NAV close to target
  const scorePackage = (pkg: Asset[], totalNav: number): number => {
    const navDiff = Math.abs(totalNav - targetNAV) / Math.max(targetNAV, 1);
    const sizePenalty = (pkg.length - 1) * 0.08; // slight penalty per extra player
    const pickCount = pkg.filter(a => a.position === "Pick").length;
    const pickBonus = pickCount > 0 ? 0.05 : 0; // slight bonus for picks (more realistic)
    return Math.max(0, 1 - navDiff - sizePenalty + pickBonus);
  };

  const seen = new Set<string>();
  const addPkg = (pkg: Asset[], totalNav: number) => {
    const key = pkg.map(a => a.id).sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    packages.push({ pkg, score: scorePackage(pkg, totalNav) });
  };

  // ── Tier 1: Single player (all NAV sizes) ────────────────────
  for (const p of tradeable) {
    const v = n(p);
    if (fits(v, window1)) addPkg([p], v);
  }

  // ── Tier 2: Two players (80+ NAV target) ─────────────────────
  if (targetNAV >= 80) {
    // fwd + D combos (most realistic — positional variety)
    for (const f of fwds.slice(0, 12)) {
      for (const d of dmen.slice(0, 8)) {
        const v = n(f) + n(d);
        if (fits(v, window2)) addPkg([f, d], v);
      }
    }
    // fwd + fwd combos
    for (let i = 0; i < Math.min(fwds.length, 10); i++) {
      for (let j = i+1; j < Math.min(fwds.length, 10); j++) {
        const v = n(fwds[i]) + n(fwds[j]);
        if (fits(v, window2)) addPkg([fwds[i], fwds[j]], v);
      }
    }
    // player + pick combos
    for (const p of tradeable.slice(0, 12)) {
      for (const pk of sortedPicks.slice(0, 6)) {
        const v = n(p) + n(pk);
        if (fits(v, window2)) addPkg([p, pk], v);
      }
    }
    // D + D combos
    for (let i = 0; i < Math.min(dmen.length, 6); i++) {
      for (let j = i+1; j < Math.min(dmen.length, 6); j++) {
        const v = n(dmen[i]) + n(dmen[j]);
        if (fits(v, window2)) addPkg([dmen[i], dmen[j]], v);
      }
    }
  }

  // ── Tier 3: Three players (150+ NAV target, hard cap) ────────
  if (targetNAV >= 150) {
    // fwd + D + pick (most common real-world structure)
    for (const f of fwds.slice(0, 8)) {
      for (const d of dmen.slice(0, 6)) {
        for (const pk of sortedPicks.slice(0, 4)) {
          const v = n(f) + n(d) + n(pk);
          if (fits(v, window3)) addPkg([f, d, pk], v);
        }
      }
    }
    // fwd + fwd + pick
    for (let i = 0; i < Math.min(fwds.length, 7); i++) {
      for (let j = i+1; j < Math.min(fwds.length, 7); j++) {
        for (const pk of sortedPicks.slice(0, 4)) {
          const v = n(fwds[i]) + n(fwds[j]) + n(pk);
          if (fits(v, window3)) addPkg([fwds[i], fwds[j], pk], v);
        }
      }
    }
    // fwd + D + D
    for (const f of fwds.slice(0, 6)) {
      for (let i = 0; i < Math.min(dmen.length, 5); i++) {
        for (let j = i+1; j < Math.min(dmen.length, 5); j++) {
          const v = n(f) + n(dmen[i]) + n(dmen[j]);
          if (fits(v, window3)) addPkg([f, dmen[i], dmen[j]], v);
        }
      }
    }
  }

  // ── Picks-only fallback ───────────────────────────────────────
  // Only when no player packages found — rare but needed for very high NAV
  if (packages.length === 0) {
    let pnav = 0;
    const pkg: Asset[] = [];
    for (const pk of sortedPicks) {
      pkg.push(pk); pnav += n(pk);
      if (fits(pnav, window2)) { addPkg([...pkg], pnav); break; }
      if (pkg.length >= 4) break;
    }
  }

  return packages
    .sort((a, b) => b.score - a.score)
    .slice(0, 20) // max 20 packages per team
    .map(p => p.pkg);
};

// ── Trade motivation — why would each team actually do this? ──
// Pure data-driven reasoning from phase, standing, and asset shape.
const getMotivation = (
  team: Team,
  sends: Asset[],
  receives: Asset[],
  isDump: boolean,
  navMap: Record<string, number>,
): string => {
  const phase     = team.phase ?? "Unknown";
  const standing  = team.standing;
  const capSpace  = team.capSpace;

  const sendPlayers  = sends.filter(a => a.position !== "Pick");
  const recvPlayers  = receives.filter(a => a.position !== "Pick");
  const sendPicks    = sends.filter(a => a.position === "Pick");
  const recvPicks    = receives.filter(a => a.position === "Pick");

  const sendNav  = sends.reduce((s,a) => s + (navMap[a.id]??0), 0);
  const recvNav  = receives.reduce((s,a) => s + (navMap[a.id]??0), 0);
  const netGain  = recvNav - sendNav;

  const avgSendAge = sendPlayers.length > 0
    ? sendPlayers.reduce((s,a) => s + a.age, 0) / sendPlayers.length : 0;
  const avgRecvAge = recvPlayers.length > 0
    ? recvPlayers.reduce((s,a) => s + a.age, 0) / recvPlayers.length : 0;

  // Contender logic
  if (phase === "Contender" || standing <= 8) {
    if (isDump && recvPlayers.length > 0)
      return `Absorbs ${recvPlayers[0]?.name.split(" ").pop()}'s contract to add depth — playoff window justifies cap risk.`;
    if (netGain > 20 && avgRecvAge < 30)
      return `Adds a younger, high-value piece without mortgaging the future — fits the win-now mandate.`;
    if (sendPicks.length > 0)
      return `Trades future assets for present value — window is open, picks can wait.`;
    return `Improves the roster margin on a contending team; every point matters in a tight playoff race.`;
  }

  // Rebuilding/Tanking logic
  if (phase === "Rebuilding" || phase === "Tanking" || standing >= 25) {
    if (recvPicks.length > 0)
      return `Collects draft capital during the rebuild — ${recvPicks.length} pick${recvPicks.length>1?"s":""} accelerate the timeline.`;
    if (sendPlayers.length > 0 && sendPlayers[0].age >= 30)
      return `Moves an aging asset before value erodes — gets younger and adds flexibility.`;
    if (capSpace > 10)
      return `Cap space is an asset during the rebuild; absorbing salary generates return value.`;
    return `Prioritizes the future — assets acquired now compound during the development window.`;
  }

  // Bubble/Retooling
  if (avgSendAge > 31 && avgRecvAge < 27)
    return `Sells aging production for younger assets — retooling without a full teardown.`;
  if (netGain > 15)
    return `Improves talent level while staying competitive — the right move at the bubble.`;
  if (capSpace < 3)
    return `Frees cap flexibility — staying competitive requires room to make in-season moves.`;
  return `Balances present competitiveness with future asset accumulation at the retooling stage.`;
};

// ── Risk indicator — biggest red flag in the deal ─────────────
const getRisk = (
  sends: Asset[],
  receives: Asset[],
  navMap: Record<string, number>,
): { label: string; detail: string } | null => {
  const recvPlayers = receives.filter(a => a.position !== "Pick");
  const sendPlayers = sends.filter(a => a.position !== "Pick");

  // Age cliff — receiving old player on long deal
  const oldIncoming = recvPlayers.find(a => a.age >= 33 && a.yearsRemaining >= 3);
  if (oldIncoming)
    return { label: "AGE CLIFF", detail: `${oldIncoming.name.split(" ").pop()} is ${oldIncoming.age} with ${oldIncoming.yearsRemaining}yr left` };

  // Overpay — large NAV gap
  const sendNav = sends.reduce((s,a) => s+(navMap[a.id]??0), 0);
  const recvNav = receives.reduce((s,a) => s+(navMap[a.id]??0), 0);
  if (sendNav > recvNav + 40)
    return { label: "OVERPAY", detail: `Sending ${(sendNav-recvNav).toFixed(0)} more NAV than receiving` };

  // Contract length risk
  const longDeal = recvPlayers.find(a => a.capHit > 7 && a.yearsRemaining >= 6 && a.age >= 30);
  if (longDeal)
    return { label: "CONTRACT RISK", detail: `$${longDeal.capHit}M × ${longDeal.yearsRemaining}yr ages poorly` };

  // Positional gap — giving up the only player at a position
  const posGiven = sendPlayers.map(a => a.position);
  const posBack  = recvPlayers.map(a => a.position);
  if (posGiven.includes("D") && !posBack.some(p => p === "D") && recvPlayers.length > 0)
    return { label: "DEPTH GAP", detail: "Losing a defenceman without a D coming back" };

  // Giving up picks AND a positive player
  const goodSends = sendPlayers.filter(a => (navMap[a.id]??0) > 20);
  if (goodSends.length > 0 && sends.some(a => a.position === "Pick"))
    return { label: "ASSET DRAIN", detail: "Sending both a quality player and picks" };

  return null;
};

// Pre-screen a proposal to avoid surfacing obviously declined trades.
// Catches the most common veto conditions without a full GM logic call.
// Returns true if the proposal is likely viable.
const preScreenProposal = (
  homeSends:    Asset[],
  partnerSends: Asset[],
  homeTeam:     Team,
  partnerTeam:  Team,
  navMap:       Record<string, number>,
): boolean => {
  // Cap check — partner must be able to absorb incoming cap
  const homeCap    = homeSends.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)), 0);
  const partnerCap = partnerSends.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)), 0);
  const homeCapDelta    = partnerCap - homeCap;   // cap home gains
  const partnerCapDelta = homeCap - partnerCap;   // cap partner absorbs

  if (partnerTeam.capSpace + homeCapDelta < 0) return false;  // partner can't fit
  if (homeTeam.capSpace + partnerCapDelta < 0) return false;  // home can't fit

  // NMC check — never propose trading an NMC player
  if (homeSends.some(a => a.hasNMC)) return false;

  // Don't propose a team trading away their own stated need position
  // e.g. SJS giving away their only C when they need a C
  const partnerPlayers = partnerSends.filter(a => a.position !== "Pick");
  if (partnerTeam.needs && partnerPlayers.length > 0) {
    const givingAwayNeed = partnerPlayers.every(a => {
      const pos = ["L","R"].includes(a.position) ? "W" : a.position;
      return partnerTeam.needs!.some(n => n.pos === pos || n.pos === "Any");
    });
    // Only veto if they're giving away ALL their stated-need players with nothing coming back at that position
    const gettingBackPos = homeSends
      .filter(a => a.position !== "Pick")
      .map(a => ["L","R"].includes(a.position) ? "W" : a.position);
    if (givingAwayNeed && partnerTeam.needs.some(n =>
      partnerPlayers.some(a => {
        const pos = ["L","R"].includes(a.position) ? "W" : a.position;
        return n.pos === pos;
      }) && !gettingBackPos.includes(partnerTeam.needs!.find(nn =>
        partnerPlayers.some(a => ["L","R"].includes(a.position) ? "W" === nn.pos : a.position === nn.pos)
      )?.pos ?? "")
    )) return false;
  }

  // NAV sanity — don't propose massive imbalances (>100 NAV gap)
  const homeNavOut  = homeSends.reduce((s,a) => s+(navMap[a.id]??0), 0);
  const partnerNavOut = partnerSends.reduce((s,a) => s+(navMap[a.id]??0), 0);
  if (Math.abs(homeNavOut - partnerNavOut) > 120) return false;

  // Don't propose rebuilding teams trading away young high-value players
  // for aging veterans — goes against rebuild logic
  const homePhase = homeTeam.phase ?? "";
  if ((homePhase === "Rebuilding" || homePhase === "Tanking")) {
    const givingAwayYoungStar = homeSends.some(a =>
      a.position !== "Pick" && a.age <= 25 && (navMap[a.id]??0) > 80
    );
    const gettingOldVet = partnerSends.some(a =>
      a.position !== "Pick" && a.age >= 32 && a.yearsRemaining >= 3
    );
    if (givingAwayYoungStar && gettingOldVet) return false;
  }

  return true;
};

interface Props {
  outgoingBlock: Asset[];
  homeTeam:      Team | null;
  allTeams:      Team[];
  allPlayers:    Asset[];
  navMap:        Record<string, number>;
  onClose:       () => void;
  onLoadTrade:   (partner: Team, outgoing: Asset[], incoming: Asset[]) => void;
}

export default function TradeProposalEngine({
  outgoingBlock, homeTeam, allTeams, allPlayers, navMap, onClose, onLoadTrade
}: Props) {
  const [proposals,  setProposals]  = useState<TradeProposal[]>([]);
  const [generating, setGenerating] = useState(false);
  const [done,       setDone]       = useState(false);

  const blockNav  = outgoingBlock.reduce((s, a) => s + (navMap[a.id] ?? 0), 0);
  const isDump    = isDumpBlock(outgoingBlock, navMap);
  const rdLabel   = (r?: number) => r===1?"1st":r===2?"2nd":r===3?"3rd":`${r}th`;
  const blockSummary = outgoingBlock.length === 1 ? outgoingBlock[0].name : `${outgoingBlock.length}-piece package`;

  // Home team's picks (for sweetening dumps)
  const homePicks = homeTeam
    ? allPlayers.filter(p => p.teamId === homeTeam.id && p.position === "Pick")
    : [];

  const generate = async () => {
    if (!homeTeam) return;
    setGenerating(true); setDone(false); setProposals([]);

    const candidates: { team: Team; fitScore: number; homeSends: Asset[]; partnerSends: Asset[]; isDump: boolean; dumpSweetener: Asset[] }[] = [];

    const negNav = Math.abs(Math.min(0, blockNav));
    // Also check if this could be a neg-for-neg swap even if not a "dump"
    const hasNegPlayer = outgoingBlock.some(a => a.position !== "Pick" && getNav(a, navMap) < -5);

    for (const team of allTeams) {
      if (team.id === homeTeam.id) continue;
      const roster = allPlayers.filter(p => p.teamId === team.id && p.position !== "Pick");
      const picks  = allPlayers.filter(p => p.teamId === team.id && p.position === "Pick");
      const negPlayers = outgoingBlock.filter(a => a.position !== "Pick" && getNav(a, navMap) < -5);

      if (isDump) {
        // Salary dump: home sends bad contract + picks sweetener
        const fit = dumpFitScore(team, negPlayers, roster, navMap);
        if (fit < 20) continue;

        const sweetener = buildDumpSweetener(negNav, homePicks, navMap);

        const homeSends = [...outgoingBlock, ...sweetener];

        // Sometimes partner sends back a cheap depth player to make it a real trade
        const cheapReturn = roster
          .filter(p => !p.hasNMC && getNav(p, navMap) >= -10 && getNav(p, navMap) <= 20 && p.capHit < 2.5)
          .sort((a,b) => getNav(b,navMap)-getNav(a,navMap))[0];

        candidates.push({
          team, fitScore: fit,
          homeSends,
          partnerSends: cheapReturn ? [cheapReturn] : [],
          isDump: true,
          dumpSweetener: sweetener,
        });
      } else if (hasNegPlayer) {
        // Neg-for-neg swap: both teams trading contracts they want to move
        // Common in real NHL — teams swap bad contracts hoping for change of scenery
        const partnerNegPlayers = roster
          .filter(p => !p.hasNMC && getNav(p, navMap) < -5 && getNav(p, navMap) > -50)
          .sort((a,b) => getNav(b,navMap)-getNav(a,navMap));

        if (partnerNegPlayers.length === 0) {
          // Fall through to standard trade
          const fit = blockFitsTeam(team, outgoingBlock, roster, navMap);
          if (fit < 15) continue;
          const pkgs = buildReturnPackages(blockNav, roster, picks, navMap);
          if (pkgs.length === 0) continue;
          for (const pkg of pkgs.slice(0, 4)) {
            candidates.push({ team, fitScore: fit * (0.85 + Math.random() * 0.15), homeSends: outgoingBlock, partnerSends: pkg, isDump: false, dumpSweetener: [] });
          }
          continue;
        }

        // Find a partner neg player with similar NAV (within 40%)
        const homeNegNav = blockNav;
        const match = partnerNegPlayers.find(p => {
          const pNav = getNav(p, navMap);
          return Math.abs(pNav - homeNegNav) < Math.abs(homeNegNav) * 0.5 + 10;
        }) ?? partnerNegPlayers[0];

        // Cap must work both ways
        const homeCap = outgoingBlock.filter(a => a.position !== "Pick").reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)), 0);
        const partnerCap = match.capHit;
        if (team.capSpace + partnerCap < homeCap) continue;

        // Fit score: both teams want to move something
        const capSpaceBonus = team.capSpace > 5 ? 15 : 0;
        const posMatch = (() => {
          const hp = ["L","R"].includes(outgoingBlock[0]?.position) ? "W" : outgoingBlock[0]?.position;
          const pp = ["L","R"].includes(match.position) ? "W" : match.position;
          return hp !== pp ? 10 : 0; // different positions = more likely (no redundancy)
        })();
        const fit = Math.min(85, 50 + capSpaceBonus + posMatch);

        candidates.push({
          team, fitScore: fit,
          homeSends: outgoingBlock,
          partnerSends: [match],
          isDump: false,
          dumpSweetener: [],
        });
      } else {
        // Standard trade — generate multiple return packages per team
        const fit = blockFitsTeam(team, outgoingBlock, roster, navMap);
        if (fit < 15) continue;

        const pkgs = buildReturnPackages(blockNav, roster, picks, navMap);
        if (pkgs.length === 0) continue;

        // Add each valid package as a separate candidate
        // Cap at 4 packages per team to avoid one team dominating the pool
        for (const pkg of pkgs.slice(0, 4)) {
          // Slightly vary fitScore per package so weighted random picks different ones
          const pkgFit = Math.round(fit * (0.85 + Math.random() * 0.15));
          candidates.push({
            team, fitScore: pkgFit,
            homeSends: outgoingBlock,
            partnerSends: pkg,
            isDump: false,
            dumpSweetener: [],
          });
        }
      }
    }

    candidates.sort((a,b) => b.fitScore - a.fitScore);

    // Pre-screen — filter out proposals that would obviously be declined
    // Catches cap violations, NMC blocks, and self-defeating logic
    // before surfacing to the user. Better to show fewer clean proposals
    // than more with declined verdicts.
    const viable = candidates.filter(c =>
      preScreenProposal(c.homeSends, c.partnerSends, homeTeam!, c.team, navMap)
    );

    if (!viable.length) { setGenerating(false); setDone(true); return; }

    // Weighted random selection from top 10 viable candidates
    const weightedPick = (pool: typeof candidates, count: number) => {
      const picked: typeof candidates = [];
      const remaining = [...pool];
      while (picked.length < count && remaining.length > 0) {
        const totalWeight = remaining.reduce((s, c) => s + Math.pow(Math.max(1, c.fitScore), 1.5), 0);
        let r = Math.random() * totalWeight;
        let idx = 0;
        for (let i = 0; i < remaining.length; i++) {
          r -= Math.pow(Math.max(1, remaining[i].fitScore), 1.5);
          if (r <= 0) { idx = i; break; }
        }
        picked.push(remaining[idx]);
        remaining.splice(idx, 1);
      }
      return picked;
    };

    // Larger pool = more variety across runs
    const pool = viable.slice(0, Math.min(20, viable.length));
    const top  = weightedPick(pool, Math.min(3, pool.length));

    const initial: TradeProposal[] = top.map(c => ({
      partner:       c.team,
      homeSends:     c.homeSends,
      partnerSends:  c.partnerSends,
      fitScore:      c.fitScore,
      isDump:        c.isDump,
      dumpSweetener: c.dumpSweetener,
    }));
    setProposals(initial);
    setGenerating(false);
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,20,10,0.80)', backdropFilter: 'blur(3px)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        style={{ background: '#f0e6cc', border: '2px solid #b8a070', borderRadius: '3px' }}>

        {/* Header */}
        <div className="flex justify-between items-start p-4 sm:p-6" style={{ borderBottom: '2px solid #b8a070' }}>
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.4em] mb-1"
              style={{ color: isDump ? '#b83020' : '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              {isDump ? "⚠ Salary Dump — Searching Cap-Space Teams" : "Trade Request Generator"}
            </div>
            <div className="text-xl font-black" style={{ fontFamily: "'Libre Baskerville', serif", color: '#1c140a' }}>
              Find a trade for {blockSummary}
            </div>
            <div className="text-[10px] mt-1" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              {outgoingBlock.length > 1
                ? outgoingBlock.map((a: Asset) => `${a.name} (${a.position})`).join(" · ")
                : `${outgoingBlock[0]?.position} · Age ${outgoingBlock[0]?.age} · $${outgoingBlock[0]?.capHit}M`}
              {" "}· NAV {blockNav.toFixed(0)}
            </div>
            {isDump && (
              <div className="mt-2 text-[10px] font-bold" style={{ color: '#b83020', fontFamily: "'Courier Prime', monospace" }}>
                You will need to attach picks to move this contract.
                The engine will suggest the minimum sweetener required.
              </div>
            )}
          </div>
          <button onClick={onClose} className="font-bold text-xl transition-opacity hover:opacity-50 mt-1"
            style={{ color: '#9a7d58' }}>✕</button>
        </div>

        {!done && (
          <div className="p-4 sm:p-6">
            <button onClick={generate} disabled={generating}
              className="w-full py-3.5 font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 btn-stamp">
              {generating
                ? <><div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin"/>Searching 31 teams...</>
                : <>⚡ Generate Trade Proposals</>}
            </button>
          </div>
        )}

        {done && !proposals.length && (
          <div className="p-4 sm:p-6 text-center">
            <div className="text-sm font-bold" style={{ color: '#9a7d58' }}>No realistic trade partners found.</div>
            <div className="text-[10px] mt-1" style={{ color: '#b8a070', fontFamily: "'Courier Prime', monospace" }}>
              {isDump
                ? "No teams have enough cap space. Try retaining salary first — use the retention slider to lower the effective cap hit."
                : "Try adjusting the package — a player may have NMC, or the NAV gap is too large."}
            </div>
          </div>
        )}

        {proposals.length > 0 && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="text-[9px] font-black uppercase tracking-[0.4em] mb-4"
              style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              {proposals.length} Trade Scenario{proposals.length > 1 ? "s" : ""}
            </div>

            {proposals.map((p, i) => {
              const homeNavOut  = p.homeSends.reduce((s,a) => s+(navMap[a.id]??0), 0);
              const partnerNavOut = p.partnerSends.reduce((s,a) => s+(navMap[a.id]??0), 0);

              return (
                <div key={i} className="p-4" style={{ background: '#e8dab8', border: '1px solid #b8a070', borderRadius: '2px' }}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-black text-sm" style={{ fontFamily: "'Libre Baskerville', serif", color: '#1c140a' }}>
                        {p.partner.name}
                      </div>
                      <div className="text-[9px] font-black uppercase tracking-wider mt-0.5"
                        style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                        {p.partner.phase} · #{p.partner.standing} · ${p.partner.capSpace.toFixed(1)}M cap
                        {p.isDump && <span style={{ color: '#b83020' }}> · ABSORBS CONTRACT</span>}
                      </div>
                    </div>
                    <div className="text-[10px] font-black px-2 py-1" style={{
                      background: p.fitScore>=70 ? 'rgba(36,94,57,0.15)' : p.fitScore>=50 ? 'rgba(148,105,20,0.15)' : 'rgba(184,48,32,0.1)',
                      border: `1px solid ${p.fitScore>=70 ? '#245e39' : p.fitScore>=50 ? '#946914' : '#b83020'}`,
                      color: p.fitScore>=70 ? '#245e39' : p.fitScore>=50 ? '#946914' : '#b83020',
                      fontFamily: "'Courier Prime', monospace",
                    }}>{p.fitScore}% fit</div>
                  </div>

                  <div className="proposal-sends">
                    {/* HOME SENDS */}
                    <div className="p-2.5" style={{ background: '#dfd0a8', border: '1px solid #b8a070' }}>
                      <div className="text-[8px] font-black uppercase tracking-wider mb-1.5"
                        style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                        {homeTeam?.name.split(" ").pop()} sends
                        {p.isDump && p.dumpSweetener.length > 0 &&
                          <span style={{ color: '#b83020' }}> (+ sweetener)</span>}
                      </div>
                      {p.homeSends.map((a,j) => {
                        const nav = navMap[a.id] ?? 0;
                        const isSweetener = p.dumpSweetener.some(s => s.id === a.id);
                        return (
                          <div key={j} className="mb-1.5">
                            <div className="text-[11px] font-bold leading-tight"
                              style={{ color: isSweetener ? '#245e39' : nav < 0 ? '#b83020' : '#1c140a' }}>
                              {a.position==="Pick" ? `${a.year} ${rdLabel(a.round)} Rd Pick` : a.name}
                              <span className="ml-1 font-mono text-[9px]" style={{ color: '#9a7d58' }}>
                                {a.position!=="Pick" && `$${a.capHit}M`}
                              </span>
                              {isSweetener && <span className="ml-1 text-[8px]" style={{ color: '#245e39' }}>↑ sweetener</span>}
                            </div>
                            {a.position !== "Pick" && (
                              <div className="text-[8px] font-mono mt-0.5" style={{ color: '#9a7d58' }}>
                                {a.position} · Age {a.age}
                                {a.position === "G"
                                  ? ` · ${a.savePct?.toFixed(3) ?? "—"} SV%`
                                  : ` · ${a.ptsPace?.toFixed(0) ?? "—"} pts/82`}
                                {` · ${a.avgTOI?.toFixed(1) ?? "—"} TOI`}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="text-[10px] font-black font-mono mt-1.5" style={{ color: '#9a7d58' }}>
                        {homeNavOut.toFixed(0)} NAV total
                      </div>
                    </div>

                    <div className="proposal-swap-arrow" style={{ color: '#b8a070' }}>⇄</div>

                    {/* PARTNER SENDS */}
                    <div className="p-2.5" style={{ background: '#dfd0a8', border: '1px solid #b8a070' }}>
                      <div className="text-[8px] font-black uppercase tracking-wider mb-1.5"
                        style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                        {p.partner.name.split(" ").pop()} sends
                      </div>
                      {p.partnerSends.length === 0 ? (
                        <div className="text-[11px] font-bold italic" style={{ color: '#9a7d58' }}>
                          Cap space absorption only
                        </div>
                      ) : p.partnerSends.map((a,j) => (
                        <div key={j} className="mb-1.5">
                          <div className="text-[11px] font-bold leading-tight" style={{ color: '#1c140a' }}>
                            {a.position==="Pick" ? `${a.year} ${rdLabel(a.round)} Rd Pick` : a.name}
                            <span className="ml-1 font-mono text-[9px]" style={{ color: '#9a7d58' }}>
                              {a.position!=="Pick" && `$${a.capHit}M`}
                            </span>
                          </div>
                          {a.position !== "Pick" && (
                            <div className="text-[8px] font-mono mt-0.5" style={{ color: '#9a7d58' }}>
                              {a.position} · Age {a.age}
                              {a.position === "G"
                                ? ` · ${a.savePct?.toFixed(3) ?? "—"} SV%`
                                : ` · ${a.ptsPace?.toFixed(0) ?? "—"} pts/82`}
                              {` · ${a.avgTOI?.toFixed(1) ?? "—"} TOI`}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="text-[10px] font-black font-mono mt-1.5"
                        style={{ color: p.isDump ? '#b83020' : '#245e39' }}>
                        {p.isDump ? "Cap relief for home" : `${partnerNavOut.toFixed(0)} NAV`}
                      </div>
                    </div>
                  </div>

                  {/* Motivation & Risk */}
                  {(() => {
                    const homeMotivation    = getMotivation(homeTeam!, p.homeSends, p.partnerSends, p.isDump, navMap);
                    const partnerMotivation = getMotivation(p.partner, p.partnerSends, p.homeSends, false, navMap);
                    const risk              = getRisk(p.homeSends, p.partnerSends, navMap);
                    return (
                      <div className="mb-3 space-y-1.5" style={{ borderTop: '1px solid #c8b890', paddingTop: '10px' }}>
                        <div className="flex gap-1.5 items-baseline">
                          <span className="text-[7px] font-black uppercase tracking-wider shrink-0 w-16"
                            style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                            {homeTeam?.name.split(" ").pop()}
                          </span>
                          <span className="text-[10px] leading-snug" style={{ color: '#3d2e18', fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic' }}>
                            {homeMotivation}
                          </span>
                        </div>
                        <div className="flex gap-1.5 items-baseline">
                          <span className="text-[7px] font-black uppercase tracking-wider shrink-0 w-16"
                            style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                            {p.partner.name.split(" ").pop()}
                          </span>
                          <span className="text-[10px] leading-snug" style={{ color: '#3d2e18', fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic' }}>
                            {partnerMotivation}
                          </span>
                        </div>
                        {risk && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[7px] font-black px-1.5 py-0.5 uppercase tracking-wider"
                              style={{ background: 'rgba(184,48,32,0.10)', border: '1px solid rgba(184,48,32,0.35)', color: '#b83020', fontFamily: "'Courier Prime', monospace" }}>
                              ⚠ {risk.label}
                            </span>
                            <span className="text-[9px]" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                              {risk.detail}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="text-[9px] font-black uppercase tracking-wider px-2 py-1" style={{
                      background: p.isDump ? 'rgba(184,48,32,0.08)' : 'rgba(43,63,102,0.08)',
                      border: `1px solid ${p.isDump ? 'rgba(184,48,32,0.3)' : 'rgba(43,63,102,0.3)'}`,
                      color: p.isDump ? '#b83020' : '#2b3f66',
                      fontFamily: "'Courier Prime', monospace",
                    }}>
                      {p.isDump
                        ? `${homeTeam?.name.split(" ").pop()} clears ${
                            outgoingBlock.filter((a: Asset) => a.position !== "Pick")
                              .reduce((s: number, a: Asset) => s + a.capHit*(1-(a.retainedPct||0)), 0).toFixed(1)
                          }M cap`
                        : `NAV: ${homeTeam?.name.split(" ").pop()} +${(partnerNavOut - homeNavOut).toFixed(0)}`}
                    </div>
                    <button
                      onClick={() => onLoadTrade(p.partner, p.homeSends, p.partnerSends)}
                      className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 btn-stamp">
                      Load into Trade Machine ↗
                    </button>
                  </div>

                </div>
              );
            })}

            <button onClick={() => { setDone(false); setProposals([]); }}
              className="w-full py-2.5 font-black text-[10px] uppercase tracking-widest transition-colors btn-ghost mt-2">
              Generate New Proposals
            </button>
          </div>
        )}
      </div>
    </div>
  );
}