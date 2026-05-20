'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ============================================================
// X-NAV 7.0 — CORRECTED DATA SCIENCE CORE
// Fixes applied:
//   1. No double-cap penalty
//   2. Contract term baked into valuation
//   3. Pick value uses team standing context
//   4. Proper superstar cliff at age 30, not 28
//   5. NaN failsafe at every step
// ============================================================
const getXNAV = (asset: Asset): XNAVResult => {
  // ----- DRAFT PICKS -----
  if (asset.position === 'Pick') {
    const round = asset.round || 1;
    const standing = asset.teamStanding || 16; // 1=worst, 32=best
    const year = asset.year || 2025;
    const yearDecay = Math.pow(0.88, year - 2025); // future picks discounted

    // Inverse standing: worse teams have more valuable picks
    const pickSlot = Math.round(((33 - standing) / 32) * 31) + 1; // ~1-32 slot
    const roundDiscount = round === 1 ? 1.0 : round === 2 ? 0.38 : 0.15;
    const baseValue =
      45.0 * Math.pow(0.83, pickSlot - 1) * roundDiscount * yearDecay;

    return {
      total: Math.max(1, baseValue),
      off: 0,
      def: 0,
      age: baseValue * 0.4,
      cap: 0,
      upside: baseValue * 0.4,
    };
  }

  // ----- SKATERS -----
  // 1. Bayesian Regularization (confidence from sample size)
  const SIGMA = { PTS_M: 34.0, PTS_SD: 24.2, DEF_M: 0.28, DEF_SD: 0.65 };
  const confidence = Math.min(
    1.0,
    Math.pow(Math.max(0, asset.games) / 45, 1.8)
  );

  // Shrink toward league mean when sample is small
  const expPts =
    safe(asset.ptsPace) * confidence + SIGMA.PTS_M * (1 - confidence);
  const expDef =
    safe(asset.defRate) * confidence + SIGMA.DEF_M * (1 - confidence);

  // 2. Z-scores (capped to prevent McDavid-style NaN explosion)
  const zPts = clamp((expPts - SIGMA.PTS_M) / SIGMA.PTS_SD, -3.5, 5.5);
  const zDef = clamp((expDef - SIGMA.DEF_M) / SIGMA.DEF_SD, -3.0, 3.0);

  // 3. Positional value weights
  const toiWeight = Math.pow(clamp(safe(asset.avgTOI) / 18, 0.4, 2.0), 1.3);
  const isPillarD = asset.position === 'D' && safe(asset.avgTOI) > 22;
  const posAdj = isPillarD
    ? 1.9
    : asset.position === 'C'
    ? 1.45
    : asset.position === 'D'
    ? 1.3
    : 1.0;

  // 4. Nonlinear impact (superstars are exponentially more valuable)
  const offImpact = Math.sign(zPts) * Math.pow(Math.abs(zPts), 1.9) * 62;
  const defImpact =
    Math.sign(zDef) * Math.pow(Math.abs(zDef), 1.25) * 33 * toiWeight;

  // 5. Age / depreciation curve
  //    Superstars peak later and decline more gradually
  const isSuperstar = expPts > 80;
  const peakAge = isSuperstar ? 30 : 28;
  const agePenaltyRaw =
    asset.age > peakAge ? Math.pow(asset.age - peakAge, 1.65) * 1.4 : 0;
  const ageFactor = Math.max(0.25, 1.1 - agePenaltyRaw / 100);

  // 6. True Market Value
  const trueMarketValue = safe(
    (offImpact * 0.65 + defImpact * 0.35) * posAdj * ageFactor
  );

  // 7. Contract surplus (FIX: single penalty, not double)
  //    A player is worth their performance value minus what they're paid.
  //    We represent cap cost as a direct surplus subtractor.
  const perfPerMillion = Math.max(
    0,
    trueMarketValue / Math.max(1, asset.capHit)
  );
  const capEfficiencyRatio = perfPerMillion; // higher = better deal
  // FIX: Only subtract cap once, scaled by years remaining (long bad deals are worse)
  const termMultiplier = Math.min(
    2.5,
    1.0 + (asset.yearsRemaining || 1) * 0.15
  );
  const capCostNet = asset.capHit * 1.5 * termMultiplier;
  const overpayPenalty =
    asset.capHit > trueMarketValue / 10
      ? Math.max(0, asset.capHit - trueMarketValue / 10) * 3.0
      : 0;

  // 8. Option value (young players on cheap deals)
  const optionValue =
    asset.age < 25
      ? Math.pow(25 - asset.age, 1.6) * (1 - confidence) * 16.0
      : 0;

  // 9. Intangibles
  const intangibleBoost =
    trueMarketValue * ((asset.multiplier || 1.0) - 1.0) * 0.5;

  // 10. Retained salary bonus (if partner is retaining, home team benefits)
  const retainedBonus = (asset.retainedPct || 0) * asset.capHit * 12;

  const netSurplus = safe(
    trueMarketValue -
      capCostNet -
      overpayPenalty +
      optionValue +
      intangibleBoost +
      retainedBonus
  );

  return {
    total: netSurplus,
    off: safe(offImpact * posAdj),
    def: safe(defImpact * posAdj),
    age: optionValue > 0 ? optionValue : -agePenaltyRaw,
    cap: -(capCostNet + overpayPenalty),
    upside: optionValue,
  };
};

// ============================================================
// GM LOGIC ENGINE — v7.1
// What separates this from every other trade machine.
//
// Real GMs don't just match cap hits. They ask:
//   1. Does this fit our timeline? (contender vs rebuild)
//   2. Does this fix an actual hole, or create a logjam?
//   3. Are we giving the right SHAPE of assets back?
//   4. Does the partner have a rational reason to say yes?
//   5. Is there a CBA rule that makes this impossible?
//
// Each check produces a GmFlag with a severity:
//   HARD    — structurally illegal (cap, NMC, floor)
//   SOFT    — legally fine, but a real GM declines
//   WARN    — red flag worth noting
//   INFO    — context / positive signal
// ============================================================

type FlagSeverity = 'HARD' | 'SOFT' | 'WARN' | 'INFO';
type FlagCategory =
  | 'CAP_VIOLATION'
  | 'FLOOR_VIOLATION'
  | 'CLAUSE'
  | 'ELITE_BLOCKADE'
  | 'TIMELINE_MISMATCH'
  | 'REBUILD_LOGIC'
  | 'CONTENDER_LOGIC'
  | 'ASSET_SHAPE_MISMATCH'
  | 'POSITIONAL_REDUNDANCY'
  | 'LEVERAGE_ASYMMETRY'
  | 'RENTAL_TAX'
  | 'AGE_CLIFF'
  | 'DEAD_WEIGHT'
  | 'FIRE_SALE'
  | 'LOCKER_ROOM'
  | 'RETAIN_ABUSE'
  | 'GOOD';

interface GmFlag {
  severity: FlagSeverity;
  category: FlagCategory;
  headline: string;
  explanation: string;
  affectedAsset?: string;
  vetoesSide?: 0 | 1;
}

// ---- Team archetype classifier ----
type TeamMode = 'CONTENDER' | 'BUBBLE' | 'RETOOLING' | 'REBUILDING' | 'TANKING';

const classifyTeam = (team: Team, roster: Asset[]): TeamMode => {
  const capCeiling = 104; // 2026-27
  const capUsed = capCeiling - team.capSpace;
  // Also respect the phase field from db.ts if present
  if (team.phase === 'Tanking') return 'TANKING';
  if (team.phase === 'Rebuilding') return 'REBUILDING';
  if (team.standing <= 6 && capUsed > 85) return 'CONTENDER';
  if (team.standing <= 14 && capUsed > 72) return 'BUBBLE';
  if (team.standing > 24 && team.capSpace > 25) return 'TANKING';
  if (team.standing > 18) return 'REBUILDING';
  return 'RETOOLING';
};

const positionalDepth = (assets: Asset[], position: string): number =>
  assets.filter((a) => {
    if (position === 'C') return a.position === 'C' && a.ptsPace > 45;
    if (position === 'D') return a.position === 'D' && a.avgTOI > 20;
    return (
      (a.position === 'W' || a.position === 'L' || a.position === 'R') &&
      a.ptsPace > 40
    );
  }).length;

