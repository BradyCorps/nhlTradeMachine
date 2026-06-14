import type { Asset, Team } from "@/app/lib/trade-types";

export interface TradeProposal {
  partner:        Team;
  homeSends:      Asset[];
  partnerSends:   Asset[];
  fitScore:       number;
  isDump:         boolean;
  dumpSweetener:  Asset[];
  marketRank?:    number;
  alternativeCount?: number;
}

export const getNav = (a: Asset, navMap: Record<string, number>): number => navMap[a.id] ?? 0;

export const isDumpBlock = (block: Asset[], navMap: Record<string, number>): boolean => {
  const players = block.filter(a => a.position !== "Pick");
  if (players.length === 0) return false;
  const totalNav = players.reduce((s, a) => s + getNav(a, navMap), 0);
  const hasNegative = players.some(a => getNav(a, navMap) < -5);
  return hasNegative && totalNav < 15;
};

const isRebuildPhase = (phase: string): boolean =>
  phase === "Rebuilding" || phase === "Tanking";

const isWinNowPhase = (phase: string): boolean =>
  phase === "Contender" || phase === "Bubble";

const lastName = (asset: Asset): string =>
  asset.name.split(" ").pop() ?? asset.name;

const isFutureCoreAsset = (asset: Asset): boolean => {
  const p = asset.developmentProfile;
  if (!p || asset.position === "Pick" || asset.position === "G" || asset.age > 25) return false;
  return p.dynastyScore >= 62
    || p.boomBustSignal === "BOOM_LEAN"
    || p.developmentPhase === "EMERGING"
    || (p.developmentPhase === "BREAKOUT_CANDIDATE" && p.breakoutProbability >= 55);
};

const isDevelopmentRiskAsset = (asset: Asset): boolean => {
  const p = asset.developmentProfile;
  if (!p || asset.position === "Pick" || asset.position === "G" || asset.age > 25) return false;
  return p.boomBustSignal === "BUST_LEAN"
    || (p.boomBustSignal === "HIGH_VARIANCE" && p.bustScore >= p.boomScore && p.projectionBand.confidence < 50);
};

const isPeakWindowAsset = (asset: Asset): boolean => {
  const p = asset.developmentProfile;
  if (!p || asset.position === "Pick" || asset.position === "G") return false;
  return p.developmentPhase === "PEAK_WINDOW" && p.regressionRisk < 45;
};

const hasPremiumSpend = (assets: Asset[], navMap: Record<string, number>): boolean =>
  assets.some(a => a.position === "Pick" && a.round === 1)
  || assets.some(a => a.position !== "Pick" && getNav(a, navMap) > 60);

const hasVeteranTerm = (assets: Asset[]): boolean =>
  assets.some(a => a.position !== "Pick" && a.age >= 30 && a.yearsRemaining >= 2);

const isShoppedAsset = (asset: Asset): boolean =>
  asset.tradeBlockStatus === "available" || asset.tradeBlockStatus === "requested";

const isPremiumLotteryPick = (asset: Asset, navMap: Record<string, number>): boolean =>
  asset.position === "Pick"
  && (asset.round ?? 99) === 1
  && ((asset.teamStanding ?? 16) >= 30 || getNav(asset, navMap) >= 300);