// How many quality players does a team have at a position AFTER removing outgoing assets
const rosterDepthAfterTrade = (
  fullRoster: Asset[],
  outgoing: Asset[],
  position: string
): number => {
  const remaining = fullRoster.filter(
    (p) => !outgoing.some((o) => o.id === p.id)
  );
  return positionalDepth(remaining, position);
};

// Is this team already identified as needing a position in db.ts needs array?
const teamNeedsPosition = (team: Team, position: string): boolean => {
  if (!team.needs?.length) return false;
  return team.needs.some((n) => n.pos === position || n.pos === 'Any');
};

// Score how defensively dependent a team is (goalie + D quality)
// Higher = team relies more on defensive structure, can't afford to gut D corps
const defensiveDependencyScore = (roster: Asset[]): number => {
  const dmen = roster.filter((p) => p.position === 'D');
  const eliteD = dmen.filter((p) => p.avgTOI > 22 && p.ptsPace > 35);
  const totalDTOI = dmen.reduce((s, p) => s + p.avgTOI, 0);
  // A team concentrated around 1-2 elite D is more dependent than one with 4 solid D
  return eliteD.length <= 1 ? 0.9 : eliteD.length === 2 ? 0.6 : 0.3;
};

const runGmLogic = (
  outgoing: Asset[],
  incoming: Asset[],
  teamHome: Team | null,
  teamPartner: Team | null,
  allHomeRoster: Asset[],
  allPartnerRoster: Asset[]
): GmFlag[] => {
  const flags: GmFlag[] = [];
  if (!teamHome || !teamPartner) return flags;

  const modeHome = classifyTeam(teamHome, allHomeRoster);
  const modePartner = classifyTeam(teamPartner, allPartnerRoster);
  const navOut = outgoing.reduce((s, a) => s + getXNAV(a).total, 0);
  const navIn = incoming.reduce((s, a) => s + getXNAV(a).total, 0);
  const homeNetGain = navIn - navOut;
  const maxNav = Math.max(Math.abs(navOut), Math.abs(navIn), 1);
  const imbalancePct = (Math.abs(homeNetGain) / maxNav) * 100;

  const outPlayers = outgoing.filter((a) => a.position !== 'Pick');
  const inPlayers = incoming.filter((a) => a.position !== 'Pick');
  const outPicks = outgoing.filter((a) => a.position === 'Pick');
  const inPicks = incoming.filter((a) => a.position === 'Pick');

  // ── HARD: Cap ceiling — home ──
  const capDeltaHome =
    incoming.reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0) -
    outgoing.reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0);
  const projCapHome = teamHome.capSpace - capDeltaHome;
  if (projCapHome < 0)
    flags.push({
      severity: 'HARD',
      category: 'CAP_VIOLATION',
      headline: 'Cap Ceiling Breach',
      explanation: `This trade puts ${teamHome.name} $${Math.abs(
        projCapHome
      ).toFixed(
        2
      )}M over the $88M NHL cap ceiling. The trade is structurally illegal as currently constructed. To fix it: add more outgoing salary, apply salary retention on incoming contracts, or reduce the total incoming cap hit.`,
      vetoesSide: 0,
    });

  // ── HARD: Cap ceiling — partner ──
  const capDeltaPartner =
    outgoing.reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0) -
    incoming.reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0);
  const projCapPartner = teamPartner.capSpace - capDeltaPartner;
  if (projCapPartner < 0)
    flags.push({
      severity: 'HARD',
      category: 'CAP_VIOLATION',
      headline: 'Partner Cap Breach',
      explanation: `This trade puts ${teamPartner.name} $${Math.abs(
        projCapPartner
      ).toFixed(
        2
      )}M over the ceiling. The deal cannot be legally submitted until ${
        teamPartner.name
      } clears space — via waivers, a compliance buyout, or restructuring another deal.`,
      vetoesSide: 1,
    });

  // ── HARD: Cap floor ──
  const newCapUsedHome = 88 - projCapHome;
  if (newCapUsedHome < 65 && capDeltaHome < -3)
    flags.push({
      severity: 'HARD',
      category: 'FLOOR_VIOLATION',
      headline: 'Cap Floor Violation',
      explanation: `${teamHome.name} would fall below the NHL's $65M cap floor. All 32 teams must spend a minimum of $65M on player salaries — going under the floor is illegal under the CBA.`,
      vetoesSide: 0,
    });

  // ── HARD: NMC outgoing ──
  const nmcOut = outPlayers.find((a) => a.hasNMC);
  if (nmcOut)
    flags.push({
      severity: 'HARD',
      category: 'CLAUSE',
      headline: `NMC — ${nmcOut.name}`,
      explanation: `${nmcOut.name} holds a Full No-Movement Clause. Under the CBA, ${teamHome.name} cannot trade him without his written consent. This is a legal obligation, not a negotiating position. The deal cannot proceed until ${nmcOut.name} personally approves the destination.`,
      affectedAsset: nmcOut.name,
      vetoesSide: 0,
    });

  const nmcIn = inPlayers.find((a) => a.hasNMC);
  if (nmcIn)
    flags.push({
      severity: 'HARD',
      category: 'CLAUSE',
      headline: `NMC — ${nmcIn.name}`,
      explanation: `${nmcIn.name} holds a Full No-Movement Clause. ${teamPartner.name} cannot trade him without his consent. If he vetoes the destination, this deal dies entirely regardless of the cap or value math.`,
      affectedAsset: nmcIn.name,
      vetoesSide: 1,
    });

  // ── HARD: Retention over 50% ──
  if (outgoing.some((a) => (a.retainedPct || 0) > 0.5))
    flags.push({
      severity: 'HARD',
      category: 'RETAIN_ABUSE',
      headline: 'Retention Exceeds 50% Cap',
      explanation: `The NHL CBA prohibits retaining more than 50% of any player's cap hit in a trade. Adjust the retention slider to 50% or below.`,
    });

  // ── SOFT: Elite Blockade ──
  const partnerElites = incoming.filter((a) => getXNAV(a).total > 260);
  const homeElites = outgoing.filter((a) => getXNAV(a).total > 200);
  if (partnerElites.length > 0 && homeElites.length === 0) {
    const requiredOverpay = navIn * 0.18;
    if (navOut < navIn + requiredOverpay)
      flags.push({
        severity: 'SOFT',
        category: 'ELITE_BLOCKADE',
        headline: `${teamPartner.name} protects ${partnerElites[0].name
          .split(' ')
          .pop()}`,
        explanation: `${partnerElites[0].name} is a franchise cornerstone — a player teams build entire cap structures around. ${teamPartner.name}'s GM only moves him if ${teamHome.name} sends back either (a) a comparable Tier-1 asset, or (b) a package so overwhelming it accelerates their rebuild by 3+ years. The current offer doesn't meet either threshold. Historically, blockbuster deals like this (Gaudreau, Huberdeau, Karlsson) required massive prospect and pick hauls to get across the finish line. This package would get laughed out of the room.`,
        affectedAsset: partnerElites[0].name,
        vetoesSide: 1,
      });
  }

  // ── SOFT: Roster Hole Protection ────────────────────────────────────────────
  // A GM will not trade from a position of weakness regardless of NAV return.
  // IMPORTANT: `outPlayers` = what HOME gives away (leaving home roster)
  //            `inPlayers`  = what PARTNER gives away (leaving partner roster)
  // We need to check what the PARTNER is giving up against the PARTNER's roster.
  // Example: Edmonton won't ship Bouchard + RNH because those are their only
  // quality D and a key C — gutting two positions they're already thin at.
  // ────────────────────────────────────────────────────────────────────────────
  const partnerGivingUp = inPlayers.filter((a) => a.position !== 'Pick');
  const positionsPartnerLosing = [
    ...new Set(partnerGivingUp.map((a) => a.position)),
  ];

  for (const pos of positionsPartnerLosing) {
    const depthBefore = positionalDepth(allPartnerRoster, pos);
    const depthAfter = rosterDepthAfterTrade(
      allPartnerRoster,
      partnerGivingUp,
      pos
    );
    const isAlreadyNeed = teamNeedsPosition(teamPartner, pos);

    if (depthAfter < 2 || (isAlreadyNeed && depthAfter < depthBefore)) {
      const posLabel =
        pos === 'D' ? 'defencemen' : pos === 'C' ? 'centres' : 'wingers';
      flags.push({
        severity: 'SOFT',
        category: 'POSITIONAL_REDUNDANCY',
        headline: `${teamPartner.name} can't gut their ${posLabel}`,
        explanation: `${
          teamPartner.name
        } currently has ${depthBefore} quality ${posLabel}. Trading away ${partnerGivingUp
          .filter((a) => a.position === pos)
          .map((a) => a.name)
          .join(
            ' and '
          )} leaves them with only ${depthAfter} — a critical roster hole they cannot paper over. Real GMs do not trade from a position of weakness: you don't sell your last elite D when your penalty kill is already struggling, and you don't move a top-6 C when you're already relying on depth players in important situations. ${
          teamPartner.name
        }'s GM would identify this hole immediately and decline unless the incoming asset directly fills it.`,
        vetoesSide: 1,
      });
      break;
    }
  }

  // ── SOFT: Defensive Dependency + Goaltending Risk ───────────────────────────
  // Teams whose wins are built on defensive structure (low GA, strong D-pairings,
  // elite goaltending) cannot afford to ship core D pieces — even for wingers.
  // The Connor/Bouchard case: Edmonton's team defence is already their weakness.
  // Moving Bouchard, their most mobile offensive D, makes a bad situation worse.
  // ────────────────────────────────────────────────────────────────────────────
  const tradingAwayD = outPlayers.filter((a) => a.position === 'D');
  if (tradingAwayD.length > 0) {
    const depScore = defensiveDependencyScore(allPartnerRoster);
    const eliteDBeingTraded = tradingAwayD.filter(
      (a) => a.avgTOI > 22 || getXNAV(a).total > 100
    );

    if (depScore >= 0.6 && eliteDBeingTraded.length > 0) {
      const dName = eliteDBeingTraded[0].name;
      const remainingEliteD = rosterDepthAfterTrade(
        allPartnerRoster,
        eliteDBeingTraded,
        'D'
      );
      flags.push({
        severity: 'SOFT',
        category: 'ASSET_SHAPE_MISMATCH',
        headline: `${teamPartner.name}'s D corps can't absorb this loss`,
        explanation: `${
          teamPartner.name
        }'s defensive structure is already one of their organisational vulnerabilities. ${dName} (${eliteDBeingTraded[0].avgTOI.toFixed(
          1
        )} min/game) anchors their top pairing — removing him leaves ${remainingEliteD} elite D on the roster. Teams in this situation historically do not trade top-pairing defencemen for forwards, no matter the NAV. The 2022 Flames refused to move Matthew Tkachuk without a defenceman coming back; the Oilers have resisted moving Bouchard precisely because their back end is where they're most exposed. A winger, however skilled, does not solve the underlying defensive problem.`,
        affectedAsset: dName,
        vetoesSide: 1,
      });
    }
  }

  // ── SOFT: Trading from an identified roster need ─────────────────────────────
  // If the partner's own db.ts `needs` array flags a position, and they're being
  // asked to trade FROM that exact position, any competent GM says no.
  // ────────────────────────────────────────────────────────────────────────────
  for (const player of partnerGivingUp) {
    if (teamNeedsPosition(teamPartner, player.position)) {
      const needLabel =
        teamPartner.needs?.find((n) => n.pos === player.position)?.label ??
        player.position;
      flags.push({
        severity: 'SOFT',
        category: 'ASSET_SHAPE_MISMATCH',
        headline: `${player.name.split(' ').pop()} fills ${
          teamPartner.name
        }'s own stated need`,
        explanation: `${teamPartner.name} has internally identified "${needLabel}" as a priority acquisition. ${player.name} plays exactly that position. Trading him away is the direct opposite of the team's stated roster-building direction — you don't sell the asset you're desperately trying to buy. This is the kind of move that leaks in media reports as "the GM went in a completely different direction than ownership wanted."`,
        affectedAsset: player.name,
        vetoesSide: 1,
      });
      break;
    }
  }

  // ── SOFT: Contender acquiring picks instead of players ──
  if (
    modePartner === 'CONTENDER' &&
    inPicks.length > 0 &&
    outPlayers.length === 0
  )
    flags.push({
      severity: 'SOFT',
      category: 'ASSET_SHAPE_MISMATCH',
      headline: `${teamPartner.name} needs players, not picks`,
      explanation: `${teamPartner.name} is in win-now mode. Contending teams don't trade their assets for draft picks that won't produce NHL players for 3–5 years — that's the opposite of what a team in a Stanley Cup window needs. ${teamPartner.name}'s GM would decline this and call teams that can send impact players.`,
      vetoesSide: 1,
    });

  // ── SOFT: Rebuilder gets no picks back ──
  if (
    (modePartner === 'REBUILDING' || modePartner === 'TANKING') &&
    outPlayers.length > 0 &&
    inPicks.length === 0 &&
    inPlayers.every((a) => a.age > 30)
  )
    flags.push({
      severity: 'SOFT',
      category: 'ASSET_SHAPE_MISMATCH',
      headline: `${teamPartner.name} needs picks, not aging vets`,
      explanation: `${teamPartner.name} is rebuilding. They trade current assets to stockpile picks and prospects — not to receive aging veterans with limited upside. Accepting a package of 30+ year-olds with no draft capital advances their rebuild by exactly zero. Their GM would counter by demanding at least one first-round pick or a young cost-controlled prospect.`,
      vetoesSide: 1,
    });

  // ── SOFT: Rebuilder trading picks for a rental ──
  if (
    (modeHome === 'REBUILDING' || modeHome === 'TANKING') &&
    outPicks.length > 0
  ) {
    const rentals = inPlayers.filter(
      (a) => (a.yearsRemaining || 0) <= 1 && a.age > 28
    );
    if (rentals.length > 0)
      flags.push({
        severity: 'SOFT',
        category: 'REBUILD_LOGIC',
        headline: 'Rebuilder trading picks for a rental',
        explanation: `${
          teamHome.name
        } is in rebuild mode. Trading draft picks — their most valuable future currency — for ${
          rentals[0].name
        } (${
          rentals[0].yearsRemaining || 0
        }yr remaining) is textbook bad front-office decision-making. When the contract expires, ${
          teamHome.name
        } has nothing to show for it and has set the rebuild back. This is the kind of deal that triggers front-office reviews.`,
        affectedAsset: rentals[0].name,
        vetoesSide: 0,
      });
  }

  // ── SOFT: Contender giving picks for declining vets ──
  if (modeHome === 'CONTENDER' && outPicks.length > 0) {
    const decliners = inPlayers.filter((a) => a.age > 33 && a.ptsPace < 45);
    if (decliners.length > 0)
      flags.push({
        severity: 'SOFT',
        category: 'CONTENDER_LOGIC',
        headline: 'Picks for a declining player',
        explanation: `${
          teamHome.name
        } is in a Cup window and is trading first-round picks for ${
          decliners[0].name
        }, who is ${
          decliners[0].age
        } years old and producing at only ${decliners[0].ptsPace.toFixed(
          0
        )} pts/82. Contenders that mortgage their futures for players on the wrong side of the age curve almost always regret it. The risk-adjusted return here is deeply negative.`,
        affectedAsset: decliners[0].name,
        vetoesSide: 0,
      });
  }

  // ── WARN: Positional redundancy ──
  for (const asset of inPlayers) {
    const depth = positionalDepth(allHomeRoster, asset.position);
    if (depth >= 3 && asset.ptsPace > 50) {
      flags.push({
        severity: 'WARN',
        category: 'POSITIONAL_REDUNDANCY',
        headline: `Depth glut at ${asset.position}`,
        explanation: `${teamHome.name} already has ${depth} quality ${asset.position}s on the roster. Acquiring ${asset.name} doesn't fill a hole — it creates a healthy scratch situation or forces another trade to rebalance the lineup. Smart GMs prioritize need over overall value.`,
        affectedAsset: asset.name,
        vetoesSide: 0,
      });
      break;
    }
  }

  // ── WARN: Rental tax ──
  const bestIn = [...inPlayers].sort(
    (a, b) => getXNAV(b).total - getXNAV(a).total
  )[0];
  if (
    bestIn &&
    (bestIn.yearsRemaining || 0) <= 1 &&
    bestIn.ptsPace > 55 &&
    outPicks.length > 0
  )
    flags.push({
      severity: 'WARN',
      category: 'RENTAL_TAX',
      headline: `Rental premium risk — ${bestIn.name.split(' ').pop()}`,
      explanation: `${bestIn.name} is a rental: ${
        bestIn.yearsRemaining || 0
      } year(s) remaining, likely a UFA in the summer. History is not kind to rental buyers — Tomas Vanek, Taylor Hall in Arizona, Ryan O'Reilly in Buffalo. You surrender picks now; the player walks in July. The expected value of this deal over a 5-year horizon heavily favours ${
        teamPartner.name
      }.`,
      affectedAsset: bestIn.name,
      vetoesSide: 0,
    });

  // ── WARN: Age cliff mid-contract ──
  for (const asset of inPlayers) {
    const ageAtEnd = asset.age + (asset.yearsRemaining || 1);
    if (asset.capHit > 7 && asset.age > 32 && ageAtEnd > 37) {
      flags.push({
        severity: 'WARN',
        category: 'AGE_CLIFF',
        headline: `${asset.name.split(' ').pop()} age cliff mid-deal`,
        explanation: `${
          asset.name
        } will be ${ageAtEnd} at contract expiry, locked in at $${asset.capHit.toFixed(
          1
        )}M/yr. NHL production falls off sharply around age 35–36. This contract will almost certainly become a cap anchor in years 2–3, limiting ${
          teamHome.name
        }'s flexibility to re-sign their own players or make moves.`,
        affectedAsset: asset.name,
        vetoesSide: 0,
      });
      break;
    }
  }

  // ── WARN: Mortgaging two 1sts ──
  if (
    modeHome === 'CONTENDER' &&
    outPicks.filter((p) => (p.round || 3) === 1).length >= 2
  )
    flags.push({
      severity: 'WARN',
      category: 'CONTENDER_LOGIC',
      headline: 'Shipping two 1st-round picks',
      explanation: `${teamHome.name} is trading two 1st-round picks. Contenders occasionally move one to win now, but two is franchise-altering. Even Pittsburgh and Washington eventually paid the price for over-extending on picks. This trade must result in a championship to justify the long-term cost. If the Cup run fails, ${teamHome.name} faces a prolonged rebuild without the picks to accelerate it.`,
      vetoesSide: 0,
    });

  // ── WARN: Leverage asymmetry (bad contract in a cap-strapped team) ──
  const baggage = outPlayers.find(
    (a) => a.capHit > 6 && a.age > 34 && (a.yearsRemaining || 0) > 1
  );
  if (baggage && teamHome.capSpace < 5)
    flags.push({
      severity: 'WARN',
      category: 'LEVERAGE_ASYMMETRY',
      headline: `${baggage.name.split(' ').pop()} — difficult contract to move`,
      explanation: `${baggage.name} ($${baggage.capHit.toFixed(1)}M × ${
        baggage.yearsRemaining
      }yr, age ${
        baggage.age
      }) is a contract very few teams want to absorb. With ${
        teamHome.name
      } already tight against the ceiling, the teams that could theoretically take on this contract hold significant leverage. Expect ${
        teamPartner.name
      } to demand a substantial sweetener just to take the cap hit.`,
      affectedAsset: baggage.name,
      vetoesSide: 1,
    });

  // ── INFO: Fire-sale windfall ──
  if (homeNetGain > 60 && getXNAV(incoming[0] || outgoing[0]).total > 200)
    flags.push({
      severity: 'INFO',
      category: 'FIRE_SALE',
      headline: 'Suspiciously favourable return',
      explanation: `This return looks unusually good for ${teamHome.name}. In real life, GMs only accept below-market returns under specific pressure: ownership mandating cost cuts, a player who has demanded a trade, or a deteriorating relationship. If none of those factors exist here, ${teamPartner.name} would simply call other teams and get a better offer. Trades this lopsided only happen in real life when there is context the public doesn't know about.`,
      vetoesSide: 1,
    });

  // ── INFO: Locker-room leadership loss ──
  const cultureAsset = outPlayers.find(
    (a) => (a.multiplier || 1.0) > 1.06 && a.ptsPace > 60
  );
  if (cultureAsset)
    flags.push({
      severity: 'INFO',
      category: 'LOCKER_ROOM',
      headline: `Culture loss — ${cultureAsset.name.split(' ').pop()}`,
      explanation: `${cultureAsset.name} carries a positive intangible multiplier — he's a leader, a vocal presence, the kind of player who lifts the room. Trading him isn't just a statistical loss. Teams that have moved their culture anchors (St. Louis trading Pietrangelo, Florida trading Huberdeau) often describe a difficult transition period that doesn't show up in the analytics.`,
      affectedAsset: cultureAsset.name,
      vetoesSide: 0,
    });

  // ── INFO: Clean mutual deal ──
  const hardFlags = flags.filter((f) => f.severity === 'HARD');
  const softFlags = flags.filter((f) => f.severity === 'SOFT');
  if (hardFlags.length === 0 && softFlags.length === 0 && imbalancePct <= 12)
    flags.push({
      severity: 'INFO',
      category: 'GOOD',
      headline: 'Mutually rational deal',
      explanation: `Both teams receive assets that match their organizational timeline. ${teamHome.name} (${modeHome}) and ${teamPartner.name} (${modePartner}) are each getting the shape of asset they need. No CBA violations, no logical vetoes, no major red flags on either side. This is the kind of trade that actually gets done at the deadline.`,
    });

  return flags;
};

// ============================================================
// TRADE EVALUATION ENGINE — v7.1
// ============================================================
const evaluateTrade = (
  outgoing: Asset[],
  incoming: Asset[],
  teamHome: Team | null,
  teamPartner: Team | null,
  allHomeRoster: Asset[],
  allPartnerRoster: Asset[]
): TradeVerdict => {
  if (!outgoing.length && !incoming.length) {
    return {
      status: 'IDLE',
      message: 'Add assets to evaluate',
      flags: [],
      metrics: nullMetrics(),
    };
  }

  const navOut = outgoing.reduce((s, a) => s + getXNAV(a).total, 0);
  const navIn = incoming.reduce((s, a) => s + getXNAV(a).total, 0);
  const homeNetGain = navIn - navOut;
  const ptsGain =
    incoming.reduce((s, a) => s + a.ptsPace, 0) -
    outgoing.reduce((s, a) => s + a.ptsPace, 0);
  const defGain =
    incoming.reduce((s, a) => s + a.defRate * (a.avgTOI / 18), 0) -
    outgoing.reduce((s, a) => s + a.defRate * (a.avgTOI / 18), 0);
  const capDelta =
    incoming.reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0) -
    outgoing.reduce((s, a) => s + a.capHit * (1 - (a.retainedPct || 0)), 0);
  const maxNav = Math.max(Math.abs(navOut), Math.abs(navIn), 1);
  const variance = (Math.abs(homeNetGain) / maxNav) * 100;

  const flags = runGmLogic(
    outgoing,
    incoming,
    teamHome,
    teamPartner,
    allHomeRoster,
    allPartnerRoster
  );
  const hardFlags = flags.filter((f) => f.severity === 'HARD');
  const softFlags = flags.filter((f) => f.severity === 'SOFT');

  let status: TradeStatus = 'PENDING';
  let message = '';

  if (hardFlags.length > 0) {
    status = 'BLOCKED';
    message = hardFlags[0].headline;
  } else if (softFlags.length > 0) {
    status = 'DECLINED';
    message = softFlags[0].headline;
  } else if (variance <= 10) {
    status = 'FAIR';
    message = 'Balanced Exchange';
  } else if (homeNetGain > 0) {
    status = 'WIN';
    message = `+${homeNetGain.toFixed(1)} NAV Surplus`;
  } else {
    status = 'LOSS';
    message = `${Math.abs(homeNetGain).toFixed(1)} NAV Overpay`;
  }

  return {
    status,
    message,
    flags,
    metrics: {
      navOut,
      navIn,
      homeNetGain,
      ptsGain,
      defGain,
      capDelta,
      variance,
    },
  };
};