// Score how willing a team is to absorb a negative contract
export const dumpFitScore = (
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
export const blockFitsTeam = (
  team: Team,
  block: Asset[],
  teamRoster: Asset[],
  navMap: Record<string, number>,
): number => {
  let score = 0;
  const phase = team.phase ?? "Retooling";
  const rebuilding = isRebuildPhase(phase);
  const winNow = isWinNowPhase(phase);
  const blockCap = block.filter(a => a.position !== "Pick")
    .reduce((s, a) => s + a.capHit * (1-(a.retainedPct||0)), 0);

  if (team.capSpace >= blockCap) score += 15;
  else if (team.capSpace >= blockCap * 0.5) score += 5;
  else score -= 20;

  for (const player of block) {
    if (player.position === "Pick") {
      if (rebuilding) score += 15;
      else if (phase === "Retooling") score += 8;
      continue;
    }
    const pos = ["L","R"].includes(player.position) ? "W" : player.position;
    if (player.age <= 28 && (rebuilding || phase === "Retooling")) score += 15;
    if (player.age >= 27 && player.age <= 33 && winNow) score += 15;
    if (player.age > 33 && rebuilding) score -= 15;
    if (rebuilding && isFutureCoreAsset(player)) score += 20;
    if (rebuilding && isDevelopmentRiskAsset(player)) score += 5;
    if (winNow && isPeakWindowAsset(player)) score += 18;
    if (winNow && isDevelopmentRiskAsset(player)) score -= 12;
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
export const buildDumpSweetener = (
  negNav:    number,  // absolute value of how negative
  homePicks: Asset[],
  navMap:    Record<string, number>,
): Asset[] => {
  const sortedPicks = [...homePicks]
    .sort((a, b) => getNav(b, navMap) - getNav(a, navMap));

  const pkg: Asset[] = [];
  let total = 0;
  const maxPicks = negNav > 35 ? 2 : 1;  // hard cap at 2 picks regardless

  for (const pk of sortedPicks) {
    if (getNav(pk, navMap) > 50) continue;
    pkg.push(pk);
    total += getNav(pk, navMap);
    if (pkg.length >= maxPicks) break;
    if (total >= negNav * 0.8) break;
  }
  return pkg;
};

// Build return package for standard trades (partner sends back value)
// ── Multi-package return builder ─────────────────────────────
export const buildReturnPackages = (
  targetNAV:  number,
  roster:     Asset[],
  picks:      Asset[],
  navMap:     Record<string, number>,
): Asset[][] => {
  const n = (a: Asset) => getNav(a, navMap);
  const packages: { pkg: Asset[]; score: number }[] = [];

  // Untouchables never appear in generated return packages — their GM
  // won't discuss them at any price.
  const tradeable = roster
    .filter(p => !p.hasNMC && p.position !== "Pick" && n(p) > -15
      && p.tradeBlockStatus !== "untouchable")
    .sort((a, b) => n(b) - n(a));
  const sortedPicks = [...picks]
    .sort((a, b) => n(b) - n(a));

  const fwds = tradeable.filter(p => ["W","C","L","R"].includes(p.position));
  const dmen = tradeable.filter(p => p.position === "D");

  const window1 = 0.28;
  const window2 = 0.32;
  const window3 = 0.36;
  const fits = (v: number, w: number) =>
    v >= targetNAV * (1 - w) && v <= targetNAV * (1 + w);

  const scorePackage = (pkg: Asset[], totalNav: number): number => {
    const navDiff = Math.abs(totalNav - targetNAV) / Math.max(targetNAV, 1);
    const sizePenalty = (pkg.length - 1) * 0.08;
    const pickCount = pkg.filter(a => a.position === "Pick").length;
    const pickBonus = pickCount > 0 ? 0.05 : 0;
    // Players the partner is already shopping (admin trade block) are the most
    // realistic return pieces — boost packages built around them.
    const shoppedBonus = pkg.some(a =>
      a.tradeBlockStatus === "available" || a.tradeBlockStatus === "requested") ? 0.12 : 0;
    return Math.max(0, 1 - navDiff - sizePenalty + pickBonus + shoppedBonus);
  };

  const seen = new Set<string>();
  const addPkg = (pkg: Asset[], totalNav: number) => {
    const key = pkg.map(a => a.id).sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    packages.push({ pkg, score: scorePackage(pkg, totalNav) });
  };

  for (const p of tradeable) {
    const v = n(p);
    if (fits(v, window1)) addPkg([p], v);
  }

  if (targetNAV >= 80) {
    for (const f of fwds.slice(0, 12)) {
      for (const d of dmen.slice(0, 8)) {
        const v = n(f) + n(d);
        if (fits(v, window2)) addPkg([f, d], v);
      }
    }
    for (let i = 0; i < Math.min(fwds.length, 10); i++) {
      for (let j = i+1; j < Math.min(fwds.length, 10); j++) {
        const v = n(fwds[i]) + n(fwds[j]);
        if (fits(v, window2)) addPkg([fwds[i], fwds[j]], v);
      }
    }
    for (const p of tradeable.slice(0, 12)) {
      for (const pk of sortedPicks.slice(0, 6)) {
        const v = n(p) + n(pk);
        if (fits(v, window2)) addPkg([p, pk], v);
      }
    }
    for (let i = 0; i < Math.min(dmen.length, 6); i++) {
      for (let j = i+1; j < Math.min(dmen.length, 6); j++) {
        const v = n(dmen[i]) + n(dmen[j]);
        if (fits(v, window2)) addPkg([dmen[i], dmen[j]], v);
      }
    }
  }

  if (targetNAV >= 150) {
    for (const f of fwds.slice(0, 8)) {
      for (const d of dmen.slice(0, 6)) {
        for (const pk of sortedPicks.slice(0, 4)) {
          const v = n(f) + n(d) + n(pk);
          if (fits(v, window3)) addPkg([f, d, pk], v);
        }
      }
    }
    for (let i = 0; i < Math.min(fwds.length, 7); i++) {
      for (let j = i+1; j < Math.min(fwds.length, 7); j++) {
        for (const pk of sortedPicks.slice(0, 4)) {
          const v = n(fwds[i]) + n(fwds[j]) + n(pk);
          if (fits(v, window3)) addPkg([fwds[i], fwds[j], pk], v);
        }
      }
    }
    for (const f of fwds.slice(0, 6)) {
      for (let i = 0; i < Math.min(dmen.length, 5); i++) {
        for (let j = i+1; j < Math.min(dmen.length, 5); j++) {
          const v = n(f) + n(dmen[i]) + n(dmen[j]);
          if (fits(v, window3)) addPkg([f, dmen[i], dmen[j]], v);
        }
      }
    }
  }

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
    .slice(0, 20)
    .map(p => p.pkg);
};

export const getMotivation = (
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
  const futureCoreIn = recvPlayers.find(isFutureCoreAsset);
  const futureCoreOut = sendPlayers.find(isFutureCoreAsset);
  const devRiskIn = recvPlayers.find(isDevelopmentRiskAsset);
  const peakWindowIn = recvPlayers.find(isPeakWindowAsset);

  const avgSendAge = sendPlayers.length > 0
    ? sendPlayers.reduce((s,a) => s + a.age, 0) / sendPlayers.length : 0;
  const avgRecvAge = recvPlayers.length > 0
    ? recvPlayers.reduce((s,a) => s + a.age, 0) / recvPlayers.length : 0;

  if (isWinNowPhase(phase) || standing <= 8) {
    if (isDump && recvPlayers.length > 0)
      return `Absorbs ${lastName(recvPlayers[0])}'s contract to add depth — playoff window justifies cap risk.`;
    if (peakWindowIn)
      return `Adds ${lastName(peakWindowIn)} as a peak-window player with low regression risk — clean win-now fit.`;
    if (devRiskIn && hasPremiumSpend(sends, navMap))
      return `Takes a development swing on ${lastName(devRiskIn)} — upside is real, but the price needs conviction.`;
    if (netGain > 20 && avgRecvAge < 30)
      return `Adds a younger, high-value piece without mortgaging the future — fits the win-now mandate.`;
    if (sendPicks.length > 0)
      return `Trades future assets for present value — window is open, picks can wait.`;
    return `Improves the roster margin on a contending team; every point matters in a tight playoff race.`;
  }

  if (isRebuildPhase(phase) || standing >= 25) {
    if (futureCoreIn) {
      const p = futureCoreIn.developmentProfile!;
      return `Adds ${lastName(futureCoreIn)} as a future-core profile — ${p.dynastyScore}/100 dynasty score and ${p.boomBustSignal.toLowerCase().replace("_", " ")} arc.`;
    }
    if (futureCoreOut && hasVeteranTerm(receives) && recvPicks.length === 0)
      return `This is hard to justify: ${lastName(futureCoreOut)} carries future-core value, but the return leans veteran term.`;
    if (recvPicks.length > 0)
      return `Collects draft capital during the rebuild — ${recvPicks.length} pick${recvPicks.length>1?"s":""} accelerate the timeline.`;
    if (sendPlayers.length > 0 && sendPlayers[0].age >= 30)
      return `Moves an aging asset before value erodes — gets younger and adds flexibility.`;
    if (capSpace > 10)
      return `Cap space is an asset during the rebuild; absorbing salary generates return value.`;
    return `Prioritizes the future — assets acquired now compound during the development window.`;
  }

  if (avgSendAge > 31 && avgRecvAge < 27)
    return `Sells aging production for younger assets — retooling without a full teardown.`;
  if (netGain > 15)
    return `Improves talent level while staying competitive — the right move at the bubble.`;
  if (capSpace < 3)
    return `Frees cap flexibility — staying competitive requires room to make in-season moves.`;
  return `Balances present competitiveness with future asset accumulation at the retooling stage.`;
};

export const getRisk = (
  sends: Asset[],
  receives: Asset[],
  navMap: Record<string, number>,
): { label: string; detail: string } | null => {
  const recvPlayers = receives.filter(a => a.position !== "Pick");
  const sendPlayers = sends.filter(a => a.position !== "Pick");

  const devRiskIncoming = recvPlayers.find(isDevelopmentRiskAsset);
  if (devRiskIncoming && hasPremiumSpend(sends, navMap)) {
    const p = devRiskIncoming.developmentProfile!;
    return {
      label: "DEV VARIANCE",
      detail: `${lastName(devRiskIncoming)} has boom ${p.boomScore}/100, bust ${p.bustScore}/100, ${p.projectionBand.confidence}/100 confidence`,
    };
  }

  const futureCoreOutgoing = sendPlayers.find(isFutureCoreAsset);
  if (futureCoreOutgoing && hasVeteranTerm(receives) && !receives.some(a => a.position === "Pick")) {
    const p = futureCoreOutgoing.developmentProfile!;
    return {
      label: "FUTURE CORE",
      detail: `Moving ${lastName(futureCoreOutgoing)}'s ${p.dynastyScore}/100 dynasty profile without draft capital back`,
    };
  }

  const oldIncoming = recvPlayers.find(a => a.age >= 33 && a.yearsRemaining >= 3);
  if (oldIncoming)
    return { label: "AGE CLIFF", detail: `${lastName(oldIncoming)} is ${oldIncoming.age} with ${oldIncoming.yearsRemaining}yr left` };

  const sendNav = sends.reduce((s,a) => s+(navMap[a.id]??0), 0);
  const recvNav = receives.reduce((s,a) => s+(navMap[a.id]??0), 0);
  if (sendNav > recvNav + 40)
    return { label: "OVERPAY", detail: `Sending ${(sendNav-recvNav).toFixed(0)} more NAV than receiving` };

  const longDeal = recvPlayers.find(a => a.capHit > 7 && a.yearsRemaining >= 6 && a.age >= 30);
  if (longDeal)
    return { label: "CONTRACT RISK", detail: `$${longDeal.capHit}M × ${longDeal.yearsRemaining}yr ages poorly` };

  const posGiven = sendPlayers.map(a => a.position);
  const posBack  = recvPlayers.map(a => a.position);
  if (posGiven.includes("D") && !posBack.some(p => p === "D") && recvPlayers.length > 0)
    return { label: "DEPTH GAP", detail: "Losing a defenceman without a D coming back" };

  const goodSends = sendPlayers.filter(a => (navMap[a.id]??0) > 20);
  if (goodSends.length > 0 && sends.some(a => a.position === "Pick"))
    return { label: "ASSET DRAIN", detail: "Sending both a quality player and picks" };

  return null;
};

export const preScreenProposal = (
  homeSends:    Asset[],
  partnerSends: Asset[],
  homeTeam:     Team,
  partnerTeam:  Team,
  navMap:       Record<string, number>,
): boolean => {
  const homeCap    = homeSends.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)), 0);
  const partnerCap = partnerSends.reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)), 0);
  const homeCapDelta    = partnerCap - homeCap;
  const partnerCapDelta = homeCap - partnerCap;

  if (partnerTeam.capSpace + homeCapDelta < 0) return false;
  if (homeTeam.capSpace + partnerCapDelta < 0) return false;

  if (homeSends.some(a => a.hasNMC)) return false;

  const DIVISIONS: Record<string, string[]> = {
    Atlantic:     ["BOS","BUF","DET","FLA","MTL","OTT","TBL","TOR"],
    Metropolitan: ["CAR","CBJ","NJD","NYI","NYR","PHI","PIT","WSH"],
    Central:      ["UTA","CHI","COL","DAL","MIN","NSH","STL","WPG"],
    Pacific:      ["ANA","CGY","EDM","LAK","SEA","SJS","VAN","VGK"],
  };
  const inSameDivision = Object.values(DIVISIONS).some(div =>
    div.includes(homeTeam.id) && div.includes(partnerTeam.id)
  );
  if (inSameDivision &&
    (partnerTeam.phase === "Contender" || partnerTeam.phase === "Bubble") &&
    (homeTeam.phase === "Contender" || homeTeam.phase === "Bubble")) {
    return false;
  }

  const partnerPhase = partnerTeam.phase ?? "";
  if (isRebuildPhase(partnerPhase)) {
    const sendingOldVet = homeSends.some(a =>
      a.position !== "Pick" && a.age >= 32 && a.yearsRemaining >= 3
    );
    if (sendingOldVet) return false;

    const partnerSellingFutureCore = partnerSends.some(isFutureCoreAsset);
    const homeSendingNoPicks = !homeSends.some(a => a.position === "Pick");
    if (partnerSellingFutureCore && homeSendingNoPicks && hasVeteranTerm(homeSends)) return false;

    const partnerSellingPremiumPick = partnerSends.some(a => isPremiumLotteryPick(a, navMap));
    const homeReturnNav = homeSends.reduce((s, a) => s + (navMap[a.id] ?? 0), 0);
    const partnerPickNav = partnerSends
      .filter(a => isPremiumLotteryPick(a, navMap))
      .reduce((s, a) => s + (navMap[a.id] ?? 0), 0);
    if (partnerSellingPremiumPick && homeReturnNav < partnerPickNav * 1.35) return false;
  }

  if (isWinNowPhase(partnerPhase)) {
    const sendingNegativeContract = homeSends.some(a =>
      a.position !== "Pick" && (navMap[a.id] ?? 0) < -30
    );
    if (sendingNegativeContract) return false;
  }

  if (partnerSends.some(a => a.hasNMC)) return false;

  // Untouchables are a hard decline — the partner GM will not move them
  if (partnerSends.some(a => a.tradeBlockStatus === "untouchable")) return false;

  const partnerPlayers = partnerSends.filter(a => a.position !== "Pick");
  if (partnerTeam.needs && partnerPlayers.length > 0) {
    const givingAwayNeed = partnerPlayers.every(a => {
      const pos = ["L","R"].includes(a.position) ? "W" : a.position;
      return partnerTeam.needs!.some(n => n.pos === pos || n.pos === "Any");
    });
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

  const homeNavOut    = homeSends.reduce((s,a) => s+(navMap[a.id]??0), 0);
  const partnerNavOut = partnerSends.reduce((s,a) => s+(navMap[a.id]??0), 0);
  if (Math.abs(homeNavOut - partnerNavOut) > 120) return false;
  const partnerAskedToLose = partnerNavOut - homeNavOut;
  const allPartnerAssetsShopped = partnerSends.length > 0 && partnerSends.every(isShoppedAsset);
  const maxPartnerConcession = allPartnerAssetsShopped ? 40 : isRebuildPhase(partnerPhase) ? 18 : 28;
  if (partnerAskedToLose > maxPartnerConcession) return false;

  const homePhase = homeTeam.phase ?? "";
  if (isRebuildPhase(homePhase)) {
    const givingAwayYoungStar = homeSends.some(a =>
      a.position !== "Pick" && a.age <= 25 && (navMap[a.id]??0) > 80
    );
    const gettingOldVet = partnerSends.some(a =>
      a.position !== "Pick" && a.age >= 32 && a.yearsRemaining >= 3
    );
    if (givingAwayYoungStar && gettingOldVet) return false;

    const homeSellingFutureCore = homeSends.some(isFutureCoreAsset);
    const partnerSendingNoPicks = !partnerSends.some(a => a.position === "Pick");
    if (homeSellingFutureCore && partnerSendingNoPicks && hasVeteranTerm(partnerSends)) return false;
  }

  return true;
};