// ============================================================
// TYPES
// ============================================================
interface Asset {
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
  // Pick fields
  round?: number;
  year?: number;
  teamStanding?: number;
  isProtected?: boolean;
}

interface Team {
  id: string;
  name: string;
  capSpace: number;
  standing: number;
  phase?: string;
  needs?: { pos: string; minWar: number; label: string }[];
  prospectPool?: string;
}

interface XNAVResult {
  total: number;
  off: number;
  def: number;
  age: number;
  cap: number;
  upside: number;
}

type TradeStatus =
  | 'IDLE'
  | 'PENDING'
  | 'FAIR'
  | 'WIN'
  | 'LOSS'
  | 'BLOCKED'
  | 'DECLINED';

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
  };
}

// ============================================================
// UTILS
// ============================================================
const safe = (n: number) => (isNaN(n) || !isFinite(n) ? 0 : n);
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
const fmt = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));
const nullMetrics = () => ({
  navOut: 0,
  navIn: 0,
  homeNetGain: 0,
  ptsGain: 0,
  defGain: 0,
  capDelta: 0,
  variance: 0,
});

const SEVERITY_STYLES: Record<
  FlagSeverity,
  { dot: string; bg: string; border: string; text: string; label: string }
> = {
  HARD: {
    dot: 'bg-red-500',
    bg: 'bg-red-950/20',
    border: 'border-red-700/40',
    text: 'text-red-300',
    label: 'bg-red-900/50 text-red-300 border-red-800/60',
  },
  SOFT: {
    dot: 'bg-orange-500',
    bg: 'bg-orange-950/20',
    border: 'border-orange-700/40',
    text: 'text-orange-300',
    label: 'bg-orange-900/50 text-orange-300 border-orange-800/60',
  },
  WARN: {
    dot: 'bg-amber-400',
    bg: 'bg-amber-950/15',
    border: 'border-amber-700/30',
    text: 'text-amber-300',
    label: 'bg-amber-900/40 text-amber-300 border-amber-800/50',
  },
  INFO: {
    dot: 'bg-sky-400',
    bg: 'bg-sky-950/15',
    border: 'border-sky-800/30',
    text: 'text-sky-300',
    label: 'bg-sky-900/40 text-sky-300 border-sky-800/50',
  },
};

const STATUS_CONFIG: Record<
  TradeStatus,
  { border: string; headerText: string; icon: string; bg: string }
> = {
  IDLE: {
    border: 'border-zinc-800',
    headerText: 'text-zinc-500',
    icon: '—',
    bg: 'bg-zinc-900/40',
  },
  PENDING: {
    border: 'border-zinc-700',
    headerText: 'text-zinc-300',
    icon: '…',
    bg: 'bg-zinc-900/40',
  },
  FAIR: {
    border: 'border-sky-600/50',
    headerText: 'text-sky-300',
    icon: '⚖',
    bg: 'bg-sky-950/15',
  },
  WIN: {
    border: 'border-emerald-600/50',
    headerText: 'text-emerald-400',
    icon: '↑',
    bg: 'bg-emerald-950/15',
  },
  LOSS: {
    border: 'border-amber-600/50',
    headerText: 'text-amber-400',
    icon: '↓',
    bg: 'bg-amber-950/15',
  },
  BLOCKED: {
    border: 'border-red-600/50',
    headerText: 'text-red-400',
    icon: '✕',
    bg: 'bg-red-950/20',
  },
  DECLINED: {
    border: 'border-orange-600/50',
    headerText: 'text-orange-400',
    icon: '✗',
    bg: 'bg-orange-950/20',
  },
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function TradeMachine() {
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [db, setDb] = useState<{ teams: Team[]; players: Asset[] }>({
    teams: [],
    players: [],
  });
  // ^^^ always initialized with empty arrays so .filter() never throws before fetch completes
  const [teams, setTeams] = useState<[Team | null, Team | null]>([null, null]);
  const [blocks, setBlocks] = useState<[Asset[], Asset[]]>([[], []]);
  const [verdict, setVerdict] = useState<TradeVerdict | null>(null);
  const [evaluated, setEvaluated] = useState(false);
  const [expandedFlag, setExpandedFlag] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/league')
      .then((r) => r.json())
      .then((data) => {
        // Guard: if the API returned an error object or missing keys, show it
        if (!data.teams || !data.players) {
          setError(`API returned invalid data: ${JSON.stringify(data)}`);
          setBooting(false);
          return;
        }
        setDb(data);
        setTeams([data.teams[0] ?? null, data.teams[5] ?? null]);
        setBooting(false);
      })
      .catch((e) => {
        setError(`Network error: ${e.message}`);
        setBooting(false);
      });
  }, []);

  const allHomeRoster = db.players.filter((p) => p.teamId === teams[0]?.id);
  const allPartnerRoster = db.players.filter((p) => p.teamId === teams[1]?.id);

  useEffect(() => {
    if (evaluated) runEval();
  }, [blocks, teams]);

  const runEval = useCallback(() => {
    const v = evaluateTrade(
      blocks[0],
      blocks[1],
      teams[0],
      teams[1],
      allHomeRoster,
      allPartnerRoster
    );
    setVerdict(v);
    setEvaluated(true);
  }, [blocks, teams, allHomeRoster, allPartnerRoster]);

  const navA = blocks[0].reduce((s, a) => s + getXNAV(a).total, 0);
  const navB = blocks[1].reduce((s, a) => s + getXNAV(a).total, 0);
  const homeNetGain = navB - navA;

  const capA = calcCapSpace(0, teams, blocks);
  const capB = calcCapSpace(1, teams, blocks);

  if (booting) return <LoadingScreen />;
  if (error) return <ErrorScreen msg={error} />;

  const sc = verdict ? STATUS_CONFIG[verdict.status] : STATUS_CONFIG.IDLE;

  return (
    <main className="min-h-screen bg-[#080809] text-zinc-300 font-sans antialiased select-none overflow-x-hidden">
      <div
        className="fixed inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.2) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.2) 1px,transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <div className="relative max-w-[1700px] mx-auto px-6 py-8 flex flex-col gap-5">
        <header className="flex justify-between items-end pb-5 border-b border-zinc-800/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.5em] text-zinc-600">
                Live NHL Data Feed
              </span>
            </div>
            <h1 className="text-[2.1rem] font-black uppercase tracking-tighter text-white leading-none">
              Quant Front Office
              <span className="ml-2 text-sm font-mono font-normal text-cyan-500 lowercase tracking-normal">
                v7.1
              </span>
            </h1>
            <p className="text-[10px] text-zinc-700 mt-1 font-bold uppercase tracking-widest">
              X-NAV · xG Suppression · Bayesian · GM Logic Engine · Team
              Archetype Analysis
            </p>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-[0.35em] text-zinc-700 font-black mb-1">
              Home Net Gain
            </div>
            <div
              className={`text-4xl font-black font-mono tabular-nums transition-colors duration-500 ${
                Math.abs(homeNetGain) < 5
                  ? 'text-sky-400'
                  : homeNetGain > 0
                  ? 'text-emerald-400'
                  : 'text-rose-500'
              }`}
            >
              {fmt(homeNetGain, 1)}
              <span className="text-sm text-zinc-600 ml-1.5 font-sans font-bold">
                NAV
              </span>
            </div>
          </div>
        </header>

        <TugBar homeNetGain={homeNetGain} navA={navA} navB={navB} />

        <div className="grid grid-cols-[1fr_280px_1fr] gap-5 items-start">
          <TradePanel
            idx={0}
            team={teams[0]}
            nav={navA}
            capSpace={capA}
            db={db}
            blocks={blocks}
            setTeams={setTeams}
            setBlocks={setBlocks}
            label="Your Franchise"
            accent="HOME"
          />

          <div className="flex flex-col gap-3 pt-8">
            {teams[0] && teams[1] && (
              <div className="grid grid-cols-2 gap-2">
                <ModeBadge
                  team={teams[0]}
                  roster={allHomeRoster}
                  label="Home Mode"
                />
                <ModeBadge
                  team={teams[1]}
                  roster={allPartnerRoster}
                  label="Partner Mode"
                />
              </div>
            )}

            <button
              onClick={runEval}
              disabled={!blocks[0].length && !blocks[1].length}
              className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-[11px] bg-white text-black hover:bg-cyan-400 transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed active:scale-[0.97] shadow-xl shadow-black/50"
            >
              Run GM Audit ↗
            </button>

            {(blocks[0].length > 0 || blocks[1].length > 0) && (
              <div className="grid grid-cols-2 gap-1.5">
                <MiniStat label="Out" val={blocks[0].length.toString()} />
                <MiniStat label="In" val={blocks[1].length.toString()} />
                <MiniStat
                  label="Variance"
                  val={
                    verdict ? `${verdict.metrics.variance.toFixed(0)}%` : '—'
                  }
                />
                <MiniStat
                  label="Cap Δ"
                  val={
                    verdict
                      ? `${
                          verdict.metrics.capDelta > 0 ? '+' : ''
                        }${verdict.metrics.capDelta.toFixed(1)}M`
                      : '—'
                  }
                />
              </div>
            )}

            {verdict && verdict.status !== 'IDLE' && (
              <VerdictPanel
                verdict={verdict}
                sc={sc}
                expandedFlag={expandedFlag}
                setExpandedFlag={setExpandedFlag}
              />
            )}
          </div>

          <TradePanel
            idx={1}
            team={teams[1]}
            nav={navB}
            capSpace={capB}
            db={db}
            blocks={blocks}
            setTeams={setTeams}
            setBlocks={setBlocks}
            label="Trade Partner"
            accent="PARTNER"
          />
        </div>

        {(blocks[0].length > 0 || blocks[1].length > 0) && (
          <BreakdownTable blocks={blocks} />
        )}
      </div>
    </main>
  );
}

// ============================================================
// TRADE PANEL
// ============================================================
function TradePanel({
  idx,
  team,
  nav,
  capSpace,
  db,
  blocks,
  setTeams,
  setBlocks,
  label,
  accent,
}: {
  idx: 0 | 1;
  team: Team | null;
  nav: number;
  capSpace: number;
  db: { teams: Team[]; players: Asset[] };
  blocks: [Asset[], Asset[]];
  setTeams: React.Dispatch<React.SetStateAction<[Team | null, Team | null]>>;
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
  label: string;
  accent: string;
}) {
  const isLeft = idx === 0;

  return (
    <div
      className={`relative bg-zinc-900/50 border rounded-2xl p-6 flex flex-col min-h-[740px] backdrop-blur-sm ${
        isLeft ? 'border-cyan-900/40' : 'border-zinc-800/60'
      }`}
    >
      {/* Badge */}
      <div
        className={`absolute -top-3 ${
          isLeft ? 'left-6' : 'left-6'
        } px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.3em] border ${
          isLeft
            ? 'bg-cyan-950 border-cyan-800 text-cyan-400'
            : 'bg-zinc-800 border-zinc-700 text-zinc-400'
        }`}
      >
        {accent}
      </div>

      {/* Team selector */}
      <div className="flex justify-between items-start mb-6 border-b border-zinc-800/40 pb-4">
        <div>
          <div className="text-[8px] text-zinc-600 font-black uppercase tracking-widest mb-1">
            {label}
          </div>
          <select
            className="bg-transparent text-2xl font-black text-white outline-none cursor-pointer hover:text-cyan-400 transition-colors max-w-[200px] truncate"
            value={team?.id ?? ''}
            onChange={(e) => {
              const found =
                db.teams.find((t) => t.id === e.target.value) ?? null;
              setTeams((prev) => {
                const n = [...prev] as [Team | null, Team | null];
                n[idx] = found;
                return n;
              });
              setBlocks((prev) => {
                const n = [...prev] as [Asset[], Asset[]];
                n[idx] = [];
                return n;
              });
            }}
          >
            {db.teams.map((t) => (
              <option key={t.id} value={t.id} className="bg-zinc-900 text-sm">
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-right shrink-0">
          <div className="text-2xl font-black font-mono italic text-white leading-none">
            {nav.toFixed(1)}
          </div>
          <div className="text-[9px] font-black uppercase tracking-wide text-zinc-600 mb-1">
            NAV
          </div>
          <div
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
              capSpace < 0
                ? 'bg-rose-950/50 text-rose-400 animate-pulse'
                : 'bg-emerald-950/30 text-emerald-400'
            }`}
          >
            {capSpace >= 0 ? '+' : ''}
            {capSpace.toFixed(2)}M cap
          </div>
        </div>
      </div>

      {/* Asset list */}
      <div className="flex-grow overflow-y-auto space-y-2.5 mb-4 pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {blocks[idx].length === 0 && (
          <div className="flex items-center justify-center h-32 border border-dashed border-zinc-800 rounded-xl">
            <span className="text-zinc-700 text-xs font-black uppercase tracking-wider">
              No assets selected
            </span>
          </div>
        )}
        {blocks[idx].map((a) => (
          <AssetCard
            key={a.id}
            asset={a}
            idx={idx}
            blocks={blocks}
            setBlocks={setBlocks}
          />
        ))}
      </div>

      {/* Asset selector */}
      <AssetDropdown
        idx={idx}
        team={team}
        db={db}
        blocks={blocks}
        setBlocks={setBlocks}
      />
    </div>
  );
}

// ============================================================
// ASSET CARD — with retention slider and contract details
// ============================================================
function AssetCard({
  asset,
  idx,
  blocks,
  setBlocks,
}: {
  asset: Asset;
  idx: 0 | 1;
  blocks: [Asset[], Asset[]];
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
}) {
  const xnav = getXNAV(asset);
  const isPick = asset.position === 'Pick';

  const updateAsset = (partial: Partial<Asset>) => {
    setBlocks((prev) => {
      const n = [...prev] as [Asset[], Asset[]];
      n[idx] = n[idx].map((a) =>
        a.id === asset.id ? { ...a, ...partial } : a
      );
      return n;
    });
  };

  const removeAsset = () => {
    setBlocks((prev) => {
      const n = [...prev] as [Asset[], Asset[]];
      n[idx] = n[idx].filter((a) => a.id !== asset.id);
      return n;
    });
  };

  const navColor =
    xnav.total > 80
      ? 'text-emerald-400'
      : xnav.total > 20
      ? 'text-sky-400'
      : xnav.total > -20
      ? 'text-zinc-400'
      : 'text-rose-400';

  return (
    <div className="bg-zinc-950/60 border border-zinc-800/50 rounded-xl p-3.5 group hover:border-zinc-700/70 transition-all">
      <div className="flex justify-between items-start mb-2.5">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {asset.headshot && (
            <img
              src={asset.headshot}
              alt={asset.name}
              className="w-8 h-8 rounded-full object-cover border border-zinc-700/50 shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <div className="min-w-0">
            <div className="font-black text-white text-[13px] leading-tight truncate flex items-center gap-1.5">
              {asset.name}
              {asset.hasNMC && (
                <span className="text-[8px] bg-rose-900/40 text-rose-400 px-1 rounded border border-rose-900/60 font-black shrink-0">
                  NMC
                </span>
              )}
              {asset.hasNTC && !asset.hasNMC && (
                <span className="text-[8px] bg-amber-900/40 text-amber-400 px-1 rounded border border-amber-900/60 font-black shrink-0">
                  NTC
                </span>
              )}
              {!asset.hasLiveStats && !isPick && (
                <span className="text-[8px] bg-zinc-800 text-zinc-600 px-1 rounded font-black shrink-0">
                  EST
                </span>
              )}
            </div>
            <div className="text-[9px] text-zinc-600 font-black uppercase tracking-wider mt-0.5">
              {isPick
                ? `${asset.year} · ${
                    asset.round === 1
                      ? '1st'
                      : asset.round === 2
                      ? '2nd'
                      : '3rd'
                  } Round`
                : `${asset.position} · Age ${
                    asset.age
                  } · $${asset.capHit.toFixed(2)}M × ${asset.yearsRemaining}yr`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className={`text-xl font-black font-mono italic ${navColor}`}>
            {fmt(xnav.total, 0)}
          </div>
          <button
            onClick={removeAsset}
            className="text-zinc-700 hover:text-rose-400 transition-colors text-sm font-bold leading-none"
          >
            ✕
          </button>
        </div>
      </div>

      {/* NAV breakdown bars */}
      {!isPick && (
        <div className="grid grid-cols-4 gap-1 mb-2.5">
          <MicroBar label="OFF" val={xnav.off} max={300} color="cyan" />
          <MicroBar label="DEF" val={xnav.def} max={150} color="emerald" />
          <MicroBar
            label={xnav.age > 0 ? 'YNG' : 'AGE'}
            val={xnav.age}
            max={80}
            color={xnav.age > 0 ? 'violet' : 'amber'}
          />
          <MicroBar label="CAP" val={xnav.cap} max={100} color="rose" invert />
        </div>
      )}

      {/* Retention slider (only for eligible players) */}
      {asset.canRetain && !isPick && (
        <div className="mt-2 border-t border-zinc-800/50 pt-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[9px] text-zinc-600 font-black uppercase tracking-wider">
              Salary Retention
            </span>
            <span className="text-[9px] font-mono text-zinc-400 font-black">
              {(asset.retainedPct * 100).toFixed(0)}% ($
              {(asset.capHit * asset.retainedPct).toFixed(2)}M)
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            step="5"
            value={(asset.retainedPct * 100).toFixed(0)}
            onChange={(e) =>
              updateAsset({ retainedPct: parseFloat(e.target.value) / 100 })
            }
            className="w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-[8px] text-zinc-700 font-black mt-0.5">
            <span>0%</span>
            <span>25%</span>
            <span>50% MAX</span>
          </div>
        </div>
      )}

      {/* Pick protection toggle */}
      {isPick && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-zinc-600 font-black uppercase tracking-wider">
            Protected
          </span>
          <button
            onClick={() => updateAsset({ isProtected: !asset.isProtected })}
            className={`text-[9px] font-black px-2 py-0.5 rounded border transition-colors ${
              asset.isProtected
                ? 'bg-amber-900/30 border-amber-800/50 text-amber-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-500'
            }`}
          >
            {asset.isProtected ? 'Protected ↓' : 'Unprotected'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ASSET DROPDOWN
// ============================================================
function AssetDropdown({
  idx,
  team,
  db,
  blocks,
  setBlocks,
}: {
  idx: 0 | 1;
  team: Team | null;
  db: { teams: Team[]; players: Asset[] };
  blocks: [Asset[], Asset[]];
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
}) {
  const label = idx === 0 ? '+ ADD OUTGOING ASSET' : '+ REQUEST INCOMING ASSET';

  const eligible = db.players
    .filter(
      (p) => p.teamId === team?.id && !blocks[idx].some((a) => a.id === p.id)
    )
    .sort((a, b) => getXNAV(b).total - getXNAV(a).total);

  const skaters = eligible.filter((p) => p.position !== 'Pick');
  const picks = eligible.filter((p) => p.position === 'Pick');

  return (
    <select
      className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-3.5 rounded-xl font-black uppercase tracking-widest text-[9px] outline-none text-zinc-500 appearance-none cursor-pointer transition-colors"
      onChange={(e) => {
        const asset = db.players.find((p) => p.id === e.target.value);
        if (asset) {
          setBlocks((prev) => {
            const n = [...prev] as [Asset[], Asset[]];
            n[idx] = [...n[idx], { ...asset, retainedPct: 0 }];
            return n;
          });
        }
        e.target.value = '';
      }}
      defaultValue=""
    >
      <option value="" disabled>
        {label}
      </option>
      {skaters.length > 0 && (
        <optgroup label="── SKATERS ──">
          {skaters.map((p) => (
            <option key={p.id} value={p.id} className="bg-zinc-900 text-sm">
              {p.name} [{p.position}] ${p.capHit.toFixed(1)}M — NAV{' '}
              {getXNAV(p).total.toFixed(0)}
            </option>
          ))}
        </optgroup>
      )}
      {picks.length > 0 && (
        <optgroup label="── DRAFT PICKS ──">
          {picks.map((p) => (
            <option key={p.id} value={p.id} className="bg-zinc-900 text-sm">
              {p.name} — NAV {getXNAV(p).total.toFixed(0)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// ============================================================
// TUG-OF-WAR BAR
// ============================================================
function TugBar({
  homeNetGain,
  navA,
  navB,
}: {
  homeNetGain: number;
  navA: number;
  navB: number;
}) {
  const total = Math.max(navA + navB, 1);
  const leftPct = clamp((navA / total) * 100, 5, 95);

  return (
    <div className="w-full h-9 bg-zinc-900 border border-zinc-800/50 rounded-2xl relative overflow-hidden flex items-center shadow-inner">
      <div className="absolute inset-0 flex">
        <div
          className="h-full bg-rose-500/8 transition-all duration-700 ease-out"
          style={{ width: `${leftPct}%` }}
        />
        <div className="h-full bg-emerald-500/8 transition-all duration-700 ease-out flex-1" />
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 h-full w-px bg-zinc-700/50" />
      <div className="z-10 w-full flex justify-between px-5 font-black text-[9px] uppercase tracking-[0.3em] text-zinc-700">
        <span className={homeNetGain < -5 ? 'text-rose-500' : ''}>
          Outgoing Value
        </span>
        <span className="bg-zinc-950 text-zinc-300 px-3 py-1 rounded-lg border border-zinc-800 font-mono text-[10px] tracking-tight">
          {navA.toFixed(0)} ←→ {navB.toFixed(0)} NAV
        </span>
        <span className={homeNetGain > 5 ? 'text-emerald-400' : ''}>
          Incoming Value
        </span>
      </div>
    </div>
  );
}

// ============================================================
// TEAM MODE BADGE
// ============================================================
function ModeBadge({
  team,
  roster,
  label,
}: {
  team: Team;
  roster: Asset[];
  label: string;
}) {
  const mode = classifyTeam(team, roster);
  const config: Record<TeamMode, { color: string; bg: string }> = {
    CONTENDER: {
      color: 'text-emerald-300',
      bg: 'bg-emerald-950/40 border-emerald-800/50',
    },
    BUBBLE: { color: 'text-sky-300', bg: 'bg-sky-950/40 border-sky-800/50' },
    RETOOLING: {
      color: 'text-amber-300',
      bg: 'bg-amber-950/40 border-amber-800/50',
    },
    REBUILDING: {
      color: 'text-orange-300',
      bg: 'bg-orange-950/40 border-orange-800/50',
    },
    TANKING: {
      color: 'text-rose-300',
      bg: 'bg-rose-950/40 border-rose-800/50',
    },
  };
  const c = config[mode];
  return (
    <div className={`border rounded-lg px-2 py-1.5 text-center ${c.bg}`}>
      <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5">
        {label}
      </div>
      <div
        className={`text-[10px] font-black uppercase tracking-tight ${c.color}`}
      >
        {mode}
      </div>
    </div>
  );
}

// ============================================================
// VERDICT PANEL — expandable GM flags
// ============================================================
function VerdictPanel({
  verdict,
  sc,
  expandedFlag,
  setExpandedFlag,
}: {
  verdict: TradeVerdict;
  sc: (typeof STATUS_CONFIG)[TradeStatus];
  expandedFlag: number | null;
  setExpandedFlag: (i: number | null) => void;
}) {
  const flags = verdict.flags;
  const hardCount = flags.filter((f) => f.severity === 'HARD').length;
  const softCount = flags.filter((f) => f.severity === 'SOFT').length;
  const warnCount = flags.filter((f) => f.severity === 'WARN').length;

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all duration-500 ${sc.bg} ${sc.border}`}
    >
      {/* Status header */}
      <div className="px-5 py-4 border-b border-zinc-800/30">
        <div className="flex items-center justify-between mb-1">
          <div
            className={`text-2xl font-black italic uppercase leading-none tracking-tight ${sc.headerText}`}
          >
            {verdict.status}
          </div>
          <div className={`text-lg font-black font-mono ${sc.headerText}`}>
            {sc.icon}
          </div>
        </div>
        <div className="text-[10px] text-zinc-500 font-bold">
          {verdict.message}
        </div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {hardCount > 0 && (
            <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-red-900/50 text-red-300 border border-red-800/50">
              {hardCount} HARD BLOCK{hardCount > 1 ? 'S' : ''}
            </span>
          )}
          {softCount > 0 && (
            <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-orange-900/50 text-orange-300 border border-orange-800/50">
              {softCount} GM VETO{softCount > 1 ? 'S' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-800/40">
              {warnCount} WARNING{warnCount > 1 ? 'S' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="px-5 py-3 border-b border-zinc-800/30 font-mono space-y-1">
        <DeltaRow
          label="Production Δ"
          val={verdict.metrics.ptsGain}
          unit=" pts/82"
        />
        <DeltaRow
          label="Suppression Δ"
          val={verdict.metrics.defGain}
          unit=" rel"
        />
        <DeltaRow
          label="Cap Impact"
          val={verdict.metrics.capDelta}
          unit="M"
          invert
        />
        <DeltaRow label="Imbalance" val={-verdict.metrics.variance} unit="%" />
      </div>

      {/* GM Flags — expandable */}
      <div className="px-4 py-3 space-y-1.5">
        <div className="text-[8px] font-black text-zinc-700 uppercase tracking-widest mb-2">
          GM Intelligence Flags — click to expand
        </div>
        {flags.length === 0 && (
          <div className="text-[10px] text-zinc-700 italic">
            No flags raised.
          </div>
        )}
        {flags.map((flag, i) => {
          const fs = SEVERITY_STYLES[flag.severity];
          const isOpen = expandedFlag === i;
          return (
            <div
              key={i}
              className={`rounded-lg border overflow-hidden cursor-pointer transition-all duration-200 ${fs.bg} ${fs.border} hover:opacity-90`}
              onClick={() => setExpandedFlag(isOpen ? null : i)}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${fs.dot}`}
                />
                <span
                  className={`text-[9px] font-black uppercase tracking-tight flex-1 leading-tight ${fs.text}`}
                >
                  {flag.headline}
                </span>
                {flag.affectedAsset && (
                  <span
                    className={`text-[7px] font-black px-1.5 py-0.5 rounded border shrink-0 ${fs.label}`}
                  >
                    {flag.affectedAsset.split(' ').pop()}
                  </span>
                )}
                <span
                  className={`text-[9px] font-black shrink-0 ml-1 ${fs.text}`}
                >
                  {isOpen ? '▲' : '▼'}
                </span>
              </div>
              {isOpen && (
                <div className={`px-3 pb-3 pt-0.5 border-t ${fs.border}`}>
                  <p
                    className={`text-[10px] leading-relaxed font-medium ${fs.text}`}
                  >
                    {flag.explanation}
                  </p>
                  {flag.vetoesSide !== undefined && (
                    <div
                      className={`mt-2 text-[8px] font-black uppercase tracking-wide border-t pt-1.5 ${fs.border} ${fs.text} opacity-70`}
                    >
                      Vetoes:{' '}
                      {flag.vetoesSide === 0
                        ? 'Home team GM declines'
                        : 'Partner GM declines'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// BREAKDOWN TABLE
// ============================================================
function BreakdownTable({ blocks }: { blocks: [Asset[], Asset[]] }) {
  const allAssets = [
    ...blocks[0].map((a) => ({ ...a, side: 'OUT' as const })),
    ...blocks[1].map((a) => ({ ...a, side: 'IN' as const })),
  ];

  return (
    <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-2xl overflow-hidden">
      <div className="px-6 py-3 border-b border-zinc-800/40 flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600">
          Full NAV Breakdown
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="border-b border-zinc-800/30">
              {[
                'Side',
                'Player',
                'Pos',
                'Age',
                'Pts/82',
                'xG/82',
                'DefRate',
                'Avg TOI',
                'Cap',
                'Term',
                'X-NAV',
                'Off',
                'Def',
                'Age/YNG',
                'Cap Cost',
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-wider text-zinc-600"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allAssets.map((a) => {
              const xnav = getXNAV(a);
              const isOut = a.side === 'OUT';
              return (
                <tr
                  key={a.id}
                  className={`border-b border-zinc-900 hover:bg-zinc-800/20 transition-colors ${
                    isOut ? 'bg-rose-950/5' : 'bg-emerald-950/5'
                  }`}
                >
                  <td className="px-3 py-2">
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                        isOut
                          ? 'bg-rose-900/30 text-rose-400'
                          : 'bg-emerald-900/30 text-emerald-400'
                      }`}
                    >
                      {a.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-sans font-black text-white text-[11px] whitespace-nowrap">
                    {a.name}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{a.position}</td>
                  <td className="px-3 py-2 text-zinc-400">{a.age}</td>
                  <td className="px-3 py-2 text-cyan-400">
                    {a.position === 'Pick' ? '—' : a.ptsPace.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-violet-400">
                    {a.position === 'Pick' ? '—' : (a.xGPace ?? 0).toFixed(1)}
                  </td>
                  <td
                    className={`px-3 py-2 ${
                      a.defRate > 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {a.position === 'Pick' ? '—' : fmt(a.defRate, 2)}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {a.position === 'Pick' ? '—' : a.avgTOI.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-amber-400">
                    {a.position === 'Pick' ? '—' : `$${a.capHit.toFixed(2)}M`}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {a.position === 'Pick' ? '—' : `${a.yearsRemaining}yr`}
                  </td>
                  <td
                    className={`px-3 py-2 font-black text-[12px] ${
                      xnav.total > 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {fmt(xnav.total, 1)}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {xnav.off.toFixed(0)}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {xnav.def.toFixed(0)}
                  </td>
                  <td
                    className={`px-3 py-2 ${
                      xnav.age > 0 ? 'text-violet-400' : 'text-amber-500'
                    }`}
                  >
                    {fmt(xnav.age, 0)}
                  </td>
                  <td className="px-3 py-2 text-rose-500">
                    {xnav.cap.toFixed(0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// MICRO COMPONENTS
// ============================================================
function MicroBar({
  label,
  val,
  max,
  color,
  invert = false,
}: {
  label: string;
  val: number;
  max: number;
  color: string;
  invert?: boolean;
}) {
  const norm = clamp(Math.abs(val) / max, 0, 1);
  const colorMap: Record<string, string> = {
    cyan: 'bg-cyan-500/60',
    emerald: 'bg-emerald-500/60',
    violet: 'bg-violet-500/60',
    amber: 'bg-amber-500/60',
    rose: 'bg-rose-500/60',
  };
  const isNeg = invert ? val < 0 : val < 0;

  return (
    <div className="bg-zinc-900 rounded p-1.5 text-center">
      <div className="text-[7px] text-zinc-700 font-black uppercase tracking-tighter mb-1">
        {label}
      </div>
      <div className="h-1 bg-zinc-800 rounded-full mb-1 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isNeg ? 'bg-rose-500/50' : colorMap[color]
          }`}
          style={{ width: `${norm * 100}%` }}
        />
      </div>
      <div
        className={`text-[8px] font-black ${
          isNeg ? 'text-rose-400' : 'text-zinc-400'
        }`}
      >
        {val > 0 ? '+' : ''}
        {val.toFixed(0)}
      </div>
    </div>
  );
}

function DeltaRow({
  label,
  val,
  unit,
  invert = false,
}: {
  label: string;
  val: number;
  unit: string;
  invert?: boolean;
}) {
  const isGood = invert ? val >= 0 : val >= 0;
  const isNeutral = Math.abs(val) < 0.5;
  return (
    <div className="flex justify-between items-center">
      <span className="text-zinc-700 text-[9px] uppercase tracking-tight font-black">
        {label}
      </span>
      <span
        className={`font-black text-[10px] ${
          isNeutral
            ? 'text-zinc-600'
            : isGood
            ? 'text-emerald-400'
            : 'text-rose-400'
        }`}
      >
        {val > 0 ? '+' : ''}
        {val.toFixed(1)}
        {unit}
      </span>
    </div>
  );
}

function MiniStat({ label, val }: { label: string; val: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/40 rounded-lg p-2 text-center">
      <div className="text-[8px] text-zinc-600 font-black uppercase tracking-widest mb-0.5">
        {label}
      </div>
      <div className="text-[13px] font-black font-mono text-white">{val}</div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-12 h-12 border-2 border-zinc-800 rounded-full" />
        <div className="w-12 h-12 border-2 border-t-cyan-500 rounded-full animate-spin absolute inset-0" />
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-600 animate-pulse">
        Syncing NHL Data Core
      </div>
      <div className="text-[9px] text-zinc-800 font-black uppercase tracking-widest">
        MoneyPuck · NHL API · X-NAV 7.0
      </div>
    </div>
  );
}

function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center gap-3">
      <div className="text-rose-500 font-black text-lg">
        Data Pipeline Error
      </div>
      <div className="text-zinc-600 text-sm font-mono">{msg}</div>
      <div className="text-zinc-700 text-xs">
        Check that /api/league is deployed and reachable.
      </div>
    </div>
  );
}

// ============================================================
// CAP SPACE CALCULATOR — includes retained salary
// ============================================================
function calcCapSpace(
  idx: 0 | 1,
  teams: [Team | null, Team | null],
  blocks: [Asset[], Asset[]]
): number {
  const team = teams[idx];
  if (!team) return 0;

  // Assets leaving reduce current roster cap
  const outCap = blocks[idx].reduce(
    (s, a) => s + a.capHit * (1 - (a.retainedPct || 0)),
    0
  );
  // Assets arriving consume cap (net of any retention from partner)
  const inCap = blocks[1 - idx].reduce(
    (s, a) => s + a.capHit * (1 - (a.retainedPct || 0)),
    0
  );

  return team.capSpace + outCap - inCap;
}
